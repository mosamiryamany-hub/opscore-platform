# OpsCore — commercial evidence and buyer-residual register

**Register date:** 2026-11-25  
**Repository:** `mosamiryamany-hub/opscore-platform`  
**Evidence baseline:** `main` at `c477135a4dda84f9ca3bb158871bae4381d362c6`.  
**Purpose:** distinguish verified engineering evidence, Production qualification, operational controls and buyer-owned integrations. This register is not an external compliance certificate.

## Decision rule

A PASS applies only to the exact source, environment, deployment and test scope named by its evidence. CI success is not silently promoted to Production certification. A missing or mismatched deployment identity remains HOLD. Buyer-owned provider setup remains BUYER ACTION and does not invalidate unrelated source-level tests.

## Current source and CI evidence

| Area | Status | Evidence and boundary |
|---|---|---|
| Main CI | PASS — scoped evidence | Commit `c477135a4dda84f9ca3bb158871bae4381d362c6`; run [45664429611](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45664429611) completed successfully: 187 files, 1,028 passed, 0 failed, 3 skipped; npm audit reported 0 vulnerabilities for the audited dependency scopes. |
| PostgreSQL 18 tenant/RLS acceptance | PASS — isolated CI only | Run [45664430036](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45664430036): isolated PostgreSQL 18 signed-tenant 67-route checks, real runtime-role RLS denial checks, composite-FK gate, logical dump/restore drill and HTTP commercial acceptance passed. This was disposable CI, not Production. |
| Vercel contract checks | PASS — contract scope | Same run: source verification and Vercel contract verification passed. Production deploy, Neon Preview migration/HTTP acceptance and historical Production PITR jobs were skipped. |
| Secure release signing implementation | PASS — workflow implementation | `.github/workflows/opscore-secure-release.yml` uses Cosign keyless Sigstore OIDC, `cosign verify-blob`, exact workflow identity and OIDC issuer checks, plus tamper-rejection and wrong-signer-rejection probes. A fresh run and its artifact are still required for this evidence baseline. |
| Release proof bound to final Production deployment | HOLD | The latest successful Vercel workflow run skipped its deploy job. The latest READY Production-target deployment inspected for `opscore-commercial` did not expose a source SHA in the returned deployment metadata. No same-deployment release/tenant/recovery proof is established. |
| Production tenant isolation / database role | HOLD | Isolated PostgreSQL 18 evidence passed, but current Production role/grants and behavioral tenant isolation have not been proven against the exact live deployment and database identity. |
| Neon Production backups / restore RPO-RTO | HOLD — plan limitation | Live project `summer-leaf-18448271` (`opscore-production`) is on Neon Free, with 21,600-second (6-hour) history retention. A copy-on-write backup branch `br-green-violet-bco122mk` was created from primary `br-proud-salad-bcshhdap` (parent timestamp `2026-11-25T15:54:20Z`); it is READY but unprotected because the current plan rejects branch protection. One older manual snapshot exists from 2026-11-19; a new snapshot was rejected because the snapshot limit is reached. Increasing retention to 30 days was rejected because the plan maximum is 21,600 seconds. No scheduled backup service or measured RPO/RTO is established. |
| Vercel WAF blocking | PARTIAL — custom deny rules active; full managed ruleset HOLD | The `opscore-commercial` firewall is enabled with three valid, active custom `deny` rules: common admin/secret/scanner paths; literal and encoded parent-directory traversal; and high-confidence XSS markers in selected query keys. The OWASP Core Ruleset remains unavailable on the current plan (HTTP 402). Configuration validity is confirmed; an external request-level 403/block observation is still unverified, so do not claim full OWASP protection. |
| Commercial/legal web pages | HOLD | Re-probe the current public domain and publish only owner-approved business/legal details. |
| External compliance certification | NOT CLAIMED | No independently issued ISO 27001, SOC 2, PCI DSS or equivalent certificate is evidenced by repository tests. |

## Buyer-owned / separately configured residuals

| Residual | Status | Buyer deliverable |
|---|---|---|
| Licensed maps and road routing | BUYER ACTION | Provider selection/contract, credentials, attribution, quotas, billing and live route acceptance. |
| Human translation qualification | BUYER ACTION | Native-speaker review and acceptance. The last recorded catalogue reports 105 selectable locales, 0/105 native-reviewed and 0/105 production-qualified; remeasure before publication. |
| Android/iOS store release | BUYER ACTION | Buyer signing keys/accounts, physical-device QA, store submission and publication. |
| Buyer identity, messaging, telephony and payment providers | BUYER ACTION | Provider accounts, credentials and live integration acceptance. |

## Commercial customer acquisition

**OPEN** Marketing, product presentation, demonstrations, buyer discovery, RFP responses, indicative quotations and negotiations may proceed now. A prospect does **not** need to sign a separate License Schedule before being contacted, evaluating the product or negotiating.

The product must be presented honestly as a source-code candidate with the technical limitations above. At the point of a transaction, the accepted buyer-specific offer/order/contract records the selected tier, exact deliverable, permitted use and redistribution scope, price, payment, term and support. A separate License Schedule is optional, not a customer-acquisition gate. Third-party components remain subject to their own licenses; no rights beyond those the seller is entitled to grant are represented.

## Buyer-facing wording

> OpsCore is available for commercial discussion, demonstrations and buyer evaluation. The current source and isolated PostgreSQL checks have passed only within their stated scopes. Production deployment qualification and certain buyer-selected integrations remain separate. The buyer-specific offer states the deliverable, permitted rights, limitations and commercial terms.

Do not use “all certifications approved”, “fully production certified”, “WAF protected”, “automatic backups active”, or “all languages human-approved”. Do not present the buyer residuals as completed.

## Required technical closure sequence

1. Generate a fresh secure-release run from the current approved `main`; independently inspect the Cosign bundle, certificate identity, issuer, archive digest, tamper rejection and wrong-signer rejection.
2. Bind release, database-security, tenant-isolation, route and recovery evidence to the exact final Vercel Production deployment ID and source commit.
3. Resolve Neon plan limits for protected branches, retention and scheduled backup capability; protect the current backup branch or establish an approved offsite schedule, then perform a measured restore before claiming RPO/RTO.
4. Resolve Vercel plan eligibility for OWASP Core Ruleset, configure blocking/challenge policy, rehearse false positives and verify observed blocks before claiming WAF enforcement.
5. Re-probe public commercial/legal routes and confirm Production runtime TLS, database role/grants and tenant isolation.
6. Keep buyer acquisition open while clearly disclosing source/production qualification status and buyer-owned integration residuals.

**Current decision:** OPEN for marketing and customer acquisition; HOLD for blanket Production certification and unverified operational controls. Buyer residuals remain separately identified.
