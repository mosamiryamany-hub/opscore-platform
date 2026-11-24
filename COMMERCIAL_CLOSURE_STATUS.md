# OpsCore — Technical and Commercial Closure Status

**Reconciled:** 2026-11-24  
**Evidence-cut main:** `6859b5d86f13ba9f481ed8fce5cc95c729d22b55`  
**Controlling status:** `HOLD — SOURCE-CODE CANDIDATE ONLY`  
**Self-hosted production:** `BLOCKED — NOT QUALIFIED`  
**Buyer licence/delivery:** `NONE — EXECUTED SCHEDULE REQUIRED`  
**External certification:** `NONE CLAIMED`

This file replaces the stale 2026-11-22 deployment and Neon snapshot as the current status summary. Do not use historical deployment IDs, pipeline IDs, hashes, provider statuses or test counts from the earlier report as current evidence.

## Current evidence

Current-main GitHub Actions run [45360794536](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45360794536):
- PASS: source validation, contract checks, isolated PostgreSQL RLS/HTTP acceptance, CodeQL Actions, CodeQL JS/TS and CodeQL Python.
- SKIPPED: Vercel Production deployment, Neon Preview migration/HTTP acceptance and historical Production Neon PITR probe.
- NOT ESTABLISHED: exact-head Secure Release archive for this evidence cut.
- NOT RUN: buyer-controlled self-hosted production acceptance.

## Technical disposition

The intended source-code offer is for buyer-controlled infrastructure, with seller-hosted Vercel/Neon services excluded. However, provider-neutral self-hosted production is not yet supported by current code:
1. Signed tenant-context activation is coupled to Vercel Preview/Production environment and release-readiness conditions.
2. Release identity/proof is Vercel deployment- and Neon-evidence-specific.
3. PostgreSQL migration targeting validates Neon endpoint/project/branch identity and expects a Neon owner role.
4. The current PostgreSQL Compose file is not a complete application production stack with durable storage, ingress, secrets, monitoring and recovery.

The detailed source-level findings and required corrective plan are in [Self-Hosted Buyer Edition](docs/commercial/SELF_HOSTED_BUYER_EDITION_2026-11-24.md).

## Security, product and buyer residuals

- The backend Docker build context did not previously have a `.dockerignore`; the candidate change adds one to exclude environment files, local databases, uploads/data and build residue. This source change still requires CI image-build verification.
- Expo mobile source only; no signed native binaries, physical-device acceptance or store publication.
- Machine-assisted translations remain disclosed; native-speaker review is not established.
- Licensed maps/road-routing and external provider accounts/credentials/live acceptance are not included.
- Payment processing is disabled until a provider is configured and its signed webhook/payment flows are tested.
- No accredited ISO 27001, SOC 2, PCI DSS or other external certification is evidenced.

## Legal disposition

Package metadata remains `UNLICENSED`; `NO_LICENSE_GRANT_NOTICE.txt` controls. No buyer use, installation, modification, hosting, resale, redistribution or sublicense is authorized before the rights holder and named buyer execute a Schedule pinning the exact deliverable. L1 internal-use rights do not grant resale. Third-party SBOM inventory is not legal clearance.

**Final status: OPEN / HOLD.** A marketing conversation may describe the source candidate within these limits. Do not deliver or describe it as a qualified self-hosted production system until technical blockers, exact-artifact evidence, buyer acceptance and legal authority are resolved.
