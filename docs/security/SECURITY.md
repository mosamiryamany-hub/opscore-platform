# Security Policy

## Scope

OpsCore is a general-purpose operational SaaS system. Security reports should focus on authentication, authorization, tenant isolation, object access, SSRF, uploads, webhooks, exports/imports, secrets, dependency supply chain, data integrity, and recovery controls.

## Reporting

Do not publish credentials, exploit payloads, customer data, or other sensitive material in public issues. Report security findings privately through the repository's configured security contact or private vulnerability reporting mechanism.

Include the affected component, a concise reproduction, expected versus actual behavior, and any conditions required to reproduce the issue. Remove secrets from reports.

## Disclosure boundary

A source-code review or local deterministic test does not establish production security. PostgreSQL RLS, OIDC/JWKS validation, TLS/network controls, hosted observability, and external-provider behavior require verification in their real deployment environments.
