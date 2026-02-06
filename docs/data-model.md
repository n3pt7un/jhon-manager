# Data Model

## Overview

The Claude Orchestrator data model is built on **PostgreSQL 16** and accessed through **SQLAlchemy 2.0 (async)**. It represents a hierarchical system in which **Projects** contain **Instances**, and Instances execute **Tasks**. Supporting entities handle SSH connectivity (**SSHConfig**), recurring automation (**Schedule**), and cost tracking (**UsageLog**).

Design principles:

- **UUIDs as primary keys** -- Every entity uses a `UUID` primary key (`uuid4`) for global uniqueness across distributed environments and safe exposure in URLs and APIs.
- **Timestamps everywhere** -- All mutable entities carry `created_at` and `updated_at` columns (UTC, server-defaulted) for auditability.
- **JSON columns for flexibility** -- Semi-structured data such as project settings and token-usage breakdowns are stored as `JSONB` to avoid premature schema rigidity.
- **Enum columns for finite states** -- Status and type fields use PostgreSQL `ENUM` types, enforced at both the database and application layers.
- **Soft-archival over hard-deletion** -- Projects use an `is_archived` flag; tasks are retained for historical analytics rather than deleted.

The ORM models live in `backend/app/models/` and the corresponding Pydantic request/response schemas live in `backend/app/schemas/`. Alembic manages all schema migrations from `backend/app/migrations/`.

---

## Entity Relationship Diagram

```
 ┌──────────────────────────────────────────────────────────┐
 │                        SSHConfig                         │
 │──────────────────────────────────────────────────────────│
 │ PK  id           UUID                                    │
 │     name         VARCHAR(255)   NOT NULL  UNIQUE         │
 │     host         VARCHAR(255)   NOT NULL                 │
 │     port         INTEGER        NOT NULL  DEFAULT 22     │
 │     username     VARCHAR(128)   NOT NULL                 │
 │     key_path     VARCHAR(512)   NOT NULL                 │
 │     created_at   TIMESTAMPTZ    NOT NULL  DEFAULT now()  │
 └──────────────────┬───────────────────────────────────────┘
                    │
                    │ 0..* (one SSHConfig may be used by many Instances)
                    │
 ┌──────────────────────────────────────────────────────────┐
 │                        Project                           │
 │──────────────────────────────────────────────────────────│
 │ PK  id           UUID                                    │
 │     name         VARCHAR(255)   NOT NULL                 │
 │     description  TEXT           NULLABLE                 │
 │     root_path    VARCHAR(1024)  NOT NULL                 │
 │     settings     JSONB          NOT NULL  DEFAULT '{}'   │
 │     created_at   TIMESTAMPTZ    NOT NULL  DEFAULT now()  │
 │     updated_at   TIMESTAMPTZ    NOT NULL  DEFAULT now()  │
 │     is_archived  BOOLEAN        NOT NULL  DEFAULT false  │
 └──────────┬───────────────────────────────────────────────┘
            │
            │ 1 ──────────── 0..*
            │
 ┌──────────▼───────────────────────────────────────────────────────┐
 │                           Instance                               │
 │──────────────────────────────────────────────────────────────────│
 │ PK  id                UUID                                       │
 │ FK  project_id        UUID            NOT NULL  → Project.id     │
 │     name              VARCHAR(255)    NOT NULL                   │
 │     working_directory VARCHAR(1024)   NOT NULL                   │
 │     status            InstanceStatus  NOT NULL  DEFAULT 'IDLE'   │
 │     connection_type   ConnectionType  NOT NULL  DEFAULT 'LOCAL'  │
 │ FK  ssh_config_id     UUID            NULLABLE  → SSHConfig.id   │
 │     model_override    VARCHAR(128)    NULLABLE                   │
 │     max_tokens        INTEGER         NOT NULL  DEFAULT 200000   │
 │     pid               INTEGER         NULLABLE                   │
 │     created_at        TIMESTAMPTZ     NOT NULL  DEFAULT now()    │
 │     updated_at        TIMESTAMPTZ     NOT NULL  DEFAULT now()    │
 └──────┬──────────────────────────┬────────────────────────────────┘
        │                          │
        │ 1 ──── 0..*             │ 1 ──── 0..*
        │                          │
 ┌──────▼──────────────────────┐  ┌▼─────────────────────────────────────┐
 │           Task              │  │             Schedule                  │
 │─────────────────────────────│  │───────────────────────────────────────│
 │ PK  id            UUID      │  │ PK  id               UUID            │
 │ FK  instance_id   UUID      │  │ FK  instance_id      UUID            │
 │     prompt        TEXT      │  │     cron_expression  VARCHAR(128)    │
 │     status        TaskStat  │  │     prompt_template  TEXT            │
 │     priority      INTEGER   │  │     is_active        BOOLEAN         │
 │     position      INTEGER   │  │     last_run_at      TIMESTAMPTZ     │
 │     scheduled_at  TSTZ null │  │     next_run_at      TIMESTAMPTZ     │
 │     started_at    TSTZ null │  │     created_at       TIMESTAMPTZ     │
 │     completed_at  TSTZ null │  └───────────────────────────────────────┘
 │     result        TEXT null │
 │     error         TEXT null │
 │     token_usage   JSONB nul │
 │     cost_estimate DEC  null │
 │     created_at    TSTZ      │
 │     updated_at    TSTZ      │
 └──────┬──────────────────────┘
        │
        │ 1 ──── 0..1
        │
 ┌──────▼──────────────────────────────────────────────────┐
 │                       UsageLog                          │
 │─────────────────────────────────────────────────────────│
 │ PK  id           UUID                                   │
 │ FK  task_id      UUID           NOT NULL  → Task.id     │
 │ FK  instance_id  UUID           NOT NULL  → Instance.id │
 │     tokens_in    INTEGER        NOT NULL                │
 │     tokens_out   INTEGER        NOT NULL                │
 │     cost         DECIMAL(12,6)  NOT NULL                │
 │     model        VARCHAR(128)   NOT NULL                │
 │     timestamp    TIMESTAMPTZ    NOT NULL  DEFAULT now() │
 └─────────────────────────────────────────────────────────┘
```

