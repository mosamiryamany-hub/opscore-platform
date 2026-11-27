# OpsCore Enterprise Systems Blueprint v2 — Digital Twin, Geospatial Intelligence & Omnichannel Contact Center
**Research cut-off:** 2026-11-27  
**Target:** multi-tenant, multi-sector enterprise platform  
**Status:** architecture baseline and implementation contract; not a production-readiness attestation

## Executive position

The next level is not a larger dashboard. It is three interoperable operational systems sharing identity, asset, customer, event, policy, audit and observability foundations:

1. **Digital Twin System (DTS):** governed digital representations of physical and logical entities, synchronized from explicitly identified sources, with temporal history, provenance, uncertainty and controlled simulation.
2. **Geospatial Intelligence Platform (GIP):** authoritative spatial data services, GIS editing and analysis, indoor/outdoor network topology, 2D/3D visualization, routing and location intelligence.
3. **Omnichannel Contact Center (OCC):** media access, interaction orchestration, routing/queueing, agent and supervisor workspaces, CRM/customer journey, quality management and AI-assisted workflows.

A shared platform kernel provides tenant identity, authorization, data classification, policy enforcement, event contracts, workflow, audit, search, notifications, integration adapters, billing/entitlements, backup/recovery and telemetry. Domain packs extend the kernel without creating alternate identity, tenant or audit systems.

## 1. Research baseline and source interpretation

### Digital twin
- **ISO/IEC 30188:2026** is a published international reference architecture for digital-twin systems, defining system fundamentals through architecture views. It is the architecture anchor, not a certification claim for this implementation.
- **ISO/TS 25271:2026** describes industrial twin architecture around the digital twin, physical twin and the interface connecting them. This is the critical distinction: a data dashboard is not a synchronized physical twin.
- **ITU-T Y.4241 (2026-05)** provides common requirements and capability framework for digital twins in smart complexes/campuses and describes scalable aggregation.
- **OGC SensorThings API 2.0**, published 2026-11-04, standardizes a geospatial IoT model and REST API with HTTP and MQTT bindings for sensor-producing devices, data and applications.

### GIS
- **OGC API - Features, Maps, Tiles and SensorThings** should form interoperable service boundaries rather than inventing proprietary geospatial contracts.
- **ISO 19177-1:2026** adapts OGC API - Tiles Part 1 Core as an international standard for retrieving geospatial tiles.
- The OGC standards catalog explicitly encourages modern OGC API standards for web-service capabilities.

### Contact center
- **ITU-T F.748.67 (2025-12)** is an in-force recommendation for advanced intelligent customer service systems. It explicitly covers omnichannel access, omni-media processing, routing/call control, AI service engine, operation/monitoring, voice/video/chat, agent copilot, knowledge management and analytics.
- F.748.67 covers ACD, CTI, IVR/IVVR, WebRTC, SBC, real-time media, routing/queueing, encrypted recording, multilingual capabilities, agent assistance, open APIs and reliability/security. Its availability figures are recommendations conditional on system size and criticality, not claims we may make without measured SLO evidence.

Official references:
- https://www.iso.org/standard/53308.html
- https://www.iso.org/standard/89689.html
- https://www.itu.int/rec/T-REC-Y.4241-202605-P
- https://docs.ogc.org/is/23-019/23-019.html
- https://www.ogc.org/standards/
- https://www.iso.org/standard/88296.html
- https://www.itu.int/rec/T-REC-F.748.67-202512-I/en

## 2. Enterprise platform kernel

### Control plane
Tenant provisioning, identity federation, RBAC/ABAC, domain-pack entitlements, deployment profiles, policy distribution, key references, integration registry, schema registry, feature release controls and fleet-level observability.

### Data plane
Tenant-scoped transactional services, event/outbox processing, spatial queries, media sessions, sensor ingestion, search/indexing, analytical projections and object storage. Data plane services enforce tenant authorization independently; control-plane claims are never treated as authorization by themselves.

### Shared invariants
- Every business record and event has an explicit tenant/org boundary.
- Tenant context comes from authenticated server-side identity, never a browser-supplied tenant ID.
- Cross-tenant access is denied by default and tested with non-owner/non-BYPASSRLS database roles.
- All externally initiated mutations are idempotent, validated, rate-limited and auditable.
- Source observations are immutable; normalized projections can be rebuilt.
- Unknown, stale, low-confidence and missing data are explicit states, never silently converted to zero or healthy.
- Every integration has an owner, credential reference, health contract, timeout, retry/backoff, circuit-breaker policy and dead-letter/replay procedure.
- All AI-generated actions are proposals until authorized by a human or deterministic policy. No model may bypass server authorization.

