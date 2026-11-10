# OpsCore v0.11.61 — Tenant & Configuration Governance

## Evidence boundary

This document records deterministic local implementation and test evidence only. It does not certify PostgreSQL/RLS, OIDC/JWKS, TLS/WAF, distributed rate limiting, hosted CI attestation, or external provider operation.

## Implemented

- Tenant lifecycle state is persisted separately from the core organization row: `active`, `read_only`, `suspended`, `closed`.
- State transitions are explicit, reasoned, versioned, tenant-scoped, and audit recorded.
- `closed` is terminal in the application lifecycle contract.
- Every authenticated session/API-key context resolves the organization governance state.
- Non-active organizations are fail-closed for ordinary API operations; governance endpoints remain available for authorized administrators so a suspended/read-only organization can be governed.
- Operational configuration changes now produce an append-only change evidence row containing tenant, config identity/version, actor, action, reason, correlation ID, deterministic request hash, and timestamp.
- Existing versioned configuration activation remains atomic: only one active version exists per organization/config key.

## Verification

- Dedicated governance tests: 3/3 PASS.
- Current post-fix full isolated release-test runner: **INCOMPLETE_ENVIRONMENT_TIMEOUT**; no aggregate pass count is claimed. The prior 265/265 result is historical and belongs to an earlier source tree.
- No mock provider, fake infrastructure, or fabricated live verification was added.
