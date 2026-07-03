from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from typing import Optional
import re
import base64
import requests
from datetime import datetime
from openai import OpenAI

from ..database import get_db
from ..core.security import get_current_user
from ..models import OutboundMessage
from .. import config

router = APIRouter()

PHONE_PATTERN = re.compile(r"^\+?[0-9]{8,15}$")
UUID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)

class SendMessageRequest(BaseModel):
    to: str
    text: str
    source: Optional[str] = "dashboard"
    timestamp: Optional[str] = None
    site_id: Optional[str] = None
    project_id: Optional[str] = None
    thread_id: Optional[str] = None
    to_user_id: Optional[str] = None

class TranscribeBase64Request(BaseModel):
    audioBase64: str
    mimeType: Optional[str] = "audio/webm"

def optional_uuid(val: Optional[str]) -> Optional[str]:
    if not val:
        return None
    val = val.strip()
    if UUID_PATTERN.match(val):
        return val
    return None

def normalize_phone(val: str) -> Optional[str]:
    val = val.strip()
    if not PHONE_PATTERN.match(val):
        return None
    if val.startswith("+"):
        return val[1:]
    return val

@router.post("/send-message")
async def send_message(
    payload: SendMessageRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    to_phone = normalize_phone(payload.to)
    text = payload.text.strip() if payload.text else ""

    if not to_phone:
        raise HTTPException(status_code=400, detail="Recipient phone number is invalid")

    if not text or len(text) > 4000:
        raise HTTPException(status_code=400, detail="Message text is required and must be 4000 characters or fewer")

    project_id = optional_uuid(payload.project_id) or optional_uuid(payload.site_id)
    site_id = optional_uuid(payload.site_id)
    thread_id = optional_uuid(payload.thread_id)
    to_user_id = optional_uuid(payload.to_user_id)

    # Directly save message as 'sent'
    outbound = OutboundMessage(
        project_id=project_id,
        site_id=site_id,
        thread_id=thread_id,
        to_user_id=to_user_id,
        to_phone=to_phone,
        message_text=text,
        message_type="text",
        status="sent",
        source="mobile" if payload.source == "mobile" else "dashboard",
        sent_by=current_user.get("id"),
        sent_at=datetime.utcnow(),
        provider_response={"status": "directly_sent"}
    )
    
    try:
        db.add(outbound)
        db.commit()
        db.refresh(outbound)
        
        return {
            "id": str(outbound.id),
            "status": "sent",
            "webhookConfigured": False
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Unexpected send-message failure: {str(e)}")

@router.post("/transcribe")
async def transcribe(
    request: Request,
    file: Optional[UploadFile] = File(None),
    payload: Optional[TranscribeBase64Request] = None,
    current_user: dict = Depends(get_current_user)
):
    if not config.OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    openai_client = OpenAI(api_key=config.OPENAI_API_KEY)
    
    # We will write the file content to a temporary location to call Whisper
    import tempfile
    import os

    audio_bytes = None
    filename = "audio.webm"

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        body = await request.json()
        audio_b64 = body.get("audioBase64")
        if not audio_b64:
            raise HTTPException(status_code=400, detail="No audio payload provided")
        mime_type = body.get("mimeType", "audio/webm")
        audio_bytes = base64.b64decode(audio_b64)
        ext = "mp4" if "mp4" in mime_type else "mp3" if "mpeg" in mime_type else "webm"
        filename = f"audio.{ext}"
    else:
        # Form Data
        if not file:
            raise HTTPException(status_code=400, detail="No audio file provided")
        audio_bytes = await file.read()
        filename = file.filename

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="No audio content found")

    if len(audio_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio file must be 25 MB or smaller")

    # Save to temp file because OpenAI Python library requires a file-like object with a name property
    with tempfile.NamedTemporaryFile(delete=False, suffix=f"_{filename}") as temp_file:
        temp_file.write(audio_bytes)
        temp_path = temp_file.name

    try:
        with open(temp_path, "rb") as f:
            transcription = openai_client.audio.transcriptions.create(
                file=f,
                model="whisper-1"
            )
        return {"text": transcription.text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error transcribing audio: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
