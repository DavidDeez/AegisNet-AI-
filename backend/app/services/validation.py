"""Data validation, sanitization, and schema verification for CSV uploads and live flow records."""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from app.core.config import settings
from app.ml.schema import (
    CANONICAL_FEATURES,
    CICIDS2017_COLUMN_ALIASES,
    normalize_label,
)


class DataValidationError(ValueError):
    """Raised when uploaded data fails security or schema validation checks."""


@dataclass
class DataValidationReport:
    total_rows_received: int = 0
    valid_rows_retained: int = 0
    duplicate_rows_removed: int = 0
    missing_value_cells: int = 0
    infinite_value_cells: int = 0
    negative_duration_rows_fixed: int = 0
    recognized_features: list[str] = field(default_factory=list)
    missing_features_imputed: list[str] = field(default_factory=list)
    has_ground_truth_labels: bool = False
    class_distribution: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_rows_received": self.total_rows_received,
            "valid_rows_retained": self.valid_rows_retained,
            "duplicate_rows_removed": self.duplicate_rows_removed,
            "missing_value_cells": self.missing_value_cells,
            "infinite_value_cells": self.infinite_value_cells,
            "negative_duration_rows_fixed": self.negative_duration_rows_fixed,
            "recognized_features": self.recognized_features,
            "missing_features_imputed": self.missing_features_imputed,
            "has_ground_truth_labels": self.has_ground_truth_labels,
            "class_distribution": self.class_distribution,
            "warnings": self.warnings,
        }


def validate_and_parse_csv_bytes(
    raw_bytes: bytes,
    filename: str = "upload.csv",
    deduplicate: bool = True,
    max_rows: int = 50000,
) -> tuple[pd.DataFrame, DataValidationReport]:
    """Validates file size, format, encoding, and parses CSV into canonical schema."""
    if not raw_bytes:
        raise DataValidationError("Uploaded file is empty.")

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(raw_bytes) > max_bytes:
        raise DataValidationError(
            f"File size ({len(raw_bytes) / (1024 * 1024):.2f} MB) exceeds maximum limit of {settings.max_upload_size_mb} MB."
        )

    lower_name = filename.lower().strip()
    if not lower_name.endswith(".csv"):
        raise DataValidationError(
            f"Unsupported file extension in '{filename}'. Only .csv network flow files are accepted."
        )

    # Reject binary payloads masquerading as CSV
    if b"\x00" in raw_bytes[:4096]:
        raise DataValidationError(
            "Binary content or null bytes detected; file is not a valid text CSV."
        )

    try:
        df = pd.read_csv(io.BytesIO(raw_bytes), low_memory=False)
    except Exception as exc:
        raise DataValidationError(f"Failed to parse CSV structure: {exc}") from exc

    if df.empty:
        raise DataValidationError("CSV contains headers but zero data records.")

    if len(df) > max_rows:
        df = df.iloc[:max_rows].copy()

    return standardize_and_validate_dataframe(df, deduplicate=deduplicate)


