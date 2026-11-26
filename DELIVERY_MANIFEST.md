# Technical Release Manifest — OpsCore

**Package version:** Read from `backend/package.json` and the exact-run release statement.  
**Source commit, workflow run, artifact ID, archive SHA-256, and attestation:** Must be taken only from one successful exact-head GitHub Actions Secure Release run. This source document intentionally contains no fixed candidate identifiers.

## Seller offer and rights boundary

- **Seller offer:** The rights holder may advertise, list, present and negotiate the source-code offer before a buyer is identified.
- **License grant:** **NO LICENSE GRANT** by default (`NONE_PENDING_RIGHTS_HOLDER_DECISION`).
- **Distribution authorization:** `false` by default in this source manifest. This does not block marketing, demonstrations, buyer discovery or negotiation. If a sale proceeds, the accepted buyer-specific offer/order/contract records the exact deliverable and permitted rights; a separate Schedule is optional.
- **Buyer use / modification / hosting / distribution / resale / sublicensing / delivery:** Not granted by this manifest. Any buyer permissions, if a sale proceeds, are stated in the accepted buyer-specific transaction terms.
- **Rights:** All rights reserved. This manifest is not a license and does not transfer ownership or intellectual-property rights.
- The accepted buyer-specific offer, order, contract or equivalent transaction record identifies the exact deliverable (source commit and/or package SHA-256), applicable tier, permissions and conditions. A separate License Schedule is optional, not a customer-acquisition prerequisite.

The authoritative notice is `NO_LICENSE_GRANT_NOTICE.txt`. Package metadata must remain `UNLICENSED`. No first-party `LICENSE` or `LICENCE` file may be included in the package while no grant exists.

## Technical classification and boundaries

The exact current run may report `PASS_WITH_BUYER_RESIDUALS` for the seller reference only. This classification is technical evidence, not a grant of rights, a warranty, or buyer-environment certification.

Production isolation evidence applies only to the exact seller deployment and evidence identity reported by the live verification endpoints. It does not certify a buyer environment. A branch-point recovery comparison is not a full PITR/RPO/RTO certification.

## Included source and disclosed buyer residuals

- Backend/API, web operations interface, migrations, security controls, tests, and deployment tooling.
- Mobile application source and lockfiles; no signed Android/iOS store binaries or app-store publication.
- Contact-center locale resources and machine-assisted translation drafts; native-speaker/domain review remains outstanding.
- External provider accounts, licenses, credentials, quotas, contracts, and live acceptance (including identity, messaging/telephony, storage, KMS/HSM, maps/road-routing, and cloud) remain environment-specific.

## Technical and transaction checks before buyer delivery

1. The accepted buyer-specific offer/order/contract records the commercial model, exact deliverable and permitted rights.
2. Repository notices, package contents and metadata remain consistent with the no-default-grant position; a separate Schedule is optional.
3. A new exact-head release is built; archive digest, SBOM, and provenance attestation are verified.
4. Buyer residuals and buyer-environment acceptance scope are explicitly acknowledged.

Marketing, demonstrations and negotiation are open before a buyer is identified; no pre-sale signature is required. Delivery remains conditional on an exact-head release and the accepted buyer-specific transaction terms.
