"""
Seed script -- populates the database with sample projects and instances.

Usage:
    python -m scripts.seed
"""

import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.project import Project
from app.models.instance import Instance

# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

SAMPLE_PROJECTS = [
    {
        "id": uuid.uuid4(),
        "name": "E-Commerce Platform",
        "path": "/home/user/projects/ecommerce",
        "description": "Full-stack e-commerce application with product catalog, cart, and checkout.",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    },
    {
        "id": uuid.uuid4(),
        "name": "Blog API",
        "path": "/home/user/projects/blog",
        "description": "RESTful blog API with posts, comments, and authentication.",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    },
]

SAMPLE_INSTANCES = [
    # Two instances for "E-Commerce Platform"
    {
        "id": uuid.uuid4(),
        "name": "ecommerce-feature-auth",
        "status": "running",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    },
    {
        "id": uuid.uuid4(),
        "name": "ecommerce-bugfix-cart",
        "status": "idle",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    },
    # One instance for "Blog API"
    {
        "id": uuid.uuid4(),
        "name": "blog-feature-comments",
        "status": "idle",
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    },
]


# ---------------------------------------------------------------------------
# Seed logic
# ---------------------------------------------------------------------------

async def seed() -> None:
    """Insert sample projects and instances into the database."""

    engine = create_async_engine(str(settings.DATABASE_URL), echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        async with session.begin():
            # -- Projects ------------------------------------------------
            for project_data in SAMPLE_PROJECTS:
                project = Project(**project_data)
                session.add(project)

            # Flush so project IDs are available for FK references
            await session.flush()

            # -- Instances -----------------------------------------------
            ecommerce_project_id = SAMPLE_PROJECTS[0]["id"]
            blog_project_id = SAMPLE_PROJECTS[1]["id"]

            # First two instances belong to E-Commerce Platform
            for instance_data in SAMPLE_INSTANCES[:2]:
                instance = Instance(project_id=ecommerce_project_id, **instance_data)
                session.add(instance)

            # Third instance belongs to Blog API
            instance_data = SAMPLE_INSTANCES[2]
            instance = Instance(project_id=blog_project_id, **instance_data)
            session.add(instance)

        # session.begin() context auto-commits on success
        print("Seed complete!")
        print(f"  -> Created {len(SAMPLE_PROJECTS)} projects")
        print(f"  -> Created {len(SAMPLE_INSTANCES)} instances")

    await engine.dispose()


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    asyncio.run(seed())
