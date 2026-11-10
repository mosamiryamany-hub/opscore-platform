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

**Evidence Pack:** see `evidence-pack/` for SHA256, current SBOM, and key proof documents.

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
- Language catalogue: 114 unique target language codes and 114 matching locale JSON resources are included under `backend/web/i18n/locales/`; the manifest is checked against the server catalogue. The duplicated Welsh row in the supplied list was corrected to Faroese (`fo`) at row 104.
- The Contact Center now has a separate interface-language selector (auto-detected from browser settings and persisted in local storage) independent of the conversation-language selector. Runtime locale changes update translated DOM text safely through `textContent`; Arabic, Persian, Urdu, Hebrew, Pashto, Yiddish and Uyghur are configured for RTL direction.
- Run `cd backend && npm run contact-center:i18n` to validate locale count, catalog alignment, key parity, placeholders and wiring. Structural validation is not native-speaker review: all 114 locales remain unqualified, and English-only privacy/voice requirement copy must be translated and reviewed before any claim of complete multilingual consent or production language quality.
- Browser realtime voice is included behind explicit consent and server-minted short-lived credentials. PSTN/SIP/WhatsApp/email adapters are not connected by this source package.

## Directory Layout

```
├── README.md                 ← you are here
├── PROPRIETARY_LICENSE.txt   ← Proprietary source license
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

- Form: non-exclusive source-code sale (exclusivity by separate written agreement only)
- Support included: 30 days for critical defects in the supplied source
- Out of scope: deployment, TLS, store submission/signing, buyer infrastructure, new feature development

---

**Release packaging hygiene:** Runtime attachment stores and demo credentials are excluded by design. See `scripts/release-artifact-gate.js` and `scripts/package-release.js`.
