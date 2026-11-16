# Live release statement (seller-operated production)

**Measured at:** 2026-11-16 (runtime)  
**This is not a License Schedule and grants no rights.**

| Field | Value |
|---|---|
| Product version | 0.11.62 |
| Live sourceCommit | `4017497068defa9c1d0761fcb07bc746925e002a` |
| GitHub `main` at statement time | see current `main` HEAD (may include docs-only commits after live tip) |
| Release status | `PASS_WITH_BUYER_RESIDUALS` |
| productionIsolationCertification | CERTIFIED (runtime embed + flag for this live tip) |
| productionSessionTenantBoundary | PASS_PRODUCTION |
| productionRecoveryBundle | PASS_PRODUCTION (branch-point; not full PITR RPO/RTO) |
| Package SHA-256 | `dea02a40c556fee6abfc84c372fb153009317867593bf9dafe8f21e171b02880` |
| CI pipeline | `43827648670` |
| Proof URL | https://opscore-platform.vercel.app/api/verify/release |

## Explicit non-claims

- Not a buyer-environment certification.  
- Not full PITR / RPO / RTO certification.  
- Not a 67-route signed-session production matrix (see signed-route audit: NOT VERIFIED).  
- Not a commercial license grant.

Pin License Schedules to this statement’s commit and package digest when selling this exact tip.
