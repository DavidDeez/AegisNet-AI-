# AegisNet — AI-Powered Network Intrusion Detection & Threat Intelligence Platform

AegisNet is a full-stack network intrusion detection system (NIDS) and explainable threat intelligence platform built with **FastAPI**, **scikit-learn**, **SHAP**, **SQLite/PostgreSQL**, and **React + TypeScript**.

It analyzes network-flow telemetry, classifies known attack families with calibrated probabilities, flags structural anomalies and unseen attack patterns via open-set anomaly detection, quantifies predictive uncertainty using normalized Shannon entropy, and provides global and local TreeSHAP explanations for human analysts.

---

## 1. Architecture & Core Design Principles

```
AEGISNET/
├── .env.example                     # Environment configuration template
├── docker-compose.yml               # Local multi-container orchestration
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py                  # FastAPI app & reproducible bootstrap
│   │   ├── api/routes.py            # Validated REST endpoints (/api/v1/*)
│   │   ├── core/
│   │   │   ├── config.py            # Environment & threshold settings
│   │   │   ├── logging_config.py    # Structured JSON logging
│   │   │   └── security.py          # Sliding-window rate limiting & API key guard
│   │   ├── db/
│   │   │   ├── session.py           # SQLite / PostgreSQL connection management
│   │   │   ├── models.py            # ORM schema definitions
│   │   │   └── repository.py        # Persistence & analytical aggregations
│   │   ├── ml/
│   │   │   ├── schema.py            # 24 canonical CIC-IDS2017 flow features & aliases
│   │   │   ├── preprocessing.py     # Train-only leakage-free pipeline & PSI drift detector
│   │   │   ├── dataset_generator.py # CIC-IDS2017 CSV loader & reproducible benchmark generator
│   │   │   ├── engine.py            # Calibrated RF, Isolation Forest, Open-Set & Entropy engine
│   │   │   └── explainer.py         # TreeSHAP global & local additive feature attributions
│   │   ├── schemas/api_models.py    # Pydantic v2 input/output validation
│   │   └── services/validation.py   # CSV sanitizer, NaN/Inf handler & deduplicator
│   ├── scripts/
│   │   └── prepare_cicids2017.py    # Standalone CLI dataset validator & experiment runner
│   └── tests/
│       └── test_aegisnet.py         # Unit & integration test suite
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx                  # Cybersecurity operations shell
        ├── api/client.ts            # Typed REST API client
        ├── components/Badge.tsx     # Triage, severity, review & score meters
        ├── screens/                 # All 8 required operational screens
        └── types/aegis.ts           # Strict TypeScript interfaces
```

### Strict Separation of Risk & Uncertainty Scores
AegisNet never conflates anomaly scores with calibrated attack probabilities:
1. **Supervised Confidence ($\max_c P(y=c \mid x)$)**: Derived from a sigmoid-calibrated Random Forest (`CalibratedClassifierCV` over 3-fold out-of-fold predictions) trained on known traffic classes.
2. **Known-Attack Probability ($1 - P(\text{BENIGN} \mid x)$)**: Calibrated probability mass assigned to known training attack signatures.
3. **Predictive Uncertainty ($H_{\text{norm}}(p)$)**: Normalized Shannon entropy across the $K$ known classes:
   $$H_{\text{norm}}(p) = -\frac{1}{\ln K}\sum_{k=1}^{K} p_k \ln(p_k) \in [0, 1]$$
   accompanied by prediction margin ($p_{(1)} - p_{(2)}$), multi-class Brier score, and Expected Calibration Error (ECE).
4. **Isolation Forest Anomaly Score & Empirical Percentile**: Computed as $-\text{decision\_function}(x)$ from an `IsolationForest` fitted strictly on clean training `BENIGN` flows, alongside its empirical percentile ($p \in [0, 100]$) relative to the training benign reference distribution.

### Four-Category Triage Taxonomy
| Triage Category | Operational Rule | Meaning for Analyst |
| :--- | :--- | :--- |
| `KNOWN_ATTACK` | Top class $\neq \text{BENIGN}$, Confidence $\ge \tau_c$, Entropy $< \tau_H$ | Matches a known training attack signature with high calibrated confidence. |
| `ANOMALOUS_UNKNOWN` | Anomaly percentile $\ge \tau_{\text{IF}}$ (default p95) while not a high-certainty known attack | Statistically rare flow relative to benign baseline; candidate novel/unseen pattern requiring triage (**not** an automatic zero-day confirmation). |
| `UNCERTAIN` | Normalized entropy $\ge \tau_H$ or confidence $< \tau_c$ | Ambiguous flow near decision boundary; queued for human verification. |
| `BENIGN` | Top class $= \text{BENIGN}$, high confidence, low entropy, normal anomaly percentile | Verified normal baseline traffic. |

---

## 2. Dataset Preparation & Reproducible ML Experiment (CIC-IDS2017)

### Using Full Local CIC-IDS2017 CSV Captures
1. Download the official **CIC-IDS2017** CSV traffic files (`MachineLearningCVE.zip`) from the Canadian Institute for Cybersecurity (University of New Brunswick).
2. Place one or more `.csv` files (e.g., `Wednesday-workingHours.pcap_ISCX.csv`, `Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv`) inside:
   ```text
   backend/data/cicids2017/
   ```
