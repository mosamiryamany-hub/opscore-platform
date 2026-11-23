# OpsCore — seller code-only closeout plan and evidence boundary

**Decision date:** 2026-11-23  
**Product sold:** source code and its reproducible release/evidence package  
**Excluded from sale scope:** seller-operated Vercel website, seller's live Production deployment, seller's Neon project/database, seller hosting accounts, and seller operational data  
**Current protected source:** `main` at `fbc4a3082325dff98e2ed41fffe42c3d76863254`  
**Secure Release:** run `45122272270`  
**Release version:** `0.11.62`  
**Archive SHA-256:** `7783d6614c033ecf85ee181db394fbd499dccd8f19a0b0509b97d0495e69c6ac`

## 1. Commercial scope decision

The seller is preparing a code/product handoff, not selling the seller's hosted website or managed database service. Accordingly:

- Seller Vercel deployment health, Production promotion, seller-domain uptime, seller Neon plan, Neon branch protection, scheduled snapshots, and parity between seller's Primary database and a historical restore branch are **not buyer-code release gates**.
- No Vercel or Neon plan upgrade is authorized or required for this code-only closeout.
- Seller's live website may remain a demonstration/reference environment. It must not be represented as the buyer's hosted production service or as evidence that the buyer's own environment has been installed and accepted.
- The buyer must deploy into infrastructure/accounts it controls, or explicitly contract for a separate hosting service. Buyer environment acceptance is post-sale / buyer-specific.
- Preserve seller Neon Primary, branches, and snapshots. Do not delete, promote, migrate, or alter them as part of this code-only closeout.

This scope exception removes seller-hosting and seller-database operations from the seller's code-sale gates. It does **not** waive source integrity, build reproducibility, automated tests, dependency/security audits, database migration/schema/RLS tests on disposable isolated databases, package integrity, SBOM, provenance, signature verification, or truthful disclosure.

## 2. Immutable release identity currently evidenced

| Item | Evidence / result |
|---|---|
| Source commit | `fbc4a3082325dff98e2ed41fffe42c3d76863254` |
| Main branch | Protected main; latest observed head above |
| Secure Release run | `45122272270`, completed / success |
| Workflow steps | 30 completed successfully, 1 conditional tag check skipped; no failed workflow steps |
| Conditional skip | Release-tag-to-package-version check; skipped because this run had no release tag (`releaseTag=null`). This is not a passed tag check and no tag is claimed. |
| Archive | `OpsCore-release.zip`, 2,615,311 bytes |
| Archive SHA-256 | `7783d6614c033ecf85ee181db394fbd499dccd8f19a0b0509b97d0495e69c6ac` |
| Statement binding | Archive digest recomputed from downloaded artifact and matched the commercial release statement |
| SBOM | CycloneDX 1.6; 491 components; 245 dependency edges; generated from backend and mobile lockfiles |
| SBOM file SHA-256 | `807d0e43a07f89aa56f9aaeba61213ff045646cc7ffe24313949a6645c0b4bfb` |
| Sigstore | CI positive verification reported `Verified OK` |
| Tamper rejection | CI negative test rejected modified archive as invalid signature |
| Wrong-signer rejection | CI negative test rejected incorrect signer identity |
| Expected signer identity | `https://github.com/mosamiryamany-hub/opscore-platform/.github/workflows/opscore-secure-release.yml@refs/heads/main` |
| OIDC issuer | `https://token.actions.githubusercontent.com` |
| Release statement | `commercialClosure=PASS_WITH_BUYER_RESIDUALS`; `licenseGrant=NONE_PENDING_RIGHTS_HOLDER_DECISION`; `distributionAuthorized=false`; `productionCertification=false`; `productionAcceptance=NOT_VERIFIED_AT_BUILD` |

The workflow's conditional tag-check skip must remain disclosed; this run was manually dispatched on main and had no release tag. Separately, the backend regression runner reported **PASS_WITH_SKIPS**: 990 total, 987 passed, 0 failed, 3 skipped, 0 unaccounted. The three skipped tests are `firewall-rate-limit-postgres.test.js` (requires `OPSC_PG_ACCEPTANCE_URL`), `postgres-commercial-acceptance-http.test.js` (requires a dedicated isolated PostgreSQL acceptance URL), and `tenant-isolation-matrix.test.js` (requires a dedicated PostgreSQL test URL). These are database-backed tests relevant to code sale; they are **not waived** by excluding seller Neon. They must be run against a disposable isolated PostgreSQL instance and produce PASS evidence before all-tests closure. The exact skipped reason for the third test is missing database URL, as its test setup is guarded by the same required acceptance connection. Do not call the suite all-pass until these three tests are executed successfully.

## 3. Localization baseline — exactly 105 current locales

The current source catalog is fixed at 105 locales:

- 105 locale files on disk.
- 105 manifest declarations.
- 105 registered locales.
- 105 server catalogue entries.
- 105 loader entries.
- 89 keys per locale, with duplicate-key and structural placeholder parity checks reported clean.
- 100 machine-assisted drafts, 4 English fallbacks, and 1 English source locale.
- Native-speaker reviewed: 0.
- Production-qualified by native-language review: 0.

The separate historical qualification matrix may still contain 114 rows. It is not the current selectable catalog and must not be presented as such. Nine withdrawn locale codes are not part of the current 105-locale catalog. No native translation-quality approval is claimed.

## 4. Required seller-side code-sale gates

The following remain mandatory even though seller-hosting and seller-Neon gates are excluded:

