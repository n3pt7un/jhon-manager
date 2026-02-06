# Claude Orchestrator - Implementation Roadmap

## Overview

This roadmap defines a **phased implementation approach** for the Claude Orchestrator project, spanning approximately 9 weeks from initial scaffolding to production-ready deployment. Each phase builds on the deliverables of the previous one, establishing a solid foundation before introducing complexity.

The guiding principles are:

1. **Vertical slices first** - Each phase delivers a working, demonstrable feature set rather than horizontal layers of incomplete functionality.
2. **Infrastructure before features** - Docker, CI, and database migrations are established in Phase 1 so every subsequent phase benefits from a stable development environment.
3. **Feedback loops early** - WebSocket streaming and live terminal output arrive in Phase 2, ensuring that the core user experience (watching Claude work) is validated before investing in scheduling, analytics, or security.
4. **Security last, but not least** - Authentication and tunnel configuration are deferred to Phase 5 because local development does not require them, but they are mandatory before any production exposure.

---

## Phase 1: Foundation (Week 1-2)

**Goal:** Establish the project skeleton, development environment, database schema, and basic CRUD operations so that every team member can run the full stack locally and navigate the UI.

### 1.1 Project Initialization

- [ ] Create monorepo structure with top-level directories: `backend/`, `frontend/`, `docker/`, `docs/`, `scripts/`
- [ ] Initialize Python project with `pyproject.toml` (Poetry or pip-tools)
- [ ] Initialize frontend project with Vite + React + TypeScript
- [ ] Configure shared `.editorconfig`, `.prettierrc`, and `.eslintrc` for consistent formatting
- [ ] Add root-level `Makefile` with common commands (`make up`, `make down`, `make migrate`, `make test`)
- [ ] Set up `.gitignore` for Python, Node, Docker, and IDE artifacts
- [ ] Create `CONTRIBUTING.md` with development workflow guidelines

### 1.2 Docker Compose Environment

- [ ] Write `docker-compose.yml` with services: `postgres`, `redis`, `backend`, `frontend`
- [ ] Configure PostgreSQL 16 with named volume for data persistence
- [ ] Configure Redis 7 with `appendonly yes` for durability
- [ ] Create backend `Dockerfile` with hot-reload support (uvicorn `--reload`)
- [ ] Create frontend `Dockerfile` with Vite dev server and HMR
- [ ] Add `.env.example` with all required environment variables
- [ ] Verify full stack starts cleanly with `docker compose up`
- [ ] Add health check configurations for all services in Compose

### 1.3 FastAPI Application Skeleton

- [ ] Set up FastAPI app factory pattern (`create_app()`)
- [ ] Configure CORS middleware for local frontend origin
- [ ] Implement `/health` endpoint returning service status, database connectivity, and Redis connectivity
- [ ] Set up structured logging with `structlog` (JSON format in production, colored console in dev)
- [ ] Configure exception handlers for `HTTPException`, `ValidationError`, and unhandled exceptions
- [ ] Add OpenAPI metadata (title, description, version, tags)
- [ ] Create API router organization: `api/v1/projects.py`, `api/v1/instances.py`, etc.
- [ ] Add request ID middleware for tracing

### 1.4 Database Models and Migrations

- [ ] Configure SQLAlchemy 2.0 async engine with connection pooling
- [ ] Define `Project` model: `id`, `name`, `description`, `root_path`, `created_at`, `updated_at`
- [ ] Define `Instance` model: `id`, `project_id` (FK), `name`, `type` (local/ssh), `status`, `ssh_config_id` (nullable FK), `created_at`, `updated_at`
- [ ] Define `SSHConfig` model (stub): `id`, `name`, `host`, `port`, `username`, `key_path`, `created_at`
- [ ] Define `Task` model (stub): `id`, `instance_id` (FK), `prompt`, `status`, `priority`, `created_at`
- [ ] Set up Alembic with async driver support
- [ ] Generate and verify initial migration
- [ ] Add seed data script for development (`scripts/seed.py`)
- [ ] Verify migration runs cleanly on fresh database

### 1.5 React Application Setup

- [ ] Initialize Vite project with React 18 and TypeScript strict mode
- [ ] Install and configure Tailwind CSS v3 with custom color palette matching design spec
- [ ] Install and configure `shadcn/ui` component library
- [ ] Set up `react-router-dom` v6 with route definitions for: Dashboard, Projects, Project Detail, Instances, Settings
- [ ] Configure `@tanstack/react-query` for server state management
- [ ] Set up Axios instance with base URL, interceptors, and error handling
- [ ] Add global CSS variables for theming (dark mode ready)
- [ ] Configure path aliases (`@/components`, `@/lib`, `@/hooks`, etc.)

### 1.6 AppShell Layout

