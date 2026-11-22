# SQLite backup and restore safety

These commands operate only on a local SQLite file selected by `SQLITE_PATH`. They do not back up, restore, or certify the Neon/PostgreSQL database used by the hosted runtime.

## Backup contract

`npm run backup -- <destination>` opens the configured database through `openDb`, checks SQLite integrity and foreign-key consistency, creates a unique temporary copy in the destination directory with `VACUUM INTO`, verifies the staged file, restricts it to owner-only access (`0600`), and renames it over the destination. A failed backup leaves the preceding backup byte-for-byte intact.

## Restore contract

`npm run restore -- <backup-file>` is a **Linux-only maintenance operation**. It:

1. Stages the incoming database beside the destination, sets permissions to `0600`, fsyncs it, and validates SQLite integrity and foreign keys.
2. Acquires an exclusive per-database maintenance fence. New `openDb` connections are refused while the fence exists.
3. Rejects active application leases. Stale leases are discarded only when PID, process-start identity, and boot identity prove the owning process has exited.
4. Scans Linux `/proc/self/fd` for file descriptors in the restoring process itself. Cross-process repository-managed `openDb` connections are blocked by the lease/fence protocol in step 2. The database file must be owner-only (`0600`). Its parent directory must not be writable by group/other users unless the sticky bit is set (as on `/tmp`); an incomplete local descriptor scan is a hard failure.
5. Rechecks WAL, SHM, and rollback-journal sidecars; makes a private, byte-verified `.before-restore` copy that it will not overwrite; then replaces the destination with a same-filesystem rename.
6. Runs post-swap integrity and foreign-key checks. If they fail, it restores the prior bytes from `.before-restore`, re-runs integrity verification on the rolled-back database, and checks the restored SHA-256 against the pre-swap SHA-256. A rollback failure is reported as `RESTORE_ROLLBACK_FAILED`; a successful rollback after a failed candidate is reported as `RESTORE_POST_SWAP_VERIFICATION_FAILED_ROLLED_BACK`.

The exclusive fence is released only after success or a completed, verified rollback. If rollback itself fails, the fence is deliberately retained and all new application opens remain blocked. The CLI reports the restorer-process descriptor scan as PASS; it does not certify unmanaged raw descriptors in other processes, root/privileged processes, or external PID namespaces. The safety copy is retained for operator review; a later restore will refuse to overwrite it until it is explicitly archived or removed by an operator.

## Operational boundary

Stop the application server, workers, scheduled jobs, and every external tool that may use the target SQLite file before restore. The process lease covers repository-managed `openDb` connections across processes; the Linux descriptor scan catches raw handles in the restoring process only. Raw handles opened by any other process—including another process under the same UID—are not proven absent by this scan and must be prevented by stopping those processes before restore. The owner-only database file (`0600`) and parent-directory sticky-bit rule prevent ordinary users from replacing the file, but do not make open handles disappear. Root/privileged host processes and processes in another PID namespace or on another host are also outside the automated check and must be stopped by the operator. Shared/network-filesystem SQLite use is unsupported. Run SQLite on one Linux host with a local filesystem, and do not restore while another host, container, root process, privileged process, or other-UID process could still hold the file open.

The restore operation fails closed on non-Linux systems because a complete process-descriptor scan is unavailable there. Do not manually remove an active `.opscore-lifecycle/maintenance.lock`. Maintenance locks are never auto-cleared based only on a dead PID: a process may have died after swapping files but before verifying or rolling back. After a crash or `RESTORE_ROLLBACK_FAILED`, keep application access blocked; an operator must inspect the live DB, safety copy and temporary files, establish which bytes are valid, run integrity/FK checks, and only then explicitly resolve the maintenance lock. A malformed or unverifiable application lease is treated as active, not discarded.

## Verification

`npm run backup:verify` runs disposable recovery tests that include:

- failed backup preserves the prior backup byte-for-byte;
- backup and restore reject source/destination identity and active SQLite sidecars;
- an open application-managed connection blocks restore;
- a raw `DatabaseSync`/file handle that bypasses `openDb` is detected when held in the restoring process itself;
- newly created SQLite parent directories use mode `0700`, and a shared writable parent without the sticky bit is rejected;
- the maintenance fence prevents new `openDb` connections;
- a fault is injected after the candidate database has replaced the destination, forcing the real rollback path; the test verifies the original database bytes, safety-copy bytes, and data are restored;
- a separate post-swap fault with no previous destination proves the incomplete destination is removed;\n- an injected rollback-verification failure proves the maintenance fence remains and application opens stay blocked.

A passing SQLite self-test proves only this local-file recovery contract. It is not evidence of Neon instant restore, historical PITR, automated managed backup retention, PostgreSQL role/RLS parity on a restored branch, or Production recovery qualification.
