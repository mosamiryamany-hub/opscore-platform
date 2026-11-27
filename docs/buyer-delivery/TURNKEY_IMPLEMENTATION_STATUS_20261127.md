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
- Manual URL entry is available. A signed-format deep-link shape (`opscore://configure?server=https://...`) can prefill the URL for user review; it is not auto-saved. QR generation/scanning is not implemented; no camera permission or QR library was added without its own threat-model and native-build validation.
- Existing native encrypted offline queue and SecureStore authentication are not replaced by browser storage.

### Encrypted PostgreSQL backup CLI
- Added `npm run backup:postgres:encrypted`.
- It uses `pg_dump` custom format, writes temporary files with restrictive permissions, encrypts the archive using AES-256-GCM, decrypts it into a temporary verification file, and checks archive readability with `pg_restore --list`.
- It never puts the database password in command-line arguments and does not print the connection string or encryption key.
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
2. The PostgreSQL migration runner now has an explicit `self-hosted` target. It pins the exact operator-supplied hostname and database, rejects poolers, requires `sslmode=verify-full`, `NODE_ENV=production`, the `opscore_migrator` role with `BYPASSRLS` (but not superuser/CREATEROLE/CREATEDB), an existing least-privileged `opscore_runtime` login, and exact host/database confirmation plus `OPSC_MIGRATION_ALLOW_SELF_HOSTED=1` before apply. This is an operator-pinned identity, not Neon API verification. The bootstrap policy accepts the same dedicated migrator role only when `OPSC_DEPLOYMENT_MODE=self-hosted`.
3. The PostgreSQL init script now creates and validates separate runtime, migrator and worker roles without putting passwords in psql command-line arguments. The self-hosted migration target and role policy have unit coverage. The database init script and full migration sequence still require a real disposable PostgreSQL 18 + PostGIS execution before they are accepted. No `pgvector` dependency is claimed; checked-in migration source reviewed for this work does not establish a required vector extension.
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
- Added `.github/workflows/self-hosted-postgres18-acceptance.yml`: it provisions an ephemeral PostgreSQL 18 + PostGIS 3.7 container, generates a temporary CA/server certificate, runs the repository's role initializer, applies migrations through the self-hosted target using `verify-full`, and checks the migration ledger, extensions, role flags and forced RLS. This CI workflow is now the required acceptance gate; its result is pending.

## Requested features — honest state

| Feature | State | Acceptance still required |
|---|---|---|
| Docker Compose self-contained server + PostgreSQL/PostGIS | BLOCKED | Full app + DB + TLS ingress + migration sequencing, image extension validation, health, volume and restore tests |
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
