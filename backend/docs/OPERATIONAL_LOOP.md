# OpsCore Operational Loop v0.11.56

## Buyer-facing loop

Office dispatch → technician Today Mission → On My Way → GPS Check-in → work/evidence/notes → offline queue → atomic sync → customer scoped status → completion package → audit/SLA.

## Truth boundary

- Navigation opens an external device map application; OpsCore does not claim road routing/traffic intelligence.
- Customer notifications remain an integration contract unless an external provider is configured and verified.
- Android/iOS physical-device validation and signed store artifacts remain environment-dependent until executed on real device/signing infrastructure.
- Completion package is a server-generated structured evidence package; it is not a PDF unless a verified export path is added later.


## v0.11.36 buyer-facing additions
- Work-order list supports bounded server-side `q`, `status`, `priority`, `assignedTo`, and `limit` filters.
- `GET /api/v1/work-orders/:id/timeline` exposes one tenant-scoped timeline assembled from persisted activity, comments, audit entries, workflow transitions, and appointments.
- The browser console automatically supplies an idempotency key for critical work-order mutations so the UI honors the backend write contract.
- No forecast, AI-generated event, autonomous remediation, or external infrastructure is introduced.

## Deterministic operational attention layer

OpsCore now exposes two evidence-driven management views:

- `GET /api/v1/work-orders/{id}/operational-risk` evaluates one work order using persisted due time, priority, status, assignment, SLA, appointment and completion-assurance facts. The response includes the score, severity, reason codes, weights and a statement of the deterministic method.
- `GET /api/v1/operations/daily-brief?date=YYYY-MM-DD` aggregates the day's persisted commitments and ranks elevated work-order risk. It does not create tasks, predict outcomes, or use an AI/probabilistic forecast.

Risk weighting is explicit in code: overdue 25, blocked 20, urgent 20, high priority 10, unassigned 15, SLA breached 40, SLA at risk 20, latest appointment no-show 20, appointment conflict 15 and closeout blockers 10. Score is capped at 100; severity is low (0), medium (1-29), high (30-59), critical (60+). Multiple recorded conditions can combine. This layer is a prioritization aid, not a certification or prediction engine.

## v0.11.36 employee-first continuity layer
- `GET /api/v1/operations/cockpit` is role-aware. It gives every authenticated operator a persisted focus item, personally assigned active work, today's appointments, unread notifications and—when managerial—an explicit decision queue. It never creates a task that is not backed by a stored record.
- Work orders now expose a server-owned `nextAction` based on their current status, assignment, appointment and completion-assurance state. The label is operational guidance, not an automation claim.
- `GET /api/v1/work-orders/{id}/handoff` packages the information a second employee needs to continue: current work-order truth, next accountable action, deterministic risk, latest appointment, completion blockers, evidence references, last note and recent timeline.
- The design target is removal of routine verbal handoffs such as “what happened?”, “who owns it?”, “what is missing?”, and “can I close it?”. Those answers must come from persisted records.

## v0.11.36 employee-first continuity layer
- `GET /api/v1/operations/cockpit` is role-aware. It gives every authenticated operator a persisted focus item, personally assigned active work, today's appointments, unread notifications and—when managerial—an explicit decision queue. It never creates a task that is not backed by a stored record.
- Work orders now expose a server-owned `nextAction` based on their current status, assignment, appointment and completion-assurance state. The label is operational guidance, not an automation claim.
- `GET /api/v1/work-orders/{id}/handoff` packages the information a second employee needs to continue: current work-order truth, next accountable action, deterministic risk, latest appointment, completion blockers, evidence references, last note and recent timeline.
- The design target is removal of routine verbal handoffs such as “what happened?”, “who owns it?”, “what is missing?”, and “can I close it?”. Those answers must come from persisted records.


## v0.11.56 Evidence-Governed Operational Autopilot

The operational loop now records a governed path from observation through simulation, decision, approval, action, verification and outcome learning. The simulation layer is deterministic and local; it does not certify production infrastructure and does not claim statistical causality.
