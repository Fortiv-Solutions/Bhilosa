# ============================================================================
# PRAMUKH GROUP ERP V2 — FASTAPI BUDGET ROUTER
# File: backend/app/routers/budget.py
#
# Every endpoint now reads live Supabase data.
#
# What was wrong before: this module imported no database client at all. All five
# endpoints returned hardcoded literals —
#     total_bac = 1453638820.0
#     total_actual = 329480000.0
#     retention_gauge = {"retention_held": 619500.0, ...}
#     variance_drivers = [four invented rows]
#     lifecycle_data = [a 12-month S-curve with invented milestones]
# — and POST /budget/master/revision returned a success envelope while writing
# nothing. GET /budget/master served master_budget_seed.py rather than the database.
# VarianceUpdateRequest and LedgerEntryRequest were declared with no endpoints.
#
# Auth: requests must carry the caller's Supabase JWT. Reads and writes run under
# that identity, so row-level security applies to API traffic exactly as it does in
# the browser — the backend is not an RLS bypass.
# ============================================================================

from collections import defaultdict
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from ..services import supabase_rest as sb

router = APIRouter()


# ----------------------------------------------------------------------------
# REQUEST SCHEMAS
# ----------------------------------------------------------------------------

class MasterBudgetItemPatch(BaseModel):
    id: str
    qty_rcc: Optional[float] = None
    qty_finishes: Optional[float] = None
    qty_infra: Optional[float] = None
    qty_total: float = Field(ge=0)
    estimated_rate: float = Field(ge=0)


class BudgetRevisionRequest(BaseModel):
    project_id: str
    justification_reason: str = Field(min_length=1)
    edited_by: Optional[str] = None
    updated_items: List[MasterBudgetItemPatch] = Field(min_length=1)


class VarianceItemPatch(BaseModel):
    id: str
    actual_bill_qty: float = Field(ge=0)
    actual_bill_rate: float = Field(ge=0)
    remark: str = ""


class VarianceUpdateRequest(BaseModel):
    project_id: str
    justification_reason: str = ""
    edited_by: Optional[str] = None
    items: List[VarianceItemPatch] = Field(min_length=1)


# ----------------------------------------------------------------------------
# HELPERS
# ----------------------------------------------------------------------------

def _token(authorization: Optional[str]) -> str:
    token = sb.bearer_from_header(authorization)
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Authorization header with a Supabase access token is required.",
        )
    return token


def _project_filter(project_id: Optional[str]) -> Dict[str, str]:
    """Empty dict means portfolio-wide (no project_id filter)."""
    if not project_id or project_id.lower() in ("all", "null", "none"):
        return {}
    return {"project_id": f"eq.{project_id}"}


def _require_project(project_id: Optional[str]) -> str:
    if not project_id or project_id.lower() in ("all", "null", "none"):
        raise HTTPException(status_code=400, detail="A specific project_id is required.")
    return project_id


# ----------------------------------------------------------------------------
# 1. EXECUTIVE OVERVIEW
# ----------------------------------------------------------------------------

