# Mobile dependency advisory review — 2026-11-17

**Disposition: OPEN / NOT ACCEPTED / RELEASE BLOCKER**

This is a current assessment of GHSA-fc5q-39xc-vjpf / CVE-2026-112366 for OpsCore v0.11.62. It does not suppress npm audit, declare the advisory false, or authorize release.

## OpsCore dependency and source boundary

- Current candidate lockfile: npm lockfile v3, 498 package records.
- It resolves `picomatch@4.0.7` at the mobile dependency-tree root and `picomatch@2.3.2` nested below `jest-util` and `micromatch`.
- Current root `backend/package-lock.json`: 15 package records, no `picomatch`.
- GitHub Actions on the candidate reports the mobile audit as High because of GHSA-fc5q-39xc-vjpf. Both required CI workflows fail at the mobile dependency audit. The backend runtime dependency audit reports 0 findings.
- The mobile app source inventory inspected on main includes `App.js`, `metro.config.js`, and the tracked `mobile/src` modules. No direct application import/call to `picomatch`, `micromatch`, `tinyglobby`, or a user-configurable glob-matching API was found. `metro.config.js` only adds WebAssembly to Metro asset extensions.
- A separate SDK 58 refresh workflow completed Android, iOS and Web exports and did not find the scanned picomatch source signatures in the emitted client bundles.

These observations support a narrower classification: the currently visible occurrences are in the Expo/Metro build/development dependency graph, not a direct app runtime call path. They are **not proof of zero exposure**. Buyer-controlled or untrusted repository/configuration input used during builds remains an environment-dependent concern. Bundle-signature scans do not prove safety of all code paths.

## Exact candidate verification record — GitHub Actions run 44152511359

