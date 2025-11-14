from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..db import get_db
from ..security import get_current_user, optional_current_user
from ..services.rewards import reward_target_for_status

router = APIRouter(
    prefix="/incidents",
    tags=["incidents"],
)

FOLLOW_UP_INITIAL_MINUTES = 30
FOLLOW_UP_EXTENDED_MINUTES = 120
RESOLVED_STATUSES = {"official-confirmed", "resolved"}
MODERATOR_ROLES = {"admin", "officer"}
APPROVER_ROLES = {"staff", "reporter", "officer"}
ALLOWED_STATUS_UPDATES = {"unverified", "community-confirmed", "official-confirmed", "resolved"}
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
VERIFIER_ROLES = {"admin", "reporter", "officer"}


def _model_dump(payload):
    if hasattr(payload, "model_dump"):
        return payload.model_dump(exclude_unset=True)
    return payload.dict(exclude_unset=True)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _calculate_credibility(payload: schemas.IncidentCreate) -> float:
    """Very lightweight heuristic that rewards structured signals."""
    score = 0.35
    if payload.location_text:
        score += 0.15
    prompt_answers = [payload.still_happening, payload.police_seen, payload.feel_safe_now]
    score += 0.12 * sum(1 for item in prompt_answers if item is not None)
    if payload.safety_sentiment:
        score += 0.08
    if payload.contacted_authorities and payload.contacted_authorities not in {"unknown", "none"}:
        score += 0.12
    return max(0.2, min(0.95, score))


def _notify_verifiers(db: Session, incident: models.Incident, reporter: Optional[models.User]) -> None:
    if not reporter or reporter.role in VERIFIER_ROLES:
        return
    if incident.verification_alert_sent:
        return

    recipients = (
        db.query(models.User)
        .filter(models.User.role.in_(tuple(VERIFIER_ROLES)))
        .all()
    )
    if not recipients:
        return

    location_hint = f" near {incident.location_text}" if incident.location_text else ""
    for recipient in recipients:
        message = (
            f"Incident #{incident.id} from {reporter.display_name or reporter.email}"
            f"{location_hint} needs verification."
        )
        db.add(
            models.Notification(
                recipient_id=recipient.id,
                incident_id=incident.id,
                message=message,
                category="verification",
            )
        )

    incident.verification_alert_sent = True


def _apply_reward_progress(db: Session, incident: models.Incident) -> None:
    if not incident.reporter_user_id:
        return

    target_points = reward_target_for_status(incident.status, incident.credibility_score)
    already_awarded = incident.reward_points_awarded or 0
    if target_points <= already_awarded:
        return

    reporter = incident.reporter
    if not reporter:
        reporter = (
            db.query(models.User)
            .filter(models.User.id == incident.reporter_user_id)
            .first()
        )
        if not reporter:
            return
        incident.reporter = reporter

    reporter.reward_points = (reporter.reward_points or 0) + (target_points - already_awarded)
    incident.reward_points_awarded = target_points
    db.add(reporter)


def _can_view_hidden(user: Optional[models.User]) -> bool:
    return bool(user and user.role in MODERATOR_ROLES)


def _prune_hidden_comments(incident: models.Incident, current_user: Optional[models.User]) -> None:
    if _can_view_hidden(current_user):
        return
    incident.comments = [comment for comment in incident.comments if not comment.is_hidden]


def _assert_moderator(user: Optional[models.User]) -> models.User:
    if not user or user.role not in MODERATOR_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Moderator permissions required")
    return user


def _assert_approver(user: Optional[models.User]) -> models.User:
    if not user or user.role not in APPROVER_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Approval role required")
    return user


def _populate_interaction_metadata(incident: models.Incident, current_user: Optional[models.User]) -> None:
    likes = 0
    unlikes = 0
    viewer = None
    for reaction in incident.reactions:
        if reaction.value == "like":
            likes += 1
        elif reaction.value == "unlike":
            unlikes += 1
        if current_user and reaction.user_id == current_user.id:
            viewer = reaction.value

    incident.likes_count = likes
    incident.unlikes_count = unlikes
    incident.viewer_reaction = viewer

    try:
        incident.comments.sort(key=lambda item: item.created_at or EPOCH, reverse=True)
    except AttributeError:
        sorted_comments = sorted(incident.comments, key=lambda item: item.created_at or EPOCH, reverse=True)
        incident.comments = sorted_comments  # type: ignore[assignment]

    for comment in incident.comments:
        _populate_comment_metadata(comment, current_user)
    _prune_hidden_comments(incident, current_user)


