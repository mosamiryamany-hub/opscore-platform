# OpsCore — Compliance Readiness & Current Evidence Register

**Reviewed:** 2026-11-26  
**Repository:** `mosamiryamany-hub/opscore-platform`  
**Reviewed source:** `54bfa1db445b67f8b2ec947bc7bb5a497276f2a1` (main)  
**Exact release run:** [45721225869](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45721225869)  
**Artifact:** `opscore-release-45721225869` (GitHub artifact ID `15071558474`)  
**Decision:** **ENGINEERING EVIDENCE PASS — COMPLIANCE CERTIFICATION NOT ESTABLISHED — PRODUCTION HOLD**

> This is an evidence and readiness register. It is not an ISO/IEC 27001 certificate, SOC 2 report, PCI DSS attestation, legal opinion, penetration-test report, or production acceptance certificate. Automated checks are not promoted into external certification.

## 1. Decision language

- **PASS — scoped:** the referenced test or artifact completed successfully for the exact source/run and stated boundary.
- **PARTIAL:** a control exists or passes locally, but its operating environment or management-system evidence is incomplete.
- **HOLD / NOT VERIFIED:** evidence is missing, stale, mismatched, or does not cover the claimed environment.
- **BUYER ACTION:** a customer must supply its own account, contract, credential, license, acceptance, or device evidence.
- **CERTIFIED:** may be used only when a valid independent certificate or attestation is in hand, its scope and validity are checked, and the issuing body is identified.

## 2. Exact release evidence reviewed

| Evidence | Result | Exact evidence and boundary |
|---|---|---|
| Source identity | PASS | Current `main` points to `54bfa1db445b67f8b2ec947bc7bb5a497276f2a1`. The Secure Release job confirms that the release source commit is contained in `main`. |
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
