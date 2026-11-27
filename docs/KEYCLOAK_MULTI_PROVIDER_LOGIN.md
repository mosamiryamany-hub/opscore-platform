# Keycloak multi-provider sign-in — deployment contract

## Required Vercel environment configuration

Set the following variables in the intended Vercel environment (Preview first; Production only after full verification):

- `AUTH_MODE=oidc`
- `OIDC_ISSUER=https://KEYCLOAK_HOST/realms/REALM_NAME`
- `OIDC_AUDIENCE=opscore-web` (the Keycloak client ID)
- `OIDC_CLIENT_SECRET` (confidential-client secret; server-side only)
- `OIDC_STATE_SECRET` (independent random secret of at least 32 characters)
- `OIDC_REDIRECT_URI=https://opscore-platform.vercel.app/api/v1/auth/oidc/callback`
- `OIDC_AUTO_LINK_EMAIL=false` unless a separately reviewed account-linking policy approves verified-email linking.

The browser never receives the Keycloak client secret or ID/access tokens. The application uses a same-origin start/callback flow, Authorization Code + PKCE (S256), an HttpOnly/Secure/SameSite=Lax short-lived signed state cookie, and server-side code exchange. The server validates ID-token signature, issuer, audience, expiry and nonce before creating the existing OpsCore HttpOnly/Secure/SameSite=Strict session cookie. The Keycloak token and discovery endpoints must use the same HTTPS origin as the configured issuer.

## Keycloak client

Create an OpenID Connect client with:

- Client authentication: **On** (confidential client).
- Standard flow: **On**; implicit and direct-access grants: **Off**.
- PKCE method: **S256 required**.
- Valid redirect URI: the exact value of `OIDC_REDIRECT_URI`.
- Client ID: the exact value configured as `OIDC_AUDIENCE`.
- Include verified `email` and `email_verified` claims in the ID token.
- Keep the client secret only in Keycloak and the Vercel server-side environment variable.

## Identity-provider brokers

Configure Keycloak Identity Providers with these exact aliases because the application sends them as `kc_idp_hint`:

| Provider | Required IdP alias |
|---|---|
| Google | `google` |
| GitHub | `github` |
| Microsoft | `microsoft` |
| Apple | `apple` |
| Facebook | `facebook` |

For every upstream provider, register Keycloak's broker callback URI (normally `https://KEYCLOAK_HOST/realms/REALM_NAME/broker/ALIAS/endpoint`) with that provider. Store upstream provider client IDs and secrets in Keycloak, not in Vercel or this repository. The browser does not call Keycloak token/discovery endpoints directly; no cross-origin browser CORS allowance is required.

## Account and tenant safety

This flow does not auto-create OpsCore users, organizations, memberships or roles. The existing store accepts only active, provisioned users and existing OIDC identity links; email-based linking remains disabled unless `OIDC_AUTO_LINK_EMAIL=true` is deliberately configured. Unknown or unlinked identities must be provisioned/linked through the existing controlled onboarding process. No provider login grants an organization role.

## Verification required before enabling

1. Confirm Keycloak discovery issuer exactly matches `OIDC_ISSUER` and discovery/token endpoints share the issuer's HTTPS origin.
2. Confirm the confidential client, exact callback URI, S256 PKCE and verified email claims.
3. Confirm all upstream broker aliases and provider callbacks, with live credentials stored only in Keycloak.
4. Set the six required environment values in Vercel Preview; never paste secrets into GitHub.
5. Run backend OIDC verifier and Keycloak contract tests.
6. Test each configured provider end-to-end against a pre-provisioned active user; verify unknown/unlinked identities are rejected and no organization membership is created.
7. Keep `AUTH_MODE=local` until all checks pass. Do not enable OIDC in Production merely because the buttons render.

The Keycloak service/realm and upstream provider credentials/callback registrations are external prerequisites; they are not provisioned by this repository change.
