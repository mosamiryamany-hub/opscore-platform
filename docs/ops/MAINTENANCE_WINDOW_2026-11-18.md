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

## Snapshot restore attempt — 17 November 2026

A non-finalizing restore test was attempted against the current manual Primary snapshot `snap-floral-sea-bcug7fd3`. Neon rejected creation of the restore branch with `root branches limit exceeded`. The snapshot is still listed and was not deleted or replaced; no restore branch was produced.

At the time of the attempt, the project exposed eight active branches, including exactly three root branches:
- `br-proud-salad-bcshhdap` — current Primary `main`
- `br-gentle-union-bcv2y6cf` — prior restore-test branch from `snap-spring-snow-bc1jiqqs`
- `br-wispy-term-bcrqqj84` — prior restore-drill root branch from `snap-lively-lab-bcezlz2o`

The observed Neon error is consistent with the documented Free-plan allowance of three root branches per project. The project API did not expose an explicit plan-name field, so the plan identity is not asserted. Other observed Free-equivalent limits are the six-hour history window, 1 GB total Postgres storage per project and one listed manual snapshot. The Neon Launch plan removes the hard per-branch Postgres storage cap and bills storage by actual GB-month usage. Current official plan guidance lists Launch at five root branches, 100 manual snapshots and up to seven days of history; Scale lists 25 root branches and up to 30 days. See Neon plan documentation: https://neon.com/docs/introduction/plans and root branch documentation: https://neon.com/docs/manage/branches.

Neon Launch is the lower-cost paid option: $0.106 per CU-hour, $0.35 per GB-month of database storage, $0.20 per GB-month of retained PITR history and $0.09 per GB-month of snapshot storage, with no monthly minimum. It includes 10 total branches, up to 5 root branches, 100 manual snapshots and up to 7 days of history; its protected-branch allowance is only 2. The existing eight branches plus a restore root and a migration child consume all ten, leaving no branch headroom. Neon Scale costs $0.222 per CU-hour (about 2.09× Launch) with the same published base storage/PITR/snapshot rates, no monthly minimum, 25 branches / 25 roots, up to 5 protected branches, 100 manual snapshots, up to 30 days of history, and IP Allow for protected-branch-only restrictions. Scale is the recommended commercial-production fit because it supports more than one retained protected recovery point and network-level branch restrictions; Launch is a constrained budget fallback. Extra branches beyond the included allowance cost $1.50 per branch-month, prorated hourly. See https://neon.com/docs/introduction/plans, https://neon.com/docs/manage/branches and https://neon.com/docs/guides/protected-branches.

Consequences:

- Snapshot existence and provenance are verified; **restore execution is not verified**.
- The earlier disposable PostgreSQL logical dump/restore drill is CI evidence only and does not substitute for Neon Primary snapshot restoration.
- Total branch count (8) and root-branch count (3) are separate limits. The corrected disposable migration workflow creates a child branch; the failed snapshot restore needs an additional root/backup branch.
- The only manual snapshot slot is currently occupied by `snap-floral-sea-bcug7fd3`; the current automatic snapshot schedule is empty.
- Do not delete branches or snapshots, replace the Primary, finalize a restore, or upgrade the Neon plan automatically to make room.
- The recommended quota/security path is an owner-approved Neon Scale upgrade before the window, followed by verification of the effective quotas, protection of the Production primary, a fresh Primary snapshot, a non-finalizing restore test, and schema/data identity checks. Scale is usage-based with no monthly minimum; the higher compute rate is the cost of the larger protection/recovery envelope. Launch is acceptable only as the lower-cost alternative if the owner accepts two protected branches and a 7-day history window. No upgrade or branch-protection change is authorized by this runbook. Do not enable IP Allow until the actual Vercel outbound IP range is established and validated.
- Without the approved capacity change and successful restore test, the Production migration remains **NO-GO**. Do not treat the existing snapshot alone as an executable rollback.

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

### Manual Production key rotation

Workflow: `.github/workflows/rotate-production-tenant-hmac.yml`

