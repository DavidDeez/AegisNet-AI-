"""REST API endpoints for AegisNet Intrusion Detection, Explainability, Model Lab, and Monitoring."""
from __future__ import annotations

import sqlite3
import time
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import PlainTextResponse

from app.core.config import settings
from app.core.logging_config import logger
from app.db.repository import AegisRepository
from app.db.session import get_db
from app.ml.dataset_generator import load_or_prepare_cicids2017_dataset
from app.ml.engine import ml_engine
from app.ml.schema import CANONICAL_FEATURES, FEATURE_DESCRIPTIONS
from app.schemas.api_models import (
    BenchmarkSliceRequest,
    BulkEventReviewRequest,
    EventReviewUpdateRequest,
    FlowBatchRequest,
    SystemSettingsUpdateRequest,
    TrainExperimentRequest,
)
from app.services.llm_briefing import generate_soc_incident_brief
from app.services.validation import (
    DataValidationError,
    standardize_and_validate_dataframe,
    validate_and_parse_csv_bytes,
)

router = APIRouter(prefix="/api/v1")
BOOT_TIME = time.time()


def get_repo(conn: sqlite3.Connection = Depends(get_db)) -> AegisRepository:
    return AegisRepository(conn)


# ---------------------------------------------------------------------------
# 1. Health & Metadata
# ---------------------------------------------------------------------------
@router.get("/health")
def health_check(repo: AegisRepository = Depends(get_repo)) -> dict[str, Any]:
    active_run = repo.get_active_model_run()
    return {
        "status": "healthy" if ml_engine.is_ready else "degraded",
        "app_name": settings.app_name,
        "app_version": settings.app_version,
        "uptime_seconds": round(time.time() - BOOT_TIME, 1),
        "ml_engine_ready": ml_engine.is_ready,
        "active_model_version": ml_engine.version,
        "known_classes": ml_engine.class_names,
        "held_out_attack_families": ml_engine.held_out_families,
        "explainer_backend": (
            ml_engine.explainer.explainer_backend if ml_engine.explainer else "none"
        ),
        "database_connected": True,
        "active_model_summary": (
            {
                "version": active_run["version"],
                "dataset_name": active_run["dataset_name"],
                "dataset_source": active_run["dataset_source"],
                "accuracy": active_run["accuracy"],
                "macro_f1": active_run["macro_f1"],
                "open_set_auroc": active_run["open_set_auroc"],
                "expected_calibration_error": active_run["expected_calibration_error"],
            }
            if active_run
            else None
        ),
    }


# ---------------------------------------------------------------------------
# 2. Overview & Threat Intelligence
# ---------------------------------------------------------------------------
@router.get("/overview")
def get_overview(repo: AegisRepository = Depends(get_repo)) -> dict[str, Any]:
    summary = repo.get_overview_summary()
    monitoring = repo.get_monitoring_summary()
    active_model = repo.get_active_model_run()
    return {
        **summary,
        "system_health": {
            "ml_engine_ready": ml_engine.is_ready,
            "active_model_version": ml_engine.version,
            "avg_latency_ms": monitoring["avg_latency_ms"],
            "p95_latency_ms": monitoring["p95_latency_ms"],
            "max_drift_psi": monitoring["max_drift_psi"],
            "error_count": monitoring["error_count"],
        },
        "active_model": active_model,
    }


@router.get("/threat-intel")
def get_threat_intelligence(repo: AegisRepository = Depends(get_repo)) -> dict[str, Any]:
    intel = repo.get_threat_intelligence()
    active_model = repo.get_active_model_run()
    return {
        **intel,
        "known_classes": ml_engine.class_names,
        "held_out_families": ml_engine.held_out_families,
        "open_set_evaluation": (
            active_model["metrics"].get("open_set", {}) if active_model else {}
        ),
        "taxonomy_definitions": {
            "KNOWN_ATTACK": "High calibrated supervised probability on a known training attack signature with low predictive entropy.",
            "BENIGN": "High calibrated probability on normal traffic AND Isolation Forest anomaly score within normal benign baseline percentile.",
            "ANOMALOUS_UNKNOWN": "Statistically anomalous network flow (exceeds Isolation Forest percentile threshold) while supervised classifier projects Benign or high uncertainty. Represents a candidate novel/unseen pattern requiring analyst triage—not an automatic zero-day confirmation.",
            "UNCERTAIN": "Elevated Shannon entropy across class probabilities or narrow top-class margin; requires human verification.",
        },
    }


