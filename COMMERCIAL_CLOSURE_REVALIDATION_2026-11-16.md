# OpsCore Platform — Commercial Closure Live Revalidation

**As-of date:** 2026-11-16  
**Repository:** `mosamiryamany-hub/opscore-platform`  
**Current decision:** `HOLD — NOT APPROVED FOR SALE OR DISTRIBUTION`  
**Scope:** Read-only verification of GitHub, Neon, Vercel, current release workflow, and commercial-rights records. This document does not authorize production changes or grant a license.

## Executive result

The latest Vercel Production deployment is `READY` and is bound to the currently observed `main` SHA. This is a deployment fact, not proof that all release, security, recovery, and buyer-acceptance gates are closed.

The current release workflow on `main` has two material evidence defects:
1. The Production acceptance artifact explicitly records `productionIsolationCertification=false`.
2. The legacy Production session-isolation collector reports a cross-tenant write denial as a constant PASS rather than performing that write-denial probe. The legacy recovery collector falls back across database names and the observed run selected `opscore_http_acceptance`, not the required application database `opscore_acceptance`.

The same run later printed `ISOLATION_CERT CERTIFIED` by evaluating legacy v1 evidence. That computed label must not be treated as a valid Production certification because the evidence does not prove the required application-database identity or complete signed-session coverage.

## Exact source and deployment identities

| Item | Observed value |
|---|---|
| GitHub `main` | `4017497068defa9c1d0761fcb07bc746925e002a` |
| Commit time | `2026-11-16T07:58:52Z` |
| Latest Production Vercel deployment | `dpl_Hy9ymDff1oChGpBAxmAjr4cfwyyG` |
| Deployment state | `READY` |
| Deployment Git SHA | `4017497068defa9c1d0761fcb07bc746925e002a` |
| GitHub deployment/acceptance run | `43827648670` |
| Production acceptance SHA-256 | `b9527dc76101886f83a1c5630d6b1488e33706b909728f62f56d673356c4bfa6` |
| Package fingerprint SHA-256 | `dea02a40c556fee6abfc84c372fb153009317867593bf9dafe8f21e171b02880` |
| Neon project | `summer-leaf-18448271` |
| Neon Production branch | `br-proud-salad-bcshhdap` |
| Neon Preview branch | `br-fragrant-king-bcr9928f` |
| Application database expected by the hardened PR | `opscore_acceptance` |

The Production deployment is tied to the same commit as `main`. No claim is made here that the deployment is commercially releasable.

## GitHub workflow and pull-request state

- `main` required checks observed in the previous live repository protection record: `verify`, `vercel-contract-verify`, and `isolated-postgres-rls-and-http-acceptance`. The current connector did not expose a fresh branch-protection/ruleset read in this run; the detailed live protection policy is therefore **not re-certified by this document**.
- PR #160 is open and Draft at head `67ce5083b2bc2faee8580f3d0860cdfeca40b964`. Its reported CI jobs passed; its deployment jobs were skipped on the pull-request event. Its purpose includes replacing the one-off Production 068 apply workflow with a read-only verifier and tightening Preview migration targeting.
- PR #161 is open and Draft at head `a253c3d8880de3a1b6fb29d6467ed56c878ee80c`. Its reported CI jobs passed; its deployment job was skipped on the pull-request event. Its purpose includes fail-closed evidence publication, exact Production database/branch identity checks, and removal of automatic recovery-branch deletion.
- PR #160 and PR #161 both change `.github/workflows/vercel-deploy.yml`; they must be reviewed together for overlapping workflow changes before either is merged.
- No independent human reviews were present on PR #160 or PR #161 at the time of inspection. No approval or merge is implied.

### Safety defect on the current `main` recovery workflow

The current Production recovery collector contains prefix-based deletion of existing Neon branches to make room for a new recovery branch. Run `43827648670` recorded the actual deletion of `br-blue-wind-bcgtxmmt` (name `opscore-prod-recovery-20261116t075640`). This was not performed by this revalidation.

PR #161 removes that deletion behavior and fails closed when branch capacity is exhausted. The PR remains Draft and unmerged, so the safer behavior is **not yet active on `main`**.

## Production tenant-isolation evidence

The current-run Production acceptance artifact in run `43827648670` reports:
- `status=PASS`
- `sourceCommit=4017497068defa9c1d0761fcb07bc746925e002a`
- `pipelineId=43827648670`
- `productionIsolationCertification=false`

The legacy session collector ran dual-login, own-tenant asset operations, cross-tenant asset read denial, unauthenticated denial, and cleanup checks. However, its current `main` source assigns `checks.crossTenantWriteDenied = 'PASS'` without performing the cross-tenant write-denial test. That field cannot be accepted as behavioral evidence.

