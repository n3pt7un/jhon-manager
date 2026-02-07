from fastapi import APIRouter

from app.api.instance_controls import router as instance_controls_router
from app.api.instances import router as instances_router
from app.api.projects import router as projects_router
from app.api.tasks import router as tasks_router
from app.api.ws import router as ws_router

api_router = APIRouter(prefix="/api")
api_router.include_router(projects_router)
api_router.include_router(instances_router)
api_router.include_router(tasks_router)
api_router.include_router(instance_controls_router)
api_router.include_router(ws_router)
