# Claude Orchestrator

A self-hosted web application for remotely controlling multiple Claude Code CLI instances over SSH. Manage projects, queue prompts, schedule jobs, and monitor execution in real time.

## Overview

Claude Orchestrator enables you to:

- **Manage Projects** -- Organize work into projects, each containing multiple Claude Code sessions
- **Queue Prompts** -- Create task queues for each Claude Code instance with priority ordering and drag-and-drop reordering
- **Schedule Jobs** -- Set up cron-based scheduled tasks with template variable support
- **Monitor in Real Time** -- Stream live terminal output from Claude Code processes via WebSocket
- **Track Usage** -- Monitor token consumption, cost estimates, and activity analytics
- **Remote Access** -- Securely access the dashboard from anywhere via Cloudflare Tunnel with Zero Trust authentication
- **SSH Support** -- Control Claude Code instances running on remote machines over SSH

## Architecture

```
User's PC (Host Machine)
├── Docker Compose Stack
│   ├── Frontend (React + Vite) .......... Port 5173
│   ├── Backend (FastAPI) ................ Port 8000
│   ├── PostgreSQL ....................... Port 5432
│   ├── Redis ............................ Port 6379
│   └── Claude Code Process Manager
│       └── Claude Code CLI Instances (local or via SSH)
└── Cloudflare Tunnel (cloudflared)
    └── Routes https://orchestrator.yourdomain.com → localhost
```

## Technology Stack

| Layer              | Technology                         |
| ------------------ | ---------------------------------- |
| **Frontend**       | React 18 + TypeScript + Vite       |
| **UI Framework**   | Tailwind CSS + shadcn/ui           |
| **State**          | Zustand + TanStack React Query     |
| **Real-time**      | WebSocket (native)                 |
| **Backend**        | FastAPI (Python 3.11+)             |
| **ORM**            | SQLAlchemy 2.0 (async)             |
| **Database**       | PostgreSQL 16                      |
| **Queue/Cache**    | Redis 7                            |
| **Scheduler**      | APScheduler 4                      |
| **Process Mgmt**   | asyncio.subprocess + paramiko      |
| **Auth**           | Cloudflare Access + JWT            |
| **Tunneling**      | cloudflared                        |
| **Containers**     | Docker + Docker Compose            |

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Claude Code CLI installed on the host (or accessible via SSH)
- (Optional) Cloudflare account for remote access

### Local Development

```bash
# Clone the repository
git clone https://github.com/your-org/claude-orchestrator.git
cd claude-orchestrator

# Copy environment template
cp .env.example .env

# Start all services
docker compose up -d

# Access the application
open http://localhost:5173
```

### Production (with Cloudflare Tunnel)

```bash
# Set up Cloudflare Tunnel (see docs/deployment.md)
# Configure .env with tunnel token and access credentials
docker compose --profile production up -d
```

## Documentation

| Document | Description |
| --- | --- |
| [Architecture](docs/architecture.md) | System architecture, component diagram, technology rationale |
| [Data Model](docs/data-model.md) | Database schema, entity relationships, enum definitions |
| [Backend Specification](docs/backend-spec.md) | FastAPI project structure, services, core logic |
| [Frontend Specification](docs/frontend-spec.md) | React project structure, component hierarchy, state management |
| [API Reference](docs/api-reference.md) | Complete REST API endpoint documentation |
| [WebSocket Protocol](docs/websocket-protocol.md) | Real-time messaging protocol and connection management |
| [UI/UX Design Spec](docs/ui-design-spec.md) | Visual design system, wireframes, component specifications |
| [Claude CLI Integration](docs/claude-cli-integration.md) | Claude Code CLI flags, output parsing, instance configuration |
| [Deployment Guide](docs/deployment.md) | Docker Compose setup, Cloudflare Tunnel, environment configuration |
| [Development Setup](docs/development-setup.md) | Local development environment, tooling, workflow |
| [Security](docs/security.md) | Authentication, network security, threat model |
| [Roadmap](docs/roadmap.md) | Implementation phases, milestones, future expansion |

## Project Structure

```
claude-orchestrator/
├── backend/                    # FastAPI backend application
│   ├── app/
│   │   ├── main.py             # App factory, lifespan events
│   │   ├── config.py           # Pydantic Settings
│   │   ├── database.py         # Async SQLAlchemy engine
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   ├── api/                # Route handlers
│   │   ├── services/           # Business logic
│   │   ├── core/               # Auth, middleware, events
│   │   └── migrations/         # Alembic migrations
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                   # React frontend application
│   ├── src/
│   │   ├── components/         # UI components
│   │   ├── pages/              # Route pages
│   │   ├── hooks/              # Custom React hooks
│   │   ├── stores/             # Zustand stores
│   │   ├── lib/                # API client, utilities
│   │   └── types/              # TypeScript interfaces
│   ├── Dockerfile
│   └── package.json
├── docs/                       # Project documentation
├── docker-compose.yml          # Container orchestration
├── .env.example                # Environment template
└── README.md                   # This file
```

## License

Private -- All rights reserved.
