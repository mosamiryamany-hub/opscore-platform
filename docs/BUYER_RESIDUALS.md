# Buyer and seller residuals — reconciled 2026-11-23

**Neon/Production ledger register reconciled 2026-11-22** by a read-only ledger query; every figure carried from that register below is labelled with its read date and was not silently promoted to a 2026-11-23 measurement.

## Superseding scope decision (owner, 2026-11-23)

The closeout scope is now the **complete hosted product**: the seller website on Vercel, the seller Production deployment, the Neon production database, periodic backups plus a full restore test, and the commercial/legal pages are **all in scope** and each must be proven on the same commit and the same deployment.

The earlier code-only scope decision (source code and release package only, excluding the seller site, seller Production and seller Neon) is **superseded and no longer governs acceptance**. It is retained only as history. No Neon or Vercel paid-plan upgrade is authorized without explicit owner approval; the current plan stays unless approved otherwise.

## Current source, deploy and proof state (measured 2026-11-23)

| Item | Measured value | Scope of evidence |
|---|---|---|
| `main` head | `fbc4a3082325dff98e2ed41fffe42c3d76863254` | GitHub commits API read 2026-11-23 |
| Pull request #401 | `open`, head `b3648d6c32ecba99f8bc4f114b610d7394b8d473`, 4 files, +223/−77 | GitHub pulls API + files API |
| PR #401 CI | `verify`, `vercel-contract-verify`, `vercel-source-verify` **failure**; CodeQL and `isolated-postgres-rls-and-http-acceptance` success | Run `45124539604` |
| Secure Release (on `main`) | Run `45122272270`, completed/success | Exact source `fbc4a308…` |
| Live `/api/health` | `200` · `{"status":"healthy","version":"0.11.62","engine":"postgres"}` | Live probe 2026-11-23 |
| Live `/api/verify/release` | `status: PASS`, `sourceCommit: 88df9046ea5d57b392530565bc8cf6a10627ac4a`, deployment `dpl_FVXwPoqefvkNsxA3BqVrxYnxRQka` | Live probe 2026-11-23 |
| Live `/api/verify/database-security` | `productionIsolationCertification: NOT_CERTIFIED`, `catalogIsolationScope: CATALOG_ONLY_NOT_BEHAVIORAL_CERTIFICATION` | Live probe 2026-11-23 |
| Identity divergence | Deployed commit `88df9046…` ≠ `main` head `fbc4a308…` | Both probes above; health 200 alone does not establish that `main` is deployed |
| Commercial/legal pages | `/terms`, `/privacy`, `/refund`, `/pricing`, `/legal`, `/security` all return **HTTP 404** | Live probes 2026-11-23 on `opscore-platform.vercel.app` |

The two live proof endpoints currently disagree on isolation status: the release proof reports `CERTIFIED` while the database-security proof reports `NOT_CERTIFIED` for a catalog-only scope. Both must be bound to the same deployment id and the same commit, and the disagreement must be explained at the source, before any single certification claim is made. A green CI run or a `200` health response is not a substitute for that reconciliation.

## Tenant isolation and route acceptance

The 67/67 signed-session route result is isolated PostgreSQL CI evidence, **not buyer-environment qualification**. Buyer environments remain independently unverified.

That result was produced on a disposable isolated PostgreSQL 18 instance inside CI. It does not certify the canonical Production alias, and it is not re-labelled as production acceptance. Production session/tenant isolation, restore and route evidence are separate gates that must each carry their own deployment id and commit.

## Neon production database ledger (read-only register read 2026-11-22)

| Item | Value |
|---|---|
| Project / engine | `summer-leaf-18448271` · PostgreSQL 18 · plan `free_v3` |
| History window | 21,600 seconds (6 hours) |
| Production branch | `br-proud-salad-bcshhdap` |
| Primary branch protected | No (`protected=false`) |
| Listed snapshots | One listed manual snapshot: `snap-aged-thunder-bcsxc1a5` (recorded 2026-11-19) |
| Automatic snapshot schedule | None (live schedule query returned an empty schedule) |
| Main migration ledger | 70 rows; latest `071_signed_rls_context_all_access_modes.sql` (read 2026-11-22) |
| Recovery branch ledger | 68 rows; latest `069_technician_location_trail_tenant_persistence.sql` on `br-calm-poetry-bc7l7wik` (read 2026-11-22) |

