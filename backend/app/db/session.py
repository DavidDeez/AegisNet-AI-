"""Database session and connection management supporting SQLite (native & SQLAlchemy) and PostgreSQL."""
from __future__ import annotations

import sqlite3
from collections.abc import Generator
from pathlib import Path
from typing import Any

from app.core.config import settings

try:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import DeclarativeBase, sessionmaker

    HAS_SQLALCHEMY = True
except ImportError:
    HAS_SQLALCHEMY = False
    DeclarativeBase = object  # type: ignore[misc,assignment]


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS network_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_uid TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL,
    batch_id TEXT NOT NULL DEFAULT 'single',
    source_name TEXT NOT NULL DEFAULT 'manual_upload',
    src_ip TEXT NOT NULL DEFAULT '0.0.0.0',
    dst_ip TEXT NOT NULL DEFAULT '0.0.0.0',
    src_port INTEGER NOT NULL DEFAULT 0,
    dst_port INTEGER NOT NULL DEFAULT 0,
    protocol TEXT NOT NULL DEFAULT 'TCP',
    flow_timestamp TEXT NOT NULL DEFAULT '',
    triage_category TEXT NOT NULL,
    predicted_label TEXT NOT NULL,
    ground_truth_label TEXT,
    severity TEXT NOT NULL,
    supervised_confidence REAL NOT NULL,
    known_attack_probability REAL NOT NULL,
    prediction_margin REAL NOT NULL,
    predictive_entropy REAL NOT NULL,
    anomaly_score REAL NOT NULL,
    anomaly_percentile REAL NOT NULL,
    is_anomalous INTEGER NOT NULL DEFAULT 0,
    is_uncertain INTEGER NOT NULL DEFAULT 0,
    class_probabilities_json TEXT NOT NULL DEFAULT '{}',
    features_json TEXT NOT NULL DEFAULT '{}',
    explanation_json TEXT NOT NULL DEFAULT '{}',
    rationale_text TEXT NOT NULL DEFAULT '',
    review_status TEXT NOT NULL DEFAULT 'UNREVIEWED',
    analyst_notes TEXT NOT NULL DEFAULT '',
    model_version TEXT NOT NULL DEFAULT 'v1.0.0'
);

CREATE INDEX IF NOT EXISTS idx_events_created_at ON network_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_triage ON network_events(triage_category);
CREATE INDEX IF NOT EXISTS idx_events_label ON network_events(predicted_label);
CREATE INDEX IF NOT EXISTS idx_events_severity ON network_events(severity);
CREATE INDEX IF NOT EXISTS idx_events_review ON network_events(review_status);

CREATE TABLE IF NOT EXISTS model_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL,
    dataset_name TEXT NOT NULL,
    dataset_source TEXT NOT NULL,
    split_strategy TEXT NOT NULL,
    held_out_families_json TEXT NOT NULL DEFAULT '[]',
    train_rows INTEGER NOT NULL,
    test_rows INTEGER NOT NULL,
    open_set_rows INTEGER NOT NULL DEFAULT 0,
    feature_count INTEGER NOT NULL,
    accuracy REAL NOT NULL,
    macro_precision REAL NOT NULL,
    macro_recall REAL NOT NULL,
    macro_f1 REAL NOT NULL,
    weighted_f1 REAL NOT NULL,
    brier_score REAL NOT NULL DEFAULT 0.0,
    expected_calibration_error REAL NOT NULL DEFAULT 0.0,
    open_set_auroc REAL NOT NULL DEFAULT 0.0,
    open_set_auprc REAL NOT NULL DEFAULT 0.0,
    open_set_recall_at_5pct_fpr REAL NOT NULL DEFAULT 0.0,
    open_set_precision REAL NOT NULL DEFAULT 0.0,
    open_set_fpr REAL NOT NULL DEFAULT 0.0,
    metrics_json TEXT NOT NULL DEFAULT '{}',
    eda_summary_json TEXT NOT NULL DEFAULT '{}',
    global_importance_json TEXT NOT NULL DEFAULT '[]',
    artifact_path TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS inference_telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    record_count INTEGER NOT NULL DEFAULT 1,
    latency_ms REAL NOT NULL,
    status_code INTEGER NOT NULL DEFAULT 200,
    error_message TEXT,
    drift_psi_max REAL NOT NULL DEFAULT 0.0,
    drift_psi_mean REAL NOT NULL DEFAULT 0.0,
    drifted_features_count INTEGER NOT NULL DEFAULT 0,
    drift_details_json TEXT NOT NULL DEFAULT '[]',
    mean_entropy REAL NOT NULL DEFAULT 0.0,
    mean_anomaly_score REAL NOT NULL DEFAULT 0.0
);

CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON inference_telemetry(created_at DESC);

CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def resolve_sqlite_path(db_url: str | None = None) -> Path:
    url = db_url or settings.database_url
    if url.startswith("sqlite:///"):
        raw_path = url.replace("sqlite:///", "", 1)
        path = Path(raw_path)
        if not path.is_absolute():
            path = (settings.data_dir.parent / path).resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        return path
    return settings.data_dir / "aegisnet.db"


def get_sqlite_connection(db_path: Path | None = None) -> sqlite3.Connection:
    target = db_path or resolve_sqlite_path()
    conn = sqlite3.connect(str(target), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Path | None = None) -> None:
    conn = get_sqlite_connection(db_path)
    try:
        conn.executescript(SCHEMA_SQL)
        conn.commit()
    finally:
        conn.close()


def get_db() -> Generator[sqlite3.Connection, None, None]:
    conn = get_sqlite_connection()
    try:
        yield conn
    finally:
        conn.close()
