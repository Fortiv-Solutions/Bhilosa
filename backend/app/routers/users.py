from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional
import requests

from ..database import get_db
from ..core.security import get_current_user
from ..models import Profile
from .. import config

router = APIRouter()

class UserCreateRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str
    projectId: Optional[str] = None

@router.post("/users", status_code=201)
async def create_user(
    payload: UserCreateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=500, 
            detail="Supabase admin credentials not configured."
        )

    # 1. Create the user in Supabase Auth Admin GoTrue API
    headers = {
        "apikey": config.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }
    
    auth_url = f"{config.SUPABASE_URL}/auth/v1/admin/users"
    auth_payload = {
        "email": payload.email,
        "password": payload.password,
        "email_confirm": True,
        "user_metadata": {
            "name": payload.name
        }
    }

    try:
        response = requests.post(auth_url, json=auth_payload, headers=headers, timeout=10)
        if not response.ok:
            error_msg = response.json().get("msg") or response.text
            raise HTTPException(
                status_code=response.status_code, 
                detail=f"Supabase Auth creation failed: {error_msg}"
            )
        
        auth_data = response.json()
        user_id = auth_data.get("id")
        if not user_id:
            raise HTTPException(
                status_code=500, 
                detail="Supabase Auth response did not return a user ID."
            )
            
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to communicate with Supabase Auth: {str(e)}"
        )

    # 2. Insert or update the user's profile in the database profiles table
    try:
        # Check if profile already exists (upsert logic)
        profile = db.query(Profile).filter(Profile.id == user_id).first()
        if not profile:
            profile = Profile(
                id=user_id,
                email=payload.email,
                name=payload.name,
                role=payload.role.lower(),
                project_id=payload.projectId
            )
            db.add(profile)
        else:
            profile.email = payload.email
            profile.name = payload.name
            profile.role = payload.role.lower()
            profile.project_id = payload.projectId
            
        db.commit()
        db.refresh(profile)

        return {
            "message": "User created successfully", 
            "user": {
                "id": user_id,
                "email": payload.email,
                "name": payload.name,
                "role": payload.role
            }
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500, 
            detail=f"User was created in Auth, but database profile sync failed: {str(e)}"
        )

@router.delete("/users/{id}", status_code=200)
async def delete_user(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=500, 
            detail="Supabase admin credentials not configured."
        )

    # 1. Delete user from Supabase Auth Admin GoTrue API
    headers = {
        "apikey": config.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}"
    }
    
    auth_url = f"{config.SUPABASE_URL}/auth/v1/admin/users/{id}"

    try:
        response = requests.delete(auth_url, headers=headers, timeout=10)
        # Note: If GoTrue returns 404 (user doesn't exist anymore), we should still proceed to clean up local profiles.
        if not response.ok and response.status_code != 404:
            error_msg = response.json().get("msg") or response.text
            raise HTTPException(
                status_code=response.status_code, 
                detail=f"Supabase Auth deletion failed: {error_msg}"
            )
            
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to communicate with Supabase Auth: {str(e)}"
        )

    # 2. Delete user profile from database profiles table
    try:
        profile = db.query(Profile).filter(Profile.id == id).first()
        if profile:
            db.delete(profile)
            db.commit()
            
        return {"message": "User deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500, 
            detail=f"User was deleted from Auth, but profile deletion failed: {str(e)}"
        )
