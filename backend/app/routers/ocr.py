"""
PaddleOCR text-recognition service.

Why this exists
---------------
The invoice extraction pipeline lives in the Next.js app and is deterministic:
geometry-driven table reconstruction plus GST-specific arithmetic reconciliation.
It was reading characters with tesseract.js, which is where its remaining errors
came from — dates read as 2028 instead of 2026, vehicle numbers as GA05CV4544
instead of GJ05CV4633. Those are recognition failures, not layout failures.

This service replaces ONLY the character recognition. PP-OCRv5 is materially more
accurate than Tesseract on exactly the material that was failing (small print,
photographed pages, mixed digits and letters), is Apache-2.0 licensed with no
per-page cost, and runs on CPU without a GPU.

Word-level boxes
----------------
The consumer needs WORD boxes, because table columns are resolved by horizontal
position: a whole line returned as one box ("JOINT FILLER IVORY 1 KG 38241000 18%
150 PKTS 47.00 7,050.00") cannot be split into cells. PaddleOCR detects text
regions, not words, so this module always emits word-level boxes — using the
engine's own word boxes when the installed version can produce them, and
subdividing a region proportionally by character width otherwise.
"""

from __future__ import annotations

import io
import logging
import os
import math
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter()
logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 25 * 1024 * 1024

# Longest edge, in pixels, fed to inference. See _run_ocr for why this exists:
# an uncapped ~4600px page segfaulted the process on a 7.8 GB CPU-only machine.
# 0 disables the cap (for a machine with headroom).
MAX_INFER_SIDE = int(os.environ.get("PADDLE_MAX_INFER_SIDE", "2200"))

# ---------------------------------------------------------------------------
# Engine singleton
# ---------------------------------------------------------------------------
# Loading PP-OCRv5 costs seconds and hundreds of MB, so it is built once and
# reused. A lock guards construction; PaddleOCR itself is not thread-safe for
# concurrent predict calls, so inference is serialised too.

_engine: Any = None
_engine_error: Optional[str] = None
_engine_lock = threading.Lock()
_infer_lock = threading.Lock()
_engine_meta: Dict[str, Any] = {}


def _build_engine() -> Any:
    """Construct a PaddleOCR instance, tolerating API differences across versions."""
    from paddleocr import PaddleOCR  # imported lazily: heavy dependency

    # PaddleOCR's constructor keywords have changed repeatedly between 2.x and
    # 3.x. Try the richest configuration first and progressively drop arguments
    # that the installed version rejects, so a version bump degrades gracefully
    # instead of failing outright.
    # MOBILE models, explicitly.
    #
    # Left to itself PaddleOCR 3.x selects the `server` detection and recognition
    # models. Those are the large, accurate variants intended for GPU boxes: on a
    # 7.8 GB CPU-only machine, running one over a 3181x4614 page segfaulted the
    # process (SIGSEGV) part-way through detection. The mobile variants are built
    # for exactly this environment and are a small accuracy trade for not crashing.
    #
    # Overridable so a GPU deployment can opt back into the server models.
    det_model = os.environ.get("PADDLE_DET_MODEL", "PP-OCRv5_mobile_det")
    rec_model = os.environ.get("PADDLE_REC_MODEL", "PP-OCRv5_mobile_rec")

    attempts: List[Dict[str, Any]] = [
        # PaddleOCR 3.x, mobile models pinned by name.
        {
            "lang": "en",
            "ocr_version": "PP-OCRv5",
            "text_detection_model_name": det_model,
            "text_recognition_model_name": rec_model,
            # Document-level orientation and dewarping are already handled upstream
            # by the Node pipeline; running them again wastes memory and time.
            "use_doc_orientation_classify": False,
            "use_doc_unwarping": False,
            "use_textline_orientation": True,
        },
        # Same, without textline orientation (one less model in memory).
        {
            "lang": "en",
            "ocr_version": "PP-OCRv5",
            "text_detection_model_name": det_model,
            "text_recognition_model_name": rec_model,
            "use_doc_orientation_classify": False,
            "use_doc_unwarping": False,
            "use_textline_orientation": False,
        },
        {"lang": "en", "ocr_version": "PP-OCRv5"},
        # PaddleOCR 2.x
        {"lang": "en", "use_angle_cls": True, "show_log": False},
        {"lang": "en"},
        {},
    ]

    last: Optional[Exception] = None
    for kwargs in attempts:
        try:
            engine = PaddleOCR(**kwargs)
            _engine_meta["init_kwargs"] = kwargs
            return engine
        except Exception as exc:  # noqa: BLE001 - probing for a working signature
            last = exc
            continue
    raise RuntimeError(f"PaddleOCR could not be initialised: {last}")


