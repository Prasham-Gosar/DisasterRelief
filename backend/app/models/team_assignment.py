"""TeamAssignment: the table behind RescueTeam 0..* 'responds to' 0..* IncidentReport."""
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import AssignmentStatus
from app.models.base import Base, utcnow


class TeamAssignment(Base):
    __tablename__ = "team_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("incident_reports.id"), index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("rescue_teams.id"), index=True)
    assigned_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(16), default=AssignmentStatus.assigned.value, index=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    en_route_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    on_site_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    closing_note: Mapped[Optional[str]] = mapped_column(Text)
    replaced_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("team_assignments.id"))
    reassign_reason: Mapped[Optional[str]] = mapped_column(Text)
    overdue_notified: Mapped[bool] = mapped_column(Boolean, default=False)

    team = relationship("RescueTeam", backref="assignments")
    report = relationship("IncidentReport", backref="assignments")
