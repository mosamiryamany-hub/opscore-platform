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


## Latest measured status — 2026-11-23

The full-site scope above remains controlling. The latest evidence cut is `main` `5e3cb211b7660002418757612033ff8928f25b69`; PR #401 is merged. The successful push workflows do not mean Production was deployed: `45129195834` completed successfully, but the `deploy` job was skipped because the run was a push, not the separately authorized `workflow_dispatch` release.

Production still points to `dpl_FVXwPoqefvkNsxA3BqVrxYnxRQka` / `88df9046ea5d57b392530565bc8cf6a10627ac4a` (CLI source). A Production deployment search for `5e3cb211...` returned zero results. The six commercial/legal routes were reported 404 in the supplied probe and require owner data; no placeholder pages are accepted.

The generic OpsCore runner is `PASS_WITH_SKIPS` (990 tests, 987 pass, 0 fail, 3 skip). The three database-gated files were separately executed in the same-commit PostgreSQL 18 acceptance job and passed: HTTP acceptance 1/1, shared PostgreSQL rate limiter 1/1, tenant matrix 2/2; the overall route matrix passed 346 routes and the disposable logical restore drill passed 137 tables. These are isolated CI proofs, not Production evidence.

Neon Primary is on Free, PostgreSQL 18, with a 6-hour history window, no scheduled snapshot schedule, one existing manual snapshot, and `protected=false`. Two restore branches from that snapshot produced identical SHA-256 content digests for 136/136 public tables. Their seven table-count differences from current Primary reflect an older 2026-11-19 point-in-time state; they are not proof of corruption and are not current-Primary parity. Neon rejected enabling Primary protection because the plan limit was reached. No upgrade or deletion was performed.

The current Vercel firewall has active CRS and Bot Protection in `log` mode, no IP allow/deny rules, and an active authentication rate-limit rule of 60 requests/IP/60 seconds. Active attack status returned no anomalies. Log-only rules are not enforcement certification.

The release-proof design still needs correction: the code consumes a textual `CERTIFIED` flag and evidence pinned to a probe deployment ID, while the workflow later builds a separate staged deployment. Same-final-deployment evidence is not established. The catalog-only database-security proof's `NOT_CERTIFIED` result has a different scope from the behavioral release proof; the public contract must make those scopes explicit.

**Commercial closeout remains OPEN.** No buyer license is granted. No external certification is claimed. The exact current-main release package must be regenerated after the release workflow and proof-binding design are corrected.


**Buyer-transfer boundary:** Closing the seller's website and infrastructure is an operational acceptance task, not an automatic transfer of the seller's Vercel/Neon accounts, production database, customer data, domain, or hosting to a buyer. Buyer scope remains source code and release evidence unless a separate signed agreement defines a transfer.
