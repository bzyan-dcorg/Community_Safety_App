from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend import models
from backend.db import SessionLocal
from backend.services.locations import apply_known_location_coordinates
try:
    from backend.security import get_password_hash as _get_password_hash
except ModuleNotFoundError:  # pragma: no cover - fallback for minimal environments
    import hashlib

    def _get_password_hash(password: str) -> str:
        digest = hashlib.sha256(password.encode("utf-8")).hexdigest()
        return f"sha256${digest}"
else:
    _get_password_hash = _get_password_hash

SEED_USER = {
  "email": "demo@civicsafety.local",
  "password": "neighbor-demo",
  "display_name": "Demo Neighbor",
}

INCIDENTS = [
  {
    "category": "Water",
    "description": "Neighbors reporting low water pressure near 5th & Juniper. Utility crews are onsite opening valves.",
    "incident_type": "community",
    "location_text": "5th & Juniper",
    "status": "community-confirmed",
    "reporter_alias": "Water Watch",
    "still_happening": True,
    "feel_safe_now": True,
    "police_seen": False,
    "contacted_authorities": "service-request",
    "safety_sentiment": "uneasy",
    "credibility_score": 0.76,
  },
  {
    "category": "Noise",
    "description": "Multiple nighttime noise complaints outside Atlas Lounge. Moderator reminding patrons to wrap up by midnight.",
    "incident_type": "public-order",
    "location_text": "Atlas Lounge, Midtown",
    "status": "unverified",
    "reporter_alias": "Midtown Watch",
    "still_happening": True,
    "feel_safe_now": True,
    "police_seen": False,
    "contacted_authorities": "none",
    "safety_sentiment": "safe",
    "credibility_score": 0.58,
  },
  {
    "category": "Traffic",
    "description": "Hit-and-run camera request near Maple & 18th. Officer coordinating with local businesses for footage.",
    "incident_type": "police",
    "location_text": "Maple & 18th",
    "status": "official-confirmed",
    "reporter_alias": "Traffic Desk",
    "still_happening": False,
    "feel_safe_now": False,
    "police_seen": True,
    "contacted_authorities": "911",
    "safety_sentiment": "unsafe",
    "credibility_score": 0.84,
  },
]


def main() -> None:
  db = SessionLocal()
  try:
    user = db.query(models.User).filter(models.User.email == SEED_USER["email"]).first()
    if not user:
      user = models.User(
        email=SEED_USER["email"],
        hashed_password=_get_password_hash(SEED_USER["password"]),
        display_name=SEED_USER["display_name"],
        auth_provider="password",
        role="resident",
      )
      db.add(user)
      db.flush()

    existing_descriptions = {
      row.description for row in db.query(models.Incident.description).all()
    }

    now = datetime.now(timezone.utc)
    created = 0
    for index, payload in enumerate(INCIDENTS):
      if payload["description"] in existing_descriptions:
        continue

      incident = models.Incident(
        category=payload["category"],
        description=payload["description"],
        incident_type=payload["incident_type"],
        location_text=payload["location_text"],
        status=payload["status"],
        reporter_alias=payload["reporter_alias"],
        still_happening=payload["still_happening"],
        feel_safe_now=payload["feel_safe_now"],
        police_seen=payload["police_seen"],
        contacted_authorities=payload["contacted_authorities"],
        safety_sentiment=payload["safety_sentiment"],
        credibility_score=payload["credibility_score"],
        follow_up_due_at=(
          now + timedelta(minutes=90 + (index * 15)) if payload["still_happening"] else None
        ),
        reporter_user_id=user.id,
      )
      apply_known_location_coordinates(incident)
      db.add(incident)
      created += 1

    db.commit()
    print(f"Seeded {created} incidents (user: {user.email}).")
  finally:
    db.close()


if __name__ == "__main__":
  main()
