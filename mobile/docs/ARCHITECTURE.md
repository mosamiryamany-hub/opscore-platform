# OpsCore Mobile — Architecture

## Goal

A native Android/iOS field companion for OpsCore that keeps office dispatch, technicians, work-order execution and customer-facing evidence on the same operational model.

## Current source baseline

- Expo SDK 58.0.23.
- React Native 0.88.1.
- React / React DOM 19.3.0.
- Secure bearer-token storage through `expo-secure-store`.
- Work-order list/detail using the existing OpsCore REST API.
- Status transitions through the existing lifecycle endpoint.
- GPS check-in using device location.
- Field evidence capture using the device camera and the existing JSON/base64 attachment endpoint.
- Offline queue for `status_update`, `comment`, `appointment_on_my_way`, `appointment_checkin`, `signoff`, and `attachment` events.
- Idempotent client event IDs and synchronization through the existing `/api/v1/sync` contract.
- Online/offline indicator and queued-event count.
- Role/tenant context comes from the server's authenticated session.

## Required backend bridge

The current web login intentionally returns the session token only through an HttpOnly cookie. The mobile source therefore includes `backend-patch/server.mobile-login.diff` which adds a native login endpoint that returns the same server-created token for SecureStore storage.

The buyer must verify the patch is present in the target backend and exercise the mobile login contract against that exact backend before enabling a mobile release. Do not infer login connectivity from the presence of the diff alone.

## Validation status

The exact-source Secure Release run #6 (commit `f3f33865618f0c9da304fe47ab2538b310d7d453`) packages SDK 58 source. The SDK 58 resolver previously passed dependency alignment, Expo Doctor (20/20), project-specific verification, Android/iOS/web JavaScript exports, and a fresh npm audit with zero findings at all severities.

Those checks do not create signed APK/AAB/IPA binaries and do not substitute for physical-device QA or app-store review.

## Not claimed by this source package

- Background GPS tracking.
- Native push notifications.
- Road routing/traffic ETA.
- Full attachment download/viewer.
- Customer digital signature UI.
- Signed app-store binaries or store acceptance.
- Production certification.
- Buyer-environment PostgreSQL/mobile contract acceptance.

These functions must only be added or claimed after implementation, live acceptance tests and evidence exist.
