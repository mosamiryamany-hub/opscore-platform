# OpsCore Commercial Release Status

<badge>HOLD — NOT A CURRENT RELEASE</badge>

This file supersedes the stale GitLab-era status snapshot. It is a truthful status boundary, not a security certification, warranty, or assertion that the software is defect-free.

## Current release identity

- Source repository: https://github.com/mosamiryamany-hub/opscore-platform
- Release tag: no current buyer release tag verified.
- Archive: no current archive-producing run bound to the exact current main commit verified.
- SBOM and provenance: must be regenerated and attested for the exact final source commit.
- Production deployment: NOT VERIFIED against current main.
- Production certification: NOT_ESTABLISHED.
- Production isolation certification: NOT_CERTIFIED.

The previously committed `docs/release/COMMERCIAL_RELEASE_STATEMENT.json` identifies an older GitLab repository, source commit and pipeline. It is historical evidence only and must not be presented as the current release statement.

## Live platform observations

- The latest inspected Vercel production deployment points to an older source commit, not the current GitHub main head.
- The Vercel production deployment workflow's preflight blocked the build and promotion path. Its workflow can finish green while the deployment steps are skipped; inspect the job summary and deployment SHA, not only the overall workflow conclusion.
- The production preflight requires an explicit `OPSC_PRODUCTION_HOLD=false` and `OPSC_RELEASE_VERIFIED=true`. The hold must not be lifted simply to force deployment.
- Neon PostgreSQL 18.6 acceptance schema inspection found the RLS and cross-tenant FK items described in `COMMERCIAL_CLOSURE_STATUS.md`. The default branch remains unprotected under the current plan quota.

## Required before buyer delivery

- Close GitHub issues #30, #31, #32 and #33 with evidence tied to the exact release candidate.
- Complete full dependency and security scanning; disclose any non-blocking findings.
- Verify the iOS privacy manifest against actual app and SDK data flows and inspect the generated native artifact.
- Verify least-privilege production DB identity and production tenant isolation using populated, independent tenant fixtures.
- Generate the final archive, SHA-256 manifest, SBOM, provenance and signed artifact attestation from one exact source commit and pipeline.
- Deploy and verify that exact candidate; promote only after all production smoke and recovery gates pass.
- Clearly scope external integrations, signed mobile binaries, human translation review and licensed maps.

A prior PASS_WITH_BUYER_RESIDUALS label is historical and is not a release approval for the current source tree.
