"""IncidentReport («interface», abstract) + FloodIncident / FireIncident / MedicalEmergencyIncident.

Single-table inheritance, discriminator = incident_type.
"""
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from math import cos, radians
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, event, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, object_session, relationship
from sqlalchemy.orm.attributes import set_committed_value

from app.core.enums import AlertType, IncidentStatus, IncidentType, Role, Severity
from app.core.errors import AppError
from app.models.base import Base, utcnow
from app.models.user import User
from app.services import audit_service
from app.services.geo import haversine_m

DUPLICATE_RADIUS_M = 200
DUPLICATE_WINDOW = timedelta(hours=2)

S = IncidentStatus

# Contract 0.6: the single source of truth for the state machine.
ALLOWED_TRANSITIONS: dict[IncidentStatus, set[IncidentStatus]] = {
    S.reported: {S.verified, S.rejected},
    S.verified: {S.assigned, S.rejected},
    S.assigned: {S.in_progress, S.assigned},  # assigned -> assigned = reassign
    S.in_progress: {S.resolved},
    S.resolved: {S.closed},
    S.rejected: {S.closed},
    S.closed: set(),
}

_AUDIT_ACTION = {
    S.verified: "verify",
    S.rejected: "reject",
    S.assigned: "assign",
    S.in_progress: "en_route",
    S.resolved: "resolve",
    S.closed: "close",
}

_STATUS_TEXT = {
    S.assigned: "A rescue team has been assigned.",
    S.in_progress: "A rescue team is on the way.",
    S.resolved: "The incident has been resolved.",
    S.closed: "The report has been closed.",
}


class IncidentReport(Base, ABC):
    """«interface» IncidentReport: abstract, cannot be instantiated."""

    __tablename__ = "incident_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # report_id
    tracking_ref: Mapped[Optional[str]] = mapped_column(String(24), unique=True, index=True)
    incident_type: Mapped[str] = mapped_column(String(16), index=True)
    location: Mapped[str] = mapped_column(String(255))
    latitude: Mapped[Optional[float]] = mapped_column(Float)
    longitude: Mapped[Optional[float]] = mapped_column(Float)
    severity: Mapped[str] = mapped_column(String(16), index=True)
    status: Mapped[str] = mapped_column(String(16), default=S.reported.value, index=True)
    description: Mapped[str] = mapped_column(Text)
    reporter_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), index=True)
    reporter_phone: Mapped[Optional[str]] = mapped_column(String(15), index=True)
    verified_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    remark: Mapped[Optional[str]] = mapped_column(Text)  # rejection remark
    photos: Mapped[list] = mapped_column(JSON().with_variant(JSONB(), "postgresql"), default=list)
    possible_duplicate: Mapped[bool] = mapped_column(Boolean, default=False)
    duplicate_of_id: Mapped[Optional[int]] = mapped_column(ForeignKey("incident_reports.id"))
    citizen_subscribed: Mapped[bool] = mapped_column(Boolean, default=True)
    closing_note: Mapped[Optional[str]] = mapped_column(Text)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    reporter: Mapped[Optional[User]] = relationship(foreign_keys=[reporter_user_id])  # Citizen submits
    verified_by: Mapped[Optional[User]] = relationship(foreign_keys=[verified_by_id])  # Coordinator verifies

    __mapper_args__ = {"polymorphic_on": "incident_type"}

    # ---- abstract part of the «interface» ----
    @abstractmethod
    def type_specific_fields(self) -> dict:
        """Each subclass returns its own attribute (water_level, structure_type, casualty_count)."""

    # ---- behaviour ----
    def submit(self, db, reporter: User) -> int:
        """submit() (SD msg 2). Sets status=reported, runs the duplicate check, persists,
        writes the audit row. Returns report_id (SD msg 3). tracking_ref is generated on insert."""
        self.status = S.reported.value
        self.reporter_user_id = reporter.id
        if not self.reporter_phone:
            self.reporter_phone = reporter.phone_number
        duplicate = self._find_nearest_duplicate(db)
        if duplicate is not None:
            self.possible_duplicate = True
            self.duplicate_of_id = duplicate.id
        db.add(self)
        db.flush()  # assigns id; after_insert listener sets tracking_ref
        audit_service.log(db, reporter, "create", "incident_report", self.id, to_status=S.reported.value)
        return self.id

    def verify(self, coordinator: User) -> IncidentStatus:
        """verify() (SD msg 6). BR-1: coordinators only."""
        self._require_coordinator(coordinator)
        self.verified_by_id = coordinator.id
        self.verified_at = utcnow()
        self.transition(S.verified, coordinator)
        return IncidentStatus(self.status)

    def reject(self, coordinator: User, remark: str | None) -> IncidentStatus:
        """reject() (SD msg 8). BR-1 + mandatory remark; rejected, then closed."""
        self._require_coordinator(coordinator)
        if not remark or len(remark.strip()) < 5:
            raise AppError("REMARK_REQUIRED", "A remark of at least 5 characters is required to reject a report")
        remark = remark.strip()
        self.remark = remark
        self.transition(S.rejected, coordinator, remark)
        self.transition(S.closed, coordinator, "Closed after rejection")
        return IncidentStatus(self.status)

    def transition(self, to: IncidentStatus, actor: User | None, remark: str | None = None) -> "IncidentReport":
        """The ONLY way status may change (contract 0.6). Validates, audits, notifies (SD opt msg 10)."""
        to = IncidentStatus(to)
        current = IncidentStatus(self.status)
        if to not in ALLOWED_TRANSITIONS[current]:
            raise AppError("INVALID_TRANSITION", f"Cannot move report from {current.value} to {to.value}")
        db = object_session(self)
        if db is None:
            raise RuntimeError("Report must be attached to a session before a transition")

        self.status = to.value
        self.updated_at = utcnow()
        if to == S.resolved:
            self.resolved_at = utcnow()
        if to == S.closed and current != S.rejected and remark:
            self.closing_note = remark
        action = "reassign" if current == to else _AUDIT_ACTION[to]
        audit_service.log(
            db, actor, action, "incident_report", self.id,
            from_status=current.value, to_status=to.value, remark=remark,
        )

        # SD opt [citizen subscribed], msg 10: status_update on every later status change
        if to in _STATUS_TEXT and current != to and current != S.rejected and self.citizen_subscribed:
            from app.services.notification_service import NotificationService

            recipient = self.reporter or self.reporter_phone
            if recipient:
                NotificationService(db).send(
                    AlertType.status_update,
                    f"Your report {self.tracking_ref}: {_STATUS_TEXT[to]}",
                    [recipient],
                    report=self,
                )
        return self

    # ---- helpers ----
    @staticmethod
    def _require_coordinator(actor: User | None) -> None:
        if actor is None or actor.role != Role.coordinator.value:
            raise AppError("FORBIDDEN", "Only coordinators can verify or reject reports")

    def _find_nearest_duplicate(self, db) -> "IncidentReport | None":
        """Report.Duplicate.Check: same type, last 2 h, within 200 m.
        Bounding box in SQL first, exact haversine in Python."""
        if self.latitude is None or self.longitude is None:
            return None
        margin_m = DUPLICATE_RADIUS_M * 1.25
        dlat = margin_m / 111_320
        dlng = margin_m / (111_320 * max(cos(radians(self.latitude)), 0.01))
        candidates = db.scalars(
            select(IncidentReport).where(
                IncidentReport.created_at >= utcnow() - DUPLICATE_WINDOW,
                IncidentReport.incident_type == self.incident_type,
                IncidentReport.latitude.between(self.latitude - dlat, self.latitude + dlat),
                IncidentReport.longitude.between(self.longitude - dlng, self.longitude + dlng),
            )
        ).all()
        nearest, best = None, None
        for c in candidates:
            d = haversine_m(self.latitude, self.longitude, c.latitude, c.longitude)
            if d <= DUPLICATE_RADIUS_M and (best is None or d < best):
                nearest, best = c, d
        return nearest


