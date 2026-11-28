# OpsCore Source Baseline Audit

**Audit date:** 2026-11-28  
**Audit phase:** 0 — Source Baseline only  
**Repository:** `mosamiryamany-hub/opscore-platform`  
**Baseline branch:** `main`  
**Baseline commit:** `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187`  
**Audit branch:** `audit/source-baseline-2026-11-28`  
**Change scope:** Documentation only; no application, migration, workflow, environment, database, deployment, or production changes.

## 1. Executive disposition

**Phase 0 status: BASELINE IDENTIFIED — SOURCE REVIEW PARTIALLY COMPLETE.**

The repository and exact main commit were reachable and inspected. The audit branch was created from the exact main SHA above. This report is committed only on that independent branch.

No source-code change is justified by the evidence collected in this phase. Do not merge this audit branch. Do not begin Phase 1 until this source baseline is reviewed and accepted.

## 2. Repository and Git evidence

| Item | Observed result |
|---|---|
| Repository | `mosamiryamany-hub/opscore-platform` |
| Visibility | Public |
| Default branch | `main` |
| Main protection | GitHub branch endpoint reports `protected: true` |
| Main SHA | `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187` |
| Repository size | 6,028 KB (GitHub repository metadata) |
| Branch count | 487 (all search pages exhausted) |
| Open pull requests | 15 |
| Recursive Git tree entries | 1,010; tree response was not truncated |
| Main latest commit | `fix(release): verify canonical production domain` |
| Latest main commit changed paths | `.github/workflows/vercel-deploy.yml` only |

The main branch was not modified. No pull request was merged or changed by this audit.

### 2.1 Relevant open pull requests observed

The following open work is relevant to the present source baseline. Their existence is not evidence of acceptance or merge readiness.

| PR | Title / scope | State at audit |
|---|---|---|
| #513 | CRM migration sequence after GIS 073–075 | Open, draft; targets a test branch |
| #510 | GIS signed PostGIS / Dispatcher Map / million-row validation | Open, draft; validation-only |
| #509 / #508 / #505 / #503 | Stacked Dispatcher Map and GIS implementation/acceptance | Open, draft |
| #499 / #498 | Digital Twin browser acceptance and command room | Open, draft |
| #497 | Buyer delivery, branding and encrypted backups | Open |
| #496 | Self-hosted PWA, dispatcher map and Android preview pipeline | Open |
| #495 | UI accessibility and design primitives | Open |
| #494 / #493 | Contact Center CRM and operations workspaces | Open |
| #491 | Live PostgreSQL acceptance on disposable Neon branch | Open |
| #490 | Keycloak multi-provider sign-in | Open |

Several open PRs targeting `main` still record base SHA `3cc84f92ee6dd30730d4e96cabf3f9853ffdd7dd`, while current main is three commits ahead at `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187`. Their diffs and required checks must be re-evaluated against the current main tip before review or merge.

PR #514 (`integration/gis-crm-feature-stack-20261128`) is closed without merging. Its recorded disposition says the integrated GIS + Digital Twin + Contact Center CRM stack is already on main and that the remaining candidate delta would remove a spatial fixture seed needed by candidate-mode map acceptance. Do not re-merge that branch or recreate its changes without a fresh comparison.

## 3. Source inventory

| Area | Observed inventory |
|---|---:|
| Recursive Git tree entries | 1,010 |
| PostgreSQL migration source files | 75 |
| Backend Node test files matching `backend/test/*.test.js` | 193 |
| Mobile test/spec files matching the inspected filename pattern | 2 |
| GitHub workflow files | 38 |

These are source-tree counts, not counts of passing test cases or proof of runtime completeness.

### 3.1 Runtime and package metadata

- Root package version: `0.11.62`.
- Backend package version: `0.11.62`.
- Mobile package version: `0.1.16`.
- Root and backend Node engine constraints: `>=22.23.4 <23`.
- Root `.nvmrc`: `22.23.4`.
- Backend Dockerfile base: `node:22.23.4-bookworm-slim`.
- Mobile package currently declares Expo `^58.0.26`, React Native `0.88.1`, React `19.3.1`.
- All three inspected npm lockfiles use lockfile format version 3.
- The root lockfile's committed dependency-audit snapshot reports 14 dependencies and zero vulnerabilities, but the snapshot has no freshness timestamp and is not treated as a current security attestation.
- Current-head CI's successful verification job runs the backend production dependency audit (`npm audit --omit=dev --audit-level=high`) and the mobile dependency audit gate. The overall current-head verify job passed; this is the current CI evidence, not a substitute for an independent license inventory or buyer-environment scan.

Node 26 is not the repository's current supported runtime. Any runtime upgrade is a Phase 2 compatibility decision and must not be inferred from the research recommendation alone.

## 4. Database migration source inventory

- The source tree contains 75 migration files under `backend/sql/postgres`.
- The highest migration number currently present is 076:
  - `073_digital_twin_snapshot_rls.sql`
  - `074_tenant_scoped_postgis_spatial_features.sql`
  - `075_signed_rls_spatial_viewport_query.sql`
  - `076_contact_center_crm_customer_link.sql`
