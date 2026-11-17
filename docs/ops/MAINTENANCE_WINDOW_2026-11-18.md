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
5. The current application policy still gates signed operational routes to `VERCEL_ENV=preview`. Current Vercel deploy workflow's Production job is hard-disabled (`if: false && ...`). Production env inventory shows HMAC keys and the signed-route switches in Preview only. Flipping environment flags alone is not a Production activation plan.

## Mandatory pre-window gates

Do not enter the Production write phase unless all are true:

- PR #212 and all required production-activation code changes are independently reviewed, merged, and green on the exact selected main SHA.
- A fresh disposable child branch from the current Primary has passed the official migration runner with direct connection identity and ledger SHA-256 rows for 063–067 and 069.
- The exact Production deployment candidate has been built and smoke-tested with signed-route enforcement still off; its source SHA, database branch, package identity and migration set are fixed and recorded.
- A production-safe HMAC rotation/dual-key overlap/retire/rollback procedure is tested on the isolated candidate; no key secret is placed in logs or documentation.
- The real Production 67-route collector is available and proves session, tenant, backend PID, transaction, raw-GUC tamper denial, cross-tenant read/write denial and cleanup per route, bound to the exact commit, pipeline, Production Neon branch and Vercel deployment.
- A recoverable **current** Primary snapshot is confirmed. The existing snapshot above is roughly 13h 51m old at the beginning of the window; confirm it still exists and take a new Primary snapshot immediately before writes if the Neon snapshot quota allows it. There is no automatic snapshot schedule. If a fresh snapshot cannot be taken, validated or restored to a matching branch, abort the Primary migration.
- A Production migration workflow uses a direct Neon endpoint, the official runner, and exact `OPSC_MIGRATION_TARGET_CLASS=production`, `OPSC_MIGRATION_ALLOW_PRODUCTION=1`, project/branch/host/database confirmations. No manual `psql -f` path and no pooled endpoint.
- A deployment workflow exists for the reviewed exact SHA, with explicit Production environment approval and live post-deploy evidence; the currently hard-disabled Production deploy job must not be assumed executable.

## In-window sequence — 120-minute ceiling

| Cairo time | Budget | Action / gate |
|---|---:|---|
| 02:00–02:10 | 10 min | Freeze changes; verify exact main SHA, current Production deploy/branch/database identity, snapshot availability and service health. Take and verify a fresh Primary snapshot. Any mismatch or snapshot failure = **NO-GO**. |
| 02:10–02:25 | 15 min | Reconfirm the candidate branch's official runner report, all required migration ledger SHA-256 values (063–067, 069), role privileges, forced RLS, zero remaining direct tenant GUC policies and technician trail schema. |
| 02:25–02:45 | 20 min | Verify reviewed Production candidate deployment is READY on the exact SHA with signed-route switches OFF. Run read-only health, deployment identity, database identity and baseline login/session smoke. |
| 02:45–03:05 | 20 min | Apply the signed-context migrations through the approved Production runner only; verify ledger and schema postconditions immediately. Any error = stop; no ad-hoc SQL repair. |
| 03:05–03:25 | 20 min | Apply the approved HMAC overlap rotation and limited canary activation only after the new deployment and schema match. Keep old key valid during overlap; test signed positive, invalid signature, expiry, replay, wrong tenant and backend/transaction binding. |
| 03:25–03:45 | 20 min | Execute commit/deployment/branch-bound Production smoke and the complete 67-route evidence collector. If any route is missing, evidence is rebound, cleanup fails, or session/tenant boundaries fail = **NO-GO**. |
| 03:45–04:00 | 15 min | GO/NO-GO, freeze evidence and either keep canary at approved limited scope or execute the tested rollback. Do not use this period to continue an unfinished migration. |

The final 15 minutes are a decision/rollback reserve, not extra implementation time. Stop initiating new changes by 03:25.

## Rollback triggers and actions

Immediate NO-GO triggers: login/session errors above the agreed baseline; a failed tenant A/B isolation assertion; signed-context verification/key lookup errors; missing/mismatched migration ledger SHA; RLS/policy postcondition failure; any uncovered route; Production commit/deployment/branch mismatch; cleanup failure; snapshot/restore verification failure.

On trigger:
1. Stop expanding canary and keep/restore the Production traffic hold using the approved release procedure.
2. Roll back Vercel to the exact previously verified deployment.
3. Do not automatically finalize a Neon restore branch. Verify the restore branch, schema/data identity and snapshot provenance first; primary replacement requires explicit operator approval and exact target confirmation.
4. Re-run health/login/session/database identity checks against the old deployment and record a run-bound rollback report.
5. If restoration cannot be proven within the reserve, remain in maintenance/hold rather than reopen traffic on an unknown state.

## Explicit exclusions

- No Production schema write, HMAC Production key installation/rotation, signed-route Production flag change or Production deploy before the approved window and all mandatory pre-window gates.
- No automatic deletion of Neon branches or snapshots to make capacity.
- No Neon/Vercel plan upgrade without prior cost approval.
- No claim of full Production 67-route coverage until the actual Production evidence file is generated and verified against the exact deployment.
- Mobile store signing, native-speaker translation review and licensed map-provider work remain separate buyer residuals; this window does not close them.

## Decision

The time window is selected, but the Production release is **not yet GO-approved**. The window authorizes a controlled decision process, not a presumption that all gates will pass. At 02:00, proceed only if every mandatory pre-window gate above is already PASS; otherwise abort and reschedule.