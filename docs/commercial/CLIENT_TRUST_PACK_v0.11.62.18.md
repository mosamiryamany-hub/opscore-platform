# OpsCore v0.11.62 — Client Trust Record (.18)

**Record date:** 2026-11-18  
**Purpose:** buyer diligence and conditional-sale discussions; this record is not a license or delivery authorization.

## Exact source-package identity

| Field | Verified value |
|---|---|
| Repository | https://github.com/mosamiryamany-hub/opscore-platform |
| Isolated branch | `release/v0.11.62.18-commercial-source-package` |
| Source commit | `63da7abe69c00d2311af02c5955ff77d5fffb0b5` |
| Release tag | `v0.11.62.18-commercial-source-package` |
| GitHub Release ID | `450480423` |
| Secure Release run | https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44384603640 |
| Archive | `OpsCore-release.zip` |
| Archive size | 2,377,360 bytes |
| GitHub asset SHA-256 | `474415783bd39eee23b0bf9ca9185370891a40330e0b9b328b89c881a0ad9503` |
| Archive report | 886 ZIP entries; 831 files; CRC clean; integrated manifest 831/831 per release record |

The GitHub API currently reports the release as **draft=true**, **prerelease=true**, and **published_at=null**. Its three uploaded assets are `OpsCore-release.zip`, `COMMERCIAL_RELEASE_STATEMENT.json`, and `OpsCore-release.zip.sha256`. The archive asset's GitHub-reported digest matches the SHA-256 recorded above.

## CI evidence

The exact-run workflow completed with conclusion `success`. The single job `verify-and-release` completed successfully. The workflow step list reports successful tag/version validation, authorized release-line verification, backend regression, PostgreSQL schema parity, migration preflight, security transaction audit, production-readiness gate, resilience/load gate, recovery gate, buyer installation verification, buyer self-validation, mobile verification, dependency audits, SBOM generation/verification, evidence-sidecar rebinding, archive build, external statement generation, provenance attestation, and artifact upload. The manually-dispatched-main check was skipped by design for this tag-triggered run.

Run link: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44384603640

## Isolation

At verification time, `main` was `e5a8ee187d54e5fdba05eaacc3bbd8269cbd9062`. The .18 release branch and .18 tag both resolve to `63da7abe69c00d2311af02c5955ff77d5fffb0b5`. The .17 tag remains at annotated tag object `cc25977e02684d13b59aa55db1710bfeeb17f293`. No merge to `main` is represented by this release record.

## Important documentation residual

The `docs/commercial/CLIENT_TRUST_PACK.md` file inside the .18 source commit still identifies the .17 package/tag in its package-specific instructions. This record is the corrected external .18 identity record, but it does **not** retroactively repair that stale file inside the already-built ZIP. Treat that mismatch as an open package-documentation defect; do not claim the .18 ZIP is a fully reconciled buyer handoff until a corrected package is rebuilt and re-hashed, or the rights holder explicitly accepts the external-document-only arrangement in writing.

## Security and production limits

This record does not independently certify the live Production environment, tenant isolation, recovery RPO/RTO, WAF enforcement, or customer-specific deployment. The exact outstanding `OPSC_APP_SECURITY` gate was not independently evidenced in the material reviewed for this record and is therefore **NOT VERIFIED** here. Do not convert missing evidence into a pass.

The mobile residuals remain explicit: signed Android/iOS store artifacts, physical-device acceptance and store publication are not evidenced here; native-speaker translation review remains outstanding (0/114 native-reviewed and 0/114 production-qualified); maps and other third-party provider accounts/contracts/credentials remain environment-specific.

## Commercial authority — no grant

- `commercialClosure: PASS_WITH_BUYER_RESIDUALS` (as reported in the release record; not a statement that all buyer residuals are closed)
- `licenseGrant: NONE_PENDING_RIGHTS_HOLDER_DECISION`
- `distributionAuthorized: false`
- `productionCertification: false`

The repository, branch, tag, release draft, CI evidence, and possession of the ZIP grant no rights. Product demonstrations and conditional negotiations may proceed, but no buyer delivery, licensed use, modification, resale, redistribution, or sublicensing is authorized until the rights holder and buyer execute a signed License Schedule naming this exact archive SHA-256 and the granted rights.

## Verification links

- Source commit: https://github.com/mosamiryamany-hub/opscore-platform/commit/63da7abe69c00d2311af02c5955ff77d5fffb0b5
- Build run: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44384603640
- Release metadata API: https://api.github.com/repos/mosamiryamany-hub/opscore-platform/releases/450480423
- NO LICENSE GRANT notice: https://github.com/mosamiryamany-hub/opscore-platform/blob/main/NO_LICENSE_GRANT_NOTICE.txt
