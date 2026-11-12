# Mobile Dependency and Release Residual

## Exact candidate evidence

- Source commit: `d940152d1428d82d9bb0c57695d929099a648ac3`
- GitHub Actions Secure Release: [run 43308699094](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/43308699094)
- Locked package baseline: Expo SDK 58.0.23, React Native 0.88.1, React / React DOM 19.3.0.
- Node.js CI runtime: 22.23.4.
- The run's actual `mobile-dependency-audit.json` recorded 0 info, 0 low, 0 moderate, 0 high and 0 critical findings. The root PostgreSQL runtime dependency audit also recorded zero findings at all severities.

The exact audit JSON from the archive-producing run is authoritative. This is a point-in-time locked-tree npm audit result, not a guarantee that future advisories will not appear and not a security assessment of every native binary or transitive service outside the npm lockfile.

## SDK 58 validation evidence

The isolated SDK 58 maintenance workflow previously passed:
- reproducible `npm ci --ignore-scripts`;
- the repository's SDK 58 dependency gate;
- mobile release preflight and project-specific verification;
- Expo Doctor: 20/20 checks;
- Expo JavaScript exports for Android, iOS and web;
- fresh npm audit with zero findings at every severity.

The SDK 58 changes were merged through PR #15. Secure Release the current verified candidate run then rebuilt the exact archive from the current source commit and included its current audit evidence.

## Remaining mobile release gates

- Signed Android AAB and iOS IPA have not been evidenced in this release artifact.
- No physical-device acceptance report is included.
- No Google Play Internal Testing or Apple TestFlight acceptance is included.
- App-store review and publication are not included.
- Buyer-specific EAS project, signing identities, store credentials and device matrix remain target/account-specific.
- The Web SQLite cross-origin isolation headers (COEP/COOP) must be independently verified if the deployed mobile web target uses the SQLite WASM path.
- Native-speaker translation review of the Contact Center language resources remains 0/114; language production qualification remains 0/114. Translation outputs remain machine-assisted drafts/fallbacks and are not production-qualified.

## Security follow-up

Run fresh `npm audit` on every release candidate. Keep npm lockfile updates reproducible and review every new advisory. Do not use `npm audit fix --force` to bypass a major Expo/RN transition without a separate SDK migration, native build and physical-device acceptance.

## Explicit non-claims

- No claim that signed Android/iOS binaries exist in the buyer archive.
- No claim of physical-device QA, App Store / Google Play approval or publication.
- No claim that future dependency advisories are impossible.
- No production certification or production-wide tenant-isolation certification.

## Update - 2026-11-12

- `mobile/src/db.js` opens the local database with SQLCipher keying: a 32-byte key is generated once and stored via `expo-secure-store` (WHEN_UNLOCKED_THIS_DEVICE_ONLY), applied with `PRAGMA key` before any other statement, and verified with `PRAGMA cipher_version`; the open fails closed with LOCAL_DATABASE_SQLCIPHER_UNAVAILABLE when the native build lacks SQLCipher.
- `mobile/PrivacyInfo.xcprivacy` declares the Apple required-reason API categories; its presence and content are asserted by `mobile/scripts/verify-mobile.js`, which runs in CI on every pull request and main push.