### Relationship Summary

| Relationship              | Type        | FK Location            | On Delete   |
| ------------------------- | ----------- | ---------------------- | ----------- |
| Project -> Instance       | One-to-Many | `Instance.project_id`  | CASCADE     |
| Instance -> Task          | One-to-Many | `Task.instance_id`     | CASCADE     |
| Instance -> Schedule      | One-to-Many | `Schedule.instance_id` | CASCADE     |
| Instance -> SSHConfig     | Many-to-One | `Instance.ssh_config_id` | SET NULL  |
| Task -> UsageLog          | One-to-One  | `UsageLog.task_id`     | CASCADE     |
| Instance -> UsageLog      | One-to-Many | `UsageLog.instance_id` | CASCADE     |

---

## Enum Definitions

All enums are defined as Python `str` + `enum.Enum` mixins so they serialize naturally to JSON strings and map directly to PostgreSQL `ENUM` types.

```python
# backend/app/models/enums.py

import enum


class InstanceStatus(str, enum.Enum):
    """Lifecycle state of a Claude Code CLI instance."""

    IDLE = "IDLE"
    """Instance exists but is not currently executing any task."""

    RUNNING = "RUNNING"
    """Instance is actively executing a task; a Claude Code process is alive."""

    PAUSED = "PAUSED"
    """Instance has been manually paused by the user; queued tasks are held."""

    ERROR = "ERROR"
    """Instance encountered an unrecoverable error and requires attention."""

    OFFLINE = "OFFLINE"
    """Instance process is not running (e.g., SSH connection lost, host down)."""


class TaskStatus(str, enum.Enum):
    """Lifecycle state of an individual task (prompt execution)."""

    QUEUED = "QUEUED"
    """Task is waiting in the queue to be picked up by its instance."""

    SCHEDULED = "SCHEDULED"
    """Task was created by a Schedule and is waiting for its scheduled_at time."""

    RUNNING = "RUNNING"
    """Task is currently being executed by the Claude Code CLI."""

    COMPLETED = "COMPLETED"
    """Task finished successfully; result field is populated."""

    FAILED = "FAILED"
    """Task finished with an error; error field is populated."""

    CANCELLED = "CANCELLED"
    """Task was cancelled by the user before or during execution."""


class ConnectionType(str, enum.Enum):
    """How the backend communicates with the Claude Code CLI process."""

    LOCAL = "LOCAL"
    """Claude Code runs as a local subprocess on the same host as the backend."""

    SSH = "SSH"
    """Claude Code runs on a remote machine, accessed via SSH (paramiko)."""
```

### State Transition Diagrams

**InstanceStatus transitions:**

```
                ┌───────────┐
      ┌────────>│   IDLE    │<────────┐
      │         └─────┬─────┘         │
      │               │ start task    │ task completes / fails
      │               v               │
      │         ┌───────────┐         │
      │         │  RUNNING  │─────────┘
      │         └─────┬─────┘
      │               │ error
      │               v
      │         ┌───────────┐
      │         │   ERROR   │
      │         └─────┬─────┘
      │               │ reset / recover
      │               │
      └───────────────┘

  Any state ──── pause ────> PAUSED
  PAUSED   ──── resume ───> IDLE

  Any state ──── disconnect ──> OFFLINE
  OFFLINE  ──── reconnect ───> IDLE
```

**TaskStatus transitions:**

```
  ┌──────────┐         ┌───────────┐
  │  QUEUED  │────────>│  RUNNING  │──────────> COMPLETED
  └────┬─────┘         └─────┬─────┘
       │                     │
       │                     └──────────────> FAILED
       │
       └──────────────────────────────────> CANCELLED

  ┌───────────┐   scheduled_at reached
  │ SCHEDULED │──────────────────────────> QUEUED
  └─────┬─────┘
        │
        └────────────────────────────────> CANCELLED
```

---

## Detailed Entity Descriptions

### Project

Represents a logical grouping of Claude Code instances that share a common codebase or purpose.

#### Fields

| Column        | Type              | Nullable | Default    | Constraints       | Description                                            |
| ------------- | ----------------- | -------- | ---------- | ----------------- | ------------------------------------------------------ |
| `id`          | `UUID`            | No       | `uuid4()`  | PK                | Unique identifier.                                     |
| `name`        | `VARCHAR(255)`    | No       | --         | --                | Human-readable project name.                           |
| `description` | `TEXT`            | Yes      | `NULL`     | --                | Optional longer description of the project's purpose.  |
| `root_path`   | `VARCHAR(1024)`   | No       | --         | --                | Absolute filesystem path to the project root.          |
| `settings`    | `JSONB`           | No       | `'{}'`     | --                | Arbitrary project-level settings (see schema below).   |
| `created_at`  | `TIMESTAMPTZ`     | No       | `now()`    | --                | Row creation timestamp (UTC).                          |
| `updated_at`  | `TIMESTAMPTZ`     | No       | `now()`    | ON UPDATE `now()` | Last modification timestamp (UTC).                     |
| `is_archived` | `BOOLEAN`         | No       | `false`    | --                | Soft-delete flag; archived projects are hidden by default. |

#### Settings JSON Schema

```json
{
  "default_model": "claude-sonnet-4-20250514",
  "default_max_tokens": 200000,
  "allowed_tools": ["Read", "Write", "Bash", "Glob", "Grep"],
  "environment_variables": {
    "NODE_ENV": "development"
  },
  "notification_webhook": "https://hooks.slack.com/services/..."
}
```

#### Relationships

- **instances** -- `relationship("Instance", back_populates="project", cascade="all, delete-orphan")`

#### Indexes

