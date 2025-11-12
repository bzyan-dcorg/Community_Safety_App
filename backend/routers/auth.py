from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError as JoseJWTError, jwt as jose_jwt
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db
from ..security import create_access_token, get_current_user, get_password_hash, verify_password
from ..services import role_requests as role_request_service

router = APIRouter(prefix="/auth", tags=["auth"])
PUBLIC_ROLES = set(role_request_service.VALID_ROLES)
ROLE_ALIASES = {
    "employee": "staff",
    "city_employee": "staff",
    "city_staff": "staff",
    "journalist": "reporter",
    "media": "reporter",
    "press": "reporter",
    "police": "officer",
    "law_enforcement": "officer",
    "officer": "officer",
}


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _parse_oauth_claims(_provider: str, id_token: str) -> Dict[str, Any]:
    raw_token = (id_token or "").strip()
    if not raw_token:
        return {}

    if raw_token.count(".") >= 2:
        try:
            claims = jose_jwt.get_unverified_claims(raw_token)
            if isinstance(claims, dict):
                return claims
        except JoseJWTError:
            # Fall back to development stubs when decoding fails
            return {}

    if ":" in raw_token:
        _, remainder = raw_token.split(":", 1)
        claims: Dict[str, Any] = {"sub": raw_token}
        if "@" in remainder:
            claims["email"] = remainder
        return claims

    return {"sub": raw_token}


def _extract_display_name_from_claims(claims: Dict[str, Any]) -> Optional[str]:
    name_claim = claims.get("name")
    if isinstance(name_claim, str) and name_claim.strip():
        return name_claim.strip()

    given = claims.get("given_name")
    family = claims.get("family_name")
    parts = [
        part.strip()
        for part in (given, family)
        if isinstance(part, str) and part and part.strip()
    ]
    if parts:
        return " ".join(parts)

    preferred = claims.get("preferred_username")
    if isinstance(preferred, str) and preferred.strip():
        return preferred.strip()

    return None


def _resolve_requested_role(selection: Optional[str]) -> str:
    if not selection:
        return "resident"
    normalized = selection.strip().lower()
    normalized = ROLE_ALIASES.get(normalized, normalized)
    if normalized in PUBLIC_ROLES:
        return normalized
    return "resident"


def _apply_role_selection(
    db: Session,
    user: models.User,
    requested_role: str,
    justification: Optional[str],
) -> None:
    if not requested_role or requested_role == user.role:
        return
    if role_request_service.requires_manual_approval(requested_role):
        role_request_service.queue_role_request(db, user, requested_role, justification)
        return
    user.role = requested_role
    db.add(user)


@router.post("/register", response_model=schemas.TokenResponse, status_code=status.HTTP_201_CREATED)
def register_user(payload: schemas.AuthEmailRegister, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    existing = db.query(models.User).filter(models.User.email == email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    display_name = payload.display_name.strip() if payload.display_name else email.split("@")[0]
    requested_role = _resolve_requested_role(payload.role)
    requires_approval = role_request_service.requires_manual_approval(requested_role)
    assigned_role = requested_role if not requires_approval else "resident"

    user = models.User(
        email=email,
        hashed_password=get_password_hash(payload.password),
        display_name=display_name,
        auth_provider="password",
        role=assigned_role,
    )
    db.add(user)
    db.flush()

    if requires_approval:
        role_request_service.queue_role_request(
            db,
            user,
            requested_role,
            payload.role_justification,
        )

    db.commit()
    db.refresh(user)

    token = create_access_token(user)
    return schemas.TokenResponse(access_token=token, user=user)  # type: ignore[arg-type]


@router.post("/login", response_model=schemas.TokenResponse)
def login_user(payload: schemas.AuthEmailLogin, db: Session = Depends(get_db)):
    email = _normalize_email(payload.email)
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if payload.role and user.role == "resident":
        requested_role = _resolve_requested_role(payload.role)
        if requested_role != "resident":
            _apply_role_selection(
                db,
                user,
                requested_role,
                payload.role_justification,
            )
            db.commit()
            db.refresh(user)

    token = create_access_token(user)
    return schemas.TokenResponse(access_token=token, user=user)  # type: ignore[arg-type]


@router.post("/oauth", response_model=schemas.TokenResponse)
def login_with_provider(payload: schemas.AuthOAuthPayload, db: Session = Depends(get_db)):
    # NOTE: For production you must verify the provider id_token with the provider's public keys.
    raw_token = payload.id_token.strip()
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="id_token required")

    claims = _parse_oauth_claims(payload.provider, raw_token)
    subject = str(claims.get("sub") or raw_token)

    email = _normalize_email(payload.email) if payload.email else None
    if not email:
        claim_email = claims.get("email")
        if isinstance(claim_email, str) and claim_email.strip():
            email = _normalize_email(claim_email)
        else:
            emails_claim = claims.get("emails")
            if isinstance(emails_claim, list):
                for item in emails_claim:
                    if isinstance(item, str) and "@" in item:
                        email = _normalize_email(item)
                        break

    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required")

    display_name = payload.display_name.strip() if payload.display_name else None
    if not display_name:
        claim_display_name = _extract_display_name_from_claims(claims)
        if claim_display_name:
            display_name = claim_display_name
    if not display_name:
        display_name = email.split("@")[0]

    requested_role = _resolve_requested_role(payload.role)

    user = (
        db.query(models.User)
        .filter(models.User.auth_provider == payload.provider, models.User.provider_subject == subject)
        .first()
    )

    if not user:
        # Fallback: try linking by email for returning users.
        user = db.query(models.User).filter(models.User.email == email).first()

    if not user:
        requires_approval = role_request_service.requires_manual_approval(requested_role)
        assigned_role = requested_role if not requires_approval else "resident"
        user = models.User(
            email=email,
            display_name=display_name,
            auth_provider=payload.provider,
            provider_subject=subject,
            role=assigned_role,
        )
        db.add(user)
        db.flush()
        if requires_approval:
            role_request_service.queue_role_request(
                db,
                user,
                requested_role,
                payload.role_justification,
            )
    else:
        # Update provider metadata if missing.
        if user.email != email:
            user.email = email
        if user.provider_subject != subject:
            user.provider_subject = subject
        user.auth_provider = payload.provider
        if display_name:
            user.display_name = display_name
        if payload.role and requested_role != "resident" and user.role == "resident":
            _apply_role_selection(
                db,
                user,
                requested_role,
                payload.role_justification,
            )

    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user)
    return schemas.TokenResponse(access_token=token, user=user)  # type: ignore[arg-type]


@router.get("/me", response_model=schemas.UserProfile)
def get_profile(current_user: models.User = Depends(get_current_user)):
    return current_user