- Manual `workflow_dispatch` only, with the exact confirmation `ROTATE_PRODUCTION_TENANT_HMAC` and the protected GitHub `production` Environment.
- Verifies the exact Neon project/Primary/database/owner role and a direct non-pooler connection. It fails if migration 063 has not created `opscore_security.context_hmac_keys`.
- Generates a new 256-bit HMAC key, inserts it into the Primary key table, and syncs only the three Production HMAC variables in Vercel. It does not create or modify Preview/Development values.
- Old database key rows are intentionally left enabled and their expiry is not shortened. The workflow does not deploy, enable signed routes, change `OPSC_REQUIRE_SIGNED_TENANT_CONTEXT`, set `OPSC_PRODUCTION_HOLD`, or change `OPSC_RELEASE_VERIFIED`.
- Key environment changes affect the next deployment only. They do not change the currently running Production deployment.
- Rollback keeps the previous key row valid and points Production traffic back to the exact last verified deployment. Do not retire prior keys until the new deployment has completed the full signed-route soak and rollback reserve. Retirement is a separate, reviewed operation.

### Manual Production migration

Workflow: `.github/workflows/ops-apply-production-signed-context-migrations.yml`

- Manual `workflow_dispatch` only from `main`, exact confirmation `APPLY_PRODUCTION_SIGNED_CONTEXT_MIGRATIONS`, and protected GitHub `production` Environment approval.
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
- The manual HMAC rotation workflow and rollback procedure have passed isolated contract review; the Production key table exists, and the old key remains enabled throughout overlap. No key secret is placed in logs or documentation.
- The real Production 67-route collector is implemented and available. It must prove session, tenant, backend PID, transaction, raw-GUC tamper denial, cross-tenant read/write denial and cleanup per route, bound to the exact commit, pipeline, Production Neon branch and Vercel deployment. It must also solve the cold-start proof/bootstrap sequencing without weakening the fail-closed gate; the current collector/evidence writer is not yet implemented.
- A valid, hash-pinned **non-finalizing restore proof** exists for a real Primary snapshot, and the snapshot is still available. The existing `snap-floral-sea-bcug7fd3` has not passed restore. After an owner-approved Neon capacity upgrade, create a fresh pre-window Primary snapshot, restore it to a separate root branch and produce `PRODUCTION_PRIMARY_RESTORE_PROOF.json` with its GitHub Environment SHA-256 secret. If the snapshot cannot be taken, restored, validated and pinned, abort the Primary migration. The automatic snapshot schedule must also be populated and verified under the approved plan.
- A Production migration workflow uses a direct Neon endpoint, the official runner, and exact `OPSC_MIGRATION_TARGET_CLASS=production`, `OPSC_MIGRATION_ALLOW_PRODUCTION=1`, project/branch/host/database confirmations. No manual `psql -f` path and no pooled endpoint.
- A deployment workflow exists for the reviewed exact SHA, with explicit Production environment approval and live post-deploy evidence; the currently hard-disabled Production deploy job must not be assumed executable.

## In-window sequence — 120-minute ceiling

| Cairo time | Budget | Action / gate |
|---|---:|---|
| 02:00–02:10 | 10 min | Freeze changes; verify exact main SHA, current Production deploy/branch/database identity, snapshot availability and service health. Take and verify a fresh Primary snapshot. Any mismatch or snapshot failure = **NO-GO**. |
| 02:10–02:25 | 15 min | Reconfirm the candidate branch's official runner report, all required migration ledger SHA-256 values (063–067, 069), role privileges, forced RLS, zero remaining direct tenant GUC policies and technician trail schema. |
| 02:25–02:45 | 20 min | Verify reviewed Production candidate deployment is READY on the exact SHA with signed-route switches OFF. Run read-only health, deployment identity, database identity and baseline login/session smoke. |
| 02:45–03:05 | 20 min | Apply the signed-context migrations through the approved Production runner only; verify ledger and schema postconditions immediately. Any error = stop; no ad-hoc SQL repair. |
| 03:05–03:25 | 20 min | Run the approval-gated Production HMAC rotation only after schema checks. Verify the new key row and Production-only environment values; leave old key rows enabled. Do **not** activate signed-route flags unless a complete 67-route exact-deployment proof already exists and has passed the release verifier. |
| 03:25–03:45 | 20 min | Execute commit/deployment/branch-bound Production smoke and the complete 67-route evidence collector. If any route is missing, evidence is rebound, cleanup fails, or session/tenant boundaries fail = **NO-GO**. |
| 03:45–04:00 | 15 min | GO/NO-GO, freeze evidence and either keep canary at approved limited scope or execute the tested rollback. Do not use this period to continue an unfinished migration. |

The final 15 minutes are a decision/rollback reserve, not extra implementation time. Stop initiating new changes by 03:25.

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