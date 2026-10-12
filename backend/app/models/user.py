"""User hierarchy (single-table inheritance, discriminator = `role`).

Class diagram: «interface» User -> Citizen, Coordinator, SystemAdministrator, Volunteer.
Person B adds RescueTeamMember(User) in models/rescue_team_member.py
(polymorphic_identity="rescue_team_member").
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, event, select
from sqlalchemy.orm import Mapped, Session, mapped_column
from sqlalchemy.orm.attributes import set_committed_value

from app.core.enums import IncidentStatus, Role
from app.core.errors import AppError
from app.models.base import Base, utcnow

_CODE_PREFIX = {
    Role.citizen.value: "CIT",
    Role.coordinator.value: "COORD",
    Role.rescue_team_member.value: "MEM",
    Role.system_administrator.value: "ADM",
    Role.volunteer.value: "VOL",
}


class User(Base):
    """«interface» User: abstract base, never instantiated directly."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    role: Mapped[str] = mapped_column(String(32), index=True)
    public_code: Mapped[Optional[str]] = mapped_column(String(20), unique=True)
    name: Mapped[Optional[str]] = mapped_column(String(120))
    phone_number: Mapped[Optional[str]] = mapped_column(String(15), index=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255))  # citizens have none (SE-1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    skills: Mapped[Optional[str]] = mapped_column(String(255))  # volunteer only
    member_status: Mapped[Optional[str]] = mapped_column(String(20))  # rescue member only (MemberStatus)
    # rescue member only. NOTE: foreign key -> rescue_teams.id is added once Person B's model is merged.
    team_id: Mapped[Optional[int]] = mapped_column(ForeignKey("rescue_teams.id", use_alter=True, name="fk_users_team_id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __mapper_args__ = {"polymorphic_on": "role", "with_polymorphic": "*"}

    def __init__(self, **kwargs):
        if type(self) is User:
            raise TypeError("User is abstract: create a Citizen, Coordinator, SystemAdministrator, ...")
        super().__init__(**kwargs)

    def __repr__(self) -> str:
        return f"<{type(self).__name__} {self.public_code or self.id}>"


@event.listens_for(User, "after_insert", propagate=True)
def _assign_public_code(mapper, connection, target: User) -> None:
    """public_code = CIT-0001 / COORD-0001 / ... built from the generated primary key."""
    code = f"{_CODE_PREFIX[target.role]}-{target.id:04d}"
    connection.execute(User.__table__.update().where(User.__table__.c.id == target.id).values(public_code=code))
    set_committed_value(target, "public_code", code)


class Citizen(User):
    """citizen_id = public_code. No password: identified by phone number."""

    __mapper_args__ = {"polymorphic_identity": Role.citizen.value}

    def submit_report(self, db: Session, payload: dict) -> int:
        """submitReport() : int. SD msg 1-2: build the right subclass, then report.submit()."""
        from app.models.incident import IncidentFactory

        fields = dict(payload)
        incident_type = fields.pop("incident_type")
        report = IncidentFactory.create(incident_type, **fields)  # SD <<create>> / msg 1
        return report.submit(db, self)  # SD msg 2 -> msg 3 returns report_id

    def track_status(self, db: Session, tracking_ref: str) -> IncidentStatus:
        """trackStatus(): only reports submitted by this citizen are visible (SE-3)."""
        from app.models.incident import IncidentReport

        report = db.scalar(
            select(IncidentReport).where(
                IncidentReport.tracking_ref == tracking_ref, IncidentReport.reporter_user_id == self.id
            )
        )
        if report is None:
            raise AppError("NOT_FOUND", "Report not found")
        return IncidentStatus(report.status)


class Coordinator(User):
    """coordinator_id = public_code."""

    __mapper_args__ = {"polymorphic_identity": Role.coordinator.value}

    def verify_report(self, db: Session, report_id: int):
        """verifyReport(). SD msg 6: loads the report and calls report.verify(self)."""
        from app.models.incident import IncidentReport

        report = db.get(IncidentReport, report_id)
        if report is None:
            raise AppError("NOT_FOUND", "Report not found")
        report.verify(self)
        return report

    def assign_team(self, db: Session, report_id: int, team_ids: list[int] | None = None):
        """assignTeam(): thin delegator -> DispatchService (Person B)."""
        try:
            from app.services.dispatch_service import DispatchService
        except ImportError:  # until Person B's module is merged
            raise NotImplementedError("DispatchService is provided by Person B")
        return DispatchService(db).assign_team(self, report_id, team_ids)

    def manage_resource(self, *args, **kwargs):
        raise NotImplementedError("Release 2: resource module")


class SystemAdministrator(User):
    __mapper_args__ = {"polymorphic_identity": Role.system_administrator.value}

    def manage_accounts(self, db: Session, *args, **kwargs):
        raise NotImplementedError("Optional stretch (SE-4): create/deactivate accounts")

    def configure_settings(self, db: Session, *args, **kwargs):
        raise NotImplementedError("Stub")


class Volunteer(User):
    __mapper_args__ = {"polymorphic_identity": Role.volunteer.value}

    def register_volunteer(self, *args, **kwargs):
        raise NotImplementedError("Release 2")

    def accept_task(self, *args, **kwargs):
        raise NotImplementedError("Release 2")
