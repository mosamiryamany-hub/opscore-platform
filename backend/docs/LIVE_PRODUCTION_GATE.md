# Live Production Gate

`npm run live:gate` is the environment-bound verification gate for the controls that cannot be proven from a source ZIP alone.

Required environment variables:

- `DATABASE_URL`
- `OIDC_ISSUER`
- `OIDC_AUDIENCE`
- `OIDC_TOKEN`

The gate verifies real PostgreSQL connectivity, required table RLS + `FORCE ROW LEVEL SECURITY`, tenant isolation with a transaction-scoped tenant context, and OIDC discovery/JWKS retrieval plus RS256 signature and claim validation.

Without those real services, the command returns `UNVERIFIED` and does not claim production certification.

The PostgreSQL tenant test runs inside a transaction and rolls it back. It must not be executed with an identity that bypasses RLS unless the deployed design explicitly requires that and the check is adjusted to test the runtime role.
