"""
Global and Local Explainability Engine for AegisNet.

Uses `shap.TreeExplainer` when the `shap` library is installed, and falls back seamlessly to
exact additive decision-path tree attribution (`ExactTreePathExplainer`, Saabas/TreeSHAP path
decomposition across all trees in the RandomForestClassifier) so that local feature attributions
always satisfy the exact additivity property:
    base_value + sum(feature_contributions) == model_class_probability(x)
"""
from __future__ import annotations

from typing import Any
import numpy as np
from sklearn.ensemble import RandomForestClassifier

from app.ml.schema import FEATURE_DESCRIPTIONS

try:
    import shap  # type: ignore

    HAS_SHAP_LIB = True
except Exception:
    HAS_SHAP_LIB = False


class AegisExplainer:
    """Computes global and local SHAP feature attributions and human-readable analyst rationales."""

    def __init__(
        self,
        rf_model: RandomForestClassifier,
        feature_names: list[str],
        class_names: list[str],
        train_medians: dict[str, float],
        train_iqrs: dict[str, float],
        background_x: np.ndarray | None = None,
    ) -> None:
        self.rf_model = rf_model
        self.feature_names = list(feature_names)
        self.class_names = list(class_names)
        self.train_medians = dict(train_medians)
        self.train_iqrs = dict(train_iqrs)
        self.explainer_backend = "exact_tree_path_shap"
        self._shap_explainer: Any = None

        if HAS_SHAP_LIB:
            try:
                bg = background_x[:80] if background_x is not None and len(background_x) > 0 else None
                self._shap_explainer = shap.TreeExplainer(self.rf_model, data=bg)
                self.explainer_backend = "shap.TreeExplainer"
            except Exception:
                self._shap_explainer = None
                self.explainer_backend = "exact_tree_path_shap"

    def compute_global_importance(self, x_eval: np.ndarray | None = None) -> list[dict[str, Any]]:
        """
        Computes global feature importance combining Gini impurity reduction and
        mean absolute local SHAP attribution across an evaluation sample.
        """
        gini_imp = np.asarray(self.rf_model.feature_importances_, dtype=np.float64)
        if x_eval is not None and len(x_eval) > 0:
            sample_x = x_eval[: min(60, len(x_eval))]
            pred_classes = self.rf_model.predict(sample_x)
            class_to_idx = {c: i for i, c in enumerate(self.class_names)}
            abs_shap_accum = np.zeros(len(self.feature_names), dtype=np.float64)
            for row_i in range(len(sample_x)):
                c_idx = class_to_idx.get(str(pred_classes[row_i]), 0)
                phis, _ = self._compute_single_shap_vector(sample_x[row_i], c_idx)
                abs_shap_accum += np.abs(phis)
            mean_abs_shap = abs_shap_accum / len(sample_x)
        else:
            mean_abs_shap = gini_imp.copy()

        items: list[dict[str, Any]] = []
        for idx, feat in enumerate(self.feature_names):
            items.append(
                {
                    "feature": feat,
                    "description": FEATURE_DESCRIPTIONS.get(feat, feat),
                    "mean_abs_shap": round(float(mean_abs_shap[idx]), 5),
                    "gini_importance": round(float(gini_imp[idx]), 5),
                    "train_median": round(float(self.train_medians.get(feat, 0.0)), 3),
                }
            )
        items.sort(key=lambda d: d["mean_abs_shap"], reverse=True)
        for rank, item in enumerate(items, start=1):
            item["rank"] = rank
        return items

    def _compute_single_shap_vector(
        self, x_row: np.ndarray, target_class_idx: int
    ) -> tuple[np.ndarray, float]:
        """Returns (shap_values_for_class, base_value_for_class) for a single scaled feature row."""
        row_2d = np.asarray(x_row, dtype=np.float32).reshape(1, -1)

        if self._shap_explainer is not None:
            try:
                raw_sv = self._shap_explainer.shap_values(row_2d, check_additivity=False)
                ev = self._shap_explainer.expected_value
                if isinstance(raw_sv, list):
                    sv_vec = np.asarray(raw_sv[target_class_idx][0], dtype=np.float64)
                elif raw_sv.ndim == 3:
                    sv_vec = np.asarray(raw_sv[0, :, target_class_idx], dtype=np.float64)
                else:
                    sv_vec = np.asarray(raw_sv[0], dtype=np.float64)

                if isinstance(ev, (list, np.ndarray)) and len(ev) > target_class_idx:
                    base_val = float(ev[target_class_idx])
                else:
                    base_val = float(ev)
                return sv_vec, base_val
            except Exception:
                pass

        # Exact additive decision-path attribution across all trees in the Random Forest
        n_features = len(self.feature_names)
        contributions = np.zeros(n_features, dtype=np.float64)
        base_sum = 0.0
        estimators = self.rf_model.estimators_

        for tree_est in estimators:
            tree = tree_est.tree_
            node_totals = tree.value.sum(axis=2, keepdims=True)
            node_probs = np.divide(
                tree.value,
                node_totals,
                out=np.zeros_like(tree.value, dtype=np.float64),
                where=node_totals > 0,
            )[:, 0, target_class_idx]

            base_sum += float(node_probs[0])
            node_indicator = tree.decision_path(row_2d)
            path_nodes = node_indicator.indices

            for step in range(len(path_nodes) - 1):
                curr_node = path_nodes[step]
                next_node = path_nodes[step + 1]
                feat_idx = int(tree.feature[curr_node])
                if feat_idx >= 0:
                    delta = float(node_probs[next_node] - node_probs[curr_node])
                    contributions[feat_idx] += delta

        n_trees = max(1, len(estimators))
        return contributions / n_trees, base_sum / n_trees

    def explain_flow(
        self,
        scaled_row: np.ndarray,
        raw_feature_dict: dict[str, float],
        predicted_label: str,
        triage_category: str,
        supervised_confidence: float,
        predictive_entropy: float,
        anomaly_score: float,
        anomaly_percentile: float,
        top_k: int = 8,
    ) -> dict[str, Any]:
        """Generates local SHAP explanation and human-readable analyst rationale for a single flow."""
        if predicted_label in self.class_names:
            target_idx = self.class_names.index(predicted_label)
        else:
            target_idx = 0

        phis, base_value = self._compute_single_shap_vector(scaled_row, target_idx)

        contributors: list[dict[str, Any]] = []
        for idx, feat in enumerate(self.feature_names):
            val = float(raw_feature_dict.get(feat, 0.0))
            med = float(self.train_medians.get(feat, 0.0))
            iqr = float(self.train_iqrs.get(feat, 1.0))
            z_robust = (val - med) / max(iqr, 1e-6)
            shap_val = float(phis[idx])

            contributors.append(
                {
                    "feature": feat,
                    "description": FEATURE_DESCRIPTIONS.get(feat, feat),
                    "feature_value": round(val, 4),
                    "train_median": round(med, 4),
                    "robust_z_score": round(z_robust, 2),
                    "shap_value": round(shap_val, 5),
                    "abs_shap": round(abs(shap_val), 5),
                    "direction": "INCREASES_PROBABILITY" if shap_val >= 0 else "DECREASES_PROBABILITY",
                }
            )

        contributors.sort(key=lambda x: x["abs_shap"], reverse=True)
        top_contributors = contributors[:top_k]

        top_pos = [c for c in top_contributors if c["shap_value"] > 0][:3]
        driver_clauses = [
            f"{c['feature']}={c['feature_value']} (baseline median {c['train_median']}, SHAP {c['shap_value']:+.3f})"
            for c in (top_pos if top_pos else top_contributors[:3])
        ]
        drivers_str = "; ".join(driver_clauses)

        if triage_category == "KNOWN_ATTACK":
            rationale = (
                f"Classified as known attack family '{predicted_label}' with calibrated confidence "
                f"{supervised_confidence:.1%} (entropy {predictive_entropy:.3f}). Primary feature drivers: {drivers_str}."
            )
        elif triage_category == "ANOMALOUS_UNKNOWN":
            by_dev = sorted(contributors, key=lambda c: abs(c["robust_z_score"]), reverse=True)[:3]
            dev_str = ", ".join(
                f"{c['feature']}={c['feature_value']} ({c['robust_z_score']:+.1f} IQR vs baseline)"
                for c in by_dev
            )
            rationale = (
                f"Flagged as ANOMALOUS_UNKNOWN: Isolation Forest anomaly score {anomaly_score:.3f} "
                f"(p{anomaly_percentile:.1f} vs benign baseline) exceeds threshold while supervised model "
                f"shows low certainty or benign projection (top class '{predicted_label}' @ {supervised_confidence:.1%}, "
                f"entropy {predictive_entropy:.3f}). Strongest structural deviations: {dev_str}. "
                f"Note: Anomaly score indicates statistical deviation from benign baseline, not a calibrated zero-day probability."
            )
        elif triage_category == "UNCERTAIN":
            rationale = (
                f"Marked UNCERTAIN for analyst review: high predictive entropy ({predictive_entropy:.3f}) "
                f"or insufficient class margin on closest known class '{predicted_label}' ({supervised_confidence:.1%}). "
                f"Influential features: {drivers_str}."
            )
        else:
            rationale = (
                f"Classified as BENIGN traffic with calibrated confidence {supervised_confidence:.1%}, "
                f"low predictive entropy ({predictive_entropy:.3f}), and normal anomaly score "
                f"({anomaly_score:.3f}, p{anomaly_percentile:.1f}). Supporting attributes: {drivers_str}."
            )

        return {
            "method": self.explainer_backend,
            "target_class": predicted_label,
            "base_value": round(base_value, 5),
            "predicted_class_probability": round(
                float(base_value + float(np.sum(phis))), 5
            ),
            "top_contributors": top_contributors,
            "rationale": rationale,
        }
