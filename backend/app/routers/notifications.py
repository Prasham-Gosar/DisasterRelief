from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.errors import AppError
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationListResponse, NotificationOut

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListResponse)
def my_notifications(
    unread_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    mine = Notification.recipient_user_id == user.id
    stmt = select(Notification).where(mine)
    if unread_only:
        stmt = stmt.where(Notification.is_read.is_(False))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    unread = db.scalar(select(func.count()).select_from(Notification).where(mine, Notification.is_read.is_(False))) or 0
    rows = db.scalars(
        stmt.order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return NotificationListResponse(
        items=[NotificationOut.model_validate(n) for n in rows],
        total=total, page=page, page_size=page_size, unread_count=unread,
    )


@router.post("/read-all")
def read_all(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    result = db.execute(
        update(Notification)
        .where(Notification.recipient_user_id == user.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    db.commit()
    return {"updated": result.rowcount}


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    note = db.scalar(
        select(Notification).where(Notification.id == notification_id, Notification.recipient_user_id == user.id)
    )
    if note is None:
        raise AppError("NOT_FOUND", "Notification not found")
    note.is_read = True
    db.commit()
    return NotificationOut.model_validate(note)