A fresh read-only Neon ledger query on 2026-11-22 found 70 rows on Primary, latest `071_signed_rls_context_all_access_modes.sql`, and 68 rows on recovery branch `br-calm-poetry-bc7l7wik`, latest migration `069_technician_location_trail_tenant_persistence.sql`. The two-row ledger difference is a stale recovery branch, **not evidence of data corruption**.

The Neon control plane was not reachable from this session (`api.neon.tech` did not resolve), so the register above was not re-queried on 2026-11-23; it is carried with its read date rather than presented as a current measurement.

Backups and recovery are not closed: there is no periodic external backup job, no automated digest/size/freshness check, and no scheduled restore drill into an isolated database. A logical `pg_dump` copy taken to owner-controlled external storage is a point-in-time copy, not PITR, and it does not by itself establish an RPO or an RTO. Neon Free provides a 6-hour history window; that is the current recovery floor, not a zero-loss guarantee.

## Localization qualification

The Contact Center currently exposes 105 selectable locales (1 English source, 100 machine-assisted drafts, 4 English fallbacks); 9 withdrawn locale codes are excluded. The separate qualification matrix retains 114 source rows, all at `planned_not_qualified` / `not_run`; that historical register is not the current catalog, and no native translation-quality approval is claimed.

Native-speaker review: **0/105**. Production-qualified by native review: **0/105**.

## Vercel firewall enforcement posture

The Vercel firewall enforcement posture is **not verified as enforcement**. What was recorded on 2026-11-18: `firewallEnabled=true`; CRS rules active but `log` only; Bot Protection active but `log` only; IP allow/deny rules list empty; 60 requests per source IP per fixed 60-second window; no anomalies for the default last-24-hour window. Log-only rules are not a denial posture and are not presented as an enforcement certification. A WAF claim requires a settings read on the live project plus an observed blocking test.

## Buyer-owned or separately contracted residuals

| Residual | Status | Boundary |
|---|---|---|
| Android/iOS native signed builds and store publication | REMAINING_BUYER | Buyer signing keys, store accounts, device QA, submission and publication |
| Native-speaker translation review | REMAINING_BUYER | 0/105 reviewed and 0/105 production-qualified |
| Licensed maps and road-routing | REMAINING_BUYER | Provider license, credentials, attribution, quotas, billing |
| Buyer identity/messaging/telephony/payment integrations | REMAINING_BUYER | Buyer-owned provider contracts, accounts, secrets, live acceptance |
| Buyer environment provisioning and operations | REMAINING_BUYER | Install, migration, data import, backup/RPO/RTO, monitoring |

## Certification boundary

CI results, test reports, dependency audits, CycloneDX SBOM, archive SHA-256, GitHub source identity, Sigstore signature/verification and isolated PostgreSQL/RLS/tenant reports are internal technical attestations. They are not ISO 27001, SOC 2, PCI DSS or any third-party certification. No external certification is self-issued, implied, or purchasable by assertion.

## Legal and distribution boundary

The package remains `UNLICENSED`. `NO_LICENSE_GRANT_NOTICE.txt` stays controlling: **no license grant** — no use, installation, running, copying, modification, hosting, distribution, resale, sublicensing or commercial exploitation rights exist until the rights holder and a named buyer execute a License Schedule bound to the exact source commit and/or package SHA-256.

## Commercial page boundary

These paths are currently absent on the live domain and are open gates: `/terms`, `/privacy`, `/refund`, `/pricing`, `/legal`, `/security`. Publishing them requires owner-supplied legal entity data, jurisdiction, contact channel, data-handling and processor details, refund policy, price/currency/tax, and licence/IP limits. No text is invented and no generic placeholder page is published in place of an approved one.

