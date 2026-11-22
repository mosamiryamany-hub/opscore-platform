# OpsCore — Buyer evidence index (2026-11-22)

**Current classification: PASS_WITH_RESIDUALS.** Production deployment and scope-specific engineering evidence pass. This is not full commercial closure, a license grant, buyer-environment qualification or an external certification.

## Current identities
- Application-source baseline (PR #391): `859a7f6f9d7759910602f4c89136c5d0a38d522d`
- Current Production source: `2a4938a70220d3375497e94499850476b4b505de`
- Production deployment: `dpl_G7r6CDntYarpafuawie8CKWDLBB7`
- Public domain: https://opscore-platform.vercel.app
- Latest protected Production evidence run: [45013074938](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45013074938)
- Evidence-page update: [PR #390](https://github.com/mosamiryamany-hub/opscore-platform/pull/390), merged to main but not yet Production-deployed.
- 114-locale catalogue and safe fallback update: [PR #391](https://github.com/mosamiryamany-hub/opscore-platform/pull/391), merged as `859a7f6`. Nine previously withheld locale codes are English-fallback-only interface options, disabled for conversations; native-speaker review and production qualification remain 0/114.
- Post-merge checks on `859a7f6`: OpsCore CI [45018113019](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45018113019), Vercel source/contract/isolated PostgreSQL [45018113156](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45018113156), CodeQL [45018112500](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45018112500): all PASS. Production deploy, PITR historical probe and Preview migration were intentionally skipped on push; live Production remains source `2a4938a`.

## Verified production evidence
| Evidence | Status | Bound target |
|---|---|---|
| Staged Production runtime, database and release gates | PASS | Candidate for commit `2a4938a`, run `45013074938` |
| Client socket TLS | PASS, TLS 1.3 | Actual application connection |
| Signed-tenant route matrix | PASS 67/67 | Candidate `dpl_FgDTqKJxCDw3SAGLtgPxqfQHGu7v` |
| PostgreSQL HTTP route probes | PASS 358/358 | Same candidate, exact Production branch/database/commit/pipeline |
| Authenticated tenant E2E workflows | PASS 3/3 | Customer, work-order and asset/event workflows |
| Recovery-point v4 / native PITR v2 | PASS | 136 public tables, SHA-256 parity, zero content mismatch, RLS/FORCE-RLS parity, cleanup |
| Production promotion / public domain | PASS | Final `dpl_G7r6CDntYarpafuawie8CKWDLBB7`, exact source SHA verified |
| Raw-GUC identity forgery probe | PASS | Live Neon Production, `opscore_runtime`; no tenant/user context, empty mode, zero visible rows in two probed tables |

**Scope:** 358 route probes are not 358 authenticated happy-path business flows. The explicit authenticated flow count is 3. The 67/358/3 behavioral evidence is candidate-deployment-bound and was not re-executed against the final promoted deployment ID. The final deployment passed staged runtime gates, HTTP smoke and public-domain SHA verification.

## Current-main CI after the documentation merge
- OpsCore CI [45016371911](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45016371911): SUCCESS.
- Vercel source + disposable PostgreSQL 18 acceptance [45016372092](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45016372092): SUCCESS; Production PITR, Preview migration and deploy jobs were skipped on the push event by design.
- CodeQL [45016372078](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45016372078): SUCCESS.

## Open handoff items
1. Production deploy of current main `859a7f6` through the protected manual workflow; do not use a direct deployment bypass.
2. Exact-current-head secure source release: ZIP, checksum, SBOM, Sigstore signature bundle and external statement.
3. Neon plan upgrade for protected Production branch and scheduled backups; no automatic schedule is presently configured and the Production branch is unprotected.
4. Vercel plan capability for OWASP CRS / Bot Protection enforcement; the currently configured generic/RCE/SQLi/XSS/Bot rules are log-only, while a custom login rate-limit rule is active.
5. No license grant until a rights-holder and named buyer execute the deliverable-bound License Schedule.
6. Native mobile builds/store signing, provider/map licenses and buyer-environment acceptance.
7. Language status: 114 interface locales are selectable (1 English source, 100 machine-assisted drafts, 13 English fallbacks); 105 conversation-language targets. Nine historical withdrawal codes are interface-only English fallbacks, disabled for conversations. Native-speaker review and production qualification remain 0/114.

## Explicit non-claims
- No ISO 27001, SOC 2, PCI DSS or other third-party certificate has been evidenced.
- No RPO/RTO guarantee or automated backup schedule is established.
- No assertion that every route has an authenticated end-to-end business-flow test.
- No 114/114 production language qualification or native review.
- No mobile store publication, map-provider license or buyer-specific production acceptance.
- No use, redistribution, resale or sublicense rights are granted by this repository or evidence pack.

See [current commercial status](COMMERCIAL_CLOSEOUT_STATUS_2026-11-22.md), [canonical residual register](../BUYER_RESIDUALS.md), [License Framework](LICENSE_FRAMEWORK.md), and [No License Grant notice](../../NO_LICENSE_GRANT_NOTICE.txt).
