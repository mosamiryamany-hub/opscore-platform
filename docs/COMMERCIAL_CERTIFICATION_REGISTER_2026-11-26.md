# OpsCore — Compliance Readiness & Current Evidence Register

**Register update date:** 2026-11-26  
**Repository:** `mosamiryamany-hub/opscore-platform`  
**Current source examined before this register update:** `ac810e8123b78820e62d510c2a19a9d8db39a28c` (main)  
**Historical signed baseline run:** [45767750368](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45767750368), source `c82d11ec84a986ba01d907b940a6bf8ebb550924`; it is not an attestation for the newer source examined below.  
**Earlier historical artifact:** `opscore-release-45721225869` (GitHub artifact ID `15071558474`), source `54bfa1db445b67f8b2ec947bc7bb5a497276f2a1`.  
**Decision:** **ENGINEERING EVIDENCE PASS — COMPLIANCE CERTIFICATION NOT ESTABLISHED — PRODUCTION HOLD**

> This is an evidence and readiness register. It is not an ISO/IEC 27001 certificate, SOC 2 report, PCI DSS attestation, legal opinion, penetration-test report, or production acceptance certificate. Automated checks are not promoted into external certification.

## 1. Decision language

- **PASS — scoped:** the referenced test or artifact completed successfully for the exact source/run and stated boundary.
- **PARTIAL:** a control exists or passes locally, but its operating environment or management-system evidence is incomplete.
- **HOLD / NOT VERIFIED:** evidence is missing, stale, mismatched, or does not cover the claimed environment.
- **BUYER ACTION:** a customer must supply its own account, contract, credential, license, acceptance, or device evidence.
- **CERTIFIED:** may be used only when a valid independent certificate or attestation is in hand, its scope and validity are checked, and the issuing body is identified.

## 2. Prior signed release evidence — historical baseline, not current main

| Evidence | Result | Exact evidence and boundary |
|---|---|---|
| Source identity | PASS — historical | At the time of this baseline run, the release source was `54bfa1db445b67f8b2ec947bc7bb5a497276f2a1` and the Secure Release job confirmed it was contained in `main`. This is not the current main head. |
| Secure Release workflow | PASS — scoped | Run `45721225869`, job `139579760920`, completed successfully. Backend regression, PostgreSQL schema parity, migration preflight, security transaction audit, production-readiness gate, resilience/recovery gates, buyer self-validation, mobile verification, dependency audits, SBOM, archive build and signature steps completed successfully. |
| Inner release archive | PASS — integrity | `OpsCore-release.zip`, 2,792,411 bytes; SHA-256 `3ba2e8b33461ba9ee4fd57eecd65fdf3a971a38fd2b5451fb9790ffeff338646`. This matches the external `COMMERCIAL_RELEASE_STATEMENT.json`. |
| Outer GitHub Actions artifact | PASS — integrity | ZIP SHA-256 independently calculated during this review: `1c6671d11352f268572c4d87390ecbf6e461e888f971ffb2e4d471a41561107e`. This is the outer workflow artifact digest, not the inner release-archive digest. |
| Archive manifest | PASS — integrity | All 906 entries in `evidence-pack/SHA256SUMS.txt` verified successfully against the extracted release archive in this review. |
| Sigstore keyless signing | PASS — workflow-verified | The exact run completed `cosign verify-blob` using the expected GitHub Actions workflow identity and OIDC issuer. Tampered-archive rejection and wrong-signer rejection both passed. This establishes a signature over archive bytes; it does not establish an in-toto/SLSA provenance predicate or prove every statement inside the archive. |
| SBOM | PASS — inventory | CycloneDX 1.6; 491 components and 245 dependency edges; generated from committed backend and mobile lockfiles and verified against those manifests/lockfiles. An SBOM is an inventory, not a clean-vulnerability verdict. |
| Dependency audits | PASS — run-scoped | Backend `npm audit --audit-level=high` reported 0 vulnerabilities. The exact mobile and root audit JSON reports each reported 0 findings at info/low/moderate/high/critical severity; mobile audit gate verdict was PASS. This is point-in-time evidence, not a future guarantee. |
| Contact-center language structure | PASS — structural only | Forensic result: 4/4 rounds passed, 105 locale files, 89 keys per locale, zero duplicate keys/key mismatches/placeholder mismatches, and a safe machine-translation notice. Native-speaker reviewed locales: 0; production-qualified locales: 0. |
| Resilience | PASS — local test scope | Seven deterministic rollback/failure scenarios passed; idempotency test preserved one side effect across 40 replays; four concurrent SQLite workers completed their workload. This does not prove live PostgreSQL failover, network-edge resilience, or Production RTO/RPO. |
| Production readiness | CONDITIONAL | The exact release's `PRODUCTION_READINESS_RESULT.json` explicitly leaves live PostgreSQL, real OIDC, distributed rate-limit state, network edge, external observability, mobile signing and physical-device testing UNVERIFIED. |
| Production release proof | HOLD | The external archive statement says `productionCertification=false`, `productionAcceptance.status=NOT_VERIFIED_AT_BUILD`, `distributionAuthorized=false`, and `licenseGrant=NONE_PENDING_RIGHTS_HOLDER_DECISION`. |
| Production deployment / live database | NOT VERIFIED | The Preview release-proof endpoint previously returned `UNVERIFIED`; it is not Production acceptance and does not establish live RLS, production tenant isolation, full API-route acceptance, or Neon PITR. Preview evidence must not be rebound to Production. |

