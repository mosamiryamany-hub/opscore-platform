# Manifest errata — OpsCore v0.11.62.1 package correction

## Scope

This package revision corrects internal evidence consistency without changing application runtime source intent.

## Corrections applied

1. `releaseTag` is set to `v0.11.62` in commercial release statement files (was `null` in the prior CI statement artifact).
2. `backend/RELEASE_FILE_SHA256SUMS.txt` and `backend/RELEASE_COMPONENT_SHA256SUMS.txt` were regenerated so that `docs/verification/POSTGRES_HTTP_ACCEPTANCE_RESULT.json` matches the file bytes included in the tree.
3. `INTEGRATED_SHA256SUMS.txt` was regenerated for the full tree after the above updates.

## What did not change in claim scope

- Commercial classification remains `PASS_WITH_BUYER_RESIDUALS`.
- `productionCertification` remains `false` for the package build record.
- Buyer residuals remain: mobile store signing, native-speaker review, licensed street maps, buyer secrets and hosting.

## Verification

After extract, from package root:

```
sha256sum -c INTEGRATED_SHA256SUMS.txt
cd backend && sha256sum -c RELEASE_FILE_SHA256SUMS.txt
```

Live deployment endpoints may still reference the prior CI package fingerprint until republished; treat **this archive's SHA-256** as the delivery identity for this revision.
