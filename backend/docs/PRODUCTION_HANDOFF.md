# OpsCore Production Handoff v0.11.62

This is a production implementation handoff, not a production-certification claim. The source package contains a PostgreSQL-backed Vercel runtime; live production acceptance still requires exact deployment identity and target-specific verification.

## 1. Runtime baseline

- Node.js is pinned to >=22.23.4 <23.
- The repository root pins pg 8.23.1 in package.json and package-lock.json.
- Install deterministically with npm ci --omit=dev --prefix backend followed by npm ci --omit=dev at the repository root, as defined in vercel.json.
- The Vercel entry point requires DATABASE_URL or OPSC_DATABASE_URL and sets DATABASE_ENGINE=postgres; it fails closed if the PostgreSQL driver is unavailable.
- Local development may use node:sqlite; do not mistake local SQLite behavior for production PostgreSQL acceptance.

## 2. PostgreSQL / PostGIS

- Use a buyer-controlled PostgreSQL service and a least-privilege runtime role. Never use neondb_owner or a BYPASSRLS role as the application runtime.
- Enable PostGIS only for spatial workloads; maps/road-routing provider licenses and keys are buyer-owned.
- Run migrations in a controlled change process and verify tenant isolation with real concurrent tests.
- CI live RLS/identity gates run against an isolated acceptance database. They do not certify every live production route or the actual Vercel DATABASE_URL role.

## 3. TLS / ingress

Terminate TLS at a buyer-controlled ingress/load balancer using current supported TLS policy. Keep the application behind the trusted network boundary and preserve correlation IDs.

## 4. Identity and external integrations

AUTH_MODE=oidc is fail-closed unless a real OIDC verifier is supplied and independently verified. Buyer provides identity/OIDC/JWKS, email/SMS/WhatsApp/PSTN/SIP, external call-center/telephony providers, payments, webhooks, object storage, KMS/HSM and cloud accounts, credentials, licenses and live acceptance.

## 5. Webhook secrets

Set OPSC_WEBHOOK_ENCRYPTION_KEY from a buyer-managed secret store. OpsCore encrypts webhook secrets at rest locally and signs outbound requests with HMAC-SHA-256. The external receiver must validate timestamp, event, delivery ID and signature against its own replay window. A successful local signing test is not proof that a remote endpoint accepted the event.

## 6. Evidence and recovery

Attachment bytes receive SHA-256 at ingestion. Reads re-hash the stored bytes and fail closed on mismatch. This establishes content-integrity evidence; it is not by itself WORM storage or a legal immutability guarantee. Buyer provisions immutable/WORM storage and managed KMS/HSM where required. Backup/restore self-tests in CI are non-production evidence; run target-specific recovery acceptance before certifying production.

## 7. Offline sync

Each sync event is tenant- and actor-scoped and idempotent by clientEventId. Reuse with a different operation/entity/payload is rejected as SYNC_IDEMPOTENCY_CONFLICT. The system does not claim automatic semantic conflict resolution.

## 8. Production certification gate

Required evidence includes exact deployed Git commit, Vercel runtime database role, real PostgreSQL connectivity, production session/tenant isolation tests, recovery drills, OIDC/JWKS, TLS/ingress, secret/KMS boundary, rate-limit state, external adapters and observability. Production certification remains NOT_ESTABLISHED until these gates have current target-specific evidence.


## PostgreSQL migration execution

- Use the committed `backend/scripts/apply-postgres-migrations.js` runner with a direct, non-pooled connection.
- Default mode is dry-run; apply requires `--apply` plus exact database-name confirmation.
- Run as `neondb_owner`, never as `opscore_app` or `opscore_gate`.
- The runner serializes migrations with an advisory lock, verifies file/ledger identity, applies one migration per transaction, and writes its ledger row in the same transaction.
- The 040-to-044 rename is recognized only when the hashes match. The 042 legacy checksum discrepancy is accepted only after a live catalog-equivalence check; the recorded historical hash is preserved.
- `schema_migrations` is protected by FORCE RLS and is not readable or writable by the runtime application role.
