# Commercial certification and buyer-residual register

**Register date:** 2026-11-25  
**Repository:** `mosamiryamany-hub/opscore-platform`  
**Evidence baseline:** `main` at `67d49545c8562ef1759cf1c21c1319fb457e6be5` when this register was prepared.  
**Purpose:** separate internal engineering evidence, production qualification, legal authorization, and buyer-owned integrations. This register does not create an external certification or a license grant.

## Decision rule

A check is marked **PASS — scoped evidence** only for the exact source, environment, deployment and test scope named by its evidence. A CI pass is not silently promoted to Production certification. A missing or mismatched deployment identity remains **HOLD**. Buyer-owned provider setup remains **BUYER ACTION** and does not invalidate unrelated source-level test results.

## Internal engineering evidence

| Area | Status | Evidence and boundary |
|---|---|---|
| PostgreSQL 18 isolated acceptance | PASS — scoped evidence | Same-commit isolated PostgreSQL 18 acceptance jobs recorded in the 2026-11-23 closeout ledger; not proof of current Production runtime configuration. |
| Tenant/RLS test matrix | PASS — scoped evidence | Historical same-commit tenant matrix 2/2 and 346 source-derived routes; scope is the isolated acceptance environment, not the public Production deployment. |
| HTTP commercial acceptance | PASS — scoped evidence | Historical isolated PostgreSQL HTTP acceptance 1/1; do not infer current public deployment acceptance. |
| Shared firewall rate limiter | PASS — scoped evidence | Historical PostgreSQL acceptance 1/1. PR #448 separately addresses namespace separation between login and firewall buckets and remains open as of this register. |
| Recovery drill | PASS — scoped evidence | Historical disposable CI restore: 137 tables. It is not Neon Production PITR or a periodic backup service. |
| Secure archive workflow | PASS — workflow change merged | PR #452 merged 2026-11-25 to run the existing signed-release workflow when its workflow definition changes on main. This trigger change alone does not prove a fresh release artifact was generated for this baseline; verify the resulting run and artifact before buyer delivery. |
| Release proof bound to final Production deployment | HOLD | The prior closeout ledger records a deployment-identity binding gap between probe and promoted deployments. Do not display Production certification until the current deployed deployment ID and all evidence are bound and independently verified. |
| Production tenant isolation / database role | HOLD | Historical production proof endpoints disagreed in scope and identity; production least-privilege role and behavioral isolation must be proven on the same current deployment. |
| Neon periodic backups / restore RPO-RTO | HOLD | Historical ledger records Free plan, no scheduled backup schedule, one manual snapshot and a six-hour history window. CI restore evidence does not close this gate. Re-read live Neon state before asserting current status. |
| WAF blocking enforcement | HOLD | Historical ledger records CRS and Bot Protection in log-only mode. A blocking policy plus observed blocking test is required. |
| Commercial/legal web pages | HOLD | Historical probes reported missing legal/commercial routes. Re-probe the live domain and publish only owner-approved legal/business data. |
| External compliance certification | NOT CLAIMED | No independently issued ISO 27001, SOC 2, PCI DSS or equivalent certificate is evidenced by repository test reports. |

## Buyer-owned / separately contracted residuals

| Residual | Status | Buyer deliverable |
|---|---|---|
| Licensed maps and road routing | BUYER ACTION | Provider contract, credentials, attribution, quotas, billing and live route acceptance. |
| Human translation qualification | BUYER ACTION | Native-speaker review and acceptance. The last recorded catalog ledger reports 105 selectable locales, 0/105 native-reviewed and 0/105 production-qualified; remeasure before publication. |
| Android/iOS store release | BUYER ACTION | Buyer signing keys/accounts, physical-device QA, store submission and publication. |
| Buyer identity, messaging, telephony and payment providers | BUYER ACTION | Provider accounts, contracts, credentials and live integration acceptance. |

## Legal distribution gate — separate from buyer integration residuals

The repository's last recorded legal boundary says the package is **UNLICENSED** and that no use, installation, running, copying, modification, hosting, distribution, resale or sublicensing rights are granted until the rights holder and named buyer execute a License Schedule bound to the exact source commit and/or package SHA-256. This is not a buyer integration residual and must not be marked approved without the executed agreement.

## Buyer-facing wording

Use:

> OpsCore's listed internal engineering checks have passed only within their stated test scopes. Production deployment qualification and operational controls are shown separately and remain subject to same-deployment evidence. Buyer-owned integrations are listed as buyer actions. No third-party compliance certification or software license is implied.

Do not use “all certifications approved”, “fully production certified”, “WAF protected”, “automatic backups active”, or “licensed for resale” unless the corresponding independent evidence or signed legal instrument exists.

## Required closure sequence

1. Re-read current main, open PRs, GitHub checks and latest secure-release artifact.
2. Resolve PR #448 and run its PostgreSQL-backed regression tests; keep login/firewall rate limits independently enforced.
3. Bind release, database-security, tenant-isolation, route and recovery evidence to the exact final Vercel Production deployment ID and source commit.
4. Verify production database role/grants, TLS, restore and backup strategy, and WAF enforcement with live tests.
5. Re-probe legal routes and use owner-approved legal entity, privacy, refund, pricing and license details only.
6. Rebuild the buyer package on the exact approved commit; verify SBOM, signature, archive digest and tamper rejection.
7. Keep software licensing blocked until the License Schedule is signed.

**Current decision: HOLD for blanket Production/commercial certification and distribution.** Internal CI/test evidence may be presented as scoped evidence; buyer residuals remain separately identified. This status must be refreshed after the above gates are re-measured.
