# WebSocket Protocol Specification

## Table of Contents

- [Overview](#overview)
- [Endpoints](#endpoints)
- [Message Format](#message-format)
- [Message Types](#message-types)
- [Connection Management](#connection-management)
- [Frontend Integration](#frontend-integration)
- [Backend Implementation](#backend-implementation)
- [Error Handling](#error-handling)

---

## Overview

The Claude Orchestrator uses WebSocket connections to provide real-time, bidirectional communication between the frontend dashboard and the backend orchestration layer. This eliminates the need for polling and ensures that live terminal output, instance status changes, queue updates, and usage metrics are delivered to the UI with minimal latency.

Two distinct WebSocket endpoints serve different purposes:

1. **Instance Stream** -- delivers live stdout/stderr output for a single Claude Code instance, suitable for rendering in an xterm.js terminal emulator.
2. **Dashboard Feed** -- broadcasts aggregated status updates, queue changes, and usage metrics across all managed instances.

Both endpoints share the same JSON message envelope and authentication mechanism. Clients subscribe to the events they need and receive a continuous stream of typed messages.

---

## Endpoints

### `/ws/instance/{id}/stream`

Live output stream for a specific Claude Code instance.

| Property         | Value                                      |
| ---------------- | ------------------------------------------ |
| **Path**         | `/ws/instance/{id}/stream`                 |
| **Path Params**  | `id` -- UUID of the Claude Code instance   |
| **Auth**         | `CF_Authorization` cookie                  |
| **Purpose**      | Stream real-time terminal output and status |
| **Typical consumer** | Instance detail page with xterm.js terminal |

**Example connection URL:**

```
wss://orchestrator.example.com/ws/instance/a3f1b2c4-5678-9def-ghij-klmnopqrstuv/stream
```

**Events emitted on this endpoint:**

- `output` -- every line written to stdout or stderr by the Claude Code process
- `status` -- instance status transitions (idle, running, paused, error, offline)
- `task_complete` -- the currently running task has finished
- `error` -- an error specific to this instance

---

### `/ws/dashboard`

Global status updates for all instances managed by the orchestrator.

| Property         | Value                                         |
| ---------------- | --------------------------------------------- |
| **Path**         | `/ws/dashboard`                               |
| **Auth**         | `CF_Authorization` cookie                     |
| **Purpose**      | Aggregate status feed for the dashboard view  |
| **Typical consumer** | Main dashboard showing all instances at once |

**Example connection URL:**

```
wss://orchestrator.example.com/ws/dashboard
```

**Events emitted on this endpoint:**

- `status` -- status change for any instance
- `queue_update` -- the global task queue has changed
- `task_complete` -- any task across any instance has finished
- `usage_update` -- periodic usage metrics rollup
- `error` -- system-level errors

---

## Message Format

All messages exchanged over WebSocket connections are UTF-8 encoded JSON strings. Every message conforms to one of two envelopes depending on direction.

### Client to Server Messages

```typescript
interface WSClientMessage {
  type: "subscribe" | "unsubscribe" | "ping";
  instance_id?: string;
}
```

| Field         | Type     | Required | Description                                                       |
| ------------- | -------- | -------- | ----------------------------------------------------------------- |
| `type`        | `string` | Yes      | The action the client wants to perform.                           |
| `instance_id` | `string` | No       | Target instance UUID. Required for `subscribe` and `unsubscribe`. |

**Examples:**

```json
{ "type": "subscribe", "instance_id": "a3f1b2c4-5678-9def-ghij-klmnopqrstuv" }
```

```json
{ "type": "unsubscribe", "instance_id": "a3f1b2c4-5678-9def-ghij-klmnopqrstuv" }
```

```json
{ "type": "ping" }
```

### Server to Client Messages

```typescript
interface WSServerMessage {
  type: "output" | "status" | "queue_update" | "task_complete" | "error" | "usage_update" | "pong";
  instance_id: string;
  timestamp: string;
  data: any;
}
```

| Field         | Type     | Required | Description                                                              |
| ------------- | -------- | -------- | ------------------------------------------------------------------------ |
| `type`        | `string` | Yes      | Discriminator for the message payload.                                   |
| `instance_id` | `string` | Yes      | The instance this message relates to. Empty string for system messages.   |
| `timestamp`   | `string` | Yes      | ISO 8601 timestamp of when the event occurred (e.g. `2026-02-06T14:30:00.123Z`). |
| `data`        | `any`    | Yes      | Payload whose shape depends on `type`. See [Message Types](#message-types). |

**Example:**

```json
{
  "type": "output",
  "instance_id": "a3f1b2c4-5678-9def-ghij-klmnopqrstuv",
  "timestamp": "2026-02-06T14:30:00.123Z",
  "data": {
    "task_id": "task-0042",
    "line": "Reading file src/index.ts...",
    "stream": "stdout"
  }
}
```

---

## Message Types

### a. OutputMessage -- Live Terminal Output Line

Emitted every time the Claude Code process writes a line to stdout or stderr. These messages drive the xterm.js terminal display in the frontend.

```typescript
interface OutputMessage {
  type: "output";
  instance_id: string;
  task_id: string;
  line: string;           // Raw line from Claude Code stdout
  stream: "stdout" | "stderr";
}
```

| Field         | Type                       | Description                                          |
| ------------- | -------------------------- | ---------------------------------------------------- |
| `type`        | `"output"`                 | Literal discriminator.                               |
| `instance_id` | `string`                   | UUID of the Claude Code instance producing output.   |
| `task_id`     | `string`                   | Identifier of the task currently being executed.     |
| `line`        | `string`                   | A single line of raw output from the process. May contain ANSI escape codes for color. |
| `stream`      | `"stdout"` or `"stderr"`   | Which output stream the line originated from.        |

**Full wire-format example:**

```json
{
  "type": "output",
  "instance_id": "a3f1b2c4-5678-9def-ghij-klmnopqrstuv",
  "timestamp": "2026-02-06T14:30:00.456Z",
  "data": {
    "task_id": "task-0042",
    "line": "\u001b[32m✓\u001b[0m File updated successfully: src/components/Header.tsx",
    "stream": "stdout"
  }
}
```

**Notes:**

- Lines may contain ANSI escape sequences. The frontend xterm.js terminal handles rendering these natively.
- Lines are newline-delimited. The `line` field does not include the trailing `\n`.
- Output is streamed as it arrives. There is no buffering or batching on the server side.

---

### b. StatusMessage -- Instance Status Change

Emitted whenever a Claude Code instance transitions between states. The frontend uses these messages to update status indicators, enable/disable controls, and trigger animations.

```typescript
interface StatusMessage {
  type: "status";
  instance_id: string;
  status: "idle" | "running" | "paused" | "error" | "offline";
  current_task_id?: string;
}
```

| Field             | Type     | Description                                                        |
| ----------------- | -------- | ------------------------------------------------------------------ |
| `type`            | `"status"` | Literal discriminator.                                           |
| `instance_id`     | `string`   | UUID of the instance whose status changed.                       |
| `status`          | `string`   | New status value. One of the five defined states.                |
| `current_task_id` | `string?`  | Present only when `status` is `"running"`. The active task UUID. |

**State machine:**

```
        ┌─────────┐
        │ offline │
        └────┬────┘
             │ instance registers
             v
        ┌─────────┐  assign task   ┌─────────┐
        │  idle   │───────────────>│ running │
        └─────────┘                └────┬────┘
             ^                          │
             │ task completes            │ pause requested
             │                          v
             │                     ┌─────────┐
             │                     │ paused  │
             │                     └────┬────┘
             │                          │ resume
             │                          │
             └──────────────────────────┘
                                        │
                                        │ unrecoverable error
                                        v
                                   ┌─────────┐
                                   │  error  │
                                   └─────────┘
```

**Full wire-format example:**

```json
{
  "type": "status",
  "instance_id": "a3f1b2c4-5678-9def-ghij-klmnopqrstuv",
  "timestamp": "2026-02-06T14:30:01.000Z",
  "data": {
    "status": "running",
    "current_task_id": "task-0042"
  }
}
```

---

### c. TaskCompleteMessage -- Task Finished

Emitted when a task finishes execution, whether it completed successfully or failed. Contains a short preview of the result and usage metrics for cost tracking.

```typescript
interface TaskCompleteMessage {
  type: "task_complete";
  instance_id: string;
  task_id: string;
  status: "completed" | "failed";
  result_preview: string;  // First 200 chars of the result
  usage: {
    tokens_in: number;
    tokens_out: number;
    cost_estimate: number;
  };
}
```

| Field            | Type     | Description                                                          |
| ---------------- | -------- | -------------------------------------------------------------------- |
| `type`           | `"task_complete"` | Literal discriminator.                                      |
| `instance_id`    | `string`   | UUID of the instance that executed the task.                       |
| `task_id`        | `string`   | UUID of the completed task.                                        |
| `status`         | `string`   | Either `"completed"` for success or `"failed"` for failure.        |
| `result_preview` | `string`   | First 200 characters of the task result. Truncated with `...` if longer. |
| `usage`          | `object`   | Token counts and estimated cost in USD for this task execution.    |

**Full wire-format example:**

```json
{
  "type": "task_complete",
  "instance_id": "a3f1b2c4-5678-9def-ghij-klmnopqrstuv",
  "timestamp": "2026-02-06T14:35:22.789Z",
  "data": {
    "task_id": "task-0042",
    "status": "completed",
    "result_preview": "Successfully refactored the Header component to use the new design system tokens. Updated 3 files: src/components/Header.tsx, src/components/Header.test.tsx, src/styles/header.module.css...",
    "usage": {
      "tokens_in": 12450,
      "tokens_out": 3280,
      "cost_estimate": 0.0743
    }
  }
}
```

---

### d. QueueUpdateMessage -- Queue Changed

Emitted when tasks are added to, removed from, or reordered within the global task queue. Sent exclusively on the `/ws/dashboard` endpoint.

```typescript
interface QueueUpdateMessage {
  type: "queue_update";
  queue_length: number;
  queue_snapshot: Array<{
    task_id: string;
    instance_id: string | null;   // null if unassigned
    priority: number;
    prompt_preview: string;       // First 100 chars of the prompt
    status: "queued" | "assigned" | "running";
  }>;
}
```

| Field            | Type     | Description                                                |
| ---------------- | -------- | ---------------------------------------------------------- |
| `type`           | `"queue_update"` | Literal discriminator.                             |
| `queue_length`   | `number` | Total number of tasks currently in the queue.              |
| `queue_snapshot` | `array`  | Ordered list of queued tasks with summary information.     |

**Full wire-format example:**

```json
{
  "type": "queue_update",
  "instance_id": "",
  "timestamp": "2026-02-06T14:31:00.000Z",
  "data": {
    "queue_length": 3,
    "queue_snapshot": [
      {
        "task_id": "task-0043",
        "instance_id": null,
        "priority": 1,
        "prompt_preview": "Add unit tests for the authentication middleware...",
        "status": "queued"
      },
      {
        "task_id": "task-0044",
        "instance_id": "b4e2c3d5-6789-0abc-defg-hijklmnopqrs",
        "priority": 2,
        "prompt_preview": "Refactor the database connection pool to support...",
        "status": "assigned"
      },
      {
        "task_id": "task-0045",
        "instance_id": null,
        "priority": 3,
        "prompt_preview": "Update the README with the new API endpoints...",
        "status": "queued"
      }
    ]
  }
}
```

---

### e. ErrorMessage -- Error Occurred

Emitted when an error occurs that the client should be aware of. May be instance-specific or system-wide.

```typescript
interface ErrorMessage {
  type: "error";
  instance_id: string;       // Empty string for system-level errors
  error_code: string;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
}
```

| Field         | Type      | Description                                                        |
| ------------- | --------- | ------------------------------------------------------------------ |
| `type`        | `"error"` | Literal discriminator.                                             |
| `instance_id` | `string`  | Instance UUID, or empty string for system-level errors.            |
| `error_code`  | `string`  | Machine-readable error code (see table below).                     |
| `message`     | `string`  | Human-readable error description.                                  |
| `recoverable` | `boolean` | Whether the system can recover automatically.                      |
| `details`     | `object?` | Optional additional context for debugging.                         |

**Defined error codes:**

| Code                        | Scope    | Description                                   |
| --------------------------- | -------- | --------------------------------------------- |
| `INSTANCE_CRASH`            | Instance | The Claude Code process exited unexpectedly.  |
| `INSTANCE_TIMEOUT`          | Instance | Task exceeded the configured timeout.         |
| `INSTANCE_OOM`              | Instance | Process was killed due to memory limits.      |
| `TASK_INVALID`              | Instance | The submitted task failed validation.         |
| `AUTH_EXPIRED`              | System   | The authentication token has expired.         |
| `RATE_LIMIT_EXCEEDED`       | System   | API rate limit reached.                       |
| `QUEUE_FULL`                | System   | The task queue has reached maximum capacity.  |
| `INTERNAL_ERROR`            | System   | An unexpected internal server error occurred. |

**Full wire-format example:**

```json
{
  "type": "error",
  "instance_id": "a3f1b2c4-5678-9def-ghij-klmnopqrstuv",
  "timestamp": "2026-02-06T14:36:00.000Z",
  "data": {
    "error_code": "INSTANCE_TIMEOUT",
    "message": "Task task-0042 exceeded the 300s timeout and was terminated.",
    "recoverable": true,
    "details": {
      "task_id": "task-0042",
      "timeout_seconds": 300,
      "elapsed_seconds": 301
    }
  }
}
```

---

### f. UsageUpdateMessage -- Usage Metrics Updated

Emitted periodically (every 60 seconds by default) on the `/ws/dashboard` endpoint with aggregated usage metrics. Useful for cost dashboards and monitoring.

```typescript
interface UsageUpdateMessage {
  type: "usage_update";
  period: "minute" | "hour" | "day";
  metrics: {
    total_tokens_in: number;
    total_tokens_out: number;
    total_cost_estimate: number;
    tasks_completed: number;
    tasks_failed: number;
    active_instances: number;
    per_instance: Array<{
      instance_id: string;
      tokens_in: number;
      tokens_out: number;
      cost_estimate: number;
      tasks_completed: number;
    }>;
  };
}
```

| Field     | Type     | Description                                                              |
| --------- | -------- | ------------------------------------------------------------------------ |
| `type`    | `"usage_update"` | Literal discriminator.                                            |
| `period`  | `string` | The time window this metric covers.                                      |
| `metrics` | `object` | Aggregated usage data including per-instance breakdowns.                 |

**Full wire-format example:**

```json
{
  "type": "usage_update",
  "instance_id": "",
  "timestamp": "2026-02-06T14:31:00.000Z",
  "data": {
    "period": "minute",
    "metrics": {
      "total_tokens_in": 145200,
      "total_tokens_out": 38900,
      "total_cost_estimate": 0.8234,
      "tasks_completed": 7,
      "tasks_failed": 1,
      "active_instances": 4,
      "per_instance": [
        {
          "instance_id": "a3f1b2c4-5678-9def-ghij-klmnopqrstuv",
          "tokens_in": 45000,
          "tokens_out": 12000,
          "cost_estimate": 0.2510,
          "tasks_completed": 3
        },
        {
          "instance_id": "b4e2c3d5-6789-0abc-defg-hijklmnopqrs",
          "tokens_in": 100200,
          "tokens_out": 26900,
          "cost_estimate": 0.5724,
          "tasks_completed": 4
        }
      ]
    }
  }
}
```

---

## Connection Management

### Authentication

WebSocket connections are authenticated using the `CF_Authorization` cookie, which is set by Cloudflare Access after the user logs in through the identity provider. The browser automatically includes this cookie when establishing the WebSocket connection since it shares the same origin.

**No additional authentication handshake is required.** The server validates the cookie during the HTTP upgrade request. If the cookie is missing or invalid, the server responds with HTTP 401 and the WebSocket connection is not established.

```typescript
// The browser sends the cookie automatically. No special headers needed.
const ws = new WebSocket("wss://orchestrator.example.com/ws/dashboard");
```

If the cookie expires while a WebSocket connection is active, the server sends an `error` message with code `AUTH_EXPIRED` and then closes the connection with WebSocket close code `4401`.

### Connection Establishment and Handshake

The connection lifecycle follows this sequence:

```
Client                                  Server
  │                                       │
  │──── HTTP GET /ws/dashboard ──────────>│
  │     Upgrade: websocket                │
  │     Cookie: CF_Authorization=...      │
  │                                       │
  │<──── HTTP 101 Switching Protocols ────│
  │                                       │
  │     (WebSocket connection open)       │
  │                                       │
  │<──── { type: "status", ... } ─────────│  (initial state dump)
  │<──── { type: "status", ... } ─────────│  (one per active instance)
  │<──── { type: "queue_update", ... } ───│  (current queue state)
  │                                       │
  │──── { type: "ping" } ────────────────>│
  │<──── { type: "pong" } ────────────────│
  │                                       │
```

Upon successful connection, the server immediately sends:

1. A `status` message for every known instance, providing the client with the current state of the world.
2. A `queue_update` message with the current queue snapshot.

This eliminates the need for a separate REST call to hydrate the UI on connect.

### Auto-Reconnection with Exponential Backoff

When the WebSocket connection drops unexpectedly, the client must reconnect automatically using exponential backoff with jitter to avoid thundering-herd problems.

**Backoff schedule:** 1s, 2s, 4s, 8s, 16s, 30s (capped), 30s, 30s, ...

```typescript
class ReconnectingWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempt = 0;
  private maxDelay = 30_000;      // 30 seconds
  private baseDelay = 1_000;      // 1 second
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private url: string, private onMessage: (msg: WSServerMessage) => void) {
    this.connect();
  }

  private connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("[WS] Connected");
      this.reconnectAttempt = 0; // Reset backoff on successful connection
    };

    this.ws.onmessage = (event) => {
      const msg: WSServerMessage = JSON.parse(event.data);
      this.onMessage(msg);
    };

    this.ws.onclose = (event) => {
      console.log(`[WS] Closed: code=${event.code} reason=${event.reason}`);
      if (event.code !== 1000) {
        // Abnormal close, schedule reconnect
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror, so reconnect is handled there
    };
  }

  private scheduleReconnect() {
    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.reconnectAttempt),
      this.maxDelay
    );
    // Add jitter: +/- 25% of the delay
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    const finalDelay = Math.round(delay + jitter);

    console.log(`[WS] Reconnecting in ${finalDelay}ms (attempt ${this.reconnectAttempt + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempt++;
      this.connect();
    }, finalDelay);
  }

  send(msg: WSClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close(1000, "Client closing");
  }
}
```

### Heartbeat via Ping/Pong

To detect stale connections (e.g., behind load balancers that silently drop idle TCP connections), the client sends an application-level `ping` message every 30 seconds. The server responds with a `pong` message. If no `pong` is received within 10 seconds, the client considers the connection dead and initiates reconnection.

```typescript
class HeartbeatManager {
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private pongTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly PING_INTERVAL = 30_000;  // 30 seconds
  private readonly PONG_TIMEOUT = 10_000;   // 10 seconds

  start(ws: ReconnectingWebSocket, onDead: () => void) {
    this.stop();
    this.pingInterval = setInterval(() => {
      ws.send({ type: "ping" });
      this.pongTimeout = setTimeout(() => {
        console.warn("[WS] Pong not received, connection assumed dead");
        onDead();
      }, this.PONG_TIMEOUT);
    }, this.PING_INTERVAL);
  }

  receivedPong() {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  stop() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.pongTimeout) clearTimeout(this.pongTimeout);
    this.pingInterval = null;
    this.pongTimeout = null;
  }
}
```

### Connection State Management in Frontend (Zustand)

The frontend tracks WebSocket connection state in a Zustand store so that UI components can react to connectivity changes.

```typescript
import { create } from "zustand";

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

interface ConnectionStore {
  // State
  status: ConnectionStatus;
  lastConnectedAt: Date | null;
  reconnectAttempt: number;
  latencyMs: number | null;

  // Actions
  setStatus: (status: ConnectionStatus) => void;
  setReconnectAttempt: (attempt: number) => void;
  setLatency: (ms: number) => void;
  reset: () => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  status: "disconnected",
  lastConnectedAt: null,
  reconnectAttempt: 0,
  latencyMs: null,

  setStatus: (status) =>
    set({
      status,
      lastConnectedAt: status === "connected" ? new Date() : undefined,
    }),

  setReconnectAttempt: (attempt) =>
    set({ reconnectAttempt: attempt }),

  setLatency: (ms) =>
    set({ latencyMs: ms }),

  reset: () =>
    set({
      status: "disconnected",
      lastConnectedAt: null,
      reconnectAttempt: 0,
      latencyMs: null,
    }),
}));
```

---

## Frontend Integration

### React Hook: `useInstanceStream`

This hook manages the full lifecycle of a WebSocket connection for a single Claude Code instance, integrating with xterm.js for terminal rendering, React Query for cache invalidation, and Zustand for global state.

```typescript
import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Terminal } from "xterm";
import { useConnectionStore } from "@/stores/connectionStore";
import { useInstanceStore } from "@/stores/instanceStore";
import type { WSServerMessage } from "@/types/websocket";

interface UseInstanceStreamOptions {
  instanceId: string;
  terminal: Terminal | null;
  enabled?: boolean;
}

export function useInstanceStream({
  instanceId,
  terminal,
  enabled = true,
}: UseInstanceStreamOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pongTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queryClient = useQueryClient();
  const setConnectionStatus = useConnectionStore((s) => s.setStatus);
  const updateInstanceStatus = useInstanceStore((s) => s.updateStatus);

  const connect = useCallback(() => {
    if (!enabled || !instanceId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/instance/${instanceId}/stream`;

    setConnectionStatus("connecting");
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("connected");
      reconnectAttemptRef.current = 0;
      startHeartbeat();
    };

    ws.onmessage = (event: MessageEvent) => {
      const msg: WSServerMessage = JSON.parse(event.data);

      switch (msg.type) {
        case "output":
          // Write raw output line to the xterm.js terminal
          if (terminal) {
            const stream = msg.data.stream;
            const line = msg.data.line;
            terminal.writeln(stream === "stderr" ? `\x1b[31m${line}\x1b[0m` : line);
          }
          break;

        case "status":
          // Update Zustand store so all UI components reflect the change
          updateInstanceStatus(instanceId, msg.data.status);
          // Invalidate the instance detail query so React Query refetches
          queryClient.invalidateQueries({
            queryKey: ["instance", instanceId],
          });
          break;

        case "task_complete":
          // Invalidate task-related queries to refresh task history
          queryClient.invalidateQueries({
            queryKey: ["instance", instanceId, "tasks"],
          });
          queryClient.invalidateQueries({
            queryKey: ["task", msg.data.task_id],
          });
          // Also invalidate usage queries for updated cost data
          queryClient.invalidateQueries({
            queryKey: ["usage"],
          });
          break;

        case "error":
          if (terminal) {
            terminal.writeln(`\x1b[1;31m[ERROR] ${msg.data.message}\x1b[0m`);
          }
          break;

        case "pong":
          if (pongTimerRef.current) {
            clearTimeout(pongTimerRef.current);
            pongTimerRef.current = null;
          }
          break;
      }
    };

    ws.onclose = (event) => {
      stopHeartbeat();
      if (event.code !== 1000) {
        setConnectionStatus("reconnecting");
        scheduleReconnect();
      } else {
        setConnectionStatus("disconnected");
      }
    };

    ws.onerror = () => {
      // onclose handles reconnection
    };
  }, [enabled, instanceId, terminal, queryClient, setConnectionStatus, updateInstanceStatus]);

  const scheduleReconnect = useCallback(() => {
    const baseDelay = 1000;
    const maxDelay = 30_000;
    const delay = Math.min(baseDelay * Math.pow(2, reconnectAttemptRef.current), maxDelay);
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);

    reconnectTimerRef.current = setTimeout(() => {
      reconnectAttemptRef.current++;
      connect();
    }, Math.round(delay + jitter));
  }, [connect]);

  const startHeartbeat = useCallback(() => {
    heartbeatTimerRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
        pongTimerRef.current = setTimeout(() => {
          // No pong received, force close to trigger reconnect
          wsRef.current?.close(4000, "Pong timeout");
        }, 10_000);
      }
    }, 30_000);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    if (pongTimerRef.current) clearTimeout(pongTimerRef.current);
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      stopHeartbeat();
      wsRef.current?.close(1000, "Component unmounted");
    };
  }, [connect, stopHeartbeat]);
}
```

### React Hook: `useDashboardStream`

A companion hook for the dashboard endpoint that handles aggregate events.

```typescript
import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConnectionStore } from "@/stores/connectionStore";
import { useInstanceStore } from "@/stores/instanceStore";
import { useQueueStore } from "@/stores/queueStore";
import type { WSServerMessage } from "@/types/websocket";

export function useDashboardStream() {
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const setConnectionStatus = useConnectionStore((s) => s.setStatus);
  const updateInstanceStatus = useInstanceStore((s) => s.updateStatus);
  const setQueue = useQueueStore((s) => s.setQueue);

  const handleMessage = useCallback(
    (msg: WSServerMessage) => {
      switch (msg.type) {
        case "status":
          updateInstanceStatus(msg.instance_id, msg.data.status);
          break;

        case "queue_update":
          setQueue(msg.data.queue_snapshot, msg.data.queue_length);
          break;

        case "task_complete":
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
          queryClient.invalidateQueries({ queryKey: ["usage"] });
          break;

        case "usage_update":
          queryClient.setQueryData(["usage", msg.data.period], msg.data.metrics);
          break;

        case "error":
          if (msg.data.error_code === "AUTH_EXPIRED") {
            window.location.href = "/login";
          }
          break;
      }
    },
    [queryClient, updateInstanceStatus, setQueue]
  );

  // ... reconnect and heartbeat logic identical to useInstanceStream
}
```

---

## Backend Implementation

### Stream Manager Service

The stream manager is a server-side service responsible for tracking WebSocket connections, routing messages to the correct subscribers, and coordinating across multiple server processes via Redis pub/sub.

#### Architecture Overview

```
┌───────────────────────────────────────────────────────┐
│                   Stream Manager                       │
│                                                        │
│  ┌──────────────────┐   ┌──────────────────────────┐  │
│  │ Connection        │   │ Redis Pub/Sub            │  │
│  │ Registry          │   │ Subscriber               │  │
│  │                   │   │                          │  │
│  │ instance_id ->    │   │ Channels:                │  │
│  │   Set[WebSocket]  │   │  stream:{instance_id}    │  │
│  │                   │   │  dashboard               │  │
│  └──────────────────┘   └──────────────────────────┘  │
│                                                        │
│  ┌──────────────────┐   ┌──────────────────────────┐  │
│  │ Message Router    │   │ Cleanup Manager          │  │
│  │                   │   │                          │  │
│  │ Receives events   │   │ Detects dead sockets     │  │
│  │ from Claude Code  │   │ Removes from registry    │  │
│  │ processes and     │   │ Logs disconnections       │  │
│  │ dispatches to     │   │                          │  │
│  │ subscribers       │   │                          │  │
│  └──────────────────┘   └──────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

#### Python Implementation (FastAPI)

```python
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

import redis.asyncio as redis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from starlette.websockets import WebSocketState

logger = logging.getLogger(__name__)

app = FastAPI()


class ConnectionRegistry:
    """Thread-safe registry of WebSocket connections per instance."""

    def __init__(self) -> None:
        self._instance_connections: dict[str, set[WebSocket]] = {}
        self._dashboard_connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def add_instance_connection(self, instance_id: str, ws: WebSocket) -> None:
        async with self._lock:
            if instance_id not in self._instance_connections:
                self._instance_connections[instance_id] = set()
            self._instance_connections[instance_id].add(ws)
            logger.info(
                "Client connected to instance %s (total: %d)",
                instance_id,
                len(self._instance_connections[instance_id]),
            )

    async def remove_instance_connection(self, instance_id: str, ws: WebSocket) -> None:
        async with self._lock:
            if instance_id in self._instance_connections:
                self._instance_connections[instance_id].discard(ws)
                if not self._instance_connections[instance_id]:
                    del self._instance_connections[instance_id]
                    logger.info("No more subscribers for instance %s", instance_id)

    async def add_dashboard_connection(self, ws: WebSocket) -> None:
        async with self._lock:
            self._dashboard_connections.add(ws)
            logger.info(
                "Dashboard client connected (total: %d)",
                len(self._dashboard_connections),
            )

    async def remove_dashboard_connection(self, ws: WebSocket) -> None:
        async with self._lock:
            self._dashboard_connections.discard(ws)

    async def get_instance_connections(self, instance_id: str) -> set[WebSocket]:
        async with self._lock:
            return set(self._instance_connections.get(instance_id, set()))

    async def get_dashboard_connections(self) -> set[WebSocket]:
        async with self._lock:
            return set(self._dashboard_connections)


class StreamManager:
    """Manages message broadcasting and Redis pub/sub coordination."""

    def __init__(self, redis_url: str = "redis://localhost:6379") -> None:
        self.registry = ConnectionRegistry()
        self.redis_url = redis_url
        self._redis: redis.Redis | None = None
        self._pubsub: redis.client.PubSub | None = None

    async def start(self) -> None:
        """Initialize Redis connection and start listening for pub/sub messages."""
        self._redis = redis.from_url(self.redis_url)
        self._pubsub = self._redis.pubsub()
        await self._pubsub.psubscribe("stream:*", "dashboard")
        asyncio.create_task(self._listen_redis())
        logger.info("StreamManager started, listening on Redis pub/sub")

    async def stop(self) -> None:
        """Gracefully shut down Redis connections."""
        if self._pubsub:
            await self._pubsub.unsubscribe()
            await self._pubsub.close()
        if self._redis:
            await self._redis.close()

    async def _listen_redis(self) -> None:
        """Background task that reads messages from Redis and broadcasts locally."""
        if not self._pubsub:
            return
        async for raw_message in self._pubsub.listen():
            if raw_message["type"] not in ("message", "pmessage"):
                continue
            try:
                channel = raw_message.get("channel", b"").decode()
                data = json.loads(raw_message["data"])

                if channel == "dashboard":
                    await self._broadcast_dashboard(data)
                elif channel.startswith("stream:"):
                    instance_id = channel.split(":", 1)[1]
                    await self._broadcast_instance(instance_id, data)
            except Exception:
                logger.exception("Error processing Redis pub/sub message")

    async def publish_instance_event(self, instance_id: str, message: dict[str, Any]) -> None:
        """Publish an event for a specific instance via Redis."""
        message.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
        message.setdefault("instance_id", instance_id)
        if self._redis:
            await self._redis.publish(f"stream:{instance_id}", json.dumps(message))

    async def publish_dashboard_event(self, message: dict[str, Any]) -> None:
        """Publish an event for the dashboard via Redis."""
        message.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
        if self._redis:
            await self._redis.publish("dashboard", json.dumps(message))

    async def _broadcast_instance(self, instance_id: str, message: dict[str, Any]) -> None:
        """Send a message to all WebSocket clients subscribed to an instance."""
        connections = await self.registry.get_instance_connections(instance_id)
        payload = json.dumps(message)
        dead: list[WebSocket] = []

        for ws in connections:
            try:
                if ws.client_state == WebSocketState.CONNECTED:
                    await ws.send_text(payload)
                else:
                    dead.append(ws)
            except Exception:
                dead.append(ws)

        # Clean up dead connections
        for ws in dead:
            await self.registry.remove_instance_connection(instance_id, ws)

    async def _broadcast_dashboard(self, message: dict[str, Any]) -> None:
        """Send a message to all connected dashboard WebSocket clients."""
        connections = await self.registry.get_dashboard_connections()
        payload = json.dumps(message)
        dead: list[WebSocket] = []

        for ws in connections:
            try:
                if ws.client_state == WebSocketState.CONNECTED:
                    await ws.send_text(payload)
                else:
                    dead.append(ws)
            except Exception:
                dead.append(ws)

        for ws in dead:
            await self.registry.remove_dashboard_connection(ws)


# Global stream manager instance
stream_manager = StreamManager()


@app.on_event("startup")
async def startup() -> None:
    await stream_manager.start()


@app.on_event("shutdown")
async def shutdown() -> None:
    await stream_manager.stop()


async def verify_cf_auth(ws: WebSocket) -> str:
    """Validate the CF_Authorization cookie and return the user ID."""
    token = ws.cookies.get("CF_Authorization")
    if not token:
        await ws.close(code=4401, reason="Missing CF_Authorization cookie")
        raise HTTPException(status_code=401)
    # In production, validate the JWT against Cloudflare's public keys
    # For now, decode and extract the subject claim
    # user_id = decode_cf_jwt(token)
    user_id = "validated-user"  # placeholder
    return user_id


@app.websocket("/ws/instance/{instance_id}/stream")
async def instance_stream(ws: WebSocket, instance_id: str) -> None:
    """WebSocket endpoint for streaming a single instance's output."""
    await ws.accept()
    user_id = await verify_cf_auth(ws)
    await stream_manager.registry.add_instance_connection(instance_id, ws)

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)

            if msg.get("type") == "ping":
                await ws.send_text(json.dumps({
                    "type": "pong",
                    "instance_id": instance_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "data": {},
                }))
    except WebSocketDisconnect:
        logger.info("Client disconnected from instance %s", instance_id)
    except Exception:
        logger.exception("Error in instance stream for %s", instance_id)
    finally:
        await stream_manager.registry.remove_instance_connection(instance_id, ws)


@app.websocket("/ws/dashboard")
async def dashboard_stream(ws: WebSocket) -> None:
    """WebSocket endpoint for the global dashboard feed."""
    await ws.accept()
    user_id = await verify_cf_auth(ws)
    await stream_manager.registry.add_dashboard_connection(ws)

    # Send initial state dump
    await _send_initial_state(ws)

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)

            if msg.get("type") == "ping":
                await ws.send_text(json.dumps({
                    "type": "pong",
                    "instance_id": "",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "data": {},
                }))
            elif msg.get("type") == "subscribe":
                # Dashboard clients can optionally subscribe to specific instances
                instance_id = msg.get("instance_id")
                if instance_id:
                    await stream_manager.registry.add_instance_connection(instance_id, ws)
            elif msg.get("type") == "unsubscribe":
                instance_id = msg.get("instance_id")
                if instance_id:
                    await stream_manager.registry.remove_instance_connection(instance_id, ws)
    except WebSocketDisconnect:
        logger.info("Dashboard client disconnected")
    except Exception:
        logger.exception("Error in dashboard stream")
    finally:
        await stream_manager.registry.remove_dashboard_connection(ws)


async def _send_initial_state(ws: WebSocket) -> None:
    """Send the current state of all instances and the queue to a new dashboard client."""
    # In a real implementation, fetch current state from the database or cache
    # For illustration, this is a placeholder
    pass
```

#### Publishing Events from Claude Code Process Manager

When a Claude Code process produces output, the process manager publishes events through the stream manager:

```python
import asyncio
from stream_manager import stream_manager


async def handle_process_output(instance_id: str, task_id: str, line: str, stream: str) -> None:
    """Called by the process monitor when Claude Code writes a line of output."""
    await stream_manager.publish_instance_event(instance_id, {
        "type": "output",
        "data": {
            "task_id": task_id,
            "line": line,
            "stream": stream,
        },
    })


async def handle_status_change(instance_id: str, status: str, task_id: str | None = None) -> None:
    """Called when an instance's status changes."""
    event = {
        "type": "status",
        "data": {
            "status": status,
        },
    }
    if task_id:
        event["data"]["current_task_id"] = task_id

    # Publish to both instance stream and dashboard
    await asyncio.gather(
        stream_manager.publish_instance_event(instance_id, event),
        stream_manager.publish_dashboard_event({**event, "instance_id": instance_id}),
    )


async def handle_task_complete(
    instance_id: str,
    task_id: str,
    status: str,
    result_preview: str,
    tokens_in: int,
    tokens_out: int,
    cost_estimate: float,
) -> None:
    """Called when a task finishes execution."""
    event = {
        "type": "task_complete",
        "data": {
            "task_id": task_id,
            "status": status,
            "result_preview": result_preview[:200] + ("..." if len(result_preview) > 200 else ""),
            "usage": {
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "cost_estimate": cost_estimate,
            },
        },
    }

    await asyncio.gather(
        stream_manager.publish_instance_event(instance_id, event),
        stream_manager.publish_dashboard_event({**event, "instance_id": instance_id}),
    )
```

---

## Error Handling

### Connection Drops and Recovery

WebSocket connections can drop for many reasons: network changes, server restarts, load balancer timeouts, or device sleep/wake cycles. The client handles all of these uniformly.

**Client-side recovery strategy:**

1. The `onclose` handler fires with a non-1000 close code.
2. The connection state transitions to `"reconnecting"` in the Zustand store.
3. The UI displays a reconnecting indicator (e.g., a yellow banner).
4. Exponential backoff with jitter starts (see [Auto-Reconnection](#auto-reconnection-with-exponential-backoff)).
5. On successful reconnect, the server sends the initial state dump, bringing the client up to date.
6. The connection state transitions back to `"connected"`.
7. Any output lines missed during the disconnection period are **not** replayed over WebSocket. If the client needs complete history, it fetches it via the REST API (`GET /api/instances/{id}/tasks/{task_id}/output`).

**Server-side cleanup:**

When the server detects a disconnected WebSocket (via failed send or explicit close), it:

1. Removes the socket from the connection registry.
2. Logs the disconnection event with the instance ID and client metadata.
3. If no subscribers remain for an instance, it may optionally pause output buffering for that instance to save resources.

### Invalid Message Handling

Messages that fail JSON parsing or do not conform to the expected schema are handled gracefully on both sides.

**Server-side:**

```python
async def _handle_client_message(ws: WebSocket, raw: str) -> None:
    """Parse and validate an incoming client message."""
    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        await ws.send_text(json.dumps({
            "type": "error",
            "instance_id": "",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": {
                "error_code": "INVALID_MESSAGE",
                "message": "Message is not valid JSON.",
                "recoverable": True,
            },
        }))
        return

    msg_type = msg.get("type")
    if msg_type not in ("subscribe", "unsubscribe", "ping"):
        await ws.send_text(json.dumps({
            "type": "error",
            "instance_id": "",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": {
                "error_code": "UNKNOWN_MESSAGE_TYPE",
                "message": f"Unknown message type: {msg_type}",
                "recoverable": True,
            },
        }))
        return

    # Process valid message...
```

**Client-side:**

```typescript
ws.onmessage = (event: MessageEvent) => {
  let msg: WSServerMessage;

  try {
    msg = JSON.parse(event.data);
  } catch {
    console.error("[WS] Received non-JSON message:", event.data);
    return; // Silently discard
  }

  if (!msg.type) {
    console.warn("[WS] Message missing 'type' field:", msg);
    return;
  }

  // Route to handler based on type...
};
```

### Rate Limiting Considerations

To protect the server from misbehaving or malicious clients, the following rate limits apply:

| Scope               | Limit                         | Action on Exceed                          |
| -------------------- | ----------------------------- | ----------------------------------------- |
| Client messages      | 10 messages per second        | Server sends `RATE_LIMIT_EXCEEDED` error  |
| Connections per user | 20 concurrent WebSocket conns | New connections rejected with HTTP 429     |
| Reconnect frequency  | 5 connections per 10 seconds  | Connection rejected with close code `4429` |

**Server-side rate limiter (per connection):**

```python
import time
from collections import deque


class MessageRateLimiter:
    """Simple sliding window rate limiter for WebSocket messages."""

    def __init__(self, max_messages: int = 10, window_seconds: float = 1.0) -> None:
        self.max_messages = max_messages
        self.window_seconds = window_seconds
        self._timestamps: deque[float] = deque()

    def is_allowed(self) -> bool:
        now = time.monotonic()
        # Remove timestamps outside the window
        while self._timestamps and now - self._timestamps[0] > self.window_seconds:
            self._timestamps.popleft()
        if len(self._timestamps) >= self.max_messages:
            return False
        self._timestamps.append(now)
        return True
```

**Usage in the WebSocket handler:**

```python
@app.websocket("/ws/instance/{instance_id}/stream")
async def instance_stream(ws: WebSocket, instance_id: str) -> None:
    await ws.accept()
    rate_limiter = MessageRateLimiter(max_messages=10, window_seconds=1.0)

    try:
        while True:
            raw = await ws.receive_text()

            if not rate_limiter.is_allowed():
                await ws.send_text(json.dumps({
                    "type": "error",
                    "instance_id": instance_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "data": {
                        "error_code": "RATE_LIMIT_EXCEEDED",
                        "message": "Too many messages. Max 10 per second.",
                        "recoverable": True,
                    },
                }))
                continue

            await _handle_client_message(ws, raw)
    except WebSocketDisconnect:
        pass
```

### WebSocket Close Codes

The following custom close codes are used in addition to the standard RFC 6455 codes:

| Code   | Meaning                                          |
| ------ | ------------------------------------------------ |
| `1000` | Normal closure (client or server shutting down).  |
| `1001` | Going away (server restarting).                   |
| `1008` | Policy violation.                                 |
| `4000` | Pong timeout (client-initiated close).            |
| `4401` | Authentication required or expired.               |
| `4403` | Forbidden (user lacks access to this instance).   |
| `4404` | Instance not found.                               |
| `4429` | Too many connections (rate limited).              |
| `4500` | Internal server error.                            |

---

## Appendix: Complete Type Definitions

For reference, here is the complete set of TypeScript type definitions for all WebSocket messages:

```typescript
// ── Client to Server ──────────────────────────────────────────────

export interface WSClientSubscribe {
  type: "subscribe";
  instance_id: string;
}

export interface WSClientUnsubscribe {
  type: "unsubscribe";
  instance_id: string;
}

export interface WSClientPing {
  type: "ping";
}

export type WSClientMessage = WSClientSubscribe | WSClientUnsubscribe | WSClientPing;

// ── Server to Client ──────────────────────────────────────────────

interface WSBaseMessage {
  instance_id: string;
  timestamp: string;  // ISO 8601
}

export interface WSOutputMessage extends WSBaseMessage {
  type: "output";
  data: {
    task_id: string;
    line: string;
    stream: "stdout" | "stderr";
  };
}

export interface WSStatusMessage extends WSBaseMessage {
  type: "status";
  data: {
    status: "idle" | "running" | "paused" | "error" | "offline";
    current_task_id?: string;
  };
}

export interface WSTaskCompleteMessage extends WSBaseMessage {
  type: "task_complete";
  data: {
    task_id: string;
    status: "completed" | "failed";
    result_preview: string;
    usage: {
      tokens_in: number;
      tokens_out: number;
      cost_estimate: number;
    };
  };
}

export interface WSQueueUpdateMessage extends WSBaseMessage {
  type: "queue_update";
  data: {
    queue_length: number;
    queue_snapshot: Array<{
      task_id: string;
      instance_id: string | null;
      priority: number;
      prompt_preview: string;
      status: "queued" | "assigned" | "running";
    }>;
  };
}

export interface WSErrorMessage extends WSBaseMessage {
  type: "error";
  data: {
    error_code: string;
    message: string;
    recoverable: boolean;
    details?: Record<string, unknown>;
  };
}

export interface WSUsageUpdateMessage extends WSBaseMessage {
  type: "usage_update";
  data: {
    period: "minute" | "hour" | "day";
    metrics: {
      total_tokens_in: number;
      total_tokens_out: number;
      total_cost_estimate: number;
      tasks_completed: number;
      tasks_failed: number;
      active_instances: number;
      per_instance: Array<{
        instance_id: string;
        tokens_in: number;
        tokens_out: number;
        cost_estimate: number;
        tasks_completed: number;
      }>;
    };
  };
}

export interface WSPongMessage extends WSBaseMessage {
  type: "pong";
  data: Record<string, never>;
}

export type WSServerMessage =
  | WSOutputMessage
  | WSStatusMessage
  | WSTaskCompleteMessage
  | WSQueueUpdateMessage
  | WSErrorMessage
  | WSUsageUpdateMessage
  | WSPongMessage;
```
