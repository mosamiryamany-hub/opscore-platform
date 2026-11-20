# OpsCore — Client Trust Pack

**Generated:** 2026-11-20 (synced to live production pin)  
**Authority:** Live endpoint only — [https://opscore-platform.vercel.app/api/verify/release](https://opscore-platform.vercel.app/api/verify/release)  
**NO LICENSE GRANT** by this document. Buyer rights require a signed License Schedule (see `LICENSE_FRAMEWORK.md` L1/L2/L3). Prices are not published here.

## Live release identity

| Field | Value |
|---|---|
| Product / version | OpsCore / 0.11.62 |
| Public status | **PASS** |
| sourceCommit | `066810de46b206d15f74c5f23d39491880960027` |
| Deployment ID | `dpl_3MD2asVaLCnFUW4om13F1z4PfZ2b` |
| Deployment ref / env | `main` / `production` |
| CI pipeline | [44717454341](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44717454341) — PASS |
| Package SHA-256 | `1f2a39de7ae84c4e7c502fc00cb5369ee82e161b0d4a109e8d8888549c9c27df` (PUBLISHED) |
| Checked at (endpoint sample) | 2026-11-20T10:43:35.490Z |

## Gate board (live)

| Gate | Result |
|---|---|
| commercialClosure | `PASS` |
| productionIsolationCertification | **`CERTIFIED`** |
| signedTenantSessionRouteCoverage | `PASS_PRODUCTION_ROUTE_SCOPE` |
| productionSessionTenantBoundary | `PASS_PRODUCTION_PROBE_SCOPE` |
| productionRecoveryBundle | `PASS_PRODUCTION_ROW_COUNT_SCOPE` |
| neonPointInTimeRecovery | `PASS_BRANCH_POINT` |
| livePostgresRls | `PASS_TEST_SCOPE` |
| postgresHttpAcceptance | `PASS` |
| tenantRouteSecurityCoverage | `PASS_TEST_SCOPE` |
| functionalApiRouteAcceptance | `PASS_CONTRACT_SCOPE` |

## Production acceptance binding

| Field | Value |
|---|---|
| status | PASS |
| commitSha | `066810de46b206d15f74c5f23d39491880960027` |
| pipelineId | `44717454341` |
| evidenceSha256 | `171f8daa38b44821ff11d19b22962c84cf6c8d0ebfa805bfde62fe0edf44c12a` |
| checkedAt | 2026-11-20T10:17:47.866Z |

## Scope notes (honest boundaries)

1. **CERTIFIED** means the v2 live probes, recovery-point evidence, 67 signed-session routes, same-commit/same-pipeline identity, acceptance proof, and explicit certification flag passed together on this pin.
2. `PASS_TEST_SCOPE` / `PASS_CONTRACT_SCOPE` gates remain CI- or contract-scoped and are **not** full business-flow certification.
3. Recovery evidence is row-count / branch-point scope — not full content equality, RPO/RTO, or unlimited PITR history.
4. Hosted production success does **not** grant a commercial license or authorize redistribution.
5. Buyer residuals remain with the buyer: mobile store signing, human translation QA, licensed maps, buyer payment keys.

## Org / account residuals (outside code pin)

| Control | Status at doc generation |
|---|---|
| GitHub secret scanning | enabled |
| GitHub push protection | enabled |
| Secret scanning non-provider patterns | disabled (plan/account eligibility) |
| Secret scanning validity checks | disabled (plan/account eligibility) |
| Neon org `require_mfa` | operator must confirm in Neon console |
| Second maintainer / break-glass collaborator | operator decision |
| License Schedule with named buyer | none — **NO LICENSE GRANT** |

## Verify yourself

```bash
curl -sS https://opscore-platform.vercel.app/api/verify/release | jq '.status, .sourceCommit, .gates.productionIsolationCertification, .packageFingerprint'
curl -sS https://opscore-platform.vercel.app/api/health
```

## Arabic summary

النشر العام على `066810de46b2` بحالة **PASS** وشهادة عزل **CERTIFIED**، مع مصفوفة 67 مسارًا مربوطة بنفس الالتزام وخط الأنابيب. هذا إثبات تشغيلي للإنتاج المستضاف، وليس ترخيص بيع أو إعادة توزيع. التسعير وجدول الترخيص (L1/L2/L3) يُستكملان مع المشتري خارج المستودع.
