# OpsCore — Customer Value Delta

This release adds two operator-facing capabilities designed to reduce decision latency without introducing AI or synthetic forecasts.

## 1. Deterministic Work-Order Risk

`GET /api/v1/work-orders/{id}/operational-risk` converts recorded operational facts into an explainable priority signal. The response exposes the exact contributing reason codes and weights, so an operator can see *why* work is elevated instead of trusting a black-box score.

Inputs are limited to persisted due time, priority, status, assignment, SLA state, appointment state/conflicts and completion-assurance blockers.

## 2. Daily Operations Brief

`GET /api/v1/operations/daily-brief?date=YYYY-MM-DD` gives a supervisor one evidence-based queue for the day: due work, appointments, no-shows, unassigned urgent/high work, open escalations, appointment conflicts and the highest elevated-risk work orders.

It is a summary layer over existing records. It does not invent tasks, estimate revenue, predict failure, or claim autonomous remediation.

## Why this matters to a buyer

A generic developer handoff gives data structures and screens. OpsCore is intended to reduce the amount of operational interpretation the buyer must perform after deployment: the same recorded workflow, field evidence, SLA state, appointments and audit trail are turned into an explicit, traceable attention queue.

The distinction is not the number of endpoints. It is that operational decisions remain tied to recorded facts and can be inspected, tested and challenged.


## Cross-surface coherence hardening
The product now exposes one server-owned client contract for the web console and the Expo field client on Android/iOS. The contract versions sync, idempotency and operational decision semantics. Field `today` data carries the same deterministic risk level and next-action signal used by the operational console, reducing client-side interpretation and drift.
