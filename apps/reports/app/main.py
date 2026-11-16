from datetime import UTC, datetime
from typing import Literal

import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import settings


class ReportsHealthResponse(BaseModel):
    """Esquema de respuesta de salud para el servicio de reportes."""

    status: Literal["ok", "degraded"]
    service: Literal["reports"]
    mode: Literal["read-only"]
    version: str
    pandas_version: str
    timestamp: str


app = FastAPI(
    title="Apuestas Deportivas — Servicio de Reportes",
    version=settings.app_version,
    docs_url="/docs",
    redoc_url=None,
)

allowed_origins = [
    origin.strip() for origin in settings.reports_cors_origin.split(",") if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health", response_model=ReportsHealthResponse)
def get_health() -> ReportsHealthResponse:
    """Retorna el estado operativo del servicio analítico de solo lectura."""
    return ReportsHealthResponse(
        status="ok",
        service="reports",
        mode="read-only",
        version=settings.app_version,
        pandas_version=pd.__version__,
        timestamp=datetime.now(UTC).isoformat(),
    )
