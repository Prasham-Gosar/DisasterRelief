from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class TeamMemberOut(BaseModel):
    id: int
    name: Optional[str] = None
    public_code: Optional[str] = None
    member_status: Optional[str] = None


class TeamAssignmentHistory(BaseModel):
    assignment_id: int
    tracking_ref: Optional[str] = None
    report_tracking_ref: Optional[str] = None
    status: str
    assigned_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    reassign_reason: Optional[str] = None


class TeamListItem(BaseModel):
    id: int
    public_code: Optional[str] = None
    name: str
    team_type: str
    status: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    member_count: int
    current_report_id: Optional[int] = None


class TeamListResponse(BaseModel):
    items: list[TeamListItem]
    total: int
    page: int
    page_size: int


class TeamDetail(TeamListItem):
    members: list[TeamMemberOut] = []
    assignments: list[TeamAssignmentHistory] = []
