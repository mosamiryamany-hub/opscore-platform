# Buyer and seller residuals — live reconciliation 2026-11-18

This register supersedes stale deployment, key, and restore statements in earlier closeout notes. It is based on the live GitHub, Vercel, and Neon state inspected on 2026-11-18. It does not certify Production or grant any license rights.

## Live seller-owned baseline

| Item | Verified state | Boundary |
|---|---|---|
| GitHub main | `e5a8ee187d54e5fdba05eaacc3bbd8269cbd9062` | Main CI: `verify`, `vercel-contract-verify`, and isolated PostgreSQL/RLS/HTTP acceptance passed. Production deploy job is skipped by design. |
| Vercel Production | READY deployment `dpl_dgpmTAyycrjST9Rp3Gmp576KEmrg`, served commit `7b6d12b816c7a1ad4cc92802df7ce222bd233ade` | This is six commits behind current main. It is not proof that the current main SHA is deployed or release-certified. |
| Production traffic gate | `OPSC_PRODUCTION_HOLD=true`; `OPSC_RELEASE_VERIFIED=false` | Keep both values unchanged until the deployment-bound release and isolation evidence gates pass. |
| Production HMAC key | One enabled 32-byte key row, ID `prod-20261118-eb27b438`, valid through `2026-12-18T10:18:59Z` | The Vercel `OPSC_TENANT_CONTEXT_KEY_ID` matches the database key ID. Key presence does not prove that signed routes are active or that isolation is certified. |
| HMAC environment secrecy | `OPSC_TENANT_CONTEXT_HMAC_KEY` and `OPSC_TENANT_CONTEXT_KEY_JSON` are Vercel Sensitive/Secret for Production; JSON key is also Secret for Preview | Visibility metadata was verified. No secret value is included in this document. PR #271 hardens the manual rotation workflow and remains open pending merge authorization. |
| Neon migration ledger | 68 rows. Migrations 063–067 and 069 are present with source SHA-256 values | No pending-apply claim is made for these six migrations. This is ledger evidence, not a fresh v2 restore attestation or application-level signed-session proof. |
| Neon database catalog | 136 public base tables, 2 public views, 135 tables with RLS and FORCE RLS | `public.spatial_ref_sys` is the sole public base-table RLS exception and is PostGIS reference data, not an application tenant table. |
| Neon restore drill | Snapshot `snap-tiny-dream-bc58p5nj` restored non-finalizing to `br-odd-surf-bcps6nce`; branch metadata reports `restored` | Selected catalog counts and migration-ledger fingerprint match Primary. A canonical v2 schema/data fingerprint package has not been generated; no PITR time-target proof or RPO/RTO guarantee is established. |
| Neon Primary | `br-proud-salad-bcshhdap`, ready, primary/default, `protected=false` | Plan is Free, history retention is 6 hours, and automatic snapshot schedule is empty. |
| Vercel firewall | Firewall enabled; Managed CRS and Bot Protection run in `log` mode; login/mobile-login rate-limit rule exists. Vercel firewall enforcement posture: rules are log-only; do not flip to Deny without a false-positive review. | No representative false-positive review or Preview enforcement rehearsal has been completed. Do not switch to Deny based only on a short/no-anomaly window. |

## Seller-owned engineering residuals