def _populate_comment_metadata(comment: models.IncidentComment, current_user: Optional[models.User]) -> None:
    likes = 0
    unlikes = 0
    viewer = None
    for reaction in comment.reactions:
        if reaction.value == "like":
            likes += 1
        elif reaction.value == "unlike":
            unlikes += 1
        if current_user and reaction.user_id == current_user.id:
            viewer = reaction.value

    comment.likes_count = likes
    comment.unlikes_count = unlikes
    comment.viewer_reaction = viewer


def _reaction_status(db: Session, incident_id: int, current_user: Optional[models.User]) -> schemas.IncidentReactionStatus:
    rows = (
        db.query(models.IncidentReaction.value, func.count(models.IncidentReaction.id))
        .filter(models.IncidentReaction.incident_id == incident_id)
        .group_by(models.IncidentReaction.value)
        .all()
    )
    counts = {value: count for value, count in rows}
    viewer = None
    if current_user:
        record = (
            db.query(models.IncidentReaction)
            .filter(
                models.IncidentReaction.incident_id == incident_id,
                models.IncidentReaction.user_id == current_user.id,
            )
            .first()
        )
        if record:
            viewer = record.value

    return schemas.IncidentReactionStatus(
        likes_count=counts.get("like", 0),
        unlikes_count=counts.get("unlike", 0),
        viewer_reaction=viewer,
    )


