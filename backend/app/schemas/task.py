import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.task import TaskStatus


class TaskCreate(BaseModel):
    """Schema for creating a new task."""

    prompt: str = Field(..., min_length=1, max_length=50000)
    priority: int = Field(default=0, ge=0, le=100)
    max_retries: int = Field(default=0, ge=0, le=5)


class TaskUpdate(BaseModel):
    """Schema for updating a pending task."""

    prompt: str | None = Field(None, min_length=1, max_length=50000)
    priority: int | None = Field(None, ge=0, le=100)


class TaskResponse(BaseModel):
    """Schema for task API responses."""

    id: uuid.UUID
    instance_id: uuid.UUID
    prompt: str
    status: TaskStatus
    priority: int
    position: int
    result: dict | None
    error_message: str | None
    retry_count: int
    max_retries: int
    input_tokens: int | None
    output_tokens: int | None
    cost_estimate: float | None
    duration_seconds: float | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    schedule_id: uuid.UUID | None

    model_config = {"from_attributes": True}


class TaskBulkCreate(BaseModel):
    """Create multiple tasks at once."""

    prompts: list[str] = Field(..., min_length=1, max_length=50)
    priority: int = Field(default=0, ge=0, le=100)


class ReorderRequest(BaseModel):
    """Reorder tasks by providing ordered IDs."""

    ordered_ids: list[uuid.UUID]
