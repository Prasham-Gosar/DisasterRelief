"""RescueTeam (class diagram): team_id, team_type, status, updateStatus(), reportLocation()."""
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import TeamStatus
from app.core.errors import AppError
from app.models.base import Base, utcnow


class RescueTeam(Base):
    __tablename__ = "rescue_teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # team_id
    public_code: Mapped[Optional[str]] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    team_type: Mapped[str] = mapped_column(String(16), index=True)  # TeamType
    status: Mapped[str] = mapped_column(String(16), default=TeamStatus.available.value, index=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float)
    longitude: Mapped[Optional[float]] = mapped_column(Float)
    last_location_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    base_location: Mapped[Optional[str]] = mapped_column(String(255))
    assigned_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))  # last assigning coordinator
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # «includes» 1..*  (users.team_id has no DB foreign key on purpose: it avoids a users<->rescue_teams cycle)
    members = relationship(
        "RescueTeamMember", back_populates="team",
        primaryjoin="RescueTeam.id == foreign(User.team_id)", viewonly=False,
    )

    def is_available(self) -> bool:
        return self.status == TeamStatus.available.value

    def update_status(self, new_status: TeamStatus) -> None:
        """updateStatus() (SD msg 4 and 11). BR-2: a deployed team cannot be deployed again."""
        new_status = TeamStatus(new_status)
        if new_status == TeamStatus.deployed and self.status == TeamStatus.deployed.value:
            raise AppError("TEAM_NOT_AVAILABLE", f"{self.name} is already dispatched")
        self.status = new_status.value

    def report_location(self) -> tuple[float | None, float | None]:
        """reportLocation() (SD msg 7 -> msg 8 currentLocation)."""
        return (self.latitude, self.longitude)
