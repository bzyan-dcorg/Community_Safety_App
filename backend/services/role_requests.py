"""Helpers for sensitive role workflows (staff / reporter / officer)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from .. import models

VALID_ROLES = {"resident", "staff", "reporter", "officer"}
SENSITIVE_ROLES = {"staff", "reporter", "officer"}
RESOLVED_ROLE_STATUSES = {"approved", "denied"}


def requires_manual_approval(role: Optional[str]) -> bool:
    if not role:
        return False
    return role in SENSITIVE_ROLES


def queue_role_request(
    db: Session,
    user: models.User,
    requested_role: str,
    justification: Optional[str] = None,
) -> models.RoleRequest:
    """Create or refresh a pending role request for this user."""
    existing = (
        db.query(models.RoleRequest)
        .filter(
            models.RoleRequest.user_id == user.id,
            models.RoleRequest.status == "pending",
        )
        .order_by(models.RoleRequest.created_at.desc())
        .first()
    )
    if existing:
        existing.requested_role = requested_role
        if justification:
            existing.justification = justification
        existing.decided_at = None
        existing.reviewer_id = None
        existing.reviewer_notes = None
        db.add(existing)
        return existing

    request = models.RoleRequest(
        user_id=user.id,
        requested_role=requested_role,
        justification=justification,
        status="pending",
    )
    db.add(request)
    return request


def resolve_role_request(
    record: models.RoleRequest,
    status: str,
    reviewer_id: int,
    notes: Optional[str] = None,
) -> None:
    """Set the terminal state of a role request."""
    if status not in RESOLVED_ROLE_STATUSES:
        raise ValueError("Unsupported role request status")
    record.status = status
    record.reviewer_id = reviewer_id
    record.reviewer_notes = notes
    record.decided_at = datetime.now(timezone.utc)
