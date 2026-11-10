# OpsCore 2026 High-Value Feature Specs

Detailed acceptance criteria and implementation notes. Keep all claims within the package truth boundary.

## HV-01 Structured Visual Evidence + Quality Gate

**Goal**  
Raise First-Time-Right by forcing structured visual evidence at the point of work and optionally scoring it against tenant rules.

**Data**  
- New or extended evidence table/records: work_order_id, technician_id, checklist_item_id, image_sha256, image_length, captured_at, optional external_score (pass|marginal|fail), external_provider, external_request_hash.
- Large image blobs stay in object storage / attachment path; conflict records keep only SHA-256 + length (existing pattern).

**API / Mobile**  
- Mobile: guided capture flow that requires checklist completion before close-out (configurable per work type).
- Optional POST to external vision adapter; response stored with provenance. Fail-closed if provider unreachable or misconfigured.
- Console: view evidence timeline with scores and reason if provided.

**Tests**  
- Cross-tenant isolation of evidence.
- Idempotent re-upload of same SHA-256.
- Buyer acceptance: can complete a work order with required visual checklist offline then sync.

**Truth boundary**  
No on-device vision model is claimed. External scoring is optional and buyer-keyed.

## HV-02 Asset Installed-Base Condition Ledger

**Goal**  
Give operators a transparent, history-based readiness view without inventing predictions.

**Data**  
- Asset / installed-base entity linked to customer/site.
- Condition events derived only from existing work-order completions, parts, labor, check-ins.
- readiness_score (0-100) + array of reason codes calculated deterministically from last N events and age since last service.

**API**  
- GET /assets/{id}/condition-ledger
- GET /assets/{id}/readiness (score + reasons)

**Tests**  
- Score changes only when real events are recorded.
- Tenant isolation.

**Truth boundary**  
"Readiness" is an explainable aggregation of recorded facts, not a predictive model.

## HV-03 Skills & Certification Eligibility Matrix

**Goal**  
Make dispatch and risk decisions skills-aware and transparent.

**Data**  
- skills catalog (tenant-scoped)
- technician_skills (with optional expiry)
- work_type_required_skills
- Eligibility is a pure function of the above + current assignment load.

**API**  
- Candidate list endpoints already exist; extend filter and return reason codes ("missing skill X", "cert expired").

**Tests**  
- Technician without required skill never appears as eligible.
- Expired cert correctly excludes.

**Truth boundary**  
Eligibility is a pure deterministic function of recorded skills, certifications and load. No predictive ranking or auto-assignment.

## HV-04 Bounded Offline Decision Support Pack

**Goal**  
Technicians keep useful next-action and risk signals when connectivity is lost.

**Design**  
- Small JSON rule pack downloaded with today/sync payload.
- Local evaluation of the same reason codes used server-side.
- On reconnect, server remains source of truth; conflicts go through existing Conflict Center.

**Truth boundary**  
No autonomous action; only advisory signals.

## HV-05 Explainable Dispatch Suggestion Layer

**Goal**  
Reduce dispatcher cognitive load while keeping the human in the loop.

**Design**  
- Ranked list of technicians with composite score and ordered reason codes.
- Inputs limited to skills match, current load, straight-line distance (existing), SLA state, appointment conflicts.
- No automatic assignment endpoint that bypasses operator confirmation.

**Truth boundary**  
Suggestions are advisory only. Ranking uses only recorded facts and straight-line distance. Operator confirmation is mandatory.

## HV-06 Customer Self-Service Constraint Booking

**Goal**  
Let customers book within real capacity and skill constraints.

**Design**  
- Portal endpoint that returns available windows computed from existing appointments, skills, and operating hours.
- Booking creates a provisional appointment that still goes through normal validation and audit.

**Truth boundary**  
No overbooking; windows are computed from recorded data only.

## HV-07 Labor + Parts Cost Attribution

**Goal**  
Surface real cost impact inside operational-risk and daily-brief.

**Design**  
- Aggregate already-recorded labor hours × rate and parts cost into the risk/brief response objects.
- Pure sum; no forecasts.

**Truth boundary**  
Only numbers that already exist in the ledger are shown.
