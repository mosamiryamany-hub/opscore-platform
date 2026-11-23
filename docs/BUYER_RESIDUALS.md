# Buyer and seller residuals — reconciled 2026-11-23

**Superseding scope decision:** OpsCore is being prepared for sale as source code and its exact release/evidence package. The seller's hosted Vercel website, seller Production deployment, seller Neon database, seller operational data and seller hosting accounts are excluded from the deliverable. No Neon or Vercel paid-plan upgrade is required or authorized for this code-only closeout.

## Current seller release evidence

| Item | Result | Evidence scope |
|---|---|---|
| Protected main | `fbc4a3082325dff98e2ed41fffe42c3d76863254` | Current source head observed 2026-11-23 |
| Secure Release | Run `45122272270`, completed/success | Exact source SHA above |
| Release archive | `OpsCore-release.zip`, 2,615,311 bytes | Downloaded from exact workflow artifact |
| Archive SHA-256 | `7783d6614c033ecf85ee181db394fbd499dccd8f19a0b0509b97d0495e69c6ac` | Recomputed; matches release statement |
| SBOM | CycloneDX 1.6; 491 components; 245 dependency edges | Backend and mobile lockfiles |
| SBOM SHA-256 | `807d0e43a07f89aa56f9aaeba61213ff045646cc7ffe24313949a6645c0b4bfb` | Recomputed from archive |
| Sigstore | PASS | CI positive verification: `Verified OK` |
| Tamper rejection | PASS | Modified archive rejected |
| Wrong-signer rejection | PASS | Incorrect signer identity rejected |
| Conditional skip | 1 skipped | Tag/version check skipped because no release tag was supplied; not a passed check |
| Current 105-locale parity | PASS | PR #400 merged; 105 files/manifest/register/server catalog/loader; forensic 4/4, validation 3/3, focused tests 34/34 |
| Full seller-side all-tests closure | OPEN | Applicable test matrix still needs complete accounting on exact source, including every skip |
| Independent external certifications | NOT EVIDENCED | No ISO/SOC2/PCI or other third-party certificate may be claimed without authentic assessor report |

## Localization qualification — current catalog is exactly 105

- Current selectable/source catalog: **105 locales**.
- Composition: 1 English source, 100 machine-assisted drafts, 4 English fallbacks.
- Native-speaker review: **0/105**.
- Production qualification by native-speaker review: **0/105**.
- Historical qualification matrix: 114 rows; this is a separate historical register, not the current catalog.
- Nine withdrawn locale codes are excluded from the current catalog.
- No native translation-quality approval is claimed.

## Seller infrastructure excluded from code-sale scope

| Item | Disposition |
|---|---|
| Seller Vercel deployment/current website | Excluded; website is not being sold |
| Seller Production acceptance | Excluded; does not establish buyer deployment |
| Seller Neon Free plan upgrade | Not required; no upgrade |
| Seller Neon Primary protection/scheduled snapshots | Excluded from code sale |
| Seller Primary-to-restore-branch row parity | Excluded from code sale; differences do not establish corruption |
| Seller Neon branches/snapshots | Preserve; no deletion or promotion |
| Database application tests | Still mandatory on disposable isolated PostgreSQL: migrations, schema, RLS, tenant isolation, composite FKs, integration and recovery logic |

The buyer chooses and controls its own hosting, database, backups, domain, keys, accounts, and operational controls. Buyer environment installation and acceptance are buyer-specific and remain unverified until performed.

## Buyer-owned or separately contracted residuals

| Residual | Status | Boundary |
|---|---|---|
| Android/iOS native signed builds and store publication | REMAINING_BUYER | Buyer signing keys, store accounts, device QA, submission and publication |
| Native-speaker translation review | REMAINING_BUYER | Current 105 catalog has 0/105 native-reviewed and 0/105 production-qualified |
| Licensed maps and road-routing | REMAINING_BUYER | Provider license, credentials, attribution, quotas, billing and buyer acceptance |
| Buyer identity/messaging/telephony/payment integrations | REMAINING_BUYER | Buyer-owned provider contracts, accounts, secrets and live acceptance |
| Buyer environment provisioning and operations | REMAINING_BUYER | Install, migration, data import, backup/RPO/RTO, monitoring and operational acceptance |
| Support/SLA/customization/resale rights | CONTRACT-DEPENDENT | Only if expressly agreed in signed buyer documents |

## Certification boundary

Internal release evidence can include CI results, test reports, dependency audits, CycloneDX SBOM, archive SHA-256, GitHub source identity, Sigstore signature/verification, tamper rejection, and isolated PostgreSQL/RLS/tenant test reports. These are technical attestations, not independent ISO 27001, SOC 2, PCI DSS or other third-party certifications. Do not self-issue or imply external certification.

## Legal and distribution boundary

The package remains `UNLICENSED`. `NO_LICENSE_GRANT_NOTICE.txt` remains controlling: no use, installation, running, copying, modification, hosting, distribution, resale, sublicensing or commercial exploitation rights are granted until the rights holder and named buyer execute a License Schedule bound to the exact source commit and/or package SHA-256. The public repository, release ZIP, trust pack and test results do not themselves grant rights.

## Closeout decision

The code-only scope exception removes seller website and seller Neon operational gates; it does not waive code-quality, security, reproducibility, database application testing, package integrity, or truthful evidence requirements. The project remains **OPEN** until all applicable seller-side tests and trust-pack consistency gates pass. Buyer-owned deployment and legal transaction execution remain separate.
