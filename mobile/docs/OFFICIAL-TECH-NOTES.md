# Official technology basis

## Current locked package baseline

This repository's current mobile source baseline is:
- Expo SDK 58.0.23
- React Native 0.88.1
- React 19.3.0
- React DOM 19.3.0
- Node.js 22.23.4 (CI release runtime)

The exact dependency versions are determined by `mobile/package-lock.json`; this note is a summary, not a replacement for the lockfile.

## Official references

Use version-specific Expo documentation matching the locked SDK, not the rolling `latest` documentation when evaluating installed APIs:
- Expo SDK 58 reference: https://docs.expo.dev/versions/v58.0.0/
- Expo SQLite: https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/
- Expo SecureStore: https://docs.expo.dev/versions/v58.0.0/sdk/securestore/
- Expo Location: https://docs.expo.dev/versions/v58.0.0/sdk/location/
- Expo ImagePicker: https://docs.expo.dev/versions/v58.0.0/sdk/imagepicker/
- EAS Build: https://docs.expo.dev/build/introduction/
- EAS Submit: https://docs.expo.dev/submit/introduction/

The SDK compatibility matrix and package metadata must be rechecked whenever Expo or React Native is upgraded. A successful JavaScript export is not evidence of a signed native binary or physical-device acceptance.
