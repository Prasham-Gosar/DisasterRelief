from typing import Optional
from pydantic import BaseModel


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
