# OpsCore v0.11.62 — Seller Sales Kit

> **OFFER OPEN FOR MARKETING AND NEGOTIATION — NO LICENSE GRANT UNTIL A BUYER-SPECIFIC SCHEDULE IS EXECUTED.** This material describes the seller's offer; it does not itself grant software rights or authorize buyer delivery.

## Product

OpsCore is a multi-sector operations source package with a web console, HTTP API, work-order and dispatch workflows, Contact Center runtime, authentication/session/tenant controls, PostgreSQL migrations and RLS, and Expo Android/iOS source.

## Release identity and evidence

A candidate's source commit, workflow run, artifact ID, archive filename, byte count, SHA-256, SBOM, and provenance attestation must all come from one successful exact-head GitHub Actions Secure Release run. Use only that run's output. A new source change invalidates the prior package identity. Never copy historical IDs, test counts, dependency reports, Preview URLs, or digests into a newer candidate.

The exact-run mobile and root dependency-audit JSON files are authoritative for their respective build. Do not claim "vulnerability-free"; disclose every severity category from the matching reports. PostgreSQL HTTP acceptance is current only when its source commit and workflow run match the archive-producing run.

## Included source

Backend/API and web operations source; work orders, scheduling and dispatch; Contact Center runtime and locale resources; authentication and tenant controls; PostgreSQL migrations and RLS; Expo mobile source; tests, scripts, release tooling, documentation and CI evidence.

Contact Center interface catalogue: 114 selectable locale options (1 English source, 100 machine-assisted drafts, 13 explicit English fallbacks), with 89 keys per locale. Of these, 105 remain enabled as conversation-language targets; 9 historically withheld codes (ms, sw, hy, uz, my, ml, es, sr, te) are listed only as English-fallback interface choices and are disabled for conversations until remediation and acceptance. Native-speaker review and production language qualification remain 0/114. Keep the machine-draft and explicit English-fallback notices visible.

## Seller operational residuals

Neon remains on Free: the Production branch is unprotected, no automatic snapshot schedule exists, and the current plan blocked branch protection, schedule creation and an additional manual snapshot. Vercel remains on Hobby: firewall is enabled, login rate limiting is active, but Generic/RCE/SQLi/XSS and Bot Protection rules are log-only; OWASP CRS enforcement was rejected under the current entitlement. These limits prevent a blanket backup/edge-security SLA claim until plans and controls are upgraded and retested.

## Buyer/environment residuals

External provider accounts/licenses/credentials/live acceptance (including identity, messaging, call-center and telephony); maps/road-routing provider license, keys, attribution and quotas; Android/iOS EAS setup, signing, native builds, physical-device QA, developer accounts and store publication; native-speaker translation review; buyer-environment installation, database migration/isolation, restore and operational acceptance; post-handover dependency maintenance.

## Seller-owned scope

Source correctness, internal adapters, authorization, database migrations, RLS, test failures, package integrity, release evidence, documentation, and fixable pre-handover source/dependency defects.

## Technical truth

Current evidence cut (2026-11-22): Production release workflow run 45013074938 passed and promoted deployment dpl_G7r6CDntYarpafuawie8CKWDLBB7 on source commit 2a4938a70220d3375497e94499850476b4b505de to opscore-platform.vercel.app. The workflow qualified the exact release evidence as production isolation CERTIFIED. Evidence includes 67/67 signed-tenant candidate routes; 358/358 PostgreSQL HTTP route probes; 3/3 explicit authenticated tenant flows with cross-tenant denial and cleanup; full-data recovery-point v4 and native PITR v2 covering 136 public tables with SHA-256 parity and zero mismatches; plus staged runtime/database/TLS/domain gates. The 67/358/3 behavioral tests are bound to candidate deployment dpl_FgDTqKJxCDw3SAGLtgPxqfQHGu7v, not a separate rerun against the final promoted deployment ID. This is internal scope-bound evidence, not ISO/SOC 2/PCI or other third-party certification; it does not certify buyer environments, every business flow, scheduled backup coverage, or contractual RPO/RTO.

## Commercial offer and rights

The seller may advertise, present and negotiate this source-code offer before any buyer is known. Price and transaction terms are agreed privately. A named buyer is not required to publish this sales kit.

No license or use/distribution right is granted by this sales kit. Before buyer installation, execution, modification, hosting, resale, sublicensing or delivery, both the rights holder and named buyer must execute a License Schedule that pins the exact deliverable and states the permitted rights. All ungranted rights remain reserved.

## Public asking floors — USD

These seller minimums are published now to support marketing and buyer discovery. They are not buyer-specific signed quotes, and no buyer is required to be identified or to sign before the offer is advertised.

| Tier | Rights offered | Published minimum asking price |
|---|---|---:|
| **L1** | Use only — non-exclusive | **$45,000 USD** |
| **L2** | Use + modify + redistribute — non-exclusive | **$85,000 USD** |
| **L3** | Exclusive rights and/or IP assignment, only as precisely scheduled | **$175,000 USD** |

The applicable floor is the minimum starting point for that tier. The final fee, exact deliverable, scope, territory, distribution forms, payment milestones, support, exclusions and transfer terms must be written into a buyer-specific License Schedule. Do not infer that L3 transfers third-party components, trademarks, cloud accounts, customer data or provider contracts.

The published floors exclude buyer-owned residuals listed above: mobile store signing and release, native-speaker language review, licensed maps/road-routing, buyer provider credentials and buyer-environment acceptance. No delivery or buyer use is authorized until the rights holder and named buyer execute the Schedule.

No technical test, deployment, archive, checksum, SBOM or attestation creates or implies a license.