- [ ] Build collapsible sidebar with navigation links and icons (Lucide)
- [ ] Build header bar with breadcrumbs, search placeholder, and status indicator
- [ ] Build status bar (bottom) showing connection state and active instance count
- [ ] Implement responsive behavior: sidebar collapses to icons on medium screens, becomes a drawer on small screens
- [ ] Add keyboard shortcut (`Cmd/Ctrl + B`) to toggle sidebar
- [ ] Create loading skeleton components for each major section
- [ ] Add `<Outlet />` content area with scroll management

### 1.7 Basic CRUD for Projects and Instances

- [ ] **API - Projects:** `GET /projects`, `POST /projects`, `GET /projects/{id}`, `PUT /projects/{id}`, `DELETE /projects/{id}`
- [ ] **API - Instances:** `GET /instances?project_id=`, `POST /instances`, `GET /instances/{id}`, `PUT /instances/{id}`, `DELETE /instances/{id}`
- [ ] Add Pydantic request/response schemas with validation
- [ ] Implement pagination for list endpoints (`?page=1&per_page=20`)
- [ ] **UI - Project List:** Card grid view with project name, instance count, last activity
- [ ] **UI - Project Create/Edit:** Modal form with validation (react-hook-form + zod)
- [ ] **UI - Project Detail:** Tabbed view showing instances, tasks (placeholder), settings
- [ ] **UI - Instance List:** Table view within project detail showing status badges
- [ ] **UI - Instance Create/Edit:** Modal form with type selector (local/ssh)
- [ ] Add confirmation dialogs for delete operations
- [ ] Add optimistic updates for better perceived performance
- [ ] Write API integration tests with `pytest` and `httpx`

### Phase 1 Deliverables

- Working Docker stack that starts with a single command
- PostgreSQL database with schema migrations
- FastAPI backend with health check and CRUD endpoints
- React frontend with navigation, AppShell layout, and project/instance management
- Seed data for development

---

## Phase 2: Core Engine (Week 3-4)

**Goal:** Implement the heart of the system -- the ability to send prompts to Claude Code, stream output in real time, and manage a task queue with an interactive terminal UI.

### 2.1 Claude Code Process Manager

