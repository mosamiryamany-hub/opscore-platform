# OpsCore Buyer Residuals (Explicit)

These items remain the buyer’s responsibility and are **not** certified by this release.

## 1. Mobile store signing and publication
- Android / iOS / Huawei store accounts, signing keys, EAS/CI secrets
- Store listing assets, privacy questionnaires, age ratings
- Device and store review cycles

## 2. Human language review
- Machine-assisted language resources may be present in source
- Buyer must perform native-speaker review before claiming localized production readiness
- No claim of completed human review for all languages is made by this package

## 3. Maps and street data licenses
- Map tile / geocoding / routing provider accounts and commercial licenses
- API keys, quota, and regional compliance terms
- OpsCore does not ship provider credentials

## 4. Hosting, secrets, and operational ownership
- Production secrets rotation after handover
- Backup/restore drills in the buyer environment
- Monitoring, incident response, and data-processing agreements with end customers

## Certification boundary
- `productionCertification`: false unless separately evidenced
- `PRODUCTION_HOLD` remains the server-side fail-closed gate until bound release evidence is published
