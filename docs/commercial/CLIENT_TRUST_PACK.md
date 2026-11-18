# OpsCore — Client Trust Pack (Seller-facing / Buyer diligence)

**Document date:** 2026-11-17  
**Product version:** 0.11.62  
**Pinned production source commit:** `4017497068defa9c1d0761fcb07bc746925e002a`  
**Package fingerprint (SHA-256):** `dea02a40c556fee6abfc84c372fb153009317867593bf9dafe8f21e171b02880`

> **License:** No license is granted by this pack alone. Rights transfer only under a signed per-buyer License Schedule (tiers A use / B modify / C modify+distribute).

## 1. What the buyer can verify without credentials

| Check | URL / reference |
|---|---|
| Live health | https://opscore-platform.vercel.app/api/health |
| Release proof (gates, commit, package, CI) | https://opscore-platform.vercel.app/api/verify/release |
| Source repository | https://github.com/mosamiryamany-hub/opscore-platform |
| Pinned production commit | https://github.com/mosamiryamany-hub/opscore-platform/commit/4017497068defa9c1d0761fcb07bc746925e002a |
| CI pipeline bound to production embed | https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/43827648670 |
| Fresh session/recovery evidence run | https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44029395474 |
| Commercial closeout status | https://github.com/mosamiryamany-hub/opscore-platform/blob/main/docs/commercial/COMMERCIAL_CLOSEOUT_FINAL.md |
| NO LICENSE GRANT notice | https://github.com/mosamiryamany-hub/opscore-platform/blob/main/NO_LICENSE_GRANT_NOTICE.txt |

## 2. Production gate snapshot (runtime)

| Gate | Status |
|---|---|
| Overall | PASS_WITH_BUYER_RESIDUALS |
| Tenant isolation certification | CERTIFIED |
| Session tenant boundary | PASS_PRODUCTION |
| Recovery bundle | PASS_PRODUCTION |
| Mobile store artifacts | REMAINING_BUYER |
| Native human translation review | REMAINING_BUYER |
| Licensed street maps | REMAINING_BUYER |

## 3. Platforms in scope

1. **Application (Vercel Production)** — API + web surface, release verifier, application firewall/rate limits  
2. **Database (Neon PostgreSQL 18)** — multi-tenant RLS, runtime least privilege, recovery branch-point evidence  
3. **Source & CI (GitHub)** — protected `main`, required checks, evidence workflows  

## 4. Buyer residuals (explicit — not hidden)

- Mobile app store signing and listings  
- Human translation QA (UI may show machine-translation notice)  
- Licensed map tiles / provider contracts  
- Neon paid plan if multi-day PITR and scheduled primary snapshots are required  
- Edge WAF rule promotion (log → deny) on the buyer’s Vercel plan  
- Optional: deploy a newer `main` tip only after a new authorized production evidence cycle  

## 5. Diligence steps (no secrets required)

1. Open `/api/health` → `ok: true`, version `0.11.62`  
2. Open `/api/verify/release` → `sourceCommit` matches pin; isolation CERTIFIED  
3. Open CI pipeline URL → matches embedded pipeline id  
4. Open evidence Actions run → session + recovery PASS for same commit  
5. Review License Schedule template and residuals before signing  

## 6. What this pack is not

- Not a license grant  
- Not transfer of cloud accounts, domains, or billing  
- Not a claim of zero residual work  
- Not certification of every future `main` commit until re-verified on a new production deploy

## REMAINING_BUYER (immutable without buyer action)

These are **not** seller defects for commercial close of the seller-operated pin:

1. **Mobile store artifacts** — signing, listings, Apple/Google review  
2. **Native human translation review** — zero native-speaker QA claimed  
3. **Licensed street maps** — provider contract and keys  

Seller release status remains `PASS_WITH_BUYER_RESIDUALS` while isolation is NOT_CERTIFIED on the pinned production commit until live probes complete.

## Seller source package (2026-11-18)

| Field | Value |
|---|---|
| Commit | `deba977db586f19128a1f53377fec183beab44d0` |
| Tag | `v0.11.62.16-commercial-source-package` |
| ZIP SHA-256 | `32263497d02e1c943fd15a64239d2c0da1d7f9a95d765b2a9254830e9758313a` |
| Secure Release | https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44211989356 |
| License | **No grant** until signed License Schedule cites this SHA |

Live production pin is now `7b6d12b816c7…` with isolation **NOT_CERTIFIED** until post-promote evidence completes; source package authority remains independent of the live pin.


## Production pin after authorized promote (2026-11-18)

| Field | Value |
|---|---|
| Live commit | `7b6d12b816c7a1ad4cc92802df7ce222bd233ade` |
| Public release proof | https://opscore-platform.vercel.app/api/verify/release |
| Health | https://opscore-platform.vercel.app/api/health |
| Isolation at promote time | **NOT_CERTIFIED** (first-promote path; post-promote evidence collection required) |
| Seller source package | still closed on Secure Release tip / ZIP SHA in closeout doc |
| Signed 67-route matrix | **DEFERRED_POST_PROMOTE** until coverage builder + live probes complete |

Do not treat UNVERIFIED/NOT_CERTIFIED as a source-package regression. Source package authority remains the Secure Release artifact; live pin authority is `/api/verify/release`.

