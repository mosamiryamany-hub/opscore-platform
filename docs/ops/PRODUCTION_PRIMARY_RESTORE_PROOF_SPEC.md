# Production Neon Primary restore proof contract

This is a machine-verifiable prerequisite for
`.github/workflows/ops-apply-production-signed-context-migrations.yml`.
It is intentionally a specification only. **Do not create a PASS proof file from
a planned restore or from the CI logical dump/restore drill.** The proof may be
created only after a non-finalizing Neon restore from a real Production Primary
snapshot has completed and been inspected.

## Required evidence file

Path: `docs/ops/evidence/PRODUCTION_PRIMARY_RESTORE_PROOF.json`

The complete UTF-8 JSON bytes are SHA-256 hashed. The resulting digest must be
stored in the protected GitHub Environment secret
`OPSC_PRODUCTION_RESTORE_PROOF_SHA256`. The workflow recomputes the digest and
requires an exact match before connecting the migration runner to Production.

Required fields:

| Field | Requirement |
|---|---|
| `schemaVersion` | `opscore.neon-primary-restore-proof.v1` |
| `status` | `PASS`, only after a real Neon restore test |
| `projectId` | `summer-leaf-18448271` |
| `primaryBranchId` | `br-proud-salad-bcshhdap` |
| `snapshotId` | Exact manual snapshot ID used for the restore |
| `snapshotSourceBranchId` | `br-proud-salad-bcshhdap` |
| `restoreSnapshotId` | Must equal `snapshotId` |
| `restoreBranchId` | Exact new, non-primary restored branch ID |
| `restoreBranchState` | `ready` |
| `databaseName` | `opscore_acceptance` |
| `databaseIdentity` | `{ "databaseName": "opscore_acceptance", "roleName": "neondb_owner" }` |
| `testedAt` | Offset-aware ISO timestamp, no more than 24 hours old when migration workflow runs |
| `schemaSha256` | 64-character lowercase SHA-256 of the restored schema inventory |
| `tableInventorySha256` | 64-character lowercase SHA-256 of the restored public table inventory |
| `publicTableCount` | Positive integer |
| `checks` | All eight required checks listed below, each with `status: "PASS"` |

Required check IDs:

- `snapshot_provenance`
- `restore_branch_ready`
- `database_identity`
- `schema_catalog_read`
- `public_table_inventory`
- `migration_ledger_read`
- `core_table_read`
- `runtime_role_boundary`

The workflow independently rechecks the snapshot's existence and source branch,
the restore branch's readiness and `restored_from` snapshot identity, and the
proof's project, database, branch, timestamp and hash bindings. It then runs the
official migration runner in dry-run mode and requires the exact pending set
063–067 plus 069 before the first Production write.

## Evidence boundary

The proof is not a Production isolation certificate, not a row-content equality
certificate for every row, and not an RPO/RTO guarantee. It proves the stated
snapshot/restore provenance and read-only database checks only. The separate
Production 67-route signed-session evidence remains mandatory for route
activation and release certification.

The file must remain absent or non-PASS until the restore test is actually
completed. A missing proof, a mismatched digest, a stale timestamp, a deleted
snapshot, a non-ready restore branch, or any missing check causes the Production
migration workflow to fail before invoking the migration runner.


## Correct snapshot restore execution

The restore proof generator must call the Neon Restore Snapshot endpoint:
`POST /projects/{project_id}/snapshots/{snapshot_id}/restore`, with
`target_branch_id` bound to the Production Primary and
`finalize_restore: false`. A normal `POST /branches` call is not a snapshot
restore and must never be used to generate this proof.

Before writing the proof, the runner independently requires a ready non-primary
branch whose Neon metadata reports all of:
`restored_from == snapshotId`, `restore_status == "restored"`, and
`restored_as == primaryBranchId`. It then verifies direct database identity,
schema/table SHA-256 inventories, the exact 62-row migration baseline, the
absence of migrations 063–067 and 069, 135 public tables, the 134/134 RLS and
FORCE RLS counts, and the non-superuser/non-BYPASSRLS runtime role. It never
finalizes the restore or mutates Primary.
