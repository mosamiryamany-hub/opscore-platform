# OpsCore Buyer Evaluation Kit

**Release: v0.11.62**

## Purpose

This release includes a repeatable buyer-evaluation path. It is designed to let a technical buyer verify the software rather than rely on marketing claims.

## Fast path

1. Use Node.js `22.23.4` or a later compatible Node 22 release satisfying `backend/package.json`.
2. From `backend/`, run `npm ci`.
3. Run `npm run buyer:preflight`.
4. Run `npm run seed:demo` only in an empty development database.
5. Start the console with `HOST=127.0.0.1 PORT=3123 NODE_ENV=development SQLITE_PATH=./data/opscore.sqlite npm start`.
6. Open `/` for the operations console and `/portal.html` for the customer portal.
7. Follow `BUYER_DEMO_SCRIPT.md` for the evidence-first walkthrough.
8. Run `npm run demo:clean` when the demonstration is finished.

## What the buyer can verify

- Multi-tenant authorization and cross-tenant denial tests.
- Work-order operational loop and field execution controls.
- Offline synchronization and idempotency behavior.
- Evidence integrity controls and completion assurance.
- Commercial flow: estimate acceptance, work-order conversion, invoice and local payment recording.
- Audit-chain verification and tamper detection regression.
- Organization export with SHA-256 snapshot verification.
- Backup integrity and recovery-drill controls.
- API/SDK contracts and JavaScript syntax checks.

## One-command technical preflight

`npm run buyer:preflight` produces `BUYER_PREFLIGHT_RESULT.json` at the release root. The result is generated from the actual files and local verification commands.

## Honest boundary

A successful local buyer preflight does **not** certify a customer's production PostgreSQL/PostGIS deployment, identity provider, TLS ingress, KMS/HSM, distributed rate limiting, external messaging provider, object storage, routing provider, signed Android/iOS artifacts, or app-store approval. Those require environment-specific acceptance.

The demo credentials are intentionally non-production and must never be used for a real deployment.
