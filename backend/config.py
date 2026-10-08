"""
Configuration and Environment Settings for Sentinel AI.
Loads settings from .env file securely without hardcoded secrets.
"""

import os
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseModel):
    app_env: str = Field(default_factory=lambda: os.getenv("APP_ENV", "development"))
    debug: bool = Field(default_factory=lambda: os.getenv("DEBUG", "true").lower() in ("true", "1", "yes"))
    port: int = Field(default_factory=lambda: int(os.getenv("PORT", "8000")))
    database_url: str = Field(
        default_factory=lambda: os.getenv(
            "DATABASE_URL", "postgresql://user:password@localhost:5432/sensordb"
        )
    )
    alert_webhook_secret: str = Field(
        default_factory=lambda: os.getenv("ALERT_WEBHOOK_SECRET", "default_dev_secret")
    )
    external_notifier_api_key: str = Field(
        default_factory=lambda: os.getenv("EXTERNAL_NOTIFIER_API_KEY", "default_dev_key")
    )


settings = Settings()