- The migration parser explicitly accepts a numeric suffix, and the source includes `031b_sessions_organization_id.sql`.
- The migration preflight source explicitly reserves historical gaps 006–008. Tree inspection found no other missing numeric migration IDs between the first and latest migration numbers and no duplicate migration identifiers under the parser's number-plus-suffix scheme.
- The migration planner contains explicit legacy filename/checksum reconciliation rules, including catalog-equivalence verifiers. These exceptions are security-sensitive migration logic and require target-ledger/catalog evidence; source inspection does not prove that any live database ledger matches.
- The full migration ledger gate reads the live `public.schema_migrations` table and compares filenames and SHA-256 digests. It cannot be treated as executed merely because the script exists.

**Not established in Phase 0:** successful application of all 75 migrations to a clean PostgreSQL/PostGIS database, live ledger parity, live FK/composite-FK catalog coverage, RLS/Force RLS catalog coverage, or tenant isolation on a current production database.

## 5. Self-hosted source footprint

Observed source files include:

- `backend/docker/Dockerfile` — application image definition using Node 22.23.4.
- `backend/docker-compose.postgres.yml` — a PostgreSQL service definition with a persistent volume and health check.
- `backend/docker/postgres-init/10-opscore-roles.sh` — database role initialization.
- `backend/.env.example` — environment template.

The only Compose file found in the recursive source tree is `backend/docker-compose.postgres.yml`, and it defines the database service only. No Caddyfile and no complete application + database + ingress self-hosted Compose stack were found in the inspected tree.

**Disposition:** self-hosted building blocks exist, but the source inventory does not establish a complete buyer-ready runtime, TLS ingress, resource limits, internal-only service networking, secret lifecycle, or an independently restorable deployment.

## 6. Current-head CI evidence

### 6.1 OpsCore CI on current main

- Workflow run: [46101901504](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/46101901504)
- Commit: `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187`
- Run conclusion: `success`.
- `verify`: `success`.
- `digital-twin-postgres-18-postgis-acceptance`: `skipped` because the workflow job is restricted to named pull-request branches.

### 6.2 Vercel workflow checks on current main

- Workflow run: [46101901507](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/46101901507)
- Commit: `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187`
- `vercel-source-verify`: `success`.
- `isolated-postgres-rls-and-http-acceptance`: `success`.
- `vercel-contract-verify`: `success`.
- Isolated Neon Preview migration/HTTP acceptance: `skipped`.
- Production Neon PITR historical branch probe: `skipped`.
- Deployment job: `skipped`.

### 6.3 CodeQL on current main

The current-head check-run list reports successful Actions, JavaScript/TypeScript, and Python analysis jobs.

### 6.4 Historical run — not current-head proof

Workflow run [46098652375](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/46098652375) ran on prior commit `fbc3e3acac557bd2c53486eee8813f9f318d7198`.

Its disposable PostgreSQL 18 RLS/HTTP acceptance, composite-FK gate, Digital Twin/PostGIS gates, logical restore drill, Neon Preview migration/HTTP acceptance, and read-only historical Neon PITR probe reported success. The overall deployment job nevertheless failed at the final public-domain-to-promoted-commit verification step; subsequent release-evidence persistence was skipped. The main commit `f68ec555...` changes the Vercel workflow to verify the canonical production domain, but the latest current-head workflow run skipped deployment and Neon Preview/PITR. Therefore, the historical successes must not be relabelled as fresh evidence for `f68ec555...`.

**CI conclusion:** current main has passing source and isolated PostgreSQL checks, with important current-head acceptance jobs skipped. CI success is not a live deployment, current production database, device, PITR, or buyer installation attestation.

## 7. Confirmed / Implemented / Recommended / Unresolved / Unverified

### Confirmed
- Repository identity, default branch, protected-main flag, current main SHA, branch count, open PR count, and recursive tree size.
- Source package versions and Node 22.23.4 engine constraints.
- 75 migration files through 076, 193 backend test files, 38 workflows.
- Current-head CI run and check conclusions listed above.
- Existing self-hosted Dockerfile and database-only Compose definition.

### Implemented in source
- PostgreSQL migration planner and migration ledger gate.
- Tenant composite-FK acceptance script.
- PostgreSQL/PostGIS, RLS, Digital Twin, GIS, Dispatcher Map and Contact Center source/tests/workflows.
- PWA service-worker shell and Android preview workflow.
- Database Dockerfile/Compose building blocks.

“Implemented in source” does not mean every function is accepted in a buyer environment.

### Recommended
- Keep current main SHA fixed as the Phase 0 comparison baseline.
- Reconcile every open PR against current main before accepting further stacked work.
- Keep the audit branch documentation-only until Phase 0 review is complete.
- Preserve the existing Node 22 runtime until a separate compatibility matrix and CI proof authorize a change.
- Treat migration checksum reconciliation as a privileged, evidence-gated exception.

### Unresolved
- Whether every open branch/PR has been reconciled against the latest main tree.
- Whether all migrations apply cleanly from an empty database and whether every legacy checksum exception has exact catalog-equivalence evidence on each target.
- Whether every tenant FK and composite FK is covered by live catalog evidence.
- Whether the full self-hosted runtime can be installed, upgraded, rolled back, and restored from a clean host.
- Whether current-head production deployment and production database identity are bound to this exact main commit.

