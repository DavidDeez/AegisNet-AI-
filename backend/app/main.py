"""Main FastAPI application entry point and startup bootstrap for AegisNet."""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router as api_router
from app.core.config import settings
from app.core.logging_config import logger
from app.core.security import RateLimitAndSecurityMiddleware
from app.db.repository import AegisRepository
from app.db.session import get_sqlite_connection, init_db
from app.ml.dataset_generator import load_or_prepare_cicids2017_dataset
from app.ml.engine import ml_engine


def bootstrap_application_state() -> None:
    """
    Initializes SQLite/PostgreSQL tables and ensures a trained, reproducible baseline model
    is loaded (or trained on first launch) and an initial benchmark verification batch is scored.
    """
    init_db()
    conn = get_sqlite_connection()
    try:
        repo = AegisRepository(conn)
        active_run = repo.get_active_model_run()

        if active_run and active_run.get("artifact_path"):
            artifact_path = Path(active_run["artifact_path"])
            if ml_engine.load_artifact(artifact_path):
                logger.info(
                    f"Loaded existing active model artifact: {active_run['version']}"
                )
                return

        logger.info(
            "No existing model artifact found. Executing initial reproducible CIC-IDS2017 training & open-set evaluation run..."
        )
        t0 = time.perf_counter()
        df, dataset_meta = load_or_prepare_cicids2017_dataset(
            n_samples=3200,
            random_seed=settings.random_seed,
            inject_realistic_artifacts=True,
        )
        run_result = ml_engine.train_and_evaluate(
            df=df,
            dataset_meta=dataset_meta,
            split_strategy="group_time_aware",
            held_out_families=["Botnet", "WebAttack"],
            n_estimators_rf=120,
            n_estimators_if=150,
            random_seed=settings.random_seed,
        )
        repo.save_model_run(run_result)

        # Score an initial 80-flow evaluation batch from the dataset so the analyst dashboard
        # immediately reflects real model predictions, anomaly scores, and SHAP explanations.
        overview = repo.get_overview_summary()
        if overview["total_events"] == 0:
            eval_slice = df.head(80).reset_index(drop=True)
            scored = ml_engine.score_dataframe(
                df=eval_slice,
                runtime_settings=repo.get_settings(),
                source_name="cicids2017_initial_benchmark_eval.csv",
                batch_id="batch_initial_eval",
            )
            repo.insert_events(scored["events"])
            drift = scored["drift_report"]
            repo.record_telemetry(
                {
                    "batch_id": scored["batch_id"],
                    "endpoint": "bootstrap_evaluation",
                    "record_count": scored["total_scored"],
                    "latency_ms": round((time.perf_counter() - t0) * 1000.0, 2),
                    "status_code": 200,
                    "drift_psi_max": drift["psi_max"],
                    "drift_psi_mean": drift["psi_mean"],
                    "drifted_features_count": drift["drifted_features_count"],
                    "drift_details": drift["details"],
                    "mean_entropy": scored["mean_entropy"],
                    "mean_anomaly_score": scored["mean_anomaly_score"],
                }
            )
        logger.info("Initial model training and evaluation bootstrap complete.")
    finally:
        conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    bootstrap_application_state()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="AegisNet — AI Network Intrusion Detection & Threat Intelligence API",
        description=(
            "Production-grade network flow threat detection API with calibrated supervised "
            "classification, Isolation Forest open-set anomaly detection, Shannon entropy "
            "uncertainty quantification, and TreeSHAP explainability."
        ),
        version=settings.app_version,
        lifespan=lifespan,
    )

    allow_all = "*" in settings.cors_origins
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if allow_all else settings.cors_origins,
        allow_origin_regex=r"https://.*\.onrender\.com",
        allow_credentials=not allow_all,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(
        RateLimitAndSecurityMiddleware,
        max_requests_per_minute=settings.rate_limit_requests_per_minute,
    )

    app.include_router(api_router)

    # Serve compiled React frontend from single unified service when present
    backend_root = Path(__file__).resolve().parent.parent
    repo_root = backend_root.parent
    static_candidates = [
        backend_root / "static_ui",
        repo_root / "frontend" / "dist",
    ]
    for static_dir in static_candidates:
        index_html = static_dir / "index.html"
        if index_html.exists():
            assets_dir = static_dir / "assets"
            if assets_dir.exists():
                app.mount(
                    "/assets",
                    StaticFiles(directory=str(assets_dir)),
                    name="assets",
                )

            @app.get("/{full_path:path}", include_in_schema=False)
            def serve_spa(full_path: str, _static_dir: Path = static_dir):
                candidate = (_static_dir / full_path).resolve()
                if (
                    full_path
                    and candidate.is_file()
                    and str(candidate).startswith(str(_static_dir.resolve()))
                ):
                    return FileResponse(str(candidate))
                return FileResponse(str(_static_dir / "index.html"))

            break

    return app


app = create_app()
