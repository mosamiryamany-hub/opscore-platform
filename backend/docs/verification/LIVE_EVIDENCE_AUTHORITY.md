# Live evidence authority

**Runtime (production deployment)** is authoritative for the live tip. Observe:

`GET https://opscore-platform.vercel.app/api/verify/release`

Git copies of `PRODUCTION_SESSION_ISOLATION.json` and `PRODUCTION_RECOVERY_POINT.json` that still contain `evidenceRebind` are **stale** relative to the live tip and must not be used to certify it.

When a License Schedule pins a deliverable, pin the **package SHA-256** and **sourceCommit** from the same release statement the buyer receives—not from unrelated historical JSON in git.
