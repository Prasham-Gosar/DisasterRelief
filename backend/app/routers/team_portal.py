from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role
from app.core.enums import Role
from app.models.user import User
from app.schemas.team_portal import (
    MyTaskResponse,
    UpdateLocationRequest,
    UpdateLocationResponse,
    UpdateTaskStatusRequest,
)
from app.services.dispatch_service import DispatchService

router = APIRouter(prefix="/api/team", tags=["team_portal"])


@router.get("/my-task", response_model=Optional[MyTaskResponse])
def get_my_task(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.rescue_team_member)),
):
    return DispatchService(db).current_task_for(user)


@router.post("/tasks/{assignment_id}/status", response_model=MyTaskResponse)
def update_task_status(
    assignment_id: int,
    body: UpdateTaskStatusRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.rescue_team_member)),
):
    return DispatchService(db).update_task_status(
        user, assignment_id, body.status, body.closing_note
    )


@router.post("/location", response_model=UpdateLocationResponse)
def update_team_location(
    body: UpdateLocationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.rescue_team_member)),
):
    return DispatchService(db).update_location(user, body.latitude, body.longitude)
