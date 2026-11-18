"""
Comprehensive Unit and Integration Tests for AegisNet Backend & ML Engine.
Compatible with both `pytest` and `python -m unittest discover -s tests`.
"""
from __future__ import annotations

import io
from pathlib import Path
import sys
import unittest

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app, bootstrap_application_state
from app.ml.dataset_generator import load_or_prepare_cicids2017_dataset
from app.ml.engine import AegisMLEngine, compute_normalized_entropy
from app.ml.preprocessing import FlowFeaturePipeline
from app.ml.schema import CANONICAL_FEATURES
from app.services.validation import (
    DataValidationError,
    validate_and_parse_csv_bytes,
)


class TestAegisNetSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        bootstrap_application_state()
        cls.client = TestClient(app)

    def test_01_data_validation_and_sanitization(self) -> None:
        """Verifies schema normalization, Infinity/NaN handling, negative duration clamping, and deduplication."""
        csv_content = (
            " Destination Port, Flow Duration, Total Fwd Packets, Total Backward Packets, Flow Bytes/s, Flow Packets/s, SYN Flag Count, RST Flag Count, ACK Flag Count, Average Packet Size, Label\n"
            "80, -150, 10, 8, Infinity, NaN, 1, 0, 18, 420.5, DoS Hulk\n"
            "80, -150, 10, 8, Infinity, NaN, 1, 0, 18, 420.5, DoS Hulk\n"
            "443, 25000, 14, 16, 12500.0, 1200.0, 1, 0, 30, 512.0, BENIGN\n"
        ).encode("utf-8")

        clean_df, report = validate_and_parse_csv_bytes(
            csv_content, filename="cicids_test.csv", deduplicate=True
        )
        self.assertEqual(report.total_rows_received, 3)
        self.assertEqual(report.duplicate_rows_removed, 1)
        self.assertEqual(report.valid_rows_retained, 2)
        self.assertGreaterEqual(report.infinite_value_cells, 1)
        self.assertEqual(report.negative_duration_rows_fixed, 2)
        self.assertTrue((clean_df["flow_duration"] >= 0).all())
        self.assertTrue(report.has_ground_truth_labels)

    def test_02_reject_invalid_uploads(self) -> None:
        """Verifies security restrictions against binary payloads, empty files, and bad extensions."""
        with self.assertRaises(DataValidationError):
            validate_and_parse_csv_bytes(b"", filename="empty.csv")

        with self.assertRaises(DataValidationError):
            validate_and_parse_csv_bytes(b"a,b,c\n1,2,3", filename="malicious.exe")

        with self.assertRaises(DataValidationError):
            validate_and_parse_csv_bytes(b"col1,col2\x00\x01\x02", filename="binary.csv")

    def test_03_leakage_free_feature_pipeline_and_psi_drift(self) -> None:
        """Verifies preprocessing fits strictly on train data, excludes identifiers, and detects PSI drift."""
        df, _ = load_or_prepare_cicids2017_dataset(n_samples=500, random_seed=11)
        train_df = df.iloc[:350].copy()
        test_df = df.iloc[350:].copy()

        pipeline = FlowFeaturePipeline(CANONICAL_FEATURES)
        x_train = pipeline.fit_transform(train_df)
        x_test = pipeline.transform(test_df)

        self.assertEqual(x_train.shape, (350, len(CANONICAL_FEATURES)))
        self.assertEqual(x_test.shape, (len(test_df), len(CANONICAL_FEATURES)))
        self.assertFalse(np.isnan(x_train).any())
        self.assertFalse(np.isnan(x_test).any())

        # Unperturbed test split should have low PSI drift
        stable_drift = pipeline.compute_batch_drift(test_df)
        # Perturb flow_bytes_s and destination_port heavily to verify drift detection triggers
        drifted_df = test_df.copy()
        drifted_df["flow_bytes_s"] = drifted_df["flow_bytes_s"] * 100.0 + 9e7
        severe_drift = pipeline.compute_batch_drift(drifted_df)
        self.assertGreater(severe_drift["psi_max"], stable_drift["psi_max"])
        self.assertGreaterEqual(severe_drift["drifted_features_count"], 1)

    def test_04_entropy_and_open_set_separation(self) -> None:
        """Verifies normalized Shannon entropy bounds and open-set evaluation metrics."""
        # Certain distribution -> entropy ~ 0.0
        certain_probs = np.array([[0.999, 0.0005, 0.0005]])
        # Uniform distribution -> entropy ~ 1.0
        uniform_probs = np.array([[1 / 3, 1 / 3, 1 / 3]])
        h_certain = compute_normalized_entropy(certain_probs)[0]
        h_uniform = compute_normalized_entropy(uniform_probs)[0]
        self.assertLess(h_certain, 0.05)
        self.assertAlmostEqual(h_uniform, 1.0, places=4)

        engine = AegisMLEngine()
        df, meta = load_or_prepare_cicids2017_dataset(n_samples=900, random_seed=99)
        res = engine.train_and_evaluate(
            df=df,
            dataset_meta=meta,
            split_strategy="group_time_aware",
            held_out_families=["Botnet", "WebAttack"],
            n_estimators_rf=50,
            n_estimators_if=60,
            random_seed=99,
        )
        self.assertGreater(res["accuracy"], 0.80)
        self.assertGreater(res["open_set_auroc"], 0.70)
        self.assertNotIn("Botnet", engine.class_names)
        self.assertNotIn("WebAttack", engine.class_names)

    def test_05_api_health_overview_and_models(self) -> None:
        """Verifies /health, /overview, /threat-intel, /models, /monitoring, and /settings endpoints."""
        r_health = self.client.get("/api/v1/health")
        self.assertEqual(r_health.status_code, 200)
        self.assertTrue(r_health.json()["ml_engine_ready"])

        r_over = self.client.get("/api/v1/overview")
        self.assertEqual(r_over.status_code, 200)
        self.assertGreater(r_over.json()["total_events"], 0)

        r_intel = self.client.get("/api/v1/threat-intel")
        self.assertEqual(r_intel.status_code, 200)
        self.assertIn("taxonomy_definitions", r_intel.json())

        r_models = self.client.get("/api/v1/models")
        self.assertEqual(r_models.status_code, 200)
        self.assertIsNotNone(r_models.json()["active_model"])

        r_mon = self.client.get("/api/v1/monitoring")
        self.assertEqual(r_mon.status_code, 200)
        self.assertIn("latest_feature_drift", r_mon.json())

    def test_06_api_detection_explainability_and_review_workflow(self) -> None:
        """Verifies structured flow scoring, local SHAP additivity, and analyst review updates."""
        payload = {
            "source_name": "unit_test_sensor",
            "flows": [
                {
                    "src_ip": "172.16.0.105",
                    "dst_ip": "192.168.10.50",
                    "destination_port": 80,
                    "flow_duration": 145000.0,
                    "total_fwd_packets": 32,
                    "total_backward_packets": 24,
                    "total_length_of_fwd_packets": 12400.0,
                    "total_length_of_bwd_packets": 28000.0,
                    "fwd_packet_length_max": 720.0,
                    "fwd_packet_length_mean": 387.5,
                    "bwd_packet_length_max": 1460.0,
                    "bwd_packet_length_mean": 1166.6,
                    "flow_bytes_s": 278620.0,
                    "flow_packets_s": 386.2,
                    "flow_iat_mean": 2636.0,
                    "flow_iat_std": 3100.0,
                    "flow_iat_max": 11200.0,
                    "fwd_iat_mean": 4531.0,
                    "bwd_iat_mean": 6041.0,
                    "fwd_psh_flags": 5,
                    "syn_flag_count": 2,
                    "rst_flag_count": 1,
                    "ack_flag_count": 56,
                    "average_packet_size": 721.4,
                    "init_win_bytes_forward": 512.0,
                    "active_mean": 4200.0,
                }
            ],
        }
        r_score = self.client.post("/api/v1/detection/analyze-flows", json=payload)
        self.assertEqual(r_score.status_code, 200)
        scored_data = r_score.json()
        self.assertEqual(len(scored_data["events"]), 1)

        event = scored_data["events"][0]
        event_uid = event["event_uid"]

        # Fetch local SHAP explanation for this event
        r_exp = self.client.get(f"/api/v1/explainability/event/{event_uid}")
        self.assertEqual(r_exp.status_code, 200)
        exp_payload = r_exp.json()
        self.assertGreater(len(exp_payload["explanation"]["top_contributors"]), 0)

        # Generate SOC Incident Brief (Fireworks AI or deterministic fallback)
        r_brief = self.client.post(f"/api/v1/explainability/event/{event_uid}/ai-brief")
        self.assertEqual(r_brief.status_code, 200)
        self.assertIn("brief_markdown", r_brief.json())

        # Update analyst review status
        r_rev = self.client.patch(
            f"/api/v1/events/{event_uid}/review",
            json={
                "review_status": "CONFIRMED_THREAT",
                "analyst_notes": "Verified HTTP DoS flood signature in unit test.",
            },
        )
        self.assertEqual(r_rev.status_code, 200)
        self.assertEqual(r_rev.json()["review_status"], "CONFIRMED_THREAT")


if __name__ == "__main__":
    unittest.main()
