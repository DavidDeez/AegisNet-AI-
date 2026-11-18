"""SQLAlchemy ORM models for network events, model runs, monitoring, and system settings."""
from __future__ import annotations

from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class NetworkEvent(Base):
    """Persisted analyzed network flow record with uncertainty, anomaly score, and local SHAP explanation."""

    __tablename__ = "network_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    event_uid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    batch_id: Mapped[str] = mapped_column(String(64), index=True, default="single")
    source_name: Mapped[str] = mapped_column(String(128), default="manual_upload")

    # Flow metadata (kept for analyst context; NEVER fed into ML feature matrix)
    src_ip: Mapped[str] = mapped_column(String(64), default="0.0.0.0")
    dst_ip: Mapped[str] = mapped_column(String(64), default="0.0.0.0")
    src_port: Mapped[int] = mapped_column(Integer, default=0)
    dst_port: Mapped[int] = mapped_column(Integer, default=0)
    protocol: Mapped[str] = mapped_column(String(32), default="TCP")
    flow_timestamp: Mapped[str] = mapped_column(String(64), default="")

    # Core Decision & Taxonomy
    # triage_category in: KNOWN_ATTACK | BENIGN | ANOMALOUS_UNKNOWN | UNCERTAIN
    triage_category: Mapped[str] = mapped_column(String(32), index=True)
    predicted_label: Mapped[str] = mapped_column(String(64), index=True)
    ground_truth_label: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    severity: Mapped[str] = mapped_column(String(16), index=True)  # CRITICAL | HIGH | MEDIUM | LOW | INFO

    # Rigorous Separated Scores (Never conflated)
    supervised_confidence: Mapped[float] = mapped_column(Float)  # Top calibrated class probability [0, 1]
    known_attack_probability: Mapped[float] = mapped_column(Float)  # 1 - P(BENIGN) from calibrated classifier [0, 1]
    prediction_margin: Mapped[float] = mapped_column(Float)  # P(top1) - P(top2) [0, 1]
    predictive_entropy: Mapped[float] = mapped_column(Float)  # Normalized Shannon entropy [0, 1]
    anomaly_score: Mapped[float] = mapped_column(Float)  # Isolation Forest raw anomaly score (NOT a probability)
    anomaly_percentile: Mapped[float] = mapped_column(Float)  # Empirical percentile vs training benign baseline [0, 100]
    is_anomalous: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_uncertain: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    # JSON-serialized payloads
    class_probabilities_json: Mapped[str] = mapped_column(Text, default="{}")
    features_json: Mapped[str] = mapped_column(Text, default="{}")
    explanation_json: Mapped[str] = mapped_column(Text, default="{}")
    rationale_text: Mapped[str] = mapped_column(Text, default="")

    # Analyst Workflow
    review_status: Mapped[str] = mapped_column(
        String(32), default="UNREVIEWED", index=True
    )  # UNREVIEWED | CONFIRMED_THREAT | FALSE_POSITIVE | ESCALATED
    analyst_notes: Mapped[str] = mapped_column(Text, default="")
    model_version: Mapped[str] = mapped_column(String(64), default="v1.0.0")


class ModelRun(Base):
    """Stores reproducible ML training & evaluation metadata, closed-set metrics, and open-set results."""

    __tablename__ = "model_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    version: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    dataset_name: Mapped[str] = mapped_column(String(128))
    dataset_source: Mapped[str] = mapped_column(String(128))
    split_strategy: Mapped[str] = mapped_column(String(64))  # stratified | group_time_aware
    held_out_families_json: Mapped[str] = mapped_column(Text, default="[]")

    train_rows: Mapped[int] = mapped_column(Integer)
    test_rows: Mapped[int] = mapped_column(Integer)
    open_set_rows: Mapped[int] = mapped_column(Integer, default=0)
    feature_count: Mapped[int] = mapped_column(Integer)

    # Headline closed-set metrics
    accuracy: Mapped[float] = mapped_column(Float)
    macro_precision: Mapped[float] = mapped_column(Float)
    macro_recall: Mapped[float] = mapped_column(Float)
    macro_f1: Mapped[float] = mapped_column(Float)
    weighted_f1: Mapped[float] = mapped_column(Float)
    brier_score: Mapped[float] = mapped_column(Float, default=0.0)
    expected_calibration_error: Mapped[float] = mapped_column(Float, default=0.0)

    # Headline open-set (held-out attack family) metrics
    open_set_auroc: Mapped[float] = mapped_column(Float, default=0.0)
    open_set_auprc: Mapped[float] = mapped_column(Float, default=0.0)
    open_set_recall_at_5pct_fpr: Mapped[float] = mapped_column(Float, default=0.0)
    open_set_precision: Mapped[float] = mapped_column(Float, default=0.0)
    open_set_fpr: Mapped[float] = mapped_column(Float, default=0.0)

    # Full detailed artifacts JSON
    metrics_json: Mapped[str] = mapped_column(Text, default="{}")
    eda_summary_json: Mapped[str] = mapped_column(Text, default="{}")
    global_importance_json: Mapped[str] = mapped_column(Text, default="[]")
    artifact_path: Mapped[str] = mapped_column(String(256), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)


class InferenceTelemetry(Base):
    """Records per-batch inference latency, drift indicators, and operational errors."""

    __tablename__ = "inference_telemetry"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    batch_id: Mapped[str] = mapped_column(String(64), index=True)
    endpoint: Mapped[str] = mapped_column(String(128))
    record_count: Mapped[int] = mapped_column(Integer, default=1)
    latency_ms: Mapped[float] = mapped_column(Float)
    status_code: Mapped[int] = mapped_column(Integer, default=200)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Drift & distribution summary for this batch
    drift_psi_max: Mapped[float] = mapped_column(Float, default=0.0)
    drift_psi_mean: Mapped[float] = mapped_column(Float, default=0.0)
    drifted_features_count: Mapped[int] = mapped_column(Integer, default=0)
    drift_details_json: Mapped[str] = mapped_column(Text, default="[]")
    mean_entropy: Mapped[float] = mapped_column(Float, default=0.0)
    mean_anomaly_score: Mapped[float] = mapped_column(Float, default=0.0)


class SystemConfigKV(Base):
    """Persisted runtime configuration & decision thresholds."""

    __tablename__ = "system_config"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