### Unverified in Phase 0
- Neon project/branch/database state, Vercel project/deployment/domain state, environment variable bindings, secrets, firewall, and production database identity.
- Current production runtime behavior, current production RLS state, current production PITR/RPO/RTO.
- Physical Android/iOS device acceptance and signed store binaries.
- Live GIS scale measurements, current tenant-specific map rendering in production, object-storage durability, and external integrations.

These items are deliberately not inspected or claimed as closed in this Phase 0 report; infrastructure verification belongs to Phase 1 and subsequent acceptance gates.

## 8. Safe execution boundary and next gate

- Audit branch created from exact main SHA `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187`.
- This report is the only intended change in this branch.
- No main or production change was made.
- No migration, deployment, secret, environment, DNS, database, or provider setting was changed.
- Do not merge this branch.

**Phase 0 exit gate:** review this report, verify the listed counts and PR/branch dispositions, and approve the baseline. Only then proceed to Phase 1 Infrastructure Audit.

## 9. Open PR and branch-stack forensic review (2026-11-28)

The 15 open PRs were re-read from GitHub metadata and their file lists, head/base SHAs, mergeability states, and available check-runs were inspected. Comparisons below are against the fixed main SHA in this report. GitHub's `ahead_by` counts commits, not unique feature commits; stacked PRs intentionally contain ancestor commits from lower PRs.

### 9.1 Branch stack — critical interpretation

The PRs are not 15 independent change sets. Several are stacked:

```
main (old base 3cc84f9...)
└─ #496 (head 4da2e14...)
   └─ #498 (head fbc7a4c...)
      └─ #499 (head 5bd7493...)
         └─ #503 (head 9c7aa39...)
            └─ #505 (head fef5d72...)
               └─ #508 (head 075bcf5...)
                  └─ #509 (head d7b855c...)

#510 has the same head d7b855c but targets the old main base directly
#513 is stacked on #510 (head 1a0d4b6...)

main (old base 3cc84f9...)
├─ #493 (head dd48545...)
│  └─ #494 (head 9ea392b...)
├─ #497 (head ecdd1c5...)
├─ #495 (head ee22d72...)
├─ #490 (head e2150e8...)
#491 is another separate stack (head eec7e08...)
```

This explains why some PRs show large commit-ahead counts and why GitHub may say a PR is clean relative to its *stack parent* while it is not mergeable against current main. Do not merge a stack wholesale or treat each child PR as an independently mergeable candidate.

### 9.2 Per-PR disposition

| PR | Head SHA (short) | Base relationship / GitHub state | Review disposition |
|---|---|---|---|
| #513 | `1a0d4b6` | Based on #510; clean relative to its declared base | **Superseded migration file; review remaining test/workflow only.** Its 076 SQL file SHA is byte-identical to the already-present main file. Its migration acceptance and verify checks passed; Digital Twin PostGIS job skipped. |
| #510 | `d7b855c` | Old main base; dirty against its declared base/current integration | **Do not merge as-is.** Broad stacked GIS/Twin/PWA/mobile source bundle. Contains unsafe implicit fixed Neon Preview branch default; review the reusable workflow before any execution. |
| #509 | `d7b855c` | Child-stack view of the same #510 head; unstable | **Not an independent delta from #510.** Browser/GIS changes are already included in the larger stack. |
| #508 | `075bcf5` | Child of #505; clean relative to parent | **Stacked Dispatcher Map slice.** Browser and PWA checks passed on this head; PostGIS job skipped. Must be retested against current main. |
| #505 | `fef5d72` | Child of #503; clean relative to parent | **Stacked signed spatial-query slice.** Isolated PostgreSQL and verify passed; Neon Preview/PITR jobs skipped. SQL/RLS/security review still required. |
| #503 | `9c7aa39` | Child of #499; clean relative to parent | **Stacked PostGIS schema slice.** Isolated PostgreSQL and verify passed; Neon Preview/PITR skipped. |
| #499 | `5bd7493` | Child of #498; clean relative to parent | **Stacked browser/concurrency slice.** Twin browser, isolated PostgreSQL and verify passed; Neon Preview skipped. One read-only PITR check reported success on this head. |
| #498 | `fbc7a4c` | Child of #496; clean relative to parent | **Stacked Digital Twin slice.** Isolated PostgreSQL and verify passed; Neon Preview and PITR skipped. |
| #497 | `ecdd1c5` | Old main base; behind | **Self-hosted/buyer delivery candidate; stale against current main.** Verify and isolated PostgreSQL checks passed; Neon Preview/PITR skipped. Source tests do not establish a completed buyer install, encrypted backup restore, or key-rotation closure. |
| #496 | `4da2e14` | Old main base; dirty | **PWA/Dispatcher Map/Android preview candidate; merge conflicts.** Browser PWA and Android preview CI passed, but that is not physical-device acceptance or proof of a signed release APK. |
| #495 | `ee22d72` | Old main base; behind | **UI/accessibility candidate; stale.** Browser accessibility and verify checks passed; Neon Preview/PITR skipped. This is not device/browser acceptance across production environments. |
| #494 | `9ea392b` | Child of #493; clean relative to parent | **BLOCKED: migration number collision.** Adds `073_contact_center_crm_customer_link.sql`, while main already uses migration 073 for Digital Twin RLS. Its PostgreSQL migration test passed only on its own branch/schema fixture; it does not resolve the collision against current main. |
| #493 | `dd48545` | Old main base; dirty | **Control-room/contact-center UI stack parent.** Isolated PostgreSQL and verify passed; Neon Preview/PITR skipped. Must rebase/reconcile with current main before any further acceptance. |
| #491 | `eec7e08` | Separate stack; dirty | **CI Neon-branch provisioning candidate; not accepted.** Source/isolated DB checks passed, but Preview application job was skipped. Script hardcodes project and parent branch IDs and can create/delete Neon branches when invoked; execution against Neon was not established by this PR's checks. |
| #490 | `e2150e8` | Old main base; behind | **Keycloak/OIDC candidate; stale.** Contract/source/isolated DB/CodeQL checks passed; live Keycloak issuer, broker providers, callback, secrets, and end-to-end provisioned-user tests were not run. |