- [ ] Create `ProcessManager` class that spawns `claude` CLI as a subprocess
- [ ] Implement stdin/stdout/stderr stream capture with asyncio
- [ ] Handle process lifecycle: spawn, monitor, kill, cleanup
- [ ] Parse Claude Code output to extract structured events (thinking, writing, tool use, completion)
- [ ] Implement output buffering with configurable flush interval
- [ ] Add timeout handling with configurable per-task limits
- [ ] Implement graceful shutdown (SIGTERM then SIGKILL after grace period)
- [ ] Add process isolation: one subprocess per instance, no cross-contamination
- [ ] Create working directory management (each instance runs in its project's `root_path`)
- [ ] Write unit tests with mocked subprocess

### 2.2 Task Model and Queue

- [ ] Extend `Task` model with fields: `output`, `started_at`, `completed_at`, `exit_code`, `token_usage`, `error_message`, `retry_count`
- [ ] Implement Redis-backed task queue with priority support
- [ ] Create `TaskRunner` service that dequeues tasks and dispatches to `ProcessManager`
- [ ] Implement task state machine: `pending` -> `queued` -> `running` -> `completed` | `failed` | `cancelled`
- [ ] Add concurrency control: configurable max concurrent tasks per instance (default: 1)
- [ ] Implement task cancellation (stop running subprocess, update state)
- [ ] Add dead letter queue for tasks that fail repeatedly
- [ ] **API endpoints:** `POST /tasks` (create + enqueue), `GET /tasks/{id}`, `PATCH /tasks/{id}` (cancel/reorder), `GET /instances/{id}/tasks` (list with filters)
- [ ] Add bulk task creation endpoint: `POST /tasks/bulk`
- [ ] Write integration tests for the full task lifecycle

### 2.3 WebSocket Streaming

- [ ] Set up FastAPI WebSocket endpoint: `ws://localhost:8000/ws/tasks/{task_id}/stream`
- [ ] Implement Redis Pub/Sub channel per running task for output distribution
- [ ] Create WebSocket connection manager handling multiple concurrent viewers
- [ ] Stream structured messages: `{ type: "stdout" | "stderr" | "status" | "metadata", data: string, timestamp: ISO8601 }`
- [ ] Implement heartbeat/ping-pong to detect stale connections
- [ ] Handle reconnection: client receives missed output from Redis buffer on reconnect
- [ ] Add backpressure handling for slow consumers
- [ ] Write WebSocket integration tests

### 2.4 Terminal Integration (xterm.js)

- [ ] Install and configure `xterm.js` with `xterm-addon-fit`, `xterm-addon-web-links`, `xterm-addon-search`
- [ ] Create `<Terminal />` React component with WebSocket connection lifecycle
- [ ] Render ANSI color codes and cursor movement correctly
- [ ] Implement auto-scroll with "scroll lock" toggle (pause auto-scroll when user scrolls up)
- [ ] Add terminal toolbar: clear, copy all, search, scroll-to-bottom, download output
- [ ] Implement split-pane view: terminal on the right, task details on the left
- [ ] Handle terminal resize events and propagate dimensions
- [ ] Add loading state and connection error display within terminal frame
- [ ] Support viewing completed task output (replay from stored output)

### 2.5 Task Queue UI

- [ ] Create `<TaskQueue />` component showing all tasks for an instance in order
- [ ] Display task cards with: prompt preview, status badge, priority indicator, timestamps
- [ ] Implement drag-and-drop reordering with `@dnd-kit/core` and `@dnd-kit/sortable`
- [ ] Sync reorder operations to backend via `PATCH /tasks/{id}` with new priority
- [ ] Add inline status transitions: cancel button for running/queued, retry for failed
- [ ] Implement filters: by status (`all`, `pending`, `running`, `completed`, `failed`), by date range
- [ ] Add keyboard navigation: arrow keys to select, Enter to view, Delete to cancel
- [ ] Show real-time status updates via WebSocket events

### 2.6 Task Editor

- [ ] Integrate Monaco Editor for prompt editing (`@monaco-editor/react`)
- [ ] Configure syntax highlighting for markdown (prompts are typically markdown-like)
- [ ] Add prompt templates dropdown (hardcoded initial set, extensible later)
- [ ] Implement "Run" button that creates and immediately enqueues a task
- [ ] Add "Queue" button that creates a task in pending state without running
- [ ] Show estimated position in queue before submitting
- [ ] Add character count and estimated token count display
- [ ] Implement prompt history with quick recall (last 10 prompts per instance)

### 2.7 Instance Controls

- [ ] Add instance control bar: Start, Stop, Restart buttons with loading states
- [ ] Implement `POST /instances/{id}/start` - initialize ProcessManager, set status to `running`
- [ ] Implement `POST /instances/{id}/stop` - graceful shutdown, drain queue, set status to `stopped`
- [ ] Implement `POST /instances/{id}/restart` - stop then start sequence
- [ ] Show real-time instance status with colored indicators (green = running, yellow = starting, red = stopped, gray = error)
- [ ] Add instance detail panel: uptime, tasks completed, current task, resource usage
- [ ] Implement auto-restart on crash with configurable retry limit
- [ ] Broadcast instance status changes to all connected WebSocket clients

### Phase 2 Deliverables

- Functional task execution pipeline: create task, enqueue, execute via Claude Code, stream output
- Live terminal streaming with ANSI support
- Drag-and-drop task queue management
- Monaco-based prompt editor
- Instance lifecycle management (start/stop/restart)

---

## Phase 3: Scheduling & SSH (Week 5-6)

**Goal:** Enable automated task scheduling via cron expressions and extend instance management to support remote machines via SSH.

### 3.1 APScheduler Integration

- [ ] Install and configure APScheduler 4.x with async support
- [ ] Set up PostgreSQL job store for schedule persistence across restarts
- [ ] Create `Schedule` model: `id`, `name`, `instance_id` (FK), `prompt`, `cron_expression`, `timezone`, `enabled`, `next_run_at`, `last_run_at`, `created_at`, `updated_at`
- [ ] Implement scheduler service that starts with the application and recovers persisted jobs
- [ ] Handle missed job execution (configurable: skip, run immediately, or queue)
- [ ] Add jitter option to prevent thundering herd when multiple schedules share the same cron
- [ ] Implement schedule pause/resume without deleting the job
- [ ] Add maximum concurrent execution guard (skip if previous run still active)
- [ ] Write tests for schedule creation, trigger, and recovery

### 3.2 Schedule CRUD API and Cron Builder UI

- [ ] **API endpoints:** `GET /schedules`, `POST /schedules`, `GET /schedules/{id}`, `PUT /schedules/{id}`, `DELETE /schedules/{id}`, `POST /schedules/{id}/trigger` (manual trigger)
- [ ] Add schedule history endpoint: `GET /schedules/{id}/history` showing past executions
- [ ] **UI - Schedule List:** Table with name, cron expression (human-readable), next run, last run, status toggle
- [ ] **UI - Cron Builder:** Visual cron expression builder with:
  - [ ] Preset selectors (every hour, daily at midnight, weekdays at 9am, etc.)
  - [ ] Advanced mode with individual field editors (minute, hour, day, month, weekday)
  - [ ] Live preview showing the next 5 execution times
  - [ ] Natural language description of the cron expression
- [ ] **UI - Schedule Form:** Instance selector, prompt editor (Monaco), timezone picker, cron builder, enabled toggle
- [ ] Add calendar view showing scheduled tasks overlaid on a weekly timeline
- [ ] Implement inline enable/disable toggle in the schedule list

### 3.3 SSH Configuration Management

- [ ] **API endpoints:** `GET /ssh-configs`, `POST /ssh-configs`, `GET /ssh-configs/{id}`, `PUT /ssh-configs/{id}`, `DELETE /ssh-configs/{id}`
- [ ] Implement `POST /ssh-configs/{id}/test` to verify connectivity and return latency
- [ ] Store SSH private keys encrypted at rest (Fernet symmetric encryption with app secret key)
- [ ] Validate SSH config fields: hostname resolution, port range, key file format
- [ ] **UI - SSH Config List:** Table with name, host, port, username, last tested status
- [ ] **UI - SSH Config Form:** Host, port, username, auth method selector (key/password), key upload or paste, connection test button with real-time feedback
- [ ] Add SSH key generation utility: `POST /ssh-configs/generate-keypair`
- [ ] Implement known_hosts management to prevent MITM warnings

### 3.4 Paramiko SSH Execution

- [ ] Integrate Paramiko for SSH connections to remote hosts
- [ ] Create `SSHProcessManager` extending the base `ProcessManager` interface
- [ ] Implement remote command execution: establish SSH session, run `claude` CLI on remote host
- [ ] Stream remote stdout/stderr back through the same WebSocket pipeline
- [ ] Handle SSH authentication failures with clear error messages
- [ ] Implement remote working directory management (verify path exists, create if needed)
- [ ] Add SSH session timeout and keepalive configuration
- [ ] Support jump hosts / bastion servers via ProxyJump configuration
- [ ] Write integration tests with an SSH test container

### 3.5 SSH Connection Pooling

- [ ] Implement connection pool per SSH config with configurable pool size (default: 3)
- [ ] Add connection health checking with periodic keepalive pings
- [ ] Implement automatic reconnection on dropped connections
- [ ] Add connection metrics: active connections, idle connections, connection errors
- [ ] Implement graceful pool drain on SSH config update or delete
- [ ] Add connection pool status to the instance detail panel
- [ ] Configure pool eviction policy for idle connections (default: 5 minutes)

### Phase 3 Deliverables

- Cron-based task scheduling with visual cron builder
- Schedule management (create, edit, pause, resume, delete)
- SSH configuration with encrypted key storage
- Remote instance execution via SSH
- Connection pooling for SSH performance

---

## Phase 4: Analytics & Polish (Week 7-8)

**Goal:** Add comprehensive usage analytics, improve the user experience with visual dashboards, and polish the application for reliability.

### 4.1 Usage Tracking

- [ ] Create `UsageRecord` model: `id`, `task_id` (FK), `instance_id` (FK), `project_id` (FK), `input_tokens`, `output_tokens`, `total_tokens`, `model`, `duration_seconds`, `recorded_at`
- [ ] Parse Claude Code output to extract token usage from completion metadata
- [ ] Implement post-task hook that records usage after each task completion
- [ ] Add fallback token estimation (tiktoken-based) when exact counts are unavailable
- [ ] Aggregate usage records into daily/weekly/monthly rollups for query performance
- [ ] Create migration for usage tables and rollup materialized views
- [ ] Add data retention policy: raw records kept for 90 days, rollups kept indefinitely

### 4.2 Analytics API Endpoints

- [ ] `GET /analytics/summary` - Total tokens, total tasks, avg duration, active instances (with date range filter)
- [ ] `GET /analytics/by-project` - Token usage and task count grouped by project
- [ ] `GET /analytics/by-instance` - Token usage and task count grouped by instance
- [ ] `GET /analytics/timeline` - Daily token usage and task count for charting (configurable granularity: hourly, daily, weekly)
- [ ] `GET /analytics/heatmap` - Task activity data formatted for GitHub-style heatmap (52 weeks x 7 days)
- [ ] `GET /analytics/top-prompts` - Most frequently used prompts with usage counts
- [ ] Add CSV export for all analytics endpoints: `?format=csv`
- [ ] Implement query caching with Redis (TTL: 5 minutes for dashboards)

### 4.3 Dashboard Charts

- [ ] Install and configure `recharts` for React charting
- [ ] **Line Chart:** Daily token usage over time (input vs output breakdown)
- [ ] **Bar Chart:** Token usage by project (horizontal, sorted by usage)
- [ ] **Area Chart:** Task execution count over time with success/failure breakdown
- [ ] **Pie Chart:** Usage distribution across projects
- [ ] Add chart interaction: tooltips, click-to-filter, zoom on time range
- [ ] Implement responsive chart sizing with container queries
- [ ] Add date range picker (presets: 7d, 30d, 90d, custom) that controls all charts
- [ ] Create dashboard layout with grid system (2-column on desktop, single column on mobile)
- [ ] Add skeleton loaders for chart components during data fetch

### 4.4 Activity Heatmap

- [ ] Build GitHub-style contribution heatmap component
- [ ] Display 52 weeks of task activity with color intensity based on task count
- [ ] Add day-of-week labels (Mon, Wed, Fri) and month labels
- [ ] Implement hover tooltip showing date and exact task count
- [ ] Add click handler to filter dashboard to the selected day
- [ ] Support multiple color schemes (green, blue, purple) selectable in settings
- [ ] Calculate and display current streak and longest streak

### 4.5 Bulk Task Import

- [ ] Create `POST /tasks/import` endpoint accepting JSON array or newline-delimited prompts
- [ ] Support CSV import with columns: `prompt`, `priority`, `instance_id`
- [ ] Add file upload UI with drag-and-drop zone
- [ ] Implement import preview: show parsed tasks before committing
- [ ] Add validation with per-row error reporting
- [ ] Support import from clipboard (paste multiple prompts)
- [ ] Add import history log for auditing

### 4.6 Task Retry Logic

- [ ] Implement configurable retry policy per instance: max retries (default: 3), backoff strategy
- [ ] Support exponential backoff with jitter: `delay = min(base * 2^attempt + random_jitter, max_delay)`
- [ ] Add retry-specific fields to Task model: `retry_count`, `max_retries`, `next_retry_at`
- [ ] Create automatic retry trigger that enqueues failed tasks after backoff period
- [ ] Add manual retry button in the UI for individual failed tasks
- [ ] Implement "retry all failed" bulk action
- [ ] Exclude certain error types from retry (e.g., authentication errors, invalid prompt)
- [ ] Show retry countdown in the task queue UI

### 4.7 Error Handling and Notifications

- [ ] Implement global error boundary in React with fallback UI and error reporting
- [ ] Add toast notification system using `sonner` (success, error, warning, info)
- [ ] Show toast for: task completed, task failed, instance status change, schedule triggered, connection error
- [ ] Implement non-blocking error display for API failures (toast + optional detail expansion)
- [ ] Add error log page: searchable list of all errors with stack traces and context
- [ ] Implement connection loss banner with auto-reconnect countdown
- [ ] Add form-level validation messages with field highlighting

### 4.8 Performance Optimization

- [ ] Audit and optimize database queries: add indexes, fix N+1 queries, use eager loading
- [ ] Implement virtual scrolling for long task lists (`@tanstack/react-virtual`)
- [ ] Add API response compression (gzip/brotli middleware)
- [ ] Implement frontend code splitting with lazy routes
- [ ] Add service worker for offline shell caching
- [ ] Optimize WebSocket message batching (aggregate rapid updates into 100ms windows)
- [ ] Profile and optimize React renders with React DevTools
- [ ] Add database query logging in development for performance debugging

### Phase 4 Deliverables

- Full analytics dashboard with interactive charts and heatmap
- Bulk task import from file or clipboard
- Automatic retry with exponential backoff
- Toast notifications and comprehensive error handling
- Performance-optimized frontend and backend

---

## Phase 5: Security & Deployment (Week 9)

**Goal:** Harden the application for production exposure, configure Cloudflare Tunnel for secure access, and complete documentation and testing.

### 5.1 Cloudflare Tunnel Configuration

- [ ] Create `cloudflared` service in Docker Compose
- [ ] Write Cloudflare Tunnel configuration for routing to backend and frontend services
- [ ] Configure TLS termination at Cloudflare edge
- [ ] Set up DNS records for the tunnel hostname
- [ ] Add tunnel health monitoring and automatic restart
- [ ] Document tunnel setup process with screenshots
- [ ] Test tunnel connectivity from external network

### 5.2 Cloudflare Access JWT Validation

- [ ] Implement JWT validation middleware for FastAPI
- [ ] Fetch and cache Cloudflare Access JWKS (JSON Web Key Set) for signature verification
- [ ] Extract user identity (email, name) from JWT claims
- [ ] Create `User` model to store Cloudflare Access identities on first login
- [ ] Add user context to all API requests (available via dependency injection)
- [ ] Implement token refresh handling for long-lived sessions
- [ ] Add `X-Auth-User` header injection for audit logging
- [ ] Write tests with mocked JWT tokens

### 5.3 Auth Bypass for Local Development

- [ ] Create configurable auth mode: `AUTH_MODE=cloudflare | local | none`
- [ ] In `none` mode: skip JWT validation, inject a default development user
- [ ] In `local` mode: simple API key authentication for non-tunnel deployments
- [ ] In `cloudflare` mode: full JWT validation as described above
- [ ] Add clear visual indicator in the UI showing the current auth mode
- [ ] Ensure auth bypass cannot be accidentally enabled in production (environment variable guards)
- [ ] Document all auth modes and their use cases

### 5.4 Production Docker Builds

- [ ] Create multi-stage backend Dockerfile: build stage (install deps) -> runtime stage (slim image)
- [ ] Create multi-stage frontend Dockerfile: build stage (npm build) -> nginx stage (serve static)
- [ ] Configure nginx for frontend SPA routing (fallback to `index.html`)
- [ ] Add non-root user in all containers for security
- [ ] Implement Docker health checks for all services
- [ ] Create `docker-compose.prod.yml` with production overrides (no hot-reload, resource limits, restart policies)
- [ ] Optimize image sizes: target < 200MB backend, < 50MB frontend
- [ ] Add build-time arguments for version tagging
- [ ] Test full production stack startup and functionality

### 5.5 Documentation

- [ ] Write comprehensive `README.md` with project overview, architecture diagram, and quick start
- [ ] Create `docs/setup-guide.md` with step-by-step installation instructions for all platforms
- [ ] Document all environment variables with descriptions and defaults
- [ ] Write API documentation supplement (beyond auto-generated OpenAPI)
- [ ] Create `docs/architecture.md` describing system components and data flow
- [ ] Add troubleshooting guide for common issues
- [ ] Write deployment guide for Cloudflare Tunnel setup
- [ ] Add inline code comments for complex business logic

### 5.6 End-to-End Testing

- [ ] Set up Playwright for browser-based E2E testing
- [ ] Write E2E tests for critical user flows:
  - [ ] Create project -> add instance -> create task -> view output
  - [ ] Create schedule -> verify next run displays -> trigger manually
  - [ ] Configure SSH -> test connection -> create remote instance
  - [ ] View analytics dashboard -> change date range -> verify chart updates
- [ ] Add API integration test suite covering all endpoints
- [ ] Implement test data factories for consistent test setup
- [ ] Add CI pipeline configuration (GitHub Actions) for automated testing
- [ ] Configure test coverage reporting with minimum threshold (80%)
- [ ] Add load testing script for WebSocket connections (k6 or Artillery)

### Phase 5 Deliverables

- Cloudflare Tunnel with Access authentication
- Production-optimized Docker images
- Comprehensive documentation
- E2E test suite with CI integration
- Production-ready deployment

---

## Phase Dependencies

The following diagram illustrates the dependency relationships between phases and their major components. An arrow (`-->`) indicates that the source must be completed before the target can begin.

```
Phase 1: Foundation
├── 1.1 Project Init ──────────────────────────────────┐
├── 1.2 Docker Compose ────────────────────────────────┤
├── 1.3 FastAPI Skeleton ──────────────────────────────┤
├── 1.4 Database Models ───────────────────────────────┤
├── 1.5 React Setup ───────────────────────────────────┤
├── 1.6 AppShell Layout ───────── (depends on 1.5) ───┤
└── 1.7 CRUD Operations ──────── (depends on 1.3-1.6) ┘
         │
         v
Phase 2: Core Engine
├── 2.1 Process Manager ───────── (depends on 1.3) ───┐
├── 2.2 Task Queue ────────────── (depends on 2.1) ───┤
├── 2.3 WebSocket Streaming ───── (depends on 2.2) ───┤
├── 2.4 Terminal (xterm.js) ───── (depends on 2.3) ───┤
├── 2.5 Task Queue UI ────────── (depends on 2.2) ────┤
├── 2.6 Task Editor ──────────── (depends on 2.2) ────┤
└── 2.7 Instance Controls ────── (depends on 2.1) ────┘
         │
         v
Phase 3: Scheduling & SSH ───────── Phase 4: Analytics & Polish
├── 3.1 APScheduler ──────────┐    ├── 4.1 Usage Tracking ──────── (depends on 2.2)
├── 3.2 Schedule UI ──── (3.1)│    ├── 4.2 Analytics API ───────── (depends on 4.1)
├── 3.3 SSH Config ───────────┤    ├── 4.3 Dashboard Charts ────── (depends on 4.2)
├── 3.4 SSH Execution ── (3.3)│    ├── 4.4 Activity Heatmap ────── (depends on 4.2)
└── 3.5 Connection Pool (3.4) ┘    ├── 4.5 Bulk Import ──────────── (depends on 2.2)
         │                          ├── 4.6 Retry Logic ──────────── (depends on 2.2)
         │                          ├── 4.7 Error Handling ────────── (depends on 1.5)
         │                          └── 4.8 Performance Opt. ──────── (depends on all above)
         │                               │
         └───────────┬───────────────────┘
                     v
Phase 5: Security & Deployment
├── 5.1 Cloudflare Tunnel ────────────────────────────┐
├── 5.2 JWT Validation ──────── (depends on 5.1) ─────┤
├── 5.3 Auth Bypass ─────────── (depends on 5.2) ─────┤
├── 5.4 Production Builds ──── (depends on all above) ┤
├── 5.5 Documentation ────────────────────────────────┤
└── 5.6 E2E Testing ─────────── (depends on 5.4) ─────┘
```

**Key dependency notes:**

- **Phase 3 and Phase 4 can run in parallel.** Scheduling/SSH and Analytics/Polish have no mutual dependencies. If two developers are available, these phases can overlap to reduce total timeline from 9 weeks to approximately 7 weeks.
- **Phase 2 is the critical path.** Every subsequent phase depends on the process manager and task queue from Phase 2. Delays here cascade to all downstream work.
- **Phase 5 depends on all prior phases** being feature-complete, but documentation (5.5) can begin incrementally during earlier phases.

---

## Future Expansion Ideas (Post-v1)

The following features are explicitly out of scope for v1 but represent high-value additions for future development.

### Multi-User Support with RBAC
- [ ] Add `User` and `Role` models with many-to-many relationship
- [ ] Implement project-level roles: `owner`, `editor`, `viewer`
- [ ] Add permission checks to all API endpoints
- [ ] Create user management UI with invitation flow
- [ ] Support team creation and project sharing

### Prompt Templates Library
- [ ] Create `PromptTemplate` model with parameterized variables (`{{variable}}`)
- [ ] Build template editor with variable extraction and default values
- [ ] Add template categories and tagging
- [ ] Support template versioning with diff view
- [ ] Enable community sharing of templates (export/import)

### Git Integration
- [ ] Auto-commit after each task completion with configurable commit message templates
- [ ] Create a branch per task for isolation (`task/{task_id}-{slug}`)
- [ ] Show git diff in the task output panel after completion
- [ ] Support auto-PR creation on task branch completion
- [ ] Add git status indicator to project dashboard

### Notification System
- [ ] Slack webhook integration for task completion/failure alerts
- [ ] Discord bot integration for real-time notifications
- [ ] Email notifications via SendGrid or SMTP
- [ ] Configurable notification rules: per project, per event type, per severity
- [ ] In-app notification center with read/unread tracking

### Cost Budgets
- [ ] Define daily, weekly, and monthly token spending caps per project
- [ ] Real-time budget consumption tracking with warning thresholds (70%, 90%, 100%)
- [ ] Automatic task queue pause when budget is exceeded
- [ ] Budget allocation dashboard with forecasting
- [ ] Historical cost reporting with trend analysis

### A/B Prompt Testing
- [ ] Create `Experiment` model linking two or more tasks with the same goal but different prompts
- [ ] Side-by-side output comparison view
- [ ] Scoring interface for manual evaluation
- [ ] Aggregate experiment results with statistical summaries
- [ ] Prompt iteration history with performance tracking

### Plugin System
- [ ] Define plugin interface for pre-task and post-task hooks
- [ ] Support hooks written in Python (loaded dynamically)
- [ ] Built-in plugins: linting output, notification, git commit, file backup
- [ ] Plugin configuration UI with enable/disable toggles
- [ ] Plugin marketplace concept for sharing extensions

### Mobile-Optimized View
- [ ] Responsive redesign of all views for touch-first interaction
- [ ] Task monitoring dashboard optimized for phone screens
- [ ] Push notifications for mobile browsers
- [ ] Quick actions: trigger schedule, retry task, stop instance
- [ ] Offline queue: prepare tasks on mobile, sync when connected

### API Key Management
- [ ] Create `APIKey` model with hashed key storage, expiration, and scoping
- [ ] Support multiple concurrent API keys per user
- [ ] Key rotation with grace period for old key
- [ ] Usage tracking per API key
- [ ] Rate limiting per API key

### Conversation Memory
- [ ] Store full conversation sessions (multi-turn interactions with Claude)
- [ ] Replay past sessions with timeline scrubbing
- [ ] Search across conversation history
- [ ] Session branching: fork a conversation from any point
- [ ] Export conversations as markdown or JSON

---

## Success Criteria

Each phase has explicit, measurable criteria that must be met before proceeding to the next.

### Phase 1: Foundation
| Criterion | Measurement |
|-----------|-------------|
| Docker stack starts cleanly | `docker compose up` completes with all services healthy in < 60 seconds |
| Database migrations run | `alembic upgrade head` succeeds on fresh database with zero errors |
| Health endpoint responds | `GET /health` returns `200` with database and Redis connectivity confirmed |
| CRUD operations functional | All project and instance CRUD endpoints pass integration tests |
| UI navigation works | All routes render without console errors; sidebar and breadcrumbs update correctly |
| Development workflow smooth | Hot-reload works for both backend and frontend within Docker |

### Phase 2: Core Engine
| Criterion | Measurement |
|-----------|-------------|
| Task execution succeeds | A prompt submitted via API executes Claude Code and stores the output |
| Terminal streams live output | xterm.js displays Claude Code output within 200ms of generation |
| WebSocket reconnection works | Disconnecting and reconnecting a client resumes output without data loss |
| Task queue orders correctly | Tasks execute in priority order; drag-and-drop reorder persists correctly |
| Instance controls responsive | Start/stop/restart complete within 5 seconds with correct status transitions |
| Concurrent tasks isolated | Two instances running simultaneously produce correct, unmixed output |

### Phase 3: Scheduling & SSH
| Criterion | Measurement |
|-----------|-------------|
| Schedules persist across restarts | Restarting the backend does not lose scheduled jobs |
| Cron triggers on time | A schedule set for "every minute" triggers within +/- 5 seconds of the minute mark |
| SSH connection succeeds | Connection test to a valid SSH host returns success within 10 seconds |
| Remote execution works | A task on an SSH-backed instance executes and streams output identically to local |
| Connection pool reuses | Second task on same SSH instance reuses existing connection (measurable via pool metrics) |

### Phase 4: Analytics & Polish
| Criterion | Measurement |
|-----------|-------------|
| Dashboard loads under 2 seconds | Time from navigation to all charts rendered < 2 seconds on 1000+ task dataset |
| Heatmap displays 52 weeks | Heatmap renders correctly with accurate day counts for the full year |
| Retry logic triggers correctly | A failed task auto-retries after the configured backoff period |
| Bulk import handles 100+ tasks | Importing 100 tasks from CSV completes without timeout or errors |
| Toast notifications non-blocking | UI remains interactive during toast display; toasts auto-dismiss after 5 seconds |
| No N+1 queries | Database query log shows no N+1 patterns on list endpoints |

### Phase 5: Security & Deployment
| Criterion | Measurement |
|-----------|-------------|
| Tunnel accessible externally | Application reachable via Cloudflare Tunnel URL from an external network |
| JWT validation blocks invalid tokens | Requests with expired, malformed, or missing tokens receive `401` response |
| Auth bypass only in dev | Setting `AUTH_MODE=none` in production environment raises a startup error |
| Production images are lean | Backend image < 200MB, frontend image < 50MB |
| E2E tests pass | All Playwright test suites pass in CI environment |
| Documentation complete | README has setup instructions that a new developer can follow to run the project in < 15 minutes |

---

## Risk Register

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R1 | **Claude Code CLI changes its output format** between versions, breaking the output parser | Medium | High | Abstract the output parser behind an interface. Write comprehensive parser tests against known output samples. Pin the Claude Code version in development and test against new versions before upgrading. |
| R2 | **WebSocket connections drop under load** when many tasks stream simultaneously | Medium | Medium | Implement Redis Pub/Sub as the message bus rather than in-process broadcasting. Add backpressure handling and message batching. Load test with k6 targeting 50 concurrent streams. |
| R3 | **SSH connections are unreliable** on poor networks, causing task failures | Medium | High | Implement connection pooling with health checks, automatic reconnection, and configurable timeouts. Add retry logic at the SSH transport layer independent of task-level retries. Log all connection events for debugging. |
| R4 | **PostgreSQL performance degrades** as usage records accumulate | Low | Medium | Implement materialized views for analytics rollups from day one. Add database indexes on all query filter columns. Set up data retention policies to prune old raw records. Monitor query performance with `pg_stat_statements`. |
| R5 | **Subprocess management leaks processes** if the backend crashes mid-execution | Medium | High | Register all spawned processes in a process registry. Implement startup cleanup that kills orphaned Claude Code processes. Add a periodic health check that verifies all tracked PIDs are still valid. |
| R6 | **Frontend bundle size grows too large** as features accumulate | Medium | Low | Implement code splitting from Phase 1. Set up bundle analyzer in CI with a size budget (< 500KB initial load). Use dynamic imports for heavy components (Monaco, xterm.js, recharts). |
| R7 | **Cloudflare Tunnel configuration is complex** and may vary across environments | Low | Medium | Provide a fully scripted tunnel setup in `scripts/setup-tunnel.sh`. Document the process with screenshots. Include a fallback deployment option (direct exposure with nginx + Let's Encrypt). |
| R8 | **Concurrent task execution creates race conditions** in shared state | Medium | High | Use database-level locking (SELECT FOR UPDATE) for task state transitions. Implement the task state machine with explicit allowed transitions. Write concurrent execution tests using `asyncio.gather`. |
| R9 | **APScheduler misses jobs** if the application restarts at trigger time | Low | Medium | Use the PostgreSQL job store so schedules survive restarts. Configure `misfire_grace_time` to execute missed jobs within a 60-second window. Add monitoring for missed execution detection. |
| R10 | **Scope creep delays delivery** as new ideas emerge during development | High | High | Strictly defer all "nice to have" features to the Future Expansion list. Conduct weekly scope reviews against the roadmap. Require explicit approval before adding any task not in the current phase. |
| R11 | **Claude API rate limits or outages** cause cascading task failures | Medium | Medium | Implement circuit breaker pattern in the process manager. Queue tasks locally during outages and resume when connectivity returns. Add clear status messaging in the UI when Claude is unavailable. |
| R12 | **Token counting is inaccurate** due to inconsistent Claude output metadata | Medium | Low | Use tiktoken as a fallback estimator. Clearly label estimated vs. actual counts in the UI. Periodically validate estimation accuracy against actual usage. |

---

## Timeline Summary

| Phase | Weeks | Key Milestone |
|-------|-------|---------------|
| Phase 1: Foundation | 1-2 | Docker stack running, project/instance CRUD functional |
| Phase 2: Core Engine | 3-4 | Tasks execute and stream to terminal in real time |
| Phase 3: Scheduling & SSH | 5-6 | Cron scheduling and remote instances operational |
| Phase 4: Analytics & Polish | 5-8 | Analytics dashboard live, UX polished (can overlap with Phase 3) |
| Phase 5: Security & Deployment | 9 | Production deployment with authentication and documentation |

**Total estimated duration: 9 weeks** (7 weeks if Phases 3 and 4 run in parallel with two developers).
