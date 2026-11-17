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

## Snapshot restore attempt — 17 November 2026

A non-finalizing restore test was attempted against the current manual Primary snapshot `snap-floral-sea-bcug7fd3`. Neon rejected creation of the restore branch with `root branches limit exceeded`. The snapshot is still listed and was not deleted or replaced; no restore branch was produced.

The branch inventory was rechecked on 17 November 2026 after additional preview/verification branches appeared. It now shows **10 active branches (10/10 included)** and **3 root branches**. All ten are unprotected; the Primary is also currently unprotected.

Root branches:
- `br-proud-salad-bcshhdap` — Production Primary `main` (unprotected)
- `br-gentle-union-bcv2y6cf` — restore-test branch from `snap-spring-snow-bc1jiqqs` (unprotected)
- `br-wispy-term-bcrqqj84` — prior restore-drill root branch (unprotected)

Child branches:
- `br-rapid-fire-bcv3y677` — preview/hardening/integrated-commercial-gates-20261116
- `br-tiny-base-bc69tawf` — preview/verify/preview-main-7b62dd1-20261116
- `br-still-pine-bcpldlkh` — preview/fix/catalog-proof-signed-tenant-accessor-2026-11-17
- `br-steep-star-bcgphok3` — DDL-only signed-context migration test branch
- `br-dry-glitter-bcp2nhhy` — production-clone acceptance branch
- `br-fragrant-king-bcr9928f` — signed-context 063–065 branch
- `br-wispy-credit-bckacgvt` — vercel-dev branch

The project API does not expose its plan name. The observed Free-equivalent behavior is consistent with a three-root-branch ceiling, a six-hour history window and a 1 GB total Postgres storage cap; the plan name is therefore not asserted. One manual snapshot is listed and the automatic snapshot schedule is empty. Neon’s current plans document 10 total branches for Free/Launch and 25 for Scale; Launch allows five roots and seven-day history, while Scale allows 25 roots, up to 30-day history, and IP Allow on protected branches. Because this project already has 10/10 branches, Launch does not provide any additional total-branch headroom without deleting branches. See https://neon.com/docs/introduction/plans, https://neon.com/docs/manage/branches, https://neon.com/docs/guides/schema-only-branches and https://neon.com/docs/guides/protected-branches.

Neon Launch is usage-based with no monthly minimum ($0.106/CU-hour; $0.35/GB-month database storage; $0.20/GB-month retained PITR history; $0.09/GB-month snapshots). It retains the 10-branch cap and supports five root branches and seven-day history. Scale is $0.222/CU-hour with the same published base storage/PITR/snapshot rates, 25 included branches and roots, up to five protected branches, 100 manual snapshots, up to 30-day history and IP Allow for protected branches. Extra branches beyond the included allowance cost $1.50 per branch-month, prorated hourly. **Scale is the recommended plan for this exact project state** because it provides capacity for a separate restore root and migration child while preserving all ten existing branches, plus protection of Production. Launch is only a constrained fallback if the owner separately approves pruning at least two child branches and accepts the shorter recovery window. No upgrade, branch deletion, snapshot deletion, protection change or IP Allow policy was performed.

Consequences:

- Snapshot existence and provenance are verified; **restore execution is not verified**.
- The earlier disposable PostgreSQL logical dump/restore drill is CI evidence only and does not substitute for Neon Primary snapshot restoration.
- Total branch count is now 10/10 and root-branch count is 3. Both quotas matter: the migration workflow needs one additional child branch, while the restore test needs one additional root branch. No slot remains under the observed current limits.
- The only manual snapshot slot is currently occupied by `snap-floral-sea-bcug7fd3`; the current automatic snapshot schedule is empty.
- Do not delete branches or snapshots, replace the Primary, finalize a restore, or upgrade the Neon plan automatically to make room.
- The recommended quota/security path is an owner-approved Neon Scale upgrade before the window, followed by verification of the effective quotas, protection of the Production primary, a fresh Primary snapshot, a non-finalizing restore test, and schema/data identity checks. Scale is usage-based with no monthly minimum; the higher compute rate is the cost of the larger protection/recovery envelope. Launch is acceptable only as the lower-cost alternative if the owner accepts two protected branches and a 7-day history window. No upgrade or branch-protection change is authorized by this runbook. Do not enable IP Allow until the actual Vercel outbound IP range is established and validated.
- Without the approved capacity change and successful restore test, the Production migration remains **NO-GO**. Do not treat the existing snapshot alone as an executable rollback.

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

