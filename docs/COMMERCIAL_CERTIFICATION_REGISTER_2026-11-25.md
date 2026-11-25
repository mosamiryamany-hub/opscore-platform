# OpsCore — commercial evidence and buyer-residual register

**Register date:** 2026-11-25  
**Repository:** `mosamiryamany-hub/opscore-platform`  
**Evidence baseline:** `main` at `ad45c4adf7683741b05293d6a7932150ea886231`.  
**Purpose:** distinguish verified engineering evidence, Production qualification, operational controls and buyer-owned integrations. This register is not an external compliance certificate.

## Decision rule

A PASS applies only to the exact source, environment, deployment and test scope named by its evidence. CI success is not silently promoted to Production certification. A missing or mismatched deployment identity remains HOLD. Buyer-owned provider setup remains BUYER ACTION and does not invalidate unrelated source-level tests.

## Current source and CI evidence

| Area | Status | Evidence and boundary |
|---|---|---|
| Main CI | PASS — scoped evidence | Exact current main `ad45c4adf7683741b05293d6a7932150ea886231`; run [45671764879](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45671764879) completed successfully. This supersedes the older `c477135a...` CI baseline. |
| PostgreSQL 18 tenant/RLS acceptance | PASS — isolated CI only | Run [45671764855](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45671764855): current-head source verification and isolated PostgreSQL 18 RLS/HTTP acceptance completed successfully. Preview migration and Production PITR jobs were skipped; this is disposable CI, not Production. |
| Vercel contract checks | PASS — contract scope | Run [45671764855](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45671764855): source verification and Vercel contract verification passed. Production deploy, Neon Preview migration/HTTP acceptance and historical Production PITR jobs were skipped. |
| Secure release artifact + signature | PASS — exact current main artifact | Run [45671764767](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45671764767), source `ad45c4adf7683741b05293d6a7932150ea886231`, completed successfully. `OpsCore-release.zip` SHA-256 `5ec2a2124efd313c3f4fc2df19a62f504bb3ea5e2f606825d10502e37c1b8cd8`; 2,787,323 bytes. Cosign v3.1.4 keyless OIDC signature verified with expected identity `https://github.com/mosamiryamany-hub/opscore-platform/.github/workflows/opscore-secure-release.yml@refs/heads/main` and issuer `https://token.actions.githubusercontent.com`. Tampered archive and wrong-signer rejection probes passed. Artifact `opscore-release-45671764767` ID `15050735579`; bundle SHA-256 `f18aa47ca6f4fbe4421b814350e36eaa05964d4683ff8677985897977f5a8f0b`. This proves exact artifact signing, not Production certification or buyer rights. |
| Release proof bound to final Production deployment | HOLD | The latest successful Vercel workflow run skipped its deploy job. The latest READY Production-target deployment inspected for `opscore-commercial` did not expose a source SHA in the returned deployment metadata. No same-deployment release/tenant/recovery proof is established. |
| Production tenant isolation / database role | HOLD | Isolated PostgreSQL 18 evidence passed, but current Production role/grants and behavioral tenant isolation have not been proven against the exact live deployment and database identity. |
| Neon Production backups / restore RPO-RTO | HOLD — plan limitation | Live project `summer-leaf-18448271` (`opscore-production`) is on Neon Free, with 21,600-second (6-hour) history retention. A copy-on-write backup branch `br-green-violet-bco122mk` was created from primary `br-proud-salad-bcshhdap` (parent timestamp `2026-11-25T15:54:20Z`); it is READY but unprotected because the current plan rejects branch protection. One older manual snapshot exists from 2026-11-19; a new snapshot was rejected because the snapshot limit is reached. Increasing retention to 30 days was rejected because the plan maximum is 21,600 seconds. The live automatic-snapshot schedule query returned an empty list. An explicit daily schedule request was rejected with HTTP 404 `backup schedule creation is not enabled for this project`. No scheduled backup service, external backup destination or measured RPO/RTO is established. |
| Vercel WAF blocking | PASS — tested custom deny rules; managed rules HOLD | Active firewall config version 9. Three custom deny rules were exercised on 2026-11-25: five safe probes (`/.env`, `/wp-admin`, two XSS query probes, double-encoded traversal) returned HTTP 403 with `x-vercel-mitigated: deny`; a benign query returned HTTP 200. Rules use substring matching in OR condition groups. CRS rules remain `log`, not `deny`; managed OWASP rules were rejected by the current plan (HTTP 402). This proves these custom match cases only, not a blanket WAF/OWASP certification. |
| Commercial/legal web pages | HOLD — source copy updated; public access not qualified | The repository sales-page source now allows acquisition without pre-sale signature/separate Schedule. The Vercel `opscore-commercial` project still reports `live=false` and SSO protection enabled for all deployment targets; the Production alias is not bound to current main. Do not claim the prospect-facing site is publicly reachable or current until a public, same-source deployment is verified. |
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

1. Keep the exact-current-head release artifact, statement and Sigstore bundle together; retain the artifact ID and SHA-256 values above for buyer handoff.
2. Bind release, database-security, tenant-isolation, route and recovery evidence to the exact final Vercel Production deployment ID and source commit.
3. Resolve Neon plan limits for protected branches, retention and scheduled backup capability; protect the current backup branch or establish an approved offsite schedule, then perform a measured restore before claiming RPO/RTO.
4. Resolve Vercel plan eligibility for OWASP Core Ruleset, configure blocking/challenge policy, rehearse false positives and verify observed blocks before claiming WAF enforcement.
5. Re-probe public commercial/legal routes and confirm Production runtime TLS, database role/grants and tenant isolation.
6. Keep buyer acquisition open while clearly disclosing source/production qualification status and buyer-owned integration residuals.

**Current decision:** OPEN for marketing and customer acquisition; HOLD for blanket Production certification and unverified operational controls. Buyer residuals remain separately identified.
