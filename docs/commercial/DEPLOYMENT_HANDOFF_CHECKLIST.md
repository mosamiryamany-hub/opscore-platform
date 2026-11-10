# OpsCore v0.11.61 — Deployment Handoff Checklist

Use this checklist to record buyer-side environment acceptance. Do not mark an item complete without actual evidence.

| Area | Required buyer evidence | Status |
|---|---|---|
| Application | Build/start succeeds in target environment | UNVERIFIED |
| Database | PostgreSQL connection, migrations and isolation tests | UNVERIFIED |
| Identity | OIDC/JWKS or selected authentication boundary tested | UNVERIFIED |
| TLS | Valid certificates and secure ingress configuration | UNVERIFIED |
| Secrets | Secret injection, rotation and log review | UNVERIFIED |
| Network | Firewall/segmentation/allowlists reviewed | UNVERIFIED |
| Rate limiting | Shared/distributed enforcement tested for deployment topology | UNVERIFIED |
| Observability | Central logs, metrics and alerts verified | UNVERIFIED |
| External services | Provider authentication, retries and failure handling tested | UNVERIFIED |
| Backup | Restore performed in target environment | UNVERIFIED |
| Mobile | Physical-device testing and signing completed | UNVERIFIED |
| Release provenance | Hosted CI build/attestation verified if used | UNVERIFIED |

**Rule:** `UNVERIFIED` means not tested in the buyer environment; it is not a claim of failure.
