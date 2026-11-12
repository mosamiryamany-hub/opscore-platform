# Production HOLD decision (2026-11-12)

## Decision
**HOLD NOT LIFTED.**

## Why
`productionSafetyGate` requires **all** of:
1. `OPSC_PRODUCTION_HOLD=false`
2. `OPSC_RELEASE_VERIFIED=true`
3. `hasVerifiedProductionRelease(env)` success, which binds:
   - package fingerprint
   - GitHub Actions / CLI identity for the deployed commit
   - PostgreSQL HTTP acceptance PASS
   - production isolation certification evidence when claimed

Setting only (1) without (2)+(3) would change the error from `PRODUCTION_HOLD_ACTIVE` to a different failure and would **not** constitute commercial production acceptance.

## What was completed instead
- Production database role switched to `opscore_runtime` (`rolbypassrls=false`)
- Runtime write without tenant: RLS rejected (proved)
- Buyer residuals documented explicitly
