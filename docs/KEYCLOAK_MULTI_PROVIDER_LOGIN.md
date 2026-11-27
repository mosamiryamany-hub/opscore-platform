# Keycloak multi-provider sign-in — deployment contract

## Application configuration

Set these Vercel environment variables for the intended deployment environment:

- `AUTH_MODE=oidc`
- `OIDC_ISSUER=https://KEYCLOAK_HOST/realms/REALM_NAME`
- `OIDC_AUDIENCE=opscore-web` (the Keycloak public client ID)
- `OIDC_AUTO_LINK_EMAIL=false` unless an explicit, reviewed account-linking policy approves verified-email linking.

The application never receives or stores the Keycloak client secret. The browser uses Authorization Code + PKCE (S256); the application server independently validates the ID token signature, issuer, audience, expiry and nonce before creating its own HttpOnly session cookie.

## Keycloak client

Create an OpenID Connect client with:

- Client authentication: **Off** (public client).
- Standard flow: **On**; implicit and direct-access grants: **Off**.
- PKCE method: **S256 required**.
- Valid redirect URI: `https://opscore-platform.vercel.app/control-plane.html`.
- Web origin: `https://opscore-platform.vercel.app`.
- Client ID: the exact value configured as `OIDC_AUDIENCE`.
- Include verified `email` and `email_verified` claims in the ID token.

For each broker, configure an Identity Provider in the realm with the exact alias below. The alias is passed as Keycloak's `kc_idp_hint`:

| Provider | Required IdP alias |
|---|---|
| Google | `google` |
| GitHub | `github` |
| Microsoft | `microsoft` |
| Apple | `apple` |
| Facebook | `facebook` |

For every upstream provider, register the Keycloak broker callback URI shown by Keycloak (normally `https://KEYCLOAK_HOST/realms/REALM_NAME/broker/ALIAS/endpoint`) with that provider. Supply each provider's client ID and secret in Keycloak, not in Vercel or this repository.

## Account and tenant safety

This flow does not auto-create OpsCore users, organizations, memberships or roles. The existing store accepts only active, provisioned users and existing OIDC identity links; email-based linking remains disabled unless `OIDC_AUTO_LINK_EMAIL=true` is deliberately configured. Unknown or unlinked identities must be provisioned/linked through the existing controlled onboarding process. No provider login grants an organization role.

## Verification required before enabling

1. Confirm Keycloak discovery issuer exactly matches `OIDC_ISSUER`.
2. Confirm the public client has the exact redirect URI and S256 PKCE requirement.
3. Confirm all upstream broker aliases and provider callbacks.
4. Confirm Vercel's Keycloak origin is reachable from the browser and allowed by the Keycloak client's Web Origins (CORS).
5. Run the backend OIDC verifier tests and this contract test.
6. Test each configured provider end-to-end against a pre-provisioned active user; verify an unknown email is rejected and no organization membership is created.
7. Keep `AUTH_MODE=local` until all of the above pass. Do not enable OIDC in production merely because the buttons render.

The Keycloak service itself, realm, upstream provider credentials, and provider callback registration are external prerequisites; they are not created by this repository change.
