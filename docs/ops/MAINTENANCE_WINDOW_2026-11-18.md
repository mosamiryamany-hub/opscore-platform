# Production maintenance window — selected schedule and fail-closed runbook

## Approved window

| Field | Value |
|---|---|
| **Local date** | Wednesday, 18 November 2026 |
| **Timezone** | Africa/Cairo (EET, UTC+2) |
| **Start** | **02:00** |
| **End** | **04:00** |
| **Duration** | **120 minutes** |
| **UTC equivalent** | **00:00–02:00Z** |
| **Primary branch** | `br-proud-salad-bcshhdap` |
| **Production database** | `opscore_acceptance` (must be re-confirmed live before any write) |
| **Current Production deploy observed 17 Nov** | `dpl_Hy9ymDff1oChGpBAxmAjr4cfwyyG` / commit `4017497068defa9c1d0761fcb07bc746925e002a` |
| **Current main observed 17 Nov** | `e57adb3f380c1171d754c55c2911ca8f900b65a2` |
| **Existing pre-window snapshot** | `snap-floral-sea-bcug7fd3`, created `2026-11-17T10:08:56Z`, source primary |

The selected time is an owner-approved operational window. Current Vercel Hobby runtime-log retention is approximately one hour; the available 30-minute query returned no request-path counts and no runtime errors, but it does **not** establish an hourly/daily traffic curve or statistically prove this is the lowest-traffic window. Do not market the schedule as telemetry-optimized without longer-retention hourly request data.

## Critical corrections discovered on 17 November

1. The current `main` SHA is `e57adb3f380c1171d754c55c2911ca8f900b65a2`, not the earlier `362e7cd5...`. Candidate and release evidence must bind to the exact post-review commit actually selected for deployment.
2. Existing branch `br-steep-star-bcgphok3` is **DDL-only evidence**: 063–067 returned `psql_rc=0`, but no corresponding migration-ledger rows were written; the final verification query returned `(0 rows)` and still printed `MIGRATION_BRANCH_PASS`. It also used a pooled endpoint. Do not promote this branch or treat that run as official migration-runner certification.
3. The signed 67-route manifest includes technician GPS trail routes. PostgreSQL's `geofencing.js` fails closed when `public.technician_location_trail` is absent. Therefore the candidate schema must include **063–067 and 069**, with the official runner writing each filename and SHA-256 into `public.schema_migrations`. Keeping the three GPS routes in the 67-route scope while omitting 069 is a release contradiction.
4. PR #212 prepares a corrected disposable-branch path: direct non-pooler endpoint, exact project/branch/host/database binding, the guarded `apply-postgres-migrations.js --apply` runner, SHA-256 ledger evidence, and no automatic branch deletion. It is not Production authorization and must pass independent review before use.
5. The signed-context policy now has a Production code path, but it is independently fail-closed: `VERCEL_ENV=production`, `OPSC_SIGNED_TENANT_CONTEXT_PRODUCTION_ENABLED=true`, `OPSC_PRODUCTION_HOLD=false`, and the exact running deployment must pass `hasVerifiedProductionRelease()` including the current 67-route signed-session proof. The server computes this readiness once at cold start; missing/stale/mismatched proof keeps Production signed routes disabled. The 67-route Production collector/evidence artifact is still not available, so the new path does not make Production activatable today. The Vercel Production deploy job remains hard-disabled (`if: false && ...`).

## Historical migration workflow audit — 17 November 2026

The legacy `ops-signed-context-migration-branch` run **44064087564** executed on `main` commit `e57adb3f380c1171d754c55c2911ca8f900b65a2` at 10:21 UTC. Its job concluded `success`, but the actual steps/logs show why it is not official migration-runner proof:

