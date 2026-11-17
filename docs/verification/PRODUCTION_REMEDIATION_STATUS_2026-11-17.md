# Production remediation status — 2026-11-17

## Classification

**Production certification: NOT VERIFIED / HOLD.**

This record distinguishes implemented configuration from evidence that has actually been executed against the deployed Production runtime. A merged source change, GitHub CI run, read-only catalog check, deployment identity, or a branch-clone row-count comparison is not by itself a Production tenant-isolation certificate or a point-in-time restore drill.

## Implemented in the remediation branch (not yet merged or deployed)

1. **Authentication edge rate limiting**
   - The active Vercel custom rule for POST /api/v1/auth/login and POST /api/v1/auth/mobile-login now enforces a fixed-window limit of 60 requests per source IP per 60 seconds.
   - The rule is active and validated. Exceeding the limit is mitigated by the Vercel rate-limit action (HTTP 429).
   - Other managed rulesets remain in Log mode pending observed traffic, false-positive review, and a separate narrowly scoped enforcement decision.

2. **Production hold and fail-closed release gate**
   - The Production environment variables have been corrected for future deployments: OPSC_PRODUCTION_HOLD=true, OPSC_RELEASE_VERIFIED=false, OPSC_PRODUCTION_ISOLATION_CERTIFICATION=NOT_CERTIFIED, and OPSC_PRODUCTION_BEHAVIORAL_EVIDENCE=false.
   - production-operator-open has been removed: OPSC_PRODUCTION_HOLD=false cannot open Production unless the actual embedded release verifier returns true.
   - A held deployment enters an explicit maintenance response rather than failing the entire Function during module initialization. Read-only health and release/deployment/database verification GET routes remain accessible; all other routes return HTTP 503 with Retry-After.
   - Deployment boundary: Vercel environment changes apply to new deployments. The existing immutable Production deployment has not been redeployed by this work. The source branch is not deployed.

3. **Evidence identity**
   - The session-isolation and recovery collectors read GET /api/verify/release from the approved Production origin before any probe writes or recovery-branch creation.
   - The expected deployed SHA is an explicit workflow input. The served commit must match it, the served CI commit must match the served commit, and the current deployment ID, Production environment, main ref, and CI pipeline ID must be identifiable.
   - Collector workflow SHA/run ID are stored separately and are no longer substituted for the deployed source SHA/pipeline.
   - Evidence readers require the same Vercel deployment ID, source commit, CI pipeline, Neon branch, and explicitly configured Production database name; legacy evidence with evidenceRebind remains invalid.
   - Neon connection API requests explicitly request pooled=false; returned -pooler endpoints fail closed for psql-based verification/cleanup.
   - Recovery evidence is schema v3 and reports branch-capacity exhaustion as an explicit BLOCKED artifact without deleting an existing branch.
   - The manual evidence workflow requires an expected Production SHA, database name, role name, branch capacity, and explicit confirmation. The live write-probe job runs only after the recovery-point job succeeds.

## Neon plan blockers — not resolved in this branch

Read-only inspection of project summer-leaf-18448271 on 2026-11-17 found:

- Plan: Free.
- Primary branch: br-proud-salad-bcshhdap, ready, not protected.
- Branch count: 10 / 10.
- History retention: 21,600 seconds (6 hours).
- No automatic snapshot schedule configured.
- The only existing manual snapshot was created from a different recovery branch, not the primary branch.
- Creating a new primary-branch snapshot was rejected because the snapshot quota was full.
- Creating a daily snapshot schedule was rejected because scheduled backups are not enabled for this project.
- Protecting the primary branch was rejected because the current plan has reached its protected-branch limit; Neon reported that a plan upgrade or reducing existing protected branches is required.

No branch or snapshot was deleted. No plan upgrade or billing change was made.

### Recovery options

- Neon-native: move to a plan that supports the required protected branches, history retention, and recovery capacity; then protect the Production branch and configure/test the available backup schedule. Verify the effective retention window and perform a restore drill.
- Independent backup: provision a buyer/vendor-controlled S3-compatible object-storage destination and credentials, then schedule direct (unpooled) pg_dump exports with encryption, immutable/versioned retention, checksums, monitoring, and periodic isolated pg_restore drills. This destination is not configured in the current environment, so no external-backup claim is made.