3. Run the dataset preparation and experiment script:
   ```bash
   cd backend
   python -m scripts.prepare_cicids2017 --samples 10000 --split group_time_aware
   ```

### Reproducible Out-of-the-Box Benchmark Mode
When multi-gigabyte raw CIC-IDS2017 CSV files are not present in `backend/data/cicids2017/`, AegisNet automatically generates a deterministic, physically consistent **CIC-IDS2017-schema network flow benchmark dataset** (`backend/data/cicids2017_benchmark_sample.csv`) and clearly labels `dataset_source = "cicids2017_schema_benchmark"` in all API responses and UI screens.
- Includes realistic CIC-IDS2017 data quality edge cases (`Infinity` in `Flow Bytes/s` when `Flow Duration == 0`, `NaN` cells, leading-space column headers, and duplicate packet captures) so the sanitization pipeline is genuinely tested.
- Holds out `Botnet` and `WebAttack` completely from supervised training to evaluate **open-set unknown attack detection** against held-out attack families.

---

## 3. Local Setup & Running Instructions

### Prerequisites
- **Python** 3.10+ (tested on Python 3.11–3.13)
- **Node.js** 18+ and **npm** 9+

### Step 1: Start the Backend API Server
```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
On first startup, the backend initializes `backend/data/aegisnet.db`, executes the reproducible training and open-set evaluation pipeline, saves the fitted artifact to `backend/artifacts/`, and scores an initial verification batch.

### Step 2: Start the Frontend Operations Dashboard
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

### Running Tests
```bash
cd backend
python -m unittest discover -s tests -v
# or with pytest:
pytest -v
```

---

## 4. REST API Reference (`/api/v1`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Service health, active model version, known/held-out classes, and explainer status |
| `GET` | `/api/v1/overview` | Traffic volume, triage counts, severity distribution, recent events, and system health |
| `GET` | `/api/v1/threat-intel` | Attack breakdown, targeted ports, suspicious sources, and uncertainty vs. anomaly points |
| `POST` | `/api/v1/detection/upload-csv` | Validate, sanitize, deduplicate, and score an uploaded `.csv` network flow dataset |
| `POST` | `/api/v1/detection/analyze-flows` | Score structured JSON flow records with full SHAP explanations and drift PSI |
| `POST` | `/api/v1/detection/analyze-benchmark-slice` | Score a reproducible slice of CIC-IDS2017 benchmark flows (including held-out families) |
| `GET` | `/api/v1/events` | Searchable, filterable, paginated event explorer endpoint |
| `GET` | `/api/v1/events/{event_uid}` | Full single-event inspection (24 flow attributes, probabilities, and local TreeSHAP) |
| `PATCH` | `/api/v1/events/{event_uid}/review` | Update analyst disposition (`UNREVIEWED`, `CONFIRMED_THREAT`, `FALSE_POSITIVE`, `ESCALATED`) |
| `GET` | `/api/v1/explainability/global` | Global `mean(|SHAP|)` and Gini feature importance rankings |
| `GET` | `/api/v1/explainability/event/{event_uid}` | Local additive TreeSHAP waterfall attribution for a specific flow |
| `GET` | `/api/v1/models` | Active model run, historical runs, confusion matrix, calibration, and open-set metrics |
| `POST` | `/api/v1/models/train` | Trigger a reproducible training & open-set evaluation run |
| `GET` | `/api/v1/monitoring` | Inference latency (avg/p95/max), Population Stability Index (PSI) feature drift, and errors |
| `GET/PUT` | `/api/v1/settings` | Inspect or update confidence, entropy, anomaly percentile, and drift thresholds |

---

## 5. Scientific Limitations & Engineering Trade-Offs

1. **Experimental Definition of Unknown Attacks**: In the open-set evaluation, "unknown attacks" are operationally defined as attack families (`Botnet`, `WebAttack`) held out from the supervised training partition. High open-set AUROC on held-out families demonstrates sensitivity to unseen flow patterns, **not** universal detection of all possible zero-day exploits.
2. **Anomaly Score $\neq$ Maliciousness Probability**: Isolation Forest measures statistical isolation in feature space relative to benign training traffic. Legitimate network changes (e.g., new backup protocols or flash crowds) can also produce high anomaly percentiles and PSI drift alerts, which is why AegisNet routes them to `ANOMALOUS_UNKNOWN` for human analyst triage.
3. **Encrypted Payload Blindness**: Like all flow-header NIDS built on NetFlow/CICFlowMeter statistics, AegisNet inspects packet timing, flags, and byte-length distributions rather than deep packet payloads.

---

## 6. Capturing Verification Screenshots
1. Start both backend (`port 8000`) and frontend (`port 5173`).
2. Capture **Overview** (`http://localhost:5173`) showing real flow counts, triage taxonomy table, and severity distribution.
3. Open **Threat Intelligence** to capture the 2D Uncertainty vs. Anomaly Percentile decision plane and held-out family recall cards.
4. Open **Detection Center** to upload `backend/data/cicids2017_benchmark_sample.csv` or score a single custom flow.
5. Open **Explainability (SHAP)** to capture the global `mean(|SHAP|)` ranking alongside a single-event local SHAP waterfall.
6. Open **Model Lab** to capture the closed-set confusion matrix, reliability calibration table, and open-set AUROC/AUPRC results.