**Current limitation:** the Production 67-route collector/evidence writer and a valid restore proof do not exist yet. Therefore both manual workflows are prepared but must not be dispatched now. Production remains **NO-GO** until the restore quota is resolved, an actual restore proof is created, the exact migration candidate passes, the 67-route collector can produce exact-deployment evidence, and the release/deploy gates are independently reviewed.

## Mandatory pre-window gates

Do not enter the Production write phase unless all are true:

- PR #212 and all required production-activation code changes are independently reviewed, merged, and green on the exact selected main SHA.
- A fresh disposable child branch from the current Primary has passed the official migration runner with direct connection identity and ledger SHA-256 rows for 063–067 and 069.
- The exact Production deployment candidate has been built and smoke-tested with signed-route enforcement still off; its source SHA, database branch, package identity and migration set are fixed and recorded.
- The Production HMAC rotation workflow passed static contract tests (5/5), but it has not been dispatched. The `opscore_security` schema and `context_hmac_keys` table are absent on Primary because migration 063 has not been applied; there are **zero Production HMAC key rows**, so no old/new Production key overlap exists yet. The overlap-and-rollback behavior is designed only; it has not been executed. No key secret is placed in logs or documentation.
- The real Production 67-route collector/evidence writer is **not implemented and not available**. It must prove session, tenant, backend PID, transaction, raw-GUC tamper denial, cross-tenant read/write denial and cleanup per route, bound to the exact commit, pipeline, Production Neon branch and Vercel deployment. It must also solve the cold-start proof/bootstrap sequencing without weakening the fail-closed gate.
- A valid, hash-pinned **non-finalizing restore proof does not exist**. The snapshot `snap-floral-sea-bcug7fd3` remains listed, but its restore attempt failed with `root branches limit exceeded`; it is not an executable rollback proof. After an owner-approved Neon Scale upgrade, verify the new quotas, protect Primary, create a fresh pre-window Primary snapshot, restore it to a separate root branch and produce `PRODUCTION_PRIMARY_RESTORE_PROOF.json` with its GitHub Environment SHA-256 secret. If the snapshot cannot be taken, restored, validated and pinned, abort the Primary migration. The automatic snapshot schedule must also be populated and verified under the approved plan.
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

The valid non-finalizing restore is `br-quiet-poetry-bc3uo0u3`. The proof file
in this change is rebound to that branch, and its digest must replace the old
`OPSC_PRODUCTION_RESTORE_PROOF_SHA256` GitHub Environment secret before the
Production migration workflow can pass. The old digest is no longer valid for
the corrected proof bytes.

### Current Neon capacity reconciliation

The active inventory after creating the verified restore branch is 5 branches:
Primary, the older restore-drill root, `vercel-dev`, the earlier invalid
`br-divine-fog-bcki2xa4` child, and the verified restore branch
`br-quiet-poetry-bc3uo0u3`. There are 3 root branches. Do not claim the active
count is 3, and do not delete the older or invalid evidence branches as an
automatic cleanup step.

### Production migration boundary

This restore proves snapshot provenance and the enumerated read-only checks.
It does not prove row-by-row equality, a rollback RPO/RTO, or 67-route HTTP
acceptance. Production migration 063–067 and 069 remain un-applied. The chosen
maintenance window remains 18 November 2026, 02:00–04:00 Africa/Cairo. The
Production pin remains `4017497068defa9c1d0761fcb07bc746925e002a`; no new Vercel
deployment, HMAC rotation, or signed-route activation was started.
