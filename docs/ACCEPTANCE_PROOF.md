# OpsCore Acceptance Proof

Measured on the clean three-platform install review environment.

| Check | Expected |
|-------|----------|
| GET /api/health | ok · healthy · engine postgres |
| POST /api/v1/auth/bootstrap (empty DB) | 201 |
| POST /api/v1/auth/login (after bootstrap) | 200 |
| Login with foreign organizationId | 403 ORGANIZATION_ACCESS_FORBIDDEN |
| RLS field mode | only current tenant rows visible |

## Notes
- Production database must not ship with demo users. First boot uses bootstrap.
- Do not commit credentials. Buyer creates the first owner account via bootstrap.
- Candidate migrations beyond the shipped SQL tree must be measured on an isolated branch before production.
