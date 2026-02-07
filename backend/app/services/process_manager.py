from __future__ import annotations

import asyncio
import json
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import UUID

import structlog

from app.config import settings

logger = structlog.get_logger(__name__)


@dataclass
class ClaudeSession:
    """Represents a running Claude CLI session for an instance."""
    instance_id: UUID
    process: asyncio.subprocess.Process | None = None
    working_dir: str = ""
    is_running: bool = False
    current_task_id: UUID | None = None
    output_buffer: deque = field(
        default_factory=lambda: deque(maxlen=settings.MAX_OUTPUT_BUFFER_LINES)
    )
    started_at: float | None = None
    ssh_config_id: UUID | None = None


class ClaudeProcessManager:
    """Manages Claude Code CLI subprocess lifecycle."""

    def __init__(self) -> None:
        self._sessions: dict[UUID, ClaudeSession] = {}
        self._on_output: list = []  # callbacks: (instance_id, task_id, line, stream) -> None

    def on_output(self, callback) -> None:
        """Register a callback for output lines. Used by StreamManager."""
        self._on_output.append(callback)

    def get_session(self, instance_id: UUID) -> ClaudeSession | None:
        return self._sessions.get(instance_id)

    def get_output_buffer(self, instance_id: UUID) -> list[str]:
        session = self._sessions.get(instance_id)
        if session is None:
            return []
        return list(session.output_buffer)

    async def execute_task(
        self,
        instance_id: UUID,
        task_id: UUID,
        prompt: str,
        working_dir: str,
        model: str = "sonnet",
        max_turns: int = 25,
        ssh_config_id: UUID | None = None,
    ) -> dict:
        """Execute a task by running the Claude CLI as a subprocess."""
        session = self._sessions.get(instance_id)
        if session is None:
            session = ClaudeSession(instance_id=instance_id)
            self._sessions[instance_id] = session

        if session.is_running:
            raise RuntimeError(f"Instance {instance_id} already has a running task")

        session.is_running = True
        session.current_task_id = task_id
        session.working_dir = working_dir
        session.started_at = time.monotonic()
        session.output_buffer.clear()

        start_time = time.monotonic()
        cmd = self._build_command(prompt, model, max_turns)

        await logger.ainfo(
            "task_started",
            instance_id=str(instance_id),
            task_id=str(task_id),
            command=cmd[0],
        )

        try:
            session.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=working_dir,
            )

            # Read output streams concurrently
            stdout_data, stderr_data = await asyncio.gather(
                self._read_stream(session, task_id, session.process.stdout, "stdout"),
                self._read_stream(session, task_id, session.process.stderr, "stderr"),
            )

            return_code = await session.process.wait()
            duration = time.monotonic() - start_time

            if return_code == 0:
                result = self._parse_json_output(stdout_data)
                await logger.ainfo(
                    "task_completed",
                    instance_id=str(instance_id),
                    task_id=str(task_id),
                    duration=duration,
                )
                return {
                    "success": True,
                    "result": result,
                    "duration_seconds": duration,
                    "return_code": 0,
                }
            else:
                combined = stdout_data + stderr_data
                await logger.awarning(
                    "task_failed",
                    instance_id=str(instance_id),
                    task_id=str(task_id),
                    return_code=return_code,
                    duration=duration,
                )
                return {
                    "success": False,
                    "error": f"Process exited with code {return_code}",
                    "output": combined[-2000:] if len(combined) > 2000 else combined,
                    "duration_seconds": duration,
                    "return_code": return_code,
                }

        except asyncio.CancelledError:
            await self._kill_process(session)
            raise
        except Exception as exc:
            duration = time.monotonic() - start_time
            await logger.aerror(
                "task_exception",
                instance_id=str(instance_id),
                task_id=str(task_id),
                error=str(exc),
            )
            return {
                "success": False,
                "error": str(exc),
                "output": "",
                "duration_seconds": duration,
                "return_code": -1,
            }
        finally:
            session.is_running = False
            session.current_task_id = None
            session.process = None

    def _build_command(
        self,
        prompt: str,
        model: str,
        max_turns: int,
    ) -> list[str]:
        """Build the claude CLI command."""
        return [
            "claude",
            "--print",
            "--output-format", "json",
            "--model", model,
            "--max-turns", str(max_turns),
            "--prompt", prompt,
        ]

    async def _read_stream(
        self,
        session: ClaudeSession,
        task_id: UUID,
        stream: asyncio.StreamReader,
        stream_name: str,
    ) -> str:
        """Read from a subprocess stream line by line, broadcasting each line."""
        collected = []
        while True:
            line_bytes = await stream.readline()
            if not line_bytes:
                break
            line = line_bytes.decode("utf-8", errors="replace")
            collected.append(line)
            session.output_buffer.append(line)

            # Notify all registered output callbacks
            for callback in self._on_output:
                try:
                    await callback(session.instance_id, task_id, line, stream_name)
                except Exception:
                    pass  # Don't let callback errors break streaming

        return "".join(collected)

    def _parse_json_output(self, output: str) -> dict:
        """Try to parse Claude CLI JSON output. Return raw text if not JSON."""
        output = output.strip()
        if not output:
            return {"raw_output": ""}
        # Claude CLI with --output-format json outputs JSON
        try:
            return json.loads(output)
        except json.JSONDecodeError:
            # Try to find the last JSON object in the output
            for i in range(len(output) - 1, -1, -1):
                if output[i] == "}":
                    # Find matching opening brace
                    depth = 0
                    for j in range(i, -1, -1):
                        if output[j] == "}":
                            depth += 1
                        elif output[j] == "{":
                            depth -= 1
                        if depth == 0:
                            try:
                                return json.loads(output[j:i+1])
                            except json.JSONDecodeError:
                                break
            return {"raw_output": output}

    async def stop_instance(self, instance_id: UUID) -> None:
        """Stop a running instance by killing its subprocess."""
        session = self._sessions.get(instance_id)
        if session and session.is_running:
            await self._kill_process(session)
            session.is_running = False
            session.current_task_id = None

    async def _kill_process(self, session: ClaudeSession) -> None:
        """Graceful shutdown: SIGTERM, wait, then SIGKILL."""
        proc = session.process
        if proc is None or proc.returncode is not None:
            return

        try:
            proc.terminate()
            try:
                await asyncio.wait_for(
                    proc.wait(), timeout=settings.PROCESS_STOP_TIMEOUT
                )
            except asyncio.TimeoutError:
                await logger.awarning(
                    "process_kill",
                    instance_id=str(session.instance_id),
                    msg="SIGTERM timeout, sending SIGKILL",
                )
                proc.kill()
                await proc.wait()
        except ProcessLookupError:
            pass  # Already dead

    async def stop_all(self) -> None:
        """Stop all running sessions."""
        tasks = []
        for session in self._sessions.values():
            if session.is_running:
                tasks.append(self._kill_process(session))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._sessions.clear()
