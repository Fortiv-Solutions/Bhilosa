from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from .routers import ai, ocr, qc, users, procurement

app = FastAPI(
    title="Pramukh ERP API",
    description="Python FastAPI backend serving Pramukh ERP modules",
    version="1.0.0"
)


# Always return JSON (never Starlette's plain-text "Internal Server Error"), so
# clients can parse the real error instead of failing on `response.json()`.
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail, "error": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    message = f"{type(exc).__name__}: {exc}"
    return JSONResponse(status_code=500, content={"detail": message, "error": message})

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
app.include_router(ocr.router, prefix="/api", tags=["OCR"])

# Create tables if using SQLite fallback (local development ease)
from . import config
if config.DATABASE_URL.startswith("sqlite"):
    from .database import engine, Base
    from .models import database_models
    Base.metadata.create_all(bind=engine)

from .core.security import run_license_check

@app.get("/api/check-license")
def check_license():
    run_license_check()
    return {"status": "active"}

@app.get("/")
def read_root():
    return {"status": "healthy", "service": "Pramukh ERP Python Backend"}
