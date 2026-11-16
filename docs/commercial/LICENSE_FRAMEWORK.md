# OpsCore — Commercial License Framework (no fixed prices)

**Status:** Framework only. **No license is granted by this document alone.**  
**Offer publication:** The rights holder may advertise, list, present and negotiate the offer before a buyer is identified; no buyer signature is required to publish or market the offer.  
**Authority:** A buyer license exists only when the rights holder and the named buyer both sign a **License Schedule** that references this framework and identifies the exact deliverable (source commit and/or package SHA-256). The Schedule is a transaction-closing requirement before buyer rights or delivery, not a seller marketing gate.

Prices, payment terms, support level, and territory are **negotiated per buyer** and recorded only in that Schedule. This repository does not publish list prices.

## Purpose

Support three commercial intents without forcing a single rigid SKU:

| Tier | Buyer intent | Core rights (only if Schedule says so) | Default exclusions |
|---|---|---|---|
| **A — Use** | Run a copy for the buyer’s own operations | Install, configure, operate one production deployment (and agreed non-production instances) | No redistribution; no sublicense; no marketplace resale |
| **B — Use + Modify** | Adapt the software to the buyer’s environment | Tier A + create internal modifications and private forks for the buyer’s own use | No distribution of source or binaries to third parties; no open-sourcing without a Tier C grant |
| **C — Use + Modify + Distribute** | Build a product or service for third parties | Tier B + distribute agreed forms (e.g. hosted service, OEM, or source) under conditions in the Schedule | Must not imply OpsCore endorsement; must not remove rights-holder notices unless Schedule allows |

Any right not expressly granted in the signed Schedule is reserved.

## Mandatory Schedule fields (per buyer)

1. Parties (legal names) and effective date  
2. Tier (A / B / C) and any narrowed sub-scope  
3. Deliverable identity: `sourceCommit` and/or package `SHA-256` from a single release statement  
4. Instance limits (e.g. production sites, regions)  
5. Modification and distribution rules (especially Tier C)  
6. Confidentiality and audit of compliance  
7. Support / updates (if any) — scope only, not a warranty of fitness  
8. Price and payment — **filled per negotiation; not taken from this repo**  
9. Term, termination, and effect of termination (including destruction or return of copies if required)  
10. Governing law and dispute venue (buyer-specific)

## Engineering truth (must not be sold as something else)

- Seller-reference production isolation or recovery proof does **not** automatically certify the buyer’s environment.  
- Branch-point recovery is not full PITR/RPO/RTO certification.  
- Buyer residuals (mobile store signing, human translation, licensed maps, external SaaS accounts) remain buyer-owned unless the Schedule explicitly includes them.  
- CI green and a healthy `/api/health` do not mean zero defects in every environment.

## How a sale is completed (process)

1. Choose Tier A, B, or C with the buyer.  
2. Pin the deliverable to one release statement (commit + package digest).  
3. Fill and sign `docs/commercial/LICENSE_SCHEDULE_TEMPLATE.md` (or equivalent PDF).  
4. Deliver only the artifacts listed in that Schedule.  
5. Keep the signed Schedule offline; do not commit secrets or private commercial terms to git.

## Default posture before any Schedule

Until a Schedule is signed: **no license grant** — see `NO_LICENSE_GRANT_NOTICE.txt`. Evaluation access, if any, must be under a separate written evaluation letter.
