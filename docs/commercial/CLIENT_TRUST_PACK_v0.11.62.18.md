# OpsCore v0.11.62 — Client Trust Record (.18)

**Release line:** v0.11.62.18-commercial-source-package  
**Branch:** release/v0.11.62.18-commercial-source-package  
**Document scope:** exact .18 source-package diligence; this file is not a license or certification.

## Exact-build authority

The companion external COMMERCIAL_RELEASE_STATEMENT.json is the sole authority for the exact archive's source commit, tag, Actions run, archive byte length and SHA-256. The buyer must use that statement supplied with the archive and independently hash the downloaded ZIP. Do not substitute historical .17/.18 package metadata or earlier release assets.

The release record may contain multiple assets from successive .18 candidates. The authoritative archive is the versioned asset identified by the current external statement and the updated draft-release notes. Historical unversioned .18 assets are superseded.

## Verified scope and explicit limits

The Secure Release workflow is intended to verify the exact source candidate, regression suite, database schema/migration preflight, security-transaction checks, readiness/resilience/recovery checks, buyer installation/self-validation, mobile verification, dependency audit, SBOM, sidecars, archive integrity and provenance. The exact run's conclusion and step results must be checked at the URL in the external statement; this document does not replace that run.

### Security disclosure

- The repository contains a 2026-11-14 Production tenant-context trust-boundary audit reporting that caller-settable database identity context could permit tenant impersonation by a holder of the runtime database credential. It is historical and is not an exact .18 live Production retest. Production-wide tenant isolation therefore remains **NOT CERTIFIED**.
- The requested name OPSC_APP_SECURITY is not defined as a gate in the inspected .18 source/package or Vercel environment-variable name inventory (checked 2026-11-18). GitHub Actions secret names were not inspectable. The named gate is **NOT VERIFIED** and cannot be counted as passed.
- The mobile dependency audit records an allowlist exception for High-severity GHSA-fc5q-39xc-vjpf / CVE-2026-112366 affecting picomatch through 4.0.7. The release audit's zero-finding summary reflects that exception; it is not an upstream fix. See https://github.com/advisories/GHSA-fc5q-39xc-vjpf.

### Buyer/environment residuals

Signed Android/iOS store binaries and physical-device/store acceptance, 105 selectable Contact Center locales; a separate 114-row source-language qualification matrix has 0 native-speaker-reviewed and 0 production-qualified rows, licensed maps, provider contracts/keys and customer-specific deployment/security/recovery acceptance remain out of scope unless separately contracted.

## Commercial authority

The exact external statement must retain licenseGrant=NONE_PENDING_RIGHTS_HOLDER_DECISION, distributionAuthorized=false and productionCertification=false. Product demonstration and conditional negotiations are permitted; delivery for licensed use, installation, modification, resale, redistribution or sublicensing is not authorized until a signed License Schedule identifies the exact delivered archive SHA-256 and rights.

This record is not a public license, buyer acceptance, production certification, service warranty or representation that all disclosed residuals have been resolved.
