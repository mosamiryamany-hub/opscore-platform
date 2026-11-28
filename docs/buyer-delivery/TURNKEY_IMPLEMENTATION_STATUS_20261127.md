# OpsCore Buyer Delivery — Turnkey / Self-Hosted Implementation Record

**Branch:** `feat/turnkey-buyer-delivery-20261127`  
**Base:** `main`  
**Status:** Partial implementation; not a releasable installer.  
**Production:** untouched.

## Implemented on this branch

### Buyer branding foundation
- Added `backend/branding.config.json` as the buyer-editable, non-secret source of brand identity.
- Added strict normalization in `backend/src/branding-config.js`: only an allowlisted public shape is returned; logo paths are same-origin paths; colors are six-digit hex; support links must be HTTPS; no arbitrary CSS/HTML is accepted.
- Added `GET /api/public/branding`, returning a public, cacheable branding read model with a bounded cache lifetime. Invalid configuration fails closed with HTTP 503.
- Added unit tests for the allowlist and unsafe input rejection.
- Mobile can save a buyer's HTTPS origin in Expo SecureStore and load the public branding name/tagline from that server. It no longer requires rebuilding the app solely to change its API origin.

### Mobile server selection
- Added a manual server-origin setup field to the Expo login screen.
- The origin is validated as HTTPS and origin-only (no credentials, path, query or fragment), then stored using device SecureStore.
- Manual URL entry is available. A custom-scheme deep-link shape (`opscore://configure?server=https://...`) can prefill the URL for user review; it is **not cryptographically signed** and is not auto-saved. Treat it only as an untrusted convenience input. QR generation/scanning is not implemented; no camera permission or QR library was added without its own threat-model and native-build validation.
- Existing native encrypted offline queue and SecureStore authentication are not replaced by browser storage.

### Encrypted PostgreSQL backup CLI
- Added `npm run backup:postgres:encrypted`.
- It uses `pg_dump` custom format, writes temporary files with restrictive permissions, encrypts the archive using AES-256-GCM, decrypts it into a temporary verification file, and checks archive readability with `pg_restore --list`.
- It never puts the database password in command-line arguments and does not print the connection string or encryption key.
- It honors `sslmode` and `sslrootcert` from the connection URL, plus explicit `PGSSLMODE`, `PGSSLROOTCERT` or `OPSC_PG_CA_CERT` overrides; production mode requires `verify-full`. Custom CA paths are checked before invoking libpq tools.
- It applies local retention by age after a successful archive validation.
- This is a CLI, **not yet a scheduled container or remote-object-storage integration**. It does not prove a full restore. The existing restore-drill command remains the required recovery proof.
- Keep the 32-byte base64 backup key outside the database and outside source control. Losing the key makes backups unrecoverable. Key rotation requires retaining prior keys for old backup generations.

## Existing capabilities discovered (not new claims)

- Expo mobile application exists at `mobile/`, with SecureStore and SQLCipher-backed Expo SQLite.
- `mobile/eas.json` already defines development, preview and production build profiles.
- The Android preview workflow already runs a local Gradle debug build; it is not a signed production APK.
- PWA shell and a public/static-only service-worker cache are in PR #496, not merged.
- SQLite demo seeding and reset commands already exist. The SQLite seed requires explicit demo passwords and refuses production / PostgreSQL. It currently creates a single demo organization and a small seed set, not the requested two-tenant / 15-technician / 50-work-order / encrypted-conversation scenario.
- A separate PostgreSQL demo seeder exists but is bound to a fixed Neon demo project/branch identity. It is **not** a portable self-hosted buyer seeder and must not be run against customer or production databases.
- SQLite backup/restore commands and PostgreSQL logical restore-drill code already exist. The new encrypted PostgreSQL backup command is an additional primitive, not a complete DR plan.

## Blocking engineering facts before a real one-command Compose installer

