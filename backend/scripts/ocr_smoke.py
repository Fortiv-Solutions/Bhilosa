"""
PP-OCRv5 smoke test.

Runs the router's own recognition path against page images and checks that the
values that actually matter on these invoices come back correct. Compares against
the strings Tesseract was getting wrong, so the benefit (or lack of it) is
measurable rather than assumed.

    cd backend
    .venv/Scripts/python.exe scripts/ocr_smoke.py ../frontend/scripts/pages

Generate the page images first with:  cd frontend && npx tsx scripts/dump-pages.ts
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

# Import the service module directly; no HTTP server needed for a smoke test.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.routers import ocr as ocr_router  # noqa: E402

# Ground truth per page of Procurement_Report_Formate/sample_invoice.pdf.
# Chosen to include the tokens Tesseract mis-read: GSTINs with Z/2 confusion,
# the cascading discount cell, and dense small table numbers.
EXPECTED = {
    "page1.png": [
        "AJIT TRADING CO", "G-2987", "24AVOPS6752N2ZN", "24ABYFA3137F1ZE",
        "69109000", "39222000", "162435.24", "218760.94", "86169.56",
        "467365.74", "551492.00", "4840.00", "14750.00", "5810.00",
        "AD/PAG/PO/2026/0122", "8055", "LCC000000004", "42062.92",
    ],
    "page2.png": [
        "BHAGAVAT ENTERPRISE", "BE-2026-27-3343", "24AUHPK6558N1Z1",
        "24ABZFA6800G1ZB", "38241000", "AC/PAM/PO/2026/0351", "GJ05CV4633",
        "47.00", "7,050.00", "8,319.00", "634.50", "IDFB0042261",
        "JOINT FILLER IVORY 1 KG", "21,08,663.00",
    ],
    "page3.png": [
        "ARCHIT CORPORATION", "26-27/499", "24ACIPS4047H1ZI", "24ABDFP8234D1ZG",
        "25232930", "SHREE CEMENT PPC", "305.000", "258.48", "38771.25",
        "3489.41", "6978.82", "45750.00", "GJ19Z3519", "YESB0000011",
        "162625322158405", "394315",
    ],
}


def normalise(s: str) -> str:
    """Collapse whitespace so multi-word expectations match across word boxes."""
    return " ".join(s.split()).upper()


def main() -> int:
    pages_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "../frontend/scripts/pages")
    if not pages_dir.is_dir():
        print(f"Page directory not found: {pages_dir.resolve()}")
        print("Run:  cd frontend && npx tsx scripts/dump-pages.ts")
        return 2

    print("Loading PP-OCRv5 ...")
    t0 = time.time()
    try:
        ocr_router.get_engine()
    except Exception as exc:  # noqa: BLE001
        print(f"ENGINE FAILED: {exc}")
        return 1
    print(f"  ready in {time.time() - t0:.1f}s  meta={ocr_router._engine_meta}\n")

    total_hits = 0
    total_expected = 0

    for name in sorted(EXPECTED):
        path = pages_dir / name
        if not path.exists():
            print(f"{name}: MISSING")
            continue

        t1 = time.time()
        words = ocr_router._run_ocr(path.read_bytes())
        elapsed = time.time() - t1

        # Reconstruct a searchable blob from the word boxes, in reading order.
        ordered = sorted(words, key=lambda w: (round(w["bbox"]["y0"] / 12), w["bbox"]["x0"]))
        blob = normalise(" ".join(w["text"] for w in ordered))
        joined_nospace = blob.replace(" ", "")

        confs = [w["confidence"] for w in words if w["confidence"]]
        mean_conf = sum(confs) / len(confs) if confs else 0.0

        expected = EXPECTED[name]
        hits, misses = [], []
        for token in expected:
            probe = normalise(token)
            if probe in blob or probe.replace(" ", "") in joined_nospace:
                hits.append(token)
            else:
                misses.append(token)

        total_hits += len(hits)
        total_expected += len(expected)

        print(f"{name}: words={len(words)} meanConf={mean_conf:.1f} {elapsed:.1f}s "
              f"tokens={len(hits)}/{len(expected)}")
        if misses:
            print(f"   MISSED: {' | '.join(misses)}")

        # Word-box sanity: table columns are resolved by x-position, so boxes that
        # each span most of the page width would be useless downstream.
        if words:
            widths = sorted(w["bbox"]["x1"] - w["bbox"]["x0"] for w in words)
            median_w = widths[len(widths) // 2]
            page_w = max(w["bbox"]["x1"] for w in words)
            print(f"   box width: median={median_w:.0f}px  page={page_w:.0f}px "
                  f"({median_w / max(page_w, 1) * 100:.1f}% of width)")

    print(f"\nTOTAL {total_hits}/{total_expected} expected tokens recognised")
    return 0 if total_hits == total_expected else 1


if __name__ == "__main__":
    raise SystemExit(main())
