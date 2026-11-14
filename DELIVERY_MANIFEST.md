# Technical Release Manifest — OpsCore

**Package version:** Read from `backend/package.json` and the exact-run release statement.  
**Source commit, workflow run, artifact ID, archive SHA-256, and attestation:** Must be taken only from one successful exact-head GitHub Actions Secure Release run. This source document intentionally contains no fixed candidate identifiers.

## Rights and distribution

- **License grant:** `NONE_PENDING_RIGHTS_HOLDER_DECISION`.
- **Distribution authorization:** `false`.
- **Sale, resale, redistribution, sublicensing, hosting for third parties, transfer, and buyer delivery:** **NOT AUTHORIZED**.
- **Rights:** All rights reserved. This manifest is not a license and does not transfer ownership or intellectual-property rights.
- A future grant requires a separate written agreement approved and signed by the rights holder.

The authoritative notice is `NO_LICENSE_GRANT_NOTICE.txt`. Package metadata must remain `UNLICENSED`. No first-party `LICENSE` or `LICENCE` file may be included in the package while this hold is active.

## Technical classification and boundaries

The exact current run may report `PASS_WITH_BUYER_RESIDUALS` for the seller reference only. This classification is technical evidence, not a grant of rights, a warranty, or buyer-environment certification.

Production isolation evidence applies only to the exact seller deployment and evidence identity reported by the live verification endpoints. It does not certify a buyer environment. A branch-point recovery comparison is not a full PITR/RPO/RTO certification.

## Included source and disclosed buyer residuals

- Backend/API, web operations interface, migrations, security controls, tests, and deployment tooling.
- Mobile application source and lockfiles; no signed Android/iOS store binaries or app-store publication.
- Contact-center locale resources and machine-assisted translation drafts; native-speaker/domain review remains outstanding.
- External provider accounts, licenses, credentials, quotas, contracts, and live acceptance (including identity, messaging/telephony, storage, KMS/HSM, maps/road-routing, and cloud) remain environment-specific.

## Mandatory gates before any future sale or delivery

1. The rights holder decides the commercial model and exact rights to grant.
2. A separate written agreement is approved and signed.
3. Repository notices, package contents, metadata, manifests, and agreement are reconciled.
4. A new exact-head release is built; archive digest, SBOM, and provenance attestation are verified.
5. Buyer residuals and buyer-environment acceptance scope are explicitly acknowledged.

Until every applicable gate passes, this manifest is technical evidence only and is not authorization to sell, distribute, or deliver the source package.