| Residual | Status | Required close condition |
|---|---|---|
| Production 67-route tenant isolation | NOT ESTABLISHED | Run a real two-tenant signed-session matrix against the exact candidate deployment and Production Neon Primary; prove own-tenant success, cross-tenant denial, backend PID/transaction binding, forged GUC rejection, every manifest route, exact identities, and zero fixture residue. Bind results to exact commit, workflow run, deployment ID, database, branch and manifest/inventory hashes. |
| Proof bootstrap / cold-start cycle | OPEN ARCHITECTURE GATE | The running Production deployment expects deployment-bound 67-route evidence before enabling signed routes, while the evidence must be collected against that deployment. Implement and independently test a narrow canary or separately signed/revocable attestation design. Do not remove the deployment binding or weaken fail-closed checks. |
| Candidate probe identity | NOT CONFIGURED | PR #266 adds a narrowly scoped code exception, but candidate probe secrets and a cryptographically configured Vercel Trusted Source for GitHub Actions are not evidenced. Do not substitute a fake JWT or a long-lived bypass secret. |
| PR #254 | HOLD / NOT MERGEABLE | Stale/diverged branch, merge conflict, failed prior `verify` and `vercel-contract-verify` checks, and a JavaScript regex parse failure in its collector. It also contains a live Production probe path with writes/cleanup. Rebase/re-engineer and prove the complete workflow before considering it. |
| PR #266 | CHECKS PASS / MERGE BLOCKED | All required code and isolated database checks passed; deploy jobs were skipped. GitHub reports `mergeable_state=blocked`. No approval is recorded. Do not bypass repository protection. |
| PR #271 | CHECKS PASS / MERGE BLOCKED | Fixes the key rotation workflow so HMAC key material stays Secret on Vercel. `verify`, `vercel-contract-verify`, and isolated PostgreSQL/RLS/HTTP checks passed; deploy jobs were skipped. GitHub still reports merge blocked; obtain authorized repository review rather than force-merge. |
| Current-main source release | NOT PRODUCED | Build a fresh archive, SBOM, provenance, signed/attested statement and digest from exact current main only after all release gates and current-head verification pass. Do not reuse the separate `.18` branch package as a main release. |
| Neon backup posture | OPEN / PLAN-DEPENDENT | Free plan currently has 6-hour history, one manual snapshot, no automated backup schedule and an unprotected Primary branch. Automated backup schedules require a paid plan; protected branches require Scale. Select plan and costs, then configure and test scheduled restore. |
| Vercel commercial hosting | NOT ESTABLISHED | Current READY default-domain deployment does not prove commercial-plan entitlement, customer access, custom-domain ownership, or an SLA. Choose the appropriate Vercel plan, domain, and access policy before selling hosted SaaS. |
| WAF deny/challenge | NOT APPROVED | Preserve log-only posture until a representative traffic baseline, false-positive analysis and Preview enforcement trial demonstrate low operational risk. |
| picomatch advisory | OPEN — DOCUMENTED HIGH RISK | GHSA-fc5q-39xc-vjpf / CVE-2026-112366 affects versions through 4.0.7 and has no published patched version. The mobile lockfile pulls it transitively through Expo/Metro tooling; no direct mobile application import was found, but bundle/runtime absence is not certified. The allowlist expires/reopens on a newer registry version or reviewBy 2026-12-18. Do not claim fixed. |
| `OPSC_APP_SECURITY` | NOT A REQUIRED REPO CONFIGURATION FOUND | No source reference or repository search result was found. Do not invent this variable; reopen only if an external dependency demonstrates a real contract requiring it. |
| Seller security risk acceptance | NOT SIGNED | The picomatch exception remains a technical time-bounded gate, not an authorized seller-side risk sign-off. |
| Buyer license grant | NOT GRANTED | Redistribution/resale/production rights require rights-holder authorization and a signed transaction-specific License Schedule bound to the exact released archive SHA-256. |

## Buyer-owned residuals (not seller defects)

| Residual | Status | Owner |
|---|---|---|
| App Store / Play Store signing, listings and physical device acceptance | NOT INCLUDED / NOT VERIFIED | Buyer |
| Native-speaker translation review | 0/114 source rows reviewed; 0/105 selectable locales production-qualified | Buyer; machine-assisted drafts and English fallbacks must remain disclosed |
| Licensed maps, routing and geocoding | Provider account, credentials, usage billing and territorial license not included | Buyer |
| External service/provider activation | Buyer-specific OIDC/JWKS, email/SMS/WhatsApp/telephony, payment/webhooks, object storage, KMS/HSM and cloud subscriptions require buyer credentials and live tests | Buyer |
| Buyer environment certification | NOT ESTABLISHED | Must be proven against the buyer's exact deployment and database; seller CI does not transfer certification |

## Claims prohibited by current evidence

- Do not describe current main as deployed to Production, production-certified, tenant-isolation-certified, or live-release-verified.
- Do not describe the Neon Free project as having a scheduled backup, PITR/RPO/RTO guarantee, or protected Primary.
- Do not claim the picomatch advisory is fixed or that all mobile npm audit findings are clean; the documented exception is high severity and expires.
- Do not claim the 67-route production matrix passed; no deployment-bound evidence exists.
- Do not claim 114 languages are reviewed or production-qualified.
- Do not claim Vercel Hobby/Free infrastructure is a commercial hosted SaaS entitlement.
- Do not claim a buyer has resale, redistribution or production rights before a signed rights grant.

| Runtime localization | **105 selectable Contact Center locales** (1 source, 100 machine drafts, 4 English fallbacks; 9 withdrawn). 0/105 production-qualified; the 114-row qualification matrix remains `planned_not_qualified` pending native-speaker review. |
- qualification matrix has 114 source rows
- The Production Primary and the restore branch: both records report protected=false (branch protection is plan-gated on the Free plan).
- Snapshot inventory: one listed manual snapshot retained for restore evidence; automatic schedule empty on the Free plan.
