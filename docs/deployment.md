# Deployment Guide

This document covers every deployment scenario for the Claude Orchestrator project: local development, local production, and secure remote access via Cloudflare Tunnel with Zero Trust authentication.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Docker Compose Configuration](#2-docker-compose-configuration)
3. [Environment Configuration](#3-environment-configuration)
4. [Cloudflare Tunnel Setup](#4-cloudflare-tunnel-setup)
5. [Production Docker Builds](#5-production-docker-builds)
6. [Database Setup](#6-database-setup)
7. [SSL/TLS](#7-ssltls)
8. [Monitoring and Logging](#8-monitoring-and-logging)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Overview

Claude Orchestrator supports three deployment modes, each building on the previous one:

| Mode | Use Case | Access | Auth |
|------|----------|--------|------|
| **Local Development** | Day-to-day development with hot reload | `http://localhost:5173` | Bypassed (`AUTH_BYPASS=true`) |
| **Local Production** | On-premises use on a trusted LAN | `http://<host-ip>:5173` | Optional |
| **Remote via Cloudflare** | Secure access from anywhere over the internet | `https://orchestrator.yourdomain.com` | Cloudflare Access (Zero Trust) |

All three modes use the same Docker Compose stack. The difference lies in which services are started and which environment variables are set.

### Prerequisites

- **Docker Engine** 24.0+ and **Docker Compose** v2.20+
- **Claude Code CLI** installed on the host machine (or reachable over SSH)
- A Linux host with at least 2 GB of RAM
- (Remote mode only) A Cloudflare account with a registered domain

---

## 2. Docker Compose Configuration

Below is the full `docker-compose.yml` with detailed commentary on every service, volume, and dependency.

```yaml
# docker-compose.yml
# Claude Orchestrator -- Full Stack Container Configuration
#
# Usage:
#   Local development : docker compose up -d
#   With Cloudflare   : docker compose --profile production up -d

version: "3.9"

services:
  # ---------------------------------------------------------------------------
  # BACKEND -- FastAPI application server
  # ---------------------------------------------------------------------------
  # Runs the Python/FastAPI backend with Uvicorn. Exposes port 8000 for the
  # REST API and WebSocket endpoints. Mounts SSH keys (read-only) so the
  # backend can connect to remote Claude Code instances via paramiko. Also
  # mounts the Docker socket to allow container-level introspection if needed.
  # ---------------------------------------------------------------------------
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: orchestrator-backend
    restart: unless-stopped
    ports:
      - "8000:8000"
    env_file:
      - .env
    environment:
      # Database connection -- uses the internal Docker network hostname
      - DATABASE_URL=${DATABASE_URL:-postgresql+asyncpg://claude:claude@postgres:5432/orchestrator}
      # Redis connection -- used for caching, pub/sub, and task queuing
      - REDIS_URL=${REDIS_URL:-redis://redis:6379/0}
      # Claude Code model configuration
      - DEFAULT_MODEL=${DEFAULT_MODEL:-claude-sonnet-4-20250514}
      - DEFAULT_MAX_TURNS=${DEFAULT_MAX_TURNS:-10}
      # Logging
      - LOG_LEVEL=${LOG_LEVEL:-info}
      # CORS -- comma-separated list of allowed origins
      - CORS_ORIGINS=${CORS_ORIGINS:-http://localhost:5173,http://localhost:8000}
      # Authentication
      - AUTH_BYPASS=${AUTH_BYPASS:-false}
      - CF_TEAM_DOMAIN=${CF_TEAM_DOMAIN:-}
      - CF_ACCESS_AUD=${CF_ACCESS_AUD:-}
    volumes:
      # Mount SSH keys read-only so the backend can reach remote hosts.
      # The backend uses paramiko with these keys to open SSH tunnels to
      # machines running Claude Code CLI.
      - ${HOME}/.ssh:/root/.ssh:ro

      # Mount the Docker socket so the backend can inspect or manage
      # sibling containers (e.g. health checks, restart triggers).
      # This is optional -- remove if you do not need container control.
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      postgres:
        # Wait until PostgreSQL passes its health check before starting
        # the backend. This prevents SQLAlchemy connection errors on boot.
        condition: service_healthy
      redis:
        # Wait until Redis is accepting connections before starting.
        condition: service_healthy
    healthcheck:
      # The backend exposes a lightweight /health endpoint that returns
      # HTTP 200 when the app is ready to serve traffic.
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
    networks:
      - orchestrator-net

  # ---------------------------------------------------------------------------
  # FRONTEND -- React application served via nginx
  # ---------------------------------------------------------------------------
  # The React app is built into static assets during the Docker image build
  # and served by nginx. In development you can alternatively run `npm run dev`
  # outside of Docker for hot-module replacement.
  # ---------------------------------------------------------------------------
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: orchestrator-frontend
    restart: unless-stopped
    ports:
      # Expose on 5173 to match the Vite dev-server port convention.
      # nginx inside the container listens on port 80; this maps host
      # port 5173 to container port 80.
      - "5173:80"
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - orchestrator-net

  # ---------------------------------------------------------------------------
  # POSTGRES -- PostgreSQL 16 (Alpine)
  # ---------------------------------------------------------------------------
  # Primary datastore for projects, sessions, prompt queues, schedules, and
  # usage records. Data is persisted to a named Docker volume so it survives
  # container restarts and image updates.
  # ---------------------------------------------------------------------------
  postgres:
    image: postgres:16-alpine
    container_name: orchestrator-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: claude
      POSTGRES_PASSWORD: claude
      POSTGRES_DB: orchestrator
    ports:
      # Expose on the host for direct psql access during development.
      # In production you may remove this mapping and keep Postgres
      # accessible only on the internal Docker network.
      - "5432:5432"
    volumes:
      # Named volume for persistent storage. Docker manages the volume
      # lifecycle; data persists across `docker compose down` (unless
      # you pass the -v flag).
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      # Use pg_isready to verify that PostgreSQL is accepting connections.
      test: ["CMD-SHELL", "pg_isready -U claude -d orchestrator"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - orchestrator-net

  # ---------------------------------------------------------------------------
  # REDIS -- Redis 7 (Alpine)
  # ---------------------------------------------------------------------------
  # Used for three purposes:
  #   1. Caching frequently-read data (project lists, session metadata)
  #   2. Pub/Sub for broadcasting WebSocket events across backend workers
  #   3. Backing store for APScheduler job persistence
  # ---------------------------------------------------------------------------
  redis:
    image: redis:7-alpine
    container_name: orchestrator-redis
    restart: unless-stopped
    ports:
      # Expose on host for redis-cli debugging during development.
      - "6379:6379"
    volumes:
      # Persist Redis data (AOF/RDB) so scheduled jobs and cached state
      # survive a container restart.
      - redis_data:/data
    healthcheck:
      # Simple PING/PONG check to verify Redis is alive.
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 5s
    networks:
      - orchestrator-net

  # ---------------------------------------------------------------------------
  # CLOUDFLARED -- Cloudflare Tunnel daemon
  # ---------------------------------------------------------------------------
  # Establishes an outbound-only encrypted tunnel to Cloudflare's edge
  # network, which then serves traffic for your custom domain. This
  # eliminates the need for port forwarding, dynamic DNS, or manual TLS
  # certificate management.
  #
  # This service is placed behind the "production" profile so it does NOT
  # start during local development. Activate it with:
  #   docker compose --profile production up -d
  # ---------------------------------------------------------------------------
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: orchestrator-cloudflared
    restart: unless-stopped
    profiles:
      # Only start this service when the "production" profile is active.
      - production
    command: tunnel run
    environment:
      # The tunnel token is obtained from the Cloudflare Zero Trust
      # dashboard after creating a tunnel. It encodes the tunnel UUID,
      # account ID, and secret, so treat it like a password.
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      frontend:
        condition: service_started
      backend:
        condition: service_healthy
    networks:
      - orchestrator-net

# -----------------------------------------------------------------------------
# Volumes
# -----------------------------------------------------------------------------
volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local

# -----------------------------------------------------------------------------
# Networks
# -----------------------------------------------------------------------------
networks:
  orchestrator-net:
    driver: bridge
```

### Starting the Stack

```bash
# Local development (no Cloudflare tunnel)
docker compose up -d

# Production with Cloudflare tunnel
docker compose --profile production up -d

# View running containers and their health status
docker compose ps

# Stop everything (data volumes are preserved)
docker compose down

# Stop everything AND delete data volumes (destructive)
docker compose down -v
```

---

## 3. Environment Configuration

Create your `.env` file by copying the template, then fill in the values appropriate for your deployment.

```bash
cp .env.example .env
```

### Full `.env.example`

```bash
# =============================================================================
# Claude Orchestrator -- Environment Configuration
# =============================================================================
# Copy this file to .env and fill in the values for your deployment.
# Lines starting with # are comments. Uncomment and set values as needed.

# -----------------------------------------------------------------------------
# Database
# -----------------------------------------------------------------------------
# PostgreSQL connection string using asyncpg driver for SQLAlchemy 2.0 async.
# When running inside Docker Compose, "postgres" resolves to the postgres
# service container via Docker's internal DNS.
DATABASE_URL=postgresql+asyncpg://claude:claude@postgres:5432/orchestrator

# -----------------------------------------------------------------------------
# Redis
# -----------------------------------------------------------------------------
# Redis connection string. Database 0 is used by default. When running
# inside Docker Compose, "redis" resolves to the redis service container.
REDIS_URL=redis://redis:6379/0

# -----------------------------------------------------------------------------
# Cloudflare Tunnel
# -----------------------------------------------------------------------------
# Token obtained from the Cloudflare Zero Trust dashboard after creating a
# tunnel. Required only when running with the "production" profile.
# Obtain it via: cloudflared tunnel create orchestrator
# Then find it in the Zero Trust dashboard under Access > Tunnels.
CLOUDFLARE_TUNNEL_TOKEN=

# -----------------------------------------------------------------------------
# Cloudflare Access (Zero Trust Authentication)
# -----------------------------------------------------------------------------
# Your Cloudflare Access team domain, e.g. "mycompany" if your login URL
# is https://mycompany.cloudflareaccess.com. Used to validate JWTs issued
# by Cloudflare Access.
CF_TEAM_DOMAIN=

# The Application Audience (AUD) tag from the Cloudflare Access application
# you created for the orchestrator. This is a long hex string found in the
# Zero Trust dashboard under Access > Applications > your app > Overview.
CF_ACCESS_AUD=

# -----------------------------------------------------------------------------
# Authentication
# -----------------------------------------------------------------------------
# Set to "true" to bypass all authentication checks. Useful during local
# development. NEVER set this to "true" in a production or internet-facing
# deployment.
AUTH_BYPASS=false

# -----------------------------------------------------------------------------
# Claude Code Defaults
# -----------------------------------------------------------------------------
# Default model passed to Claude Code CLI via the --model flag when starting
# a new session. Users can override this per-project in the UI.
DEFAULT_MODEL=claude-sonnet-4-20250514

# Maximum number of agentic turns Claude Code is allowed to take per prompt
# execution before it is stopped. Corresponds to the --max-turns CLI flag.
DEFAULT_MAX_TURNS=10

# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------
# Python log level for the backend. Valid values: debug, info, warning,
# error, critical. Use "debug" during development for verbose output.
LOG_LEVEL=info

# -----------------------------------------------------------------------------
# CORS
# -----------------------------------------------------------------------------
# Comma-separated list of origins allowed to make cross-origin requests to
# the backend API. Include the frontend URL and any other trusted origins.
# When using Cloudflare Tunnel, add your custom domain here.
CORS_ORIGINS=http://localhost:5173,http://localhost:8000
```

### Environment Variables Quick Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | (see above) | Async PostgreSQL connection string |
| `REDIS_URL` | Yes | `redis://redis:6379/0` | Redis connection string |
| `CLOUDFLARE_TUNNEL_TOKEN` | Tunnel only | -- | Cloudflare tunnel authentication token |
| `CF_TEAM_DOMAIN` | Remote only | -- | Cloudflare Access team name |
| `CF_ACCESS_AUD` | Remote only | -- | Cloudflare Access Application Audience tag |
| `AUTH_BYPASS` | No | `false` | Skip auth checks (development only) |
| `DEFAULT_MODEL` | No | `claude-sonnet-4-20250514` | Default Claude model identifier |
| `DEFAULT_MAX_TURNS` | No | `10` | Max agentic turns per prompt |
| `LOG_LEVEL` | No | `info` | Backend log verbosity |
| `CORS_ORIGINS` | No | `http://localhost:5173,...` | Allowed CORS origins |

---

## 4. Cloudflare Tunnel Setup

Cloudflare Tunnel creates a secure, outbound-only connection from your host to Cloudflare's edge network. Traffic destined for your custom domain is routed through this tunnel to your local services. No inbound ports need to be opened on your firewall.

### 4a. Install `cloudflared`

```bash
# Debian / Ubuntu
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] \
  https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared

# macOS
brew install cloudflared

# Verify installation
cloudflared --version
```

### 4b. Authenticate with Cloudflare

This opens a browser window where you log in to your Cloudflare account and authorize `cloudflared` to manage tunnels for your domain.

```bash
cloudflared tunnel login
```

A certificate file is saved to `~/.cloudflared/cert.pem`. This certificate is used to create and manage tunnels, but it is **not** the tunnel credential itself.

### 4c. Create a Tunnel

```bash
cloudflared tunnel create orchestrator
```

This command outputs:

```
Created tunnel orchestrator with id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

A credentials JSON file is saved to `~/.cloudflared/<TUNNEL_UUID>.json`. Keep this file safe -- it authenticates the tunnel daemon.

### 4d. Configure DNS

Route your subdomain to the tunnel. This creates a CNAME record in your Cloudflare DNS zone pointing to the tunnel.

```bash
cloudflared tunnel route dns orchestrator orchestrator.yourdomain.com
```

Verify the record in the Cloudflare dashboard under DNS > Records. You should see:

```
CNAME  orchestrator  ->  <TUNNEL_UUID>.cfargotunnel.com
```

### 4e. Create the Tunnel Configuration

Create `~/.cloudflared/config.yml` with ingress rules that route traffic to the correct backend service based on the request path.

```yaml
# ~/.cloudflared/config.yml
tunnel: <TUNNEL_UUID>
credentials-file: /root/.cloudflared/<TUNNEL_UUID>.json

ingress:
  # -----------------------------------------------------------------------
  # API requests -- proxy to the FastAPI backend on port 8000
  # -----------------------------------------------------------------------
  - hostname: orchestrator.yourdomain.com
    path: /api/*
    service: http://orchestrator-backend:8000
    originRequest:
      # Disable TLS verification for internal traffic (plain HTTP)
      noTLSVerify: true

  # -----------------------------------------------------------------------
  # WebSocket connections -- proxy to the backend WebSocket handler
  # -----------------------------------------------------------------------
  - hostname: orchestrator.yourdomain.com
    path: /ws/*
    service: http://orchestrator-backend:8000
    originRequest:
      noTLSVerify: true
      # Enable WebSocket proxying
      httpHostHeader: orchestrator.yourdomain.com

  # -----------------------------------------------------------------------
  # Everything else -- serve the React frontend via nginx on port 80
  # -----------------------------------------------------------------------
  - hostname: orchestrator.yourdomain.com
    service: http://orchestrator-frontend:80
    originRequest:
      noTLSVerify: true

  # -----------------------------------------------------------------------
  # Catch-all (required by cloudflared) -- return 404 for unmatched hosts
  # -----------------------------------------------------------------------
  - service: http_status:404
```

> **Note:** If you are running cloudflared via the Docker Compose service (recommended), the tunnel token from the Zero Trust dashboard embeds the configuration, and you do not need a local `config.yml`. The token-based approach is simpler. Use the config-file approach only if you need fine-grained ingress control beyond what the dashboard provides.

### 4f. Set Up Cloudflare Access (Zero Trust Authentication)

Cloudflare Access acts as an identity-aware proxy. Users must authenticate before they can reach your application.

1. **Open the Zero Trust dashboard**

   Navigate to [https://one.dash.cloudflare.com](https://one.dash.cloudflare.com) and select your account.

2. **Create an Access Application**

   - Go to **Access > Applications > Add an application**
   - Select **Self-hosted**
   - Set the **Application name** to `Claude Orchestrator`
   - Set the **Application domain** to `orchestrator.yourdomain.com`
   - Leave the path empty to protect the entire domain

3. **Add an Access Policy**

   - Policy name: `Allow authorized users`
   - Action: **Allow**
   - Add one or more include rules:
     - **Emails** -- allow specific email addresses
     - **GitHub organization** -- allow members of a GitHub org
     - **Google Workspace** -- allow users from a Google Workspace domain
     - **One-time PIN** -- email-based OTP for simple setups

   Example policy allowing a specific email and a GitHub org:

   | Rule Type | Value |
   |-----------|-------|
   | Include: Emails | `admin@yourdomain.com` |
   | Include: GitHub Organization | `your-github-org` |

4. **Note the Application Audience (AUD) tag**

   After saving the application, go to **Access > Applications > your app > Overview**. Copy the **Application Audience (AUD)** tag. It is a long hexadecimal string that looks like:

   ```
   1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
   ```

5. **Set the environment variables**

   Add these to your `.env` file:

   ```bash
   CF_TEAM_DOMAIN=yourteam
   CF_ACCESS_AUD=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
   CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoiNjNk...  # from the dashboard
   AUTH_BYPASS=false
   CORS_ORIGINS=https://orchestrator.yourdomain.com
   ```

6. **Start the production stack**

   ```bash
   docker compose --profile production up -d
   ```

7. **Verify**

   Open `https://orchestrator.yourdomain.com` in your browser. You should be redirected to the Cloudflare Access login page. After authenticating, you will land on the orchestrator dashboard.

---

## 5. Production Docker Builds

Both the backend and frontend use multi-stage Docker builds to minimize the final image size and avoid shipping build tools into production.

### Backend Dockerfile

```dockerfile
# backend/Dockerfile
# =============================================================================
# Stage 1: Build dependencies
# =============================================================================
FROM python:3.11-slim AS builder

WORKDIR /build

# Install system dependencies required by Python packages (e.g. asyncpg
# needs libpq-dev for compilation).
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install Python packages into a virtual environment so they can be
# copied cleanly into the runtime stage.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# =============================================================================
# Stage 2: Runtime
# =============================================================================
FROM python:3.11-slim AS runtime

WORKDIR /app

# Install only the runtime library needed by asyncpg (no compiler).
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libpq5 \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Copy the pre-built virtual environment from the builder stage.
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application code.
COPY . .

# Expose the API port.
EXPOSE 8000

# Run with Uvicorn. Use --host 0.0.0.0 so the server binds to all
# interfaces inside the container (required for Docker networking).
# --workers 1 is appropriate for a single-machine deployment; increase
# if you need to handle higher concurrency.
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "1", \
     "--log-level", "info"]
```

### Frontend Dockerfile

```dockerfile
# frontend/Dockerfile
# =============================================================================
# Stage 1: Build the React app
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /build

# Copy package files first to leverage Docker layer caching. The
# npm install layer will be cached unless package.json changes.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source and build the production bundle.
COPY . .
RUN npm run build

# =============================================================================
# Stage 2: Serve with nginx
# =============================================================================
FROM nginx:alpine AS runtime

# Remove the default nginx site.
RUN rm -rf /usr/share/nginx/html/*

# Copy the built React assets from the builder stage.
COPY --from=builder /build/dist /usr/share/nginx/html

# Custom nginx config that:
#   - Serves static files from /usr/share/nginx/html
#   - Falls back to index.html for client-side routing (React Router)
#   - Proxies /api/* and /ws/* to the backend service
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

### Frontend nginx Configuration

```nginx
# frontend/nginx.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Serve static assets with aggressive caching (Vite hashes filenames).
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Proxy API calls to the backend container.
    location /api/ {
        proxy_pass http://orchestrator-backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Proxy WebSocket connections to the backend container.
    location /ws/ {
        proxy_pass http://orchestrator-backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    # Fall back to index.html for React Router (client-side routing).
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Building the Images

```bash
# Build both images
docker compose build

# Build a specific service
docker compose build backend
docker compose build frontend

# Build with no cache (useful after dependency changes)
docker compose build --no-cache
```

---

## 6. Database Setup

### Initial Migration with Alembic

The backend uses Alembic for database schema migrations. On first deployment, run the migrations to create all tables.

```bash
# Run migrations inside the running backend container
docker compose exec backend alembic upgrade head
```

If you are setting up for the first time and do not yet have a migrations directory, initialize Alembic:

```bash
# Inside the backend container
docker compose exec backend alembic init app/migrations

# Generate the initial migration from your SQLAlchemy models
docker compose exec backend alembic revision --autogenerate -m "initial schema"

# Apply the migration
docker compose exec backend alembic upgrade head
```

### Creating New Migrations

After modifying SQLAlchemy models, generate a new migration:

```bash
docker compose exec backend alembic revision --autogenerate -m "describe your change"

# Review the generated migration file before applying
docker compose exec backend alembic upgrade head
```

### Backup and Restore

#### Backup

```bash
# Create a compressed SQL dump of the entire database
docker compose exec postgres pg_dump \
  -U claude \
  -d orchestrator \
  --format=custom \
  --file=/tmp/orchestrator_backup.dump

# Copy the dump to the host
docker compose cp postgres:/tmp/orchestrator_backup.dump ./backups/orchestrator_backup_$(date +%Y%m%d_%H%M%S).dump
```

#### Automated Backup Script

```bash
#!/usr/bin/env bash
# scripts/backup.sh -- Run daily via cron
set -euo pipefail

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="orchestrator_backup_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

docker compose exec -T postgres pg_dump \
  -U claude \
  -d orchestrator \
  --format=custom \
  > "${BACKUP_DIR}/${FILENAME}"

# Keep only the last 30 backups
ls -t "${BACKUP_DIR}"/orchestrator_backup_*.dump \
  | tail -n +31 \
  | xargs -r rm --

echo "Backup saved: ${BACKUP_DIR}/${FILENAME}"
```

Add to cron for daily backups:

```bash
# Run backup every day at 2:00 AM
0 2 * * * cd /path/to/claude-orchestrator && bash scripts/backup.sh >> logs/backup.log 2>&1
```

#### Restore

```bash
# Stop the backend to prevent writes during restore
docker compose stop backend

# Restore from a custom-format dump
docker compose exec -T postgres pg_restore \
  -U claude \
  -d orchestrator \
  --clean \
  --if-exists \
  < ./backups/orchestrator_backup_20260205_020000.dump

# Restart the backend
docker compose start backend
```

### Connection Pooling Configuration

SQLAlchemy's async engine supports connection pooling out of the box. The backend configures the pool in `app/database.py`. Recommended production settings:

```python
# app/database.py
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

engine = create_async_engine(
    settings.DATABASE_URL,
    # Maximum number of permanent connections in the pool.
    pool_size=10,
    # Allow up to 20 overflow connections during traffic spikes.
    # These connections are closed when no longer needed.
    max_overflow=20,
    # Recycle connections after 30 minutes to avoid stale TCP sessions
    # (important when running behind load balancers or NAT).
    pool_recycle=1800,
    # Wait up to 30 seconds for a connection from the pool before
    # raising a TimeoutError.
    pool_timeout=30,
    # Test connections before handing them out. This adds a tiny
    # overhead but prevents "connection closed" errors.
    pool_pre_ping=True,
)

async_session = async_sessionmaker(engine, expire_on_commit=False)
```

You can also tune PostgreSQL itself for the expected number of connections by editing the Compose environment or mounting a custom `postgresql.conf`:

```yaml
# In docker-compose.yml under the postgres service
command:
  - "postgres"
  - "-c"
  - "max_connections=100"
  - "-c"
  - "shared_buffers=256MB"
```

---

## 7. SSL/TLS

### Handled by Cloudflare Tunnel

When deploying with Cloudflare Tunnel, **you do not need to manage SSL/TLS certificates manually**. Here is how encryption works at each hop:

```
Browser ──HTTPS──> Cloudflare Edge ──encrypted tunnel──> cloudflared ──HTTP──> nginx/backend
```

1. **Browser to Cloudflare Edge:** Cloudflare terminates TLS using a free, automatically-renewed certificate for your domain. The browser sees a valid HTTPS connection.

2. **Cloudflare Edge to `cloudflared`:** The tunnel itself is an encrypted QUIC/HTTP2 connection initiated **outbound** by `cloudflared`. No inbound ports need to be opened. The tunnel authenticates using the tunnel credentials created during setup.

3. **`cloudflared` to local services:** Traffic travels over the Docker bridge network (localhost). This leg is plain HTTP, which is acceptable because it never leaves the host machine.

### Full-Encryption Mode (Optional)

If you require end-to-end encryption even on the local network, you can configure Cloudflare's origin SSL mode:

1. In the Cloudflare dashboard, go to **SSL/TLS > Overview**
2. Set the mode to **Full (strict)**
3. Generate an **Origin Certificate** under SSL/TLS > Origin Server
4. Mount the certificate and key into the nginx container
5. Update `nginx.conf` to listen on port 443 with the origin certificate

For most self-hosted, single-machine deployments, this is unnecessary.

---

## 8. Monitoring and Logging

### Docker Logs

All services write to stdout/stderr, which Docker captures. Use `docker compose logs` to view them.

```bash
# Follow logs for all services
docker compose logs -f

# Follow logs for a specific service
docker compose logs -f backend

# View the last 100 lines from the backend
docker compose logs --tail=100 backend

# View logs since a specific time
docker compose logs --since="2026-02-06T10:00:00" backend
```

### Log Level Configuration

The backend log level is controlled by the `LOG_LEVEL` environment variable.

| Level | What Gets Logged |
|-------|-----------------|
| `debug` | Everything: SQL queries, request bodies, internal state transitions |
| `info` | Startup messages, request summaries, Claude Code process lifecycle events |
| `warning` | Recoverable errors, deprecated usage, slow queries |
| `error` | Unhandled exceptions, failed external calls, connection losses |
| `critical` | Fatal errors that prevent the application from running |

Change the level at runtime by updating `.env` and restarting the backend:

```bash
# Edit the log level
# LOG_LEVEL=debug  (in .env)

# Restart just the backend service
docker compose restart backend
```

### Health Check Endpoints

The backend exposes endpoints for monitoring service health:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Basic liveness check. Returns `200 OK` with `{"status": "healthy"}` |
| `/health/ready` | GET | Readiness check. Verifies database and Redis connectivity |

Use these endpoints with Docker health checks (already configured in `docker-compose.yml`), uptime monitoring tools, or load balancers.

```bash
# Manual check from the host
curl http://localhost:8000/health
# {"status": "healthy"}

curl http://localhost:8000/health/ready
# {"status": "ready", "database": "connected", "redis": "connected"}
```

### Container Resource Monitoring

```bash
# View CPU and memory usage for all services in real time
docker stats orchestrator-backend orchestrator-frontend orchestrator-postgres orchestrator-redis

# One-shot snapshot (useful for scripts)
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" \
  orchestrator-backend orchestrator-frontend orchestrator-postgres orchestrator-redis
```

### Log Rotation

Docker's default JSON log driver does not rotate logs. For long-running deployments, configure log rotation in `docker-compose.yml` or the Docker daemon config:

```yaml
# Add to each service in docker-compose.yml
logging:
  driver: json-file
  options:
    max-size: "50m"    # Rotate when a log file reaches 50 MB
    max-file: "5"      # Keep 5 rotated files (250 MB total per service)
```

Or configure globally in `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
```

Restart the Docker daemon after changing the global config:

```bash
sudo systemctl restart docker
```

---

## 9. Troubleshooting

### Common Issues and Solutions

#### Backend fails to start: "Connection refused" to PostgreSQL

**Symptom:** The backend container exits immediately with a `ConnectionRefusedError` for port 5432.

**Cause:** The backend started before PostgreSQL was ready. This usually means the `depends_on` health check is missing or PostgreSQL is slow to initialize.

**Solution:**

```bash
# Check if PostgreSQL is healthy
docker compose ps postgres
# STATE should be "running (healthy)"

# If it shows "starting" or "unhealthy", check its logs
docker compose logs postgres

# Restart with fresh health check sequencing
docker compose down && docker compose up -d
```

#### Frontend shows a blank page

**Symptom:** Navigating to `http://localhost:5173` shows a white screen with no content.

**Cause:** The React build failed, or nginx is not serving the built files.

**Solution:**

```bash
# Check if the frontend container is running
docker compose ps frontend

# Check nginx error log
docker compose logs frontend

# Rebuild the frontend image
docker compose build --no-cache frontend
docker compose up -d frontend
```

#### WebSocket connection fails

**Symptom:** The terminal output panel shows "Connecting..." indefinitely or displays a WebSocket error.

**Cause:** The WebSocket upgrade is being blocked, typically by a proxy that does not support HTTP/1.1 Upgrade headers.

**Solution:**

```bash
# Test WebSocket connectivity directly
# (install websocat: cargo install websocat)
websocat ws://localhost:8000/ws/sessions/test

# If you are behind Cloudflare Tunnel, verify the tunnel is running
docker compose logs cloudflared

# Ensure the nginx config includes the Upgrade headers (see the
# nginx.conf in Section 5 above)
```

#### Cloudflare Tunnel not connecting

**Symptom:** The `cloudflared` container keeps restarting or shows "failed to connect" errors.

**Cause:** The tunnel token is missing, invalid, or the tunnel was deleted from the Cloudflare dashboard.

**Solution:**

```bash
# Check cloudflared logs
docker compose --profile production logs cloudflared

# Verify the token is set in .env
grep CLOUDFLARE_TUNNEL_TOKEN .env

# Re-create the tunnel if needed
cloudflared tunnel delete orchestrator
cloudflared tunnel create orchestrator
# Update CLOUDFLARE_TUNNEL_TOKEN in .env with the new token

docker compose --profile production up -d cloudflared
```

#### Database migration errors

**Symptom:** `alembic upgrade head` fails with "relation already exists" or "column does not exist."

**Cause:** The migration history is out of sync with the actual database schema, often because a migration was applied manually or the database was modified outside of Alembic.

**Solution:**

```bash
# Check the current migration version
docker compose exec backend alembic current

# View migration history
docker compose exec backend alembic history --verbose

# If the database is ahead of Alembic's tracking, stamp it
docker compose exec backend alembic stamp head

# If you need to start fresh (DESTROYS ALL DATA)
docker compose down -v
docker compose up -d
docker compose exec backend alembic upgrade head
```

#### Permission denied on Docker socket

**Symptom:** The backend logs show `PermissionError: [Errno 13] Permission denied: '/var/run/docker.sock'`.

**Cause:** The backend container process does not have permission to access the host Docker socket.

**Solution:**

```bash
# Option 1: Add the Docker socket group to the container
# Find the Docker group ID on the host
stat -c '%g' /var/run/docker.sock

# Add a group_add directive to the backend service in docker-compose.yml:
#   group_add:
#     - "<GID from above>"

# Option 2: If you do not need Docker socket access, remove the
# volume mount from docker-compose.yml:
#   - /var/run/docker.sock:/var/run/docker.sock
```

#### SSH connection to remote hosts fails

**Symptom:** Creating a session with a remote SSH host fails with "Authentication failed" or "Host key verification failed."

**Cause:** The SSH keys mounted into the container are incorrect, or the remote host's key is not in `known_hosts`.

**Solution:**

```bash
# Verify SSH keys are mounted
docker compose exec backend ls -la /root/.ssh/

# Test SSH connectivity from inside the container
docker compose exec backend ssh -o StrictHostKeyChecking=no user@remote-host echo "OK"

# If you need to add a host key, do it on the host machine first
ssh-keyscan remote-host >> ~/.ssh/known_hosts
```

#### High memory usage from PostgreSQL

**Symptom:** The PostgreSQL container uses more memory than expected.

**Cause:** The default `shared_buffers` setting may be too large for your host.

**Solution:**

```bash
# Check current memory usage
docker stats --no-stream orchestrator-postgres

# Tune PostgreSQL memory settings in docker-compose.yml
# (see the connection pooling section above)
# Recommended for a 2 GB host:
#   shared_buffers=128MB
#   effective_cache_size=512MB
#   work_mem=4MB

docker compose down && docker compose up -d
```

#### Container restarts in a loop

**Symptom:** A service shows a high restart count in `docker compose ps`.

**Solution:**

```bash
# Check the exit code and logs
docker inspect --format='{{.State.ExitCode}}' orchestrator-backend
docker compose logs --tail=50 backend

# Common exit codes:
#   0   -- Clean shutdown (check depends_on ordering)
#   1   -- Application error (check logs for traceback)
#   137 -- OOM killed (increase container memory limit)
#   143 -- SIGTERM (Docker is stopping the container)
```

---

## Quick Reference: Common Commands

```bash
# Start (development)
docker compose up -d

# Start (production with tunnel)
docker compose --profile production up -d

# Stop
docker compose down

# Rebuild and restart a single service
docker compose build backend && docker compose up -d backend

# Run database migrations
docker compose exec backend alembic upgrade head

# Open a psql shell
docker compose exec postgres psql -U claude -d orchestrator

# Open a Redis CLI
docker compose exec redis redis-cli

# View all container statuses
docker compose ps

# Tail all logs
docker compose logs -f

# Backup the database
docker compose exec -T postgres pg_dump -U claude -d orchestrator --format=custom > backup.dump

# Restore the database
docker compose exec -T postgres pg_restore -U claude -d orchestrator --clean --if-exists < backup.dump
```
