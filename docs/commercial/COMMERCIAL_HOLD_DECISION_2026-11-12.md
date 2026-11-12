# Commercial HOLD Decision — 2026-11-12

## Decision
**KEEP `PRODUCTION_HOLD` ACTIVE.**  
Do **not** set `productionCertification=true`.

## Bound evidence reviewed
- GitHub `main`: `4c681ea35cc6e20fc882fe8a095fabd8bee7afcb`
- OpsCore CI + Digital Twin RLS workflow: success on that commit
- Vercel production deployment matches `main`
- Runtime role audit on disposable Neon branch `br-wandering-king-bcylhct6` / DB `opscore_acceptance` as `opscore_runtime`:
  - `rolbypassrls=false`
  - FORCE RLS on core tables
  - zero rows without tenant context
  - INSERT rejected by RLS policy on `organizations`
  - `schema_migrations` denied to runtime role
  - 270 policies / 130 RESTRICTIVE observed on acceptance DB

## Why HOLD is not lifted
1. HOLD is a fail-closed product gate; bounded SQL audit ≠ full HTTP acceptance matrix bound to a buyer package fingerprint.
2. Neon Free cannot enable protected branches (`BRANCHES_PROTECTED_LIMIT_EXCEEDED`) or scheduled backup snapshots.
3. Buyer residuals remain: mobile store signing, human language review, map licenses, buyer-side backup/restore, edge TLS/WAF/secrets ownership.
4. Lifting HOLD without package fingerprint + full acceptance evidence would be a false commercial claim.

## Classification
`PASS_WITH_BUYER_RESIDUALS` / `BOUNDED_RUNTIME_AUDIT_PASS_HOLD_REMAINS`

## Explicit non-claims
- Not Production Certified
- Not full multi-path production isolation certification
- Not mobile-store-ready
- Not “absolute commercial closure without residuals”
