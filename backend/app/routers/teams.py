from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role
from app.core.enums import Role, TeamStatus, TeamType
from app.models.user import User
from app.schemas.team import TeamDetail, TeamListResponse
from app.services.dispatch_service import DispatchService

router = APIRouter(prefix="/api/teams", tags=["teams"])


@router.get("", response_model=TeamListResponse)
def list_teams(
    status: TeamStatus | None = Query(None),
    team_type: TeamType | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.coordinator)),
):
    return DispatchService(db).list_teams(
        status=status, team_type=team_type, page=page, page_size=page_size
    )


@router.get("/{id}", response_model=TeamDetail)
def get_team(
    id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.coordinator)),
):
    return DispatchService(db).get_team(id)