### Exact archive statement

The run's external statement identifies source commit `54bfa1db445b67f8b2ec947bc7bb5a497276f2a1`, pipeline `45721225869`, version `0.11.62`, archive SHA-256 above, and `commercialClosure=PASS_WITH_BUYER_RESIDUALS`. It explicitly grants no license and authorizes no distribution. The release may be inspected as a signed technical candidate; this statement does not grant resale, redistribution, or production-use rights.

## 3. Control and compliance readiness matrix

| Framework / control area | Current result | What the current evidence supports | What is still required |
|---|---|---|---|
| ISO/IEC 27001 — technical safeguards | PARTIAL | Threat-model documentation, security-policy source, tenant/RBAC and authorization tests, dependency scanning, SBOM, release signing, and scoped resilience tests exist. | A formally scoped ISMS; current organizational risk assessment and treatment plan; Statement of Applicability; approved policies and control owners; supplier/asset ownership; access reviews; training; incident response; business continuity; internal audit; management review; corrective-action records; and an independent certification audit. These items were not established by the reviewed release evidence. |
| SOC 2 — Security | PARTIAL | Selected software-security, CI, dependency and release-integrity controls have current test evidence. | A defined system boundary and service commitments; evidence of control design and operation; people/process/vendor controls; access reviews; incident/change management records; auditor testing and a SOC 2 report. |
| SOC 2 — Availability | HOLD | Local resilience and recovery checks passed within their declared scope. | Production monitoring and alerting, measured backup/restore, tested failover, incident/RTO/RPO evidence, and sustained operating evidence appropriate to the report period. |
| SOC 2 — Confidentiality / Privacy | HOLD | Some authorization, tenant-boundary and data-handling controls are represented in code and tests. | Data classification and flow inventory, retention/deletion rules, privacy notices and contractual obligations, production key management/encryption evidence, access recertification, and operational evidence. |
| SOC 2 — Processing Integrity | PARTIAL | Deterministic workflow, idempotency, integrity graph, audit/evidence and release checks are present in source/test scope. | Production-bound transaction completeness/accuracy controls, business-flow acceptance on the exact deployment/database, exception handling and operating evidence. |
| PCI DSS | NOT ASSESSED — NO CLAIM | The reviewed release does not contain an accepted PCI scope decision or an assessor-issued compliance artifact. | First establish whether the deployed service stores, processes, transmits, or can affect cardholder data; document data flows and service-provider boundaries; then obtain the applicable assessment/SAQ/ROC/AOC and qualified assessor validation where required. Do not claim PCI compliance from application tests or an npm audit. |
| Vulnerability management | PASS — snapshot only | Zero findings in the exact-run backend, mobile and root audit outputs. | Continuous monitoring, remediation SLAs, exception approvals, and repeat scans over time. |
| Software supply-chain inventory | PASS — inventory only | CycloneDX SBOM with 491 components and 245 dependency edges verified against lockfiles. | Signed provenance/attestation beyond the current blob signature, supplier/license review, and repeatable retention for every customer-delivered build. |
| Release integrity | PASS — exact archive | OIDC keyless Sigstore signing and verification, signer identity check, wrong-signer/tamper rejection, and verified archive checksums. | Keep exact artifact, statement and bundle together. Do not describe the blob signature as a source-code audit, product certification, or complete SLSA provenance. |
| Tenant isolation / PostgreSQL RLS | HOLD for Production | Isolated PostgreSQL/RLS contract and schema checks ran in CI; static and test-level guards are present. | Current live Production role/grants, every tenant table's RLS/FORCE RLS inventory, behavioral cross-tenant tests and signed-session route coverage bound to the exact Production deployment and database. |
| Backup / disaster recovery | HOLD for Production | Local recovery and disposable-PostgreSQL logical restore checks passed in CI. | A real Production backup/restore proof, offsite or provider-supported backup schedule, measured RPO/RTO, retention and access controls, and a witnessed restore drill. A CI logical restore is not Neon PITR. |
| Network security / WAF | PARTIAL / NOT RE-VERIFIED IN THIS RUN | Application firewall and WAF configuration/test sources exist. | Current live edge configuration export, OWASP/managed-rule enforcement status, safe attack probes, false-positive review, TLS/DNS/network segmentation and alerting on the target deployment. |
| Secure development / change control | HOLD — repository setting | CI and a successful change history are evidenced. | The GitHub API branch inspection on 2026-11-26 reported `main.protected=false`, branch protection disabled, and required status checks not enforced. Configure and verify review/required-check/force-push restrictions through repository administration before representing protected-branch controls as implemented. |
| Independent certification | NOT CERTIFIED | No independent ISO certificate, SOC 2 report, PCI AOC/ROC/SAQ acceptance, or equivalent assessor-issued document was present in the reviewed evidence. | A qualified independent assessor/certification body and completed assessment within its stated scope and validity period. |

