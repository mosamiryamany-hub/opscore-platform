# OpsCore — Client Trust Pack (Source package / Buyer diligence)

**Document date:** 2026-11-18  
**Product version:** 0.11.62  
**Isolated source-package line:** `v0.11.62.17-commercial-source-package`

## 1. Package identity and authority

This handoff document describes the isolated v0.11.62 source-package line. It does not itself attest that a release archive passed its build, integrity, or distribution gates.

The exact source commit, Secure Release run, archive byte length, archive SHA-256, SBOM/provenance references, and package-specific gate results are recorded in the **external `COMMERCIAL_RELEASE_STATEMENT.json` supplied with the exact archive**. That external statement is the authority for the build output. The archive does not embed its own final ZIP digest; doing so would create a self-referential hash.

Do not substitute any previously published archive, digest, or Actions run when checking this package.

> **License and distribution:** No license is granted by this pack, repository access, or ZIP possession. Sale, delivery, use, modification, resale, redistribution, and sublicensing remain unauthorized until the rights holder and buyer execute a signed License Schedule that identifies the exact archive SHA-256 and defines the granted rights.

## 2. What the buyer can verify without credentials

| Check | URL / reference |
|---|---|
| Source repository | https://github.com/mosamiryamany-hub/opscore-platform |
| Live service health (deployed service only) | https://opscore-platform.vercel.app/api/health |
| Live deployed release proof (deployed service only) | https://opscore-platform.vercel.app/api/verify/release |
| NO LICENSE GRANT notice | https://github.com/mosamiryamany-hub/opscore-platform/blob/main/NO_LICENSE_GRANT_NOTICE.txt |

For the source archive, verify the exact tag and source commit against the external release statement, then independently download the archive and calculate SHA-256 over the downloaded bytes. A READY deployment or a successful test of a different commit is not package identity evidence.

## 3. Deployed service is a separate identity

The last deployment identity recorded in the prior operational evidence is source commit `4017497068defa9c1d0761fcb07bc746925e002a`. That is a historical deployed-service pin, not the source commit of this isolated package line.

This source-package repair did not deploy a new Vercel version, change a Neon database, apply migrations, rotate secrets, or change firewall rules. Any live endpoint response must be checked independently at the time it is relied upon. Production certification for the new source-package commit is not claimed by this pack or by isolated CI tests.

## 4. Buyer/environment residuals

The following items are not silently included as seller-completed deliverables:

- Android/iOS store signing, store accounts, listings, and publication.
- Native-speaker translation review. The source records distinguish selectable machine-assisted/fallback locales from language qualification; no native-speaker approval or production-language qualification is claimed.
- Licensed map tiles, routing data, and provider contracts/keys.
- External identity, messaging/carrier/call-center, payment, webhook, storage, KMS/HSM, and cloud provider accounts, contracts, and credentials.
- Any customer-specific deployment, data migration, security acceptance, or operational certification not explicitly included in a signed agreement.

## 5. Diligence sequence

1. Obtain the archive and its companion external `COMMERCIAL_RELEASE_STATEMENT.json`.
2. Confirm that the statement identifies tag `v0.11.62.17-commercial-source-package`, the exact source commit, the corresponding successful Secure Release run, and the archive SHA-256.
3. Independently hash the downloaded archive and compare the result and byte length with the external statement.
4. Inspect the SBOM, provenance/attestation, integrity manifests, declared residuals, and the NO LICENSE GRANT notice.
5. Complete legal and commercial review. Execute a License Schedule naming that exact archive SHA-256 before any licensed use or delivery is authorized.

## 6. What this pack is not

- Not a license grant, sale contract, or transfer of cloud accounts, domains, billing, or third-party rights.
- Not a production deployment or certification of the new source-package commit.
- Not a claim that every route, device, provider integration, or buyer environment has been independently accepted.
- Not a warranty of zero defects or zero buyer configuration work.

Seller-side product completion and preparation of the source package do not require a prospective buyer, buyer signature, or buyer-specific transaction. Granting rights and authorizing delivery to a buyer remain separate, exact-digest transaction gates.
