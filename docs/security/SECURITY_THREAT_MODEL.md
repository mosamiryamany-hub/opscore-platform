# OpsCore Security Threat Model — Pre-Infrastructure

Status: **STATIC / DETERMINISTIC REVIEW**

The model covers tenant escape, privilege escalation, replay/idempotency, SSRF, upload integrity, secret/PII egress, authorization evidence, operation provenance, dynamic-code execution, and production-source subprocess execution.

## Control mapping
- Tenant escape → organization-scoped queries + cross-module integrity graph.
- Privilege escalation → RBAC + API-key scopes + authorization decision evidence.
- Replay → idempotency records + operation envelope request hashes.
- Request provenance → correlation/causation context and operation envelopes.
- Secret/PII egress → recursive sanitization and safe provider error serialization.
- SSRF → URL/IP validation and private/loopback rejection.
- Upload abuse → extension/MIME/signature/integrity validation.
- Intelligence integrity → deterministic lineage metadata on operational intelligence.
- Dynamic execution → production source excludes eval/Function constructors.

## Residual threats requiring infrastructure
1. Live PostgreSQL RLS and role separation.
2. OIDC/JWKS validation and key rotation.
3. TLS/reverse proxy/WAF/network segmentation.
4. Shared distributed rate-limit state.
5. Hosted CI provenance/attestation.
6. Real external-provider and mobile-device verification.

No residual item is converted into a false PASS by this document.
