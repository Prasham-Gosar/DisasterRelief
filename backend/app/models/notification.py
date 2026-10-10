import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import Channel, DeliveryStatus
from app.models.base import Base, utcnow
from app.models.user import User

logger = logging.getLogger("drrcp.notify")


def _mask(phone: str | None) -> str:
    if not phone:
        return "unknown"
    return phone[:2] + "x" * max(len(phone) - 2, 0)


class Notification(Base):
    """notification_id = id."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    message: Mapped[str] = mapped_column(Text)
    channel: Mapped[str] = mapped_column(String(10))
    alert_type: Mapped[str] = mapped_column(String(30))
    recipient_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), index=True)
    recipient_phone: Mapped[Optional[str]] = mapped_column(String(15), index=True)
    related_report_id: Mapped[Optional[int]] = mapped_column(ForeignKey("incident_reports.id"), index=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    delivery_status: Mapped[str] = mapped_column(String(10), default=DeliveryStatus.queued.value)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    @property
    def notification_id(self) -> int:
        return self.id

    def send(self) -> None:
        """send(): simulated gateway. Marks the row sent and logs the SMS/push/email line."""
        self.delivery_status = DeliveryStatus.sent.value
        self.sent_at = utcnow()
        if self.channel == Channel.sms.value:
            logger.info("[SMS -> %s] %s", _mask(self.recipient_phone), self.message)
        elif self.channel == Channel.push.value:
            logger.info("[PUSH -> user %s] %s", self.recipient_user_id, self.message)
        elif self.channel == Channel.email.value:
            logger.info("[EMAIL -> user %s] %s", self.recipient_user_id, self.message)
        else:
            logger.info("[IN-APP -> user %s] %s", self.recipient_user_id, self.message)

    @staticmethod
    def filter_by_channel(user_or_phone: "User | str", preferred: Channel | None = None) -> Channel:
        """filterByChannel() (SD msg 5).

        registered user (has a login) -> in_app; email only -> email; phone-only citizen -> sms.
        A raw phone string is always sms.
        """
        if preferred is not None:
            return Channel(preferred)
        if isinstance(user_or_phone, str):
            return Channel.sms
        user = user_or_phone
        if user.password_hash:
            return Channel.in_app
        if user.email:
            return Channel.email
        if user.phone_number:
            return Channel.sms
        return Channel.in_app
