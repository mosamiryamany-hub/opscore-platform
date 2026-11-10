# OpsCore v0.11.61 — Recovery & Portability Control

**Release: v0.11.62**

This release adds two executable buyer-facing controls.

## Recovery drill
`backend/scripts/recovery-drill.js` creates a temporary SQLite backup with `VACUUM INTO`, verifies integrity and foreign keys, restores to a separate temporary database, and compares application table names and row counts. It does not replace the buyer's production database.

Command:
`npm run recovery:drill -- /path/to/opscore.sqlite`

## Export verification
`backend/scripts/verify-export.js` validates an `organization-export.json` produced by the existing tenant-scoped export endpoint. It recomputes the snapshot SHA-256 and checks the exported table structure and row limits.

Command:
`npm run export:verify -- /path/to/organization-export.json`

These controls prove local recovery/export integrity only. They do not establish production RPO/RTO, object-storage durability, PostgreSQL runtime certification, encryption-at-rest policy, or disaster-recovery certification in a buyer environment.
