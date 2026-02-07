import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.instance import Instance
from app.models.task import Task, TaskStatus
from app.schemas.task import (
    ReorderRequest,
    TaskBulkCreate,
    TaskCreate,
    TaskResponse,
    TaskUpdate,
)

router = APIRouter(tags=["tasks"])


async def _get_instance_or_404(
    instance_id: uuid.UUID,
    session: AsyncSession,
) -> Instance:
    """Fetch an instance by ID or raise 404."""
    result = await session.execute(
        select(Instance).where(Instance.id == instance_id)
    )
    instance = result.scalar_one_or_none()
    if instance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Instance {instance_id} not found",
        )
    return instance


async def _get_task_or_404(
    task_id: uuid.UUID,
    session: AsyncSession,
) -> Task:
    """Fetch a task by ID or raise 404."""
    result = await session.execute(
        select(Task).where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )
    return task


async def _next_position(instance_id: uuid.UUID, session: AsyncSession) -> int:
    """Return the next available position for tasks in the given instance."""
    result = await session.execute(
        select(func.coalesce(func.max(Task.position), -1)).where(
            Task.instance_id == instance_id
        )
    )
    return result.scalar_one() + 1


# ── Instance-scoped task routes ──────────────────────────────────────────


@router.post(
    "/instances/{instance_id}/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_task(
    instance_id: uuid.UUID,
    data: TaskCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> Task:
    """Create a new task and enqueue it."""
    await _get_instance_or_404(instance_id, session)

    position = await _next_position(instance_id, session)

    task = Task(
        instance_id=instance_id,
        prompt=data.prompt,
        status=TaskStatus.QUEUED,
        priority=data.priority,
        position=position,
        max_retries=data.max_retries,
    )
    session.add(task)
    await session.flush()
    await session.refresh(task)

    queue_manager = request.app.state.queue_manager
    await queue_manager.enqueue(instance_id, task.id, task.priority)

    return task


@router.get(
    "/instances/{instance_id}/tasks",
    response_model=list[TaskResponse],
)
async def list_tasks(
    instance_id: uuid.UUID,
    status_filter: list[TaskStatus] | None = Query(
        default=None, alias="status"
    ),
    session: AsyncSession = Depends(get_session),
) -> list[Task]:
    """List tasks for an instance, optionally filtered by status."""
    await _get_instance_or_404(instance_id, session)

    query = (
        select(Task)
        .where(Task.instance_id == instance_id)
        .order_by(Task.position.asc())
    )
    if status_filter:
        query = query.where(Task.status.in_(status_filter))

    result = await session.execute(query)
    return list(result.scalars().all())


@router.post(
    "/instances/{instance_id}/tasks/bulk",
    response_model=list[TaskResponse],
    status_code=status.HTTP_201_CREATED,
)
async def bulk_create_tasks(
    instance_id: uuid.UUID,
    data: TaskBulkCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> list[Task]:
    """Create multiple tasks at once and enqueue them all."""
    await _get_instance_or_404(instance_id, session)

    position = await _next_position(instance_id, session)
    queue_manager = request.app.state.queue_manager

    tasks: list[Task] = []
    for i, prompt in enumerate(data.prompts):
        task = Task(
            instance_id=instance_id,
            prompt=prompt,
            status=TaskStatus.QUEUED,
            priority=data.priority,
            position=position + i,
        )
        session.add(task)
        tasks.append(task)

    await session.flush()
    for task in tasks:
        await session.refresh(task)
        await queue_manager.enqueue(instance_id, task.id, task.priority)

    return tasks


@router.post(
    "/instances/{instance_id}/tasks/reorder",
    response_model=list[TaskResponse],
)
async def reorder_tasks(
    instance_id: uuid.UUID,
    data: ReorderRequest,
    session: AsyncSession = Depends(get_session),
) -> list[Task]:
    """Reorder pending/queued tasks by providing an ordered list of task IDs."""
    await _get_instance_or_404(instance_id, session)

    tasks: list[Task] = []
    for position, task_id in enumerate(data.ordered_ids):
        result = await session.execute(
            select(Task).where(
                Task.id == task_id,
                Task.instance_id == instance_id,
            )
        )
        task = result.scalar_one_or_none()
        if task is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task {task_id} not found in instance {instance_id}",
            )
        task.position = position
        tasks.append(task)

    await session.flush()
    for task in tasks:
        await session.refresh(task)

    return tasks


# ── Top-level task routes ────────────────────────────────────────────────


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> Task:
    """Get a single task by ID."""
    return await _get_task_or_404(task_id, session)


@router.put("/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    data: TaskUpdate,
    session: AsyncSession = Depends(get_session),
) -> Task:
    """Update a pending task. Only pending/queued tasks can be updated."""
    task = await _get_task_or_404(task_id, session)

    if task.status not in (TaskStatus.PENDING, TaskStatus.QUEUED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot update task with status '{task.status.value}'",
        )

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(task, field, value)

    await session.flush()
    await session.refresh(task)
    return task


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Cancel or delete a task. Stops the process if the task is running."""
    task = await _get_task_or_404(task_id, session)

    if task.status == TaskStatus.RUNNING:
        process_manager = request.app.state.process_manager
        await process_manager.stop_instance(task.instance_id)

    task.status = TaskStatus.CANCELLED
    await session.flush()


@router.post("/tasks/{task_id}/retry", response_model=TaskResponse)
async def retry_task(
    task_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> Task:
    """Retry a failed task by re-enqueuing it."""
    task = await _get_task_or_404(task_id, session)

    if task.status != TaskStatus.FAILED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot retry task with status '{task.status.value}'. Only failed tasks can be retried.",
        )

    task.status = TaskStatus.QUEUED
    task.retry_count += 1
    task.error_message = None
    task.started_at = None
    task.completed_at = None

    await session.flush()
    await session.refresh(task)

    queue_manager = request.app.state.queue_manager
    await queue_manager.enqueue(task.instance_id, task.id, task.priority)

    return task
