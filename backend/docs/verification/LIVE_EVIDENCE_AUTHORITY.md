# Live evidence authority

As of production commit `4017497068defa9c1d0761fcb07bc746925e002a`:

- **Authoritative:** evidence embedded in the Vercel production deployment from GitHub Actions run `43827648670` (session isolation + recovery point collected during deploy, bound to that commit, no rebind).
- **Stale if present:** any `PRODUCTION_SESSION_ISOLATION.json` / `PRODUCTION_RECOVERY_POINT.json` in git that still contains `evidenceRebind` or `sourceCommitHint` other than the live sourceCommit.

Live proof endpoint: `GET https://opscore-platform.vercel.app/api/verify/release`
