import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from passlib.exc import MissingBackendError
import hashlib
from sqlalchemy.orm import Session

from . import models
from .db import get_db

SECRET_KEY = os.getenv("APP_SECRET_KEY", "super-secret-key-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

# bcrypt 在某些 macOS / conda 环境下会加载到系统旧版扩展，触发 MissingBackendError。
# 统一改用 pbkdf2_sha256，避免对底层 C 扩展的依赖。
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


FALLBACK_PREFIX = "sha256$"


def verify_password(plain_password: str, hashed_password: Optional[str]) -> bool:
    if not hashed_password:
        return False
    if hashed_password.startswith(FALLBACK_PREFIX):
        expected = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
        return hashed_password.split("$", 1)[1] == expected
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    try:
        return pwd_context.hash(password)
    except MissingBackendError:
        # Dev fallback when bcrypt extras are unavailable.
        digest = hashlib.sha256(password.encode("utf-8")).hexdigest()
        return f"{FALLBACK_PREFIX}{digest}"


def create_access_token(user: models.User, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = {
        "sub": str(user.id),
        "email": user.email,
        "provider": user.auth_provider,
        "iat": int(datetime.now(timezone.utc).timestamp()),
    }
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_user_from_token(token: str, db: Session) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    return user


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    return get_user_from_token(token, db)


def optional_current_user(
    token: Optional[str] = Depends(oauth2_scheme_optional),
    db: Session = Depends(get_db),
) -> Optional[models.User]:
    if not token:
        return None
    try:
        return get_user_from_token(token, db)
    except HTTPException:
        return None