## 3. Digital Twin System — target architecture

### 3.1 Twin registry and identity
Entities: Twin, TwinVersion, PhysicalEntity, DigitalRepresentation, Asset, Component, Location, Relationship, SourceSystem, Adapter, Observation, StateTransition, ModelArtifact, SimulationRun, EvidenceRecord.
A twin identifier is stable across representation versions. Identity mapping records source-system keys and confidence; fuzzy matching never silently merges assets.

### 3.2 Multi-dimensional state
Store separately:
- observed physical state (source value + source timestamp + receive timestamp);
- normalized state (unit, coordinate system, canonical enum, validation result);
- inferred state (algorithm/model/version, confidence and supporting observations);
- planned state (work order, schedule, maintenance plan);
- simulated state (scenario ID, assumptions and model version).
Never overwrite observation with inference. Preserve clock skew, late arrivals and out-of-order observations.

### 3.3 Digital Thread
Event envelope: event_id, tenant_id, aggregate_type/id, schema_uri/version, source_system, source_event_id, occurred_at, received_at, actor/service principal, correlation_id, causation_id, classification, payload_hash, signature reference and payload.
Required semantics: idempotent consumer, duplicate detection, per-aggregate ordering, replay cursor, schema evolution, dead-letter quarantine, retention and audit.
Start with transactional outbox + durable event ledger. Add Kafka/Redpanda/NATS only after measured throughput, ordering, retention and recovery requirements select the appropriate broker. Do not introduce a broker as architecture decoration.

### 3.4 Synchronization and health
Per-source sync cursor, last successful sync, lag, error budget, missing-field ratio, freshness objective, reconciliation state, conflict policy and backfill status. A disconnected adapter produces an explicit stale/degraded twin status. It must not display a green/connected state based on cached data alone.

### 3.5 3D, BIM and simulation
Federated model ingestion should validate IFC schema, coordinate reference system, units, georeferencing, object identity, geometry validity, source license, version and provenance. 3D Tiles are a delivery format, not the source of truth. CesiumJS is a candidate for geospatial globe/large 3D Tiles; Three.js is a candidate for bespoke product scenes. Benchmark both with buyer datasets and target devices before selecting.
Simulation is isolated from live control. Each run records model binary/version, input snapshot, parameters, boundary conditions, random seed where applicable, output, confidence and reproducibility hash. A simulation cannot dispatch a technician, switch equipment or place a call.

### 3.6 Analytics and AI
Forecasting, anomaly detection and predictive maintenance require labeled historical outcomes, drift monitoring, calibration, false-positive/negative analysis and human review. Every recommendation carries model version, evidence window and uncertainty. No claim of predictive accuracy before a representative offline and prospective evaluation.

## 4. Geospatial Intelligence Platform — target architecture

### 4.1 Spatial data fabric
PostgreSQL/PostGIS is the candidate authoritative transactional spatial store. Enforce SRID, geometry type, validity, coordinate precision, tenant-safe relations and spatial indexes. Separate operational editing tables from generalized/render-optimized projections.
Support GeoJSON, GeoPackage, Cloud Optimized GeoTIFF, vector tiles, PMTiles, 3D Tiles and IFC exchange with explicit import/export validation.

### 4.2 Service contracts
- OGC API - Features for feature collections and feature access.
- OGC API - Tiles for vector/raster/coverage tile delivery.
- OGC API - Maps for rendered maps where appropriate.
- OGC SensorThings 2.0 for Things, Sensors, Datastreams and Observations.
- Routing adapter contract for route, matrix, snap-to-road and isochrone operations; the routing engine is replaceable.
- Geocoding adapter contract with quotas, attribution, privacy and retention controls.

### 4.3 Map workspaces
Role-specific workspaces: network operations, field dispatch, asset engineering, incident response, service assurance, customer/site view and executive overview.
Map primitives: layer tree, saved views, filters, legend, identify/inspect, coordinate/CRS display, scale, orientation, measure, draw/edit, snapping, topology validation, temporal slider, comparison, clustering, heatmaps, vector styling, labels, geofences, print/export and accessible tabular alternative.
Layers: sites, buildings/floors/rooms, assets/components, network links, work orders, incidents, technician check-ins, service territories, permits, coverage, hazards, sensor observations and external basemaps.
Every layer declares source, owner, CRS, refresh/freshness, license, attribution, tenant scope, classification, permissions and availability.

