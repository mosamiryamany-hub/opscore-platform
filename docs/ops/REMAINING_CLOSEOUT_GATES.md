# Main release and hosted-production closeout — live state 2026-11-18

This file replaces stale closeout statements from earlier commits. It separates source-release acceptance from deployment/hosted-production certification. Evidence was rechecked against GitHub, Vercel and Neon on 2026-11-18.

## Current immutable references

| System | Exact state |
|---|---|
| GitHub repository | `mosamiryamany-hub/opscore-platform` |
| Current main | `e5a8ee187d54e5fdba05eaacc3bbd8269cbd9062` |
| Vercel Production deployment | `dpl_dgpmTAyycrjST9Rp3Gmp576KEmrg` |
| Vercel served commit | `7b6d12b816c7a1ad4cc92802df7ce222bd233ade` (main, six commits behind current main) |
| Neon project / Primary | `summer-leaf-18448271` / `br-proud-salad-bcshhdap` |
| Neon database | `opscore_acceptance` |
| Neon snapshot | `snap-tiny-dream-bc58p5nj` (2026-11-18T01:22:39Z) |
| Non-finalizing restore branch | `br-odd-surf-bcps6nce` (`restored`, `restored_from` exact snapshot) |

## Closed in this verification round

| Item | Evidence and boundary |
|---|---|
| Main required CI | `verify`, `vercel-contract-verify` and `isolated-postgres-rls-and-http-acceptance` successful on current main. Deployment jobs intentionally skipped by hold. |
| HMAC env secrecy | Production `OPSC_TENANT_CONTEXT_HMAC_KEY` and `OPSC_TENANT_CONTEXT_KEY_JSON` verified Vercel Sensitive/Secret; Preview copies of both also Secret. No key bytes read or placed in evidence. |
| HMAC key identity | Exactly one enabled Primary key row, 32 bytes; `key_id=prod-20261118-eb27b438` exactly matches the Production `OPSC_TENANT_CONTEXT_KEY_ID` metadata. Valid through 2026-12-18T10:18:59Z. This is key provisioning/identity evidence only, not proof of live route activation. |
| Snapshot restore | A separate, non-finalizing restore branch is ready and reports `restore_status=restored`, exact `restored_from` snapshot and `restored_as` Primary. Selected catalog and migration-ledger comparisons were read-only. No finalization or Primary mutation was performed. |
| Migration ledger presence | 68 rows; 063–067 and 069 each have ledger SHA-256 entries. Do not reapply them. |
| Main ruleset | Active ruleset prevents deletion and force-push, requires PR and strict `verify` plus `vercel-contract-verify` status checks. It requires zero approvals; the GitHub integration could not read classic protection settings. |
| Secret rotation workflow hardening | PR #271 changes future Vercel create/update operations to keep HMAC secret material Sensitive and verifies type/Secret visibility. CI passed. PR remains blocked from merge; source change is not yet in main. |

## Remaining hard gates — not certified / not completed

| Gate | Current state | Closure condition |
|---|---|---|
| PR #271 merge | CI success; GitHub says `mergeable_state=blocked` | Authorized repository reviewer/admin resolves the block. Do not bypass protection or claim this workflow fix is in main before merge. |
| PR #266 candidate-probe exception | CI success; GitHub says merge blocked | Resolve authorized review/branch-protection block; configure a cryptographically verified Vercel Trusted Source for GitHub Actions; prove exact deployment-host, token and route allowlist restrictions. |
| PR #254 production 67-route collector | Draft, conflict/stale base, previous verify and Vercel contract failures including invalid regex syntax | Re-engineer/rebase against current main; repair parser failure; wire OIDC correctly; exercise on a non-aliased candidate deployment; prove no unsafe writes and complete cleanup. No merge or production execution in current state. |
| Production 67-route behavioral isolation | NOT ESTABLISHED | Exact dual-tenant signed sessions, backend PID/transaction binding, signed context verification, own-tenant reads/writes, cross-tenant denial, raw-GUC tampering rejection and 67/67 route evidence, all bound to exact deployment/commit/pipeline/Primary/manifest hashes, with zero residue. |
| Production proof bootstrap | OPEN ARCHITECTURE GATE | Resolve the cold-start/deployment-ID circular dependency using a narrowly scoped internal canary or independently signed/revocable attestation. Keep deployment binding and fail-closed behavior. |
| Production release/deployment | HOLD remains true; release verified remains false; live deployment is six commits behind main | Generate and validate exact-current-main release/SBOM/provenance, run all gates, prove DB and rollback identity, and follow an authorized maintenance window. Only then consider exact-SHA promotion. |
| Neon recovery posture | Free plan, 6-hour history, no scheduled backup, Primary unprotected | Paid plan/billing approval; configure supported automated backups and sufficient PITR history; protect Primary under an eligible plan; execute and hash-pin a fresh non-finalizing restore with full v2 schema/data/ledger proof. |
| Vercel commercial hosting | READY default-domain deploy, but no custom domain/commercial plan proof | Confirm commercial entitlement, intended customer access, SSO/protection and domain ownership; no plan/domain change was authorized here. |
| WAF enforcement | CRS and Bot Protection actions remain Log; login rate limit exists | Collect representative baseline, review false positives, rehearse in Preview. Deny/Challenge changes require reviewed ops decision. |
| picomatch ReDoS | High advisory GHSA-fc5q-39xc-vjpf / CVE-2026-112366; no patched release through 4.0.7 | Keep explicit self-expiring risk gate until published fix or validated dependency removal. Do not claim fixed; allowlist auto-voids on registry update/review expiry (2026-12-18). |
| Current-main release archive | NOT PRODUCED | New archive + external statement + SHA-256 + SBOM + provenance bound to exact current main after technical gates pass. Historical `.18` package is separate and is not this main release. |
| Legal distribution rights | NOT GRANTED | Rights-holder approval and signed License Schedule bound to exact archive SHA-256. |
| Buyer-side residuals | OPEN | Buyer app signing/store listing/device acceptance; native-speaker review; licensed maps; buyer-owned providers and environment certification. |

## Security and operating boundaries

- Keep `OPSC_PRODUCTION_HOLD=true` and `OPSC_RELEASE_VERIFIED=false` until all exact deployment-bound gates pass.
- Do not run a Production collector that creates tenants/sessions/work orders or other fixtures without a separately approved live-data probe and cleanup plan.
- Do not merge a PR in a blocked state, force-push protected main, change WAF Log to Deny, upgrade plans, delete retained snapshots, or alter live production data as a substitute for proof.
- Do not invent `OPSC_APP_SECURITY`; no repository source reference was found. Verify an actual external contract before adding it.
- A source artifact, a READY Vercel deployment, an isolated PostgreSQL test, a restored snapshot and a production behavioral isolation certificate are different evidence classes. Never substitute one for another.
