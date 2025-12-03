from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..db import get_db
from ..security import get_current_user
from ..services.ledger import record_reward_entry
from ..services.rewards import get_reward_partner, list_reward_partners

router = APIRouter(prefix="/rewards", tags=["rewards"])

REVIEWER_ROLES = {"admin", "staff"}


def _assert_reviewer(user: models.User) -> models.User:
    if user.role not in REVIEWER_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Reviewer permissions required")
    return user


@router.get("/partners", response_model=List[schemas.RewardPartner])
def reward_partners():
    """List merchant partners that currently accept manual redemptions."""
    return [schemas.RewardPartner(**partner) for partner in list_reward_partners()]


@router.get("/ledger", response_model=List[schemas.RewardLedgerEntryPublic])
def my_reward_ledger(
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return the latest ledger entries for the authenticated user."""
    entries = (
        db.query(models.RewardLedgerEntry)
        .filter(models.RewardLedgerEntry.user_id == current_user.id)
        .order_by(models.RewardLedgerEntry.created_at.desc())
        .limit(limit)
        .all()
    )
    return entries


@router.post(
    "/redeem",
    response_model=schemas.RewardLedgerEntryPublic,
    status_code=status.HTTP_201_CREATED,
)
def request_redemption(
    payload: schemas.RewardRedemptionRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create a manual redemption request and deduct points immediately."""
    partner = get_reward_partner(payload.partner_id)
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")

    quantity = max(1, payload.quantity or 1)
    points_cost = int(partner["points_cost"])
    total_cost = points_cost * quantity
    if total_cost <= 0:
        raise HTTPException(status_code=400, detail="Partner configuration invalid.")

    description = f"{partner['name']} redemption ×{quantity}"
    if payload.notes:
        description = f"{description} · {payload.notes.strip()}"

    try:
        entry = record_reward_entry(
            db,
            current_user,
            -total_cost,
            source="redemption",
            description=description,
            partner_id=str(partner["id"]),
            partner_name=str(partner["name"]),
            status="pending",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    db.commit()
    db.refresh(entry)
    return entry


@router.get("/requests", response_model=List[schemas.RewardLedgerEntryPublic])
def pending_redemption_requests(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Allow staff/admin users to review pending manual redemptions."""
    _assert_reviewer(current_user)
    entries = (
        db.query(models.RewardLedgerEntry)
        .options(selectinload(models.RewardLedgerEntry.user))
        .filter(
            models.RewardLedgerEntry.source == "redemption",
            models.RewardLedgerEntry.status == "pending",
        )
        .order_by(models.RewardLedgerEntry.created_at.asc())
        .limit(limit)
        .all()
    )
    return entries


@router.post(
    "/requests/{entry_id}/decision",
    response_model=schemas.RewardLedgerEntryPublic,
)
def decide_redemption_request(
    entry_id: int,
    payload: schemas.RewardRedemptionDecision,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    reviewer = _assert_reviewer(current_user)
    entry = (
        db.query(models.RewardLedgerEntry)
        .options(selectinload(models.RewardLedgerEntry.user))
        .filter(
            models.RewardLedgerEntry.id == entry_id,
            models.RewardLedgerEntry.source == "redemption",
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Redemption request not found")
    if entry.status != "pending":
        raise HTTPException(status_code=400, detail="Request already processed")
    reward_owner = entry.user
    if not reward_owner:
        reward_owner = (
            db.query(models.User).filter(models.User.id == entry.user_id).first()
        )
        if not reward_owner:
            raise HTTPException(status_code=404, detail="User not found for this request")
        entry.user = reward_owner

    note_suffix = f" · {payload.note.strip()}" if payload.note else ""

    if payload.action == "fulfill":
        entry.status = "fulfilled"
        entry.description = f"{entry.description}{note_suffix}"
        db.add(entry)
    elif payload.action == "cancel":
        entry.status = "cancelled"
        entry.description = f"{entry.description}{note_suffix}"
        db.add(entry)
        refund_amount = abs(int(entry.delta or 0))
        if refund_amount:
            try:
                record_reward_entry(
                    db,
                    reward_owner,
                    refund_amount,
                    source="redemption-refund",
                    description=f"Refund for request #{entry.id}",
                    partner_id=entry.partner_id,
                    partner_name=entry.partner_name,
                    status="posted",
                )
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
    else:
        raise HTTPException(status_code=400, detail="Unsupported action")

    db.commit()
    db.refresh(entry)
    return entry
