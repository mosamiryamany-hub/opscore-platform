# Mobile Build / Release Contract

The mobile package includes `eas.json` with development, preview/internal, and production build profiles.

## Current evidence

- Mobile source contract: PASS.
- EAS build configuration: PRESENT.
- Signed Android artifact: UNVERIFIED.
- Signed iOS artifact: UNVERIFIED.
- Physical-device certification: UNVERIFIED.
- `mobile/package-lock.json`: NOT INCLUDED because lockfile generation could not be completed in the isolated/offline execution environment. This is intentionally not represented as reproducible-install certification.

## Release procedure

In a networked release environment, generate and commit `mobile/package-lock.json`, then use `npm ci`, run `npm run verify`, build Android/iOS through the chosen EAS profiles, record build identifiers, and perform physical-device acceptance tests.

No signed artifact or store certification is claimed by the presence of `eas.json` alone.
