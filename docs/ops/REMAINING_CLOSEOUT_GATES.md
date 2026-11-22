# OpsCore — Remaining closeout gates

**Evidence cut:** 2026-11-22. This is a current operational index, not a blanket certification.

| Gate | Current state | Completion criterion |
|---|---|---|
| Production deployment | PASS on source `2a4938a`; `dpl_G7r6CDntYarpafuawie8CKWDLBB7` | Deploy current main `859a7f6` through protected manual workflow to publish refreshed release-proof page |
| Production isolation / RLS | Internal `CERTIFIED` for exact run-bound evidence; raw-GUC forgery probe rejected | Preserve exact evidence scope; no third-party certification claim |
| Route / business-flow coverage | 67 signed routes, 358 route probes, 3 authenticated flows PASS on candidate | Do not imply each of 358 routes has an authenticated happy path |
| Recovery / native PITR | v4/v2 PASS; 136 tables, zero content mismatch, RLS parity, cleanup | No RPO/RTO promise or automatic backup guarantee |
| Neon protection / scheduled backups | HOLD — Free plan blocks current branch protection and schedule | Eligible plan, protect Production branch, enable schedule/retention and prove restore |
| Vercel WAF enforcement | HOLD — generic/RCE/SQLi/XSS/Bot rules are log-only | Eligible OWASP CRS capability; Preview rehearsal; controlled deny/challenge rollout |
| Current-head buyer archive | HOLD — not produced for `859a7f6` | Secure Release exact-head ZIP, checksum, SBOM, Sigstore bundle and statement |
| License / distribution | NO LICENSE GRANT | Rights holder + named buyer execute exact-deliverable License Schedule |
| Mobile | Buyer residual | Signed native Android/iOS builds, device QA and store publication |
| Languages | 114 interface-selectable; 105 conversation-enabled; 9 English-fallback interface-only; 0/114 native reviewed | Preserve the safe English-fallback options; enable conversation use only after remediation, native review and provider acceptance |
| Maps / external providers | Buyer residual | Contracts, keys, attribution, quotas and live buyer acceptance |
| Buyer installation | Not verified | Buyer environment install, migration, tenant isolation, restore and operations acceptance |
| Independent certifications | Not evidenced | Obtain and verify original, scope-matched external certificates before claiming them |

## Main and Production source divergence

Current protected `main` is `859a7f6f9d7759910602f4c89136c5d0a38d522d`. Post-merge OpsCore CI, Vercel source/contract/isolated PostgreSQL acceptance and CodeQL all passed (runs `45018113019`, `45018113156`, `45018112500`). The push event skipped Production deployment, Production PITR historical branch probe and Neon Preview migration; no live Production change occurred. Public Production remains on `2a4938a70220d3375497e94499850476b4b505de`.

## Protected Production deployment

A normal push run intentionally skips the deploy job. Publish current main only through `.github/workflows/vercel-deploy.yml` on `main` using `AUTHORIZE_PRODUCTION_RELEASE`, explicit `I_AUTHORIZE_PRODUCTION_DEPLOYMENT` confirmation and the owner-controlled readiness variables. Never bypass staged candidate, runtime gate, promotion and public-domain verification with a direct Vercel deployment.

The source package is a separate workflow: `.github/workflows/opscore-secure-release.yml`. Run it on the same exact source SHA agreed for the transaction. The ZIP, SHA-256, SBOM, Sigstore bundle, signer identity and release statement must all derive from that one run.

See [Commercial Handoff Status](../commercial/COMMERCIAL_CLOSEOUT_STATUS_2026-11-22.md), [Buyer Residuals](../BUYER_RESIDUALS.md), and [Buyer Evidence Index](../commercial/BUYER_EVIDENCE_INDEX.md).