# ---------------------------------------------------------------------------
# 3. Detection Center (CSV Upload, Structured Flows, Benchmark Slice)
# ---------------------------------------------------------------------------
@router.post("/detection/upload-csv")
async def upload_and_analyze_csv(
    file: UploadFile = File(...),
    deduplicate: bool = Query(default=True),
    repo: AegisRepository = Depends(get_repo),
) -> dict[str, Any]:
    t0 = time.perf_counter()
    filename = file.filename or "uploaded_flows.csv"

    try:
        raw_bytes = await file.read()
        clean_df, val_report = validate_and_parse_csv_bytes(
            raw_bytes=raw_bytes, filename=filename, deduplicate=deduplicate
        )
    except DataValidationError as exc:
        latency = (time.perf_counter() - t0) * 1000.0
        repo.record_telemetry(
            {
                "batch_id": "invalid_upload",
                "endpoint": "/api/v1/detection/upload-csv",
                "record_count": 0,
                "latency_ms": latency,
                "status_code": 400,
                "error_message": str(exc),
            }
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    runtime_cfg = repo.get_settings()
    scored = ml_engine.score_dataframe(
        df=clean_df,
        runtime_settings=runtime_cfg,
        source_name=filename,
    )
    persisted_events = repo.insert_events(scored["events"])
    latency = (time.perf_counter() - t0) * 1000.0

    drift = scored["drift_report"]
    repo.record_telemetry(
        {
            "batch_id": scored["batch_id"],
            "endpoint": "/api/v1/detection/upload-csv",
            "record_count": scored["total_scored"],
            "latency_ms": latency,
            "status_code": 200,
            "drift_psi_max": drift["psi_max"],
            "drift_psi_mean": drift["psi_mean"],
            "drifted_features_count": drift["drifted_features_count"],
            "drift_details": drift["details"],
            "mean_entropy": scored["mean_entropy"],
            "mean_anomaly_score": scored["mean_anomaly_score"],
        }
    )

    logger.info(
        "CSV flow dataset analyzed",
        extra={
            "extra_data": {
                "filename": filename,
                "batch_id": scored["batch_id"],
                "rows_scored": scored["total_scored"],
                "latency_ms": round(latency, 2),
            }
        },
    )

    return {
        "batch_id": scored["batch_id"],
        "source_name": filename,
        "model_version": scored["model_version"],
        "latency_ms": round(latency, 2),
        "validation_report": val_report.to_dict(),
        "triage_summary": scored["triage_summary"],
        "mean_confidence": scored["mean_confidence"],
        "mean_entropy": scored["mean_entropy"],
        "mean_anomaly_score": scored["mean_anomaly_score"],
        "drift_report": drift,
        "events": persisted_events[:100],
    }


@router.post("/detection/analyze-flows")
def analyze_structured_flows(
    payload: FlowBatchRequest,
    repo: AegisRepository = Depends(get_repo),
) -> dict[str, Any]:
    t0 = time.perf_counter()
    raw_df = pd.DataFrame([f.model_dump() for f in payload.flows])
    try:
        clean_df, val_report = standardize_and_validate_dataframe(
            raw_df, deduplicate=False
        )
    except DataValidationError as exc:
        latency = (time.perf_counter() - t0) * 1000.0
        repo.record_telemetry(
            {
                "batch_id": "invalid_json_flows",
                "endpoint": "/api/v1/detection/analyze-flows",
                "record_count": 0,
                "latency_ms": latency,
                "status_code": 400,
                "error_message": str(exc),
            }
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    runtime_cfg = repo.get_settings()
    scored = ml_engine.score_dataframe(
        df=clean_df,
        runtime_settings=runtime_cfg,
        source_name=payload.source_name,
    )
    persisted_events = repo.insert_events(scored["events"])
    latency = (time.perf_counter() - t0) * 1000.0

    drift = scored["drift_report"]
    repo.record_telemetry(
        {
            "batch_id": scored["batch_id"],
            "endpoint": "/api/v1/detection/analyze-flows",
            "record_count": scored["total_scored"],
            "latency_ms": latency,
            "status_code": 200,
            "drift_psi_max": drift["psi_max"],
            "drift_psi_mean": drift["psi_mean"],
            "drifted_features_count": drift["drifted_features_count"],
            "drift_details": drift["details"],
            "mean_entropy": scored["mean_entropy"],
            "mean_anomaly_score": scored["mean_anomaly_score"],
        }
    )

    return {
        "batch_id": scored["batch_id"],
        "source_name": payload.source_name,
        "model_version": scored["model_version"],
        "latency_ms": round(latency, 2),
        "validation_report": val_report.to_dict(),
        "triage_summary": scored["triage_summary"],
        "mean_confidence": scored["mean_confidence"],
        "mean_entropy": scored["mean_entropy"],
        "mean_anomaly_score": scored["mean_anomaly_score"],
        "drift_report": drift,
        "events": persisted_events,
    }


@router.post("/detection/analyze-benchmark-slice")
def analyze_benchmark_slice(
    req: BenchmarkSliceRequest,
    repo: AegisRepository = Depends(get_repo),
) -> dict[str, Any]:
    """
    Loads a reproducible slice of CIC-IDS2017 benchmark flows (including both known classes
    and optionally held-out unseen attack families) and runs them through the full validation,
    inference, uncertainty, anomaly, and SHAP pipeline.
    """
    t0 = time.perf_counter()
    df, meta = load_or_prepare_cicids2017_dataset(
        n_samples=max(400, req.sample_size * 4),
        random_seed=req.random_seed,
        inject_realistic_artifacts=True,
    )
    if not req.include_held_out_attacks and ml_engine.held_out_families:
        df = df[~df["label"].isin(ml_engine.held_out_families)].reset_index(drop=True)

    slice_df = df.head(req.sample_size).reset_index(drop=True)
    runtime_cfg = repo.get_settings()
    scored = ml_engine.score_dataframe(
        df=slice_df,
        runtime_settings=runtime_cfg,
        source_name=f"cicids2017_slice_seed_{req.random_seed}",
    )
    persisted_events = repo.insert_events(scored["events"])
    latency = (time.perf_counter() - t0) * 1000.0

    drift = scored["drift_report"]
    repo.record_telemetry(
        {
            "batch_id": scored["batch_id"],
            "endpoint": "/api/v1/detection/analyze-benchmark-slice",
            "record_count": scored["total_scored"],
            "latency_ms": latency,
            "status_code": 200,
            "drift_psi_max": drift["psi_max"],
            "drift_psi_mean": drift["psi_mean"],
            "drifted_features_count": drift["drifted_features_count"],
            "drift_details": drift["details"],
            "mean_entropy": scored["mean_entropy"],
            "mean_anomaly_score": scored["mean_anomaly_score"],
        }
    )

    return {
        "batch_id": scored["batch_id"],
        "source_name": f"cicids2017_slice_seed_{req.random_seed}",
        "model_version": scored["model_version"],
        "latency_ms": round(latency, 2),
        "validation_report": meta.get("validation_report", {}),
        "triage_summary": scored["triage_summary"],
        "mean_confidence": scored["mean_confidence"],
        "mean_entropy": scored["mean_entropy"],
        "mean_anomaly_score": scored["mean_anomaly_score"],
        "drift_report": drift,
        "events": persisted_events,
    }


# ---------------------------------------------------------------------------
# 4. Event Explorer & Analyst Workflow
# ---------------------------------------------------------------------------
@router.get("/events")
def list_events(
    limit: int = Query(default=50, ge=1, le=250),
    offset: int = Query(default=0, ge=0),
    triage_category: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    predicted_label: str | None = Query(default=None),
    review_status: str | None = Query(default=None),
    search: str | None = Query(default=None),
    min_entropy: float | None = Query(default=None, ge=0.0, le=1.0),
    only_anomalous: bool = Query(default=False),
    repo: AegisRepository = Depends(get_repo),
) -> dict[str, Any]:
    return repo.list_events(
        limit=limit,
        offset=offset,
        triage_category=triage_category,
        severity=severity,
        predicted_label=predicted_label,
        review_status=review_status,
        search=search,
        min_entropy=min_entropy,
        only_anomalous=only_anomalous,
    )


@router.get("/events/{event_uid}")
def get_event_detail(
    event_uid: str,
    repo: AegisRepository = Depends(get_repo),
) -> dict[str, Any]:
    ev = repo.get_event_by_uid(event_uid)
    if not ev:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event '{event_uid}' not found.",
        )

    # If local SHAP explanation was deferred (e.g., on large batch of benign flows), compute it on demand
    exp = ev.get("explanation", {})
    if (
        not exp.get("top_contributors")
        and ml_engine.is_ready
        and ml_engine.pipeline is not None
        and ml_engine.explainer is not None
    ):
        feat_df = pd.DataFrame([ev.get("features", {})])
        scaled_row = ml_engine.pipeline.transform(feat_df)[0]
        probs = ev.get("class_probabilities", {})
        top_cls = max(probs, key=probs.get) if probs else "BENIGN"
        computed_exp = ml_engine.explainer.explain_flow(
            scaled_row=scaled_row,
            raw_feature_dict=ev.get("features", {}),
            predicted_label=top_cls,
            triage_category=ev["triage_category"],
            supervised_confidence=ev["supervised_confidence"],
            predictive_entropy=ev["predictive_entropy"],
            anomaly_score=ev["anomaly_score"],
            anomaly_percentile=ev["anomaly_percentile"],
            top_k=12,
        )
        ev["explanation"] = computed_exp
        ev["rationale_text"] = computed_exp["rationale"]

    return ev


@router.patch("/events/{event_uid}/review")
def update_event_review(
    event_uid: str,
    payload: EventReviewUpdateRequest,
    repo: AegisRepository = Depends(get_repo),
) -> dict[str, Any]:
    updated = repo.update_event_review(
        event_uid=event_uid,
        review_status=payload.review_status,
        analyst_notes=payload.analyst_notes,
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Event '{event_uid}' not found.",
        )
    return updated


@router.post("/events/bulk-review")
def bulk_update_event_review(
    payload: BulkEventReviewRequest,
    repo: AegisRepository = Depends(get_repo),
) -> dict[str, Any]:
    updated_count = repo.bulk_update_event_review(
        event_uids=payload.event_uids,
        review_status=payload.review_status,
        analyst_notes=payload.analyst_notes,
    )
    return {
        "updated_count": updated_count,
        "review_status": payload.review_status,
    }


@router.get("/events/export/csv", response_class=PlainTextResponse)
def export_events_csv(
    triage_category: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    repo: AegisRepository = Depends(get_repo),
) -> PlainTextResponse:
    """Exports analyzed network events as a forensic CSV report."""
    res = repo.list_events(
        limit=500,
        offset=0,
        triage_category=triage_category,
        severity=severity,
    )
    items = res["items"]
    if not items:
        return PlainTextResponse(
            "event_uid,created_at,src_ip,src_port,dst_ip,dst_port,protocol,triage_category,predicted_label,severity,supervised_confidence,known_attack_probability,predictive_entropy,anomaly_score,anomaly_percentile,review_status\n",
            media_type="text/csv",
        )
    cols = [
        "event_uid",
        "created_at",
        "src_ip",
        "src_port",
        "dst_ip",
        "dst_port",
        "protocol",
        "triage_category",
        "predicted_label",
        "ground_truth_label",
        "severity",
        "supervised_confidence",
        "known_attack_probability",
        "prediction_margin",
        "predictive_entropy",
        "anomaly_score",
        "anomaly_percentile",
        "review_status",
        "rationale_text",
    ]
    out_df = pd.DataFrame([{c: it.get(c, "") for c in cols} for it in items])
    return PlainTextResponse(
        out_df.to_csv(index=False),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="aegisnet_forensic_events.csv"'
        },
    )


