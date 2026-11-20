# Mobile dependency advisory review — historical record, current status reconciled 2026-11-21

> **Current status update — 2026-11-21 (supersedes the live-status labels in this historical 2026-11-17 review):** GitHub's advisory record and the mirrored OSV record now identify GHSA-fc5q-39xc-vjpf / CVE-2026-112366 as **WITHDRAWN on 2026-11-18**. The OSV record's withdrawal text says it is not a security issue and points to the upstream maintainer discussion in picomatch PR #235. The previous OPEN / NOT FIXED / High labels and the 25/26 High audit counts in this document are historical observations from before that withdrawal; they must not be presented as the current active vulnerability state. The mobile lockfile still contains `picomatch@4.0.7` and nested `2.3.2`, but dependency presence alone is not an active advisory finding. The GHSA exception has therefore been removed from `mobile/audit-allowlist.json` on the current closeout branch. A fresh full and `--omit=dev` audit on the exact candidate is still required; if npm audit continues to report the withdrawn GHSA, retain the failing result as stale advisory-data evidence and do not restore the allowlist automatically. Any other active High/Critical advisories must be assessed independently. This withdrawal does not mean a package patch was released or that the entire dependency tree is certified clean.

> Upstream/source references: [GitHub Advisory record](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) (withdrawn 2026-11-18); [OSV mirrored advisory record](https://osv.dev/vulnerability/GHSA-fc5q-39xc-vjpf) (withdrawal timestamp 2026-11-18T15:38:56Z); [upstream picomatch PR #235](https://github.com/micromatch/picomatch/pull/235) (maintainer dispute and closed unmerged remediation proposal).

---

**Historical disposition as at 2026-11-17: OPEN / NOT FIXED / TEMPORARY GATE EXCEPTION ACTIVE. Superseded by the 2026-11-21 WITHDRAWN status update below; exact-head audit refresh remains pending.**

This is the advisory evidence record for GHSA-fc5q-39xc-vjpf / CVE-2026-112366 for OpsCore v0.11.62. Main currently permits the finding through a self-expiring audit-allowlist entry reviewed by 2026-12-18. That gate exception does not suppress the underlying record, declare the advisory false, constitute an independently signed risk acceptance, or establish a patched package.

## OpsCore dependency and source boundary

- Current candidate lockfile: npm lockfile v3, 498 package records.
- It resolves `picomatch@4.0.7` at the mobile dependency-tree root and `picomatch@2.3.2` nested below `jest-util` and `micromatch`.
- Current root `backend/package-lock.json`: 15 package records, no `picomatch`.
- GitHub Actions on the candidate reports the mobile audit as High because of GHSA-fc5q-39xc-vjpf. Both required CI workflows fail at the mobile dependency audit. The backend runtime dependency audit reports 0 findings.
- The mobile app source inventory inspected on main includes `App.js`, `metro.config.js`, and the tracked `mobile/src` modules. No direct application import/call to `picomatch`, `micromatch`, `tinyglobby`, or a user-configurable glob-matching API was found. `metro.config.js` only adds WebAssembly to Metro asset extensions.
- A separate SDK 58 refresh workflow completed Android, iOS and Web exports and did not find the scanned picomatch source signatures in the emitted client bundles.

These observations show that the reported packages are transitive members of the installed Expo/Metro toolchain graph and that no direct application-source call to a glob-matching API was found. However, the audit with `--omit=dev` still reports 25 High findings; this is **not a dev-only finding** and must not be described as one. The absence of a direct app-source call and the absence of checked strings in exported bundles do not prove that no vulnerable code path can execute in Expo, Metro or packaging workflows. Treat the issue as unresolved exposure in the installed mobile toolchain until a complete security review or upstream fix is accepted.

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

The prior read-only predecessor run 44152511359 reported the reverse 25/26 count split across full and omit-dev. The committed lockfile SHA and package versions were identical in both artifacts. Therefore do not treat the one-count difference as a fixed vulnerability or a reduction in risk. At that point in the history, the latest run was 44152872774 (26 High full / 25 High omit-dev). A later exact-head run is recorded below; use the newest same-head evidence for current qualification. The same root advisory GHSA-fc5q-39xc-vjpf remains present. Package-level High counts are transitive audit records, not 26 separate CVEs.

The read-only workflow now has `contents: read`, checkout credentials disabled and no branch-push step. Its intentional final failure is the unresolved audit gate, not a write conflict.

## Latest exact-head validation — 2026-11-17 19:16Z

GitHub Actions run **44156497177** tested the current PR #222 head `6a0df56fe4ae647379646460c1ea76de71e8062f`.

| Check | Result |
|---|---|
| SDK58 alignment and mobile source verification | PASS |
| Expo Doctor | 20/20 |
| Android / iOS / Web exports | PASS |
| Scanned picomatch signatures in client bundles | Not found in all three exports |
| Full mobile `npm audit --json` | **25 High, 0 Critical** |
| Mobile `npm audit --omit=dev --json` | **25 High, 0 Critical** |
| Fail-closed High/Critical release condition | **FAIL — correctly blocks release** |

Evidence artifact: `mobile-sdk58-current-main-evidence-44156497177`, artifact ID `14361381790`, SHA-256 `8c64e388b4db141e91ca94cbd5b491e38003f1f6b31ded43321ade06e14dc044`.

This exact-head run supersedes the 44152872774 count split for current reporting. The audit now reports 25 High in both modes; this one-count change is not evidence of a fix. The same GHSA remains attached to picomatch in the installed Expo/Metro dependency tree, and no fixed upstream npm release is published as of this check. Expo Doctor and exports passing do not override the unresolved advisory or the fail-closed result.

## Latest rerun after commercial-doc updates — 2026-11-17 19:19Z

GitHub Actions run **44157086377** tested PR #222 candidate head `8f2cd2f8a43925f33fc4bc1bfbd8bde17c6b384f`.

| Check | Result |
|---|---|
| SDK58 alignment and mobile source verification | PASS |
| Expo Doctor | 20/20 |
| Android / iOS / Web exports | PASS |
| Scanned picomatch signatures in client bundles | Not found in all three |
| Full mobile `npm audit --json` | **26 High, 0 Critical** |
| Mobile `npm audit --omit=dev --json` | **25 High, 0 Critical** |
| Fail-closed High/Critical release condition | **FAIL — correctly blocks release** |

Artifact: `mobile-sdk58-current-main-evidence-44157086377`, artifact ID `14361941285`, SHA-256 `32fe23c57c3eb51f50cd98c540dfaa5c81b1eb0883715589423bd159f443b77d`.

The preceding exact-head run 44156497177, on the same mobile manifest/lockfile, returned 25 High in both audit modes. The latest run returned 26/25. This is a one-record audit-result variation with no dependency change and must not be interpreted as a fix or reduced risk. Use the latest 26/25 result for current buyer-facing disclosure. The GHSA remains present and the fail-closed gate remains active.

## Latest exact-head rerun — 2026-11-17 19:23Z

GitHub Actions run **44157820028** tested PR #222 candidate head `d59819b94c5953e17413b4f9cbf1ef1172145e90`.

| Check | Result |
|---|---|
| SDK58 alignment and mobile source verification | PASS |
| Expo Doctor | 20/20 |
| Android / iOS / Web exports | PASS |
| Scanned picomatch signatures in client bundles | Not found in all three |
| Full mobile `npm audit --json` | **25 High, 0 Critical** |
| Mobile `npm audit --omit=dev --json` | **26 High, 0 Critical** |
| Fail-closed High/Critical release condition | **FAIL — correctly blocks release** |

Artifact: `mobile-sdk58-current-main-evidence-44157820028`, artifact ID `14361712311`, SHA-256 `98ec6833d033d880d661d37aa2b6feff2520b0dcd4ccb4f4241f10201b6ebf01`.

The prior exact-head run 44157086377 on the same mobile dependency lockfile reported 26 High full / 25 High `--omit=dev`; run 44156497177 reported 25/25. The count shifts across repeated npm audit runs without any dependency-lock change. This is audit-result variance, not a patch, fix, or risk reduction. For the latest state, disclose 25 High full / 26 High production-only and keep the fail-closed gate active.

## First-party mobile source/data-flow review — candidate head `d59819b`

A targeted static review was performed against the current SDK58 candidate tree. This is a reachability assessment of first-party source, not a claim that the upstream advisory is false or that the Expo toolchain is free of the vulnerable code.

### Exact source inputs reviewed

| File | Git blob SHA |
|---|---|
| `mobile/package.json` | `3acfd5aa6b7a452fba4e6e5bae764e72bdcdccc5` |
| `mobile/package-lock.json` | `b9f7e719865312650eab54d1c0ca8dc362a8c2dc` |
| `mobile/App.js` | `1b87ec2f57085511e96c91aa047c045e6552d730` |
| `mobile/metro.config.js` | `c5c6947433e057dc0338d034df846041426eeb74` |
| `mobile/app.json` | `7df95ddbe5d8cb5bcee9330e210f1ef7d1c6abce` |
| `mobile/src/api.js` | `89d66f3c2e84035252c3aa8a8b0bb8e4711e3709` |
| `mobile/src/auth.js` | `b4e6853c6a6e4e4c3d641ea96bd6fa4f7c203253` |
| `mobile/src/db.js` | `d885964044785da86f82bfc08724b3d602e22f02` |
| `mobile/src/id.js` | `ba85911269dba9a5746e06dbd0badeee5fbd621d` |
| `mobile/src/local-crypto.js` | `f15be2219558c145c17e5ed17bb251d5fcef0fed` |
| `mobile/src/signoff-assurance.js` | `ed6c11d68eae2f8edb67d41ded3c3f359dc6bc9b` |
| `mobile/src/sync-result.js` | `be51e9a338bc609fa1d48079ca20afb4161fca19` |
| `mobile/src/sync.js` | `5cc9ac7b8f7ca7f0e3a6e45e5c97628c73bcfa2a` |
| `mobile/scripts/dependency-upgrade-gate.js` | `666b6d1539caa2ec0f10c0976853461b6857b011` |

No direct first-party import or call to `picomatch`, `micromatch`, `tinyglobby`, or a glob-matching API was found in these app/config modules. The only first-party `glob` references in the reviewed dependency-gate script inspect lockfile versions; they do not invoke a glob matcher. `metro.config.js` only extends Metro's asset extensions for WebAssembly.

### Locked dependency graph

The 498-record npm lockfile resolves:
- `picomatch@4.0.7` at `node_modules/picomatch`;
- `picomatch@2.3.2` below `jest-util` and `micromatch`;
- direct parent edges from `@expo/metro-config@58.0.23`, Expo's nested `@expo/cli@58.1.21`, `jest-util@29.7.0`, `micromatch@4.0.8`, and `tinyglobby@0.2.17`.

These are transitive Expo/Metro/build-tool graph paths. They are not first-party application imports. However, the packages are not all marked as dev-only in the lockfile, and the latest `npm audit --omit=dev` still reports 26 High. Therefore this issue must not be described as dev-only or absent from the production-only audit.

### Reachability and threat boundary

- No first-party mobile API, screen, sync payload, user field, or HTTP request handler was found that accepts a glob/extglob pattern and passes it to picomatch.
- The Android, iOS and Web exports in the exact SDK58 validation did not contain the checked picomatch source signatures. This is a narrow signature scan, not proof that no vulnerable code path exists.
- The remaining plausible exposure is in build/configuration tooling processing repository-controlled source/configuration, or in a compromised dependency/CI input. The static first-party scan does not prove that all third-party Expo/Metro calls are unreachable or that malicious repository changes cannot trigger a slow pattern.
- The advisory requires a pattern that triggers pathological regex backtracking. No end-user-controlled pattern path was identified in first-party mobile source during this review; this lowers the apparent remote-app attack surface but does not remove the build/CI supply-chain exposure.

### Disposition

**Reachability review: PARTIAL / NOT A RISK ACCEPTANCE. Advisory: OPEN / RELEASE BLOCKER.** This review supplies first-party source evidence but does not independently test every third-party call site, prove all build inputs trusted, or replace an upstream fix. Keep the CI audit fail-closed. If the rights holder chooses to accept the residual build/CI risk, only an authorized seller-side security/risk owner may sign the internal risk acceptance described above; no buyer identification or buyer signature is required for that seller decision.

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
5. If the rights holder elects to accept the residual build-tool risk instead of waiting for a complete upstream fix, the authorized seller-side security/risk owner must record an internal signed risk acceptance with the exploitability analysis, exact package pins, scope, compensating controls, owner, review/expiry date, and required public/prospective-buyer disclosure. This is a seller governance decision; it does not require an identified buyer or buyer signature. It must not be treated as complete until the authorized risk owner actually approves and signs it. This document is not that acceptance.

## Release rule

The High audit finding remains unresolved. Required CI checks remain fail-closed. No Production activation, signed mobile release, buyer delivery, or claim of security remediation is authorized by this assessment. Seller-side marketing may proceed only with explicit disclosure that the current mobile dependency audit is unresolved and that the offer is source-code handoff, not a hosted SaaS or certified mobile binary.

## Current-head CI and upstream status addendum — 2026-11-17

The latest complete exact-head check located during this review tested PR #222 head `807dee55f050bc96a4123091f09be1503c10004d`:

| Evidence | Result |
|---|---|
| OpsCore CI | Run 44158727347; failed only at the fail-closed mobile dependency audit |
| Backend runtime `npm audit --omit=dev --audit-level=high` | 0 findings |
| Mobile full `npm audit` | 25 High, 0 Critical |
| Mobile `npm audit --omit=dev` | 26 High, 0 Critical |
| PostgreSQL 18 isolated RLS/HTTP acceptance | Run 44158727249; PASS on the same head; caller-bound matrix 346 route checks; `isolationCertification=NOT_CERTIFIED` |
| Vercel contract | Run 44158727582; failed at the same mobile audit; deployment jobs skipped |

The audit log traces all mobile High records to the picomatch advisory through the Expo/Metro dependency graph. It does not show 26 separate CVEs. The backend runtime audit passing does not reduce or waive the mobile findings.

### Public advisory position checked on 2026-11-17

- GitHub Advisory Database: [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), associated with [CVE-2026-112366](https://nvd.nist.gov/vuln/detail/CVE-2026-112366), describes regular-expression denial of service through single-branch repeated extglob patterns and lists affected picomatch versions through 4.0.7. No patched npm release version is identified in the advisory record at this check.
- NVD still labels the record as awaiting enrichment; its displayed CVSS-B 8.7 score is attributed to VulnCheck rather than an NVD assessment.
- The upstream maintainer discussion remains visible at [micromatch/picomatch issue #247](https://github.com/micromatch/picomatch/issues/247). A proposed fix or discussion is not an official published release.
- A separate third-party package, [@ryotsu/picomatch](https://socket.dev/npm/package/@ryotsu/picomatch), advertises a fork of 4.0.7 with a patch. It is not the upstream picomatch release, and this review has not independently validated its source diff, regression corpus, package provenance, API/semantic compatibility, license chain or reproducible build. It is **not approved as a replacement** and must not be used to turn the current CI gate green.

### Disposition

**OPEN / NOT ACCEPTED / RELEASE BLOCKER remains the only evidence-supported disposition.**

Do not:
- add a `npm overrides` alias to an unreviewed fork;
- mark the advisory as false positive from the bundle string scan;
- call the issue dev-only while `npm audit --omit=dev` still reports High;
- suppress the audit, convert High to warning, or add a VEX/not-affected assertion without a reproducible call-site and build-input reachability argument reviewed by an independent security reviewer;
- use `npm audit fix --force`, which the exact CI log says would install React Native 0.83.10, breaking the candidate's React Native 0.88.1 line.

The next acceptable closure route is an official upstream patched release or a separately reviewed, provenance-verified patch whose complete dependency graph and regression tests pass on one exact candidate head. Then rerun all required CI and generate the final Secure Release artifact from that exact head. Until then, seller source-release status remains HOLD.

## Latest full exact-head workflow — PR #222 candidate `bd6d7ee56a0f3b7db3cf09cefefe11fd46ba76e3`

The three required check workflows completed on this same candidate head:

| Workflow | Run | Result |
|---|---|---|
| OpsCore CI | [44167795172](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44167795172) | Backend release suite 810 total / 807 pass / 0 fail / 3 skipped; backend runtime audit 0 vulnerabilities; mobile install-time `npm ci` summary prints 25 High; required mobile `npm audit --omit=dev --audit-level=high` step fails with 26 High / 0 Critical |
| PostgreSQL 18 isolated RLS/HTTP acceptance | [44167795388](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44167795388) | PASS; caller-bound tenant matrix 346 route checks; caller-bound logical restore 137 tables; `isolationCertification=NOT_CERTIFIED` |
| Vercel contract | [44167795351](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44167795351) | Fails at mobile `npm audit --omit=dev --audit-level=high` with 26 High / 0 Critical; deploy-bound PostgreSQL and deploy jobs skipped; no Production deployment |

The difference between the 25-High `npm ci` install-time summary and the 26-High explicit `npm audit --omit=dev` result is an audit-output count difference within the same CI job, not an improvement or a second advisory. The explicit audit step is the enforced gate and fails with 26 High. The Vercel contract independently reaches the same 26-High explicit-audit result.

Backend runtime audit success and the passing PostgreSQL 18 isolated test do not resolve the mobile dependency advisory. The isolated database evidence is not Production certification. Do not merge the candidate, create a Secure Release ZIP, or claim release qualification while this fail-closed audit remains unresolved.



## Current main reconciliation — 2026-11-18

Current repository main is 88f0f7377244d89f063de7c07714f9c2849fbc57; the last application-code baseline is 27d41476a115d81ddd3ad1b4f03025142a7e5be6 because PR #235 changed closeout documents and a consistency test only. The current mobile manifest resolves Expo 58.0.26, React 19.3.1 and React Native 0.88.1. Post-merge OpsCore CI run [44205567188](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44205567188) passed, and Vercel contract run [44205566999](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44205566999) passed the contract and isolated PostgreSQL acceptance with the Production deployment job skipped.

The reason the current main audit gate can pass is explicitly recorded in mobile/audit-allowlist.json:
- GHSA-fc5q-39xc-vjpf remains allowlisted as a documented residual.
- Maximum accepted picomatch version remains 4.0.7.
- Review expiry is 2026-12-18.
- Registry failure, publication of a newer picomatch version, or expiry voids the entry and causes the gate to fail closed.

This is a temporary configuration-level exception. The reviewed file does not contain an authorized risk-owner identity, signature, or separately signed risk-acceptance record. Therefore **formal seller risk acceptance remains NOT EVIDENCED**. Do not state that the advisory is fixed, that the mobile audit is clean, or that the entry is a VEX/not-affected declaration.

PR #230, which pins picomatch to 4.0.7, remains Draft/HOLD. The override alone does not remediate the advisory. The current-main Secure Release workflow has not yet produced a ZIP/statement for repository commit 88f0f7377244d89f063de7c07714f9c2849fbc57; the manual dispatch attempt did not start because the separate browser automation wallet balance was -$0.12. No workflow run or release artifact was created.

Until an authorized seller security/risk owner documents and signs the disposition, treat the exception as time-limited CI gate policy only. Continue to preserve the advisory and reassess before 2026-12-18 or earlier if the registry state changes.