The legacy recovery collector uses database-name fallback logic. In run `43827648670`, it failed to connect to `opscore`, `neondb`, and `opscore_production`, then selected `opscore_http_acceptance`. This does not prove recovery of the application database `opscore_acceptance`.

The hardened collectors in PR #161 require an explicitly configured database and verify Neon project, branch, endpoint, database, and role identity. They also avoid deleting existing recovery branches. Those changes have not been merged or run against Production.

The required `SIGNED_TENANT_CONTEXT_PRODUCTION_COVERAGE.json` and approved `SIGNED_TENANT_CONTEXT_ROUTE_MANIFEST.json` were not found at their expected paths on the inspected PR #161 branch. The release-proof code requires 67 unique, commit-bound and pipeline-bound route results. The generic CI route acceptance of 358 API routes is not equivalent to this signed tenant-context proof. The required 67-route Production coverage is therefore **NOT VERIFIED**.

Production Vercel environment-variable metadata shows signed tenant-context key/feature variables targeted at Preview, not Production. Variable values were not decrypted or displayed.

**Decision:** Do not accept the legacy `CERTIFIED` log line as a complete Production tenant-isolation certificate. Do not activate signed-session Production gates or apply signed-context migrations to Production without the full, exact-commit proof and independent review.

## Neon migration and role state

Observed project: `summer-leaf-18448271`.

- Preview branch `br-fragrant-king-bcr9928f` is Ready, non-primary, non-default, and unprotected.
- Production branch `br-proud-salad-bcshhdap` is Ready, primary/default, and reports `protected=false`.
- Preview ledger contains migrations 063–068, including 068 applied at `2026-11-15T23:26:31.261Z`.
- Production ledger query found 068 applied at `2026-11-16T07:37:58.009Z`; migrations 063–067 were not present in that Production ledger query.
- The 068 checksum matches in both environments: `15f41e628bba840c36fc97a479726803d6010840d85c441356d9fb1c3c94daf1`.
- Preview has no `opscore_app` login role. `opscore_app_clean_probe` exists as `NOLOGIN`, `NOSUPERUSER`, and `NOBYPASSRLS`.
- Production role inventory includes `opscore_runtime` and `opscore_app_least`, both non-superuser and `NOBYPASSRLS`; `opscore_auth_definer` is `NOLOGIN` but has `BYPASSRLS` and still needs independent function/grant audit.
- No role was created, changed, or deleted.

Project network settings observed: empty IP allow-list, `protected_branches_only=false`, and `block_public_connections=false`. These settings are not evidence of an observed breach, but they remain open hardening items.

## Neon branch capacity and recovery

- The project has 10 branches, matching the observed 10-branch capacity reported by the open hardening PR.
- The Production automatic snapshot schedule is empty: `schedule=[]`.
- One manual snapshot was listed: `snap-spring-snow-bc1jiqqs`, created `2026-11-15T09:30:48Z`, expiring `2026-12-15T23:59:59Z`.
- Project history retention is 21,600 seconds (6 hours).

A manual snapshot and a branch-clone row-count comparison do not establish scheduled backups, native PITR availability for a required retention window, a complete restore drill, or measured RPO/RTO. No snapshot schedule was changed and no restore was attempted.

### Supplemental read-only comparison of an existing recovery branch

A read-only comparison was performed against an already-existing Neon branch, without creating or deleting any branch:

| Item | Production | Existing recovery branch |
|---|---|---|
| Branch ID | `br-proud-salad-bcshhdap` | `br-icy-mountain-bc0gzsc7` |
| Database | `opscore_acceptance` | `opscore_acceptance` |
| Current LSN at query time | `0/9E6ECD0` | `0/9BC32E8` |
| Recovery branch parent | — | Production branch `br-proud-salad-bcshhdap` |
| Recovery branch creation | — | `2026-11-16T08:01:17Z` |
| Parent timestamp recorded by Neon | — | `2026-11-16T08:00:48Z` |

The following nine core tables had matching row counts and matching ordered-content MD5 digests between Production and the existing recovery branch: `organizations`, `users`, `memberships`, `sessions`, `assets`, `sites`, `work_orders`, `customers`, and `asset_events`. The non-empty tables had these matching digests:
- `organizations`: 2 rows, `8cd536d737882f61ddf9998eb510d167`
- `users`: 2 rows, `3db472c866333ece3a36d5ce990a5054`
- `memberships`: 2 rows, `ac736b25249ac6aae2a70e44dd432855`

All six remaining comparisons were empty on both branches and therefore produced the same empty-set digest. This is a **partial read-only data-consistency check on nine named tables**, not a full database restore drill, not proof that every table or large object matches, and not an exact same-LSN recovery point. The differing current LSNs explicitly prevent claiming a full point-in-time match. No new branch, snapshot, migration, or database write was performed.

