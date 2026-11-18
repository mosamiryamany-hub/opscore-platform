# Seller-side source-package closeout — OpsCore v0.11.62 (.18)

**Disposition:** source-package candidate may be identified only by its exact successful Secure Release statement and ZIP digest. The technical disposition is PASS_WITH_BUYER_RESIDUALS only when that exact run says so. This is not Production certification or a license grant.

## Isolated source line

| Field | Value |
|---|---|
| Product version | 0.11.62 |
| Release tag | v0.11.62.18-commercial-source-package |
| Release branch | release/v0.11.62.18-commercial-source-package |
| Lineage anchor | deba977db586f19128a1f53377fec183beab44d0 |
| Exact source commit / run / archive SHA-256 | Companion external COMMERCIAL_RELEASE_STATEMENT.json |
| License grant | **NONE** pending signed exact-digest License Schedule |
| Distribution authorization | **FALSE** pending that Schedule |
| Production certification | **FALSE / NOT CLAIMED** |

The external statement and independently verified archive digest are authoritative. Do not copy a previous candidate's commit, run, bytes or digest into a later candidate's evidence.

## Seller-owned source-package acceptance

The exact tagged Secure Release must pass for the precise source commit. The accepted archive must pass evidence-sidecar checks, integrated manifests, SBOM verification, provenance verification, ZIP CRC/round-trip checks and independent upload-digest verification. A green branch check or successful run for a different commit is not sufficient.

The .18 line includes a branch-specific secure-release workflow. The release tag must identify the same commit as the external statement; the branch may advance independently only through this controlled release-line process. main is not merged or used as the release source for this isolated line.

## Security residuals that remain open

1. OPSC_APP_SECURITY was not found as a defined source gate in the inspected .18 tree/package or as a Vercel environment-variable name on 2026-11-18. GitHub Actions secret names were not inspectable. It is **NOT VERIFIED**, not PASS.
2. The 2026-11-14 Production tenant-context audit reported an unresolved trust-boundary weakness involving caller-settable tenant identity context and membership resolution. It is historical evidence, not proof of the present state; Production-wide tenant isolation remains **NOT CERTIFIED** pending exact live remediation and retest.
3. The mobile lockfile retains picomatch versions within the range of High-severity GHSA-fc5q-39xc-vjpf / CVE-2026-112366. The release run has a documented exception for the build-toolchain path; the package audit's zero-finding result is not proof of an upstream fix. The exception must remain disclosed until fixed upstream or removed and re-audited.
4. The repository's static API security contract result is historical and static; it is not an exact-run live security certification.

These residuals prohibit claims of complete Production security or zero known security issues. They do not authorize suppressing evidence or converting an unverified gate to PASS.

## Buyer/environment residuals

Signed Android/iOS store artifacts, physical-device acceptance, store publication, native-speaker translation QA, licensed maps, provider contracts/keys, customer-specific deployment, production migration, live backup/restore and environment-specific security acceptance remain outside the seller source archive unless stated otherwise.

The locale catalogue has 114 entries; native-speaker reviewed and production-qualified counts remain 0/114. Do not describe machine-assisted translations as human-reviewed.

## Separate hosted-Production track

This source-package closeout does not deploy Vercel, mutate Neon, apply migrations, rotate secrets, change WAF/firewall policy or certify Production. Production deployment, live tenant-context verification, session-route acceptance, recovery/PITR/RPO/RTO and firewall enforcement remain separately authorized operational work.

## Commercial boundary

Seller-side source preparation, package generation, documentation and technical evidence do not require a named buyer or buyer signature. A buyer's licensed rights and delivery authorization remain separate transaction gates. No license or distribution permission is created by this record, by the repository, by a draft release or by possession of the ZIP.

The rights holder and named buyer must sign a License Schedule that identifies the exact archive SHA-256 and specifies use, modification, distribution, resale, sublicensing, term, territory, fees and support before any such rights are granted.