@router.get("/budget/overview")
def get_budget_overview(
    project_id: Optional[str] = Query(None, description="Project UUID, or omit for the portfolio"),
    authorization: Optional[str] = Header(None),
):
    """
    Executive budget metrics computed from portfolio_budget_summary plus the top
    variance drivers ranked from budget_variance_items.
    """
    token = _token(authorization)
    filters = _project_filter(project_id)

    summary_rows = sb.select("portfolio_budget_summary", token, filters=filters)
    if not summary_rows:
        raise HTTPException(status_code=404, detail="No budget summary found for that project.")

    def total(field: str) -> float:
        return sum(sb.to_float(row.get(field)) for row in summary_rows)

    baseline = total("baseline_amount")
    allocated = total("allocated_amount") or baseline
    committed = total("committed_amount")
    spent = total("spent_amount")
    bua = total("bua_sqft")

    # Variance drivers: only lines with real billing activity can drive variance.
    variance_rows = sb.select(
        "budget_variance_items",
        token,
        columns="sub_activity,category_name,budget_cost,actual_total_cost,cost_variance_amount,cost_variance_percent",
        filters={**filters, "actual_total_cost": "gt.0"},
        order="cost_variance_amount.asc",
        limit=200,
    )

    drivers = sorted(
        (
            {
                "name": row.get("sub_activity"),
                "category": row.get("category_name"),
                # Signed: positive = saving, negative = overrun (matches the DB trigger).
                "amount": sb.to_float(row.get("cost_variance_amount")),
                "percent": sb.to_float(row.get("cost_variance_percent")),
                "type": "Saving" if sb.to_float(row.get("cost_variance_amount")) >= 0 else "Overrun",
            }
            for row in variance_rows
        ),
        key=lambda d: abs(d["amount"]),
        reverse=True,
    )[:12]

    realised_overrun = sum(abs(d["amount"]) for d in drivers if d["type"] == "Overrun")

    return {
        "status": "success",
        "project_id": project_id or "all",
        "projects": [
            {
                "project_id": row.get("project_id"),
                "project_code": row.get("project_code"),
                "project_name": row.get("project_name"),
            }
            for row in summary_rows
        ],
        "bua_sqft": bua,
        "metrics": {
            "baseline_amount": baseline,
            "allocated_amount": allocated,
            "committed_amount": committed,
            "spent_amount": spent,
            "available_amount": allocated - committed - spent,
            # EAC = approved baseline + realised overruns. Savings are not netted
            # off, because an unspent allowance is not a guaranteed recovery.
            "estimate_at_completion": baseline + realised_overrun,
            # Signed variance, consistent with the frontend and the DB trigger.
            "net_variance": baseline - spent,
            "utilization_percent": round(((committed + spent) / allocated) * 100, 2) if allocated else 0.0,
            "billed_percent": round((spent / baseline) * 100, 2) if baseline else 0.0,
            "cost_per_bua": round(baseline / bua, 2) if bua else 0.0,
            "overrun_amount": total("overrun_amount"),
            "line_item_count": sum(sb.to_int(row.get("line_item_count")) for row in summary_rows),
            "category_count": sum(sb.to_int(row.get("category_count")) for row in summary_rows),
        },
        "retention_gauge": {
            "retention_held": total("retention_held"),
            "advance_outstanding": total("advance_amount"),
            "open_alert_count": sum(sb.to_int(row.get("open_alert_count")) for row in summary_rows),
        },
        "variance_drivers": drivers,
    }


# ----------------------------------------------------------------------------
# 2. MASTER BUDGET
# ----------------------------------------------------------------------------

