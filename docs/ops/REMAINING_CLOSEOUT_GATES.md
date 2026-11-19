# Current source, hosted Production, and commercial closeout — 2026-11-19

This register is the current evidence ledger. It distinguishes source/CI acceptance, Vercel deployment identity, Production behavioral certification, Neon recovery parity, and commercial/legal rights. No state is upgraded from UNVERIFIED to PASS by documentation alone.

## Immutable references

| System | Current state |
|---|---|
| GitHub repository | `mosamiryamany-hub/opscore-platform` |
| Current main | `e1d6c1b7939684e0f55d9f95f102b53687f9544b` |
| Main protection | Enabled |
| Vercel project | `opscore-platform` / `prj_8jMqBt0l6OALicWSwQ3ECQTn8yPe` |
| Current Vercel Production deployment | `dpl_9BbbFdVocyY73Mh7dTRyTAPy71J3`, READY |
| Production alias | `opscore-platform.vercel.app` |
| Production deployment source SHA | `e1d6c1b7939684e0f55d9f95f102b53687f9544b` |
| Neon project | `summer-leaf-18448271` |
| Neon Primary | `br-proud-salad-bcshhdap` / `main` |
| Neon restore branch | `br-calm-poetry-bc7l7wik` |
| Product version | `0.11.62` |

## GitHub and CI

| Run | Result | Boundary |
|---|---|---|
| [44520992630 OpsCore CI](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44520992630) | SUCCESS | Same-commit source/regression CI |
| [44520992632 vercel-deploy push](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44520992632) | SUCCESS | Source verify + disposable PostgreSQL 18 acceptance + contract gate; Production deploy job skipped |
| [44529428910 authorized workflow_dispatch](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44529428910) | FAILURE at deploy step 13 | Source verify, disposable PostgreSQL 18 acceptance, and contract gate passed; paid-plan/capacity preflight failed; later candidate and promotion steps skipped |

Run 44529428910 produced CI artifact `14532353558`, named `signed-tenant-postgres-18-ci-coverage-44529428910`. Its route coverage is CI/disposable PostgreSQL scope. It does not certify 67 Production routes.

## Vercel Production pin versus release identity

Vercel metadata confirms the Production deployment is READY, targets the Production environment, owns `opscore-platform.vercel.app`, and records the exact current main SHA. However, the deployment's Git metadata is not the required embedded `github-actions-cli-assertion`.

The latest operator-provided `/api/verify/release` report states:
- `sourceCommitIdentitySource = unverified`
- commit-bound CI verification = PASS
- commercial release closure = UNVERIFIED
- Production acceptance evidence = NOT_VERIFIED
- Production session tenant boundary = NOT_VERIFIED
- Production recovery bundle = NOT_VERIFIED
- Production-wide isolation certification = NOT_CERTIFIED

The Production deployment was created outside the authorized GitHub Actions candidate/promotion chain. The generated identity file is intentionally ignored by Git and is created during the workflow. The subsequent workflow run failed at preflight before candidate build, evidence embedding, staged deployment, or promotion. Do not fabricate that identity or rebind a different run to this deployment.

## Current Neon state

| Check | Result |
|---|---|
| PostgreSQL version | 18.7 |
| Organization plan | Free |
| Branch count | 4 retained branches |
| Primary branch ready | Yes |
| Primary branch protected | No |
| Scheduled snapshot schedule | Empty |
| Manual snapshot | `snap-aged-thunder-bcsxc1a5` |
| Restore branch state | Ready; restored from the recorded snapshot |
| Full row-content parity | NOT VERIFIED |

Read-only row-content hashes over the 136 public base tables differ in six tables: `activity_log`, `audit_log`, `firewall_rate_buckets`, `integration_outbox`, `organizations`, and `users`. This may represent expected data drift after the snapshot; it is not proof of snapshot corruption. It prevents an exact full-parity claim. Preserve Primary and all recovery branches.

The earlier 2026-11-19 read-only Primary catalog audit recorded 135/136 public base tables with RLS enabled and FORCE RLS; `spatial_ref_sys` was the PostGIS extension-owned exception. It counted 278 policies and 11/11 public SECURITY DEFINER functions with pinned search paths. Its source commit was `0edd7d8c855e1dd4645979c05fd30be105dff369`; a new exact-current-deployment behavioral proof remains open.

## Credentials

Vercel environment metadata confirms the production database URLs and tenant-context HMAC values are stored as Sensitive/Secret variables. Secret bytes were not read into this register and must never be copied into buyer material. The `AUTH_MODE` production setting is `local`; the Control Plane login form is configured in source. A separate login route is being added in this branch and is not live until merged and deployed.

## Open hard gates

| Gate | Current status | Required evidence |
|---|---|---|
| GitHub Actions embedded deployment identity | OPEN | Deployment built and staged through the authorized workflow with matching identity file, run ID, attempt, commit and package SHA |
| Current Production acceptance proof | NOT_VERIFIED | Exact-deployment evidence file present, SHA-256 recomputed and verified in the running bundle |
| 67-route Production signed-tenant coverage | NOT ESTABLISHED | All 67 routes with two signed tenants, exact deployment/run/Primary binding, and zero residue |
| Production session tenant boundary | NOT_VERIFIED | Exact-deployment dual-tenant session/PID/transaction binding, cross-tenant denial and cleanup |
| Production recovery bundle | NOT_VERIFIED | Exact-Primary recovery-point evidence, cleanup, signed manifest and full data parity |
| Production-wide isolation certification | NOT_CERTIFIED | The complete route, session, recovery, acceptance, identity and certification gates must pass together |
| Neon Primary protection/backups | PLAN-LIMITED | Eligible Neon plan, protected Primary, supported automated snapshot/PITR schedule, and fresh verified restore |
| Vercel commercial plan eligibility | PLAN-LIMITED | Commercial plan entitlement that passes the source preflight |
| Current-main buyer release archive | NOT PRODUCED | Successful Secure Release workflow on the exact current main; archive, SHA-256, SBOM, provenance and external release statement |
| License / distribution authority | NOT GRANTED | Rights-holder approval and completed buyer-specific signed License Schedule bound to the archive SHA-256 |
| Terms / Privacy / Pricing pages | NOT PUBLISHED | Legal entity, jurisdiction, data-controller/processor details, retention, contact, commercial model and approved price copy |
| External 60-second monitor | NOT CONFIGURED | A supported external monitor/provider and authorized budget; GitHub scheduled workflows are not a 60-second monitor |

## Operational boundaries

1. Do not set release/certification flags manually.
2. Do not promote the current Vercel deployment as certified; it is the hosted pin, not an attested release.
3. Do not change Neon Primary data, finalize a different restore, delete any branch/snapshot, or rewrite connection credentials as a substitute for proof.
4. Do not rerun migrations 063–069; the prior Primary migration audit matched source content for those recorded migration entries.
5. Do not create legal, privacy, pricing, or license statements with invented legal entities, terms, prices or rights.
6. Keep all customer-facing claims aligned to the public live proof endpoints and exact artifact SHA.

## Closeout decision

**Production and commercial closeout are still OPEN.** The hosting pin is current and the source/CI acceptance is green, but Production release identity, Production tenant behavior, restore parity, current-main source package, plan eligibility, and buyer-specific rights are not yet proven.