Candidate commit tested: `5e3c49846b4c13623bdbfc759470c9107eda5a37` (PR #222 lineage; candidate source package and lockfile matched the subsequent branch copy byte-for-byte by Git blob SHA).

| Check | Recorded result |
|---|---|
| Clean `npm ci` from candidate lockfile | PASS |
| SDK dependency alignment gate | PASS |
| Mobile release preflight and source verification | PASS |
| Expo Doctor | 20/20 checks passed |
| Android export | PASS |
| iOS export | PASS |
| Web export | PASS |
| Client-bundle advisory signature scan | Checked signatures not found in all three exports |
| Full mobile `npm audit --json` | **25 High, 0 Critical, 0 Moderate, 0 Low** |
| Mobile `npm audit --omit=dev --json` | **26 High, 0 Critical, 0 Moderate, 0 Low** |

The workflow uploaded exact audit JSON, manifest, lockfile and export/doctor logs as artifact `mobile-sdk58-current-main-evidence-44152511359` (artifact ID `14360445590`; SHA-256 `0b542b038e937f3eb43dc5430a2c4db77d6b17d342b731a0442b78bea9d4ceb6`). The generated lockfile blob SHA is `b9f7e719865312650eab54d1c0ca8dc362a8c2dc`, exactly matching the candidate branch lockfile.

The workflow run itself ended FAILURE at its old step that tried to push refreshed files back to the branch while concurrent documentation updates had advanced the branch. This was a Git non-fast-forward race, not a test or build failure. The workflow was then changed to read-only validation with artifact output only. The full/production audits already produced above remain findings; the fail-closed audit gate was skipped in that particular run because the obsolete commit step failed first. A rerun of the read-only workflow is required to record the expected fail-closed result on the latest candidate head.

**Interpretation:** SDK 58 source checks, Expo Doctor and all three JS exports pass, and the exact lockfile is reproducible. This does not resolve the audit finding. The production-only npm audit also reports High findings; no buyer-ready mobile security claim or merge approval follows from the successful build steps.

## Latest read-only candidate run — 2026-11-17 18:55Z

GitHub Actions run **44152872774** tested candidate commit `851b31fb20f47e17d58aed89bddd97e3c9af73e7`. The candidate package manifest and generated lockfile were unchanged from the files now at PR #222 head: package.json blob `3acfd5aa6b7a452fba4e6e5bae764e72bdcdccc5`; package-lock blob `b9f7e719865312650eab54d1c0ca8dc362a8c2dc`.

| Check | Latest result |
|---|---|
| `npm ci` from the committed lockfile | PASS |
| SDK58 alignment / dependency gate | PASS |
| Mobile source contract verification | PASS |
| Expo Doctor | 20/20 |
| Android, iOS and Web exports | PASS |
| Checked picomatch signatures in client bundles | Not found in all three |
| Full `npm audit --json` | **26 High** |
| `npm audit --omit=dev --json` | **25 High** |
| Fail-closed release condition | **FAIL — expected while High/Critical remains** |

Exact evidence artifact: `mobile-sdk58-current-main-evidence-44152872774`, artifact ID `14359762064`, SHA-256 `e28ff52c887b66dc6f05cada7a40599e5384bb79e7782985b340691c1dce1bdf`.

The prior read-only predecessor run 44152511359 reported the reverse 25/26 count split across full and omit-dev. The committed lockfile SHA and package versions were identical in both artifacts. Therefore do not treat the one-count difference as a fixed vulnerability or a reduction in risk. For current qualification use the latest run's 26 High full-audit / 25 High omit-dev figures, and preserve both raw JSON reports. The same root advisory GHSA-fc5q-39xc-vjpf remains present. Package-level High counts are transitive audit records, not 26 separate CVEs.

The read-only workflow now has `contents: read`, checkout credentials disabled and no branch-push step. Its intentional final failure is the unresolved audit gate, not a write conflict.

## Current authoritative and disputed public evidence

### GitHub / NVD
- GitHub Advisory Database currently lists GHSA-fc5q-39xc-vjpf as High / Unreviewed. Its current advisory page does not define a package entry or known affected/patched version range, while npm audit resolves the advisory to the installed picomatch graph.
  https://github.com/advisories/GHSA-fc5q-39xc-vjpf
- NVD currently shows CVE-2026-112366 as Awaiting Enrichment. The displayed 8.7 High score is attributed to CNA VulnCheck; NVD states it has not yet provided its own assessment.
  https://nvd.nist.gov/vuln/detail/CVE-2026-112366
- The advisory's technical description concerns single-branch repeated extglob patterns such as `+(*)` and `+(*a)`, which can compile to nested unbounded quantifiers and cause catastrophic backtracking.

### Snyk and maintainer dispute
- Snyk search metadata currently labels SNYK-JS-PICOMATCH-21248802 as revoked / deemed not a vulnerability. The opened Snyk detail page still retains the historical ReDoS description and states there is no fixed version. Treat this as a disputed source, not as a clean bill of health.
  https://security.snyk.io/vuln/SNYK-JS-PICOMATCH-21248802
- The upstream maintainer comment on PR #235 states that arbitrary untrusted glob/regex patterns should not be accepted and disputes the claimed vulnerability. On 2026-11-17T18:00Z, contributor G-Rath stated that another dispute had been submitted to the CNAs to withdraw the advisory.
  https://github.com/micromatch/picomatch/pull/235

### Upstream remediation proposals are not release-ready
- PR #237 (v4 fix) remains open and unmerged, with no formal review submissions recorded.
  https://github.com/micromatch/picomatch/pull/237
- PR #238 (v4 fix) remains open and unmerged. A review submitted on 2026-11-17 measured residual exponential cases in that patch: `+(*)`, `*(*)`, and `+(a*)`; the reported `+(*)` case reached about 3 seconds at input length 28. The reviewer states this includes one of the patterns named in the advisory. Therefore PR #238 is not accepted as a complete fix as-is.
  https://github.com/micromatch/picomatch/pull/238
- PR #246 proposes a v2 adaptation for `picomatch@2.x`; it remains open/unmerged with no formal review submissions recorded.
  https://github.com/micromatch/picomatch/pull/246
- npm currently publishes picomatch 4.0.7 as latest; no 4.0.8 or corresponding patched v2 release is published in the examined version registry.
  https://www.npmjs.com/package/picomatch

## Why the candidate does not apply a forced change

- The npm remediation path proposes downgrading React Native to 0.83.10 / Expo 54, which is a major SDK change away from the selected Expo SDK 58 / React Native 0.88.1 baseline.
- The published upstream fix proposals are not merged, and the latest review found residual slow patterns in one v4 patch.
- No unofficial tarball, private fork, arbitrary override, lockfile-only rewrite, or audit suppression is applied.
- No audit warning is treated as resolved merely because source signatures are absent from generated bundles.

## Required next evidence

1. Re-run the exact candidate clean install, SDK alignment gate, Expo Doctor and Android/iOS/Web exports after every dependency or source change.
2. Preserve both the full mobile audit and the production-only audit JSON from the exact same candidate. Reconcile all reported vulnerable nodes to the single advisory; any independent finding blocks the candidate.
3. Perform an explicit source/data-flow review for every build-time path that accepts glob patterns. Confirm whether untrusted repository content, remote artifacts, user uploads, tenant data, or external build configuration can reach the pattern argument. Keep this as a separate security acceptance report.
4. Require an upstream maintainer-approved fix or an internally maintained fork that has a reviewed complete patch for both v4 and v2, regression coverage for the reported cases, full upstream tests, and reproducible package provenance. Do not deploy the currently open PR patches as if they were approved.
5. If the rights holder later elects to accept the residual build-tool risk, record a transaction-specific signed risk acceptance, exact package pins, scope, controls, review date, and buyer disclosure. This document is not that acceptance.

## Release rule

The High audit finding remains unresolved. Required CI checks remain fail-closed. No Production activation, signed mobile release, buyer delivery, or claim of security remediation is authorized by this assessment. Seller-side marketing may proceed only with explicit disclosure that the current mobile dependency audit is unresolved and that the offer is source-code handoff, not a hosted SaaS or certified mobile binary.
