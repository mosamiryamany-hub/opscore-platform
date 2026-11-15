# OpsCore v0.11.62 — Release Scope and Verification Boundary

## Release identity and validity

The exact release identity is generated for each successful exact-head GitHub Actions Secure Release run. Use the same run's source commit, workflow run ID, artifact ID, archive filename, byte count, SHA-256, SBOM, and provenance attestation as one indivisible evidence set. This source document intentionally carries no fixed commit, pipeline, deployment, or digest values. Any source change invalidates the previous candidate identity.

## Commercial rights hold

**NO LICENSE GRANT — ALL RIGHTS RESERVED.** Distribution, sale, resale, redistribution, sublicensing, buyer delivery, and other commercial exploitation are not authorized. Package metadata remains `UNLICENSED`; the authoritative notice is `NO_LICENSE_GRANT_NOTICE.txt`. No first-party `LICENSE` or `LICENCE` file may be packaged while this hold is active. Technical evidence does not create or imply rights.

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
- Buyer-environment installation, migrations, database isolation, recovery, WAF/TLS, observability, and operational acceptance must be independently completed.

## Verification boundary

The Vercel Production deployment is READY, but the current stored session-isolation and recovery evidence is NOT_VERIFIED: both records carry a rebind marker with probesReexecuted=false, and the recovery record references a previous Neon branch. Do not claim seller-reference production isolation certification until new dual-tenant and recovery probes are bound to the exact active application commit and Neon Production branch and independently reviewed. Buyer environments remain NOT CERTIFIED; deployment readiness and database catalog checks do not certify all business flows.

The production recovery evidence currently described as a branch-point pass is not a full PITR/RPO/RTO certification. Tenant route-security coverage and functional API route acceptance have narrower CI/contract scopes and must not be upgraded to full business-flow certification.

PR #103 remains a separate, unmerged signed tenant-context engineering track. Its remaining unsigned compatibility paths, authentication/purpose-specific contracts, independent asynchronous Knowledge pool, and full live runtime integration must be resolved before claiming complete trust-boundary coverage.

## Release gate

An archive can be considered a verified technical candidate only when the exact-head workflow succeeds, the no-license package gate passes, the package round-trip and manifests verify, and the archive digest matches the same-run external release statement. While the commercial rights hold remains active, such an archive is for internal technical verification only and is **NOT LICENSED FOR DISTRIBUTION**.
