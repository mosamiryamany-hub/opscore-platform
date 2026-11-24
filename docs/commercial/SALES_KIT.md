# OpsCore — Seller Sales Kit

**Offer type:** proposed source-code handoff for buyer-controlled infrastructure.  
**Offer status:** pricing and buyer discovery may be prepared; any public listing must state that delivery is conditional.
**Delivery status:** HOLD — no buyer licence, no distribution authorization in the current release statement, and provider-neutral self-hosted production is not yet qualified. No checkout or source download is authorized.

## Product description

OpsCore is a multi-sector operational software source candidate with a web console, HTTP API, PostgreSQL schema/migration assets, operational workflows and Expo mobile source. Its proposed deployment model is buyer-controlled infrastructure rather than a seller-hosted SaaS subscription.

The current source has automated CI and isolated PostgreSQL/RLS test evidence on the identified revision. That evidence does not establish a supported self-hosted production install, buyer production acceptance or an independent certification.

## What the source candidate contains

- Customer/site/asset and work-order workflows.
- Scheduling, dispatch, field execution, evidence, audit and completion paths.
- Multi-tenant API and authorization controls, PostgreSQL schema/migration assets and test tooling.
- Contact Center resources and machine-assisted translation material.
- Expo mobile source and release/dependency tooling.

## Material limitations — disclose before a buyer decision

- Provider-neutral self-hosted production qualification is **BLOCKED**. The existing release-verification endpoint now has a distinct Ed25519 self-hosted operator-attestation mode, but signed tenant context remains Vercel-gated, PostgreSQL migration targeting remains Neon-specific, and the signed measurements are not independently collected by the verifier.
- The exact-head Secure Release archive for the 2026-11-24 evidence cut is not established. Historical packages, hashes, deployment IDs and pipeline reports are not current delivery evidence.
- Expo source only; no signed APK/AAB/IPA, native signing, physical-device QA or store publication.
- Translation catalog includes machine-assisted drafts and fallback locales. Native-speaker review and production language qualification are not established; do not claim native-quality translations.
- Licensed maps, road routing, attribution, quotas and traffic ETA are not included.
- External identity, email/SMS/WhatsApp, telephony, payments, webhook, object-storage, KMS/HSM and cloud provider accounts/credentials/live acceptance are buyer-specific.
- Payment processing is disabled until a provider is selected, credentials are configured, signed webhooks are verified and buyer-environment payment flows pass.
- No ISO 27001, SOC 2, PCI DSS or other independent certificate is claimed.

## Commercial / IP terms

The package metadata is `UNLICENSED`. The root `NO_LICENSE_GRANT_NOTICE.txt` remains controlling.

### Owner-authorized list prices (2026-11-24; L3 currency pending confirmation)

| Tier | Scope headline | List price |
|---|---|---:|
| L1 | Use only | $3,000 |
| L2 | Use + modify + redistribute in Schedule-approved forms | $6,000 |
| L3 | Exclusive license **or** assignment of specifically identified rights | 15,000 (USD assumed*) |

These are seller-selected list prices, not an independent valuation, a named-buyer quote or a license grant. L3 does not automatically combine an exclusive license with an assignment of ownership. The seller supplied L3 as 15,000 without a currency; USD is an assumption based on L1/L2 and must be explicitly confirmed before quoting or signing. All exact rights, assets, price, taxes, payment, term and dispute terms must appear in the signed Schedule. The online checkout is not configured; do not charge a buyer while legal identity/location, tax handling, processor, consumer disclosures and an authorized exact-hash deliverable remain unresolved.

The seller identifies as an individual and states that he is the person behind the creation of OpsCore, not a product founded by another person. This statement is seller-provided and has not been independently verified as chain-of-title for every contribution or dependency. It does not replace review of contributor history, prior assignments, the SBOM, third-party/open-source licenses, or rights that cannot be transferred under applicable law. The seller-approved support default is 30 calendar days from secure delivery, by email, with an initial acknowledgement target of two business days; scope is documented installation, reproducible defects in the delivered version, and corrective/security fixes made available during the period. This default is not a signed Schedule, legal SLA, or guarantee of repair within two business days.

The seller may advertise and negotiate a prospective offer; advertisement is not a licence grant. A buyer may not install, run, copy, modify, host, distribute or commercially exploit the source before a written License Schedule is executed by the rights holder and named buyer for the exact commit/package digest.

L1 internal use does not grant resale. Third-party hosting, OEM, source redistribution, resale, sublicensing or marketplace distribution require explicit rights in the executed Schedule. The seller's authority to grant the rights must be confirmed for the transaction. The third-party SBOM inventory is not legal clearance.

## Buyer message (safe wording)

> “OpsCore is a multi-sector operational source-code candidate designed for a buyer-controlled deployment model. Automated source and isolated PostgreSQL checks have passed on the stated revision. Provider-neutral self-hosted production qualification, buyer-environment acceptance and external certification are not yet established. Delivery and use are subject to a transaction-specific written licence.”

See [Self-Hosted Buyer Edition](SELF_HOSTED_BUYER_EDITION_2026-11-24.md), [Buyer Evidence Index](BUYER_EVIDENCE_INDEX.md), [Buyer Installation Guide](BUYER_INSTALLATION_GUIDE.md), and [License Schedule Template](LICENSE_SCHEDULE_TEMPLATE.md).
