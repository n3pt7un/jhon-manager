# Backend Specification

> FastAPI backend for Claude Orchestrator -- process management, task queuing, scheduling, and real-time streaming for multiple Claude Code CLI instances.

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Project Structure](#2-project-structure)
- [3. Application Entry Point](#3-application-entry-point)
- [4. Configuration](#4-configuration)
- [5. Database Layer](#5-database-layer)
- [6. ORM Models](#6-orm-models)
- [7. Pydantic Schemas](#7-pydantic-schemas)
- [8. API Routes](#8-api-routes)
- [9. Core Services](#9-core-services)
  - [9.1 Claude Process Manager](#91-claude-process-manager)
  - [9.2 Queue Manager](#92-queue-manager)
  - [9.3 Scheduler Service](#93-scheduler-service)
  - [9.4 SSH Manager](#94-ssh-manager)
  - [9.5 Stream Manager](#95-stream-manager)
  - [9.6 Usage Tracker](#96-usage-tracker)
- [10. Authentication](#10-authentication)
- [11. Middleware](#11-middleware)
- [12. Event System](#12-event-system)
- [13. Migrations](#13-migrations)
- [14. Dependencies](#14-dependencies)
- [15. Docker Configuration](#15-docker-configuration)

---

## 1. Overview

The backend is a **Python 3.11+** application built with **FastAPI**. It serves as the central nervous system of Claude Orchestrator, responsible for:

- **Process Lifecycle Management** -- Spawning, monitoring, and terminating Claude Code CLI processes as async subprocesses.
- **Task Queue Orchestration** -- Maintaining per-instance Redis-backed queues with priority ordering and sequential execution guarantees.
- **Scheduled Job Execution** -- Running cron-based tasks via APScheduler with template variable substitution.
- **Real-Time Streaming** -- Broadcasting live CLI output to connected WebSocket clients.
- **SSH Tunneling** -- Executing Claude Code on remote machines through persistent SSH connection pools.
- **Usage Analytics** -- Tracking token consumption, cost estimates, and execution history.
- **Authentication** -- Validating Cloudflare Access JWTs for secure remote access.

The backend communicates with a **PostgreSQL 16** database via **SQLAlchemy 2.0 async** and uses **Redis 7** for task queues, pub/sub messaging, and ephemeral state caching.

---

## 2. Project Structure

```
backend/
├── app/
│   ├── __init__.py                    # Package init, version constant
│   ├── main.py                        # FastAPI app factory, lifespan events
│   ├── config.py                      # Pydantic Settings (env-based configuration)
│   ├── database.py                    # Async SQLAlchemy engine + session factory
│   ├── models/                        # SQLAlchemy ORM models
│   │   ├── __init__.py                # Re-exports all models for Alembic
│   │   ├── project.py                 # Project model
│   │   ├── instance.py                # Instance model
│   │   ├── task.py                    # Task model
│   │   ├── schedule.py                # Schedule model
│   │   ├── ssh_config.py              # SSHConfig model
│   │   └── usage_log.py              # UsageLog model
│   ├── schemas/                       # Pydantic request/response schemas
│   │   ├── __init__.py
│   │   ├── project.py
│   │   ├── instance.py
│   │   ├── task.py
│   │   ├── schedule.py
│   │   ├── ssh_config.py
│   │   ├── usage.py
│   │   └── common.py                  # Shared schemas (pagination, errors)
│   ├── api/                           # API route handlers
│   │   ├── __init__.py
│   │   ├── router.py                  # Root APIRouter, aggregates all sub-routers
│   │   ├── projects.py                # /api/projects endpoints
│   │   ├── instances.py               # /api/instances endpoints
│   │   ├── tasks.py                   # /api/tasks endpoints
│   │   ├── schedules.py               # /api/schedules endpoints
│   │   ├── usage.py                   # /api/usage endpoints
│   │   ├── ssh_configs.py             # /api/ssh-configs endpoints
│   │   └── ws.py                      # WebSocket endpoint handlers
│   ├── services/                      # Business logic layer
│   │   ├── __init__.py
│   │   ├── claude_process.py          # Claude Code CLI process management
│   │   ├── queue_manager.py           # Redis-backed task queue
│   │   ├── scheduler_service.py       # APScheduler cron job management
│   │   ├── ssh_manager.py             # SSH connection pooling (Paramiko)
│   │   ├── usage_tracker.py           # Token/cost tracking and aggregation
│   │   └── stream_manager.py          # WebSocket broadcast management
│   ├── core/                          # Cross-cutting concerns
│   │   ├── __init__.py
│   │   ├── auth.py                    # Cloudflare Access JWT validation
│   │   ├── middleware.py              # Request logging, error handling
│   │   └── events.py                  # Internal event bus (pub/sub)
│   └── migrations/                    # Alembic migration scripts
│       ├── env.py                     # Alembic environment config
│       ├── script.py.mako             # Migration template
│       └── versions/                  # Generated migration files
├── alembic.ini                        # Alembic configuration
├── requirements.txt                   # Python dependencies
├── Dockerfile                         # Container build instructions
└── pyproject.toml                     # Project metadata and tooling config
```

---

## 3. Application Entry Point

### `app/main.py` -- FastAPI App Factory

The application uses FastAPI's `lifespan` context manager to coordinate startup and shutdown of all long-lived services.

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine, async_session_factory
from app.api.router import api_router
from app.services.claude_process import ClaudeProcessManager
from app.services.queue_manager import QueueManager
from app.services.scheduler_service import SchedulerService
from app.services.ssh_manager import SSHManager
from app.services.stream_manager import StreamManager
from app.services.usage_tracker import UsageTracker
from app.core.middleware import RequestLoggingMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the lifecycle of all backend services.

    Startup sequence:
        1. Initialize database connection pool
        2. Connect to Redis
        3. Start the stream manager (WebSocket hub)
        4. Start the SSH connection pool
        5. Start the Claude process manager
        6. Start the queue manager background loop
        7. Start the APScheduler scheduler
        8. Load persisted schedules from database

    Shutdown sequence (reverse order):
        1. Stop the scheduler
        2. Drain and stop the queue manager
        3. Gracefully terminate all Claude processes
        4. Close SSH connections
        5. Close the stream manager
        6. Disconnect from Redis
        7. Dispose database engine
    """
    # -- Startup --
    stream_manager = StreamManager()
    ssh_manager = SSHManager()
    usage_tracker = UsageTracker(session_factory=async_session_factory)
    process_manager = ClaudeProcessManager(
        stream_manager=stream_manager,
        ssh_manager=ssh_manager,
        usage_tracker=usage_tracker,
    )
    queue_manager = QueueManager(
        redis_url=settings.REDIS_URL,
        process_manager=process_manager,
        session_factory=async_session_factory,
    )
    scheduler_service = SchedulerService(
        queue_manager=queue_manager,
        session_factory=async_session_factory,
    )

    await queue_manager.connect()
    await queue_manager.start()
    await scheduler_service.start()

    # Attach services to app.state for dependency injection
    app.state.process_manager = process_manager
    app.state.queue_manager = queue_manager
    app.state.scheduler_service = scheduler_service
    app.state.ssh_manager = ssh_manager
    app.state.stream_manager = stream_manager
    app.state.usage_tracker = usage_tracker

    yield

    # -- Shutdown --
    await scheduler_service.stop()
    await queue_manager.stop()
    await process_manager.stop_all()
    ssh_manager.close_all()
    await stream_manager.close()
    await queue_manager.disconnect()
    await engine.dispose()


def create_app() -> FastAPI:
    """Factory function that builds and configures the FastAPI application."""
    app = FastAPI(
        title="Claude Orchestrator API",
        version="0.1.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
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

    # Custom middleware
    app.add_middleware(RequestLoggingMiddleware)

    # Mount all API routes
    app.include_router(api_router, prefix="/api")

    return app


app = create_app()
```

### Key Design Decisions

| Decision | Rationale |
|---|---|
| `lifespan` context manager over `on_event` | FastAPI's recommended pattern; ensures deterministic ordering and supports dependency sharing |
| Services attached to `app.state` | Enables FastAPI dependency injection via `Request.app.state` without global singletons |
| App factory pattern (`create_app()`) | Facilitates testing with isolated app instances and configuration overrides |

---

## 4. Configuration

### `app/config.py` -- Pydantic Settings

All configuration is loaded from environment variables with sensible defaults for local development.

```python
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    # ── Database ──────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/orchestrator"

    # ── Redis ─────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Authentication ────────────────────────────────────────
    AUTH_BYPASS: bool = False
    CLOUDFLARE_TEAM_DOMAIN: str = ""
    CLOUDFLARE_ACCESS_AUD: str = ""

    # ── Claude Defaults ───────────────────────────────────────
    DEFAULT_MODEL: str = "sonnet"
    DEFAULT_MAX_TURNS: int = 25

    # ── Server ────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: List[str] = ["http://localhost:5173"]

    # ── Process Management ────────────────────────────────────
    PROCESS_STOP_TIMEOUT: int = 10        # Seconds before SIGKILL
    MAX_OUTPUT_BUFFER_LINES: int = 5000   # Per-instance ring buffer size
    QUEUE_POLL_INTERVAL: float = 1.0      # Seconds between queue checks

    # ── Usage Tracking ────────────────────────────────────────
    COST_PER_INPUT_TOKEN: float = 0.003   # Per 1K tokens
    COST_PER_OUTPUT_TOKEN: float = 0.015  # Per 1K tokens


settings = Settings()
```

### Environment Variable Reference

| Variable | Type | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | `str` | `postgresql+asyncpg://...localhost/orchestrator` | Async PostgreSQL connection string |
| `REDIS_URL` | `str` | `redis://localhost:6379/0` | Redis connection string |
| `AUTH_BYPASS` | `bool` | `False` | Skip JWT validation (local dev only) |
| `CLOUDFLARE_TEAM_DOMAIN` | `str` | `""` | Cloudflare Access team domain (e.g. `myteam`) |
| `CLOUDFLARE_ACCESS_AUD` | `str` | `""` | Cloudflare Access application audience tag |
| `DEFAULT_MODEL` | `str` | `"sonnet"` | Default Claude model for new instances |
| `DEFAULT_MAX_TURNS` | `int` | `25` | Default max agentic turns per task |
| `LOG_LEVEL` | `str` | `"INFO"` | Python logging level |
| `CORS_ORIGINS` | `List[str]` | `["http://localhost:5173"]` | Allowed CORS origins |
| `PROCESS_STOP_TIMEOUT` | `int` | `10` | Grace period (seconds) before SIGKILL on process stop |
| `MAX_OUTPUT_BUFFER_LINES` | `int` | `5000` | Maximum lines retained in per-instance output buffer |
| `QUEUE_POLL_INTERVAL` | `float` | `1.0` | How often the queue loop checks for pending tasks |
| `COST_PER_INPUT_TOKEN` | `float` | `0.003` | Cost per 1K input tokens (for estimates) |
| `COST_PER_OUTPUT_TOKEN` | `float` | `0.015` | Cost per 1K output tokens (for estimates) |

---

## 5. Database Layer

### `app/database.py` -- Async SQLAlchemy

```python
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


engine = create_async_engine(
    settings.DATABASE_URL,
    echo=(settings.LOG_LEVEL == "DEBUG"),
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


async def get_session() -> AsyncSession:
    """FastAPI dependency that yields a database session per request."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

### Connection Pool Settings

| Parameter | Value | Rationale |
|---|---|---|
| `pool_size` | 10 | Baseline connections for steady-state load |
| `max_overflow` | 20 | Burst capacity for concurrent API requests |
| `pool_pre_ping` | True | Detects and replaces stale connections after PostgreSQL restarts |
| `pool_recycle` | 3600 | Prevents connections from hitting PostgreSQL's `idle_in_transaction_session_timeout` |

---

## 6. ORM Models

All models inherit from `Base` and use UUID primary keys with server-side defaults.

### `app/models/project.py`

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    instances: Mapped[list["Instance"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
```

### `app/models/instance.py`

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Enum as SAEnum, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.database import Base


class InstanceStatus(str, enum.Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    ERROR = "error"


class Instance(Base):
    __tablename__ = "instances"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    model: Mapped[str] = mapped_column(String(100), default="sonnet")
    max_turns: Mapped[int] = mapped_column(Integer, default=25)
    status: Mapped[InstanceStatus] = mapped_column(
        SAEnum(InstanceStatus), default=InstanceStatus.IDLE
    )
    ssh_config_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ssh_configs.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="instances")
    ssh_config: Mapped["SSHConfig | None"] = relationship()
    tasks: Mapped[list["Task"]] = relationship(
        back_populates="instance", cascade="all, delete-orphan"
    )
    schedules: Mapped[list["Schedule"]] = relationship(
        back_populates="instance", cascade="all, delete-orphan"
    )
```

### `app/models/task.py`

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Text, Integer, Float, Enum as SAEnum, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.database import Base


class TaskStatus(str, enum.Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    instance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("instances.id", ondelete="CASCADE")
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[TaskStatus] = mapped_column(
        SAEnum(TaskStatus), default=TaskStatus.PENDING
    )
    priority: Mapped[int] = mapped_column(Integer, default=0)
    position: Mapped[int] = mapped_column(Integer, default=0)
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, default=0)

    # Token usage (populated after completion)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_estimate: Mapped[float | None] = mapped_column(Float, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Source tracking
    schedule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schedules.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    instance: Mapped["Instance"] = relationship(back_populates="tasks")
    schedule: Mapped["Schedule | None"] = relationship()
```

### `app/models/schedule.py`

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Text, Boolean, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Schedule(Base):
    __tablename__ = "schedules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    instance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("instances.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    cron_expression: Mapped[str] = mapped_column(String(100), nullable=False)
    prompt_template: Mapped[str] = mapped_column(Text, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    next_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    instance: Mapped["Instance"] = relationship(back_populates="schedules")
```

### `app/models/ssh_config.py`

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SSHConfig(Base):
    __tablename__ = "ssh_configs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(Integer, default=22)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    auth_method: Mapped[str] = mapped_column(
        String(20), default="key"
    )  # "key" | "password"
    private_key_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    password_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
```

### `app/models/usage_log.py`

```python
import uuid
from datetime import datetime
from sqlalchemy import Integer, Float, String, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UsageLog(Base):
    __tablename__ = "usage_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    instance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("instances.id", ondelete="CASCADE")
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"),
        nullable=True,
    )
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_estimate: Mapped[float] = mapped_column(Float, default=0.0)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
```

### `app/models/__init__.py` -- Model Registry

```python
from app.models.project import Project
from app.models.instance import Instance, InstanceStatus
from app.models.task import Task, TaskStatus
from app.models.schedule import Schedule
from app.models.ssh_config import SSHConfig
from app.models.usage_log import UsageLog

__all__ = [
    "Project",
    "Instance",
    "InstanceStatus",
    "Task",
    "TaskStatus",
    "Schedule",
    "SSHConfig",
    "UsageLog",
]
```

---

## 7. Pydantic Schemas

### `app/schemas/common.py` -- Shared Types

```python
from pydantic import BaseModel
from typing import Generic, TypeVar
from uuid import UUID

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int


class ErrorResponse(BaseModel):
    detail: str
    error_code: str | None = None


class StatusResponse(BaseModel):
    status: str
    message: str


class ReorderRequest(BaseModel):
    ordered_ids: list[UUID]
```

### `app/schemas/task.py` -- Example Schema Module

```python
from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from app.models.task import TaskStatus


class TaskCreate(BaseModel):
    instance_id: UUID
    prompt: str = Field(..., min_length=1, max_length=50000)
    priority: int = Field(default=0, ge=0, le=100)
    max_retries: int = Field(default=0, ge=0, le=5)


class TaskUpdate(BaseModel):
    prompt: str | None = Field(None, min_length=1, max_length=50000)
    priority: int | None = Field(None, ge=0, le=100)
    position: int | None = Field(None, ge=0)


class TaskResponse(BaseModel):
    id: UUID
    instance_id: UUID
    prompt: str
    status: TaskStatus
    priority: int
    position: int
    result: dict | None
    error_message: str | None
    retry_count: int
    max_retries: int
    input_tokens: int | None
    output_tokens: int | None
    cost_estimate: float | None
    duration_seconds: float | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    schedule_id: UUID | None

    model_config = {"from_attributes": True}


class TaskBulkCreate(BaseModel):
    """Create multiple tasks at once for an instance."""
    instance_id: UUID
    prompts: list[str] = Field(..., min_length=1, max_length=50)
    priority: int = Field(default=0, ge=0, le=100)
```

---

## 8. API Routes

### `app/api/router.py` -- Route Aggregation

```python
from fastapi import APIRouter

from app.api.projects import router as projects_router
from app.api.instances import router as instances_router
from app.api.tasks import router as tasks_router
from app.api.schedules import router as schedules_router
from app.api.usage import router as usage_router
from app.api.ssh_configs import router as ssh_configs_router
from app.api.ws import router as ws_router

api_router = APIRouter()

api_router.include_router(projects_router, prefix="/projects", tags=["Projects"])
api_router.include_router(instances_router, prefix="/instances", tags=["Instances"])
api_router.include_router(tasks_router, prefix="/tasks", tags=["Tasks"])
api_router.include_router(schedules_router, prefix="/schedules", tags=["Schedules"])
api_router.include_router(usage_router, prefix="/usage", tags=["Usage"])
api_router.include_router(ssh_configs_router, prefix="/ssh-configs", tags=["SSH Configs"])
api_router.include_router(ws_router, prefix="/ws", tags=["WebSocket"])
```

### Route Handler Pattern

All route handlers follow a consistent pattern: thin controller that delegates to services.

```python
# app/api/tasks.py
from uuid import UUID
from fastapi import APIRouter, Depends, Request, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_session
from app.models.task import Task, TaskStatus
from app.schemas.task import TaskCreate, TaskResponse, TaskUpdate
from app.core.auth import require_auth

router = APIRouter(dependencies=[Depends(require_auth)])


@router.post("/", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    body: TaskCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Create a new task and enqueue it."""
    queue_manager = request.app.state.queue_manager

    task = Task(
        instance_id=body.instance_id,
        prompt=body.prompt,
        priority=body.priority,
        max_retries=body.max_retries,
        status=TaskStatus.QUEUED,
    )
    session.add(task)
    await session.flush()

    # Enqueue into Redis
    await queue_manager.enqueue(task.instance_id, task.id, body.priority)

    return task


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: UUID,
    session: AsyncSession = Depends(get_session),
):
    """Retrieve a single task by ID."""
    task = await session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: UUID,
    body: TaskUpdate,
    session: AsyncSession = Depends(get_session),
):
    """Update a pending or queued task. Running tasks cannot be modified."""
    task = await session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status not in (TaskStatus.PENDING, TaskStatus.QUEUED):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot update task in '{task.status.value}' state",
        )

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)

    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Cancel and remove a task. Running tasks are stopped first."""
    task = await session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status == TaskStatus.RUNNING:
        process_manager = request.app.state.process_manager
        await process_manager.stop_instance(task.instance_id)

    queue_manager = request.app.state.queue_manager
    await queue_manager.remove(task.instance_id, task.id)

    await session.delete(task)
```

### WebSocket Endpoint

```python
# app/api/ws.py
from uuid import UUID
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.services.stream_manager import StreamManager

router = APIRouter()


@router.websocket("/stream/{instance_id}")
async def instance_stream(
    websocket: WebSocket,
    instance_id: UUID,
):
    """
    Stream real-time output from a Claude Code instance.

    The client connects and receives JSON messages:
        {"type": "output", "data": "line of output text"}
        {"type": "status", "data": "running" | "idle" | "error"}
        {"type": "task_update", "data": {"task_id": "...", "status": "..."}}
        {"type": "queue_update", "data": [...task_ids...]}
    """
    stream_manager: StreamManager = websocket.app.state.stream_manager

    await websocket.accept()
    await stream_manager.connect(instance_id, websocket)

    try:
        while True:
            # Keep connection alive; handle client messages if needed
            data = await websocket.receive_text()
            # Client can send "ping" to keep alive
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await stream_manager.disconnect(instance_id, websocket)
```

---

## 9. Core Services

### 9.1 Claude Process Manager

**File:** `app/services/claude_process.py`

This is the most critical service in the entire backend. It is responsible for spawning Claude Code CLI processes, streaming their output in real time, handling SSH-wrapped remote execution, and performing graceful shutdown.

#### Data Structures

```python
import asyncio
import signal
import time
import logging
from collections import deque
from dataclasses import dataclass, field
from uuid import UUID
from typing import Optional

from app.config import settings
from app.services.stream_manager import StreamManager
from app.services.ssh_manager import SSHManager
from app.services.usage_tracker import UsageTracker

logger = logging.getLogger(__name__)


@dataclass
class ClaudeSession:
    """Tracks the state of a single Claude Code CLI process."""

    instance_id: UUID
    process: Optional[asyncio.subprocess.Process] = None
    working_dir: str = ""
    is_running: bool = False
    current_task_id: Optional[UUID] = None
    output_buffer: deque = field(
        default_factory=lambda: deque(maxlen=settings.MAX_OUTPUT_BUFFER_LINES)
    )
    started_at: Optional[float] = None

    # SSH context (None for local execution)
    ssh_config_id: Optional[UUID] = None
```

#### ClaudeProcessManager Class

```python
class ClaudeProcessManager:
    """
    Manages Claude Code CLI processes across all instances.

    Each instance gets at most ONE active process at a time. The process
    manager handles:
        - Building the CLI command (local or SSH-wrapped)
        - Spawning the process as an async subprocess
        - Reading stdout/stderr line by line and broadcasting via WebSocket
        - Parsing JSON output for token usage stats
        - Graceful termination with SIGTERM -> SIGKILL fallback
    """

    def __init__(
        self,
        stream_manager: StreamManager,
        ssh_manager: SSHManager,
        usage_tracker: UsageTracker,
    ):
        self._sessions: dict[UUID, ClaudeSession] = {}
        self._stream_manager = stream_manager
        self._ssh_manager = ssh_manager
        self._usage_tracker = usage_tracker
        self._read_tasks: dict[UUID, asyncio.Task] = {}

    async def execute_task(
        self,
        instance_id: UUID,
        task_id: UUID,
        prompt: str,
        working_dir: str,
        model: str = "sonnet",
        max_turns: int = 25,
        ssh_config_id: UUID | None = None,
    ) -> dict:
        """
        Execute a prompt as a Claude Code CLI process.

        This method:
            1. Builds the CLI command (local or SSH-wrapped)
            2. Spawns the process
            3. Starts an async reader task for stdout
            4. Waits for completion
            5. Parses the JSON result
            6. Records usage statistics
            7. Returns the parsed result

        Args:
            instance_id: The instance this task belongs to.
            task_id: The task being executed.
            prompt: The prompt text to send to Claude.
            working_dir: The directory Claude should operate in.
            model: The Claude model to use (e.g. "sonnet", "opus").
            max_turns: Maximum agentic turns allowed.
            ssh_config_id: Optional SSH config for remote execution.

        Returns:
            A dict containing the parsed JSON output from Claude CLI,
            or an error dict if the process failed.

        Raises:
            RuntimeError: If the instance already has a running process.
        """
        if instance_id in self._sessions and self._sessions[instance_id].is_running:
            raise RuntimeError(
                f"Instance {instance_id} already has an active process"
            )

        # Build the command
        cmd = self._build_command(
            prompt=prompt,
            working_dir=working_dir,
            model=model,
            max_turns=max_turns,
            ssh_config_id=ssh_config_id,
        )

        # Create session
        session = ClaudeSession(
            instance_id=instance_id,
            working_dir=working_dir,
            is_running=True,
            current_task_id=task_id,
            ssh_config_id=ssh_config_id,
            started_at=time.time(),
        )
        self._sessions[instance_id] = session

        # Notify WebSocket clients
        await self._stream_manager.broadcast(instance_id, {
            "type": "status",
            "data": "running",
        })
        await self._stream_manager.broadcast(instance_id, {
            "type": "task_update",
            "data": {"task_id": str(task_id), "status": "running"},
        })

        try:
            # Spawn the subprocess
            logger.info(
                "Spawning Claude process for instance %s, task %s",
                instance_id, task_id,
            )

            if ssh_config_id:
                # SSH-wrapped execution
                full_cmd = self._ssh_manager.wrap_command(ssh_config_id, cmd)
                session.process = await asyncio.create_subprocess_shell(
                    full_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
            else:
                # Local execution
                session.process = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    cwd=working_dir,
                )

            # Start the output reader coroutine
            read_task = asyncio.create_task(
                self._read_output(session)
            )
            self._read_tasks[instance_id] = read_task

            # Wait for process completion
            return_code = await session.process.wait()
            await read_task  # Ensure all output has been read

            duration = time.time() - session.started_at
            output_text = "\n".join(session.output_buffer)

            if return_code == 0:
                result = self._parse_json_output(output_text)
                # Record usage
                await self._usage_tracker.record(
                    instance_id=instance_id,
                    task_id=task_id,
                    model=model,
                    result=result,
                    duration=duration,
                )
                return {
                    "success": True,
                    "result": result,
                    "duration_seconds": duration,
                    "return_code": return_code,
                }
            else:
                logger.error(
                    "Claude process exited with code %d for instance %s",
                    return_code, instance_id,
                )
                return {
                    "success": False,
                    "error": f"Process exited with code {return_code}",
                    "output": output_text[-2000:],  # Last 2000 chars for debugging
                    "duration_seconds": duration,
                    "return_code": return_code,
                }

        except asyncio.CancelledError:
            logger.warning("Task cancelled for instance %s", instance_id)
            await self._kill_process(session)
            return {"success": False, "error": "Task was cancelled"}

        except Exception as e:
            logger.exception("Error executing task for instance %s", instance_id)
            await self._kill_process(session)
            return {"success": False, "error": str(e)}

        finally:
            session.is_running = False
            session.current_task_id = None
            self._read_tasks.pop(instance_id, None)

            await self._stream_manager.broadcast(instance_id, {
                "type": "status",
                "data": "idle",
            })

    def _build_command(
        self,
        prompt: str,
        working_dir: str,
        model: str,
        max_turns: int,
        ssh_config_id: UUID | None = None,
    ) -> list[str]:
        """
        Construct the Claude Code CLI command arguments.

        The resulting command uses --print mode (non-interactive) and
        --output-format json for machine-parseable output.

        Args:
            prompt: The prompt text.
            working_dir: Working directory for the Claude process.
            model: Claude model identifier.
            max_turns: Maximum agentic turns.
            ssh_config_id: If set, indicates the command will be SSH-wrapped.

        Returns:
            A list of command arguments (for subprocess_exec) or a single
            command string (for SSH wrapping).
        """
        cmd = [
            "claude",
            "--print",
            "--output-format", "json",
            "--model", model,
            "--max-turns", str(max_turns),
            "--prompt", prompt,
        ]

        if ssh_config_id:
            # For SSH, we need a single shell command string
            # The working_dir is applied via cd on the remote side
            import shlex
            escaped_prompt = shlex.quote(prompt)
            return [
                "claude",
                "--print",
                "--output-format", "json",
                "--model", model,
                "--max-turns", str(max_turns),
                "--prompt", escaped_prompt,
            ]

        return cmd

    async def _read_output(self, session: ClaudeSession) -> None:
        """
        Read stdout from the process line by line and broadcast each
        line to connected WebSocket clients.

        This runs as a concurrent async task alongside the process.
        Each line is:
            1. Appended to the session's output_buffer (ring buffer)
            2. Broadcast to all WebSocket clients for this instance
        """
        assert session.process is not None
        assert session.process.stdout is not None

        while True:
            line_bytes = await session.process.stdout.readline()
            if not line_bytes:
                break  # EOF -- process has closed stdout

            line = line_bytes.decode("utf-8", errors="replace").rstrip("\n")
            session.output_buffer.append(line)

            await self._stream_manager.broadcast(session.instance_id, {
                "type": "output",
                "data": line,
            })

        # Also read any remaining stderr for error reporting
        if session.process.stderr:
            stderr_bytes = await session.process.stderr.read()
            if stderr_bytes:
                stderr_text = stderr_bytes.decode("utf-8", errors="replace")
                for err_line in stderr_text.strip().split("\n"):
                    if err_line:
                        session.output_buffer.append(f"[stderr] {err_line}")
                        await self._stream_manager.broadcast(session.instance_id, {
                            "type": "output",
                            "data": f"[stderr] {err_line}",
                        })

    def _parse_json_output(self, output: str) -> dict:
        """
        Parse the JSON output from Claude CLI.

        The --output-format json flag causes Claude to emit a JSON object
        on the last line of stdout. We attempt to find and parse it.
        Preceding lines may contain progress output or streaming text.
        """
        import json

        lines = output.strip().split("\n")

        # Try the last line first (most common case)
        for line in reversed(lines):
            line = line.strip()
            if line.startswith("{"):
                try:
                    return json.loads(line)
                except json.JSONDecodeError:
                    continue

        # Fallback: return raw output
        return {"raw_output": output, "parse_error": "No JSON found in output"}

    async def stop_instance(self, instance_id: UUID) -> None:
        """
        Gracefully stop a running Claude process for an instance.

        Shutdown sequence:
            1. Send SIGTERM to the process
            2. Wait up to PROCESS_STOP_TIMEOUT seconds
            3. If still running, send SIGKILL
            4. Clean up session state

        This is called when:
            - A user manually stops an instance
            - A task is cancelled
            - The application is shutting down
        """
        session = self._sessions.get(instance_id)
        if not session or not session.is_running or not session.process:
            return

        logger.info("Stopping Claude process for instance %s", instance_id)

        # Cancel the reader task
        read_task = self._read_tasks.get(instance_id)
        if read_task:
            read_task.cancel()

        await self._kill_process(session)

        session.is_running = False
        session.current_task_id = None

        await self._stream_manager.broadcast(instance_id, {
            "type": "status",
            "data": "idle",
        })

    async def _kill_process(self, session: ClaudeSession) -> None:
        """
        Terminate a process with SIGTERM -> SIGKILL escalation.

        First sends SIGTERM for a graceful shutdown. If the process does
        not exit within PROCESS_STOP_TIMEOUT seconds, escalates to SIGKILL.
        """
        if not session.process or session.process.returncode is not None:
            return  # Already exited

        try:
            # Phase 1: Graceful termination
            session.process.send_signal(signal.SIGTERM)
            try:
                await asyncio.wait_for(
                    session.process.wait(),
                    timeout=settings.PROCESS_STOP_TIMEOUT,
                )
                logger.info(
                    "Process for instance %s terminated gracefully",
                    session.instance_id,
                )
                return
            except asyncio.TimeoutError:
                pass

            # Phase 2: Forceful termination
            logger.warning(
                "Process for instance %s did not respond to SIGTERM, "
                "sending SIGKILL",
                session.instance_id,
            )
            session.process.kill()
            await session.process.wait()

        except ProcessLookupError:
            pass  # Process already exited

    async def stop_all(self) -> None:
        """Stop all running Claude processes. Called during app shutdown."""
        running = [
            sid for sid, session in self._sessions.items()
            if session.is_running
        ]
        if running:
            logger.info("Stopping %d running Claude processes...", len(running))
            await asyncio.gather(
                *[self.stop_instance(sid) for sid in running],
                return_exceptions=True,
            )

    def get_session(self, instance_id: UUID) -> ClaudeSession | None:
        """Get the current session state for an instance."""
        return self._sessions.get(instance_id)

    def get_output_buffer(self, instance_id: UUID) -> list[str]:
        """Get the output buffer contents for an instance."""
        session = self._sessions.get(instance_id)
        if not session:
            return []
        return list(session.output_buffer)
```

#### Execution Flow Diagram

```
create_task API
      |
      v
QueueManager.enqueue()
      |
      v
Queue Loop (background task)
      |
      v
ClaudeProcessManager.execute_task()
      |
      +---> _build_command()          Build CLI args
      |
      +---> create_subprocess_exec()  Spawn process
      |         or
      |     SSHManager.wrap_command() + create_subprocess_shell()
      |
      +---> _read_output()            Async task: read stdout line-by-line
      |         |
      |         +---> StreamManager.broadcast()  -> WebSocket clients
      |         +---> output_buffer.append()     -> Ring buffer
      |
      +---> process.wait()            Await completion
      |
      +---> _parse_json_output()      Extract JSON result
      |
      +---> UsageTracker.record()     Store token/cost data
      |
      v
Return result dict to QueueManager
```

---

### 9.2 Queue Manager

**File:** `app/services/queue_manager.py`

The Queue Manager maintains a per-instance task queue backed by Redis, ensuring **sequential execution** (one task at a time per instance) with **priority-based ordering**.

#### Redis Key Patterns

| Key | Type | Description |
|---|---|---|
| `queue:{instance_id}` | Sorted Set | Pending tasks ordered by `(priority, position)` composite score |
| `queue:{instance_id}:active` | String | Task ID of the currently executing task (or empty) |
| `queue:{instance_id}:paused` | String | `"1"` if the queue is paused, key absent otherwise |
| `queue:failed:{task_id}` | Hash | Retry metadata: `count`, `next_retry_at`, `last_error` |

#### Implementation

```python
import asyncio
import json
import logging
import time
from uuid import UUID
from typing import Optional

import redis.asyncio as redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy import select, update

from app.config import settings
from app.models.task import Task, TaskStatus
from app.models.instance import Instance, InstanceStatus
from app.services.claude_process import ClaudeProcessManager

logger = logging.getLogger(__name__)


class QueueManager:
    """
    Redis-backed task queue with per-instance sequential execution.

    Design principles:
        - One task runs at a time per instance (sequential guarantee)
        - Tasks are ordered by (priority DESC, position ASC) within each queue
        - A background asyncio loop polls for ready tasks
        - Failed tasks are retried with exponential backoff
        - Queues can be paused/resumed per instance without losing tasks
    """

    def __init__(
        self,
        redis_url: str,
        process_manager: ClaudeProcessManager,
        session_factory: async_sessionmaker,
    ):
        self._redis_url = redis_url
        self._redis: Optional[redis.Redis] = None
        self._process_manager = process_manager
        self._session_factory = session_factory
        self._loop_task: Optional[asyncio.Task] = None
        self._running = False

    async def connect(self) -> None:
        """Establish Redis connection."""
        self._redis = redis.from_url(
            self._redis_url,
            decode_responses=True,
        )
        await self._redis.ping()
        logger.info("Queue manager connected to Redis")

    async def disconnect(self) -> None:
        """Close Redis connection."""
        if self._redis:
            await self._redis.close()

    async def start(self) -> None:
        """Start the background queue processing loop."""
        self._running = True
        self._loop_task = asyncio.create_task(self._process_loop())
        logger.info("Queue processing loop started")

    async def stop(self) -> None:
        """Stop the background queue processing loop."""
        self._running = False
        if self._loop_task:
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
        logger.info("Queue processing loop stopped")

    async def enqueue(
        self,
        instance_id: UUID,
        task_id: UUID,
        priority: int = 0,
    ) -> None:
        """
        Add a task to the instance's queue.

        The score in the sorted set is computed as:
            score = (100 - priority) * 1_000_000 + timestamp_micros

        This ensures higher-priority tasks (higher number) come first,
        and within the same priority, tasks are ordered by insertion time.
        """
        score = (100 - priority) * 1_000_000 + int(time.time() * 1000) % 1_000_000
        await self._redis.zadd(
            f"queue:{instance_id}",
            {str(task_id): score},
        )
        logger.debug(
            "Enqueued task %s for instance %s (priority=%d, score=%f)",
            task_id, instance_id, priority, score,
        )

    async def remove(self, instance_id: UUID, task_id: UUID) -> None:
        """Remove a task from the queue (if still pending)."""
        await self._redis.zrem(f"queue:{instance_id}", str(task_id))

    async def pause(self, instance_id: UUID) -> None:
        """Pause queue processing for an instance."""
        await self._redis.set(f"queue:{instance_id}:paused", "1")
        logger.info("Queue paused for instance %s", instance_id)

    async def resume(self, instance_id: UUID) -> None:
        """Resume queue processing for an instance."""
        await self._redis.delete(f"queue:{instance_id}:paused")
        logger.info("Queue resumed for instance %s", instance_id)

    async def is_paused(self, instance_id: UUID) -> bool:
        """Check if an instance's queue is paused."""
        return await self._redis.exists(f"queue:{instance_id}:paused") == 1

    async def get_queue(self, instance_id: UUID) -> list[str]:
        """Get all task IDs in the queue, ordered by score."""
        return await self._redis.zrange(f"queue:{instance_id}", 0, -1)

    async def get_active_task(self, instance_id: UUID) -> str | None:
        """Get the currently active task ID for an instance."""
        return await self._redis.get(f"queue:{instance_id}:active")

    async def _process_loop(self) -> None:
        """
        Background loop that dequeues and executes tasks.

        For each known instance queue, this loop:
            1. Checks if the queue is paused -> skip
            2. Checks if a task is already active -> skip
            3. Pops the highest-priority task from the sorted set
            4. Sets it as the active task
            5. Executes it via ClaudeProcessManager
            6. Updates the task record in PostgreSQL
            7. Clears the active marker
            8. Checks for retry eligibility on failure
        """
        while self._running:
            try:
                # Discover all instance queues
                instance_keys = []
                async for key in self._redis.scan_iter(match="queue:*"):
                    # Filter out :active and :paused suffixes
                    parts = key.split(":")
                    if len(parts) == 2:  # "queue:{instance_id}"
                        instance_keys.append(parts[1])

                for instance_id_str in instance_keys:
                    instance_id = UUID(instance_id_str)

                    # Skip paused queues
                    if await self.is_paused(instance_id):
                        continue

                    # Skip if a task is already running
                    active = await self.get_active_task(instance_id)
                    if active:
                        continue

                    # Pop the next task (lowest score = highest priority)
                    results = await self._redis.zpopmin(
                        f"queue:{instance_id}", count=1
                    )
                    if not results:
                        continue

                    task_id_str, _ = results[0]
                    task_id = UUID(task_id_str)

                    # Mark as active
                    await self._redis.set(
                        f"queue:{instance_id}:active",
                        task_id_str,
                    )

                    # Execute in a fire-and-forget task so we don't block
                    # the loop from processing other instances
                    asyncio.create_task(
                        self._execute_task(instance_id, task_id)
                    )

            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Error in queue processing loop")

            await asyncio.sleep(settings.QUEUE_POLL_INTERVAL)

    async def _execute_task(self, instance_id: UUID, task_id: UUID) -> None:
        """Execute a single task and handle the result."""
        async with self._session_factory() as session:
            try:
                # Load the task and instance from the database
                task = await session.get(Task, task_id)
                instance = await session.get(Instance, instance_id)

                if not task or not instance:
                    logger.error("Task %s or instance %s not found", task_id, instance_id)
                    return

                # Update statuses
                task.status = TaskStatus.RUNNING
                task.started_at = time.time()
                instance.status = InstanceStatus.RUNNING
                await session.commit()

                # Execute via process manager
                result = await self._process_manager.execute_task(
                    instance_id=instance_id,
                    task_id=task_id,
                    prompt=task.prompt,
                    working_dir=instance.project.path if instance.project else "/tmp",
                    model=instance.model,
                    max_turns=instance.max_turns,
                    ssh_config_id=instance.ssh_config_id,
                )

                # Update task with result
                if result.get("success"):
                    task.status = TaskStatus.COMPLETED
                    task.result = result.get("result")
                    task.duration_seconds = result.get("duration_seconds")

                    # Extract token usage from result
                    parsed = result.get("result", {})
                    task.input_tokens = parsed.get("input_tokens")
                    task.output_tokens = parsed.get("output_tokens")
                    if task.input_tokens and task.output_tokens:
                        task.cost_estimate = (
                            (task.input_tokens / 1000) * settings.COST_PER_INPUT_TOKEN
                            + (task.output_tokens / 1000) * settings.COST_PER_OUTPUT_TOKEN
                        )
                else:
                    await self._handle_failure(
                        session, task, instance_id,
                        result.get("error", "Unknown error"),
                    )

                task.completed_at = time.time()
                instance.status = InstanceStatus.IDLE
                await session.commit()

            except Exception:
                logger.exception(
                    "Unhandled error executing task %s for instance %s",
                    task_id, instance_id,
                )
            finally:
                # Always clear the active marker
                await self._redis.delete(f"queue:{instance_id}:active")

    async def _handle_failure(
        self,
        session: AsyncSession,
        task: Task,
        instance_id: UUID,
        error: str,
    ) -> None:
        """
        Handle a failed task with optional retry.

        Retry uses exponential backoff:
            delay = min(2^retry_count * 5, 300)  # 5s, 10s, 20s, ... max 5min

        If retries are exhausted, the task is marked as FAILED.
        """
        task.error_message = error
        task.retry_count += 1

        if task.retry_count <= task.max_retries:
            # Schedule retry with exponential backoff
            delay = min(2 ** task.retry_count * 5, 300)
            logger.info(
                "Task %s failed, retrying in %ds (attempt %d/%d)",
                task.id, delay, task.retry_count, task.max_retries,
            )
            task.status = TaskStatus.QUEUED

            # Store retry metadata in Redis
            await self._redis.hset(f"queue:failed:{task.id}", mapping={
                "count": task.retry_count,
                "next_retry_at": time.time() + delay,
                "last_error": error[:500],
            })
            await self._redis.expire(f"queue:failed:{task.id}", 86400)

            # Re-enqueue with a delayed score
            await asyncio.sleep(delay)
            await self.enqueue(instance_id, task.id, task.priority)
        else:
            task.status = TaskStatus.FAILED
            logger.error(
                "Task %s permanently failed after %d retries: %s",
                task.id, task.retry_count, error,
            )
```

#### Queue Processing State Machine

```
                +-----------+
                |  PENDING  |   (task created in DB)
                +-----+-----+
                      |
                 enqueue()
                      |
                +-----v-----+
                |  QUEUED    |   (in Redis sorted set)
                +-----+-----+
                      |
             _process_loop() pops
                      |
                +-----v-----+
                |  RUNNING   |   (active marker set)
                +-----+-----+
                     / \
                    /   \
            success     failure
              /           \
    +--------v--+    +----v---------+
    | COMPLETED |    | retry_count  |
    +-----------+    | <= max?      |
                     +---+-----+---+
                         |     |
                        yes    no
                         |     |
                    +----v-+  +v-------+
                    |QUEUED|  | FAILED |
                    +------+  +--------+
```

---

### 9.3 Scheduler Service

**File:** `app/services/scheduler_service.py`

Integrates APScheduler 4 for cron-based recurring task execution with prompt template variable substitution.

```python
import logging
from datetime import datetime
from uuid import UUID

from apscheduler import AsyncScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.datastores.sqlalchemy import SQLAlchemyDataStore
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy import select

from app.models.schedule import Schedule
from app.services.queue_manager import QueueManager
from app.models.task import Task, TaskStatus

logger = logging.getLogger(__name__)


class SchedulerService:
    """
    Cron-based task scheduler using APScheduler 4.

    Features:
        - AsyncIOScheduler with CronTrigger parsing
        - Prompt template variable substitution
        - Persistent job store via PostgreSQL (survives restarts)
        - Enable/disable schedules without deleting the job definition
        - Automatic task creation and enqueuing on trigger
    """

    # Template variables available in prompt templates
    TEMPLATE_VARS = {
        "{date}": lambda: datetime.now().strftime("%Y-%m-%d"),
        "{time}": lambda: datetime.now().strftime("%H:%M:%S"),
        "{day_of_week}": lambda: datetime.now().strftime("%A"),
        "{timestamp}": lambda: datetime.now().isoformat(),
        "{date_short}": lambda: datetime.now().strftime("%m/%d"),
    }

    def __init__(
        self,
        queue_manager: QueueManager,
        session_factory: async_sessionmaker,
    ):
        self._queue_manager = queue_manager
        self._session_factory = session_factory
        self._scheduler: AsyncScheduler | None = None

    async def start(self) -> None:
        """Initialize and start the APScheduler instance."""
        self._scheduler = AsyncScheduler()
        await self._scheduler.__aenter__()

        # Load persisted schedules from the database
        await self._load_schedules()
        logger.info("Scheduler service started")

    async def stop(self) -> None:
        """Shut down the scheduler gracefully."""
        if self._scheduler:
            await self._scheduler.__aexit__(None, None, None)
            logger.info("Scheduler service stopped")

    async def _load_schedules(self) -> None:
        """Load all enabled schedules from the database and register them."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(Schedule).where(Schedule.is_enabled == True)
            )
            schedules = result.scalars().all()

            for schedule in schedules:
                await self._add_job(schedule)

            logger.info("Loaded %d schedules from database", len(schedules))

    async def add_schedule(self, schedule: Schedule) -> None:
        """Register a new schedule with the scheduler."""
        if schedule.is_enabled:
            await self._add_job(schedule)

    async def update_schedule(self, schedule: Schedule) -> None:
        """Update an existing schedule (remove and re-add)."""
        await self.remove_schedule(schedule.id)
        if schedule.is_enabled:
            await self._add_job(schedule)

    async def remove_schedule(self, schedule_id: UUID) -> None:
        """Remove a schedule from the active scheduler."""
        job_id = f"schedule_{schedule_id}"
        try:
            await self._scheduler.remove_job(job_id)
        except Exception:
            pass  # Job might not exist if it was disabled

    async def enable_schedule(self, schedule_id: UUID) -> None:
        """Enable a schedule and register it with the scheduler."""
        async with self._session_factory() as session:
            schedule = await session.get(Schedule, schedule_id)
            if schedule:
                schedule.is_enabled = True
                await session.commit()
                await self._add_job(schedule)

    async def disable_schedule(self, schedule_id: UUID) -> None:
        """Disable a schedule without deleting it."""
        async with self._session_factory() as session:
            schedule = await session.get(Schedule, schedule_id)
            if schedule:
                schedule.is_enabled = False
                await session.commit()
                await self.remove_schedule(schedule_id)

    async def _add_job(self, schedule: Schedule) -> None:
        """Add a cron job to the APScheduler instance."""
        job_id = f"schedule_{schedule.id}"

        # Parse cron expression (supports standard 5-field cron syntax)
        # minute hour day_of_month month day_of_week
        parts = schedule.cron_expression.strip().split()
        if len(parts) != 5:
            logger.error(
                "Invalid cron expression for schedule %s: %s",
                schedule.id, schedule.cron_expression,
            )
            return

        trigger = CronTrigger(
            minute=parts[0],
            hour=parts[1],
            day=parts[2],
            month=parts[3],
            day_of_week=parts[4],
        )

        await self._scheduler.add_schedule(
            self._execute_scheduled_task,
            trigger=trigger,
            id=job_id,
            kwargs={
                "schedule_id": str(schedule.id),
                "instance_id": str(schedule.instance_id),
                "prompt_template": schedule.prompt_template,
            },
        )

        logger.info(
            "Registered schedule %s (%s) with cron: %s",
            schedule.name, schedule.id, schedule.cron_expression,
        )

    async def _execute_scheduled_task(
        self,
        schedule_id: str,
        instance_id: str,
        prompt_template: str,
    ) -> None:
        """
        Callback invoked by APScheduler when a cron trigger fires.

        This method:
            1. Substitutes template variables in the prompt
            2. Creates a new Task record in the database
            3. Enqueues the task via QueueManager
            4. Updates the schedule's last_run_at timestamp
        """
        # Substitute template variables
        prompt = self._render_template(prompt_template)

        async with self._session_factory() as session:
            # Also substitute {project_name} if the instance has a project
            from app.models.instance import Instance
            instance = await session.get(Instance, UUID(instance_id))
            if instance and instance.project:
                prompt = prompt.replace("{project_name}", instance.project.name)

            # Create the task
            task = Task(
                instance_id=UUID(instance_id),
                prompt=prompt,
                status=TaskStatus.QUEUED,
                schedule_id=UUID(schedule_id),
                priority=0,
            )
            session.add(task)

            # Update schedule's last_run_at
            schedule = await session.get(Schedule, UUID(schedule_id))
            if schedule:
                schedule.last_run_at = datetime.now()

            await session.commit()

            # Enqueue the task
            await self._queue_manager.enqueue(
                UUID(instance_id), task.id, task.priority
            )

        logger.info(
            "Scheduled task created: schedule=%s, task=%s",
            schedule_id, task.id,
        )

    def _render_template(self, template: str) -> str:
        """
        Replace template variables with current values.

        Supported variables:
            {date}         -> 2025-01-15
            {time}         -> 14:30:00
            {day_of_week}  -> Wednesday
            {timestamp}    -> 2025-01-15T14:30:00
            {date_short}   -> 01/15
            {project_name} -> (resolved separately from DB)
        """
        result = template
        for var, resolver in self.TEMPLATE_VARS.items():
            if var in result:
                result = result.replace(var, resolver())
        return result
```

#### Template Variable Reference

| Variable | Example Output | Description |
|---|---|---|
| `{date}` | `2025-01-15` | Current date in ISO format |
| `{time}` | `14:30:00` | Current time in 24-hour format |
| `{day_of_week}` | `Wednesday` | Full weekday name |
| `{timestamp}` | `2025-01-15T14:30:00` | ISO 8601 timestamp |
| `{date_short}` | `01/15` | Short date (month/day) |
| `{project_name}` | `my-web-app` | Name of the instance's parent project |

#### Example Schedule Usage

```
Cron: 0 9 * * 1-5
Template: "Review open PRs in {project_name} and summarize findings for {date} ({day_of_week})"

Resolves to: "Review open PRs in my-web-app and summarize findings for 2025-01-15 (Wednesday)"
```

---

### 9.4 SSH Manager

**File:** `app/services/ssh_manager.py`

Manages persistent SSH connections to remote machines using Paramiko, enabling Claude Code execution on remote hosts.

```python
import logging
from uuid import UUID
from typing import Optional

import paramiko

from app.models.ssh_config import SSHConfig

logger = logging.getLogger(__name__)


class SSHManager:
    """
    SSH connection pooling and command wrapping using Paramiko.

    Maintains a pool of persistent SSH connections keyed by SSH config ID.
    Connections are lazily initialized on first use and reused for subsequent
    commands. Stale connections are detected and re-established automatically.
    """

    def __init__(self):
        self._connections: dict[UUID, paramiko.SSHClient] = {}
        self._configs: dict[UUID, SSHConfig] = {}

    def register_config(self, config: SSHConfig) -> None:
        """Register an SSH configuration for later use."""
        self._configs[config.id] = config

    def _get_or_create_connection(self, config_id: UUID) -> paramiko.SSHClient:
        """
        Get an existing connection or create a new one.

        If the existing connection is stale (transport is not active),
        it is closed and a fresh connection is established.
        """
        # Check for existing active connection
        if config_id in self._connections:
            client = self._connections[config_id]
            transport = client.get_transport()
            if transport and transport.is_active():
                return client
            else:
                # Stale connection, close it
                try:
                    client.close()
                except Exception:
                    pass

        config = self._configs.get(config_id)
        if not config:
            raise ValueError(f"SSH config {config_id} not registered")

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        connect_kwargs = {
            "hostname": config.host,
            "port": config.port,
            "username": config.username,
            "timeout": 30,
        }

        if config.auth_method == "key" and config.private_key_path:
            connect_kwargs["key_filename"] = config.private_key_path
        elif config.auth_method == "password" and config.password_encrypted:
            # In production, decrypt the password here
            connect_kwargs["password"] = config.password_encrypted

        client.connect(**connect_kwargs)
        self._connections[config_id] = client

        logger.info(
            "SSH connection established to %s@%s:%d",
            config.username, config.host, config.port,
        )
        return client

    def wrap_command(self, config_id: UUID, cmd: list[str]) -> str:
        """
        Wrap a local command for SSH execution.

        Constructs an ssh command string that will execute the given
        command on the remote host. The working directory is set via
        'cd' on the remote side.

        Args:
            config_id: The SSH config to use.
            cmd: The command arguments (e.g. ["claude", "--print", ...]).

        Returns:
            A shell command string for subprocess_shell execution.
        """
        config = self._configs.get(config_id)
        if not config:
            raise ValueError(f"SSH config {config_id} not registered")

        import shlex

        remote_cmd = " ".join(cmd)

        # Build the SSH command
        ssh_parts = [
            "ssh",
            "-o", "StrictHostKeyChecking=no",
            "-o", "ConnectTimeout=30",
            "-p", str(config.port),
        ]

        if config.auth_method == "key" and config.private_key_path:
            ssh_parts.extend(["-i", config.private_key_path])

        ssh_parts.append(f"{config.username}@{config.host}")
        ssh_parts.append(shlex.quote(remote_cmd))

        return " ".join(ssh_parts)

    def test_connection(self, config_id: UUID) -> dict:
        """
        Test an SSH connection and return diagnostics.

        Returns:
            A dict with keys: success (bool), message (str),
            server_info (str | None).
        """
        try:
            client = self._get_or_create_connection(config_id)
            _, stdout, _ = client.exec_command("echo 'connection_ok' && uname -a")
            output = stdout.read().decode().strip()
            return {
                "success": True,
                "message": "Connection successful",
                "server_info": output,
            }
        except Exception as e:
            return {
                "success": False,
                "message": str(e),
                "server_info": None,
            }

    def close_all(self) -> None:
        """Close all SSH connections. Called during shutdown."""
        for config_id, client in self._connections.items():
            try:
                client.close()
                logger.info("SSH connection closed for config %s", config_id)
            except Exception:
                pass
        self._connections.clear()

    def close(self, config_id: UUID) -> None:
        """Close a specific SSH connection."""
        client = self._connections.pop(config_id, None)
        if client:
            try:
                client.close()
            except Exception:
                pass
```

---

### 9.5 Stream Manager

**File:** `app/services/stream_manager.py`

Manages WebSocket connections and broadcasts real-time output to subscribers.

```python
import asyncio
import json
import logging
from uuid import UUID
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class StreamManager:
    """
    WebSocket connection manager for real-time output streaming.

    Manages a registry of connected WebSocket clients per instance ID.
    Provides broadcast methods that fan out messages to all subscribers
    of a given instance.

    Thread-safe via asyncio (all operations run in the event loop).
    """

    def __init__(self):
        # instance_id -> set of connected WebSocket clients
        self._connections: dict[UUID, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, instance_id: UUID, websocket: WebSocket) -> None:
        """Register a WebSocket client for an instance's output stream."""
        async with self._lock:
            if instance_id not in self._connections:
                self._connections[instance_id] = set()
            self._connections[instance_id].add(websocket)

        logger.debug(
            "WebSocket connected for instance %s (total: %d)",
            instance_id, len(self._connections.get(instance_id, set())),
        )

    async def disconnect(self, instance_id: UUID, websocket: WebSocket) -> None:
        """Unregister a WebSocket client."""
        async with self._lock:
            if instance_id in self._connections:
                self._connections[instance_id].discard(websocket)
                if not self._connections[instance_id]:
                    del self._connections[instance_id]

        logger.debug("WebSocket disconnected for instance %s", instance_id)

    async def broadcast(self, instance_id: UUID, message: dict[str, Any]) -> None:
        """
        Send a JSON message to all WebSocket clients subscribed to an instance.

        Failed sends (broken connections) are silently caught and the
        client is removed from the subscriber set.

        Message format:
            {
                "type": "output" | "status" | "task_update" | "queue_update",
                "data": <varies by type>
            }
        """
        connections = self._connections.get(instance_id, set()).copy()
        if not connections:
            return

        payload = json.dumps(message)
        broken: list[WebSocket] = []

        for ws in connections:
            try:
                await ws.send_text(payload)
            except Exception:
                broken.append(ws)

        # Clean up broken connections
        if broken:
            async with self._lock:
                for ws in broken:
                    self._connections.get(instance_id, set()).discard(ws)

    async def broadcast_all(self, message: dict[str, Any]) -> None:
        """Broadcast a message to ALL connected clients across all instances."""
        for instance_id in list(self._connections.keys()):
            await self.broadcast(instance_id, message)

    def get_connection_count(self, instance_id: UUID) -> int:
        """Get the number of active WebSocket connections for an instance."""
        return len(self._connections.get(instance_id, set()))

    def get_total_connections(self) -> int:
        """Get the total number of active WebSocket connections."""
        return sum(len(conns) for conns in self._connections.values())

    async def close(self) -> None:
        """Close all WebSocket connections. Called during shutdown."""
        for instance_id, connections in self._connections.items():
            for ws in connections:
                try:
                    await ws.close()
                except Exception:
                    pass
        self._connections.clear()
        logger.info("All WebSocket connections closed")
```

---

### 9.6 Usage Tracker

**File:** `app/services/usage_tracker.py`

Tracks token consumption, cost estimates, and provides aggregated usage analytics.

```python
import logging
from datetime import datetime, timedelta
from uuid import UUID
from typing import Optional

from sqlalchemy.ext.asyncio import async_sessionmaker, AsyncSession
from sqlalchemy import select, func

from app.config import settings
from app.models.usage_log import UsageLog

logger = logging.getLogger(__name__)


class UsageTracker:
    """
    Token and cost tracking service.

    Records per-task usage data and provides aggregation methods for
    dashboards and analytics. All cost estimates are computed using
    configurable per-token rates from settings.
    """

    def __init__(self, session_factory: async_sessionmaker):
        self._session_factory = session_factory

    async def record(
        self,
        instance_id: UUID,
        task_id: UUID,
        model: str,
        result: dict,
        duration: float,
    ) -> None:
        """
        Record usage statistics from a completed task.

        Extracts input_tokens and output_tokens from the Claude CLI
        JSON result and stores them as a UsageLog entry.
        """
        input_tokens = result.get("input_tokens", 0)
        output_tokens = result.get("output_tokens", 0)

        # Calculate cost estimate
        cost = (
            (input_tokens / 1000) * settings.COST_PER_INPUT_TOKEN
            + (output_tokens / 1000) * settings.COST_PER_OUTPUT_TOKEN
        )

        async with self._session_factory() as session:
            log = UsageLog(
                instance_id=instance_id,
                task_id=task_id,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_estimate=cost,
            )
            session.add(log)
            await session.commit()

        logger.debug(
            "Recorded usage: instance=%s, tokens=%d/%d, cost=$%.4f",
            instance_id, input_tokens, output_tokens, cost,
        )

    async def get_instance_usage(
        self,
        instance_id: UUID,
        days: int = 30,
    ) -> dict:
        """
        Get aggregated usage for an instance over the last N days.

        Returns:
            {
                "total_input_tokens": int,
                "total_output_tokens": int,
                "total_cost": float,
                "task_count": int,
                "period_days": int,
            }
        """
        since = datetime.utcnow() - timedelta(days=days)

        async with self._session_factory() as session:
            result = await session.execute(
                select(
                    func.sum(UsageLog.input_tokens).label("input"),
                    func.sum(UsageLog.output_tokens).label("output"),
                    func.sum(UsageLog.cost_estimate).label("cost"),
                    func.count(UsageLog.id).label("count"),
                ).where(
                    UsageLog.instance_id == instance_id,
                    UsageLog.recorded_at >= since,
                )
            )
            row = result.one()

            return {
                "total_input_tokens": row.input or 0,
                "total_output_tokens": row.output or 0,
                "total_cost": round(row.cost or 0.0, 4),
                "task_count": row.count or 0,
                "period_days": days,
            }

    async def get_project_usage(
        self,
        project_id: UUID,
        days: int = 30,
    ) -> dict:
        """Get aggregated usage across all instances in a project."""
        since = datetime.utcnow() - timedelta(days=days)

        async with self._session_factory() as session:
            from app.models.instance import Instance

            result = await session.execute(
                select(
                    func.sum(UsageLog.input_tokens).label("input"),
                    func.sum(UsageLog.output_tokens).label("output"),
                    func.sum(UsageLog.cost_estimate).label("cost"),
                    func.count(UsageLog.id).label("count"),
                )
                .join(Instance, UsageLog.instance_id == Instance.id)
                .where(
                    Instance.project_id == project_id,
                    UsageLog.recorded_at >= since,
                )
            )
            row = result.one()

            return {
                "total_input_tokens": row.input or 0,
                "total_output_tokens": row.output or 0,
                "total_cost": round(row.cost or 0.0, 4),
                "task_count": row.count or 0,
                "period_days": days,
            }

    async def get_daily_breakdown(
        self,
        instance_id: UUID | None = None,
        days: int = 30,
    ) -> list[dict]:
        """
        Get a day-by-day usage breakdown for charting.

        Returns:
            [
                {"date": "2025-01-15", "input_tokens": 1200, ...},
                {"date": "2025-01-14", "input_tokens": 800, ...},
                ...
            ]
        """
        since = datetime.utcnow() - timedelta(days=days)

        async with self._session_factory() as session:
            query = (
                select(
                    func.date(UsageLog.recorded_at).label("date"),
                    func.sum(UsageLog.input_tokens).label("input"),
                    func.sum(UsageLog.output_tokens).label("output"),
                    func.sum(UsageLog.cost_estimate).label("cost"),
                    func.count(UsageLog.id).label("count"),
                )
                .where(UsageLog.recorded_at >= since)
                .group_by(func.date(UsageLog.recorded_at))
                .order_by(func.date(UsageLog.recorded_at).desc())
            )

            if instance_id:
                query = query.where(UsageLog.instance_id == instance_id)

            result = await session.execute(query)
            rows = result.all()

            return [
                {
                    "date": str(row.date),
                    "input_tokens": row.input or 0,
                    "output_tokens": row.output or 0,
                    "cost": round(row.cost or 0.0, 4),
                    "task_count": row.count or 0,
                }
                for row in rows
            ]

    async def get_global_summary(self) -> dict:
        """
        Get a global usage summary across all instances.

        Returns:
            {
                "total_input_tokens": int,
                "total_output_tokens": int,
                "total_cost": float,
                "total_tasks": int,
                "active_instances": int,
            }
        """
        async with self._session_factory() as session:
            result = await session.execute(
                select(
                    func.sum(UsageLog.input_tokens).label("input"),
                    func.sum(UsageLog.output_tokens).label("output"),
                    func.sum(UsageLog.cost_estimate).label("cost"),
                    func.count(UsageLog.id).label("count"),
                    func.count(func.distinct(UsageLog.instance_id)).label("instances"),
                )
            )
            row = result.one()

            return {
                "total_input_tokens": row.input or 0,
                "total_output_tokens": row.output or 0,
                "total_cost": round(row.cost or 0.0, 4),
                "total_tasks": row.count or 0,
                "active_instances": row.instances or 0,
            }
```

---

## 10. Authentication

### `app/core/auth.py` -- Cloudflare Access JWT Validation

All API endpoints (except WebSocket and health checks) require authentication via Cloudflare Access JWT tokens.

```python
import logging
from typing import Optional

import httpx
from jose import jwt, JWTError
from fastapi import Request, HTTPException, status, Depends

from app.config import settings

logger = logging.getLogger(__name__)

# Cache the JWKS keys in memory (refreshed on cache miss)
_jwks_cache: Optional[dict] = None


async def _get_jwks() -> dict:
    """
    Fetch the JSON Web Key Set from Cloudflare Access.

    The JWKS endpoint provides the public keys used to verify
    JWT signatures. Keys are cached in memory and refreshed
    only when verification fails (key rotation).

    Endpoint:
        https://{team_domain}.cloudflareaccess.com/cdn-cgi/access/certs
    """
    global _jwks_cache

    if _jwks_cache is not None:
        return _jwks_cache

    url = (
        f"https://{settings.CLOUDFLARE_TEAM_DOMAIN}"
        f".cloudflareaccess.com/cdn-cgi/access/certs"
    )

    async with httpx.AsyncClient() as client:
        response = await client.get(url, timeout=10)
        response.raise_for_status()
        _jwks_cache = response.json()
        return _jwks_cache


def _extract_token(request: Request) -> str | None:
    """
    Extract the JWT token from the request.

    Cloudflare Access sends the token in one of two places:
        1. CF_Authorization cookie (browser-based access)
        2. cf-access-jwt-assertion header (API/programmatic access)
    """
    # Try cookie first (set by Cloudflare Access for browser sessions)
    token = request.cookies.get("CF_Authorization")
    if token:
        return token

    # Try header (used by API clients)
    token = request.headers.get("cf-access-jwt-assertion")
    if token:
        return token

    return None


async def validate_token(token: str) -> dict:
    """
    Validate a Cloudflare Access JWT token.

    Validation steps:
        1. Decode the JWT header to get the key ID (kid)
        2. Fetch the JWKS and find the matching public key
        3. Verify the signature using RS256
        4. Validate the audience claim matches our application
        5. Validate the token is not expired

    Returns:
        The decoded JWT payload containing user identity claims.

    Raises:
        HTTPException: If validation fails for any reason.
    """
    global _jwks_cache

    try:
        jwks = await _get_jwks()
        keys = jwks.get("keys", [])

        # Decode header without verification to get key ID
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        # Find the matching key
        rsa_key = None
        for key in keys:
            if key.get("kid") == kid:
                rsa_key = key
                break

        if rsa_key is None:
            # Key not found -- might be rotated. Refresh cache and retry.
            _jwks_cache = None
            jwks = await _get_jwks()
            for key in jwks.get("keys", []):
                if key.get("kid") == kid:
                    rsa_key = key
                    break

        if rsa_key is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to find matching signing key",
            )

        # Verify and decode the token
        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=["RS256"],
            audience=settings.CLOUDFLARE_ACCESS_AUD,
        )

        return payload

    except JWTError as e:
        logger.warning("JWT validation failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
        )


async def require_auth(request: Request) -> dict:
    """
    FastAPI dependency that enforces authentication.

    When AUTH_BYPASS is True (local development), all requests are
    allowed with a dummy identity. In production, a valid Cloudflare
    Access JWT must be present.

    Usage:
        @router.get("/", dependencies=[Depends(require_auth)])
        async def my_endpoint():
            ...

        # Or to get the user identity:
        @router.get("/me")
        async def get_me(user: dict = Depends(require_auth)):
            return user
    """
    if settings.AUTH_BYPASS:
        return {
            "email": "dev@localhost",
            "sub": "local-dev",
            "name": "Local Developer",
        }

    token = _extract_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide CF_Authorization cookie "
                   "or cf-access-jwt-assertion header.",
        )

    return await validate_token(token)
```

### Authentication Flow Diagram

```
Client Request
      |
      +---> AUTH_BYPASS=True? --yes--> Return dummy identity
      |
      +---> Extract token from:
      |        CF_Authorization cookie
      |        cf-access-jwt-assertion header
      |
      +---> Token found? --no--> 401 Unauthorized
      |
      +---> Decode JWT header (get kid)
      |
      +---> Fetch JWKS from Cloudflare
      |        https://{team}.cloudflareaccess.com/cdn-cgi/access/certs
      |
      +---> Find matching public key by kid
      |        (refresh cache on miss)
      |
      +---> Verify RS256 signature
      +---> Validate audience claim
      +---> Validate expiration
      |
      +---> Return decoded payload (user identity)
```

---

## 11. Middleware

### `app/core/middleware.py`

```python
import time
import logging
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Logs every HTTP request with timing and correlation ID.

    Adds headers:
        X-Request-ID: Unique identifier for request tracing
        X-Process-Time: Server-side processing time in seconds
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid4())[:8]
        start_time = time.time()

        # Attach request ID for downstream logging
        request.state.request_id = request_id

        logger.info(
            "[%s] %s %s",
            request_id,
            request.method,
            request.url.path,
        )

        try:
            response = await call_next(request)
        except Exception as e:
            logger.exception("[%s] Unhandled error: %s", request_id, e)
            raise

        process_time = time.time() - start_time
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = f"{process_time:.4f}"

        logger.info(
            "[%s] %s %s -> %d (%.3fs)",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            process_time,
        )

        return response
```

---

## 12. Event System

### `app/core/events.py`

A lightweight in-process event bus for decoupling service interactions.

```python
import asyncio
import logging
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)

# Type alias for async event handlers
EventHandler = Callable[..., Coroutine[Any, Any, None]]


class EventBus:
    """
    Simple async event bus for internal service communication.

    Allows services to emit events without direct dependencies on
    each other. Handlers are invoked concurrently via asyncio.gather.

    Events:
        task.started     (instance_id, task_id)
        task.completed   (instance_id, task_id, result)
        task.failed      (instance_id, task_id, error)
        instance.status  (instance_id, status)
        queue.updated    (instance_id)
    """

    def __init__(self):
        self._handlers: dict[str, list[EventHandler]] = {}

    def on(self, event: str, handler: EventHandler) -> None:
        """Register a handler for an event type."""
        if event not in self._handlers:
            self._handlers[event] = []
        self._handlers[event].append(handler)

    def off(self, event: str, handler: EventHandler) -> None:
        """Unregister a handler."""
        if event in self._handlers:
            self._handlers[event] = [
                h for h in self._handlers[event] if h != handler
            ]

    async def emit(self, event: str, **kwargs) -> None:
        """
        Emit an event, invoking all registered handlers concurrently.

        Exceptions in individual handlers are logged but do not
        propagate or affect other handlers.
        """
        handlers = self._handlers.get(event, [])
        if not handlers:
            return

        results = await asyncio.gather(
            *[h(**kwargs) for h in handlers],
            return_exceptions=True,
        )

        for result in results:
            if isinstance(result, Exception):
                logger.error(
                    "Error in event handler for '%s': %s",
                    event, result,
                )


# Global event bus instance
event_bus = EventBus()
```

---

## 13. Migrations

### `alembic.ini` (Key Settings)

```ini
[alembic]
script_location = app/migrations
sqlalchemy.url = %(DATABASE_URL)s

[loggers]
keys = root,sqlalchemy,alembic

[logger_alembic]
level = INFO
```

### `app/migrations/env.py`

```python
import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

from app.config import settings
from app.database import Base
from app.models import *  # noqa: F401, F403 -- register all models

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (generate SQL)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in 'online' mode using async engine."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

### Common Migration Commands

```bash
# Generate a new migration from model changes
alembic revision --autogenerate -m "add tasks table"

# Apply all pending migrations
alembic upgrade head

# Rollback the last migration
alembic downgrade -1

# Show current migration state
alembic current

# Show migration history
alembic history --verbose
```

---

## 14. Dependencies

### `requirements.txt`

```
# Web framework
fastapi>=0.115
uvicorn[standard]>=0.30

# Database
sqlalchemy[asyncio]>=2.0
asyncpg>=0.30
alembic>=1.14

# Redis
redis>=5.0

# Scheduler
apscheduler>=4.0

# SSH
paramiko>=3.4

# Authentication
python-jose[cryptography]>=3.3

# Configuration
pydantic-settings>=2.5

# HTTP client (for JWKS fetching)
httpx>=0.27

# WebSocket
websockets>=12.0

# File uploads
python-multipart>=0.0.7
```

### Dependency Rationale

| Package | Purpose |
|---|---|
| `fastapi` | Async web framework with automatic OpenAPI docs, dependency injection, and WebSocket support |
| `uvicorn[standard]` | ASGI server; `[standard]` includes `uvloop` and `httptools` for performance |
| `sqlalchemy[asyncio]` | ORM with native async support via `asyncpg` driver; `[asyncio]` pulls in `greenlet` |
| `asyncpg` | High-performance async PostgreSQL driver (replaces `psycopg2`) |
| `alembic` | Database migration management with autogenerate support |
| `redis` | Async Redis client (`redis.asyncio`) for queues and pub/sub |
| `apscheduler` | v4 provides native async scheduler with cron triggers and persistent job stores |
| `paramiko` | Pure-Python SSH2 implementation for remote command execution |
| `python-jose` | JWT decoding and verification with RSA support (for Cloudflare Access) |
| `pydantic-settings` | Typed configuration from environment variables with `.env` file support |
| `httpx` | Async HTTP client used for fetching Cloudflare JWKS endpoints |
| `websockets` | WebSocket protocol implementation used by uvicorn |
| `python-multipart` | Required by FastAPI for form data and file upload parsing |

---

## 15. Docker Configuration

### `Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for paramiko and asyncpg
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    libssl-dev \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Run database migrations on startup, then start the server
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"]
```

> **Note:** `--workers 1` is mandatory. The backend relies on in-process state (active sessions, WebSocket connections, APScheduler instance). Multiple workers would create isolated copies of these, breaking the queue loop and real-time streaming. Scaling should be done via horizontal pod replicas with a shared Redis-based coordination layer (not yet implemented).

### `pyproject.toml`

```toml
[project]
name = "claude-orchestrator-backend"
version = "0.1.0"
requires-python = ">=3.11"

[tool.ruff]
target-version = "py311"
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```
