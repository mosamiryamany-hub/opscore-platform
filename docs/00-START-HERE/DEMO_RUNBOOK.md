# OpsCore Demo Runbook

## Backend and Web Console

Use Node.js `22.23.4` or a compatible release satisfying `backend/package.json`. From `backend/`, install dependencies with `npm ci`, create a local owner by supplying the owner password through the `OPSC_DEMO_PASSWORD_OWNER` environment variable and piping that value to `node scripts/bootstrap.js`, and optionally run `node scripts/seed-demo.js` with its documented `OPSC_DEMO_PASSWORD_*` variables. Start the integrated web/API process with `HOST=0.0.0.0 PORT=3010 NODE_ENV=development SQLITE_PATH=./data/opscore.sqlite npm start`. Open `/` for the operations console and `/portal.html` for the customer portal.

The local demonstration uses SQLite. It is not production certification. PostgreSQL/PostGIS, OIDC/JWKS, KMS/HSM, TLS ingress, distributed rate limiting, external provider delivery, and production backup/restore remain environment-dependent.

## Mobile source

The mobile application is Expo source version `0.1.16` and is contract-compatible with backend `0.11.61`. Set `EXPO_PUBLIC_API_BASE_URL` to the backend URL in `mobile/.env`, then run `npm install`, `npm run verify`, and `npx expo start`. Android and iOS builds require the buyer's device, signing credentials, and store/build environment. Do not use a localhost or plaintext HTTP API base in a production mobile build.

## Verified journey

The release test suite verifies owner/auth flows, tenant isolation, technician-scoped Today Mission, dispatch board scope, On My Way, GPS check-in, safety acknowledgement, completion package, customer portal scoping, webhook SSRF protection, and Stripe signature/idempotency boundaries. The local HTTP suite passed `22/22` tests in the current verification run.

## Truth boundary

The source package is runnable and demonstrable. It is not a hosted deployment, signed Android/iOS artifact, physical-device certification, or production infrastructure certification. Expo Web export was attempted after installing the SDK-compatible web dependencies but did not complete in this sandbox's Metro process; this does not invalidate native Expo source verification and must be rechecked in the buyer's Expo build environment.

## Evidence-Governed Operational Autopilot demo

From `backend/`, the release exposes an isolated local demo command:

`npm run demo -- --scenario cascading-worker-failure`

The command creates a temporary SQLite database, injects deterministic fault conditions, measures detection, generates governed proposals, simulates explicit approval, executes the real stale-worker recovery action, records outcome evidence, builds the causal evidence graph, and prints the learning summary. The demo database is deleted when the command exits.

Supported scenarios: `outbox-backlog`, `worker-degradation`, `geofence-anomalies`, `runtime-failure`, `capacity-pressure`, `dependency-outage`, and `cascading-worker-failure`.

The simulation layer is deterministic and evidence-oriented. It does not claim that an observed correlation proves causality, and the demo's simulated approval is clearly marked as such.
