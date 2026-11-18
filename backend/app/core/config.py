"""Configuration management for AegisNet using environment variables with safe defaults."""
from __future__ import annotations

import os
from pathlib import Path
from dataclasses import dataclass, field


BASE_DIR = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv_files() -> None:
    """Loads key=value pairs from .env in project root or backend directory into os.environ."""
    for env_path in (BASE_DIR / ".env", BACKEND_DIR / ".env"):
        if env_path.exists():
            try:
                for raw_line in env_path.read_text(encoding="utf-8").splitlines():
                    line = raw_line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    if key and key not in os.environ:
                        os.environ[key] = val
            except Exception:
                pass


_load_dotenv_files()


def _parse_cors(origins_str: str) -> list[str]:
    return [o.strip() for o in origins_str.split(",") if o.strip()]


@dataclass
class Settings:
    app_name: str = os.getenv("APP_NAME", "AegisNet")
    app_env: str = os.getenv("APP_ENV", "development")
    app_version: str = os.getenv("APP_VERSION", "1.0.0")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")

    backend_host: str = os.getenv("BACKEND_HOST", "127.0.0.1")
    backend_port: int = int(os.getenv("BACKEND_PORT", "8000"))
    cors_origins: list[str] = field(
        default_factory=lambda: _parse_cors(
            os.getenv(
                "CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,http://localhost:3000",
            )
        )
    )

    data_dir: Path = field(
        default_factory=lambda: Path(os.getenv("DATA_DIR", str(BACKEND_DIR / "data")))
    )
    artifacts_dir: Path = field(
        default_factory=lambda: Path(
            os.getenv("MODEL_ARTIFACTS_DIR", str(BACKEND_DIR / "artifacts"))
        )
    )
    database_url: str = field(
        default_factory=lambda: os.getenv(
            "DATABASE_URL",
            f"sqlite:///{(BACKEND_DIR / 'data' / 'aegisnet.db').as_posix()}",
        )
    )

    api_key_header: str = os.getenv("API_KEY_HEADER", "X-AegisNet-Key")
    optional_api_key: str = os.getenv("OPTIONAL_API_KEY", "")
    max_upload_size_mb: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50"))
    rate_limit_requests_per_minute: int = int(
        os.getenv("RATE_LIMIT_REQUESTS_PER_MINUTE", "240")
    )

    # Triage & Uncertainty Thresholds (persisted in DB settings, initialized from env)
    default_confidence_threshold: float = float(
        os.getenv("DEFAULT_CONFIDENCE_THRESHOLD", "0.70")
    )
    default_entropy_threshold: float = float(
        os.getenv("DEFAULT_ENTROPY_THRESHOLD", "0.55")
    )
    default_anomaly_percentile: float = float(
        os.getenv("DEFAULT_ANOMALY_PERCENTILE", "95.0")
    )
    random_seed: int = int(os.getenv("RANDOM_SEED", "42"))

    # Optional Fireworks AI Analyst Copilot settings (kept in environment variables, never hardcoded)
    fireworks_api_key: str = os.getenv("FIREWORKS_API_KEY", "")
    fireworks_base_url: str = os.getenv(
        "FIREWORKS_BASE_URL",
        "https://api.fireworks.ai/inference/v1/chat/completions",
    )
    fireworks_model: str = os.getenv(
        "FIREWORKS_MODEL",
        "accounts/fireworks/models/llama-v3p3-70b-instruct",
    )

    def ensure_dirs(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)

    def masked_fireworks_key(self) -> str:
        key = self.fireworks_api_key.strip()
        if not key:
            return "not_configured"
        if len(key) <= 8:
            return "***"
        return f"{key[:4]}...{key[-4:]}"


settings = Settings()
settings.ensure_dirs()
