# OpsCore Credential and Database Role Inventory — 2026-11-27

**Scope:** metadata-only inspection of the connected Vercel project and the Neon production branch. No secret values were decrypted, printed, replaced or revoked. No database writes were executed.

## Vercel environment metadata

Project: `opscore-platform` (Production and Preview variables inspected with decryption disabled).

- Production contains the release evidence variables, signed-tenant-context switches, tenant HMAC key material, runtime database URL and Neon integration variables.
- `OPSC_RELEASE_PACKAGE_ATTESTATION_KEY` is an encrypted Production variable whose Vercel metadata reports `securityIssues: [readable-secret]`.
- The release workflow explicitly retrieves this variable by its Vercel environment-variable ID during the authorized production-release workflow, masks it in the GitHub runner, then uses it to HMAC-sign the exact release archive metadata. This is an intentional read path that must be retained or redesigned when rotating the key; the metadata warning alone does not prove an external disclosure.
- `OPSC_RELEASE_PACKAGE_ATTESTATION_KEY_CI` is a separate Production variable and has no reported security issue in the metadata snapshot.
- Production database/runtime, release-proof and tenant-context variables are present. Values were not decrypted.

## Neon production branch — read-only catalog query

Project: `opscore-production`  
Branch: `main` (production branch)  
PostgreSQL: 18  
Project plan metadata: Free tier; PITR/history retention metadata reports 21,600 seconds (6 hours). This is configuration metadata, not a restore test.

Catalog query results:

| Role | LOGIN | SUPERUSER | BYPASSRLS | CREATEROLE | CREATEDB | INHERIT |
|---|---:|---:|---:|---:|---:|---:|
| `neondb_owner` | true | false | true | true | true | true |
| `opscore_runtime` | true | false | false | false | false | false |
| `opscore_app` | absent | — | — | — | — | — |
| `opscore_migrator` | absent | — | — | — | — | — |
| `opscore_worker` | absent | — | — | — | — | — |

The membership query returned no memberships where the member was `opscore_app`, `opscore_runtime`, `opscore_migrator` or `opscore_worker`.

Interpretation:
- Runtime role is least-privileged at the global role-attribute level in this catalog snapshot.
- Owner role is intentionally elevated (BYPASSRLS, CREATEROLE, CREATEDB); it is a privileged migration/bootstrap identity and must never be used by the web runtime.
- Absence of the legacy `opscore_app` role is not itself a failure; migration 068 explicitly treats an absent legacy role as locked down.
- This query does not audit every object/function grant, PUBLIC privileges, role default privileges, active sessions, or password age/rotation status.

## Why rotation is not yet executed

The connected GitHub toolset does not expose GitHub Actions secret read/write/rotation operations. The release workflow consumes GitHub Actions secrets including Vercel and Neon credentials and database connection URLs. Rotating a Neon owner/runtime password or the Vercel/Neon API tokens without updating all GitHub Actions consumers would break migration, release and recovery workflows.

The Vercel release HMAC key is also fetched by environment-variable ID in the authorized production-release workflow. A safe replacement requires coordinated update of the Vercel variable, workflow lookup contract, and the runtime's embedded release attestation; changing it in isolation would invalidate release verification.

## Required controlled rotation sequence

1. Create replacement credentials with the minimum required scopes/role privileges.
2. Update all GitHub Actions secrets and Vercel environment consumers using the approved secret-management UI/API.
3. Verify Preview and isolated recovery/migration workflows with the replacement credentials.
4. Verify the release-attestation workflow against a disposable candidate before any Production release.
5. Revoke the old credentials only after every consumer is proven to use the replacement.
6. Re-run database role and tenant/RLS acceptance checks.

**Status:** Inventory confirmed; credential rotation and consumer cutover remain OPEN. No credentials were changed and no Production service was interrupted.
