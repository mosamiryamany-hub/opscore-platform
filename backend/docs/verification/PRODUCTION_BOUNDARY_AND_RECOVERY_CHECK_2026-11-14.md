# Production tenant-boundary and recovery verification — 2026-11-14

## Disposition

This record documents read-only checks against the live OpsCore production Neon database and a separate point-in-time branch clone. It does **not** claim production HTTP-session certification or native production PITR certification.

| Gate | Evidence disposition | Boundary |
|---|---|---|
| Production tenant session boundary | `PASS_TEST_SCOPE` | Live PostgreSQL RLS context test for two existing tenants; HTTP-authenticated session path remains `NOT_VERIFIED` |
| Production recovery bundle | `PASS_TEST_SCOPE` | Current-state Neon branch clone, exact row-count parity across all 135 public base tables; native snapshot/PITR remains `NOT_VERIFIED` |
| Production isolation certification | `NOT_CERTIFIED` | Requires real authenticated production sessions and path-by-path behavioral evidence |

## Source and environment

- Repository: `mosamiryamany-hub/opscore-platform`
- Main commit observed: `59c8f60a961db8a5f16bd2cf923bc9f327839278`
- Neon project: `summer-leaf-18448271` (`opscore-production`)
- Production branch: `br-wispy-term-bcrqqj84` (`main`)
- Database: `opscore_acceptance`
- Region: `aws-us-east-1`
- PostgreSQL major version: 18
- Production runtime role: `opscore_runtime`

## 1. Live tenant RLS context test

The production role attributes were read from `pg_roles`:

- `rolsuper = false`
- `rolbypassrls = false`
- `rolcanlogin = true`

The live production identity tables contained:

- organizations: 2
- users: 2
- memberships: 2
- sessions: 0
- customers: 0
- work_orders: 0

Two read-only transactions were executed using the actual `opscore_runtime` database role. Each transaction set transaction-local `app.tenant_id`, `app.user_id`, and `app.access_mode='field'` to the corresponding existing organization/user pair, then queried tenant-scoped tables.

| Check | Tenant A context | Tenant B context |
|---|---:|---:|
| Visible organizations | 1 | 1 |
| Visible users | 1 | 1 |
| Visible memberships | 1 | 1 |
| Visible customers | 0 | 0 |
| Visible work orders | 0 | 0 |
| Rows from the other tenant's organization | 0 | 0 |
| Rows for the other tenant's user | 0 | 0 |
| Rows from the other tenant's memberships | 0 | 0 |

These are live database-level RLS results. The GUC context was set directly for this test; this is **not** proof that the production HTTP authentication flow issued a real session or that every API route was exercised under those sessions.

A separate inventory found 135 public base tables: 134 had both RLS enabled and FORCE RLS enabled. The sole exception was PostGIS reference table `spatial_ref_sys`, which had neither flag.

### Session-path limitation

The production `sessions` table contained zero rows at test time. No credentials for the two existing users were supplied, and no production session was fabricated. Therefore the actual HTTP login → cookie/session → `/api/v1/me` → tenant route sequence, including cross-tenant HTTP probes, remains unverified. No authentication data was changed.

## 2. Recovery evidence

### Current-state clone

A separate Neon branch was created from the production branch at:

- Branch: `br-aged-rice-bc6re1m0`
- Name: `opscore-prod-recovery-point-20261114`
- Parent branch: `br-wispy-term-bcrqqj84`
- Parent LSN: `0/851D730`
- Parent timestamp: `2026-11-14T09:30:36Z`
- Branch state after creation: `ready`

The clone was queried read-only. Exact `count(*)` values were collected for every public base table on both production main and the clone:

- Production tables counted: 135
- Clone tables counted: 135
- Exact per-table row-count differences: 0

The aggregate counts also matched: organizations 2, users 2, memberships 2, sessions 0, customers 0, work_orders 0.

The clone's automatically created read-write compute endpoint was suspended after verification to limit ongoing compute usage. The branch remains a separate point-in-time branch clone. It is not an independent external backup and does not prove native PITR.

### Snapshot/PITR limitation

- Production automatic snapshot schedule: empty.
- Project history retention: 21,600 seconds (6 hours).
- Existing manual snapshot: `snap-lively-lab-bcezlz2o`, created 2026-11-10, expires 2026-12-11.
- A new manual snapshot request for the production branch was rejected by Neon with `snapshots limit exceeded`.
- No existing snapshot was deleted or replaced.
- The previously restored audit branch `br-muddy-flower-bcchwqr8` is ready but contains zero organizations, users, memberships, sessions, customers, and work orders; it does not represent the current production tenant state.

The current-state branch clone is useful recovery evidence, but the production snapshot/PITR gate remains `NOT_VERIFIED` until a fresh production recovery point can be created under an available Neon snapshot allowance and restored/validated without replacing the live production branch.

## 3. Production isolation certification

Certification remains `NOT_CERTIFIED`. The following evidence is still required:

1. Two real, authorized production user sessions (one per tenant), established through the actual application login flow.
2. Authenticated API checks using those sessions, including positive same-tenant reads and negative cross-tenant reads/mutations.
3. Full route coverage for the current tenant-data route inventory, with exact HTTP outcomes and cleanup proof.
4. Re-run after any relevant deployment or policy change, with immutable evidence bound to the deployed commit and production database identity.

The live database RLS context test above is positive evidence, but it cannot substitute for those application-level tests.

## Safety and change record

- No production table rows were inserted, updated, or deleted during this verification.
- No production schema, RLS policy, Vercel environment variable, or application deployment was changed.
- The two tenant RLS checks were read-only transactions.
- A separate branch clone was created; its compute was suspended after the row-count parity check.
- No existing snapshot or existing branch was deleted.
- The new recovery branch could not be protected because the current Neon plan rejected additional protected branches.

## Final honest status

- Database-level tenant RLS context: `PASS_TEST_SCOPE`.
- Current-state recovery branch clone parity: `PASS_TEST_SCOPE`.
- Real production HTTP session boundary: `NOT_VERIFIED`.
- Native production snapshot/PITR: `NOT_VERIFIED`.
- Production isolation certification: `NOT_CERTIFIED`.

Do not promote these results to full production certification without the remaining evidence above.
