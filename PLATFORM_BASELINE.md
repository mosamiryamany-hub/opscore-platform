# Platform baseline — GitHub / Neon / Vercel

Current verified source candidate: OpsCore v0.11.62, GitHub main at commit `f3f33865618f0c9da304fe47ab2538b310d7d453`.

| Item | Current verified value |
|------|------------------------|
| GitHub repository | `mosamiryamany-hub/opscore-platform` |
| Main commit | `f3f33865618f0c9da304fe47ab2538b310d7d453` |
| Secure Release run | [42949619029](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/42949619029) |
| GitHub release artifact | `opscore-release-42949619029` |
| Nested archive | `OpsCore-release.zip` |
| Archive bytes | `1,881,299` |
| Archive SHA-256 | `20aace624d0afe6dbdc0b07e8a8d3ee3a8604b7116a9eaca6cf0c8108d02adeb` |
| Database | Neon project `opscore-production` (PostgreSQL 18, `aws-us-east-1`) |
| Runtime DB | `opscore_acceptance`; intended runtime role `opscore_runtime` (`NOBYPASSRLS`) |
| Hosting | Vercel project `opscore-platform` → https://opscore-platform.vercel.app |
| Production deployment | `dpl_JD2jLc2ifxtMezaoAovgFALmapjH`, READY on the same main commit |
| CI | GitHub Actions (`opscore-ci`, `digital-twin-postgres-live`, `vercel-deploy`, `opscore-secure-release`) |

## Release truth boundary

- Secure Release run 42949619029 passed all 29 workflow steps, including SBOM, archive and Attestation.
- The external statement reports `PASS_WITH_BUYER_RESIDUALS`, `productionCertification=false`, and `productionAcceptance=NOT_VERIFIED_AT_BUILD`.
- Mobile locked-tree audit in that run reported zero findings at all severity levels; signed native builds and physical-device acceptance are not included.
- Artifact Attestation is separate from a signed Git commit and separate from production acceptance.
- Vercel's latest deployment is READY; `/api/health` was observed healthy. Authenticated readiness and production tenant-isolation acceptance remain separate tests.
- Vercel production deploys are currently driven by GitHub Actions + Vercel CLI. `vercel.json` sets `git.deploymentEnabled=false`, intentionally suppressing automatic Git deployments to avoid competing deployment paths.
- A GitHub App installation is visible for the Vercel namespace, but project-level Git binding was not reflected in the API at last verification. Confirm the repository connection in Vercel Project Settings → Git.

## Role model

- Migrations: `neondb_owner` or the authorized migration identity on a direct, non-pooler URL only.
- Application runtime: `opscore_runtime` — `NOSUPERUSER`, `NOBYPASSRLS`, no database/schema CREATE.
- Do not point application `DATABASE_URL` at `opscore_app`; it retains elevated privileges pending a complete dependency inventory and controlled migration.

## Database protection status

- 131 of 132 ordinary public tables have RLS enabled and FORCE RLS; `spatial_ref_sys` is the read-only PostGIS metadata exception.
- 267 policies cover 131 tables. Three control-plane boundary policies were found PERMISSIVE instead of RESTRICTIVE. PR #18 adds correctly typed restrictive guards and live behavior tests; it has passing CI and PostgreSQL 18 checks but remains unmerged pending required review.
- Neon automatic backup schedule was empty, history retention was six hours, and no automatic snapshot schedule was found at last inspection.

## Commercial constraints

- Vercel Hobby is not a commercial plan; a commercial plan change requires owner approval.
- No production role revocation or production schema migration was performed during the latest audit.
- Formal production certification and production-wide tenant-isolation certification remain NOT_ESTABLISHED / NOT_CERTIFIED.
