from __future__ import annotations

import re
from typing import Dict, Iterable, Optional, Tuple, TYPE_CHECKING

if TYPE_CHECKING:
    from .. import models


def _normalize(value: str) -> str:
    cleaned = value.strip().lower()
    cleaned = cleaned.replace("&", " and ")
    cleaned = re.sub(r"[^a-z0-9]+", " ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def _build_lookup(
    entries: Iterable[dict],
) -> Tuple[Dict[str, Tuple[float, float]], list[Tuple[str, Tuple[float, float]]]]:
    exact: Dict[str, Tuple[float, float]] = {}
    patterns: list[Tuple[str, Tuple[float, float]]] = []
    for entry in entries:
        coords = (entry["lat"], entry["lng"])
        for alias in entry["aliases"]:
            normalized = _normalize(alias)
            if not normalized:
                continue
            if normalized not in exact:
                exact[normalized] = coords
            patterns.append((normalized, coords))
    return exact, patterns


KNOWN_LOCATIONS = [
    {
        "name": "5th & Juniper",
        "aliases": [
            "5th & Juniper",
            "5th and Juniper",
            "Juniper & 5th",
            "Juniper and 5th",
            "Juniper at 5th",
            "5th at Juniper",
            "Juniper Street and 5th Street",
        ],
        "lat": 38.9093,
        "lng": -77.0337,
    },
    {
        "name": "Atlas Lounge",
        "aliases": [
            "Atlas Lounge, Midtown",
            "Atlas Lounge Midtown",
            "Atlas Lounge",
            "Midtown Atlas Lounge",
        ],
        "lat": 38.9058,
        "lng": -77.0446,
    },
    {
        "name": "Maple & 18th",
        "aliases": [
            "Maple & 18th",
            "Maple and 18th",
            "18th & Maple",
            "18th and Maple",
            "Maple Street and 18th Street",
        ],
        "lat": 38.9014,
        "lng": -77.0412,
    },
]

_KNOWN_LOOKUP, _KNOWN_PATTERNS = _build_lookup(KNOWN_LOCATIONS)


def lookup_known_coordinates(location_text: Optional[str]) -> Optional[Tuple[float, float]]:
    if not location_text:
        return None
    normalized = _normalize(location_text)
    if not normalized:
        return None

    direct = _KNOWN_LOOKUP.get(normalized)
    if direct:
        return direct

    for pattern, coords in _KNOWN_PATTERNS:
        if pattern and pattern in normalized:
            return coords
    return None


def apply_known_location_coordinates(incident: "models.Incident") -> bool:
    if not incident or (incident.lat is not None and incident.lng is not None):
        return False

    coords = lookup_known_coordinates(getattr(incident, "location_text", None))
    if not coords:
        return False

    updated = False
    if incident.lat is None:
        incident.lat = coords[0]
        updated = True
    if incident.lng is None:
        incident.lng = coords[1]
        updated = True
    return updated
