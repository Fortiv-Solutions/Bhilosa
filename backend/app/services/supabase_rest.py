"""
Thin PostgREST client for the FastAPI layer.

Design note — auth: these helpers forward the CALLER's Supabase JWT rather than
using the service-role key. That means row-level security applies to API traffic
exactly as it does in the browser, so the backend cannot become an RLS bypass.
Use `service_role=True` only for genuinely internal, non-user-triggered jobs.
"""

from typing import Any, Dict, List, Optional

import requests
from fastapi import HTTPException

from .. import config

TIMEOUT_SECONDS = 20


def _base_url() -> str:
    if not config.SUPABASE_URL:
        raise HTTPException(
            status_code=503,
            detail="Supabase is not configured on the server (SUPABASE_URL missing).",
        )
    return f"{config.SUPABASE_URL}/rest/v1"


def _headers(access_token: Optional[str], service_role: bool = False) -> Dict[str, str]:
    if service_role:
        if not config.SUPABASE_SERVICE_ROLE_KEY:
            raise HTTPException(status_code=503, detail="Supabase service role key not configured.")
        key = config.SUPABASE_SERVICE_ROLE_KEY
        bearer = config.SUPABASE_SERVICE_ROLE_KEY
    else:
        if not access_token:
            raise HTTPException(
                status_code=401,
                detail="Authorization header with a Supabase access token is required.",
            )
        key = config.SUPABASE_SERVICE_ROLE_KEY or ""
        bearer = access_token

    headers = {
        "Authorization": f"Bearer {bearer}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if key:
        headers["apikey"] = key
    return headers


def bearer_from_header(authorization: Optional[str]) -> Optional[str]:
    """Extract the raw token from an `Authorization: Bearer <jwt>` header."""
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return authorization.strip() or None


def select(
    table: str,
    access_token: Optional[str],
    *,
    columns: str = "*",
    filters: Optional[Dict[str, str]] = None,
    order: Optional[str] = None,
    limit: Optional[int] = None,
    service_role: bool = False,
) -> List[Dict[str, Any]]:
    """
    GET rows from a table or view.

    `filters` values must already be PostgREST operator strings, e.g.
    {"project_id": "eq.<uuid>", "status": "in.(approved,paid)"}.
    """
    params: Dict[str, Any] = {"select": columns}
    if filters:
        params.update(filters)
    if order:
        params["order"] = order
    if limit:
        params["limit"] = limit

    response = requests.get(
        f"{_base_url()}/{table}",
        params=params,
        headers=_headers(access_token, service_role),
        timeout=TIMEOUT_SECONDS,
    )

    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=response.status_code,
            detail="Not authorised to read budget data. Sign in and retry.",
        )
    if not response.ok:
        raise HTTPException(
            status_code=502,
            detail=f"Supabase read failed for {table}: {response.text[:300]}",
        )

    payload = response.json()
    return payload if isinstance(payload, list) else []


def rpc(
    function_name: str,
    access_token: Optional[str],
    payload: Dict[str, Any],
    *,
    service_role: bool = False,
) -> Any:
    """POST to a Postgres function exposed through PostgREST."""
    response = requests.post(
        f"{_base_url()}/rpc/{function_name}",
        json=payload,
        headers=_headers(access_token, service_role),
        timeout=TIMEOUT_SECONDS,
    )

    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=response.status_code,
            detail="Not authorised to perform this budget operation.",
        )
    if not response.ok:
        # Surface the database's own validation message (e.g. the budget lock).
        raise HTTPException(status_code=400, detail=response.text[:500])

    if not response.content:
        return None
    return response.json()


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def to_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except (TypeError, ValueError):
        return default