def get_engine() -> Any:
    """Return the shared engine, raising a clear error if it cannot be built."""
    global _engine, _engine_error
    if _engine is not None:
        return _engine
    with _engine_lock:
        if _engine is not None:
            return _engine
        if _engine_error is not None:
            raise RuntimeError(_engine_error)
        try:
            started = time.time()
            _engine = _build_engine()
            _engine_meta["load_seconds"] = round(time.time() - started, 2)
            try:
                import paddleocr

                _engine_meta["paddleocr_version"] = getattr(paddleocr, "__version__", "unknown")
            except Exception:  # noqa: BLE001
                pass
            logger.info("PaddleOCR ready: %s", _engine_meta)
            return _engine
        except Exception as exc:  # noqa: BLE001
            _engine_error = (
                f"{type(exc).__name__}: {exc}. Install the OCR dependencies with "
                "`pip install -r backend/requirements.txt` (paddlepaddle + paddleocr)."
            )
            raise RuntimeError(_engine_error) from exc


# ---------------------------------------------------------------------------
# Result normalisation
# ---------------------------------------------------------------------------


def _poly_to_bbox(poly: Any) -> Optional[Tuple[float, float, float, float]]:
    """Reduce a detection polygon (4+ points) to an axis-aligned box."""
    try:
        xs = [float(p[0]) for p in poly]
        ys = [float(p[1]) for p in poly]
    except (TypeError, ValueError, IndexError):
        return None
    if not xs or not ys:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def _split_region_into_words(
    text: str,
    bbox: Tuple[float, float, float, float],
    confidence: float,
) -> List[Dict[str, Any]]:
    """
    Subdivide a text region into word boxes by proportional character width.

    Used when the engine reports only region boxes. It assumes roughly uniform
    glyph advance across the region, which holds well enough for the purpose the
    boxes serve: deciding which table column a token belongs to. A single space is
    counted as one character so gaps are apportioned too.
    """
    x0, y0, x1, y1 = bbox
    stripped = text.strip()
    if not stripped:
        return []

    tokens = stripped.split()
    if len(tokens) <= 1:
        return [{"text": stripped, "confidence": confidence, "bbox": {"x0": x0, "y0": y0, "x1": x1, "y1": y1}}]

    total_chars = len(stripped)
    if total_chars <= 0:
        return []
    width = max(1.0, x1 - x0)
    per_char = width / total_chars

    words: List[Dict[str, Any]] = []
    cursor = 0
    for token in tokens:
        # Advance past any spaces preceding this token.
        idx = stripped.find(token, cursor)
        if idx < 0:
            idx = cursor
        start = x0 + idx * per_char
        end = x0 + (idx + len(token)) * per_char
        words.append(
            {
                "text": token,
                "confidence": confidence,
                "bbox": {"x0": start, "y0": y0, "x1": min(end, x1), "y1": y1},
            }
        )
        cursor = idx + len(token)
    return words


def _extract_word_boxes(entry: Any) -> Optional[List[Dict[str, Any]]]:
    """
    Pull genuine word-level boxes out of a result entry when the engine supplies
    them (PaddleOCR exposes these when asked for word boxes). Returns None when
    unavailable so the caller can fall back to proportional splitting.
    """
    if not isinstance(entry, (list, tuple)) or len(entry) < 2:
        return None
    payload = entry[1]
    # Word-box mode yields (text, score, [[word_poly, word_text], ...]) shapes
    # that differ by version; only accept a shape we can read confidently.
    if not isinstance(payload, (list, tuple)) or len(payload) < 3:
        return None
    candidates = payload[2]
    if not isinstance(candidates, (list, tuple)) or not candidates:
        return None

    out: List[Dict[str, Any]] = []
    for cand in candidates:
        if not isinstance(cand, (list, tuple)) or len(cand) < 2:
            return None
        bbox = _poly_to_bbox(cand[0])
        word_text = cand[1]
        if bbox is None or not isinstance(word_text, str) or not word_text.strip():
            continue
        out.append(
            {
                "text": word_text.strip(),
                "confidence": float(payload[1]) * 100.0 if len(payload) > 1 else 0.0,
                "bbox": {"x0": bbox[0], "y0": bbox[1], "x1": bbox[2], "y1": bbox[3]},
            }
        )
    return out or None


def _normalise_v3(result: Any) -> Optional[List[Dict[str, Any]]]:
    """
    Read a PaddleOCR 3.x result, which is a list of dict-like page objects with
    parallel `rec_texts` / `rec_scores` / `dt_polys` arrays.
    """
    pages = result if isinstance(result, list) else [result]
    words: List[Dict[str, Any]] = []
    matched = False

    for page in pages:
        data = page
        # 3.x returns objects exposing the payload under .json or dict access.
        if hasattr(page, "json"):
            try:
                data = page.json
                if isinstance(data, dict) and "res" in data:
                    data = data["res"]
            except Exception:  # noqa: BLE001
                data = page
        if not isinstance(data, dict):
            continue

        texts = data.get("rec_texts")
        scores = data.get("rec_scores")
        polys = data.get("rec_polys") or data.get("dt_polys")
        if not texts or polys is None:
            continue
        matched = True

        for i, text in enumerate(texts):
            if not isinstance(text, str) or not text.strip():
                continue
            bbox = _poly_to_bbox(polys[i]) if i < len(polys) else None
            if bbox is None:
                continue
            score = 0.0
            if scores is not None and i < len(scores):
                try:
                    score = float(scores[i])
                except (TypeError, ValueError):
                    score = 0.0
            words.extend(_split_region_into_words(text, bbox, score * 100.0))

    return words if matched else None


