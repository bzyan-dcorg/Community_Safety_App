from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional, Literal

from pydantic import BaseModel, Field

IncidentType = Literal["police", "community", "public-order"]
ContactedAuthorities = Literal["unknown", "none", "service-request", "911", "not-needed"]
SafetySentiment = Literal["safe", "uneasy", "unsafe", "unsure"]


class IncidentBase(BaseModel):
    category: str = Field(..., max_length=100, description="Taxonomy category name")
    description: str = Field(..., max_length=2000)
    location_text: Optional[str] = Field(None, max_length=255)
    incident_type: IncidentType = Field(
        "community",
        description="Segment classification: police, community, or public-order",
    )

    lat: Optional[float] = None
    lng: Optional[float] = None

    still_happening: Optional[bool] = Field(
        default=None,
        description="True/False when answered. Null when unanswered or unsure.",
    )
    feel_safe_now: Optional[bool] = Field(
        default=None,
        description="Reporter safety feeling (True=safe, False=unsafe, Null=unsure/unanswered)",
    )
    police_seen: Optional[bool] = Field(
        default=None,
        description="True when law enforcement observed, False when not, Null when unknown",
    )

    contacted_authorities: Optional[ContactedAuthorities] = Field(
        default="unknown",
        description="How the reporter interacted with authorities",
    )
    safety_sentiment: Optional[SafetySentiment] = Field(
        default=None,
        description="Quick sentiment tag to summarize tone",
    )

    status: Optional[str] = Field(
        default="unverified",
        description="Verification / resolution status",
    )
    reporter_alias: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Optional pseudonymous handle for the reporter",
    )


class IncidentCreate(IncidentBase):
    pass


class IncidentUpdate(BaseModel):
    category: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=2000)
    incident_type: Optional[IncidentType] = None
    still_happening: Optional[bool] = None
    feel_safe_now: Optional[bool] = None
    police_seen: Optional[bool] = None
    contacted_authorities: Optional[ContactedAuthorities] = None
    safety_sentiment: Optional[SafetySentiment] = None
    status: Optional[str] = None
    reporter_alias: Optional[str] = Field(None, max_length=50)
    credibility_score: Optional[float] = Field(
        None,
        ge=0,
        le=1,
        description="Reputation score between 0 and 1",
    )
    follow_up_due_at: Optional[datetime] = None


class IncidentFollowUpBase(BaseModel):
    status: str = Field(..., max_length=50)
    notes: Optional[str] = Field(None, max_length=2000)
    still_happening: Optional[bool] = None
    contacted_authorities: Optional[ContactedAuthorities] = None
    feel_safe_now: Optional[bool] = None
    safety_sentiment: Optional[SafetySentiment] = None
    created_by: Optional[str] = Field(None, max_length=50)


class IncidentFollowUpCreate(IncidentFollowUpBase):
    pass


class IncidentFollowUpPublic(IncidentFollowUpBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class IncidentPublic(IncidentBase):
    id: int
    credibility_score: float
    follow_up_due_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    follow_ups: List[IncidentFollowUpPublic] = []

    class Config:
        from_attributes = True


class IncidentStats(BaseModel):
    total: int
    by_status: Dict[str, int]
    by_type: Dict[str, int]
    active_follow_up: int
    prompt_completion_rate: float
    sentiment_breakdown: Dict[str, int]
    avg_credibility: float


class TaxonomyGroup(BaseModel):
    label: str
    items: List[str]


class TaxonomyResponse(BaseModel):
    police_related: TaxonomyGroup
    community_civic: TaxonomyGroup
    public_order: TaxonomyGroup
