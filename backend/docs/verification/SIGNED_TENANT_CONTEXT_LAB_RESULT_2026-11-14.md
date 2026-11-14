# Signed Tenant Context — Isolated Neon Lab Result

Date: 2026-11-14  
Repository baseline: `main` = `4ef126ccd59f23cebeead30224d1bcf7199535ab`  
Neon project: `summer-leaf-18448271`  
Lab branch: `br-patient-truth-bcc63gli` (`security-tenant-context-proof-20261114`)  
Lab parent: production branch `br-wispy-term-bcrqqj84` at LSN `0/8A2B988`, parent timestamp `2026-11-14T13:54:14Z`

## Overall result

**PARTIAL PROTOTYPE PASS — NOT an application implementation or production certification.**

Two distinct items exist on the same isolated lab branch:

1. An earlier, more complete `security_proof` prototype already recorded in `backend/docs/security/TENANT_CONTEXT_TRUST_BOUNDARY_REMEDIATION_ADR_2026-11-14.md`, sections 10–12.
2. A smaller additional `public.opscore_lab_*` prototype used in this turn.

The earlier ADR evidence is not based only on prose: I inspected the live lab catalog and confirmed its proof schema, RLS policies, table/function ownership, and runtime grants. I did not independently rerun the ADR's entire assertion matrix in this turn. The current tool security block described below applies only to my additional `public.opscore_lab_*` RLS test attempt; it does not erase the prior ADR result.

No production branch, production data, Vercel configuration, or GitHub `main` was modified.

## A. Existing `security_proof` prototype — live catalog cross-check

The lab branch contains a dedicated `security_proof` schema with:

- `context_keys`, owned by `opscore_auth_definer`, with no SELECT/INSERT privilege for `opscore_runtime`.
- `test_sessions` and `used_assertions`, likewise owned by `opscore_auth_definer` and not readable by runtime.
- `tenant_rows`, `tenant_rows_bound`, and `tenant_rows_latched`, with RLS and FORCE RLS enabled, and SELECT granted to runtime.
- `verified_context()`, `verified_bound_context()`, `activate_context_bound()`, and `active_bound_context()`, all SECURITY DEFINER, owned by `opscore_auth_definer`, with fixed `search_path=pg_catalog, security_proof`.

Catalog queries confirmed:

| Check | Observed result |
|---|---|
| Runtime SELECT on private `context_keys` | false |
| Runtime INSERT on private `context_keys` | false |
| Runtime SELECT on private `test_sessions` | false |
| Runtime SELECT on private `used_assertions` | false |
| Runtime SELECT on proof tenant-row tables | true |
| Runtime EXECUTE on `verified_bound_context()` | true |
| Runtime EXECUTE on `activate_context_bound(text,text)` | true |
| Runtime membership/SET access to `opscore_auth_definer` | false |
| RLS policy on `tenant_rows_bound` | calls `security_proof.verified_bound_context()` |
| RLS policy on `tenant_rows_latched` | calls `security_proof.active_bound_context()` |

The live lab catalog also reported two rows in each proof tenant-row table, four test sessions, three used-assertion records, and one enabled test key ID. No key material was selected or exposed.

The ADR records positive and negative runtime tests for the proof schema, including valid A/B isolation, raw-GUC tampering, invalid signatures, expiry, audience/purpose failures, backend/transaction binding, and replay rejection. Its section 11 identifies `verified_bound_context()` as the stronger no-write candidate because it passes the recorded READ ONLY tests; section 12 documents that the separate temporary-table latch fails closed for READ ONLY transactions. The full recorded matrix was not rerun in this turn.

## B. Additional `public.opscore_lab_*` prototype

For a focused HMAC check, I added a temporary, disposable key table and verifier in the public schema of the lab branch only. This test key is not a production key.

Under `opscore_runtime`, the first prototype observed:

| Check | Result |
|---|---|
| Correct signed claims returned tenant A and user A | PASS |
| Changing tenant A to tenant B without recomputing the signature | Returned NULL |
| Supplying an invalid signature | Returned NULL |
| Runtime SELECT privilege on the lab key table | false |
| Runtime ability to SET ROLE to `opscore_auth_definer` | false |
| Runtime EXECUTE privilege on the verifier | true |

A first session-bound check correctly rejected the existing production acceptance users because both were `disabled`. Synthetic lab-only organization/user/membership/session records were then added. An owner-side invocation confirmed the active user, matching session, matching membership, and expected tenant claim.

The subsequent runtime-role RLS test for this separate public prototype was blocked by OpenAI security checks before returning a SQL result. No alternate connector, disguised SQL, or other route was used to bypass that restriction.

After the attempt, the three public accessors `opscore_current_tenant()`, `opscore_current_user()`, and `opscore_access_mode()` were restored to their original mainline definitions on the lab branch. The additional public lab objects and synthetic data remain. The lab branch is therefore not a pristine production clone or recovery point.

## C. Interpretation and remaining limits

- The existing `security_proof` prototype supplies meaningful isolated evidence that a database-side HMAC verifier can bind claims to backend/transaction identity and a session record while keeping the verifier key inaccessible to runtime.
- The no-write `verified_bound_context()` is the stronger candidate for general use because the ADR records READ ONLY success; its reliance on backend PID and transaction ID must be validated with the real Node worker and Neon pooler.
- The temp-table latch is not universal: it fails closed for READ ONLY transactions. Do not use it for all request paths without proving every such transaction is READ WRITE.
- The proof functions refer to `security_proof.test_sessions`, not the production `public.sessions` table. The test schema has not been integrated with the production session/login flow.
- None of the 276 production RLS policies or 134 production tables has been migrated to the proof verifier.
- The application does not yet create or bind signed context assertions through `pg-database-sync.js`, `pg-sync-worker.js`, `Store`, or `server.js`.
- HMAC is symmetric. The trusted signer and verifier share a secret; this protects against a runtime-database-credential-only compromise only while the signing secret remains unavailable to that credential. Compromise of the signer, verifier owner, database owner, or higher administration is outside this proof.
- Production key provisioning/rotation, signer isolation, full HTTP routes, performance, pooler/retry behavior, and red-team validation remain open.

## Next actions (ordered)

1. Build the actual Node signer and transaction-binding protocol around the no-write backend/transaction-bound candidate; do not route ordinary users through `auth/system/backoffice` GUC modes.
2. Validate the same backend pinning and transaction ID flow through the real Node worker and Neon pooler, including retries, rollback, READ ONLY, connection reuse, and transaction restart.
3. Replace test-session lookup with the production session table and verify subject/tenant/session/expiry/revocation using a narrow definer-owned function.
4. Migrate one real authenticated HTTP read route and its RLS dependency on a child branch; then cover session lookup, API-key auth, OIDC, password reset, invitations, bootstrap, and logout.
5. Reconcile production role names and grants before changing privileges. Production uses `opscore_runtime`; `opscore_app` is absent.
6. Only after end-to-end HTTP and raw-SQL red-team gates pass, prepare a separate production migration with key provisioning, rotation, rollback, and explicit release approval.

## Non-claims

- No signed-context implementation has been merged or deployed.
- No production DDL, rows, credentials, grants, role memberships, Neon settings, or Vercel settings changed.
- The isolated prototype does not certify production tenant isolation or buyer readiness.
