# OpsCore — Buyer Installation and Qualification Guide

**Current status:** source-code candidate. A complete provider-neutral self-hosted production installation is **BLOCKED / NOT QUALIFIED**. This guide is not permission to use the source; obtain the executed License Schedule first.

## 1. Requirements for source evaluation

- Node.js `>=22.23.4 <23`, npm, and the exact authorized source package.
- Use the lockfile and the same source commit identified by the release statement.
- Keep all secrets outside source control and outside shared support messages.
- `backend/.env.example` is development-only and defaults to local SQLite; it is not a Production or self-hosted deployment template.
- The backend's default SQLite path is for local development/evaluation only. It is not a supported multi-instance production database.

## 2. Local source checks

From the extracted, authorized source package:

```bash
cd backend
npm ci
npm run buyer:preflight
npm run verify:installation
npm run contact-center:i18n
npm run contact-center:i18n:forensic
npm test
npm run verify
```

Record the command exit code, Node/npm versions, source commit, package SHA-256 and complete output. A successful local check proves only the named local check.

The `seed:demo` path is SQLite-only, non-production evaluation. Do not run it against PostgreSQL, a production database or customer records.

## 3. PostgreSQL and self-hosted production: current blocker

Do **not** treat `backend/docker-compose.postgres.yml` as a complete self-hosted product stack. It defines a PostgreSQL service, not the full application, ingress, durable file-storage, secrets, monitoring and recovery topology.

Do **not** run `scripts/apply-postgres-migrations.js` against a customer-managed PostgreSQL server as if it were provider-neutral. Its current target validation is built around Neon project/branch/endpoint identity and the `neondb_owner` role. A generic customer-managed PostgreSQL migration target has not yet been implemented and qualified.

Likewise, do not set `VERCEL_ENV=preview` or `VERCEL_ENV=production` to simulate a Vercel environment. Signed tenant-context activation and release-proof logic currently depend on Vercel-specific environment and deployment identity.

The PostgreSQL runtime adapter also requires production TLS verification (`verify-full`, certificate validation enabled) and an explicit least-privilege `OPSC_DATABASE_URL`. This is necessary but by itself is not complete self-hosted qualification.

## 4. Required work before a supported self-hosted deployment

- Provider-neutral, fail-closed deployment profile and signed release identity.
- Customer-managed PostgreSQL migration targeting with exact host/database binding, dedicated migration authority and negative tests.
- Signed tenant/session route enablement for the self-hosted profile and behavioral cross-tenant tests as the actual runtime role.
- Reproducible application stack with persistent upload/object storage, TLS ingress, secret management, monitoring and readiness checks.
- Backup/restore, upgrade/rollback and restart tests on the buyer's target.
- Exact-artifact Secure Release and complete CI acceptance bound to the same source commit and artifact.
- Buyer-controlled target acceptance after installation.

## 5. External dependencies

Buyer-owned accounts, licences, credentials and live acceptance are required where applicable for OIDC/JWKS, email, SMS, WhatsApp, telephony/call-center, payments, webhooks, object storage, KMS/HSM, maps/road-routing and cloud. Source adapters or configuration fields do not prove that a provider is connected.

## 6. Mobile and translation

The source contains Expo mobile code only. Signed APK/AAB/IPA, native signing, physical-device QA and store publication are not included.

Machine-assisted translations must remain identified as such. Native-speaker review and production language qualification are not established. Structural and automated translation checks are not linguistic approval.

## 7. Acceptance record

For any permitted evaluation, preserve:
- exact source commit and archive SHA-256;
- commands run, exit codes and full test reports;
- database engine/version and target identity (without exposing credentials);
- tenant-isolation, backup/restore and provider tests actually performed;
- all FAIL, SKIPPED, NOT RUN, NOT VERIFIED and buyer-owned residuals;
- named technical owner and written acceptance date.

Do not issue or market an external certification from these local/CI reports.
