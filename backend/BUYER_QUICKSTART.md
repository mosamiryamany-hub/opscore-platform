# OpsCore Buyer Quickstart

## Requirements

- Node.js **>=22.23.4 and <23**.
- npm compatible with the installed Node.js version.
- Local evaluation uses Node's built-in SQLite engine by default.
- PostgreSQL deployments require a direct database endpoint (not a Neon `-pooler` host) and separate runtime/owner credentials.

## 1. Clean local installation and SQLite demo

Run from the extracted package:

```bash
cd backend
npm ci
npm run buyer:preflight

# The demo seed is SQLite-only. Keep PostgreSQL URLs out of this shell.
unset DATABASE_ENGINE OPSC_DATABASE_URL DATABASE_URL

# Set four unique local demo passwords (minimum 12 characters each).
read -rsp 'Demo owner password: ' OPSC_DEMO_PASSWORD_ADMIN; echo; export OPSC_DEMO_PASSWORD_ADMIN
read -rsp 'Demo dispatcher password: ' OPSC_DEMO_PASSWORD_DISPATCHER; echo; export OPSC_DEMO_PASSWORD_DISPATCHER
read -rsp 'Demo technician password: ' OPSC_DEMO_PASSWORD_TECHNICIAN; echo; export OPSC_DEMO_PASSWORD_TECHNICIAN
read -rsp 'Demo viewer password: ' OPSC_DEMO_PASSWORD_VIEWER; echo; export OPSC_DEMO_PASSWORD_VIEWER

npm run seed:demo
npm run dev
```

Open `http://127.0.0.1:3000` unless you set a different `PORT`.

The demo seed creates a deliberately non-production organization with sample customers, site, asset and work order plus four verification accounts. It refuses to seed a database that already contains users, is blocked when `NODE_ENV=production`, and now refuses whenever the runtime is configured for PostgreSQL or any database URL is set. Demo passwords are supplied through the four `OPSC_DEMO_PASSWORD_*` environment variables; they are never printed. Do not use demo accounts or demo data in a real customer environment.

**Do not run `seed:demo` when `DATABASE_ENGINE=postgres`.** It is a local SQLite demonstration only. For a real PostgreSQL activation, use the owner bootstrap flow below after migrations.

## 2. Verify the package

```bash
npm test
npm run db:check
npm run verify
npm run verify:installation
```

A PASS applies only to the checks that the command actually runs. It does not certify the buyer's production infrastructure or external services.

## 3. PostgreSQL installation and first real owner

Use a dedicated acceptance database first. The application runtime uses `opscore_app`; schema migrations use the separate owner account:

```bash
cd backend
export DATABASE_ENGINE=postgres
export OPSC_DATABASE_URL='postgresql://opscore_app:REPLACE_LOCALLY@HOST/DATABASE?sslmode=require'
export OPSC_MIGRATION_DATABASE_URL='postgresql://neondb_owner:REPLACE_LOCALLY@HOST/DATABASE?sslmode=require'
export OPSC_MIGRATION_CONFIRM_DATABASE='DATABASE'

# Apply schema through the owner-only migration connection.
node scripts/apply-postgres-migrations.js --apply

# Remove local demo flags before real-data bootstrap.
unset OPSC_DEMO_PASSWORD_ADMIN OPSC_DEMO_PASSWORD_DISPATCHER
unset OPSC_DEMO_PASSWORD_TECHNICIAN OPSC_DEMO_PASSWORD_VIEWER
unset OPSC_DEMO_CLEANUP OPSC_SEED_DEMO

# Create the real first organization and owner; the password is read silently.
export OPSC_BOOTSTRAP_ORG_NAME='Your organization name'
export OPSC_BOOTSTRAP_CEO_EMAIL='owner@example.com'
read -rsp 'Initial owner password (minimum 12 characters): ' OPSC_BOOTSTRAP_CEO_PASSWORD; echo
export OPSC_BOOTSTRAP_CEO_PASSWORD

NODE_ENV=production HOST=0.0.0.0 npm run bootstrap
HOST=0.0.0.0 npm start
unset OPSC_BOOTSTRAP_CEO_PASSWORD
```

Replace placeholders locally; never commit connection strings or share credentials in support messages. The migration runner requires a dedicated test/acceptance database by default and refuses production targets unless the buyer explicitly enables its production opt-in and confirms the exact database name. The bootstrap command creates only the real organization and initial owner; it does not seed demo fixtures. Validate first on a disposable acceptance database before a buyer production activation.

## 4. SQLite demo accounts

The local-only demo seed creates these identities:

- Owner: `admin@demo.opscore.invalid`
- Manager/dispatcher: `dispatcher@demo.opscore.invalid`
- Member/technician: `tech@demo.opscore.invalid`
- Viewer: `viewer@demo.opscore.invalid`

Their passwords are the values entered into the four local `OPSC_DEMO_PASSWORD_*` prompts. The seed script does not print those passwords.

## 5. Operational integrations

Webhook, email/SMS/WhatsApp, OIDC/JWKS, payment, object-storage, KMS/HSM, mapping and telephony delivery depends on the buyer's external accounts, licenses, configuration and credentials. A configured integration is not considered delivered until its remote service has been independently tested.

## 6. Security and production boundary

Browser sessions use hardened cookies. Tenant isolation and PostgreSQL RLS are tested by the release gates, but isolated acceptance is not formal production-wide certification. The package does not claim buyer-specific production PostgreSQL/PostGIS, OIDC/JWKS, KMS/HSM, TLS ingress, distributed rate limiting, object storage, external messaging delivery or buyer backup/restore until those are configured and verified in the buyer's environment.

## 7. Mobile source

The package includes Expo source and lockfiles, not signed Android/iOS store binaries. Native builds, signing credentials, physical-device acceptance and app-store publication require the buyer's EAS/Apple/Google accounts and release process.

## 8. Translation notice

Contact Center locale structure and integration are tested in CI. Machine-assisted translations still require native-speaker review before linguistic quality or production-language claims.
