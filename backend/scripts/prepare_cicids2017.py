"""
CLI utility to acquire/validate local CIC-IDS2017 CSV files, prepare the benchmark sample,
and run a full reproducible training + open-set evaluation experiment from the command line.

Usage:
    python -m scripts.prepare_cicids2017 --samples 3600 --split group_time_aware
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db.repository import AegisRepository
from app.db.session import get_sqlite_connection, init_db
from app.ml.dataset_generator import load_or_prepare_cicids2017_dataset
from app.ml.engine import ml_engine


def main() -> None:
    parser = argparse.ArgumentParser(
        description="AegisNet CIC-IDS2017 Dataset Validation & Reproducible Experiment Runner"
    )
    parser.add_argument(
        "--samples",
        type=int,
        default=3600,
        help="Target sample size when generating or subsampling benchmark flows.",
    )
    parser.add_argument(
        "--split",
        choices=["group_time_aware", "stratified"],
        default="group_time_aware",
        help="Splitting strategy to prevent session/temporal leakage.",
    )
    parser.add_argument(
        "--held-out",
        nargs="+",
        default=["Botnet", "WebAttack"],
        help="Attack families to hold out from training for open-set anomaly evaluation.",
    )
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    init_db()
    print("[1/3] Validating dataset & executing EDA...")
    df, meta = load_or_prepare_cicids2017_dataset(
        n_samples=args.samples,
        random_seed=args.seed,
        inject_realistic_artifacts=True,
    )
    print(f"      Dataset Name  : {meta['dataset_name']}")
    print(f"      Dataset Source: {meta['dataset_source']}")
    print(f"      Clean Rows    : {len(df)}")
    print(
        f"      Validation    : {json.dumps(meta['validation_report'], indent=2)}"
    )

    print(
        f"[2/3] Training Calibrated Random Forest + Isolation Forest (split={args.split}, held_out={args.held_out})..."
    )
    result = ml_engine.train_and_evaluate(
        df=df,
        dataset_meta=meta,
        split_strategy=args.split,
        held_out_families=args.held_out,
        random_seed=args.seed,
    )

    conn = get_sqlite_connection()
    try:
        repo = AegisRepository(conn)
        repo.save_model_run(result)
    finally:
        conn.close()

    print("[3/3] Experiment Results Summary:")
    print(f"      Model Version          : {result['version']}")
    print(f"      Closed-Set Accuracy    : {result['accuracy']:.4f}")
    print(f"      Closed-Set Macro F1    : {result['macro_f1']:.4f}")
    print(f"      Calibration Brier Score: {result['brier_score']:.5f}")
    print(f"      Calibration ECE        : {result['expected_calibration_error']:.5f}")
    print(f"      Open-Set AUROC         : {result['open_set_auroc']:.4f}")
    print(f"      Open-Set AUPRC         : {result['open_set_auprc']:.4f}")
    print(f"      Open-Set Recall@5%FPR  : {result['open_set_recall_at_5pct_fpr']:.4f}")
    print(f"      Saved Artifact         : {result['artifact_path']}")


if __name__ == "__main__":
    main()
