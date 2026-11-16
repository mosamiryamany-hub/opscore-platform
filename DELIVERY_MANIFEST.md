# Technical Release Manifest — OpsCore

**Package version:** Read from `backend/package.json` and the exact-run release statement.  
**Source commit, workflow run, artifact ID, archive SHA-256, and attestation:** Must be taken only from one successful exact-head GitHub Actions Secure Release run. This source document intentionally contains no fixed candidate identifiers.

## Seller offer and rights boundary

- **Seller offer:** The rights holder may advertise, list, present and negotiate the source-code offer before a buyer is identified.
- **License grant:** **NO LICENSE GRANT** by default (`NONE_PENDING_RIGHTS_HOLDER_DECISION`).
- **Distribution authorization:** `false` for buyer delivery or transfer of licensed rights until a transaction-specific Schedule is executed.
- **Buyer use / modification / hosting / distribution / resale / sublicensing / delivery:** **NOT AUTHORIZED before execution of the named-buyer Schedule**.
- **Rights:** All rights reserved. This manifest is not a license and does not transfer ownership or intellectual-property rights.
- A License Schedule must be executed in writing by the rights holder and the named buyer, and must identify the exact deliverable (source commit and/or package SHA-256), applicable tier, permissions and conditions.

The authoritative notice is `NO_LICENSE_GRANT_NOTICE.txt`. Package metadata must remain `UNLICENSED`. No first-party `LICENSE` or `LICENCE` file may be included in the package while no grant exists.

## Technical classification and boundaries

The exact current run may report `PASS_WITH_BUYER_RESIDUALS` for the seller reference only. This classification is technical evidence, not a grant of rights, a warranty, or buyer-environment certification.

Production isolation evidence applies only to the exact seller deployment and evidence identity reported by the live verification endpoints. It does not certify a buyer environment. A branch-point recovery comparison is not a full PITR/RPO/RTO certification.

## Included source and disclosed buyer residuals

- Backend/API, web operations interface, migrations, security controls, tests, and deployment tooling.
- Mobile application source and lockfiles; no signed Android/iOS store binaries or app-store publication.
- Contact-center locale resources and machine-assisted translation drafts; native-speaker/domain review remains outstanding.
- External provider accounts, licenses, credentials, quotas, contracts, and live acceptance (including identity, messaging/telephony, storage, KMS/HSM, maps/road-routing, and cloud) remain environment-specific.

## Mandatory gates before licensed buyer delivery

1. The rights holder and named buyer agree the commercial model and exact rights.
2. Both parties execute the transaction-specific written License Schedule for the pinned deliverable.
3. Repository notices, package contents, metadata, manifests, and agreement are reconciled.
4. A new exact-head release is built; archive digest, SBOM, and provenance attestation are verified.
5. Buyer residuals and buyer-environment acceptance scope are explicitly acknowledged.

Seller-side marketing and negotiation may happen before these transaction gates. Until the buyer-specific gates pass, no buyer license or delivery is authorized.
