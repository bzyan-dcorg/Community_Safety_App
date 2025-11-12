from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..db import get_db
from ..security import get_current_user
from ..services.rewards import tier_progress

router = APIRouter(prefix="/users", tags=["users"])

VERIFIED_STATUSES = {"community-confirmed", "official-confirmed", "resolved"}


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
    )
