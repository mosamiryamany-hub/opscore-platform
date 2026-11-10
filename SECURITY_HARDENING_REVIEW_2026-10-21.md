# OpsCore-FIELD v0.11.62 — Security Hardening & Cross-Client Review

Review date: 2026-10-21
Package version: `0.11.62` (the upload filename contains `v0_11_63`, but the internal package metadata, lockfile, API contract and release marker all identify `0.11.62`; this review does not relabel the product version).

## Changes implemented in this review

1. **Fail-closed PostgreSQL pooled-client cleanup** — `backend/src/adapters/postgres.js` destroys a client if `RESET ALL` fails instead of returning a session to the shared pool after clearing only selected tenant GUC aliases. Regression coverage asserts this failure behavior.
2. **Sector-neutrality gate scope** — `backend/scripts/domain-neutrality-gate.js` and `backend/scripts/sector-neutrality-gate.js` now exclude only the exact forensic locale-audit tool path when scanning product/runtime vocabulary. That tool intentionally embeds prohibited sector terms as negative-detection patterns; it is still executed independently. The rest of the runtime, web, mobile, commercial copy and shipped scripts remain scanned.
3. **Contact-center language lookup consistency** — `backend/src/contact-center-languages.js` now returns the same canonical catalogue records exposed by the public language list, including `duplicateOf: null`. Previously, `getLanguage()` returned a second object shape missing that field, and `createConversation()` rejected valid languages because `undefined !== null`.
4. **Stale language test corrected** — `backend/test/ai_contact_center.test.js` now tests canonical entries from the actual 114-language catalogue (`zh`, `ar`) and verifies that unsupported legacy catalogue entries (`cy`, `fo`) are not advertised as supported. It no longer asserts unshipped codes or an old language order.
5. **Evidence refreshed** — backend SHA-256 manifests/provenance and the integrated release package manifest/checksums were regenerated for this reviewed source tree.

## Verification results

| Check | Result | Scope / limits |
|---|---|---|
| Release test inventory | **PASS** | All 98 `*.test.js` files were executed in four non-overlapping isolated runner batches; 406 tests passed, 0 failed, 0 cancelled. A single invocation exceeded the execution window, so this is batch-complete evidence, not a claim that one all-at-once invocation completed. |
| Targeted security + cross-client tests | **PASS** | 78 tests across 13 security, authz, tenant, sync, contact-center, web/API, and mobile-related test files passed. These are included in the 406-test inventory, not additional tests. |
| Sector-neutrality gate | **PASS** | Runtime/product vocabulary scan reported no hits; only the exact forensic vocabulary-detector path is excluded from token scanning. |
| Domain-neutrality gate | **PASS** | Application/domain scan passed after the same narrowly scoped validator exception. |
| 114-language forensic audit | **PASS** | 114 locale files; 89 keys per locale; placeholders, native names, manifest/loader parity, RTL list and UI notice wiring passed. The audit records 109 machine-draft locales and 4 declared English fallbacks; zero locales are production-qualified and native review remains incomplete. |
| Mobile static verification | **PASS** | `mobile/scripts/verify-mobile.js` passed its listed source, identity, offline sync, encrypted-cache/evidence, idempotency, request timeout, sign-out and API-base checks. This is not a native Android/iOS build or device acceptance test. |
| Release hardening gate | **PASS** | Node syntax/configuration, production telemetry and release-scope checks passed. |
| Runtime gate | **PASS** | Node `22.16.0`, satisfying the declared `>=22.16.0 <23` engine range. |
| Migration preflight | **PASS** | Declared active sequence is contiguous, with no duplicate numbers or active-sequence gaps; reserved historical gaps remain documented. |
| API security contract gate | **PASS** | All checks reported by the gate passed. |
| PostgreSQL live RLS gate | **UNVERIFIED** | The gate was invoked and explicitly reported `OPSC_PG_TEST_URL_REQUIRED`. No live connection was attempted because no dedicated disposable test database URL and role credentials were available. Static tests do not prove live database enforcement. |

## Security boundaries not certified by this review

- **Live RLS coverage:** the live gate currently exercises the isolated schema and migration `031` for `operational_twin_chain_events`. It does not prove every tenant-owned table, production grants, the actual runtime connection role, or bypass resistance for the deployed application.
- **Runtime PostgreSQL wiring:** the default server configuration must not be described as using PostgreSQL just because a PostgreSQL adapter and migrations exist. Confirm the deployed runtime configuration and role separately.
- **Encryption architecture:** the existing AES-GCM/HKDF approach is not a KMS/HSM-backed envelope-encryption service with separately wrapped tenant data keys. This review does not claim military-grade certification or KMS/HSM integration.
- **Firewall boundary:** `firewall.js` is an application request filter/rate limiter, not a network-edge WAF and not a substitute for parameterized SQL, authorization on each object, output encoding, and deployment-level controls.
- **Forensic evidence:** client-supplied device IDs and coordinates are not independently trustworthy attestations. Collect location/device evidence only when necessary, lawful and appropriately protected.
- **Cross-client verification:** static mobile verification and contract tests passed, but no physical-device test, native build, external identity-provider integration or production end-to-end session was performed in this environment.

## Disposition

This is an improved review candidate with two sector-neutrality gate failures corrected, a real contact-center language-validation defect fixed, and all 406 repository test cases passing across four isolated batches. It is **not** a certification that the application is free of all defects or ready for production deployment. Live PostgreSQL/RLS validation and deployment-environment checks remain blockers for any claim that live database isolation has been demonstrated.