## Closeout decision

**OPEN.** The project is not closed. Open gates: three red CI checks on PR #401; PR #401 scope and content alignment; production identity divergence between `main` and the deployed commit; the `CERTIFIED` / `NOT_CERTIFIED` proof disagreement; six missing commercial/legal pages; absence of periodic backup plus a full restore test; unverified WAF posture. Buyer-side items remain separately contracted.

 
## Latest measured full-site closeout update — 2026-11-23 (supersedes earlier status above)

**Evidence cut:** `main` = `5e3cb211b7660002418757612033ff8928f25b69`. PR #401 is merged (`5e3cb211...`, 2026-11-23 07:10:33 UTC). The former statement that PR #401 was open or had failing checks is historical and no longer current.

### CI and database-test accounting

| Run / evidence | Result | Exact interpretation |
|---|---|---|
| OpsCore CI `45129195704` | SUCCESS | Backend release runner: 990 total, 987 passed, 0 failed, 3 skipped; runner status remains `PASS_WITH_SKIPS` |
| Vercel/source + PostgreSQL workflow `45129195834` | SUCCESS | Same commit; isolated PostgreSQL 18 acceptance job passed |
| PostgreSQL HTTP commercial acceptance | PASS | 1/1, 0 skipped |
| PostgreSQL firewall shared rate limiter | PASS | 1/1, 0 skipped |
| Tenant isolation matrix | PASS | 2/2, 0 skipped; source-derived route matrix: 346 routes |
| Disposable logical restore drill | PASS | 137 tables; CI-only, not Neon Production PITR |

The three database-gated files skipped by the generic release-test runner (`firewall-rate-limit-postgres.test.js`, `postgres-commercial-acceptance-http.test.js`, `tenant-isolation-matrix.test.js`) were each run separately in the same-commit isolated PostgreSQL 18 workflow and passed with zero skips. This closes the **coverage gap** for those tests in the combined workflow, but it does not change the generic runner's recorded status from `PASS_WITH_SKIPS` to `PASS`.

### Vercel Production identity and proof semantics

- Project: `opscore-platform` (`prj_8jMqBt0l6OALicWSwQ3ECQTn8yPe`); verified domain: `opscore-platform.vercel.app`.
- Latest Production deployment read: `dpl_FVXwPoqefvkNsxA3BqVrxYnxRQka`, source `cli`, source commit `88df9046ea5d57b392530565bc8cf6a10627ac4a`.
- A deployment search for current `main` SHA `5e3cb211b7660002418757612033ff8928f25b69` returned **zero Production deployments**.
- Workflow run `45129195834` was a `push` event. Its source and PostgreSQL acceptance jobs passed, but the Production `deploy` job was skipped. The release path is explicitly gated behind `workflow_dispatch` with `run_mode=AUTHORIZE_PRODUCTION_RELEASE`; a successful push workflow is not a deployment.
- The Production environment variables are encrypted. The connected read path did not return their plaintext values; no value is inferred or reproduced here.
- Source review found that `release-proof.js` reads the text value `OPSC_PRODUCTION_ISOLATION_CERTIFICATION=CERTIFIED`, while the production evidence readers pin to `OPSC_PRODUCTION_PROBE_DEPLOYMENT_ID`. The deployment workflow first creates a held probe deployment and collects evidence against that ID, then later builds a separate staged deployment for promotion. The current source path does not prove that the probe evidence is bound to the final promoted deployment ID. This is a real release-proof design gap; it must be corrected before `CERTIFIED` or `releaseVerified` can be accepted as proof of the final live deployment.
- `/api/verify/database-security` uses a catalog-only scope and correctly reports `NOT_CERTIFIED` for behavioral production isolation. `/api/verify/release` evaluates a broader behavioral scope. The shared property name `productionIsolationCertification` obscures this scope difference and must be made unambiguous; neither endpoint alone establishes same-final-deployment certification.
- The six legal/commercial paths were reported HTTP 404 in the owner-supplied probe. They were not independently re-probed in this session. No placeholder legal copy is published.

