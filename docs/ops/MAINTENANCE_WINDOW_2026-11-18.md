# Production maintenance window — chosen schedule

| Field | Value |
|---|---|
| **Local date** | Wednesday, 18 November 2026 |
| **Timezone** | Africa/Cairo (EET, UTC+2) |
| **Start** | **02:00** |
| **End** | **04:00** |
| **Duration** | **120 minutes** |
| **Primary branch** | `br-proud-salad-bcshhdap` |
| **Pre-window snapshot** | `snap-floral-sea-bcug7fd3` (2026-11-17T10:08:56Z, source=primary) |
| **Live pin until window** | `4017497068defa9c1d0761fcb07bc746925e002a` (CERTIFIED seller surface) |

## Why this window

1. **02:00–04:00 Cairo** is typically the lowest interactive use for B2B field-ops SaaS in Egypt/MENA.  
2. **Mid-week** avoids Sunday/Thursday batch and weekend staffing gaps.  
3. **120 minutes** covers: pre-check → apply 063–067 on controlled path → smoke dual-tenant → go/no-go → rollback branch from snapshot if needed.  
4. Snapshot of **primary** already exists; do not start without it.

## In-window allowed work (ordered)

1. Confirm snapshot `snap-floral-sea-bcug7fd3` still listed.  
2. Apply signed-context migrations **only after** migration-branch verification PASS (see workflow `ops-signed-context-migration-branch`).  
3. Prefer: apply on a disposable branch from primary first; promote only if verifier + RLS probes PASS.  
4. Do **not** enable Production signed-route flags until a deployment matching `main` is live and evidence is re-collected.  
5. Abort and restore from snapshot if login or tenant isolation fails smoke tests.

## Explicit exclusions

- No Neon/Vercel plan upgrades in-window unless pre-approved.  
- No buyer mobile/store/maps work.  
- No claim of 67-route Production matrix until post-window evidence file exists.
