# Security Policy

## Supported versions
Only the latest `main` head receives security fixes.

## Reporting a vulnerability
Do not open a public issue for security reports. Use GitHub's
"Security → Report a vulnerability" (private vulnerability reporting) on this
repository, or contact the repository owner directly.

## Scope
- `backend/src/**`, `api/**` — production runtime and security gates
- `backend/sql/postgres/**` — RLS policies, roles, SECURITY DEFINER functions
- `.github/workflows/**` — CI/CD gates and evidence generation
- `mobile/**` — Expo client

## Hard rules for contributors
- Never introduce a default-open release flag (`OPSC_RELEASE_VERIFIED` must resolve fail-closed).
- Never grant `BYPASSRLS` or DDL privileges to application runtime roles.
- Every `SECURITY DEFINER` function must pin `SET search_path = pg_catalog, public`.
- CI actions must be pinned to full commit SHAs.