@router.get("/events/{event_uid}/mitigation-rules")
def get_event_mitigation_rules(
    event_uid: str,
    repo: AegisRepository = Depends(get_repo),
) -> dict[str, Any]:
    """
    Synthesizes actionable defensive rules (Suricata IDS signature, nftables/iptables containment,
    and Zeek telemetry hunting filter) directly from the flow's endpoints, protocol, flags, and triage state.
    """
    ev = get_event_detail(event_uid=event_uid, repo=repo)
    proto = str(ev.get("protocol", "TCP")).lower()
    src_ip = ev.get("src_ip", "0.0.0.0")
    dst_ip = ev.get("dst_ip", "10.0.1.10")
    dst_port = int(ev.get("dst_port", 80))
    cat = ev.get("triage_category", "UNCERTAIN")
    pred_lbl = ev.get("predicted_label", "Unknown")
    conf = float(ev.get("supervised_confidence", 0.0))
    anom_pct = float(ev.get("anomaly_percentile", 0.0))
    feats = ev.get("features", {})
    fwd_pkts = int(feats.get("total_fwd_packets", 10))
    sid = 9000000 + int(ev.get("id", 1))

    suricata_rule = (
        f'alert {proto} {src_ip} any -> {dst_ip} {dst_port} '
        f'(msg:"AEGISNET [{cat}] {pred_lbl} (Conf={conf:.2f}, IF_Pctl=p{anom_pct:.1f})"; '
        f'flow:to_server; threshold:type both, track by_src, count {max(5, fwd_pkts // 2)}, seconds 30; '
        f'classtype:attempted-dos; sid:{sid}; rev:1;)'
    )
    iptables_rule = (
        f"iptables -I INPUT -s {src_ip} -p {proto} --dport {dst_port} "
        f"-m comment --comment \"AegisNet {ev['event_uid']} {cat}\" -j DROP"
    )
    nftables_rule = (
        f"nft add rule inet filter input ip saddr {src_ip} {proto} dport {dst_port} "
        f"counter drop comment \"AegisNet {ev['event_uid']}\""
    )
    zeek_query = (
        f"zeek-cut ts uid id.orig_h id.orig_p id.resp_h id.resp_p proto service duration orig_bytes resp_bytes conn_state "
        f"< conn.log | awk '$3 == \"{src_ip}\" && $6 == {dst_port}'"
    )

    return {
        "event_uid": ev["event_uid"],
        "triage_category": cat,
        "predicted_label": pred_lbl,
        "suricata_rule": suricata_rule,
        "iptables_command": iptables_rule,
        "nftables_command": nftables_rule,
        "zeek_hunt_query": zeek_query,
    }


