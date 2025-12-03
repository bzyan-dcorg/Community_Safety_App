import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
DEFAULT_SQLITE_PATH = os.path.join(BASE_DIR, "community.db")
# For dev: local SQLite file. Later we can move to MySQL/Postgres easily.
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH}")

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


def _seed_reward_ledger_if_empty(connection) -> None:
    try:
        ledger_count = connection.execute(text("SELECT COUNT(1) FROM reward_ledger")).scalar()
    except Exception:
        return
    if ledger_count and ledger_count > 0:
        return

    rows = connection.execute(
        text("SELECT id, reward_points FROM users WHERE reward_points IS NOT NULL AND reward_points > 0")
    ).fetchall()
    for user_id, reward_points in rows:
        connection.execute(
            text(
                "INSERT INTO reward_ledger (user_id, delta, source, description, status) "
                "VALUES (:user_id, :delta, 'balance-forward', 'Existing balance snapshot', 'posted')"
            ),
            {"user_id": user_id, "delta": reward_points},
        )


VALID_CONTACTED_AUTHORITIES = {"unknown", "none", "service-request", "911", "not-needed"}
VALID_SAFETY_SENTIMENTS = {"safe", "uneasy", "unsafe", "unsure"}
CONTACTED_FALLBACKS = {
    "311": "service-request",
    "service_request": "service-request",
    "service": "service-request",
}
SENTIMENT_FALLBACKS = {
    "concerned": "uneasy",
    "alert": "unsafe",
    "neutral": "safe",
    "ok": "safe",
}


def _normalize_incident_enum(connection, column_name: str, valid_values, fallback_map, default_value) -> None:
    """Clamp legacy/invalid incident enum values to supported options."""
    rows = connection.execute(
        text(f"SELECT id, {column_name} FROM incidents WHERE {column_name} IS NOT NULL")
    ).fetchall()
    for row_id, raw_value in rows:
        value = raw_value.strip() if isinstance(raw_value, str) else raw_value
        if not value:
            replacement = default_value
        elif value in valid_values:
            continue
        else:
            replacement = fallback_map.get(value, default_value)

        if replacement is None:
            connection.execute(
                text(f"UPDATE incidents SET {column_name} = NULL WHERE id = :row_id"),
                {"row_id": row_id},
            )
        else:
            connection.execute(
                text(f"UPDATE incidents SET {column_name} = :replacement WHERE id = :row_id"),
                {"replacement": replacement, "row_id": row_id},
            )


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
        if not _sqlite_has_column(connection, "incidents", "is_hidden"):
            connection.execute(
                text("ALTER TABLE incidents ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT 0")
            )
            connection.execute(
                text("CREATE INDEX IF NOT EXISTS idx_incidents_is_hidden ON incidents (is_hidden)")
            )
        if not _sqlite_has_column(connection, "incident_comments", "is_hidden"):
            connection.execute(
                text("ALTER TABLE incident_comments ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT 0")
            )
            connection.execute(
                text("CREATE INDEX IF NOT EXISTS idx_incident_comments_is_hidden ON incident_comments (is_hidden)")
            )
        _normalize_incident_enum(
            connection,
            "contacted_authorities",
            VALID_CONTACTED_AUTHORITIES,
            CONTACTED_FALLBACKS,
            "unknown",
        )
        _normalize_incident_enum(
            connection,
            "safety_sentiment",
            VALID_SAFETY_SENTIMENTS,
            SENTIMENT_FALLBACKS,
            None,
        )
        _seed_reward_ledger_if_empty(connection)
