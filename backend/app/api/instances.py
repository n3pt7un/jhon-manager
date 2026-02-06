import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.instance import Instance
from app.models.project import Project
from app.schemas.instance import InstanceCreate, InstanceResponse, InstanceUpdate

router = APIRouter(prefix="/instances", tags=["instances"])


@router.get("/", response_model=list[InstanceResponse])
async def list_instances(
    project_id: uuid.UUID | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
) -> list[Instance]:
    """List instances, optionally filtered by project_id."""
    query = select(Instance).order_by(Instance.created_at.desc())
    if project_id is not None:
        query = query.where(Instance.project_id == project_id)
    result = await session.execute(query)
    return list(result.scalars().all())


@router.post(
    "/", response_model=InstanceResponse, status_code=status.HTTP_201_CREATED
)
async def create_instance(
    data: InstanceCreate,
    session: AsyncSession = Depends(get_session),
) -> Instance:
    """Create a new instance."""
    # Verify the project exists
    project_result = await session.execute(
        select(Project).where(Project.id == data.project_id)
    )
    if project_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {data.project_id} not found",
        )

    instance = Instance(
        project_id=data.project_id,
        name=data.name,
        model=data.model or "sonnet",
        max_turns=data.max_turns or 25,
        ssh_config_id=data.ssh_config_id,
    )
    session.add(instance)
    await session.flush()
    await session.refresh(instance)
    return instance


@router.get("/{instance_id}", response_model=InstanceResponse)
async def get_instance(
    instance_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> Instance:
    """Get an instance by ID."""
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


@router.put("/{instance_id}", response_model=InstanceResponse)
async def update_instance(
    instance_id: uuid.UUID,
    data: InstanceUpdate,
    session: AsyncSession = Depends(get_session),
) -> Instance:
    """Update an existing instance."""
    result = await session.execute(
        select(Instance).where(Instance.id == instance_id)
    )
    instance = result.scalar_one_or_none()
    if instance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Instance {instance_id} not found",
        )

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(instance, field, value)

    await session.flush()
    await session.refresh(instance)
    return instance


@router.delete("/{instance_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_instance(
    instance_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Delete an instance."""
    result = await session.execute(
        select(Instance).where(Instance.id == instance_id)
    )
    instance = result.scalar_one_or_none()
    if instance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Instance {instance_id} not found",
        )
    await session.delete(instance)
