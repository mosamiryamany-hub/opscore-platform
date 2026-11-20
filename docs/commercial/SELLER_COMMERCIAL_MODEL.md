# OpsCore — Seller commercial model

## What is for sale

1. **Licensed source deliverable** (preferred default): a fixed commit / package SHA under one of L1–L3.  
2. **Optional hosted handoff**: separate technical and commercial track; not implied by source license.  
3. **Not sold by default:** production secrets, customer data, cloud billing accounts, app-store identities, trademarks.

## Tier choice guide

| Buyer situation | Suggested tier |
|---|---|
| Internal operations only | **L1 Use Only** |
| Will customize and/or offer to their customers | **L2 Use + Modify + Redistribute** |
| Wants exclusive control or IP assignment | **L3 Exclusive / IP Assignment** |

## Pricing policy

- **No list price in-repo.**  
- Fee, currency, milestones, and taxes are negotiated and written only into the executed License Schedule.  
- Seller may withhold delivery until Schedule signature and cleared payment terms as the Schedule states.

## Independence of gates

| Gate | Meaning |
|---|---|
| Source package Secure Release | Engineering readiness of a ZIP + SBOM + attestation path |
| Candidate isolation evidence | Behavioral proof on a held candidate deployment |
| Production alias promotion | Explicit second decision; not automatic from candidate PASS |
| License Schedule | Legal grant to a named buyer |

Success of one gate never silently completes another.

## Buyer residuals (remain with buyer)

- Mobile store signing and release accounts  
- Human translation QA beyond machine-assisted UI language switch  
- Licensed map / street data providers  
- Buyer’s own Stripe (or other) production payment keys when enabled

## Marketing posture

**OPEN FOR MARKETING.** The rights holder may advertise, publish, market, list, and negotiate the offer before a buyer is identified.

No license grant exists until a named buyer and the rights holder execute a License Schedule that pins the exact deliverable. See `LICENSE_FRAMEWORK.md` and `NO_LICENSE_GRANT_NOTICE.txt`.

**NO LICENSE GRANT** by repository presence, candidate evidence, or this document alone.

## Minimum fair floors (USD, seller guide only)

| Tier | Floor |
|---|---|
| L1 Use Only | **USD 45,000** |
| L2 Use + Modify + Redistribute | **USD 85,000** |
| L3 Exclusive / IP Assignment | **USD 175,000** |

OPEN FOR MARKETING. **NO LICENSE GRANT** until a named buyer executes a License Schedule that pins the deliverable and states the negotiated fee (at or above the seller’s chosen floor).
