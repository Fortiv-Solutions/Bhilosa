# Material Request (MR) Production Setup & Rules

This folder defines the architecture, roles, and schema for the **Material Request (MR)** module in the Supply Chain Management pipeline of Pramukh Group AI System V2.

## 1. Roles & Permissions Matrix

| Action / Workflow Stage | Site Engineer / Site CM | Project Manager (PM) | PR / Procurement Team | Upper Management (Director) |
| :--- | :---: | :---: | :---: | :---: |
| **Raise MR** | ✅ Yes | ✅ Yes | ❌ No | ❌ No |
| **View Project MRs** | ✅ Assigned Project | ✅ Assigned Project | ✅ All Projects | ✅ All Projects |
| **Check Stock Availability** | ℹ️ View Only | ℹ️ View Only | ✅ Run Stock Audit | ✅ Run Stock Audit |
| **Clarification Handling** | ✅ Reply | ✅ Reply | ✅ Request Info | ✅ Request Info |
| **Direct Stock Fulfillment** | ❌ No | ❌ No | ✅ Issue Stock (MIN) | ✅ Issue Stock (MIN) |
| **Convert to PR (Shortage)** | ❌ No | ❌ No | ✅ Create PR | ✅ Create PR |
| **Rejection & Overrides** | ❌ No | ❌ No | ✅ Reject MR | ✅ Reject & Comment |

---

## 2. Available Stock & Reserved Stock Rules

### A. Formula
$$\text{Available Stock} = \text{Total Store Physical Stock} - \text{Reserved Stock}$$

### B. Reservation Lifecycle
1. **MR Submitted**: Stock balance is checked. If sufficient `Available Stock` exists, `Reserved Stock` increases by the requested amount to prevent other sites/towers from claiming the material.
2. **Material Issued (MIN)**: `Reserved Stock` decreases by issued qty, and `Total Store Physical Stock` decreases by issued qty.
3. **MR Rejected / Cancelled**: `Reserved Stock` is released back to `Available Stock`.

---

## 3. Workflow Steps (Production Sequence)

```
[Site Team Raises MR] 
        │
        ▼
[Status: Submitted] ──(PR Team Pick Up)──► [Status: In Review]
                                                │
                 ┌──────────────────────────────┴──────────────────────────────┐
                 ▼                                                             ▼
    [Stock Check: Available]                                      [Stock Check: Shortage]
                 │                                                             │
                 ▼                                                             ▼
     [Issue Stock (MIN)]                                         [Convert to PR & RFQ]
                 │                                                             │
                 ▼                                                             ▼
  [Status: Closed / Fulfilled]                                    [Status: Approved (PR Generated)]
```

---

## 4. Production Integration Checklist for Supabase

- [ ] Execute `schema.sql` in Supabase SQL Editor.
- [ ] Configure RLS policies for `material_requests` and `material_request_lines`.
- [ ] Enable Realtime on `material_requests` table for instant site-to-office updates.
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.
