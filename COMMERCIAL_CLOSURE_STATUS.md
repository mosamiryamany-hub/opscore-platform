# OpsCore — Technical and Commercial Closure Status

**Technical classification:** `HOLD_FOR_PRODUCTION_EVIDENCE_REVALIDATION` — current seller-reference isolation evidence is not verified for the active Production commit and Neon branch.  
**Commercial license status:** **NO LICENSE GRANTED — COMMERCIAL MODEL PENDING**.  
**Distribution status:** **HOLD — DO NOT SELL OR DISTRIBUTE**.

The exact source commit, pipeline, artifact, archive digest, SBOM, and attestation are generated per Secure Release run. This repository document deliberately avoids fixed candidate identifiers; use only the release statement and artifact from the same successful exact-head run.

## Commercial rights hold

The former use-only source license is withdrawn. This notice grants no right to use, install, run, inspect, modify, copy, distribute, resell, sublicense, host, or otherwise commercially exploit the source package. All rights are reserved. A future grant requires a separate written agreement approved and signed by the rights holder.

The authoritative package notice is `NO_LICENSE_GRANT_NOTICE.txt`. Package metadata remains `UNLICENSED`; the package must contain no first-party `LICENSE` or `LICENCE` grant file. CI success, production deployment, archive, fingerprint, SBOM, or attestation does not create a license or imply permission to distribute.

## Seller-reference technical evidence

The current stored Production session-isolation and recovery evidence is `NOT_VERIFIED`: both records contain an evidence-rebind marker with `probesReexecuted=false`, and the recovery record refers to a previous Neon branch rather than the active Production branch. The evidence commit therefore cannot certify the current deployment/database pair. Vercel Production metadata still contains certification/release values that conflict with those embedded records; treat those values as stale, not as proof.

Do not claim seller-reference `productionIsolationCertification=CERTIFIED` until new dual-tenant Production probes and a real recovery-point comparison are rerun against the exact current application commit and active Neon Production branch, with independent review. A `READY` Vercel deployment or successful CI run is not a substitute. Buyer environments remain NOT CERTIFIED.

## Remaining engineering and buyer-environment work

1. Signed tenant-context cutover remains incomplete: Preview-only signed-context work is under review; production migrations and the remaining authentication, system/background, Knowledge-pool and route-purpose paths are not yet proven end-to-end. Do not claim complete trust-boundary coverage.
2. WAF enforcement must be proven in blocking mode; logging-only rules are not blocking protection.
3. Neon PITR/restore must be validated with a real restore drill and measured RPO/RTO.
4. Mobile source is included, but signed Android/iOS store artifacts, buyer-specific signing, physical-device QA, and store publication remain outstanding.
5. Native-speaker/domain translation review remains outstanding.
6. Licensed maps/road-routing and buyer-specific external providers, credentials, contracts, and live acceptance remain outstanding.
7. Buyer-environment installation, migration, isolation, backup/restore, and operational acceptance remain buyer-environment gates.

## Release integrity

- Every source change invalidates the previous package identity.
- Secure Release artifacts are for internal technical verification only while the rights hold is active; they must not be distributed.
- No archive, checksum, SBOM, or attestation overrides this rights hold.
- Do not create a sale listing or buyer delivery until the commercial model and signed rights agreement are approved.

**Final commercial decision:** PENDING.  
**Current permission to sell/distribute:** NONE.  
**Buyer-environment certification:** NOT ESTABLISHED.
