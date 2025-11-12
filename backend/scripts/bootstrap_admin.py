from __future__ import annotations

import argparse

from backend.db import SessionLocal
from backend.models import User
from backend.security import get_password_hash


def bootstrap_admin(email: str, password: str, display_name: str | None = None) -> User:
    session = SessionLocal()
    try:
        user = session.query(User).filter(User.email == email.strip().lower()).first()
        hashed = get_password_hash(password)
        name = display_name or email.split("@")[0]
        if user:
            user.role = "admin"
            user.hashed_password = hashed
            user.display_name = name
            user.auth_provider = "password"
        else:
            user = User(
                email=email.strip().lower(),
                hashed_password=hashed,
                display_name=name,
                auth_provider="password",
                role="admin",
            )
            session.add(user)
        session.commit()
        session.refresh(user)
        return user
    finally:
        session.close()


def main():
    parser = argparse.ArgumentParser(description="Create or promote an admin user.")
    parser.add_argument("--email", required=True, help="Email address for the admin account")
    parser.add_argument(
        "--password",
        required=True,
        help="Plain-text password that will be hashed before storing",
    )
    parser.add_argument("--name", default=None, help="Optional display name override")
    args = parser.parse_args()

    user = bootstrap_admin(args.email, args.password, args.name)
    print(f"Admin ready: {user.email} (id={user.id})")


if __name__ == "__main__":
    main()
