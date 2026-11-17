# Remaining closeout gates

**Maintenance window (chosen):** 2026-11-18 **02:00–04:00** Africa/Cairo (120 min).  
See `docs/ops/MAINTENANCE_WINDOW_2026-11-18.md`.

| Gate | State |
|---|---|
| Primary snapshot | PASS — `snap-floral-sea-bcug7fd3` |
| Manifest source binding (#205) | Merged |
| Signed-context migration **branch** (063–067) | Run via `ops-signed-context-migration-branch` |
| Apply 063–067 on **primary** | Only inside maintenance window after branch PASS |
| Production HMAC + signed route flags | After matching deploy + evidence |
| 67-route Production HTTP evidence | After flags on new deploy |
| Neon primary protected / schedules | Paid plan |
| Buyer residuals | Per Schedule |
