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

class ChatRequest(BaseModel):
    message: str
    context: Optional[dict] = None

def generate_local_fallback(message: str, context: Optional[dict]) -> str:
    message_lower = message.lower()
    projects = (context or {}).get("projects", [])
    vendors = (context or {}).get("vendors", [])
    vendor_bills = (context or {}).get("vendorBills", [])
    current_user = (context or {}).get("currentUser", {})

    def fmt_curr(val):
        try:
            val_f = float(val)
            if val_f >= 10000000: # 1 Crore = 10M
                return f"₹{val_f / 10000000:.2f} Cr"
            elif val_f >= 100000: # 1 Lakh = 100k
                return f"₹{val_f / 100000:.2f} L"
            return f"₹{val_f:,.2f}"
        except:
            return f"₹{val}"

    # Check for specific queries
    if "delay" in message_lower or "schedule" in message_lower:
        delayed_projects = [p for p in projects if p.get("status") == "Delayed" or "delay" in str(p.get("status")).lower()]
        if not delayed_projects:
            return (
                "### 📅 Schedule & Delay Analysis\n\n"
                "All active projects are currently logged as **On Track** or **Active** in the system.\n\n"
                "**Active Projects list:**\n" +
                "\n".join([f"- **{p.get('name')}**: {p.get('progress')}% completed (Phase: {p.get('currentPhase')})" for p in projects])
            )
        else:
            response = "### ⚠️ Delay Analysis & Schedule Risks\n\n"
            response += "The following projects have been flagged with schedule risks or delays:\n\n"
            for p in delayed_projects:
                response += f"- **{p.get('name')}** (Completion: {p.get('progress')}%)\n"
                response += f"  - *Status*: 🔴 {p.get('status')}\n"
                response += f"  - *Current Phase*: {p.get('currentPhase')}\n"
                activities = p.get("dailyActivities", [])
                delayed_activities = [a for a in activities if "delay" in str(a.get("notes", "")).lower() or a.get("status") == "delayed"]
                if delayed_activities:
                    response += "  - *Reported Issues*:\n"
                    for a in delayed_activities[:3]:
                        response += f"    - {a.get('date')}: {a.get('notes')}\n"
            response += "\n*Recommendation: Review supply chains (concrete/aggregate) and safety scaffolding setups to accelerate the critical path.*"
            return response

    elif "budget" in message_lower or "spend" in message_lower or "cost" in message_lower or "burn" in message_lower:
        response = "### 📊 Financial & Budget Burn Analysis\n\n"
        response += "| Project Site | Total Budget | Actual Spent | Burn Rate | Overrun Risk | Status |\n"
        response += "| :--- | :--- | :--- | :--- | :--- | :--- |\n"
        
        has_overrun = False
        for p in projects:
            budget = p.get("budget", 0)
            spent = p.get("actualSpend", 0)
            progress = p.get("progress", 0)
            burn_rate = (spent / budget * 100) if budget > 0 else 0
            
            status = "🟢 Under Budget"
            overrun_risk = "None"
            if spent > budget:
                status = "🔴 Overrun Exposure"
                overrun_risk = fmt_curr(spent - budget)
                has_overrun = True
            elif burn_rate > progress + 10:
                status = "🟡 High Burn Rate"
                overrun_risk = "At Risk"
            
            response += f"| **{p.get('name')}** | {fmt_curr(budget)} | {fmt_curr(spent)} | {burn_rate:.1f}% | {overrun_risk} | {status} |\n"
            
        if has_overrun:
            response += "\n**Financial Advisory**: Budget overrun detected in active sites. Review BOQ materials estimates and vendor rate fluctuations (especially steel/cement)."
        else:
            response += "\n**Financial Advisory**: All active project sites are operating within safe BOQ budget parameters."
        return response

    elif "material" in message_lower or "inventory" in message_lower or "stock" in message_lower or "shortage" in message_lower:
        low_materials = []
        for p in projects:
            materials = p.get("materials", [])
            for m in materials:
                qty = m.get("quantity", 0)
                reorder = m.get("reorderLevel", 0)
                if qty <= reorder:
                    low_materials.append({
                        "project": p.get("name"),
                        "item": m.get("itemName"),
                        "qty": qty,
                        "unit": m.get("unit"),
                        "reorder": reorder
                    })
        
        if not low_materials:
            return "### 📦 Inventory & Material Stock Levels\n\nAll construction material inventory levels are healthy and above their reorder thresholds."
        else:
            response = "### 🚨 Critical Material Shortages & Low Stock Alerts\n\n"
            response += "The following items are running below reorder levels and need procurement intervention:\n\n"
            response += "| Project Site | Material Item | Current Stock | Reorder Level | Action Required |\n"
            response += "| :--- | :--- | :--- | :--- | :--- |\n"
            for item in low_materials:
                response += f"| {item['project']} | **{item['item']}** | {item['qty']} {item['unit']} | {item['reorder']} {item['unit']} | 🔴 Raise PR / Dispatch PO |\n"
            response += "\n*Procurement recommendation: Raise/approve purchase requests to avoid site downtime.*"
            return response

    elif "vendor" in message_lower or "supplier" in message_lower:
        if not vendors:
            return "### 👥 Vendor Directory\n\nNo vendor profiles found in the current active context."
        response = "### 👥 Active Vendor Performance & Ratings\n\n"
        response += "| Vendor Name | Category | Performance Rating | Contact Details |\n"
        response += "| :--- | :--- | :--- | :--- |\n"
        for v in vendors[:8]:
            rating = v.get("rating", 0)
            stars = "⭐" * int(round(rating)) if rating > 0 else "No rating"
            response += f"| **{v.get('name')}** | {v.get('category')} | {stars} ({rating}/5) | {v.get('email') or 'No email'} · {v.get('phone') or ''} |\n"
        return response

    else:
        user_name = current_user.get("name", "User")
        response = f"### 👋 Hello {user_name}!\n\n"
        response += f"I am the **Pramukh Group Project Intelligence Assistant**. I can help you monitor and manage the following modules across your ERP:\n\n"
        response += "1. **📅 Schedule & Delays**: Ask me about delays, contract completion dates, or schedule timelines (e.g., 'Show project delays').\n"
        response += "2. **📊 Budget Burn**: Ask me to compare project budgets, expenditures, or cost overruns (e.g., 'budget overrun').\n"
        response += "3. **📦 Inventory & Materials**: Ask me about low stock or material shortages (e.g., 'material shortage').\n"
        response += "4. **👥 Vendors & Bills**: Ask me about active vendors or supplier performance.\n\n"
        if projects:
            response += f"Currently managing **{len(projects)} active project sites**:\n"
            for p in projects:
                response += f"- **{p.get('name')}**: {p.get('progress')}% done | Budget: {fmt_curr(p.get('budget', 0))}\n"
        return response