### 9.3 Proven migration collision and duplicate resolution

Two different CRM migration proposals were compared with the actual current-main migration files:

1. Main already contains `backend/sql/postgres/073_digital_twin_snapshot_rls.sql` (SHA `4795d9ef...`).
2. PR #494 adds `backend/sql/postgres/073_contact_center_crm_customer_link.sql` (different SHA `68b956ff...`), so accepting its migration sequence would create two distinct migration files with identifier 073. This is a hard blocker.
3. Main already contains `backend/sql/postgres/076_contact_center_crm_customer_link.sql` (SHA `502e61bb...`).
4. PR #513's proposed `076_contact_center_crm_customer_link.sql` has exactly the same Git blob SHA `502e61bb...` as main. It is not a new migration implementation and must not be re-applied or recreated.

PR #513's acceptance script is a useful candidate for isolated PostgreSQL 18 validation, but its check result is limited to a disposable `opscore_test` database and does not prove a full clean install of all migrations or production catalog parity.

### 9.4 Workflow target-safety finding in #510

The proposed reusable workflow defaults `INPUT_BRANCH` to a fixed Neon branch ID when the caller supplies no branch. The script also pins a Neon project ID, primary branch ID, endpoint hostname, Vercel project ID and Vercel team ID. It verifies the selected branch identity, parent, readiness, protected/default/primary flags, database name and TLS connection properties before running migrations.

The runtime identity checks are useful, but an implicit branch default makes target selection non-explicit and risks repeated runs against a persistent preview branch. The workflow should require an explicit branch input (and a clearly controlled, disposable branch lifecycle) before future use. This is a source-review finding only: no workflow was dispatched and no Neon/Vercel setting or database was changed by this audit.

### 9.5 Check-run evidence — important boundaries

