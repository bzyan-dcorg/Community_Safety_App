from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# For dev: local SQLite file. Later we can move to MySQL/Postgres easily.
DATABASE_URL = "sqlite:///./community.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # needed for SQLite in single-threaded dev
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a db session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
