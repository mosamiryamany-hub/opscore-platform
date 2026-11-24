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

- **Owner-authorized one-time list prices (2026-11-24):** L1 Use Only — **USD $3,000**; L2 Use + Modify + Redistribute — **USD $6,000**; L3 Exclusive License **or** Assignment of specified rights — **15,000 (USD assumed, pending explicit seller confirmation)**.
- L3's two descriptions are alternatives, not an automatic combined transfer. The buyer-specific Schedule must choose exclusive license or assignment and identify the exact rights and assets.
- These are seller-selected list prices, not an independent valuation, and do not grant rights. The executed Schedule must pin the exact deliverable and state selected rights, payment, taxes, support, term and governing law/forum.
- L1/L2 are stated in USD; the seller supplied L3 as 15,000 without an explicit currency, so USD is only an assumption based on the other tiers and must be confirmed before quoting or signing. Do not charge or collect payment until seller jurisdiction/merchant identity, destination-based tax treatment, payment-provider terms and applicable online-sales disclosures have been reviewed and configured. Show the buyer the applicable total before confirmation; block checkout for destinations where compliant tax/payment handling is not configured.
- Proposed payment default for owner approval: one-time payment in full through an approved processor after the buyer-specific Schedule is signed; source access/delivery only after funds clear and a distribution-authorized exact-hash release is available. No payment processor or live checkout is currently configured.
- Refund/cancellation copy must preserve mandatory consumer rights in the buyer's jurisdiction. Do not use a blanket “no refunds” rule. If the seller cannot deliver the contracted authorized artifact, refund the payment through the original method promptly, subject to applicable law. Any withdrawal waiver for immediate digital delivery requires separate affirmative consent only where lawful.
- Seller may withhold delivery until Schedule signature and cleared payment terms as the Schedule states.

## Seller-reported status and seller-approved support defaults

- The seller states that he is the individual behind OpsCore and that it was not founded by another person. This is a seller representation, not independent chain-of-title verification; it does not establish ownership of every contribution, third-party/open-source component, or any rights subject to prior assignment or mandatory law. Review the SBOM and applicable component licenses before making a transaction-specific rights warranty.
- The seller approved a 30-calendar-day support, maintenance, and update period, starting at secure delivery, by the seller-provided email channel, with an initial acknowledgement target of two business days. The scope is limited to documented installation questions, reproducible defects in the delivered version, and corrective/security fixes made available during the period; it excludes new features, buyer-environment operation, 24/7 response, and guaranteed repair within two business days. This is a seller-approved commercial default, not a signed buyer Schedule or a legal SLA.
- Seller status is individual. Country/domicile, notice address, tax registration/status, and governing law remain unspecified; checkout remains disabled pending those items and applicable review.

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

## Online-sale controls — draft, not an active checkout

The current external release statement sets `distributionAuthorized` to `false`, and no buyer is named. Therefore an online offer may collect expressions of interest only; it must not accept payment, provide a download, or grant use rights until a fresh exact-hash release is authorized and a buyer-specific Schedule is executed. The currently prepared alternative archive is not the `.20.zip`, and its successful CI evidence does not override this hold.

Before enabling checkout, the seller must supply verified legal identity and seller location, select governing law/forum with local counsel, configure payment and tax calculation/invoicing, publish approved terms/privacy/refund disclosures, and test receipt, failure, cancellation and refund paths without charging a real customer. No seller jurisdiction or payment processor is identified in the current information.

**NO LICENSE GRANT** until a named buyer and the rights holder execute a Schedule that pins the deliverable and selected rights. The listed prices do not change `licenseGrant` or `distributionAuthorized` in any existing signed release statement.
