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
| `schemaVersion` | `opscore.neon-primary-restore-proof.v2` |
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
| `schemaSha256` | 64-character lowercase SHA-256 of the canonical schema-definition inventory (not a hash of schema names only) |
| `schemaInventoryItemCount` | Positive count of catalog objects included in the canonical schema inventory |
| `tableInventorySha256` | 64-character lowercase SHA-256 of the sorted public table-name inventory |
| `dataContentSha256` | 64-character lowercase SHA-256 over per-table row counts and per-row SHA-256 digests for all public tables |
| `publicTableCount` | Positive integer |
| `checks` | All nine required checks listed below, each with `status: "PASS"`; `schema_catalog_read` includes `schemaItemCount` and `definitionParityWithPrimary=true`; `public_table_inventory` includes `rowContentSha256`, `rowContentParityWithPrimary=true`, and `rlsExcludedExtensionOwnedTableCount` |

Required check IDs:

- `snapshot_provenance`
- `restore_branch_ready`
- `database_identity`
- `schema_catalog_read`
- `public_table_inventory`
- `migration_ledger_read` (the exact source SHA-256 values for migrations 063–069 must match the restore ledger; no 62-row pre-migration baseline is accepted)
- `signed_context_schema` (verified tenant-context definer/accessor, HMAC key-table schema, technician-trail RLS policies and tenant FKs, no direct tenant-GUC policy residuals; record key-row count without reading secret bytes)
- `core_table_read`
- `runtime_role_boundary`

The workflow independently rechecks the snapshot's existence and source branch,
the restore branch's readiness and `restored_from` snapshot identity, and the
proof's project, database, branch, timestamp and hash bindings. The read-only migration-state verifier then runs the official migration
runner in dry-run mode, requires no pending migrations, verifies exact
source-checksum skips for 063–069, and repeats schema/data parity plus
signed-context catalog checks. It performs zero Production schema writes and
must never reapply an already recorded migration.

## Evidence boundary

The proof is not a Production isolation certificate, not a backup portability or RPO/RTO guarantee, and not a substitute for the Production 67-route signed-session evidence. It proves the stated snapshot/restore provenance, a canonical schema-catalog fingerprint, and normalized row-content fingerprints for the public tables included in the inventory at the recorded test time only. Sequence current values, large objects, external object storage, and changes occurring after `testedAt` are outside that row-content fingerprint.

The schema fingerprint covers non-system namespaces and their owners/ACLs, extensions, relations and RLS flags, columns and defaults, constraints, indexes, policies, user functions, triggers, views, types/enums, and sequence definitions. The data fingerprint sorts each table's row JSON representation, computes a SHA-256 per row, and then hashes the table-name/count/digest inventory. The proof generator compares both fingerprints between the restored branch and the live Primary before writing the proof; the Production migration runner repeats that comparison immediately before its migration dry-run.

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
schema/table SHA-256 inventories, the exact source-checksummed migration
records 063–069, signed-context schema postconditions, all non-extension-owned
public application tables with both RLS and FORCE RLS (extension-owned objects
such as PostGIS `spatial_ref_sys` are explicitly excluded), and the
non-superuser/non-BYPASSRLS runtime role. It never finalizes the restore or
mutates Primary.
