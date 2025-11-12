from sqlalchemy import create_engine, text
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


def _sqlite_has_column(connection, table_name: str, column_name: str) -> bool:
    rows = connection.execute(text(f"PRAGMA table_info('{table_name}')"))
    return any(row[1] == column_name for row in rows)


def ensure_sqlite_schema():
    """Apply lightweight ALTER TABLE statements so sqlite gains the newest columns."""
    if not engine.url.drivername.startswith("sqlite"):
        return

    with engine.begin() as connection:
        if not _sqlite_has_column(connection, "users", "role"):
            connection.execute(
                text("ALTER TABLE users ADD COLUMN role VARCHAR(25) NOT NULL DEFAULT 'resident'")
            )
        if not _sqlite_has_column(connection, "users", "reward_points"):
            connection.execute(
                text("ALTER TABLE users ADD COLUMN reward_points INTEGER NOT NULL DEFAULT 0")
            )
        if not _sqlite_has_column(connection, "incidents", "reporter_user_id"):
            connection.execute(
                text("ALTER TABLE incidents ADD COLUMN reporter_user_id INTEGER")
            )
            connection.execute(
                text("CREATE INDEX IF NOT EXISTS idx_incidents_reporter_user_id ON incidents (reporter_user_id)")
            )
        if not _sqlite_has_column(connection, "incidents", "reward_points_awarded"):
            connection.execute(
                text("ALTER TABLE incidents ADD COLUMN reward_points_awarded INTEGER NOT NULL DEFAULT 0")
            )
        if not _sqlite_has_column(connection, "incidents", "verification_alert_sent"):
            connection.execute(
                text("ALTER TABLE incidents ADD COLUMN verification_alert_sent BOOLEAN NOT NULL DEFAULT 0")
            )
