# OpsCore Digital Twin & GIS Expansion — Engineering Baseline
Date: 2026-11-27
Status: Research-backed target architecture; external integrations remain separately gated.

## 1. Current implementation boundary
The backend exposes tenant-scoped operational twin routes:
- GET /api/v1/platform/twin: deterministic aggregates from work orders, assets, appointments, jobs, maintenance plans, invoices, integration outbox and asset events.
- GET /api/v1/platform/twin/snapshots: persisted snapshots with SHA-256 consistency checks.
- POST /api/v1/platform/twin/snapshots: persists a snapshot and database-resident hash-chain event.
- GET /api/v1/platform/twin/integrity and per-snapshot verification: checks sequence continuity, event hashes, snapshot binding and tenant scope.

This is an operational twin foundation, not a complete physical digital twin. Current code does not prove continuous sensor ingestion, BIM/IFC federation, SCADA/OT connectivity, calibrated physics simulation, externally anchored immutable evidence, or a high-fidelity 3D scene. The UI added in this branch reads the existing API and makes these limitations visible.

## 2. Target: a genuinely large digital-twin system
### Twin identity and lifecycle
Stable twin ID, tenant, domain pack, entity type, physical asset reference, parent/child hierarchy, lifecycle state, classification, owner, provenance and retention policy. Physical entity, digital representation, adapters and synchronization state are separate records. Lifecycle transitions are proposed, provisioned, connected, synchronizing, degraded/disconnected and retired; transitions require authorization and audit events.

### Digital Thread and event backbone
Append-only domain events carry tenant ID, event ID, aggregate ID, schema version, occurred/received timestamps, source system, correlation/causation IDs, actor/service identity, classification and payload hash. Consumers are idempotent; replay protection, dead-letter handling, aggregate ordering and out-of-order policy are explicit. Begin with transactional outbox and PostgreSQL event ledger; add a durable broker only when measured throughput and recovery requirements justify it. Preserve original observations separately from normalized values.

### Spatial and asset model
PostGIS is the target authoritative spatial store: geometry/geography with SRID validation, GiST indexes, tenant-safe joins and retention. Use OGC API - Features for feature access, OGC API - Tiles for tiled delivery, OGC SensorThings API 2.0 for observations/things/sensors/datastreams, and OGC API - Routes only behind a real routing engine. Support coordinate systems, indoor/outdoor topology, vertical levels, containment, connectivity and temporal validity. BIM/IFC and 3D Tiles ingestion requires validation of coordinate transforms, units, provenance, licensing and model version. A technician check-in is not continuous tracking.

### Visualization and simulation
2D GIS supports operational editing, layers, filters, clustering, geofences, spatial search and time playback. 3D scene technology should be selected after model-source and device benchmarks: CesiumJS for geospatial globe/3D Tiles; Three.js for product-specific scenes. Real-time overlays must carry source, observed/received time, age, quality and uncertainty. Missing/stale values remain unknown/stale. Simulation jobs are versioned and reproducible, and cannot issue real-world commands. Current capacity scenarios are planning models, not physics simulation.

## 3. GIS / Maps target capability
Map workspace with saved views, layer tree, legend, feature inspector, coordinate readout, scale, orientation, measurement, drawing and export. Layers include assets, sites, work orders, appointments/check-ins, service areas, geofences, incidents, network topology, indoor floor plans and permitted external layers. Spatial APIs include viewport queries, bbox, radius/nearest-neighbour, polygon containment, route matrix and rate-limited geocoding. MapLibre GL JS is the 2D vector renderer; deck.gl is evaluated for large point/arc/hexagon/heatmap layers; PMTiles for static vector tile distribution; PostGIS remains authoritative. OGC API - Features/Tiles/Maps, SensorThings 2.0 and standards-based GeoJSON/GeoPackage/COG/3D Tiles provide interoperability. Tile provider, license, attribution, health, cache and buyer configuration are explicit; public community tile endpoints are not assumed production-grade or free. Precise location is purpose-bound, time-bounded and audited.