- #510 head: source verification, CodeQL, isolated PostgreSQL/RLS, browser checks, PWA browser, Android preview, a Neon Preview migration run, and read-only historical PITR probe reported success in the recorded checks. One parallel Neon Preview job was cancelled. These checks are evidence for the historical PR head only, not current main.
- #513 head: CRM PostgreSQL 18 migration acceptance and verify passed; Digital Twin PostGIS acceptance skipped.
- #496 head: PWA browser and Android preview jobs passed. No real Android/iOS device acceptance is evidenced by those jobs.
- #495 head: browser accessibility job passed. This does not establish full real-world responsive/RTL acceptance.
- #497 head: isolated DB and verify passed; restore/recovery and buyer installation were not proven.
- #490 head: contract and source checks passed; no live Keycloak provider login was evidenced.
- #491 head: Preview provisioning/application job was skipped, so the branch-creation script was not demonstrated by that check set.
- Several earlier stack PRs (#498, #503, #505, #508) have Neon Preview and/or PITR checks skipped. Do not transfer the #510 head's results to these different SHAs.

### 9.6 Final branch/PR decision

**No PR is approved for merge from this audit.** In particular:

- Block #494's migration as numbered.
- Do not reintroduce #513's already-present 076 migration.
- Do not merge #510/#509 as a monolithic stack; split and revalidate the required unique deltas against current main.
- Do not merge #496/#497/#495/#490 until rebased/reconciled with current main and their outstanding gates are satisfied.
- Keep #491's Neon provisioning unexecuted until a separate explicit infrastructure authorization and target-lifecycle review.
- Preserve the #493/#494 control-room/contact-center stack for selective source review after migration sequencing is corrected.

## 10. Phase 0 exit decision after PR review

The source/branch forensic review is now substantially complete, but **Phase 0 remains OPEN** because the open PR stacks have not yet been reconciled at current main, and no candidate has been safely rebased, rebuilt and re-tested on an isolated branch. The correct next action within Phase 0 is to create a consolidated, current-main-based integration candidate containing only the required, non-conflicting deltas after explicit selection, then run source-level and isolated tests. Do not start Phase 1 or merge anything based only on the historical PR check results.


## 11. Exact PR-file reconciliation against current main (2026-11-28)

A second reconciliation pass compared the Git blob SHA for every path listed by each open PR against the same path in the fixed current-main tree. This is a content-identity comparison, not a merge-base or commit-count comparison. Main remained at `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187`; the main tree contained 1,010 entries and was not truncated. Each PR head tree was also non-truncated.

**Meaning of the classifications:**
- `identical-to-main`: exact Git blob SHA match; that path contributes no source delta to main even if it remains listed in the PR's diff against an older base.
- `differs-from-main`: file exists in both trees but its blob differs; content-level review is still required to decide whether the branch is newer, stale, or a regression.
- `new-vs-main`: file exists on the PR head but not in current main.
- No PR file in this pass was missing from its own head tree.

| PR | Paths in PR file list | Identical to main | Differ/new vs main | Exact disposition |
|---|---:|---:|---:|---|
| #513 | 3 | 3 | 0 | **No source delta against current main.** Its workflow, CRM acceptance script and migration 076 are all byte-identical to main. The PR is a no-op relative to current main, although its comment contains useful isolated Neon acceptance evidence. |
| #510 | 45 | 38 | 7 | Only seven listed paths differ: Digital Twin browser workflow, signed-tenant-context gate, Twin browser acceptance script, server.js, contact-center workbench test, control-rooms.html and rooms.js. All three GIS migrations 073–075 and the other listed GIS/PWA files are already byte-identical to main. |
| #509 | 9 | 8 | 1 | Only backend/src/server.js differs from main; the other eight listed paths are identical. Same head as #510, but its declared base makes it a different stacked diff view. |
| #508 | 6 | 4 | 2 | Unique content remains in twin-browser-acceptance.js and dispatcher-map.js. The GeoJSON test/module and map CSS/HTML are already identical to main. |
| #505 | 6 | 2 | 4 | The 075 migration and geofencing.js are identical to main. The Digital Twin PostgreSQL workflow, OpsCore CI workflow, signed tenant-context gate and server.js differ and require content review. |
| #503 | 3 | 2 | 1 | Migration 074 and postgres-live-rls-gate.js are identical to main. Only the OpsCore CI workflow differs. |
| #499 | 6 | 2 | 4 | The concurrency gate and Twin room JS are identical to main. Browser/PostgreSQL/CI workflows and twin-browser-acceptance.js differ. |
| #498 | 19 | 10 | 9 | Migration 073, platform-intelligence-layer.js, Twin contract tests, GeoMap test, service-worker test, architecture documents and several UI files are identical. Nine paths differ: Twin PostgreSQL/CI workflows, concurrency gate, geofencing, contact-center workbench test, PostgreSQL HTTP acceptance test, control-rooms.html, digital-twin-room.js and rooms.js. |
| #497 | 25 | 0 | 25 | All 25 listed paths differ from or are new to main. This is a substantive self-hosted/buyer-delivery candidate, not a no-op. It needs isolated review and tests; its presence does not prove restore or buyer install. |
| #496 | 17 | 10 | 7 | PWA workflow, PWA audit script, control-plane page, icon, manifest, offline page, PWA registration, service worker and self-hosted docs are identical. Seven paths differ: Android preview workflow, server.js, control-rooms.html, Dispatcher Map CSS/HTML/JS and index.html. |
| #495 | 19 | 0 | 19 | All 19 listed UI/accessibility/design paths differ from or are new to main. This is a substantive UI candidate and requires visual/browser review against current main. |
| #494 | 19 | 14 | 5 | Most CRM application files and tests are identical. Five paths differ: CRM acceptance workflow, CRM acceptance script, the conflicting new migration 073, server.js and CRM/supervisor API contract. The migration-number collision remains a hard blocker. |
| #493 | 14 | 6 | 8 | Six contact-center/control-room paths are identical. Eight paths differ: server.js, workbench and workspace tests, contact-center-room CSS/HTML/JS, control-rooms.html and rooms.js. |
| #491 | 12 | 0 | 12 | All 12 listed Neon acceptance/provisioning paths differ from or are new to main. This remains an infrastructure-mutating candidate and must not be executed without explicit disposable-target authorization. |
| #490 | 5 | 0 | 5 | All five Keycloak/OIDC paths differ from or are new to main. The candidate is substantive, but live issuer/provider/callback E2E is still unverified. |

### 11.1 Reconciliation conclusions

1. **#513 is fully redundant as a code PR against current main.** All three PR-listed files have exact blob matches in main. Do not merge it to obtain migration 076 or its acceptance script. Preserve the PR's isolated Neon evidence separately from its source delta.
2. **The GIS migration sequence 073–076 is already present in current main.** PR #510/#509/#508/#505/#503 do not contribute new copies of those migrations: the listed 073, 074 and 075 files match main exactly. The migration 076 file in #513 also matches main exactly. Do not cherry-pick or recreate any of these migration files.
3. **The GIS/Digital Twin stack is not wholly redundant.** It still contains unique test/workflow/runtime deltas. They are concentrated in the paths identified above and must be reviewed individually; the large PR stacks should not be merged as a unit.
4. **#494 remains blocked even though most application files match main.** Its unique migration 073 is a different migration from main's 073. Its workflow/script/docs/server deltas can be reviewed independently only after the migration conflict is removed or correctly re-sequenced. Do not accept the conflicting 073 file.
5. **#497, #495, #491 and #490 are substantive independent candidates.** They require focused security/behavior review and isolated tests; no source changes from them were applied during this reconciliation.
6. **#496 is partly superseded.** Its PWA scaffolding and audit script are already identical to main; only the listed Android workflow and map/UI paths remain as deltas.
7. **A differing blob is not automatically an improvement.** A file can differ because a PR head is stale relative to later main commits. Each differing path still requires patch-level review before selective application.

### 11.2 Current execution boundary

This reconciliation changed only this audit report on `audit/source-baseline-2026-11-28`. No source, migration, workflow, package manifest, lockfile, secret, environment, Neon, Vercel, DNS, deployment, database or main-branch content was modified. No PR was merged, closed, rebased, force-pushed or dispatched.

**Phase 0 remains OPEN.** The next safe action is patch-level review of only the differing/new paths, followed by separate current-main-based candidate branches for independently testable slices. No broad stacked cherry-pick is authorized by this evidence. Candidate branches must run current-main verification and the relevant isolated acceptance gates before Phase 0 can close.


### 11.3 Patch-level risk findings from the unique deltas

The unique paths were not accepted automatically. Focused patch inspection found these additional constraints:

- **PR #510 — implicit Neon target:** `.github/workflows/apply-preview-migrations.yml` changes the caller's empty branch input into the hard-coded branch `br-muddy-pine-bbrexgxx` and defaults the database name to `opscore_acceptance`. This is not an explicit disposable target supplied by the operator. The workflow must require an explicit branch and verify its disposable lifecycle before any future dispatch. No workflow was dispatched.
- **PR #510 — browser evidence scope:** `twin-browser-acceptance.js` deliberately runs against a static file server and asserts that `/api/v1/me` returns 404; it checks page loading, responsive widths, RTL toggling and disabled controls. This is useful static layout acceptance, but it is not authenticated browser acceptance, live API acceptance, or real-device acceptance. Its report boundary says so.
- **PR #510 — spatial scale:** the unique signed-tenant spatial proof seeds 40,000 rows per tenant (80,000 total) and performs a 10-sample latency measurement plus an EXPLAIN/BUFFERS plan check. That is useful tenant/RLS/GiST evidence, but it does not satisfy the 1,000,000-row performance gate or a robust P50/P95/P99 distribution requirement.
- **PR #513 — separate Neon evidence:** a PR comment records a disposable Neon child-branch test with 1,000,000 `spatial_features` rows across two tenants, migration ledger at 076, a validated CRM composite tenant FK, preserved RLS/FORCE RLS, and CRM cross-tenant/delete-integrity checks. It also records PostgreSQL 18 acceptance and full CI passing on the exact #513 head. This is useful isolated-branch evidence only; the same comment explicitly says it does not certify application-runtime HMAC/RLS session behavior or production. The comment does not change the fact that #513's three PR-listed source files are identical to current main.
- **PR #494 — obsolete migration path:** its unique CRM migration is numbered 073 and its acceptance script applies that path in a synthetic fixture. Current main already has GIS 073–075 and CRM 076. The PR's 073 migration cannot be applied. The CRM application code and much of its API/test surface already match main; do not cherry-pick the PR wholesale or revive its old 073 acceptance workflow/script as if they were current.
- **PR #497 — backup evidence boundary:** the encrypted backup helper uses AES-256-GCM, decrypts its output and runs `pg_restore --list`; the code itself explicitly warns that archive-list validation is not a full database restore. It does not establish an actual isolated restore, PITR, RPO/RTO, off-host copy, or key-rotation drill. Its custom CA handling for the PostgreSQL adapter also needs to be verified separately in the backup subprocess path; the backup helper currently selects `PGSSLMODE` but does not explicitly map the application's `OPSC_PG_CA_CERT` setting into `PGSSLROOTCERT`.
- **PR #490 — OIDC status:** the PR adds server-side Authorization Code + PKCE flow and UI contract checks. Those source changes and tests are not evidence that a live Keycloak realm, broker aliases, provider callback registrations, secrets, or real user login work. Its own deployment contract lists those external prerequisites.
- **PR #491 — infrastructure mutation:** the new Neon acceptance script and branch-provisioning logic remain unexecuted in this audit. Do not run them against any persistent or production branch. Require a disposable branch ID, owner-approved cleanup policy, and verified no-production target before a future test.

### 11.4 Candidate selection after source reconciliation

No code delta was copied into a new integration branch in this pass. That is intentional: the remaining unique changes are not one coherent feature and include runtime, workflow, migration, infrastructure, UI and identity changes with different acceptance requirements. Applying them together would recreate the same stacked-PR risk this audit was meant to remove.

The safe order for the next Phase 0 work is:

1. Mark #513 as source-redundant against current main; retain its Neon evidence as evidence only.
2. Keep #494's migration 073 and its dependent workflow/script blocked; determine whether any genuinely missing CRM contract delta remains after comparing the current main OpenAPI and application routes.
3. Review GIS/Digital Twin unique files independently (#503, #505, #508, #499, #498, then the #510 aggregate) and reject the fixed Neon branch default. Any accepted branch must be based on current main and must use explicit, disposable test targets.
4. Review #496 map/Android deltas independently; treat Android preview APK CI as a build artifact, not physical-device acceptance.
5. Review #495 UI changes with real browser evidence and accessibility findings; do not treat its report as proof of all viewports or languages.
6. Review #497 self-hosted source separately, then require an actual clean-host install and a full restore drill before accepting backup claims.
7. Review #491 only after a disposable Neon branch lifecycle is explicitly authorized; review #490 only with a live Keycloak test realm and provisioned test identities.

**Phase 0 remains OPEN.** Current-main source identity and PR file-level reconciliation are complete for the 15 open PRs. Patch-level review has identified hard blockers and evidence boundaries, but candidate code has not yet been selectively applied or retested. No Phase 1 infrastructure actions are authorized by this report.


## 12. Follow-up: current-main GIS / Digital Twin reconciliation and CI gate (2026-11-28)

### 12.1 GIS / Digital Twin deltas are already superseded on main

The current-main tree was checked directly for the unique paths in #510, #508, #505, #503, #499 and #498. The following implementation evidence is already present on `main` at `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187`:

- `backend/src/server.js` exposes `GET /api/v1/map/viewport` and passes `includeSpatialFeatures` only when the signed-read policy enables it.
- `backend/src/geofencing.js` calls `opscore_security.spatial_features_in_viewport` and includes spatial features only for PostgreSQL + the signed-read gate. Role-polygon filtering is also applied before returning spatial data.
- `backend/sql/postgres/074_tenant_scoped_postgis_spatial_features.sql` and `075_signed_rls_spatial_viewport_query.sql` exist on main.
- `backend/scripts/signed-tenant-context-postgres-gate.js` contains the `signedSpatialViewportQuery` proof, including tenant A/B checks.
- `backend/scripts/postgres-live-rls-gate.js` includes the 074 spatial migration in its disposable PostgreSQL gate.
- `backend/web/dispatcher-map.js`, `dispatcher-map-geojson.mjs`, `dispatcher-map-geojson.test.js`, and `twin-browser-acceptance.js` exist on main. The current Dispatcher Map source is more advanced than the older #508 patch: it includes E2E-only rendered-feature diagnostics and request sequencing counters. The browser test includes the Dispatcher Map page, responsive checks and RTL toggling.
- `backend/web/digital-twin-room.html`, `digital-twin-room.css`, `digital-twin-room.js`, `control-rooms.html`, and the current contact-center test/room files are present on main. The old #498/#499 room files are not missing implementation to be copied.

**Disposition:** no GIS/Digital Twin source file from the old stacked PR heads is to be cherry-picked onto current main. Their current-main equivalents are already present and, in several cases, have advanced beyond the PR patch. This is a supersession decision, not a claim that all live acceptance gates have passed.

### 12.2 The million-row PostGIS gate exists, but current-main execution is not proven

Current main's `backend/scripts/twin-concurrency-postgis-gate.js` creates a disposable synthetic `spatial_points` table, inserts 1,000,000 rows split across two synthetic tenant labels, creates GiST and tenant indexes, runs ANALYZE, and performs EXPLAIN (ANALYZE, BUFFERS) at the 40,000 / 250,000 / 1,000,000 total-row tiers.

Evidence limitations found by source inspection:
- It is a synthetic disposable fixture, not the production `public.spatial_features` table.
- The performance query contains an explicit tenant equality predicate; the separate tenant-B query is not a negative RLS isolation assertion.
- The tiers execute one measured EXPLAIN query each. They do not produce statistically meaningful P50/P95/P99 distributions or repeated-run latency percentiles.
- It records the selected plan's execution time and shared hit/read blocks, and checks for the named GiST index. It does not establish buyer hardware capacity or a production SLO.

### 12.3 Current-main workflow evidence, rechecked

GitHub Actions runs associated with the fixed main SHA were re-read:

| Workflow / job | Run | Result |
|---|---:|---|
| OpsCore CI / verify | 46101901504 | SUCCESS |
| OpsCore CI / digital-twin-postgres-18-postgis-acceptance | 46101901504 | **SKIPPED** |
| Vercel source verify | 46101901507 | SUCCESS |
| deploy-bound isolated PostgreSQL RLS + HTTP acceptance | 46101901507 | SUCCESS |
| Vercel contract verify | 46101901507 | SUCCESS |
| Neon Preview migration + HTTP acceptance | 46101901507 | SKIPPED |
| Production Neon PITR historical probe | 46101901507 | SKIPPED |
| deployment | 46101901507 | SKIPPED |

The reusable `.github/workflows/digital-twin-postgres-live.yml` workflow's `live-rls` job provisions a disposable `postgis/postgis:18-3.7` service, but its optional Neon Preview and historical PITR jobs have explicit event/ref/branch conditions. The current main push run did not execute the Digital Twin/PostGIS job because `.github/workflows/opscore-ci.yml` still restricts that job to a fixed list of PR head branch names. The main SHA therefore has successful general verification and isolated PostgreSQL RLS/HTTP acceptance, but **does not have a current-run PASS for the million-row PostGIS gate**.

No workflow dispatch endpoint/action was available through the connected GitHub tools in this session; no workflow was manually triggered. No production or persistent Neon target was touched.

### 12.4 Phase 0 decision

- GIS/Digital Twin source reconciliation against current main: **COMPLETE for the reviewed stacked PR deltas**; no source cherry-pick required.
- GIS/Digital Twin runtime/DB acceptance on current main: **NOT PROVEN in the latest main run**, because the specific PostGIS job was skipped.
- Million-row synthetic fixture code: **PRESENT**, but not executed on the current main run and not equivalent to production-table scale or percentile benchmarking.
- Workflow branch-filter design: **OPEN ISSUE**. It prevents the main push from running the dedicated PostGIS gate. Correcting it requires a separately reviewed CI workflow change and a real Actions run; it has not been changed in this audit.
- Phase 0: **OPEN**. Do not begin Phase 1 until the current-main source baseline, candidate disposition, and required current-head verification are all evidenced.

This follow-up changed only the audit report on `audit/source-baseline-2026-11-28`. Main remains unchanged; no migrations, application source, workflows, databases, secrets or deployments were modified.


## 13. Follow-up: isolated PostGIS gate re-enabled and executed (2026-11-28)

### 13.1 CI condition repair — PR #518

A dedicated branch `fix/ci-postgis-main-gate-2026-11-28` was created from the exact main baseline `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187`. Only `.github/workflows/opscore-ci.yml` changed.

- The dedicated `digital-twin-postgres-18-postgis-acceptance` reusable job now runs on `push` to `refs/heads/main`.
- The new narrow PR branch was added to the existing pull-request allowlist so the change itself could be exercised before merge.
- Existing accepted GIS branch names were preserved.
- PR #518: https://github.com/mosamiryamany-hub/opscore-platform/pull/518
- Head: `3395ffb8c0a520b2e6138cd95bb73f65d8e20103`
- Base remained `f68ec555e5b296ba7ec63c04a4cb1c5d321d8187`; no main merge occurred.

### 13.2 Actual PR #518 Actions evidence

Run `46114814269` completed **SUCCESS** on the PR merge ref. The `verify` job and the reusable isolated PostgreSQL 18/PostGIS job both completed successfully. The Vercel workflow's source verification, isolated PostgreSQL RLS/HTTP acceptance and contract verification also succeeded; deployment, Neon Preview migration and historical Neon PITR jobs were skipped by their separate guards.

The PostGIS acceptance job completed:
- PostgreSQL 18 + PostGIS service initialization and pgvector package/extension setup.
- Full migrations on disposable acceptance databases.
- Signed tenant-context route coverage: 67 expected / 67 covered / 0 failed.
- Signed RLS runtime checks, raw-GUC tampering rejection, tenant A/B read/write and cross-tenant denial checks.
- Tenant composite-FK integrity gate and logical dump/restore drill.
- Authenticated Dispatcher Map browser acceptance.
- Caller-bound disposable tenant matrix: 346 routes; disposable logical restore evidence: 139 tables; cleanup PASS with zero fixture residue.
- Synthetic PostGIS scale gate: 40k / 250k / 1m total-row tiers, GiST plan checks and repeated authenticated HTTP measurements (100 requests per stage; P50/P95/P99/min/max evidence emitted by the run).

Important scope boundary:
- The signed `spatial_features` viewport proof in the same run still used 40,000 fixture rows per tenant, 10 samples, P50/P95 only, and measured the named GiST index.
- The 1m tier belongs to the separate synthetic `spatial_points` scale gate, not a 1m-row load on the application's production `public.spatial_features` table.
- Therefore this run proves the synthetic million-row scale gate executes and passes; it does **not** close the requested 1m real application-table acceptance or buyer-hardware SLO.

### 13.3 PR #497 self-hosted candidate — verified blockers and stacked correction #519

Review of PR #497 (`feat/turnkey-buyer-delivery-20261127`, head `ecdd1c5dd8741c67e748964fb33053bea7fa23b6`) found:
- Its new `.github/workflows/self-hosted-postgres18-acceptance.yml` had a truncated `grep` command and duplicated trailing workflow steps, including malformed indentation after the final cleanup step. It was not safe to treat this as a runnable acceptance workflow.
- The encrypted backup CLI used `PGSSLMODE` but did not propagate `OPSC_PG_CA_CERT` / URL `sslrootcert` to libpq's `PGSSLROOTCERT`; it also ignored the connection URL's `sslmode` when the environment variable was unset. That could make a custom-CA production backup fail or silently use the less strict default mode.
- Buyer branding's `SAFE_PATH` accepted protocol-relative paths such as `//cdn.example/logo.svg`, contradicting the same-origin path contract.
- The mobile enrollment deep link is an unsigned custom-scheme prefill only, not a cryptographically signed enrollment link. The documentation was corrected accordingly.

A separate stacked repair branch `fix/turnkey-selfhosted-acceptance-2026-11-28` and PR #519 were created against PR #497's branch, not main:
https://github.com/mosamiryamany-hub/opscore-platform/pull/519

PR #519 changes six files: repairs the workflow and all explicit PASS greps (including pgvector), preserves backup TLS/CA inputs and adds unit tests, rejects protocol-relative logo paths with a regression test, and corrects the deep-link description. PR #519 is open and its general CI run was still in progress at the time of this report update. The repaired self-hosted PostgreSQL workflow has not yet run; no real self-hosted buyer deployment, backup restore, or credential rotation has been performed.

### 13.4 Current disposition

- Main: unchanged at the last verified base SHA; neither PR #518 nor PR #519 was merged.
- PR #518: CI repair validated successfully on the PR head; merge is still a separate review/approval decision.
- PR #519: stacked corrective work is pending CI completion and review.
- PR #497: remains blocked from acceptance by the workflow defects until #519 is incorporated and its self-hosted PostgreSQL 18/PostGIS workflow runs successfully.
- Phase 0: the previously skipped PostGIS gate now has a successful isolated PR run. Phase 0 is **not closed**: main has not yet received the CI correction, the 1m application-table benchmark remains outstanding, and the self-hosted buyer acceptance is still pending.
