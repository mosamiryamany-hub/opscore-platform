# Operational Queue, Cutover & Reconciliation

## Queue separation
`operational_jobs` separates support, billing, incident and general background work. Claims use a lease and retries; unsupported handlers fail closed. `npm run worker` runs the local worker.

## Service-line cutover
The product can model a customer assignment between persisted service lines inside the same tenant. Preflight hashes the current assignment; cutover runs atomically and supports explicit admin rollback. This is a database cutover control, not a telecom provisioning claim and does not guarantee zero network downtime without a real external provisioning integration.

## Client preflight
Browser checks are an early UX/traffic optimization only. Server-side authorization and validation remain authoritative.

## Commercial reconciliation
Local reconciliation reports consistency of persisted invoice payment state. Stripe mode records that remote comparison is required and never fabricates gateway matches.
