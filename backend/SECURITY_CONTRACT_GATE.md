# OpsCore API Security Contract Gate

Version: 0.11.56

This gate is deterministic/static. It verifies the presence of the server's core security boundaries; it does not certify a live deployment.

Checked controls:
- authentication context gate
- API-key scope gate
- correlation propagation
- request body limits
- safe error egress
- authorization decision evidence
- cross-module integrity endpoint
- operation-envelope endpoint
- absence of direct `eval`/`new Function` in the server entrypoint

Live PostgreSQL/RLS, OIDC/JWKS, TLS/WAF, distributed state and external-provider controls remain infrastructure-dependent and are not certified here.