A branch clone plus table-count comparison is only a branch-point recovery check. It does not prove row-content integrity, point-in-time recovery, or RPO/RTO.

## Production route and trust-boundary blockers — not resolved in this branch

1. **67-route signed-session Production matrix:** the current 67-entry route manifest and 67-route behavioral acceptance run in disposable PostgreSQL 18 CI. There is no Production route-matrix collector in the current repository. The existing release-proof validator requires a Production evidence artifact with 67 per-route results, but this branch does not fabricate one or re-label CI results as Production. A dedicated route runner still needs a reviewed fixture strategy, route-specific setup/cleanup, bounded writes, audit retention, authorization cases, and exact-deployment evidence binding.
2. **Tenant-context trust-boundary audit:** the existing 2026-11-14 audit records unresolved concerns around caller-settable tenant GUCs, membership resolution, and privileged identity-table/worker paths. CI tamper-resistance results do not close this separate audit. It requires a fresh threat-model review and targeted remediation/tests before tenant isolation can be certified.
3. **Database identity:** OPSC_PRODUCTION_DATABASE_NAME is now explicitly configured as opscore_acceptance, based on the observed application-schema database on the configured Neon branch and historical Production evidence. Every collector must still independently verify that the returned Neon endpoint belongs to the configured project/branch and that the selected database/role identity matches before writing. No fallback to neondb or another acceptance database is permitted.

## Current operational decisions

- No Production deployment/redeploy was performed.
- No Production tenant probe or production data write was performed by this remediation.
- No migration was applied to the live Neon database.
- No WAF-wide managed-rule block mode was enabled.
- No Neon branch or snapshot was deleted.
- No Production certification or commercial closure is claimed.

## Required exit conditions

1. Merge and deploy the reviewed fail-closed maintenance/evidence changes through the controlled release path; verify /api/health and read-only proof endpoints remain available while operational routes return 503 under HOLD.
2. Resolve Neon recovery capacity/plan or provision external encrypted backup storage; obtain a recovery artifact and complete an isolated restore drill.
3. Run the recovery-point workflow with exact served Production SHA, verified database name, direct endpoint, and explicit authorization. Only after success, run the signed dual-tenant Production HTTP probe and verify cleanup.
4. Build and independently review a genuine Production 67-route signed-session runner; collect 67/67 commit-, pipeline-, deployment-, database-, and branch-bound HTTP results from the actual live Production deployment.
5. Close the separate tenant-context trust-boundary audit and obtain independent security review.
6. Only then may release proof flags be re-enabled in a new deployment. Never manually set a certification flag to make a gate pass.

## Additional staged-deployment blocker discovered during PR CI review

The existing `.github/workflows/vercel-deploy.yml` collects recovery/session/67-route Production evidence **before** it creates its staged no-domain deployment. That workflow then compares these reports to the candidate `GITHUB_SHA` and `GITHUB_RUN_ID`. The remediation collectors now deliberately bind reports to the deployment actually served by `/api/verify/release` and to that deployment's CI pipeline. A pre-deploy candidate cannot truthfully be represented as the current live deployment, so those old step orders are incompatible and must not be patched by rebinding old reports.

There is a second dependency: Production HOLD returns 503 on operational paths. A future staged acceptance run therefore needs a narrowly authenticated, test-only access path for the exact CI OIDC identity, limited to the route manifest and the staged no-domain deployment. Normal public traffic must remain held. No generic header, public bypass flag, reusable shared secret, or operator-open mode is acceptable. The probe identity must be cryptographically verified (for example Vercel Trusted Sources/OIDC), scoped to one run/deployment and short-lived, and audited. This staged probe-access path and the genuine Production 67-route runner are not implemented in this PR.

**Consequence:** keep Production promotion blocked. The manual recovery/session collector is not yet an end-to-end staged candidate acceptance solution; do not use it to certify a future candidate. Implement and independently review the staged OIDC path, then restructure promotion so a candidate is first staged without domain, the exact staged deployment is probed, evidence is generated against that exact deployment/commit/pipeline/database/Neon branch, and only that same verified deployment can be promoted.