1. **Exact source and branch integrity:** verify protected main SHA, clean PR history, no unreviewed changes after the evidence cut, and all required branch checks.
2. **Full test accounting:** execute all applicable unit, integration, contract, regression, security, performance, mobile, migration, schema, RLS, tenant-isolation, and packaging tests against the exact release source. Report totals and every skip. A test that is applicable to a code sale must not be silently skipped.
3. **Disposable database acceptance:** run PostgreSQL integration, migrations, RLS, tenant boundaries, composite foreign keys, and restore logic against isolated disposable databases. This is required; seller's Neon production database is not.
4. **Dependency and supply-chain security:** complete root/backend/mobile dependency audits, lockfile consistency, deterministic SBOM generation and verification, provenance, and secret scanning.
5. **Archive integrity:** rebuild from the exact source, recompute archive SHA-256, verify statement binding, verify Sigstore identity/issuer, and prove tamper and wrong-signer rejection.
6. **Buyer reproducibility:** document prerequisites and a clean-room installation path that the buyer can execute in infrastructure they control. Do not claim buyer installation acceptance until performed by the buyer or an authorized test environment.
7. **Trust evidence publication:** publish only live links/artifacts that resolve to the exact source SHA and release package; each link must identify evidence scope and limitations.
8. **Final consistency audit:** reconcile every public statement, README, evidence index, release statement and residual register with the same 105-locale source baseline and exact release identity.

No required applicable test may be relabeled as a pass merely because a different CI suite passed. Conditional or unavailable checks remain explicitly listed as skipped/unverified until closed or formally classified as not applicable to code-only scope with a documented reason.

## 5. Certification and attestation boundary

The phrase "all certificates" must be separated into two classes:

**A. Technical release attestations we can produce and verify ourselves:** CI run records, test reports, dependency audit reports, CycloneDX SBOM, archive SHA-256, GitHub source identity, Sigstore keyless signature/verification, tamper-rejection tests, migration/RLS/tenant-isolation evidence, and reproducible build/install evidence. These can be linked from the trust pack after exact-source verification.

**B. Independent external certifications:** ISO 27001, SOC 2 Type I/II, PCI DSS, and any third-party product/security certification require the applicable independent auditor, assessor, scope, controls, evidence period, and formal report. They cannot be self-issued by a GitHub workflow or renamed as CI certificates. If no valid certificate exists, disclose "not independently certified"; do not claim or fabricate one.

The repository's internal isolation certification or a successful test suite is not an ISO/SOC/PCI certificate.

## 6. Excluded seller infrastructure gates

| Former gate | Code-sale disposition | Required disclosure |
|---|---|---|
| Seller Vercel deployment on current source | Excluded from code package acceptance | Seller website is not part of the sale |
| Seller live Production route acceptance | Excluded from code package acceptance | No buyer environment is implied |
| Seller Neon plan upgrade | Not required; no upgrade | Buyer chooses its own database/provider/plan |
| Seller Neon Primary protection | Not required for code sale | Seller database operations are not transferred |
| Seller scheduled snapshots / PITR | Not required for code sale | Buyer configures backup/retention for its own environment |
| Seller Primary-to-restore-branch data parity | Not required for code sale | Seller operational data and historical snapshots are excluded |
| Seller Neon migration or branch deletion | Prohibited as unnecessary/risky | Preserve seller data and recovery artifacts |

The database application tests in section 4 remain required on disposable test infrastructure. This exception is not a waiver of database code quality or RLS/tenant-security tests.

## 7. Buyer-owned residuals, not seller release blockers

- Android/iOS buyer signing keys, buyer-specific native release builds, physical-device acceptance, store accounts and store publication.
- Native-speaker translation review and buyer language qualification; current 105-locale catalog is not native-reviewed or production-qualified.
- Buyer-specific maps/routing provider contracts, credentials, attribution, quotas and billing.
- Buyer identity, messaging, telephony, payment, hosting, domain, data residency, and other third-party accounts/keys/contracts.
- Buyer environment provisioning, production migration, buyer data import, buyer-specific backup/RPO/RTO, operational monitoring, and acceptance.
- Any support, SLA, implementation, customization, or resale/distribution rights not expressly included in a signed agreement.

These are disclosed as buyer-owned or separately contracted, not falsely marked complete.

## 8. License and distribution boundary

The source remains `UNLICENSED`. The existing `NO_LICENSE_GRANT_NOTICE.txt` remains controlling: no use, install, run, copy, modify, host, distribute, resell, sublicense, or commercial exploitation rights are granted until the rights holder and named buyer execute a written License Schedule bound to the exact source commit and/or package SHA-256.

Preparing the code package and technical trust pack does not itself grant rights. Do not fill in unknown rights-holder identity, buyer identity, jurisdiction, fee, or signatures.

## 9. Closeout status at this evidence cut

- **Release artifact and cryptographic evidence:** PASS for the exact run and digest stated above.
- **105-locale source parity:** PASS per PR #400 and its recorded checks.
- **Seller website / seller Neon production qualification:** OUT OF SCOPE for code-only sale; no paid upgrade.
- **Full all-tests closure:** NOT YET DECLARED. The remaining applicable test matrix must be inventoried against current workflows, executed on the exact source, and reconciled with every skip.
- **Independent external certification:** NOT EVIDENCED; cannot be self-issued.
- **Buyer environment acceptance:** PENDING BUYER.
- **License / distribution grant:** NONE until signed Schedule.
- **Commercial closure:** OPEN until the seller-side code-sale gates and evidence-pack consistency audit are complete.

This document is the scope decision and execution plan. It is not itself a certificate, buyer acceptance, production certification, or license grant.
