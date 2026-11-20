# OpsCore — Technical and Commercial Closure Status

**Technical classification (seller-reference):** Owner-measured live release proof on 2026-11-20 reports `PASS` for source `2dbafb74e0812552a316e3b50588abb6467b081d`, pipeline `44756093116`, with 67/67 signed tenant routes and deployment-bound acceptance. This is a timestamped seller-deployment observation, not a transferable buyer certification. The public proof must report `gates.commercialClosure=PASS_WITH_BUYER_RESIDUALS` while the three buyer-owned deliverables remain open.

**Buyer-environment isolation / transfer:** `NOT_VERIFIED` until the buyer’s own environment is measured. Seller runtime CERTIFIED does not transfer.


## Dual-layer evidence (resolved)

- **Git-stored** `PRODUCTION_SESSION_ISOLATION.json` / `PRODUCTION_RECOVERY_POINT.json`: **PASS** (re-executed 2026-11-17, run 44029395474).
- **Runtime** `GET /api/verify/release` on the deployed Vercel production deployment: authoritative for that deployed sourceCommit only. Env flags on Production must match that runtime embed, not git tip of main.
- **67-route signed matrix**: proven in isolated PostgreSQL CI scope; not a full live Production HTTP matrix.
- **Neon backups**: Free-tier history is short; scheduled primary backups require paid plan. See `docs/ops/NEON_BACKUP_AND_RECOVERY_TRUTH.md`.

**Seller offer status:** **OPEN FOR MARKETING AND COMMERCIAL NEGOTIATION.** A named buyer or buyer-signed License Schedule is not a prerequisite to prepare, publish, present, or negotiate the offer. No buyer commitment is implied.

**License grant status:** **NO LICENSE GRANT** by default. All rights remain reserved by the rights holder until a transaction-specific License Schedule is executed by both the rights holder and the named buyer and pins the exact deliverable (source commit and/or package digest). The schedule is a per-transaction closing document, not a seller launch/marketing gate. Public seller minimum asking floors are published in `SALES_KIT.md` and `docs/commercial/SELLER_COMMERCIAL_MODEL.md` (L1 $45,000; L2 $85,000; L3 $175,000). The final buyer-specific fee and rights are negotiated and fixed in the executed Schedule.

**Delivery / use status:** **NOT AUTHORIZED before the applicable License Schedule is fully executed.** Do not treat an offer, listing, demonstration, technical report, public repository, or release artifact as a grant of rights. Delivery must be limited to the artifact and rights recorded in the signed Schedule.

## Live deployment pointer (not a license)

See `backend/docs/verification/LIVE_EVIDENCE_AUTHORITY.md` and `docs/release/LIVE_RELEASE_STATEMENT_2026-11-16.md`. Observe runtime proof at `GET /api/verify/release`. Buyer-environment certification remains **NOT_ESTABLISHED**. Runtime technical `status=PASS` is separate from `gates.commercialClosure=PASS_WITH_BUYER_RESIDUALS`. The remaining buyer-owned deliverables are mobile store artifacts, native-speaker translation review (0/114 production-qualified), and licensed maps/road-routing. Neither status transfers certification or usage rights to a buyer.

## Framework (ready for any buyer type)

| Tier | Intent |
|---|---|
| A — Use | Operate for the buyer’s own business |
| B — Use + Modify | Internal adaptation; no third-party distribution |
| C — Use + Modify + Distribute | Agreed redistribution / OEM / hosted offering |

Template: `docs/commercial/LICENSE_SCHEDULE_TEMPLATE.md`.

## Buyer residuals (authoritative list)

See `docs/BUYER_RESIDUALS.md`. Summary:

- Mobile store artifacts — REMAINING_BUYER
- Native translation review — REMAINING_BUYER (UI: all languages + machine-translation notice)
- Licensed street map — REMAINING_BUYER
- Neon capacity / multi-day PITR / extra protected branches — paid-plan dependency
- 67-route signed-session production coverage — PASS for the exact seller deployment only (67/67); it does not certify buyer environments.
- Mobile dependency remediation notes: `security/mobile-dependency-remediation-2026-11-01`

## Deploy policy (post PR #170 / #171)

- Production deploy requires explicit `workflow_dispatch` confirmation input and owner enable flag (not automatic on push).
- Vercel Git: main excluded from automatic production; previews allowed for other branches when the project is linked.

## Engineering honesty

- Seller-reference proofs do not transfer to the buyer environment.
- Branch-point recovery is not full PITR/RPO/RTO certification.
- Do not report seller-reference production isolation from rebind-era git JSON as verified; current session/recovery JSON was re-executed 2026-11-17.
