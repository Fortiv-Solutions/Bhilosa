from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError
import time
import requests
from .. import config

security_bearer = HTTPBearer(auto_error=False)

# Dynamic license verification from Vercel deployment
LICENSE_STATUS_URL = "https://pramukh-control-panel-new.vercel.app/api/status"

def run_license_check():
    if config.SUPABASE_JWT_SECRET:  # Only enforce on live production/Railway environment
        try:
            response = requests.get(LICENSE_STATUS_URL, timeout=4)
            if response.status_code == 200:
                data = response.json()
                if not data.get("system_active", True):
                    raise HTTPException(
                        status_code=403,
                        detail="System license has expired or been suspended. Please contact the administrator."
                    )
        except HTTPException:
            raise
        except Exception:
            # Safe fallback: if Vercel is unreachable, allow access to prevent locking staff out during network blips
            pass
    else:
        # local dev bypass
        pass

def is_supabase_auth_enabled() -> bool:
    # If the JWT secret is missing, we bypass authentication for local development ease.
    return bool(config.SUPABASE_JWT_SECRET)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security_bearer)) -> dict:
    # 1. Enforce the dynamic license check first (before any bypass checks)
    run_license_check()

    if not is_supabase_auth_enabled():
        # Bypass mode (returns a dummy admin user if auth is not configured locally)
        return {
            "id": "00000000-0000-0000-0000-000000000000",
            "email": "local-dev@example.com",
            "role": "upper_management",
            "name": "Local Developer"
        }

    if not credentials:
        raise HTTPException(
            status_code=401, 
            detail="Authorization header is missing or invalid. Format: 'Bearer <token>'"
        )

    token = credentials.credentials
    try:
        # Supabase uses HS256 algorithms and signs with SUPABASE_JWT_SECRET
        payload = jwt.decode(
            token, 
            config.SUPABASE_JWT_SECRET, 
            algorithms=["HS256"],
            options={"verify_aud": False} # Supabase aud can sometimes be "authenticated"
        )
        
        # Check expiration
        exp = payload.get("exp")
        if exp and exp < time.time():
            raise HTTPException(status_code=401, detail="Token has expired")
            
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token payload missing subject claim ('sub')")
            
        # Extract user metadata or role if present
        user_metadata = payload.get("user_metadata", {})
        role = payload.get("role", "anon")
        
        return {
            "id": user_id,
            "email": payload.get("email"),
            "role": role,
            "name": user_metadata.get("name", "User")
        }
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid authentication token: {str(e)}")
