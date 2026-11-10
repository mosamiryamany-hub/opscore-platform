# OpsCore Mobile — Architecture

## Goal

A native Android/iOS field companion for OpsCore that keeps office dispatch, technicians, work-order execution and customer-facing evidence on the same operational model.

## Implemented in this source package

- Native Android/iOS app source using Expo SDK 57 / React Native 0.86.
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

Until that patch is applied to the backend, the mobile application is **not connected for login**. This is deliberate and documented; there is no fake local authentication.

## Not claimed yet

- Background GPS tracking.
- Native push notifications.
- Road routing/traffic ETA.
- Full attachment download/viewer.
- Customer digital signature UI.
- App-store signed binaries.
- Production certification.
- PostgreSQL-specific mobile contract testing.

Those should be added only after real requirements and tests exist.
