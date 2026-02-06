from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis
from sqlalchemy import text

from app import __version__
from app.api.router import api_router
from app.config import settings
from app.core.middleware import RequestLoggingMiddleware
from app.database import engine

logger = structlog.get_logger(__name__)

# Module-level references for health checks
_redis: Redis | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: connect to Redis and verify DB on startup, cleanup on shutdown."""
    global _redis

    # Verify database connection
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        await logger.ainfo("database_connected")
    except Exception as exc:
        await logger.aerror("database_connection_failed", error=str(exc))

    # Connect to Redis
    try:
        _redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
        await _redis.ping()
        await logger.ainfo("redis_connected")
    except Exception as exc:
        await logger.aerror("redis_connection_failed", error=str(exc))
        _redis = None

    await logger.ainfo("application_started", version=__version__)

    yield

    # Shutdown
    if _redis is not None:
        await _redis.aclose()
        _redis = None

    await engine.dispose()
    await logger.ainfo("application_shutdown")


def create_app() -> FastAPI:
    """Application factory."""
    app = FastAPI(
        title="Claude Orchestrator",
        description="AI task orchestration platform",
        version=__version__,
        lifespan=lifespan,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Request logging
    app.add_middleware(RequestLoggingMiddleware)

    # API routes
    app.include_router(api_router)

    # Health endpoint
    @app.get("/health", tags=["health"])
    async def health_check() -> dict:
        """Health check endpoint returning DB and Redis status."""
        db_ok = False
        redis_ok = False

        # Check database
        try:
            async with engine.begin() as conn:
                await conn.execute(text("SELECT 1"))
            db_ok = True
        except Exception:
            pass

        # Check Redis
        try:
            if _redis is not None:
                await _redis.ping()
                redis_ok = True
        except Exception:
            pass

        overall = "healthy" if (db_ok and redis_ok) else "degraded"

        return {
            "status": overall,
            "version": __version__,
            "services": {
                "database": "connected" if db_ok else "disconnected",
                "redis": "connected" if redis_ok else "disconnected",
            },
        }

    return app


app = create_app()