- It automatically deleted the prior child branch `br-solitary-star-bctbf0ms` (Neon API returned HTTP 200), reducing branch count from 7 to 6, then created `br-steep-star-bcgphok3` from Primary. Primary itself was not deleted or changed by this branch-creation step.
- It used a pooled Neon endpoint (`ep-plain-forest-bc8j0arj-pooler...`) and raw `psql` commands, not the guarded `apply-postgres-migrations.js --apply` runner.
- Migrations 063–067 each returned `psql_rc=0`, but the subsequent migration-ledger query returned **`(0 rows)`**. The script nevertheless printed `MIGRATION_BRANCH_PASS`.
- It omitted migration 069, which is required for the technician-trail routes in the 67-route manifest.

Therefore the run is classified **DDL_ONLY / NOT_OFFICIAL_MIGRATION_PROOF**. The child branch `br-steep-star-bcgphok3` must not be promoted or used as the baseline for Production. The branch deletion is historical and cannot be undone by the current PR; no additional branch deletion is authorized. The replacement helper in PR #212 explicitly contains no Neon DELETE operation and refuses to create a branch when capacity is full.

## Snapshot restore and current Neon capacity — 17 November 2026

The first restore attempt through the earlier branch-creation path failed with
`root branches limit exceeded`. That was not accepted as rollback proof. The
path was corrected to call Neon’s dedicated Restore Snapshot API with
`finalize=false`; it successfully created a separate ready branch at
`2026-11-17T16:17:51Z`:

- Snapshot: `snap-floral-sea-bcug7fd3`, source Primary.
- Valid restore branch: `br-quiet-poetry-bc3uo0u3`.
- Neon metadata: `restore_status=restored`,
  `restored_from=snap-floral-sea-bcug7fd3`,
  `restored_as=br-proud-salad-bcshhdap`.
- The restore was not finalized. Production Primary remained the primary/default
  branch and no compute was moved to the restored branch.

The current live branch inventory was rechecked on 17 November 2026: **2 active branches (2/10 included)** and **2 root branches**. Both active branches are unprotected; the Production Primary remains unprotected.

Active branches:
- `br-proud-salad-bcshhdap` — Production Primary `main` (primary/default, unprotected).
- `br-quiet-poetry-bc3uo0u3` — non-finalizing restore from the retained manual Primary snapshot (unprotected).

The three earlier root branches and two child branches described in the 17 November pre-cleanup inventory are no longer active. The current Neon project reports plan `free_v3` with 10 total branch slots and 2 currently active. One manual Primary snapshot remains listed: `snap-floral-sea-bcug7fd3`. The Primary automatic snapshot schedule is empty. Both currently active branches are unprotected.

A new Primary snapshot request on 17 November was rejected with
`snapshots limit exceeded`. The existing snapshot was not deleted or replaced.
The valid restore proof therefore proves the retained snapshot’s provenance and
schema/data parity at its recorded test time, but it does not satisfy the
separate requirement to take a fresh snapshot immediately before the 18
November maintenance window.

### Current quota and recovery consequences

- Neon’s dedicated Restore Snapshot API proof is now **verified**; the ordinary
  child branch `br-divine-fog-bcki2xa4` must never be represented as restore
  evidence.
- The full 6,096-item schema fingerprint and the SHA-256 row-content inventory
  for all 135 public tables matched between Primary and
  `br-quiet-poetry-bc3uo0u3` at the recorded proof time.
- The automatic snapshot schedule remains empty, and the Primary remains
  unprotected.
- The only listed manual Primary snapshot is still
  `snap-floral-sea-bcug7fd3`. A new snapshot request returned
  `snapshots limit exceeded`; do not delete the existing snapshot to free a
  slot automatically.
- No plan upgrade, snapshot deletion, branch deletion, protection change,
  Primary replacement or IP Allow policy change was performed.
- The 18 November Production migration therefore remains **NO-GO** until a
  fresh Primary snapshot can be created, restored non-finalizing, validated,
  and hash-pinned. A successful older restore does not replace the fresh
  pre-window snapshot requirement.

