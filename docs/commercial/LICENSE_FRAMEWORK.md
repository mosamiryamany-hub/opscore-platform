# OpsCore — Commercial License Framework

**Status:** Framework only. **No license is granted by this document alone.**
**Owner-authorized list prices (USD, 2026-11-24):** L1 **$3,000**, L2 **$6,000**, L3 **$15,000**. These prices were supplied by the rights holder; they are not an independent valuation and do not grant rights. The exact deliverable, L3 scope, tax treatment, payment terms and rights must be stated in a signed buyer-specific License Schedule. L3 means an exclusive license **or** assignment of specifically identified rights, not both by default.
**Authority:** Buyer rights exist only when the rights holder and the named buyer both execute a **License Schedule** that (1) references this framework by version/date, (2) selects exactly one tier below, and (3) identifies the exact deliverable (`sourceCommit` and/or package SHA-256).

---

## Tier catalogue (three commercial intents)

| Code | Commercial name | Buyer intent | Grant summary | Default exclusions |
|---|---|---|---|---|
| **L1** | **Use Only** | Operate OpsCore for the buyer’s own internal business | Non-exclusive, non-transferable right to install, configure, and operate the licensed deliverable for the buyer’s own operations | No modification of source beyond configuration; no redistribution; no sublicense; no marketplace resale; no transfer of IP |
| **L2** | **Use + Modify + Redistribute** | Adapt OpsCore and offer it (or derivatives) to third parties under controlled conditions | Non-exclusive right to use, create modifications, and redistribute in the forms expressly listed in the Schedule (e.g. hosted SaaS, OEM binary, or source under stated constraints) | No claim of OpsCore endorsement; must retain rights-holder notices unless Schedule states otherwise; no transfer of underlying IP ownership |
| **L3** | **Exclusive License or Rights Assignment** | Acquire exclusive commercial control or assignment of specifically identified IP | The Schedule must choose an exclusive license or assignment of identified rights owned by the seller; neither form is implied by the other | Does not automatically include third-party components, trademarks, or cloud accounts unless Schedule lists them; non-assignable rights limited as local law allows |

Any right not **expressly** granted in the signed Schedule is **reserved** to the rights holder.

---

## L1 — Use Only (draft baseline terms)

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

## L3 — Exclusive License or Assignment of Identified Rights

### Grant (only as the Schedule writes it)
- Select exactly one: an **exclusive license** in the field and territory defined in the Schedule; or an **assignment** of copyright/right(s) in the specifically identified deliverable (repository snapshot / package SHA) owned and assignable by the seller.
- A $15,000 list price does not automatically include both an exclusive license and assignment. The signed Schedule must define precisely what transfers and what remains with the seller.

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
9. **Price and payment — use the owner-authorized tier list price unless a seller-approved buyer-specific adjustment is recorded in the signed Schedule**
10. Term, termination, survival, governing law, dispute forum  
11. Signatures / authority of signatories  

Template: `docs/commercial/LICENSE_SCHEDULE_TEMPLATE.md`

---

## Seller-side commercial posture (no buyer required to market)

- The rights holder may advertise, list, and negotiate before a buyer is identified.
- Repository presence, CI success, or ZIP availability is **not** a license grant.
- Hosted Production certification and source-package readiness are **independent** gates; one does not imply the other.


## Owner-authorized list prices (USD, 2026-11-24)

| Tier | Rights summary | List price (USD) |
|---|---|---:|
| **L1** | Use only (non-exclusive) | **$3,000** |
| **L2** | Use + modify + redistribute (non-exclusive; distribution forms must be named in the Schedule) | **$6,000** |
| **L3** | Exclusive license **or** assignment of specifically identified rights; the Schedule must choose and define the transaction | **$15,000** |

These are the prices selected by the rights holder, not an independent market appraisal, guarantee of value, or executed buyer quote. A signed Schedule must pin the exact package and state selected rights, payment, applicable taxes, support, term, and governing-law/dispute terms. Open-source and third-party components remain governed by their own licenses. The current release statement still says distribution is unauthorized; these prices do not change that release status.

**Not included unless expressly listed in the Schedule:** hosting, third-party accounts or fees, production data/secrets, mobile-store signing, native-speaker QA, licensed maps, and buyer-specific deployment or transition services.

## Version

Framework version: **2026-11-24**
Supersedes prior tier letters A/B/C in older drafts; map A→L1, B→subset of L2 without redistribute, C→L2/L3 as Schedule states.
