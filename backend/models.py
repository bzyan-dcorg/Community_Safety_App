from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, UniqueConstraint, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from .db import Base
from .services.rewards import determine_membership_tier


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)

    # what happened
    category = Column(String(100), index=True)
    description = Column(String(2000))
    incident_type = Column(
        String(50),
        index=True,
        default="community",
        nullable=False,
    )  # police | community | public-order

    # community prompts
    still_happening = Column(Boolean, default=None)
    feel_safe_now = Column(Boolean, default=None)
    police_seen = Column(Boolean, default=None)
    contacted_authorities = Column(String(25), default="unknown")
    safety_sentiment = Column(String(25), nullable=True)

    # location
    location_text = Column(String(255))
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)

    # verification status & scoring
    status = Column(String(50), default="unverified")
    credibility_score = Column(Float, default=0.4)
    reporter_alias = Column(String(50), nullable=True)
    follow_up_due_at = Column(DateTime(timezone=True), nullable=True, index=True)
    reporter_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    reward_points_awarded = Column(Integer, nullable=False, default=0)
    verification_alert_sent = Column(Boolean, nullable=False, default=False)

    # timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    follow_ups = relationship(
        "IncidentFollowUp",
        back_populates="incident",
        cascade="all, delete-orphan",
        order_by="IncidentFollowUp.created_at",
    )
    comments = relationship(
        "IncidentComment",
        back_populates="incident",
        cascade="all, delete-orphan",
        order_by="IncidentComment.created_at",
    )
    reactions = relationship(
        "IncidentReaction",
        back_populates="incident",
        cascade="all, delete-orphan",
    )
    reporter = relationship(
        "User",
        back_populates="reported_incidents",
        foreign_keys="Incident.reporter_user_id",
    )


class IncidentFollowUp(Base):
    __tablename__ = "incident_followups"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=False, index=True)
    status = Column(String(50), nullable=False)
    notes = Column(String(2000), nullable=True)
    still_happening = Column(Boolean, default=None)
    contacted_authorities = Column(String(25), nullable=True)
    feel_safe_now = Column(Boolean, default=None)
    safety_sentiment = Column(String(25), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    created_by = Column(String(50), nullable=True)

    incident = relationship("Incident", back_populates="follow_ups")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=True)
    display_name = Column(String(100), nullable=True)
    auth_provider = Column(String(50), nullable=False, default="password")
    provider_subject = Column(String(255), nullable=True)
    role = Column(String(25), nullable=False, default="resident", index=True)
    reward_points = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    comments = relationship("IncidentComment", back_populates="user")
    reactions = relationship("IncidentReaction", back_populates="user")
    comment_reactions = relationship("IncidentCommentReaction", back_populates="user")
    reported_incidents = relationship(
        "Incident",
        back_populates="reporter",
        foreign_keys="Incident.reporter_user_id",
    )
    notifications = relationship(
        "Notification",
        back_populates="recipient",
        cascade="all, delete-orphan",
        order_by="Notification.created_at",
    )
    role_requests = relationship(
        "RoleRequest",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="RoleRequest.created_at.desc()",
        foreign_keys="RoleRequest.user_id",
    )
    reviewed_role_requests = relationship(
        "RoleRequest",
        back_populates="reviewer",
        foreign_keys="RoleRequest.reviewer_id",
    )

    @property
    def membership_tier(self) -> str:
        return determine_membership_tier(self.reward_points)


class IncidentComment(Base):
    __tablename__ = "incident_comments"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    body = Column(String(2000), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    incident = relationship("Incident", back_populates="comments")
    user = relationship("User", back_populates="comments")
    attachments = relationship(
        "IncidentCommentAttachment",
        back_populates="comment",
        cascade="all, delete-orphan",
        order_by="IncidentCommentAttachment.id",
    )
    reactions = relationship(
        "IncidentCommentReaction",
        back_populates="comment",
        cascade="all, delete-orphan",
    )


class IncidentReaction(Base):
    __tablename__ = "incident_reactions"
    __table_args__ = (UniqueConstraint("incident_id", "user_id", name="uq_incident_reaction_user"),)

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    value = Column(String(12), nullable=False)  # like | unlike
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    incident = relationship("Incident", back_populates="reactions")
    user = relationship("User", back_populates="reactions")


class IncidentCommentAttachment(Base):
    __tablename__ = "incident_comment_attachments"

    id = Column(Integer, primary_key=True, index=True)
    comment_id = Column(Integer, ForeignKey("incident_comments.id"), nullable=False, index=True)
    media_type = Column(String(20), nullable=False)  # image | video
    content_type = Column(String(100), nullable=True)
    data_base64 = Column(Text, nullable=False)
    filename = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    comment = relationship("IncidentComment", back_populates="attachments")


class IncidentCommentReaction(Base):
    __tablename__ = "incident_comment_reactions"
    __table_args__ = (UniqueConstraint("comment_id", "user_id", name="uq_comment_reaction_user"),)

    id = Column(Integer, primary_key=True, index=True)
    comment_id = Column(Integer, ForeignKey("incident_comments.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    value = Column(String(12), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    comment = relationship("IncidentComment", back_populates="reactions")
    user = relationship("User", back_populates="comment_reactions")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=True, index=True)
    message = Column(String(500), nullable=False)
    category = Column(String(50), nullable=False, default="verification")
    status = Column(String(20), nullable=False, default="unread")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    read_at = Column(DateTime(timezone=True), nullable=True)

    recipient = relationship("User", back_populates="notifications")
    incident = relationship("Incident")


class RoleRequest(Base):
    __tablename__ = "role_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    requested_role = Column(String(25), nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    justification = Column(String(500), nullable=True)
    reviewer_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    reviewer_notes = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship(
        "User",
        foreign_keys=[user_id],
        back_populates="role_requests",
    )
    reviewer = relationship(
        "User",
        foreign_keys=[reviewer_id],
        back_populates="reviewed_role_requests",
    )