1. Existing source already contains `backend/docker/Dockerfile` and `backend/docker-compose.postgres.yml`. The Dockerfile builds the backend image; the Compose file provisions **PostgreSQL only**. It is not a complete app + database + TLS ingress + migration + backup stack, and it has not been qualified as a buyer installer.
2. The PostgreSQL migration runner now has an explicit `self-hosted` target. It pins the exact operator-supplied hostname and database, rejects poolers, requires `sslmode=verify-full`, `NODE_ENV=production`, the `opscore_migrator` role with `BYPASSRLS` (but not superuser/CREATEROLE/CREATEDB), an existing least-privileged `opscore_runtime` login, and exact host/database confirmation plus `OPSC_MIGRATION_ALLOW_SELF_HOSTED=1` before apply. This is an operator-pinned identity, not Neon API verification. The login role remains `opscore_migrator`; the initializer creates a local `neondb_owner` NOLOGIN/NOSUPERUSER/BYPASSRLS compatibility role, makes it database owner, and grants the migrator SET-only membership (no privilege inheritance). It also provisions `opscore_auth_definer` as a separate NOLOGIN/NOSUPERUSER/BYPASSRLS role for signed-context HMAC keys and SECURITY DEFINER functions; `neondb_owner` receives explicit INHERIT+SET membership so migrations can create and transfer those objects safely. The runner validates both role contracts, then switches to `neondb_owner` with `SET ROLE` for immutable historical migrations that explicitly reference that owner name. This is a local PostgreSQL role—not a Neon service or external dependency—and preserves historical migration bytes. The bootstrap policy accepts the dedicated migrator login only when `OPSC_DEPLOYMENT_MODE=self-hosted`.
3. The PostgreSQL init scripts create and validate separate runtime, migrator and worker roles without putting passwords in psql command-line arguments. The migration ledger explicitly requires `vector` and `pgcrypto` in migration 027 and PostGIS for GIS migrations. These extensions are now provisioned by the database administrator during first-volume initialization, before the non-superuser `opscore_migrator` runs; the migrator is not granted superuser. The DB-only Compose image is pinned to the tested PostGIS 18/3.7 base digest and installs pgvector 0.8.7 plus PostgreSQL contrib. Existing non-empty volumes do not rerun init scripts and require a separately controlled extension preflight. This extension-complete Compose path has not yet passed the full migration acceptance run.
4. A container image does not cryptographically hide source code. Anyone controlling the host can inspect image layers and application files. Private registry distribution, signed immutable images, license terms, and an entitlement mechanism can reduce casual exposure but cannot make code extraction impossible.
5. KOTS/Replicated is not a zero-cost default. Replicated's published pricing includes paid plans (for example a Compatibility Matrix offering) and cluster costs; use only after a commercial cost decision.
6. Coolify is self-hostable, but the customer still pays for the server, storage, network and operations. It can deploy Compose from Git; it does not create a missing safe Compose architecture for the product.
7. iOS PWA is not a native iOS binary and does not provide native capability parity. EAS Free has monthly quotas; it is not unlimited or a lifetime zero-cost build factory.

### Self-hosted runtime security gate added on this branch

