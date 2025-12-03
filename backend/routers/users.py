from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..db import get_db
from ..security import get_current_user
from ..services.rewards import tier_progress
from ..services.ledger import record_reward_entry

router = APIRouter(prefix="/users", tags=["users"])

VERIFIED_STATUSES = {"community-confirmed", "official-confirmed", "resolved"}
ADMIN_ROLE = "admin"


def _assert_admin(user: models.User) -> models.User:
    if user.role != ADMIN_ROLE:
        raise HTTPException(status_code=403, detail="Admin permissions required")
    return user


def _serialize_posts(incidents: List[models.Incident]) -> List[schemas.UserPostBrief]:
    serialized = []
    for incident in incidents:
        likes = 0
        if hasattr(incident, "reactions"):
            for reaction in incident.reactions:
                if reaction.value == "like":
                    likes += 1
        serialized.append(
            schemas.UserPostBrief(
                id=incident.id,
                category=incident.category,
                description=incident.description,
                status=incident.status,
                created_at=incident.created_at,
                likes_count=likes,
                reward_points_awarded=incident.reward_points_awarded or 0,
            )
        )
    return serialized


@router.get("/me/overview", response_model=schemas.UserOverview)
def get_my_overview(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    incidents = (
        db.query(models.Incident)
        .options(selectinload(models.Incident.reactions))
        .filter(models.Incident.reporter_user_id == current_user.id)
        .order_by(models.Incident.created_at.desc())
        .limit(25)
        .all()
    )

    total_posts = (
        db.query(func.count(models.Incident.id))
        .filter(models.Incident.reporter_user_id == current_user.id)
        .scalar()
        or 0
    )

    confirmed_posts = (
        db.query(func.count(models.Incident.id))
        .filter(
            models.Incident.reporter_user_id == current_user.id,
            models.Incident.status.in_(tuple(VERIFIED_STATUSES)),
        )
        .scalar()
        or 0
    )

    total_likes = (
        db.query(func.count(models.IncidentReaction.id))
        .join(
            models.Incident,
            models.IncidentReaction.incident_id == models.Incident.id,
        )
        .filter(
            models.Incident.reporter_user_id == current_user.id,
            models.IncidentReaction.value == "like",
        )
        .scalar()
        or 0
    )

    unread_notifications = (
        db.query(func.count(models.Notification.id))
        .filter(
            models.Notification.recipient_id == current_user.id,
            models.Notification.status == "unread",
        )
        .scalar()
        or 0
    )

    ledger_entries = (
        db.query(models.RewardLedgerEntry)
        .filter(models.RewardLedgerEntry.user_id == current_user.id)
        .order_by(models.RewardLedgerEntry.created_at.desc())
        .limit(15)
        .all()
    )

    progress = tier_progress(current_user.reward_points)

    rewards = schemas.UserRewardSummary(
        total_posts=total_posts,
        confirmed_posts=confirmed_posts,
        total_likes=total_likes,
        points=current_user.reward_points,
        membership_tier=current_user.membership_tier,
        next_tier=progress.get("next"),
        points_to_next=progress.get("points_to_next"),
    )

    return schemas.UserOverview(
        profile=current_user,
        rewards=rewards,
        recent_posts=_serialize_posts(incidents),
        unread_notifications=unread_notifications,
        ledger=ledger_entries,
    )


@router.get("/", response_model=List[schemas.UserProfile])
def search_users(
    query: Optional[str] = Query(None, max_length=255, description="Filter by email or display name"),
    limit: int = Query(25, ge=1, le=200),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _assert_admin(current_user)
    qset = db.query(models.User)
    if query:
        like = f"%{query.strip().lower()}%"
        qset = qset.filter(
            func.lower(models.User.email).like(like)
            | func.lower(models.User.display_name).like(like)
        )
    return qset.order_by(models.User.created_at.desc()).limit(limit).all()


@router.patch("/{user_id}/rewards", response_model=schemas.UserProfile)
def update_user_rewards(
    user_id: int,
    payload: schemas.UserRewardUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _assert_admin(current_user)
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    current_points = int(user.reward_points or 0)
    target_points = int(payload.reward_points)
    delta = target_points - current_points
    if delta != 0:
        description = f"Admin adjustment → {target_points} pts"
        record_reward_entry(
            db,
            user,
            delta,
            source="admin-adjustment",
            description=description,
        )
    else:
        db.add(user)
    db.commit()
    db.refresh(user)
    return user
