from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import Base, engine, ensure_sqlite_schema
from .routers import auth, incidents, notifications, taxonomy, users

# create tables on startup (for dev)
Base.metadata.create_all(bind=engine)
ensure_sqlite_schema()

app = FastAPI(
    title="Community Safety API",
    description="Community incident reporting / verification API (MVP)",
    version="0.2.0",
)

# CORS: allow local frontend dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(incidents.router)
app.include_router(taxonomy.router)
app.include_router(notifications.router)


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