### 4.4 Scale and performance
MapLibre GL JS for interactive vector 2D; deck.gl for benchmark-proven high-volume analytical overlays; CesiumJS for 3D globe/tiles; PMTiles for static archives where update cadence and access policy fit. H3 or S2 are candidates for aggregation/indexing, not substitutes for precise geometry. Use viewport/bbox queries, generalized geometries, clustering, server-side filtering and tile caching. Benchmark representative Egypt/Gulf-scale datasets and low/mid-range Android devices.
Do not use public community tile/geocoding endpoints as an implicit production SLA. Provider selection, terms, attribution, rate limits, hosting and budget are deployment configuration.

### 4.5 Location privacy
Precise location is purpose-bound, consent/legal-basis aware, time-limited and audited. Store technician check-in as an event; do not imply continuous GPS tracking unless a separate approved background-location feature and device permission are active. Redact exact coordinates from logs and analytics by default.

## 5. Omnichannel Contact Center — target architecture

### 5.1 Media and access plane
Adapters for PSTN/SIP, WebRTC browser voice/video, web chat, email, SMS and approved messaging channels. Media plane includes SBC/media gateway, TURN/STUN where needed, recording pipeline and provider connectors. SIP signaling is not a call center by itself; carrier trunks, numbers, media, queue logic and operations are separate dependencies.

### 5.2 Interaction and routing plane
Interaction lifecycle, session state, ACD, IVR/IVVR, skills, priority, language, region, business hours, queue capacity, overflow, callback, abandonment, retry and transfer policy. Routing decisions are deterministic, explainable and replayable. Queue state is server-authoritative and resilient to reconnects and duplicate provider events.

### 5.3 Agent desktop
Unified interaction timeline; customer 360; identity verification status; case/work-order context; queue and presence; transfer/consult/conference; hold/mute; wrap-up/disposition; knowledge search; supervisor assist; accessibility and RTL. A single customer journey spans channels without assuming that different identities are the same person.

### 5.4 Supervisor and workforce
Live wallboard with queue depth, wait-time percentiles, service level, abandon rate, occupancy, adherence, agent states and provider health. Drill-down actions include listen/whisper/barge only where legally authorized, takeover, queue rebalance and escalation. Every privileged action requires reason, actor, target, timestamp and audit record.
Workforce management includes forecasting, schedule creation, adherence, breaks, skills and capacity planning. Erlang C is appropriate for basic voice queues under its assumptions; mixed voice/chat/email/video requires workload-specific models and observed arrival/service distributions.

### 5.5 CRM and customer 360
Canonical customer identity graph with verified identifiers, source provenance, merge/split review and duplicate handling. Customer profile, accounts, sites, assets, contracts, entitlements, cases, work orders, invoices and interaction history are linked through governed relationships. Enforce field-level PII permissions and purpose-based disclosure; do not expose all customer data to every agent.

### 5.6 Recording, quality and compliance
Consent/disclosure policy by jurisdiction, channel and call type; encryption in transit and at rest; key rotation; role-limited playback; retention schedules; legal hold; deletion workflow; access audit; export controls and redaction. Transcription/AI quality review must retain source linkage and confidence. Never make recording or compliance claims before jurisdictional review and real provider tests.

### 5.7 AI assistance
Agent copilot can suggest knowledge, summarize interaction, propose disposition and draft work-order fields. It must cite source records, distinguish customer statements from model inference, show uncertainty and require human confirmation for consequential updates. AI voice agents need escalation/fallback, latency budgets, interruption handling, DTMF, language/dialect acceptance and abuse controls. Evaluate each language/dialect with native-speaker test sets; catalogue presence is not language approval.

### 5.8 Capacity and reliability
Use traffic measurements, peak concurrency, average handle time, after-call work, channel mix, abandonment tolerance and regional routing to size infrastructure. ITU-T F.748.67 gives recommendations for high-scale AICSS; OpsCore must derive its own SLOs from buyer criticality, failure-mode analysis and measured load tests. Do not copy 99.99/99.999 into sales collateral without achieved evidence.

