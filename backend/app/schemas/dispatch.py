from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class AvailableTeamItem(BaseModel):
    team_id: int
    name: str
    team_type: str
    distance_km: Optional[float] = None
    member_count: int
    suitable: bool
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class AvailableTeamsResponse(BaseModel):
    report_id: int
    items: list[AvailableTeamItem]


class AssignRequest(BaseModel):
    team_ids: Optional[list[int]] = None


class ReassignRequest(BaseModel):
    from_team_id: int
    to_team_id: Optional[int] = None
    reason: str


class TeamSummary(BaseModel):
    id: int
    name: str
    status: str


class CurrentLocation(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class AssignmentItem(BaseModel):
    assignment_id: int
    team: TeamSummary
    members_acknowledged: int
    current_location: CurrentLocation


class AssignResponse(BaseModel):
    report_id: int
    report_status: str
    assignments: list[AssignmentItem]
    replaced_assignment_id: Optional[int] = None


class DispatchAssignmentTeam(BaseModel):
    id: int
    name: str
    team_type: str


class DispatchAssignmentReport(BaseModel):
    id: int
    tracking_ref: Optional[str] = None
    incident_type: str
    severity: str
    status: str
    location: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class DispatchAssignmentItem(BaseModel):
    assignment_id: int
    status: str
    assigned_at: Optional[datetime] = None
    en_route_at: Optional[datetime] = None
    on_site_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    elapsed_minutes: int
    overdue: bool
    overdue_minutes: int
    team: DispatchAssignmentTeam
    report: DispatchAssignmentReport


class DispatchAssignmentsResponse(BaseModel):
    items: list[DispatchAssignmentItem]
    total: int


class DispatchSettingsRequest(BaseModel):
    overdue_minutes: int = Field(ge=1, le=600)


class DispatchSettingsResponse(BaseModel):
    overdue_minutes: int


class DispatchMapIncident(BaseModel):
    id: int
    tracking_ref: Optional[str] = None
    incident_type: str
    severity: str
    status: str
    latitude: float
    longitude: float
    location: str


class DispatchMapTeam(BaseModel):
    id: int
    name: str
    team_type: str
    status: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    last_location_at: Optional[datetime] = None


class DispatchMapResponse(BaseModel):
    incidents: list[DispatchMapIncident]
    teams: list[DispatchMapTeam]
