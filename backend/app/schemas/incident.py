import re
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.enums import IncidentType, Severity

_PHONE_RE = re.compile(r"^[6-9]\d{9}$")


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
        digits = re.sub(r"[\s\-()]", "", v or "")
        if digits.startswith("+91"):
            digits = digits[3:]
        elif digits.startswith("91") and len(digits) == 12:
            digits = digits[2:]
        elif digits.startswith("0") and len(digits) == 11:
            digits = digits[1:]
        if not _PHONE_RE.match(digits):
            raise ValueError("Enter a valid 10-digit Indian mobile number")
        return digits

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
