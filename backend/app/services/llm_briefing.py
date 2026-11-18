"""
Optional Fireworks AI SOC Incident Briefing & Playbook Synthesizer.

Strictly grounded in the local ML pipeline's real outputs:
- Calibrated Random Forest class probabilities & confidence
- Normalized Shannon entropy (uncertainty)
- Isolation Forest anomaly score & empirical percentile (explicitly NOT a calibrated probability)
- Local TreeSHAP feature contributions and training baseline medians

If `FIREWORKS_API_KEY` is not set or the remote API is unreachable, falls back seamlessly to
a structured, deterministic local SOC briefing so AegisNet remains 100% functional offline.
"""
from __future__ import annotations

import json
import time
from typing import Any
import httpx

from app.core.config import settings
from app.core.logging_config import logger


SYSTEM_PROMPT = """You are a Principal Cybersecurity SOC Analyst and Network Intrusion Detection Researcher operating inside AegisNet.
You are given a JSON telemetry payload for a single network flow analyzed by AegisNet's hybrid ML pipeline:
1. Calibrated Random Forest classifier (trained on known CIC-IDS2017 classes).
2. Isolation Forest open-set anomaly detector (fitted on clean benign traffic).
3. Normalized Shannon entropy H(p)/ln(K) in [0, 1] measuring predictive uncertainty.
4. Exact additive TreeSHAP feature attributions showing how each flow feature shifted the prediction from baseline medians.

STRICT SCIENTIFIC RULES:
- Use ONLY the exact numbers present in the telemetry payload. Never invent metrics, packet payloads, or external threat feeds.
- Strictly distinguish (a) calibrated supervised confidence, (b) predictive entropy (uncertainty), and (c) Isolation Forest anomaly score/percentile.
- NEVER represent the Isolation Forest anomaly score as a calibrated probability of maliciousness, and NEVER claim an ANOMALOUS_UNKNOWN flow is a confirmed zero-day attack; explain that it is a statistical deviation from benign baseline requiring analyst verification.

Provide a concise, structured markdown brief with these 4 sections:
1. **Executive Triage Summary** (Classification, Triage Category, Severity, and Confidence vs. Uncertainty)
2. **TreeSHAP & Flow Telemetry Analysis** (Explain the top 3-4 features driving the decision compared to training medians)
3. **Open-Set Anomaly & Uncertainty Assessment** (Interpret the Shannon entropy and Isolation Forest percentile)
4. **Recommended SOC Investigation & Containment Actions** (Concrete verification commands, firewall/Zeek/Suricata inspection steps, or false-positive checks)
"""


