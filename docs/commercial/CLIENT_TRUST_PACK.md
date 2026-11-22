# OpsCore — Client Trust Pack (2026-11-22)

**Classification: PASS_WITH_RESIDUALS. No license grant.** This pack reports scope-specific Production evidence and open handoff conditions. It is not a third-party security certificate or buyer-environment acceptance.

## Release identity
| Field | Value |
|---|---|
| Current application-source baseline (PR #391) | `859a7f6f9d7759910602f4c89136c5d0a38d522d` |
| Production source | `2a4938a70220d3375497e94499850476b4b505de` |
| Production deployment | `dpl_G7r6CDntYarpafuawie8CKWDLBB7` |
| Public alias | https://opscore-platform.vercel.app |
| Evidence workflow | [45013074938](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45013074938) |

## Production trust evidence
- Runtime promotion, TLS 1.3, database/security and public-domain exact-commit checks: PASS.
- Signed-tenant route matrix: 67/67 PASS on candidate deployment `dpl_FgDTqKJxCDw3SAGLtgPxqfQHGu7v`.
- PostgreSQL HTTP route probes: 358/358 PASS, candidate-bound.
- Authenticated tenant E2E workflows: 3/3 PASS (customer, work-order, asset/event), with cross-tenant denial and cleanup.
- Native PITR v2 and recovery-point v4: PASS; 136 public tables compared using SHA-256, zero content mismatches, RLS/FORCE-RLS parity and temporary-branch cleanup.
- Live raw-GUC forgery probe under `opscore_runtime`: effective tenant/user NULL, access mode empty, zero rows visible in `activity_log` and `sessions` under the forged context.

**Scope boundary:** behavioral evidence is bound to the exact candidate deployment and source/pipeline/database identity. It was not independently rerun against the final promoted deployment ID. The final deployment passed its staged runtime gates, smoke tests and public-domain exact-SHA verification. `CERTIFIED` is the internal, evidence-scoped Production isolation classification; no external ISO/SOC 2/PCI certification is claimed.

## Current main validation and deployment boundary

Post-merge main `859a7f6` passed OpsCore CI (run `45018113019`), Vercel source/contract plus isolated PostgreSQL acceptance (run `45018113156`), and CodeQL (run `45018112500`). The push workflow skipped Production deployment, Production PITR historical probe and Preview migration by design. The live domain still serves deployment `dpl_G7r6CDntYarpafuawie8CKWDLBB7` at source `2a4938a`; the 114-locale catalogue and release-proof page are not yet live.

## Current operating posture
| Control | State |
|---|---|
| Production database | Neon Free; branch `br-proud-salad-bcshhdap` ready, `protected=false` |
| Automatic Neon snapshots | No schedule configured |
| Listed manual snapshot | One; `snap-aged-thunder-bcsxc1a5` |
| Neon full-data restore proof | Historical v2 drill passed; no contractual RPO/RTO |
| Vercel | Hobby |
| Edge Firewall | Enabled |
| Generic/RCE/SQLi/XSS/Bot rules | Log-only |
| Login/mobile-login edge rate limit | 60 requests/IP/60 seconds |
| Current main vs live Production | main `859a7f6`; Production `2a4938a`; release-proof page and 114-locale catalogue not yet Production-deployed |

The current plan blocked enabling scheduled snapshots, protecting the Production branch and creating another snapshot. Vercel rejected enabling OWASP CRS enforcement under the current entitlement. No plan upgrade or WAF policy change was made.

## Buyer and provider residuals
- Native Android/iOS signed store artifacts, store accounts, device QA and publication.
- Runtime interface selector exposes 114 locales: 1 English source, 100 machine-assisted drafts and 13 explicit English fallbacks. 105 remain conversation-language targets; the nine historical withdrawal codes are selectable only as English-fallback interface options and disabled for conversations. Native-speaker review and production language qualification remain 0/114.
- Licensed maps/road-routing provider, keys, attribution, quotas and buyer acceptance.
- Buyer-specific identity, messaging, telephony, payment and other provider agreements/credentials.
- Buyer installation, migration, tenant isolation, restore and operational acceptance in the buyer's environment.

## License and distribution
**NO LICENSE GRANT.** No installation, use, modification, hosting, redistribution, resale or sublicense right is granted by this pack, the repository or the live Production deployment. The rights holder and named buyer must execute a License Schedule that pins the exact current deliverable SHA-256 and states the granted rights. The current-main signed buyer archive has not yet been generated; do not substitute an older draft release.

## External certification
No independent ISO/IEC 27001, SOC 2, PCI DSS or current third-party penetration-test certification is evidenced here. Do not use certification logos or claim external approval.

## Verification links
- [Production release workflow](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45013074938)
- [Post-merge main OpsCore CI](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45018113019)
- [Post-merge main Vercel source/contract + isolated PostgreSQL acceptance](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45018113156)
- [Post-merge main CodeQL](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45018112500)
- [Live release proof](https://opscore-platform.vercel.app/api/verify/release)
- [Live database security proof](https://opscore-platform.vercel.app/api/verify/database-security)
- [Live deployment identity](https://opscore-platform.vercel.app/api/verify/deployment)
