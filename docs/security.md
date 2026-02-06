# Security

This document describes the security model, threat landscape, and defensive measures for Claude Orchestrator -- a self-hosted web application for remotely controlling multiple Claude Code CLI instances over SSH.

---

## Table of Contents

1. [Overview](#overview)
2. [Network Security](#network-security)
3. [Authentication & Authorization](#authentication--authorization)
4. [SSH Key Management](#ssh-key-management)
5. [Prompt Injection Defense](#prompt-injection-defense)
6. [Database Security](#database-security)
7. [Docker Security](#docker-security)
8. [API Security](#api-security)
9. [Data Protection](#data-protection)
10. [Threat Model](#threat-model)
11. [Security Checklist](#security-checklist)

---

## Overview

Claude Orchestrator is a self-hosted tool that manages Claude Code CLI processes, queues prompts, schedules jobs, and streams live terminal output over WebSocket. Because it orchestrates code-generating AI sessions on real machines -- potentially over SSH -- it sits at a sensitive intersection of authentication, process control, and network exposure.

### Security Principles

The security model is built around four core principles:

1. **Zero exposed ports.** Cloudflare Tunnel eliminates the need to open any inbound ports on the host, removing the most common attack vector for self-hosted services.
2. **Identity-first access.** Every request is authenticated at Cloudflare's edge before it ever reaches the backend. There is no anonymous access path in production.
3. **Least privilege.** Containers run with minimal capabilities, file mounts are read-only where possible, and the database is never exposed outside the Docker network.
4. **Defense in depth.** No single layer is assumed to be sufficient. Authentication, input validation, network isolation, and process sandboxing each provide independent layers of protection.

### Attack Surface Summary

| Surface              | Exposure                                    | Primary Defense                        |
| -------------------- | ------------------------------------------- | -------------------------------------- |
| Web UI / API         | Public internet (via Cloudflare Tunnel)     | Cloudflare Access JWT authentication   |
| WebSocket            | Public internet (via Cloudflare Tunnel)     | Cloudflare Access JWT + origin check   |
| PostgreSQL           | Docker internal network only                | No external port binding               |
| Redis                | Docker internal network only                | No external port binding               |
| SSH keys             | Mounted into backend container              | Read-only bind mount, 600 permissions  |
| Claude Code CLI      | Spawned as subprocess on host or via SSH    | Parameterized subprocess invocation    |

---

## Network Security

### Cloudflare Tunnel: No Open Ports

Claude Orchestrator uses [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (`cloudflared`) to expose the application to the internet. This is the single most important architectural security decision.

**How it works:**

```
Internet → Cloudflare Edge (HTTPS) → Cloudflare Tunnel → localhost:5173 / localhost:8000
```

The `cloudflared` daemon runs on the host (or in a container) and establishes an **outbound-only** connection to Cloudflare's edge. Traffic from the internet is routed through this tunnel to the local services. Because the connection is outbound:

- **No inbound ports are opened on the host machine.** A port scan of the host reveals nothing.
- **No port forwarding is required** on the router or firewall.
- **No static IP or dynamic DNS** is needed for the host.
- **DDoS protection** is provided automatically by Cloudflare's edge network.

### HTTPS Everywhere

All traffic between the user's browser and the application is encrypted:

- **Browser to Cloudflare Edge:** TLS 1.3 with Cloudflare's edge certificate.
- **Cloudflare Edge to Origin (tunnel):** Encrypted tunnel connection using the `cloudflared` daemon's credentials.
- **Internal Docker network:** Services communicate over Docker's internal bridge network, which is not routable from outside the host.

At no point does unencrypted HTTP traffic traverse the public internet.

### Local-Only Binding with AUTH_BYPASS

When `AUTH_BYPASS=true` is set (for local development), the backend binds exclusively to `127.0.0.1`:

```python
# When AUTH_BYPASS=true, bind to localhost only
uvicorn.run(app, host="127.0.0.1", port=8000)
```

This ensures that even with authentication disabled, the application is only accessible from the host machine itself. It cannot be reached from other devices on the local network.

**Never set `AUTH_BYPASS=true` in production.** This flag is intended solely for local development and testing.

### Network Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│  Host Machine                                   │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │  Docker Compose Network (internal)      │    │
│  │                                         │    │
│  │  ┌──────────┐  ┌──────────┐             │    │
│  │  │ Frontend │  │ Backend  │             │    │
│  │  │ :5173    │  │ :8000    │             │    │
│  │  └──────────┘  └────┬─────┘             │    │
│  │                     │                   │    │
│  │       ┌─────────────┼─────────────┐     │    │
│  │       │             │             │     │    │
│  │  ┌────┴─────┐  ┌────┴─────┐       │     │    │
│  │  │PostgreSQL│  │  Redis   │       │     │    │
│  │  │ :5432    │  │  :6379   │       │     │    │
│  │  │(internal)│  │(internal)│       │     │    │
│  │  └──────────┘  └──────────┘       │     │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  ┌──────────────┐                               │
│  │ cloudflared  │── outbound tunnel ──→ Cloudflare Edge
│  └──────────────┘                               │
│                                                 │
│  NO INBOUND PORTS OPEN                          │
└─────────────────────────────────────────────────┘
```

---

## Authentication & Authorization

### Cloudflare Access: SSO-Grade Authentication

[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) acts as a reverse proxy authentication layer. It intercepts every request to the application's public URL and enforces identity verification **before any traffic reaches the backend**. This is functionally equivalent to placing an enterprise SSO gateway in front of the application.

### Supported Authentication Methods

Cloudflare Access supports a wide range of identity providers. The following are recommended for Claude Orchestrator:

| Method              | Use Case                                      | Configuration                           |
| ------------------- | --------------------------------------------- | --------------------------------------- |
| **Email OTP**       | Simple setup, no third-party IdP required     | Cloudflare sends a one-time code        |
| **GitHub OAuth**    | Teams already using GitHub for source control | Restrict by GitHub org or team          |
| **Google Workspace**| Organizations with Google Workspace accounts  | Restrict by domain or group membership  |

Additional providers (Okta, Azure AD, SAML, etc.) are supported by Cloudflare Access but are outside the scope of this document.

### JWT Validation Flow

The complete authentication flow works as follows:

```
Step 1: User navigates to https://orchestrator.yourdomain.com
        │
Step 2: Cloudflare Access intercepts the request
        ├── No valid CF_Authorization cookie found
        └── Redirects user to the Cloudflare Access login page
        │
Step 3: User authenticates via configured identity provider
        ├── Email OTP: User enters email → receives code → enters code
        ├── GitHub OAuth: User authorizes via GitHub
        └── Google Workspace: User signs in with Google account
        │
Step 4: On successful authentication, Cloudflare Access sets the
        CF_Authorization cookie containing a signed JWT
        │
Step 5: Browser sends the request again, now with the JWT cookie
        │
Step 6: Cloudflare Tunnel forwards the request to the backend
        │
Step 7: Backend middleware validates the JWT:
        ├── Extracts the JWT from the CF_Authorization cookie
        ├── Fetches Cloudflare's public keys from the JWKS endpoint:
        │   https://<team-name>.cloudflareaccess.com/cdn-cgi/access/certs
        ├── Verifies the JWT signature against the public keys
        ├── Validates claims: audience (aud), issuer (iss), expiry (exp)
        ├── If valid → request proceeds to the route handler
        └── If invalid → returns HTTP 401 Unauthorized
```

### JWT Validation Implementation

The backend validates JWTs on every request using middleware in `backend/app/core/auth.py`. Key validation checks include:

- **Signature verification** against Cloudflare's JWKS (JSON Web Key Set) endpoint.
- **Audience (`aud`) claim** must match the Access Application's audience tag.
- **Expiration (`exp`) claim** must not be in the past.
- **Issuer (`iss`) claim** must match the Cloudflare Access team domain.

The JWKS endpoint is cached with a reasonable TTL to avoid excessive network calls while still picking up key rotations.

```python
# Pseudocode for JWT validation middleware
async def validate_cf_access_jwt(request: Request) -> dict:
    token = request.cookies.get("CF_Authorization")
    if not token:
        raise HTTPException(status_code=401, detail="Missing authorization")

    # Fetch and cache JWKS from Cloudflare
    jwks = await get_cloudflare_jwks(team_domain=settings.CF_ACCESS_TEAM_DOMAIN)

    # Verify signature, audience, expiry, issuer
    payload = jwt.decode(
        token,
        jwks,
        audience=settings.CF_ACCESS_AUD,
        algorithms=["RS256"],
    )
    return payload  # Contains user email, identity provider, etc.
```

### AUTH_BYPASS for Local Development

When `AUTH_BYPASS=true`:

- The JWT validation middleware is skipped entirely.
- The backend binds to `127.0.0.1` only (not `0.0.0.0`).
- A synthetic user identity is injected for development purposes.

This flag must **never** be enabled in production. The backend logs a prominent warning at startup when this mode is active:

```
WARNING: AUTH_BYPASS is enabled. Authentication is disabled.
         This is only safe on localhost. Do NOT use in production.
```

---

## SSH Key Management

Claude Orchestrator connects to remote machines via SSH to manage Claude Code CLI instances. SSH key handling is a critical security concern.

### Read-Only Mounts

SSH private keys are mounted into the backend container from the host filesystem using Docker bind mounts with the `:ro` (read-only) flag:

```yaml
# docker-compose.yml
services:
  backend:
    volumes:
      - ~/.ssh:/home/appuser/.ssh:ro
```

This ensures:

- **Keys are never copied into the container image.** They exist only on the host filesystem.
- **Keys are never stored in the database.** The database holds SSH connection configuration (hostname, port, username, key path) but never the key material itself.
- **The container cannot modify the keys.** The read-only mount prevents any write operations.

### SSH Agent Forwarding

As an alternative to mounting key files, SSH agent forwarding can be used:

```yaml
# docker-compose.yml
services:
  backend:
    volumes:
      - ${SSH_AUTH_SOCK}:/ssh-agent:ro
    environment:
      - SSH_AUTH_SOCK=/ssh-agent
```

Benefits of agent forwarding:

- Private keys never leave the host's SSH agent.
- Keys stored on hardware tokens (YubiKey, etc.) are supported.
- The container has no access to key files at all.

### File Permission Requirements

SSH private keys must have strict file permissions. The SSH client will refuse to use keys with overly permissive modes:

```bash
# Required permissions for private keys
chmod 600 ~/.ssh/id_rsa
chmod 600 ~/.ssh/id_ed25519

# Required permissions for the .ssh directory
chmod 700 ~/.ssh

# Public keys can be world-readable
chmod 644 ~/.ssh/id_rsa.pub
chmod 644 ~/.ssh/id_ed25519.pub
```

The backend validates file permissions at startup and logs warnings for any misconfigured keys.

### Key Rotation Recommendations

| Practice                        | Frequency         | Notes                                    |
| ------------------------------- | ----------------- | ---------------------------------------- |
| Rotate SSH keys                 | Every 90 days     | Generate new key pair, update authorized_keys on targets |
| Audit authorized_keys           | Monthly           | Remove unused or unknown public keys     |
| Use Ed25519 keys                | Always            | Preferred over RSA for performance and security |
| Set key passphrases             | Always            | Protect against key file theft           |
| Use per-host keys               | When practical    | Limits blast radius of a compromised key |
| Disable password authentication | Always            | On all target machines                   |

### Key Storage: What Goes Where

| Data                    | Stored Where            | Encrypted | Notes                                |
| ----------------------- | ----------------------- | --------- | ------------------------------------ |
| SSH private key files   | Host filesystem only    | Optional  | Mounted read-only into container     |
| SSH public key files    | Host filesystem only    | No        | Not sensitive                        |
| SSH connection config   | PostgreSQL database     | Recommended | Hostname, port, username, key path |
| SSH key passphrases     | Never stored            | N/A       | Use SSH agent instead                |

---

## Prompt Injection Defense

Claude Orchestrator passes user-created prompts to the Claude Code CLI. Because Claude Code can execute shell commands and modify files, prompt injection is a serious concern.

### CLI Argument Passing (Not stdin)

Task prompts are passed to Claude Code as CLI arguments using list-based subprocess invocation, **not** piped through stdin or interpolated into shell commands:

```python
# CORRECT: List-based subprocess call -- safe from shell injection
process = await asyncio.create_subprocess_exec(
    "claude",
    "--print",
    "--output-format", "json",
    "--max-turns", str(max_turns),
    "--prompt", task_prompt,          # Passed as a discrete argument
    stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.PIPE,
)

# DANGEROUS -- NEVER DO THIS: Shell interpolation
# process = await asyncio.create_subprocess_shell(
#     f"claude --print --prompt '{task_prompt}'"  # Shell injection vector!
# )
```

Using `create_subprocess_exec` with a list of arguments ensures that the prompt content is never interpreted by the shell, regardless of what characters it contains.

### Claude Code's Own Safeguards

Claude Code itself includes built-in safety measures:

- **Permission prompts** for destructive actions (file deletion, system commands).
- **Allowed/disallowed command lists** configurable per project.
- **Sandboxing** of file system access to the project directory.
- **Automatic refusal** of requests that violate Anthropic's usage policy.

These safeguards apply regardless of how Claude Code is invoked and provide a second layer of defense against prompt injection.

### API-Layer Validation and Sanitization

Before a prompt reaches the Claude Code CLI, the backend performs validation:

1. **Length limits.** Prompts exceeding a configurable maximum length are rejected.
2. **Character validation.** Control characters and null bytes are stripped.
3. **Pattern detection.** Known prompt injection patterns (e.g., "ignore previous instructions") can be flagged for review, though this is not a foolproof defense.
4. **Pydantic schema enforcement.** All API inputs are validated against strict Pydantic schemas before any processing occurs.

```python
class TaskCreate(BaseModel):
    prompt: str = Field(
        ...,
        min_length=1,
        max_length=50_000,
        description="The task prompt to send to Claude Code",
    )

    @field_validator("prompt")
    @classmethod
    def sanitize_prompt(cls, v: str) -> str:
        # Strip null bytes and control characters (except newlines/tabs)
        return "".join(
            c for c in v
            if c in ("\n", "\t", "\r") or (ord(c) >= 32)
        )
```

### No User-Controlled Shell Interpolation

The following rules are enforced throughout the codebase:

- **Never use `subprocess.shell=True`** with any user-influenced data.
- **Never use f-strings or string formatting** to construct shell commands.
- **Always use list-based arguments** for `subprocess.exec` / `asyncio.create_subprocess_exec`.
- **Always use paramiko's `exec_command`** for remote SSH commands (which also avoids shell interpolation).

---

## Database Security

### PostgreSQL Configuration

PostgreSQL runs as an internal Docker service with no external port exposure:

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    # NO "ports:" section -- database is not exposed to the host
    networks:
      - internal
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: orchestrator
    volumes:
      - pgdata:/var/lib/postgresql/data
```

### Credential Management

| Environment    | Password Requirement                                  |
| -------------- | ----------------------------------------------------- |
| Local dev      | Simple password acceptable (e.g., `postgres`)         |
| Production     | Strong, randomly generated password (32+ characters)  |

Generate a production password:

```bash
openssl rand -base64 32
```

Store the password in the `.env` file and ensure `.env` is listed in `.gitignore` and `.dockerignore`.

### Encryption of Sensitive Fields

For production deployments, consider encrypting sensitive fields stored in the database:

- **SSH connection details** (hostnames, usernames, key paths) -- these reveal infrastructure topology.
- **Scheduled job templates** -- may contain sensitive project paths or identifiers.
- **API tokens** for external integrations (if any are added in the future).

Use application-level encryption (e.g., `cryptography.fernet`) with a key stored outside the database:

```python
from cryptography.fernet import Fernet

# Key loaded from environment variable, NOT stored in the database
cipher = Fernet(settings.FIELD_ENCRYPTION_KEY)

# Encrypt before writing
encrypted = cipher.encrypt(plaintext.encode())

# Decrypt after reading
plaintext = cipher.decrypt(encrypted).decode()
```

### Connection Security

- PostgreSQL is accessible only over the Docker internal network (`internal` bridge).
- The backend connects using SQLAlchemy's async engine with connection pooling.
- Connection strings are loaded from environment variables, never hardcoded.
- In production, consider enabling PostgreSQL's SSL mode for connections within the Docker network if the threat model warrants it.

### Redis Security

Redis follows the same network isolation pattern:

- No external port exposure.
- Accessible only from the Docker internal network.
- `requirepass` should be set in production.
- Used for caching and pub/sub (WebSocket message fan-out), not for persistent sensitive data storage.

---

## Docker Security

### Container Isolation

Each service runs in its own container with an isolated filesystem, process namespace, and network namespace. The Docker Compose stack uses a dedicated internal network:

```yaml
networks:
  internal:
    driver: bridge
    internal: true  # No outbound internet access for db/cache containers
```

### Read-Only Mounts

Where possible, volumes are mounted as read-only:

```yaml
volumes:
  - ~/.ssh:/home/appuser/.ssh:ro          # SSH keys: read-only
  - ./backend:/app:ro                     # Application code: read-only (in production)
```

### Non-Root Container Users

Containers should run as non-root users. The backend Dockerfile creates a dedicated application user:

```dockerfile
# Create non-root user
RUN addgroup --system appgroup && \
    adduser --system --ingroup appgroup appuser

# Switch to non-root user
USER appuser
```

Benefits:

- If the container is compromised, the attacker has limited privileges.
- The container cannot modify system files or install packages.
- Docker socket access (if mounted) would still require additional privileges.

### Docker Socket Access

**The Docker socket (`/var/run/docker.sock`) should NOT be mounted into any container** unless absolutely necessary. Mounting the Docker socket grants root-equivalent access to the host.

If Docker-in-Docker functionality is needed in the future (e.g., for running Claude Code in isolated containers), use one of these alternatives:

1. **Docker-in-Docker (dind)** with a dedicated daemon.
2. **Rootless Docker** for reduced privilege exposure.
3. **Podman** as a daemonless alternative.

### Resource Limits

Production deployments should set resource limits to prevent any single container from consuming all host resources:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 2G
          cpus: "2.0"
        reservations:
          memory: 512M
          cpus: "0.5"
```

---

## API Security

### CORS Configuration

Cross-Origin Resource Sharing (CORS) is configured to restrict which origins can make requests to the backend:

```python
# backend/app/main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,                    # e.g., https://orchestrator.yourdomain.com
        "http://localhost:5173",                   # Local development
    ],
    allow_credentials=True,                       # Required for CF_Authorization cookie
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
)
```

In production:

- **Never use `allow_origins=["*"]`** -- this disables CORS protection entirely.
- The allowed origin must match the exact URL users access (including protocol and port).
- `allow_credentials=True` is required for the `CF_Authorization` cookie to be sent cross-origin.

### Input Validation via Pydantic

All API endpoints use Pydantic schemas for request validation. This provides:

- **Type enforcement.** Fields must match their declared types.
- **Required field validation.** Missing required fields return 422.
- **Constraint enforcement.** String lengths, numeric ranges, enum values, and regex patterns.
- **Automatic documentation.** Pydantic schemas generate OpenAPI/Swagger docs.

```python
class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    working_directory: str = Field(..., pattern=r"^/[a-zA-Z0-9._/-]+$")

class SSHTargetCreate(BaseModel):
    hostname: str = Field(..., min_length=1, max_length=255)
    port: int = Field(default=22, ge=1, le=65535)
    username: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-z_][a-z0-9_-]*$")
    ssh_key_path: str = Field(..., pattern=r"^/[a-zA-Z0-9._/-]+$")
```

### Rate Limiting

Rate limiting protects against abuse and denial-of-service attacks. Implement using Redis-backed middleware:

| Endpoint Category          | Recommended Limit          | Notes                                     |
| -------------------------- | -------------------------- | ----------------------------------------- |
| Authentication endpoints   | 10 requests/minute         | Prevent brute force                       |
| Task creation              | 30 requests/minute         | Prevent queue flooding                    |
| Task execution (start)     | 10 requests/minute         | Prevent resource exhaustion               |
| Read operations (GET)      | 120 requests/minute        | More permissive for dashboard polling     |
| WebSocket connections      | 5 connections/user         | Prevent connection exhaustion             |

Cloudflare's own rate limiting features can provide an additional layer at the edge.

### Request Logging for Audit Trail

All API requests are logged with sufficient detail for security auditing:

```python
# Logged for every request:
{
    "timestamp": "2025-01-15T10:30:00Z",
    "method": "POST",
    "path": "/api/tasks",
    "user_email": "user@example.com",       # From CF Access JWT
    "source_ip": "203.0.113.42",            # From CF-Connecting-IP header
    "status_code": 201,
    "duration_ms": 45,
    "user_agent": "Mozilla/5.0 ...",
}
```

Sensitive data is **never** logged:

- No request bodies containing prompts (may contain proprietary code).
- No authentication tokens or cookies.
- No SSH key paths or connection details.

---

## Data Protection

### Sensitive Data Inventory

| Data Type            | Classification | Storage Location     | Protection                      |
| -------------------- | -------------- | -------------------- | ------------------------------- |
| SSH private keys     | Critical       | Host filesystem      | File permissions (600), read-only mount |
| SSH connection config| Sensitive      | PostgreSQL           | Application-level encryption (recommended) |
| CF Access JWT        | Sensitive      | Browser cookie       | HttpOnly, Secure, SameSite=Lax |
| Database credentials | Critical       | `.env` file          | File permissions, `.gitignore`  |
| Claude API key       | Critical       | Host environment var | Never stored in database or logs |
| Task prompts         | Internal       | PostgreSQL           | Access controlled by authentication |
| Terminal output      | Internal       | PostgreSQL + Redis   | Access controlled by authentication |
| User email addresses | PII            | PostgreSQL (via JWT) | Minimal storage, no external sharing |

### Log Sanitization

The logging configuration ensures no credentials appear in logs:

1. **Environment variables** are never logged at startup (only their names, not values).
2. **HTTP headers** are logged selectively -- `Authorization`, `Cookie`, and `CF_Authorization` headers are redacted.
3. **Database queries** are logged without parameter values in production.
4. **SSH connection logs** include hostname and username but never key paths or passphrases.
5. **Task prompts and outputs** are not included in request logs (they may contain proprietary code).

```python
# Example: Sanitized log output
INFO: POST /api/ssh-targets 201 -- user=admin@example.com ip=203.0.113.42 duration=32ms
# NOT: POST /api/ssh-targets {"hostname": "prod-server", "key_path": "/home/user/.ssh/id_ed25519"}
```

### Secure Environment Variable Management

Environment variables are the primary mechanism for passing secrets to the application:

```bash
# .env file -- NEVER commit this to version control
POSTGRES_PASSWORD=<strong-random-password>
REDIS_PASSWORD=<strong-random-password>
CF_ACCESS_TEAM_DOMAIN=<your-team>.cloudflareaccess.com
CF_ACCESS_AUD=<your-access-application-audience-tag>
FIELD_ENCRYPTION_KEY=<fernet-key>
```

Best practices:

- `.env` is listed in both `.gitignore` and `.dockerignore`.
- `.env.example` contains placeholder values only -- never real credentials.
- In production, consider using Docker secrets or a secrets manager (HashiCorp Vault, AWS Secrets Manager) instead of `.env` files.
- Rotate secrets on a regular schedule and after any suspected compromise.

---

## Threat Model

### Threat 1: Unauthorized Access

| Attribute     | Detail                                                      |
| ------------- | ----------------------------------------------------------- |
| **Threat**    | An unauthorized user gains access to the orchestrator dashboard and can queue tasks, view output, or modify SSH configurations. |
| **Likelihood**| Low (with Cloudflare Access), High (without authentication) |
| **Impact**    | Critical -- attacker can execute arbitrary code via Claude Code on target machines. |
| **Mitigation**| Cloudflare Access enforces identity verification at the network edge. All requests require a valid JWT signed by Cloudflare. The backend independently validates the JWT against Cloudflare's JWKS endpoint. When running locally with `AUTH_BYPASS=true`, the server binds to `127.0.0.1` only. |

### Threat 2: Command Injection via Prompt

| Attribute     | Detail                                                      |
| ------------- | ----------------------------------------------------------- |
| **Threat**    | A malicious or compromised user crafts a prompt that causes Claude Code to execute unintended shell commands on the target machine. |
| **Likelihood**| Medium -- Claude Code can execute commands by design.       |
| **Impact**    | High -- arbitrary command execution on the target machine.  |
| **Mitigation**| Prompts are passed as discrete CLI arguments using list-based `subprocess.exec`, not interpolated into shell commands. Claude Code's own safety mechanisms (permission prompts, command allow/deny lists) provide additional protection. API-layer input validation enforces length limits and strips control characters. Operators should configure Claude Code's permission settings per project to restrict allowed commands. |

### Threat 3: SSH Key Compromise

| Attribute     | Detail                                                      |
| ------------- | ----------------------------------------------------------- |
| **Threat**    | An attacker obtains SSH private keys used by the orchestrator to access target machines. |
| **Likelihood**| Low -- keys are mounted read-only and never stored in the database. |
| **Impact**    | Critical -- attacker gains SSH access to all target machines. |
| **Mitigation**| SSH keys are mounted from the host filesystem with read-only permissions. Key files must have `600` permissions. Keys are never written to the database, logged, or included in API responses. SSH agent forwarding is supported as an alternative that avoids placing key files in the container entirely. Regular key rotation (every 90 days) limits the window of exposure. |

### Threat 4: Data Exfiltration

| Attribute     | Detail                                                      |
| ------------- | ----------------------------------------------------------- |
| **Threat**    | An attacker exfiltrates sensitive data: task prompts (which may contain proprietary code), terminal output, SSH configurations, or database contents. |
| **Likelihood**| Low -- requires authenticated access or a backend vulnerability. |
| **Impact**    | High -- exposure of proprietary code, infrastructure details, and credentials. |
| **Mitigation**| All traffic is encrypted (HTTPS via Cloudflare, encrypted tunnel). The database is only accessible over the Docker internal network with no external port binding. Sensitive database fields are encrypted at the application level. API responses are scoped to the requesting user's authorized data. Log sanitization prevents credential leakage through log files. |

### Threat 5: Denial of Service

| Attribute     | Detail                                                      |
| ------------- | ----------------------------------------------------------- |
| **Threat**    | An attacker floods the application with requests, exhausting resources and preventing legitimate use. |
| **Likelihood**| Low -- Cloudflare provides DDoS protection at the edge.    |
| **Impact**    | Medium -- service becomes unavailable, queued tasks are delayed. |
| **Mitigation**| Cloudflare's edge network absorbs volumetric DDoS attacks. Application-level rate limiting restricts per-user request rates. Docker resource limits (CPU, memory) prevent any single container from consuming all host resources. WebSocket connection limits prevent connection exhaustion. Task queue depth limits prevent unbounded growth. |

### Threat 6: Supply Chain Attack

| Attribute     | Detail                                                      |
| ------------- | ----------------------------------------------------------- |
| **Threat**    | A compromised dependency introduces malicious code into the application. |
| **Likelihood**| Low but increasing across the industry.                    |
| **Impact**    | Critical -- could compromise the entire application.       |
| **Mitigation**| Pin dependency versions in `requirements.txt` and `package.json`. Use lock files (`package-lock.json`, `pip-compile`). Regularly audit dependencies with `pip audit` and `npm audit`. Use minimal base images (`python:3.11-slim`, `node:20-alpine`). Consider running `trivy` or `grype` for container image scanning. |

---

## Security Checklist

Use this checklist before deploying Claude Orchestrator to production.

### Authentication & Access Control

- [ ] Cloudflare Access is configured with an appropriate identity provider.
- [ ] Access policies restrict login to authorized users/groups only.
- [ ] `AUTH_BYPASS` is set to `false` (or unset) in the production `.env`.
- [ ] The `CF_ACCESS_AUD` audience tag matches the Cloudflare Access Application.
- [ ] The `CF_ACCESS_TEAM_DOMAIN` is correctly configured.
- [ ] JWT validation is enabled and tested (send a request without a valid cookie -- expect 401).

### Network

- [ ] Cloudflare Tunnel is active and routing traffic correctly.
- [ ] No services expose ports to `0.0.0.0` in `docker-compose.yml` (except through the tunnel).
- [ ] PostgreSQL and Redis have no `ports:` section in `docker-compose.yml`.
- [ ] CORS `allow_origins` is set to the exact production URL only.
- [ ] Cloudflare SSL/TLS mode is set to "Full (Strict)".

### SSH Keys

- [ ] SSH private key files have `600` permissions.
- [ ] The `.ssh` directory has `700` permissions.
- [ ] SSH keys are mounted with the `:ro` flag in `docker-compose.yml`.
- [ ] SSH key passphrases are used (or SSH agent forwarding is configured).
- [ ] Unused SSH keys have been removed from `authorized_keys` on target machines.
- [ ] Password authentication is disabled on all SSH target machines.

### Database

- [ ] PostgreSQL password is strong (32+ characters, randomly generated).
- [ ] Redis password is configured via `requirepass`.
- [ ] Database connection strings are loaded from environment variables, not hardcoded.
- [ ] Sensitive database fields are encrypted at the application level.
- [ ] Database backups are encrypted and stored securely.

### Docker

- [ ] All containers run as non-root users.
- [ ] Resource limits (CPU, memory) are set for all containers.
- [ ] The Docker socket is not mounted into any container.
- [ ] Base images use minimal variants (e.g., `alpine`, `slim`).
- [ ] Container images are pinned to specific versions, not `latest`.

### Application

- [ ] All API inputs are validated via Pydantic schemas.
- [ ] Rate limiting is configured for sensitive endpoints.
- [ ] Request logging is enabled with credential sanitization.
- [ ] Error responses do not leak internal details (stack traces, file paths).
- [ ] Debug mode is disabled in production (`DEBUG=false`).

### Secrets Management

- [ ] `.env` is in `.gitignore` and `.dockerignore`.
- [ ] `.env.example` contains only placeholder values.
- [ ] No secrets are hardcoded in source code.
- [ ] No secrets appear in Docker image layers (use build args sparingly, prefer runtime env vars).
- [ ] Secret rotation schedule is documented and followed.

### Monitoring & Incident Response

- [ ] Application logs are collected and retained.
- [ ] Cloudflare Access audit logs are reviewed periodically.
- [ ] Alerts are configured for failed authentication attempts.
- [ ] An incident response plan exists for credential compromise.
- [ ] Container image vulnerability scanning is automated.

---

## Revision History

| Date       | Author | Changes                        |
| ---------- | ------ | ------------------------------ |
| 2025-01-15 | --     | Initial security documentation |
