from __future__ import annotations

from typing import List, Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ------------------------------------------------------------------ #
    # Database
    # ------------------------------------------------------------------ #
    DATABASE_URL: str  # postgresql+asyncpg://user:pass@host/db

    # ------------------------------------------------------------------ #
    # Redis / Celery
    # ------------------------------------------------------------------ #
    REDIS_URL: str = "redis://localhost:6379/0"

    # ------------------------------------------------------------------ #
    # JWT / Auth
    # ------------------------------------------------------------------ #
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ------------------------------------------------------------------ #
    # SMS Gateway  (Eskiz or Playmobile)
    # ------------------------------------------------------------------ #
    SMS_PROVIDER: str = "eskiz"        # "eskiz" | "playmobile"
    SMS_SENDER_ID: str = "AndozaAI"

    # Eskiz credentials
    ESKIZ_EMAIL: str = ""
    ESKIZ_PASSWORD: str = ""

    # Playmobile credentials
    PLAYMOBILE_URL: str = "https://send.smsxabar.uz/broker-api/send"
    PLAYMOBILE_LOGIN: str = ""
    PLAYMOBILE_PASSWORD: str = ""

    # ------------------------------------------------------------------ #
    # S3-compatible object storage
    # ------------------------------------------------------------------ #
    S3_BUCKET: str = "andoza-ai-media"
    S3_REGION: str = "us-east-1"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    # Leave blank to use AWS S3; set to e.g. https://s3.uz for MinIO/local
    S3_ENDPOINT_URL: str = ""

    # ------------------------------------------------------------------ #
    # Local media storage
    #
    # Used whenever S3 credentials are absent, so a fresh checkout can accept
    # uploads without any cloud setup. Files are served from MEDIA_URL_PREFIX.
    # Keep MEDIA_ROOT on a mounted volume — it holds user uploads.
    # ------------------------------------------------------------------ #
    MEDIA_ROOT: str = "/app/media"
    MEDIA_URL_PREFIX: str = "/media"

    @property
    def s3_configured(self) -> bool:
        """True when object storage is usable; otherwise uploads go to disk.

        Placeholder values from `.env.example` ("your-access-key") count as
        unconfigured — uploading against them fails with a confusing 502.
        """
        key = self.S3_ACCESS_KEY.strip()
        secret = self.S3_SECRET_KEY.strip()
        if not key or not secret:
            return False
        return not key.startswith("your-") and not secret.startswith("your-")

    # ------------------------------------------------------------------ #
    # Observability
    # ------------------------------------------------------------------ #
    SENTRY_DSN: Optional[str] = None

    # ------------------------------------------------------------------ #
    # Rate limiting / OTP caps
    # ------------------------------------------------------------------ #
    TRUST_PROXY_HEADERS: bool = False
    OTP_GLOBAL_DAILY_LIMIT: int = 2000

    # ------------------------------------------------------------------ #
    # AI features
    # ------------------------------------------------------------------ #
    AI_FEATURES_ENABLED: bool = False
    # OpenAI-compatible LLM provider — see app/services/llm.py.
    # Leave OPENAI_BASE_URL empty for api.openai.com; point it at another
    # OpenAI-compatible endpoint to switch providers, e.g. Google Gemini:
    #   OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
    #   OPENAI_API_KEY=<Gemini key>  AI_MODEL_*=gemini-2.5-flash
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = ""
    AI_MODEL_BUILDER: str = "gpt-4-turbo"
    AI_MODEL_EXPLAINER: str = "gpt-4-mini"

    # Meshy API — Image to 3D conversion
    MESHY_API_KEY: str = ""
    MESHY_API_URL: str = "https://api.meshy.ai/v2"

    # ------------------------------------------------------------------ #
    # Application
    # ------------------------------------------------------------------ #
    ENVIRONMENT: str = "development"
    CORS_ORIGINS_STR: str = "http://localhost:3000,http://localhost:5173,http://localhost:8081,http://localhost:8082"

    @property
    def CORS_ORIGINS(self) -> List[str]:
        raw = self.CORS_ORIGINS_STR.strip()
        if raw.startswith("["):
            import json
            return json.loads(raw)
        return [o.strip() for o in raw.split(",") if o.strip()]

    # ------------------------------------------------------------------ #
    # Validators
    # ------------------------------------------------------------------ #
    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def ensure_async_driver(cls, value: str) -> str:
        """Ensure the URL uses the asyncpg driver."""
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+asyncpg://", 1)
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+asyncpg://", 1)
        return value


settings = Settings()  # type: ignore[call-arg]