## Localization qualification residual

The runtime locale manifest contains **105 selectable Contact Center locales**: 1 English source locale, 100 machine-assisted draft translations and 4 explicit English-fallback locales (din, nus, pau, ch). Nine flagged locales (ms, sw, hy, uz, my, ml, es, sr, te) are withdrawn from runtime selection pending linguistic remediation and native-speaker review. The separate qualification matrix contains 114 source-language rows, all marked `planned_not_qualified`; native-speaker review completed is 0/114, and current runtime production-qualified locales are 0/105. All non-native-reviewed locales must retain the machine-translation notice. Do not claim 114 runtime-selectable or native-reviewed languages.

## Vercel firewall posture — read-only inspection on 17 November 2026

The active Vercel firewall configuration reports `firewallEnabled=true`, version 4:

- Managed CRS rules active but `log` only: Generic, RCE, SQLi and XSS. Java, LFI, Multipart, PHP, RFI, Scanner Detection and Session Fixation groups are inactive.
- Bot Protection is active but `log` only.
- IP allow/deny rules list is empty.
- One valid custom rule limits `POST /api/v1/auth/(login|mobile-login)` to 60 requests per source IP per fixed 60-second window, with action `rate_limit`.
- The Vercel active-attack query returned no anomalies for its default last-24-hour window. This does not prove absence of attacks or justify changing mitigation actions.

No WAF/CRS/BotID/IP-rule changes were made. Do not flip the current `log` rules to `deny` based solely on this one-day sample; collect a longer representative baseline, inspect false positives and rehearse in Preview first. Rate-limit enforcement must remain aligned with application account-level throttling.

## Commercial hosting entitlement — Vercel

The current Vercel project inspection returned `domains: []`, `live: false`, and SSO protection enabled for all deployments except custom domains. The Vercel runtime-log API explicitly rejected a one-hour lookback as a Hobby-plan retention violation. The current Vercel pricing and Fair Use guidance states Hobby is for personal/non-commercial use and commercial usage requires Pro or Enterprise.

The Vercel Pro base price is currently listed as **$20/month**, with $20 usage credit; additional resource consumption, extra paid seats and applicable taxes can add cost. Enterprise is available for higher security/operational requirements. Official links:
- https://vercel.com/pricing
- https://vercel.com/docs/limits/fair-use-guidelines
- https://vercel.com/legal/terms

Consequences:

- A READY Production deployment is not proof of commercial hosting entitlement or customer-facing reachability.
- Before commercial buyer traffic, move the owning Vercel team/project to Pro or Enterprise, attach and verify the intended custom domain, and verify that deployment protection/SSO settings permit intended customer access without weakening staff/admin protections. Pro is currently listed at $20/month with $20 included usage credit; usage beyond the credit and applicable taxes are additional. Enterprise is not recommended absent a requirement for its dedicated controls/SLA.
- No Vercel plan upgrade, domain purchase/transfer, DNS change or protection change is authorized or performed here.

## Production signed-context activation and key rotation path

The application now accepts Production signed-context configuration only when all five independent conditions are true:

1. `VERCEL_ENV=production`.
2. `OPSC_SIGNED_TENANT_CONTEXT_PRODUCTION_ENABLED=true`.
3. `OPSC_PRODUCTION_HOLD=false`.
4. `OPSC_RELEASE_VERIFIED=true`.
5. At cold start, `hasVerifiedProductionRelease()` verifies the immutable running deployment's exact source commit, CI pipeline, package fingerprint, production acceptance, session/isolation evidence, recovery evidence, and all 67 signed-route results bound to the exact deployment ID and Primary branch.

The server caches this readiness result for the lifetime of the deployment. Missing evidence, a different commit/pipeline/deployment/branch, a malformed proof, or an exception returns false and leaves signed Production paths unavailable. Setting environment flags alone cannot open the path. The separate global Production traffic gate still requires `OPSC_RELEASE_VERIFIED=true` plus the same release verifier; neither gate is changed by the new code path.

