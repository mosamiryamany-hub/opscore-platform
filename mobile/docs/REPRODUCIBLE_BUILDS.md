# Mobile Build / Release Contract

The mobile package includes `eas.json` with development, preview/internal, and production build profiles.

## Current source evidence

- Mobile source contract: checked by `mobile/scripts/verify-mobile.js`; this is a static source-contract check, not device certification.
- EAS build configuration: PRESENT.
- `mobile/package-lock.json`: PRESENT in the current source tree and used by `npm ci` in the release workflow.
- Clean extracted-archive install: must be evidenced by the exact archive-producing workflow; a lockfile's presence alone is not proof of reproducibility.
- Signed Android APK/AAB: UNVERIFIED.
- Signed iOS IPA: UNVERIFIED.
- Physical-device certification: UNVERIFIED.
- Store submission/approval: UNVERIFIED.

## Release verification

The exact-head secure-release workflow runs the mobile dependency installation, `release-preflight.js`, and `npm run verify`. The package builder then extracts the completed archive into a clean temporary directory and repeats `npm ci`, release preflight, and mobile verification. The workflow artifact and its attestation are the evidence for that specific run; prior run results must not be reused.

Buyer-specific EAS project linkage, signing credentials, native Android/iOS builds, physical-device testing, store submission, and store approval remain separate gates. No signed artifact or store certification is claimed by the presence of `eas.json` or the source lockfile alone.
