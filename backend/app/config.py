from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    DATABASE_URL: str = "postgresql+asyncpg://claude:claude@postgres:5432/orchestrator"
    REDIS_URL: str = "redis://redis:6379/0"
    AUTH_BYPASS: bool = True
    DEFAULT_MODEL: str = "sonnet"
    DEFAULT_MAX_TURNS: int = 25
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]
    PROCESS_STOP_TIMEOUT: int = 10
    MAX_OUTPUT_BUFFER_LINES: int = 5000
    QUEUE_POLL_INTERVAL: float = 1.0
    COST_PER_INPUT_TOKEN: float = 0.003
    COST_PER_OUTPUT_TOKEN: float = 0.015

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


settings = Settings()
