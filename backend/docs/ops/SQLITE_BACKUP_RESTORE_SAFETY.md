# SQLite backup and restore safety

These commands operate only on a local SQLite file selected by `SQLITE_PATH`. They do not back up, restore, or certify the Neon/PostgreSQL database used by the hosted runtime.

## Backup contract

`npm run backup -- <destination>` opens the configured database through `openDb`, checks SQLite integrity and foreign-key consistency, creates a unique temporary copy in the destination directory with `VACUUM INTO`, verifies the staged file, restricts it to owner-only access (`0600`), and renames it over the destination. A failed backup leaves the preceding backup byte-for-byte intact.

## Restore contract

`npm run restore -- <backup-file>` is a **Linux-only maintenance operation**. It:

1. Stages the incoming database beside the destination, sets permissions to `0600`, fsyncs it, and validates SQLite integrity and foreign keys.
2. Acquires an exclusive per-database maintenance fence. New `openDb` connections are refused while the fence exists.
3. Rejects active application leases. Stale leases are discarded only when PID, process-start identity, and boot identity prove the owning process has exited.
4. Scans Linux `/proc/<pid>/fd` for open file descriptors to the destination inode. An incomplete process scan is a hard failure; the restore never treats an unreadable process table as proof of quiescence.
5. Rechecks WAL, SHM, and rollback-journal sidecars; makes a private, byte-verified `.before-restore` copy that it will not overwrite; then replaces the destination with a same-filesystem rename.
6. Runs post-swap integrity and foreign-key checks. If they fail, it restores the prior bytes from `.before-restore`, re-runs integrity verification on the rolled-back database, and checks the restored SHA-256 against the pre-swap SHA-256. A rollback failure is reported as `RESTORE_ROLLBACK_FAILED`; a successful rollback after a failed candidate is reported as `RESTORE_POST_SWAP_VERIFICATION_FAILED_ROLLED_BACK`.

The exclusive fence is released only after success or a completed rollback. The safety copy is retained for operator review; a later restore will refuse to overwrite it until it is explicitly archived or removed by an operator.

## Operational boundary

Stop the application server, workers, scheduled jobs, and any external tool that may use the target SQLite file before restore. The process lease covers all repository-managed `openDb` connections; the Linux descriptor scan also catches raw SQLite file handles visible in the current PID namespace. A remote process on another host or in another PID namespace that shares the same file is not visible to `/proc`; shared/network-filesystem SQLite use is unsupported. Run SQLite on one Linux host with a local filesystem and do not restore while another host or container can access the file.

The restore operation fails closed on non-Linux systems because a complete process-descriptor scan is unavailable there. Do not manually remove an active `.opscore-lifecycle/maintenance.lock`. A stale lock whose owner died unexpectedly should be investigated before recovery is retried. A malformed or unverifiable lease is treated as active, not discarded.

## Verification

`npm run backup:verify` runs disposable recovery tests that include:

- failed backup preserves the prior backup byte-for-byte;
- backup and restore reject source/destination identity and active SQLite sidecars;
- an open application-managed connection blocks restore;
- a raw `DatabaseSync` handle that bypasses `openDb` is detected by Linux process-descriptor inspection;
- the maintenance fence prevents new `openDb` connections;
- a fault is injected after the candidate database has replaced the destination, forcing the real rollback path; the test verifies the original database bytes, safety-copy bytes, and data are restored;
- a separate post-swap fault with no previous destination proves the incomplete destination is removed.

A passing SQLite self-test proves only this local-file recovery contract. It is not evidence of Neon instant restore, historical PITR, automated managed backup retention, PostgreSQL role/RLS parity on a restored branch, or Production recovery qualification.
