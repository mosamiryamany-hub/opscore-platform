# Buyer and seller residuals — reconciled 2026-11-18

These residuals distinguish what belongs to the seller's source release, what belongs to a buyer deployment, and what belongs only to the seller-hosted Production service. A transaction-specific License Schedule is prepared for a named buyer only when a sale proceeds and must be signed before granting rights or delivering the licensed package. Buyer identification/signature is not a prerequisite to seller engineering, offer publication, demonstration or negotiation.

## Seller-owned source-release and governance residuals

| Residual | Status | Evidence / boundary |
|---|---|---|
| Exact-head release archive | REMAINING_SELLER | Current repository main is 88f0f7377244d89f063de7c07714f9c2849fbc57; the last application-code baseline is 27d41476a115d81ddd3ad1b4f03025142a7e5be6 (PR #235 was documentation/closeout-test only). No current-main Secure Release ZIP, external release statement or matching digest was produced in this closeout round. Historical artifacts must not be reused. |
| Picomatch security advisory | OPEN / TEMPORARY GATE EXCEPTION | GHSA-fc5q-39xc-vjpf remains unresolved for picomatch through 4.0.7. Main's audit gate allows the recorded entry only through 2026-12-18; CI PASS under that entry is not a fixed dependency or a signed risk acceptance. PR #230 is Draft/HOLD and must not merge as a fix. |
| Seller-side residual risk approval | NOT EVIDENCED | The allowlist has a written rationale and expiry but does not itself identify/sign an authorized risk owner. Obtain and retain the seller's authorized decision before commercial risk acceptance is claimed. |
| Current Production restore proof and capacity | REMAINING_SELLER / HOSTED OPS | Read-only inventory now shows 2 active branches (2/10 included): Primary br-proud-salad-bcshhdap and the non-finalizing restore branch br-odd-surf-bcps6nce; both records report protected=false. The project has one listed manual snapshot, snap-tiny-dream-bc58p5nj, created 2026-11-18 01:22:39 UTC. The restore branch reports restored_from=snap-tiny-dream-bc58p5nj and restored_as=br-proud-salad-bcshhdap. Automatic snapshot scheduling was not re-queried after this replacement. The v1 proof is superseded; the current v2 parity proof still must be generated and pinned. |

## Buyer-owned deployment residuals

| Residual | Status | Notes |
|---|---|---|
| Mobile signing and publication | REMAINING_BUYER | No signed APK/AAB/IPA, EAS signing key, physical-device acceptance or App Store/Play Store approval is included. Buyer owns its accounts, signing, native builds, device QA and submissions. |
| Native translation review | REMAINING_BUYER | Runtime manifest has 105 selectable Contact Center locales: 1 English source, 100 machine-assisted drafts and 4 English-fallback locales. The qualification matrix has 114 source rows; nine flagged locales remain withdrawn. Native-speaker review is 0/114; production qualification is 0/105. Preserve visible machine-translation notice. |
| Licensed maps and routing | REMAINING_BUYER | Buyer obtains map provider account, API credentials, usage billing and territorial commercial license. |
| External service/provider setup | REMAINING_BUYER | Buyer provisions and live-tests identity/OIDC/JWKS, email/SMS/WhatsApp/carrier, telephony/contact-center, payment/webhooks, object storage, KMS/HSM, cloud and other selected providers. |
| Buyer environment certification | NOT_ESTABLISHED | Seller-reference CI results do not transfer. Isolation, security, recovery and acceptance must be proven on the buyer's exact deployment and database. |

## Seller-hosted SaaS / Production operations — separate from source-code sale

| Residual | Status | Notes |
|---|---|---|
| Neon recovery capacity | REMAINING_HOSTED_OPS | Current Neon project is Free, 6-hour history retention, 1 GiB branch logical-size limit and one listed manual snapshot. Automatic snapshot scheduling was not re-queried after the snapshot replacement. No PITR/RPO/RTO guarantee is established. |
| Production migrations | PARTIALLY EXECUTED / POST-FIX ATTESTATION MISSING | Production opscore_acceptance ledger has 68 rows; migrations 063–069 are present on Primary and the current restore branch with exact source SHA-256 matches. PR #245 is updating the stale restore-proof contract into a v2, read-only migration-state verifier. The fresh v2 proof and post-fix Production verification workflow have not yet run. Do not reapply migrations already present. |
| Production signed tenant context | NOT ACTIVATED | opscore_security.context_hmac_keys currently contains 0 keys. Runtime role cannot read the key table; the restricted definer can. This does not establish that a Production signing key has been provisioned or activated. |
| Production 67-route signed-session matrix | NOT_ESTABLISHED | Isolated PostgreSQL CI acceptance is not the live Production HTTP session/tenant/backend-PID/transaction-bound evidence matrix. |
| Vercel commercial hosting | NOT_ENABLED | Vercel project reports live=false, no custom domains and latest deployment target null. Source-code handoff is not a seller-hosted SaaS subscription. |
| Vercel firewall enforcement posture | NOT_CERTIFIED | Current active config version 4: CRS Generic/RCE/SQLi/XSS and Bot Protection are enabled in log-only mode; IP allow/deny rules are empty; POST login/mobile-login is rate-limited to 60 requests per source IP per fixed 60-second window. Do not switch log rules to deny without a representative baseline, false-positive review and Preview rehearsal. |
| Production recovery/rollback | PARTIAL / NOT GO FOR MAINTENANCE | The current restore branch is bound to snap-tiny-dream-bc58p5nj and has matching migration/schema inventory findings, but a fresh v2 proof has not yet been generated and pinned. No current RPO/RTO evidence is established. |

## Do not claim

- Do not claim the picomatch advisory is fixed or that npm audit is clean; the main gate currently accepts a time-bounded advisory entry.
- Do not claim migrations 063–067/069 are pending: they are present in the Production opscore_acceptance migration ledger. Do not claim post-fix Production attestation: it has not run.
- Do not claim current Production backup/PITR/RPO/RTO, signed-route activation, 67-route certification, Production isolation certification or a current Production deploy.
- Do not claim 114 languages certified, human-translated product, native-speaker review or production-qualified languages.
- Do not represent Vercel Hobby/Free seller infrastructure as commercial hosted SaaS.
- Do not treat any historical ZIP, digest or test artifact as the current-main handoff.