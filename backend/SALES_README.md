# OpsCore v0.11.62 — Sales Package

**Seller offer:** May be advertised, listed, presented and negotiated before a buyer is identified. A buyer signature is not required to publish or market the offer; buyer rights and delivery remain withheld until a transaction-specific License Schedule is executed.

OpsCore is a reusable multi-sector source-code operational kit, not a hosted SaaS subscription. It includes web/API source, operational workflows, Contact Center runtime and Expo Android/iOS source.

## Verified source scope
- Work orders, scheduling/dispatch, offline sync, evidence, audit and completion workflows.
- Multi-tenant authorization, auth/session controls, PostgreSQL migrations and RLS controls.
- Contact Center locale runtime with 114 selectable codes and a visible AI/machine-translation notice.
- Expo mobile source 0.1.16 and source-level verification.
- Release scripts, tests, evidence generation and SHA-256 manifests.

## Mobile security status

Current source baseline: Expo SDK 58.0.23 / React Native 0.88.1 / React 19.3.0. Dependency findings must be read from the full mobile audit JSON produced by the exact archive-producing pipeline; historical run IDs and audit counts are not current evidence. The archive includes Expo source only, not signed native binaries or physical-device acceptance.

## Runtime dependency security
The PostgreSQL runtime driver pg 8.23.1 is pinned in the repository root lockfile; the baseline root audit reported 0 findings. The exact archive pipeline includes the full root-dependency-audit.json.

## Customer responsibilities
External provider accounts, licenses, credentials and live tests (including call-center/telephony), map/road-routing provider licenses and keys, Android/iOS EAS setup, signing, native builds, physical-device QA, store accounts/submission/distribution, and post-handover maintenance.

## Production honesty
Source CI and isolated database tests are not production certification. Seller-reference Production isolation is NOT_VERIFIED for the current source tip pending fresh commit- and Neon-branch-bound probes. Buyer-environment production acceptance remains separate and NOT_ESTABLISHED.
