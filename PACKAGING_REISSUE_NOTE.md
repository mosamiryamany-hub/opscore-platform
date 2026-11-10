# OpsCore packaging reissue — 0.11.62.5

Date: 2026-11-09 (UTC)
Product version: 0.11.62
Packaging revision: 0.11.62.5
Release tag: v0.11.62
Source commit: `5c60420f42330d7bd79623547b07eee96ef0ebd77214e9996cf53dd2d997a7e7`
Historical source pipeline: `3017246123`

## Purpose and scope

This is an integrity and packaging reissue of the previously delivered OpsCore 0.11.62 source package. It is derived from the production `main` release source above. It does **not** claim a new application source release, a new production deployment, or a new production certification. The product version remains 0.11.62; only the buyer-package revision advances.

The reissue removes superseded duplicate evidence documents and orphan detached checksum sidecars from the buyer archive, refreshes the eight current verification sidecars against their exact JSON files, regenerates the backend provenance manifests, and rebuilds the package-level evidence and integrated SHA-256 manifests.

## Existing test evidence

GitLab pipeline `3017246123` on `5c60420f42330d7bd79623547b07eee96ef0ebd77214e9996cf53dd2d997a7e7` completed successfully. Its JUnit report recorded **494 tests passed, 0 failed, 0 skipped**. This is historical evidence for the source commit and is not a claim that the packaging reissue was rerun in GitLab CI.

## Local packaging checks performed

- Backend provenance verifier: PASS (all recorded release-contract and checksum checks passed).
- Release documentation consistency test file: 12/12 passed in the local environment.
- Release artifact gate: PASS.
- Current verification sidecars: 8 present and byte-matched to their target JSON files.
- Historical orphan sidecars: excluded from this buyer archive because their corresponding historical JSON snapshots are not shipped.
- Evidence-pack index and integrated package manifests: regenerated from the final extracted package tree; all entries are checked during packaging verification.
- ZIP CRC and round-trip integrity: checked after archive creation.

## Verification limits — read before relying on this reissue

GitLab refused new CI jobs with `ci_quota_exceeded`; no runner job started. Therefore this packaging reissue is **not CI-tested**. Local checks were run under Node.js 22.16.0, while the package declares Node.js `>=22.23.4 <23` and `.nvmrc` pins `22.23.4`. The local runtime was below the supported minimum, so local checks do not replace an exact-runtime CI run under Node 22.23.4.

The archived mobile dependency audit for this source contains 12 advisories: 10 moderate, 2 low, 0 high, and 0 critical. This is not vulnerability-free. Signed Android/iOS builds, physical-device QA, store publication, buyer-specific provider credentials, maps licensing, and buyer hosting setup remain outside this archive's proven scope.

A separate deterministic static threat-model script was inspected locally and returned `REVIEW` for `NO_PROD_SHELL_EXEC`. The flagged backend code starts one fixed PostgreSQL helper using `spawn(process.execPath, [workerPath], ...)`; it does not request `shell: true`. The legacy rule is broader than actual shell execution and flags the `child_process` usage itself. A narrower rule plus an explicit `shell: false` is committed on the audit branch (commit `2b4f55e79e8ea920758bcd9f7fa6a6468630a8425326fc9db8da4ee7f6f56477`), but that correction has not passed CI because GitLab rejected jobs for quota exhaustion and it is not included in this main-source reissue. This static-analysis result is therefore disclosed as `REVIEW`, not silently marked PASS.

`productionCertification` remains `false`. The separate production isolation attestation is bounded to the exact scope and evidence described in the commercial release statement; it does not certify every API route or every buyer environment. The detailed exact-commit tenant matrix JSON was not retained by the historical CI job and remains a disclosed evidence-retention task.

## Source and production boundary

No GitLab `main` commit, Vercel production deployment, or Neon production database was changed to create this local packaging reissue. The source commit and historical CI evidence above are retained for traceability.
