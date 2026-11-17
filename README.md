# OpsCore Field Source Kit v0.11.62 — Zero Illusions + AI Contact Center

**Verified Capabilities Only. Explicit Boundaries. Buyer-Owned Deployment.**

> Multi-sector operational source kit: Web Console + Expo Mobile source.  
> Server-owned work orders, dispatch, offline field sync, evidence, audit, and governed completion.  
> **You own the deployment, the providers, and the store signing.**

---

## Start Here (Buyer)

| Document | Purpose |
|----------|---------|
| [docs/00-START-HERE/BUYER_QUICKSTART.md](docs/00-START-HERE/BUYER_QUICKSTART.md) | Primary handoff & first run |
| [docs/00-START-HERE/DEMO_SCRIPT.md](docs/00-START-HERE/DEMO_SCRIPT.md) | Complete operational story demonstration |
| [docs/00-START-HERE/TRUTH_BOUNDARIES.md](docs/00-START-HERE/TRUTH_BOUNDARIES.md) | What is verified vs what is **not** claimed |
| [docs/00-START-HERE/VALUE_PROOF.md](docs/00-START-HERE/VALUE_PROOF.md) | Demonstrated buyer value only |
| [docs/commercial/SALES_KIT.md](docs/commercial/SALES_KIT.md) | Honest commercial positioning |
| [docs/architecture/DIGITAL_TWIN_SYSTEM_MAP_2026-10-21_AR.md](docs/architecture/DIGITAL_TWIN_SYSTEM_MAP_2026-10-21_AR.md) | Multidomain digital-twin map with implemented vs planned boundaries |
| [docs/architecture/DIGITAL_TWIN_VERIFICATION_REPORT_2026_10_21_AR.md](docs/architecture/DIGITAL_TWIN_VERIFICATION_REPORT_2026_10_21_AR.md) | Test evidence and unresolved production gates |

**Evidence Pack:** `evidence-pack/` contains version-bound evidence records. Only the ZIP, release statement, archive SHA-256, SBOM, provenance, tests and dependency audits produced by one successful Secure Release run for the exact source head identify a current handover; historical evidence does not certify a newer commit.

---

## Version Compatibility

- Backend: **0.11.62**
- Mobile: **0.1.16** (Expo)
- Node engine: `>=22.23.4 <23`

## Zero Illusions Principle

This package deliberately separates:

1. **Verified in this source** (tests, gates, red-team, provenance)
2. **Environment-dependent** (your infrastructure, TLS, production PostgreSQL, store approval)
3. **Not claimed** (signed binaries, App Store/Google Play approval, legal WORM immutability, external payment gateway success)

Any serious buyer is expected to run `npm run buyer:preflight` and `npm run buyer:acceptance` themselves. A failed gate is a finding, not something to hide.

## AI Contact Center (candidate module)

- Open `backend/web/contact-center.html` after signing into the OpsCore console.
- Deployment/security/language qualification requirements: [docs/contact-center/AI_CONTACT_CENTER_ARCHITECTURE.md](docs/contact-center/AI_CONTACT_CENTER_ARCHITECTURE.md).
- Contact Center locale status: the runtime manifest currently exposes 105 selectable locale codes (1 English source, 100 machine-assisted drafts, 4 explicit English fallbacks). The separate qualification register contains 114 source rows; 9 flagged locales are withdrawn from runtime selection pending remediation and native-speaker review. Native-speaker review is 0/114 and production qualification is 0/105. Keep the machine-translation notice visible.
- The Contact Center now has a separate interface-language selector (auto-detected from browser settings and persisted in local storage) independent of the conversation-language selector. Runtime locale changes update translated DOM text safely through `textContent`; Arabic, Persian, Urdu, Hebrew, Pashto, Yiddish and Uyghur are configured for RTL direction.
- Run `cd backend && npm run contact-center:i18n` to validate the current 105 selectable locale files, registry alignment, key parity, placeholders and wiring. Structural validation is not native-speaker review: 0/114 qualification rows are native-speaker reviewed and 0/105 selectable locales are production-qualified. English-only privacy/voice requirement copy must be translated and reviewed before any claim of complete multilingual consent or production language quality.
- Browser realtime voice is included behind explicit consent and server-minted short-lived credentials. PSTN/SIP/WhatsApp/email adapters are not connected by this source package.

## Directory Layout

```
├── README.md                 ← you are here
├── NO_LICENSE_GRANT_NOTICE.txt ← No license grant; all rights reserved
├── VERSION
├── backend/                  ← Node backend + web console
├── mobile/                   ← Expo source (Android/iOS)
├── sdk/                      ← Client SDK
├── scripts/                  ← Release gates & packaging
├── skills/                   ← High-value skill references
├── docs/
│   ├── 00-START-HERE/        ← Buyer entry point
│   ├── security/             ← Hardening, threat model, governance
│   ├── commercial/           ← Sales, transfer, evaluation
│   ├── release/              ← Scope, changelog, manifests, checksums
│   ├── sbom/                 ← Current CycloneDX only
│   └── archive/              ← Historical reports (not required for operation)
└── evidence-pack/            ← Ready-to-share proof artifacts
```

## Quick Commercial Boundaries

- Commercial offer: source-code handoff, not seller-hosted SaaS. The seller may publish and negotiate before any buyer is identified; a transaction-specific License Schedule is required only before granting the named buyer rights or delivering the licensed package.
- Support/updates: no default period is included; scope, term and price are negotiated and recorded only in the signed License Schedule.
- Out of scope: deployment, TLS, store submission/signing, buyer infrastructure, new feature development

---

**Release packaging hygiene:** Runtime attachment stores and demo credentials are excluded by design. See `scripts/release-artifact-gate.js` and `scripts/package-release.js`.
