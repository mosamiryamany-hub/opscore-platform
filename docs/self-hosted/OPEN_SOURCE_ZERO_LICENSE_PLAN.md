# OpsCore — Open-Source / Self-Hosted Cost-Control Architecture

**Decision record:** 2026-11-27  
**Status:** Proposed implementation baseline; no third-party service is represented as provisioned or production-qualified.

## Executive decision

Adopt open-source components and self-hostable infrastructure to eliminate mandatory per-seat/per-request software subscriptions where technically and legally practical. Do **not** claim a zero-total-cost production platform: compute, storage, backups, bandwidth, domains, power, and operations still have costs. Public community endpoints are not production SLAs.

The design separates:
- **Zero licence fees** for selected open-source components.
- **Zero mandatory vendor API keys** for the initial map renderer/provider combination.
- **Self-hosted production services** for routing, geocoding, automation, and tiles when availability, privacy, or volume requires it.
- **Buyer-operated infrastructure** and provider credentials from OpsCore source code.

## 1. Maps and geospatial services

### Web renderer
- **MapLibre GL JS 6.20.0**, BSD-3-Clause.
- Pin an exact version; do not use `@latest`.
- Prefer vendored/self-hosted static assets in the production build. If a CDN is used during an evaluation, pin the exact version, use Subresource Integrity, and scope CSP to the map page only.
- Do not add a map to a page until the underlying API returns verified coordinates.

### Native renderer
- **@maplibre/maplibre-react-native 11.5.1**, BSD-3-Clause.
- Existing mobile baseline: Expo SDK 58 / React Native 0.88.1. MapLibre Native requires React Native >=0.80 and the new architecture; verify Expo config-plugin compatibility and perform real Android/iOS native builds before enabling.
- A native dependency requires a native rebuild; it cannot be added to an Expo Go runtime as if it were a JavaScript-only library.

### Initial hosted tile option
- **OpenFreeMap** can be used for evaluation and low-risk initial deployments without an API key. Its terms allow commercial use and specify limited user-initiated offline downloads (up to 3,000 tiles / 50 MB per download, up to four parallel requests).
- The service is supplied as-is and has no SLA. It is a hosted dependency, not self-hosted infrastructure and not an unlimited/guaranteed production service.
- Display visible attribution: © OpenStreetMap contributors. Preserve any additional attribution required by the selected style/provider.
- Configure the style URL through deployment configuration; do not hard-code it across clients.

### Production self-hosting path
1. Select a legally suitable regional OSM extract or a licensed dataset.
2. Build vector tiles using a pinned, reproducible pipeline (for example Planetiler/OpenMapTiles-compatible tooling).
3. Serve tiles and style/sprite/glyph assets from an OpsCore-controlled endpoint (for example Martin or TileServer GL, selected after load and compatibility testing).
4. Set cache headers, quotas, observability, backup/restore and update cadence.
5. Keep tenant-specific operational data out of public geocoding/tile queries.

### Geocoding and routing
- **Nominatim**: use a self-hosted instance for recurring production search, autocomplete, bulk operations or buyer-specific datasets. The public Nominatim endpoint has a strict maximum of one request per second, requires an identifying User-Agent/Referer and caching, and does not permit client-side autocomplete.
- **OSRM**: self-host for production routing and ETAs. The public demo server is best-effort and can be withdrawn; it is not a production dependency.
- Never label straight-line distance as road distance or an OSRM route as live traffic. The current dispatcher-map API explicitly reports Haversine distance only and `roadEtaClaimed=false`.
- The current dispatcher-map data source is the latest recorded appointment check-in only; it is not continuous GPS tracking. Only manager-authorized requests should receive these points.

## 2. Android, iOS and PWA distribution

### Android APK
- Keep Expo as the existing mobile application framework.
- Provide a GitHub Actions local Android build path that produces a debug/preview APK without EAS cloud build or Google Play.
- Direct APK installation is appropriate for controlled internal distribution; users must explicitly allow installation from the chosen source.
- A debug APK is not a production release. A production APK requires a stable, protected signing keystore, documented key custody, backup/recovery and a repeatable release-signing workflow.
- Do not regenerate a new signing key for every release. That would prevent in-place updates for existing installations.

### iOS
- A PWA can be added to the iOS Home Screen without App Store distribution, but it is not equivalent to a native iOS app. Browser APIs, background execution, push, storage and offline behavior differ.
- Native iOS Ad Hoc distribution requires an Apple Developer account and registered devices; App Store distribution requires the paid Apple Developer Program.
- Do not claim that PWA distribution removes all iOS capability or distribution constraints.

### PWA security boundary
The current native app depends on Expo SecureStore and SQLCipher-backed Expo SQLite. Those are native security/storage assumptions and must not be silently replaced with localStorage or plaintext IndexedDB.

A PWA must be a separate browser-targeted client with:
- same-origin, HttpOnly, Secure, SameSite session cookies (no bearer token in localStorage);
- CSRF protection on mutations;
- service-worker cache limited to versioned static assets (never cache authenticated API responses);
- an explicit offline state;
- a separately threat-modelled encrypted IndexedDB queue, idempotency keys, tenant binding, expiry and replay protection before offline writes are enabled.