## 4. Contact Center target
Modules: interaction routing; queue and skill-based distribution; agent desktop; supervisor wallboard; CRM/customer 360; case management; callback and SLA; voice/SIP/PSTN; web chat; email and messaging adapters; consent/recording policy; quality management; workforce scheduling; knowledge base; analytics; language/dialect QA; audit and retention.

Browser media uses WebRTC with DTLS-SRTP/ICE and short-lived server-issued credentials. SIP/PSTN requires a real SBC/PBX/media plane; Asterisk and FreeSWITCH are candidates. SIP signaling alone does not implement queueing, call recording, carrier routing or compliance. Each provider adapter must validate signed webhooks, timestamps/replay windows, idempotency, retries, tenant mapping and dead letters. Keep provider schemas out of CRM and queue domain contracts.

Server-side authorization governs tenant, role, queue, assignment and transcript access. Require consent and recording disclosure; minimize data; govern retention/deletion and key lifecycle. Supervisor actions are transactional, reason-coded and audited. AI assistance remains advisory until separately evaluated. Language catalogue membership is not language quality; native-speaker and provider-backed acceptance is required per language/dialect.

## 5. Technology adoption decisions
- Web UI: TypeScript-first modules, current page architecture retained until a measured framework migration case exists; WCAG 2.2 AA, Playwright, RTL and INP/LCP/CLS checks.
- APIs: server-authoritative same-origin APIs; no-store for sensitive tenant data.
- Data: PostgreSQL 18 + PostGIS target; tenant RLS and composite tenant foreign keys require live acceptance.
- 2D maps: MapLibre GL JS; benchmark deck.gl for high-volume overlays; PMTiles for static archives.
- 3D: evaluate CesiumJS/3D Tiles or Three.js against actual buyer models and mobile devices.
- Sensors: OGC SensorThings API 2.0.
- Contact center: WebRTC + SIP over WSS; Asterisk/FreeSWITCH evaluation requires carrier/SBC and real call acceptance.
- Eventing: transactional outbox first; broker only after throughput/replay needs are measured.
- Observability: OpenTelemetry with PII-safe attributes; never log transcripts, audio or secrets.
- Supply chain: pinned dependencies, SBOM, provenance and dependency scanning.

## 6. Research references
- ITU-T Y.4241 (approved 2026-05): digital-twin capabilities across data, modelling/simulation and visualization, with privacy and security requirements.
- ISO/IEC 30188:2026 (published 2026-07): digital-twin reference architecture.
- ISO/TS 25271:2026 (published 2026-08): industrial digital-twin interface architecture.
- OGC SensorThings API 2.0 (published 2026-11-04): HTTP and MQTT bindings for sensor/observation data.
- OGC API - Features, Tiles, Maps and Routes define interoperable geospatial service contracts.
- MapLibre GL JS provides GPU-accelerated vector maps, globe/terrain and extensible layers.
- RFC 8825 describes browser WebRTC architecture; SIP RFC 3261 provides session signaling primitives and must be combined with media, carrier and application services.

## 7. Acceptance gates
Digital Twin: real PostgreSQL 18/PostGIS; cross-tenant/RLS tests using non-owner non-BYPASSRLS role; replay/duplicate/out-of-order/stale/malformed/source-outage tests; authoritative asset identity and provenance; external signature/anchor before claiming administrator-resistant evidence; 3D benchmark on supported devices; reproducible simulation separated from control commands.
GIS: tile provider terms/attribution/availability; representative large-data performance; coordinate/geofence/antimeridian/null-island/GPS-quality tests; keyboard/screen-reader/touch/RTL acceptance; tenant/role enforcement for every feature/tile endpoint.
Contact Center: real PSTN/SIP trunk or provider sandbox; two-way audio; inbound/outbound/transfer/hold/conference/queue/callback/disconnect recovery; signed webhooks and replay protection; CRM PII role gates; audit/deletion/retention; native-speaker language acceptance.

## 8. Unresolved external dependencies
Buyer-selected tile/geocoding provider and budget; source-of-truth GIS/BIM datasets and CRS; IoT/SCADA protocols, gateways and certificates; SIP carrier/trunk, phone numbers, SBC/PBX hosting and recording policy; independent KMS/HSM or signing service; data residency, retention and consent/legal review.

No item in this document implies these external integrations are already connected.