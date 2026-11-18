"""Pydantic v2 request and response schemas for AegisNet API validation."""
from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator


class FlowRecordInput(BaseModel):
    """Validated single network flow input for JSON inference."""

    src_ip: str = Field(default="192.168.10.50", max_length=64)
    dst_ip: str = Field(default="10.0.1.10", max_length=64)
    src_port: int = Field(default=49152, ge=0, le=65535)
    destination_port: int = Field(default=80, ge=0, le=65535)
    protocol: str = Field(default="TCP", max_length=16)
    flow_timestamp: str = Field(default="", max_length=64)

    flow_duration: float = Field(default=15000.0, ge=0.0)
    total_fwd_packets: int = Field(default=8, ge=0)
    total_backward_packets: int = Field(default=6, ge=0)
    total_length_of_fwd_packets: float = Field(default=1200.0, ge=0.0)
    total_length_of_bwd_packets: float = Field(default=2400.0, ge=0.0)
    fwd_packet_length_max: float = Field(default=400.0, ge=0.0)
    fwd_packet_length_mean: float = Field(default=150.0, ge=0.0)
    bwd_packet_length_max: float = Field(default=900.0, ge=0.0)
    bwd_packet_length_mean: float = Field(default=400.0, ge=0.0)
    flow_bytes_s: float = Field(default=240000.0, ge=0.0)
    flow_packets_s: float = Field(default=933.3, ge=0.0)
    flow_iat_mean: float = Field(default=1150.0, ge=0.0)
    flow_iat_std: float = Field(default=620.0, ge=0.0)
    flow_iat_max: float = Field(default=3400.0, ge=0.0)
    fwd_iat_mean: float = Field(default=1800.0, ge=0.0)
    bwd_iat_mean: float = Field(default=2200.0, ge=0.0)
    fwd_psh_flags: int = Field(default=1, ge=0)
    syn_flag_count: int = Field(default=1, ge=0)
    rst_flag_count: int = Field(default=0, ge=0)
    ack_flag_count: int = Field(default=14, ge=0)
    average_packet_size: float = Field(default=257.1, ge=0.0)
    init_win_bytes_forward: float = Field(default=29200.0, ge=0.0)
    active_mean: float = Field(default=8500.0, ge=0.0)
    label: str | None = Field(default=None, max_length=64)


class FlowBatchRequest(BaseModel):
    source_name: str = Field(default="structured_api_stream", max_length=128)
    flows: list[FlowRecordInput] = Field(..., min_length=1, max_length=2000)


class BenchmarkSliceRequest(BaseModel):
    sample_size: int = Field(default=60, ge=10, le=500)
    include_held_out_attacks: bool = Field(default=True)
    random_seed: int = Field(default=101, ge=1, le=999999)


class EventReviewUpdateRequest(BaseModel):
    review_status: Literal[
        "UNREVIEWED", "CONFIRMED_THREAT", "FALSE_POSITIVE", "ESCALATED"
    ]
    analyst_notes: str = Field(default="", max_length=2000)


class BulkEventReviewRequest(BaseModel):
    event_uids: list[str] = Field(..., min_length=1, max_length=500)
    review_status: Literal[
        "UNREVIEWED", "CONFIRMED_THREAT", "FALSE_POSITIVE", "ESCALATED"
    ]
    analyst_notes: str = Field(default="", max_length=2000)


class TrainExperimentRequest(BaseModel):
    split_strategy: Literal["group_time_aware", "stratified"] = "group_time_aware"
    held_out_families: list[str] = Field(
        default_factory=lambda: ["Botnet", "WebAttack"]
    )
    sample_size: int = Field(default=3200, ge=600, le=15000)
    n_estimators_rf: int = Field(default=120, ge=40, le=300)
    n_estimators_if: int = Field(default=150, ge=50, le=300)
    random_seed: int = Field(default=42, ge=1, le=999999)

    @field_validator("held_out_families")
    @classmethod
    def validate_held_out(cls, v: list[str]) -> list[str]:
        allowed = {
            "DoS Hulk",
            "PortScan",
            "DDoS",
            "BruteForce",
            "Botnet",
            "WebAttack",
        }
        cleaned = [item.strip() for item in v if item.strip() in allowed]
        if not cleaned:
            return ["Botnet", "WebAttack"]
        return cleaned


class SystemSettingsUpdateRequest(BaseModel):
    confidence_threshold: float | None = Field(default=None, ge=0.30, le=0.99)
    entropy_threshold: float | None = Field(default=None, ge=0.10, le=0.95)
    anomaly_percentile_threshold: float | None = Field(default=None, ge=75.0, le=99.9)
    enable_shap_on_batch: bool | None = None
    max_shap_rows_per_batch: int | None = Field(default=None, ge=10, le=500)
    drift_psi_warning_threshold: float | None = Field(default=None, ge=0.05, le=0.50)
    drift_psi_critical_threshold: float | None = Field(default=None, ge=0.10, le=1.00)
    held_out_attack_families: list[str] | None = None
    auto_escalate_critical_anomalies: bool | None = None

    def to_clean_dict(self) -> dict[str, Any]:
        return {k: v for k, v in self.model_dump().items() if v is not None}
