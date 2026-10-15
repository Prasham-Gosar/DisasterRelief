from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class PortalTeamSummary(BaseModel):
    id: int
    name: str


class PortalReportSummary(BaseModel):
    id: int
    tracking_ref: Optional[str] = None
    incident_type: str
    severity: str
    status: str
    location: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    description: str
    reporter_phone: Optional[str] = None


class MyTaskResponse(BaseModel):
    assignment_id: int
    status: str
    assigned_at: Optional[datetime] = None
    en_route_at: Optional[datetime] = None
    on_site_at: Optional[datetime] = None
    team: PortalTeamSummary
    report: PortalReportSummary


class UpdateTaskStatusRequest(BaseModel):
    status: str
    closing_note: Optional[str] = None
    client_update_id: Optional[str] = None


class UpdateLocationRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class UpdateLocationResponse(BaseModel):
    ok: bool = True
