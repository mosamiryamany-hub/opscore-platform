# Signed Tenant Context — Isolated Neon Lab Result

Date: 2026-11-14  
Repository baseline: `main` = `4ef126ccd59f23cebeead30224d1bcf7199535ab`  
Neon project: `summer-leaf-18448271`  
Lab branch: `br-patient-truth-bcc63gli` (`security-tenant-context-proof-20261114`)  
Lab parent: production branch `br-wispy-term-bcrqqj84` at LSN `0/8A2B988`, parent timestamp `2026-11-14T13:54:14Z`

## Overall result

**PARTIAL PROTOTYPE PASS — NOT an implementation or production certification.**

The experiment used only the pre-existing Neon lab branch. It did not modify the production branch, production data, Vercel configuration, or GitHub `main`.

## Lab-only changes

The lab branch now contains disposable test-only objects and synthetic data:

- `public.opscore_context_key_lab` — temporary HMAC key material for this lab only.
- `public.opscore_lab_verify_context(text,text,text)` — HMAC, purpose, expiry, and session/membership verifier.
- `public.opscore_lab_current_tenant()`, `opscore_lab_current_user()`, and `opscore_lab_access_mode()`.
- `public.opscore_lab_tenant_rows` — two synthetic tenant rows used for an RLS proof attempt.
- Synthetic lab organization, user, membership, and session rows.
- On this lab branch only, the existing `opscore_current_tenant()`, `opscore_current_user()`, and `opscore_access_mode()` functions were replaced to delegate to the lab verifier.

The branch is no longer a pristine production clone or a recovery point. Do not use it for recovery, production failover, or buyer acceptance evidence.

## Verified results

### A. HMAC verification without exposing the key to the runtime role

On the lab branch, an HMAC key was stored in a table owned by `opscore_auth_definer` (NOLOGIN, BYPASSRLS). The verifier function was SECURITY DEFINER and owned by the same role.

Under `opscore_runtime`, the first prototype test observed:

| Check | Result |
|---|---|
| Correct signed claims returned tenant A and user A | PASS |
| Changing tenant A to tenant B without recomputing the signature | Returned NULL |
| Supplying an invalid signature | Returned NULL |
| Runtime SELECT privilege on the lab key table | false |
| Runtime ability to SET ROLE to `opscore_auth_definer` | false |
| Runtime EXECUTE privilege on the verifier | true |

This demonstrates that a function can validate a signed payload while withholding the HMAC key from the runtime database role. The key used was disposable lab material and is not a production key.

### B. Require a live session and matching tenant membership

A first session-bound validation attempt was correctly rejected because the existing production acceptance users in the clone were both `disabled`. This was expected fail-closed behavior, not a verifier defect.

Synthetic lab-only records were then created for one active user, one organization, one matching membership, and one non-expired session. An owner-side query invoked the verifier using the signed lab payload and confirmed:

- The user was active.
- The session row existed.
- The matching tenant membership existed.
- The verifier returned the expected lab tenant claim.

This proves the session/membership join can be evaluated by the definer-owned function on the clone. It does not yet prove runtime RLS integration.

## Blocked verification

The final test attempted to exercise the replaced RLS accessors and a FORCE-RLS lab table as `opscore_runtime`, including valid signed context, tampered tenant claims, and unsigned/raw GUC-only context.

The tool invocation was blocked by OpenAI security checks before returning a SQL result. No alternative connector, disguised SQL, or other route was used to bypass that restriction.

Therefore these items remain **UNVERIFIED**:

- A valid signed context reveals only its matching tenant through the existing production RLS policy set.
- Tampering with raw `app.tenant_id`, `app.user_id`, or `app.access_mode` cannot reveal another tenant through every production table policy.
- An expired or revoked session immediately loses RLS access.
- The prototype performs acceptably under real route/query loads.
- The production application has been updated to sign contexts or no longer submits unsigned context.

## Design observations

- `pgcrypto` and `public.hmac(bytea,bytea,text)` are installed on this Neon database.
- The existing `opscore_auth_definer` role is NOLOGIN and BYPASSRLS; `opscore_runtime` cannot SET ROLE to it.
- The prototype's key table was not readable by `opscore_runtime`.
- The function must still be hardened for key rotation, constant-time signature comparison, canonical payload construction, strict claim typing, nonce/replay strategy, maximum assertion lifetime, active session checks, membership checks, search-path safety, grants, and function ownership. The lab prototype is deliberately not represented as production code.

## Next actions (ordered)

1. Complete a permitted RLS integration test on an approved isolated test environment with the runtime role; retain the security-tool block as an explicit unresolved gate until that can be done through an approved method.
2. Build the canonical Node signer and database verifier as paired production code with unit, property, tamper, expiry, replay, purpose-confusion, and key-rotation tests.
3. Convert every auth operation to a narrow purpose-bound capability: login candidate, membership selection, session lookup/issue/revoke, API-key authentication, OIDC link, reset, invitation acceptance, and bootstrap.
4. Reconcile production role names and grants before altering privilege migrations. The production database uses `opscore_runtime`; `opscore_app` is absent.
5. Only after isolated HTTP + SQL red-team evidence passes, prepare a separate production migration with explicit rollback and key-provisioning steps. Production change requires explicit release approval.

## Non-claims

- No source-code implementation of signed contexts has been merged or deployed.
- No production DDL, rows, credentials, grants, role memberships, Neon settings, or Vercel settings changed.
- No complete tenant-isolation or production-readiness certificate is issued by this lab.
