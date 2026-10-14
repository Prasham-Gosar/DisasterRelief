import re
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.enums import IncidentType, Severity

_PHONE_RE = re.compile(r"^[6-9]\d{9}$")


def normalize_phone(value: str) -> str:
    """10-digit Indian mobile; accepts +91 / 91 / 0 prefixes, spaces, dashes."""
    digits = re.sub(r"[\s\-()]", "", value or "")
    if digits.startswith("+91"):
        digits = digits[3:]
    elif digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if not _PHONE_RE.match(digits):
        raise ValueError("Enter a valid 10-digit Indian mobile number")
    return digits


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class IncidentCreate(BaseModel):
    """SD msg 1: create(location, severity) + type-specific field."""

    incident_type: IncidentType
    location: str = Field(min_length=3, max_length=255)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    severity: Severity
    description: str = Field(min_length=5, max_length=1000)
    reporter_name: Optional[str] = Field(default=None, max_length=120)
    reporter_phone: str
    water_level: Optional[str] = Field(default=None, max_length=40)
    structure_type: Optional[str] = Field(default=None, max_length=60)
    casualty_count: Optional[int] = Field(default=None, ge=0)

    @field_validator("location", "description", "reporter_name")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("reporter_phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalize_phone(v)

    @model_validator(mode="after")
    def _type_specific(self):
        required = {
            IncidentType.flood: "water_level",
            IncidentType.fire: "structure_type",
            IncidentType.medical: "casualty_count",
        }
        needed = required[self.incident_type]
        if getattr(self, needed) is None:
            raise ValueError(f"{needed} is required for a {self.incident_type.value} report")
        for field in required.values():
            if field != needed and getattr(self, field) is not None:
                raise ValueError(f"{field} is not allowed on a {self.incident_type.value} report")
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must be given together")
        return self


class IncidentCreated(BaseModel):
    report_id: int
    tracking_ref: str
    status: str
    possible_duplicate: bool


class IncidentListItem(BaseModel):
    id: int
    tracking_ref: Optional[str] = None
    incident_type: str
    severity: str
    status: str
    location: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    description: str
    possible_duplicate: bool
    duplicate_of_id: Optional[int] = None
    created_at: datetime
    age_minutes: int

    @classmethod
    def from_report(cls, r) -> "IncidentListItem":
        created = _aware(r.created_at)
        age = max(int((datetime.now(timezone.utc) - created).total_seconds() // 60), 0)
        return cls(
            id=r.id, tracking_ref=r.tracking_ref, incident_type=r.incident_type, severity=r.severity,
            status=r.status, location=r.location, latitude=r.latitude, longitude=r.longitude,
            description=r.description, possible_duplicate=bool(r.possible_duplicate),
            duplicate_of_id=r.duplicate_of_id, created_at=created, age_minutes=age,
        )


class IncidentListResponse(BaseModel):
    items: list[IncidentListItem]
    total: int
    page: int
    page_size: int


class IncidentDetail(IncidentListItem):
    reporter_name: Optional[str] = None
    reporter_phone: Optional[str] = None
    photos: list[str] = []
    type_specific: dict = {}
    remark: Optional[str] = None
    closing_note: Optional[str] = None
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    citizen_subscribed: bool = True

    @classmethod
    def from_report(cls, r) -> "IncidentDetail":
        base = IncidentListItem.from_report(r).model_dump()
        return cls(
            **base,
            reporter_name=r.reporter.name if r.reporter else None,
            reporter_phone=r.reporter_phone,
            photos=[f"/uploads/{name}" for name in (r.photos or [])],
            type_specific=r.type_specific_fields(),
            remark=r.remark,
            closing_note=r.closing_note,
            verified_by=(r.verified_by.name if r.verified_by else None),
            verified_at=_aware(r.verified_at),
            resolved_at=_aware(r.resolved_at),
            updated_at=_aware(r.updated_at),
            citizen_subscribed=bool(r.citizen_subscribed),
        )


class RejectRequest(BaseModel):
    remark: Optional[str] = Field(default=None, max_length=1000)  # empty -> REMARK_REQUIRED from the model


class CloseRequest(BaseModel):
    closing_note: Optional[str] = Field(default=None, max_length=1000)


class TimelineItem(BaseModel):
    action: str
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    remark: Optional[str] = None
    created_at: datetime


class TrackView(BaseModel):
    tracking_ref: str
    incident_type: str
    severity: str
    status: str
    location: str
    description: str
    remark: Optional[str] = None
    editable: bool
    citizen_subscribed: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    timeline: list[TimelineItem]


# ------------------------------------------------------------------ A10 additions
class HistoryItem(BaseModel):
    """One audit row, for the coordinator's history timeline (SE-5)."""

    id: int
    actor: str
    action: str
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    remark: Optional[str] = None
    created_at: datetime


class NearbyItem(BaseModel):
    """A similar report close in space and time (same rule as the duplicate check)."""

    id: int
    tracking_ref: Optional[str] = None
    incident_type: str
    severity: str
    status: str
    location: str
    distance_m: int
    minutes_apart: int
    created_at: datetime


class TrackEdit(BaseModel):
    """Citizen edit: location and description only, and only while status is `reported`."""

    location: Optional[str] = Field(default=None, min_length=3, max_length=255)
    description: Optional[str] = Field(default=None, min_length=5, max_length=1000)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)

    @field_validator("location", "description")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v

    @model_validator(mode="after")
    def _something_to_change(self):
        if self.location is None and self.description is None and self.latitude is None and self.longitude is None:
            raise ValueError("Send at least one of location, description or latitude/longitude")
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must be given together")
        return self


class SubscriptionRequest(BaseModel):
    subscribed: bool


class TrackNotification(BaseModel):
    id: int
    message: str
    alert_type: str
    channel: str
    created_at: datetime


class IncidentStats(BaseModel):
    total: int
    by_status: dict[str, int]
    by_severity: dict[str, int]
    critical_open: int
