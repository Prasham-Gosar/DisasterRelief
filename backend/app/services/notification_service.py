from sqlalchemy.orm import Session

from app.core.enums import AlertType, Channel
from app.models.incident import IncidentReport
from app.models.notification import Notification
from app.models.user import User


class NotificationService:
    """Contract 0.9. A str recipient is a raw phone number (anonymous citizen)."""

    def __init__(self, db: Session):
        self.db = db

    def send(
        self,
        alert_type: AlertType,
        message: str,
        recipients: "list[User | str]",
        report: IncidentReport | None = None,
        channel: Channel | None = None,
    ) -> list[Notification]:
        created: list[Notification] = []
        seen: set[tuple] = set()
        for r in recipients:
            key = ("user", r.id) if isinstance(r, User) else ("phone", str(r))
            if key in seen:
                continue
            seen.add(key)

            chosen = Notification.filter_by_channel(r, channel)  # SD msg 5
            note = Notification(
                message=message,
                channel=chosen.value,
                alert_type=AlertType(alert_type).value,
                recipient_user_id=r.id if isinstance(r, User) else None,
                recipient_phone=r.phone_number if isinstance(r, User) else str(r),
                related_report_id=report.id if report is not None else None,
            )
            self.db.add(note)
            note.send()  # SD msg 4 / 7 / 9 / 10
            created.append(note)
        self.db.flush()
        return created
