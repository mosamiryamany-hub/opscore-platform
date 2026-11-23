# OpsCore — Remaining closeout gates

**Evidence cut:** 2026-11-23 05:33 UTC  
**Main:** 88df9046ea5d57b392530565bc8cf6a10627ac4a  
**Canonical detailed record:** [Commercial closeout status — 2026-11-23](../commercial/COMMERCIAL_CLOSEOUT_STATUS_2026-11-23.md)

This is an operational index, not a blanket or third-party certification.

| Gate | Current state | Completion criterion |
|---|---|---|
| Protected Production release | PASS | Run 45116314003 completed successfully; public domain serves exact SHA 88df9046... via deployment dpl_FVXwPoqefvkNsxA3BqVrxYnxRQka |
| Production isolation, signed routes, HTTP/business flows | PASS within defined scope | Preserve exact evidence boundary: 67 signed routes, 358 route probes, and 3 authenticated tenant flows; do not claim 358 authenticated workflows |
| Recovery / native Neon PITR | PASS within defined scope | 136 tables, 9,218 rows, 0 content mismatches; this is not a scheduled-backup or RPO/RTO guarantee |
| Backend regression suite | PASS_WITH_SKIPS | Run 45116314003: 181 files; 992 cases, 989 passed, 0 failed, 3 skipped, 0 unaccounted |
| PostgreSQL-specific test skips | REMAINING / environment-bound | Run the three exact skipped tests with a disposable PostgreSQL URL: firewall-rate-limit-postgres.test.js, postgres-commercial-acceptance-http.test.js, tenant-isolation-matrix.test.js |
| Vercel WAF | STAGING REHEARSAL PASS; Production managed rules log-only | A narrow temporary staging canary returned 403/deny; same marker on Production returned 200; canary was removed. Review false positives and obtain explicit owner approval before any Production-wide deny/challenge change |
| Current-head buyer Secure Release bundle | UNVERIFIED | Run .github/workflows/opscore-secure-release.yml on exact agreed SHA; verify ZIP, digest, SBOM, commercial statement, Sigstore bundle, tamper rejection and signer identity from that same run |
| License / distribution | NO LICENSE GRANT | Rights holder and named buyer execute the exact-deliverable License Schedule; do not infer rights from deployment, repository, HMAC evidence or unsigned template |
| Mobile | REMAINING_BUYER | Signed Android/iOS native builds, physical-device QA and app-store publication |
| Languages | REMAINING_BUYER | 114 interface choices; machine-assisted/English-fallback distinction retained; 0/114 native-reviewed or production-qualified |
| Maps / providers | REMAINING_BUYER | Buyer/provider contracts, credentials, attribution, quotas and live acceptance |
| Buyer installation | NOT VERIFIED | Buyer-owned install, migration, tenant isolation, restore and operational acceptance |

## Exact Production release

- GitHub run: [45116314003](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/45116314003) — completed / success, seven of seven jobs successful.
- Public domain: https://opscore-platform.vercel.app
- Live release proof: HTTP 200; status=PASS; productionIsolationCertification=CERTIFIED; functionalApiRouteAcceptance=PASS_PRODUCTION_FUNCTIONAL_SCOPE; neonPointInTimeRecovery=PASS_PRODUCTION_FULL_DATA_PITR_SCOPE.
- Internal archive identity attestation: HMAC-SHA256 PASS for package fingerprint f6c97a996883462d831f56c2a44e792f9c8788c3bf95e49b937184a17df4e717. This is not the buyer Sigstore Secure Release package.

## Regression run 45116314003

The backend release runner completed with no failures. Three tests were explicitly skipped because the general source-verification job did not receive a dedicated disposable database URL:
- PostgreSQL shared rate-limit concurrency;
- PostgreSQL commercial HTTP acceptance;
- tenant-isolation matrix.

Separate Production PostgreSQL/RLS/PITR and HTTP evidence succeeded in the protected Production workflow, but those separate checks do not convert the three skipped Node test cases into executed cases. The older reported 912/25 figure does not match this exact latest run.

## Vercel WAF rehearsal

The temporary canary was scoped to a single non-production staging host, a preview environment match, GET /api/health, and a unique query marker. Baseline staging request = 200; marked staging request = 403 with x-vercel-mitigated: deny; marked Production request = 200. The temporary rule was removed and verified absent from active firewall version 6. The existing authentication rate limit remains enabled (60 requests/IP/60 seconds). Managed gen, rce, sqli, xss and bot-protection rules remain log only.

## Neon limits

Production branch br-proud-salad-bcshhdap remains ready but unprotected; automatic snapshot schedule is empty and one manual snapshot is listed. The current Free plan does not establish protected-branch controls or scheduled-backup retention. No plan upgrade or retained recovery material deletion was performed. Do not promise RPO/RTO.

## Non-claims

The internal Production isolation/recovery proof is scope-specific engineering evidence, not ISO 27001, SOC 2, PCI DSS or independent penetration-test certification. No full commercial close, buyer license, buyer installation acceptance, scheduled backup guarantee, store publication or native-speaker language qualification is claimed.
