from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db
from ..security import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/", response_model=List[schemas.NotificationPublic])
def list_notifications(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    status_filter: Optional[str] = Query(None, regex="^(read|unread)$"),
    limit: int = Query(20, ge=1, le=100),
):
    query = (
        db.query(models.Notification)
        .filter(models.Notification.recipient_id == current_user.id)
        .order_by(models.Notification.created_at.desc())
    )
    if status_filter:
        query = query.filter(models.Notification.status == status_filter)
    return query.limit(limit).all()


@router.post(
    "/{notification_id}/read",
    response_model=schemas.NotificationPublic,
    status_code=status.HTTP_200_OK,
)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    notification = (
        db.query(models.Notification)
        .filter(
            models.Notification.id == notification_id,
            models.Notification.recipient_id == current_user.id,
        )
        .first()
    )
    if not notification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    if notification.status != "read":
        notification.status = "read"
        notification.read_at = _now_utc()
        db.add(notification)
        db.commit()
        db.refresh(notification)
    return notification
