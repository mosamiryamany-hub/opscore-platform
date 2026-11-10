# Integration Notes — Mobile 0.1.16 / Backend 0.11.61

The mobile client is a sector-neutral field-operations client that consumes the backend’s versioned client contract. The backend remains authoritative for authorization, entity state, and conflict handling.

## Offline data handling

- Offline mutations, mission cache, and captured evidence are AES-GCM encrypted at rest with associated data bound to account/organization scope and record identity.
- New photo evidence lives in the encrypted evidence store and is sent with a stable evidence ID as its idempotency key; image base64 is not copied into the general sync queue. Legacy attachment queue rows are moved into encrypted storage before deletion from the source table.
- Sync captures its auth and scope at the start of a flush and avoids starting further requests once a scope switch is detected.
- Sign-out attempts server-side token revocation and clears local credentials even when the network is unavailable. Encrypted offline data stays attached to its original scope, rather than being reassigned to a different account.

## Verification boundary

Static source checks do not replace an Expo Android/iOS build or device tests. In the review sandbox, the full backend release-test runner did not finish and `npm audit --omit=dev` could not reach npm's registry. A live PostgreSQL deployment was not exercised. Cached offline audits returned no reported findings, but connected npm registry audit was blocked by DNS. The full post-change backend release suite timed out; no aggregate count is claimed. See `../../docs/release/RELEASE_SCOPE.md` and `../../docs/release/POST_FIX_AUDIT_REPORT.json`.
