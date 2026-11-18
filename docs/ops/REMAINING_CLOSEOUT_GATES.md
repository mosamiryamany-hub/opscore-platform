# OpsCore source-package acceptance gates — 2026-11-18

## Scope and source-line identity

This document defines the acceptance conditions for the isolated seller source-package line:

- Product version: `0.11.62`
- Intended tag: `v0.11.62.17-commercial-source-package`
- Lineage anchor: `deba977db586f19128a1f53377fec183beab44d0`
- Release branch: `docs/commercial-source-package-closed-deba977d`

The line is separate from later product changes on `main`. Do not merge current `main` into this source line to make the package build.

## Seller-owned source-package gates

A release is acceptable only when all of the following are proven for the exact tag and source commit:

| Gate | Required evidence |
|---|---|
| Source identity | The tag resolves to the exact source commit recorded in the external release statement. |
| Isolated release lineage | The secure-release workflow accepts the exact authorized tag and its restricted file allowlist; unrelated product changes are rejected. |
| Regression and security checks | The complete tagged Secure Release workflow succeeds; PR checks alone are insufficient. |
| Evidence sanitization | Connection metadata is redacted before checksum/provenance generation; adjacent digest sidecars are refreshed. |
| Backend provenance | Provenance is regenerated after sanitization and then verified against the staged release tree. |
| Release artifact gate | The gate passes after evidence redaction and provenance refresh. |
| Manifest integrity | Evidence, integrated manifest, and SHA-256 entries match the exact staged bytes. |
| Archive round-trip | The completed ZIP passes archive integrity and extracted-tree verification. |
| Upload integrity | The uploaded artifact is independently downloaded and its SHA-256 and byte length match the external statement. |

The **external `COMMERCIAL_RELEASE_STATEMENT.json` supplied with the exact archive** is the authority for the tagged run, source commit, package SHA-256, byte length, and recorded build outcome. This in-tree checklist does not claim those dynamic results. Do not use the former `.16` archive or its digest as evidence for `.17`.

## Buyer-owned residuals (not seller source-build gates)

| Item | Owner |
|---|---|
| App Store / Play signing, accounts, listings, and publication | Buyer |
| Native-speaker translation QA | Buyer |
| Licensed map provider contracts, tiles, routing data, and keys | Buyer |
| Customer-specific third-party credentials and service accounts | Buyer unless separately contracted |

Runtime locale availability must not be represented as native-speaker review or production-language qualification.

## Separate hosted-Production track

The following operations are separate from a source-code-only package and are not authorized by this release record:

| Operation | Independent prerequisite |
|---|---|
| Apply migrations 063–067 / 069 on Production primary | Explicit authorization, verified target identity, recovery gate, maintenance window, and exact application/deployment match |
| Enable Production HMAC and signed routes | Verified schema, key lifecycle, deployed application, and signed-context evidence |
| 67-route Production HTTP matrix | Live Production acceptance against the exact deployment and primary database |
| Neon retention, protected primary, and automated snapshots | Appropriate Neon plan and verified recovery configuration |
| Vercel commercial hosting and custom domain | Appropriate Vercel entitlement, domain/DNS, and access-policy validation |
| WAF challenge/deny changes | Representative log review, false-positive analysis, and explicit operations approval |
| Stripe live keys, webhooks, and legal routes | Account owner, counsel, and environment-specific acceptance |

No production database mutation, migration, secret rotation, WAF change, or Vercel deployment is included in the source-package integrity repair.

## Commercial rights boundary

Seller product completion and source-package preparation do not require a named prospective buyer, buyer signature, payment, or transaction schedule. Buyer use and delivery rights remain ungranted until a signed License Schedule identifies the exact archive SHA-256 and the permitted rights.

## Evidence authority

- The companion external release statement and independently verified ZIP digest identify the **source artifact**.
- Live `/api/verify/release` evidence identifies only the **deployed service** at the time it is checked.
- Never merge source-package evidence and deployed-service evidence into one certification claim.
