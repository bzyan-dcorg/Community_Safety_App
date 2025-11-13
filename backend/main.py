import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import Base, engine, ensure_sqlite_schema
from .routers import auth, incidents, notifications, role_requests, taxonomy, users

# create tables on startup (for dev)
Base.metadata.create_all(bind=engine)
ensure_sqlite_schema()

DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
DEFAULT_CORS_REGEX = r"https?://(localhost|127\.0\.0\.1|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?"


def _parse_origin_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


app = FastAPI(
    title="Community Safety API",
    description="Community incident reporting / verification API (MVP)",
    version="0.2.0",
)

# CORS: allow local frontend dev
cors_origins = _parse_origin_list(os.getenv("CORS_ALLOW_ORIGINS")) or DEFAULT_CORS_ORIGINS
cors_regex = os.getenv("CORS_ALLOW_ORIGIN_REGEX", DEFAULT_CORS_REGEX)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=cors_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(incidents.router)
app.include_router(taxonomy.router)
app.include_router(notifications.router)
app.include_router(role_requests.router)


@app.get("/")
def root():
    return {
        "message": "Community Safety API is running.",
        "docs_url": "/docs",
        "health_check": "/health",
    }


@app.get("/health")
def health():
    return {"ok": True}
