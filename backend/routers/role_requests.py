from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from .. import models, schemas
from ..db import get_db
from ..security import get_current_user
from ..services import role_requests as role_service

router = APIRouter(prefix="/role-requests", tags=["roles"])

REVIEWER_ROLES = {"admin", "officer"}
VALID_STATUSES = {"pending", *role_service.RESOLVED_ROLE_STATUSES}


def _assert_reviewer(user: models.User) -> models.User:
    if user.role not in REVIEWER_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    return user


@router.get("/", response_model=List[schemas.RoleRequestPublic])
def list_role_requests(
    status_filter: Optional[str] = Query(None, description="pending/approved/denied"),
    limit: int = Query(100, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _assert_reviewer(current_user)
    q = (
        db.query(models.RoleRequest)
        .options(
            selectinload(models.RoleRequest.user),
            selectinload(models.RoleRequest.reviewer),
        )
        .order_by(models.RoleRequest.created_at.desc())
    )

    if status_filter:
        if status_filter not in VALID_STATUSES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status filter")
        q = q.filter(models.RoleRequest.status == status_filter)

    return q.limit(limit).all()


@router.post("/{request_id}/decision", response_model=schemas.RoleRequestPublic)
def resolve_role_request(
    request_id: int,
    payload: schemas.RoleRequestDecision,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    reviewer = _assert_reviewer(current_user)
    record = (
        db.query(models.RoleRequest)
        .options(
            selectinload(models.RoleRequest.user),
            selectinload(models.RoleRequest.reviewer),
        )
        .filter(models.RoleRequest.id == request_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role request not found")
    if record.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Request already resolved")

    action = payload.action
    if action == "approve":
        new_role = payload.role or record.requested_role
        if new_role not in role_service.VALID_ROLES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported role assignment")
        record.user.role = new_role
        db.add(record.user)
        role_service.resolve_role_request(record, "approved", reviewer.id, payload.notes)
    elif action == "deny":
        role_service.resolve_role_request(record, "denied", reviewer.id, payload.notes)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported action")

    record.reviewer = reviewer
    db.add(record)
    db.commit()
    db.refresh(record)
    return record
