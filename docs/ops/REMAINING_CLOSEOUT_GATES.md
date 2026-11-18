# Current closeout gates — 2026-11-18

**Repository:** mosamiryamany-hub/opscore-platform  
**Current main:** 27d41476a115d81ddd3ad1b4f03025142a7e5be6  
**Decision:** seller-side source release remains **HOLD pending an exact-main Secure Release artifact and final handoff review**. This is not a buyer-acquisition hold.

## Completed seller engineering

| Item | Verified result |
|---|---|
| PR #232 — bytecode cleanup and required PostgreSQL check | Merged as 1054182e22bc0ef03e6f8cbc7655558ba09a31fd; the direct isolated PostgreSQL check is emitted on every PR while preserving the workflow path allowlist |
| PR #234 — migration 068 absent-role postcondition correction | Merged as 27d41476a115d81ddd3ad1b4f03025142a7e5be6; verify, Vercel contract and isolated PostgreSQL 18 acceptance passed on the exact PR head |
| Main OpsCore CI | Run [44203389751](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44203389751) — success on current main |
| Main Vercel contract and isolated PostgreSQL acceptance | Run [44203389724](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44203389724) — contract PASS; deploy-bound isolated PostgreSQL acceptance PASS; Production deploy SKIPPED |

## Current Production database facts — read-only inspection

The Neon Production project is summer-leaf-18448271, primary branch br-proud-salad-bcshhdap. The operational migration target is database opscore_acceptance; database neondb is empty and must not be represented as the populated application database.

| Measurement on opscore_acceptance | Current result |
|---|---:|
| schema_migrations rows | 68 |
| 063–067 and 069 ledger entries | Present |
| public.technician_location_trail | Exists; 0 rows |
| opscore_security.context_hmac_keys | Exists; 0 key rows |
| Public tables/relations | 136 |
| Public RLS-enabled tables | 135 |
| Public FORCE-RLS tables | 135 |
| Runtime access to HMAC key table | Denied to opscore_runtime; restricted definer can read it |

**Migration interpretation:** migrations 063–067 and 069 were committed to the Production opscore_acceptance ledger at approximately 2026-11-17 22:26 UTC. Earlier reporting that they were not applied is superseded. The historical workflow [44189975492](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44189975492) nevertheless ended in failure after the migration transactions because the then-current runner queried the intentionally absent opscore_app role. PR #234 corrected that source-level postcondition defect and passed isolated CI. The Production workflow has **not** been rerun after that fix; therefore the Production migration set is present, but a post-fix APPLIED_AND_VERIFIED Production attestation is still **not recorded**.

No HMAC key was written. The HMAC key table is empty, so signed tenant-context Production activation and the live signed-route proof remain unestablished. Schema and migration presence is not signature-activation proof.

## Neon recovery facts

- The only listed manual snapshot is snap-holy-salad-bcvyvzv9, taken from the Production Primary at 2026-11-17 21:47:40 UTC.
- Restore branch br-damp-surf-bciz4n1b reports restored_from=snap-holy-salad-bcvyvzv9, restore_status=restored, and restored_as=br-proud-salad-bcshhdap.
- That snapshot predates the 063–067/069 migration writes. Its schema difference from the current Primary is real and expected for those two points in time; it is not evidence that the restore came from a different snapshot.
- The failed proof run [44194616046](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44194616046) compared the pre-migration restore to the post-migration Primary and correctly refused to publish a matching-current-primary proof.
- The Primary snapshot schedule is empty. The Free project allows one snapshot and a new snapshot attempt returned SNAPSHOTS_LIMIT_EXCEEDED. The rotation workflow stopped at NON_PRIMARY_SNAPSHOT_DELETE_CONFIRMATION_REQUIRED. No snapshot was deleted.
- Do not delete the only retained snapshot without explicit owner authorization and a replacement/retention decision. A fresh restore proof for the current post-migration generation requires a snapshot of that generation first.

Neon currently reports Free plan, 6-hour history retention and a 1 GiB branch logical-size limit. These limits block a fresh current-generation backup/restore rehearsal; they do not prevent a source-code-only sale.

## Vercel and hosted Production boundary

The Vercel project read reports live=false, no custom domains, and the latest deployment has target=null. The current main contract workflow passed, but its deploy job was skipped. No Production deployment was made. Do not market this as a seller-hosted commercial SaaS or Production-certified service. Source-code sale is separate: a buyer provisions its own appropriately licensed hosting and domain.

## Mobile supply-chain advisory

The main dependency gate currently passes only because mobile/audit-allowlist.json contains a time-bounded documented-risk entry for GHSA-fc5q-39xc-vjpf through **2026-12-18**. This is not a package fix or a clean audit. PR #230 remains Draft and must not merge as a fix: its picomatch@4.0.7 override does not remediate the advisory affecting versions through 4.0.7. No independent signed seller-side risk acceptance is present in the evidence reviewed here.

## Remaining seller-owned gates

1. Produce the exact-main Secure Release ZIP, external release statement, SHA-256, SBOM, provenance and bundled test/audit/i18n evidence. No current-main package artifact was available during this update: the browser automation needed to dispatch Secure Release could not start because its wallet balance was -$0.12. No workflow run was created.
2. Have the authorized seller security/risk owner explicitly review and sign the residual picomatch risk decision before relying on the time-bounded allowlist for commercial release; do not describe it as fixed.
3. Update the proof contract/runner to distinguish the pre-063 snapshot generation from the current post-063–069 Primary generation; obtain a current-generation snapshot before a current-generation restore proof.
4. After the proof contract is correct and a valid current-generation restore is available, run the post-fix Production migration verification workflow in dry-run/verification mode first. Do not reapply already-present migration rows.
5. Keep HMAC key rotation, signed Production route activation, live 67-route session evidence, WAF enforcement changes, Production deployment and any snapshot deletion behind their own verified prerequisites and owner approvals.

## Buyer-owned residuals — not seller completion gates

- Android/iOS signing, native builds, physical-device acceptance and app-store submissions.
- Human/native-speaker translation review; language status remains 0/114 native-reviewed and 0/105 production-qualified.
- Buyer provider accounts, commercial map licenses, external telephony/SMS/WhatsApp/payment/email/object-storage/KMS/cloud credentials.
- Buyer-environment isolation and production certification, which must be measured on the buyer's own exact deployment/database.

## Commercial rule

Listing, presentation, demonstrations and negotiation may proceed before a buyer is identified. A named buyer and signed License Schedule are required only before granting that buyer licensed rights or delivering the licensed package. No license is granted by repository presence.