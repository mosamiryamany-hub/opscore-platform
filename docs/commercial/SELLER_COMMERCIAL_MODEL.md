# OpsCore — Seller commercial model

## What is for sale

1. **Licensed source deliverable:** a fixed commit / package SHA under one of L1–L3, with the buyer's selected rights stated in the accepted transaction terms.
2. **Optional hosted handoff:** separate technical and commercial track; not implied by source license.
3. **Not sold by default:** production secrets, customer data, cloud billing accounts, app-store identities, trademarks.

## Tier choice guide

| Buyer situation | Suggested tier |
|---|---|
| Internal operations only | **L1 Use Only** |
| Will customize and/or offer to their customers | **L2 Use + Modify + Redistribute** |
| Wants exclusive control or IP assignment | **L3 Exclusive / IP Assignment** |

## Pricing policy

- Published seller asking prices are seller-side commercial terms, not independent market valuations or an executed quote.
- The final fee, currency, milestones, taxes, exact deliverable and permitted rights are stated in the buyer-specific accepted offer/order/contract.
- Seller may condition source delivery on the buyer's acceptance of the transaction terms and cleared payment, as stated in the offer.

## Independence of gates

| Gate | Meaning |
|---|---|
| Source package Secure Release | Engineering evidence for a ZIP + SBOM + signature/attestation path |
| Candidate isolation evidence | Behavioral proof on a held candidate deployment |
| Production alias promotion | Explicit second decision; not automatic from candidate PASS |
| Buyer-specific transaction terms | Record the selected rights, deliverable and commercial terms for an actual transaction |

Success of one gate never silently completes another.

## Buyer residuals (remain with buyer)

- Mobile store signing and release accounts
- Human translation QA beyond machine-assisted UI language switch
- Licensed map / street data providers
- Buyer's own production identity, messaging, telephony and payment-provider accounts

## Marketing posture

**OPEN FOR MARKETING AND CUSTOMER ACQUISITION.** The seller may advertise, publish, market, list, demonstrate, respond to RFPs, issue indicative quotes and negotiate before a buyer is identified. No pre-sale signature or separate License Schedule is required for these activities.

A buyer-specific accepted offer/order/contract states the deliverable, selected tier, permitted rights, restrictions, price and payment terms if a transaction proceeds. The separate License Schedule template is optional and may be used when helpful; it is not a customer-acquisition gate.

No rights are implied beyond the rights expressly included in the accepted transaction terms and those the seller is entitled to grant. Third-party components remain under their own licenses.
