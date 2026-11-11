# OpsCore Commercial Closure Residuals — 2026-11-11

## Executed (evidence-backed)

| Item | Result |
|------|--------|
| GitHub main HEAD at start of this note | see live `main` |
| Migration 053 on Neon **verification branch** | PASS |
| Migration 053 on Neon **Main** `opscore_acceptance` | PASS — restrictive + permissive policies, FORCE RLS |
| Runtime role test (`opscore_runtime`, NOBYPASSRLS) write without tenant | RLS_REJECTED |
| GitHub Actions triggered for this DB work | **No** |
| `PRODUCTION_HOLD` lifted | **No** |

## Production database facts

- Application schema database: `opscore_acceptance` (not empty `neondb`)
- Control-plane tables after 053: `feature_flags`, `safe_mode_states`, `control_plane_runs` each have:
  - ENABLE + FORCE RLS
  - `opscore_tenant_permissive` (PERMISSIVE)
  - `opscore_tenant_boundary_guard` (RESTRICTIVE)
- Role matrix:
  - `opscore_runtime`: BYPASSRLS = false (correct for runtime)
  - `opscore_accept_runtime`: BYPASSRLS = false
  - `opscore_app`: BYPASSRLS = **true** (must not be used as sole production tenant boundary)

## Explicitly NOT done (remain open)

1. **Lift `PRODUCTION_HOLD` / set `OPSC_PRODUCTION_HOLD=false`** — requires bound release evidence (commit + pipeline + package fingerprint) and deliberate promotion path. Live API still returns `PRODUCTION_HOLD_ACTIVE`.
2. **Prove production HTTP path uses `opscore_runtime` (or other NOBYPASSRLS role)** — connection role audit against Vercel `OPSC_DATABASE_URL` without printing secrets.
3. **Secure Release package / SBOM attestation refresh** — do not burn Actions minutes until a single planned release run is authorized.
4. **Vercel Git integration** — project currently CLI-oriented (`git` link absent); optional for closure honesty.
5. **Buyer residuals** — mobile store signing, human language review, map licenses, legal commercial license terms.
6. **Full tenant A/B seeded behavioral acceptance on Main** — structural RLS proven; populated cross-tenant dataset proof still limited by empty/FK-constrained seed data.

## Commercial status label

**PASS_WITH_BUYER_RESIDUALS** for engineering gates that are proven.

**Not** `FULL_PRODUCTION_CERTIFICATION` and **not** hold-lifted production acceptance.

## Quota discipline

- No random CI workflows were started for this residual update.
- Neon DDL was applied directly on Main after successful verification-branch proof.