@router.post("/ai/chat")
async def ai_chat(
    payload: ChatRequest,
    current_user: dict = Depends(get_current_user)
):
    if not payload.message or not payload.message.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    # If OpenAI API Key is configured, use it
    if config.OPENAI_API_KEY:
        openai_client = OpenAI(api_key=config.OPENAI_API_KEY)
        
        system_prompt = (
            "You are the Pramukh Group Project Intelligence Assistant, a premium AI bot integrated "
            "into Pramukh Group's Construction Operations Platform. You have access to real-time ERP data "
            "provided in the context, including active projects, construction activities, procurement status, "
            "inventory, vendors, and budgets. Answer user queries accurately and professionally. "
            "Use clean markdown formatting, tables, list items, and bold text for clarity and readability. "
            "Do not output internal details or developer warnings to the user."
        )
        
        # Prepare context payload for the model
        context_summary = f"User role: {current_user.get('role', 'user')}\n"
        if payload.context:
            import json
            context_summary += f"Current ERP state context:\n{json.dumps(payload.context)}"
            
        try:
            chat_completion = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "system", "content": f"ERP Context:\n{context_summary}"},
                    {"role": "user", "content": payload.message}
                ],
                max_tokens=800,
                temperature=0.7
            )
            return {"response": chat_completion.choices[0].message.content}
        except Exception as e:
            # If OpenAI fails, fallback to local
            fallback_text = generate_local_fallback(payload.message, payload.context)
            return {
                "response": (
                    f"> [!WARNING]\n"
                    f"> OpenAI call failed: {str(e)}. Falling back to Local Database mode.\n\n"
                    f"{fallback_text}"
                )
            }
    else:
        # Otherwise, run in local fallback mode
        fallback_text = generate_local_fallback(payload.message, payload.context)
        return {
            "response": (
                f"> [!NOTE]\n"
                f"> OpenAI API key is not configured. Running in Local Database fallback mode.\n\n"
                f"{fallback_text}"
            )
        }

