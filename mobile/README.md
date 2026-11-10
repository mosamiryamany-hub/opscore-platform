# OpsCore Mobile v0.1.16

Field execution surface for the same OpsCore backend: Today Mission, On My Way, GPS Check-in, safety acknowledgement, online evidence/notes, offline queue and Sync Center.

## Backend compatibility

- Mobile source version: **0.1.16**
- Declared backend contract target: **0.11.62** (static source checks only; full post-change suite/native device run not completed)
- API authority: the same OpsCore tenant/backend used by the web console.
- Runtime base URL: `EXPO_PUBLIC_API_BASE_URL` must point to the buyer's real HTTPS backend in production; do not ship a localhost or plaintext HTTP production configuration.

## Distribution truth boundary

This directory is Expo/React Native source for Android and iOS. It does **not** contain signed APK/AAB/IPA artifacts. Store signing, physical-device validation, store submission and store approval remain buyer-environment responsibilities.

Navigation opens external device map applications. Customer messaging, push notifications and external-provider certification are not claimed as completed until their real environments are connected and verified.
