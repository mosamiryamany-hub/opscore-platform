# OpsCore — Commercial License Framework

**Status:** Framework only. **No license is granted by this document alone.**  
**Prices:** Not published in this repository. Price, payment schedule, currency, and taxes are negotiated per buyer and recorded only in a signed License Schedule.  
**Authority:** Buyer rights exist only when the rights holder and the named buyer both execute a **License Schedule** that (1) references this framework by version/date, (2) selects exactly one tier below, and (3) identifies the exact deliverable (`sourceCommit` and/or package SHA-256).

---

## Tier catalogue (three commercial intents)

| Code | Commercial name | Buyer intent | Grant summary | Default exclusions |
|---|---|---|---|---|
| **L1** | **Use Only** | Operate OpsCore for the buyer’s own internal business | Non-exclusive, non-transferable right to install, configure, and operate the licensed deliverable for the buyer’s own operations | No modification of source beyond configuration; no redistribution; no sublicense; no marketplace resale; no transfer of IP |
| **L2** | **Use + Modify + Redistribute** | Adapt OpsCore and offer it (or derivatives) to third parties under controlled conditions | Non-exclusive right to use, create modifications, and redistribute in the forms expressly listed in the Schedule (e.g. hosted SaaS, OEM binary, or source under stated constraints) | No claim of OpsCore endorsement; must retain rights-holder notices unless Schedule states otherwise; no transfer of underlying IP ownership |
| **L3** | **Exclusive — Intellectual Property Assignment** | Acquire exclusive commercial control and (where Schedule states) assignment of specified IP | Exclusive license and, if the Schedule expressly says so, assignment of copyright in the named deliverable and related repository materials owned by the seller | Does not automatically include third-party components, trademarks, or cloud accounts unless Schedule lists them; moral rights and non-assignable rights limited as local law allows |

Any right not **expressly** granted in the signed Schedule is **reserved** to the rights holder.

---

## L1 — Use Only (world-class baseline terms)

### Grant
- Non-exclusive, non-transferable, non-sublicensable license.
- Install and run the licensed deliverable in production and agreed non-production environments owned or controlled by the buyer.
- Create configuration, operational data, and backups solely for the buyer’s operations.

### Conditions
- Deliverable identity is fixed to the Schedule’s `sourceCommit` / package SHA-256.
- Instance / region / seat limits apply only if the Schedule states them.
- Buyer must not publish, sell, lease, or provide the software (source or binary) to third parties.

### Explicit non-grants
- Source modification beyond configuration files and agreed integration adapters.
- Redistribution, SaaS resale, OEM, or open-source publication.
- Trademark use beyond nominative reference to the product name in internal ops docs.

---

## L2 — Use + Modify + Redistribute

### Grant
- All L1 operational rights.
- Create, maintain, and use modifications and private forks for the buyer’s business.
- Redistribute **only** in the distribution forms named in the Schedule (examples the Schedule may select):
  - **Hosted service** operated by the buyer for third-party end users;
  - **OEM / embedded** binary or appliance;
  - **Source redistribution** under a buyer license that does not strip seller notices unless permitted.

### Conditions
- Schedule must list allowed distribution forms; silence means **no** redistribution.
- Third-party and open-source components remain under their own licenses; L2 does not re-license them.
- Buyer remains responsible for export controls, privacy, and end-customer terms.

### Explicit non-grants
- Assignment or transfer of seller copyright or patents.
- Exclusive rights in any field or territory unless Schedule upgrades to L3.
- Use of seller trademarks in marketing without a separate brand schedule.

---

## L3 — Exclusive Intellectual Property Assignment

### Grant (only as the Schedule writes it)
- **Exclusive license** in the field and territory defined in the Schedule; and/or
- **Assignment** of copyright in the specifically identified deliverable (repository snapshot / package SHA) owned by the seller.

### Conditions (mandatory quality bar)
1. **Deliverable schedule** — exact commit SHA, package SHA-256, and file inventory reference.
2. **Asset schedule** — what is included: source, docs, CI definitions, commercial docs; what is excluded: production secrets, customer data, third-party cloud accounts, domain names, app-store accounts unless listed.
3. **Third-party IP** — OSS and vendor components listed or “as found in SBOM”; assignment does not enlarge those licenses.
4. **Warranties** — limited to seller’s authority to convey the listed rights; no implied warranty of merchantability or fitness unless Schedule adds one.
5. **Transition** — optional assistance period (hours/days) described in Schedule; not open-ended support.
6. **Residual knowledge** — seller personnel retain general skills; no reuse of assigned exclusive code in competing products if Schedule’s non-compete clause is present and enforceable.
7. **Moral rights / jurisdiction** — waiver or assertion limited as permitted by governing law stated in Schedule.

### Explicit non-defaults
- L3 does **not** by silence transfer trademarks, domains, Neon/Vercel/GitHub billing accounts, or production data.
- L3 does **not** by silence create an employment or partnership relationship.

---

## Mandatory License Schedule fields (all tiers)

1. Parties (legal names), notices addresses, effective date  
2. Tier code: **L1** | **L2** | **L3** (exactly one)  
3. Deliverable identity: `sourceCommit` and/or package `SHA-256`  
4. Territory and field of use (or “worldwide / all fields”)  
5. Instance, deployment, or distribution limits (if any)  
6. For L2: allowed distribution forms; for L3: exclusive vs assignment language  
7. Confidentiality and compliance audit rights  
8. Support / updates (if any) — scope only, not fitness warranty  
9. **Price and payment — negotiated; left blank in repository templates**  
10. Term, termination, survival, governing law, dispute forum  
11. Signatures / authority of signatories  

Template: `docs/commercial/LICENSE_SCHEDULE_TEMPLATE.md`

---

## Seller-side commercial posture (no buyer required to market)

- The rights holder may advertise, list, and negotiate before a buyer is identified.
- Repository presence, CI success, or ZIP availability is **not** a license grant.
- Hosted Production certification and source-package readiness are **independent** gates; one does not imply the other.


## Seller guide — minimum fair floors (USD, November 2026)

These are **seller-side guide floors** derived from current market comparables for a production multi-tenant platform (isolation-certified, signed release evidence, no buyer residuals included). They are **not** a public list price and do **not** grant a license. Actual fee is written only in a signed License Schedule.

| Tier | Rights | Minimum fair floor (USD) | Market anchors (indicative) |
|---|---|---|---|
| **L1** | Use only (non-exclusive) | **45,000** | Below growth multi-tenant rebuild bands (~$120k–$300k); above simple marketplace script sales; use-only code transfers |
| **L2** | Use + modify + redistribute (non-exclusive) | **85,000** | Premium for commercial redistribution / OEM / hosted-resale rights over L1 |
| **L3** | Exclusive license and/or IP assignment | **175,000** | Lower band of pre-revenue multi-tenant platform IP acquisitions; exclusive assignment premium over L2 |

**Exclusions from these floors:** mobile store accounts and signing, native human translation QA, licensed street maps, buyer payment-processor production keys, Neon/Vercel plan upgrades, and any hosted production tenancy not listed in the Schedule.

**Sources consulted (2025–2026 market):** multi-tenant SaaS build cost tiers; pre-revenue PropTech SaaS/IP acquisition asks; source-code marketplace vs full-codebase acquisition patterns; exclusive vs non-exclusive licensing spreads. Floors are conservative and may be negotiated upward for territory, support, or transition assistance.

## Version

Framework version: **2026-11-20**  
Supersedes prior tier letters A/B/C in older drafts; map A→L1, B→subset of L2 without redistribute, C→L2/L3 as Schedule states.
