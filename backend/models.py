from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from .db import Base


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

    # timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    follow_ups = relationship(
        "IncidentFollowUp",
        back_populates="incident",
        cascade="all, delete-orphan",
        order_by="IncidentFollowUp.created_at",
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
