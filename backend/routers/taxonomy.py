from fastapi import APIRouter

from .. import schemas

router = APIRouter(
    prefix="/taxonomy",
    tags=["taxonomy"],
)

TAXONOMY = schemas.TaxonomyResponse(
    police_related=schemas.TaxonomyGroup(
        label="City & Staff Sightings",
        items=["Sightings of city workers"],
    ),
    community_civic=schemas.TaxonomyGroup(
        label="Neighborhood Activities",
        items=[
            "Community activities or programs",
            "Conflict mediation or disputes",
        ],
    ),
    public_order=schemas.TaxonomyGroup(
        label="Safety Pulse",
        items=[
            "Perceived safety shift",
            "Public space or infrastructure watch",
        ],
    ),
)


@router.get("/", response_model=schemas.TaxonomyResponse)
def fetch_taxonomy():
    return TAXONOMY
