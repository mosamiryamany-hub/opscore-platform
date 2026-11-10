# OpsCore Runtime Integration Dependencies

The repository root is the authoritative runtime dependency installation for the Vercel application. It pins pg 8.23.1 in package.json and package-lock.json; CI and Vercel use npm ci so the PostgreSQL driver is reproducible. backend/package.json declares pg as an optional peer only to preserve standalone package compatibility; the complete repository installs the root-pinned driver and the Vercel serverless entry point resolves it through Node's normal module lookup.

## PostgreSQL

backend/src/adapters/postgres.js uses the Node pg driver. The Vercel entry point sets DATABASE_ENGINE=postgres and backend/src/db-open.js opens the PostgreSQL adapter when DATABASE_URL or OPSC_DATABASE_URL is configured. The SQLite module is loaded lazily only for the local SQLite engine and is not imported by PostgreSQL runtime initialization. Missing driver or connection settings fail closed; there is no SQLite fallback in the Vercel production entry point.

The exact root runtime tree is audited in CI and the complete root-dependency-audit.json is included in the same commercial archive pipeline. The initial pinned pg 8.23.1 audit probe reported zero vulnerabilities; the archive pipeline must rerun the audit for its exact lockfile. Keep DATABASE_URL in buyer-controlled secret management and use a least-privilege database role. Production runtime-role identity must be verified against the deployed environment; source configuration alone is not proof.

The live PostgreSQL/RLS gates run against a disposable acceptance database. They establish test-scope behavior, not a complete production certification. PostGIS is installed in the Neon production catalog, but map/road-routing provider licenses and external map services remain buyer-owned.

## Stripe

The Stripe integration uses Node's built-in fetch and does not require the Stripe npm SDK. A real STRIPE_SECRET_KEY and buyer-environment verification are still required before remote billing operations are considered live.

## OIDC/JWKS, routing, object storage and notifications

These remain explicit provider boundaries. No mock package or local fallback is substituted for a real provider. Buyer supplies external provider accounts, licenses, API credentials and live acceptance, including external call-center/telephony services and maps/road routing.
