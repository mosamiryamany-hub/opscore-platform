# OpsCore UI/UX Audit — baseline of 2026-11-27

Branch `feat/ui-ux-excellence-20261127`, base `3cc84f92ee6dd30730d4e96cabf3f9853ffdd7dd`.
All numbers below were measured from the git tree of the base commit, not estimated.

## 1. Inventory
15 HTML pages, 5 stylesheets (66,252 chars), 17 scripts under `backend/web`.

| Page | Bytes | Notes |
|---|---|---|
| contact-center-room.html | 12,328 | largest surface, 6 linked assets |
| verify/release.html | 10,840 | |
| index.html | 9,476 | |
| control-rooms.html | 9,408 | nine-room grid, static |
| contact-center.html | 8,985 | |
| control-plane.html | 8,147 | |
| pricing.html | 4,812 | 0 linked stylesheets |
| verify/deployment.html | 4,339 | |
| verify/database.html | 2,303 | |
| security/privacy/refund/legal/terms.html | ~1,700 each | 0 linked stylesheets |
| portal.html | 957 | |

## 2. Data sources — corrected after tracing linked scripts
**Correction:** the first scan counted only a narrow set of direct `fetch()` references and did not follow all page-linked scripts. It was not sufficient evidence to conclude that the operational read models were absent. That conclusion is withdrawn.

Verified page-script/API relationships on the base tree:
- `contact-center.html` loads `contact-center.js`, which calls the tenant-scoped Contact Center status, handoff queue, conversation and message routes.
- `contact-center-room.html` loads `contact-center-room.js`, which reads `/api/v1/contact-center/status`, `/api/v1/contact-center/handoffs`, `/api/v1/me`, and the protected conversation route; it also calls the assignment-bound claim and resolve routes.
- `control-plane.html` loads `control-plane.js`, which uses same-origin authenticated requests for identity and control-plane data.
- `index.html` loads `home-fabric.js` and `fabric-core.js` for public health and release proof.
- `control-rooms.html` is a room-directory shell; its room cards are navigation, not a live operational data feed.

Verified server routes already present:
- Dispatch: `GET /api/v1/dispatch-board`.
- Dispatcher map: `GET /api/v1/dispatcher-map` and `GET /api/v1/dispatcher-map/v2`; the v2 contract explicitly reports Haversine straight-line distance only and does not claim road ETA.
- Field operations: `GET /api/v1/field/today` and `GET /api/v1/field/live-snapshot`.
- Contact Center: `GET /api/v1/contact-center/status`, `GET /api/v1/contact-center/handoffs`, and `GET /api/v1/contact-center/conversations/:id`, with server-side tenant checks and role restrictions; claim/resolve actions are also present.

**Revised conclusion:** real read models exist for dispatch, field operations and Contact Center. The design-token PR does not add those models because they already exist. Remaining work is a page-by-page contract audit to establish which visible panels are wired, which data fields are absent, and whether Customer 360 / supervisor analytics require additional aggregation. Do not invent missing fields or claim that every room is fully data-bound.

## 3. Zero-illusion scan
`Math.random`, `mock`, `demo`, `fake`, `placeholder data` in `backend/web/*.js`: **0** occurrences. No fabricated values ship today.

## 4. RTL and i18n
- `dir="rtl"` in HTML: **0 of 15**. Direction is set at runtime (`app.js:30`, `fabric-core.js:26`).
- `[dir=…]` CSS rules exist in 4 of 5 stylesheets — partial.
- `prefers-color-scheme`: **absent** from the whole tree; no light theme, no OS-driven theme.
- Locales: 105 + base; manifest declares `translationProvenance: machine_assisted_draft`, `nativeReviewStatus: not_native_reviewed`.
- Mixed-direction risk: `contact-center-room.html` pairs Arabic UI text with LTR identifiers without `unicode-bidi` isolation (addressed by tokens).

## 5. Accessibility baseline (measured)
| Metric | Baseline |
|---|---|
| `<img>` | 0 (no missing-alt exposure) |
| Form controls | 12, all labelled |
| Buttons | 30; unnamed **0** |
| Skip link | **3 of 15** |
| `<main>` landmark | **8 of 15** (7 pages have none) |
| Visible `:focus-visible` style | not defined |
| Touch-target floor | not enforced |
| `prefers-reduced-motion` | not handled |
| `forced-colors` | not handled |
| Long-ID wrapping (`overflow-wrap`) | not handled |

## 6. Root cause of visual drift
Five stylesheets carry five private palettes (`--bg/--ink/--cy/--vi/--am` vs literals in the other four) and **no shared scale** for type, space, radius, elevation or status colour. Inconsistency is structural, not stylistic.

## 7. Changes in this branch (root-cause only)
1. New `backend/web/design-tokens.css`: 8-step type scale (1.200), 8-step 4px space scale, radius/elevation/motion, 44px target floor, semantic status, dark **and** light plus `prefers-color-scheme`, `:focus-visible` rings, `.sr-only`, `.table-scroll`, `overflow-wrap: anywhere`, `prefers-reduced-motion`, `forced-colors`, RTL logical properties and directional-icon flipping.
2. Linked first in every page head: **15/15**.
3. Skip link on **15/15** pages, each with a guaranteed resolvable `#main` target (focusable anchor added on the 7 pages that have no `<main>` landmark).
4. This audit document.

No endpoint, permission, auth path, schema, dependency or markup feature was removed.

## 8. Not done here, and why
Additional page-by-page wiring and contract coverage for every control-room panel; Customer 360 and supervisor analytics completeness remain unverified; table componentisation; semantic `<main>` landmarks on 7 pages; browser/device/axe matrices and before/after screenshots (not completed in this branch at the time of this audit); native translation review and telephony (external dependencies).
