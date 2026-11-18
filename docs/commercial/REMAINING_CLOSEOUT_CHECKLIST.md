# Seller-side closeout checklist — OpsCore v0.11.62 (.18)

**Scope:** seller-owned isolated source-package release only. Production SaaS certification, buyer environment provisioning and the buyer's license grant are separate scopes.

## Release identity and packaging

- [ ] Correct all buyer-facing package documents to identify the .18 release line; no .17 tag/branch identifiers in current-facing .18 documents.
- [ ] Run Secure Release for the exact .18 source commit and confirm every required step succeeded.
- [ ] Confirm the .18 tag points to the exact source commit recorded by the run.
- [ ] Verify all evidence sidecars, integrated manifest, SBOM, provenance attestation and archive round-trip on the exact built tree.
- [ ] Upload an unambiguous versioned ZIP + external statement + SHA-256 sidecar to the existing draft release; mark earlier unversioned assets as superseded.
- [ ] Independently verify the uploaded asset digest and byte length against the external statement.
- [ ] Keep the release as draft/pre-release unless and until separately instructed to publish.

## Security matters that must remain disclosed

- [ ] Define and execute the named OPSC_APP_SECURITY acceptance gate. It was not found in the inspected .18 code/package or Vercel environment-variable name inventory; GitHub Actions secret names were not inspectable. No PASS is available.
- [ ] Resolve or formally accept the High-severity picomatch advisory GHSA-fc5q-39xc-vjpf / CVE-2026-112366. The current .18 archive records a build-toolchain allowlist exception; the exception is not a fix.
- [ ] Remediate and re-test the Production tenant-context trust boundary described by the 2026-11-14 audit before claiming Production tenant-isolation certification. The audit is historical and not exact .18 live acceptance.
- [ ] Obtain a current, exact-commit security review and live Production acceptance only if a Production-security claim or hosted service is being offered.

## Buyer/environment residuals (do not misclassify as seller source-build failures)

- Signed Android/iOS artifacts, device acceptance and store publication.
- Native-speaker translation review (current record: 0/114 reviewed; 0/114 production-qualified).
- Licensed maps/routing and third-party provider contracts, keys and accounts.
- Buyer-specific identity, messaging, telephony, payments, storage, KMS/HSM, cloud, deployment and operational acceptance.

## Legal / delivery boundary

- [ ] Before buyer use or delivery, execute a License Schedule signed by the rights holder and named buyer, pinning the exact archive SHA-256 and specifying the granted rights.
- [ ] Until then, keep licenseGrant=NONE_PENDING_RIGHTS_HOLDER_DECISION and distributionAuthorized=false.
- [ ] Do not claim Production certification; keep productionCertification=false absent exact live acceptance.

A source-package candidate may be marketed and demonstrated with these disclosures. Do not describe the candidate as fully security-certified, defect-free, production-ready, or freely distributable.