## 4. Production and operational blockers

1. **GitHub governance:** `main` is currently unprotected and has no required status checks enforced. This is a concrete repository-governance gap, not merely missing paperwork.
2. **Vercel deployment binding:** the Preview proof is `UNVERIFIED`; it does not bind a successful CI identity and complete evidence to the exact Production deployment.
3. **Production database security:** Production RLS/role behavior and full signed-session/route acceptance are not verified against the exact deployed database and application.
4. **Recovery:** disposable CI restore evidence is not a Production Neon PITR/backup schedule or measured recovery objective.
5. **Observability and edge:** production logging/alerting, TLS/network segmentation, managed WAF/OWASP enforcement and shared rate-limit state are not verified in the release evidence.
6. **People and process:** the reviewed release evidence does not establish a complete auditable ISMS/SOC 2 operating program (risk ownership, policy approvals, training, supplier reviews, incident exercises, internal audits and management review).

No Production deployment, Neon Production mutation, or plan change was performed as part of this review.

## 5. Buyer-owned residuals — remain separate

These do not become seller-certified by this register and remain explicitly outside the current seller evidence:

- **Android/iOS:** buyer-owned signing keys/accounts, native release builds, physical-device QA and app-store submission.
- **Human translation qualification:** 0/114 source qualification rows native-speaker reviewed; 0/105 selectable runtime locales production-qualified. The 4/4 forensic PASS is structural/integration evidence only.
- **Licensed maps and road routing:** buyer provider contract, credentials, attribution, quotas, billing and live acceptance.
- **Telephony/contact-center providers:** buyer account, license, credentials, carrier setup and live acceptance.
- **Buyer-specific identity, messaging, payment, storage and KMS providers:** buyer-owned configuration and live acceptance where required.

## 6. Required path to genuine approval

1. **Repository governance:** enable protected `main`, require the appropriate CI checks and review, prohibit force pushes/deletion, and preserve auditable exceptions. Re-query the GitHub branch settings afterward.
2. **Management system:** appoint accountable control owners; define organization/service scope; complete risk assessment and treatment; approve policies; create a control applicability/SoA register; implement vendor, access, training, incident, continuity, audit and management-review records.
3. **Production technical evidence:** only after explicit deployment authorization, bind the exact source, CI run, Vercel Production deployment and Neon database; execute the required route, session, RLS and privilege checks without substituting Preview/SQLite evidence.
4. **Recovery proof:** establish an approved backup/retention mechanism and complete an actual restore drill with measured RPO/RTO.
5. **Edge/operations:** verify TLS, managed WAF policy, shared rate limiting, central logs/metrics/traces, alert routing and incident exercises in the real target environment.
6. **Independent assessment:** submit the evidence and operating records to the appropriate independent auditor/certification body. A readiness pack does not replace this step.
7. **PCI scope decision:** document whether any production data path is within PCI DSS scope before selecting the applicable assessment route.

## 7. Release and sales wording

Permitted wording:

> OpsCore has a signed source-code release candidate. The exact release pipeline passed its stated automated checks, generated and verified a CycloneDX SBOM, reported zero dependency-audit findings in the run's backend/mobile/root reports, and verified the release archive signature and integrity. Production qualification and independent compliance certification are not established. Buyer-owned integrations and deployment acceptance remain separate.

