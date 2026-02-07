from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from uuid import UUID

import structlog
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session_factory
from app.models.instance import Instance, InstanceStatus
from app.models.project import Project
from app.models.task import Task, TaskStatus
from app.models.usage_log import UsageLog
from app.services.process_manager import ClaudeProcessManager
from app.services.stream_manager import StreamManager

logger = structlog.get_logger(__name__)


class QueueManager:
    """Redis-backed task queue with priority support and background processing."""

    def __init__(
        self,
        redis: Redis,
        process_manager: ClaudeProcessManager,
        stream_manager: StreamManager,
    ) -> None:
        self._redis = redis
        self._process_manager = process_manager
        self._stream_manager = stream_manager
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        """Start the background processing loop."""
        self._running = True
        self._task = asyncio.create_task(self._process_loop())
        await logger.ainfo("queue_manager_started")

    async def stop(self) -> None:
        """Stop the background processing loop."""
        self._running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        await logger.ainfo("queue_manager_stopped")

    async def enqueue(
        self,
        instance_id: UUID,
        task_id: UUID,
        priority: int = 0,
    ) -> None:
        """Add a task to the instance queue with priority ordering."""
        # Score: lower = higher priority. High-priority tasks processed first.
        score = (100 - priority) * 1_000_000 + int(time.time() * 1000) % 1_000_000
        key = f"queue:{instance_id}"
        await self._redis.zadd(key, {str(task_id): score})
        await logger.ainfo(
            "task_enqueued",
            instance_id=str(instance_id),
            task_id=str(task_id),
            priority=priority,
        )

    async def remove(self, instance_id: UUID, task_id: UUID) -> None:
        """Remove a task from the queue."""
        key = f"queue:{instance_id}"
        await self._redis.zrem(key, str(task_id))

    async def pause(self, instance_id: UUID) -> None:
        await self._redis.set(f"queue:{instance_id}:paused", "1")

    async def resume(self, instance_id: UUID) -> None:
        await self._redis.delete(f"queue:{instance_id}:paused")

    async def is_paused(self, instance_id: UUID) -> bool:
        return await self._redis.exists(f"queue:{instance_id}:paused") > 0

    async def get_queue(self, instance_id: UUID) -> list[str]:
        """Get ordered task IDs from the queue."""
        key = f"queue:{instance_id}"
        return await self._redis.zrange(key, 0, -1)

    async def get_active_task(self, instance_id: UUID) -> str | None:
        return await self._redis.get(f"queue:{instance_id}:active")

    async def get_queue_length(self, instance_id: UUID) -> int:
        return await self._redis.zcard(f"queue:{instance_id}")

    async def _process_loop(self) -> None:
        """Background loop: poll queues and dispatch tasks."""
        while self._running:
            try:
                # Scan for all instance queues
                async for key in self._redis.scan_iter("queue:*"):
                    key_str = key if isinstance(key, str) else key.decode()
                    # Skip metadata keys
                    if ":" in key_str.split("queue:")[1]:
                        continue

                    instance_id_str = key_str.split("queue:")[1]

                    try:
                        instance_id = UUID(instance_id_str)
                    except ValueError:
                        continue

                    # Skip paused queues
                    if await self.is_paused(instance_id):
                        continue

                    # Skip if already has active task
                    active = await self.get_active_task(instance_id)
                    if active:
                        continue

                    # Pop highest-priority task (lowest score)
                    result = await self._redis.zpopmin(f"queue:{instance_id}")
                    if not result:
                        continue

                    task_id_str, _score = result[0]
                    task_id = UUID(task_id_str if isinstance(task_id_str, str) else task_id_str.decode())

                    # Mark as active
                    await self._redis.set(f"queue:{instance_id}:active", str(task_id))

                    # Fire and forget - spawn execution task
                    asyncio.create_task(
                        self._execute_task(instance_id, task_id)
                    )

            except asyncio.CancelledError:
                raise
            except Exception as exc:
                await logger.aerror("queue_loop_error", error=str(exc))

            await asyncio.sleep(settings.QUEUE_POLL_INTERVAL)

    async def _execute_task(self, instance_id: UUID, task_id: UUID) -> None:
        """Execute a single task: update DB, run process, handle result."""
        async with async_session_factory() as session:
            try:
                # Load task and instance from DB
                task = await session.get(Task, task_id)
                instance = await session.get(Instance, instance_id)

                if not task or not instance:
                    await logger.aerror(
                        "task_or_instance_not_found",
                        task_id=str(task_id),
                        instance_id=str(instance_id),
                    )
                    await self._redis.delete(f"queue:{instance_id}:active")
                    return

                # Update task status to RUNNING
                task.status = TaskStatus.RUNNING
                task.started_at = datetime.now(timezone.utc)
                instance.status = InstanceStatus.RUNNING
                await session.commit()

                # Broadcast status change
                await self._stream_manager.broadcast(instance_id, {
                    "type": "status",
                    "instance_id": str(instance_id),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "data": {
                        "status": "running",
                        "current_task_id": str(task_id),
                    },
                })

                # Determine working directory
                project = await session.get(Project, instance.project_id)
                working_dir = project.path if project else "/tmp"

                # Execute via ProcessManager
                result = await self._process_manager.execute_task(
                    instance_id=instance_id,
                    task_id=task_id,
                    prompt=task.prompt,
                    working_dir=working_dir,
                    model=instance.model or settings.DEFAULT_MODEL,
                    max_turns=instance.max_turns or settings.DEFAULT_MAX_TURNS,
                )

                # Update task with results
                await session.refresh(task)
                await session.refresh(instance)
                task.duration_seconds = result.get("duration_seconds")
                task.completed_at = datetime.now(timezone.utc)

                if result["success"]:
                    task.status = TaskStatus.COMPLETED
                    task.result = result.get("result", {})

                    # Extract token usage if available
                    res = result.get("result", {})
                    task.input_tokens = res.get("input_tokens") or res.get("usage", {}).get("input_tokens")
                    task.output_tokens = res.get("output_tokens") or res.get("usage", {}).get("output_tokens")

                    if task.input_tokens and task.output_tokens:
                        task.cost_estimate = (
                            (task.input_tokens / 1000) * settings.COST_PER_INPUT_TOKEN
                            + (task.output_tokens / 1000) * settings.COST_PER_OUTPUT_TOKEN
                        )

                        # Create usage log
                        usage_log = UsageLog(
                            instance_id=instance_id,
                            task_id=task_id,
                            model=instance.model or settings.DEFAULT_MODEL,
                            input_tokens=task.input_tokens,
                            output_tokens=task.output_tokens,
                            cost_estimate=task.cost_estimate,
                        )
                        session.add(usage_log)
                else:
                    await self._handle_failure(
                        session, task, instance_id, result.get("error", "Unknown error")
                    )

                instance.status = InstanceStatus.IDLE
                await session.commit()

                # Broadcast completion
                await self._stream_manager.broadcast(instance_id, {
                    "type": "task_complete",
                    "instance_id": str(instance_id),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "data": {
                        "task_id": str(task_id),
                        "status": task.status.value,
                        "result_preview": str(task.result)[:200] if task.result else None,
                        "usage": {
                            "tokens_in": task.input_tokens,
                            "tokens_out": task.output_tokens,
                            "cost_estimate": task.cost_estimate,
                        },
                    },
                })

                await self._stream_manager.broadcast(instance_id, {
                    "type": "status",
                    "instance_id": str(instance_id),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "data": {"status": "idle"},
                })

            except Exception as exc:
                await logger.aerror(
                    "task_execution_error",
                    task_id=str(task_id),
                    instance_id=str(instance_id),
                    error=str(exc),
                )
                try:
                    await session.rollback()
                except Exception:
                    pass
            finally:
                await self._redis.delete(f"queue:{instance_id}:active")

    async def _handle_failure(
        self,
        session: AsyncSession,
        task: Task,
        instance_id: UUID,
        error: str,
    ) -> None:
        """Handle a failed task: retry or mark as failed."""
        task.error_message = error
        task.retry_count += 1

        if task.retry_count <= task.max_retries:
            # Re-enqueue for retry
            task.status = TaskStatus.QUEUED
            await self.enqueue(instance_id, task.id, task.priority)
            await logger.ainfo(
                "task_retry",
                task_id=str(task.id),
                retry_count=task.retry_count,
            )
        else:
            task.status = TaskStatus.FAILED
            await logger.awarning(
                "task_failed_permanently",
                task_id=str(task.id),
                error=error,
            )
