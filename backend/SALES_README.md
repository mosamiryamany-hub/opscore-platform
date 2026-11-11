# OpsCore v0.11.62 — Sales Package

OpsCore is a reusable multi-sector source-code operational kit, not a hosted SaaS subscription. It includes web/API source, operational workflows, Contact Center runtime and Expo Android/iOS source.

## Verified source scope
- Work orders, scheduling/dispatch, offline sync, evidence, audit and completion workflows.
- Multi-tenant authorization, auth/session controls, PostgreSQL migrations and RLS controls.
- Contact Center locale runtime with 114 selectable codes and a visible AI/machine-translation notice.
- Expo mobile source 0.1.16 and source-level verification.
- Release scripts, tests, evidence generation and SHA-256 manifests.

## Mobile security status

Current source baseline: Expo SDK 58.0.23 / React Native 0.88.1 / React 19.3.0. Secure Release run 42949619029 recorded zero npm audit findings across all severities for the exact locked tree. This is a point-in-time dependency report, not a future guarantee. The archive includes Expo source only, not signed native binaries or physical-device acceptance.

## Runtime dependency security
The PostgreSQL runtime driver pg 8.23.1 is pinned in the repository root lockfile; the baseline root audit reported 0 findings. The exact archive pipeline includes the full root-dependency-audit.json.

## Customer responsibilities
External provider accounts, licenses, credentials and live tests (including call-center/telephony), map/road-routing provider licenses and keys, Android/iOS EAS setup, signing, native builds, physical-device QA, store accounts/submission/distribution, and post-handover maintenance.

## Production honesty
Source CI and isolated database tests are not production certification. The Vercel production deployment is identified to the exact GitHub main commit and is READY. Production acceptance beyond the verified health endpoint and production-wide isolation certification remain NOT_VERIFIED / NOT_CERTIFIED.