Do **not** state “ISO certified”, “SOC 2 compliant/attested”, “PCI DSS compliant”, “all certifications approved”, “Production certified”, or “distribution authorized” from this evidence.

---

**Register owner:** seller engineering/compliance owner to be assigned.  
**Next review trigger:** every source release, material infrastructure change, new external provider, security incident, or formal auditor request.


## 8. Additional exact-run evidence — PR verification on 2026-11-26

A subsequent verification run completed after this register was drafted:

| Evidence | Result | Exact boundary |
|---|---|---|
| PR verification workflow | PASS — scoped | Run [45766400205](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45766400205); source verification, backend regression, provenance checks, dependency audit, per-route contract acceptance, and isolated PostgreSQL 18 acceptance jobs completed successfully. |
| Signed-tenant route matrix | PASS — disposable PostgreSQL 18 CI only | 67/67 routes passed; 0 failed. Every route in the artifact reports signed context, session and transaction binding, raw-GUC tamper rejection, and the relevant cross-tenant denial. |
| CI route artifact | PASS — integrity | Artifact ID `15091573314`, name `signed-tenant-postgres-18-ci-coverage-45766400205`; ZIP SHA-256 `cf69681532478694248097816bc1002a6cdff1f9f4bb50d590a414a58fd52b8a`. |
| Inner route evidence JSON | PASS — integrity | `SIGNED_TENANT_CONTEXT_CI_ROUTE_COVERAGE.json`; SHA-256 `f3ad24d406a82508baeb337f9292f860676683cc2e0df95c012de8eedf284a66`; its included SHA-256 sidecar matched. |
| Evidence identity and scope | CI ONLY | `environment=ci`, `databaseName=opscore_http_acceptance`, `sourceCommitHint=fee86002bd33bb7cd8cd00fef2bd3bebb073ed79`, `pipelineId=45766400205`; both `parentBranchId` and `deploymentId` are null. `productionCertification=false` and `productionPromotionPerformed=false`. |

**Interpretation:** this adds a current 67/67 signed-tenant route PASS for isolated PostgreSQL 18 CI. It does not upgrade the Production 67-route gate, does not bind the evidence to Vercel deployment `dpl_8d3hLSPA1kTfdLtbLQsT9tHHmkbZ` or to any production deployment, and does not certify Production tenant isolation.

## 9. Live deployment identity checked after the CI run

The Vercel project API was queried again on 2026-11-26:

- The personal Preview deployment `dpl_8d3hLSPA1kTfdLtbLQsT9tHHmkbZ` is `READY`, has `target=null`, and is sourced from Vercel Git metadata for `main` at `54bfa1db445b67f8b2ec947bc7bb5a497276f2a1`.
- The Preview's reported source method is Git metadata, not an embedded GitHub Actions CLI release identity. The live release-proof endpoint therefore correctly refuses to assert an embedded CI identity for that deployment.
- The production alias `opscore-platform.vercel.app` resolves separately to deployment `dpl_7WTatJvuSwiBEVoMdZSMHT1skHpS`, whose Vercel target is `production`. It is not the Preview deployment above.

No deployment was promoted, no production alias was changed, and no Neon Production state was mutated during this verification. The Preview proof must remain `NOT_VERIFIED` for Production qualification. The intended final Production binding still requires the protected release/deploy workflow and the final deployment-binding workflow to validate the exact successful release, candidate-route artifact, and final production deployment ID together.



## 10. Current-head verification — 2026-11-26

This section supersedes the older deployment snapshots in sections 8–9 for the current source review. It records the exact source, CI runs, Preview deployment, and live HTTP observations. It does not convert Preview or catalog evidence into Production certification.

