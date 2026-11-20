# OpsCore — Commercial Closeout Status

**As of:** 2026-11-20  
**Product version label:** 0.11.62  

## Product closeout independence

No prospective buyer or buyer signature is needed to complete the product closeout on the seller side.  
No license grant is made to a buyer until the rights holder and that named buyer execute a License Schedule that pins the exact deliverable (`sourceCommit` and/or package SHA-256).

Seller advertising, listings, demonstrations and negotiations may happen before a buyer is known. **OPEN FOR MARKETING** does not equal delivery rights. **NO LICENSE GRANT** by repository presence or this file.

## Executive status (seller technical track)

| Track | Status | Notes |
|---|---|---|
| Live production pin | See `/api/verify/release` | Must match `main` after authorized promote |
| productionIsolationCertification | CERTIFIED when live reports it | Behavioral + 67 routes + recovery + flag |
| Signed archive attestation | Embedded when release archive evidence present | HMAC release-identity attestation |
| Native production PITR | PASS_PRODUCTION_PITR when embedded evidence binds | Else PASS_BRANCH_POINT only |
| commercialClosure gate | PASS_WITH_BUYER_RESIDUALS | Buyer residuals disclosed |
| License framework L1/L2/L3 | Published with public seller minimum asking floors | Final buyer-specific fee and rights are fixed in the signed Schedule |
| Buyer residuals | Explicitly out of seller package | Stores · human translation QA · maps |
| Neon scheduled backups / plan | Residual — plan constrained | Free/launch limits; not a code defect |
| Org MFA / second maintainer | Operator residual | Account console actions |

## License tiers and seller floor guide (USD)

| Tier | Rights | Minimum fair floor |
|---|---|---|
| **L1** | Use only | **45,000** |
| **L2** | Use + modify + redistribute | **85,000** |
| **L3** | Exclusive / IP assignment | **175,000** |

See `LICENSE_FRAMEWORK.md` and `LICENSE_SCHEDULE_TEMPLATE.md`. Floors exclude buyer residuals and do not constitute a license grant. The floors are published now for marketing and buyer discovery; a buyer and signed Schedule are not prerequisites to listing the offer.

## Explicit non-claims

1. No distribution right is granted by cloning this repository or reading this file.  
2. CERTIFIED isolation is for the hosted seller-reference pin; it is not a warranty of fitness for a buyer environment.  
3. HMAC archive attestation is release-identity attestation, not app-store code signing.  
4. Branch-point recovery is not full row-content equality or RPO/RTO certification.  
5. Buyer residuals remain with the buyer.

## Commercial status string

`SELLER_TECHNICAL_TRACK_OPERATIONAL — LICENSE_FRAMEWORK_PRICED_FLOORS — NO_BUYER_SCHEDULE — NO LICENSE GRANT — BUYER_RESIDUALS_DISCLOSED`