### Current Vercel firewall and runtime observations

- Firewall enabled.
- Active managed CRS categories `gen`, `rce`, `sqli`, `xss` are configured as `log`, not `deny`.
- Bot protection is active in `log` mode.
- IP allow/deny list is empty.
- The authentication edge rate-limit rule is active: POST `/api/v1/auth/(login|mobile-login)`, 60 requests per source IP per fixed 60-second window.
- Active attack status returned no anomalies. This is not proof of WAF blocking effectiveness.
- Last-7-day runtime diagnostics returned 34 PostgreSQL SSL-mode warning events (last seen 2026-11-20) and 12 `PRODUCTION_HOLD_ACTIVE` events (last seen 2026-11-16). These are observed log groups, not evidence of current request failure; the SSL-mode warning should be reconciled with the production connection string without exposing credentials.

### Neon Production and recovery evidence

| Item | Current measured value |
|---|---|
| Project / plan | `summer-leaf-18448271` / Free (`free_v3`) |
| Engine / history | PostgreSQL 18 / 21,600 seconds (6 hours) |
| Primary branch | `br-proud-salad-bcshhdap`, `protected=false` |
| Manual snapshot | One: `snap-aged-thunder-bcsxc1a5` (2026-11-19) |
| Automatic snapshot schedule | Empty |
| Primary migration ledger | 70 rows, latest `071_signed_rls_context_all_access_modes.sql` |
| Restored branches | `br-calm-poetry-bc7l7wik` and `br-orange-union-bc90bp8r`, both from `snap-aged-thunder` |

A new read-only comparison computed SHA-256 row-content digests for all 136 public base tables on the two independent restore branches: **136/136 matched, zero mismatches**. This verifies repeatable restoration from the same historical snapshot; it does not establish parity with the current Primary.

Primary versus either restore branch differs in seven table row counts: `schema_migrations` 70/68, `organizations` 100/16, `users` 100/16, `activity_log` 131/17, `integration_outbox` 131/17, `audit_log` 173/54, and `login_throttle` 3/2. The restore branches' latest relevant `created_at` values are 2026-11-19, while Primary contains rows through 2026-11-23. This is consistent with point-in-time divergence and is **not evidence of corruption**; it is also not a current-data parity pass.

The attempt to protect the Primary branch was rejected by Neon because the current plan has reached its protected-branch limit. No branch was unprotected and no plan was upgraded. Neon Free supports one manual snapshot and does not include scheduled backup schedules; the existing snapshot is preserved. The six-hour history window is not a long-term backup schedule or a zero-loss guarantee. No new snapshot was created because the one-snapshot limit is already occupied.

### Remaining hard gates

1. **Production release:** current `main` is not deployed. The workflow must be manually dispatched with the required owner-selected release mode after the final-deployment evidence-binding design is corrected and validated.
2. **Certification semantics:** remove reliance on a free-standing `CERTIFIED` text flag; make all production evidence refer to the exact final promoted deployment ID, and give catalog-only and behavioral proof fields distinct names/scopes.
3. **Legal pages:** owner-supplied legal entity, jurisdiction, contact, privacy/data practices, processor/subprocessor list, retention, refund/cancellation policy, price, currency, tax treatment, and license/IP limits are required.
4. **Credential rotation:** historically exposed GitHub PAT, Vercel token, and Neon API key remain unconfirmed as revoked. Available connected actions cannot revoke these account-level credentials. Revoke them in their provider consoles, create replacements, and update only the corresponding GitHub Actions secrets. Never paste token values into chat.
5. **Backup strategy:** current Free plan has no scheduled snapshots and only one manual snapshot. With paid upgrades excluded, an owner-approved external backup destination and restore procedure are required; no external destination is currently evidenced.
6. **Firewall enforcement:** managed CRS and Bot Protection remain log-only. Do not claim WAF enforcement until an approved blocking policy and observed blocking test pass.
7. **Release package:** the prior Secure Release artifact was built on `fbc4a308...`, not the current evidence-cut `5e3cb211...`; regenerate and verify the package, SBOM, signature and hashes on the exact current main before buyer handoff.
8. **License and external certification:** repository remains `UNLICENSED`; no license grant exists. No independent ISO 27001, SOC 2, PCI DSS or other external certificate is evidenced.

