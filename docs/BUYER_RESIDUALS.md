# Buyer and seller residuals — reconciled 2026-11-18

These residuals distinguish what belongs to the seller's source release, what belongs to a buyer deployment, and what belongs only to the seller-hosted Production service. A transaction-specific License Schedule is prepared for a named buyer only when a sale proceeds and must be signed before granting rights or delivering the licensed package. Buyer identification/signature is not a prerequisite to seller engineering, offer publication, demonstration or negotiation.

## Seller-owned source-release and governance residuals

| Residual | Status | Evidence / boundary |
|---|---|---|
| Exact-head release archive | REMAINING_SELLER | Current main is 27d41476a115d81ddd3ad1b4f03025142a7e5be6. No current-main Secure Release ZIP, external release statement or matching digest was produced in this closeout round. Historical artifacts must not be reused. |
| Picomatch security advisory | OPEN / TEMPORARY GATE EXCEPTION | GHSA-fc5q-39xc-vjpf remains unresolved for picomatch through 4.0.7. Main's audit gate allows the recorded entry only through 2026-12-18; CI PASS under that entry is not a fixed dependency or a signed risk acceptance. PR #230 is Draft/HOLD and must not merge as a fix. |
| Seller-side residual risk approval | NOT EVIDENCED | The allowlist has a written rationale and expiry but does not itself identify/sign an authorized risk owner. Obtain and retain the seller's authorized decision before commercial risk acceptance is claimed. |
| Current Production restore proof | REMAINING_SELLER / HOSTED OPS | The sole manual snapshot predates migrations 063–067 and 069. Its restore provenance is valid for that earlier snapshot generation, but schema parity with the current Primary is not expected. A new snapshot of the current generation is required for a matching-current-primary proof. The Free plan currently limits the project to one snapshot and the last create attempt was rejected; no snapshot was deleted. |

## Buyer-owned deployment residuals

| Residual | Status | Notes |
|---|---|---|
| Mobile signing and publication | REMAINING_BUYER | No signed APK/AAB/IPA, EAS signing key, physical-device acceptance or App Store/Play Store approval is included. Buyer owns its accounts, signing, native builds, device QA and submissions. |
| Native translation review | REMAINING_BUYER | Runtime catalogue exposes 105 locales: 1 English source, 100 machine-assisted drafts and 4 English-fallback locales. Nine flagged locales remain withdrawn. Native-speaker review is 0/114; production qualification is 0/105. Preserve visible machine-translation notice. |
| Licensed maps and routing | REMAINING_BUYER | Buyer obtains map provider account, API credentials, usage billing and territorial commercial license. |
| External service/provider setup | REMAINING_BUYER | Buyer provisions and live-tests identity/OIDC/JWKS, email/SMS/WhatsApp/carrier, telephony/contact-center, payment/webhooks, object storage, KMS/HSM, cloud and other selected providers. |
| Buyer environment certification | NOT_ESTABLISHED | Seller-reference CI results do not transfer. Isolation, security, recovery and acceptance must be proven on the buyer's exact deployment and database. |

## Seller-hosted SaaS / Production operations — separate from source-code sale

| Residual | Status | Notes |
|---|---|---|
| Neon recovery capacity | REMAINING_HOSTED_OPS | Current Neon project is Free, 6-hour history retention, 1 GiB branch logical-size limit, automatic snapshot schedule empty and only one manual snapshot. No PITR/RPO/RTO guarantee is established. |
| Production migrations | PARTIALLY EXECUTED / POST-FIX ATTESTATION MISSING | Production opscore_acceptance ledger has 68 rows; migrations 063–067 and 069 are present. Historical workflow 44189975492 failed in a post-apply check because the runner queried the intentionally absent opscore_app role. PR #234 corrected the postcondition code and passed isolated PostgreSQL CI. No post-fix Production verification run has been completed. Do not reapply migrations already present. |
| Production signed tenant context | NOT ACTIVATED | opscore_security.context_hmac_keys currently contains 0 keys. Runtime role cannot read the key table; the restricted definer can. This does not establish that a Production signing key has been provisioned or activated. |
| Production 67-route signed-session matrix | NOT_ESTABLISHED | Isolated PostgreSQL CI acceptance is not the live Production HTTP session/tenant/backend-PID/transaction-bound evidence matrix. |
| Vercel commercial hosting | NOT_ENABLED | Vercel project reports live=false, no custom domains and latest deployment target null. Source-code handoff is not a seller-hosted SaaS subscription. |
| WAF enforcement | NOT_CERTIFIED | Historical inspection showed relevant managed CRS/bot actions in log mode. Do not switch to deny without current baseline, false-positive review and Preview rehearsal. |
| Production recovery/rollback | PARTIAL / NOT GO FOR MAINTENANCE | The existing restore is from the pre-migration snapshot generation; current-primary parity proof is missing. No current RPO/RTO evidence is established. |

## Do not claim

- Do not claim the picomatch advisory is fixed or that npm audit is clean; the main gate currently accepts a time-bounded advisory entry.
- Do not claim migrations 063–067/069 are pending: they are present in the Production opscore_acceptance migration ledger. Do not claim post-fix Production attestation: it has not run.
- Do not claim current Production backup/PITR/RPO/RTO, signed-route activation, 67-route certification, Production isolation certification or a current Production deploy.
- Do not claim 114 languages certified, human-translated product, native-speaker review or production-qualified languages.
- Do not represent Vercel Hobby/Free seller infrastructure as commercial hosted SaaS.
- Do not treat any historical ZIP, digest or test artifact as the current-main handoff.