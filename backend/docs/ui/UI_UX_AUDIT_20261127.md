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

## 2. Data sources — the decisive constraint
Only **5** endpoints are called anywhere in the front-end:

`/api/health`, `/api/verify/release`, `/api/verify/deployment`, `/api/verify/database`, `/api/verify/database-security`.

`control-rooms.html`, `contact-center.html`, `contact-center-room.html`, `control-plane.html`, `index.html`, `portal.html`, `pricing.html`: **0 `fetch()` calls**. They are static shells — no tenant data is rendered.

Therefore Control Room, Call Center (agent view, Customer 360, Supervisor, Escalation) and the enterprise tables cannot be "bound to real data" by front-end work alone: the authenticated read models (work orders, interactions, escalations, audit trail, paginated lists) do not exist in the current API surface. Any implementation now would have to invent data, which the governing rule forbids.

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
Data-bound Control Room / Call Center / Customer 360 / Supervisor / Escalation (no read models), table componentisation (same prerequisite), semantic `<main>` landmark on 7 pages (recommended), browser/device/axe matrices and before/after screenshots (no browser runtime in this environment — not claimed), native translation review and telephony (external dependencies).
