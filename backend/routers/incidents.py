from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..db import get_db

router = APIRouter(
    prefix="/incidents",
    tags=["incidents"],
)

FOLLOW_UP_INITIAL_MINUTES = 30
FOLLOW_UP_EXTENDED_MINUTES = 120
RESOLVED_STATUSES = {"official-confirmed", "resolved"}


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


@router.get("/", response_model=List[schemas.IncidentPublic])
def list_incidents(
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    category_filter: Optional[str] = Query(None, description="Filter by taxonomy category"),
    incident_type: Optional[str] = Query(None, description="Filter by incident type"),
    needs_follow_up: bool = Query(False, description="Only incidents with follow-ups due"),
):
    """Return recent incidents, including follow-up timeline and optional filters."""

    q = (
        db.query(models.Incident)
        .options(selectinload(models.Incident.follow_ups))
        .order_by(models.Incident.created_at.desc())
    )

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

    return q.limit(limit).all()


@router.get("/stats", response_model=schemas.IncidentStats)
def incident_stats(db: Session = Depends(get_db)):
    total = db.query(func.count(models.Incident.id)).scalar() or 0

    status_rows = (
        db.query(models.Incident.status, func.count(models.Incident.id))
        .group_by(models.Incident.status)
        .all()
    )
    by_status = {status: count for status, count in status_rows}

    type_rows = (
        db.query(models.Incident.incident_type, func.count(models.Incident.id))
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
        .scalar()
        or 0
    )
    prompt_completion_rate = round(prompt_answered / total, 3) if total else 0.0

    sentiment_rows = (
        db.query(models.Incident.safety_sentiment, func.count(models.Incident.id))
        .filter(models.Incident.safety_sentiment.isnot(None))
        .group_by(models.Incident.safety_sentiment)
        .all()
    )
    sentiment_breakdown = {sentiment: count for sentiment, count in sentiment_rows}

    active_follow_up = (
        db.query(func.count(models.Incident.id))
        .filter(models.Incident.follow_up_due_at.isnot(None))
        .filter(models.Incident.follow_up_due_at <= _now_utc())
        .filter(~models.Incident.status.in_(tuple(RESOLVED_STATUSES)))
        .scalar()
        or 0
    )

    avg_credibility = db.query(func.avg(models.Incident.credibility_score)).scalar() or 0.0

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
def get_incident(incident_id: int, db: Session = Depends(get_db)):
    incident = (
        db.query(models.Incident)
        .options(selectinload(models.Incident.follow_ups))
        .filter(models.Incident.id == incident_id)
        .first()
    )
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident


@router.post("/", response_model=schemas.IncidentPublic, status_code=status.HTTP_201_CREATED)
def create_incident(
    payload: schemas.IncidentCreate,
    db: Session = Depends(get_db),
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
        reporter_alias=(payload.reporter_alias or "").strip() or None,
        follow_up_due_at=follow_up_due_at,
        credibility_score=credibility_score,
    )
    db.add(row)
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

    db.add(incident)
    db.commit()
    db.refresh(follow_up)
    return follow_up
