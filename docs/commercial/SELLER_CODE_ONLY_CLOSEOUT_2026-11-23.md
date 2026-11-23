# OpsCore — full-site closeout scope (supersedes the 2026-11-23 code-only plan)

**Status of the previous content:** the code-only plan that excluded the seller Vercel website, the seller Production deployment and the seller Neon database is **superseded by owner decision on 2026-11-23**. It is retained here as a historical record of scope evolution; it does **not** govern acceptance.

## Current scope — the complete hosted product

| Element | In scope? | Acceptance requirement |
|---|---|---|
| Source code + reproducible release package | Yes | CI, SBOM, archive SHA-256, signature and tamper tests on the exact commit |
| Seller Vercel website (`opscore-platform.vercel.app`) | Yes | Deployment identity read from Vercel and matched to the same commit, not inferred from a `200` health response |
| Seller Production deployment | Yes | Production route/session/restore evidence carrying the same deployment id and commit |
| Neon production database (`summer-leaf-18448271`) | Yes | Migrations, RLS, tenant isolation, plus periodic backup and a full restore test |
| Commercial/legal pages (`/terms`, `/privacy`, `/refund`, `/pricing`, `/legal`, `/security`) | Yes | Published from owner-supplied legal data and re-probed live; owner data is a hard prerequisite |
| Mobile signed builds / store publication | Buyer | Owner does not hold store accounts or signing keys for a transferable artifact |
| Independent ISO 27001 / SOC 2 / PCI DSS | Owner decision | Requires an accredited external assessor; never self-issued |

## Plan and resources

- No Neon or Vercel paid-plan upgrade is included or authorized by this document; the current plans stay unless the owner approves an upgrade explicitly.
- Preserve the seller Neon Primary branch, all branches and the listed manual snapshot. No deletion, promotion, or mutation as part of documentation work.
- The database application test suite stays mandatory on disposable isolated PostgreSQL: migrations, schema parity, RLS, tenant isolation, composite foreign keys, integration and recovery logic.

## Truthfulness rules that remain binding

- No required test may be re-labelled as a pass because a different suite passed.
- A skipped or unavailable check stays explicitly listed until it is closed or formally classified as not applicable with a documented reason.
- A green CI run is not production acceptance; a `200` health response is not deployment identity.
- Internal CI/test/SBOM/Sigstore evidence is not an external certification.

Current closeout remains **OPEN**; see `docs/ops/REMAINING_CLOSEOUT_GATES.md` for the open-gate list.
