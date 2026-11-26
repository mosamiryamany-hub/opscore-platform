# OpsCore v0.11.62 — Commercial and IP Transfer Checklist

This operational checklist does not replace legal advice. The rights holder may advertise, publish, present, demonstrate, quote and negotiate the offer before a buyer is identified; no pre-sale signature or separate License Schedule is required for customer acquisition. If a sale proceeds, the accepted buyer-specific offer/order/contract or equivalent transaction record states the source-code rights, modification/distribution scope, repository/history scope, brand/domains if included, third-party dependencies/licenses, excluded assets, support and responsibility allocation. There is no bundled license grant by default. NO_LICENSE_GRANT_NOTICE.txt controls; a separate License Schedule is optional.

## Repository visibility and source confidentiality

The GitHub repository was confirmed **public** during the 2026-11-11 closeout inspection. The source is therefore publicly retrievable; the absence of a license grant and the public repository visibility mean source retrieval is not equivalent to a commercial right to use, sell, or redistribute. Before a controlled/confidential commercial handoff, the rights holder must explicitly choose and record one of these positions: (a) intentionally distribute the source publicly under a clearly documented public-source business model and compatible license, or (b) make the repository private and verify that collaborator access, branch protection/rulesets, GitHub Actions, Vercel's controlled deployment path and buyer artifact delivery continue to work. Repository visibility has not been changed by this checklist. Do not represent the repository as confidential while it remains public.

## Three scope items to record explicitly

| Area | Included by this source package | Buyer/customer responsibility |
|---|---|---|
| Contact Center translation | 114 source/qualification rows, with 105 selectable runtime locales: 1 English source, 100 machine-assisted drafts, 4 explicit English fallbacks; 9 flagged locales withdrawn from runtime. The visible machine-translation notice and 89-key structure are included. | Native-speaker/domain review and approval before official use. Native-speaker review is 0/114; runtime production qualification is 0/105. Do not describe all 114 rows as selectable or qualified. |
| External integrations | Source contracts, routes/adapters and configuration boundaries only where present. | Accounts, licenses, API credentials, OIDC/JWKS, email/SMS/WhatsApp/carrier and external call-center/telephony providers, payment, webhooks, object storage, KMS/HSM, maps/routing, cloud, quotas, billing, callbacks, live acceptance tests and maintenance. |
| Mobile apps | Expo mobile source (version 0.1.16) and source-level verification. No signed APK/AAB/IPA is included. | EAS project/account, signing keys, Apple/Google developer accounts, native builds, physical-device testing, API environment setup, store submission/distribution, security/dependency remediation and updates. |

## Mobile dependency warning

The current `main` baseline is Expo SDK 58.0.23 / React Native 0.88.1 / React 19.3.0. PR #222 candidate head `bd6d7ee56a0f3b7db3cf09cefefe11fd46ba76e3` uses Expo SDK 58.0.26. Exact-head OpsCore CI run 44167795172 reports 807/810 backend release tests passed (0 failed, 3 skipped), backend runtime dependency audit 0 vulnerabilities, npm ci install summary 25 High, and required mobile `npm audit --omit=dev --audit-level=high` failure with 26 High (0 Critical), associated with GHSA-fc5q-39xc-vjpf / CVE-2026-112366 through transitive picomatch dependencies. Vercel contract run 44167795351 also fails the mobile audit with 26 High and skips deployment. PostgreSQL 18 isolated acceptance passed on the same head (run 44167795388, 346 route checks and 137 restore tables) but Production isolation remains NOT_CERTIFIED. No waiver/suppression is applied and no exact-head Secure Release artifact exists. The earlier zero-finding run 43308699094 is historical and must not be used for this source tree.

## Other production boundaries

The buyer/hosting owner must separately accept PostgreSQL/PostGIS schema and runtime behavior, tenant isolation, grants, production backup/restore, KMS/HSM and rotation, TLS/reverse proxy/WAF, centralized observability, rate limiting/shared runtime state, live identity and external integrations, licensed map attribution/quota, physical-device workflows, and operations/on-call/recovery.

## Handover evidence

Use only one successful exact-head GitHub Actions Secure Release run's outer artifact, nested `OpsCore-release.zip`, external `COMMERCIAL_RELEASE_STATEMENT.json`, JUnit/step results, `I18N_FORENSIC_AUDIT_RESULT.json`, mobile dependency audit JSON, root PostgreSQL runtime dependency audit JSON and SHA-256 evidence. Do not copy historical run IDs or artifact names into current handoff materials. Any source change invalidates the prior package identity. Neither a green backend closure gate nor a source archive implies production certification.
