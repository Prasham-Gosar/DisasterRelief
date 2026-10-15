from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role
from app.core.enums import Role
from app.models.user import User
from app.schemas.dispatch import (
    AssignRequest,
    AssignResponse,
    AvailableTeamsResponse,
    DispatchAssignmentsResponse,
    DispatchMapResponse,
    DispatchSettingsRequest,
    DispatchSettingsResponse,
    ReassignRequest,
)
from app.services.dispatch_service import DispatchService

router = APIRouter(tags=["dispatch"])


@router.get("/api/incidents/{report_id}/available-teams", response_model=AvailableTeamsResponse)
def get_available_teams(
    report_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.coordinator)),
):
    items = DispatchService(db).list_available_teams(report_id)
    return AvailableTeamsResponse(report_id=report_id, items=items)


@router.post("/api/incidents/{report_id}/assign", response_model=AssignResponse, status_code=201)
def assign_incident_teams(
    report_id: int,
    body: AssignRequest | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.coordinator)),
):
    team_ids = body.team_ids if body is not None else None
    return DispatchService(db).assign_team(user, report_id, team_ids=team_ids)


@router.post("/api/incidents/{report_id}/reassign", response_model=AssignResponse, status_code=200)
def reassign_incident_team(
    report_id: int,
    body: ReassignRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.coordinator)),
):
    return DispatchService(db).reassign(
        user, report_id, body.from_team_id, to_team_id=body.to_team_id, reason=body.reason
    )


@router.get("/api/dispatch/assignments", response_model=DispatchAssignmentsResponse)
def get_assignments(
    scope: Literal["active", "overdue", "resolved_today"] = Query("active"),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.coordinator)),
):
    return DispatchService(db).list_assignments(scope=scope)


@router.get("/api/dispatch/overdue", response_model=DispatchAssignmentsResponse)
def get_overdue(
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.coordinator)),
):
    return DispatchService(db).list_assignments(scope="overdue")


@router.get("/api/dispatch/settings", response_model=DispatchSettingsResponse)
def get_dispatch_settings(
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.coordinator)),
):
    minutes = DispatchService(db).get_overdue_minutes()
    return DispatchSettingsResponse(overdue_minutes=minutes)


@router.put("/api/dispatch/settings", response_model=DispatchSettingsResponse)
def update_dispatch_settings(
    body: DispatchSettingsRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.coordinator)),
):
    minutes = DispatchService(db).set_overdue_minutes(body.overdue_minutes)
    return DispatchSettingsResponse(overdue_minutes=minutes)


@router.get("/api/dispatch/map", response_model=DispatchMapResponse)
def get_dispatch_map(
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.coordinator)),
):
    return DispatchService(db).get_dispatch_map()