@router.delete("/events")
def clear_all_events(repo: AegisRepository = Depends(get_repo)) -> dict[str, Any]:
    deleted = repo.clear_events()
    return {"deleted_count": deleted, "status": "cleared"}


# ---------------------------------------------------------------------------
# 5. Explainability (Global & Local SHAP)
# ---------------------------------------------------------------------------
@router.get("/explainability/global")
def get_global_explainability(
    repo: AegisRepository = Depends(get_repo),
) -> dict[str, Any]:
    active_run = repo.get_active_model_run()
    return {
        "model_version": ml_engine.version,
        "explainer_backend": (
            ml_engine.explainer.explainer_backend if ml_engine.explainer else "none"
        ),
        "fireworks_ai_configured": bool(settings.fireworks_api_key.strip()),
        "fireworks_model": settings.fireworks_model,
        "feature_count": len(CANONICAL_FEATURES),
        "global_importance": (
            active_run["global_importance"]
            if active_run and active_run.get("global_importance")
            else ml_engine.global_importance
        ),
        "feature_descriptions": FEATURE_DESCRIPTIONS,
        "methodology_note": (
            "Global importance ranks network flow attributes by mean(|SHAP|) across held-out evaluation "
            "flows alongside Random Forest Gini impurity reduction. Local explanations decompose each flow's "
            "predicted class probability into an expected baseline value plus exact additive feature contributions."
        ),
    }


