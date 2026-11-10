# Delivery Manifest — OpsCore v0.11.62

- Candidate branch: `commercial/buyer-installation-hardening-2026-11-01`.
- Target archive filename: `OPSCORE.zip`.
- Delivery type: commercial source-code package (backend/API, web source, PostgreSQL migrations/RLS assets and Expo mobile source).
- Commercial class: `PASS_WITH_BUYER_RESIDUALS` only when the exact archive-producing Pipeline is successful and its same-run release statement reports that class.
- Exact source commit, Pipeline ID, archive byte length and SHA-256 must be read from the `docs/release/COMMERCIAL_RELEASE_STATEMENT.json` inside the archive and the matching external `dist/COMMERCIAL_RELEASE_STATEMENT.json` / `dist/SHA256SUMS.txt` from that same Pipeline.
- Never reuse test counts, database evidence, audit reports, Preview URLs or digests from a different commit or Pipeline.
- `productionCertification`: `false`; `productionIsolationCertification`: `NOT_CERTIFIED`.
- Signed Android/iOS store binaries are not included. The archive contains mobile source and lockfiles.
- Translation native-speaker review is 0/114 in the latest recorded forensic audit; the AI/machine-translation notice must remain visible.
- Mobile dependency findings must be disclosed from the exact Pipeline's full audit JSON. Do not claim vulnerability-free status.
- Seller-owned scope: all fixable source, migrations, security, packaging, test and pre-handover dependency defects.
- Buyer-owned scope: external provider accounts/licenses/credentials and live acceptance, licensed maps, native mobile builds/signing/store publication, and native-speaker linguistic review.

## Mandatory handover checks

1. The archive-producing exact-head Pipeline is successful.
2. The matching PostgreSQL HTTP acceptance report is `PASS` and its commit plus Pipeline ID exactly match the archive release statement.
3. The clean extracted-archive installation smoke test passes for backend and mobile lockfiles.
4. A matching Vercel Preview is `READY` and points to the same source commit; its manual deploy job must inject the protected `OPSC_PG_ACCEPTANCE_URL` as the runtime `OPSC_DATABASE_URL` / `DATABASE_URL` using role `opscore_app`, direct host and SSL. Verify health, deployment identity, release proof, database and database-security endpoints. A manual/skipped Preview job is not a Preview pass.
5. The Preview database is isolated from production. Query runtime grants and RLS as `opscore_app`, not as the database owner.
6. The archive's SBOM, integrated manifest, SHA-256 sums and external release statement match the same build.

Production Vercel, Production Neon and `main` remain outside this workflow unless separately authorized. A successful isolated acceptance Pipeline is not formal production certification.
