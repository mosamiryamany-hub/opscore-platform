# OpsCore — Truth Boundaries

**Evidence cut:** 2026-11-24  
**Main SHA:** `6859b5d86f13ba9f481ed8fce5cc95c729d22b55`  
**Classification:** SOURCE-CODE CANDIDATE / SELF-HOSTED PRODUCTION BLOCKED / NO LICENSE GRANT / NO EXTERNAL CERTIFICATION.

## Verified on the named CI revision

GitHub Actions run [45360794536](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45360794536) reports PASS for source validation, contract checks, isolated PostgreSQL RLS/HTTP acceptance and CodeQL Actions, JS/TS and Python analysis.

These results prove only the tests and targets run by that workflow. They do not certify a buyer production database, customer network, all business workflows, restore objectives or third-party integrations.

## Not passed / not established

- Vercel production deployment: SKIPPED in the current-main workflow.
- Neon Preview migration and HTTP acceptance: SKIPPED.
- Historical Production Neon PITR probe: SKIPPED.
- Exact-head Secure Release archive: NOT ESTABLISHED.
- Release proof: a distinct Ed25519 self-hosted operator-attestation mode is implemented on the existing endpoint; it verifies signed claims only and does not independently measure archive/TLS/database facts.
- Self-hosted tenant-context activation and provider-neutral PostgreSQL migrations: BLOCKED by Vercel/Neon-specific coupling in current code.
- Buyer-controlled self-hosted installation and acceptance: NOT RUN.
- External ISO 27001, SOC 2, PCI DSS or other accreditation: NONE CLAIMED.
- Buyer licence and distribution authorization: NONE until an exact-deliverable License Schedule is executed.

## Product residuals

- Expo source only; native signed binaries and physical-device/store acceptance are not included.
- Contact Center translations are machine-assisted; native-speaker review remains 0/114 and current selectable runtime qualification 0/105.
- Licensed maps/road-routing and external providers are not included unless separately licensed, configured and live-tested.
- Payment processing is disabled until provider onboarding, signed webhook verification and live acceptance.

## Status vocabulary

- PASS — the named test ran and passed on its named target.
- FAIL — the named test ran and failed.
- SKIPPED — the test did not run; never count it as PASS.
- NOT RUN — no execution evidence exists.
- NOT VERIFIED — evidence is absent, stale, mismatched or insufficient.
- BLOCKED — a known technical/authority prerequisite prevents qualification.
- NOT CERTIFIED — no independent or scoped certification has been established.

For the controlling technical and commercial record, see [Self-Hosted Buyer Edition](../commercial/SELF_HOSTED_BUYER_EDITION_2026-11-24.md).
