# Platform baseline — GitHub / Neon / Vercel (clean stack)

Initialized from commercial package OpsCore `v0.11.62.5` (integrity/packaging reissue of `v0.11.62`).

| Item | Value |
|------|--------|
| Outer ZIP SHA-256 | `fe5f8c80439124d23a911932fbc97ec925f91b78ac5b92683d0b29d09ac2786a` |
| OPSCORE.zip SHA-256 | `ffb947e8a102b9a520079e7c503f84f8d63b65722416b317e0ecc1b5bb8b924a` |
| Historical GitLab commit | `5c60420f42330d7bd79623547b07eee96ef0ebd77214e9996cf53dd2d997a7e7` |
| This repository | GitHub `mosamiryamany-hub/opscore-platform` |
| Database | Neon project `opscore-production` (PostgreSQL 18, `aws-us-east-1`) |
| Runtime DB | `opscore_acceptance` via role `opscore_runtime` (no `BYPASSRLS`) |
| Hosting | Vercel project `opscore-platform` → https://opscore-platform.vercel.app |
| CI | GitHub Actions (`opscore-ci`, `digital-twin-postgres-live`, `vercel-deploy`) |

## Role model (mandatory)

- **Migrations:** `neondb_owner` (or CI `postgres` superuser) on a **direct** non-pooler URL only.
- **Application runtime:** `opscore_runtime` — `NOSUPERUSER`, `NOBYPASSRLS`, no database/schema `CREATE`.
- Do **not** point `DATABASE_URL` at API-created roles that inherit `neon_superuser` / `BYPASSRLS`.

## Certification honesty

- Catalog proof may report `IDENTITY_PLANE_RLS_ENFORCED`.
- `productionIsolationCertification` remains **NOT_CERTIFIED** until dual-tenant behavioral acceptance is bound to the deployed commit.
- `productionCertification` remains **false** unless a separate, explicit acceptance record says otherwise.

## Historical CI

`.gitlab-ci.yml` is retained as historical reference only. Active automation is GitHub Actions.