### Production proof bootstrap — unresolved architectural gate

The current release verifier creates a deliberate bootstrap dependency that is not yet solved:

- `hasVerifiedProductionRelease()` requires `signedTenantRouteCoverage.status === PASS_PRODUCTION_ROUTE_SCOPE`.
- `readProductionSignedTenantRouteCoverageEvidence()` requires all 67 route rows, including `deploymentIdBound` to the exact `VERCEL_DEPLOYMENT_ID` of the running deployment.
- The server computes `signedContextProductionReadiness` once at cold start and keeps the signed Production routes disabled unless `hasVerifiedProductionRelease()` is already true.

Consequently, collecting the 67-route proof against a newly deployed Production candidate is blocked by the same proof gate that requires the evidence. Embedding the evidence into a later build changes the Vercel deployment ID and invalidates the deployment binding. The present code therefore **fails closed but is not yet an executable end-to-end activation path**.

Before Production activation, implement and independently test one of these safe bootstrap designs:

1. A narrowly scoped, internal-only canary path for a dedicated Production test tenant and explicitly issued test sessions. Only that test tenant can use signed routes while the global user traffic hold remains active; run the 67-route collector, verify cleanup, then publish a deployment-bound attestation.
2. A separately stored, cryptographically signed Production attestation record (for example, a protected database control-plane record), written only by the collector after it tests the exact live deployment and read dynamically by the server. Bind the record to project, commit, pipeline, Vercel deployment ID, Primary branch, manifest/inventory hashes, and expiry/revocation.

Do not simply remove `deploymentIdBound`, remove the 67-route gate, weaken `hasVerifiedProductionRelease()`, trust an unverified environment boolean, or enable signed routes broadly to break this cycle. No activation claim is valid until the selected bootstrap method has negative tests for expired, mismatched, revoked, cross-deployment and cross-tenant proof.

### Manual Production key rotation

Workflow: `.github/workflows/rotate-production-tenant-hmac.yml`

- Manual `workflow_dispatch` only from `main`, with the exact confirmation `ROTATE_PRODUCTION_TENANT_HMAC`, and it references GitHub Environment `production`. The repository's Environment protection rules / Required reviewers were not readable through the current GitHub integration; their presence is **UNVERIFIED**. Verify Settings → Environments → production before any dispatch and require an independent reviewer. The workflow is not time-scheduled; the operator must dispatch it only inside the approved 02:00–04:00 Cairo window.
- Verifies the exact Neon project/Primary/database/owner role and a direct non-pooler connection. It fails if migration 063 has not created `opscore_security.context_hmac_keys`.
- Generates a new 256-bit HMAC key, inserts it into the Primary key table, and syncs only the three Production HMAC variables in Vercel. It does not create or modify Preview/Development values.
- Old database key rows are intentionally left enabled and their expiry is not shortened. The workflow does not deploy, enable signed routes, change `OPSC_REQUIRE_SIGNED_TENANT_CONTEXT`, set `OPSC_PRODUCTION_HOLD`, or change `OPSC_RELEASE_VERIFIED`.
- Key environment changes affect the next deployment only. They do not change the currently running Production deployment. Therefore the rotation step must be followed by a reviewed, exact-SHA Production redeployment before any key-using smoke test. A READY deployment from before the env update cannot prove the new key was loaded.
- Rollback keeps the previous key row valid and points Production traffic back to the exact last verified deployment. Do not retire prior keys until the new deployment has completed the full signed-route soak and rollback reserve. Retirement is a separate, reviewed operation.

### Manual Production migration

Workflow: `.github/workflows/ops-apply-production-signed-context-migrations.yml`

