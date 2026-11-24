# OpsCore — Self-Hosted Buyer Edition (Source Candidate)

**Evidence snapshot:** 2026-11-24 10:43 UTC (pre-PR #436)  
**Controlling classification:** `SOURCE-CODE CANDIDATE`  
**Self-hosted production support:** `BLOCKED — NOT YET VERIFIED`  
**External certification:** `NONE CLAIMED`  
**Buyer licence / delivery authority:** `NONE — RIGHTS-HOLDER SCHEDULE REQUIRED`

> This document is a dated snapshot for main `f71b8eee32631c833dda8115af8508ae1ccc1a63`, immediately before PR #436. It does not certify PR #436 or a later `main` commit. Historical pipeline IDs, deployment IDs, and package hashes in older documents are not evidence for a different source revision.

## 1. The intended product boundary

The intended transaction is a **source-code handoff for deployment on infrastructure controlled by the buyer**. It is not a subscription to the seller's hosted website and does not include the seller's Vercel account, Neon account, domain, production database, customer records, provider credentials, or operating service.

The buyer is intended to own and control:
- compute, operating system/container runtime, network ingress, TLS certificates, DNS and firewall;
- PostgreSQL hosting, database backups, retention, restore testing and database credentials;
- secret management, encryption keys, monitoring, alerting, incident response and access administration;
- third-party accounts, licences, API keys, quotas and service contracts;
- any mobile signing identities, native build accounts and app-store submissions.

**Important:** This is the target delivery model, not a claim that the current repository already supports a complete provider-neutral self-hosted production installation. The technical blockers in section 4 remain open. `backend/.env.example` is a local-development-only template; it deliberately supplies no Production release flags or production credentials. Do not use it as a production deployment profile.

## 2. Exact repository evidence at this cut

| Item | Observed result | Scope |
|---|---|---|
| Protected `main` | `f71b8eee32631c833dda8115af8508ae1ccc1a63` | Git reference verified 2026-11-24 |
| OpsCore `verify` | PASS_WITH_SKIPS — 1,021 passed, 0 failed, 3 skipped | [Run 45377527984](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45374083091) |
| `vercel-source-verify` | PASS — all job steps completed | [Run 45377522840](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45374083161) |
| `vercel-contract-verify` | PASS | [Run 45374083161](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45374083161) |
| Isolated PostgreSQL RLS/HTTP acceptance | PASS | [Run 45374083161](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45374083161) |
| Deploy-bound PostgreSQL 18 acceptance | PASS (disposable PostgreSQL 18 target) | [Run 45374083161](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45374083161) |
| CodeQL Actions / JS-TS / Python | PASS | [Run 45377523517](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45374082761) |
| Production deployment job | SKIPPED | Not a deployment success |
| Neon Preview migration and HTTP acceptance | SKIPPED | No Preview acceptance established by this run |
| Historical Production Neon PITR probe | SKIPPED | No current PITR proof established by this run |
| Exact-head buyer release archive | NOT ESTABLISHED | A fresh Secure Release artifact for this exact evidence cut is required |
| Seller Vercel project live state | `false` | Read-only Vercel project query |
| Public health and release endpoints | HTTP 402 `DEPLOYMENT_DISABLED` | Measured 2026-11-24 around 10:22 UTC |
| Exact-SHA production deployment count | 0 | Query for current main SHA |
| API inventory | unchanged | `2ece147beaa36867e56f051d597ffa86d0a979e8`, 60,357 bytes |

These are **engineering test records**, not accredited certificates. A green CI run does not certify an independently operated installation, buyer database, buyer network, or every end-to-end workflow.

## Seller-hosted Vercel availability — measured 2026-11-24

- Vercel project `opscore-platform`: `live=false`.
- No Production deployment exists for current main `d243a428bb44b4cbd0d1fd768cb907d0e9fcbdb1` (exact-SHA deployment query returned zero records).
- Public `GET /api/health` and `GET /api/verify/release` both returned HTTP `402 Payment Required` with `x-vercel-error: DEPLOYMENT_DISABLED` at approximately 10:22 UTC on 2026-11-24.
- A verified project-domain association does not prove that the domain is currently aliased to a live deployment.
- Team context reports plan `Pro`; the available charges endpoint reports usage attribution only, not invoice, outstanding balance or payment-good-standing status. The specific account suspension/billing cause is therefore NOT VERIFIED.

This seller-hosted service outage is separate from CI and from the proposed buyer-owned deployment model. Do not advertise the seller-hosted demo/API as live until Vercel re-enables the project and the current main commit is deployed and measured.

## 3. What may be said in a sales conversation

Permitted, evidence-bounded description:

> “OpsCore is a multi-sector operational software source-code candidate with a web console, HTTP API, PostgreSQL assets and migrations, and Expo mobile source. The proposed delivery model is buyer-controlled deployment. The source has automated CI, isolated PostgreSQL/RLS acceptance, and static-analysis evidence on the stated source revision. A provider-neutral self-hosted production qualification and buyer-specific deployment acceptance are not yet complete.”

Do not describe this as:
- an independently certified production platform;
- a turnkey or currently qualified self-hosted production installation;
- ISO 27001, SOC 2, PCI DSS, or any other third-party certified product;
- vulnerability-free, fully secure, or guaranteed compliant;
- a signed/published Android or iOS application;
- a live map, road-routing, telephony, WhatsApp, payment, email, or identity-provider integration unless the exact buyer's provider connection has been tested;
- permission to resell, sublicense, redistribute, or host the source for third parties.

## 4. Self-hosted production blockers — source-level findings

| Gate | Current code condition | Status |
|---|---|---|
| Signed tenant context | `backend/src/signed-tenant-context-policy.js` enables Preview by `VERCEL_ENV=preview` and Production through Vercel-specific readiness, release flags, and `VERCEL_ENV=production`. A normal self-hosted process does not satisfy that contract. | **BLOCKED** |
| Release identity/proof | A separate Ed25519 self-hosted identity verifier and explicit selector on the existing `/api/verify/release` route now exist. `OPSC_RELEASE_PROOF_MODE=self-hosted` selects it; the default Vercel proof is unchanged. A buyer-pinned public key is mandatory. The verifier accepts an operator-signed statement; PR #436 adds a separate collector that measures archive SHA-256, live TLS peer-certificate digest and a limited set of PostgreSQL identity/global role attributes. No buyer measurements have been run. The collector does not prove full effective grants, archive build provenance, absence of all proxies or production readiness; it never returns `CERTIFIED`. | **PARTIALLY IMPLEMENTED — NOT END-TO-END QUALIFIED** |
| PostgreSQL migration targeting | `backend/scripts/apply-postgres-migrations.js` accepts `preview`, `test`, and `production` target classes, validates Neon endpoint/project/branch identity, and expects the Neon owner role. It does not currently expose a reviewed generic customer-managed PostgreSQL target. | **BLOCKED** |
| Full self-hosted install topology | `backend/docker-compose.postgres.yml` defines the PostgreSQL service only; it is not a complete app + database + ingress + persistent file-storage production stack. | **NOT PROVIDED** |
| Docker build context | The backend Dockerfile uses `COPY . .`; there was no backend `.dockerignore` at the evidence cut. The companion change adds one to exclude secrets, local data and build residue from the image context. | **HARDENING CHANGE — REQUIRES CI BUILD CHECK** |
| Buyer environment acceptance | No exact buyer-controlled host, PostgreSQL instance, TLS ingress, backups, recovery, secrets or external-provider acceptance evidence exists in this repository evidence cut. | **NOT RUN** |

No Vercel variables are to be spoofed and no Vercel Preview mode is to be used to simulate a self-hosted production environment. No Neon endpoint/project/branch identifiers are to be fabricated.

## 5. Buyer-visible technical scope and exclusions

### Included in the source candidate
- web console and backend/API source;
- PostgreSQL schema/migrations and database-adapter code;
- application tests, validation scripts, release tooling and technical documentation;
- Expo mobile source and lockfiles (source only).

### Not included or not qualified
- seller hosting, seller Vercel/Neon accounts, seller domain, seller database and customer data;
- a provider-neutral self-hosted production deployment and signed self-hosted release qualification;
- signed APK/AAB/IPA, device-level QA, signing keys or app-store publication;
- native-speaker language review (latest sales evidence reports 0/114 reviewed; runtime selectable catalogue and qualification register have different denominators);
- licensed maps, road-routing, provider attribution, API quotas or traffic ETA;
- configured external OIDC/JWKS, email, SMS, WhatsApp, telephony/contact-center carriers, payment processing, object storage, KMS/HSM or buyer-specific webhook contracts;
- an accredited external security/compliance certificate.

Payment processing remains disabled unless a provider is selected, credentials are configured, signed webhooks are verified and the relevant flows are accepted in the target environment.

## 6. Dependency and intellectual-property boundary

The package metadata is `UNLICENSED`. The root `NO_LICENSE_GRANT_NOTICE.txt` remains controlling: **no buyer licence or delivery permission is granted by this repository, tests, deployment, evidence, release archive or this document**.

- L1 (internal use only), L2 (use/modify/redistribute) and L3 (exclusive/IP assignment) are framework options, not grants.
- A transaction requires a written License Schedule executed by the rights holder and the named buyer, referencing the exact source commit and/or package SHA-256.
- Resale, hosting for third parties, sublicensing, OEM, source redistribution or marketplace distribution must be expressly selected and granted in that Schedule. A general L1/use-only grant does not include them.
- Third-party package licences remain independent. The 2026-11-24 SBOM inventory is inventory evidence only, not legal clearance; two components in that inventory have no declared licence expression and require resolution before a legal-clearance claim.
- Rights-holder identity and authority to sign remain a required transaction input; do not infer that authority from repository access.

The seller may advertise, present and negotiate a prospective offer as allowed by the no-license notice. Do not deliver or authorize buyer use before the executed Schedule.

## 7. Qualification work required before calling this a supported self-hosted production edition

1. Implement a distinct, fail-closed self-hosted deployment profile. It must not impersonate Vercel Preview/Production and must not rely on a free-form “certified” environment flag.
2. Implement provider-neutral PostgreSQL migration target identity and role checks. The generic target must require explicit operator opt-in, exact hostname/database confirmation, a dedicated migration principal, least-privilege runtime-role verification, transaction-safe migration application, and negative tests proving wrong-host/wrong-database refusal.
3. Implement provider-neutral signed-release/deployment evidence. Verify the exact delivered archive, source commit, SBOM, signature/provenance and deployment identity without Vercel- or Neon-only assumptions.
4. Gate signed tenant/session context on the validated self-hosted profile and run cross-tenant behavioral tests against the exact self-hosted PostgreSQL runtime role.
5. Add a reproducible self-hosted app stack, including durable upload/object storage, TLS ingress guidance, health/readiness checks, secret boundaries, backup/restore and upgrade/rollback instructions. Do not ship a compose file that silently uses ephemeral storage as if it were production durable storage.
6. Add CI for a clean provider-neutral self-hosted stack: first install, migration from empty, migration upgrade, full HTTP/business-flow acceptance, cross-tenant denial, restart, backup/restore, rollback rehearsal and cleanup. All results must bind to the same source commit and artifact.
7. Run the release workflow again after changes. Publish only its exact artifact, SHA-256, SBOM and provenance. Separately run the customer-controlled acceptance plan on a buyer-owned target before claiming the buyer deployment is qualified.

## 8. Status vocabulary for all buyer-facing reports

Use exactly these meanings:
- **PASS** — the named test ran and passed on the named target.
- **FAIL** — the named test ran and failed.
- **SKIPPED** — the test did not run; never count it as PASS.
- **NOT RUN** — no execution evidence exists.
- **NOT VERIFIED** — evidence is absent, stale, mismatched or insufficient.
- **BLOCKED** — a known technical or authority prerequisite prevents qualification.
- **NOT CERTIFIED** — no independent certification or scoped certification has been established.

### القرار بالعربية

النسخة الحالية **مرشح تسليم مصدر برمجي** يصلح للعرض والتفاوض وفق إشعار الحقوق، لكنها **ليست الآن نسخة تشغيل ذاتي إنتاجية معتمدة**. يوجد مانعان برمجيان مباشران على الأقل: بوابة سياق المستأجر مرتبطة بـVercel، وأداة ترحيل PostgreSQL مرتبطة بهوية Neon. اختبارات CI الناجحة دليل اختبارات بنطاقها فقط، وليست شهادات اعتماد خارجية. لا توجد حقوق استخدام أو إعادة بيع أو توزيع ممنوحة قبل توقيع جدول ترخيص محدد من صاحب الحقوق والمشتري.

**قرار التسليم الحالي: HOLD — لا تسليم ولا استخدام للمشتري قبل الترخيص، ولا ادعاء اعتماد Self-Hosted Production قبل إغلاق البوابات أعلاه.**
