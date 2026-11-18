"""Leakage-free feature engineering pipeline and Population Stability Index (PSI) drift detector."""
from __future__ import annotations

from typing import Any
import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import RobustScaler

from app.ml.schema import CANONICAL_FEATURES


class FlowFeaturePipeline:
    """
    Leakage-free feature preprocessor fitted strictly on the training set.
    Performs:
      1. Canonical feature ordering (strictly excluding IP/FlowID/Timestamp identifiers).
      2. Training-median imputation for missing/infinite values.
      3. Training-quantile winsorization (0.1% to 99.9%) to prevent extreme packet-rate outliers from distorting scaling.
      4. RobustScaler (median and IQR scaling) fitted on training data only.
      5. Reference decile histogram construction for Population Stability Index (PSI) drift monitoring.
    """

    def __init__(self, feature_names: list[str] | None = None) -> None:
        self.feature_names: list[str] = list(feature_names or CANONICAL_FEATURES)
        self.imputer = SimpleImputer(strategy="median")
        self.scaler = RobustScaler(quantile_range=(25.0, 75.0))
        self.lower_bounds_: np.ndarray | None = None
        self.upper_bounds_: np.ndarray | None = None
        self.medians_: dict[str, float] = {}
        self.iqrs_: dict[str, float] = {}
        self.reference_bins_: dict[str, np.ndarray] = {}
        self.reference_hist_: dict[str, np.ndarray] = {}
        self.is_fitted: bool = False

    def _extract_raw_matrix(self, df: pd.DataFrame) -> np.ndarray:
        mat = np.zeros((len(df), len(self.feature_names)), dtype=np.float64)
        for idx, col in enumerate(self.feature_names):
            if col in df.columns:
                vals = pd.to_numeric(df[col], errors="coerce").to_numpy(dtype=np.float64)
                vals = np.where(np.isinf(vals), np.nan, vals)
                mat[:, idx] = vals
            else:
                mat[:, idx] = np.nan
        return mat

    def fit(self, train_df: pd.DataFrame) -> "FlowFeaturePipeline":
        raw_x = self._extract_raw_matrix(train_df)
        imputed_x = self.imputer.fit_transform(raw_x)

        self.lower_bounds_ = np.percentile(imputed_x, 0.1, axis=0)
        self.upper_bounds_ = np.percentile(imputed_x, 99.9, axis=0)
        clipped_x = np.clip(imputed_x, self.lower_bounds_, self.upper_bounds_)

        self.scaler.fit(clipped_x)

        for idx, feat in enumerate(self.feature_names):
            col_vals = clipped_x[:, idx]
            self.medians_[feat] = float(np.median(col_vals))
            q75, q25 = np.percentile(col_vals, [75.0, 25.0])
            self.iqrs_[feat] = float(max(q75 - q25, 1e-6))

            # Construct 10-bin reference distribution for PSI drift tracking
            quantiles = np.linspace(0, 100, 11)
            edges = np.unique(np.percentile(col_vals, quantiles))
            if len(edges) < 3:
                edges = np.array([col_vals.min() - 1.0, col_vals.mean(), col_vals.max() + 1.0])
            edges[0] = -np.inf
            edges[-1] = np.inf
            counts, _ = np.histogram(col_vals, bins=edges)
            probs = (counts + 1e-4) / (len(col_vals) + 1e-4 * len(counts))
            self.reference_bins_[feat] = edges
            self.reference_hist_[feat] = probs

        self.is_fitted = True
        return self

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        if not self.is_fitted or self.lower_bounds_ is None or self.upper_bounds_ is None:
            raise RuntimeError("FlowFeaturePipeline must be fitted on training data before transform().")
        raw_x = self._extract_raw_matrix(df)
        imputed_x = self.imputer.transform(raw_x)
        clipped_x = np.clip(imputed_x, self.lower_bounds_, self.upper_bounds_)
        scaled_x = self.scaler.transform(clipped_x)
        return np.asarray(scaled_x, dtype=np.float64)

    def fit_transform(self, train_df: pd.DataFrame) -> np.ndarray:
        return self.fit(train_df).transform(train_df)

    def get_imputed_feature_dicts(self, df: pd.DataFrame) -> list[dict[str, float]]:
        """Returns clean, human-readable (unscaled, imputed) feature dictionaries for each flow."""
        raw_x = self._extract_raw_matrix(df)
        imputed_x = self.imputer.transform(raw_x) if self.is_fitted else np.nan_to_num(raw_x, nan=0.0)
        records: list[dict[str, float]] = []
        for row in imputed_x:
            records.append(
                {feat: round(float(row[i]), 4) for i, feat in enumerate(self.feature_names)}
            )
        return records

    def compute_batch_drift(
        self, df: pd.DataFrame, psi_warning: float = 0.15, psi_critical: float = 0.25
    ) -> dict[str, Any]:
        """
        Computes Population Stability Index (PSI) per feature comparing incoming batch
        against the training reference distribution:
            PSI = sum( (p_actual - p_expected) * ln(p_actual / p_expected) )
        """
        if not self.is_fitted or len(df) == 0:
            return {
                "psi_max": 0.0,
                "psi_mean": 0.0,
                "drifted_features_count": 0,
                "details": [],
            }

        raw_x = self._extract_raw_matrix(df)
        imputed_x = self.imputer.transform(raw_x)
        clipped_x = np.clip(imputed_x, self.lower_bounds_, self.upper_bounds_)

        feature_drift_list: list[dict[str, Any]] = []
        for idx, feat in enumerate(self.feature_names):
            col_vals = clipped_x[:, idx]
            edges = self.reference_bins_[feat]
            ref_probs = self.reference_hist_[feat]
            counts, _ = np.histogram(col_vals, bins=edges)
            act_probs = (counts + 1e-4) / (len(col_vals) + 1e-4 * len(counts))

            psi_val = float(np.sum((act_probs - ref_probs) * np.log(act_probs / ref_probs)))
            psi_val = max(0.0, round(psi_val, 4))

            status = "STABLE"
            if psi_val >= psi_critical:
                status = "CRITICAL_DRIFT"
            elif psi_val >= psi_warning:
                status = "MODERATE_DRIFT"

            feature_drift_list.append(
                {
                    "feature": feat,
                    "psi": psi_val,
                    "status": status,
                    "train_median": round(self.medians_[feat], 3),
                    "batch_median": round(float(np.median(col_vals)), 3),
                }
            )

        feature_drift_list.sort(key=lambda x: x["psi"], reverse=True)
        psi_values = [item["psi"] for item in feature_drift_list]
        drifted_count = sum(1 for item in feature_drift_list if item["status"] != "STABLE")

        return {
            "psi_max": round(float(max(psi_values)) if psi_values else 0.0, 4),
            "psi_mean": round(float(np.mean(psi_values)) if psi_values else 0.0, 4),
            "drifted_features_count": drifted_count,
            "details": feature_drift_list[:12],
        }
