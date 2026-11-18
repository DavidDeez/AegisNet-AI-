"""
Generates ready-to-upload test CSV datasets in `C:\\Users\\HP\\Desktop\\AEGISNET\\test_datasets\\`
for testing AegisNet's CSV upload, sanitization, open-set anomaly detection, and MITM detection.
"""
from __future__ import annotations

from pathlib import Path
import sys
import numpy as np
import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_ROOT.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.ml.dataset_generator import load_or_prepare_cicids2017_dataset


def build_mitm_and_anomaly_csv(out_path: Path, seed: int = 777) -> None:
    """
    Creates realistic Man-in-the-Middle (MITM ARP-Relay / SSL-Stripping) and unseen C2 flows
    using raw CIC-IDS2017 column names (including leading spaces) to test upload normalization.
    """
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(40):
        is_mitm = i < 25
        dst_port = int(rng.choice([443, 80, 8443, 8080]))
        dur = float(rng.uniform(450000.0, 2400000.0))
        fwd_pkts = int(rng.integers(22, 65))
        bwd_pkts = int(rng.integers(20, 60))
        # Active MITM relay exhibits high IAT variance (double-hop proxy jitter),
        # small/resized TCP initial window, and frequent PSH + RST flags from TLS downgrade attempts.
        fwd_len_mean = float(rng.uniform(75.0, 190.0)) if is_mitm else float(rng.uniform(60.0, 110.0))
        bwd_len_mean = float(rng.uniform(80.0, 220.0)) if is_mitm else float(rng.uniform(60.0, 110.0))
        tot_fwd = round(fwd_pkts * fwd_len_mean, 2)
        tot_bwd = round(bwd_pkts * bwd_len_mean, 2)
        tot_pkts = fwd_pkts + bwd_pkts
        dur_s = dur / 1_000_000.0

        iat_mean = round(dur / max(1, tot_pkts - 1), 2)
        iat_std = round(iat_mean * float(rng.uniform(2.5, 4.8)), 2)
        iat_max = round(iat_mean * float(rng.uniform(7.0, 14.0)), 2)

        rows.append(
            {
                "Source IP": f"192.168.1.{rng.integers(15, 90)}",
                "Source Port": int(rng.integers(49152, 65000)),
                "Destination IP": f"10.0.0.{rng.integers(5, 40)}",
                " Destination Port": dst_port,
                "Protocol": "TCP",
                "Timestamp": f"2026-11-18 16:{i % 60:02d}:12",
                " Flow Duration": round(dur, 2),
                " Total Fwd Packets": fwd_pkts,
                " Total Backward Packets": bwd_pkts,
                "Total Length of Fwd Packets": tot_fwd,
                " Total Length of Bwd Packets": tot_bwd,
                " Fwd Packet Length Max": round(fwd_len_mean * 3.5, 2),
                " Fwd Packet Length Mean": round(fwd_len_mean, 2),
                "Bwd Packet Length Max": round(bwd_len_mean * 3.4, 2),
                " Bwd Packet Length Mean": round(bwd_len_mean, 2),
                "Flow Bytes/s": round((tot_fwd + tot_bwd) / dur_s, 2),
                " Flow Packets/s": round(tot_pkts / dur_s, 2),
                " Flow IAT Mean": iat_mean,
                " Flow IAT Std": iat_std,
                " Flow IAT Max": iat_max,
                "Fwd IAT Mean": round(dur / fwd_pkts, 2),
                "Bwd IAT Mean": round(dur / bwd_pkts, 2),
                "Fwd PSH Flags": int(rng.integers(14, 32)),
                " SYN Flag Count": int(rng.integers(3, 8)),
                " RST Flag Count": int(rng.integers(2, 7)),
                " ACK Flag Count": tot_pkts,
                " Average Packet Size": round((tot_fwd + tot_bwd) / tot_pkts, 2),
                "Init_Win_bytes_forward": float(rng.choice([64.0, 128.0, 256.0])),
                "Active Mean": round(float(rng.uniform(180000.0, 390000.0)), 2),
                " Label": "MITM-Relay-Interception" if is_mitm else "Botnet",
            }
        )

    df = pd.DataFrame(rows)
    df.to_csv(out_path, index=False)


def main() -> None:
    out_dir = REPO_ROOT / "test_datasets"
    out_dir.mkdir(parents=True, exist_ok=True)

    df_full, _ = load_or_prepare_cicids2017_dataset(
        n_samples=600, random_seed=2026, inject_realistic_artifacts=False
    )

    # 1. Mixed SOC capture (120 flows with intentional Infinity & duplicate rows to test sanitizer)
    mixed = df_full.head(115).copy()
    mixed.loc[2, "flow_bytes_s"] = np.inf
    mixed.loc[7, "flow_packets_s"] = np.nan
    mixed = pd.concat([mixed, mixed.iloc[:5]], ignore_index=True)
    p1 = out_dir / "1_mixed_soc_capture_120_flows.csv"
    mixed.to_csv(p1, index=False)

    # 2. Unseen MITM & Zero-Day Anomalies
    p2 = out_dir / "2_unseen_mitm_and_c2_anomalies.csv"
    build_mitm_and_anomaly_csv(p2)

    # 3. Clean Enterprise Baseline Traffic
    benign = df_full[df_full["label"] == "BENIGN"].head(60).copy()
    p3 = out_dir / "3_clean_enterprise_baseline.csv"
    benign.to_csv(p3, index=False)

    print(f"Created test datasets in {out_dir}:")
    print(f" - {p1}")
    print(f" - {p2}")
    print(f" - {p3}")


if __name__ == "__main__":
    main()
