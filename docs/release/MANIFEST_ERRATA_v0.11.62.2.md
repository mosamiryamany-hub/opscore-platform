# Manifest errata — OpsCore package revision 0.11.62.2

## Corrections in 0.11.62.2

1. Regenerated `backend/docs/verification/*.sha256` sidecars so embedded digests match current JSON bytes.
2. Clarified behavioral acceptance evidence fields: the CI package fingerprint at acceptance time is stored as
   `evidenceBoundCiPackageSha256` (not as the current delivery archive fingerprint).
3. Regenerated `INTEGRATED_SHA256SUMS.txt` and backend secondary manifests after these evidence updates.

## Unchanged

- Source commit lineage: `5c60420f42330d7bd79623547b07eee96ef0ebd77214e9996cf53dd2d997a7e7`
- Pipeline: `3017246123`
- `productionCertification`: false
- Commercial status: PASS_WITH_BUYER_RESIDUALS
- Buyer residuals: store signing, native-speaker review, map licenses, buyer secrets/hosting