- Manual `workflow_dispatch` only from `main`, exact confirmation `APPLY_PRODUCTION_SIGNED_CONTEXT_MIGRATIONS`, and it references GitHub Environment `production`. Actual Environment protection rules / Required reviewers remain **UNVERIFIED** and must be inspected before dispatch.
- Requires `docs/ops/evidence/PRODUCTION_PRIMARY_RESTORE_PROOF.json` and an exact matching SHA-256 in the Environment secret `OPSC_PRODUCTION_RESTORE_PROOF_SHA256`. The proof contract is defined in `docs/ops/PRODUCTION_PRIMARY_RESTORE_PROOF_SPEC.md`. That file must not be marked PASS until a real non-finalizing Neon restore test has completed.
- Independently rechecks the snapshot and restore-branch provenance, project, Primary branch, database, age, and proof checks. It uses the official `apply-postgres-migrations.js` runner and a direct connection only.
- Runs the runner dry-run first and refuses to write unless the exact pending set is 063–067 and 069. It then requires `APPLIED_AND_VERIFIED` and the matching SHA-256 ledger rows.
- It does not deploy, rotate keys, enable signed routes, open the traffic hold, delete a branch/snapshot, or finalize a restore. It is intentionally a schema-only operation with a separate post-deploy stage.

**Current limitation — verified 17 November 2026:** the non-finalizing Primary restore proof now exists in PR #219's branch, with the exact digest `ac64f8c634cd783e6df7d21c9fbeb941801fe9a68f63427ac0345b05613189fe`; it is not yet in `main`, and the new digest has not been confirmed in GitHub Environment `production`. The Production 67-route HTTP collector/evidence writer is still not implemented. The Production migration workflow must remain un-dispatched. The approved 18 November window is currently **NO-GO** because Neon rejected a new Primary snapshot with `snapshots limit exceeded`, the automatic snapshot schedule is empty, and Primary branch protection is disabled. Do not delete the only retained Primary snapshot to free capacity.

## Mandatory pre-window gates

Do not enter the Production write phase unless all are true:

- PR #212 and PR #219, plus all required production-activation code changes, are merged and green on the exact selected main SHA. This project's current closeout decision does not require an independent-reviewer gate.
- The six-migration rehearsal (063–067 and 069) must be rerun through the official migration runner against the exact selected main SHA and a disposable branch from the verified restore point; its dry-run and apply report must include direct connection identity, exact file SHA-256 ledger rows, and postconditions. Prior branch evidence is not automatically rebound to the current main SHA.
- The exact Production deployment candidate has been built and smoke-tested with signed-route enforcement still off; its source SHA, database branch, package identity and migration set are fixed and recorded.
- The Production HMAC rotation workflow passed static contract tests (5/5), but it has not been dispatched. Migration 063 has since been applied on Primary (see the Current evidence reconciliation section below): `context_hmac_keys` exists with zero Production HMAC key rows, so no old/new Production key overlap exists yet. The overlap-and-rollback behavior is designed only; it has not been executed. No key secret is placed in logs or documentation.
- The real Production 67-route collector/evidence writer is **not implemented and not available**. It must prove session, tenant, backend PID, transaction, raw-GUC tamper denial, cross-tenant read/write denial and cleanup per route, bound to the exact commit, pipeline, Production Neon branch and Vercel deployment. It must also solve the cold-start proof/bootstrap sequencing without weakening the fail-closed gate.
- A valid non-finalizing restore proof now exists in the PR #219 branch: snapshot `snap-floral-sea-bcug7fd3` restored to `br-quiet-poetry-bc3uo0u3`, with Neon metadata `restored_from`, `restore_status=restored`, and `restored_as=br-proud-salad-bcshhdap`. At `testedAt`, its 6,096-item canonical schema fingerprint (`2deab77e…`) and SHA-256 row-content inventory for all 135 public tables (`fe5063af…`) matched the current Primary. The proof digest is `ac64f8c634cd783e6df7d21c9fbeb941801fe9a68f63427ac0345b05613189fe`; after PR #219 is merged, this exact value must be set in GitHub Environment secret `OPSC_PRODUCTION_RESTORE_PROOF_SHA256`. **However, Neon rejected a new Primary snapshot request with `snapshots limit exceeded`**. The only retained manual Primary snapshot is older than the approved maintenance window, and the automatic snapshot schedule is empty. Keep the window **NO-GO** until snapshot capacity is increased or the owner explicitly approves a safe backup-retention change, a fresh Primary snapshot is created and restored, and the new proof/secret are verified. Do not delete the only retained Primary snapshot automatically.
- A Production migration workflow uses a direct Neon endpoint, the official runner, and exact `OPSC_MIGRATION_TARGET_CLASS=production`, `OPSC_MIGRATION_ALLOW_PRODUCTION=1`, project/branch/host/database confirmations. No manual `psql -f` path and no pooled endpoint.
- The deployment workflow references the Production Environment, but actual Environment reviewer protection is UNVERIFIED; the current Production deploy job is hard-disabled and must not be assumed executable.

