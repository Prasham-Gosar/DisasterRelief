from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.incident import IncidentCreate, IncidentCreated
from app.services.incident_service import IncidentService

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.post("", response_model=IncidentCreated, status_code=201)
def create_incident(body: IncidentCreate, db: Session = Depends(get_db)):
    """Public (no login). SD <<create>> -> msg 1-3. Photos (multipart) arrive on Monday."""
    report = IncidentService(db).submit(body)
    return IncidentCreated(
        report_id=report.id,
        tracking_ref=report.tracking_ref,
        status=report.status,
        possible_duplicate=report.possible_duplicate,
    )
