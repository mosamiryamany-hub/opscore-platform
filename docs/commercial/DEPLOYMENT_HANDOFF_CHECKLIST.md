# OpsCore v0.11.62 — Deployment Handoff Checklist

Use this checklist to record target-environment acceptance. Do not mark an item complete without current evidence from the actual target.

| Area | Required evidence | Current status |
|---|---|---|
| Exact source | GitHub Actions archive, commit, run ID, SHA-256, provenance verification | NOT_ISSUED |
| Application | Extracted install, start, and route smoke tests | UNVERIFIED |
| Database | PostgreSQL connection, migrations, and catalog verification | UNVERIFIED |
| Runtime role | Actual connection is `opscore_runtime`, NOBYPASSRLS, no elevated membership | UNVERIFIED |
| Tenant isolation | Tenant A/B session isolation across all tenant-owned tables and API routes | UNVERIFIED |
| Identity | OIDC/JWKS, session lifecycle, password reset, and recovery | UNVERIFIED |
| TLS | Valid origin certificates and secure ingress configuration | UNVERIFIED |
| Secrets | Separate runtime/migration/bootstrap secrets, rotation, and log review | UNVERIFIED |
| Network | Firewall rules, WAF block-mode policy, segmentation, and allowlists | UNVERIFIED |
| Rate limiting | Shared/distributed enforcement across deployment topology | UNVERIFIED |
| Observability | Central logs, metrics, alerts, and on-call ownership | UNVERIFIED |
| External services | Provider authentication, retries, webhooks, and failure handling | UNVERIFIED |
| Backup | Encrypted backup and restore drill with measured RPO/RTO | UNVERIFIED |
| Mobile | Signed Android/iOS builds and physical-device testing | BUYER_OWNED |
| Localization | Native-speaker/domain review and approval | BUYER_OWNED |
| Commercial rights | Signed transfer/license, resale rights if applicable, support and SLA | NOT_SIGNED |

**Rule:** UNVERIFIED means not tested in the target environment; it is not a claim of failure. Production certification remains NOT_ESTABLISHED until all seller-owned production gates have exact evidence.
