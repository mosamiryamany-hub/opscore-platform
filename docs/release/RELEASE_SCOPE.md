# OpsCore v0.11.62 — Release Scope and Verification Boundary

## Release identity and validity

The exact release identity is generated for each successful exact-head GitHub Actions Secure Release run. Use the same run's source commit, workflow run ID, artifact ID, archive filename, byte count, SHA-256, SBOM, and provenance attestation as one indivisible evidence set. This source document intentionally carries no fixed commit, pipeline, deployment, or digest values. Any source change invalidates the previous candidate identity.

## Seller offer and commercial rights

The rights holder may advertise, list, present and negotiate the source-code offer before a buyer is identified. This seller-side offer activity does not grant rights to a buyer.

**NO LICENSE GRANT — ALL RIGHTS RESERVED.** No buyer may install, run, modify, copy, host, distribute, resell, sublicense or receive the licensed deliverable until the rights holder and the named buyer execute a transaction-specific written License Schedule that pins the exact source commit/package SHA-256 and records the granted tier, rights and conditions. Package metadata remains `UNLICENSED`; the authoritative notice is `NO_LICENSE_GRANT_NOTICE.txt`. No first-party `LICENSE` or `LICENCE` file may be packaged while no grant exists. Technical evidence does not create or imply rights.

## Included source and seller-owned scope

- Node.js backend/API, web operations console, internal workflows, source contracts, and integration adapters.
- Authentication/session/tenant authorization, database migrations, RLS policies, automated tests, and operational/release tooling.
- Contact-center module, locale resources, selector/loader/RTL rendering, and machine-translation disclosure.
- Expo mobile application source, lockfiles, source verification, and web-export verification.
- Installation, recovery, security, and operational documentation.

## Explicit buyer residuals and exclusions

- Signed Android/iOS store binaries, buyer-specific EAS accounts/projects, signing credentials, native builds, physical-device QA, developer accounts, app-store submission, and publication are not included.
- Native-speaker/domain review of machine-assisted translations is outstanding; no linguistic qualification is claimed.
- Licensed maps/road-routing and required attribution, API keys, quota, and provider contracts are not included.
- External provider accounts, licenses, credentials, setup, billing, quotas, and live acceptance for identity/OIDC/JWKS, email/SMS/WhatsApp/PSTN/SIP, external call-center/telephony, payments, webhooks, object storage, KMS/HSM, and cloud remain environment-specific.

## Verification boundary

The Vercel Production deployment is READY, but the current stored session-isolation and recovery evidence is NOT_VERIFIED: both records carry a rebind marker with probesReexecuted=false, and the recovery record references a previous Neon branch. Do not claim seller-reference production isolation certification until new dual-tenant and recovery probes are bound to the exact active application commit and Neon Production branch and independently reviewed. Buyer environments remain NOT CERTIFIED; deployment readiness and database catalog checks do not certify all business flows.

The production recovery evidence currently described as a branch-point pass is not a full PITR/RPO/RTO certification. Tenant route-security coverage and functional API route acceptance have narrower CI/contract scopes and must not be upgraded to full business-flow certification.

Signed tenant-context cutover remains incomplete: the Preview-only session-autobind candidate has passed isolated CI but is not yet deployed or enabled in Vercel Preview; Production migrations remain on the legacy context path, and authentication, system/background, Knowledge-pool and remaining route-purpose paths still require live proof. Do not claim complete trust-boundary coverage.

## Release gate

An archive can be considered a verified technical candidate only when the exact-head workflow succeeds, the no-license package gate passes, the package round-trip and manifests verify, and the archive digest matches the same-run external release statement. A successful technical candidate may be marketed by the rights holder, but buyer use or delivery remains unauthorized until a transaction-specific License Schedule is executed.