### Neon plan and backup-schedule constraint

The live project owner is on Neon `free_v3` / Free, with `history_retention_seconds=21600` (6 hours) and a 10-branch limit. Neon API documentation states automatic snapshot schedules require a paid plan; current Neon documentation caps Free history at 6 hours and Launch history at up to 7 days. Therefore a 7-day PITR target and automatic snapshot schedule require a paid-plan decision and cannot be enabled on the observed Free subscription in this pass. See [Neon snapshot schedule API](https://api-docs.neon.tech/reference/setsnapshotschedule) and [Neon history window documentation](https://neon.com/docs/postgres/backup-restore/history-window).

## Vercel deployment and Firewall

- Vercel project: `opscore-platform`, project ID `prj_8jMqBt0l6OALicWSwQ3ECQTn8yPe`.
- Team plan observed through linked deployment context: `Hobby`. Commercial plan suitability needs owner/billing review.
- Latest Production deployment: `dpl_Hy9ymDff1oChGpBAxmAjr4cfwyyG`, state `READY`, source SHA equals `main`.
- Verified Production domain: `opscore-platform.vercel.app`.
- The active Firewall config is version 3, ID `waf_RIcQA8GLAH4s`, enabled.
- Active Generic, RCE, SQLi, XSS, and Bot Protection rulesets use `log`, not `deny`/block.
- The login observation rule `rule_ops_core_auth_endpoint_rate_limit_observation_Q1ONsO` is configured as rate-limit with exceed action `log`; it does not prove an effective blocking rate limit.
- The protected release verification endpoint returned `login_required` to the unauthenticated fetch. No bypass, SSO, domain, deployment, or Firewall configuration was changed.

## Additional read-only Production SQL security audit

Target: Neon project `summer-leaf-18448271`, Production branch `br-proud-salad-bcshhdap`, database `opscore_acceptance`.

- `public` contains 135 non-partitioned base tables; 134 have both RLS and FORCE RLS. The only exception is `public.spatial_ref_sys`.
- Eleven `SECURITY DEFINER` functions were found in `public`; all eleven are owned by `neondb_owner`. None is owned by `opscore_auth_definer`.
- `opscore_auth_definer` is `NOLOGIN`, `NOBYPASSRLS=false` in role attributes (it has `BYPASSRLS=true`), and owns zero `SECURITY DEFINER` functions in this database. It has six explicit table-grant rows across five public relations, limited to SELECT/DELETE in the queried inventory.
- The eleven definer functions grant EXECUTE to `opscore_runtime`; none grants EXECUTE to PUBLIC. Their configured search path is `pg_catalog, public, pg_temp`. Both `opscore_runtime` and `opscore_app_least` have USAGE but not CREATE on `public`.
- Two of the eleven functions set `row_security=off`: `opscore_attest_migration_056` and `opscore_create_password_reset_token`. Their source and caller/tenant checks need independent review; this query is not a proof of their complete call-path safety.
- `opscore_runtime` has table-grant metadata for 136 public relations and CRUD privileges (522 grant rows). `opscore_app_least` has CRUD grant metadata for 134 public relations (536 grant rows). The role name `opscore_app_least` therefore does not, by itself, demonstrate least-privilege relation grants. Its actual production use and connection history must be established before any revoke/disable action.
- A sample restrictive policy on `public.appointments` still references `current_setting('app.tenant_id', true)`; the general tenant-boundary guard also exists. This is not proof of an exploit, but it reinforces that the full signed-session route cutover must be independently proven rather than inferred from the presence of RLS.
- `neondb_owner` is a login-capable BYPASSRLS role with database CREATE privilege. Its ownership of all eleven definer functions is a material privilege-concentration concern.

**Decision:** this is a security-hardening gate, not a verified incident. Do not transfer function ownership, revoke relation grants, alter `opscore_app_least`, or change any Production role in this closeout pass. A dedicated definer-owner migration must first be designed and tested on an isolated PostgreSQL 18 database, with exact EXECUTE/underlying table privileges and call-path tests, then independently reviewed before any Preview rollout. Production remains untouched.

## Commercial and buyer gates

The repository's `COMMERCIAL_CLOSURE_STATUS.md` and `NO_LICENSE_GRANT_NOTICE.txt` continue to state:
- No commercial license has been granted.
- Sale, distribution, resale, sublicensing, hosting, and source delivery are not authorized.
- A future grant requires a separate written agreement approved and signed by the rights holder.

Buyer residuals still include signed Android/iOS store artifacts and buyer-specific signing, physical-device QA, native-speaker/domain translation review, licensed maps and routing, buyer provider credentials/contracts, and buyer-environment installation and acceptance.

No technical action can substitute for the required signed rights agreement or buyer approvals.

## Gate ledger

| Gate | Status | Evidence / blocking condition |
|---|---|---|
| Main SHA and latest Production deployment alignment | CONFIRMED | SHA `4017497068defa9c1d0761fcb07bc746925e002a` |
| Current Production acceptance artifact | INCOMPLETE | `productionIsolationCertification=false` |
| Production dual-tenant behavior | INCOMPLETE | Legacy cross-tenant write result is hard-coded PASS |
| Correct Production recovery database | NOT VERIFIED | Current legacy run chose `opscore_http_acceptance` |
| Signed tenant-context 67-route Production coverage | NOT VERIFIED | Required route evidence/manifest missing; signed variables Preview-only |
| Safe recovery-branch capacity handling on main | INCOMPLETE | Main auto-deletes prior recovery branches; PR #161 unmerged |
| Migration 068 | CONFIRMED | Matching checksum on Preview and Production |
| Automatic snapshot schedule / PITR / RPO / RTO | INCOMPLETE | Empty schedule; manual snapshot only; no measured RPO/RTO |
| WAF blocking enforcement | INCOMPLETE | Active managed rulesets and login rule use log actions |
| Commercial rights grant | BLOCKED | No signed rights-holder agreement |
| Buyer acceptance and native artifacts | INCOMPLETE | Store, translation, maps, provider, and buyer-environment gates open |

## Prohibited claims until gates close

Do not claim:
- full Production tenant-isolation certification based on CI or the legacy `CERTIFIED` log line;
- verified PITR, automatic snapshot scheduling, or measured RPO/RTO based on the manual snapshot;
- active WAF blocking when rules are configured to log;
- commercial license, sale, distribution, resale, or buyer delivery authorization;
- buyer-environment certification.

**Final status: HOLD — NOT APPROVED FOR SALE OR DISTRIBUTION.**


## Execution follow-up — 2026-11-16

### Existing recovery branch — exact database comparison

The existing branch `br-icy-mountain-bc0gzsc7` was queried without creating or deleting any branch. In `opscore_acceptance`, these nine core tables matched Production by row count and ordered-content digest:
- organizations: 2 / `8cd536d737882f61ddf9998eb510d167`
- users: 2 / `3db472c866333ece3a36d5ce990a5054`
- memberships: 2 / `ac736b25249ac6aae2a70e44dd432855`
- sessions, assets, sites, work_orders, customers, asset_events: zero rows on both sides.

Production branch `br-proud-salad-bcshhdap` reported LSN `0/9E6ECD0`; recovery branch reported `0/9BC32E8`. These are matching core-table contents at different LSNs, not a full restore certification or a measured RPO.

### Production branch-protection attempt

A request to set `protected=true` on the verified Production branch `br-proud-salad-bcshhdap` was rejected by Neon with HTTP 422: “You have reached the maximum number of protected branches for your current plan.” The branch list currently contains 10 branches and 0 marked protected. No other branch was unprotected or deleted to work around this plan restriction. Enabling Production branch protection is therefore **BLOCKED by plan entitlement**.

### Integrated hardening PR

PR #163 was opened from `hardening/integrated-commercial-gates-20261116` against `main`. It consolidates the Preview exact-target migration workflow, replaces the Production 068 applier with a read-only verifier, removes the standalone Preview 068 applier, adds workflow contract tests, and places a new explicit gate on the Production deploy job:

`vars.OPSC_PRODUCTION_AUTODEPLOY_ENABLED == 'true'`

This variable has not been set. The new branch therefore keeps Production evidence probes, environment mutation, builds, and promotion disabled by default after a merge. CI is still required before considering the PR mergeable. Its intended Production deploy job was skipped on the PR workflow event.

### CI repair trail

The first integrated CI run exposed:
- one floating `actions/upload-artifact@v4` reference, pinned to immutable commit `cf430e030ddbb5b0abf93d22962f4752f3646cd9`;
- over-escaped JavaScript regular expressions in the new deploy-gate test, corrected;
- an old `ci-release-hardening.test.js` assertion that still expected the former unguarded Production deploy condition, updated to assert the explicit owner flag.

Later CI attempt is running against commit `fd01c638566268de0b0ac2101ef775c04ec52c44`; record its final result from GitHub Actions before merge. The isolated PostgreSQL acceptance job passed on earlier integrated attempts; the latest result must be taken from the exact final PR head, not copied forward from an earlier SHA.

**No Production deployment, database write, role/grant change, migration, WAF change, snapshot schedule change, or branch deletion was performed during this follow-up.**
