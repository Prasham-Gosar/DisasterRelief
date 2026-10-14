"""Business rules and transactions for incidents (router -> service -> model)."""
from math import cos, radians

from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.core.enums import AlertType, IncidentStatus, IncidentType, Severity
from app.core.errors import AppError
from app.models.audit_log import AuditLog
from app.services import audit_service
from app.models.base import utcnow
from app.models.incident import DUPLICATE_RADIUS_M, DUPLICATE_WINDOW, IncidentReport
from app.models.user import Citizen, Coordinator, User
from app.models.notification import Notification
from app.schemas.incident import (
    HistoryItem,
    IncidentCreate,
    IncidentDetail,
    IncidentListItem,
    IncidentListResponse,
    IncidentStats,
    NearbyItem,
    TimelineItem,
    TrackEdit,
    TrackNotification,
    TrackView,
    _aware,
    normalize_phone,
)
from app.services.geo import haversine_m
from app.services.notification_service import NotificationService

_DONE = (IncidentStatus.resolved.value, IncidentStatus.rejected.value, IncidentStatus.closed.value)


class IncidentService:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------ submit
    def _find_or_create_citizen(self, phone: str, name: str | None) -> Citizen:
        """Report.Submit.Anonymous: find-or-create a Citizen by phone."""
        citizen = self.db.scalar(select(Citizen).where(Citizen.phone_number == phone))
        if citizen is None:
            citizen = Citizen(phone_number=phone, name=name or "Anonymous")
            self.db.add(citizen)
            self.db.flush()
        elif name and citizen.name in (None, "Anonymous"):
            citizen.name = name
        return citizen

    def submit(self, payload: IncidentCreate, photos: list[str] | None = None) -> IncidentReport:
        citizen = self._find_or_create_citizen(payload.reporter_phone, payload.reporter_name)
        data = payload.model_dump(mode="json", exclude_none=True, exclude={"reporter_name"})
        if photos:
            data["photos"] = photos
        report_id = citizen.submit_report(self.db, data)  # SD msg 1-3
        report = self.db.get(IncidentReport, report_id)

        notifier = NotificationService(self.db)
        coordinators = list(self.db.scalars(select(Coordinator).where(Coordinator.is_active.is_(True))))
        notifier.send(  # SD msg 4: new-report alert to all active coordinators
            AlertType.new_report,
            f"New {report.severity.upper()} {report.incident_type} report at {report.location}",
            coordinators,
            report=report,
        )
        notifier.send(  # CI-1: confirmation to the citizen
            AlertType.new_report,
            f"Your report {report.tracking_ref} has been received.",
            [citizen],
            report=report,
        )
        self.db.commit()
        return report

    # ------------------------------------------------------------------ reads
    def get(self, report_id: int) -> IncidentReport:
        report = self.db.get(IncidentReport, report_id)
        if report is None:
            raise AppError("NOT_FOUND", "Report not found")
        return report

    def detail(self, report_id: int) -> IncidentDetail:
        return IncidentDetail.from_report(self.get(report_id))

    def list_incidents(
        self,
        *,
        status: IncidentStatus | None,
        severity: Severity | None,
        incident_type: IncidentType | None,
        q: str | None,
        possible_duplicate: bool | None,
        page: int,
        page_size: int,
    ) -> IncidentListResponse:
        stmt = select(IncidentReport)
        if status:
            stmt = stmt.where(IncidentReport.status == status.value)
        if severity:
            stmt = stmt.where(IncidentReport.severity == severity.value)
        if incident_type:
            stmt = stmt.where(IncidentReport.incident_type == incident_type.value)
        if possible_duplicate is not None:
            stmt = stmt.where(IncidentReport.possible_duplicate.is_(possible_duplicate))
        if q and q.strip():
            like = f"%{q.strip()}%"
            stmt = stmt.where(
                or_(
                    IncidentReport.location.ilike(like),
                    IncidentReport.description.ilike(like),
                    IncidentReport.tracking_ref.ilike(like),
                    IncidentReport.reporter_phone.ilike(like),
                )
            )
        total = self.db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

        # SF-1: still-open reports first, critical before the rest, then oldest first.
        # Critical open reports therefore always sit on page 1 until resolved/rejected/closed.
        finished = case((IncidentReport.status.in_(_DONE), 1), else_=0)
        sev_rank = case(
            {"critical": 0, "high": 1, "medium": 2, "low": 3}, value=IncidentReport.severity, else_=4
        )
        rows = self.db.scalars(
            stmt.order_by(finished, sev_rank, IncidentReport.created_at.asc(), IncidentReport.id.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return IncidentListResponse(
            items=[IncidentListItem.from_report(r) for r in rows], total=total, page=page, page_size=page_size
        )

    # ------------------------------------------------------------ transitions
    def _notify_citizen(self, report: IncidentReport, alert: AlertType, message: str) -> None:
        recipient = report.reporter or report.reporter_phone
        if recipient:
            NotificationService(self.db).send(alert, message, [recipient], report=report)

    def verify(self, coordinator: User, report_id: int) -> IncidentDetail:
        report = coordinator.verify_report(self.db, report_id)  # SD msg 6 (BR-1 enforced in the model too)
        self._notify_citizen(  # SD msg 7
            report,
            AlertType.verification,
            f"Your report {report.tracking_ref} has been verified. A rescue team will be assigned soon.",
        )
        self.db.commit()
        return IncidentDetail.from_report(report)

    def reject(self, coordinator: User, report_id: int, remark: str | None) -> IncidentDetail:
        report = self.get(report_id)
        report.reject(coordinator, remark)  # SD msg 8: remark mandatory, rejected -> closed
        self._notify_citizen(  # SD msg 9
            report, AlertType.rejection, f"Your report {report.tracking_ref} was rejected: {report.remark}"
        )
        self.db.commit()
        return IncidentDetail.from_report(report)

    def close(self, coordinator: User, report_id: int, closing_note: str | None) -> IncidentDetail:
        report = self.get(report_id)
        if coordinator.role != "coordinator":
            raise AppError("FORBIDDEN", "Only coordinators can close reports")
        note = closing_note.strip() if closing_note and closing_note.strip() else None
        report.transition(IncidentStatus.closed, coordinator, note)  # SD msg 10 fires inside transition()
        self.db.commit()
        return IncidentDetail.from_report(report)

    # ---------------------------------------------------------------- tracking
    def _find_for_citizen(self, tracking_ref: str, phone: str | None) -> IncidentReport:
        """SE-3: the phone must match the reporter, otherwise 404 (never reveal that the ref exists)."""
        not_found = AppError("NOT_FOUND", "No report found for that reference and phone number")
        try:
            clean = normalize_phone(phone or "")
        except ValueError:
            raise not_found
        report = self.db.scalar(
            select(IncidentReport).where(
                IncidentReport.tracking_ref == tracking_ref.strip().upper(),
                IncidentReport.reporter_phone == clean,
            )
        )
        if report is None:
            raise not_found
        return report

    def _track_view(self, report: IncidentReport) -> TrackView:
        logs = self.db.scalars(
            select(AuditLog)
            .where(AuditLog.entity_type == "incident_report", AuditLog.entity_id == report.id)
            .order_by(AuditLog.created_at, AuditLog.id)
        ).all()
        timeline = [
            TimelineItem(
                action=log.action,
                from_status=log.from_status,
                to_status=log.to_status,
                remark=log.remark if log.action == "reject" else None,
                created_at=_aware(log.created_at),
            )
            for log in logs
        ]
        return TrackView(
            tracking_ref=report.tracking_ref,
            incident_type=report.incident_type,
            severity=report.severity,
            status=report.status,
            location=report.location,
            description=report.description,
            remark=report.remark,
            editable=report.status == IncidentStatus.reported.value,
            citizen_subscribed=bool(report.citizen_subscribed),
            created_at=_aware(report.created_at),
            updated_at=_aware(report.updated_at),
            timeline=timeline,
        )

    def track(self, tracking_ref: str, phone: str | None) -> TrackView:
        return self._track_view(self._find_for_citizen(tracking_ref, phone))

    def edit_report(self, tracking_ref: str, phone: str | None, edit: TrackEdit) -> TrackView:
        """Citizen edit. Only location/description (+ pin), only while `reported`, else 409."""
        report = self._find_for_citizen(tracking_ref, phone)
        if report.status != IncidentStatus.reported.value:
            raise AppError(
                "REPORT_NOT_EDITABLE",
                "This report has already been reviewed, so it can no longer be edited. Call 112 for urgent changes.",
            )
        changed: list[str] = []
        if edit.location is not None and edit.location != report.location:
            report.location = edit.location
            changed.append("location")
        if edit.description is not None and edit.description != report.description:
            report.description = edit.description
            changed.append("description")
        if edit.latitude is not None and (edit.latitude, edit.longitude) != (report.latitude, report.longitude):
            report.latitude, report.longitude = edit.latitude, edit.longitude
            changed.append("pin")
        if changed:
            report.updated_at = utcnow()
            audit_service.log(
                self.db, report.reporter, "edit", "incident_report", report.id,
                from_status=report.status, to_status=report.status, remark="Citizen edited: " + ", ".join(changed),
            )
        self.db.commit()
        self.db.refresh(report)
        return self._track_view(report)

    def set_subscription(self, tracking_ref: str, phone: str | None, subscribed: bool) -> TrackView:
        """SD opt [citizen subscribed]: turning it off stops msg 10 for later status changes."""
        report = self._find_for_citizen(tracking_ref, phone)
        report.citizen_subscribed = subscribed
        self.db.commit()
        self.db.refresh(report)
        return self._track_view(report)

    def track_notifications(self, tracking_ref: str, phone: str | None) -> list[TrackNotification]:
        """What the citizen has been sent about this report (their own SMS rows only)."""
        report = self._find_for_citizen(tracking_ref, phone)
        rows = self.db.scalars(
            select(Notification)
            .where(Notification.related_report_id == report.id, Notification.recipient_phone == report.reporter_phone)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
        ).all()
        return [
            TrackNotification(
                id=n.id, message=n.message, alert_type=n.alert_type, channel=n.channel, created_at=_aware(n.created_at)
            )
            for n in rows
        ]

    # ------------------------------------------------------- coordinator extras
    def history(self, report_id: int) -> list[HistoryItem]:
        """Full audit trail, newest last (SE-5)."""
        self.get(report_id)
        logs = self.db.scalars(
            select(AuditLog)
            .where(AuditLog.entity_type == "incident_report", AuditLog.entity_id == report_id)
            .order_by(AuditLog.created_at, AuditLog.id)
        ).all()
        return [
            HistoryItem(
                id=log.id, actor=log.actor_label, action=log.action, from_status=log.from_status,
                to_status=log.to_status, remark=log.remark, created_at=_aware(log.created_at),
            )
            for log in logs
        ]

    def nearby(self, report_id: int) -> list[NearbyItem]:
        """Same type, within 200 m and 2 h of this report: the duplicate rule, shown to the coordinator."""
        report = self.get(report_id)
        if report.latitude is None or report.longitude is None:
            return []
        created = _aware(report.created_at)
        margin_m = DUPLICATE_RADIUS_M * 1.25
        dlat = margin_m / 111_320
        dlng = margin_m / (111_320 * max(cos(radians(report.latitude)), 0.01))
        candidates = self.db.scalars(
            select(IncidentReport).where(
                IncidentReport.id != report.id,
                IncidentReport.incident_type == report.incident_type,
                IncidentReport.created_at >= created - DUPLICATE_WINDOW,
                IncidentReport.created_at <= created + DUPLICATE_WINDOW,
                IncidentReport.latitude.between(report.latitude - dlat, report.latitude + dlat),
                IncidentReport.longitude.between(report.longitude - dlng, report.longitude + dlng),
            )
        ).all()
        out: list[NearbyItem] = []
        for c in candidates:
            d = haversine_m(report.latitude, report.longitude, c.latitude, c.longitude)
            if d > DUPLICATE_RADIUS_M:
                continue
            apart = abs(int((_aware(c.created_at) - created).total_seconds() // 60))
            out.append(
                NearbyItem(
                    id=c.id, tracking_ref=c.tracking_ref, incident_type=c.incident_type, severity=c.severity,
                    status=c.status, location=c.location, distance_m=round(d), minutes_apart=apart,
                    created_at=_aware(c.created_at),
                )
            )
        return sorted(out, key=lambda n: n.distance_m)

    def stats(self) -> IncidentStats:
        """Counts for the queue's stat cards. Every status/severity is present, even at 0."""
        by_status = {s.value: 0 for s in IncidentStatus}
        for status, n in self.db.execute(select(IncidentReport.status, func.count()).group_by(IncidentReport.status)):
            by_status[status] = n
        by_sev = {s.value: 0 for s in Severity}
        for sev, n in self.db.execute(select(IncidentReport.severity, func.count()).group_by(IncidentReport.severity)):
            by_sev[sev] = n
        critical_open = (
            self.db.scalar(
                select(func.count()).select_from(IncidentReport).where(
                    IncidentReport.severity == Severity.critical.value, IncidentReport.status.not_in(_DONE)
                )
            )
            or 0
        )
        return IncidentStats(
            total=sum(by_status.values()), by_status=by_status, by_severity=by_sev, critical_open=critical_open
        )