**Decision: OPEN — not commercially closed, not production-certified, and not authorized for distribution.**


Official Neon plan and backup references: [Neon plans — snapshots and Free limits](https://neon.com/docs/introduction/plans) and [Neon Backup & Restore](https://neon.com/docs/guides/backup-restore). The plan page states one manual snapshot on Free and that automated backup schedules are available on paid plans; the six-hour history window is the Free instant-restore allowance.


### Exact proof-binding reproduction — Production run 45116314003

The successful historical Production run exposes the exact identity split:
- Held candidate probe: `dpl_7PcZ9ym1nc1vEJqPssYioPLEBJd6`.
- Final staged deployment promoted to the public domain: `dpl_FVXwPoqefvkNsxA3BqVrxYnxRQka`.
- The 67-route, 358-route, session-isolation, recovery-point and native PITR evidence was collected against the candidate ID; the final staged deployment has a different ID.

PR #403 (`fix(release-proof): bind certification to the running deployment`) is open and unmerged. Its latest `OpsCore CI` verify job passed; `release-proof.test.js` passed 18/18, `production-candidate-environment.test.js` passed 9/9, and the full backend runner recorded 990 total / 987 passed / 0 failed / 3 skipped (`PASS_WITH_SKIPS`). CodeQL and all three Analyze checks passed. The separate `vercel-deploy` PR workflow run `45131203007` was cancelled with zero jobs, so the isolated PostgreSQL 18 job has not been re-run on this PR head. PR #403 is blocked with no submitted reviews; no approval or merge bypass was created. It changes the public proof to compare all production evidence with the runtime `VERCEL_DEPLOYMENT_ID`, ignores the legacy text flag, and stops publishing that flag as `CERTIFIED`. This is intentionally fail-closed: the existing two-deployment workflow will not promote until a deployment-ID-keyed signed evidence store or equivalent same-deployment workflow is implemented and tested.


A read-only Neon schema inspection found no system-level deployment-attestation table. The existing `public.evidence_uploads` / `evidence_upload_chunks` tables are tenant/work-order scoped (organization and work-order foreign keys) and are not a safe substitute for a global signed Production deployment attestation store. A new narrowly scoped attestation store, writer identity, signature verification and RLS/grant design are required; no Production schema change was made.


Restore-artifact preservation: branch `br-orange-union-bc90bp8r` had an automatic expiry of 2026-11-29. On 2026-11-23 its expiry was set to `null` and re-read as no expiry, preserving the second independent restore proof branch. No branch or snapshot was deleted.


### Language and mobile buyer-readiness boundary

The current selectable language catalog remains 105 locales: 1 English source, 100 machine-assisted drafts, and 4 English fallbacks; 9 withdrawn codes are excluded. The historical qualification register has 114 rows but is not the current selectable catalog. Native-speaker review is 0/105 and production qualification by native review is 0/105. No native-language approval or production-quality claim is made. Android/iOS signed builds, physical-device QA, store signing keys/accounts, submission and publication remain buyer-side or separately contracted work.


Reproducible table-content manifest roots (SHA-256 over sorted per-table SHA-256 digests, 136 public base tables):
- Both restore branches: `6f1af6f95f242e12d66e409d8c0d72b8c57132d99a629dd1085e8e61e57817b2` (exact match).
- Current Primary: `a4e9293bc9fa1628182c6e9b26fbfe1084c7781d5697c58a1ade6ec0f1266242` (different, as expected for newer data).
These are read-only diagnostic content manifests, not signed backup attestations or proof that the historical snapshot contains current Primary data.
