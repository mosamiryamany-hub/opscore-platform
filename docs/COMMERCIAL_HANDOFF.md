# OpsCore Commercial Handoff — Current Audit State

**Repository:** https://github.com/mosamiryamany-hub/opscore-platform  
**Main commit:** `48ed78a825020986c53bd045e50c8ea852f53275`  
**Product version:** 0.11.62  
**Current handover status:** NOT ISSUED — no current-head archive approved.  
**Production certification:** NOT_ESTABLISHED.  
**Production isolation certification:** NOT_CERTIFIED.

## 1. Current source and release authority

GitHub is the current source-control and CI authority. The release workflow is `.github/workflows/opscore-secure-release.yml`; the Vercel deployment workflow is `.github/workflows/vercel-deploy.yml`.

A buyer candidate is valid only when the archive, `COMMERCIAL_RELEASE_STATEMENT.json`, SHA-256 manifest, JUnit, dependency audit reports, SBOM, provenance attestation, and localization evidence all come from the same successful exact-head GitHub Actions run. Never reuse an old commit, pipeline ID, digest, test count, or Preview URL.

The tracked `docs/release/COMMERCIAL_RELEASE_STATEMENT.json` is a historical GitLab artifact for commit `5c60420f42330d7bd79623547b07eee96ef0ebd77214e9996cf53dd2d997a7e7`, pipeline `3017246123`. It must not be used as current delivery evidence.

## 2. Current verification state

- Main CI run `43031885131`: 525 passed, 2 skipped, 0 failed, 0 unaccounted.
- Main Vercel deploy job completed, but live API routes returned HTTP 500 with `PRODUCTION_HOLD_ACTIVE`.
- Neon Main ledger ends at migration 052; migration 053 restrictive control-plane guards are not applied.
- Isolated migration 053 verification exists, but it is not Main production evidence.
- The dedicated `opscore_runtime` role is least-privilege in the catalog; the actual Vercel connection identity remains unverified.
- Production tenant-session acceptance, production recovery, and formal isolation certification remain NOT_VERIFIED / NOT_CERTIFIED.

## 3. Runtime and setup roles

- Runtime: `OPSC_DATABASE_URL` → `opscore_runtime` only.
- Migration: `OPSC_MIGRATION_DATABASE_URL` → `neondb_owner`, migration CLI only.
- Bootstrap: `OPSC_BOOTSTRAP_DATABASE_URL` → `neondb_owner`, one-time CLI only; remove/rotate after use.
- Never place migration or bootstrap credentials in Vercel runtime.
- The production HTTP bootstrap route is disabled; use the CLI bootstrap flow.

## 4. Buyer responsibilities

Buyer-owned: cloud accounts, Neon/Vercel plans, OIDC/JWKS, email/SMS/WhatsApp/carrier/telephony, payment/webhook, storage, KMS/HSM, maps/routing licenses, quotas, TLS/WAF, centralized monitoring, on-call, backup/restore, mobile signing/builds/store submission, and native-speaker language review.

The current locale status is 114 selectable resources, 1 English source, 109 machine-assisted drafts, and 4 fallback locales; native-speaker review is 0/114 and production qualification is 0/114.

## 5. SBOM and provenance

The tracked BOM is CycloneDX 1.6 with 491 components; 489 have component hashes and license entries. Two top-level application components still lack those entries, and the BOM metadata lacks `metadata.timestamp` and `metadata.authors`. The release workflow creates GitHub attestations, but explicit verification of the archive provenance and CycloneDX SBOM predicate remains a closeout task. CISA's published SBOM minimum-elements guidance adds emphasis on component hashes, licenses, tool identity, and generation context; CycloneDX 1.7 is the current specification. Do not claim full SBOM conformance until the generator and verification gates are updated.

## 6. License and commercial grant

The bundled license is use-only. It does not grant resale, redistribution, publication, or sublicensing rights. Any broader rights require a separate written agreement signed by the rights holder. The transfer agreement must also cover source/history scope, modification, IP exclusions, third-party licenses, support, SLA, data processing, security responsibilities, warranties, liability, and termination.

## 6. Production prohibition

Do not disable the production hold or promote a staged deployment until the exact live database role, migration 053, tenant A/B session isolation, recovery acceptance, release identity, and production certification all pass. A green CI run is not production certification.
