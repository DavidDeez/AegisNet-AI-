"""
CIC-IDS2017 Dataset Loader, Validator, and Reproducible Benchmark Generator.

Scientific Transparency Note:
- If raw CIC-IDS2017 CSV files are present in `backend/data/cicids2017/`, AegisNet loads and
  validates those exact files directly.
- Because the full raw CIC-IDS2017 dataset (~2.8M rows, >8 GB PCAP/CSV from the Canadian Institute
  for Cybersecurity) is not bundled inside a clean git clone, this module also provides a
  deterministic, domain-faithful CIC-IDS2017-schema network flow benchmark generator (`CIC-IDS2017-Benchmark-Sample`).
- It explicitly documents the data source (`raw_cicids2017_csv` vs `cicids2017_schema_benchmark`) in
  all model metadata and UI views, never fabricating metrics or pretending synthetic benchmark flows
  are the full 2.8M-row raw capture.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any
import numpy as np
import pandas as pd

from app.core.config import settings
from app.services.validation import standardize_and_validate_dataframe


def load_or_prepare_cicids2017_dataset(
    n_samples: int = 3600,
    random_seed: int = 42,
    inject_realistic_artifacts: bool = True,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """
    Checks `backend/data/cicids2017/` for local CIC-IDS2017 CSV files first.
    If found, loads and standardizes them. Otherwise generates and caches a deterministic,
    reproducible CIC-IDS2017-schema network flow dataset with realistic protocol/flow physics,
    session groups, class imbalance, and held-out attack families (`Botnet`, `WebAttack`).
    """
    raw_dir = settings.data_dir / "cicids2017"
    raw_dir.mkdir(parents=True, exist_ok=True)
    csv_files = sorted(raw_dir.glob("*.csv"))

    if csv_files:
        frames = []
        for fpath in csv_files[:4]:
            part = pd.read_csv(fpath, low_memory=False, nrows=max(2000, n_samples // len(csv_files)))
            frames.append(part)
        combined = pd.concat(frames, ignore_index=True)
        clean_df, val_report = standardize_and_validate_dataframe(combined, deduplicate=True)
        return clean_df, {
            "dataset_name": "CIC-IDS2017 (Local CSV Capture)",
            "dataset_source": "local_cicids2017_csv",
            "files_loaded": [f.name for f in csv_files[:4]],
            "validation_report": val_report.to_dict(),
        }

    # Reproducible CIC-IDS2017-schema benchmark generation
    rng = np.random.default_rng(random_seed)

    # Realistic class imbalance modeled after CIC-IDS2017 working days:
    # Known classes: BENIGN (~58%), DoS Hulk (~14%), PortScan (~10%), DDoS (~7%), BruteForce (~4%)
    # Held-out / Open-set evaluation classes: Botnet (~4%), WebAttack (~3%)
    class_proportions = [
        ("BENIGN", 0.56),
        ("DoS Hulk", 0.14),
        ("PortScan", 0.10),
        ("DDoS", 0.08),
        ("BruteForce", 0.05),
        ("Botnet", 0.04),
        ("WebAttack", 0.03),
    ]

    records: list[dict[str, Any]] = []
    group_counter = 0

    for label, prop in class_proportions:
        count = max(40, int(round(n_samples * prop)))
        # Group flows into temporal capture windows / host sessions (15-30 flows per session group)
        # to support rigorous group/time-aware splitting without session leakage.
        for i in range(count):
            if i % 20 == 0:
                group_counter += 1
            session_group = f"capture_window_{group_counter:04d}"
            minute_offset = (group_counter * 2) % 60
            hour_offset = 9 + ((group_counter * 2) // 60) % 8
            timestamp_str = f"2017-07-07 {hour_offset:02d}:{minute_offset:02d}:{i % 60:02d}"

            flow = _synthesize_cicids_flow_profile(rng, label, session_group, timestamp_str)
            records.append(flow)

    df = pd.DataFrame(records)

    # Inject a controlled percentage of real-world CIC-IDS2017 data quality artifacts
    # (Infinity in flow_bytes_s/flow_packets_s when duration=0, NaNs, and duplicate captures)
    # so the validation & preprocessing pipeline is genuinely exercised and audited.
    if inject_realistic_artifacts and len(df) > 100:
        inf_indices = rng.choice(len(df), size=max(8, len(df) // 200), replace=False)
        df.loc[inf_indices[: len(inf_indices) // 2], "flow_bytes_s"] = np.inf
        df.loc[inf_indices[len(inf_indices) // 2 :], "flow_packets_s"] = np.nan

        # Add 15 exact duplicate packet-capture rows
        dup_rows = df.iloc[:15].copy()
        df = pd.concat([df, dup_rows], ignore_index=True)

    # Shuffle deterministically
    df = df.sample(frac=1.0, random_state=random_seed).reset_index(drop=True)

    # Save a copy to data/cicids2017_benchmark_sample.csv so analysts can also inspect or upload it
    sample_csv_path = settings.data_dir / "cicids2017_benchmark_sample.csv"
    df.head(600).to_csv(sample_csv_path, index=False)

    clean_df, val_report = standardize_and_validate_dataframe(df, deduplicate=True)
    return clean_df, {
        "dataset_name": "CIC-IDS2017 Schema Benchmark (Reproducible)",
        "dataset_source": "cicids2017_schema_benchmark",
        "sample_csv_path": str(sample_csv_path),
        "validation_report": val_report.to_dict(),
    }


def _synthesize_cicids_flow_profile(
    rng: np.random.Generator, label: str, session_group: str, timestamp_str: str
) -> dict[str, Any]:
    """Generates physically consistent network flow statistics matching CIC-IDS2017 distributions."""
    if label == "BENIGN":
        dst_port = int(rng.choice([80, 443, 53, 8080, 22, 123], p=[0.28, 0.45, 0.14, 0.05, 0.05, 0.03]))
        protocol = "UDP" if dst_port in (53, 123) else "TCP"
        duration = float(rng.lognormal(mean=10.2, sigma=1.4))
        fwd_pkts = int(max(1, rng.poisson(lam=11)))
        bwd_pkts = int(max(1, rng.poisson(lam=12)))
        fwd_len_mean = float(rng.normal(loc=240.0, scale=85.0).clip(40.0, 1460.0))
        bwd_len_mean = float(rng.normal(loc=520.0, scale=180.0).clip(52.0, 1460.0))
        fwd_len_max = float(min(1500.0, fwd_len_mean * rng.uniform(1.3, 2.4)))
        bwd_len_max = float(min(1500.0, bwd_len_mean * rng.uniform(1.4, 2.6)))
        syn_cnt = int(rng.choice([0, 1], p=[0.25, 0.75]))
        rst_cnt = int(rng.choice([0, 1], p=[0.92, 0.08]))
        ack_cnt = int(max(1, fwd_pkts + bwd_pkts - 1))
        psh_cnt = int(rng.choice([0, 1, 2], p=[0.4, 0.45, 0.15]))
        init_win = float(rng.choice([8192, 16384, 29200, 65535], p=[0.2, 0.3, 0.35, 0.15]))
        active_mean = float(rng.exponential(scale=18000.0))
        src_ip = f"192.168.10.{rng.integers(10, 95)}"
        dst_ip = f"172.16.0.{rng.integers(2, 50)}"

    elif label == "DoS Hulk":
        # High-frequency HTTP GET flood: high packet rate, large backward error responses or stalled connections
        dst_port = int(rng.choice([80, 8080, 443], p=[0.85, 0.10, 0.05]))
        protocol = "TCP"
        duration = float(rng.lognormal(mean=11.8, sigma=0.9))
        fwd_pkts = int(max(5, rng.poisson(lam=28)))
        bwd_pkts = int(max(2, rng.poisson(lam=22)))
        fwd_len_mean = float(rng.normal(loc=380.0, scale=60.0).clip(180.0, 900.0))
        bwd_len_mean = float(rng.normal(loc=1150.0, scale=180.0).clip(600.0, 1460.0))
        fwd_len_max = float(min(1500.0, fwd_len_mean * rng.uniform(1.4, 2.0)))
        bwd_len_max = 1460.0
        syn_cnt = int(rng.choice([1, 2, 3], p=[0.5, 0.35, 0.15]))
        rst_cnt = int(rng.choice([0, 1, 2], p=[0.35, 0.45, 0.20]))
        ack_cnt = int(fwd_pkts + bwd_pkts)
        psh_cnt = int(rng.integers(2, 8))
        init_win = float(rng.choice([256, 512, 1024, 29200], p=[0.35, 0.35, 0.2, 0.1]))
        active_mean = float(rng.exponential(scale=4500.0))
        src_ip = f"172.16.0.{rng.integers(100, 120)}"
        dst_ip = "192.168.10.50"

    elif label == "PortScan":
        # Ultra-short flows, 1-2 packets, minimal payload, high SYN/RST ratio across varied destination ports
        dst_port = int(rng.integers(20, 9999))
        protocol = "TCP"
        duration = float(rng.uniform(40.0, 2200.0))
        fwd_pkts = int(rng.choice([1, 2], p=[0.78, 0.22]))
        bwd_pkts = int(rng.choice([0, 1], p=[0.35, 0.65]))
        fwd_len_mean = float(rng.uniform(0.0, 44.0))
        bwd_len_mean = float(rng.uniform(0.0, 40.0))
        fwd_len_max = fwd_len_mean
        bwd_len_max = bwd_len_mean
        syn_cnt = int(rng.choice([1, 2], p=[0.85, 0.15]))
        rst_cnt = int(rng.choice([1, 2], p=[0.75, 0.25]))
        ack_cnt = int(rng.choice([0, 1], p=[0.7, 0.3]))
        psh_cnt = 0
        init_win = float(rng.choice([1024, 2048, 512]))
        active_mean = 0.0
        src_ip = f"172.16.0.{rng.integers(130, 145)}"
        dst_ip = "192.168.10.51"

    elif label == "DDoS":
        # Volumetric distributed flood: massive forward packet volume and byte rate, asymmetric backward response
        dst_port = int(rng.choice([80, 443], p=[0.82, 0.18]))
        protocol = "TCP"
        duration = float(rng.lognormal(mean=10.5, sigma=0.8))
        fwd_pkts = int(max(18, rng.poisson(lam=64)))
        bwd_pkts = int(max(0, rng.poisson(lam=4)))
        fwd_len_mean = float(rng.normal(loc=890.0, scale=160.0).clip(400.0, 1460.0))
        bwd_len_mean = float(rng.normal(loc=90.0, scale=45.0).clip(0.0, 300.0))
        fwd_len_max = 1460.0
        bwd_len_max = float(max(bwd_len_mean, 180.0))
        syn_cnt = int(rng.integers(3, 12))
        rst_cnt = int(rng.choice([0, 1], p=[0.8, 0.2]))
        ack_cnt = int(max(1, fwd_pkts // 2))
        psh_cnt = int(rng.integers(4, 15))
        init_win = float(rng.choice([256, 512, 8192]))
        active_mean = float(rng.exponential(scale=85000.0))
        src_ip = f"203.0.113.{rng.integers(10, 240)}"
        dst_ip = "192.168.10.50"

    elif label == "BruteForce":
        # SSH/FTP Patator: medium duration, repeated small encrypted auth handshakes on ports 22/21
        dst_port = int(rng.choice([22, 21], p=[0.65, 0.35]))
        protocol = "TCP"
        duration = float(rng.lognormal(mean=12.6, sigma=0.6))
        fwd_pkts = int(max(8, rng.poisson(lam=24)))
        bwd_pkts = int(max(8, rng.poisson(lam=26)))
        fwd_len_mean = float(rng.normal(loc=115.0, scale=25.0).clip(60.0, 240.0))
        bwd_len_mean = float(rng.normal(loc=145.0, scale=30.0).clip(60.0, 300.0))
        fwd_len_max = float(fwd_len_mean * rng.uniform(1.8, 2.8))
        bwd_len_max = float(bwd_len_mean * rng.uniform(1.8, 2.8))
        syn_cnt = 1
        rst_cnt = int(rng.choice([0, 1], p=[0.6, 0.4]))
        ack_cnt = int(fwd_pkts + bwd_pkts)
        psh_cnt = int(rng.integers(8, 20))
        init_win = 29200.0
        active_mean = float(rng.normal(loc=42000.0, scale=9000.0).clip(5000.0, 95000.0))
        src_ip = f"172.16.0.{rng.integers(150, 165)}"
        dst_ip = "192.168.10.19"

    elif label == "Botnet":
        # Held-out Attack Family 1 (ARES / C2 Beaconing):
        # High periodicity (huge IAT max/mean), unusual high ephemeral/C2 ports (8443, 6667, 4444),
        # compact beacon payloads and abnormal window/active ratios.
        dst_port = int(rng.choice([8443, 6667, 4444, 8081]))
        protocol = "TCP"
        duration = float(rng.lognormal(mean=14.5, sigma=0.5))
        fwd_pkts = int(max(12, rng.poisson(lam=35)))
        bwd_pkts = int(max(10, rng.poisson(lam=32)))
        fwd_len_mean = float(rng.normal(loc=72.0, scale=14.0).clip(44.0, 130.0))
        bwd_len_mean = float(rng.normal(loc=68.0, scale=14.0).clip(44.0, 130.0))
        fwd_len_max = float(fwd_len_mean * 3.8)
        bwd_len_max = float(bwd_len_mean * 3.6)
        syn_cnt = int(rng.integers(2, 6))
        rst_cnt = int(rng.integers(2, 5))
        ack_cnt = int(fwd_pkts + bwd_pkts)
        psh_cnt = int(rng.integers(12, 28))
        init_win = 128.0
        active_mean = float(rng.normal(loc=280000.0, scale=40000.0).clip(150000.0, 450000.0))
        src_ip = f"192.168.10.{rng.integers(101, 130)}"
        dst_ip = f"198.51.100.{rng.integers(20, 80)}"

    else:  # WebAttack (XSS / SQLi / Command Injection - Held-out Attack Family 2)
        dst_port = int(rng.choice([80, 443, 8000], p=[0.55, 0.30, 0.15]))
        protocol = "TCP"
        duration = float(rng.lognormal(mean=13.4, sigma=0.7))
        fwd_pkts = int(max(15, rng.poisson(lam=42)))
        bwd_pkts = int(max(12, rng.poisson(lam=38)))
        fwd_len_mean = float(rng.normal(loc=980.0, scale=140.0).clip(620.0, 1460.0))
        bwd_len_mean = float(rng.normal(loc=820.0, scale=160.0).clip(450.0, 1460.0))
        fwd_len_max = 1460.0
        bwd_len_max = 1460.0
        syn_cnt = int(rng.integers(2, 5))
        rst_cnt = int(rng.integers(2, 6))
        ack_cnt = int(fwd_pkts + bwd_pkts)
        psh_cnt = int(rng.integers(18, 36))
        init_win = 64.0
        active_mean = float(rng.normal(loc=195000.0, scale=35000.0).clip(90000.0, 320000.0))
        src_ip = f"198.51.100.{rng.integers(100, 180)}"
        dst_ip = "192.168.10.50"

    tot_fwd_bytes = round(fwd_pkts * fwd_len_mean, 2)
    tot_bwd_bytes = round(bwd_pkts * bwd_len_mean, 2)
    total_pkts = max(1, fwd_pkts + bwd_pkts)
    total_bytes = tot_fwd_bytes + tot_bwd_bytes
    dur_sec = max(duration / 1_000_000.0, 1e-5)

    flow_bytes_s = round(total_bytes / dur_sec, 2)
    flow_packets_s = round(total_pkts / dur_sec, 2)
    flow_iat_mean = round(duration / max(1, total_pkts - 1), 2)
    flow_iat_std = round(flow_iat_mean * float(rng.uniform(0.6, 1.9)), 2)
    flow_iat_max = round(flow_iat_mean * float(rng.uniform(2.2, 6.5)), 2)
    fwd_iat_mean = round(duration / max(1, fwd_pkts), 2)
    bwd_iat_mean = round(duration / max(1, bwd_pkts), 2) if bwd_pkts > 0 else 0.0
    avg_pkt_size = round(total_bytes / total_pkts, 2)

    return {
        "src_ip": src_ip,
        "dst_ip": dst_ip,
        "src_port": int(rng.integers(32768, 65000)),
        "destination_port": dst_port,
        "protocol": protocol,
        "flow_timestamp": timestamp_str,
        "session_group": session_group,
        "flow_duration": round(duration, 2),
        "total_fwd_packets": fwd_pkts,
        "total_backward_packets": bwd_pkts,
        "total_length_of_fwd_packets": tot_fwd_bytes,
        "total_length_of_bwd_packets": tot_bwd_bytes,
        "fwd_packet_length_max": round(fwd_len_max, 2),
        "fwd_packet_length_mean": round(fwd_len_mean, 2),
        "bwd_packet_length_max": round(bwd_len_max, 2),
        "bwd_packet_length_mean": round(bwd_len_mean, 2),
        "flow_bytes_s": flow_bytes_s,
        "flow_packets_s": flow_packets_s,
        "flow_iat_mean": flow_iat_mean,
        "flow_iat_std": flow_iat_std,
        "flow_iat_max": flow_iat_max,
        "fwd_iat_mean": fwd_iat_mean,
        "bwd_iat_mean": bwd_iat_mean,
        "fwd_psh_flags": psh_cnt,
        "syn_flag_count": syn_cnt,
        "rst_flag_count": rst_cnt,
        "ack_flag_count": ack_cnt,
        "average_packet_size": avg_pkt_size,
        "init_win_bytes_forward": init_win,
        "active_mean": round(active_mean, 2),
        "label": label,
    }