Until that browser storage and queue design passes security tests, the PWA must remain online-only for mutations. Do not claim offline queue parity with the native SQLCipher app.

## 3. Automation and external integrations

### First-party foundation
Implement outbound webhooks in OpsCore as the stable integration contract:
- tenant-scoped endpoint registrations;
- HMAC-SHA256 signatures with timestamp and event ID;
- idempotent delivery and replay protection;
- bounded retries with exponential backoff and jitter;
- dead-letter state and audited redrive;
- allowlisted HTTPS destinations and SSRF protections;
- per-tenant secret rotation and delivery observability;
- no sensitive customer content in event payloads by default.

### Optional self-hosted workflow engine
- Prefer the **MIT-licensed Activepieces core** for a self-hosted optional integration runtime.
- Keep enterprise-licensed features out of the zero-licence deployment unless separately licensed.
- Treat Activepieces as a separately operated service with its own PostgreSQL/Redis/worker/storage requirements, security boundary, upgrades and backup plan. “Unlimited runs” in a community edition does not mean unlimited compute or zero hosting cost.
- Do not embed or white-label a third-party workflow UI as an OpsCore capability without a licence review.

Windmill Community Edition has AGPL/source and distribution/embedding restrictions in addition to enterprise features; do not select it for a buyer-redistributed or white-labelled package without a specific licence review. Do not describe n8n's Sustainable Use License as OSI open source.

### Telegram notifications
- Telegram Bot API may be offered as an optional notification adapter.
- It is not SMS, WhatsApp, or a guaranteed delivery channel.
- Require explicit tenant opt-in, verified chat binding, rate limits, retries and audit events.
- Send minimal non-sensitive notification text; link back to the authenticated OpsCore application for customer or operational details.
- Telegram is an external data processor and must be disclosed in buyer privacy documentation.

## 4. Cost and licence truth table

| Capability | Candidate | Licence / service cost | Production caveat |
|---|---|---|---|
| Web map renderer | MapLibre GL JS | BSD-3-Clause; no renderer fee | Tile data/service still required |
| Native map renderer | MapLibre Native React Native | BSD-3-Clause; no renderer fee | Native build and device testing required |
| Hosted tiles | OpenFreeMap | No API key / no service charge currently | Hosted, as-is, no SLA; terms and quotas apply |
| Self-hosted tiles | Planetiler + Martin/TileServer GL | Open-source components | Infrastructure, regional data and operations cost |
| Geocoding | Self-hosted Nominatim | Open source | Significant storage/compute and data refresh operations |
| Routing | Self-hosted OSRM | Open source | Regional extracts, routing graph builds and compute |
| Android internal distribution | Signed APK | No Play Store fee | Signing, update and device trust process required |
| iOS Home Screen | PWA | No App Store fee | Not native parity; browser constraints apply |
| iOS native distribution | Ad Hoc / App Store | Apple Developer membership required | Cannot truthfully be described as zero-cost |
| Automation | Activepieces MIT core | No core licence fee | Hosting, workers, database and exclusions apply |
| Webhooks | OpsCore backend | No per-event licence fee | Delivery infrastructure and operations cost |
| Notifications | Telegram Bot API | No per-message platform fee for ordinary bot use | External provider, quotas, privacy and delivery caveats |

## 5. Acceptance gates before production

- [ ] MapLibre versions pinned and dependency licences inventoried.
- [ ] Map style/tile provider is configurable and has an operational fallback.
- [ ] Attribution visible on web and native map surfaces.
- [ ] Map points originate only from authenticated, tenant-scoped, role-authorized API responses.
- [ ] Empty coordinates produce an explicit empty state, never fabricated pins.
- [ ] No public Nominatim autocomplete or public OSRM demo dependency in production.
- [ ] Self-hosted tile/geocoder/router resource sizing and recovery tested for the selected region.
- [ ] Android APK is reproducibly built; preview and release signing are distinguished.
- [ ] PWA does not persist bearer tokens or cache private API responses.
- [ ] Offline PWA mutations remain disabled until encrypted queue and replay tests pass.
- [ ] Webhooks pass tenant-isolation, signature, SSRF, replay, retry and dead-letter tests.
- [ ] Telegram notifications require explicit tenant opt-in and avoid sensitive content.
- [ ] Buyer handoff lists infrastructure and provider costs separately from software licence fees.

## 6. Current implementation boundaries

This decision record does not assert that a map provider, Nominatim, OSRM, Activepieces, Telegram, a PWA, or a production APK has been provisioned. The current OpsCore dispatcher-map API returns only the latest stored appointment check-in per technician, is manager-gated, and does not claim continuous tracking or road ETA. Existing Expo mobile uses SecureStore and SQLCipher; that is why the PWA cannot be treated as a one-line web build.

Classify each unimplemented service as `NOT_CONFIGURED`; each untested integration as `UNVERIFIED`; and each external provider as `EXTERNAL_DEPENDENCY`. No production or buyer-completion claim follows from this document alone.