@event.listens_for(IncidentReport, "after_insert", propagate=True)
def _assign_tracking_ref(mapper, connection, target: IncidentReport) -> None:
    """tracking_ref = DRR-<year>-<6-digit id>."""
    ref = f"DRR-{utcnow().year}-{target.id:06d}"
    table = IncidentReport.__table__
    connection.execute(table.update().where(table.c.id == target.id).values(tracking_ref=ref))
    set_committed_value(target, "tracking_ref", ref)


class FloodIncident(IncidentReport):
    water_level: Mapped[Optional[str]] = mapped_column(String(40))
    __mapper_args__ = {"polymorphic_identity": IncidentType.flood.value}

    def type_specific_fields(self) -> dict:
        return {"water_level": self.water_level}


class FireIncident(IncidentReport):
    structure_type: Mapped[Optional[str]] = mapped_column(String(60))
    __mapper_args__ = {"polymorphic_identity": IncidentType.fire.value}

    def type_specific_fields(self) -> dict:
        return {"structure_type": self.structure_type}


class MedicalEmergencyIncident(IncidentReport):
    casualty_count: Mapped[Optional[int]] = mapped_column(Integer)
    __mapper_args__ = {"polymorphic_identity": IncidentType.medical.value}

    def type_specific_fields(self) -> dict:
        return {"casualty_count": self.casualty_count}


class IncidentFactory:
    """The «create» arrow of the sequence diagram (msg 1): picks the right subclass."""

    _MAP = {
        IncidentType.flood.value: FloodIncident,
        IncidentType.fire.value: FireIncident,
        IncidentType.medical.value: MedicalEmergencyIncident,
    }

    @classmethod
    def create(cls, incident_type: "IncidentType | str", **fields) -> IncidentReport:
        key = str(incident_type)
        klass = cls._MAP.get(key)
        if klass is None:
            raise AppError("VALIDATION_ERROR", f"Unknown incident type: {key}")
        return klass(**fields)
