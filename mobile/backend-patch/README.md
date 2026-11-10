# OpsCore mobile backend bridge

The current OpsCore web login intentionally keeps the session token out of JSON and places it in an HttpOnly cookie. A native Android/iOS client cannot safely depend on the browser cookie flow used by the web UI.

The integrated backend now includes `POST /api/v1/auth/mobile-login` and returns the authenticated session token in JSON so the native app can store it in the device secure store and send it as `Authorization: Bearer <token>`. This diff is retained as an audit/reference artifact; it is no longer a required manual patch.

## Security requirements

- Keep HTTPS mandatory in real deployments.
- Do not expose the mobile-login endpoint over plaintext HTTP in production.
- Preserve the existing login throttling and `store.login()` implementation; the bridge must not duplicate credential verification.
- Keep the token short-lived according to the existing session TTL.
- Revoke sessions through the existing logout/session-revocation mechanisms.
- Do not log request bodies or returned bearer tokens.

This paragraph describes the historical patch artifact only. The bridge is already integrated in the shipped OpsCore server; no manual patching is required.
