# Delivery Manifest — OpsCore v0.11.62

- Verified candidate branch: `main`.
- Verified source commit: `f3f33865618f0c9da304fe47ab2538b310d7d453`.
- Secure Release run: [42949619029](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/42949619029).
- Outer GitHub artifact: `opscore-release-42949619029`.
- Nested archive: `OpsCore-release.zip`.
- Archive bytes: `1,881,299`.
- Archive SHA-256: `20aace624d0afe6dbdc0b07e8a8d3ee3a8604b7116a9eaca6cf0c8108d02adeb`.
- Delivery type: commercial source-code package (backend/API, web source, PostgreSQL migrations/RLS assets and Expo mobile source).
- Commercial class: `PASS_WITH_BUYER_RESIDUALS` for this exact candidate only.
- `productionCertification`: `false`; `productionAcceptance`: `NOT_VERIFIED_AT_BUILD`; `productionIsolationCertification`: `NOT_CERTIFIED`.
- Signed Android/iOS store binaries are not included. The archive contains mobile source and lockfiles.
- Mobile locked-tree npm audit in run #6: zero findings at all severities. This is a point-in-time result; run a fresh audit for each new release.
- Translation native-speaker review is 0/114; machine-assisted translation must remain disclosed and is not production-qualified.
- Seller-owned scope: fixable source, migration, security, packaging, test and pre-handover dependency defects.
- Buyer-owned scope: external provider accounts/licenses/credentials and live acceptance, licensed maps, native mobile builds/signing/store publication, native-speaker linguistic review and target-environment acceptance.

## Mandatory handover checks

1. Use only the exact-head GitHub Secure Release artifact and verify the nested ZIP SHA-256 against its external release statement.
2. Verify the same-run SBOM, artifact Attestation, regression report, forensic i18n evidence and dependency audit JSONs.
3. Run clean extracted-archive installation and buyer preflight using the archive's lockfiles.
4. Production Vercel deployment for the verified source commit: `dpl_JD2jLc2ifxtMezaoAovgFALmapjH`, state READY. `/api/health` returned 200. Protected readiness/release/database endpoints require authorized acceptance credentials; a bare 401 is not a successful acceptance result.
5. Buyer must test RLS using an isolated acceptance database under the intended least-privilege runtime role. Do not test or bootstrap production using `opscore_app`.
6. Verify backup/restore, recovery, TLS/WAF, observability, external integrations and native mobile binaries in the actual target environment.
7. Record acceptance against the exact archive SHA, source commit, run ID, tests and formally accepted residuals.

Production Vercel, Production Neon and `main` remain outside buyer bootstrap/migration steps unless separately authorized. A successful isolated acceptance run is not formal production certification.

Historical GitLab and Vercel Preview instructions are retained under `docs/archive/` for traceability only; they are not the active release/deployment process.
