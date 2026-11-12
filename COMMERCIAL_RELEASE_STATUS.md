# OpsCore Commercial Release Verification Snapshot

> Build-generated evidence index for the current verified candidate. This is not a security certification, warranty, or guarantee of defect-free operation.

**Package version:** 0.11.62
**CI closure:** PASS_WITH_BUYER_RESIDUALS
**Mobile dependency audit:** {"total":0,"info":0,"low":0,"moderate":0,"high":0,"critical":0} (high/critical are release-blocking)
**Root PostgreSQL runtime dependency audit:** {"total":0,"info":0,"low":0,"moderate":0,"high":0,"critical":0} (high/critical are release-blocking)
**Source commit:** d940152d1428d82d9bb0c57695d929099a648ac3
**GitHub Actions pipeline:** https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/43308699094
**Archive (OpsCore-release.zip):** 1,966,630 bytes, SHA-256 `5a5b731b17f1c8dcc1c102ea5c79fa3e4d01bb2750d91b6d941e6a02a068de9c`
**Provenance attestation:** published on GitHub artifact attestations for the exact digest above (subject `OpsCore-release.zip`, one DSSE bundle with a Rekor transparency-log entry). Verify at `GET /repos/mosamiryamany-hub/opscore-platform/attestations/sha256:5a5b731b17f1c8dcc1c102ea5c79fa3e4d01bb2750d91b6d941e6a02a068de9c`.

## Evidence links

- Official repository: https://github.com/mosamiryamany-hub/opscore-platform
- Exact CI pipeline: https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/43308699094
- Outer Actions artifact: `opscore-release-43308699094` (contains `OpsCore-release.zip`, external release statement, mobile/root audit JSONs, forensic i18n evidence)
- Live deployment health: https://opscore-platform.vercel.app/api/health
- Vercel deployment identity: https://opscore-platform.vercel.app/api/verify/deployment
- Vercel release proof: https://opscore-platform.vercel.app/api/verify/release
- Vercel database security catalog: https://opscore-platform.vercel.app/api/verify/database-security

The Vercel endpoint URLs above are locations to check after deployment; this build job does not assert that those live responses passed. The public domain currently serves the promoted deployment `dpl_7YYWeNHF6C1ryCP44iSWbJF13bjQ` on commit `ad0cd0828815f5a213103bcfd8b312a32c01cc4d` (an earlier verified candidate); newer candidates remain staged until the runtime promotion gate passes.

## Security and buyer boundaries

- Production certification: NOT ESTABLISHED. Production-wide tenant-isolation certification: NOT CERTIFIED.
- Translation: 1 English source with 109 machine-assisted drafts; native-speaker review 0/114 and production qualification 0/114 remain disclosed buyer residuals.
- Production post-deploy behavioral acceptance: NOT VERIFIED BY THIS BUILD; the production promotion gate requires the runtime identity, session/tenant boundary, recovery bundle and acceptance evidence to bind to the exact deployed commit before any promotion.
- PostgreSQL RLS results produced by this pipeline are test-scope evidence, not proof of every live application route.
- Signed Android/iOS store artifacts, buyer-specific EAS/signing, physical-device acceptance and app-store publication remain buyer-owned.
- External identity, messaging/carrier/call-center providers, payment, webhook, storage, KMS/HSM, maps/road-routing and cloud accounts/licenses/credentials/live tests remain buyer-owned.
- Current mobile npm audit summary: {"total":0,"info":0,"low":0,"moderate":0,"high":0,"critical":0}; see mobile/mobile-dependency-audit.json in the same run's artifact for the complete report.
- Historical GitLab-era evidence (repo `mosamiryamany-hub1/opscore-commercial-final`, pipeline `3017246123`) is superseded and no longer identifies the current candidate.