## In-window sequence — 120-minute ceiling

| Cairo time | Budget | Action / gate |
|---|---:|---|
| 02:00–02:10 | 10 min | Freeze changes; verify exact main SHA, current Production deploy/branch/database identity, snapshot availability and service health. Take and verify a fresh Primary snapshot. Any mismatch or snapshot failure = **NO-GO**. |
| 02:10–02:25 | 15 min | Reconfirm the candidate branch's official runner report, all required migration ledger SHA-256 values (063–067, 069), role privileges, forced RLS, zero remaining direct tenant GUC policies and technician trail schema. |
| 02:25–02:45 | 20 min | Apply the signed-context migrations through the approved Production runner only; verify ledger and schema postconditions immediately. Any error = stop; no ad-hoc SQL repair. |
| 02:45–03:00 | 15 min | Run the manually dispatched, exact-confirmation Production HMAC rotation only after schema checks and after the GitHub `production` Environment's Required reviewers have been independently verified. Verify the new key row and Production-only environment values; leave old key rows enabled. |
| 03:00–03:20 | 20 min | Deploy the reviewed exact SHA **after** HMAC env sync so the new deployment loads the new key. Keep signed-route flags OFF, confirm the new deployment identity/commit/package/Primary and run baseline smoke. If deployment identity differs, stop. |
| 03:20–03:45 | 25 min | Only if the proof-bootstrap architecture and collector were completed and rehearsed pre-window: run the deployment-bound 67-route canary collector, verify tenant A/B isolation, backend PID/transaction binding, raw-GUC tamper denial, writes/cleanup, and publish the attestation for this exact deployment. If any route is missing, proof cannot be read by the running deployment, evidence is rebound, or cleanup fails = **NO-GO**. |
| 03:45–04:00 | 15 min | GO/NO-GO, freeze evidence and either keep the already-approved limited canary or roll back to the exact prior deployment while preserving old HMAC keys. Do not use this reserve to continue migration, key rotation or collector development. |

The final 15 minutes are a decision/rollback reserve, not extra implementation time. Stop initiating new changes by 03:45.

**Important: this time table is a target sequence, not a GO authorization.** The signed Production proof bootstrap problem above is unresolved, and the post-rotation redeployment step must be part of the reviewed rehearsal. Unless the bootstrap design, exact post-rotation deployment identity, live 67-route collector, and rollback are completed and timed on an isolated Production-equivalent clone before the window, the correct action at 02:00 is **NO-GO / reschedule**. Do not attempt to invent or debug the collector inside the 120-minute Production window.

## Rollback triggers and actions

Immediate NO-GO triggers: login/session errors above the agreed baseline; a failed tenant A/B isolation assertion; signed-context verification/key lookup errors; missing/mismatched migration ledger SHA; RLS/policy postcondition failure; any uncovered route; Production commit/deployment/branch mismatch; cleanup failure; snapshot/restore verification failure.

