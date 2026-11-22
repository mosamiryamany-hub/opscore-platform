# SQLite backup and restore safety

These scripts operate only on the local SQLite file selected by `SQLITE_PATH`. They do not create, validate, snapshot, or restore a Neon/PostgreSQL database, and their PASS output is not production database recovery evidence.

## Backup

`npm run backup -- <destination>` opens the existing SQLite source, checks SQLite integrity and foreign-key consistency, creates a new database with `VACUUM INTO` at a unique temporary path in the destination directory, verifies that staged file, restricts it to owner-only access (`0600`), and renames it over the destination. A failed backup leaves the previous destination untouched. Source and destination identity, empty source files, non-regular destinations, and destination WAL/SHM sidecars are rejected.

## Restore

`npm run restore -- <backup-file>` stages the source in the destination directory, validates the staged copy, and refuses source/destination identity or active destination/source WAL/SHM sidecars. When a destination exists, it preserves a private `.before-restore` safety copy before the replacement. The replacement is a same-filesystem rename; a failed post-replacement integrity or foreign-key check attempts an automatic rollback from that safety copy. Rollback failure is surfaced as `RESTORE_ROLLBACK_FAILED` and requires operator intervention. Restored database and safety-copy files are restricted to owner-only access (`0600`).

## Operational boundary

Stop every process that can read or write the target SQLite database before restore. The script detects WAL/SHM sidecars but cannot prove that no process has an open file handle. Run recovery on a filesystem that supports same-filesystem rename replacement (the CI and production Linux runtime). Keep an independent copy of the backup outside the target directory before performing a recovery exercise.

## Verification

`npm run backup:verify` runs the destructive-failure self-test against disposable temporary SQLite files. It covers integrity and foreign-key checks, preserving a previous backup after a failed backup, source/destination identity rejection, pre-restore safety copy, unchanged destination after an invalid restore, active sidecar rejection, and restrictive file permissions.

Passing these SQLite tests does not establish Neon PITR, managed backup schedule, PostgreSQL restore, Vercel deployment, or production recovery qualification.
