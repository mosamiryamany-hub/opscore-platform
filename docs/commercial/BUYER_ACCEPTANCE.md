# OpsCore — Buyer Acceptance Harness

**Release: v0.11.62**

This package contains a repeatable, local acceptance layer for the controls that materially affect acquisition due diligence.

## Covered controls
- Tenant isolation and cross-tenant reference protection
- Authentication/security regression coverage
- Offline sync partial-failure recovery
- Evidence integrity and completion assurance
- Versioned completion policies and governed workflows
- Tenant-scoped organization export with SHA-256 snapshot verification
- JavaScript syntax validation
- Backup integrity and foreign-key verification (`npm run backup:verify -- <backup-file>`)

## Honest boundary
The harness does not certify PostgreSQL runtime integration, signed mobile artifacts, physical devices, app-store approval, or production infrastructure. Those remain environment-dependent acceptance items.

- Read-only tenant audit-chain verification with tamper-detection regression test
