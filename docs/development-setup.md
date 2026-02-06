# Claude Orchestrator -- Development Setup Guide

This guide walks through every step required to set up a local development environment for the Claude Orchestrator project. It covers prerequisites, Docker-based workflows, bare-metal backend and frontend development, database management, testing, debugging, and troubleshooting.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Repository Setup](#2-repository-setup)
3. [Docker Development Environment](#3-docker-development-environment)
4. [Backend Development (without Docker)](#4-backend-development-without-docker)
5. [Frontend Development (without Docker)](#5-frontend-development-without-docker)
6. [Database Management](#6-database-management)
7. [Development Workflow](#7-development-workflow)
8. [Testing](#8-testing)
9. [Debugging](#9-debugging)
10. [Common Issues and Solutions](#10-common-issues-and-solutions)

---

## 1. Prerequisites

Make sure the following tools are installed and available on your `PATH` before continuing.

### Docker and Docker Compose v2

Docker Compose v2 ships as a Docker CLI plugin (`docker compose` rather than the legacy `docker-compose` binary). Install Docker Engine **20.10+** and verify:

```bash
docker --version
# Docker version 24.x or newer

docker compose version
# Docker Compose version v2.x.x
```

> **Tip:** On Linux, install the `docker-compose-plugin` package from Docker's official apt/yum repository if `docker compose` is not recognized.

### Node.js 20+

Required for frontend development. We recommend installing via [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 20
nvm use 20
node --version
# v20.x.x

npm --version
# 10.x.x
```

### Python 3.11+

Required for backend development. Verify your installation:

```bash
python3 --version
# Python 3.11.x or newer

pip3 --version
```

On Ubuntu/Debian you may need:

```bash
sudo apt update
sudo apt install python3.11 python3.11-venv python3.11-dev
```

### Claude Code CLI

Install the Claude Code command-line interface globally:

```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

Make sure you have a valid `ANTHROPIC_API_KEY` exported in your shell or present in your `.env` file.

### Git

Any recent version of Git will work:

```bash
git --version
# git version 2.40+ recommended
```

---

## 2. Repository Setup

Clone the repository and prepare your local environment file:

```bash
git clone <repo-url>
cd claude-orchestrator
cp .env.example .env
```

Open `.env` in your editor and fill in the required values. At minimum you will need:

```dotenv
# -- Core
ANTHROPIC_API_KEY=sk-ant-...
SECRET_KEY=<generate-a-random-string>

# -- Database
POSTGRES_USER=claude
POSTGRES_PASSWORD=claude
POSTGRES_DB=orchestrator
DATABASE_URL=postgresql+asyncpg://claude:claude@localhost:5432/orchestrator

# -- Redis
REDIS_URL=redis://localhost:6379/0

# -- Frontend
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```

> **Important:** Never commit your `.env` file. It is already listed in `.gitignore`.

---

## 3. Docker Development Environment

Docker is the fastest way to spin up the entire stack (backend, frontend, PostgreSQL, Redis) with a single command.

### Starting All Services

```bash
docker compose up -d
```

This brings up the following containers:

| Service    | Port  | Description                        |
|------------|-------|------------------------------------|
| `backend`  | 8000  | FastAPI application server         |
| `frontend` | 5173  | Vite development server            |
| `postgres` | 5432  | PostgreSQL 15 database             |
| `redis`    | 6379  | Redis 7 in-memory store            |

### Viewing Logs

Follow the logs for an individual service:

```bash
# Backend logs
docker compose logs -f backend

# Frontend logs
docker compose logs -f frontend

# All services at once
docker compose logs -f
```

### Rebuilding After Dependency Changes

Whenever you modify `requirements.txt`, `package.json`, or a `Dockerfile`, rebuild the affected image:

```bash
# Rebuild only the backend image
docker compose build backend

# Rebuild and restart
docker compose up -d

# Or combine both steps
docker compose up -d --build backend
```

### Stopping Services

```bash
# Stop all containers (preserves volumes)
docker compose down

# Stop and remove volumes (destroys database data)
docker compose down -v
```

### Useful One-Liners

```bash
# Open a shell inside the running backend container
docker compose exec backend bash

# Open a shell inside the running frontend container
docker compose exec frontend sh

# Run a one-off command in a fresh container
docker compose run --rm backend python -m pytest
```

---

## 4. Backend Development (without Docker)

If you prefer to run the FastAPI backend directly on your host machine, follow these steps.

### Virtual Environment and Dependencies

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # On Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Local PostgreSQL and Redis

You must have PostgreSQL and Redis running locally. The simplest approach is to use Docker for just the data stores:

```bash
# Start only postgres and redis via Docker
docker compose up -d postgres redis
```

Alternatively, install them natively:

```bash
# Ubuntu/Debian
sudo apt install postgresql redis-server

# macOS (Homebrew)
brew install postgresql@15 redis
brew services start postgresql@15
brew services start redis
```

Set the connection URLs in your `.env` or export them directly:

```bash
export DATABASE_URL="postgresql+asyncpg://claude:claude@localhost:5432/orchestrator"
export REDIS_URL="redis://localhost:6379/0"
```

### Running Database Migrations

```bash
# Apply all pending migrations
alembic upgrade head

# Verify current revision
alembic current
```

### Starting the Development Server

```bash
uvicorn app.main:app --reload --port 8000
```

The `--reload` flag enables automatic reloading whenever a Python file changes. The API will be available at `http://localhost:8000` and interactive docs at `http://localhost:8000/docs`.

### Running Tests with pytest

```bash
# Run the full test suite
pytest

# Run with verbose output
pytest -v

# Run a specific test file
pytest tests/test_sessions.py

# Run tests matching a keyword
pytest -k "test_create"
```

### Code Formatting with Ruff

Ruff handles both linting and formatting:

```bash
# Check for lint issues
ruff check .

# Auto-fix lint issues
ruff check --fix .

# Format code
ruff format .

# Check formatting without modifying files
ruff format --check .
```

### Type Checking with mypy

```bash
mypy app/
```

Add `mypy` configuration in `pyproject.toml` or `mypy.ini` as needed. Strict mode is recommended:

```bash
mypy --strict app/
```

---

## 5. Frontend Development (without Docker)

### Installing Dependencies

```bash
cd frontend
npm install
```

### Development Server

```bash
npm run dev    # Starts Vite dev server on http://localhost:5173
```

### Production Build

```bash
npm run build  # Output to dist/
```

### Linting and Type Checking

```bash
npm run lint        # ESLint
npm run type-check  # TypeScript compiler in --noEmit mode
```

### Vite Proxy Configuration

During local development the Vite dev server proxies API requests to the backend. This is configured in `vite.config.ts`:

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
});
```

This means you can call `/api/...` from the frontend without specifying the full backend URL, and WebSocket connections to `/ws` are forwarded transparently.

### Hot Module Replacement (HMR)

Vite provides near-instant Hot Module Replacement out of the box. When you save a file:

- **React components** update in the browser without a full page reload.
- **CSS/SCSS changes** are injected immediately.
- **State is preserved** in most cases thanks to React Fast Refresh.

If HMR stops working, try restarting the dev server. See [Common Issues](#hot-reload-not-working) for more details.

### Environment Variables

Frontend environment variables must be prefixed with `VITE_` to be exposed to client-side code:

| Variable       | Default                    | Description                      |
|----------------|----------------------------|----------------------------------|
| `VITE_API_URL` | `http://localhost:8000`    | Base URL for REST API calls      |
| `VITE_WS_URL`  | `ws://localhost:8000/ws`   | WebSocket endpoint               |

Set these in a `.env` file at the `frontend/` root or export them before running `npm run dev`:

```bash
export VITE_API_URL=http://localhost:8000
export VITE_WS_URL=ws://localhost:8000/ws
npm run dev
```

Access them in code via `import.meta.env.VITE_API_URL`.

---

## 6. Database Management

We use **Alembic** for schema migrations against PostgreSQL.

### Creating a New Migration

After modifying your SQLAlchemy models, auto-generate a migration:

```bash
alembic revision --autogenerate -m "add user preferences table"
```

Always review the generated file in `alembic/versions/` before applying it. Auto-generated migrations may miss certain changes (e.g., renaming columns) and should be hand-edited when necessary.

### Applying Migrations

```bash
# Upgrade to the latest revision
alembic upgrade head

# Upgrade by one revision
alembic upgrade +1
```

### Rolling Back Migrations

```bash
# Roll back by one revision
alembic downgrade -1

# Roll back to a specific revision
alembic downgrade abc123def456

# Roll back all the way to the base (empty database)
alembic downgrade base
```

### Viewing Migration History

```bash
# Show current revision
alembic current

# Show full history
alembic history --verbose
```

### Accessing PostgreSQL Directly

Via Docker:

```bash
docker compose exec postgres psql -U claude orchestrator
```

From the host (if PostgreSQL client tools are installed):

```bash
psql -h localhost -U claude -d orchestrator
```

Useful psql commands:

```sql
\dt             -- List all tables
\d+ table_name  -- Describe a table with details
\q              -- Quit
```

---

## 7. Development Workflow

### Branch Naming Conventions

Use descriptive, kebab-case branch names with a category prefix:

| Prefix       | Purpose                            | Example                              |
|--------------|------------------------------------|--------------------------------------|
| `feature/`   | New functionality                  | `feature/session-history`            |
| `fix/`       | Bug fixes                          | `fix/websocket-reconnect`            |
| `refactor/`  | Code restructuring                 | `refactor/extract-auth-middleware`    |
| `docs/`      | Documentation only                 | `docs/api-endpoint-reference`        |
| `test/`      | Adding or updating tests           | `test/session-manager-unit-tests`    |
| `chore/`     | Maintenance tasks, CI, deps        | `chore/upgrade-fastapi`              |

```bash
git checkout -b feature/session-history
```

### Commit Message Format

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <short summary>

<optional body>

<optional footer>
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`, `perf`, `style`, `build`.

Examples:

```bash
git commit -m "feat(sessions): add session history endpoint"
git commit -m "fix(ws): handle reconnect on token expiry"
git commit -m "docs(readme): update local setup instructions"
```

Keep the subject line under 72 characters. Use the body for additional context when needed.

### Pull Request Process

1. **Push your branch** to the remote:

   ```bash
   git push -u origin feature/session-history
   ```

2. **Open a pull request** against `main` (or the designated integration branch).

3. **Fill in the PR template** -- include a summary, motivation, and test plan.

4. **Request reviews** from at least one team member.

5. **Address feedback** by pushing additional commits (do not force-push unless requested).

6. **Merge** once approved and all CI checks pass. Prefer squash merges for feature branches.

### Code Review Checklist

When reviewing a pull request, verify the following:

- [ ] Code compiles and all tests pass.
- [ ] New functionality has corresponding tests.
- [ ] No sensitive data (API keys, passwords) in the diff.
- [ ] Database migrations are reversible.
- [ ] Error handling is present and appropriate.
- [ ] Logging is sufficient for debugging production issues.
- [ ] No unnecessary commented-out code.
- [ ] Public APIs have docstrings or JSDoc comments.
- [ ] Performance implications have been considered.
- [ ] Breaking changes are documented and communicated.

---

## 8. Testing

### Backend Testing (pytest)

The backend test suite uses **pytest** with async support via `pytest-asyncio`.

#### Running Tests

```bash
cd backend

# Run the entire suite
pytest

# Verbose output with print statements
pytest -v -s

# Run a specific directory
pytest tests/api/

# Run a specific file
pytest tests/test_sessions.py

# Run tests matching a pattern
pytest -k "test_create_session"

# Run with coverage report
pytest --cov=app --cov-report=term-missing
```

#### Test Database

Tests use a dedicated test database to avoid polluting your development data. Configure the test database URL in your test settings or conftest:

```python
# conftest.py
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

TEST_DATABASE_URL = "postgresql+asyncpg://claude:claude@localhost:5432/orchestrator_test"

@pytest.fixture
async def db_session():
    engine = create_async_engine(TEST_DATABASE_URL)
    async with AsyncSession(engine) as session:
        yield session
    await engine.dispose()
```

Create the test database:

```bash
docker compose exec postgres createdb -U claude orchestrator_test
```

#### Fixtures

Common fixtures are defined in `conftest.py` at the `tests/` root. Use fixtures to set up test clients, database sessions, authenticated users, and sample data:

```python
@pytest.fixture
async def client(db_session):
    """Provides a test HTTP client with a clean database session."""
    ...

@pytest.fixture
def sample_session():
    """Returns a sample session dict for use in tests."""
    return {"name": "Test Session", "model": "claude-opus-4-6"}
```

### Frontend Testing

#### Unit Tests with Vitest

```bash
cd frontend

# Run all unit tests
npm test

# Run in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

Vitest is configured in `vite.config.ts` (or `vitest.config.ts`) and supports the same module resolution and transforms as Vite itself.

#### End-to-End Tests with Playwright

```bash
cd frontend

# Install Playwright browsers (first time only)
npx playwright install

# Run E2E tests
npm run e2e

# Run in headed mode (visible browser)
npm run e2e -- --headed

# Run a specific test file
npx playwright test tests/e2e/session-flow.spec.ts

# Open the interactive HTML report
npx playwright show-report
```

### Running All Tests

From the project root:

```bash
# Backend
pytest backend/

# Frontend unit tests
npm test --prefix frontend

# Frontend E2E tests
npm run e2e --prefix frontend
```

---

## 9. Debugging

### Backend Debugging

#### VS Code Launch Configuration

Add the following to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Backend: FastAPI",
      "type": "debugpy",
      "request": "launch",
      "module": "uvicorn",
      "args": ["app.main:app", "--reload", "--port", "8000"],
      "cwd": "${workspaceFolder}/backend",
      "envFile": "${workspaceFolder}/.env",
      "jinja": true
    },
    {
      "name": "Backend: pytest",
      "type": "debugpy",
      "request": "launch",
      "module": "pytest",
      "args": ["-v", "-s"],
      "cwd": "${workspaceFolder}/backend",
      "envFile": "${workspaceFolder}/.env"
    }
  ]
}
```

Press **F5** to start debugging with breakpoints, variable inspection, and step-through execution.

#### Using pdb

Insert a breakpoint directly in your code:

```python
def create_session(request: SessionCreate):
    breakpoint()  # Execution pauses here
    ...
```

Or invoke pytest with the debugger:

```bash
pytest --pdb            # Drop into pdb on test failure
pytest --pdb --pdbcls=IPython.terminal.debugger:TerminalPdb  # Use IPython debugger
```

#### Logging

Increase log verbosity for development:

```bash
export LOG_LEVEL=DEBUG
uvicorn app.main:app --reload --port 8000 --log-level debug
```

### Frontend Debugging

#### React DevTools

Install the [React Developer Tools](https://react.dev/learn/react-developer-tools) browser extension. It lets you:

- Inspect the component tree and props/state.
- Profile render performance.
- Examine React context values.

#### Browser DevTools

- **Console:** Check for runtime errors and `console.log` output.
- **Network tab:** Inspect API requests/responses, check status codes and payloads.
- **Sources tab:** Set breakpoints in your TypeScript/JavaScript code; Vite serves source maps by default.

#### WebSocket Debugging

Open the **Network** tab in your browser DevTools and filter by **WS**. Click on the WebSocket connection to see:

- **Messages:** All frames sent and received, with timestamps.
- **Headers:** The initial upgrade request and response headers.
- **Timing:** Connection establishment duration.

You can also use the `wscat` CLI tool:

```bash
npm install -g wscat
wscat -c ws://localhost:8000/ws
```

### Docker Container Debugging

#### Inspecting a Running Container

```bash
# Open a shell inside a running container
docker compose exec backend bash

# Check environment variables
docker compose exec backend env

# View resource usage
docker stats
```

#### Inspecting a Stopped or Crashed Container

```bash
# View logs from a stopped container
docker compose logs backend

# Inspect container details
docker inspect $(docker compose ps -q backend)
```

#### Attaching a Debugger to a Docker Container

For remote debugging with `debugpy`, modify your backend Dockerfile or entrypoint:

```python
# At the top of app/main.py (development only)
import debugpy
debugpy.listen(("0.0.0.0", 5678))
```

Expose port 5678 in `docker-compose.yml`:

```yaml
backend:
  ports:
    - "8000:8000"
    - "5678:5678"
```

Then attach VS Code using a remote attach configuration:

```json
{
  "name": "Attach to Docker Backend",
  "type": "debugpy",
  "request": "attach",
  "connect": { "host": "localhost", "port": 5678 },
  "pathMappings": [
    { "localRoot": "${workspaceFolder}/backend", "remoteRoot": "/app" }
  ]
}
```

---

## 10. Common Issues and Solutions

### Port Conflicts

**Symptom:** `Bind for 0.0.0.0:8000 failed: port is already allocated`

**Solution:** Identify and stop the process occupying the port:

```bash
# Find the process using port 8000
lsof -i :8000

# Kill it by PID
kill -9 <PID>

# Or change the port in docker-compose.yml / uvicorn args
uvicorn app.main:app --reload --port 8001
```

Common conflicting ports: **5432** (PostgreSQL), **6379** (Redis), **5173** (Vite), **8000** (backend).

### Database Connection Errors

**Symptom:** `sqlalchemy.exc.OperationalError: could not connect to server: Connection refused`

**Causes and fixes:**

1. **PostgreSQL is not running:**

   ```bash
   docker compose up -d postgres
   # or
   sudo systemctl start postgresql
   ```

2. **Wrong DATABASE_URL:** Verify the host, port, username, password, and database name in your `.env`.

3. **Database does not exist:**

   ```bash
   docker compose exec postgres createdb -U claude orchestrator
   ```

4. **Pending migrations:**

   ```bash
   alembic upgrade head
   ```

### Redis Connection Errors

**Symptom:** `redis.exceptions.ConnectionError: Error connecting to localhost:6379`

**Causes and fixes:**

1. **Redis is not running:**

   ```bash
   docker compose up -d redis
   # or
   sudo systemctl start redis-server
   ```

2. **Wrong REDIS_URL:** Confirm the URL matches your running Redis instance.

3. **Redis protected mode:** If running Redis natively, ensure it allows connections from `localhost`:

   ```bash
   redis-cli ping
   # Should return PONG
   ```

### WebSocket Connection Issues

**Symptom:** WebSocket connections fail or disconnect immediately.

**Causes and fixes:**

1. **Backend is not running:** Ensure the backend server is up and healthy on port 8000.

2. **Incorrect WebSocket URL:** Verify `VITE_WS_URL` points to the correct host and path (e.g., `ws://localhost:8000/ws`).

3. **Proxy not configured:** If using the Vite dev server, confirm the WebSocket proxy is present in `vite.config.ts` (see [Vite Proxy Configuration](#vite-proxy-configuration)).

4. **CORS issues:** Check the backend CORS middleware includes the frontend origin:

   ```python
   app.add_middleware(
       CORSMiddleware,
       allow_origins=["http://localhost:5173"],
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*"],
   )
   ```

5. **Firewall or network issues:** Make sure no firewall rules are blocking WebSocket upgrades.

### Hot Reload Not Working

**Symptom:** File changes are not reflected in the browser or the backend does not restart.

**Backend (uvicorn --reload):**

1. Confirm you started uvicorn with `--reload`.
2. Check that you are editing files inside the watched directory (usually `app/`).
3. On Linux, you may need to increase the inotify watch limit:

   ```bash
   echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
   sudo sysctl -p
   ```

**Frontend (Vite HMR):**

1. Hard-refresh the browser (`Ctrl+Shift+R`) to clear stale modules.
2. Check the browser console for HMR errors.
3. Ensure no syntax errors exist in the file you are editing -- HMR silently fails on parse errors.
4. If running inside Docker, verify that volumes are mounted correctly so file changes propagate into the container:

   ```yaml
   frontend:
     volumes:
       - ./frontend:/app
       - /app/node_modules  # Anonymous volume to avoid overwriting
   ```

5. On macOS with Docker Desktop, enable VirtioFS or gRPC FUSE for faster file-system event propagation.

### Docker Build Failures

**Symptom:** `docker compose build` fails with dependency errors.

**Fixes:**

1. **Clear the build cache:**

   ```bash
   docker compose build --no-cache backend
   ```

2. **Prune unused images and volumes:**

   ```bash
   docker system prune -f
   docker volume prune -f
   ```

3. **Check Dockerfile syntax** and ensure base images are accessible.

### Permission Errors on Linux

**Symptom:** `Permission denied` when writing files in mounted volumes.

**Fix:** Ensure the container user's UID matches your host UID. Add to your `Dockerfile`:

```dockerfile
ARG UID=1000
RUN useradd -m -u $UID appuser
USER appuser
```

Build with your UID:

```bash
docker compose build --build-arg UID=$(id -u) backend
```

---

## Quick Reference

| Task                          | Command                                                    |
|-------------------------------|------------------------------------------------------------|
| Start everything (Docker)     | `docker compose up -d`                                     |
| Stop everything               | `docker compose down`                                      |
| Backend dev server            | `uvicorn app.main:app --reload --port 8000`                |
| Frontend dev server           | `npm run dev`                                              |
| Run backend tests             | `pytest backend/`                                          |
| Run frontend unit tests       | `npm test --prefix frontend`                               |
| Run frontend E2E tests        | `npm run e2e --prefix frontend`                            |
| Apply database migrations     | `alembic upgrade head`                                     |
| Create a new migration        | `alembic revision --autogenerate -m "description"`         |
| Roll back one migration       | `alembic downgrade -1`                                     |
| Lint backend                  | `ruff check backend/`                                      |
| Format backend                | `ruff format backend/`                                     |
| Type-check backend            | `mypy backend/app/`                                        |
| Lint frontend                 | `npm run lint --prefix frontend`                           |
| Type-check frontend           | `npm run type-check --prefix frontend`                     |
| Access database shell         | `docker compose exec postgres psql -U claude orchestrator` |
