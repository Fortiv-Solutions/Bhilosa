import requests
from typing import Optional
from .. import config

def upload_file(bucket: str, path: str, content_bytes: bytes, content_type: str = "application/pdf") -> bool:
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_ROLE_KEY:
        raise Exception("Supabase credentials not configured.")

    # Remove double slashes if present
    path = path.lstrip('/')
    url = f"{config.SUPABASE_URL}/storage/v1/object/{bucket}/{path}"
    
    headers = {
        "apikey": config.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": content_type,
        "x-upsert": "true"
    }

    try:
        response = requests.post(url, data=content_bytes, headers=headers, timeout=15)
        if not response.ok:
            print(f"Supabase Storage Upload Error: {response.text}")
            return False
        return True
    except Exception as e:
        print(f"Supabase Storage Upload Exception: {str(e)}")
        return False

def create_signed_url(bucket: str, path: str, expires_in: int = 600) -> Optional[str]:
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_ROLE_KEY:
        raise Exception("Supabase credentials not configured.")

    path = path.lstrip('/')
    url = f"{config.SUPABASE_URL}/storage/v1/object/sign/{bucket}/{path}"
    
    headers = {
        "apikey": config.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "expiresIn": expires_in
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        if not response.ok:
            print(f"Supabase Storage Sign Error: {response.text}")
            return None
        data = response.json()
        signed_path = data.get("signedURL") or data.get("signedUrl")
        if not signed_path:
            return None
        
        # In some Supabase versions, the returned URL is relative or needs prepending
        if signed_path.startswith("/"):
            return f"{config.SUPABASE_URL}{signed_path}"
        return signed_path
    except Exception as e:
        print(f"Supabase Storage Sign Exception: {str(e)}")
        return None
