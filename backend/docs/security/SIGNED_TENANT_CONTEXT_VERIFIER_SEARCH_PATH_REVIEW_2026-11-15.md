# Signed Tenant Verifier Search-Path Hardening — 2026-11-15

## Finding

Migration 063 creates `opscore_security.verified_tenant_context()` as a SECURITY DEFINER function with:

```sql
SET search_path TO pg_catalog, opscore_security
```

The schemas in that path are trusted and the function's table references are schema-qualified, but PostgreSQL's documented SECURITY DEFINER hardening pattern explicitly places `pg_temp` last so temporary objects cannot take precedence for relation/type lookup.

This is a defense-in-depth gap in the signed verifier's search-path contract. It is not evidence that an exploit was executed.

## Remediation

Migration 066 changes only the function configuration:

```sql
ALTER FUNCTION opscore_security.verified_tenant_context()
  SET search_path TO pg_catalog, opscore_security, pg_temp;
```

The migration preflights the dedicated NOLOGIN/BYPASSRLS owner and the non-bypass runtime role, then verifies:
- exact function owner and SECURITY DEFINER mode;
- exact pinned search_path with `pg_temp` last;
- runtime EXECUTE remains available;
- PUBLIC EXECUTE remains absent;
- runtime cannot SELECT the HMAC key table.

No verifier logic, claims, keys, session data, or RLS policies are changed.

## Verification

The migration is source-controlled and is exercised by the disposable PostgreSQL migration workflow. It must also be applied and catalog-verified on the isolated Neon Preview branch before any production rollout.

## Release boundary

Production remains held. Migration 066 is additive and follows 063–065; it does not certify database-wide tenant isolation, replace legacy GUC paths, or authorize production key provisioning.

Reference: PostgreSQL 18 `CREATE FUNCTION` documentation — SECURITY DEFINER functions should use trusted schemas and place `pg_temp` last in `search_path`.