| Index Name                    | Columns        | Type   | Rationale                                |
| ----------------------------- | -------------- | ------ | ---------------------------------------- |
| `ix_project_name`             | `name`         | BTREE  | Fast lookup by project name.             |
| `ix_project_is_archived`      | `is_archived`  | BTREE  | Filter active vs. archived projects.     |
| `ix_project_created_at`       | `created_at`   | BTREE  | Sort projects by creation date.          |

#### Business Rules

1. `name` should be unique among non-archived projects (enforced at the application layer with a check before insert/update).
2. `root_path` must be an absolute path and must be accessible from the backend container (validated on creation).
3. Archiving a project (`is_archived = true`) pauses all its instances and cancels all queued tasks.
4. Deleting a project cascades to all instances, tasks, schedules, and usage logs.

#### Example JSON Representation

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "E-Commerce Platform",
  "description": "Main e-commerce application backend and frontend",
  "root_path": "/home/user/projects/ecommerce",
  "settings": {
    "default_model": "claude-sonnet-4-20250514",
    "default_max_tokens": 200000,
    "allowed_tools": ["Read", "Write", "Bash", "Glob", "Grep"]
  },
  "created_at": "2025-07-15T10:30:00Z",
  "updated_at": "2025-07-20T14:22:10Z",
  "is_archived": false
}
```

---

### Instance

Represents a single Claude Code CLI session. Each instance maps to one running (or runnable) Claude Code process, either locally or over SSH.

#### Fields

| Column              | Type               | Nullable | Default   | Constraints                  | Description                                          |
| ------------------- | ------------------ | -------- | --------- | ---------------------------- | ---------------------------------------------------- |
| `id`                | `UUID`             | No       | `uuid4()` | PK                           | Unique identifier.                                   |
| `project_id`        | `UUID`             | No       | --        | FK -> `project.id`           | Parent project.                                      |
| `name`              | `VARCHAR(255)`     | No       | --        | --                           | Human-readable instance label.                       |
| `working_directory` | `VARCHAR(1024)`    | No       | --        | --                           | Absolute path where Claude Code executes commands.   |
| `status`            | `InstanceStatus`   | No       | `IDLE`    | ENUM                         | Current lifecycle state.                             |
| `connection_type`   | `ConnectionType`   | No       | `LOCAL`   | ENUM                         | Whether the CLI runs locally or over SSH.            |
| `ssh_config_id`     | `UUID`             | Yes      | `NULL`    | FK -> `ssh_config.id`        | Reference to SSH credentials (required when `connection_type = SSH`). |
| `model_override`    | `VARCHAR(128)`     | Yes      | `NULL`    | --                           | Override the project's default model for this instance. |
| `max_tokens`        | `INTEGER`          | No       | `200000`  | CHECK (`max_tokens > 0`)     | Maximum token budget per task execution.             |
| `pid`               | `INTEGER`          | Yes      | `NULL`    | --                           | OS process ID of the running Claude Code CLI.        |
| `created_at`        | `TIMESTAMPTZ`      | No       | `now()`   | --                           | Row creation timestamp (UTC).                        |
| `updated_at`        | `TIMESTAMPTZ`      | No       | `now()`   | ON UPDATE `now()`            | Last modification timestamp (UTC).                   |

#### Relationships

- **project** -- `relationship("Project", back_populates="instances")`
- **ssh_config** -- `relationship("SSHConfig", back_populates="instances")`
- **tasks** -- `relationship("Task", back_populates="instance", cascade="all, delete-orphan")`
- **schedules** -- `relationship("Schedule", back_populates="instance", cascade="all, delete-orphan")`
- **usage_logs** -- `relationship("UsageLog", back_populates="instance", cascade="all, delete-orphan")`

#### Indexes

| Index Name                         | Columns                    | Type   | Rationale                                       |
| ---------------------------------- | -------------------------- | ------ | ----------------------------------------------- |
| `ix_instance_project_id`           | `project_id`               | BTREE  | Fast lookup of instances within a project.       |
| `ix_instance_status`               | `status`                   | BTREE  | Filter instances by state (e.g., show running).  |
| `ix_instance_ssh_config_id`        | `ssh_config_id`            | BTREE  | Join efficiency for SSH config lookups.          |
| `ix_instance_project_id_name`      | `project_id`, `name`       | UNIQUE | Instance names must be unique within a project.  |

#### Business Rules

1. Instance `name` must be unique within its parent project (enforced by unique composite index).
2. When `connection_type = SSH`, `ssh_config_id` must not be `NULL`; when `connection_type = LOCAL`, `ssh_config_id` must be `NULL`.
3. The `pid` field is populated only when `status = RUNNING`; it is set to `NULL` on any terminal state transition.
4. Deleting an instance cancels all `QUEUED` and `SCHEDULED` tasks, terminates any `RUNNING` task, and cascades to all related usage logs and schedules.
5. `working_directory` defaults to the parent project's `root_path` if not explicitly provided.

#### Example JSON Representation

```json
{
  "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "project_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Backend Worker",
  "working_directory": "/home/user/projects/ecommerce/backend",
  "status": "RUNNING",
  "connection_type": "LOCAL",
  "ssh_config_id": null,
  "model_override": null,
  "max_tokens": 200000,
  "pid": 48291,
  "created_at": "2025-07-15T10:35:00Z",
  "updated_at": "2025-07-21T09:12:44Z"
}
```

---

### Task

Represents a single prompt to be executed by a Claude Code instance. Tasks form an ordered queue per instance, sorted by `priority` (ascending = higher priority) then `position` (ascending = earlier).

#### Fields

| Column          | Type             | Nullable | Default    | Constraints                 | Description                                           |
| --------------- | ---------------- | -------- | ---------- | --------------------------- | ----------------------------------------------------- |
| `id`            | `UUID`           | No       | `uuid4()`  | PK                          | Unique identifier.                                    |
| `instance_id`   | `UUID`           | No       | --         | FK -> `instance.id`         | Target instance that will execute this task.          |
| `prompt`        | `TEXT`            | No       | --         | CHECK (`length(prompt) > 0`) | The prompt text sent to Claude Code CLI.              |
| `status`        | `TaskStatus`     | No       | `QUEUED`   | ENUM                        | Current lifecycle state.                              |
| `priority`      | `INTEGER`        | No       | `100`      | CHECK (`priority >= 0`)     | Queue priority (lower number = higher priority).      |
| `position`      | `INTEGER`        | No       | `0`        | CHECK (`position >= 0`)     | Ordering position within the same priority level.     |
| `scheduled_at`  | `TIMESTAMPTZ`    | Yes      | `NULL`     | --                          | When this task should become eligible for execution.  |
| `started_at`    | `TIMESTAMPTZ`    | Yes      | `NULL`     | --                          | When execution actually began.                        |
| `completed_at`  | `TIMESTAMPTZ`    | Yes      | `NULL`     | --                          | When execution finished (success or failure).         |
| `result`        | `TEXT`           | Yes      | `NULL`     | --                          | Captured output from Claude Code on success.          |
| `error`         | `TEXT`           | Yes      | `NULL`     | --                          | Error message/traceback on failure.                   |
| `token_usage`   | `JSONB`          | Yes      | `NULL`     | --                          | Breakdown of token consumption (see schema below).    |
| `cost_estimate` | `DECIMAL(12,6)`  | Yes      | `NULL`     | CHECK (`cost_estimate >= 0`) | Estimated cost in USD for this task execution.        |
| `created_at`    | `TIMESTAMPTZ`    | No       | `now()`    | --                          | Row creation timestamp (UTC).                         |
| `updated_at`    | `TIMESTAMPTZ`    | No       | `now()`    | ON UPDATE `now()`           | Last modification timestamp (UTC).                    |

#### token_usage JSON Schema

```json
{
  "input_tokens": 1523,
  "output_tokens": 4891,
  "cache_creation_input_tokens": 0,
  "cache_read_input_tokens": 320,
  "total_tokens": 6414
}
```

#### Relationships

- **instance** -- `relationship("Instance", back_populates="tasks")`
- **usage_log** -- `relationship("UsageLog", back_populates="task", uselist=False, cascade="all, delete-orphan")`

#### Indexes

| Index Name                         | Columns                                  | Type   | Rationale                                              |
| ---------------------------------- | ---------------------------------------- | ------ | ------------------------------------------------------ |
| `ix_task_instance_id`              | `instance_id`                            | BTREE  | Fast lookup of tasks for a given instance.             |
| `ix_task_status`                   | `status`                                 | BTREE  | Filter by task state (e.g., show running tasks).       |
| `ix_task_queue_order`              | `instance_id`, `priority`, `position`    | BTREE  | Efficient queue ordering query.                        |
| `ix_task_scheduled_at`             | `scheduled_at`                           | BTREE  | Scheduler lookup for due tasks.                        |
| `ix_task_completed_at`             | `completed_at`                           | BTREE  | Reporting queries on completion timeframes.            |

#### Business Rules

1. Only one task per instance may have `status = RUNNING` at any time (enforced at the application layer by the task runner service).
2. When `status` transitions to `RUNNING`, `started_at` is set to `now()`.
3. When `status` transitions to `COMPLETED` or `FAILED`, `completed_at` is set to `now()`.
4. Tasks with `status = SCHEDULED` are not picked up by the queue until `scheduled_at <= now()`, at which point they transition to `QUEUED`.
5. `priority` values follow the convention: 0 = critical, 50 = high, 100 = normal (default), 200 = low, 500 = background.
6. `position` is used for drag-and-drop reordering within the same priority; the frontend renumbers positions when a task is moved.
7. Cancelling a `RUNNING` task sends `SIGTERM` to the Claude Code process; the task runner waits up to 10 seconds before `SIGKILL`.

#### Example JSON Representation

```json
{
  "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "instance_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "prompt": "Refactor the authentication middleware to use dependency injection",
  "status": "COMPLETED",
  "priority": 100,
  "position": 0,
  "scheduled_at": null,
  "started_at": "2025-07-21T09:12:44Z",
  "completed_at": "2025-07-21T09:15:32Z",
  "result": "I've refactored the authentication middleware...",
  "error": null,
  "token_usage": {
    "input_tokens": 2150,
    "output_tokens": 8430,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 512,
    "total_tokens": 10580
  },
  "cost_estimate": 0.042300,
  "created_at": "2025-07-21T09:10:00Z",
  "updated_at": "2025-07-21T09:15:32Z"
}
```

---

### SSHConfig

Stores reusable SSH connection credentials. A single SSHConfig can be shared across many instances, even across different projects.

#### Fields

| Column       | Type            | Nullable | Default   | Constraints | Description                                      |
| ------------ | --------------- | -------- | --------- | ----------- | ------------------------------------------------ |
| `id`         | `UUID`          | No       | `uuid4()` | PK          | Unique identifier.                               |
| `name`       | `VARCHAR(255)`  | No       | --        | UNIQUE      | Human-readable label (e.g., "Production Server").|
| `host`       | `VARCHAR(255)`  | No       | --        | --          | Hostname or IP address of the remote machine.    |
| `port`       | `INTEGER`       | No       | `22`      | CHECK (`port BETWEEN 1 AND 65535`) | SSH port number. |
| `username`   | `VARCHAR(128)`  | No       | --        | --          | Remote user to authenticate as.                  |
| `key_path`   | `VARCHAR(512)`  | No       | --        | --          | Absolute path to the SSH private key file.       |
| `created_at` | `TIMESTAMPTZ`   | No       | `now()`   | --          | Row creation timestamp (UTC).                    |

#### Relationships

- **instances** -- `relationship("Instance", back_populates="ssh_config")`

#### Indexes

| Index Name                | Columns  | Type   | Rationale                         |
| ------------------------- | -------- | ------ | --------------------------------- |
| `uq_ssh_config_name`      | `name`   | UNIQUE | Prevent duplicate config names.   |
| `ix_ssh_config_host`      | `host`   | BTREE  | Lookup configs by target host.    |

#### Business Rules

1. `name` must be globally unique (enforced by unique constraint).
2. `key_path` must point to a file readable by the backend process; validation occurs on creation and when an instance first uses it.
3. An SSHConfig cannot be deleted while any instance references it; the API returns `409 Conflict`. Alternatively, removal sets referencing instances' `ssh_config_id` to `NULL` and flips their `connection_type` to `LOCAL` (configurable behavior).
4. The private key file itself is never stored in the database -- only the filesystem path.

#### Example JSON Representation

```json
{
  "id": "d4e5f6a7-b8c9-0123-def0-1234567890ab",
  "name": "Production Server",
  "host": "prod-01.internal.example.com",
  "port": 22,
  "username": "deploy",
  "key_path": "/home/user/.ssh/prod_ed25519",
  "created_at": "2025-07-10T08:00:00Z"
}
```

---

### Schedule

Defines a recurring cron-based task that is automatically enqueued on an instance at the specified cadence. Managed by APScheduler 4 running inside the backend process.

#### Fields

| Column            | Type            | Nullable | Default   | Constraints          | Description                                              |
| ----------------- | --------------- | -------- | --------- | -------------------- | -------------------------------------------------------- |
| `id`              | `UUID`          | No       | `uuid4()` | PK                   | Unique identifier.                                       |
| `instance_id`     | `UUID`          | No       | --        | FK -> `instance.id`  | Target instance that receives generated tasks.           |
| `cron_expression` | `VARCHAR(128)`  | No       | --        | --                   | Standard 5-field cron expression (minute hour dom mon dow). |
| `prompt_template` | `TEXT`          | No       | --        | CHECK (`length(prompt_template) > 0`) | Template with `{{variable}}` placeholders.  |
| `is_active`       | `BOOLEAN`       | No       | `true`    | --                   | Whether the schedule is currently armed.                 |
| `last_run_at`     | `TIMESTAMPTZ`   | Yes      | `NULL`    | --                   | Timestamp of the most recent task creation from this schedule. |
| `next_run_at`     | `TIMESTAMPTZ`   | Yes      | `NULL`    | --                   | Pre-computed next trigger time (for display/debugging).  |
| `created_at`      | `TIMESTAMPTZ`   | No       | `now()`   | --                   | Row creation timestamp (UTC).                            |

#### Template Variables

The `prompt_template` supports the following built-in variables, expanded at trigger time:

| Variable              | Expands To                          | Example                   |
| --------------------- | ----------------------------------- | ------------------------- |
| `{{datetime}}`        | ISO 8601 UTC timestamp              | `2025-07-21T09:00:00Z`   |
| `{{date}}`            | ISO 8601 date                       | `2025-07-21`             |
| `{{time}}`            | ISO 8601 time                       | `09:00:00`               |
| `{{instance_name}}`   | Name of the target instance         | `Backend Worker`          |
| `{{project_name}}`    | Name of the parent project          | `E-Commerce Platform`     |

#### Relationships

- **instance** -- `relationship("Instance", back_populates="schedules")`

#### Indexes

| Index Name                     | Columns                  | Type   | Rationale                                     |
| ------------------------------ | ------------------------ | ------ | --------------------------------------------- |
| `ix_schedule_instance_id`      | `instance_id`            | BTREE  | Fast lookup of schedules for an instance.     |
| `ix_schedule_is_active`        | `is_active`              | BTREE  | Scheduler only queries active schedules.      |
| `ix_schedule_next_run_at`      | `next_run_at`            | BTREE  | Efficient "what fires next?" queries.         |

#### Business Rules

1. `cron_expression` is validated against standard 5-field cron syntax on creation and update; invalid expressions are rejected with `422 Unprocessable Entity`.
2. When a schedule fires, it creates a new `Task` with `status = SCHEDULED` and `scheduled_at` set to the trigger time.
3. Deactivating a schedule (`is_active = false`) does not cancel tasks it has already created.
4. Deleting a schedule does not cascade to previously created tasks (they remain for historical tracking). Only the schedule row is removed.
5. `next_run_at` is recomputed after each trigger and after any update to `cron_expression` or `is_active`.

#### Example JSON Representation

```json
{
  "id": "e5f6a7b8-c9d0-1234-ef01-234567890abc",
  "instance_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "cron_expression": "0 9 * * 1-5",
  "prompt_template": "Run the test suite and report any failures. Date: {{datetime}}",
  "is_active": true,
  "last_run_at": "2025-07-21T09:00:00Z",
  "next_run_at": "2025-07-22T09:00:00Z",
  "created_at": "2025-07-15T11:00:00Z"
}
```

---

### UsageLog

Immutable record of token consumption and cost for a completed task. One row per task, written when execution finishes. Provides the raw data for usage analytics, billing dashboards, and cost forecasting.

#### Fields

| Column        | Type             | Nullable | Default   | Constraints          | Description                                        |
| ------------- | ---------------- | -------- | --------- | -------------------- | -------------------------------------------------- |
| `id`          | `UUID`           | No       | `uuid4()` | PK                   | Unique identifier.                                 |
| `task_id`     | `UUID`           | No       | --        | FK -> `task.id`, UNIQUE | The task this log entry corresponds to.          |
| `instance_id` | `UUID`           | No       | --        | FK -> `instance.id`  | Denormalized for efficient per-instance aggregation.|
| `tokens_in`   | `INTEGER`        | No       | --        | CHECK (`tokens_in >= 0`)  | Number of input tokens consumed.              |
| `tokens_out`  | `INTEGER`        | No       | --        | CHECK (`tokens_out >= 0`) | Number of output tokens generated.            |
| `cost`        | `DECIMAL(12,6)`  | No       | --        | CHECK (`cost >= 0`)  | Estimated cost in USD.                             |
| `model`       | `VARCHAR(128)`   | No       | --        | --                   | Model identifier used for execution.               |
| `timestamp`   | `TIMESTAMPTZ`    | No       | `now()`   | --                   | When the usage was recorded (typically = task completion). |

#### Relationships

- **task** -- `relationship("Task", back_populates="usage_log")`
- **instance** -- `relationship("Instance", back_populates="usage_logs")`

#### Indexes

| Index Name                       | Columns                  | Type   | Rationale                                           |
| -------------------------------- | ------------------------ | ------ | --------------------------------------------------- |
| `uq_usage_log_task_id`           | `task_id`                | UNIQUE | Exactly one usage log per task.                     |
| `ix_usage_log_instance_id`       | `instance_id`            | BTREE  | Per-instance usage aggregation.                     |
| `ix_usage_log_timestamp`         | `timestamp`              | BTREE  | Time-range queries for dashboards.                  |
| `ix_usage_log_model`             | `model`                  | BTREE  | Per-model cost breakdowns.                          |
| `ix_usage_log_instance_timestamp`| `instance_id`, `timestamp` | BTREE | Composite index for instance + time range queries. |

#### Business Rules

1. Usage logs are **immutable** -- once written, they are never updated. Corrections are handled by inserting adjustment rows (future feature).
2. One and only one `UsageLog` row exists per `Task` (enforced by unique constraint on `task_id`).
3. `instance_id` is denormalized (it could be derived via `task.instance_id`) to avoid an extra join in the most common aggregation queries.
4. `cost` is computed at write time using the pricing table for the `model` used. If pricing is unavailable, `cost` is set to `0.000000` and flagged for backfill.
5. Usage logs are never deleted, even if the parent task or instance is deleted (override `ON DELETE` to `SET NULL` for archive scenarios, or ensure cascade only in full project deletion).

#### Example JSON Representation

```json
{
  "id": "f6a7b8c9-d0e1-2345-f012-34567890abcd",
  "task_id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "instance_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "tokens_in": 2150,
  "tokens_out": 8430,
  "cost": 0.042300,
  "model": "claude-sonnet-4-20250514",
  "timestamp": "2025-07-21T09:15:32Z"
}
```

---

## Migration Strategy

### Tool

All schema changes are managed by **Alembic** (the migration framework for SQLAlchemy). The migration environment lives at:

```
backend/app/migrations/
├── env.py              # Alembic environment config (async engine)
├── script.py.mako      # Migration file template
├── versions/           # Individual migration scripts
│   ├── 001_initial_schema.py
│   ├── 002_add_usage_log_composite_index.py
│   └── ...
└── alembic.ini         # Alembic configuration
```

### Async Configuration

Since the backend uses SQLAlchemy's async engine, the Alembic `env.py` is configured for async operation:

```python
# backend/app/migrations/env.py (key excerpt)