def standardize_and_validate_dataframe(
    df: pd.DataFrame, deduplicate: bool = True
) -> tuple[pd.DataFrame, DataValidationReport]:
    """Maps raw CIC-IDS2017 or canonical columns, handles NaN/Inf/duplicates, and validates types."""
    report = DataValidationReport(total_rows_received=len(df))
    work = df.copy()

    # 1. Normalize column headers (CIC-IDS2017 CSVs famously have leading spaces like ' Destination Port')
    rename_map: dict[str, str] = {}
    for col in work.columns:
        cleaned = str(col).strip().lower()
        if cleaned in CANONICAL_FEATURES:
            rename_map[col] = cleaned
        elif cleaned in CICIDS2017_COLUMN_ALIASES:
            rename_map[col] = CICIDS2017_COLUMN_ALIASES[cleaned]
        else:
            snake = cleaned.replace(" ", "_").replace("/", "_").replace("-", "_")
            if snake in CANONICAL_FEATURES:
                rename_map[col] = snake
    work = work.rename(columns=rename_map)

    recognized = [f for f in CANONICAL_FEATURES if f in work.columns]
    missing = [f for f in CANONICAL_FEATURES if f not in work.columns]
    report.recognized_features = recognized
    report.missing_features_imputed = missing

    if len(recognized) < 6:
        raise DataValidationError(
            f"Insufficient recognized network flow features ({len(recognized)}/{len(CANONICAL_FEATURES)}). "
            f"Expected CIC-IDS2017 or canonical flow attributes such as destination_port, flow_duration, total_fwd_packets, flow_bytes_s."
        )

    if missing:
        report.warnings.append(
            f"{len(missing)} canonical features were absent in input and will be median-imputed from training reference: {', '.join(missing[:6])}"
        )
        for m_col in missing:
            work[m_col] = np.nan

    # 2. Coerce all feature columns to numeric, counting Inf and NaN
    feature_block = work[CANONICAL_FEATURES].apply(pd.to_numeric, errors="coerce")
    inf_mask = np.isinf(feature_block.to_numpy(dtype=np.float64, na_value=0.0))
    report.infinite_value_cells = int(inf_mask.sum())
    if report.infinite_value_cells > 0:
        feature_block = feature_block.replace([np.inf, -np.inf], np.nan)
        report.warnings.append(
            f"Replaced {report.infinite_value_cells} Infinity/-Infinity cells (common in CIC-IDS2017 Flow Bytes/s & Flow Packets/s) with NaN for training-median imputation."
        )

    report.missing_value_cells = int(feature_block.isna().sum().sum())

    # 3. Physical sanity check: negative flow_duration
    neg_dur = feature_block["flow_duration"] < 0
    neg_count = int(neg_dur.sum())
    if neg_count > 0:
        report.negative_duration_rows_fixed = neg_count
        feature_block.loc[neg_dur, "flow_duration"] = 0.0
        report.warnings.append(
            f"Clamped {neg_count} negative flow_duration values to 0."
        )

    for col in CANONICAL_FEATURES:
        work[col] = feature_block[col]

    # 4. Safe metadata defaults
    if "src_ip" not in work.columns:
        work["src_ip"] = "192.168.10.50"
    else:
        work["src_ip"] = work["src_ip"].fillna("192.168.10.50").astype(str).str.slice(0, 64)

    if "dst_ip" not in work.columns:
        work["dst_ip"] = "10.0.1.10"
    else:
        work["dst_ip"] = work["dst_ip"].fillna("10.0.1.10").astype(str).str.slice(0, 64)

    if "src_port" not in work.columns:
        work["src_port"] = 49152
    else:
        work["src_port"] = pd.to_numeric(work["src_port"], errors="coerce").fillna(49152).astype(int)

    if "protocol" not in work.columns:
        work["protocol"] = np.where(work["destination_port"] == 53, "UDP", "TCP")
    else:
        work["protocol"] = work["protocol"].fillna("TCP").astype(str).str.upper().str.slice(0, 16)

    if "flow_timestamp" not in work.columns:
        work["flow_timestamp"] = ""
    else:
        work["flow_timestamp"] = work["flow_timestamp"].fillna("").astype(str).str.slice(0, 64)

    # 5. Ground-truth label normalization (if present)
    if "label" in work.columns:
        normalized_labels = [normalize_label(v) for v in work["label"].tolist()]
        work["label"] = normalized_labels
        valid_labels = [lbl for lbl in normalized_labels if lbl is not None]
        if valid_labels:
            report.has_ground_truth_labels = True
            vc = pd.Series(valid_labels).value_counts()
            report.class_distribution = {str(k): int(v) for k, v in vc.items()}

    # 6. Deduplication on canonical features (+ label if present)
    if deduplicate and len(work) > 1:
        dedup_cols = list(CANONICAL_FEATURES) + (["label"] if "label" in work.columns else [])
        before = len(work)
        work = work.drop_duplicates(subset=dedup_cols, keep="first").reset_index(drop=True)
        report.duplicate_rows_removed = before - len(work)
        if report.duplicate_rows_removed > 0:
            report.warnings.append(
                f"Removed {report.duplicate_rows_removed} exact duplicate network flow records."
            )

    report.valid_rows_retained = len(work)
    return work, report
