# Architecture

OpsCore runs one Node process serving the REST API and browser UI. Local development defaults to Node's built-in node:sqlite so contributors can start the application without a database service.

The Vercel serverless entry point is intentionally different: api/index.js requires DATABASE_URL or OPSC_DATABASE_URL, sets DATABASE_ENGINE=postgres, and loads backend/src/server.js. The server calls openDatabase from db-open.js; in PostgreSQL mode it opens the synchronous compatibility adapter backed by the pg pool. There is no silent SQLite fallback in the production entry point. The runtime driver pg is pinned at the repository root and installed from the root package-lock.json; backend/package.json retains an optional peer declaration for standalone consumers.

The operational model is organized as:

Organization/Tenant -> Users/Roles -> Technicians/Skills -> Customers/Sites -> Work Orders -> Schedule/Dispatch/SLA -> Assets/Locations -> Parts/Inventory -> Evidence/Sign-off -> Activity/Audit -> Portal/Sync -> Integration contracts

The API exposes reusable operational primitives rather than sector-specific business logic. Work orders are first-class records with a stable number, lifecycle status, priority, assignment, customer/site context, due date, comments and attachments.

PostgreSQL RLS tenant context is applied by the adapter through parameterized session settings and reset before a connection returns to the pool. The live PostgreSQL CI gates exercise database policies and tenant identity boundaries in an isolated acceptance database. Those tests do not by themselves certify every production route or prove the role used by the live Vercel DATABASE_URL.

For genuine spatial production workloads, use PostGIS. SQLite GeoJSON storage is not claimed to provide PostGIS-equivalent spatial indexing/query behavior.

The package keeps external provider integrations explicit. Email, external webhook delivery, S3-compatible object storage, enterprise identity, TLS/ingress, distributed rate limiting, maps/road routing, telephony/call-center providers and billing require real buyer-environment accounts, credentials, licenses and live acceptance.

## Operational layer

Scheduling uses explicit appointment intervals and rejects overlapping assignments for the same technician. Dispatch candidates can filter by a declared work-order required_skill custom field and rank by active appointments and coordinate distance. Route planning uses the Haversine formula only for straight-line distance; it is not a road routing provider or traffic ETA.

Field execution can enqueue idempotent sync events and submit them to /api/v1/sync after connectivity returns. Customer portal tokens are isolated from internal user sessions and expose only the bound customer record.
