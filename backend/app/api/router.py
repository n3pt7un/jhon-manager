from fastapi import APIRouter

from app.api.instances import router as instances_router
from app.api.projects import router as projects_router

api_router = APIRouter(prefix="/api")
api_router.include_router(projects_router)
api_router.include_router(instances_router)
