# OpsCore Buyer Delivery Record — Current Status

**Delivery decision:** NOT ISSUED for current Main.  
**Repository:** https://github.com/mosamiryamany-hub/opscore-platform  
**Source commit at audit:** `48ed78a825020986c53bd045e50c8ea852f53275`  
**Product version:** 0.11.62

No current-head `OPSCORE.zip` has been approved for delivery. The tracked release statement in `docs/release/COMMERCIAL_RELEASE_STATEMENT.json` is historical and must not be used as the identity of this source commit.

## Exact delivery identity

The authoritative delivery package must come from the same successful GitHub Actions `OpsCore secure release` workflow run on the exact source commit being delivered. Obtain from that run:
- `OPSCORE.zip`
- `COMMERCIAL_RELEASE_STATEMENT.json`
- `SHA256SUMS.txt`
- JUnit and complete backend/mobile dependency-audit reports
- CycloneDX SBOM and GitHub artifact provenance attestation
- localization forensic report and buyer installation verification

Never combine artifacts, hashes, test counts, or pipeline IDs from different runs.

## Production boundary

Production isolation certification is NOT_CERTIFIED. The seller reference API currently returns HTTP 500 because the production safety hold is active. This is not a buyer-ready hosted service and must not be represented as one.

## Buyer responsibilities after a valid source handover

- Configure buyer-controlled Neon/PostgreSQL and Vercel projects.
- Use `OPSC_DATABASE_URL` only for the least-privilege `opscore_runtime` role.
- Use `OPSC_MIGRATION_DATABASE_URL` only for explicitly approved schema migrations.
- Use `OPSC_BOOTSTRAP_DATABASE_URL` only for one-time CLI bootstrap with the dedicated database-owner connection; never add it to Vercel runtime variables and remove/rotate it after bootstrap.
- Complete live identity, messaging, carrier/call-center, payment, webhook, storage, KMS/HSM, map, TLS/WAF, backup/restore, and monitoring acceptance.
- Complete Android/iOS signing, native builds, physical-device QA, and store submission.
- Arrange native-speaker/domain review before making official language-quality claims.

## Commercial rights

The bundled license is use-only and does not grant resale, redistribution, sublicensing, or multi-customer delivery rights. Any broader commercial grant must be signed separately by the rights holder.
