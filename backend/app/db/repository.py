"""Data access repository for AegisNet events, model runs, telemetry, and configuration."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


DEFAULT_SETTINGS_MAP: dict[str, Any] = {
    "confidence_threshold": settings.default_confidence_threshold,
    "entropy_threshold": settings.default_entropy_threshold,
    "anomaly_percentile_threshold": settings.default_anomaly_percentile,
    "enable_shap_on_batch": True,
    "max_shap_rows_per_batch": 100,
    "drift_psi_warning_threshold": 0.15,
    "drift_psi_critical_threshold": 0.25,
    "held_out_attack_families": ["Botnet", "WebAttack"],
    "auto_escalate_critical_anomalies": True,
}


class AegisRepository:
    """Thread-safe repository encapsulating all persistence operations."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn

    # ------------------------------------------------------------------
    # System Settings
    # ------------------------------------------------------------------
    def get_settings(self) -> dict[str, Any]:
        cur = self.conn.execute("SELECT key, value FROM system_config")
        rows = cur.fetchall()
        merged = dict(DEFAULT_SETTINGS_MAP)
        for row in rows:
            try:
                merged[row["key"]] = json.loads(row["value"])
            except Exception:
                merged[row["key"]] = row["value"]
        return merged

    def update_settings(self, updates: dict[str, Any]) -> dict[str, Any]:
        now = utcnow_iso()
        for key, value in updates.items():
            if key in DEFAULT_SETTINGS_MAP:
                self.conn.execute(
                    """
                    INSERT INTO system_config (key, value, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                    """,
                    (key, json.dumps(value), now),
                )
        self.conn.commit()
        return self.get_settings()

    # ------------------------------------------------------------------
    # Network Events
    # ------------------------------------------------------------------
    def insert_events(self, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not events:
            return []
        now = utcnow_iso()
        inserted_uids: list[str] = []
        for ev in events:
            uid = ev["event_uid"]
            inserted_uids.append(uid)
            self.conn.execute(
                """
                INSERT OR REPLACE INTO network_events (
                    event_uid, created_at, batch_id, source_name,
                    src_ip, dst_ip, src_port, dst_port, protocol, flow_timestamp,
                    triage_category, predicted_label, ground_truth_label, severity,
                    supervised_confidence, known_attack_probability, prediction_margin,
                    predictive_entropy, anomaly_score, anomaly_percentile,
                    is_anomalous, is_uncertain,
                    class_probabilities_json, features_json, explanation_json,
                    rationale_text, review_status, analyst_notes, model_version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    uid,
                    ev.get("created_at", now),
                    ev.get("batch_id", "single"),
                    ev.get("source_name", "manual_upload"),
                    str(ev.get("src_ip", "0.0.0.0")),
                    str(ev.get("dst_ip", "0.0.0.0")),
                    int(ev.get("src_port", 0)),
                    int(ev.get("dst_port", 0)),
                    str(ev.get("protocol", "TCP")),
                    str(ev.get("flow_timestamp", "")),
                    str(ev["triage_category"]),
                    str(ev["predicted_label"]),
                    ev.get("ground_truth_label"),
                    str(ev["severity"]),
                    float(ev["supervised_confidence"]),
                    float(ev["known_attack_probability"]),
                    float(ev["prediction_margin"]),
                    float(ev["predictive_entropy"]),
                    float(ev["anomaly_score"]),
                    float(ev["anomaly_percentile"]),
                    1 if ev.get("is_anomalous") else 0,
                    1 if ev.get("is_uncertain") else 0,
                    json.dumps(ev.get("class_probabilities", {})),
                    json.dumps(ev.get("features", {})),
                    json.dumps(ev.get("explanation", {})),
                    str(ev.get("rationale_text", "")),
                    str(ev.get("review_status", "UNREVIEWED")),
                    str(ev.get("analyst_notes", "")),
                    str(ev.get("model_version", "v1.0.0")),
                ),
            )
        self.conn.commit()
        return [self.get_event_by_uid(u) for u in inserted_uids if u]  # type: ignore[misc]

    def _deserialize_event(self, row: sqlite3.Row, include_heavy: bool = True) -> dict[str, Any]:
        data = dict(row)
        data["is_anomalous"] = bool(data.get("is_anomalous", 0))
        data["is_uncertain"] = bool(data.get("is_uncertain", 0))
        data["class_probabilities"] = json.loads(data.pop("class_probabilities_json", "{}") or "{}")
        if include_heavy:
            data["features"] = json.loads(data.pop("features_json", "{}") or "{}")
            data["explanation"] = json.loads(data.pop("explanation_json", "{}") or "{}")
        else:
            data.pop("features_json", None)
            exp_raw = json.loads(data.pop("explanation_json", "{}") or "{}")
            data["top_contributors"] = exp_raw.get("top_contributors", [])[:4]
        return data

    def get_event_by_uid(self, event_uid: str) -> dict[str, Any] | None:
        cur = self.conn.execute(
            "SELECT * FROM network_events WHERE event_uid = ?", (event_uid,)
        )
        row = cur.fetchone()
        return self._deserialize_event(row, include_heavy=True) if row else None

    def get_event_by_id(self, event_id: int) -> dict[str, Any] | None:
        cur = self.conn.execute("SELECT * FROM network_events WHERE id = ?", (event_id,))
        row = cur.fetchone()
        return self._deserialize_event(row, include_heavy=True) if row else None

    def list_events(
        self,
        limit: int = 50,
        offset: int = 0,
        triage_category: str | None = None,
        severity: str | None = None,
        predicted_label: str | None = None,
        review_status: str | None = None,
        search: str | None = None,
        min_entropy: float | None = None,
        only_anomalous: bool = False,
    ) -> dict[str, Any]:
        clauses: list[str] = []
        params: list[Any] = []

        if triage_category and triage_category != "ALL":
            clauses.append("triage_category = ?")
            params.append(triage_category)
        if severity and severity != "ALL":
            clauses.append("severity = ?")
            params.append(severity)
        if predicted_label and predicted_label != "ALL":
            clauses.append("predicted_label = ?")
            params.append(predicted_label)
        if review_status and review_status != "ALL":
            clauses.append("review_status = ?")
            params.append(review_status)
        if min_entropy is not None:
            clauses.append("predictive_entropy >= ?")
            params.append(float(min_entropy))
        if only_anomalous:
            clauses.append("is_anomalous = 1")
        if search:
            q = f"%{search.strip()}%"
            clauses.append(
                "(event_uid LIKE ? OR src_ip LIKE ? OR dst_ip LIKE ? OR predicted_label LIKE ? OR rationale_text LIKE ? OR batch_id LIKE ?)"
            )
            params.extend([q, q, q, q, q, q])

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        total_row = self.conn.execute(
            f"SELECT COUNT(*) AS cnt FROM network_events {where_sql}", params
        ).fetchone()
        total = int(total_row["cnt"]) if total_row else 0

        rows = self.conn.execute(
            f"""
            SELECT * FROM network_events
            {where_sql}
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            """,
            [*params, limit, offset],
        ).fetchall()

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "items": [self._deserialize_event(r, include_heavy=False) for r in rows],
        }

    def update_event_review(
        self, event_uid: str, review_status: str, analyst_notes: str
    ) -> dict[str, Any] | None:
        self.conn.execute(
            """
            UPDATE network_events
            SET review_status = ?, analyst_notes = ?
            WHERE event_uid = ?
            """,
            (review_status, analyst_notes, event_uid),
        )
        self.conn.commit()
        return self.get_event_by_uid(event_uid)

    def bulk_update_event_review(
        self, event_uids: list[str], review_status: str, analyst_notes: str
    ) -> int:
        if not event_uids:
            return 0
        placeholders = ",".join("?" for _ in event_uids)
        cur = self.conn.execute(
            f"""
            UPDATE network_events
            SET review_status = ?, analyst_notes = CASE WHEN ? != '' THEN ? ELSE analyst_notes END
            WHERE event_uid IN ({placeholders})
            """,
            [review_status, analyst_notes, analyst_notes, *event_uids],
        )
        self.conn.commit()
        return cur.rowcount

    def clear_events(self) -> int:
        cur = self.conn.execute("DELETE FROM network_events")
        self.conn.commit()
        return cur.rowcount

    # ------------------------------------------------------------------
    # Aggregations for Overview & Threat Intelligence
    # ------------------------------------------------------------------
    def get_overview_summary(self) -> dict[str, Any]:
        total_row = self.conn.execute(
            """
            SELECT
                COUNT(*) AS total_events,
                SUM(CASE WHEN triage_category = 'KNOWN_ATTACK' THEN 1 ELSE 0 END) AS known_attacks,
                SUM(CASE WHEN triage_category = 'BENIGN' THEN 1 ELSE 0 END) AS benign_events,
                SUM(CASE WHEN triage_category = 'ANOMALOUS_UNKNOWN' THEN 1 ELSE 0 END) AS anomalous_unknown,
                SUM(CASE WHEN triage_category = 'UNCERTAIN' THEN 1 ELSE 0 END) AS uncertain_events,
                SUM(CASE WHEN review_status = 'UNREVIEWED' AND triage_category != 'BENIGN' THEN 1 ELSE 0 END) AS pending_triage,
                AVG(supervised_confidence) AS avg_confidence,
                AVG(predictive_entropy) AS avg_entropy,
                AVG(anomaly_score) AS avg_anomaly_score,
                AVG(anomaly_percentile) AS avg_anomaly_percentile
            FROM network_events
            """
        ).fetchone()

        severity_rows = self.conn.execute(
            "SELECT severity, COUNT(*) AS count FROM network_events GROUP BY severity"
        ).fetchall()
        severity_dist = {r["severity"]: int(r["count"]) for r in severity_rows}

        triage_rows = self.conn.execute(
            "SELECT triage_category, COUNT(*) AS count FROM network_events GROUP BY triage_category"
        ).fetchall()
        triage_dist = {r["triage_category"]: int(r["count"]) for r in triage_rows}

        label_rows = self.conn.execute(
            """
            SELECT predicted_label, triage_category, COUNT(*) AS count,
                   AVG(supervised_confidence) AS mean_confidence,
                   AVG(predictive_entropy) AS mean_entropy,
                   AVG(anomaly_percentile) AS mean_anomaly_pct
            FROM network_events
            GROUP BY predicted_label, triage_category
            ORDER BY count DESC
            """
        ).fetchall()

        recent_events = self.conn.execute(
            "SELECT * FROM network_events ORDER BY id DESC LIMIT 12"
        ).fetchall()

        # Time-bucketed or batch-bucketed volume series
        series_rows = self.conn.execute(
            """
            SELECT
                substr(created_at, 1, 16) AS bucket,
                COUNT(*) AS total,
                SUM(CASE WHEN triage_category = 'KNOWN_ATTACK' THEN 1 ELSE 0 END) AS known_attacks,
                SUM(CASE WHEN triage_category = 'ANOMALOUS_UNKNOWN' THEN 1 ELSE 0 END) AS anomalies,
                SUM(CASE WHEN triage_category = 'UNCERTAIN' THEN 1 ELSE 0 END) AS uncertain,
                SUM(CASE WHEN triage_category = 'BENIGN' THEN 1 ELSE 0 END) AS benign
            FROM network_events
            GROUP BY bucket
            ORDER BY bucket ASC
            LIMIT 30
            """
        ).fetchall()

        return {
            "total_events": int(total_row["total_events"] or 0),
            "known_attacks": int(total_row["known_attacks"] or 0),
            "benign_events": int(total_row["benign_events"] or 0),
            "anomalous_unknown": int(total_row["anomalous_unknown"] or 0),
            "uncertain_events": int(total_row["uncertain_events"] or 0),
            "pending_triage": int(total_row["pending_triage"] or 0),
            "avg_confidence": round(float(total_row["avg_confidence"] or 0.0), 4),
            "avg_entropy": round(float(total_row["avg_entropy"] or 0.0), 4),
            "avg_anomaly_score": round(float(total_row["avg_anomaly_score"] or 0.0), 4),
            "avg_anomaly_percentile": round(
                float(total_row["avg_anomaly_percentile"] or 0.0), 2
            ),
            "severity_distribution": severity_dist,
            "triage_distribution": triage_dist,
            "attack_class_breakdown": [
                {
                    "predicted_label": r["predicted_label"],
                    "triage_category": r["triage_category"],
                    "count": int(r["count"]),
                    "mean_confidence": round(float(r["mean_confidence"] or 0.0), 4),
                    "mean_entropy": round(float(r["mean_entropy"] or 0.0), 4),
                    "mean_anomaly_pct": round(float(r["mean_anomaly_pct"] or 0.0), 2),
                }
                for r in label_rows
            ],
            "timeline_series": [dict(r) for r in series_rows],
            "recent_events": [
                self._deserialize_event(r, include_heavy=False) for r in recent_events
            ],
        }

    def get_threat_intelligence(self) -> dict[str, Any]:
        """Aggregates threat intelligence statistics across analyzed events without fake data."""
        summary = self.get_overview_summary()

        port_rows = self.conn.execute(
            """
            SELECT dst_port, protocol, triage_category, COUNT(*) AS count,
                   AVG(anomaly_percentile) AS avg_anomaly_pct
            FROM network_events
            WHERE triage_category != 'BENIGN'
            GROUP BY dst_port, protocol, triage_category
            ORDER BY count DESC
            LIMIT 15
            """
        ).fetchall()

        source_rows = self.conn.execute(
            """
            SELECT src_ip, COUNT(*) AS event_count,
                   SUM(CASE WHEN triage_category = 'KNOWN_ATTACK' THEN 1 ELSE 0 END) AS known_attack_count,
                   SUM(CASE WHEN triage_category = 'ANOMALOUS_UNKNOWN' THEN 1 ELSE 0 END) AS anomaly_count,
                   MAX(anomaly_percentile) AS max_anomaly_pct,
                   AVG(predictive_entropy) AS avg_entropy
            FROM network_events
            WHERE triage_category != 'BENIGN'
            GROUP BY src_ip
            ORDER BY event_count DESC
            LIMIT 15
            """
        ).fetchall()

        scatter_rows = self.conn.execute(
            """
            SELECT event_uid, triage_category, predicted_label, severity,
                   supervised_confidence, predictive_entropy, anomaly_score, anomaly_percentile,
                   known_attack_probability, dst_port
            FROM network_events
            ORDER BY id DESC
            LIMIT 250
            """
        ).fetchall()

        return {
            "total_analyzed": summary["total_events"],
            "attack_class_breakdown": summary["attack_class_breakdown"],
            "triage_distribution": summary["triage_distribution"],
            "severity_distribution": summary["severity_distribution"],
            "targeted_ports": [
                {
                    "dst_port": int(r["dst_port"]),
                    "protocol": r["protocol"],
                    "triage_category": r["triage_category"],
                    "count": int(r["count"]),
                    "avg_anomaly_pct": round(float(r["avg_anomaly_pct"] or 0.0), 2),
                }
                for r in port_rows
            ],
            "suspicious_sources": [
                {
                    "src_ip": r["src_ip"],
                    "event_count": int(r["event_count"]),
                    "known_attack_count": int(r["known_attack_count"] or 0),
                    "anomaly_count": int(r["anomaly_count"] or 0),
                    "max_anomaly_pct": round(float(r["max_anomaly_pct"] or 0.0), 2),
                    "avg_entropy": round(float(r["avg_entropy"] or 0.0), 4),
                }
                for r in source_rows
            ],
            "uncertainty_vs_anomaly_points": [dict(r) for r in scatter_rows],
        }

    # ------------------------------------------------------------------
    # Model Runs
    # ------------------------------------------------------------------
    def save_model_run(self, run_data: dict[str, Any]) -> dict[str, Any]:
        now = utcnow_iso()
        if run_data.get("is_active", True):
            self.conn.execute("UPDATE model_runs SET is_active = 0")

        self.conn.execute(
            """
            INSERT OR REPLACE INTO model_runs (
                version, created_at, dataset_name, dataset_source, split_strategy,
                held_out_families_json, train_rows, test_rows, open_set_rows, feature_count,
                accuracy, macro_precision, macro_recall, macro_f1, weighted_f1,
                brier_score, expected_calibration_error,
                open_set_auroc, open_set_auprc, open_set_recall_at_5pct_fpr,
                open_set_precision, open_set_fpr,
                metrics_json, eda_summary_json, global_importance_json,
                artifact_path, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_data["version"],
                run_data.get("created_at", now),
                run_data["dataset_name"],
                run_data["dataset_source"],
                run_data["split_strategy"],
                json.dumps(run_data.get("held_out_families", [])),
                int(run_data["train_rows"]),
                int(run_data["test_rows"]),
                int(run_data.get("open_set_rows", 0)),
                int(run_data["feature_count"]),
                float(run_data["accuracy"]),
                float(run_data["macro_precision"]),
                float(run_data["macro_recall"]),
                float(run_data["macro_f1"]),
                float(run_data["weighted_f1"]),
                float(run_data.get("brier_score", 0.0)),
                float(run_data.get("expected_calibration_error", 0.0)),
                float(run_data.get("open_set_auroc", 0.0)),
                float(run_data.get("open_set_auprc", 0.0)),
                float(run_data.get("open_set_recall_at_5pct_fpr", 0.0)),
                float(run_data.get("open_set_precision", 0.0)),
                float(run_data.get("open_set_fpr", 0.0)),
                json.dumps(run_data.get("metrics", {})),
                json.dumps(run_data.get("eda_summary", {})),
                json.dumps(run_data.get("global_importance", [])),
                str(run_data.get("artifact_path", "")),
                1 if run_data.get("is_active", True) else 0,
            ),
        )
        self.conn.commit()
        return self.get_model_run(run_data["version"])  # type: ignore[return-value]

    def _deserialize_model_run(self, row: sqlite3.Row) -> dict[str, Any]:
        data = dict(row)
        data["is_active"] = bool(data.get("is_active", 0))
        data["held_out_families"] = json.loads(
            data.pop("held_out_families_json", "[]") or "[]"
        )
        data["metrics"] = json.loads(data.pop("metrics_json", "{}") or "{}")
        data["eda_summary"] = json.loads(data.pop("eda_summary_json", "{}") or "{}")
        data["global_importance"] = json.loads(
            data.pop("global_importance_json", "[]") or "[]"
        )
        return data

    def get_model_run(self, version: str) -> dict[str, Any] | None:
        row = self.conn.execute(
            "SELECT * FROM model_runs WHERE version = ?", (version,)
        ).fetchone()
        return self._deserialize_model_run(row) if row else None

    def get_active_model_run(self) -> dict[str, Any] | None:
        row = self.conn.execute(
            "SELECT * FROM model_runs WHERE is_active = 1 ORDER BY id DESC LIMIT 1"
        ).fetchone()
        if not row:
            row = self.conn.execute(
                "SELECT * FROM model_runs ORDER BY id DESC LIMIT 1"
            ).fetchone()
        return self._deserialize_model_run(row) if row else None

    def list_model_runs(self) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            "SELECT * FROM model_runs ORDER BY id DESC LIMIT 25"
        ).fetchall()
        return [self._deserialize_model_run(r) for r in rows]

    # ------------------------------------------------------------------
    # Telemetry & Drift Monitoring
    # ------------------------------------------------------------------
    def record_telemetry(self, entry: dict[str, Any]) -> None:
        now = utcnow_iso()
        self.conn.execute(
            """
            INSERT INTO inference_telemetry (
                created_at, batch_id, endpoint, record_count, latency_ms,
                status_code, error_message, drift_psi_max, drift_psi_mean,
                drifted_features_count, drift_details_json, mean_entropy, mean_anomaly_score
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.get("created_at", now),
                entry.get("batch_id", "none"),
                entry.get("endpoint", "/api/v1/inference"),
                int(entry.get("record_count", 1)),
                float(entry.get("latency_ms", 0.0)),
                int(entry.get("status_code", 200)),
                entry.get("error_message"),
                float(entry.get("drift_psi_max", 0.0)),
                float(entry.get("drift_psi_mean", 0.0)),
                int(entry.get("drifted_features_count", 0)),
                json.dumps(entry.get("drift_details", [])),
                float(entry.get("mean_entropy", 0.0)),
                float(entry.get("mean_anomaly_score", 0.0)),
            ),
        )
        self.conn.commit()

    def get_monitoring_summary(self) -> dict[str, Any]:
        stats_row = self.conn.execute(
            """
            SELECT
                COUNT(*) AS total_requests,
                SUM(record_count) AS total_flows_scored,
                AVG(latency_ms) AS avg_latency_ms,
                MAX(latency_ms) AS max_latency_ms,
                SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS error_count,
                AVG(drift_psi_mean) AS avg_drift_psi,
                MAX(drift_psi_max) AS max_drift_psi
            FROM inference_telemetry
            """
        ).fetchone()

        recent_rows = self.conn.execute(
            "SELECT * FROM inference_telemetry ORDER BY id DESC LIMIT 40"
        ).fetchall()

        latencies = sorted(
            [float(r["latency_ms"]) for r in recent_rows if r["latency_ms"] is not None]
        )
        p95_latency = (
            latencies[min(len(latencies) - 1, int(len(latencies) * 0.95))]
            if latencies
            else 0.0
        )

        latest_drift_details: list[dict[str, Any]] = []
        for r in recent_rows:
            parsed = json.loads(r["drift_details_json"] or "[]")
            if parsed:
                latest_drift_details = parsed
                break

        errors = [
            {
                "id": r["id"],
                "created_at": r["created_at"],
                "endpoint": r["endpoint"],
                "status_code": r["status_code"],
                "error_message": r["error_message"],
            }
            for r in recent_rows
            if r["status_code"] >= 400 or r["error_message"]
        ]

        return {
            "total_requests": int(stats_row["total_requests"] or 0),
            "total_flows_scored": int(stats_row["total_flows_scored"] or 0),
            "avg_latency_ms": round(float(stats_row["avg_latency_ms"] or 0.0), 2),
            "p95_latency_ms": round(float(p95_latency), 2),
            "max_latency_ms": round(float(stats_row["max_latency_ms"] or 0.0), 2),
            "error_count": int(stats_row["error_count"] or 0),
            "avg_drift_psi": round(float(stats_row["avg_drift_psi"] or 0.0), 4),
            "max_drift_psi": round(float(stats_row["max_drift_psi"] or 0.0), 4),
            "latest_feature_drift": latest_drift_details,
            "recent_telemetry": [
                {
                    "id": r["id"],
                    "created_at": r["created_at"],
                    "batch_id": r["batch_id"],
                    "endpoint": r["endpoint"],
                    "record_count": int(r["record_count"]),
                    "latency_ms": round(float(r["latency_ms"]), 2),
                    "status_code": int(r["status_code"]),
                    "drift_psi_max": round(float(r["drift_psi_max"]), 4),
                    "drift_psi_mean": round(float(r["drift_psi_mean"]), 4),
                    "drifted_features_count": int(r["drifted_features_count"]),
                    "mean_entropy": round(float(r["mean_entropy"]), 4),
                    "mean_anomaly_score": round(float(r["mean_anomaly_score"]), 4),
                }
                for r in recent_rows
            ],
            "operational_errors": errors,
        }
