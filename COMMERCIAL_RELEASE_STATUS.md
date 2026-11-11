# OpsCore Commercial Release Status — Audit Snapshot

**Audit date:** 2026-11-11  
**Current release decision:** BLOCKED — no current-head commercial archive is approved for delivery.  
**Main repository:** https://github.com/mosamiryamany-hub/opscore-platform  
**Main source commit:** `48ed78a825020986c53bd045e50c8ea852f53275`

## Verified on Main

- GitHub Actions CI run `43031885131`: 525 passed, 2 skipped, 0 failed, 0 unaccounted.
- Production dependency audit in the run: 0 reported vulnerabilities in the audited production dependency scope. This is not a proof of zero vulnerabilities in all code or all dependency scopes.
- Vercel deployment workflow run `43031885248` completed, but deployment readiness did not establish application health.
- The deployed API endpoints returned HTTP 500 with `PRODUCTION_HOLD_ACTIVE`.
- Production Vercel configuration does not contain `OPSC_PRODUCTION_HOLD`; the runtime intentionally treats the missing value as hold-active.
- Neon Main branch `br-wispy-term-bcrqqj84`, database `opscore_acceptance`: migration ledger ends at `052_runtime_policy_function_grants.sql`; migration 053 is not applied.
- Neon Main still lacks the required restrictive tenant guards on `feature_flags`, `safe_mode_states`, and `control_plane_runs`.
- The `opscore_runtime` role itself is non-superuser and NOBYPASSRLS, but the actual Vercel connection role is not verified because the production connection secrets are not inspectable as plaintext.

## Separate change under review

PR #22 adds staged Vercel deployment, authenticated protected-deployment smoke tests, production environment preflight, runtime-role attestation, and fail-closed production acceptance checks. Its latest CI run on the PR branch reported 540 passed, 2 skipped, 0 failed, and 0 unaccounted. It is still a draft and is not part of Main.

## Commercial blockers

1. Production API remains held and returns 500; do not remove the hold to make health checks green.
2. Migration 053 must be preflighted, backed up, tested with full tenant A/B behavior, and separately approved before applying to Neon Main.
3. The Vercel runtime must connect as `opscore_runtime`, not `opscore_app`.
4. Production tenant-session isolation and production recovery evidence are not verified.
5. Production-wide isolation certification remains NOT_CERTIFIED.
6. No exact-head commercial archive and release statement have been generated for the current Main commit.
7. Signed Android/iOS APK/AAB/IPA artifacts and physical-device acceptance are absent.
8. Native-speaker translation review is 0/114; production-qualified locales are 0/114.
9. External provider accounts, contracts, licenses, credentials, live acceptance, KMS/HSM, maps, telephony, payments, and webhooks remain environment/buyer responsibilities.

## Historical release artifacts — do not reuse

The tracked `docs/release/COMMERCIAL_RELEASE_STATEMENT.json` describes historical commit `5c60420f42330d7bd79623547b07eee96ef0ebd77214e9996cf53dd2d997a7e7` and GitLab pipeline `3017246123`. It is not the release statement for current Main. Preserve it as historical evidence; never copy its digest, pipeline ID, or URLs into a new release.

## SBOM and supply-chain assurance

- The tracked SBOM is CycloneDX 1.6 with 491 components; 489 components carry component hashes and license entries. The two top-level application components do not currently carry those component-level entries. The BOM metadata also lacks `metadata.timestamp` and `metadata.authors`.
- The secure-release workflow is configured to create GitHub artifact/SBOM attestations, but an explicit verification gate for both the archive provenance and CycloneDX SBOM predicate is still required.
- CISA's published Minimum Elements for a Software Bill of Materials guidance calls out SBOM Author, Component Hash, License, Tool Name, Timestamp, and Generation Context. CycloneDX 1.7 is the current specification. Update the generator, close component coverage, and verify the attestation before buyer delivery.

## Licensing and resale

The bundled proprietary license does not grant resale, redistribution, sublicensing, or multi-customer delivery rights. Any broader grant requires a separate written agreement signed by the rights holder. The commercial transfer checklist must be completed before a buyer receives broader rights.

## Release rule

A commercial archive may be issued only from a successful exact-head GitHub Actions secure-release workflow. Use the ZIP, release statement, SBOM, provenance attestation, SHA-256 manifest, JUnit, dependency audit reports, and buyer verification output from that same run. CI green alone is not production certification.
