# OpsCore v0.11.62 — Client Trust Pack (.18)

**Purpose:** source-package diligence for the isolated seller release line.  
**Release line:** v0.11.62.18-commercial-source-package  
**Branch:** release/v0.11.62.18-commercial-source-package

## 1. What identifies the deliverable

The companion external COMMERCIAL_RELEASE_STATEMENT.json supplied with the exact ZIP is authoritative for that build's source commit and release tag, GitHub Actions run and workflow URL, archive filename, byte length and SHA-256, and declared commercial and production-acceptance status.

Use the external statement supplied with the exact ZIP. Do not use a digest, build number, commit or asset from an earlier package. The ZIP cannot contain its own final digest without creating a self-referential hash.

The release page may retain historical assets. The authoritative candidate is the versioned archive whose commit, tag, run, byte length and digest match the companion statement. Any earlier unversioned .18 asset is superseded when a later exact-run statement is issued.

## 2. Independent buyer verification

1. Open the source repository and confirm the release tag and source commit named in the external statement.
2. Open the exact GitHub Actions run named in that statement and confirm its conclusion is success.
3. Download the archive identified by the statement and independently calculate SHA-256 over the downloaded bytes.
4. Compare the calculated digest and byte length with artifact.sha256.value and artifact.bytes in the statement.
5. Inspect the included SBOM, provenance attestation, evidence manifests and the residual/security disclosures in this pack.
6. Do not infer Production acceptance from source CI, a healthy URL, a different deployed commit or repository presence.

Repository: https://github.com/mosamiryamany-hub/opscore-platform  
Release page: https://github.com/mosamiryamany-hub/opscore-platform/releases  
No-license notice: https://github.com/mosamiryamany-hub/opscore-platform/blob/main/NO_LICENSE_GRANT_NOTICE.txt

## 3. Security and production boundary

**This source package is not a Production security certification.** The .18 build workflow runs source, regression, dependency, migration-preflight, security-transaction, resilience, recovery and package-integrity checks. Those checks do not prove that the current Production database, deployment, WAF, secrets, backup retention or tenant trust boundary has passed live acceptance for this exact source commit.

The repository contains a dated Production tenant-context audit (2026-11-14) that reported a trust-boundary failure: caller-settable tenant/user/access-mode context and an unrestricted membership helper could be used by a holder of the runtime database credential to impersonate another tenant. That report is historical evidence and has not been re-certified against this .18 build or a current Production deployment. Until a current isolated remediation and live acceptance prove otherwise, Production-wide tenant isolation remains **NOT CERTIFIED**.

The named control OPSC_APP_SECURITY was not found as a defined gate in the inspected .18 repository/package, nor as a Vercel project environment-variable name in the inventory checked on 2026-11-18. GitHub Actions secret names were not inspectable in this review. Therefore this named gate is **NOT VERIFIED / NOT DEFINED IN THE REVIEWED EVIDENCE**; it must not be represented as PASS.

## 4. Dependency advisory disclosure

The mobile dependency evidence in the release archive records a time-limited allowlist exception for GHSA-fc5q-39xc-vjpf / CVE-2026-112366, affecting picomatch versions through 4.0.7. The allowlist describes the dependency path as build-toolchain-only and notes no patched upstream release at the time it was written. The archive's npm audit summary is zero findings because this advisory is handled by that documented exception; that is **not** evidence that the vulnerable upstream code has been fixed.

The GitHub Advisory Database currently describes this as High severity (CVSS v4 8.7), with affected versions through 4.0.7 and no patched version specified. See https://github.com/advisories/GHSA-fc5q-39xc-vjpf. The exception must remain visible until an upstream fix is available and verified, or the toolchain dependency is replaced and re-audited.

## 5. Disclosed buyer/environment residuals

Unless a separate signed statement says otherwise, the source ZIP does not include signed Android AAB / iOS IPA, physical-device acceptance, store accounts, review or publication; native-speaker translation review (the catalogue contains 114 selectable language entries, but native-reviewed languages remain 0/114 and production-qualified languages remain 0/114); licensed map tiles, routing-data contracts, provider keys or external identity, messaging, telephony/call-center, payment, webhook, storage, KMS/HSM and cloud accounts; or customer-specific deployment, migration, security acceptance, recovery certification or operational service-level commitments.

## 6. Commercial and legal authority

The package statement must remain explicit:

- licenseGrant: NONE_PENDING_RIGHTS_HOLDER_DECISION
- distributionAuthorized: false
- productionCertification: false

This pack, repository access, a demonstration, negotiation, a draft release or possession of a ZIP grants no buyer rights. The rights holder and named buyer must execute a written License Schedule identifying the exact archive SHA-256 and the permitted rights before licensed use, modification, delivery, resale, redistribution or sublicensing is authorized.

## 7. What this pack is not

This is not a license, warranty, zero-defect claim, hosted-service acceptance, Production security certification, mobile store approval or confirmation that every third-party service is provisioned. It is a diligence record for a source package with explicit, inspectable boundaries.
