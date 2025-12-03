"""Utilities for recording reward ledger entries safely."""

from __future__ import annotations

from sqlalchemy.orm import Session

from .. import models

MAX_DESCRIPTION_LENGTH = 255


def _truncate_description(value: str) -> str:
    trimmed = (value or "Reward update").strip()
    if len(trimmed) <= MAX_DESCRIPTION_LENGTH:
        return trimmed
    return trimmed[: MAX_DESCRIPTION_LENGTH - 3].rstrip() + "..."


def record_reward_entry(
    db: Session,
    user: models.User,
    delta: int,
    source: str,
    description: str,
    *,
    partner_id: str | None = None,
    partner_name: str | None = None,
    status: str = "posted",
) -> models.RewardLedgerEntry:
    """Persist a new ledger entry and keep the aggregate reward_points in sync."""
    if delta == 0:
        raise ValueError("delta must be non-zero")

    current_balance = int(user.reward_points or 0)
    next_balance = current_balance + delta
    if next_balance < 0:
        raise ValueError("Insufficient reward points for this operation.")

    entry = models.RewardLedgerEntry(
        user_id=user.id,
        delta=delta,
        source=source,
        description=_truncate_description(description),
        partner_id=partner_id,
        partner_name=partner_name,
        status=status,
    )

    user.reward_points = next_balance
    db.add(user)
    db.add(entry)
    return entry
