from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional, Literal

from pydantic import BaseModel, EmailStr, Field, constr

IncidentType = Literal["police", "community", "public-order"]
ContactedAuthorities = Literal["unknown", "none", "service-request", "911", "not-needed"]
SafetySentiment = Literal["safe", "uneasy", "unsafe", "unsure"]
UserRole = Literal["resident", "staff", "reporter", "officer"]


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


class UserSummary(BaseModel):
    id: int
    display_name: Optional[str] = None

    class Config:
        from_attributes = True


class UserProfile(UserSummary):
    email: EmailStr
    auth_provider: str
    role: str
    reward_points: int
    membership_tier: str

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile


class NotificationPublic(BaseModel):
    id: int
    message: str
    status: Literal["unread", "read"]
    category: str
    incident_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AuthEmailRegister(BaseModel):
    email: EmailStr
    password: constr(min_length=8)
    display_name: Optional[str] = Field(None, max_length=100)
    role: Optional[UserRole] = Field(
        None,
        description="Optional explicit role selection for onboarding",
    )


class AuthEmailLogin(BaseModel):
    email: EmailStr
    password: constr(min_length=8)


class AuthOAuthPayload(BaseModel):
    provider: Literal["google", "apple"]
    id_token: str = Field(..., description="Opaque token verified client-side")
    email: Optional[EmailStr] = None
    display_name: Optional[str] = Field(None, max_length=100)
    role: Optional[UserRole] = Field(
        None,
        description="Optional explicit role selection for onboarding",
    )


class IncidentCommentCreate(BaseModel):
    body: constr(min_length=1, max_length=2000)
    media: List["IncidentCommentMediaCreate"] = Field(default_factory=list)


class IncidentCommentPublic(BaseModel):
    id: int
    body: str
    created_at: datetime
    user: UserSummary
    attachments: List["IncidentCommentAttachmentPublic"] = Field(default_factory=list)
    likes_count: int = 0
    unlikes_count: int = 0
    viewer_reaction: Optional[Literal["like", "unlike"]] = None

    class Config:
        from_attributes = True


class IncidentReactionUpdate(BaseModel):
    action: Literal["like", "unlike", "clear"] = Field(
        ...,
        description="Set to like/unlike or clear to remove reaction",
    )


class IncidentReactionStatus(BaseModel):
    likes_count: int
    unlikes_count: int
    viewer_reaction: Optional[Literal["like", "unlike"]] = None


class IncidentCommentMediaBase(BaseModel):
    media_type: Literal["image", "video"]
    content_type: Optional[str] = None
    data_base64: str = Field(..., description="Base64 encoded media payload")
    filename: Optional[str] = Field(None, max_length=255)


class IncidentCommentMediaCreate(IncidentCommentMediaBase):
    pass


class IncidentCommentAttachmentPublic(IncidentCommentMediaBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class IncidentCommentReactionUpdate(BaseModel):
    action: Literal["like", "unlike", "clear"]


class IncidentPublic(IncidentBase):
    id: int
    credibility_score: float
    follow_up_due_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    follow_ups: List[IncidentFollowUpPublic] = Field(default_factory=list)
    comments: List[IncidentCommentPublic] = Field(default_factory=list)
    likes_count: int = 0
    unlikes_count: int = 0
    viewer_reaction: Optional[Literal["like", "unlike"]] = None
    reporter: Optional[UserSummary] = None
    reward_points_awarded: int = 0

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


class UserPostBrief(BaseModel):
    id: int
    category: str
    description: str
    status: str
    created_at: datetime
    likes_count: int
    reward_points_awarded: int

    class Config:
        from_attributes = True


class UserRewardSummary(BaseModel):
    total_posts: int
    confirmed_posts: int
    total_likes: int
    points: int
    membership_tier: str
    next_tier: Optional[str] = None
    points_to_next: Optional[int] = None


class UserOverview(BaseModel):
    profile: UserProfile
    rewards: UserRewardSummary
    recent_posts: List[UserPostBrief]
    unread_notifications: int = 0


IncidentCommentCreate.model_rebuild()
IncidentCommentPublic.model_rebuild()