@router.get("/explainability/event/{event_uid}")
def get_event_explanation(
    event_uid: str,
    repo: AegisRepository = Depends(get_repo),
) -> dict[str, Any]:
    ev = get_event_detail(event_uid=event_uid, repo=repo)
    return {
        "event_uid": ev["event_uid"],
        "triage_category": ev["triage_category"],
        "predicted_label": ev["predicted_label"],
        "ground_truth_label": ev.get("ground_truth_label"),
        "severity": ev["severity"],
        "supervised_confidence": ev["supervised_confidence"],
        "known_attack_probability": ev["known_attack_probability"],
        "prediction_margin": ev["prediction_margin"],
        "predictive_entropy": ev["predictive_entropy"],
        "anomaly_score": ev["anomaly_score"],
        "anomaly_percentile": ev["anomaly_percentile"],
        "class_probabilities": ev["class_probabilities"],
        "explanation": ev["explanation"],
        "rationale_text": ev["rationale_text"],
        "features": ev["features"],
    }


@router.post("/explainability/event/{event_uid}/ai-brief")
def generate_event_ai_brief(
    event_uid: str,
    repo: AegisRepository = Depends(get_repo),
) -> dict[str, Any]:
    """
    Synthesizes a technical SOC Incident Brief grounded in the event's TreeSHAP attributions,
    calibrated probabilities, Shannon entropy, and Isolation Forest percentile via Fireworks AI
    (with deterministic offline fallback).
    """
    ev = get_event_detail(event_uid=event_uid, repo=repo)
    brief = generate_soc_incident_brief(ev)
    return brief



# ---------------------------------------------------------------------------
# 6. Model Lab (Training Runs, Open-Set Evaluation, EDA, Calibration)
# ---------------------------------------------------------------------------
@router.get("/models")
def get_models_lab(repo: AegisRepository = Depends(get_repo)) -> dict[str, Any]:
    active = repo.get_active_model_run()
    runs = repo.list_model_runs()
    return {
        "active_model": active,
        "runs": runs,
        "available_attack_families": [
            "DoS Hulk",
            "PortScan",
            "DDoS",
            "BruteForce",
            "Botnet",
            "WebAttack",
        ],
    }