def _reload_comment(db: Session, comment_id: int, current_user: Optional[models.User]) -> models.IncidentComment:
    comment = (
        db.query(models.IncidentComment)
        .options(
            selectinload(models.IncidentComment.user),
            selectinload(models.IncidentComment.attachments),
            selectinload(models.IncidentComment.reactions),
        )
        .filter(models.IncidentComment.id == comment_id)
        .first()
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    _populate_comment_metadata(comment, current_user)
    return comment


@router.get("/", response_model=List[schemas.IncidentPublic])
def list_incidents(
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    category_filter: Optional[str] = Query(None, description="Filter by taxonomy category"),
    incident_type: Optional[str] = Query(None, description="Filter by incident type"),
    needs_follow_up: bool = Query(False, description="Only incidents with follow-ups due"),
    include_hidden: bool = Query(False, description="Include hidden incidents (moderators only)"),
    current_user: Optional[models.User] = Depends(optional_current_user),
):
    """Return recent incidents, including follow-up timeline and optional filters."""

    q = (
        db.query(models.Incident)
        .options(
            selectinload(models.Incident.reporter),
            selectinload(models.Incident.follow_ups),
            selectinload(models.Incident.comments).options(
                selectinload(models.IncidentComment.user),
                selectinload(models.IncidentComment.attachments),
                selectinload(models.IncidentComment.reactions),
            ),
            selectinload(models.Incident.reactions),
        )
        .order_by(models.Incident.created_at.desc())
    )

    can_view_hidden = _can_view_hidden(current_user)
    if not can_view_hidden or not include_hidden:
        q = q.filter(models.Incident.is_hidden.is_(False))

    if status_filter:
        q = q.filter(models.Incident.status == status_filter)
    if category_filter:
        q = q.filter(models.Incident.category == category_filter)
    if incident_type:
        q = q.filter(models.Incident.incident_type == incident_type)
    if needs_follow_up:
        q = q.filter(
            models.Incident.follow_up_due_at.isnot(None),
            models.Incident.follow_up_due_at <= _now_utc(),
            ~models.Incident.status.in_(tuple(RESOLVED_STATUSES)),
        )

    incidents = q.limit(limit).all()
    for incident in incidents:
        _populate_interaction_metadata(incident, current_user)

    return incidents


@router.get("/stats", response_model=schemas.IncidentStats)
def incident_stats(db: Session = Depends(get_db)):
    visible_filter = models.Incident.is_hidden.is_(False)
    total = db.query(func.count(models.Incident.id)).filter(visible_filter).scalar() or 0

    status_rows = (
        db.query(models.Incident.status, func.count(models.Incident.id))
        .filter(visible_filter)
        .group_by(models.Incident.status)
        .all()
    )
    by_status = {status: count for status, count in status_rows}

    type_rows = (
        db.query(models.Incident.incident_type, func.count(models.Incident.id))
        .filter(visible_filter)
        .group_by(models.Incident.incident_type)
        .all()
    )
    by_type = {incident_type: count for incident_type, count in type_rows}

    prompt_answered = (
        db.query(func.count(models.Incident.id))
        .filter(
            (models.Incident.still_happening.isnot(None))
            | (models.Incident.police_seen.isnot(None))
            | (models.Incident.feel_safe_now.isnot(None))
        )
        .filter(visible_filter)
        .scalar()
        or 0
    )
    prompt_completion_rate = round(prompt_answered / total, 3) if total else 0.0

    sentiment_rows = (
        db.query(models.Incident.safety_sentiment, func.count(models.Incident.id))
        .filter(models.Incident.safety_sentiment.isnot(None))
        .filter(visible_filter)
        .group_by(models.Incident.safety_sentiment)
        .all()
    )
    sentiment_breakdown = {sentiment: count for sentiment, count in sentiment_rows}

    active_follow_up = (
        db.query(func.count(models.Incident.id))
        .filter(models.Incident.follow_up_due_at.isnot(None))
        .filter(models.Incident.follow_up_due_at <= _now_utc())
        .filter(~models.Incident.status.in_(tuple(RESOLVED_STATUSES)))
        .filter(visible_filter)
        .scalar()
        or 0
    )

    avg_credibility = (
        db.query(func.avg(models.Incident.credibility_score)).filter(visible_filter).scalar() or 0.0
    )

    return schemas.IncidentStats(
        total=total,
        by_status=by_status,
        by_type=by_type,
        active_follow_up=active_follow_up,
        prompt_completion_rate=prompt_completion_rate,
        sentiment_breakdown=sentiment_breakdown,
        avg_credibility=round(float(avg_credibility), 3) if avg_credibility else 0.0,
    )


@router.get("/{incident_id}", response_model=schemas.IncidentPublic)
def get_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(optional_current_user),
):
    incident = (
        db.query(models.Incident)
        .options(
            selectinload(models.Incident.reporter),
            selectinload(models.Incident.follow_ups),
            selectinload(models.Incident.comments).options(
                selectinload(models.IncidentComment.user),
                selectinload(models.IncidentComment.attachments),
                selectinload(models.IncidentComment.reactions),
            ),
            selectinload(models.Incident.reactions),
        )
        .filter(models.Incident.id == incident_id)
        .first()
    )
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    can_view_hidden = _can_view_hidden(current_user)
    if incident.is_hidden and not can_view_hidden:
        raise HTTPException(status_code=404, detail="Incident not found")
    _populate_interaction_metadata(incident, current_user)
    return incident


