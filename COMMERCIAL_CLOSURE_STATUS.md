# OpsCore — Technical and Commercial Closure Status

**Technical classification (seller-reference, git-stored evidence):** `NOT_VERIFIED` — current repository `PRODUCTION_SESSION_ISOLATION.json` / `PRODUCTION_RECOVERY_POINT.json` still carry `evidenceRebind` with `probesReexecuted=false` and must not be cited as certification of the live tip.

**Commercial license status:** **NO LICENSE GRANTED — COMMERCIAL MODEL PENDING**.  
**Distribution status:** **HOLD — DO NOT SELL OR DISTRIBUTE**.

A future commercial grant requires a separate written agreement signed by the rights holder. CI success, production deployment, package fingerprint, SBOM, or attestation does not create a license.

## Live deployment pointer (not a license)

See `backend/docs/verification/LIVE_EVIDENCE_AUTHORITY.md` for the measured production commit identity and package fingerprint. Runtime release proof is observed at `GET /api/verify/release`. Buyer-environment certification remains **NOT_ESTABLISHED** for any customer deployment.

Do not treat git-stored rebind-era JSON as authority for the live tip. Do not report seller-reference production isolation from those files as verified until fresh commit-and-branch-bound probes replace them in the repository tree without rebind markers.

## Buyer residuals

- Mobile store artifacts — REMAINING_BUYER  
- Native translation review — REMAINING_BUYER  
- Licensed street map — REMAINING_BUYER  

## Open ops

1. Independent PR review culture (CODEOWNERS / second account).  
2. Vercel commercial plan confirmation.  
3. Neon multi-day PITR plan + branch hygiene.  
4. Confirm Production `DATABASE_URL` database name path (diagnostics use `opscore_acceptance`).  
5. Preview SSO policy for automation.  
6. Signed-context route coverage gate (Preview-scoped).  
