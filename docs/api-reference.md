# Claude Orchestrator API Reference

Base URL: `http://localhost:8000`

All endpoints return JSON. Request bodies must be sent as `application/json` unless otherwise noted. Timestamps follow ISO 8601 format (`YYYY-MM-DDTHH:MM:SSZ`).

---

## Table of Contents

- [Projects](#projects)
- [Instances](#instances)
- [Tasks (Queue)](#tasks-queue)
- [Schedules](#schedules)
- [Usage & Analytics](#usage--analytics)
- [SSH Configs](#ssh-configs)
- [WebSocket Endpoints](#websocket-endpoints)
- [Common Error Format](#common-error-format)

---

## Projects

### List All Projects

```
GET /api/projects
```

**Description:** Returns a list of all projects. Archived projects are excluded by default.

**Query Parameters:**

| Parameter     | Type    | Required | Default | Description                          |
|---------------|---------|----------|---------|--------------------------------------|
| include_archived | boolean | No    | false   | Include archived projects in results |

**Response Body:**

```json
[
  {
    "id": 1,
    "name": "my-project",
    "description": "Backend API service",
    "root_path": "/home/user/projects/my-project",
    "settings": {
      "default_model": "claude-sonnet-4-20250514",
      "max_instances": 5
    },
    "is_archived": false,
    "created_at": "2026-01-15T10:30:00Z",
    "updated_at": "2026-01-20T14:00:00Z"
  }
]
```

**Status Codes:**

| Code | Description            |
|------|------------------------|
| 200  | Success                |
| 500  | Internal server error  |

---

### Create Project

```
POST /api/projects
```

**Description:** Creates a new project.

**Request Body:**

```json
{
  "name": "my-project",
  "description": "Backend API service",
  "root_path": "/home/user/projects/my-project",
  "settings": {
    "default_model": "claude-sonnet-4-20250514",
    "max_instances": 5
  }
}
```

| Field       | Type   | Required | Description                              |
|-------------|--------|----------|------------------------------------------|
| name        | string | Yes      | Unique project name                      |
| description | string | No       | Human-readable project description       |
| root_path   | string | Yes      | Absolute path to the project root on disk |
| settings    | object | No       | Arbitrary project-level settings         |

**Response Body:**

```json
{
  "id": 1,
  "name": "my-project",
  "description": "Backend API service",
  "root_path": "/home/user/projects/my-project",
  "settings": {
    "default_model": "claude-sonnet-4-20250514",
    "max_instances": 5
  },
  "is_archived": false,
  "created_at": "2026-01-15T10:30:00Z",
  "updated_at": "2026-01-15T10:30:00Z"
}
```

**Status Codes:**

| Code | Description                                      |
|------|--------------------------------------------------|
| 201  | Project created successfully                     |
| 400  | Invalid request body (missing required fields)   |
| 409  | A project with this name already exists          |
| 422  | Validation error (e.g., root_path does not exist)|
| 500  | Internal server error                            |

---

### Get Project Detail

```
GET /api/projects/{id}
```

**Description:** Returns full details for a single project, including its instance count.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The project ID     |

**Response Body:**

```json
{
  "id": 1,
  "name": "my-project",
  "description": "Backend API service",
  "root_path": "/home/user/projects/my-project",
  "settings": {
    "default_model": "claude-sonnet-4-20250514",
    "max_instances": 5
  },
  "is_archived": false,
  "instance_count": 3,
  "created_at": "2026-01-15T10:30:00Z",
  "updated_at": "2026-01-20T14:00:00Z"
}
```

**Status Codes:**

| Code | Description                     |
|------|---------------------------------|
| 200  | Success                         |
| 404  | Project not found               |
| 500  | Internal server error           |

---

### Update Project

```
PUT /api/projects/{id}
```

**Description:** Updates an existing project. Only provided fields are updated; omitted fields remain unchanged.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The project ID     |

**Request Body:**

```json
{
  "name": "my-project-renamed",
  "description": "Updated description",
  "root_path": "/home/user/projects/my-project-v2",
  "settings": {
    "default_model": "claude-sonnet-4-20250514",
    "max_instances": 10
  }
}
```

| Field       | Type   | Required | Description                        |
|-------------|--------|----------|------------------------------------|
| name        | string | No       | Updated project name               |
| description | string | No       | Updated description                |
| root_path   | string | No       | Updated root path                  |
| settings    | object | No       | Updated settings (replaces entire settings object) |

**Response Body:**

```json
{
  "id": 1,
  "name": "my-project-renamed",
  "description": "Updated description",
  "root_path": "/home/user/projects/my-project-v2",
  "settings": {
    "default_model": "claude-sonnet-4-20250514",
    "max_instances": 10
  },
  "is_archived": false,
  "created_at": "2026-01-15T10:30:00Z",
  "updated_at": "2026-02-06T09:15:00Z"
}
```

**Status Codes:**

| Code | Description                                    |
|------|------------------------------------------------|
| 200  | Project updated successfully                   |
| 400  | Invalid request body                           |
| 404  | Project not found                              |
| 409  | Name conflict with another project             |
| 422  | Validation error                               |
| 500  | Internal server error                          |

---

### Archive Project (Soft Delete)

```
DELETE /api/projects/{id}
```

**Description:** Archives a project by setting its `is_archived` flag to `true`. The project and its data are preserved in the database but excluded from default listings. All running instances belonging to the project are stopped before archival.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The project ID     |

**Response Body:**

```json
{
  "id": 1,
  "name": "my-project",
  "is_archived": true,
  "archived_at": "2026-02-06T09:20:00Z"
}
```

**Status Codes:**

| Code | Description                          |
|------|--------------------------------------|
| 200  | Project archived successfully        |
| 404  | Project not found                    |
| 500  | Internal server error                |

**Notes:**
- This is a soft delete. No data is permanently removed.
- To restore an archived project, use `PUT /api/projects/{id}` with `"is_archived": false`.
- All instances under the project are stopped before the archive takes effect.

---

## Instances

### List Instances in Project

```
GET /api/projects/{id}/instances
```

**Description:** Returns all instances belonging to a specific project.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The project ID     |

**Query Parameters:**

| Parameter | Type   | Required | Default | Description                               |
|-----------|--------|----------|---------|-------------------------------------------|
| status    | string | No       | all     | Filter by status: `running`, `stopped`, `error` |

**Response Body:**

```json
[
  {
    "id": 1,
    "project_id": 1,
    "name": "backend-worker-1",
    "working_directory": "/home/user/projects/my-project/src",
    "connection_type": "local",
    "ssh_config_id": null,
    "model_override": null,
    "max_tokens": 4096,
    "status": "running",
    "pid": 12345,
    "created_at": "2026-01-16T08:00:00Z",
    "updated_at": "2026-01-20T12:00:00Z"
  },
  {
    "id": 2,
    "project_id": 1,
    "name": "backend-worker-2",
    "working_directory": "/home/user/projects/my-project/tests",
    "connection_type": "ssh",
    "ssh_config_id": 3,
    "model_override": "claude-sonnet-4-20250514",
    "max_tokens": 8192,
    "status": "stopped",
    "pid": null,
    "created_at": "2026-01-17T09:00:00Z",
    "updated_at": "2026-01-19T18:00:00Z"
  }
]
```

**Status Codes:**

| Code | Description                     |
|------|---------------------------------|
| 200  | Success                         |
| 404  | Project not found               |
| 500  | Internal server error           |

---

### Create Instance

```
POST /api/projects/{id}/instances
```

**Description:** Creates a new Claude Code instance within a project.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The project ID     |

**Request Body:**

```json
{
  "name": "backend-worker-1",
  "working_directory": "/home/user/projects/my-project/src",
  "connection_type": "local",
  "ssh_config_id": null,
  "model_override": "claude-sonnet-4-20250514",
  "max_tokens": 4096
}
```

| Field             | Type    | Required | Default | Description                                         |
|-------------------|---------|----------|---------|-----------------------------------------------------|
| name              | string  | Yes      | --      | Display name for the instance                       |
| working_directory | string  | Yes      | --      | Directory in which Claude Code runs                 |
| connection_type   | string  | No       | "local" | `local` or `ssh`                                    |
| ssh_config_id     | integer | No       | null    | ID of an SSH config (required if connection_type is `ssh`) |
| model_override    | string  | No       | null    | Override the project default model for this instance |
| max_tokens        | integer | No       | 4096    | Maximum token limit per request                     |

**Response Body:**

```json
{
  "id": 1,
  "project_id": 1,
  "name": "backend-worker-1",
  "working_directory": "/home/user/projects/my-project/src",
  "connection_type": "local",
  "ssh_config_id": null,
  "model_override": "claude-sonnet-4-20250514",
  "max_tokens": 4096,
  "status": "stopped",
  "pid": null,
  "created_at": "2026-01-16T08:00:00Z",
  "updated_at": "2026-01-16T08:00:00Z"
}
```

**Status Codes:**

| Code | Description                                              |
|------|----------------------------------------------------------|
| 201  | Instance created successfully                            |
| 400  | Invalid request body                                     |
| 404  | Project not found, or referenced SSH config not found    |
| 422  | Validation error (e.g., ssh_config_id missing for SSH type) |
| 500  | Internal server error                                    |

**Notes:**
- The instance is created in a `stopped` state. Use `POST /api/instances/{id}/start` to launch it.
- When `connection_type` is `ssh`, the `ssh_config_id` field is required.

---

### Get Instance Detail

```
GET /api/instances/{id}
```

**Description:** Returns detailed information for a single instance, including its current runtime status.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The instance ID    |

**Response Body:**

```json
{
  "id": 1,
  "project_id": 1,
  "name": "backend-worker-1",
  "working_directory": "/home/user/projects/my-project/src",
  "connection_type": "local",
  "ssh_config_id": null,
  "model_override": "claude-sonnet-4-20250514",
  "max_tokens": 4096,
  "status": "running",
  "pid": 12345,
  "uptime_seconds": 3600,
  "current_task_id": 42,
  "tasks_completed": 17,
  "tasks_pending": 3,
  "created_at": "2026-01-16T08:00:00Z",
  "updated_at": "2026-01-20T12:00:00Z"
}
```

**Status Codes:**

| Code | Description                     |
|------|---------------------------------|
| 200  | Success                         |
| 404  | Instance not found              |
| 500  | Internal server error           |

---

### Update Instance Config

```
PUT /api/instances/{id}
```

**Description:** Updates configuration fields for an existing instance. Only provided fields are updated. Some fields (such as `working_directory` and `connection_type`) can only be changed while the instance is stopped.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The instance ID    |

**Request Body:**

```json
{
  "name": "backend-worker-1-updated",
  "working_directory": "/home/user/projects/my-project/lib",
  "model_override": "claude-sonnet-4-20250514",
  "max_tokens": 8192
}
```

| Field             | Type    | Required | Description                                      |
|-------------------|---------|----------|--------------------------------------------------|
| name              | string  | No       | Updated display name                             |
| working_directory | string  | No       | Updated working directory (requires stopped state) |
| connection_type   | string  | No       | Updated connection type (requires stopped state)  |
| ssh_config_id     | integer | No       | Updated SSH config reference                     |
| model_override    | string  | No       | Updated model override                           |
| max_tokens        | integer | No       | Updated token limit                              |

**Response Body:**

```json
{
  "id": 1,
  "project_id": 1,
  "name": "backend-worker-1-updated",
  "working_directory": "/home/user/projects/my-project/lib",
  "connection_type": "local",
  "ssh_config_id": null,
  "model_override": "claude-sonnet-4-20250514",
  "max_tokens": 8192,
  "status": "stopped",
  "pid": null,
  "created_at": "2026-01-16T08:00:00Z",
  "updated_at": "2026-02-06T10:00:00Z"
}
```

**Status Codes:**

| Code | Description                                                      |
|------|------------------------------------------------------------------|
| 200  | Instance updated successfully                                    |
| 400  | Invalid request body                                             |
| 404  | Instance not found                                               |
| 409  | Cannot update `working_directory` or `connection_type` while running |
| 422  | Validation error                                                 |
| 500  | Internal server error                                            |

---

### Remove Instance

```
DELETE /api/instances/{id}
```

**Description:** Permanently removes an instance. If the instance is currently running, it is stopped first and then deleted.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The instance ID    |

**Response Body:**

```json
{
  "message": "Instance deleted successfully",
  "id": 1
}
```

**Status Codes:**

| Code | Description                     |
|------|---------------------------------|
| 200  | Instance deleted successfully   |
| 404  | Instance not found              |
| 500  | Internal server error           |

**Notes:**
- All associated tasks, schedules, and usage records for the instance are also removed.
- This operation is irreversible.

---

### Start Instance

```
POST /api/instances/{id}/start
```

**Description:** Starts the Claude Code process for this instance. The instance begins processing queued tasks.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The instance ID    |

**Request Body:** None.

**Response Body:**

```json
{
  "id": 1,
  "status": "running",
  "pid": 12345,
  "started_at": "2026-02-06T10:05:00Z"
}
```

**Status Codes:**

| Code | Description                          |
|------|--------------------------------------|
| 200  | Instance started successfully        |
| 404  | Instance not found                   |
| 409  | Instance is already running          |
| 500  | Internal server error (process failed to start) |

---

### Stop Instance

```
POST /api/instances/{id}/stop
```

**Description:** Gracefully stops the Claude Code process for this instance. The currently executing task (if any) is allowed to finish before the process exits. If the process does not stop within a timeout period, it is forcefully terminated.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The instance ID    |

**Request Body:** None.

**Response Body:**

```json
{
  "id": 1,
  "status": "stopped",
  "pid": null,
  "stopped_at": "2026-02-06T10:10:00Z"
}
```

**Status Codes:**

| Code | Description                          |
|------|--------------------------------------|
| 200  | Instance stopped successfully        |
| 404  | Instance not found                   |
| 409  | Instance is already stopped          |
| 500  | Internal server error                |

---

### Restart Instance

```
POST /api/instances/{id}/restart
```

**Description:** Stops and then starts the Claude Code process. Equivalent to calling stop followed by start. The instance briefly enters `stopped` status before transitioning back to `running`.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The instance ID    |

**Request Body:** None.

**Response Body:**

```json
{
  "id": 1,
  "status": "running",
  "pid": 12350,
  "restarted_at": "2026-02-06T10:12:00Z"
}
```

**Status Codes:**

| Code | Description                          |
|------|--------------------------------------|
| 200  | Instance restarted successfully      |
| 404  | Instance not found                   |
| 409  | Instance is not currently running    |
| 500  | Internal server error                |

---

### Instance Health Check

```
GET /api/instances/{id}/health
```

**Description:** Returns the health status of the instance, including process liveness, memory usage, and responsiveness.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The instance ID    |

**Response Body:**

```json
{
  "id": 1,
  "status": "running",
  "healthy": true,
  "pid": 12345,
  "uptime_seconds": 7200,
  "memory_usage_mb": 256.4,
  "last_heartbeat": "2026-02-06T10:14:58Z",
  "current_task_id": 42,
  "checked_at": "2026-02-06T10:15:00Z"
}
```

**Status Codes:**

| Code | Description                     |
|------|---------------------------------|
| 200  | Health check completed          |
| 404  | Instance not found              |
| 500  | Internal server error           |

**Notes:**
- A `healthy: false` response with `status: "running"` indicates the process exists but is unresponsive.
- `last_heartbeat` is `null` when the instance is stopped.

---

## Tasks (Queue)

### List Tasks for Instance

```
GET /api/instances/{id}/tasks
```

**Description:** Returns the task queue for a specific instance. Results are ordered by priority (descending) and then by creation time (ascending).

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The instance ID    |

**Query Parameters:**

| Parameter | Type    | Required | Default | Description                                                  |
|-----------|---------|----------|---------|--------------------------------------------------------------|
| status    | string  | No       | all     | Filter by status: `pending`, `running`, `completed`, `failed`, `cancelled` |
| limit     | integer | No       | 50      | Maximum number of tasks to return (max 200)                  |
| offset    | integer | No       | 0       | Number of tasks to skip for pagination                       |

**Response Body:**

```json
{
  "tasks": [
    {
      "id": 42,
      "instance_id": 1,
      "prompt": "Refactor the authentication module to use JWT tokens",
      "priority": 10,
      "max_turns": 25,
      "status": "running",
      "result": null,
      "error": null,
      "started_at": "2026-02-06T10:00:00Z",
      "completed_at": null,
      "created_at": "2026-02-06T09:55:00Z",
      "updated_at": "2026-02-06T10:00:00Z"
    },
    {
      "id": 43,
      "instance_id": 1,
      "prompt": "Write unit tests for the user service",
      "priority": 5,
      "max_turns": 10,
      "status": "pending",
      "result": null,
      "error": null,
      "started_at": null,
      "completed_at": null,
      "created_at": "2026-02-06T09:58:00Z",
      "updated_at": "2026-02-06T09:58:00Z"
    }
  ],
  "total": 2,
  "limit": 50,
  "offset": 0
}
```

**Status Codes:**

| Code | Description                     |
|------|---------------------------------|
| 200  | Success                         |
| 404  | Instance not found              |
| 422  | Invalid query parameter value   |
| 500  | Internal server error           |

---

### Add Task to Queue

```
POST /api/instances/{id}/tasks
```

**Description:** Adds a new task to the instance's queue. The task enters `pending` status and is picked up automatically when the instance is running and prior tasks are complete.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The instance ID    |

**Request Body:**

```json
{
  "prompt": "Refactor the authentication module to use JWT tokens",
  "priority": 10,
  "max_turns": 25
}
```

| Field     | Type    | Required | Default | Description                                          |
|-----------|---------|----------|---------|------------------------------------------------------|
| prompt    | string  | Yes      | --      | The prompt to send to Claude Code                    |
| priority  | integer | No       | 0       | Higher values are processed first                    |
| max_turns | integer | No       | 10      | Maximum number of conversational turns for this task |

**Response Body:**

```json
{
  "id": 42,
  "instance_id": 1,
  "prompt": "Refactor the authentication module to use JWT tokens",
  "priority": 10,
  "max_turns": 25,
  "status": "pending",
  "result": null,
  "error": null,
  "queue_position": 1,
  "started_at": null,
  "completed_at": null,
  "created_at": "2026-02-06T09:55:00Z",
  "updated_at": "2026-02-06T09:55:00Z"
}
```

**Status Codes:**

| Code | Description                           |
|------|---------------------------------------|
| 201  | Task created and queued successfully  |
| 400  | Invalid request body (empty prompt)   |
| 404  | Instance not found                    |
| 422  | Validation error                      |
| 500  | Internal server error                 |

---

### Update Task

```
PUT /api/tasks/{id}
```

**Description:** Updates a task's prompt, priority, or max_turns. Only tasks in `pending` status can be updated.

**Path Parameters:**

| Parameter | Type    | Description    |
|-----------|---------|----------------|
| id        | integer | The task ID    |

**Request Body:**

```json
{
  "prompt": "Refactor authentication to use JWT tokens with refresh token support",
  "priority": 15,
  "max_turns": 30
}
```

| Field     | Type    | Required | Description                       |
|-----------|---------|----------|-----------------------------------|
| prompt    | string  | No       | Updated task prompt               |
| priority  | integer | No       | Updated priority                  |
| max_turns | integer | No       | Updated maximum turns             |

**Response Body:**

```json
{
  "id": 42,
  "instance_id": 1,
  "prompt": "Refactor authentication to use JWT tokens with refresh token support",
  "priority": 15,
  "max_turns": 30,
  "status": "pending",
  "result": null,
  "error": null,
  "started_at": null,
  "completed_at": null,
  "created_at": "2026-02-06T09:55:00Z",
  "updated_at": "2026-02-06T10:20:00Z"
}
```

**Status Codes:**

| Code | Description                                    |
|------|------------------------------------------------|
| 200  | Task updated successfully                      |
| 400  | Invalid request body                           |
| 404  | Task not found                                 |
| 409  | Task is not in `pending` status and cannot be updated |
| 422  | Validation error                               |
| 500  | Internal server error                          |

---

### Cancel / Remove Task

```
DELETE /api/tasks/{id}
```

**Description:** Cancels a pending task or removes a completed/failed task from the queue. A task in `running` status cannot be deleted; stop the instance first.

**Path Parameters:**

| Parameter | Type    | Description    |
|-----------|---------|----------------|
| id        | integer | The task ID    |

**Response Body:**

```json
{
  "message": "Task cancelled successfully",
  "id": 42,
  "previous_status": "pending"
}
```

**Status Codes:**

| Code | Description                                   |
|------|-----------------------------------------------|
| 200  | Task cancelled/removed successfully           |
| 404  | Task not found                                |
| 409  | Task is currently running and cannot be deleted |
| 500  | Internal server error                         |

---

### Retry Failed Task

```
POST /api/tasks/{id}/retry
```

**Description:** Re-queues a task that previously failed. The task is reset to `pending` status with its original prompt and settings. Only tasks in `failed` status can be retried.

**Path Parameters:**

| Parameter | Type    | Description    |
|-----------|---------|----------------|
| id        | integer | The task ID    |

**Request Body:** None.

**Response Body:**

```json
{
  "id": 42,
  "instance_id": 1,
  "prompt": "Refactor the authentication module to use JWT tokens",
  "priority": 10,
  "max_turns": 25,
  "status": "pending",
  "result": null,
  "error": null,
  "retry_count": 1,
  "started_at": null,
  "completed_at": null,
  "created_at": "2026-02-06T09:55:00Z",
  "updated_at": "2026-02-06T10:30:00Z"
}
```

**Status Codes:**

| Code | Description                               |
|------|-------------------------------------------|
| 200  | Task re-queued successfully               |
| 404  | Task not found                            |
| 409  | Task is not in `failed` status            |
| 500  | Internal server error                     |

---

### Reorder Task Queue

```
POST /api/instances/{id}/tasks/reorder
```

**Description:** Sets the processing order for all pending tasks in an instance's queue. Provide an ordered list of task IDs; the position in the array determines the execution order. All pending task IDs for the instance must be included.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The instance ID    |

**Request Body:**

```json
{
  "task_ids": [45, 43, 44, 42]
}
```

| Field    | Type           | Required | Description                                        |
|----------|----------------|----------|----------------------------------------------------|
| task_ids | array[integer] | Yes      | Ordered list of all pending task IDs for the instance |

**Response Body:**

```json
{
  "message": "Task queue reordered successfully",
  "instance_id": 1,
  "order": [45, 43, 44, 42]
}
```

**Status Codes:**

| Code | Description                                                        |
|------|--------------------------------------------------------------------|
| 200  | Queue reordered successfully                                       |
| 400  | Invalid request body (missing or empty task_ids)                   |
| 404  | Instance not found                                                 |
| 422  | task_ids list does not match the set of pending tasks for the instance |
| 500  | Internal server error                                              |

**Notes:**
- Only `pending` tasks are reordered. Running, completed, failed, and cancelled tasks are ignored.
- Every pending task for the instance must appear exactly once in `task_ids`.

---

### Bulk Add Tasks

```
POST /api/instances/{id}/tasks/bulk
```

**Description:** Adds multiple tasks to an instance's queue in a single request. Tasks are queued in the order provided.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The instance ID    |

**Request Body:**

```json
{
  "tasks": [
    {
      "prompt": "Add input validation to all API endpoints",
      "priority": 5,
      "max_turns": 15
    },
    {
      "prompt": "Write integration tests for the payment module",
      "priority": 3,
      "max_turns": 20
    },
    {
      "prompt": "Update README with new environment variables",
      "priority": 1
    }
  ]
}
```

| Field  | Type  | Required | Description                              |
|--------|-------|----------|------------------------------------------|
| tasks  | array | Yes      | Array of task objects                    |
| tasks[].prompt    | string  | Yes | The prompt for the task             |
| tasks[].priority  | integer | No  | Priority (default: 0)              |
| tasks[].max_turns | integer | No  | Maximum turns (default: 10)        |

**Response Body:**

```json
{
  "created": [
    {
      "id": 50,
      "instance_id": 1,
      "prompt": "Add input validation to all API endpoints",
      "priority": 5,
      "max_turns": 15,
      "status": "pending",
      "created_at": "2026-02-06T10:35:00Z"
    },
    {
      "id": 51,
      "instance_id": 1,
      "prompt": "Write integration tests for the payment module",
      "priority": 3,
      "max_turns": 20,
      "status": "pending",
      "created_at": "2026-02-06T10:35:00Z"
    },
    {
      "id": 52,
      "instance_id": 1,
      "prompt": "Update README with new environment variables",
      "priority": 1,
      "max_turns": 10,
      "status": "pending",
      "created_at": "2026-02-06T10:35:00Z"
    }
  ],
  "total_created": 3
}
```

**Status Codes:**

| Code | Description                                      |
|------|--------------------------------------------------|
| 201  | All tasks created successfully                   |
| 400  | Invalid request body (empty array or missing prompts) |
| 404  | Instance not found                               |
| 422  | Validation error on one or more tasks            |
| 500  | Internal server error                            |

**Notes:**
- The operation is atomic: if any task in the array fails validation, none are created.
- Maximum of 100 tasks per bulk request.

---

## Schedules

### List Schedules

```
GET /api/instances/{id}/schedules
```

**Description:** Returns all scheduled jobs for a specific instance.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The instance ID    |

**Response Body:**

```json
[
  {
    "id": 1,
    "instance_id": 1,
    "cron_expression": "0 9 * * 1-5",
    "prompt_template": "Run the test suite and report any failures",
    "is_active": true,
    "last_run_at": "2026-02-05T09:00:00Z",
    "next_run_at": "2026-02-06T09:00:00Z",
    "created_at": "2026-01-20T12:00:00Z",
    "updated_at": "2026-02-05T09:00:00Z"
  }
]
```

**Status Codes:**

| Code | Description                     |
|------|---------------------------------|
| 200  | Success                         |
| 404  | Instance not found              |
| 500  | Internal server error           |

---

### Create Schedule

```
POST /api/instances/{id}/schedules
```

**Description:** Creates a new scheduled job for an instance. When a schedule triggers, a new task is automatically created from the `prompt_template` and added to the instance's queue.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The instance ID    |

**Request Body:**

```json
{
  "cron_expression": "0 9 * * 1-5",
  "prompt_template": "Run the test suite and report any failures",
  "is_active": true
}
```

| Field           | Type    | Required | Default | Description                                             |
|-----------------|---------|----------|---------|---------------------------------------------------------|
| cron_expression | string  | Yes      | --      | Standard cron expression (minute hour day month weekday) |
| prompt_template | string  | Yes      | --      | Prompt text used to create the task when triggered      |
| is_active       | boolean | No       | true    | Whether the schedule is active immediately              |

**Response Body:**

```json
{
  "id": 1,
  "instance_id": 1,
  "cron_expression": "0 9 * * 1-5",
  "prompt_template": "Run the test suite and report any failures",
  "is_active": true,
  "last_run_at": null,
  "next_run_at": "2026-02-06T09:00:00Z",
  "created_at": "2026-02-06T08:00:00Z",
  "updated_at": "2026-02-06T08:00:00Z"
}
```

**Status Codes:**

| Code | Description                                           |
|------|-------------------------------------------------------|
| 201  | Schedule created successfully                         |
| 400  | Invalid request body                                  |
| 404  | Instance not found                                    |
| 422  | Validation error (e.g., invalid cron expression)      |
| 500  | Internal server error                                 |

**Notes:**
- Cron expressions use the standard five-field format: `minute hour day-of-month month day-of-week`.
- The `next_run_at` field is computed automatically from the `cron_expression`.

---

### Update Schedule

```
PUT /api/schedules/{id}
```

**Description:** Updates an existing schedule's cron expression, prompt template, or active state.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The schedule ID    |

**Request Body:**

```json
{
  "cron_expression": "0 */6 * * *",
  "prompt_template": "Run the full test suite, lint check, and report results",
  "is_active": true
}
```

| Field           | Type    | Required | Description                        |
|-----------------|---------|----------|------------------------------------|
| cron_expression | string  | No       | Updated cron expression            |
| prompt_template | string  | No       | Updated prompt template            |
| is_active       | boolean | No       | Updated active state               |

**Response Body:**

```json
{
  "id": 1,
  "instance_id": 1,
  "cron_expression": "0 */6 * * *",
  "prompt_template": "Run the full test suite, lint check, and report results",
  "is_active": true,
  "last_run_at": "2026-02-05T09:00:00Z",
  "next_run_at": "2026-02-06T12:00:00Z",
  "created_at": "2026-01-20T12:00:00Z",
  "updated_at": "2026-02-06T11:00:00Z"
}
```

**Status Codes:**

| Code | Description                                      |
|------|--------------------------------------------------|
| 200  | Schedule updated successfully                    |
| 400  | Invalid request body                             |
| 404  | Schedule not found                               |
| 422  | Validation error (e.g., invalid cron expression) |
| 500  | Internal server error                            |

---

### Remove Schedule

```
DELETE /api/schedules/{id}
```

**Description:** Permanently removes a scheduled job. Any tasks already created by this schedule remain in the queue unaffected.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The schedule ID    |

**Response Body:**

```json
{
  "message": "Schedule deleted successfully",
  "id": 1
}
```

**Status Codes:**

| Code | Description                     |
|------|---------------------------------|
| 200  | Schedule deleted successfully   |
| 404  | Schedule not found              |
| 500  | Internal server error           |

---

### Toggle Schedule

```
POST /api/schedules/{id}/toggle
```

**Description:** Toggles a schedule between active and inactive states. If the schedule is currently active, it becomes inactive, and vice versa.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The schedule ID    |

**Request Body:** None.

**Response Body:**

```json
{
  "id": 1,
  "is_active": false,
  "next_run_at": null,
  "updated_at": "2026-02-06T11:30:00Z"
}
```

**Status Codes:**

| Code | Description                     |
|------|---------------------------------|
| 200  | Schedule toggled successfully   |
| 404  | Schedule not found              |
| 500  | Internal server error           |

**Notes:**
- When a schedule is deactivated, `next_run_at` is set to `null`.
- When reactivated, `next_run_at` is recalculated from the `cron_expression`.

---

## Usage & Analytics

### Aggregated Usage Summary

```
GET /api/usage/summary
```

**Description:** Returns aggregated usage statistics across all projects and instances.

**Query Parameters:**

| Parameter  | Type   | Required | Default     | Description                                   |
|------------|--------|----------|-------------|-----------------------------------------------|
| start_date | string | No       | 30 days ago | Start of the reporting period (ISO 8601 date) |
| end_date   | string | No       | today       | End of the reporting period (ISO 8601 date)   |

**Response Body:**

```json
{
  "period": {
    "start_date": "2026-01-07",
    "end_date": "2026-02-06"
  },
  "total_tasks": 1250,
  "completed_tasks": 1100,
  "failed_tasks": 80,
  "cancelled_tasks": 70,
  "total_tokens_used": 5842000,
  "total_input_tokens": 2100000,
  "total_output_tokens": 3742000,
  "average_task_duration_seconds": 45.2,
  "total_cost_usd": 87.63,
  "active_projects": 5,
  "active_instances": 12
}
```

**Status Codes:**

| Code | Description                            |
|------|----------------------------------------|
| 200  | Success                                |
| 422  | Invalid date format in query params    |
| 500  | Internal server error                  |

---

### Usage by Project

```
GET /api/usage/by-project
```

**Description:** Returns usage statistics broken down by project.

**Query Parameters:**

| Parameter  | Type   | Required | Default     | Description                                   |
|------------|--------|----------|-------------|-----------------------------------------------|
| start_date | string | No       | 30 days ago | Start of the reporting period (ISO 8601 date) |
| end_date   | string | No       | today       | End of the reporting period (ISO 8601 date)   |

**Response Body:**

```json
[
  {
    "project_id": 1,
    "project_name": "my-project",
    "total_tasks": 500,
    "completed_tasks": 450,
    "failed_tasks": 30,
    "cancelled_tasks": 20,
    "total_tokens_used": 2300000,
    "total_input_tokens": 800000,
    "total_output_tokens": 1500000,
    "average_task_duration_seconds": 42.1,
    "total_cost_usd": 34.50,
    "instance_count": 3
  },
  {
    "project_id": 2,
    "project_name": "frontend-app",
    "total_tasks": 750,
    "completed_tasks": 650,
    "failed_tasks": 50,
    "cancelled_tasks": 50,
    "total_tokens_used": 3542000,
    "total_input_tokens": 1300000,
    "total_output_tokens": 2242000,
    "average_task_duration_seconds": 48.3,
    "total_cost_usd": 53.13,
    "instance_count": 9
  }
]
```

**Status Codes:**

| Code | Description                            |
|------|----------------------------------------|
| 200  | Success                                |
| 422  | Invalid date format in query params    |
| 500  | Internal server error                  |

---

### Usage by Instance

```
GET /api/usage/by-instance
```

**Description:** Returns usage statistics broken down by individual instance.

**Query Parameters:**

| Parameter  | Type    | Required | Default     | Description                                   |
|------------|---------|----------|-------------|-----------------------------------------------|
| start_date | string  | No       | 30 days ago | Start of the reporting period (ISO 8601 date) |
| end_date   | string  | No       | today       | End of the reporting period (ISO 8601 date)   |
| project_id | integer | No       | all         | Filter to instances within a specific project |

**Response Body:**

```json
[
  {
    "instance_id": 1,
    "instance_name": "backend-worker-1",
    "project_id": 1,
    "project_name": "my-project",
    "total_tasks": 200,
    "completed_tasks": 185,
    "failed_tasks": 10,
    "cancelled_tasks": 5,
    "total_tokens_used": 950000,
    "total_input_tokens": 350000,
    "total_output_tokens": 600000,
    "average_task_duration_seconds": 38.7,
    "total_cost_usd": 14.25,
    "uptime_hours": 720.5
  }
]
```

**Status Codes:**

| Code | Description                            |
|------|----------------------------------------|
| 200  | Success                                |
| 404  | Project not found (if project_id given)|
| 422  | Invalid date format in query params    |
| 500  | Internal server error                  |

---

### Usage Timeline

```
GET /api/usage/timeline
```

**Description:** Returns time-series usage data for charting and trend analysis. Each data point represents aggregated statistics for a single time bucket.

**Query Parameters:**

| Parameter   | Type   | Required | Default     | Description                                              |
|-------------|--------|----------|-------------|----------------------------------------------------------|
| start_date  | string | No       | 30 days ago | Start of the reporting period (ISO 8601 date)            |
| end_date    | string | No       | today       | End of the reporting period (ISO 8601 date)              |
| granularity | string | No       | "day"       | Time bucket size: `hour`, `day`, `week`, `month`         |
| project_id  | integer| No       | all         | Filter to a specific project                             |
| instance_id | integer| No       | all         | Filter to a specific instance                            |

**Response Body:**

```json
{
  "period": {
    "start_date": "2026-01-07",
    "end_date": "2026-02-06",
    "granularity": "day"
  },
  "data_points": [
    {
      "timestamp": "2026-01-07T00:00:00Z",
      "tasks_completed": 35,
      "tasks_failed": 2,
      "tokens_used": 180000,
      "input_tokens": 65000,
      "output_tokens": 115000,
      "cost_usd": 2.70,
      "average_task_duration_seconds": 41.5
    },
    {
      "timestamp": "2026-01-08T00:00:00Z",
      "tasks_completed": 42,
      "tasks_failed": 3,
      "tokens_used": 210000,
      "input_tokens": 78000,
      "output_tokens": 132000,
      "cost_usd": 3.15,
      "average_task_duration_seconds": 44.2
    }
  ]
}
```

**Status Codes:**

| Code | Description                                       |
|------|---------------------------------------------------|
| 200  | Success                                           |
| 404  | Project or instance not found (if IDs are given)  |
| 422  | Invalid date format or unsupported granularity    |
| 500  | Internal server error                             |

**Notes:**
- The maximum date range is 365 days.
- When `granularity` is `hour`, the maximum date range is reduced to 7 days.
- Data points with zero activity are still included in the response to maintain consistent time-series intervals.

---

## SSH Configs

### List SSH Configurations

```
GET /api/ssh-configs
```

**Description:** Returns all stored SSH configurations used for remote instance connections.

**Response Body:**

```json
[
  {
    "id": 1,
    "name": "production-server",
    "host": "prod.example.com",
    "port": 22,
    "username": "deploy",
    "key_path": "/home/user/.ssh/id_ed25519",
    "created_at": "2026-01-10T14:00:00Z",
    "updated_at": "2026-01-10T14:00:00Z"
  }
]
```

**Status Codes:**

| Code | Description            |
|------|------------------------|
| 200  | Success                |
| 500  | Internal server error  |

---

### Add SSH Config

```
POST /api/ssh-configs
```

**Description:** Creates a new SSH configuration entry.

**Request Body:**

```json
{
  "name": "production-server",
  "host": "prod.example.com",
  "port": 22,
  "username": "deploy",
  "key_path": "/home/user/.ssh/id_ed25519"
}
```

| Field    | Type    | Required | Default | Description                        |
|----------|---------|----------|---------|------------------------------------|
| name     | string  | Yes      | --      | Human-readable name for this config |
| host     | string  | Yes      | --      | Hostname or IP address             |
| port     | integer | No       | 22      | SSH port                           |
| username | string  | Yes      | --      | SSH username                       |
| key_path | string  | Yes      | --      | Absolute path to the private key file |

**Response Body:**

```json
{
  "id": 1,
  "name": "production-server",
  "host": "prod.example.com",
  "port": 22,
  "username": "deploy",
  "key_path": "/home/user/.ssh/id_ed25519",
  "created_at": "2026-01-10T14:00:00Z",
  "updated_at": "2026-01-10T14:00:00Z"
}
```

**Status Codes:**

| Code | Description                                        |
|------|----------------------------------------------------|
| 201  | SSH config created successfully                    |
| 400  | Invalid request body                               |
| 409  | An SSH config with this name already exists        |
| 422  | Validation error (e.g., key_path does not exist)   |
| 500  | Internal server error                              |

---

### Update SSH Config

```
PUT /api/ssh-configs/{id}
```

**Description:** Updates an existing SSH configuration. Only provided fields are updated.

**Path Parameters:**

| Parameter | Type    | Description          |
|-----------|---------|----------------------|
| id        | integer | The SSH config ID    |

**Request Body:**

```json
{
  "name": "production-server-v2",
  "host": "prod-new.example.com",
  "port": 2222,
  "username": "deploy",
  "key_path": "/home/user/.ssh/id_rsa"
}
```

| Field    | Type    | Required | Description            |
|----------|---------|----------|------------------------|
| name     | string  | No       | Updated name           |
| host     | string  | No       | Updated hostname       |
| port     | integer | No       | Updated port           |
| username | string  | No       | Updated username       |
| key_path | string  | No       | Updated key path       |

**Response Body:**

```json
{
  "id": 1,
  "name": "production-server-v2",
  "host": "prod-new.example.com",
  "port": 2222,
  "username": "deploy",
  "key_path": "/home/user/.ssh/id_rsa",
  "created_at": "2026-01-10T14:00:00Z",
  "updated_at": "2026-02-06T12:00:00Z"
}
```

**Status Codes:**

| Code | Description                                      |
|------|--------------------------------------------------|
| 200  | SSH config updated successfully                  |
| 400  | Invalid request body                             |
| 404  | SSH config not found                             |
| 409  | Name conflict with another SSH config            |
| 422  | Validation error                                 |
| 500  | Internal server error                            |

---

### Remove SSH Config

```
DELETE /api/ssh-configs/{id}
```

**Description:** Permanently removes an SSH configuration. Fails if any instances are currently using this configuration.

**Path Parameters:**

| Parameter | Type    | Description          |
|-----------|---------|----------------------|
| id        | integer | The SSH config ID    |

**Response Body:**

```json
{
  "message": "SSH config deleted successfully",
  "id": 1
}
```

**Status Codes:**

| Code | Description                                                    |
|------|----------------------------------------------------------------|
| 200  | SSH config deleted successfully                                |
| 404  | SSH config not found                                           |
| 409  | SSH config is in use by one or more instances and cannot be deleted |
| 500  | Internal server error                                          |

---

### Test SSH Connection

```
POST /api/ssh-configs/{id}/test
```

**Description:** Attempts to establish an SSH connection using the stored configuration and reports the result. The connection is closed immediately after the test.

**Path Parameters:**

| Parameter | Type    | Description          |
|-----------|---------|----------------------|
| id        | integer | The SSH config ID    |

**Request Body:** None.

**Response Body (success):**

```json
{
  "id": 1,
  "name": "production-server",
  "success": true,
  "message": "SSH connection established successfully",
  "latency_ms": 145,
  "tested_at": "2026-02-06T12:05:00Z"
}
```

**Response Body (failure):**

```json
{
  "id": 1,
  "name": "production-server",
  "success": false,
  "message": "Connection refused: unable to reach host prod.example.com on port 22",
  "latency_ms": null,
  "tested_at": "2026-02-06T12:05:00Z"
}
```

**Status Codes:**

| Code | Description                                         |
|------|-----------------------------------------------------|
| 200  | Test completed (check `success` field for result)   |
| 404  | SSH config not found                                |
| 500  | Internal server error                               |

**Notes:**
- A 200 status code is returned regardless of whether the SSH connection succeeds or fails. The `success` field in the response body indicates the actual connection result.

---

## WebSocket Endpoints

### Instance Live Output Stream

```
WS /ws/instance/{id}/stream
```

**Description:** Opens a WebSocket connection that streams real-time output from a specific Claude Code instance. This includes task progress, Claude's responses, tool usage, and status transitions.

**Path Parameters:**

| Parameter | Type    | Description        |
|-----------|---------|--------------------|
| id        | integer | The instance ID    |

**Connection URL Example:**

```
ws://localhost:8000/ws/instance/1/stream
```

**Server-Sent Message Types:**

Output message (Claude Code stdout):

```json
{
  "type": "output",
  "instance_id": 1,
  "task_id": 42,
  "content": "I'll start by examining the authentication module...",
  "timestamp": "2026-02-06T10:15:30Z"
}
```

Status change message:

```json
{
  "type": "status_change",
  "instance_id": 1,
  "previous_status": "stopped",
  "new_status": "running",
  "timestamp": "2026-02-06T10:15:00Z"
}
```

Task lifecycle message:

```json
{
  "type": "task_update",
  "instance_id": 1,
  "task_id": 42,
  "task_status": "completed",
  "result_summary": "Refactored authentication module to use JWT tokens. Modified 5 files.",
  "timestamp": "2026-02-06T10:20:00Z"
}
```

Error message:

```json
{
  "type": "error",
  "instance_id": 1,
  "task_id": 42,
  "message": "Process exited unexpectedly with code 1",
  "timestamp": "2026-02-06T10:20:00Z"
}
```

Heartbeat message (sent every 30 seconds):

```json
{
  "type": "heartbeat",
  "instance_id": 1,
  "timestamp": "2026-02-06T10:15:30Z"
}
```

**Client-Sent Messages:**

Clients may not send messages on this connection. It is a read-only stream.

**Close Codes:**

| Code | Description                          |
|------|--------------------------------------|
| 1000 | Normal closure (client disconnected) |
| 1008 | Instance not found                   |
| 1011 | Unexpected server error              |

**Notes:**
- The WebSocket connection remains open as long as the client stays connected, regardless of instance state.
- If the instance is stopped, the connection stays open and will resume streaming when the instance starts again.
- Heartbeat messages are sent every 30 seconds to keep the connection alive and detect stale clients.

---

### Dashboard Global Status Updates

```
WS /ws/dashboard
```

**Description:** Opens a WebSocket connection that broadcasts status updates for all instances across all projects. Useful for rendering a real-time dashboard overview.

**Connection URL Example:**

```
ws://localhost:8000/ws/dashboard
```

**Server-Sent Message Types:**

Instance status update:

```json
{
  "type": "instance_status",
  "instance_id": 1,
  "instance_name": "backend-worker-1",
  "project_id": 1,
  "project_name": "my-project",
  "status": "running",
  "current_task_id": 42,
  "tasks_pending": 3,
  "tasks_completed_today": 15,
  "timestamp": "2026-02-06T10:15:00Z"
}
```

Task completion notification:

```json
{
  "type": "task_completed",
  "instance_id": 1,
  "instance_name": "backend-worker-1",
  "project_id": 1,
  "project_name": "my-project",
  "task_id": 42,
  "task_prompt_preview": "Refactor the authentication module...",
  "duration_seconds": 120,
  "tokens_used": 15000,
  "timestamp": "2026-02-06T10:17:00Z"
}
```

Task failure notification:

```json
{
  "type": "task_failed",
  "instance_id": 1,
  "instance_name": "backend-worker-1",
  "project_id": 1,
  "project_name": "my-project",
  "task_id": 43,
  "task_prompt_preview": "Write integration tests for...",
  "error": "Max turns exceeded without completing the task",
  "timestamp": "2026-02-06T10:19:00Z"
}
```

System alert:

```json
{
  "type": "system_alert",
  "severity": "warning",
  "message": "Instance backend-worker-1 is unresponsive (no heartbeat for 60 seconds)",
  "instance_id": 1,
  "timestamp": "2026-02-06T10:20:00Z"
}
```

Heartbeat message (sent every 30 seconds):

```json
{
  "type": "heartbeat",
  "active_instances": 12,
  "total_pending_tasks": 45,
  "timestamp": "2026-02-06T10:15:30Z"
}
```

**Client-Sent Messages:**

Clients may not send messages on this connection. It is a read-only stream.

**Close Codes:**

| Code | Description                          |
|------|--------------------------------------|
| 1000 | Normal closure (client disconnected) |
| 1011 | Unexpected server error              |

**Notes:**
- Only high-level status events are broadcast. For detailed instance output, use the instance-specific stream at `/ws/instance/{id}/stream`.
- The `task_prompt_preview` field is truncated to the first 80 characters of the original prompt.
- Heartbeat messages include a snapshot of the current global state.

---

## Common Error Format

All error responses follow a consistent JSON structure:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Instance with ID 99 not found",
    "details": null
  }
}
```

| Field              | Type        | Description                                        |
|--------------------|-------------|----------------------------------------------------|
| error.code         | string      | Machine-readable error code                        |
| error.message      | string      | Human-readable error description                   |
| error.details      | object/null | Additional context (validation errors, constraints) |

**Validation Error Example (422):**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body failed validation",
    "details": {
      "fields": {
        "cron_expression": "Invalid cron expression: expected 5 fields, got 3",
        "prompt_template": "This field is required"
      }
    }
  }
}
```

**Standard Error Codes:**

| Code                | HTTP Status | Description                                      |
|---------------------|-------------|--------------------------------------------------|
| BAD_REQUEST         | 400         | Malformed or unreadable request body             |
| NOT_FOUND           | 404         | Requested resource does not exist                |
| CONFLICT            | 409         | Operation conflicts with current resource state  |
| VALIDATION_ERROR    | 422         | Request body fails schema or business validation |
| INTERNAL_ERROR      | 500         | Unexpected server-side failure                   |
