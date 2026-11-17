# Mobile dependency advisory review — 2026-11-17

**Disposition: OPEN / NOT ACCEPTED / RELEASE BLOCKER**

This record documents the exact dependency finding currently blocking the OpsCore mobile release. It does not suppress npm audit, declare the advisory false, or authorize production release.

## Scope verified from repository lockfiles

- The current `backend/package-lock.json` contains 15 package records and no `picomatch` package.
- The current `mobile/package-lock.json` on main contains 503 package records and resolves:
  - `picomatch@4.0.7` at the root of the mobile dependency tree.
  - `picomatch@2.3.2` nested under `jest-util` and `micromatch`.
- The main-branch CI runs on 2026-11-17 reported 26 High, 0 Critical, 0 Moderate and 0 Low findings for the mobile audit. The same failure was observed by both required workflows.
- The detailed audit dependency chain includes Expo / Metro / React Native tooling, `tinyglobby`, `micromatch`, `jest-util`, and `picomatch`. The current report's root advisory entry is GHSA-fc5q-39xc-vjpf / CVE-2026-112366.
- The existing Android, iOS and Web exports completed successfully in the dedicated SDK 58 remediation workflow. Its signature scan did not find the checked picomatch source markers in those three exported client bundles.

These facts narrow the observed exposure to the mobile toolchain in the current graph. They do **not** prove the package can never receive attacker-controlled patterns during local development or CI, and bundle scanning alone is not an exploitability assessment.

## Advisory disagreement — current public record

- GitHub Advisory Database lists GHSA-fc5q-39xc-vjpf as High, for picomatch through 4.0.7, with no patched version stated: https://github.com/advisories/GHSA-fc5q-39xc-vjpf
- NVD record CVE-2026-112366 remains in Awaiting Enrichment; the visible 8.7 score is attributed to CNA VulnCheck, not an NVD assessment: https://nvd.nist.gov/vuln/detail/CVE-2026-112366
- Snyk's SNYK-JS-PICOMATCH-21248802 page says the advisory was revoked and deemed not a vulnerability: https://security.snyk.io/vuln/SNYK-JS-PICOMATCH-21248802
- The available upstream changelog still lists 4.0.7 as the latest release and does not document a fix for CVE-2026-112366: https://github.com/micromatch/picomatch/blob/master/CHANGELOG.md

The sources conflict. The GitHub/npm audit signal remains actionable until GitHub updates or withdraws its advisory, or an approved risk decision is recorded with supporting technical evidence.

## Why no forced dependency downgrade or override is applied

The remediation advice returned by npm points to Expo 54 and React Native 0.83 in the audit graph. Those are major-version changes away from this product's selected Expo SDK 58 / React Native 0.88 baseline. Applying them only to silence the audit would break the supported SDK alignment and is not an acceptable fix.

No unofficial fork, synthetic patched tarball, lockfile-only edit, arbitrary override, or audit suppression is accepted as remediation.

## Required evidence before a narrowly scoped exception can be considered

1. Rebuild the current SDK 58-compatible lockfile from the current main-based candidate using the official Expo installer and publish the exact lockfile as CI evidence.
2. Review every mobile source call path that can supply glob patterns to Expo CLI, Metro, `tinyglobby`, `micromatch` and `picomatch`; establish whether any remote, tenant-controlled, uploaded, or otherwise untrusted data can reach those arguments.
3. Confirm the full dependency audit contains only this advisory family and no independent High/Critical issue.
4. Repeat Android, iOS and Web exports and scan the generated artifacts; retain the actual artifact hashes. Treat this as corroborating evidence only, not proof of runtime exploitability.
5. Have a security reviewer document the residual risk, exploit preconditions, trust boundary, mitigation, owner, expiry date, and explicit approval. The rights holder must approve any commercial risk acceptance.
6. Keep the advisory visible to buyers and preserve the audit JSON, SBOM, lockfile and waiver (if approved) with the exact release statement.

## Release rule

Until all evidence above exists and an authorized owner records any exception in writing, the mobile High finding remains unresolved and the release gate must fail closed. No Production deployment, mobile binary signing, or buyer delivery is authorized by this document.
