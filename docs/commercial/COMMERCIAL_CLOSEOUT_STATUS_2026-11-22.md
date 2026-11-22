# OpsCore — Commercial handoff status (2026-11-22)

**Disposition: PASS_WITH_RESIDUALS.** Production deployment and the exact-run engineering evidence below passed. The project is **not fully commercially closed**: the current-head signed buyer archive has not been generated, no license is granted, automated Neon backups/branch protection are not configured, Vercel CRS/bot rules remain log-only, and buyer-specific mobile, language, map and provider requirements remain open.

This document supersedes earlier closeout snapshots that reference pre-2026-11-22 commits, deployments or NOT_VERIFIED findings. Historical records are retained as history, not as the current status.

## 1. Current source and live deployment

| Item | Current verified value |
|---|---|
| Repository | `mosamiryamany-hub/opscore-platform` |
| Current protected `main` | `4b8a532aea404dd5b696b5d9b2cd3eb45c72852b` |
| Latest Production deployment | `dpl_G7r6CDntYarpafuawie8CKWDLBB7` |
| Production source SHA | `2a4938a70220d3375497e94499850476b4b505de` |
| Public Production domain | https://opscore-platform.vercel.app |
| Version reported by the release page | `0.11.62` |
| Production release workflow | [Run 45013074938](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45013074938) |
| Main evidence-page refresh | [PR #390](https://github.com/mosamiryamany-hub/opscore-platform/pull/390), merged as `4b8a532` |

The latest `main` commit `4b8a532` changes the release-proof HTML and its regression test only. It is **not yet deployed**: the Vercel push workflow passed source and disposable PostgreSQL checks but skipped its protected `deploy` job, and Vercel has no deployment record for SHA `4b8a532`. The live domain still serves deployment `dpl_G7r6...` at source SHA `2a4938a`. A fresh authorized `workflow_dispatch` release is needed to publish the refreshed evidence page.

## 2. Production evidence — successful, with scope boundaries

Run [45013074938](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45013074938) completed successfully on source commit `2a4938a70220d3375497e94499850476b4b505de`.

| Evidence | Result | Exact scope |
|---|---|---|
| Production staged runtime / release gates | PASS | Candidate runtime identity, TLS, database/security, signed release evidence and release gates |
| PostgreSQL client TLS | PASS | Actual application socket negotiated TLS 1.3; cipher `TLS_AES_256_GCM_SHA384` |
| Signed-tenant route matrix | PASS 67/67 | Candidate deployment `dpl_FgDTqKJxCDw3SAGLtgPxqfQHGu7v`; signed context/session/transaction binding, raw-GUC tamper denial and cross-tenant read/write denial |
| Production PostgreSQL HTTP route probes | PASS 358/358 | Exact candidate deployment, Production Neon branch/database, commit and pipeline bound; zero failures |
| Authenticated tenant business flows | PASS 3/3 | Customer lifecycle, work-order lifecycle, asset/event lifecycle; cross-tenant denial and synthetic-data cleanup passed |
| Full-data recovery evidence v4 | PASS | Full-data content hashes, table/RLS comparison and exact temporary-branch cleanup |
| Native Neon PITR evidence v2 | PASS | 136 public tables compared; SHA-256 content parity; zero content mismatches; RLS/FORCE-RLS parity passed with the explicit PostGIS `spatial_ref_sys` exception |
| Production promotion and public-domain smoke | PASS | Candidate promoted to `dpl_G7r6CDntYarpafuawie8CKWDLBB7`; public domain resolved to the exact production source commit; tested endpoints returned HTTP 200 |

**Evidence boundary:** the 67 signed routes, 358 route probes and 3 authenticated flows are bound to candidate deployment `dpl_FgDTqKJxCDw3SAGLtgPxqfQHGu7v`, not a second independent 67/358/3 probe against the final promoted deployment ID. The final promoted deployment passed its staged runtime/release gates, smoke tests and public-domain exact-commit verification. Do not describe the 358 route probes as 358 authenticated happy-path workflows: the authenticated business-flow scope is the three named flows.

The release workflow qualified production isolation as `CERTIFIED` for its bound release evidence. This is an internal, scope-specific engineering certificate; it is not an independent ISO 27001, SOC 2, PCI DSS or third-party penetration-test certification. No RPO/RTO commitment is established by the recovery drill.

## 3. Current database trust-boundary evidence

Direct read-only inspection of Neon Production on 2026-11-22 confirmed:
- Primary branch: `br-proud-salad-bcshhdap`; database: `opscore_acceptance`.
- Latest migration: `071_signed_rls_context_all_access_modes.sql`.
- `opscore_current_tenant()`, `opscore_current_user()` and `opscore_access_mode()` resolve through the HMAC-verified context function; no raw identity GUC fallback remains in these accessors.
- Production policy scan found zero policies directly consuming raw tenant/user/access-mode GUC values.
- 136 public ordinary tables; 135 have RLS and FORCE RLS. `spatial_ref_sys` is the explicit PostGIS metadata exception.
- `opscore_runtime` is non-superuser, `NOBYPASSRLS` and `NOINHERIT`.

A transaction-local probe as `opscore_runtime` set forged `app.tenant_id`, `app.user_id` and `app.access_mode` values. Effective tenant/user returned NULL, access mode returned an empty value, and visible rows in `activity_log` and `sessions` were both zero. No persistent data was changed. Issues #348, #349, #350 and #363 were closed with the exact supporting run/database evidence and scope caveats.

## 4. Current operational limits — seller-owned

### Neon
- Plan at preflight: Free.
- Production branch protection is currently `protected=false`.
- Automatic snapshot schedule is empty.
- One manual snapshot is listed: `snap-aged-thunder-bcsxc1a5`.
- Neon rejected enabling a schedule because backup scheduling is not enabled for this project; rejected protecting the Production branch under the current protected-branch plan limit; and rejected an additional manual snapshot because the snapshot limit was exceeded.

No retained branch or snapshot was deleted. The successful full-data recovery/PITR drill does not replace scheduled backups, retention guarantees or a defined RPO/RTO.

### Vercel edge firewall
- Plan at preflight: Hobby.
- Firewall is enabled.
- A custom POST login/mobile-login rate limit is active at 60 requests per source IP per 60-second window.
- Generic attack, RCE, SQLi, XSS and bot-protection rules are active in `log` mode, not deny/challenge mode.
- An attempt to enable OWASP CRS enforcement was rejected by Vercel with `payment_required`; no firewall policy was changed.

Before offering an operational SLA, select an eligible plan, rehearse the stricter rules in Preview, inspect false positives, and enable the appropriate enforcement deliberately.

## 5. Buyer package and legal rights — HOLD

The latest public commercial source package is a draft from an older source commit; it is not the exact current `main`/Production deliverable. The secure-release workflow has not yet generated a signed archive, SBOM, Sigstore bundle and release statement for current `main` SHA `4b8a532`. The deployment workflow's internal release-evidence fingerprint is not a replacement for the buyer-downloadable secure-release archive.

**No license grant exists.** The repository, sales kit, deployment, test evidence, SBOM or signed archive does not convey a right to install, use, modify, host, redistribute, resell or sublicense. The rights holder and named buyer must execute a License Schedule pinning the exact deliverable SHA-256 and stating the permitted rights before any such grant or delivery.

## 6. Buyer-specific and product residuals

| Item | Current status |
|---|---|
| Android/iOS native signed binaries, store accounts and publication | Not produced; source/contract checks are not native build or store acceptance |
| Contact Center locale inventory | 105 locales currently selectable in runtime: 1 English source, 100 machine-assisted drafts, 4 English fallbacks |
| Language qualification register | 114 source rows; 9 locale codes are withdrawn from runtime pending remediation: `ms, sw, hy, uz, my, ml, es, sr, te` |
| Native-speaker review / production language qualification | 0/114 / 0/114 |
| Maps/road-routing provider | No buyer/provider license, credentials, attribution, quotas or live acceptance evidence |
| External identity, messaging, telephony and payment providers | Buyer/provider accounts, credentials, contracts and live acceptance remain environment-specific |
| Buyer installation / migration / RLS / restore acceptance | Must be performed against the buyer's own environment |

The 114-row qualification register is **not** proof of 114 runtime-selectable languages. The runtime presently exposes 105. Do not label the nine withdrawn locales supported or production-qualified until their translation files and semantic defects are remediated and the 114-entry selector/catalogue contract is tested. Machine-assisted drafts and English fallbacks must remain visibly identified; no native-speaker approval is claimed.

## 7. Remaining steps to full commercial handoff

1. Dispatch the protected `vercel-deploy` Production release on current `main` to publish the refreshed evidence page and rebind release evidence to the new exact source head.
2. Run `OpsCore secure release` on the same exact `main` SHA; verify the ZIP, SHA-256 sidecar, SBOM, Sigstore bundle, signer identity, tamper rejection, audits and release statement. Do not substitute the older draft package.
3. Upgrade Neon to a plan that supports production branch protection and scheduled backups; configure retention; capture a backup; and execute a documented restore drill before defining RPO/RTO.
4. Upgrade/enable Vercel OWASP CRS as required; move from log-only to staged deny/challenge after representative Preview rehearsal and false-positive review.
5. Reconcile 114 source locale rows with the 105 runtime selectable locale catalogue; restore withdrawn locales only after translation defects are fixed and tests confirm safe selector behavior. Native review remains separate.
6. Produce buyer-specific signed mobile binaries/device/store evidence, obtain map/provider licenses and credentials, and complete buyer-environment acceptance.
7. Execute the buyer-specific License Schedule before granting use or distribution rights.

## 8. Non-claims

This status does not claim that every product route received an authenticated happy-path test, all sectors and provider integrations are accepted, 114 languages are production-qualified, Android/iOS store binaries are signed, scheduled backups are configured, RPO/RTO commitments are met, or third-party security certifications have been issued.