from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context
from app.models import Base  # Unified declarative base


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=Base.metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations():
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()
```

### Initial Migration Plan

The initial migration creates all six tables, enums, indexes, and constraints in a single revision.

```python
# backend/app/migrations/versions/001_initial_schema.py

"""Initial schema -- all core entities.

Revision ID: 001
Create Date: 2025-07-15 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, ENUM

# Revision identifiers
revision = "001"
down_revision = None
branch_labels = None
depends_on = None

# Define enums at module level for reuse in upgrade/downgrade
instance_status = ENUM(
    "IDLE", "RUNNING", "PAUSED", "ERROR", "OFFLINE",
    name="instancestatus", create_type=False,
)
task_status = ENUM(
    "QUEUED", "SCHEDULED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED",
    name="taskstatus", create_type=False,
)
connection_type = ENUM(
    "LOCAL", "SSH",
    name="connectiontype", create_type=False,
)


def upgrade() -> None:
    # --- Enums ---
    op.execute("CREATE TYPE instancestatus AS ENUM ('IDLE','RUNNING','PAUSED','ERROR','OFFLINE')")
    op.execute("CREATE TYPE taskstatus AS ENUM ('QUEUED','SCHEDULED','RUNNING','COMPLETED','FAILED','CANCELLED')")
    op.execute("CREATE TYPE connectiontype AS ENUM ('LOCAL','SSH')")

    # --- ssh_config (no FK dependencies) ---
    op.create_table(
        "ssh_config",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False, unique=True),
        sa.Column("host", sa.String(255), nullable=False),
        sa.Column("port", sa.Integer, nullable=False, server_default="22"),
        sa.Column("username", sa.String(128), nullable=False),
        sa.Column("key_path", sa.String(512), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ssh_config_host", "ssh_config", ["host"])

    # --- project ---
    op.create_table(
        "project",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("root_path", sa.String(1024), nullable=False),
        sa.Column("settings", JSONB, server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_archived", sa.Boolean, server_default="false", nullable=False),
    )
    op.create_index("ix_project_name", "project", ["name"])
    op.create_index("ix_project_is_archived", "project", ["is_archived"])
    op.create_index("ix_project_created_at", "project", ["created_at"])

    # --- instance ---
    op.create_table(
        "instance",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("project.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("working_directory", sa.String(1024), nullable=False),
        sa.Column("status", instance_status, server_default="IDLE", nullable=False),
        sa.Column("connection_type", connection_type, server_default="LOCAL", nullable=False),
        sa.Column("ssh_config_id", UUID(as_uuid=True), sa.ForeignKey("ssh_config.id", ondelete="SET NULL"), nullable=True),
        sa.Column("model_override", sa.String(128), nullable=True),
        sa.Column("max_tokens", sa.Integer, server_default="200000", nullable=False),
        sa.Column("pid", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_instance_project_id", "instance", ["project_id"])
    op.create_index("ix_instance_status", "instance", ["status"])
    op.create_index("ix_instance_ssh_config_id", "instance", ["ssh_config_id"])
    op.create_index("ix_instance_project_id_name", "instance", ["project_id", "name"], unique=True)

    # --- task ---
    op.create_table(
        "task",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("instance_id", UUID(as_uuid=True), sa.ForeignKey("instance.id", ondelete="CASCADE"), nullable=False),
        sa.Column("prompt", sa.Text, nullable=False),
        sa.Column("status", task_status, server_default="QUEUED", nullable=False),
        sa.Column("priority", sa.Integer, server_default="100", nullable=False),
        sa.Column("position", sa.Integer, server_default="0", nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result", sa.Text, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("token_usage", JSONB, nullable=True),
        sa.Column("cost_estimate", sa.Numeric(12, 6), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_task_instance_id", "task", ["instance_id"])
    op.create_index("ix_task_status", "task", ["status"])
    op.create_index("ix_task_queue_order", "task", ["instance_id", "priority", "position"])
    op.create_index("ix_task_scheduled_at", "task", ["scheduled_at"])
    op.create_index("ix_task_completed_at", "task", ["completed_at"])
    op.create_check_constraint("ck_task_prompt_nonempty", "task", "length(prompt) > 0")
    op.create_check_constraint("ck_task_priority_nonneg", "task", "priority >= 0")
    op.create_check_constraint("ck_task_position_nonneg", "task", "position >= 0")
    op.create_check_constraint("ck_task_cost_nonneg", "task", "cost_estimate >= 0 OR cost_estimate IS NULL")

    # --- schedule ---
    op.create_table(
        "schedule",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("instance_id", UUID(as_uuid=True), sa.ForeignKey("instance.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cron_expression", sa.String(128), nullable=False),
        sa.Column("prompt_template", sa.Text, nullable=False),
        sa.Column("is_active", sa.Boolean, server_default="true", nullable=False),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_schedule_instance_id", "schedule", ["instance_id"])
    op.create_index("ix_schedule_is_active", "schedule", ["is_active"])
    op.create_index("ix_schedule_next_run_at", "schedule", ["next_run_at"])
    op.create_check_constraint("ck_schedule_template_nonempty", "schedule", "length(prompt_template) > 0")

    # --- usage_log ---
    op.create_table(
        "usage_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("task_id", UUID(as_uuid=True), sa.ForeignKey("task.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("instance_id", UUID(as_uuid=True), sa.ForeignKey("instance.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tokens_in", sa.Integer, nullable=False),
        sa.Column("tokens_out", sa.Integer, nullable=False),
        sa.Column("cost", sa.Numeric(12, 6), nullable=False),
        sa.Column("model", sa.String(128), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_usage_log_instance_id", "usage_log", ["instance_id"])
    op.create_index("ix_usage_log_timestamp", "usage_log", ["timestamp"])
    op.create_index("ix_usage_log_model", "usage_log", ["model"])
    op.create_index("ix_usage_log_instance_timestamp", "usage_log", ["instance_id", "timestamp"])
    op.create_check_constraint("ck_usage_log_tokens_in_nonneg", "usage_log", "tokens_in >= 0")
    op.create_check_constraint("ck_usage_log_tokens_out_nonneg", "usage_log", "tokens_out >= 0")
    op.create_check_constraint("ck_usage_log_cost_nonneg", "usage_log", "cost >= 0")


def downgrade() -> None:
    op.drop_table("usage_log")
    op.drop_table("schedule")
    op.drop_table("task")
    op.drop_table("instance")
    op.drop_table("project")
    op.drop_table("ssh_config")
    op.execute("DROP TYPE connectiontype")
    op.execute("DROP TYPE taskstatus")
    op.execute("DROP TYPE instancestatus")
```

### Migration Workflow

```bash
# Generate a new migration after model changes
alembic revision --autogenerate -m "description of changes"

# Apply all pending migrations
alembic upgrade head

# Roll back one revision
alembic downgrade -1

# Show current revision
alembic current

# Show migration history
alembic history --verbose
```

### Future Migration Conventions

| Convention                 | Rule                                                              |
| -------------------------- | ----------------------------------------------------------------- |
| Naming                     | `NNN_short_description.py` (zero-padded sequential number)       |
| One concern per migration  | Each migration addresses a single schema change                   |
| Reversible                 | Every `upgrade()` must have a corresponding `downgrade()`         |
| Data migrations            | Separate from schema migrations; run in distinct revisions        |
| Testing                    | All migrations are tested via `upgrade head` + `downgrade base` in CI |

---

## Query Patterns

The following are the primary query patterns the application uses, shown as raw SQL for clarity. The application executes these through SQLAlchemy's async ORM or `text()` queries.

### 1. List Projects with Instance Counts

Used by the project listing page to show how many instances each project has.

```sql
SELECT
    p.id,
    p.name,
    p.description,
    p.root_path,
    p.is_archived,
    p.created_at,
    p.updated_at,
    COUNT(i.id)                                          AS instance_count,
    COUNT(i.id) FILTER (WHERE i.status = 'RUNNING')      AS running_instance_count
FROM project p
LEFT JOIN instance i ON i.project_id = p.id
WHERE p.is_archived = false
GROUP BY p.id
ORDER BY p.updated_at DESC;
```

**SQLAlchemy equivalent:**

```python
from sqlalchemy import select, func
from app.models import Project, Instance

stmt = (
    select(
        Project,
        func.count(Instance.id).label("instance_count"),
        func.count(Instance.id).filter(Instance.status == InstanceStatus.RUNNING).label("running_instance_count"),
    )
    .outerjoin(Instance, Instance.project_id == Project.id)
    .where(Project.is_archived == False)
    .group_by(Project.id)
    .order_by(Project.updated_at.desc())
)
result = await session.execute(stmt)
```

---

### 2. Get Task Queue Ordered by Priority and Position

Used by the task queue panel to display the ordered list of pending/scheduled tasks for a given instance.

```sql
SELECT
    t.id,
    t.prompt,
    t.status,
    t.priority,
    t.position,
    t.scheduled_at,
    t.created_at
FROM task t
WHERE t.instance_id = :instance_id
  AND t.status IN ('QUEUED', 'SCHEDULED')
ORDER BY t.priority ASC, t.position ASC;
```

**SQLAlchemy equivalent:**

```python
stmt = (
    select(Task)
    .where(
        Task.instance_id == instance_id,
        Task.status.in_([TaskStatus.QUEUED, TaskStatus.SCHEDULED]),
    )
    .order_by(Task.priority.asc(), Task.position.asc())
)
tasks = (await session.execute(stmt)).scalars().all()
```

---

### 3. Get Next Task to Execute for an Instance

Used by the task runner when an instance becomes idle. Picks the highest-priority, earliest-position task that is eligible to run.

```sql
SELECT t.*
FROM task t
WHERE t.instance_id = :instance_id
  AND t.status = 'QUEUED'
  AND (t.scheduled_at IS NULL OR t.scheduled_at <= NOW())
ORDER BY t.priority ASC, t.position ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;
```

The `FOR UPDATE SKIP LOCKED` clause prevents race conditions when multiple workers might try to claim the same task.

---

### 4. Usage Aggregation by Project over a Time Range

Used by the analytics dashboard to show per-project cost and token summaries.

```sql
SELECT
    p.id                                    AS project_id,
    p.name                                  AS project_name,
    SUM(ul.tokens_in)                       AS total_tokens_in,
    SUM(ul.tokens_out)                      AS total_tokens_out,
    SUM(ul.tokens_in + ul.tokens_out)       AS total_tokens,
    SUM(ul.cost)                            AS total_cost,
    COUNT(ul.id)                            AS task_count
FROM usage_log ul
JOIN instance i  ON i.id = ul.instance_id
JOIN project  p  ON p.id = i.project_id
WHERE ul.timestamp BETWEEN :start_date AND :end_date
GROUP BY p.id, p.name
ORDER BY total_cost DESC;
```

---

### 5. Usage Aggregation by Instance over a Time Range

Used by the per-project analytics view to break down usage by instance.

```sql
SELECT
    i.id                                    AS instance_id,
    i.name                                  AS instance_name,
    SUM(ul.tokens_in)                       AS total_tokens_in,
    SUM(ul.tokens_out)                      AS total_tokens_out,
    SUM(ul.cost)                            AS total_cost,
    COUNT(ul.id)                            AS task_count,
    AVG(ul.cost)                            AS avg_cost_per_task
FROM usage_log ul
JOIN instance i ON i.id = ul.instance_id
WHERE i.project_id = :project_id
  AND ul.timestamp BETWEEN :start_date AND :end_date
GROUP BY i.id, i.name
ORDER BY total_cost DESC;
```

---

### 6. Daily Usage Time Series

Used by the analytics dashboard to render cost-over-time charts.

```sql
SELECT
    DATE_TRUNC('day', ul.timestamp)         AS day,
    SUM(ul.tokens_in)                       AS tokens_in,
    SUM(ul.tokens_out)                      AS tokens_out,
    SUM(ul.cost)                            AS cost,
    COUNT(ul.id)                            AS task_count
FROM usage_log ul
WHERE ul.timestamp BETWEEN :start_date AND :end_date
GROUP BY DATE_TRUNC('day', ul.timestamp)
ORDER BY day ASC;
```

---

### 7. Active Instances with Current Task Info

Used by the dashboard home page to show a real-time overview of all running instances and what they are working on.

```sql
SELECT
    i.id              AS instance_id,
    i.name            AS instance_name,
    i.status          AS instance_status,
    i.pid             AS instance_pid,
    p.id              AS project_id,
    p.name            AS project_name,
    t.id              AS current_task_id,
    t.prompt          AS current_task_prompt,
    t.started_at      AS task_started_at
FROM instance i
JOIN project p ON p.id = i.project_id
LEFT JOIN task t ON t.instance_id = i.id AND t.status = 'RUNNING'
WHERE i.status IN ('RUNNING', 'PAUSED', 'ERROR')
ORDER BY i.status ASC, i.updated_at DESC;
```

**SQLAlchemy equivalent:**

```python
stmt = (
    select(Instance, Project, Task)
    .join(Project, Project.id == Instance.project_id)
    .outerjoin(Task, and_(Task.instance_id == Instance.id, Task.status == TaskStatus.RUNNING))
    .where(Instance.status.in_([InstanceStatus.RUNNING, InstanceStatus.PAUSED, InstanceStatus.ERROR]))
    .order_by(Instance.status.asc(), Instance.updated_at.desc())
)
rows = (await session.execute(stmt)).all()
```

---

### 8. Pending Scheduled Tasks Due for Promotion

Used by the scheduler service to find `SCHEDULED` tasks whose `scheduled_at` time has arrived.

```sql
UPDATE task
SET status = 'QUEUED',
    updated_at = NOW()
WHERE status = 'SCHEDULED'
  AND scheduled_at <= NOW()
RETURNING id, instance_id;
```

---

### 9. Instance Task History (Paginated)

Used by the instance detail view to show completed, failed, and cancelled tasks.

```sql
SELECT
    t.id,
    t.prompt,
    t.status,
    t.started_at,
    t.completed_at,
    t.cost_estimate,
    t.token_usage
FROM task t
WHERE t.instance_id = :instance_id
  AND t.status IN ('COMPLETED', 'FAILED', 'CANCELLED')
ORDER BY t.completed_at DESC NULLS LAST
LIMIT :page_size
OFFSET :offset;
```

---

### 10. Model Usage Breakdown

Used by the analytics page to show which models are consuming the most resources.

```sql
SELECT
    ul.model,
    COUNT(ul.id)                            AS task_count,
    SUM(ul.tokens_in)                       AS total_tokens_in,
    SUM(ul.tokens_out)                      AS total_tokens_out,
    SUM(ul.cost)                            AS total_cost,
    AVG(ul.cost)                            AS avg_cost_per_task
FROM usage_log ul
WHERE ul.timestamp BETWEEN :start_date AND :end_date
GROUP BY ul.model
ORDER BY total_cost DESC;
```
