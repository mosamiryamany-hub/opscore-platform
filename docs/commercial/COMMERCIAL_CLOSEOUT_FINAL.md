# Seller-side commercial closeout — OpsCore v0.11.62

> **Decision: SELLER SOURCE-RELEASE HOLD pending a current-main Secure Release artifact and final risk/handoff review. This is not a buyer-acquisition hold.**
>
> A named buyer, buyer signature, payment, buyer-specific legal review or transaction License Schedule is **not** required to complete seller engineering, prepare a release package, publish/list the offer, present the product, demonstrate it or negotiate. A named buyer and signed License Schedule are required only before granting that buyer licensed rights or delivering the licensed package. No license is granted by repository presence.

**Updated:** 2026-11-18  
**Current main:** 27d41476a115d81ddd3ad1b4f03025142a7e5be6  
**Current product source:** Expo SDK 58.0.26 / React 19.3.1 / React Native 0.88.1; backend v0.11.62; mobile v0.1.16.

## 1. Current source/CI evidence

| Gate | Exact current result | Meaning |
|---|---|---|
| OpsCore CI | [Run 44203389751](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44203389751) — SUCCESS on main 27d41476… | Current-main source/verification CI passed; mobile audit gate passes under the time-bounded allowlist entry described below |
| Vercel contract | [Run 44203389724](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44203389724) — contract PASS | Bound isolated PostgreSQL 18 acceptance PASS; deploy step SKIPPED; no Production deployment |
| Required direct PostgreSQL check | [Run 44203166108](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44203166108) — PASS on PR #234 exact head before merge | Isolated PostgreSQL 18 RLS/HTTP acceptance; not Production certification |
| PR #232 | Merged as 1054182e… | Removed tracked Python bytecode and ensured required PostgreSQL acceptance check is emitted on every PR |
| PR #234 | Merged as 27d41476… | Fixed migration runner postconditions for the intentionally absent legacy opscore_app role; isolated CI passed before merge |

These results establish current-main CI and isolated acceptance, not seller-hosted Production readiness and not the existence of a distributable archive.

## 2. Mobile dependency advisory — unresolved, temporary exception only

The mobile lockfile includes transitive picomatch@4.0.7 and picomatch@2.3.2 paths through the Expo/Metro tooling graph. GHSA-fc5q-39xc-vjpf / CVE-2026-112366 remains unresolved for versions through 4.0.7 in the advisory and public package data. The PR #230 override to 4.0.7 does not fix this advisory and PR #230 is held as Draft.

The current mobile/audit-allowlist.json contains a time-limited documented-risk entry for this GHSA with maxAcceptedVersions.picomatch=4.0.7 and reviewBy=2026-12-18. Therefore main's audit gate can return PASS under that explicit exception. This is **not** a patched dependency, not a zero-vulnerability report, and not a formal signed risk acceptance. No authorized seller-side risk-owner signature was found in the reviewed evidence. This exception must be reviewed and either renewed by an authorized decision or removed before its expiry; the gate auto-reopens if a newer version appears, the registry check fails, or the review date passes.

Do not describe the advisory as fixed, false-positive, dev-only, or absent from production audit. Do not merge PR #230 as a remediation.

## 3. Secure Release artifact — not yet produced for current main

The current-main Secure Release workflow has not been run successfully for commit 27d41476a115d81ddd3ad1b4f03025142a7e5be6. Consequently there is no verified current-main ZIP, external commercial release statement, matching archive SHA-256, SBOM/provenance pair or exact-run package evidence available for handoff in this closeout.

A manual Secure Release dispatch was attempted through the signed-in workflow browser, but the automation did not start because its separate wallet balance was -$0.12. No workflow run was created. This is an execution-tool funding blocker, not a product-code test failure. Historical artifacts must not be reused as current-main delivery evidence.

The qualified package gate remains open until one exact-main Secure Release run completes, creates the ZIP and external statement, produces SBOM/provenance/test/audit/i18n evidence, and the resulting archive is reviewed for secrets, customer data, local state and unintended files.

## 4. Production database and recovery — separate hosted-service track

Production target database is opscore_acceptance on Neon project summer-leaf-18448271, primary branch br-proud-salad-bcshhdap. The database neondb on the same branch is empty and is not the operational schema target.

Read-only database measurements on 2026-11-18:
- Migration ledger: 68 rows; 063–067 and 069 are present.
- public.technician_location_trail: exists, 0 rows.
- opscore_security.context_hmac_keys: exists, 0 key rows.
- Public relations/tables: 136; RLS enabled on 135; FORCE RLS on 135.

The historical Production migration workflow [44189975492](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44189975492) failed after the migration transactions because the old runner's postcondition query did not handle the deliberately absent opscore_app role. The six migration ledger entries are present. PR #234 fixed that runner contradiction and passed isolated PostgreSQL tests, but the Production workflow has not been rerun after the fix. Treat schema migration presence as confirmed and the post-fix Production APPLIED_AND_VERIFIED attestation as missing. Do not re-run or reapply migrations already present.

The only listed manual snapshot snap-holy-salad-bcvyvzv9 was taken before those migration writes. Restore branch br-damp-surf-bciz4n1b has matching Neon restore provenance for that snapshot; its older schema mismatch against the current Primary is expected because Primary advanced after the snapshot. The current proof run [44194616046](https://github.com/mosamiryamany-hub/opscore-platform/actions/runs/44194616046) correctly failed parity. The project has one snapshot limit on Free, the automatic snapshot schedule is empty, and a new snapshot request was refused with SNAPSHOTS_LIMIT_EXCEEDED; no snapshot was deleted. A current-generation restore proof requires a new snapshot of the current Primary generation and must not be manufactured from the old restore branch.

No Production HMAC key was written, the key table has 0 rows, the 67-route signed-session matrix is not established, and Production certification remains NOT_ESTABLISHED. Current Vercel reports live=false, no domains and latest deployment target null; the deploy job was skipped. This is not seller-hosted commercial SaaS.

## 5. Commercial status — buyer-independent

- Seller may advertise, list, present, demonstrate and negotiate the source-code offer before identifying a buyer, provided current residual disclosures are included.
- No buyer signature, payment or License Schedule is a seller-side engineering/marketing prerequisite.
- No qualified current-main download is issued until the Secure Release artifact and exact-run evidence exist and receive final review.
- A named buyer's License Schedule is executed at transaction close, before granting use/modify/distribute rights or making licensed delivery. The Schedule pins the exact source commit and archive SHA-256.
- The source-code offer is not a hosted SaaS subscription; the buyer provisions its own hosting, provider accounts and domain. No seller Vercel/Neon paid-plan upgrade is required solely to sell source code.

## 6. Buyer residuals

Buyer-owned: mobile EAS signing/native builds/device QA/store publication; external provider accounts and commercial licenses; licensed maps/routing; native-speaker translation review; and validation/certification in the buyer's own exact environment.

Current language truth: 105 selectable runtime locales (1 English source, 100 machine-assisted drafts, 4 English fallback locales); nine flagged locales are withdrawn. Native-speaker review is 0/114 and production qualification is 0/105. Do not market “114 languages certified”.

## Final decision

**SELLER SOURCE-RELEASE HOLD. LISTING / PRESENTATION / NEGOTIATION MAY PROCEED WITH DISCLOSURE. DO NOT ISSUE A QUALIFIED DOWNLOAD OR CLAIM PRODUCTION CERTIFICATION.**

This hold is based on missing current-main Secure Release package evidence and unresolved Production/recovery attestations, not on the absence of a buyer.