## 6. Security architecture
Threat model covers tenant escape, session fixation, privilege escalation, API abuse, webhook replay, media interception, recording exfiltration, malicious file/model input, map-layer injection, supply-chain compromise, secret leakage, insider abuse and recovery compromise.
Controls: OIDC federation, phishing-resistant MFA for privileged roles where available, short-lived sessions/tokens, RBAC + ABAC, RLS and composite tenant FKs, server-side policy checks, TLS, SRTP/DTLS for media, encryption at rest, KMS/HSM-backed keys, signed webhooks, replay windows, rate limits, CSP, strict upload scanning, SBOM, dependency pinning, provenance, audit immutability strategy and tested restore.
Hash chains stored in the same mutable database are tamper-evident against accidental inconsistency, not administrator-resistant. Stronger claims require external signing/anchoring and separately controlled retention.

## 7. Observability and operational excellence
OpenTelemetry traces/metrics/logs across HTTP, DB, queue, media, sensor and integration boundaries. Propagate trace/correlation IDs without placing PII, audio, transcript, access tokens or exact coordinates in attributes. Monitor freshness lag, event backlog, dead-letter count, queue wait, media setup success, packet loss/jitter, tile latency, spatial query plans, sync errors and restore age.
SLOs are per capability and deployment profile. Publish error budgets, burn-rate alerts, RTO/RPO, backup verification and incident runbooks only after tests establish the numbers.

## 8. Delivery sequence and gates

### Gate A — prove the existing base
- Audit all routes, schema, migrations, auth, RLS, tenant FKs and existing UI; map each feature to implementation and tests.
- Run PostgreSQL 18 + PostGIS integration suite with non-owner/non-BYPASSRLS roles.
- Prove no cross-tenant read/write through REST, export, websocket, tiles, search, jobs or background workers.
- Run browser/device, RTL, keyboard, screen-reader and mobile network acceptance.
- No merge to main until required checks and review pass.

### Gate B — spatial foundation
- PostGIS schema and OGC API contract tests.
- Import/export, CRS transform, invalid geometry, antimeridian, precision and spatial permission tests.
- Map renderer benchmark, tile provider/license/attribution checks, route matrix correctness.
- Offline cache and stale-data semantics; no false live state.

### Gate C — twin foundation
- Twin registry, identity mapping, source adapters, observation ledger, Digital Thread event envelope and replay.
- SensorThings 2.0 compatibility tests and MQTT delivery/reconnect/duplicate/out-of-order tests.
- Staleness, source loss, clock skew, unit conversion and provenance acceptance.
- 3D/BIM import and mobile rendering benchmarks before promising 3D functionality.

### Gate D — contact center
- Real provider sandbox or SIP trunk; inbound/outbound/transfer/hold/conference/queue/callback/recording tests.
- Two-way audio/video, NAT traversal, reconnect and packet impairment.
- Signed webhook/replay/idempotency tests; queue failover and supervisor authorization.
- CRM PII gates, retention/deletion and consent tests.
- Language/dialect native-speaker acceptance.

### Gate E — resilience and commercial proof
- Load, soak, chaos, failover and recovery tests.
- Restore to isolated environment and verify row/object counts and cryptographic checks.
- Tenant-specific configuration, data residency and deployment profile acceptance.
- Generate SBOM, build provenance and buyer evidence pack from CI artifacts.

## 9. Explicit unresolved decisions
1. First buyer sector and first physical-asset data model.
2. Actual authoritative asset/GIS/BIM data sources and licensing.
3. IoT protocols, gateways, edge topology, certificates and device ownership.
4. 3D engine and target device performance envelope.
5. SIP carrier, SBC/PBX, numbering, recording and regional telecom/legal requirements.
6. Messaging channel providers and their approved business APIs.
7. External KMS/HSM/signing/immutable evidence provider.
8. Data residency, retention, consent and deletion policy per buyer jurisdiction.
9. Availability, RTO/RPO, throughput and concurrency targets from buyer BIA and measured load.

## 10. Implementation truth table
- **Existing operational twin API and persisted snapshots:** present in the reviewed branch; UI added by PR #498.
- **A fully synchronized physical digital twin:** not established.
- **3D/BIM/SCADA/IoT live federation:** not established.
- **Full enterprise GIS with OGC services and measured large-scale performance:** not established by PR #498.
- **Real SIP/PSTN media plane and carrier acceptance:** not established by PR #498.
- **Omnichannel contact center conformant with ITU-T F.748.67:** target architecture only; conformance not claimed.
- **Production SLO, compliance or availability qualification:** not claimed.

This document is an engineering target and acceptance contract. It does not certify the implementation, external services, or production deployment.
