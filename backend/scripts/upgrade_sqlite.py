from backend.db import ensure_sqlite_schema


def main() -> None:
    ensure_sqlite_schema()
    print("SQLite schema updated (users/incidents tables are synced).")


if __name__ == "__main__":
    main()
