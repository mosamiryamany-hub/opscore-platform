# Commercial closure — blockers and acceptance criteria

**Current disposition: NO-GO for production certification.** This is not a claim that the deployed website is offline; it means commercial production-grade behavior has not been proven.

## Evidence-based blockers

1. The baseline release commit used a per-operation spawnSync/one-shot PostgreSQL process. The hardening branch replaces that mechanism with a persistent helper and per-request checked-out clients so Store transaction statements can share one session. This improves the transaction transport contract but still requires real PostgreSQL integration tests before production use.
2. On the inspected Neon production branch, 118 public tables contained organization_id; 111 of them had RLS disabled. Only 10 policies existed across the public schema, and several sampled sensitive tables were not protected by RLS. The existing reference SQL backend/db/postgresql_hierarchy_rls.sql is not evidence that it was applied.
3. The live migration ledger reports 29 successful migration records through 031_digital_twin_chain_hardening.sql; this does not establish RLS coverage or application transaction correctness.
4. The committed release scope records PostgreSQL/RLS live verification as not run, mobile builds/signing as unverified, and production certification as not established.
5. Release identifiers currently describe version 0.11.62; the latest feature commit message mentions the v0.11.63 hotfix but does not change the package's version marker. A commercial artifact must identify one version consistently.
6. The baseline backend package lock omitted pg and required transitive packages. The lockfile was regenerated from backend/package.json on the hardening branch; clean-install CI must pass before accepting the dependency fix.

## Acceptance criteria before claiming PASS

- Prove the new IPC bridge and per-request client lifecycle with tests against a real PostgreSQL instance, including rollback on injected failure and cleanup after client/request abort.
- Run tests against a disposable PostgreSQL branch using a restricted role that is neither superuser nor BYPASSRLS.
- For every tenant-owned table, verify RLS is enabled and forced, tenant-scoped policies include both USING and WITH CHECK, and cross-tenant reads/writes are rejected.
- Execute real Store integration tests for login/bootstrap, work-order creation and update, idempotent replay, rollback after injected failure, concurrent updates, and read-after-write.
- Verify that production deployment metadata identifies the exact tested GitLab commit.
- Use one release version across VERSION, package metadata, manifests and release evidence. Mobile store readiness must be scoped accurately if signed artifacts are not part of the sale.

## Running the gate

Run npm run commercial:closure from the backend directory. It is intentionally fail-closed. For live catalog checks, supply OPSC_PG_TEST_URL for a disposable test database; the script never defaults to DATABASE_URL and performs read-only catalog queries only. Do not point it at production.

This gate is a guardrail, not a substitute for passing the acceptance suite.