@router.get("/budget/master")
def get_master_budget(
    project_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    """Master budget categories and line items, joined to their variance actuals."""
    token = _token(authorization)
    filters = _project_filter(project_id)

    categories = sb.select(
        "budget_categories",
        token,
        columns="id,project_id,category_name,category_code,sort_order",
        filters=filters,
        order="sort_order.asc",
        limit=1000,
    )
    items = sb.select(
        "master_budget_items",
        token,
        columns=(
            "id,project_id,category_id,category_name,sr_no,item_description,"
            "qty_rcc,qty_finishes,qty_infra,qty_total,unit,estimated_rate,"
            "budgeted_cost,cost_per_bua,scope_tag,item_type,sort_order,version_number"
        ),
        filters={**filters, "is_active": "eq.true", "deleted_at": "is.null"},
        order="sort_order.asc",
        limit=5000,
    )
    variances = sb.select(
        "budget_variance_items",
        token,
        columns="master_budget_item_id,po_qty,po_rate,po_amount,actual_bill_qty,actual_bill_rate,actual_total_cost,work_status,remark",
        filters=filters,
        limit=5000,
    )

    variance_by_item = {
        row["master_budget_item_id"]: row for row in variances if row.get("master_budget_item_id")
    }
    items_by_category: Dict[Any, List[Dict[str, Any]]] = defaultdict(list)
    for item in items:
        items_by_category[item.get("category_id")].append(item)

    payload_categories = []
    for category in categories:
        cat_items = items_by_category.get(category["id"], [])
        mapped = []
        for item in cat_items:
            variance = variance_by_item.get(item["id"], {})
            mapped.append(
                {
                    "id": item["id"],
                    "srNo": item.get("sr_no"),
                    "item": item.get("item_description"),
                    "qtyRcc": item.get("qty_rcc"),
                    "qtyFinishes": item.get("qty_finishes"),
                    "qtyInfra": item.get("qty_infra"),
                    "qtyTotal": sb.to_float(item.get("qty_total"), 1.0),
                    "unit": item.get("unit") or "LS",
                    "rate": sb.to_float(item.get("estimated_rate")),
                    "cost": sb.to_float(item.get("budgeted_cost")),
                    "costPerBua": sb.to_float(item.get("cost_per_bua")),
                    "scopeTag": item.get("scope_tag"),
                    "itemType": item.get("item_type"),
                    "poAmount": sb.to_float(variance.get("po_amount")),
                    "actualTotalCost": sb.to_float(variance.get("actual_total_cost")),
                    "workStatus": variance.get("work_status") or "Not Started",
                    "remark": variance.get("remark"),
                }
            )

        total_cost = sum(entry["cost"] for entry in mapped)
        payload_categories.append(
            {
                "id": category["id"],
                "categoryName": category.get("category_name"),
                "categoryCode": category.get("category_code"),
                "items": mapped,
                "totalCost": total_cost,
                "totalCommitted": sum(entry["poAmount"] for entry in mapped),
                "totalSpent": sum(entry["actualTotalCost"] for entry in mapped),
            }
        )

    return {
        "status": "success",
        "project_id": project_id or "all",
        "total_categories_count": len(payload_categories),
        "total_line_items": sum(len(c["items"]) for c in payload_categories),
        "total_baseline_cost": sum(c["totalCost"] for c in payload_categories),
        "categories": payload_categories,
    }


# ----------------------------------------------------------------------------
# 3. SAVE A MASTER BUDGET REVISION
# ----------------------------------------------------------------------------

@router.post("/budget/master/revision")
def save_budget_revision(
    payload: BudgetRevisionRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Commit a change order through rpc_save_master_budget_revision — one transaction
    that writes the audit trail, updates the line items, and cascades to allocations
    and the variance sheet. The database enforces the budget lock.
    """
    token = _token(authorization)

    revision = sb.rpc(
        "rpc_save_master_budget_revision",
        token,
        {
            "p_project_id": _require_project(payload.project_id),
            "p_justification": payload.justification_reason.strip(),
            "p_edited_by_name": payload.edited_by or "Pramukh ERP API",
            "p_items": [item.model_dump() for item in payload.updated_items],
        },
    )

    return {"status": "success", "revision": revision}


# ----------------------------------------------------------------------------
# 4. SAVE VARIANCE RECONCILIATION
# ----------------------------------------------------------------------------

@router.post("/budget/variance")
def save_variance_reconciliation(
    payload: VarianceUpdateRequest,
    authorization: Optional[str] = Header(None),
):
    """Commit billed quantities/rates through rpc_save_variance_reconciliation."""
    token = _token(authorization)

    revision = sb.rpc(
        "rpc_save_variance_reconciliation",
        token,
        {
            "p_project_id": _require_project(payload.project_id),
            "p_justification": payload.justification_reason,
            "p_edited_by_name": payload.edited_by or "Pramukh ERP API",
            "p_items": [item.model_dump() for item in payload.items],
        },
    )

    return {"status": "success", "revision": revision}


# ----------------------------------------------------------------------------
# 5. REVISION HISTORY
# ----------------------------------------------------------------------------

@router.get("/budget/revisions")
def get_budget_revisions(
    project_id: Optional[str] = Query(None),
    scope: Optional[str] = Query(None, description="master_budget | variance_reconciliation | excel_import"),
    authorization: Optional[str] = Header(None),
):
    token = _token(authorization)
    filters = _project_filter(project_id)
    if scope:
        filters["scope"] = f"eq.{scope}"

    revisions = sb.select(
        "budget_revisions",
        token,
        columns=(
            "id,project_id,version_number,version_label,justification_reason,"
            "old_total_cost,new_total_cost,net_diff_amount,edited_by_name,status,scope,created_at,"
            "budget_revision_items(id,sub_activity,category_name,old_qty,new_qty,old_rate,new_rate,old_cost,new_cost)"
        ),
        filters=filters,
        order="created_at.desc",
        limit=100,
    )

    return {"status": "success", "project_id": project_id or "all", "revisions": revisions}


# ----------------------------------------------------------------------------
# 6. BILL-WISE LEDGER
# ----------------------------------------------------------------------------

@router.get("/budget/ledger")
def get_bill_ledger(
    project_id: Optional[str] = Query(None),
    payment_status: Optional[str] = Query(None),
    limit: int = Query(500, le=5000),
    authorization: Optional[str] = Header(None),
):
    """Project-wise bill-wise ledger, read from budget_bill_ledger_view."""
    token = _token(authorization)
    filters = _project_filter(project_id)
    if payment_status and payment_status != "All":
        filters["payment_status"] = f"eq.{payment_status}"

    rows = sb.select(
        "budget_bill_ledger_view",
        token,
        filters=filters,
        order="bill_date_of_supplier.desc",
        limit=limit,
    )

    return {
        "status": "success",
        "project_id": project_id or "all",
        "row_count": len(rows),
        "totals": {
            "gross_billed": sum(sb.to_float(r.get("gross_bill_amount")) for r in rows),
            "net_payable": sum(sb.to_float(r.get("final_bill_amount")) for r in rows),
            "retention_held": sum(sb.to_float(r.get("retention_deduction")) for r in rows),
            "advances_adjusted": sum(sb.to_float(r.get("advance_payment")) for r in rows),
            "paid_to_date": sum(sb.to_float(r.get("jv_payment")) for r in rows),
            "outstanding": sum(sb.to_float(r.get("expected_payment")) for r in rows),
        },
        "rows": rows,
    }


# ----------------------------------------------------------------------------
# 7. CASH-FLOW S-CURVE
# ----------------------------------------------------------------------------

@router.get("/budget/scurve")
def get_budget_scurve(
    project_id: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    """
    Monthly cash-flow curve from budget_monthly_cashflow_view (posted ledger
    transactions). The planned series is an explicit straight-line spread of the
    baseline across the observed months — it is a reference line, not a
    schedule-derived forecast, and is labelled as such.
    """
    token = _token(authorization)
    filters = _project_filter(project_id)

    monthly = sb.select(
        "budget_monthly_cashflow_view",
        token,
        filters=filters,
        order="month_start.asc",
        limit=500,
    )
    summary_rows = sb.select("portfolio_budget_summary", token, filters=filters)
    baseline = sum(sb.to_float(row.get("baseline_amount")) for row in summary_rows)

    buckets: Dict[str, Dict[str, float]] = defaultdict(lambda: {"actual": 0.0, "committed": 0.0})
    for row in monthly:
        key = str(row.get("month_start"))[:7]
        buckets[key]["actual"] += sb.to_float(row.get("actual_amount"))
        buckets[key]["committed"] += sb.to_float(row.get("committed_amount"))

    months = sorted(buckets.keys())
    planned_per_month = baseline / len(months) if months else 0.0

    lifecycle: List[Dict[str, Any]] = []
    cum_actual = cum_committed = cum_planned = 0.0
    for key in months:
        bucket = buckets[key]
        cum_actual += bucket["actual"]
        cum_committed += bucket["committed"]
        cum_planned += planned_per_month
        lifecycle.append(
            {
                "month": key,
                "plannedCumulative": round(cum_planned / 10_000_000, 2),
                "actualCumulative": round(cum_actual / 10_000_000, 2),
                "committedCumulative": round(cum_committed / 10_000_000, 2),
                "monthlyPlanned": round(planned_per_month / 100_000, 2),
                "monthlyActual": round(bucket["actual"] / 100_000, 2),
                "monthlyCommitted": round(bucket["committed"] / 100_000, 2),
            }
        )

    peak = max(lifecycle, key=lambda p: p["monthlyActual"], default=None)

    return {
        "status": "success",
        "project_id": project_id or "all",
        "planned_series_basis": "straight-line spread of approved baseline across months with ledger activity",
        "baseline_amount": baseline,
        "peak_outflow_month": peak["month"] if peak else None,
        "peak_outflow_amount_lakhs": peak["monthlyActual"] if peak else 0.0,
        "lifecycle_data": lifecycle,
    }


# ----------------------------------------------------------------------------
# 8. ALERTS
# ----------------------------------------------------------------------------

@router.get("/budget/alerts")
def get_budget_alerts(
    project_id: Optional[str] = Query(None),
    status: str = Query("pending"),
    authorization: Optional[str] = Header(None),
):
    token = _token(authorization)
    filters = _project_filter(project_id)
    if status and status != "all":
        filters["status"] = f"eq.{status}"

    alerts = sb.select(
        "budget_alerts",
        token,
        columns=(
            "id,project_id,budget_allocation_id,alert_type,severity,threshold_percent,"
            "actual_percent,message,status,created_at,budget_allocations(allocation_name)"
        ),
        filters=filters,
        order="created_at.desc",
        limit=200,
    )

    return {"status": "success", "alert_count": len(alerts), "alerts": alerts}
