# Evidence authority and contradiction resolution (2026-11-17)

## Two layers (do not conflate)

| Layer | What it is | Current honest status |
|---|---|---|
| **Runtime embed** | Evidence collected during the production deploy pipeline and embedded in the running deployment; exposed via `GET /api/verify/release` | For deployed commit `4017497068defa9c1d0761fcb07bc746925e002a`: isolation **CERTIFIED**, session/recovery **PASS_PRODUCTION**, overall **PASS_WITH_BUYER_RESIDUALS** |
| **Git-stored `PRODUCTION_*.json`** | Copies under `backend/docs/verification/` | **NOT_VERIFIED** — contain `evidenceRebind` with `probesReexecuted=false` |

Vercel Production env flags (`OPSC_PRODUCTION_ISOLATION_CERTIFICATION=CERTIFIED`, `OPSC_RELEASE_VERIFIED=true`, `OPSC_PRODUCTION_HOLD=false`) must match the **runtime embed** of the **currently deployed** commit. They do **not** certify:

- git tip of `main` when it differs from the deployed SHA
- git-stored JSON files with rebind markers
- buyer environments
- full Neon scheduled-backup / multi-day PITR capability

## Required rule after this change

1. Never set repository `PRODUCTION_SESSION_ISOLATION.json` / `PRODUCTION_RECOVERY_POINT.json` to `PASS` unless probes were re-executed on that exact commit (`probesReexecuted` true or no rebind object).
2. Never cite COMMERCIAL_CLOSURE_STATUS seller-reference git evidence as CERTIFIED while those files are NOT_VERIFIED.
3. Promoting a new Production deployment requires fresh collectors bound to that deployment identity (see `production-deployment-identity` helpers).

## 67-route matrix scope

CI PostgreSQL 18 isolated suite may exercise all 67 signed-route patterns. That is **not** a live Production HTTP dual-tenant matrix. Production isolation CERTIFIED on the live tip is based on dual-tenant session probes + recovery branch-point parity + release gates of that deploy — not a claim that every business route was HTTP-probed on Production.
