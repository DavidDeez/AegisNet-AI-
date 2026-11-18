"""Canonical CIC-IDS2017 network flow feature schema, alias mappings, and attack taxonomy."""
from __future__ import annotations

from typing import Final

# 24 core discriminative CIC-IDS2017 network flow features used in the ML feature matrix.
# Notice: Source IP, Destination IP, Source Port, Flow ID, and Timestamp are intentionally
# excluded from the ML feature matrix to prevent identity/temporal data leakage.
CANONICAL_FEATURES: Final[list[str]] = [
    "destination_port",
    "flow_duration",
    "total_fwd_packets",
    "total_backward_packets",
    "total_length_of_fwd_packets",
    "total_length_of_bwd_packets",
    "fwd_packet_length_max",
    "fwd_packet_length_mean",
    "bwd_packet_length_max",
    "bwd_packet_length_mean",
    "flow_bytes_s",
    "flow_packets_s",
    "flow_iat_mean",
    "flow_iat_std",
    "flow_iat_max",
    "fwd_iat_mean",
    "bwd_iat_mean",
    "fwd_psh_flags",
    "syn_flag_count",
    "rst_flag_count",
    "ack_flag_count",
    "average_packet_size",
    "init_win_bytes_forward",
    "active_mean",
]

FEATURE_DESCRIPTIONS: Final[dict[str, str]] = {
    "destination_port": "Target transport port on destination host",
    "flow_duration": "Total duration of the network flow in microseconds",
    "total_fwd_packets": "Total packets transmitted in forward direction",
    "total_backward_packets": "Total packets transmitted in backward (response) direction",
    "total_length_of_fwd_packets": "Total payload bytes in forward packets",
    "total_length_of_bwd_packets": "Total payload bytes in backward packets",
    "fwd_packet_length_max": "Maximum packet size in forward direction (bytes)",
    "fwd_packet_length_mean": "Mean packet size in forward direction (bytes)",
    "bwd_packet_length_max": "Maximum packet size in backward direction (bytes)",
    "bwd_packet_length_mean": "Mean packet size in backward direction (bytes)",
    "flow_bytes_s": "Flow byte throughput rate (bytes/second)",
    "flow_packets_s": "Flow packet rate (packets/second)",
    "flow_iat_mean": "Mean inter-arrival time between packets (microseconds)",
    "flow_iat_std": "Standard deviation of packet inter-arrival time",
    "flow_iat_max": "Maximum inter-arrival gap between consecutive packets",
    "fwd_iat_mean": "Mean forward inter-arrival time (microseconds)",
    "bwd_iat_mean": "Mean backward inter-arrival time (microseconds)",
    "fwd_psh_flags": "Count of TCP PSH flags set in forward direction",
    "syn_flag_count": "Count of TCP SYN flags in the flow",
    "rst_flag_count": "Count of TCP RST connection reset flags",
    "ack_flag_count": "Count of TCP ACK flags in the flow",
    "average_packet_size": "Average packet payload size across entire flow (bytes)",
    "init_win_bytes_forward": "Initial TCP window size in forward direction (bytes)",
    "active_mean": "Mean time flow was actively transmitting before going idle",
}

# Mapping from raw CIC-IDS2017 CSV headers (cleaned of whitespace/case) to canonical names
CICIDS2017_COLUMN_ALIASES: Final[dict[str, str]] = {
    "destination port": "destination_port",
    "dst port": "destination_port",
    "dport": "destination_port",
    "flow duration": "flow_duration",
    "total fwd packets": "total_fwd_packets",
    "tot fwd pkts": "total_fwd_packets",
    "total backward packets": "total_backward_packets",
    "tot bwd pkts": "total_backward_packets",
    "total length of fwd packets": "total_length_of_fwd_packets",
    "totlen fwd pkts": "total_length_of_fwd_packets",
    "total length of bwd packets": "total_length_of_bwd_packets",
    "totlen bwd pkts": "total_length_of_bwd_packets",
    "fwd packet length max": "fwd_packet_length_max",
    "fwd pkt len max": "fwd_packet_length_max",
    "fwd packet length mean": "fwd_packet_length_mean",
    "fwd pkt len mean": "fwd_packet_length_mean",
    "bwd packet length max": "bwd_packet_length_max",
    "bwd pkt len max": "bwd_packet_length_max",
    "bwd packet length mean": "bwd_packet_length_mean",
    "bwd pkt len mean": "bwd_packet_length_mean",
    "flow bytes/s": "flow_bytes_s",
    "flow byts/s": "flow_bytes_s",
    "flow packets/s": "flow_packets_s",
    "flow pkts/s": "flow_packets_s",
    "flow iat mean": "flow_iat_mean",
    "flow iat std": "flow_iat_std",
    "flow iat max": "flow_iat_max",
    "fwd iat mean": "fwd_iat_mean",
    "bwd iat mean": "bwd_iat_mean",
    "fwd psh flags": "fwd_psh_flags",
    "syn flag count": "syn_flag_count",
    "syn flag cnt": "syn_flag_count",
    "rst flag count": "rst_flag_count",
    "rst flag cnt": "rst_flag_count",
    "ack flag count": "ack_flag_count",
    "ack flag cnt": "ack_flag_count",
    "average packet size": "average_packet_size",
    "pkt size avg": "average_packet_size",
    "init_win_bytes_forward": "init_win_bytes_forward",
    "init fwd win byts": "init_win_bytes_forward",
    "active mean": "active_mean",
    # Metadata columns (never used as model features)
    "source ip": "src_ip",
    "src ip": "src_ip",
    "destination ip": "dst_ip",
    "dst ip": "dst_ip",
    "source port": "src_port",
    "src port": "src_port",
    "protocol": "protocol",
    "timestamp": "flow_timestamp",
    "flow id": "flow_id",
    "label": "label",
    "attack_family": "label",
    "session_group": "session_group",
}

METADATA_COLUMNS: Final[set[str]] = {
    "flow_id",
    "src_ip",
    "dst_ip",
    "src_port",
    "protocol",
    "flow_timestamp",
    "label",
    "session_group",
}

# Normalization of raw CIC-IDS2017 label strings into canonical attack families
LABEL_NORMALIZATION_MAP: Final[dict[str, str]] = {
    "benign": "BENIGN",
    "normal": "BENIGN",
    "dos hulk": "DoS Hulk",
    "dos goldeneye": "DoS Hulk",
    "dos slowloris": "DoS Slowloris",
    "dos slowhttptest": "DoS Slowloris",
    "portscan": "PortScan",
    "port scan": "PortScan",
    "ddos": "DDoS",
    "ddos loit": "DDoS",
    "ftp-patator": "BruteForce",
    "ssh-patator": "BruteForce",
    "bruteforce": "BruteForce",
    "brute force": "BruteForce",
    "web attack - brute force": "WebAttack",
    "web attack - xss": "WebAttack",
    "web attack - sql injection": "WebAttack",
    "webattack": "WebAttack",
    "bot": "Botnet",
    "botnet": "Botnet",
    "infiltration": "Infiltration",
    "heartbleed": "Infiltration",
}


def normalize_label(raw_label: str | None) -> str | None:
    if raw_label is None:
        return None
    cleaned = str(raw_label).strip()
    if not cleaned:
        return None
    lower = cleaned.lower().replace("\ufffd", "-")
    for key, val in LABEL_NORMALIZATION_MAP.items():
        if lower == key or key in lower:
            return val
    return cleaned
