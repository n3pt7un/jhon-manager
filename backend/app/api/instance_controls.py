import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.instance import Instance, InstanceStatus

router = APIRouter(prefix="/instances", tags=["instance-controls"])


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


@router.post("/{instance_id}/start")
async def start_instance(
    instance_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Start an instance: set status to RUNNING and resume its task queue."""
    instance = await _get_instance_or_404(instance_id, session)

    if instance.status == InstanceStatus.RUNNING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Instance is already running",
        )

    instance.status = InstanceStatus.RUNNING
    await session.flush()
    await session.refresh(instance)

    queue_manager = request.app.state.queue_manager
    await queue_manager.resume(instance_id)

    return {"status": "ok", "message": f"Instance {instance_id} started"}


@router.post("/{instance_id}/stop")
async def stop_instance(
    instance_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Stop an instance: pause queue, kill process, set status to IDLE."""
    instance = await _get_instance_or_404(instance_id, session)

    if instance.status == InstanceStatus.IDLE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Instance is already idle",
        )

    queue_manager = request.app.state.queue_manager
    await queue_manager.pause(instance_id)

    process_manager = request.app.state.process_manager
    await process_manager.stop_instance(instance_id)

    instance.status = InstanceStatus.IDLE
    await session.flush()
    await session.refresh(instance)

    return {"status": "ok", "message": f"Instance {instance_id} stopped"}


@router.post("/{instance_id}/restart")
async def restart_instance(
    instance_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Restart an instance: stop then start."""
    instance = await _get_instance_or_404(instance_id, session)

    # Stop phase
    queue_manager = request.app.state.queue_manager
    process_manager = request.app.state.process_manager

    await queue_manager.pause(instance_id)
    await process_manager.stop_instance(instance_id)

    # Start phase
    instance.status = InstanceStatus.RUNNING
    await session.flush()
    await session.refresh(instance)

    await queue_manager.resume(instance_id)

    return {"status": "ok", "message": f"Instance {instance_id} restarted"}


@router.get("/{instance_id}/health")
async def instance_health(
    instance_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Check instance health: status, queue length, active task, connected clients."""
    instance = await _get_instance_or_404(instance_id, session)

    queue_manager = request.app.state.queue_manager
    stream_manager = request.app.state.stream_manager

    queue_length = await queue_manager.get_queue_length(instance_id)
    active_task_id = await queue_manager.get_active_task(instance_id)
    connected_clients = stream_manager.get_connection_count(instance_id)

    return {
        "instance_id": str(instance_id),
        "status": instance.status.value,
        "queue_length": queue_length,
        "active_task_id": str(active_task_id) if active_task_id else None,
        "connected_clients": connected_clients,
    }
