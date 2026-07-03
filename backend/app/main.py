from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import ai, qc, users, procurement

app = FastAPI(
    title="Pramukh ERP API",
    description="Python FastAPI backend serving Pramukh ERP modules",
    version="1.0.0"
)

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to your frontend domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include endpoint routers
app.include_router(ai.router, prefix="/api", tags=["AI"])
app.include_router(qc.router, prefix="/api", tags=["QC"])
app.include_router(users.router, prefix="/api", tags=["Users"])
app.include_router(procurement.router, prefix="/api", tags=["Procurement"])

# Create tables if using SQLite fallback (local development ease)
from . import config
if config.DATABASE_URL.startswith("sqlite"):
    from .database import engine, Base
    from .models import database_models
    Base.metadata.create_all(bind=engine)

@app.get("/")
def read_root():
    return {"status": "healthy", "service": "Pramukh ERP Python Backend"}
