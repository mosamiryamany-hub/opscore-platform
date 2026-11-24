# OpsCore — Commercial Release Status

> This file is a source-tree status template, not a generated certificate or current release artifact. The Secure Release workflow must regenerate exact-run evidence for the final source commit. Do not use historical identifiers or digest values.

**Package version:** `0.11.62` (from `backend/package.json`)  
**Technical classification:** `SOURCE_CODE_CANDIDATE`  
**Self-hosted production qualification:** `BLOCKED`  
**Current exact-head release archive:** `NOT_ESTABLISHED`  
**Buyer licence:** `NONE_PENDING_EXECUTED_SCHEDULE`  
**Delivery authorization:** `false`  
**External certification:** `NONE_CLAIMED`

## Evidence cut

Main `6859b5d86f13ba9f481ed8fce5cc95c729d22b55`; CI run [45360794536](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45360794536). Source validation, contract checks, isolated PostgreSQL RLS/HTTP acceptance and CodeQL checks passed. Vercel Production deploy, Neon Preview acceptance and historical Production Neon PITR were skipped.

A current release requires a fresh exact-head Secure Release run that produces the package ZIP, external release statement, archive byte count/SHA-256, CycloneDX SBOM, provenance/signature and same-run test/dependency/localization evidence. Any subsequent source change invalidates that artifact identity.

## Self-hosted qualification

Current source release/deployment logic is coupled to Vercel identity and Neon migration targeting. A complete provider-neutral self-hosted production stack, signed tenant-context activation, database migration flow, restore/rollback and buyer-environment acceptance are not established. See [Self-Hosted Buyer Edition](docs/commercial/SELF_HOSTED_BUYER_EDITION_2026-11-24.md).

## Commercial boundary

The rights holder may advertise and negotiate the offer, but no buyer may install, run, modify, copy, host, distribute, resell or sublicense the software until a written License Schedule is executed by the rights holder and named buyer for the exact deliverable. Package metadata remains `UNLICENSED`. No first-party licence grant is created by this status template.

CI, a package hash, SBOM or provenance attestation is not an independent certification and does not grant buyer rights.

## Residuals

- Expo source only; native signed builds, physical-device QA and app-store publication are not included.
- Machine-assisted translations require native-speaker review; no linguistic certification is claimed.
- Licensed maps/road-routing and live external provider integrations are not included.
- Payment processing is disabled until provider setup, signed webhook verification and buyer-environment acceptance.
- No ISO 27001, SOC 2, PCI DSS or other accredited external certificate is claimed.
