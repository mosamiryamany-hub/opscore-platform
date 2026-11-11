# OpsCore v0.11.62 — Buyer Start Here

## Delivery status

This guide describes source activation. It is not proof that a current commercial archive has been issued or that production infrastructure is certified. The current Main source commit at the 2026-11-11 audit was `48ed78a825020986c53bd045e50c8ea852f53275`.

## Requirements

- Node.js `>=22.23.4 <23`.
- PostgreSQL 18 is the tested target; PostGIS must be installed and verified for GIS features.
- Use a disposable acceptance database before any production migration.
- Never use demo seed data against PostgreSQL.

## Database roles — mandatory separation

| Variable | Required use | Role |
|---|---|---|
| `OPSC_DATABASE_URL` | Application runtime only | `opscore_runtime` |
| `OPSC_MIGRATION_DATABASE_URL` | Approved schema migrations only | `neondb_owner` |
| `OPSC_BOOTSTRAP_DATABASE_URL` | One-time CLI bootstrap only | `neondb_owner` |

Do not use `opscore_app` as the application runtime role. It has BYPASSRLS and elevated role/database privileges. Do not configure migration or bootstrap credentials in Vercel runtime. Production configuration must provide `OPSC_DATABASE_URL`; `DATABASE_URL` is not a production fallback.

## Install and verify

```bash
cd backend
npm ci
npm test
npm run verify
```

## Database setup sequence

1. Create a disposable PostgreSQL acceptance database.
2. Set `DATABASE_ENGINE=postgres` and `OPSC_MIGRATION_DATABASE_URL` to the dedicated Neon owner connection. Run migration preflight first; apply only after reviewing the plan.
3. Set `OPSC_BOOTSTRAP_DATABASE_URL` to the separate owner connection for the one-time bootstrap command. It must not equal `OPSC_DATABASE_URL` or `DATABASE_URL`.
4. Supply `OPSC_BOOTSTRAP_ORG_NAME`, `OPSC_BOOTSTRAP_CEO_EMAIL`, and a strong `OPSC_BOOTSTRAP_CEO_PASSWORD` (12+ characters), then run `npm run bootstrap`.
5. Remove `OPSC_BOOTSTRAP_DATABASE_URL` from the shell/secret store and rotate the one-time credential after successful bootstrap.
6. Configure the deployed application with `OPSC_DATABASE_URL` authenticated as `opscore_runtime` only. The application role must be LOGIN, not SUPERUSER, not BYPASSRLS, not CREATEROLE/CREATEDB, and not a member of an elevated role.
7. Verify RLS, tenant-session isolation, TLS, backup/restore, and all production integrations against the actual target environment.

The unauthenticated HTTP bootstrap route is disabled in production. Use the CLI bootstrap path only.

## Production reference status

Current seller reference domain: https://opscore-platform.vercel.app/

As of 2026-11-11, its API endpoints were returning HTTP 500 under the active production safety hold. Do not treat the reference deployment as healthy or production-certified.

## Explicit residuals

- Production-wide tenant isolation and recovery are NOT_CERTIFIED / NOT_VERIFIED.
- Signed Android/iOS APK/AAB/IPA artifacts are not included.
- Native-speaker reviewed locales: 0/114; production-qualified locales: 0/114.
- External provider accounts, credentials, licenses, quotas, and live acceptance remain environment-specific.
- The bundled proprietary license does not grant resale or redistribution rights; a separate signed agreement is required.
