import uuid
from datetime import datetime

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    """Schema for creating a new project."""

    name: str
    description: str | None = None
    path: str


class ProjectUpdate(BaseModel):
    """Schema for updating an existing project."""

    name: str | None = None
    description: str | None = None
    path: str | None = None


class ProjectResponse(BaseModel):
    """Schema for project API responses."""

    id: uuid.UUID
    name: str
    description: str | None
    path: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
