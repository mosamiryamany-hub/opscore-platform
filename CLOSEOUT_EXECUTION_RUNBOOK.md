# OpsCore Commercial Closeout Execution Runbook — 2026-11-11

**Source commit on Main:** `48ed78a825020986c53bd045e50c8ea852f53275`  
**Current decision:** BLOCKED — no current-head archive approved for buyer delivery.  
**Production certification:** NOT_ESTABLISHED.  
**Production isolation:** NOT_CERTIFIED.

## 1. Preserve Main and the production hold

- Do not merge PRs with failing or incomplete required checks.
- Keep `OPSC_PRODUCTION_HOLD` active until all production prerequisites are proven.
- Do not change production secrets or run production migrations as part of an audit.
- Treat CI success, Vercel deployment READY, and live API health as separate evidence.

## 2. Close the runtime identity boundary

- `OPSC_DATABASE_URL` must authenticate as `opscore_runtime`.
- `opscore_runtime` must be LOGIN, NOBYPASSRLS, non-superuser, non-CREATEROLE, non-CREATEDB, and have no membership in elevated roles.
- `DATABASE_URL` must not silently supply a privileged production connection.
- `OPSC_MIGRATION_DATABASE_URL` is owner-only for migrations.
- `OPSC_BOOTSTRAP_DATABASE_URL` is owner-only for one-time CLI bootstrap; never store it in Vercel runtime and rotate/remove it after use.
- The unauthenticated HTTP bootstrap endpoint must remain disabled in production.

## 3. Resolve Neon migration 053 safely

1. Confirm a recoverable backup/snapshot and record its exact identity.
2. Run the migration preflight against Neon Main using the migration owner connection; inspect all pending migrations, source hashes, catalog preconditions, and postconditions.
3. Validate migration 053 on the isolated branch, including exact source/ledger SHA-256 match.
4. Run Tenant A/B behavioral tests across all affected tables and relevant API paths.
5. Produce rollback SQL/plan and confirm recovery path.
6. Obtain explicit approval before applying migration 053 to Neon Main.
7. Re-query policies, grants, runtime role attributes, and tenant isolation after application.

No Neon Main schema/data changes were made during this audit.

## 4. Restore Vercel service through a gated release

- Resolve the missing production environment prerequisite without printing secret values.
- Confirm `OPSC_RELEASE_VERIFIED=true`, `OPSC_PRODUCTION_HOLD=false`, `DATABASE_ENGINE=postgres`, and `OPSC_DATABASE_URL` resolves to the restricted `opscore_runtime` role. Environment flags alone are insufficient: the runtime release verifier must validate embedded GitHub Actions identity, package fingerprint, same-run PostgreSQL HTTP acceptance, and the hash-verified production acceptance JSON bound to the exact source commit and pipeline.
- Run the staged deployment workflow: `--skip-domain`, authenticated protected-deployment HTTP smoke tests, database/security/release proofs, and production-domain verification.
- Promote only after production tenant-session isolation, production recovery, and explicit certification evidence all pass.
- The PostgreSQL HTTP acceptance and Tenant A/B matrix tests are not considered passed when skipped for a missing disposable database URL; obtain an approved disposable URL and run both before commercial closure.
- PR #24 is the integrated candidate for runtime/bootstrap separation and staged release gating. It must pass fresh combined-head CI before merge. If production preflight fails, the workflow must record BLOCKED and skip build/stage/promote rather than changing the live domain or failing Main.

## 5. Complete production acceptance

- Tenant A/B isolation for every tenant-owned relation and API route, including session GUC propagation, background jobs, exports, search, webhooks, and administrative paths.
- PostgreSQL 18 / PostGIS 3.6.4 compatibility and migration reproducibility.
- TLS origin, WAF block-mode rules, network boundaries, rate limiting, and abuse controls.
- OIDC/JWKS and account recovery.
- KMS/HSM key custody, rotation, backup encryption, and secret isolation.
- Backup restore drill with measured RPO/RTO, integrity checks, foreign-key validation, and application-level recovery.
- Centralized logs, metrics, alerts, on-call ownership, and incident response.

## 6. Produce the current buyer package

Run the GitHub Actions `OpsCore secure release` workflow on the exact approved Main commit. Use only that run's ZIP, release statement, SHA-256 manifest, JUnit, root/mobile dependency reports, SBOM, provenance attestation, and localization report. The workflow must verify both provenance and CycloneDX SBOM attestations before upload. Independently verify the downloaded archive against the expected repository and signer workflow:

```bash
gh attestation verify OPSCORE.zip -R mosamiryamany-hub/opscore-platform --signer-workflow mosamiryamany-hub/opscore-platform/.github/workflows/opscore-secure-release.yml
gh attestation verify OPSCORE.zip -R mosamiryamany-hub/opscore-platform --predicate-type https://cyclonedx.org/bom --signer-workflow mosamiryamany-hub/opscore-platform/.github/workflows/opscore-secure-release.yml
sha256sum --check SHA256SUMS.txt
```

Do not reuse the historical GitLab pipeline statement or old Vercel URLs.

## 7. Close SBOM and supply-chain verification

- PR #24 implements a CycloneDX 1.7 generator with timestamp, release-engineering author, tool identity, build lifecycle, source commit/lockfile context, SHA-256 source archives for both top-level application components, and explicit proprietary-license entries.
- Its verifier checks every lockfile component hash/license and both application source hashes. The combined-head CI run must pass this generator/verifier before the change is considered verified.
- The committed SBOM snapshot remains 1.6 until the secure-release workflow generates the new 1.7 output; do not ship the tracked 1.6 snapshot.
- Verify the archive provenance attestation and SBOM attestation with GitHub CLI using the expected repository and CycloneDX predicate type.
- Bind the SBOM, archive digest, source commit, workflow run ID, and release statement to the same build.

## 8. Close commercial and legal terms

- Sign a commercial transfer/license addendum that states permitted users, customer count, deployment rights, resale/redistribution/sublicensing, modification, IP exclusions, third-party dependencies, support term, SLA, warranty limits, liability, data processing, security responsibilities, and termination.
- The bundled license currently prohibits resale and redistribution; do not advertise resale rights until the separate grant is signed.
- Disclose mobile signing, native-speaker translation review, external providers, and buyer infrastructure responsibilities.

## 8. Buyer-owned residuals

- Android/iOS signing, native APK/AAB/IPA builds, physical-device QA, developer accounts, and app-store submission.
- Native-speaker/domain review of all 114 locale resources; current native-speaker review is 0/114 and production qualification is 0/114.
- External identity, telephony/carrier, messaging, payments, webhooks, object storage, KMS/HSM, maps/routing, cloud accounts, licenses, quotas, and live acceptance.

## 9. Final acceptance rule

Commercial closeout is complete only when the exact-head archive and its evidence are reproducible, production safety gates pass, buyer residuals are assigned and accepted, and commercial rights are signed. No absolute “zero vulnerabilities” or “zero defects” claim is supportable.
