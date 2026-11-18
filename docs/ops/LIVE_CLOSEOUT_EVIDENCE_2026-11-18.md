# Live closeout evidence addendum — 2026-11-18

## Scope and method

Read-only inventory and verification across GitHub `mosamiryamany-hub/opscore-platform`, Vercel project `opscore-platform`, and Neon project `summer-leaf-18448271`. One non-destructive Vercel environment metadata type change was made: the secret-bearing HMAC JSON environment variable was changed from encrypted/readable Config to Sensitive/Secret on Production and Preview. No environment value was changed. No Production deployment, Neon schema/data write, main ref, branch protection, WAF rule, plan, or snapshot was changed.

## Verified GitHub state

- Main SHA: `e5a8ee187d54e5fdba05eaacc3bbd8269cbd9062`.
- Required current-main checks: `verify`, `vercel-contract-verify`, and `isolated-postgres-rls-and-http-acceptance` all successful.
- Production deploy steps remain skipped by the intentional hold.
- PR #254 remains draft/conflicted and failed earlier checks; it is not safe to merge.
- PR #266 has successful verify/contract/isolated database checks but is blocked from merge; no review is recorded.
- PR #271 has successful verify/contract/isolated database checks but is blocked from merge; the workflow fix is not yet in main.
- Active main ruleset requires PR, forbids delete and non-fast-forward, and requires strict `verify` and `vercel-contract-verify`. Ruleset approval count is zero. Classic branch-protection details could not be read through the available GitHub integration.

## Verified Vercel state

- Current Production deployment is READY at deployment ID `dpl_dgpmTAyycrjST9Rp3Gmp576KEmrg`, serving commit `7b6d12b816c7a1ad4cc92802df7ce222bd233ade` (six commits behind current main).
- `OPSC_PRODUCTION_HOLD=true`; `OPSC_RELEASE_VERIFIED=false`.
- Both HMAC secret-bearing variables are now marked Sensitive/Secret for Production; HMAC JSON and key variables also marked Secret for Preview. Key ID remains a non-secret encrypted/config variable.
- Active WAF CRS/Bot Protection actions remain Log; rate limiting is configured on login and mobile-login. No enforcement change was made.
- No Vercel Trusted Source/GitHub Actions OIDC rule or candidate-probe environment configuration was verified.

## Verified Neon state

- Free plan; Primary branch `br-proud-salad-bcshhdap`, ready, default, unprotected.
- History retention 21,600 seconds (6 hours); automatic snapshot schedule empty.
- Snapshot `snap-tiny-dream-bc58p5nj` created 2026-11-18T01:22:39Z.
- Non-finalizing restored branch `br-odd-surf-bcps6nce` reports `restored_from=snap-tiny-dream-bc58p5nj`, `restore_status=restored`; it remains separate from Primary.
- Both databases had 136 public base tables, 2 public views, 135 RLS/Force-RLS tables and 68 migration ledger rows. Migration records 063–067 and 069 were confirmed with hashes. Ledger fingerprint matched between Primary and restored branch.
- Primary has one enabled 32-byte HMAC key row, ID `prod-20261118-eb27b438`, matching Vercel key ID metadata and expiring 2026-12-18T10:18:59Z.
- These checks do not produce the full canonical v2 schema/data/ownership/ACL restore proof, behavioral 67-route isolation evidence, PITR time-target proof, or any RPO/RTO guarantee.

## Closure decision

**Main CI is green; commercial/Production closeout is not complete.** Keep Production hold and release verification flags unchanged. The remaining blocking gates are: 67-route live tenant evidence and cold-start proof bootstrap; candidate OIDC configuration; authorized merge of PRs #266/#271 after GitHub resolves their blocked state; Neon paid backup/protection posture; exact-current-main release archive/provenance; WAF baseline/rehearsal; picomatch advisory remediation or dated risk approval; and transaction-specific legal license rights.