@router.post("/", response_model=schemas.IncidentPublic, status_code=status.HTTP_201_CREATED)
def create_incident(
    payload: schemas.IncidentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create a new community incident report (unverified by default)."""

    if not payload.category.strip():
        raise HTTPException(status_code=400, detail="Category is required.")

    if payload.location_text and len(payload.location_text) > 255:
        raise HTTPException(status_code=400, detail="location_text too long.")

    follow_up_due_at = _now_utc() + timedelta(minutes=FOLLOW_UP_INITIAL_MINUTES)
    if payload.still_happening is False:
        follow_up_due_at = None
    credibility_score = _calculate_credibility(payload)
    alias = (payload.reporter_alias or "").strip()
    if not alias:
        alias = (current_user.display_name or "") or current_user.email.split("@")[0]

    row = models.Incident(
        category=payload.category.strip(),
        description=payload.description.strip(),
        location_text=(payload.location_text or "").strip() or None,
        lat=payload.lat,
        lng=payload.lng,
        incident_type=payload.incident_type,
        still_happening=payload.still_happening,
        feel_safe_now=payload.feel_safe_now,
        police_seen=payload.police_seen,
        contacted_authorities=payload.contacted_authorities or "unknown",
        safety_sentiment=payload.safety_sentiment,
        status=payload.status or "unverified",
        reporter_alias=alias or None,
        follow_up_due_at=follow_up_due_at,
        credibility_score=credibility_score,
        reporter_user_id=current_user.id,
    )
    db.add(row)
    db.flush()
    row.reporter = current_user
    _notify_verifiers(db, row, current_user)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{incident_id}", response_model=schemas.IncidentPublic)
def update_incident(
    incident_id: int,
    payload: schemas.IncidentUpdate,
    db: Session = Depends(get_db),
):
    incident = (
        db.query(models.Incident)
        .options(selectinload(models.Incident.follow_ups))
        .filter(models.Incident.id == incident_id)
        .first()
    )
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    update_data = _model_dump(payload)
    if "credibility_score" in update_data and update_data["credibility_score"] is not None:
        update_data["credibility_score"] = max(0.0, min(1.0, update_data["credibility_score"]))

    for field, value in update_data.items():
        setattr(incident, field, value)

    incident.updated_at = _now_utc()
    _apply_reward_progress(db, incident)
    db.add(incident)
    db.commit()
    db.refresh(incident)
    return incident


@router.post(
    "/{incident_id}/follow-ups",
    response_model=schemas.IncidentFollowUpPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_follow_up(
    incident_id: int,
    payload: schemas.IncidentFollowUpCreate,
    db: Session = Depends(get_db),
):
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    follow_up = models.IncidentFollowUp(
        incident_id=incident.id,
        status=payload.status,
        notes=(payload.notes or "").strip() or None,
        still_happening=payload.still_happening,
        contacted_authorities=payload.contacted_authorities,
        feel_safe_now=payload.feel_safe_now,
        safety_sentiment=payload.safety_sentiment,
        created_by=(payload.created_by or "").strip() or None,
    )
    db.add(follow_up)

    if payload.status:
        incident.status = payload.status
    if payload.still_happening is not None:
        incident.still_happening = payload.still_happening
    if payload.feel_safe_now is not None:
        incident.feel_safe_now = payload.feel_safe_now
    if payload.contacted_authorities:
        incident.contacted_authorities = payload.contacted_authorities
    if payload.safety_sentiment:
        incident.safety_sentiment = payload.safety_sentiment

    if payload.still_happening:
        incident.follow_up_due_at = _now_utc() + timedelta(minutes=FOLLOW_UP_EXTENDED_MINUTES)
    elif payload.still_happening is False:
        incident.follow_up_due_at = None

    incident.updated_at = _now_utc()
    _apply_reward_progress(db, incident)
    db.add(incident)
    db.commit()
    db.refresh(follow_up)
    return follow_up


@router.post(
    "/{incident_id}/comments",
    response_model=schemas.IncidentCommentPublic,
    status_code=status.HTTP_201_CREATED,
)
def create_comment(
    incident_id: int,
    payload: schemas.IncidentCommentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    incident = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")

    comment = models.IncidentComment(
        incident=incident,
        user=current_user,
        body=body,
    )
    db.add(comment)
    db.flush()

    for media in payload.media:
        data = (media.data_base64 or "").strip()
        if not data:
            continue
        media_type = media.media_type
        if media_type not in {"image", "video"}:
            continue
        attachment = models.IncidentCommentAttachment(
            comment_id=comment.id,
            media_type=media_type,
            content_type=(media.content_type or "").strip() or None,
            data_base64=data,
            filename=(media.filename or "").strip() or None,
        )
        db.add(attachment)

    db.commit()

    return _reload_comment(db, comment.id, current_user)


@router.post(
    "/{incident_id}/reactions",
    response_model=schemas.IncidentReactionStatus,
)
def set_incident_reaction(
    incident_id: int,
    payload: schemas.IncidentReactionUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    incident_exists = db.query(models.Incident.id).filter(models.Incident.id == incident_id).first()
    if not incident_exists:
        raise HTTPException(status_code=404, detail="Incident not found")

    reaction = (
        db.query(models.IncidentReaction)
        .filter(
            models.IncidentReaction.incident_id == incident_id,
            models.IncidentReaction.user_id == current_user.id,
        )
        .first()
    )

    if payload.action == "clear":
        if reaction:
            db.delete(reaction)
            db.commit()
        return _reaction_status(db, incident_id, current_user)

    if reaction:
        reaction.value = payload.action
    else:
        reaction = models.IncidentReaction(
            incident_id=incident_id,
            user_id=current_user.id,
            value=payload.action,
        )
        db.add(reaction)

    db.commit()
    return _reaction_status(db, incident_id, current_user)


@router.post(
    "/{incident_id}/comments/{comment_id}/reactions",
    response_model=schemas.IncidentCommentPublic,
)
def set_comment_reaction(
    incident_id: int,
    comment_id: int,
    payload: schemas.IncidentCommentReactionUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    comment = (
        db.query(models.IncidentComment)
        .filter(
            models.IncidentComment.id == comment_id,
            models.IncidentComment.incident_id == incident_id,
        )
        .first()
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    reaction = (
        db.query(models.IncidentCommentReaction)
        .filter(
            models.IncidentCommentReaction.comment_id == comment_id,
            models.IncidentCommentReaction.user_id == current_user.id,
        )
        .first()
    )

    if payload.action == "clear":
        if reaction:
            db.delete(reaction)
            db.commit()
        return _reload_comment(db, comment_id, current_user)

    if reaction:
        reaction.value = payload.action
    else:
        reaction = models.IncidentCommentReaction(
            comment_id=comment_id,
            user_id=current_user.id,
            value=payload.action,
        )
        db.add(reaction)

    db.commit()
    return _reload_comment(db, comment_id, current_user)


@router.patch(
    "/{incident_id}/visibility",
    response_model=schemas.IncidentPublic,
)
def update_incident_visibility(
    incident_id: int,
    payload: schemas.ModerationToggle,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    moderator = _assert_moderator(current_user)
    incident = (
        db.query(models.Incident)
        .options(
            selectinload(models.Incident.reporter),
            selectinload(models.Incident.follow_ups),
            selectinload(models.Incident.comments).options(
                selectinload(models.IncidentComment.user),
                selectinload(models.IncidentComment.attachments),
                selectinload(models.IncidentComment.reactions),
            ),
            selectinload(models.Incident.reactions),
        )
        .filter(models.Incident.id == incident_id)
        .first()
    )
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    incident.is_hidden = payload.hidden
    db.add(incident)
    db.commit()
    db.refresh(incident)
    _populate_interaction_metadata(incident, moderator)
    return incident


@router.patch(
    "/{incident_id}/comments/{comment_id}/visibility",
    response_model=schemas.IncidentCommentPublic,
)
def update_comment_visibility(
    incident_id: int,
    comment_id: int,
    payload: schemas.CommentModerationToggle,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    moderator = _assert_moderator(current_user)
    comment = (
        db.query(models.IncidentComment)
        .options(
            selectinload(models.IncidentComment.user),
            selectinload(models.IncidentComment.attachments),
            selectinload(models.IncidentComment.reactions),
        )
        .filter(
            models.IncidentComment.id == comment_id,
            models.IncidentComment.incident_id == incident_id,
        )
        .first()
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    comment.is_hidden = payload.hidden
    db.add(comment)
    db.commit()
    db.refresh(comment)
    _populate_comment_metadata(comment, moderator)
    return comment


@router.patch(
    "/{incident_id}/status",
    response_model=schemas.IncidentPublic,
)
def update_incident_status(
    incident_id: int,
    payload: schemas.IncidentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    reviewer = _assert_approver(current_user)
    desired = payload.status.strip()
    if desired not in ALLOWED_STATUS_UPDATES:
        raise HTTPException(status_code=400, detail="Unsupported status selection")
    incident = (
        db.query(models.Incident)
        .options(
            selectinload(models.Incident.reporter),
            selectinload(models.Incident.follow_ups),
            selectinload(models.Incident.comments).options(
                selectinload(models.IncidentComment.user),
                selectinload(models.IncidentComment.attachments),
                selectinload(models.IncidentComment.reactions),
            ),
            selectinload(models.Incident.reactions),
        )
        .filter(models.Incident.id == incident_id)
        .first()
    )
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    incident.status = desired
    incident.updated_at = _now_utc()
    _apply_reward_progress(db, incident)
    db.add(incident)
    db.commit()
    db.refresh(incident)
    _populate_interaction_metadata(incident, reviewer)
    return incident
