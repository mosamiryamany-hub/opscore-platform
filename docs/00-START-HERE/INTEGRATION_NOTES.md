# Integration Notes — OpsCore Mobile 0.1.16 / Backend 0.11.61

The mobile client is a sector-neutral field-operations client that consumes the backend's versioned client contract. The backend remains authoritative for authorization, entity state, and conflict handling.

## Offline data

- Local mutations, mission cache and captured evidence are encrypted at rest using AES-GCM. Associated data binds ciphertext to a local account/organization scope and record identity.
- Evidence uploads are sent from the dedicated encrypted evidence store using a stable evidence ID as the idempotency key. Image base64 bodies are not enqueued as general-purpose sync events by the current client.
- The client captures the authenticated user/organization scope at the start of a sync and does not start additional requests after a detected scope switch.
- Signing out clears device credentials, attempts server-side token revocation, and preserves encrypted offline work under its original scope. It is not reassigned to a different user.

## Verification boundary

Static source gates do not replace an Expo Android/iOS build or device testing. The full backend release-test runner and online npm audit were blocked in the review environment, and a live PostgreSQL deployment was not exercised. See `../release/RELEASE_SCOPE.md` and the post-fix audit report for the exact boundaries.
