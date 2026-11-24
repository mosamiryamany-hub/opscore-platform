# OpsCore — Commercial Release Status

> This file is a source-tree status template, not a generated certificate or current release artifact. The Secure Release workflow must regenerate exact-run evidence for the final source commit. Do not use historical identifiers or digest values.

**Package version:** `0.11.62` (from `backend/package.json`)  
**Technical classification:** `SOURCE_CODE_CANDIDATE`  
**Self-hosted production qualification:** `BLOCKED`  
**Current exact-head release archive:** `NOT_ESTABLISHED`  
**Buyer licence:** `NONE_PENDING_EXECUTED_SCHEDULE`  
**Delivery authorization:** `false`  
**External certification:** `NONE_CLAIMED`  
**Legal status:** **NO LICENSE GRANT — ALL RIGHTS RESERVED.** Buyer rights require a signed exact-deliverable License Schedule.

## Evidence cut

Main `f71b8eee32631c833dda8115af8508ae1ccc1a63`. OpsCore CI [45377527984](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45374083091) passed 1,021 passed / 0 failed / 3 skipped; Vercel/PG acceptance [45377522840](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45374083161) passed source verification, contract checks, isolated RLS/HTTP and disposable PostgreSQL 18 acceptance; CodeQL [45377523517](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45374082761) passed Actions, JS/TS and Python. Production deploy, Neon Preview acceptance and historical PITR were skipped.

A current release requires a fresh exact-head Secure Release run that produces the package ZIP, external release statement, archive byte count/SHA-256, CycloneDX SBOM, provenance/signature and same-run test/dependency/localization evidence. Any subsequent source change invalidates that artifact identity.

## Seller-hosted Vercel availability — measured 2026-11-24

- Vercel project `opscore-platform`: `live=false`.
- No Production deployment exists for current main `d243a428bb44b4cbd0d1fd768cb907d0e9fcbdb1` (exact-SHA deployment query returned zero records).
- Public `GET /api/health` and `GET /api/verify/release` both returned HTTP `402 Payment Required` with `x-vercel-error: DEPLOYMENT_DISABLED` at approximately 10:22 UTC on 2026-11-24.
- A verified project-domain association does not prove that the domain is currently aliased to a live deployment.
- Team context reports plan `Pro`; the available charges endpoint reports usage attribution only, not invoice, outstanding balance or payment-good-standing status. The specific account suspension/billing cause is therefore NOT VERIFIED.

This seller-hosted service outage is separate from CI and from the proposed buyer-owned deployment model. Do not advertise the seller-hosted demo/API as live until Vercel re-enables the project and the current main commit is deployed and measured.

## Self-hosted qualification

The existing `/api/verify/release` endpoint supports an explicit Ed25519 self-hosted operator-attestation mode. The verifier checks the signature and signed claims but does not independently collect archive, TLS or database measurements. Signed tenant-context activation remains coupled to Vercel identity, and PostgreSQL migration targeting remains Neon-specific. A complete provider-neutral self-hosted production stack, restore/rollback and buyer-environment acceptance are not established. See [Self-Hosted Buyer Edition](docs/commercial/SELF_HOSTED_BUYER_EDITION_2026-11-24.md).

## Commercial boundary

The rights holder may advertise and negotiate the offer, but no buyer may install, run, modify, copy, host, distribute, resell or sublicense the software until a written License Schedule is executed by the rights holder and named buyer for the exact deliverable. Package metadata remains `UNLICENSED`. No first-party licence grant is created by this status template.

CI, a package hash, SBOM or provenance attestation is not an independent certification and does not grant buyer rights.

## Residuals

- Expo mobile source only; no signed Android/iOS APK/AAB/IPA, native signing/build, physical-device QA or app-store publication is included.
- Machine-assisted translations require native-speaker review; no linguistic certification is claimed.
- Licensed maps/road-routing and live external provider integrations are not included.
- Payment processing is disabled until provider setup, signed webhook verification and buyer-environment acceptance.
- No ISO 27001, SOC 2, PCI DSS or other accredited external certificate is claimed.
