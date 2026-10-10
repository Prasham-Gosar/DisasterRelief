"""Business rules and transactions for incidents (router -> service -> model)."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import AlertType
from app.models.incident import IncidentReport
from app.models.user import Citizen, Coordinator
from app.schemas.incident import IncidentCreate
from app.services.notification_service import NotificationService


class IncidentService:
    def __init__(self, db: Session):
        self.db = db

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

    def submit(self, payload: IncidentCreate) -> IncidentReport:
        citizen = self._find_or_create_citizen(payload.reporter_phone, payload.reporter_name)
        data = payload.model_dump(mode="json", exclude_none=True, exclude={"reporter_name"})
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
