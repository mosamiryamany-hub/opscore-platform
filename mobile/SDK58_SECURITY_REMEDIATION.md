# Mobile SDK 58 Security Remediation

Status: dependency graph regeneration pending CI execution.

## Current requested target
- Expo SDK: 58
- React Native: 0.88
- React: 19.3
- Expo modules: SDK 58-compatible versions pinned in `package.json`
- `node-forge`: 1.4.3
- Zod: 4.6.7

## Required evidence before promotion
1. Clean, reproducible `npm ci` from the committed lockfile.
2. Expo dependency alignment and Expo Doctor.
3. The project-specific `npm run verify` suite.
4. Expo exports for Android, iOS, and web.
5. A fresh npm audit with zero vulnerabilities.
6. Review generated lockfile diff and native configuration compatibility.
7. Signed EAS builds and physical-device acceptance remain separate gates.

The maintenance automation may commit only `mobile/package.json`, `mobile/package-lock.json`, and `mobile/mobile-dependency-audit.json` to this maintenance branch. It does not push to `main`.
