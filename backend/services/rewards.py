"""Helpers for computing membership tiers and reward incentives."""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

TIER_LADDER: List[Tuple[str, int]] = [
    ("Neighbor Scout", 0),
    ("Signal Verified", 50),
    ("Community Sentinel", 120),
    ("Civic Guardian", 250),
]

STATUS_TARGETS = {
    "community-confirmed": 10,
    "official-confirmed": 20,
    "resolved": 25,
}


def determine_membership_tier(points: Optional[int]) -> str:
    """Return the tier label that corresponds to the provided point balance."""
    safe_points = int(points or 0)
    tier = TIER_LADDER[0][0]
    for name, threshold in TIER_LADDER:
        if safe_points >= threshold:
            tier = name
        else:
            break
    return tier


def tier_progress(points: Optional[int]) -> Dict[str, Optional[object]]:
    """Provide the caller with the current tier, the next tier, and gap to unlock it."""
    safe_points = int(points or 0)
    current = TIER_LADDER[0]
    next_target: Optional[Tuple[str, int]] = None

    for idx, (name, threshold) in enumerate(TIER_LADDER):
        if safe_points >= threshold:
            current = (name, threshold)
            next_target = TIER_LADDER[idx + 1] if idx + 1 < len(TIER_LADDER) else None
        else:
            next_target = (name, threshold)
            break

    remaining = None
    if next_target:
        remaining = max(0, next_target[1] - safe_points)

    return {
        "current": current[0],
        "current_threshold": current[1],
        "next": next_target[0] if next_target else None,
        "next_threshold": next_target[1] if next_target else None,
        "points_to_next": remaining,
    }


def reward_target_for_status(status: Optional[str], credibility_score: Optional[float]) -> int:
    """Return the total reward points an incident should earn once it reaches the provided status."""
    if not status:
        return 0

    base = STATUS_TARGETS.get(status, 0)
    if not base:
        return 0

    score = credibility_score or 0.0
    bonus = 5 if score >= 0.65 else 0
    return base + bonus
