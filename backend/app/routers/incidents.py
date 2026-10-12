import json

from fastapi import APIRouter, Depends, Query, Request
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.core.enums import IncidentStatus, IncidentType, Role, Severity
from app.core.errors import AppError
from app.models.user import User
from app.schemas.incident import (
    CloseRequest,
    IncidentCreate,
    IncidentCreated,
    IncidentDetail,
    IncidentListResponse,
    RejectRequest,
    TrackView,
)
from app.services import photo_service
from app.services.incident_service import IncidentService

router = APIRouter(prefix="/api/incidents", tags=["incidents"])

_CREATE_DOC = {
    "requestBody": {
        "required": True,
        "content": {
            "application/json": {
                "schema": {"type": "object"},
                "example": {
                    "incident_type": "flood", "location": "Near Andheri subway, Mumbai",
                    "latitude": 19.1197, "longitude": 72.8468, "severity": "high",
                    "description": "Water rising fast, cars stuck", "reporter_name": "Asha",
                    "reporter_phone": "9876543210", "water_level": "knee-deep",
                },
            },
            "multipart/form-data": {
                "schema": {
                    "type": "object",
                    "properties": {
                        "data": {"type": "string", "description": "The report as a JSON string"},
                        "photos": {"type": "array", "items": {"type": "string", "format": "binary"}},
                    },
                    "required": ["data"],
                }
            },
        },
    }
}


def _invalid(loc: str, msg: str) -> RequestValidationError:
    return RequestValidationError([{"loc": ("body", loc), "msg": msg, "type": "value_error"}])


# ------------------------------------------------------------------ public
@router.post("", response_model=IncidentCreated, status_code=201, openapi_extra=_CREATE_DOC)
async def create_incident(request: Request, db: Session = Depends(get_db)):
    """Public (no login). SD <<create>> -> msg 1-3.

    Accepts multipart/form-data (field `data` = JSON string, optional `photos` files, max 3)
    or plain application/json (no photos)."""
    ctype = request.headers.get("content-type", "").lower()
    files: list[UploadFile] = []
    if ctype.startswith("application/json"):
        try:
            raw = await request.json()
        except ValueError:
            raise _invalid("body", "Request body is not valid JSON")
    elif ctype.startswith("multipart/form-data"):
        form = await request.form()
        data = form.get("data")
        if not isinstance(data, str):
            raise _invalid("data", "Field 'data' (the report as JSON) is required")
        try:
            raw = json.loads(data)
        except ValueError:
            raise _invalid("data", "Field 'data' is not valid JSON")
        files = [f for f in form.getlist("photos") if isinstance(f, UploadFile) and f.filename]
    else:
        raise _invalid("body", "Send application/json or multipart/form-data")

    try:
        payload = IncidentCreate.model_validate(raw)
    except ValidationError as exc:
        raise RequestValidationError(exc.errors(include_context=False, include_url=False))

    blobs = await photo_service.read_and_validate(files)
    saved = photo_service.save(blobs)
    try:
        report = IncidentService(db).submit(payload, saved)
    except Exception:
        photo_service.delete(saved)
        raise
    return IncidentCreated(
        report_id=report.id,
        tracking_ref=report.tracking_ref,
        status=report.status,
        possible_duplicate=report.possible_duplicate,
    )


@router.get("/track/{tracking_ref}", response_model=TrackView)
def track_report(tracking_ref: str, phone: str | None = Query(None), db: Session = Depends(get_db)):
    """Public. Citizen view: reference + reporter phone (SE-3), else 404."""
    return IncidentService(db).track(tracking_ref, phone)


# -------------------------------------------------------------- coordinator
@router.get("", response_model=IncidentListResponse)
def list_incidents(
    status: IncidentStatus | None = Query(None),
    severity: Severity | None = Query(None),
    incident_type: IncidentType | None = Query(None),
    q: str | None = Query(None, max_length=100),
    possible_duplicate: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_role(Role.coordinator)),
):
    return IncidentService(db).list_incidents(
        status=status, severity=severity, incident_type=incident_type, q=q,
        possible_duplicate=possible_duplicate, page=page, page_size=page_size,
    )


def _assigned_member_may_view(db: Session, user: User, report_id: int) -> bool:
    """Rescue members may open only reports their team is assigned to (model by Person B)."""
    try:
        from app.models.team_assignment import TeamAssignment
    except ImportError:
        return False
    if user.team_id is None:
        return False
    found = db.scalar(
        select(TeamAssignment.id).where(
            TeamAssignment.report_id == report_id, TeamAssignment.team_id == user.team_id
        )
    )
    return found is not None


@router.get("/{incident_id}", response_model=IncidentDetail)
def get_incident(incident_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if user.role == Role.rescue_team_member.value:
        if not _assigned_member_may_view(db, user, incident_id):
            raise AppError("FORBIDDEN", "This report is not assigned to your team")
    elif user.role != Role.coordinator.value:
        raise AppError("FORBIDDEN", "You are not allowed to do this")
    return IncidentService(db).detail(incident_id)


@router.post("/{incident_id}/verify", response_model=IncidentDetail)
def verify_incident(
    incident_id: int, db: Session = Depends(get_db), user: User = Depends(require_role(Role.coordinator))
):
    return IncidentService(db).verify(user, incident_id)


@router.post("/{incident_id}/reject", response_model=IncidentDetail)
def reject_incident(
    incident_id: int,
    body: RejectRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.coordinator)),
):
    return IncidentService(db).reject(user, incident_id, body.remark)


@router.post("/{incident_id}/close", response_model=IncidentDetail)
def close_incident(
    incident_id: int,
    body: CloseRequest | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(Role.coordinator)),
):
    return IncidentService(db).close(user, incident_id, body.closing_note if body else None)
