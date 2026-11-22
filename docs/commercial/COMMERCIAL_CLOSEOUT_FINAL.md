# OpsCore — Commercial Closeout Status

**Reconciled:** 2026-11-22
**Product label:** `0.11.62`
**Current main closeout commit:** `63682774b7f81e123f996f6508fed5a714fea0be`  
**Application/runtime baseline:** `43554492218adbf0cde2d700bd0dedfadce67f5e` (the closeout merge changed documentation, tests and static audit tooling only)

## Decision

**Marketing discovery with disclosure: permitted for owner review. Qualified source delivery: HOLD. Production certification: NOT ESTABLISHED. No license grant.**

The source may be discussed as a work in progress, but a qualified release package for this exact source head has not been demonstrated. Do not describe the project as production-ready, certified, or free of defects. A named buyer is not required for seller-side release preparation; commercial rights still require a signed transaction-specific license schedule.

## Evidence on the verified head

Post-merge GitHub run `44993913435` passed on closeout commit `63682774…`: 960 passed, 0 failed and 3 skipped. Vercel workflow `44993913475` passed source verification, disposable PostgreSQL 18 acceptance, contract verification and isolated RLS/HTTP acceptance; its PITR, Neon Preview migration and deploy jobs were skipped. These results are limited to their tested scopes and do not establish production deployment, production isolation, or recovery objectives.

Read-only Vercel checks found no deployment record for closeout commit `63682774…`. Two READY Production-target deployments exist on its application/runtime parent SHA `43554492218adbf0cde2d700bd0dedfadce67f5e`: `dpl_G15K6Sg9Q7xJQKrHKFRYJGSNDerN` and `dpl_EC2Ri4BJrZTN7ca53xurrUV9LvmR`, both with empty alias lists. The canonical domain `opscore-platform.vercel.app` remains attached to deployment `dpl_EacspS7o2jntgw8uS1YMpzf45CFt`, whose Git commit is `b7f63445c1748ebaec426a9ebe0ea629e4998839`. The public domain is still on the older release; no current-main production promotion or runtime certification is established.

On 2026-11-22, full and `--omit=dev` npm audits returned zero findings for the root, backend, and mobile lockfiles in the checkout at this SHA. GitHub's advisory API and OSV's API both report GHSA-fc5q-39xc-vjpf / CVE-2026-112366 withdrawn at `2026-11-18T15:38:56Z`. This resolves the current database status of that advisory only. It is not a complete dependency review, security certification, or guarantee against vulnerabilities; repeat audits on the exact release package before delivery.

The source still requires production-bound database privilege and policy verification before seller security closure. Migration 059 grants broad DML on `public` by default to `opscore_runtime`, relying on RLS and later table-specific privilege changes. Migration 071 subsequently replaces the tenant/user/access-mode accessors with HMAC-verified context and fails if tenant policies still reference raw identity GUCs. This source-level correction supersedes the raw-GUC fallback in migration 064 when the complete migration chain is applied. A fresh read-only Primary ledger query on 2026-11-22 confirms 70 rows and latest migration `071_signed_rls_context_all_access_modes.sql`; the recovery branch contains 68 rows and ends at migration 069. A transaction-local probe as `opscore_runtime` using synthetic raw tenant/user/access-mode GUC values returned NULL/empty context and `verified_rls_context() IS NULL`. This supports the HMAC-only trust boundary for that probe, but does not prove complete cross-tenant read/write isolation or least-privilege grants across all tables. Do not describe the historical 064 behavior as the current intended final schema, and do not infer complete live remediation from one probe.

The current `main` audit result initially contained five `MUTATION_NOT_IDEMPOTENT_WRAPPED` findings because its local source window did not include the complete multi-line handlers. The finding paths were inspected; four invoke the explicit idempotency wrapper and the portal booking route requires and persists an idempotency key with natural-slot replay protection. In the separate, uncommitted audit worktree, the analyzer now verifies bounded source contracts for those exact routes and fails closed if any required marker or boundary changes. The refreshed local static audit is `PASS` with zero unwrapped routes, five verified contracts, and zero stale semantic reviews. This is a local audit-tool change, not yet part of `main`; the repository's current `main` still has the prior `REVIEW` result until this change is reviewed and merged. Static analysis is not runtime concurrency or tenant-isolation certification. Focused unit tests passed; they do not replace live Production verification.

## Production environment binding

Read-only Vercel environment inspection found `OPSC_PRODUCTION_HOLD=false`, `OPSC_RELEASE_VERIFIED=true`, and internal `OPSC_PRODUCTION_ISOLATION_CERTIFICATION=CERTIFIED`. These flags are bound to release/source commit `b7f63445c1748ebaec426a9ebe0ea629e4998839`, matching the canonical domain alias deployment; the configured probe deployment is a separate READY Production-target deployment on that same SHA. The internal `CERTIFIED` flag is not an external ISO/SOC/PCI certification and does not qualify current closeout commit `63682774…`.

Production TLS configuration is strict (`OPSC_PG_SSL_MODE=verify-full`, `OPSC_PG_SSL_REJECT_UNAUTHORIZED=true`), but this does not prove a verified TLS handshake on the actual application worker. Keep the worker TLS gate open until exact-deployment runtime evidence passes.

## Commercial and production boundaries

No current-head Secure Release ZIP, archive digest, SBOM, signature bundle, or same-run release statement has been produced in the evidence examined. The workflow definition describes how these may be generated; it is not evidence that they were generated.

The available production evidence remains insufficient to establish that this source head serves the public production alias, that production tenant isolation is fully certified, or that Neon PITR meets full data-parity or RPO/RTO objectives. Keep `productionIsolationCertification` and production recovery readiness unclaimed. Neon remains on the Free plan; live reads confirm six-hour history retention, one manual snapshot, no automatic snapshot schedule, and unprotected Primary/recovery branches. Do not upgrade it, alter production configuration, promote deployments, or delete retained recovery material without a separate authorization.

No independent ISO/IEC 27001, SOC 2, PCI DSS, penetration-test certificate, or equivalent current certification was found in the reviewed evidence. Do not use certification logos or imply external approval without original, scope-matched documentation.

The owner specified 30 days of support, maintenance, and updates. The start date, response targets, covered defect definition, exclusions, and update boundaries remain unapproved contract terms; do not present them as a binding SLA until recorded in the executed license schedule. Legal entity, jurisdiction, privacy, sales, and refund terms also require owner-approved facts and legal review; do not invent them.

## Required before qualified delivery

1. Resolve and validate the database trust-boundary issues with focused tests and a complete current-head regression run.
2. Run Secure Release on the exact agreed source SHA; verify the ZIP, archive SHA-256, SBOM, signature, audit outputs, tests, and release statement all come from that same run and source.
3. Inspect the generated archive for secrets, customer data, and unintended files.
4. Complete the transaction-specific rights schedule and approved support terms. Keep production deployment and buyer-environment qualification separate from source delivery.

## Changes in this reconciliation

The local audit branch `closeout/audit-4355449` is based on the verified main SHA; it is separate from local `main`. The worktree contains a small red-team analyzer change, one regression test, and corrections to the historical advisory review, sales/closeout documents, and existing red-team result. The application runtime, migrations, and lockfiles were not changed. Nothing was committed, merged, or pushed. No workflow was dispatched, no production deployment or promotion was performed, no access keys or service configuration were changed, no paid plan was selected, and no snapshot or recovery branch was deleted.
