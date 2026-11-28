# OpsCore — Open-Source Workstream Implementation Status

**Date:** 2026-11-27  
**Branch:** `feat/self-hosted-open-source-stack-20261127`  
**Base:** `main` at `3cc84f92ee6dd30730d4e96cabf3f9853ffdd7dd`  
**Production:** unchanged by this branch.

## Implemented in this branch (pending CI)

| Capability | Implemented | Evidence / boundary |
|---|---|---|
| PWA install metadata | Yes | Updated `manifest.webmanifest`, root-scoped service-worker registration, scalable SVG icon |
| Offline shell | Yes | Explicit offline page; service worker caches a fixed allowlist of public static files only |
| Private data protection | Yes | `/api/*`, authenticated files, map tiles and all non-allowlisted resources are network-only; no API response caching |
| Dispatcher map | Yes | New authenticated page uses existing `GET /api/v1/dispatcher-map/v2` |
| Map renderer | Yes | MapLibre GL JS pinned to 6.20.0; page-scoped CSP permits only the renderer and OpenFreeMap hosts required by this page |
| Map data truth | Yes | Existing server contract returns latest persisted appointment check-in per technician; manager/admin/owner only; no continuous GPS claim |
| Map empty state | Yes | Invalid/missing coordinates are omitted; empty response displays no fabricated pins |
| Android preview APK workflow | Yes | Existing branch workflow uses local Gradle `assembleDebug`; artifact retention 14 days |
| Browser acceptance | Added | Playwright + axe CI workflow covers PWA registration, cache boundary, keyboard, viewport overflow and critical axe violations |

## Existing server capabilities discovered

The initial UI-only scan was incomplete: it did not follow the page scripts and therefore missed server-backed APIs already present in the repository. Do not repeat the claim that these models do not exist.

- Dispatch board: `GET /api/v1/dispatch-board`.
- Dispatcher map: `GET /api/v1/dispatcher-map/v2`; role-gated and based on recorded check-ins.
- Field mission: `GET /api/v1/field/today`.
- Field live snapshot: `GET /api/v1/field/live-snapshot`.
- Contact-center queue: `GET /api/v1/contact-center/handoffs`.
- Contact-center conversation read: `GET /api/v1/contact-center/conversations/:id`.
- Contact-center actions: claim and resolve routes are present and assignment-bound.
- Existing browser scripts call these routes through same-origin authenticated `fetch()` wrappers.

The new map page consumes the existing map contract; it does not introduce a new location table, fabricate positions, or weaken authorization.

## Not yet implemented / not claimed

| Capability | Status | Reason |
|---|---|---|
| Self-hosted vector tile server | NOT_CONFIGURED | Requires selected region/data extract, host sizing, storage, refresh and recovery |
| Self-hosted Nominatim | NOT_CONFIGURED | Requires regional OSM data and significant storage/compute |
| Self-hosted OSRM | NOT_CONFIGURED | Requires regional routing graph, host sizing and measured route quality |
| Native MapLibre in Expo | UNVERIFIED | Requires native config/build compatibility validation and real Android/iOS device testing |
| Production-signed APK | NOT_CONFIGURED | Signing keystore, custody, recovery and release workflow are not configured; current workflow is debug/preview only |
| PWA offline mutations | DISABLED | No encrypted IndexedDB queue, CSRF/idempotency and replay protections have been implemented or tested |
| Activepieces instance | NOT_CONFIGURED | No host, database, Redis, secrets or backup/upgrade operations configured |
| Telegram Bot adapter | NOT_CONFIGURED | No tenant-bound bot/chat credential model or explicit tenant opt-in; global bot token would risk cross-tenant delivery |
| Automated webhook retries / dead-letter redrive | UNVERIFIED | Existing HMAC-SHA256 outbound webhook endpoints and manual delivery route exist; automated retry scheduling and DLQ acceptance have not been proven |
| Public Nominatim / OSRM production use | NOT_APPROVED | Public endpoints are rate-limited / best-effort; production path is self-hosting or a contractually suitable provider |

## Cost statement

The selected libraries may have no software licence fee. This does **not** establish zero total operating cost. Compute, storage, bandwidth, domain, monitoring, backups, data refresh, device management, and human operations remain cost-bearing. Expo EAS Free has monthly build/update quotas; the local Gradle workflow avoids EAS build usage but still consumes CI runner minutes and requires Android build tooling.

## Acceptance gates

- [ ] All new GitHub Actions checks pass on this branch head.
- [ ] Browser screenshots and axe report reviewed, not merely uploaded.
- [ ] MapLibre loads from the pinned CDN under the page-scoped CSP in a real browser.
- [ ] OpenFreeMap terms/availability are accepted for the intended deployment or replaced with self-hosted tiles.
- [ ] Manager/admin/owner authorization and tenant isolation are tested against PostgreSQL.
- [ ] Android preview APK builds and installs on a real device.
- [ ] PWA installation is tested on current Android Chrome and iOS Safari.
- [ ] No private API response is cached by the service worker.
- [ ] Production release, Neon and Vercel remain unchanged until a separately authorized promotion.