On trigger:
1. Stop expanding canary and keep/restore the Production traffic hold using the approved release procedure.
2. Roll back Vercel to the exact previously verified deployment.
3. Do not automatically finalize a Neon restore branch. Verify the restore branch, schema/data identity and snapshot provenance first; primary replacement requires explicit operator approval and exact target confirmation.
4. Keep the prior HMAC key rows enabled; roll Vercel traffic back to the exact previously verified deployment ID, and re-run health/login/session/database identity checks against it. Record a run-bound rollback report. Do not rotate the old key out during rollback.
5. If restoration cannot be proven within the reserve, remain in maintenance/hold rather than reopen traffic on an unknown state.

## Explicit exclusions

- No Production schema write, HMAC Production key installation/rotation, signed-route Production flag change or Production deploy before the approved window and all mandatory pre-window gates. The new workflows in PR #212 are manual-only and have not been dispatched.
- No automatic deletion of Neon branches or snapshots to make capacity.
- No Neon/Vercel plan upgrade without prior cost approval.
- No claim of full Production 67-route coverage until the actual Production evidence file is generated and verified against the exact deployment.
- Mobile store signing, native-speaker translation review and licensed map-provider work remain separate buyer residuals; this window does not close them.

## Decision

The time window is selected, but the Production release is **not yet GO-approved**. The window authorizes a controlled decision process, not a presumption that all gates will pass. At 02:00, proceed only if every mandatory pre-window gate above is already PASS; otherwise abort and reschedule.

## Corrective snapshot restore verification — 17 November 2026, 16:20 UTC

A real non-finalizing Neon snapshot restore was executed through the dedicated
Restore Snapshot API (not the normal branch-creation endpoint).

| Check | Observed result |
|---|---|
| Project / Primary | `summer-leaf-18448271` / `br-proud-salad-bcshhdap` |
| Snapshot | `snap-floral-sea-bcug7fd3`, source Primary |
| Restored branch | `br-quiet-poetry-bc3uo0u3` |
| Neon restore metadata | `restore_status=restored`, `restored_from=snap-floral-sea-bcug7fd3`, `restored_as=br-proud-salad-bcshhdap` |
| State | `ready`; `primary=false`, `default=false` |
| Database identity | `opscore_acceptance` / `neondb_owner` / PostgreSQL 18.7 |
| Public tables | 135; RLS enabled 134; FORCE RLS 134 |
| Migration ledger | 62 rows; 068 present; 063–067 and 069 absent |
| Runtime role | `opscore_runtime`: `rolsuper=false`, `rolbypassrls=false`; an actual role-scoped read without tenant context returned 0 organizations |
| Organization rows | 10 |
| Schema SHA-256 | `efa1f375d76194fa51a3556a97e641e61685f914d446979da50a551a4333ffd7` |
| Public table inventory SHA-256 | `fbe28eb39056c46866c88dcd4cd37d8da55ba58b3887f2d5503287dba80a51be` |

The Production Primary remained `ready` with its identity unchanged. The
restore was not finalized, no Primary compute was moved, and no Production SQL
was written.

### Correction to the earlier PASS file

The previous proof named `br-divine-fog-bcki2xa4`. Neon shows that branch was
created through ordinary branch creation from Primary; it has no
`restored_from` or `restore_status` metadata and is not acceptable as snapshot
restore evidence. The earlier generator sent `snapshot_id` to
`POST /branches`, where that field does not perform a snapshot restore.

The valid non-finalizing restore is `br-quiet-poetry-bc3uo0u3`. The proof file in this branch is rebound to the valid restore branch. Its exact
SHA-256 is `231b7d5a8b94ebaf2307f9b0a42cf5c95537ed6237db9842cf7f3da39297be28`. This value must replace the old
`OPSC_PRODUCTION_RESTORE_PROOF_SHA256` GitHub Environment secret after merge;
until then, the Production migration workflow will fail closed.