- `OPSC_DEPLOYMENT_MODE=self-hosted` is a separate runtime mode; it does not spoof `VERCEL_ENV` or reuse Vercel release flags.
- The server evaluates the existing Ed25519 buyer release identity and exposes `selfHostedReleaseVerified` only when the pinned public key verifies the current identity.
- Signed tenant-context operations in this mode require all of: explicit `OPSC_SIGNED_TENANT_CONTEXT_SELF_HOSTED_ENABLED=true`, `OPSC_REQUIRE_SIGNED_TENANT_CONTEXT=true`, `OPSC_PRODUCTION_HOLD=false`, session autobind disabled, and a valid buyer release attestation.
- The identity collector measures archive SHA-256, live HTTPS certificate digest and selected PostgreSQL role flags. Its existing documentation explicitly excludes complete object/function grants and build provenance; PASS is an operator attestation, not certification.
- The migration runner's self-hosted host pin is operator-supplied and is not independent DNS, TLS certificate or database-provider identity proof. TLS is independently enforced by `verify-full`.
- Added `.github/workflows/self-hosted-postgres18-acceptance.yml`: it provisions an ephemeral PostgreSQL 18 + PostGIS 3.7 + pgvector container, generates a temporary CA/server certificate, runs repository role and extension initializers as the database administrator, applies migrations through the self-hosted target using `verify-full`, and checks the migration ledger, extensions, role flags and forced RLS. The original workflow text contained a truncated `grep` and duplicated trailing steps; PR #519 repaired those defects. Its first repaired run (#46115297322) reached migration 027 and failed with SQLSTATE 42501. This follow-up provisions required extensions before the least-privilege migration role runs. The next run (#46116096839) passed extension initialization and advanced beyond migration 027, then failed at migration 046 with SQLSTATE 42704 because the immutable migration expects the `neondb_owner` role. PR #521 added that local compatibility role and the explicit SET ROLE contract. The following run (#46117228866) passed migration 046 and progressed through migration 062, then stopped at migration 063 with P0001 because the dedicated `opscore_auth_definer` role was absent. PR #523 adds and validates that least-privilege role and its membership contract; CI and a fresh full self-hosted acceptance run are pending.
- PR #520 (stacked extension correction) has been merged into this feature branch at `f388a84f176f20daa687464d0117861d498d4280`. It replaces the `postgres:18` DB-only Compose image with the same pinned PostgreSQL 18 + PostGIS 3.7 + pgvector 0.8.7 image built by the acceptance workflow, and initializes PostGIS/pgcrypto/vector as the database administrator before migration execution. A fresh self-hosted acceptance run is required to verify this correction; no successful migration run is claimed yet.

## Requested features — honest state

| Feature | State | Acceptance still required |
|---|---|---|
| PostgreSQL 18 + PostGIS + pgcrypto + pgvector DB-only Compose | IMPLEMENTED, ACCEPTANCE PENDING | Fresh-volume extension initialization, TLS verify-full, complete migrations, health, volume and restore tests |
| Full self-hosted app + DB + TLS ingress Compose | BLOCKED | App service, Caddy ingress, internal TLS/CA distribution, migration sequencing, backup/restore orchestration and end-to-end qualification |
| Linux one-line installer | NOT IMPLEMENTED | Signed/versioned installer, OS/Docker preflight, secret/certificate generation, safe upgrade/rollback and idempotency |
| Windows installer | NOT IMPLEMENTED | Supported Windows host model and tested PowerShell/Docker Desktop or server installation contract |
| Coolify template | NOT IMPLEMENTED | Deployable Compose plus documented domains, environment, persistent volumes and health checks |
| Replicated KOTS | NOT SELECTED | Commercial pricing, Kubernetes support model, license and air-gap acceptance |
| Buyer branding config | IMPLEMENTED PARTIALLY | Web page consumption, mobile colors/logo, RTL/locale checks and end-to-end browser/device tests |
| Mobile dynamic server URL | IMPLEMENTED PARTIALLY | Deep-link/QR provisioning and device tests; manual HTTPS URL entry is available |
| Android APK | EXISTING PREVIEW PIPELINE | Latest build artifact, real-device install, production signing/key custody and update compatibility |
| iOS | PWA + existing EAS profile only | iOS device test; EAS credentials/account quotas; native TestFlight/App Store signing |
| Demo seeder | EXISTING, LIMITED | A separate isolated two-tenant scenario, explicit labels, synthetic domains, RLS cross-tenant denial, safe wipe and no production access |
| Encrypted PostgreSQL backup | CLI IMPLEMENTED | Run against disposable PG18, decrypt + full isolated restore, key recovery, scheduler, off-host replication and alerting |
| Automatic backup container | NOT IMPLEMENTED | Container image, schedule, retention, remote destination, monitoring and restore drill |
| Activepieces / Telegram | NOT IMPLEMENTED | Buyer-managed host/secrets, tenant-safe credential model, opt-in and delivery audit |

## No-go conditions

- Never run a demo seeder against Production or a buyer database containing real records.
- Never include database credentials, backup keys, signing keys or API tokens in Compose files, QR codes, APK assets or Git.
- Never enable offline mutation caching in the PWA until encrypted storage, CSRF, idempotency, tenant-bound replay and conflict resolution pass security tests.
- Never claim a production-signed APK, full restore, air-gap readiness, KOTS entitlement enforcement, or zero total cost without evidence.
- No merge, release or Production promotion is part of this branch.
