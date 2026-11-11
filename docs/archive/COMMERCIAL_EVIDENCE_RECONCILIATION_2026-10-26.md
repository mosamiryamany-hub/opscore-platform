<!-- Historical archive: Preserve dated historical evidence reconciliation; not current release evidence. -->

# Commercial evidence reconciliation — 2026-10-26

## Scope
Read-only review of GitLab project `88067751`, Vercel production endpoints, and Neon production catalog. Remediation documentation is isolated on branch `audit/commercial-evidence-reconciliation-2026-10-26`; no production configuration, database, or deployment was changed.

## Verified observations
- GitLab `main` at review start: `4be1dde68c268a275cb8616ea69ea265b614f8d442eb436ba64993785fa67610`.
- Pipeline `2987209920`: overall status `success`; JUnit summary: 451 passed, 0 failed, 0 skipped.
- Job `mobile-dependency-audit` failed but is configured `allow_failure: true`. This is a residual, not a passing audit.
- Live `/api/health`: HTTP 200; reports OpsCore `0.11.62`, PostgreSQL engine.
- Live `/api/verify/release`: HTTP 200; reports source commit `4be1dde68c268a275cb8616ea69ea265b614f8d442eb436ba64993785fa67610`, pipeline `2987209920`, package fingerprint `1ac5517f2466885ebb79fd90463682cc59b80c18b0ff45a625b4254c0f07c91c`, production acceptance PASS, and production isolation certification NOT_CERTIFIED.
- The endpoint's source identity source is `gitlab-ci-cli-assertion`; the endpoint describes commit match as operator-asserted. It is not independent cryptographic proof of archive-to-deployment byte identity.
- `COMMERCIAL_CLOSURE_STATUS.md` and `BUYER_DELIVERY.md` on `main` referenced old commit `84caed58cce0993b2dc632ae285233a489c2bf275386fbc68ee787d40a4e93ca` as current evidence. This was stale relative to the live endpoint and is reconciled in this branch.
- `INTEGRATED_PACKAGE_MANIFEST.json` has generatedAt `2026-10-22T10:12:51.814Z` and is a per-file manifest, not sufficient proof of the exact currently delivered ZIP. A separate digest starting `d513b71b` has been mentioned in project metadata; do not assume it identifies the same bytes as the live endpoint's `1ac5517f...` digest without artifact-level comparison.
- Read-only Neon inspection found 131 ordinary public tables, 130 with RLS enabled, and 130 with both RLS and FORCE RLS; `spatial_ref_sys` was the one table outside that set. Role catalog indicated `opscore_app` has `BYPASSRLS=false`. These catalog facts do not establish correct policy behavior across every application route.
- Production isolation certification remains NOT_CERTIFIED.

## Required closeout gates
1. Inspect artifact listings for pipeline `2987209920`; identify the exact ZIP, generated release statement, JUnit, evidence JSON, and signature/attestation artifacts.
2. Compute/verify the archive SHA-256 and byte count from the downloaded artifact; compare them to the generated statement and the deployed proof. Do not substitute the repository's old per-file manifest for an archive digest.
3. Inspect the failed mobile dependency audit job log/artifact and run a current-head audit; document findings and remediation or explicitly keep native release as buyer-owned and not release-ready.
4. Review the exact production acceptance JSON; independently verify its SHA-256 and embedded commit against the candidate commit.
5. Run tenant-boundary behavioral tests on a non-production Neon acceptance branch for representative read/write/delete routes and SECURITY DEFINER functions; do not change production data or roles during this work.
6. Preserve `productionIsolationCertification=NOT_CERTIFIED` until formal scope, independent evidence, and approval criteria are met.
7. Open an MR from this branch and require CI plus review before any merge. Do not deploy to Vercel production as part of this evidence reconciliation.

## Release decision
Current classification: `PASS_WITH_BUYER_RESIDUALS`. The application is live and health returns HTTP 200, but artifact-to-deployment identity and formal production isolation certification remain open. Do not claim absolute commercial closure.
