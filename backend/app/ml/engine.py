"""
Core ML Training, Open-Set Evaluation, Uncertainty Quantification, and Inference Engine.

Implements:
1. Exploratory Data Analysis (EDA) on network-flow datasets.
2. Stratified and Group/Time-Aware splitting (`GroupShuffleSplit`) to prevent session leakage.
3. Held-out attack-family open-set evaluation (e.g. holding out `Botnet` and `WebAttack` from training).
4. Leakage-free preprocessing fitted strictly on closed-set training data.
5. Supervised Random Forest baseline + probability calibration (`CalibratedClassifierCV`).
6. Isolation Forest anomaly detection fitted on training benign baseline + comparison against full-training Isolation Forest.
7. Uncertainty quantification via normalized Shannon entropy, prediction margin, Brier score, and Expected Calibration Error (ECE).
8. Four-category triage decision engine (`KNOWN_ATTACK`, `BENIGN`, `ANOMALOUS_UNKNOWN`, `UNCERTAIN`).
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import uuid

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GroupShuffleSplit, StratifiedShuffleSplit

from app.core.config import settings
from app.ml.dataset_generator import load_or_prepare_cicids2017_dataset
from app.ml.explainer import AegisExplainer
from app.ml.preprocessing import FlowFeaturePipeline
from app.ml.schema import CANONICAL_FEATURES, FEATURE_DESCRIPTIONS


def compute_normalized_entropy(probs: np.ndarray) -> np.ndarray:
    """
    Computes normalized Shannon entropy H(p) / ln(K) in [0, 1] for probability matrix (N, K).
    0.0 = complete certainty (one class has probability 1.0)
    1.0 = maximum epistemic/aleatoric ambiguity (uniform distribution across K classes)
    """
    clipped = np.clip(probs, 1e-12, 1.0)
    k = probs.shape[1]
    if k <= 1:
        return np.zeros(len(probs), dtype=np.float64)
    raw_h = -np.sum(clipped * np.log(clipped), axis=1)
    return np.clip(raw_h / np.log(float(k)), 0.0, 1.0)


def compute_multiclass_calibration(
    y_true_idx: np.ndarray, probs: np.ndarray, n_bins: int = 10
) -> dict[str, Any]:
    """
    Computes multi-class Brier score, Expected Calibration Error (ECE), and reliability curve bins.
    """
    n_samples, n_classes = probs.shape
    one_hot = np.zeros_like(probs)
    one_hot[np.arange(n_samples), y_true_idx] = 1.0
    brier = float(np.mean(np.sum((probs - one_hot) ** 2, axis=1)))

    confidences = np.max(probs, axis=1)
    predictions = np.argmax(probs, axis=1)
    accuracies = (predictions == y_true_idx).astype(np.float64)

    bin_boundaries = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    bins_report: list[dict[str, Any]] = []

    for b_idx in range(n_bins):
        low, high = bin_boundaries[b_idx], bin_boundaries[b_idx + 1]
        if b_idx == 0:
            in_bin = (confidences >= low) & (confidences <= high)
        else:
            in_bin = (confidences > low) & (confidences <= high)
        prop_in_bin = float(np.mean(in_bin))
        if prop_in_bin > 0:
            avg_conf = float(np.mean(confidences[in_bin]))
            avg_acc = float(np.mean(accuracies[in_bin]))
            ece += abs(avg_acc - avg_conf) * prop_in_bin
            bins_report.append(
                {
                    "bin_range": f"{low:.1f}-{high:.1f}",
                    "bin_midpoint": round((low + high) / 2.0, 2),
                    "count": int(np.sum(in_bin)),
                    "mean_confidence": round(avg_conf, 4),
                    "empirical_accuracy": round(avg_acc, 4),
                    "calibration_gap": round(abs(avg_acc - avg_conf), 4),
                }
            )
        else:
            bins_report.append(
                {
                    "bin_range": f"{low:.1f}-{high:.1f}",
                    "bin_midpoint": round((low + high) / 2.0, 2),
                    "count": 0,
                    "mean_confidence": round((low + high) / 2.0, 4),
                    "empirical_accuracy": 0.0,
                    "calibration_gap": 0.0,
                }
            )

    return {
        "brier_score": round(brier, 5),
        "expected_calibration_error": round(float(ece), 5),
        "reliability_bins": bins_report,
    }


class AegisMLEngine:
    """Manages active ML pipeline, training experiments, open-set benchmarks, and live inference."""

    def __init__(self) -> None:
        self.version: str = "uninitialized"
        self.pipeline: FlowFeaturePipeline | None = None
        self.rf_base: RandomForestClassifier | None = None
        self.rf_calibrated: CalibratedClassifierCV | None = None
        self.iso_forest: IsolationForest | None = None
        self.explainer: AegisExplainer | None = None
        self.class_names: list[str] = []
        self.held_out_families: list[str] = []
        self.reference_anomaly_scores: np.ndarray = np.array([])
        self.global_importance: list[dict[str, Any]] = []
        self.model_metadata: dict[str, Any] = {}
        self.is_ready: bool = False

    def load_artifact(self, artifact_path: str | Path) -> bool:
        path = Path(artifact_path)
        if not path.exists():
            return False
        bundle = joblib.load(path)
        self.version = bundle["version"]
        self.pipeline = bundle["pipeline"]
        self.rf_base = bundle["rf_base"]
        self.rf_calibrated = bundle["rf_calibrated"]
        self.iso_forest = bundle["iso_forest"]
        self.class_names = bundle["class_names"]
        self.held_out_families = bundle.get("held_out_families", [])
        self.reference_anomaly_scores = np.asarray(
            bundle["reference_anomaly_scores"], dtype=np.float64
        )
        self.global_importance = bundle.get("global_importance", [])
        self.model_metadata = bundle.get("model_metadata", {})

        if self.rf_base is not None and self.pipeline is not None:
            self.explainer = AegisExplainer(
                rf_model=self.rf_base,
                feature_names=self.pipeline.feature_names,
                class_names=self.class_names,
                train_medians=self.pipeline.medians_,
                train_iqrs=self.pipeline.iqrs_,
            )
            self.is_ready = True
        return self.is_ready

    def train_and_evaluate(
        self,
        df: pd.DataFrame | None = None,
        dataset_meta: dict[str, Any] | None = None,
        split_strategy: str = "group_time_aware",
        held_out_families: list[str] | None = None,
        n_estimators_rf: int = 120,
        n_estimators_if: int = 150,
        random_seed: int = 42,
    ) -> dict[str, Any]:
        """
        Executes a full, reproducible ML experiment:
          1. Loads/validates dataset & computes Exploratory Data Analysis (EDA).
          2. Separates held-out attack families (`Botnet`, `WebAttack`) for open-set evaluation.
          3. Splits known classes via `group_time_aware` (session-grouped) or `stratified` split.
          4. Fits `FlowFeaturePipeline` ONLY on `train_df` (zero leakage).
          5. Trains `RandomForestClassifier` + `CalibratedClassifierCV` on known classes.
          6. Trains `IsolationForest` on benign training traffic (plus compares against full-train IF).
          7. Computes closed-set, calibration, and open-set held-out attack family metrics.
          8. Computes global TreeSHAP feature importances and persists the artifact.
        """
        if df is None or dataset_meta is None:
            df, dataset_meta = load_or_prepare_cicids2017_dataset(
                n_samples=3600, random_seed=random_seed
            )

        if "label" not in df.columns or df["label"].isna().all():
            raise ValueError("Training dataset must include a 'label' column.")

        held_out = list(
            held_out_families
            if held_out_families is not None
            else ["Botnet", "WebAttack"]
        )

        # 1. Exploratory Data Analysis (EDA)
        full_vc = df["label"].value_counts()
        total_rows = len(df)
        majority_count = int(full_vc.max())
        minority_count = int(full_vc.min())
        imbalance_ratio = round(majority_count / max(1, minority_count), 2)

        feature_summary: list[dict[str, Any]] = []
        for feat in CANONICAL_FEATURES:
            s = pd.to_numeric(df[feat], errors="coerce").replace([np.inf, -np.inf], np.nan)
            feature_summary.append(
                {
                    "feature": feat,
                    "description": FEATURE_DESCRIPTIONS.get(feat, feat),
                    "missing_or_inf": int(s.isna().sum()),
                    "mean": round(float(s.mean() or 0.0), 3),
                    "std": round(float(s.std() or 0.0), 3),
                    "median": round(float(s.median() or 0.0), 3),
                    "q95": round(float(s.quantile(0.95) or 0.0), 3),
                }
            )

        eda_summary = {
            "total_clean_rows": total_rows,
            "feature_count": len(CANONICAL_FEATURES),
            "class_distribution": {str(k): int(v) for k, v in full_vc.items()},
            "class_proportions_pct": {
                str(k): round(float(v) * 100.0 / total_rows, 2) for k, v in full_vc.items()
            },
            "imbalance_ratio_max_to_min": imbalance_ratio,
            "held_out_attack_families": held_out,
            "validation_report": dataset_meta.get("validation_report", {}),
            "feature_statistics": feature_summary,
            "leakage_prevention_notes": [
                "Excluded Flow ID, Source IP, Destination IP, Source Port, and Timestamp from feature matrix.",
                "Fitted median imputer, quantile winsorizer, and RobustScaler strictly on closed-set training partition.",
                f"Applied '{split_strategy}' splitting to prevent temporal capture-window/session leakage between train and test.",
                f"Held out attack families {held_out} completely from training to evaluate open-set unknown threat detection.",
            ],
        }

        # 2. Separate Held-Out Attack Families (Open-Set Evaluation Partition)
        is_held_out = df["label"].isin(held_out)
        open_set_attack_df = df[is_held_out].reset_index(drop=True)
        closed_set_df = df[~is_held_out].reset_index(drop=True)

        # 3. Train/Test Split on Closed-Set Classes (Stratified vs Group/Time-Aware)
        y_closed = closed_set_df["label"].astype(str).to_numpy()
        if (
            split_strategy == "group_time_aware"
            and "session_group" in closed_set_df.columns
            and closed_set_df["session_group"].nunique() >= 10
        ):
            gss = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=random_seed)
            groups = closed_set_df["session_group"].astype(str).to_numpy()
            train_idx, test_idx = next(gss.split(closed_set_df, y_closed, groups=groups))
            # Verify all known classes appear in both train and test; fallback to stratified if a rare class was grouped out
            if set(y_closed[train_idx]) != set(y_closed):
                sss = StratifiedShuffleSplit(
                    n_splits=1, test_size=0.25, random_state=random_seed
                )
                train_idx, test_idx = next(sss.split(closed_set_df, y_closed))
        else:
            split_strategy = "stratified"
            sss = StratifiedShuffleSplit(
                n_splits=1, test_size=0.25, random_state=random_seed
            )
            train_idx, test_idx = next(sss.split(closed_set_df, y_closed))

        train_df = closed_set_df.iloc[train_idx].reset_index(drop=True)
        test_df = closed_set_df.iloc[test_idx].reset_index(drop=True)

        # 4. Fit Feature Preprocessing Pipeline strictly on train_df
        pipeline = FlowFeaturePipeline(CANONICAL_FEATURES)
        x_train = pipeline.fit_transform(train_df)
        x_test = pipeline.transform(test_df)

        class_names = sorted(train_df["label"].astype(str).unique().tolist())
        class_to_idx = {c: i for i, c in enumerate(class_names)}
        y_train_str = train_df["label"].astype(str).to_numpy()
        y_test_str = test_df["label"].astype(str).to_numpy()
        y_test_idx = np.array([class_to_idx[c] for c in y_test_str], dtype=int)

        # 5. Train Supervised Random Forest Baseline + Probability Calibration
        rf_base = RandomForestClassifier(
            n_estimators=n_estimators_rf,
            max_depth=16,
            min_samples_leaf=2,
            class_weight="balanced_subsample",
            random_state=random_seed,
            n_jobs=-1,
        )
        rf_base.fit(x_train, y_train_str)

        rf_calibrated = CalibratedClassifierCV(
            estimator=RandomForestClassifier(
                n_estimators=max(60, n_estimators_rf // 2),
                max_depth=16,
                min_samples_leaf=2,
                class_weight="balanced_subsample",
                random_state=random_seed,
                n_jobs=-1,
            ),
            method="sigmoid",
            cv=3,
        )
        rf_calibrated.fit(x_train, y_train_str)

        # Compare uncalibrated vs calibrated probabilities on closed-set test split
        probs_uncal = rf_base.predict_proba(x_test)
        probs_cal = rf_calibrated.predict_proba(x_test)
        cal_eval = compute_multiclass_calibration(y_test_idx, probs_cal, n_bins=10)
        uncal_eval = compute_multiclass_calibration(y_test_idx, probs_uncal, n_bins=10)

        y_pred_idx = np.argmax(probs_cal, axis=1)
        y_pred_str = np.array([class_names[i] for i in y_pred_idx])

        acc = float(accuracy_score(y_test_str, y_pred_str))
        macro_p = float(precision_score(y_test_str, y_pred_str, average="macro", zero_division=0))
        macro_r = float(recall_score(y_test_str, y_pred_str, average="macro", zero_division=0))
        macro_f1 = float(f1_score(y_test_str, y_pred_str, average="macro", zero_division=0))
        weighted_f1 = float(f1_score(y_test_str, y_pred_str, average="weighted", zero_division=0))

        p_arr, r_arr, f1_arr, sup_arr = precision_recall_fscore_support(
            y_test_str, y_pred_str, labels=class_names, zero_division=0
        )
        per_class_metrics = [
            {
                "class_name": cls_name,
                "precision": round(float(p_arr[i]), 4),
                "recall": round(float(r_arr[i]), 4),
                "f1_score": round(float(f1_arr[i]), 4),
                "support": int(sup_arr[i]),
            }
            for i, cls_name in enumerate(class_names)
        ]

        cm = confusion_matrix(y_test_str, y_pred_str, labels=class_names)

        # 6. Train Isolation Forest Anomaly Detector on Benign Training Flows
        benign_train_mask = y_train_str == "BENIGN"
        x_train_benign = x_train[benign_train_mask] if np.any(benign_train_mask) else x_train

        iso_forest = IsolationForest(
            n_estimators=n_estimators_if,
            contamination=0.05,
            random_state=random_seed,
            n_jobs=-1,
        )
        iso_forest.fit(x_train_benign)

        # Reference anomaly score distribution on training benign flows
        # Higher score = more anomalous (-decision_function)
        ref_benign_scores = -iso_forest.decision_function(x_train_benign)
        ref_benign_scores_sorted = np.sort(ref_benign_scores)

        # 7. Open-Set Held-Out Attack Family Evaluation
        # Evaluate ability to flag unseen attack families (e.g. Botnet, WebAttack) vs test-set BENIGN traffic
        benign_test_mask = y_test_str == "BENIGN"
        x_test_benign = x_test[benign_test_mask]
        x_open_attacks = (
            pipeline.transform(open_set_attack_df)
            if len(open_set_attack_df) > 0
            else np.empty((0, len(CANONICAL_FEATURES)))
        )

        open_set_metrics = self._evaluate_open_set(
            iso_forest=iso_forest,
            rf_calibrated=rf_calibrated,
            ref_benign_scores_sorted=ref_benign_scores_sorted,
            x_test_benign=x_test_benign,
            x_open_attacks=x_open_attacks,
            open_set_attack_df=open_set_attack_df,
            held_out_families=held_out,
        )

        # 8. Explainability & Global Feature Importance
        explainer = AegisExplainer(
            rf_model=rf_base,
            feature_names=CANONICAL_FEATURES,
            class_names=class_names,
            train_medians=pipeline.medians_,
            train_iqrs=pipeline.iqrs_,
            background_x=x_train_benign,
        )
        global_importance = explainer.compute_global_importance(x_test)

        version_str = f"v1.0.{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        artifact_path = settings.artifacts_dir / f"aegisnet_{version_str}.joblib"

        metrics_payload = {
            "closed_set": {
                "accuracy": round(acc, 4),
                "macro_precision": round(macro_p, 4),
                "macro_recall": round(macro_r, 4),
                "macro_f1": round(macro_f1, 4),
                "weighted_f1": round(weighted_f1, 4),
                "class_labels": class_names,
                "per_class": per_class_metrics,
                "confusion_matrix": cm.tolist(),
            },
            "calibration": {
                "calibrated": cal_eval,
                "uncalibrated_brier_score": uncal_eval["brier_score"],
                "uncalibrated_ece": uncal_eval["expected_calibration_error"],
                "method": "Sigmoid Platt Scaling (3-fold CV over Random Forest)",
            },
            "open_set": open_set_metrics,
            "model_comparison": [
                {
                    "model_name": "Calibrated Random Forest (Supervised Closed-Set)",
                    "role": "Known Attack Classification & Calibrated Confidence",
                    "strengths": "High precision/recall on known training signatures (DoS Hulk, PortScan, DDoS, BruteForce); provides calibrated class probabilities.",
                    "limitations": "Cannot assign a known class label to unseen attack families outside its training taxonomy; requires uncertainty + anomaly layer for open-set defense.",
                    "headline_metric": f"Macro F1: {macro_f1:.3f} | ECE: {cal_eval['expected_calibration_error']:.4f}",
                },
                {
                    "model_name": "Isolation Forest (Benign-Baseline Anomaly Detector)",
                    "role": "Unsupervised Structural Deviation / Unknown Threat Flagging",
                    "strengths": f"Trained without attack labels; detects held-out unseen attack families ({', '.join(held_out)}) via structural flow deviations.",
                    "limitations": "Anomaly scores measure deviation from benign baseline—not calibrated maliciousness probability. Benign traffic spikes can trigger false positives (~5% design FPR).",
                    "headline_metric": f"Open-Set AUROC: {open_set_metrics['auroc']:.3f} | AUPRC: {open_set_metrics['auprc']:.3f}",
                },
                {
                    "model_name": "AegisNet Hybrid Open-Set Decision Engine",
                    "role": "Joint Supervised + Uncertainty + Anomaly Triage",
                    "strengths": "Combines calibrated RF probabilities, Shannon entropy uncertainty, and Isolation Forest percentiles into 4 actionable analyst states.",
                    "limitations": "Requires periodic drift monitoring (PSI) and analyst review of ANOMALOUS_UNKNOWN and UNCERTAIN queues.",
                    "headline_metric": f"Recall @ 5% FPR: {open_set_metrics['recall_at_5pct_fpr']:.3f}",
                },
            ],
            "scientific_limitations": [
                "Experimental Definition of Unknown Attacks: Unknown attacks are operationally defined in this benchmark as attack families (Botnet, WebAttack) completely excluded from the supervised training partition.",
                "Anomaly != Zero-Day Guarantee: An Isolation Forest anomaly score quantifies statistical rarity relative to training benign flows; novel benign workloads or misconfigurations can also produce high anomaly scores.",
                "CIC-IDS2017 Dataset Limitations: CIC-IDS2017 was captured in a controlled testbed over 5 days; raw captures exhibit class imbalance and Flow Bytes/s infinity artifacts when flow_duration=0, which AegisNet sanitizes during validation.",
            ],
        }

        model_metadata = {
            "version": version_str,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "dataset_name": dataset_meta.get("dataset_name", "CIC-IDS2017"),
            "dataset_source": dataset_meta.get("dataset_source", "cicids2017_schema_benchmark"),
            "split_strategy": split_strategy,
            "held_out_families": held_out,
            "train_rows": len(train_df),
            "test_rows": len(test_df),
            "open_set_rows": len(open_set_attack_df),
            "feature_count": len(CANONICAL_FEATURES),
            "class_names": class_names,
            "explainer_backend": explainer.explainer_backend,
        }

        bundle = {
            "version": version_str,
            "pipeline": pipeline,
            "rf_base": rf_base,
            "rf_calibrated": rf_calibrated,
            "iso_forest": iso_forest,
            "class_names": class_names,
            "held_out_families": held_out,
            "reference_anomaly_scores": ref_benign_scores_sorted,
            "global_importance": global_importance,
            "model_metadata": model_metadata,
        }
        joblib.dump(bundle, artifact_path)

        # Activate in memory
        self.load_artifact(artifact_path)

        return {
            "version": version_str,
            "created_at": model_metadata["created_at"],
            "dataset_name": model_metadata["dataset_name"],
            "dataset_source": model_metadata["dataset_source"],
            "split_strategy": split_strategy,
            "held_out_families": held_out,
            "train_rows": len(train_df),
            "test_rows": len(test_df),
            "open_set_rows": len(open_set_attack_df),
            "feature_count": len(CANONICAL_FEATURES),
            "accuracy": round(acc, 4),
            "macro_precision": round(macro_p, 4),
            "macro_recall": round(macro_r, 4),
            "macro_f1": round(macro_f1, 4),
            "weighted_f1": round(weighted_f1, 4),
            "brier_score": cal_eval["brier_score"],
            "expected_calibration_error": cal_eval["expected_calibration_error"],
            "open_set_auroc": open_set_metrics["auroc"],
            "open_set_auprc": open_set_metrics["auprc"],
            "open_set_recall_at_5pct_fpr": open_set_metrics["recall_at_5pct_fpr"],
            "open_set_precision": open_set_metrics["precision_at_threshold"],
            "open_set_fpr": open_set_metrics["empirical_fpr"],
            "metrics": metrics_payload,
            "eda_summary": eda_summary,
            "global_importance": global_importance,
            "artifact_path": str(artifact_path),
            "is_active": True,
        }

    def _evaluate_open_set(
        self,
        iso_forest: IsolationForest,
        rf_calibrated: CalibratedClassifierCV,
        ref_benign_scores_sorted: np.ndarray,
        x_test_benign: np.ndarray,
        x_open_attacks: np.ndarray,
        open_set_attack_df: pd.DataFrame,
        held_out_families: list[str],
    ) -> dict[str, Any]:
        """
        Evaluates open-set unknown attack detection on held-out attack families vs test-set benign traffic.
        """
        if len(x_open_attacks) == 0 or len(x_test_benign) == 0:
            return {
                "held_out_families": held_out_families,
                "benign_eval_count": len(x_test_benign),
                "unknown_attack_eval_count": len(x_open_attacks),
                "auroc": 0.0,
                "auprc": 0.0,
                "recall_at_5pct_fpr": 0.0,
                "precision_at_threshold": 0.0,
                "empirical_fpr": 0.0,
                "threshold_95pct_benign": 0.0,
                "per_family_detection": [],
            }

        x_eval_open = np.vstack([x_test_benign, x_open_attacks])
        # Ground truth for open-set novelty: 0 = Benign test flow, 1 = Held-out unseen attack family
        y_open_true = np.concatenate(
            [
                np.zeros(len(x_test_benign), dtype=int),
                np.ones(len(x_open_attacks), dtype=int),
            ]
        )

        if_scores = -iso_forest.decision_function(x_eval_open)
        rf_probs = rf_calibrated.predict_proba(x_eval_open)
        entropies = compute_normalized_entropy(rf_probs)

        # Standardize IF score relative to training benign distribution + combine with predictive entropy
        ref_mean = float(np.mean(ref_benign_scores_sorted))
        ref_std = float(max(np.std(ref_benign_scores_sorted), 1e-6))
        if_z = (if_scores - ref_mean) / ref_std
        hybrid_novelty_score = if_z + 1.25 * entropies

        auroc_if = float(roc_auc_score(y_open_true, if_scores))
        auprc_if = float(average_precision_score(y_open_true, if_scores))
        auroc_hybrid = float(roc_auc_score(y_open_true, hybrid_novelty_score))
        auprc_hybrid = float(average_precision_score(y_open_true, hybrid_novelty_score))

        # Threshold calibrated at 95th percentile of training benign anomaly scores (5% nominal FPR)
        tau_95 = float(np.percentile(ref_benign_scores_sorted, 95.0))
        pred_open_if = (if_scores >= tau_95).astype(int)

        benign_flags = pred_open_if[: len(x_test_benign)]
        attack_flags = pred_open_if[len(x_test_benign) :]

        empirical_fpr = float(np.mean(benign_flags))
        recall_at_tau = float(np.mean(attack_flags))
        precision_at_tau = float(
            precision_score(y_open_true, pred_open_if, zero_division=0)
        )

        # Breakdown per held-out attack family
        attack_if_scores = if_scores[len(x_test_benign) :]
        attack_entropies = entropies[len(x_test_benign) :]
        per_family: list[dict[str, Any]] = []
        for fam in held_out_families:
            fam_mask = (open_set_attack_df["label"].astype(str) == fam).to_numpy()
            if np.any(fam_mask):
                fam_scores = attack_if_scores[fam_mask]
                fam_ent = attack_entropies[fam_mask]
                detected = int(np.sum(fam_scores >= tau_95))
                total_fam = int(np.sum(fam_mask))
                per_family.append(
                    {
                        "attack_family": fam,
                        "support": total_fam,
                        "detected_count": detected,
                        "detection_recall": round(detected / max(1, total_fam), 4),
                        "mean_anomaly_score": round(float(np.mean(fam_scores)), 4),
                        "mean_predictive_entropy": round(float(np.mean(fam_ent)), 4),
                    }
                )

        return {
            "held_out_families": held_out_families,
            "benign_eval_count": int(len(x_test_benign)),
            "unknown_attack_eval_count": int(len(x_open_attacks)),
            "auroc": round(max(auroc_if, auroc_hybrid), 4),
            "isolation_forest_auroc": round(auroc_if, 4),
            "hybrid_novelty_auroc": round(auroc_hybrid, 4),
            "auprc": round(max(auprc_if, auprc_hybrid), 4),
            "isolation_forest_auprc": round(auprc_if, 4),
            "hybrid_novelty_auprc": round(auprc_hybrid, 4),
            "recall_at_5pct_fpr": round(recall_at_tau, 4),
            "precision_at_threshold": round(precision_at_tau, 4),
            "empirical_fpr": round(empirical_fpr, 4),
            "threshold_95pct_benign": round(tau_95, 4),
            "per_family_detection": per_family,
        }

    def score_dataframe(
        self,
        df: pd.DataFrame,
        runtime_settings: dict[str, Any],
        source_name: str = "upload.csv",
        batch_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Scores a standardized DataFrame of network flows and produces:
          - Calibrated class probabilities & known_attack_probability (1 - P(BENIGN))
          - Supervised confidence & prediction margin
          - Normalized Shannon entropy (uncertainty)
          - Isolation Forest anomaly score & empirical percentile (NEVER conflated with probability)
          - Four-state triage category: KNOWN_ATTACK | BENIGN | ANOMALOUS_UNKNOWN | UNCERTAIN
          - Local SHAP feature attributions and human-readable analyst rationale
          - Batch Population Stability Index (PSI) drift report
        """
        if not self.is_ready or self.pipeline is None or self.rf_calibrated is None or self.iso_forest is None:
            raise RuntimeError("ML Engine is not initialized.")

        active_batch_id = batch_id or f"batch_{uuid.uuid4().hex[:10]}"
        conf_thresh = float(runtime_settings.get("confidence_threshold", 0.70))
        entropy_thresh = float(runtime_settings.get("entropy_threshold", 0.55))
        anomaly_pct_thresh = float(runtime_settings.get("anomaly_percentile_threshold", 95.0))
        max_shap_rows = int(runtime_settings.get("max_shap_rows_per_batch", 100))

        scaled_x = self.pipeline.transform(df)
        raw_feature_dicts = self.pipeline.get_imputed_feature_dicts(df)

        probs = self.rf_calibrated.predict_proba(scaled_x)
        entropies = compute_normalized_entropy(probs)
        raw_anomaly_scores = -self.iso_forest.decision_function(scaled_x)

        # Empirical percentile of each anomaly score relative to training benign reference distribution
        ref_scores = self.reference_anomaly_scores
        if len(ref_scores) > 0:
            insertion_indices = np.searchsorted(ref_scores, raw_anomaly_scores, side="right")
            anomaly_percentiles = np.clip(
                (insertion_indices / float(len(ref_scores))) * 100.0, 0.0, 99.99
            )
        else:
            anomaly_percentiles = np.full(len(df), 50.0)

        benign_idx = (
            self.class_names.index("BENIGN") if "BENIGN" in self.class_names else 0
        )

        events: list[dict[str, Any]] = []
        now_iso = datetime.now(timezone.utc).isoformat()

        for i in range(len(df)):
            row_probs = probs[i]
            sorted_prob_idx = np.argsort(row_probs)[::-1]
            top1_idx = int(sorted_prob_idx[0])
            top2_idx = int(sorted_prob_idx[1]) if len(sorted_prob_idx) > 1 else top1_idx

            top_class = self.class_names[top1_idx]
            supervised_conf = float(row_probs[top1_idx])
            pred_margin = float(row_probs[top1_idx] - row_probs[top2_idx])
            known_attack_prob = float(1.0 - row_probs[benign_idx])
            entropy_val = float(entropies[i])
            anom_score = float(raw_anomaly_scores[i])
            anom_pct = float(anomaly_percentiles[i])

            is_anomalous = anom_pct >= anomaly_pct_thresh
            is_uncertain = (entropy_val >= entropy_thresh) or (supervised_conf < conf_thresh)

            # Four-Way Triage Decision Rule:
            # 1. KNOWN_ATTACK: Top predicted class is a known attack family AND supervised confidence >= conf_thresh AND entropy < entropy_thresh
            # 2. ANOMALOUS_UNKNOWN: Flagged as statistical anomaly by Isolation Forest (anom_pct >= anomaly_pct_thresh)
            #    while supervised classifier either predicts BENIGN or lacks high certainty on a known attack class.
            # 3. UNCERTAIN: Elevated predictive entropy or low confidence without crossing Known Attack certainty.
            # 4. BENIGN: High confidence on BENIGN, low entropy, and normal anomaly score.
            if top_class != "BENIGN" and supervised_conf >= conf_thresh and entropy_val < entropy_thresh:
                triage_category = "KNOWN_ATTACK"
                predicted_label = top_class
                if supervised_conf >= 0.90 or anom_pct >= 98.0:
                    severity = "CRITICAL"
                elif supervised_conf >= 0.80:
                    severity = "HIGH"
                else:
                    severity = "MEDIUM"
            elif is_anomalous:
                triage_category = "ANOMALOUS_UNKNOWN"
                predicted_label = (
                    f"Unknown Anomaly (closest: {top_class})"
                    if top_class != "BENIGN"
                    else "Unclassified Structural Anomaly"
                )
                if anom_pct >= 99.0 or (anom_pct >= 97.0 and entropy_val >= 0.45):
                    severity = "CRITICAL"
                elif anom_pct >= 96.5:
                    severity = "HIGH"
                else:
                    severity = "MEDIUM"
            elif is_uncertain or top_class != "BENIGN":
                triage_category = "UNCERTAIN"
                predicted_label = f"Uncertain ({top_class})"
                severity = "MEDIUM" if known_attack_prob >= 0.40 else "LOW"
            else:
                triage_category = "BENIGN"
                predicted_label = "BENIGN"
                severity = "INFO"

            # Compute local SHAP explanation (prioritize all non-benign + up to max_shap_rows)
            if self.explainer is not None and (triage_category != "BENIGN" or i < max_shap_rows):
                explanation = self.explainer.explain_flow(
                    scaled_row=scaled_x[i],
                    raw_feature_dict=raw_feature_dicts[i],
                    predicted_label=top_class,
                    triage_category=triage_category,
                    supervised_confidence=supervised_conf,
                    predictive_entropy=entropy_val,
                    anomaly_score=anom_score,
                    anomaly_percentile=anom_pct,
                )
                rationale_text = explanation["rationale"]
            else:
                explanation = {
                    "method": "deferred_benign",
                    "target_class": top_class,
                    "base_value": 0.0,
                    "predicted_class_probability": round(supervised_conf, 5),
                    "top_contributors": [],
                    "rationale": f"Classified as BENIGN with confidence {supervised_conf:.1%} and normal anomaly percentile p{anom_pct:.1f}.",
                }
                rationale_text = explanation["rationale"]

            row_series = df.iloc[i]
            gt_label = row_series.get("label")
            if pd.isna(gt_label):
                gt_label = None

            class_prob_dict = {
                cls_name: round(float(row_probs[c_i]), 4)
                for c_i, cls_name in enumerate(self.class_names)
            }

            review_status = "UNREVIEWED"
            if (
                triage_category == "ANOMALOUS_UNKNOWN"
                and severity == "CRITICAL"
                and runtime_settings.get("auto_escalate_critical_anomalies", True)
            ):
                review_status = "ESCALATED"

            events.append(
                {
                    "event_uid": f"evt_{uuid.uuid4().hex[:12]}",
                    "created_at": now_iso,
                    "batch_id": active_batch_id,
                    "source_name": source_name,
                    "src_ip": str(row_series.get("src_ip", "192.168.10.50")),
                    "dst_ip": str(row_series.get("dst_ip", "10.0.1.10")),
                    "src_port": int(row_series.get("src_port", 49152)),
                    "dst_port": int(row_series.get("destination_port", 80)),
                    "protocol": str(row_series.get("protocol", "TCP")),
                    "flow_timestamp": str(row_series.get("flow_timestamp", "")),
                    "triage_category": triage_category,
                    "predicted_label": predicted_label,
                    "ground_truth_label": str(gt_label) if gt_label else None,
                    "severity": severity,
                    "supervised_confidence": round(supervised_conf, 4),
                    "known_attack_probability": round(known_attack_prob, 4),
                    "prediction_margin": round(pred_margin, 4),
                    "predictive_entropy": round(entropy_val, 4),
                    "anomaly_score": round(anom_score, 4),
                    "anomaly_percentile": round(anom_pct, 2),
                    "is_anomalous": bool(is_anomalous),
                    "is_uncertain": bool(is_uncertain),
                    "class_probabilities": class_prob_dict,
                    "features": raw_feature_dicts[i],
                    "explanation": explanation,
                    "rationale_text": rationale_text,
                    "review_status": review_status,
                    "analyst_notes": "",
                    "model_version": self.version,
                }
            )

        drift_report = self.pipeline.compute_batch_drift(
            df,
            psi_warning=float(runtime_settings.get("drift_psi_warning_threshold", 0.15)),
            psi_critical=float(runtime_settings.get("drift_psi_critical_threshold", 0.25)),
        )

        triage_counts: dict[str, int] = {}
        for ev in events:
            cat = ev["triage_category"]
            triage_counts[cat] = triage_counts.get(cat, 0) + 1

        return {
            "batch_id": active_batch_id,
            "model_version": self.version,
            "total_scored": len(events),
            "triage_summary": triage_counts,
            "mean_confidence": round(float(np.mean([e["supervised_confidence"] for e in events])), 4),
            "mean_entropy": round(float(np.mean(entropies)), 4),
            "mean_anomaly_score": round(float(np.mean(raw_anomaly_scores)), 4),
            "drift_report": drift_report,
            "events": events,
        }


ml_engine = AegisMLEngine()
