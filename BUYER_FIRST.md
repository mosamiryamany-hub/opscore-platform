# OpsCore v0.11.62 — Start Here (Buyer)

## What you received
Commercial **source-code** package for a multi-tenant field operations platform (web/API + PostgreSQL assets + mobile source). Verified candidate: GitHub Actions run 42949619029 on commit `f3f33865618f0c9da304fe47ab2538b310d7d453`. Artifact `opscore-release-42949619029` contains `OpsCore-release.zip` (1,881,299 bytes; SHA-256 `20aace624d0afe6dbdc0b07e8a8d3ee3a8604b7116a9eaca6cf0c8108d02adeb`). Any newer source commit requires a new run and digest.

| Field | Value |
|------|--------|
| Commercial class | `PASS_WITH_BUYER_RESIDUALS` |
| Production isolation certification | `NOT_CERTIFIED` (formal badge; see honesty section) |
| Version | 0.11.62 |

## First 15 minutes (clean activation)

### Requirements
- **Node.js >=22.23.4 and <23**. Node 24 is outside the supported engine range.
- PostgreSQL 16+ (18 supported), or local SQLite for demo only.
- For PostgreSQL migrations: **direct** DB host (not a `-pooler` endpoint).

### Install
```bash
cd backend
npm ci
# Optional SQLite-only demo (unset PostgreSQL URLs first):
# unset DATABASE_ENGINE OPSC_DATABASE_URL DATABASE_URL
# Set the four OPSC_DEMO_PASSWORD_* variables locally (12+ chars each).
# npm run seed:demo
# npm run dev
```


### PostgreSQL migrations (isolated / test database only by default)
```bash
export OPSC_MIGRATION_DATABASE_URL='postgresql://USER:PASS@HOST/your_acceptance_db?sslmode=require'
export OPSC_MIGRATION_CONFIRM_DATABASE='your_acceptance_db'
node scripts/apply-postgres-migrations.js --apply
```
The database name must match `/preview|test|testing|ci|acceptance|scratch|disposable/i`, **or** you must set `OPSC_MIGRATION_ALLOW_PRODUCTION=1` with explicit confirmation (production risk — your responsibility).

### Real PostgreSQL activation

Do not run `seed:demo` against PostgreSQL; it is strictly a local SQLite demo. For PostgreSQL, apply migrations with `OPSC_MIGRATION_DATABASE_URL` (owner role), then create the real first organization and owner with `npm run bootstrap` using `OPSC_DATABASE_URL` (restricted `opscore_runtime` role; do not use the elevated `opscore_app` role) and `OPSC_BOOTSTRAP_ORG_NAME`, `OPSC_BOOTSTRAP_CEO_EMAIL`, `OPSC_BOOTSTRAP_CEO_PASSWORD`.

### Verify
```bash
npm test
npm run db:check
npm run verify
```

## Live reference deployment (seller-operated demo)
- Site: https://opscore-platform.vercel.app/
- Health: https://opscore-platform.vercel.app/api/health
- Release proof: https://opscore-platform.vercel.app/api/verify/release
- Database security proof: https://opscore-platform.vercel.app/api/verify/database-security

Treat live proofs as **operator evidence for that deployment**, not as certification of *your* production until you reproduce the checks.

## Honesty — do not over-claim
**Included and verified in CI / seller acceptance paths:** multi-tenant RLS patterns, auth/session flows, commercial closure gates, package fingerprinting.

**Buyer residuals (your scope unless contracted otherwise):**
1. Signed mobile store artifacts (Android/iOS) and store submission
2. Native-speaker review of locales before claiming linguistic quality
3. Licensed street-map / third-party API keys and accounts

**Formal production isolation certification** remains `NOT_CERTIFIED` in product proofs until a separate formal certification process is recorded. Catalog RLS enforcement and sample production behavioral acceptance are **not** the same as that formal badge.

## Next documents
- `BUYER_DELIVERY.md` — delivery record and boundaries
- `backend/BUYER_QUICKSTART.md` — local demo path
- `docs/COMMERCIAL_HANDOFF.md` — handoff checklist
- `PROPRIETARY_LICENSE.txt` / `backend/LICENSE.txt` — license terms

NOT_ESTABLISHED

translation
