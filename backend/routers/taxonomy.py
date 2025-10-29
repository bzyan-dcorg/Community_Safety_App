from fastapi import APIRouter

from .. import schemas

router = APIRouter(
    prefix="/taxonomy",
    tags=["taxonomy"],
)

TAXONOMY = schemas.TaxonomyResponse(
    police_related=schemas.TaxonomyGroup(
        label="Police-Related",
        items=[
            "Burglary",
            "Theft From Auto",
            "Non-Fatal Shooting",
            "Homicide",
            "Suspicious Vehicle",
            "Suspicious Person",
            "Robbery",
        ],
    ),
    community_civic=schemas.TaxonomyGroup(
        label="Community & Civic",
        items=[
            "Package Theft",
            "Mailbox Tampering",
            "Noise / Neighborhood Dispute",
            "Lost / Found Pet",
            "Streetlight Outage",
            "Pothole / Road Hazard",
            "Sanitation / Illegal Dumping",
            "Homelessness Encampment",
        ],
    ),
    public_order=schemas.TaxonomyGroup(
        label="Public Order",
        items=[
            "Street Racing",
            "Fireworks",
            "Loud Gathering",
            "Public Intoxication",
            "Sidewalk Obstruction",
        ],
    ),
)


@router.get("/", response_model=schemas.TaxonomyResponse)
def fetch_taxonomy():
    return TAXONOMY