@router.post("/models/train")
def trigger_model_training(
    req: TrainExperimentRequest,
    repo: AegisRepository = Depends(get_repo),
) -> dict[str, Any]:
    t0 = time.perf_counter()
    df, dataset_meta = load_or_prepare_cicids2017_dataset(
        n_samples=req.sample_size,
        random_seed=req.random_seed,
        inject_realistic_artifacts=True,
    )
    run_result = ml_engine.train_and_evaluate(
        df=df,
        dataset_meta=dataset_meta,
        split_strategy=req.split_strategy,
        held_out_families=req.held_out_families,
        n_estimators_rf=req.n_estimators_rf,
        n_estimators_if=req.n_estimators_if,
        random_seed=req.random_seed,
    )
    saved_run = repo.save_model_run(run_result)
    duration_ms = (time.perf_counter() - t0) * 1000.0

    logger.info(
        "Completed reproducible ML training & open-set evaluation run",
        extra={
            "extra_data": {
                "version": saved_run["version"],
                "split_strategy": req.split_strategy,
                "held_out_families": req.held_out_families,
                "accuracy": saved_run["accuracy"],
                "open_set_auroc": saved_run["open_set_auroc"],
                "duration_ms": round(duration_ms, 1),
            }
        },
    )
    return {
        "training_duration_ms": round(duration_ms, 1),
        "model_run": saved_run,
    }


# ---------------------------------------------------------------------------
# 7. System Monitoring & Drift
# ---------------------------------------------------------------------------
@router.get("/monitoring")
def get_system_monitoring(repo: AegisRepository = Depends(get_repo)) -> dict[str, Any]:
    mon = repo.get_monitoring_summary()
    overview = repo.get_overview_summary()
    cfg = repo.get_settings()
    return {
        **mon,
        "uptime_seconds": round(time.time() - BOOT_TIME, 1),
        "active_model_version": ml_engine.version,
        "prediction_distribution": overview["triage_distribution"],
        "severity_distribution": overview["severity_distribution"],
        "avg_confidence": overview["avg_confidence"],
        "avg_entropy": overview["avg_entropy"],
        "avg_anomaly_score": overview["avg_anomaly_score"],
        "drift_thresholds": {
            "psi_warning": cfg.get("drift_psi_warning_threshold", 0.15),
            "psi_critical": cfg.get("drift_psi_critical_threshold", 0.25),
        },
    }


# ---------------------------------------------------------------------------
# 8. Settings & Thresholds
# ---------------------------------------------------------------------------
@router.get("/settings")
def get_system_settings(repo: AegisRepository = Depends(get_repo)) -> dict[str, Any]:
    return {
        "settings": repo.get_settings(),
        "ai_copilot": {
            "fireworks_configured": bool(settings.fireworks_api_key.strip()),
            "masked_api_key": settings.masked_fireworks_key(),
            "model": settings.fireworks_model,
            "base_url": settings.fireworks_base_url,
        },
        "threshold_documentation": {
            "confidence_threshold": "Minimum calibrated top-class probability required to classify a flow as a KNOWN_ATTACK or high-certainty BENIGN without triggering UNCERTAIN.",
            "entropy_threshold": "Normalized Shannon entropy H(p)/ln(K) ceiling in [0, 1]. Flows with entropy >= threshold are flagged as UNCERTAIN.",
            "anomaly_percentile_threshold": "Percentile vs training benign Isolation Forest baseline (e.g. 95.0 = 5% nominal FPR on clean benign traffic). Flows exceeding this without high-confidence known attack classification are triaged as ANOMALOUS_UNKNOWN.",
            "drift_psi_warning_threshold": "Population Stability Index (PSI) threshold above which a feature is flagged with MODERATE_DRIFT.",
            "drift_psi_critical_threshold": "Population Stability Index (PSI) threshold above which a feature is flagged with CRITICAL_DRIFT.",
        },
    }


@router.put("/settings")
def update_system_settings(
    payload: SystemSettingsUpdateRequest,
    repo: AegisRepository = Depends(get_repo),
) -> dict[str, Any]:
    clean_updates = payload.to_clean_dict()
    updated = repo.update_settings(clean_updates)
    return {"settings": updated, "status": "updated"}
