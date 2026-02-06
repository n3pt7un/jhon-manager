# Claude Code CLI Integration

This document describes how the Claude Orchestrator interfaces with the Claude Code CLI to spawn, manage, and collect results from agentic coding sessions. The orchestrator treats each Claude Code invocation as a subprocess -- either local or remote via SSH -- and communicates exclusively through the CLI's non-interactive print mode.

---

## Table of Contents

1. [Overview](#overview)
2. [Supported CLI Flags](#supported-cli-flags)
3. [Output Parsing](#output-parsing)
4. [Instance Configuration Options](#instance-configuration-options)
5. [Process Lifecycle](#process-lifecycle)
6. [SSH Execution](#ssh-execution)
7. [Error Handling](#error-handling)
8. [Token Usage Tracking](#token-usage-tracking)

---

## Overview

The Claude Orchestrator does **not** embed the Claude Code SDK or import it as a library. Instead, it shells out to the `claude` CLI binary in **non-interactive print mode** (`--print`). This design provides several benefits:

- **Process isolation** -- Each task runs in its own OS process. A crash in one task cannot affect the orchestrator or other running tasks.
- **Version independence** -- The orchestrator is decoupled from the Claude Code release cycle. Any CLI version that supports the `--print` and `--output-format json` flags is compatible.
- **SSH transparency** -- The same command that runs locally can be wrapped in an `ssh` call to execute on a remote machine, making local and remote instances functionally identical from the orchestrator's perspective.
- **Resource control** -- Standard OS-level tools (timeouts, cgroups, `ulimit`) can constrain each subprocess independently.

The communication flow is unidirectional for any single invocation:

```
Orchestrator                          Claude Code CLI
    |                                       |
    |--- spawn subprocess ----------------->|
    |                                       |
    |<-- stdout (stream-json lines) --------|  (real-time)
    |<-- stderr (diagnostic messages) ------|  (real-time)
    |                                       |
    |<-- exit code + final JSON result -----|  (on completion)
    |                                       |
```

The orchestrator's **Process Manager** service (`backend/app/services/process_manager.py`) is responsible for spawning CLI processes, capturing their output, forwarding stream data to connected WebSocket clients, and recording the final result in the database.

---

## Supported CLI Flags

The orchestrator uses the `--print` flag exclusively. This flag tells Claude Code to run non-interactively: it reads the prompt from the `-p` argument, executes the task, prints the result, and exits. No terminal UI is rendered.

### Primary Execution Mode

The standard invocation for a queued task:

```bash
claude --print \
  --output-format json \
  --max-turns 10 \
  --model claude-sonnet-4-20250514 \
  -p "Your prompt here"
```

| Flag | Purpose |
| --- | --- |
| `--print` | Non-interactive mode. No TUI, no user input prompts. Required for subprocess usage. |
| `--output-format json` | Emit a single JSON object on stdout upon completion containing the result, cost, session ID, and metadata. |
| `--max-turns 10` | Cap the number of agentic turns (tool use rounds) to prevent runaway loops. |
| `--model claude-sonnet-4-20250514` | Select the underlying Claude model. Configurable per instance. |
| `-p "..."` | The prompt to execute. Passed as a single string argument. |

### Stream Mode for Real-Time Output

When the orchestrator needs to push live output to the frontend via WebSocket:

```bash
claude --print \
  --output-format stream-json \
  --max-turns 10 \
  -p "Your prompt here"
```

Stream mode emits one JSON object per line on stdout as events occur. This allows the orchestrator to read lines incrementally and forward them to WebSocket subscribers without waiting for the process to finish. The final line in the stream is the same result object produced by `--output-format json`.

### Restricting Tool Access

For security-sensitive tasks, the orchestrator can restrict which tools Claude Code is allowed to use:

```bash
claude --print \
  --allowedTools "Edit,Write,Bash" \
  -p "Your prompt here"
```

The `--allowedTools` flag accepts a comma-separated list of tool names. When set, Claude Code will only invoke the listed tools and refuse requests to use any others. Common tool names include:

| Tool Name | Description |
| --- | --- |
| `Edit` | Modify existing files with targeted replacements |
| `Write` | Create or overwrite files |
| `Bash` | Execute shell commands |
| `Read` | Read file contents |
| `Glob` | Search for files by pattern |
| `Grep` | Search file contents by regex |
| `WebFetch` | Fetch content from URLs |
| `WebSearch` | Perform web searches |
| `NotebookEdit` | Edit Jupyter notebook cells |

### Continuing a Previous Conversation

To send a follow-up prompt that shares context with the previous invocation on the same instance:

```bash
claude --print \
  --continue \
  -p "Follow-up prompt"
```

The `--continue` flag tells Claude Code to load the most recent conversation for the current working directory and append the new prompt to it. This preserves full context from the prior exchange, including files read, edits made, and assistant reasoning.

### Resuming a Specific Session

To resume a conversation by its session ID (useful when multiple sessions exist for the same working directory):

```bash
claude --print \
  --resume abc123def456 \
  -p "Continue from where we left off"
```

The `--resume` flag accepts a session ID string (obtained from the `session_id` field in a previous result). This is more precise than `--continue` because it targets an exact session rather than the most recent one.

### Flag Combination Summary

The orchestrator builds the CLI command dynamically based on instance configuration and task requirements. Here is how flags combine in practice:

```bash
# Minimal invocation
claude --print -p "What files are in this directory?"

# Full-featured invocation
claude --print \
  --output-format stream-json \
  --max-turns 15 \
  --model claude-sonnet-4-20250514 \
  --allowedTools "Read,Glob,Grep,Bash" \
  --continue \
  -p "Now refactor the authentication module based on what we discussed"
```

---

## Output Parsing

### JSON Output Format (`--output-format json`)

When the CLI completes, it writes a single JSON object to stdout. The orchestrator reads all of stdout, parses this JSON, and stores the structured result.

```json
{
  "type": "result",
  "subtype": "success",
  "cost_usd": 0.042,
  "is_error": false,
  "duration_ms": 15234,
  "duration_api_ms": 12100,
  "num_turns": 3,
  "result": "Here is what I did...",
  "session_id": "abc123",
  "total_cost_usd": 0.042
}
```

#### Field Reference

| Field | Type | Description |
| --- | --- | --- |
| `type` | `string` | Always `"result"` for the final output object. |
| `subtype` | `string` | `"success"` on normal completion, `"error_max_turns"` if the turn limit was hit, or `"error"` on failure. |
| `cost_usd` | `float` | Cost in USD for this specific invocation. |
| `is_error` | `boolean` | `true` if the task ended in an error state. |
| `duration_ms` | `integer` | Wall-clock duration of the entire invocation in milliseconds. |
| `duration_api_ms` | `integer` | Time spent waiting on API calls in milliseconds (excludes local tool execution time). |
| `num_turns` | `integer` | Number of agentic turns consumed (each turn is one assistant response that may include tool calls). |
| `result` | `string` | The final text output from Claude. Contains the assistant's summary of what was done. |
| `session_id` | `string` | Unique identifier for this conversation session. Used with `--resume` to continue later. |
| `total_cost_usd` | `float` | Cumulative cost across all turns in this session (relevant when using `--continue` or `--resume`). |

#### Subtype Values and Their Meaning

| Subtype | Meaning | Orchestrator Behavior |
| --- | --- | --- |
| `success` | Task completed normally | Mark task as completed, record result |
| `error_max_turns` | Turn limit reached before completion | Mark task as completed with warning, record partial result |
| `error` | Claude Code encountered an error | Mark task as failed, trigger retry if configured |

### Stream-JSON Output Format (`--output-format stream-json`)

In stream mode, stdout contains one JSON object per line. Each line is a self-contained JSON object representing a discrete event. The orchestrator reads these line-by-line and forwards them to WebSocket subscribers.

```
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Let me look at the project structure first."}]}}
{"type":"tool_use","tool":{"name":"Bash","input":{"command":"ls -la"}}}
{"type":"tool_result","content":"total 48\ndrwxr-xr-x  8 user user 4096 ..."}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"I can see the project files. Let me now..."}]}}
{"type":"result","subtype":"success","cost_usd":0.042,"is_error":false,"duration_ms":15234,"duration_api_ms":12100,"num_turns":3,"result":"Here is what I did...","session_id":"abc123","total_cost_usd":0.042}
```

#### Stream Event Types

| Event Type | Description |
| --- | --- |
| `assistant` | An assistant message containing text and/or tool use requests. |
| `tool_use` | A tool invocation initiated by the assistant. Contains the tool name and input. |
| `tool_result` | The result returned from a tool execution. |
| `result` | The final summary object (identical schema to the `--output-format json` output). Always the last line. |

#### Parsing Strategy

The orchestrator uses a line-buffered reader on the subprocess stdout stream:

```python
async def _read_stream(self, process: asyncio.subprocess.Process):
    """Read stream-json output line by line and dispatch events."""
    final_result = None

    async for line in process.stdout:
        line = line.decode("utf-8").strip()
        if not line:
            continue

        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            # Non-JSON lines are treated as diagnostic output
            logger.debug("Non-JSON stdout line: %s", line)
            continue

        event_type = event.get("type")

        if event_type == "result":
            final_result = event
        else:
            # Forward intermediate events to WebSocket subscribers
            await self.stream_manager.broadcast(
                instance_id=self.instance_id,
                event=event,
            )

    return final_result
```

For `--output-format json`, the orchestrator collects all of stdout into a buffer and parses it as a single JSON object after the process exits:

```python
async def _read_json_result(self, process: asyncio.subprocess.Process):
    """Read full stdout and parse as JSON result."""
    stdout_bytes = await process.stdout.read()
    stdout_text = stdout_bytes.decode("utf-8").strip()

    if not stdout_text:
        return None

    try:
        return json.loads(stdout_text)
    except json.JSONDecodeError:
        logger.error("Failed to parse CLI output as JSON: %s", stdout_text[:500])
        return None
```

---

## Instance Configuration Options

Each Claude Code instance in the orchestrator is configured with the following settings. These are stored in the database per-instance and used to build the CLI command at execution time.

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `model` | `string` | `claude-sonnet-4-20250514` | The Claude model to use for this instance. Passed as `--model <value>`. |
| `max_turns` | `integer` | `10` | Maximum number of agentic turns per task. Passed as `--max-turns <value>`. Prevents runaway loops. |
| `allowed_tools` | `string[]` | All (no restriction) | Restrict which tools Claude Code can use. When set, passed as `--allowedTools <comma-separated>`. When empty or null, the flag is omitted and all tools are available. |
| `working_directory` | `string` | Project root | The current working directory for the Claude Code process. The process is spawned with `cwd` set to this path (local) or a `cd` prefix (SSH). |
| `timeout_seconds` | `integer` | `300` | Maximum wall-clock time for a single task in seconds. If exceeded, the process is terminated and the task is marked as timed out. |
| `retry_on_failure` | `boolean` | `true` | Whether to automatically retry a task when it fails (non-zero exit code or `is_error: true` in the result). |
| `max_retries` | `integer` | `2` | Maximum number of retry attempts when `retry_on_failure` is enabled. After exhausting retries, the task is marked as permanently failed. |
| `continue_session` | `boolean` | `false` | When enabled, sequential tasks on the same instance use `--continue` to share conversation context. Useful for multi-step workflows where each task builds on the previous one. |

### Configuration Examples

**Conservative instance for code review (read-only):**

```json
{
  "model": "claude-sonnet-4-20250514",
  "max_turns": 5,
  "allowed_tools": ["Read", "Glob", "Grep"],
  "working_directory": "/home/user/myproject",
  "timeout_seconds": 120,
  "retry_on_failure": false,
  "max_retries": 0,
  "continue_session": false
}
```

**Aggressive instance for large refactoring tasks:**

```json
{
  "model": "claude-sonnet-4-20250514",
  "max_turns": 25,
  "allowed_tools": null,
  "working_directory": "/home/user/myproject",
  "timeout_seconds": 600,
  "retry_on_failure": true,
  "max_retries": 3,
  "continue_session": true
}
```

### Command Construction

The Process Manager builds the CLI command from instance configuration:

```python
def _build_command(self, instance: Instance, task: Task) -> list[str]:
    """Construct the claude CLI argument list from instance config."""
    cmd = ["claude", "--print"]

    # Output format: stream-json for WebSocket-connected tasks, json otherwise
    if task.has_subscribers:
        cmd.extend(["--output-format", "stream-json"])
    else:
        cmd.extend(["--output-format", "json"])

    # Model selection
    cmd.extend(["--model", instance.model])

    # Turn limit
    cmd.extend(["--max-turns", str(instance.max_turns)])

    # Tool restrictions
    if instance.allowed_tools:
        cmd.extend(["--allowedTools", ",".join(instance.allowed_tools)])

    # Session continuity
    if instance.continue_session and instance.last_session_id:
        cmd.extend(["--resume", instance.last_session_id])
    elif instance.continue_session:
        cmd.append("--continue")

    # Prompt (always last)
    cmd.extend(["-p", task.prompt])

    return cmd
```

---

## Process Lifecycle

Every task execution follows a defined lifecycle managed by the orchestrator's Process Manager. The implementation uses Python's `asyncio.subprocess` for non-blocking process management.

### 1. Spawning as Asyncio Subprocess

When a task is dequeued, the Process Manager spawns a new subprocess:

```python
async def _spawn_process(self, cmd: list[str], cwd: str) -> asyncio.subprocess.Process:
    """Spawn a Claude Code CLI process."""
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
        env=self._build_env(),
    )
    logger.info(
        "Spawned Claude Code process PID=%d for instance=%s task=%s",
        process.pid,
        self.instance_id,
        self.task_id,
    )
    return process
```

The process runs with:
- `stdout=PIPE` -- Captured for JSON result parsing or stream event forwarding.
- `stderr=PIPE` -- Captured for diagnostic logging and error detection.
- `cwd` -- Set to the instance's configured `working_directory`.
- `env` -- Inherits the orchestrator's environment with any instance-specific overrides (e.g., `ANTHROPIC_API_KEY`).

### 2. Real-Time stdout/stderr Capture

Two concurrent asyncio tasks read from stdout and stderr simultaneously:

```python
async def _run_process(self, process, instance, task):
    """Manage the running process with concurrent stream readers."""
    stdout_task = asyncio.create_task(self._read_stream(process))
    stderr_task = asyncio.create_task(self._read_stderr(process))
    timeout_task = asyncio.create_task(
        self._enforce_timeout(process, instance.timeout_seconds)
    )

    try:
        result, stderr_output, _ = await asyncio.gather(
            stdout_task, stderr_task, timeout_task,
            return_exceptions=True,
        )
    except asyncio.CancelledError:
        await self._terminate_process(process)
        raise

    return result, stderr_output
```

### 3. Feeding Output to WebSocket Stream Manager

As stream-json lines arrive, they are forwarded to all WebSocket clients subscribed to this instance:

```python
# Inside _read_stream, for each parsed event:
await self.stream_manager.broadcast(
    instance_id=self.instance_id,
    event={
        "type": "cli_event",
        "instance_id": str(self.instance_id),
        "task_id": str(self.task_id),
        "data": event,
        "timestamp": datetime.utcnow().isoformat(),
    },
)
```

The WebSocket Stream Manager maintains a registry of connected clients and their instance subscriptions. Events are serialized to JSON and pushed through the WebSocket connection in real time, enabling the frontend's live terminal view.

### 4. Parsing JSON Result on Completion

After the process exits, the final result JSON is extracted:

```python
async def _finalize_task(self, process, result, stderr_output, task):
    """Process the result after CLI completion."""
    exit_code = await process.wait()

    if result is None and exit_code != 0:
        # Process crashed or produced no output
        task.status = TaskStatus.FAILED
        task.error_message = stderr_output or f"Process exited with code {exit_code}"
        return

    if result and result.get("is_error"):
        task.status = TaskStatus.FAILED
        task.error_message = result.get("result", "Unknown error")
    elif result and result.get("subtype") == "error_max_turns":
        task.status = TaskStatus.COMPLETED
        task.warning = "Max turns reached; result may be incomplete"
        task.result_text = result.get("result", "")
    else:
        task.status = TaskStatus.COMPLETED
        task.result_text = result.get("result", "")

    # Always record metadata when available
    if result:
        task.session_id = result.get("session_id")
        task.cost_usd = result.get("cost_usd", 0)
        task.duration_ms = result.get("duration_ms", 0)
        task.duration_api_ms = result.get("duration_api_ms", 0)
        task.num_turns = result.get("num_turns", 0)
```

### 5. Extracting Token Usage and Cost Data

Cost and timing data from the result JSON is persisted for analytics:

```python
async def _record_usage(self, task, result):
    """Store usage metrics in the analytics table."""
    await self.usage_repo.create(
        instance_id=self.instance_id,
        task_id=task.id,
        cost_usd=result.get("cost_usd", 0),
        total_cost_usd=result.get("total_cost_usd", 0),
        duration_ms=result.get("duration_ms", 0),
        duration_api_ms=result.get("duration_api_ms", 0),
        num_turns=result.get("num_turns", 0),
        model=self.instance.model,
        timestamp=datetime.utcnow(),
    )
```

### 6. Graceful Termination (SIGTERM, wait, SIGKILL)

When a process must be stopped -- due to timeout, user cancellation, or orchestrator shutdown -- it follows a graceful termination sequence:

```python
async def _terminate_process(self, process: asyncio.subprocess.Process):
    """Gracefully terminate a running Claude Code process."""
    if process.returncode is not None:
        return  # Already exited

    logger.info("Sending SIGTERM to PID=%d", process.pid)
    process.terminate()  # SIGTERM

    try:
        await asyncio.wait_for(process.wait(), timeout=5.0)
        logger.info("Process PID=%d exited after SIGTERM", process.pid)
    except asyncio.TimeoutError:
        logger.warning("Process PID=%d did not exit after 5s, sending SIGKILL", process.pid)
        process.kill()  # SIGKILL
        await process.wait()
        logger.info("Process PID=%d killed", process.pid)
```

The sequence is:

1. Send `SIGTERM` to allow Claude Code to clean up gracefully.
2. Wait up to **5 seconds** for the process to exit.
3. If still running, send `SIGKILL` for immediate forced termination.
4. Await final exit to prevent zombie processes.

### Lifecycle State Diagram

```
  QUEUED
    │
    ▼
  STARTING ──── (spawn fails) ────► FAILED
    │
    ▼
  RUNNING ───── (timeout) ────────► TIMED_OUT
    │   │
    │   └───── (cancelled) ───────► CANCELLED
    │
    ▼
  COMPLETING
    │
    ├── (is_error=false) ─────────► COMPLETED
    ├── (is_error=true, retries) ─► QUEUED (retry)
    └── (is_error=true, no retry) ► FAILED
```

---

## SSH Execution

When a Claude Code instance is configured to run on a remote machine, the orchestrator wraps the CLI command in an SSH call. From the orchestrator's perspective, the subprocess is the `ssh` client rather than `claude` directly. All output parsing and lifecycle management works identically because SSH transparently forwards stdout and stderr.

### SSH Command Construction

```bash
ssh -t user@host -p 22 -i /path/to/key "cd /working/dir && claude --print --output-format json --max-turns 10 --model claude-sonnet-4-20250514 -p \"Your prompt here\""
```

The command is constructed programmatically:

```python
def _build_ssh_command(self, instance: Instance, inner_cmd: list[str]) -> list[str]:
    """Wrap a claude CLI command for SSH execution."""
    ssh_cmd = ["ssh"]

    # Allocate pseudo-TTY for proper signal forwarding
    ssh_cmd.append("-t")

    # Connection parameters
    ssh_cmd.extend([f"{instance.ssh_user}@{instance.ssh_host}"])
    ssh_cmd.extend(["-p", str(instance.ssh_port or 22)])

    if instance.ssh_key_path:
        ssh_cmd.extend(["-i", instance.ssh_key_path])

    # Disable strict host key checking for known automation hosts
    ssh_cmd.extend(["-o", "StrictHostKeyChecking=accept-new"])
    ssh_cmd.extend(["-o", "ConnectTimeout=10"])

    # Build the remote command string
    escaped_inner = shlex.join(inner_cmd)
    remote_cmd = f"cd {shlex.quote(instance.working_directory)} && {escaped_inner}"
    ssh_cmd.append(remote_cmd)

    return ssh_cmd
```

### SSH Configuration Fields

Instances that use SSH have these additional configuration fields:

| Field | Type | Description |
| --- | --- | --- |
| `ssh_host` | `string` | Hostname or IP address of the remote machine. |
| `ssh_port` | `integer` | SSH port (default: `22`). |
| `ssh_user` | `string` | Username for SSH authentication. |
| `ssh_key_path` | `string` | Absolute path to the SSH private key file on the orchestrator host. |

### SSH-Specific Considerations

- **Pseudo-TTY allocation (`-t`)** -- Required for `SIGTERM` to propagate through SSH to the remote `claude` process. Without it, terminating the SSH client does not reliably stop the remote process.
- **Connect timeout** -- Set to 10 seconds via `-o ConnectTimeout=10`. If the SSH connection cannot be established within this window, the task fails immediately rather than hanging.
- **Key-based authentication** -- Password authentication is not supported. All SSH connections must use key-based auth. The key file must be readable by the orchestrator process.
- **Working directory** -- Set via `cd` at the start of the remote command string rather than relying on the SSH server's default directory.
- **Environment variables** -- The remote machine must have `claude` on its `PATH` and any required environment variables (e.g., `ANTHROPIC_API_KEY`) configured in the user's shell profile or `.env` file.
- **Prompt escaping** -- Prompts are escaped with `shlex.quote()` before being embedded in the remote command string to prevent shell injection.

---

## Error Handling

The orchestrator handles multiple categories of failure, each with its own detection mechanism and recovery strategy.

### CLI Not Found

**Detection:** The subprocess exits immediately with a non-zero code and stderr contains `command not found` or `No such file or directory`.

**Handling:**

```python
if "command not found" in stderr_output or "No such file" in stderr_output:
    task.status = TaskStatus.FAILED
    task.error_message = (
        "Claude Code CLI not found. Ensure 'claude' is installed and on the PATH. "
        f"stderr: {stderr_output}"
    )
    # Do not retry -- this is a configuration error, not a transient failure
    task.retryable = False
```

**Resolution:** Verify that the `claude` binary is installed and accessible. For SSH instances, ensure it is on the remote user's `PATH` (check `~/.bashrc` or `~/.profile`).

### Authentication Errors

**Detection:** The result JSON contains `is_error: true` and the `result` field mentions authentication, API key, or permission issues. Alternatively, stderr contains `401` or `403` status codes.

**Handling:**

```python
auth_keywords = ["authentication", "api key", "unauthorized", "403", "401"]
if any(kw in error_text.lower() for kw in auth_keywords):
    task.status = TaskStatus.FAILED
    task.error_message = f"Authentication error: {error_text}"
    task.retryable = False  # Retrying won't help without fixing credentials
```

**Resolution:** Verify that `ANTHROPIC_API_KEY` is set correctly in the environment where Claude Code runs. For SSH instances, ensure the key is available in the remote shell environment.

### Timeout Exceeded

**Detection:** The asyncio timeout wrapper fires before the process completes.

**Handling:**

```python
async def _enforce_timeout(self, process, timeout_seconds: int):
    """Kill the process if it exceeds the configured timeout."""
    try:
        await asyncio.sleep(timeout_seconds)
    except asyncio.CancelledError:
        return  # Task completed before timeout

    logger.warning(
        "Task %s exceeded timeout of %d seconds, terminating PID=%d",
        self.task_id,
        timeout_seconds,
        process.pid,
    )
    await self._terminate_process(process)
    raise TaskTimeoutError(
        f"Task exceeded timeout of {timeout_seconds} seconds"
    )
```

The task is marked as `TIMED_OUT`. If `retry_on_failure` is enabled, the task is re-queued with `--resume <session_id>` so that Claude Code can continue from where it left off rather than starting over.

### Process Crash

**Detection:** The process exits with a non-zero return code and either no stdout (no result JSON) or unparseable stdout.

**Handling:**

```python
if exit_code != 0 and result is None:
    task.status = TaskStatus.FAILED
    task.error_message = (
        f"Claude Code process crashed with exit code {exit_code}. "
        f"stderr: {stderr_output[:1000]}"
    )
    task.retryable = instance.retry_on_failure
```

Crashes are considered transient failures and are retried up to `max_retries` times. Each retry uses a fresh process (no `--continue` or `--resume`).

### SSH Connection Failures

**Detection:** The SSH client process exits with a non-zero code before any Claude Code output is produced. Common exit codes:

| SSH Exit Code | Meaning |
| --- | --- |
| `255` | SSH connection failed (network error, auth failure, host unreachable) |
| `1` | General SSH error |

**Handling:**

```python
ssh_error_patterns = [
    "Connection refused",
    "Connection timed out",
    "No route to host",
    "Permission denied (publickey)",
    "Host key verification failed",
]

if any(pattern in stderr_output for pattern in ssh_error_patterns):
    task.status = TaskStatus.FAILED
    task.error_message = f"SSH connection failed: {stderr_output}"
    task.retryable = "Connection timed out" in stderr_output  # Only retry transient failures
```

Connection failures that indicate misconfiguration (wrong key, unknown host) are not retried. Transient network errors (timeout, connection refused) may be retried.

### Error Recovery Summary

| Failure Mode | Retryable | Recovery Action |
| --- | --- | --- |
| CLI not found | No | Fix installation/PATH |
| Authentication error | No | Fix API key configuration |
| Timeout exceeded | Yes | Re-queue with `--resume` |
| Process crash | Yes | Re-queue as fresh task |
| SSH connection refused | Yes | Re-queue after backoff |
| SSH auth failure | No | Fix SSH key configuration |
| SSH host unreachable | Yes | Re-queue after backoff |
| Invalid JSON output | Yes | Re-queue as fresh task |
| Max turns reached | N/A | Marked as completed with warning |

---

## Token Usage Tracking

The orchestrator extracts usage and cost data from every CLI invocation and persists it for dashboards, budgeting, and alerting.

### Data Extraction

Usage data comes from the result JSON object returned by every CLI invocation:

```json
{
  "cost_usd": 0.042,
  "total_cost_usd": 0.042,
  "duration_ms": 15234,
  "duration_api_ms": 12100,
  "num_turns": 3
}
```

| Metric | Source Field | Description |
| --- | --- | --- |
| Invocation cost | `cost_usd` | Cost for this single invocation |
| Session cost | `total_cost_usd` | Cumulative cost for the entire session (across `--continue`/`--resume` calls) |
| Wall-clock time | `duration_ms` | Total elapsed time including tool execution |
| API time | `duration_api_ms` | Time spent on Claude API calls only |
| Turns used | `num_turns` | Number of agentic turns consumed |

### Storage Schema

Usage records are stored in the `task_usage` table:

```sql
CREATE TABLE task_usage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id     UUID NOT NULL REFERENCES instances(id),
    task_id         UUID NOT NULL REFERENCES tasks(id),
    model           VARCHAR(100) NOT NULL,
    cost_usd        DECIMAL(10, 6) NOT NULL DEFAULT 0,
    total_cost_usd  DECIMAL(10, 6) NOT NULL DEFAULT 0,
    duration_ms     INTEGER NOT NULL DEFAULT 0,
    duration_api_ms INTEGER NOT NULL DEFAULT 0,
    num_turns       INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_usage_instance ON task_usage(instance_id);
CREATE INDEX idx_task_usage_created  ON task_usage(created_at);
```

### Aggregation Queries

The orchestrator provides pre-built aggregation queries for the analytics dashboard:

**Cost per instance (last 24 hours):**

```sql
SELECT
    instance_id,
    SUM(cost_usd) AS total_cost,
    COUNT(*) AS task_count,
    AVG(duration_ms) AS avg_duration_ms,
    SUM(num_turns) AS total_turns
FROM task_usage
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY instance_id
ORDER BY total_cost DESC;
```

**Daily cost trend (last 30 days):**

```sql
SELECT
    DATE(created_at) AS day,
    SUM(cost_usd) AS daily_cost,
    COUNT(*) AS task_count
FROM task_usage
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY day;
```

**Cost by model:**

```sql
SELECT
    model,
    SUM(cost_usd) AS total_cost,
    COUNT(*) AS invocations,
    AVG(num_turns) AS avg_turns
FROM task_usage
GROUP BY model
ORDER BY total_cost DESC;
```

### Budget Alerting

The orchestrator supports configurable budget thresholds per instance and globally:

```python
async def _check_budget(self, instance: Instance, task_cost: float):
    """Check if the instance or global budget has been exceeded."""
    # Instance-level budget
    if instance.budget_limit_usd:
        period_cost = await self.usage_repo.sum_cost(
            instance_id=instance.id,
            since=instance.budget_period_start,
        )
        if period_cost + task_cost > instance.budget_limit_usd:
            logger.warning(
                "Instance %s budget exceeded: %.4f / %.4f USD",
                instance.id,
                period_cost + task_cost,
                instance.budget_limit_usd,
            )
            await self.notification_service.send(
                level="warning",
                message=f"Budget limit reached for instance {instance.name}",
            )
            # Pause the instance queue
            instance.paused = True
```

When a budget threshold is breached, the instance's task queue is paused and an alert is sent via the notification service. An administrator must manually resume the queue after reviewing usage.

### Usage Data in WebSocket Events

Real-time usage data is also included in WebSocket events when a task completes:

```json
{
  "type": "task_completed",
  "instance_id": "uuid-here",
  "task_id": "uuid-here",
  "result": {
    "status": "completed",
    "cost_usd": 0.042,
    "duration_ms": 15234,
    "num_turns": 3,
    "result_preview": "Here is what I did..."
  },
  "timestamp": "2026-02-06T12:34:56Z"
}
```

This allows the frontend to update cost counters and usage charts in real time without polling the REST API.
