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
from app.services.process_manager import ClaudeProcessManager
from app.services.queue_manager import QueueManager
from app.services.stream_manager import StreamManager

logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: initialize services on startup, cleanup on shutdown."""

    # Verify database connection
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        await logger.ainfo("database_connected")
    except Exception as exc:
        await logger.aerror("database_connection_failed", error=str(exc))

    # Connect to Redis
    redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        await redis.ping()
        await logger.ainfo("redis_connected")
    except Exception as exc:
        await logger.aerror("redis_connection_failed", error=str(exc))

    # Initialize services
    stream_manager = StreamManager()
    process_manager = ClaudeProcessManager()
    queue_manager = QueueManager(
        redis=redis,
        process_manager=process_manager,
        stream_manager=stream_manager,
    )

    # Wire ProcessManager output to StreamManager broadcasts
    async def on_output(instance_id, task_id, line, stream_name):
        from datetime import datetime, timezone

        await stream_manager.broadcast(instance_id, {
            "type": "output",
            "instance_id": str(instance_id),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": {
                "task_id": str(task_id),
                "line": line,
                "stream": stream_name,
            },
        })

    process_manager.on_output(on_output)

    # Store services on app.state for dependency injection
    app.state.redis = redis
    app.state.stream_manager = stream_manager
    app.state.process_manager = process_manager
    app.state.queue_manager = queue_manager

    # Start background queue processing
    await queue_manager.start()

    await logger.ainfo("application_started", version=__version__)

    yield

    # Shutdown
    await queue_manager.stop()
    await process_manager.stop_all()
    await stream_manager.close()
    await redis.aclose()
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
        """Health check endpoint returning DB, Redis, and services status."""
        db_ok = False
        redis_ok = False

        try:
            async with engine.begin() as conn:
                await conn.execute(text("SELECT 1"))
            db_ok = True
        except Exception:
            pass

        try:
            redis: Redis | None = getattr(app.state, "redis", None)
            if redis is not None:
                await redis.ping()
                redis_ok = True
        except Exception:
            pass

        stream_mgr: StreamManager | None = getattr(app.state, "stream_manager", None)
        queue_running = getattr(app.state, "queue_manager", None) is not None

        overall = "healthy" if (db_ok and redis_ok) else "degraded"

        return {
            "status": overall,
            "version": __version__,
            "services": {
                "database": "connected" if db_ok else "disconnected",
                "redis": "connected" if redis_ok else "disconnected",
                "queue_manager": "running" if queue_running else "stopped",
                "websocket_clients": stream_mgr.get_total_connections() if stream_mgr else 0,
            },
        }

    return app


app = create_app()