| Evidence | Result | Exact boundary |
|---|---|---|
| Current main source | PASS — repository identity | Main at review time: `ac810e8123b78820e62d510c2a19a9d8db39a28c`. The GitHub commit object reports a valid GitHub signature. |
| PR #471 Vercel workflow | PASS — scoped | [Run 45771403401](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45771403401), event `push`, exact head `ac810e8123b78820e62d510c2a19a9d8db39a28c`, conclusion `success`. Source verification, disposable PostgreSQL 18 acceptance, Vercel contract verification and isolated PostgreSQL/RLS HTTP acceptance succeeded. Neon Preview migration and historical Production PITR probe were skipped. The `deploy` job was skipped because this was a push event, not a manually authorized workflow dispatch. |
| OpsCore CI | PASS — scoped | [Run 45771403171](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45771403171), exact head `ac810e8123b78820e62d510c2a19a9d8db39a28c`, conclusion `success`. |
| Current-head Preview deployment | PASS — deployment identity only | Vercel deployment `dpl_3bi74fMuSQD8QUgRHYgafr1ZHh73`, READY, target `null` (Preview), branch `main`, Vercel Git metadata source commit `ac810e8123b78820e62d510c2a19a9d8db39a28c`. URL: https://opscore-platform-g737j42ob-fiber-nexus1.vercel.app/. |
| Live app health | PASS — Preview only | `GET /api/health` returned HTTP 200, `ok=true`, service `opscore`, version `0.11.62`, engine `postgres`. This is a health response, not tenant isolation or Production acceptance. |
| Live database connectivity | PASS — connectivity only | `GET /api/verify/database` returned HTTP 200, engine `postgres`; the response explicitly withholds host, role and database name and states that it proves connectivity only. |
| Live database security catalog | PASS — catalog scope only | `GET /api/verify/database-security` returned `IDENTITY_PLANE_RLS_ENFORCED`; 136 ordinary public tables, 135 RLS-enabled and FORCE-RLS tables, and one `spatial_ref_sys` metadata catalog exception with zero runtime write privileges. The endpoint explicitly reports `productionIsolationCertification=NOT_CERTIFIED` and `CATALOG_ONLY_NOT_BEHAVIORAL_CERTIFICATION`. |
| Live deployment identity endpoint | PASS — Vercel Git metadata only | `GET /api/verify/deployment` identifies Preview deployment `dpl_3bi74fMuSQD8QUgRHYgafr1ZHh73` and commit `ac810e8123b78820e62d510c2a19a9d8db39a28c` with `commitIdentitySource=vercel-git-metadata`. It is not the embedded GitHub Actions release identity. |
| Live release proof | HOLD / UNVERIFIED | `GET /api/verify/release` reports `status=UNVERIFIED`, `sourceCommitIdentitySource=unverified`, CI pipeline ID and commit null, commercial closure UNVERIFIED, Production acceptance NOT_VERIFIED, Production evidence binding NOT_VERIFIED, and isolation NOT_CERTIFIED. Its historical PostgreSQL HTTP evidence is from a different commit and pipeline and is explicitly not a current-candidate match. |
| Secure Release for current head | NOT YET EVIDENCED AT REVIEW TIME | The last known successful Secure Release run `45767750368` is bound to prior source `c82d11ec84a986ba01d907b940a6bf8ebb550924`, not `ac810e8123b78820e62d510c2a19a9d8db39a28c`. This register update touches the configured Secure Release trigger path; the resulting main-branch run must be inspected before claiming a current-head signed archive. |
| Production deployment | HOLD | The current-head Preview was not promoted. The existing Production deployment remains separate; no current-head Production deployment or alias change was observed. |
| Buyer residuals | REMAINING_BUYER | Android/iOS signed store artifacts and physical-device QA; native-speaker translation review; licensed street maps and road routing; and licensed telephony/call-center provider credentials and live acceptance remain outside seller evidence. |

### Exact live proof interpretation

- A successful health probe and a PostgreSQL connectivity probe do not certify the database security boundary.
- The current Preview's database catalog endpoint shows FORCE RLS coverage for the 135 application tables, with the documented read-only PostGIS metadata exception. It is catalog inspection only; it does not prove cross-tenant behavior under authenticated sessions.
- The current Preview uses native Vercel Git metadata. Its release proof correctly remains UNVERIFIED because a GitHub Actions pipeline identity and exact-run evidence are not embedded in this deployment.
- The 67/67 signed-tenant route matrix in disposable PostgreSQL 18 CI is CI evidence only. It is not Production route acceptance and is not bound to the current Preview or Production deployment.
- The previous signed archive remains tied to its own historical source commit. No signature, archive, or CI result is silently rebound to a different commit.

### Current decision

**Current-head CI: PASS (scoped). Current-head Preview: READY and live HTTP checks observed. Current-head signed release proof: UNVERIFIED. Production acceptance and tenant isolation certification: HOLD. Independent ISO/IEC 27001, SOC 2 and PCI DSS certification: NOT ESTABLISHED. Buyer-owned residuals: REMAINING_BUYER.**

No Production deployment or alias promotion, Neon Production mutation, credential rotation, paid-plan upgrade, or license grant was performed during this verification.
