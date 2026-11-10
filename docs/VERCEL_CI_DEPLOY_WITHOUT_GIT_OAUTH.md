# Vercel production deploy without Git OAuth (no Pro required for reconnect)

## Problem
Vercel **Git integration** may fail (`git_clone_failed`) or refuse reconnect when:
- Hobby team + Git **organization/group** repository limits apply
- OAuth credentials for GitLab are stale
- Commercial reconnect is gated behind paid team features

Official Vercel limits: Hobby cannot connect Git **organization** repos the same way as Pro. Hobby is also **non-commercial** by fair use (buyer residual for paid hosting).

## Root solution (documented by Vercel)
Use **GitLab CI + Vercel CLI** instead of Git webhooks:

1. CI variables (already set): `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
2. Job `deploy-production` on `main` after `commercial-closure`:
   - `vercel pull --environment=production`
   - `vercel build --prod`
   - `vercel deploy --prebuilt --prod` with commit/pipeline/package metadata

References:
- https://vercel.com/docs/git/vercel-for-gitlab (Using GitLab Pipelines)
- https://vercel.com/kb/guide/how-can-i-use-gitlab-pipelines-with-vercel
- https://vercel.com/guides/how-can-i-use-gitlab-pipelines-with-vercel

Git OAuth reconnect is **optional**. CLI deploy is the supported path for automation without Git integration.
