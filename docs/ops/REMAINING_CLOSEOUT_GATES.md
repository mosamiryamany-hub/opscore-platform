# OpsCore source-package acceptance gates — .18 (2026-11-18)

## Identity and isolation

- Product version: 0.11.62
- Tag: v0.11.62.18-commercial-source-package
- Branch: release/v0.11.62.18-commercial-source-package
- Lineage anchor: deba977db586f19128a1f53377fec183beab44d0
- Do not merge current main into this isolated release line.

The exact source commit, Secure Release run, archive byte length and digest must come from the companion external COMMERCIAL_RELEASE_STATEMENT.json. The tag must resolve to that same commit.

## Seller-owned source archive gates

| Gate | Required proof |
|---|---|
| Source identity | Tag, source commit, run and archive digest agree with the external statement |
| Authorized isolated line | Secure Release workflow accepts the exact branch/tag and its complete file allowlist |
| Regression/security checks | Exact tagged Secure Release run succeeds; PR checks alone are insufficient |
| Evidence sanitization | Sensitive connection metadata removed before evidence checksums/provenance |
| Sidecar integrity | Every evidence .sha256 sidecar matches its target bytes |
| Integrated manifest | Every listed file digest matches the exact staged source tree |
| SBOM/provenance | SBOM matches manifests/lockfiles and attestation is bound to the archive |
| Archive integrity | ZIP CRC and round-trip extraction succeed |
| Upload integrity | Exact versioned release asset is checked against the external statement digest |

A successful build proves only the checks that actually ran. Do not infer that an unexecuted named security gate passed.

## Security posture — disclosed, not certified

- OPSC_APP_SECURITY: not found as a defined gate in the inspected .18 repository/package or as a Vercel environment-variable name as of 2026-11-18; GitHub Actions secret names were not inspectable. Status: **NOT VERIFIED / NOT DEFINED IN REVIEWED EVIDENCE**.
- Production tenant-context trust boundary: the dated 2026-11-14 audit reports caller-settable database identity context and a membership-helper weakness. This is not a current exact-commit retest. Production-wide tenant isolation remains **NOT CERTIFIED**.
- GHSA-fc5q-39xc-vjpf / CVE-2026-112366: High-severity picomatch advisory through 4.0.7. The exact package run records a time-limited build-toolchain allowlist exception; this is not an upstream fix. Keep it disclosed until fixed or removed and re-audited.
- The historical static API security-contract report does not certify a live deployed environment.

## Buyer/environment residuals — not hidden seller work

| Item | Status / responsibility |
|---|---|
| Android/iOS signed store artifacts, physical-device QA, app-store publication | Not evidenced in the source archive; buyer/environment-specific unless separately contracted |
| Runtime Contact Center locales | 105 selectable locales in the runtime manifest |\n| Native-speaker qualification | Separate 114-row source-language matrix; 0/114 native-reviewed and 0/114 production-qualified; machine-assisted drafts/fallbacks only |
| Licensed map tiles, routing, provider contracts/keys | Buyer/environment-specific |
| External identity, messaging, telephony/call-center, payments, webhooks, storage, KMS/HSM and cloud accounts | Buyer/environment-specific |
| Customer-specific production deploy, migrations, security acceptance and recovery certification | Separate scope and authorization |

## Separate Production operations

No production database mutation, migration, secret rotation, WAF/firewall change, Vercel deploy or live certification is included in this source-package release. A source-only handoff can be considered separately from a hosted SaaS/Production certification, but it must not be marketed as Production-certified.

## License and distribution

Source-package creation and seller marketing/demonstration do not grant buyer rights. The buyer cannot be authorized to use, install, modify, distribute, resell or sublicense the package until the rights holder and named buyer sign a License Schedule naming the exact external archive SHA-256 and permitted rights.