def _normalise_v2(result: Any) -> List[Dict[str, Any]]:
    """
    Read a PaddleOCR 2.x result: [[ [poly, (text, score)], ... ]] per image.
    """
    words: List[Dict[str, Any]] = []
    pages = result if isinstance(result, list) else [result]

    for page in pages:
        if page is None:
            continue
        entries = page if isinstance(page, (list, tuple)) else [page]
        for entry in entries:
            if not isinstance(entry, (list, tuple)) or len(entry) < 2:
                continue

            explicit = _extract_word_boxes(entry)
            if explicit:
                words.extend(explicit)
                continue

            bbox = _poly_to_bbox(entry[0])
            payload = entry[1]
            if bbox is None:
                continue
            if isinstance(payload, (list, tuple)) and payload:
                text = payload[0]
                try:
                    score = float(payload[1]) if len(payload) > 1 else 0.0
                except (TypeError, ValueError):
                    score = 0.0
            elif isinstance(payload, str):
                text = payload
                score = 0.0
            else:
                continue
            if not isinstance(text, str) or not text.strip():
                continue
            words.extend(_split_region_into_words(text, bbox, score * 100.0))
    return words


def _run_ocr(image_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Recognise an image, returning word-level boxes with 0-100 confidences.

    Boxes are always returned in the coordinate space of the image that was passed
    IN. If the image is downscaled for inference the boxes are scaled back, because
    the caller's table geometry is expressed against the image it sent.
    """
    engine = get_engine()

    import numpy as np
    from PIL import Image

    with Image.open(io.BytesIO(image_bytes)) as img:
        # PaddleOCR expects a 3-channel array.
        rgb = img.convert("RGB")

        # Cap the inference size. The Node pipeline renders at 400 dpi, giving
        # ~4600px pages; detection over a tensor that size exhausted memory on a
        # 7.8 GB machine and killed the process. Downscaling to ~2200px keeps well
        # clear of that while remaining above the ~2000px floor needed to resolve
        # small invoice print.
        scale = 1.0
        long_edge = max(rgb.width, rgb.height)
        if MAX_INFER_SIDE > 0 and long_edge > MAX_INFER_SIDE:
            scale = MAX_INFER_SIDE / float(long_edge)
            rgb = rgb.resize(
                (max(1, int(rgb.width * scale)), max(1, int(rgb.height * scale))),
                Image.LANCZOS,
            )
        array = np.array(rgb)

    with _infer_lock:
        result = None
        # `predict` is the 3.x entry point; `ocr` covers 2.x. Try both.
        for call in ("predict", "ocr"):
            fn = getattr(engine, call, None)
            if fn is None:
                continue
            try:
                result = fn(array)
                break
            except TypeError:
                try:
                    result = fn(array, cls=True)
                    break
                except Exception:  # noqa: BLE001
                    continue
            except Exception:  # noqa: BLE001
                continue
        if result is None:
            raise RuntimeError("PaddleOCR returned no result for this image.")

    words = _normalise_v3(result)
    if words is None:
        words = _normalise_v2(result)

    # Undo the inference downscale so boxes match the image the caller sent.
    if scale != 1.0 and scale > 0:
        inv = 1.0 / scale
        for w in words:
            b = w["bbox"]
            b["x0"] *= inv
            b["y0"] *= inv
            b["x1"] *= inv
            b["y1"] *= inv
    return words


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/ocr/health")
def ocr_health() -> Dict[str, Any]:
    """
    Report whether the OCR engine can actually run.

    The Next.js pipeline calls this before choosing a provider, so that a backend
    without the OCR dependencies installed causes a clean fall back to the bundled
    engine rather than a failed extraction.
    """
    try:
        get_engine()
        return {"ok": True, "engine": "paddleocr", "meta": _engine_meta}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "engine": "paddleocr", "error": str(exc)}


@router.post("/ocr/recognize")
async def ocr_recognize(file: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Recognise text in an image and return word-level boxes.

    Response shape is deliberately engine-neutral so the caller can swap providers:
      { words: [{ text, confidence (0-100), bbox: {x0,y0,x1,y1} }], engine, ms }
    """
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Empty upload.")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image too large ({len(payload) / 1048576:.1f} MB); limit is 25 MB.",
        )

    started = time.time()
    try:
        words = _run_ocr(payload)
    except RuntimeError as exc:
        # 503 signals "engine unavailable" so the caller can fall back rather than
        # treating it as a permanent failure of the document.
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc

    confidences = [w["confidence"] for w in words if w.get("confidence")]
    mean_conf = sum(confidences) / len(confidences) if confidences else 0.0

    return {
        "words": words,
        "wordCount": len(words),
        "meanConfidence": round(mean_conf, 2),
        "engine": f"paddleocr/{_engine_meta.get('paddleocr_version', 'unknown')}",
        "ms": int((time.time() - started) * 1000),
    }
