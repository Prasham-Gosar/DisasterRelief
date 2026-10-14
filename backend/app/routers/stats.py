from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_role
from app.core.enums import Role
from app.models.user import User
from app.schemas.incident import IncidentStats
from app.services.incident_service import IncidentService

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/incidents", response_model=IncidentStats)
def incident_stats(db: Session = Depends(get_db), _: User = Depends(require_role(Role.coordinator))):
    """Numbers for the queue's stat cards (Reported / Verified / In progress / Critical open)."""
    return IncidentService(db).stats()