def generate_soc_incident_brief(
    event: dict[str, Any], model_override: str | None = None
) -> dict[str, Any]:
    """
    Generates a grounded SOC analyst incident brief for a specific event using Fireworks AI
    when configured, or deterministic local synthesis when offline.
    """
    t0 = time.perf_counter()
    top_shap = (event.get("explanation") or {}).get("top_contributors", [])[:6]

    telemetry_context = {
        "event_uid": event.get("event_uid"),
        "endpoints": f"{event.get('src_ip')}:{event.get('src_port')} -> {event.get('dst_ip')}:{event.get('dst_port')} ({event.get('protocol')})",
        "triage_category": event.get("triage_category"),
        "predicted_label": event.get("predicted_label"),
        "ground_truth_label": event.get("ground_truth_label"),
        "severity": event.get("severity"),
        "supervised_confidence": event.get("supervised_confidence"),
        "known_attack_probability": event.get("known_attack_probability"),
        "prediction_margin": event.get("prediction_margin"),
        "predictive_entropy": event.get("predictive_entropy"),
        "isolation_forest_anomaly_score": event.get("anomaly_score"),
        "isolation_forest_anomaly_percentile": event.get("anomaly_percentile"),
        "class_probabilities": event.get("class_probabilities", {}),
        "top_shap_contributors": top_shap,
        "local_rationale": event.get("rationale_text"),
    }

    api_key = settings.fireworks_api_key.strip()
    target_model = (model_override or settings.fireworks_model).strip()

    if api_key:
        try:
            with httpx.Client(timeout=20.0) as client:
                resp = client.post(
                    settings.fireworks_base_url,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": target_model,
                        "temperature": 0.15,
                        "max_tokens": 700,
                        "messages": [
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {
                                "role": "user",
                                "content": (
                                    "Generate a technical SOC Incident Brief for the following AegisNet analyzed flow:\n"
                                    + json.dumps(telemetry_context, indent=2)
                                ),
                            },
                        ],
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    content = (
                        data.get("choices", [{}])[0]
                        .get("message", {})
                        .get("content", "")
                        .strip()
                    )
                    if content:
                        latency = round((time.perf_counter() - t0) * 1000.0, 1)
                        return {
                            "event_uid": event.get("event_uid"),
                            "provider": "fireworks_ai",
                            "model": target_model,
                            "latency_ms": latency,
                            "brief_markdown": content,
                        }
                else:
                    logger.warning(
                        f"Fireworks API returned status {resp.status_code}: {resp.text[:200]}"
                    )
        except Exception as exc:
            logger.warning(f"Fireworks API call failed, using local fallback: {exc}")

    # Deterministic offline fallback grounded in the exact same telemetry
    fallback_md = _build_local_deterministic_brief(telemetry_context)
    latency = round((time.perf_counter() - t0) * 1000.0, 1)
    return {
        "event_uid": event.get("event_uid"),
        "provider": "local_deterministic_engine",
        "model": "aegisnet-local-template-v1",
        "latency_ms": latency,
        "brief_markdown": fallback_md,
    }


def _build_local_deterministic_brief(ctx: dict[str, Any]) -> str:
    shap_lines = []
    for c in ctx.get("top_shap_contributors", [])[:4]:
        shap_lines.append(
            f"- **`{c['feature']}` = `{c['feature_value']}`** (training median `{c['train_median']}`, robust z `{c['robust_z_score']:+.2f}`): SHAP contribution **`{c['shap_value']:+.4f}`** ({c['direction']})."
        )
    shap_block = "\n".join(shap_lines) if shap_lines else "- No local SHAP drivers recorded."

    cat = ctx.get("triage_category")
    if cat == "KNOWN_ATTACK":
        action_block = (
            "- Correlate source endpoint with firewall/IDS connection logs on the target port.\n"
            "- Apply rate-limiting or temporary block rule if flood/brute-force volume persists.\n"
            "- Mark event as `CONFIRMED_THREAT` once host service telemetry is verified."
        )
    elif cat == "ANOMALOUS_UNKNOWN":
        action_block = (
            "- Inspect PCAP / Zeek conn.log around this flow timestamp for unfamiliar application protocols or C2 beaconing.\n"
            "- Remember that an Isolation Forest outlier is a statistical anomaly relative to benign traffic, not a guaranteed zero-day.\n"
            "- Verify whether the destination port or inter-arrival cadence matches a legitimate administrative or backup task before escalating."
        )
    elif cat == "UNCERTAIN":
        action_block = (
            "- Inspect adjacent flows from the same source IP and capture window to resolve class ambiguity.\n"
            "- Compare the top-2 class probabilities in the Event Explorer before assigning final disposition."
        )
    else:
        action_block = (
            "- No containment required; flow aligns with benign baseline statistics and normal anomaly percentiles."
        )

    return (
        f"### 1. Executive Triage Summary\n"
        f"- **Flow**: `{ctx.get('endpoints')}` (`{ctx.get('event_uid')}`)\n"
        f"- **Triage Category**: `{cat}` | **Predicted Class**: `{ctx.get('predicted_label')}` | **Severity**: `{ctx.get('severity')}`\n"
        f"- **Calibrated Top-Class Confidence**: `{float(ctx.get('supervised_confidence') or 0) * 100:.2f}%` (Margin: `{float(ctx.get('prediction_margin') or 0) * 100:.2f}%`)\n\n"
        f"### 2. TreeSHAP & Flow Telemetry Analysis\n"
        f"{shap_block}\n\n"
        f"### 3. Open-Set Anomaly & Uncertainty Assessment\n"
        f"- **Predictive Uncertainty (Normalized Shannon Entropy)**: `{float(ctx.get('predictive_entropy') or 0):.4f}` (0 = certain, 1 = uniform ambiguity)\n"
        f"- **Isolation Forest Anomaly Score**: `{float(ctx.get('isolation_forest_anomaly_score') or 0):.4f}` (**p{float(ctx.get('isolation_forest_anomaly_percentile') or 0):.1f}** vs. training benign baseline; not a calibrated probability)\n\n"
        f"### 4. Recommended SOC Investigation & Containment Actions\n"
        f"{action_block}"
    )
