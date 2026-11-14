# Delivery Manifest — OpsCore v0.11.62

- Verified candidate branch: `main`.
- Verified live source commit: `4ef126ccd59f23cebeead30224d1bcf7199535ab`.
- Bound production pipeline: `43588278472`.
- Production deployment: `dpl_5nx3dRRu9WuYmpqR9deiSeCqHwF3`.
- Delivery type: commercial source-code package (backend/API, web source, PostgreSQL migrations/RLS assets and Expo mobile source).
- Commercial class: `PASS_WITH_BUYER_RESIDUALS` for this exact candidate only.
- Seller-reference `productionIsolationCertification`: **CERTIFIED** (live gates; buyer environment remains separately accepted).
- Seller-reference session/recovery gates: `PASS_PRODUCTION` / `PASS_PRODUCTION`.
- Signed Android/iOS store binaries are not included. The package contains mobile source and lockfiles.
- Translation native-speaker review remains buyer-owned (structural locale resources ≠ linguistic qualification).
- Seller-owned scope: fixable source, migration, security, packaging, test and pre-handover dependency defects on the bound candidate.
- Buyer-owned scope: external provider accounts/licenses/credentials and live acceptance, licensed maps, native mobile builds/signing/store publication, native-speaker linguistic review and target-environment acceptance.

## Mandatory handover checks

1. Confirm archive/commit/pipeline identity matches the purchase record.
2. Run buyer preflight and acceptance in the buyer environment.
3. Record accepted residuals explicitly (mobile store, translations, maps/providers).
4. Do not reuse fingerprints from older commits as proof of the current candidate.
