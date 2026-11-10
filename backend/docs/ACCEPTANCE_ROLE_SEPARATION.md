# Acceptance role separation (Neon)

## Rule

Never rotate the password of the production application role (`opscore_runtime`) to prepare an acceptance database.

Neon roles are branch-scoped, not database-scoped. Changing `opscore_runtime` breaks every database connection string that uses that role, including Vercel production.

## Required pattern

| Surface | Database | Role |
|--------|----------|------|
| Vercel / live app | `opscore_acceptance` (or production DB name) | `opscore_runtime` |
| Disposable HTTP acceptance | `opscore_http_acceptance` | `opscore_accept_runtime` only |

- `opscore_accept_runtime`: `NOSUPERUSER`, `NOBYPASSRLS`, no `CREATE` on database/schema.
- Acceptance URL must be **direct** (non-pooler) when the test binds session GUCs across multiple statements.
- Database name must match the disposable marker regex used by the acceptance test (`acceptance`, `test`, `ci`, ...).

## CI

Workflow: `.github/workflows/postgres-http-acceptance.yml` (`workflow_dispatch`).

Secret: `OPSC_PG_ACCEPTANCE_URL` → disposable DB + `opscore_accept_runtime` only.

The workflow sets:

- `CI_COMMIT_SHA=${{ github.sha }}`
- `CI_PIPELINE_ID=${{ github.run_id }}`

`productionCertification` remains `false`. Isolation certification is not granted by this workflow alone.
