from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, HttpUrl
from typing import Optional
from openai import OpenAI
from urllib.parse import urlparse

from ..core.security import get_current_user
from .. import config

router = APIRouter()

class QCAnalyzeRequest(BaseModel):
    imageBase64: str
    category: Optional[str] = "General construction quality"

class SiteInspectionRequest(BaseModel):
    imageUrl: str

def normalize_image_data(val: str) -> Optional[str]:
    val = val.strip()
    if len(val) < 24:
        return None
    if val.startswith("data:image/"):
        return val
    return f"data:image/jpeg;base64,{val}"

def is_valid_inspection_image_url(val: str) -> bool:
    if len(val) > 2048:
        return False
    try:
        parsed = urlparse(val)
        return parsed.scheme in ["http", "https"]
    except Exception:
        return False

@router.post("/qc/analyze")
async def qc_analyze(
    payload: QCAnalyzeRequest,
    current_user: dict = Depends(get_current_user)
):
    if not config.OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    image_url = normalize_image_data(payload.imageBase64)
    if not image_url:
        raise HTTPException(status_code=400, detail="A base64 construction image is required")

    category = payload.category or "General construction quality"
    openai_client = OpenAI(api_key=config.OPENAI_API_KEY)

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a professional civil engineer and construction quality inspector. Return concise Markdown with two sections: Defects/Issues Found and Corrective Actions. Do not invent certainty; say when the image is unclear."
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": f"Analyze this site construction photo for QC category: {category}."},
                        {"type": "image_url", "image_url": {"url": image_url}}
                    ]
                }
            ],
            max_tokens=700,
            temperature=0.2
        )
        
        findings = response.choices[0].message.content.strip() if response.choices else ""
        lower_findings = findings.lower()
        
        defects_found = bool(
            findings and
            "no major defects" not in lower_findings and
            "no defects" not in lower_findings and
            "no visible defects" not in lower_findings
        )
        
        return {
            "defectsFound": defects_found,
            "findings": findings
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing QC image: {str(e)}")

@router.post("/site-inspection")
async def site_inspection(
    payload: SiteInspectionRequest,
    current_user: dict = Depends(get_current_user)
):
    if not config.OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    image_url = payload.imageUrl
    if not is_valid_inspection_image_url(image_url):
        raise HTTPException(status_code=400, detail="A valid image URL is required")

    openai_client = OpenAI(api_key=config.OPENAI_API_KEY)

    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert construction site inspection AI. Analyze the provided image from a construction site. Generate a clear, structured summary report including: 1. Visual observations (what is happening), 2. Potential issues or safety hazards, 3. Overall progress assessment. Keep it professional, concise, and highly relevant."
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Please inspect this site image and generate a summary report."},
                        {"type": "image_url", "image_url": {"url": image_url}}
                    ]
                }
            ],
            max_tokens=800
        )
        
        report = response.choices[0].message.content if response.choices else ""
        return {"report": report}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing image: {str(e)}")
