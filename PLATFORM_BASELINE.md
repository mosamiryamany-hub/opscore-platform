# Platform baseline — GitHub / Neon / Vercel

This repository was initialized from the commercial source package:

- Package revision: `0.11.62.5` (integrity and packaging reissue of OpsCore `v0.11.62`)
- Outer ZIP SHA-256: `fe5f8c80439124d23a911932fbc97ec925f91b78ac5b92683d0b29d09ac2786a`
- OPSCORE.zip SHA-256: `ffb947e8a102b9a520079e7c503f84f8d63b65722416b317e0ecc1b5bb8b924a`
- Source lineage commit (prior GitLab): `5c60420f42330d7bd79623547b07eee96ef0ebd77214e9996cf53dd2d997a7e7`
- Prior pipeline (historical): `3017246123`

## New platform targets

| Layer | Target |
|-------|--------|
| Source control | GitHub private repository `opscore-platform` |
| Database | Neon PostgreSQL 18 project `opscore-production` |
| Hosting | Vercel project `opscore-platform` |
| CI | GitHub Actions (existing workflows under `.github/workflows`) |

## Historical artifacts

- `.gitlab-ci.yml` is retained as historical CI definition only; active CI is GitHub Actions.
- Prior GitLab/Vercel/Neon URLs in commercial evidence docs describe the previous delivery environment and are not the live targets for this repository.

## Production gate

Do not treat this baseline as production-certified until GitHub Actions, Neon migrations/RLS acceptance, and Vercel deployment verification pass on the same commit.
