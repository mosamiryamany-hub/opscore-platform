# OpsCore — Technical and Commercial Closure Status

**Measured:** 2026-11-16 (live production + GitHub main)  
**Technical classification:** `PASS_WITH_BUYER_RESIDUALS` on production commit below.  
**Commercial license status:** **NO LICENSE GRANTED — COMMERCIAL MODEL PENDING**.  
**Distribution status:** **HOLD — DO NOT SELL OR DISTRIBUTE** until a separate written grant is signed by the rights holder.

This document is synchronized to the **live** release proof. It does not grant rights.

## Authoritative live identity

| Field | Value |
|---|---|
| Production sourceCommit | `4017497068defa9c1d0761fcb07bc746925e002a` |
| Matches GitHub `main` HEAD | yes |
| Product version | `0.11.62` |
| `/api/health` | healthy · engine postgres |
| `/api/verify/release` status | `PASS_WITH_BUYER_RESIDUALS` |
| productionIsolationCertification | **CERTIFIED** |
| productionSessionTenantBoundary | **PASS_PRODUCTION** |
| productionRecoveryBundle | **PASS_PRODUCTION** |
| productionAcceptance | **PASS** (same commit) |
| CI pipeline | `43827648670` |
| Package fingerprint (SHA-256) | `dea02a40c556fee6abfc84c372fb153009317867593bf9dafe8f21e171b02880` |

**Evidence authority:** Runtime embedded evidence produced during deploy pipeline `43827648670` is authoritative for the live deployment. Older files under `backend/docs/verification/PRODUCTION_SESSION_ISOLATION.json` and `PRODUCTION_RECOVERY_POINT.json` that still show `evidenceRebind` are **stale repository copies** and must not be cited as certification of the live tip.

## Commercial rights hold

No right is granted to use, install, run, inspect, modify, copy, distribute, resell, sublicense, host, or commercially exploit the source package. All rights reserved. A future grant requires a separate written agreement signed by the rights holder. CI success, production deployment, CERTIFIED isolation, archive, fingerprint, SBOM, or attestation does **not** create a license.

Authoritative package notice: `NO_LICENSE_GRANT_NOTICE.txt`. Package metadata remains `UNLICENSED`.

## Buyer residuals (explicit)

- Mobile store artifacts — REMAINING_BUYER  
- Native translation review — REMAINING_BUYER  
- Licensed street map — REMAINING_BUYER  

## Open engineering / ops (non-license)

1. GitHub PR merges requiring independent review (#84, #98, #161, #163).  
2. Vercel plan confirmation (Hobby vs commercial) for lawful commercial use.  
3. Neon history retention / paid plan for multi-day PITR; branch inventory hygiene.  
4. N1: confirm Vercel Production `DATABASE_URL` path ends with `/opscore_acceptance` (owner diagnostics already use that database name).  
5. Preview SSO blocks automated dual-tenant HTTP on Preview deployments until Protection Bypass or Authentication policy change.  
6. Signed-context route coverage below the 67-route commercial gate (Preview-scoped work).  
7. Migrations 063–067 remain Preview-staged; 068 applied where ledger shows it.

## Do not claim

- Full RPO/RTO certification (recovery evidence is branch-point parity).  
- PITR retention beyond current Neon plan window.  
- That repository `PRODUCTION_*` JSON files with rebind markers certify the live tip.  
- That CERTIFIED isolation equals a commercial license to sell or distribute.
