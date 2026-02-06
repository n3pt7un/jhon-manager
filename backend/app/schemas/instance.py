import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.instance import InstanceStatus


class InstanceCreate(BaseModel):
    """Schema for creating a new instance."""

    project_id: uuid.UUID
    name: str
    model: str | None = "sonnet"
    max_turns: int | None = 25
    ssh_config_id: uuid.UUID | None = None


class InstanceUpdate(BaseModel):
    """Schema for updating an existing instance."""

    name: str | None = None
    model: str | None = None
    max_turns: int | None = None


class InstanceResponse(BaseModel):
    """Schema for instance API responses."""

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    model: str
    max_turns: int
    status: InstanceStatus
    ssh_config_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
