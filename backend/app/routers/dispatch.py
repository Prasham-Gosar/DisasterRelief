from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role
from app.core.enums import Role
from app.models.user import User
from app.schemas.dispatch import AssignRequest, AssignResponse, AvailableTeamsResponse
from app.services.dispatch_service import DispatchService

router = APIRouter(prefix="/api/incidents", tags=["dispatch"])


@router.get("/{report_id}/available-teams", response_model=AvailableTeamsResponse)
def get_available_teams(
    report_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.coordinator)),
):
    items = DispatchService(db).list_available_teams(report_id)
    return AvailableTeamsResponse(report_id=report_id, items=items)


@router.post("/{report_id}/assign", response_model=AssignResponse, status_code=201)
def assign_incident_teams(
    report_id: int,
    body: AssignRequest | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.coordinator)),
):
    team_ids = body.team_ids if body is not None else None
    return DispatchService(db).assign_team(user, report_id, team_ids=team_ids)
