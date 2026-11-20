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
