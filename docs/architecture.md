# Architecture Documentation -- Claude Orchestrator

> **Version:** 1.0
> **Last Updated:** 2026-02-06
> **Status:** Living Document

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level System Diagram](#2-high-level-system-diagram)
3. [Component Architecture](#3-component-architecture)
4. [Technology Stack Rationale](#4-technology-stack-rationale)
5. [Data Flow Diagrams](#5-data-flow-diagrams)
6. [Communication Patterns](#6-communication-patterns)
7. [Scalability Considerations](#7-scalability-considerations)
8. [Cross-Reference](#8-cross-reference)

---

## 1. System Overview

Claude Orchestrator is a **self-hosted web application** designed to remotely control, monitor, and coordinate multiple Claude Code CLI instances. It provides a centralized dashboard for software teams and individual developers to manage AI-assisted coding workflows across one or more machines.

### Core Capabilities

- **Project Management** -- Organize work into discrete projects, each with its own set of Claude Code sessions, task queues, and execution history.
- **Prompt Queuing** -- Build ordered task queues for each Claude Code instance. Tasks support priority levels, drag-and-drop reordering, and dependency chaining.
- **Cron-Based Job Scheduling** -- Define recurring tasks using cron expressions with template variable substitution, backed by a persistent job store.
- **Real-Time Monitoring** -- Stream live terminal output from running Claude Code processes directly into the browser via WebSocket connections.
- **Usage Analytics** -- Track token consumption, cost estimates, session durations, and activity trends across all projects and instances.
- **Secure Remote Access** -- Expose the dashboard over HTTPS through a Cloudflare Tunnel with Zero Trust authentication, eliminating the need for port forwarding or VPN configuration.
- **SSH-Based Remote Execution** -- Control Claude Code instances running on remote machines over SSH, enabling distributed workloads without requiring the CLI on the host.

### Design Philosophy

The system follows several guiding principles:

| Principle | Description |
|---|---|
| **Container-First** | Every service runs inside Docker containers orchestrated by Docker Compose, ensuring reproducible deployments across environments. |
| **Async Throughout** | The backend is built entirely on Python's `asyncio` runtime. Database queries, HTTP handlers, subprocess management, and inter-service communication are all non-blocking. |
| **Zero-Trust Security** | Remote access relies on Cloudflare Access for identity verification. Local access bypasses external authentication but still validates JWT session tokens. |
| **Separation of Concerns** | The frontend is a pure SPA with no server-side rendering. The backend exposes a clean REST + WebSocket API. Business logic lives in service classes, not route handlers. |
| **Observable by Default** | Every Claude Code process emits structured events that flow through Redis pub/sub to connected WebSocket clients. Task state transitions are logged and queryable. |

---

## 2. High-Level System Diagram

### Full Stack Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        User's PC (Host Machine)                         │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    Docker Compose Stack                           │  │
│  │                                                                   │  │
│  │  ┌─────────────────┐       ┌──────────────────────────────────┐  │  │
│  │  │    Frontend      │       │          Backend (FastAPI)       │  │  │
│  │  │  React + Vite    │──────▶│                                  │  │  │
│  │  │  Port 5173       │ REST  │  ┌────────────┐ ┌────────────┐  │  │  │
│  │  │                  │  +    │  │ API Routes  │ │ Services   │  │  │  │
│  │  │  ┌────────────┐  │  WS   │  └─────┬──────┘ └─────┬──────┘  │  │  │
│  │  │  │ Zustand    │  │◀──────│        │              │         │  │  │
│  │  │  │ Store      │  │       │  ┌─────▼──────────────▼──────┐  │  │  │
│  │  │  └────────────┘  │       │  │   SQLAlchemy 2.0 (async)  │  │  │  │
│  │  │  ┌────────────┐  │       │  └─────┬─────────────────────┘  │  │  │
│  │  │  │ TanStack   │  │       │        │                        │  │  │
│  │  │  │ Query      │  │       │  ┌─────▼──────┐ ┌────────────┐  │  │  │
│  │  │  └────────────┘  │       │  │ PostgreSQL │ │   Redis    │  │  │  │
│  │  └─────────────────┘       │  │ Port 5432  │ │  Port 6379 │  │  │  │
│  │                             │  └────────────┘ └──────┬─────┘  │  │  │
│  │                             │                        │        │  │  │
│  │                             │  ┌─────────────────────▼─────┐  │  │  │
│  │                             │  │   Claude Code Process Mgr │  │  │  │
│  │                             │  │                           │  │  │  │
│  │                             │  │  ┌─────────┐ ┌─────────┐ │  │  │  │
│  │                             │  │  │ Local   │ │   SSH   │ │  │  │  │
│  │                             │  │  │ asyncio │ │paramiko │ │  │  │  │
│  │                             │  │  │subproc  │ │ remote  │ │  │  │  │
│  │                             │  │  └────┬────┘ └────┬────┘ │  │  │  │
│  │                             │  └───────┼───────────┼──────┘  │  │  │
│  │                             │          │           │         │  │  │
│  │                             └──────────┼───────────┼─────────┘  │  │
│  └────────────────────────────────────────┼───────────┼────────────┘  │
│                                           │           │               │
│                                    ┌──────▼──┐  ┌─────▼────────────┐  │
│                                    │ Claude  │  │ Remote Machine   │  │
│                                    │ Code    │  │ (via SSH)        │  │
│                                    │ CLI     │  │ ┌──────────────┐ │  │
│                                    │ (local) │  │ │ Claude Code  │ │  │
│                                    └─────────┘  │ │ CLI (remote) │ │  │
│                                                 │ └──────────────┘ │  │
│  ┌───────────────────────────────┐              └──────────────────┘  │
│  │  Cloudflare Tunnel            │                                    │
│  │  (cloudflared)                │                                    │
│  │                               │                                    │
│  │  localhost:5173 ──────────────┼──▶ orchestrator.yourdomain.com    │
│  │  localhost:8000 ──────────────┼──▶ api.orchestrator.yourdomain.com│
│  └───────────────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Network Topology

```
┌──────────────┐     HTTPS      ┌───────────────────┐     HTTP      ┌──────────────┐
│   Browser    │◀──────────────▶│  Cloudflare Edge  │◀────────────▶│  cloudflared │
│  (Remote)    │                │  + Access Policy  │   Tunnel     │  (Host)      │
└──────────────┘                └───────────────────┘              └──────┬───────┘
                                                                         │
                                                                         │ localhost
┌──────────────┐     HTTP                                                │
│   Browser    │◀────────────────────────────────────────────────────────┘
│  (Local)     │     :5173 / :8000
└──────────────┘
```

### Container Relationships

```
docker-compose.yml
│
├── frontend          (node:20-alpine)
│   ├── depends_on: backend
│   ├── ports: 5173:5173
│   └── volumes: ./frontend/src → /app/src (dev HMR)
│
├── backend           (python:3.11-slim)
│   ├── depends_on: postgres, redis
│   ├── ports: 8000:8000
│   ├── volumes: /var/run/docker.sock (process mgmt)
│   └── environment: DATABASE_URL, REDIS_URL, ...
│
├── postgres          (postgres:16-alpine)
│   ├── ports: 5432:5432
│   ├── volumes: pgdata → /var/lib/postgresql/data
│   └── environment: POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
│
├── redis             (redis:7-alpine)
│   ├── ports: 6379:6379
│   └── volumes: redisdata → /data
│
└── cloudflared       (cloudflare/cloudflared:latest)  [profile: production]
    ├── depends_on: frontend, backend
    ├── command: tunnel run
    └── environment: TUNNEL_TOKEN
```

---

## 3. Component Architecture

### 3.1 Frontend (React 18 + TypeScript + Vite)

The frontend is a single-page application (SPA) that communicates with the backend exclusively through REST API calls and WebSocket connections. It never renders server-side.

#### Project Structure

```
frontend/src/
├── components/              # Reusable UI components
│   ├── ui/                  # shadcn/ui primitives (Button, Card, Dialog, etc.)
│   ├── layout/              # Shell, Sidebar, Header, Footer
│   ├── projects/            # ProjectCard, ProjectList, ProjectForm
│   ├── tasks/               # TaskQueue, TaskCard, TaskEditor, DragHandle
│   ├── sessions/            # SessionTerminal, SessionList, OutputViewer
│   ├── schedules/           # ScheduleForm, CronBuilder, ScheduleList
│   └── analytics/           # UsageChart, CostBreakdown, ActivityFeed
├── pages/                   # Route-level page components
│   ├── DashboardPage.tsx    # Overview with summary cards and recent activity
│   ├── ProjectsPage.tsx     # Project listing and creation
│   ├── ProjectDetailPage.tsx# Single project: sessions, tasks, schedules
│   ├── SessionPage.tsx      # Live session with terminal output
│   ├── SchedulesPage.tsx    # Global schedule management
│   └── SettingsPage.tsx     # Instance config, SSH keys, preferences
├── hooks/                   # Custom React hooks
│   ├── useWebSocket.ts      # WebSocket connection management with reconnect
│   ├── useTaskQueue.ts      # Drag-and-drop queue operations
│   ├── useLiveOutput.ts     # Terminal output buffering and rendering
│   └── useAuth.ts           # JWT token management, Cloudflare Access headers
├── stores/                  # Zustand global state stores
│   ├── authStore.ts         # Authentication state, user info
│   ├── sessionStore.ts      # Active sessions, output buffers
│   ├── uiStore.ts           # Sidebar collapsed, theme, notifications
│   └── wsStore.ts           # WebSocket connection state per session
├── lib/                     # Utilities and API client
│   ├── api.ts               # Axios/fetch wrapper with auth interceptor
│   ├── queryClient.ts       # TanStack Query client configuration
│   ├── ws.ts                # WebSocket client with auto-reconnect
│   └── utils.ts             # Formatting, date helpers, constants
└── types/                   # TypeScript type definitions
    ├── project.ts           # Project, ProjectCreate, ProjectUpdate
    ├── task.ts              # Task, TaskCreate, TaskStatus enum
    ├── session.ts           # Session, SessionOutput, SessionStatus enum
    ├── schedule.ts          # Schedule, CronExpression, TemplateVar
    └── api.ts               # PaginatedResponse<T>, ApiError, etc.
```

#### Key Architectural Decisions

- **Vite** serves as the build tool and dev server. In development, Vite provides sub-second Hot Module Replacement (HMR). In production, it outputs optimized static assets.
- **Zustand** handles local/global UI state (sidebar open/closed, active theme, notification queue). It is intentionally kept thin -- most data lives in TanStack Query's server-state cache.
- **TanStack React Query** manages all server data: fetching, caching, background refetching, and optimistic updates. Mutations invalidate relevant query keys to keep the UI consistent.
- **WebSocket connections** are managed per-session. When a user opens a session terminal, a WebSocket is opened to `/ws/sessions/{session_id}`. Output events arrive as JSON frames and are appended to a ring buffer in the session store.
- **shadcn/ui** provides accessible, unstyled component primitives. Tailwind CSS utility classes handle all visual styling, ensuring a consistent design system without CSS-in-JS overhead.

#### Data Flow Within the Frontend

```
User Action
    │
    ▼
Page Component
    │
    ├──▶ useMutation() ──▶ api.ts ──▶ POST /api/tasks ──▶ Backend
    │         │
    │         └──▶ onSuccess: invalidateQueries(['tasks'])
    │
    └──▶ useQuery(['tasks']) ◀── cache ◀── GET /api/tasks ◀── Backend
              │
              ▼
         Render TaskQueue Component
              │
              └──▶ useWebSocket(sessionId) ──▶ ws://backend/ws/sessions/{id}
                        │
                        ▼
                   sessionStore.appendOutput(data)
                        │
                        ▼
                   <SessionTerminal /> re-renders
```

---

### 3.2 Backend (FastAPI -- Python 3.11+)

The backend is a Python application built on FastAPI, running under Uvicorn with an `asyncio` event loop. It serves as the API gateway, business logic layer, process orchestrator, and WebSocket relay.

#### Project Structure

```
backend/app/
├── main.py                  # FastAPI app factory, lifespan events (startup/shutdown)
├── config.py                # Pydantic Settings: env vars, defaults, validation
├── database.py              # Async SQLAlchemy engine, session factory, Base class
├── models/                  # SQLAlchemy ORM models
│   ├── project.py           # Project model
│   ├── task.py              # Task model with status, priority, queue_position
│   ├── session.py           # Session model with PID, status, machine reference
│   ├── schedule.py          # Schedule model with cron expression, template vars
│   ├── instance.py          # ClaudeInstance: host, port, SSH key reference
│   ├── usage.py             # UsageRecord: tokens_in, tokens_out, cost, duration
│   └── base.py              # Shared mixins: TimestampMixin, SoftDeleteMixin
├── schemas/                 # Pydantic v2 request/response schemas
│   ├── project.py           # ProjectCreate, ProjectRead, ProjectUpdate
│   ├── task.py              # TaskCreate, TaskRead, TaskReorder
│   ├── session.py           # SessionCreate, SessionRead, SessionOutput
│   ├── schedule.py          # ScheduleCreate, ScheduleRead
│   └── common.py            # PaginatedResponse[T], ErrorResponse, HealthCheck
├── api/                     # FastAPI routers (thin controllers)
│   ├── v1/
│   │   ├── projects.py      # CRUD + list with filters
│   │   ├── tasks.py         # CRUD + queue reorder + bulk operations
│   │   ├── sessions.py      # Start, stop, list, get output history
│   │   ├── schedules.py     # CRUD + enable/disable + trigger now
│   │   ├── instances.py     # CRUD + connectivity test
│   │   ├── analytics.py     # Usage aggregation, cost breakdown
│   │   └── health.py        # Readiness and liveness probes
│   └── ws/
│       └── sessions.py      # WebSocket endpoint for live output streaming
├── services/                # Business logic (stateless service classes)
│   ├── project_service.py   # Project lifecycle management
│   ├── task_service.py      # Task queue ordering, status transitions
│   ├── session_service.py   # Session lifecycle: create, start, stop, cleanup
│   ├── process_service.py   # Claude Code process spawning and monitoring
│   ├── schedule_service.py  # APScheduler integration, job management
│   ├── instance_service.py  # Instance registration, SSH key validation
│   ├── analytics_service.py # Usage aggregation, cost calculation
│   └── output_service.py    # Output parsing, Redis pub/sub relay
├── core/                    # Cross-cutting concerns
│   ├── auth.py              # Cloudflare Access JWT validation, local bypass
│   ├── middleware.py         # Request logging, CORS, timing
│   ├── events.py            # Application startup/shutdown event handlers
│   ├── exceptions.py        # Custom exception classes + global handlers
│   └── dependencies.py      # FastAPI Depends: get_db, get_redis, get_current_user
└── migrations/              # Alembic migration scripts
    ├── alembic.ini
    ├── env.py
    └── versions/
```

#### Lifespan Events

The FastAPI application uses a lifespan context manager to coordinate startup and shutdown of long-running subsystems:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()                      # Run Alembic migrations (head)
    await init_redis_pool()              # Create aioredis connection pool
    await start_scheduler()              # Start APScheduler, restore persisted jobs
    await start_process_monitor()        # Resume monitoring for running sessions

    yield  # Application serves requests

    # Shutdown
    await stop_scheduler()               # Gracefully stop APScheduler
    await stop_all_sessions()            # Send SIGTERM to running Claude processes
    await close_redis_pool()             # Close Redis connections
    await dispose_db_engine()            # Close all DB connections
```

#### Request Processing Pipeline

```
Incoming HTTP Request
    │
    ▼
Uvicorn (ASGI Server)
    │
    ▼
FastAPI Middleware Stack
    ├── CORSMiddleware           # Allow frontend origin
    ├── RequestTimingMiddleware   # Log request duration
    └── AuthMiddleware           # Validate JWT / Cloudflare headers
    │
    ▼
Router Dispatch (api/v1/*)
    │
    ▼
Dependency Injection
    ├── get_db()       → AsyncSession
    ├── get_redis()    → aioredis.Redis
    └── get_current_user() → User context
    │
    ▼
Route Handler (thin controller)
    │
    ▼
Service Layer (business logic)
    │
    ├──▶ SQLAlchemy async queries
    ├──▶ Redis commands
    └──▶ Process Manager calls
    │
    ▼
Pydantic Response Serialization
    │
    ▼
HTTP Response
```

---

### 3.3 Database (PostgreSQL 16)

PostgreSQL serves as the primary persistent data store. All application state -- projects, tasks, sessions, schedules, usage records, and instance configurations -- lives in PostgreSQL.

#### Why PostgreSQL 16

- **JSONB columns** store flexible metadata (task parameters, schedule template variables, session configuration overrides) without schema changes.
- **Full-text search** enables searching across task prompts, project descriptions, and session output logs.
- **LISTEN/NOTIFY** can supplement Redis pub/sub for database-level event triggers if needed in the future.
- **Robust concurrent access** with MVCC ensures that multiple backend workers can read and write without locking conflicts.
- **Alembic migrations** manage schema evolution. Every model change produces a versioned migration script that runs automatically on application startup.

#### Key Tables (Summary)

| Table | Purpose | Key Columns |
|---|---|---|
| `projects` | Grouping container for work | `id`, `name`, `description`, `status`, `created_at` |
| `tasks` | Individual prompts in a queue | `id`, `project_id`, `prompt`, `status`, `priority`, `queue_position` |
| `sessions` | Running Claude Code process records | `id`, `project_id`, `instance_id`, `pid`, `status`, `started_at` |
| `schedules` | Cron-based recurring tasks | `id`, `project_id`, `cron_expr`, `template`, `enabled` |
| `instances` | Claude Code instance configurations | `id`, `name`, `host`, `port`, `ssh_key_id`, `is_local` |
| `usage_records` | Token and cost tracking | `id`, `session_id`, `tokens_in`, `tokens_out`, `cost`, `recorded_at` |

> Full schema documentation: [data-model.md](data-model.md)

#### Connection Management

```
Backend (FastAPI)
    │
    ▼
SQLAlchemy 2.0 async engine
    │
    ├── create_async_engine(pool_size=10, max_overflow=20)
    │
    ▼
asyncpg driver (async PostgreSQL adapter)
    │
    ▼
PostgreSQL 16 (Docker container, port 5432)
    │
    └── Data volume: pgdata (persistent across restarts)
```

---

### 3.4 Cache / Queue (Redis 7)

Redis fulfills three distinct roles in the architecture:

#### Role 1: Job Queue Backing Store

APScheduler 4 uses Redis as its persistent job store. Scheduled jobs survive application restarts because their definitions and next-run times are serialized into Redis keys.

```
Redis Key Pattern              Purpose
─────────────────────────────  ──────────────────────────────────────
scheduler:jobs:{job_id}        Serialized job definition
scheduler:jobs:next_run        Sorted set of next execution times
```

#### Role 2: Session Output Pub/Sub

When a Claude Code process emits output (stdout/stderr), the Process Manager publishes it to a Redis channel. WebSocket handlers subscribe to the relevant channel and forward messages to connected browsers.

```
Channel Pattern                     Purpose
────────────────────────────────    ──────────────────────────────────
session:{session_id}:output         Live stdout/stderr stream
session:{session_id}:status         Status change events (running → done)
session:{session_id}:usage          Periodic token usage updates
```

#### Role 3: Ephemeral Caching

Frequently accessed, rarely changing data is cached in Redis with TTL expiration:

```
Cache Key Pattern                   TTL       Purpose
────────────────────────────────    ──────    ──────────────────────────
cache:project:{id}                  5 min     Project details
cache:analytics:daily:{date}        1 hour    Daily usage aggregates
cache:instance:{id}:health          30 sec    Instance connectivity status
```

#### Connection Management

```
Backend (FastAPI)
    │
    ▼
aioredis / redis-py (async mode)
    │
    ├── Connection pool: max_connections=20
    │
    ▼
Redis 7 (Docker container, port 6379)
    │
    ├── Persistence: AOF (appendonly yes)
    └── Data volume: redisdata
```

---

### 3.5 Scheduler (APScheduler 4)

APScheduler 4 provides cron-like job scheduling within the Python process. It runs inside the FastAPI application (not as a separate service) and shares the same event loop.

#### Architecture

```
APScheduler 4
├── AsyncScheduler
│   ├── Job Store ──▶ Redis (persistent)
│   ├── Event Loop ──▶ Shared with FastAPI/Uvicorn
│   └── Executors
│       └── AsyncJobExecutor
│           └── Calls service methods directly
│
├── Job Types
│   ├── CronTrigger      # Cron expression (e.g., "0 9 * * MON-FRI")
│   ├── IntervalTrigger   # Fixed interval (e.g., every 30 minutes)
│   └── DateTrigger       # One-time execution at a specific datetime
│
└── Job Lifecycle
    ├── Registered  → Job definition saved to Redis
    ├── Pending     → Waiting for next trigger time
    ├── Running     → Executor invokes the target function
    ├── Completed   → Execution finished, next run time recalculated
    └── Error       → Exception caught, logged, retry policy applied
```

#### Template Variable Substitution

Scheduled jobs support template variables that are resolved at execution time:

```
Template:  "Review changes in {{branch}} since {{last_run}}"
Resolved:  "Review changes in main since 2026-02-05T09:00:00Z"
```

Built-in variables: `{{now}}`, `{{last_run}}`, `{{project_name}}`, `{{branch}}`, `{{date}}`, `{{time}}`.

---

### 3.6 Process Manager (asyncio.subprocess + paramiko)

The Process Manager is the core engine that spawns, monitors, and controls Claude Code CLI instances. It supports two execution backends: **local** (same machine) and **remote** (over SSH).

#### Local Execution (asyncio.subprocess)

```
ProcessManager.start_local(session)
    │
    ▼
asyncio.create_subprocess_exec(
    "claude",                          # Claude Code CLI binary
    "--print",                         # Machine-readable output mode
    "--output-format", "stream-json",  # Structured JSON output
    "--max-turns", "50",               # Safety limit
    stdin=PIPE, stdout=PIPE, stderr=PIPE
)
    │
    ├── stdout reader task ──▶ parse JSON lines ──▶ Redis pub/sub
    ├── stderr reader task ──▶ parse error lines ──▶ Redis pub/sub
    └── process monitor task ──▶ detect exit ──▶ update session status
```

#### Remote Execution (paramiko)

```
ProcessManager.start_remote(session, instance)
    │
    ▼
paramiko.SSHClient()
    ├── connect(hostname, port, key_filename)
    ├── exec_command("claude --print --output-format stream-json ...")
    │
    ├── stdout channel reader ──▶ parse JSON lines ──▶ Redis pub/sub
    ├── stderr channel reader ──▶ parse error lines ──▶ Redis pub/sub
    └── exit status monitor ──▶ detect exit ──▶ update session status
```

#### Process Lifecycle State Machine

```
             start()
    ┌─────────────────────────┐
    │                         ▼
 ┌──┴───┐   ┌─────────┐   ┌─────────┐   ┌───────────┐
 │QUEUED │──▶│STARTING │──▶│ RUNNING │──▶│ COMPLETED │
 └───────┘   └─────────┘   └────┬────┘   └───────────┘
                                 │
                            stop()│ / error
                                 │
                            ┌────▼────┐
                            │ STOPPED │
                            │ / ERROR │
                            └─────────┘
```

#### Concurrent Process Management

The Process Manager maintains an in-memory registry of all active processes:

```python
class ProcessRegistry:
    _processes: dict[UUID, ManagedProcess]  # session_id → process handle

    async def start(self, session: Session) -> ManagedProcess
    async def stop(self, session_id: UUID) -> None
    async def send_input(self, session_id: UUID, text: str) -> None
    async def get_status(self, session_id: UUID) -> ProcessStatus
    async def list_active(self) -> list[ManagedProcess]
```

On application restart, the Process Manager queries the database for sessions that were in `RUNNING` state and attempts to reconnect or mark them as `ERROR`.

---

### 3.7 Cloudflare Tunnel (cloudflared)

Cloudflare Tunnel provides secure, encrypted access to the application from the public internet without opening inbound ports on the host machine.

#### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Internet                                                      │
│                                                                │
│  ┌──────────┐   HTTPS   ┌────────────────────────────────┐   │
│  │ Browser  │◀─────────▶│ Cloudflare Edge Network        │   │
│  │ (remote) │           │                                │   │
│  └──────────┘           │  ┌──────────────────────────┐  │   │
│                          │  │ Cloudflare Access Policy │  │   │
│                          │  │                          │  │   │
│                          │  │ • Email OTP              │  │   │
│                          │  │ • GitHub OAuth           │  │   │
│                          │  │ • Google Workspace       │  │   │
│                          │  │ • IP allow-list          │  │   │
│                          │  └───────────┬──────────────┘  │   │
│                          └──────────────┼─────────────────┘   │
│                                         │                      │
│                              Tunnel (outbound only)            │
│                                         │                      │
│  ┌──────────────────────────────────────┼──────────────────┐  │
│  │ Host Machine                         │                  │  │
│  │                                      ▼                  │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │ cloudflared (Docker container)                    │  │  │
│  │  │                                                    │  │  │
│  │  │  Ingress Rules:                                    │  │  │
│  │  │  ┌───────────────────────────────────────────┐    │  │  │
│  │  │  │ orchestrator.yourdomain.com → localhost:5173│    │  │  │
│  │  │  │ api.orchestrator.yourdomain.com → localhost:8000│ │  │  │
│  │  │  └───────────────────────────────────────────┘    │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

#### Authentication Flow

```
1. User visits https://orchestrator.yourdomain.com
2. Cloudflare Access intercepts the request
3. User authenticates via configured IdP (email OTP, GitHub, etc.)
4. Cloudflare sets a signed JWT cookie (CF_Authorization)
5. Request is forwarded through the tunnel to the backend
6. Backend validates the CF_Authorization JWT:
   a. Verifies signature against Cloudflare's public keys
   b. Checks audience tag matches the Access application ID
   c. Extracts user identity (email, name)
7. Backend issues its own session JWT for subsequent API calls
8. For local access (localhost), steps 2-6 are bypassed;
   a local auth middleware issues a session JWT directly
```

---

## 4. Technology Stack Rationale

| Layer | Technology | Rationale |
|---|---|---|
| **SPA Framework** | React 18 + TypeScript + Vite | React 18 provides concurrent rendering for responsive UIs during heavy terminal output streaming. TypeScript enforces type safety across the entire frontend, catching mismatches between API schemas and component props at compile time. Vite delivers sub-200ms HMR in development and produces highly optimized production bundles with tree-shaking and code splitting. |
| **Styling** | Tailwind CSS + shadcn/ui | Tailwind's utility-first approach eliminates CSS naming collisions and dead code. shadcn/ui provides accessible, unstyled component primitives (dialogs, dropdowns, command palettes) built on Radix UI, allowing full visual customization through Tailwind classes without fighting opinionated component library styles. |
| **Client State** | Zustand + React Query (TanStack) | Zustand is a lightweight (~1KB) global state manager for ephemeral UI state (sidebar toggle, active tab, notification queue) that avoids the boilerplate of Redux or Context+Reducer. TanStack React Query handles all server-state concerns: fetching, caching with stale-while-revalidate, background refetching, pagination, and optimistic mutations. This separation prevents the common pitfall of mixing UI state and server state in a single store. |
| **Real-Time** | WebSocket (native) | Native browser WebSocket provides full-duplex communication for streaming Claude Code terminal output with minimal overhead. Unlike SSE, WebSocket supports bidirectional messaging, enabling the user to send input (keystrokes, cancel signals) back to running processes. No additional library is needed beyond a thin reconnection wrapper. |
| **API Framework** | FastAPI | FastAPI is async-native, running on Starlette/Uvicorn with first-class `asyncio` support -- critical for non-blocking subprocess management and concurrent WebSocket connections. Automatic OpenAPI documentation generation from Pydantic models eliminates API doc drift. Python type hints provide editor autocompletion, request validation, and response serialization with zero extra configuration. Its dependency injection system cleanly provides database sessions, Redis clients, and auth context to route handlers. |
| **ORM** | SQLAlchemy 2.0 (async) | SQLAlchemy 2.0's native async session support integrates cleanly with FastAPI's async request handlers, eliminating thread-pool hacks. Its unit-of-work pattern and identity map prevent duplicate queries. Alembic (SQLAlchemy's migration tool) provides auto-generated, reviewable migration scripts that run at startup, ensuring the database schema always matches the ORM models. |
| **Database** | PostgreSQL 16 | PostgreSQL is the most reliable open-source relational database, with decades of proven stability. Version 16 adds performance improvements for concurrent workloads. JSONB columns store semi-structured metadata (task parameters, schedule templates) without schema changes. Full-text search indexes enable fast searching across task prompts and session logs. Advisory locks support distributed coordination if multiple backend instances are needed. |
| **Queue / Cache** | Redis 7 | Redis 7 provides three capabilities in a single dependency: (1) persistent job queue backing for APScheduler via Redis keys with TTL, (2) pub/sub channels for real-time output streaming from Claude processes to WebSocket handlers, and (3) ephemeral caching with TTL for frequently accessed data like project details and analytics aggregates. Its single-threaded architecture guarantees atomic operations for queue ordering without locks. |
| **Scheduler** | APScheduler 4 | APScheduler 4 is an in-process Python scheduler that shares the FastAPI event loop, eliminating the need for a separate Celery worker or cron daemon. It supports cron expressions, fixed intervals, and one-shot triggers. Persistent job storage in Redis ensures scheduled jobs survive restarts. Its async executor invokes service methods directly, avoiding serialization overhead. |
| **Process Control** | asyncio.subprocess + paramiko | `asyncio.subprocess` provides non-blocking process spawning and I/O streaming for local Claude Code instances, integrating naturally with the async event loop. `paramiko` adds SSH transport for controlling Claude Code on remote machines. Together they offer a unified `ProcessManager` interface that abstracts the execution backend, enabling the rest of the application to be agnostic about where a Claude process runs. |
| **Auth** | Cloudflare Access + JWT session tokens | Cloudflare Access provides zero-trust authentication at the network edge, supporting multiple identity providers (email OTP, GitHub, Google Workspace) without any application-level auth code for remote access. The backend validates Cloudflare's signed JWT to extract user identity, then issues its own shorter-lived session JWT for API calls. Local access (localhost) bypasses Cloudflare entirely, using a simplified auth flow for development convenience. |
| **Tunneling** | cloudflared | `cloudflared` establishes an outbound-only encrypted tunnel from the host to Cloudflare's edge network. No inbound ports need to be opened on the host firewall or router. This eliminates the complexity and security risk of port forwarding, dynamic DNS, and self-managed TLS certificates. The tunnel is defined as a Docker Compose service, starting and stopping with the rest of the stack. |
| **Containers** | Docker + Docker Compose | Docker provides reproducible, isolated environments for each service, eliminating "works on my machine" issues. Docker Compose defines the entire stack (frontend, backend, PostgreSQL, Redis, cloudflared) in a single `docker-compose.yml`, enabling one-command deployment. Compose profiles (e.g., `production`) conditionally include the Cloudflare Tunnel service. Named volumes ensure data persistence across container restarts. |

---

## 5. Data Flow Diagrams

### 5.1 Task Execution Flow: Prompt to Result

This diagram traces the complete lifecycle of a user-submitted prompt from creation through execution to result display.

```
┌────────┐
│  User  │
└───┬────┘
    │ 1. Types prompt, clicks "Add to Queue"
    ▼
┌──────────────────┐
│ Frontend (React)  │
│                   │
│ POST /api/v1/     │
│   tasks           │
│ {                 │
│   project_id: ... │
│   prompt: "..."   │
│   priority: 5     │
│ }                 │
└────────┬─────────┘
         │ 2. REST API call
         ▼
┌──────────────────────────────────────────────────────────────┐
│ Backend (FastAPI)                                             │
│                                                               │
│  api/v1/tasks.py                                              │
│    │                                                          │
│    ▼                                                          │
│  task_service.create_task()                                   │
│    │                                                          │
│    ├── 3. Validate input (Pydantic schema)                    │
│    ├── 4. Assign queue_position (max + 1)                     │
│    ├── 5. INSERT INTO tasks (...) → PostgreSQL                │
│    └── 6. Return TaskRead response                            │
│                                                               │
└────────┬─────────────────────────────────────────────────────┘
         │ 7. 201 Created
         ▼
┌──────────────────┐
│ Frontend          │
│ React Query cache │
│ invalidates       │
│ ['tasks'] query   │
│ → UI updates      │
└────────┬─────────┘
         │ 8. User clicks "Run" on the task (or auto-dequeue triggers)
         ▼
┌──────────────────────────────────────────────────────────────┐
│ Backend                                                       │
│                                                               │
│  session_service.start_session()                              │
│    │                                                          │
│    ├── 9. Create Session record (status: STARTING)            │
│    ├── 10. Update Task record (status: RUNNING)               │
│    │                                                          │
│    ▼                                                          │
│  process_service.spawn()                                      │
│    │                                                          │
│    ├── 11a. [LOCAL] asyncio.create_subprocess_exec("claude")  │
│    │   OR                                                     │
│    ├── 11b. [REMOTE] paramiko SSH → exec_command("claude")    │
│    │                                                          │
│    ├── 12. Feed prompt to Claude Code stdin                   │
│    │                                                          │
│    ├── 13. Stdout reader task (async loop):                   │
│    │       for each JSON line from stdout:                    │
│    │         ├── Parse output event                           │
│    │         ├── redis.publish("session:{id}:output", data)   │
│    │         └── Append to output_log in PostgreSQL           │
│    │                                                          │
│    └── 14. Process exit detected:                             │
│            ├── Update Session (status: COMPLETED)             │
│            ├── Update Task (status: COMPLETED)                │
│            ├── Record usage (tokens, cost) → usage_records    │
│            └── redis.publish("session:{id}:status", "done")   │
│                                                               │
└──────────────────────────────────────────────────────────────┘

Meanwhile, on the frontend (parallel to steps 13-14):

┌──────────────────────────────────────────────────────────────┐
│ Frontend                                                      │
│                                                               │
│  useWebSocket("session:{id}")                                 │
│    │                                                          │
│    ├── 15. Connect: ws://backend:8000/ws/sessions/{id}        │
│    │                                                          │
│    ▼                                                          │
│  Backend WebSocket Handler                                    │
│    │                                                          │
│    ├── 16. redis.subscribe("session:{id}:output")             │
│    ├── 17. redis.subscribe("session:{id}:status")             │
│    │                                                          │
│    └── 18. For each Redis message:                            │
│            └── websocket.send_json(message)                   │
│                │                                              │
│                ▼                                              │
│  Frontend SessionTerminal component                           │
│    │                                                          │
│    ├── 19. Append output to ring buffer                       │
│    ├── 20. Render terminal output (auto-scroll)               │
│    └── 21. On "done" status → show completion badge           │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Scheduled Job Execution Flow

```
┌─────────────────────────────────────────────────────┐
│ APScheduler (inside FastAPI process)                 │
│                                                      │
│  1. CronTrigger fires at scheduled time              │
│     │                                                │
│     ▼                                                │
│  2. Resolve template variables:                      │
│     "Review {{branch}}" → "Review main"              │
│     │                                                │
│     ▼                                                │
│  3. Call task_service.create_task(                    │
│       project_id=schedule.project_id,                │
│       prompt=resolved_prompt,                        │
│       source="schedule",                             │
│       schedule_id=schedule.id                        │
│     )                                                │
│     │                                                │
│     ▼                                                │
│  4. If auto_execute enabled:                         │
│       session_service.start_session(task)            │
│       → Same flow as manual execution (5.1 above)    │
│     Else:                                            │
│       Task remains QUEUED for manual execution       │
│                                                      │
│  5. Update schedule.last_run_at, next_run_at         │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### 5.3 Output Streaming Pipeline

```
Claude Code Process                Redis                  WebSocket Handler          Browser
       │                             │                         │                       │
       │ stdout: {"type":"text",     │                         │                       │
       │  "content":"Hello..."}      │                         │                       │
       ├────────────────────────────▶│                         │                       │
       │  PUBLISH session:abc:output │                         │                       │
       │                             ├────────────────────────▶│                       │
       │                             │  message received       │                       │
       │                             │  on subscription        ├──────────────────────▶│
       │                             │                         │  ws.send_json(...)     │
       │                             │                         │                       │
       │ stdout: {"type":"tool_use", │                         │                       │
       │  "name":"write_file",...}   │                         │                       │
       ├────────────────────────────▶│                         │                       │
       │                             ├────────────────────────▶│                       │
       │                             │                         ├──────────────────────▶│
       │                             │                         │                       │
       │ exit(0)                     │                         │                       │
       ├────────────────────────────▶│                         │                       │
       │  PUBLISH session:abc:status │                         │                       │
       │  {"status":"completed"}     ├────────────────────────▶│                       │
       │                             │                         ├──────────────────────▶│
       │                             │                         │  ws.close()           │
```

---

## 6. Communication Patterns

### 6.1 REST API (HTTP/JSON)

The primary communication channel between the frontend and backend. Used for all CRUD operations and command invocations.

#### Conventions

- **Base URL:** `/api/v1/`
- **Content-Type:** `application/json`
- **Authentication:** `Authorization: Bearer <jwt>` header
- **Pagination:** Query parameters `?page=1&per_page=20`, response envelope `{ items: T[], total: int, page: int, per_page: int }`
- **Error Format:** `{ detail: string, code: string, errors?: object }`
- **Status Codes:** 200 (OK), 201 (Created), 204 (No Content), 400 (Validation Error), 401 (Unauthorized), 404 (Not Found), 409 (Conflict), 422 (Unprocessable Entity), 500 (Internal Server Error)

#### Endpoint Groups

```
/api/v1/
├── /projects                  # Project CRUD
│   └── /{id}/tasks            # Tasks scoped to a project
│   └── /{id}/sessions         # Sessions scoped to a project
│   └── /{id}/schedules        # Schedules scoped to a project
├── /tasks                     # Cross-project task operations
│   └── /{id}/reorder          # Queue position update
├── /sessions                  # Session lifecycle
│   └── /{id}/start            # Start Claude Code process
│   └── /{id}/stop             # Stop Claude Code process
│   └── /{id}/output           # Historical output (paginated)
├── /schedules                 # Schedule CRUD
│   └── /{id}/trigger          # Trigger immediate execution
├── /instances                 # Claude Code instance CRUD
│   └── /{id}/test             # SSH connectivity test
├── /analytics                 # Usage and cost aggregation
│   └── /usage                 # Token usage over time
│   └── /costs                 # Cost breakdown by project
└── /health                    # Liveness and readiness probes
```

> Full endpoint reference: [api-reference.md](api-reference.md)

### 6.2 WebSocket (Full-Duplex Streaming)

Used exclusively for real-time session output streaming and interactive input.

#### Connection Lifecycle

```
Client                                              Server
  │                                                    │
  │  GET /ws/sessions/{session_id}                     │
  │  Upgrade: websocket                                │
  │  Authorization: Bearer <jwt>                       │
  ├───────────────────────────────────────────────────▶│
  │                                                    │
  │  101 Switching Protocols                           │
  │◀───────────────────────────────────────────────────┤
  │                                                    │
  │  ◀── Server pushes output frames ──▶               │
  │  {"type":"output","data":"Hello...","ts":"..."}    │
  │◀───────────────────────────────────────────────────┤
  │                                                    │
  │  {"type":"output","data":"Writing file..."}        │
  │◀───────────────────────────────────────────────────┤
  │                                                    │
  │  ──▶ Client sends input ──▶                        │
  │  {"type":"input","data":"yes\n"}                   │
  ├───────────────────────────────────────────────────▶│
  │                                                    │
  │  {"type":"status","data":"completed"}              │
  │◀───────────────────────────────────────────────────┤
  │                                                    │
  │  Connection closed (1000 Normal Closure)           │
  │◀──────────────────────────────────────────────────▶│
```

#### Message Frame Schema

```json
{
  "type": "output" | "status" | "usage" | "error" | "input",
  "data": "...",
  "timestamp": "2026-02-06T10:30:00Z",
  "session_id": "uuid",
  "sequence": 42
}
```

#### Reconnection Strategy

The frontend WebSocket client implements exponential backoff with jitter:

```
Attempt 1:  wait 1s  + random(0, 500ms)
Attempt 2:  wait 2s  + random(0, 500ms)
Attempt 3:  wait 4s  + random(0, 500ms)
Attempt 4:  wait 8s  + random(0, 500ms)
Attempt 5:  wait 16s + random(0, 500ms)
Max:        wait 30s + random(0, 500ms)
```

On reconnection, the client sends a `{"type": "replay", "last_sequence": N}` message to request missed frames. The server replays buffered messages from Redis (retained for 5 minutes).

> Full protocol reference: [websocket-protocol.md](websocket-protocol.md)

### 6.3 Redis Pub/Sub (Internal Event Bus)

Redis pub/sub is used exclusively for internal communication between the Process Manager and WebSocket handlers. It is never exposed to the frontend directly.

#### Channel Architecture

```
Process Manager                    Redis Pub/Sub                  WebSocket Handlers
                                                                  (one per connected client)
┌─────────────────┐              ┌─────────────────┐
│ stdout reader   │──PUBLISH────▶│ session:{id}    │────SUBSCRIBE──▶ ws_handler_1
│                 │              │   :output       │────SUBSCRIBE──▶ ws_handler_2
└─────────────────┘              └─────────────────┘
                                                                    (multiple clients can
┌─────────────────┐              ┌─────────────────┐                 watch same session)
│ status monitor  │──PUBLISH────▶│ session:{id}    │
│                 │              │   :status       │────SUBSCRIBE──▶ ws_handler_1
└─────────────────┘              └─────────────────┘

┌─────────────────┐              ┌─────────────────┐
│ usage tracker   │──PUBLISH────▶│ session:{id}    │
│                 │              │   :usage        │────SUBSCRIBE──▶ ws_handler_1
└─────────────────┘              └─────────────────┘
```

#### Advantages of Redis Pub/Sub Over Direct Coupling

1. **Decoupling**: The Process Manager does not need to know about WebSocket connections. It simply publishes events.
2. **Fan-Out**: Multiple browser tabs or users can watch the same session simultaneously. Each WebSocket handler subscribes independently.
3. **Buffering**: Recent messages are stored in a Redis list alongside the pub/sub channel, enabling replay on reconnection.
4. **Future Scalability**: If the backend scales to multiple processes (e.g., behind a load balancer), Redis pub/sub ensures all instances receive all events regardless of which instance spawned the process.

---

## 7. Scalability Considerations

### 7.1 Current Architecture (Single Host)

The default deployment runs all services on a single Docker host. This configuration supports:

| Resource | Capacity |
|---|---|
| Concurrent Claude Code processes | 5-10 (limited by host CPU/RAM and Claude API rate limits) |
| Concurrent WebSocket connections | ~1,000 (limited by Uvicorn worker async capacity) |
| Database connections | 30 (10 pool + 20 overflow) |
| Redis connections | 20 (connection pool) |
| Scheduled jobs | Hundreds (APScheduler in-process) |

### 7.2 Horizontal Scaling Path

The architecture is designed to scale horizontally with minimal changes:

```
                    ┌──────────────────┐
                    │   Load Balancer  │
                    │   (nginx/Caddy)  │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
        │ Backend 1 │ │ Backend 2 │ │ Backend 3 │
        │ (FastAPI) │ │ (FastAPI) │ │ (FastAPI) │
        └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────▼─────┐ ┌─────▼─────┐        │
        │PostgreSQL │ │  Redis    │        │
        │ (primary) │ │ (single)  │        │
        └───────────┘ └───────────┘        │
                                            │
                             ┌──────────────▼──────────────┐
                             │     Shared Process Registry  │
                             │     (Redis-backed)           │
                             └─────────────────────────────┘
```

#### What Scales Without Changes

- **REST API handlers**: Stateless; any backend instance can handle any request.
- **WebSocket handlers**: Subscribe to Redis pub/sub; any instance can serve any session's output.
- **Database queries**: Connection pooling distributes load across backend instances.

#### What Requires Modification for Multi-Instance

| Component | Current | Scaled |
|---|---|---|
| **Process Registry** | In-memory `dict` | Redis-backed registry with process ownership tracking |
| **APScheduler** | Single instance, Redis job store | Leader election via Redis lock; only one instance runs the scheduler |
| **WebSocket Sticky Sessions** | Not needed (single instance) | Load balancer routes WebSocket upgrades to the same backend via session affinity or Redis-backed handoff |
| **File System Access** | Local Docker socket | Shared volume or distributed process management |

### 7.3 Database Scalability

PostgreSQL supports several scaling strategies without replacing the database:

- **Connection Pooling**: PgBouncer can be placed between backend instances and PostgreSQL to reduce connection overhead.
- **Read Replicas**: Analytics queries and output log reads can be routed to read replicas via SQLAlchemy's horizontal sharding support.
- **Table Partitioning**: The `usage_records` table can be partitioned by month for efficient historical queries and archival.
- **Indexing Strategy**: B-tree indexes on foreign keys (`project_id`, `session_id`), GIN indexes on JSONB columns, and full-text indexes on `prompt` columns.

### 7.4 Redis Scalability

- **Redis Sentinel**: Provides automatic failover for high-availability requirements.
- **Key Expiration**: All cache keys use TTL expiration. Pub/sub messages are not persisted beyond the replay buffer (5-minute retention in Redis lists).
- **Memory Management**: `maxmemory-policy allkeys-lru` ensures Redis evicts least-recently-used cache keys under memory pressure without affecting pub/sub or job store keys (which use separate key prefixes).

### 7.5 Process Management Scalability

- **Local Limit**: The number of concurrent local Claude Code processes is bounded by host resources. A configurable `MAX_LOCAL_PROCESSES` setting (default: 5) prevents resource exhaustion.
- **SSH Distribution**: Remote instances distribute process load across multiple machines. Each `Instance` record represents a separate execution target.
- **Queue-Based Execution**: When all execution slots are occupied, tasks remain in `QUEUED` status. The auto-dequeue service polls for available slots and starts the next task by priority and queue position.

```
Task Queue (ordered by priority, then queue_position)
┌────┬────┬────┬────┬────┬────┬────┐
│ T1 │ T2 │ T3 │ T4 │ T5 │ T6 │ T7 │
│RUN │RUN │RUN │WAIT│WAIT│WAIT│WAIT│
└────┴────┴────┴────┴────┴────┴────┘
  │    │    │
  ▼    ▼    ▼
┌────┐┌────┐┌────┐
│Inst││Inst││Inst│  ← 3 execution slots (local + remote)
│ 1  ││ 2  ││ 3  │
└────┘└────┘└────┘

When T1 completes → T4 auto-starts on Instance 1
```

---

## 8. Cross-Reference

This architecture document provides the structural overview. Detailed specifications for each area are maintained in dedicated documents:

| Document | Description | Key Topics |
|---|---|---|
| [Data Model](data-model.md) | Database schema and entity relationships | Table definitions, column types, constraints, indexes, enum values, ER diagram, migration strategy |
| [Backend Specification](backend-spec.md) | FastAPI application structure and logic | Project layout, service classes, dependency injection, error handling, configuration management, testing strategy |
| [Frontend Specification](frontend-spec.md) | React application structure and patterns | Component hierarchy, state management patterns, routing, API client configuration, build pipeline |
| [API Reference](api-reference.md) | Complete REST endpoint documentation | Request/response schemas, status codes, pagination, filtering, authentication headers |
| [WebSocket Protocol](websocket-protocol.md) | Real-time messaging specification | Frame types, connection lifecycle, reconnection, replay, error handling |
| [UI/UX Design Spec](ui-design-spec.md) | Visual design system and wireframes | Color palette, typography, spacing, component variants, responsive breakpoints, accessibility |
| [Claude CLI Integration](claude-cli-integration.md) | Claude Code CLI interface details | CLI flags, output format parsing, process lifecycle, error codes, version compatibility |
| [Deployment Guide](deployment.md) | Production deployment procedures | Docker Compose configuration, environment variables, Cloudflare Tunnel setup, SSL, backups, monitoring |
| [Development Setup](development-setup.md) | Local development environment | Prerequisites, tooling, dev workflow, hot reload, debugging, database seeding |
| [Security](security.md) | Security architecture and threat model | Authentication flow, JWT handling, network isolation, secret management, CORS policy, input sanitization |
| [Roadmap](roadmap.md) | Implementation phases and milestones | Phase breakdown, priority ordering, feature dependencies, future expansion plans |

---

*This document is maintained as a living reference. As the architecture evolves, update the relevant sections and cross-references accordingly.*