### Current Neon capacity reconciliation

The branch and snapshot inventories in this section are historical. The current live inventory is maintained in the Current evidence reconciliation section at the end of this document (5 active branches out of 10, all unprotected, one retained manual snapshot); do not delete or rotate restore/snapshot branches automatically.

### Production migration boundary

This restore proves snapshot provenance and the enumerated read-only checks.
It does not prove row-by-row equality, a rollback RPO/RTO, or 67-route HTTP
acceptance. Production migration 063–067 and 069 remain un-applied. The chosen
maintenance window remains 18 November 2026, 02:00–04:00 Africa/Cairo. The
Production pin remains `4017497068defa9c1d0761fcb07bc746925e002a`; no new Vercel
deployment, HMAC rotation, or signed-route activation was started.


## Live restore-point parity and snapshot-capacity stop — 17 November 2026

- Full schema inventory: 6,096 catalog items; SHA-256 `2deab77e3b25f816c5a17aad24cebce83fbd7065dc26407898b3ebf584553fb5`, identical between Primary and the non-finalizing restore branch.
- Public table data inventory: all 135 tables compared; SHA-256 `fe5063af3ca6cfbad6a0325f6eda972731fb80a960af471f2075f51896400341`, identical between Primary and restore. The runner now repeats this comparison immediately before the Production migration dry-run.
- Neon snapshot creation against Primary returned `snapshots limit exceeded`. The only listed manual snapshot remains `snap-floral-sea-bcug7fd3` from 17 November 10:08:56Z. The automatic snapshot schedule remains empty and Primary remains unprotected.
- Therefore the 18 November 02:00–04:00 Africa/Cairo window is **NO-GO** with the currently observed Neon capacity. Reconsider only after safe capacity is available, a fresh snapshot and non-finalizing restore are proven, and the GitHub Environment proof digest is updated.


## Current evidence reconciliation — 2026-11-18/19 owner audit

The Neon capacity facts below supersede the 17 November inventory above and were
re-measured by the owner across GitHub/Vercel/Neon on 18–19 November 2026:
**5 active branches (5/10 included)**, all currently report `protected=false`:

- `br-proud-salad-bcshhdap` — Production Primary `main` (primary/default, unprotected).
- `preview/ops/acceptance-neon-target-2026-11-19` — preview acceptance target (unprotected).
- `opscore-prod-recovery-7b6d12b8…` — productionRecoveryBundle evidence branch (unprotected; do not delete while the gate cites it).
- `opscore-primary-snapshot-restore-validation-20261119` — snapshot-restore validation (unprotected).
- `opscore-primary-snapshot-restore-proof-20261118T012830Z` — snapshot-restore proof (unprotected).

Current snapshot inventory contains **one** manual Primary snapshot retained for
restore evidence; do not delete or rotate it automatically. The automatic
snapshot schedule remains empty on the Free plan (6-hour history window), and
the Production Primary remains unprotected (branch protection is plan-gated).
The runtime locale surface is **105 selectable Contact Center locales**
(1 source, 100 machine-assisted drafts, 4 English fallbacks; 9 withdrawn), with
0/105 production-qualified and the 114-row qualification matrix still
`planned_not_qualified`. Production key material and signed-route proof, as recorded by the owner audit of 18-19 November 2026: `context_hmac_keys` exists with the expected schema and ownership and holds zero Production HMAC key rows; the live Production 67-route signed-session matrix remains **NOT ESTABLISHED**; restore branch br-odd-surf-bcps6nce (restored_from=snap-tiny-dream-bc58p5nj); the snapshot reflects the current 063–069 migration writes; Snapshot creation and branch cleanup are complete for this reconciliation cycle.

Do not claim 114 runtime-selectable or native-reviewed
languages, and do not describe the project as having scheduled backups, PITR
guarantees, or a protected Primary.
