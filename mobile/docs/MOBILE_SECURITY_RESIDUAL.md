# Mobile Dependency Security Residual

Scope: mobile/ — Expo SDK 57.0.31, React Native 0.86.3, Node 22.23.4.

## Last verified locked-tree baseline (previous candidate only)

Pipeline 3014428936 on commit 30bf29aa reported:

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 0 |
| Moderate | 10 |
| Low | 2 |
| Total | 12 |

The CI gate blocks any High or Critical finding. Moderate and Low findings remain disclosed; the lockfile is not described as vulnerability-free. The exact JSON report mobile/mobile-dependency-audit.json from the same pipeline that builds the archive is authoritative. The archive builder refuses a package if the report is missing, malformed or contains High/Critical findings. The next source commit must rerun the audit.

## Current audit evidence

The authoritative locked-tree audit is regenerated from the current lockfile during the exact-head secure-release workflow and is attached to the same run that produces OPSCORE.zip. The previous-candidate table below is historical only and must not be presented as current counts. The workflow blocks High/Critical findings; Moderate/Low findings must be disclosed. Do not claim the mobile dependency tree is vulnerability-free.

## Findings

The 10 moderate packages in the previous candidate were @expo/cli, @expo/config, @expo/config-plugins, @expo/fingerprint, @expo/inline-modules, @expo/metro-config, @expo/prebuild-config, expo, glob and minimatch. The two low packages were @expo/local-build-cache-provider and deepmerge. Findings were in the Expo CLI/config/prebuild/Metro/fingerprint/build-cache dependency graph.

The npm audit fix without --force probe made no package changes. npm audit fix --force proposed Expo 58.0.22, a breaking SDK major transition; it was not applied to the SDK 57 release candidate. An isolated SDK 58.0.22 / React Native 0.88.1 probe passed expo install --check and Web export but still reported 11 moderate findings and zero high/critical. It did not materially reduce the advisory burden compared with SDK 57 (10 moderate + 2 low), while requiring a major SDK/RN transition and native-device QA. SDK 58 was therefore not adopted.

## High-severity remediation

- node-forge resolved to 1.4.2.
- zod resolved to 4.6.7 through a root npm override.
- Expo SDK 57 modules aligned to their expected SDK 57 versions.
- Previous 5-high / 0-critical baseline is historical and superseded.

## Zod residual nuance

The version-level npm advisory range is cleared in the previous candidate. Upstream clarification notes that collection schemas without an explicit upper bound may still process unbounded input. Application-owned collection schemas accepting untrusted variable-length input should enforce an explicit maximum where appropriate. This audit does not prove every downstream application schema is safe.

## Web SQLite requirements

The previous resolver probe confirmed expo-sqlite@57.0.4 includes a 621,492-byte WASM source asset and Expo Web export succeeded. Metro recognizes .wasm and sets COEP/COOP headers on its development server. A production web host must separately serve Cross-Origin-Embedder-Policy: credentialless and Cross-Origin-Opener-Policy: same-origin. Vercel Production headers have not been modified or validated for this requirement.

## Explicit non-claims

- No claim that every npm advisory is cleared.
- No claim that every unbounded Zod collection schema is safe.
- No claim of signed APK/AAB/IPA, physical-device QA, App Store / Google Play acceptance or production web cross-origin isolation.
- No production Vercel or Neon change was made.
- Use the exact archive-producing pipeline's mobile audit JSON as the current dependency record.

## Ownership boundary

Before handover, the seller owns mobile source defects and remediation of High/Critical dependency findings. After handover, the buyer owns ongoing dependency/security maintenance and buyer-environment operations. Buyer-specific EAS linkage, Android/iOS signing, native builds, physical-device validation and store submission are buyer-owned; no signed APK/AAB/IPA is included. Native-speaker review of the integrated translations is buyer-owned before production language claims.