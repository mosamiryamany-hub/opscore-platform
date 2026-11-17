# Remaining closeout gates (2026-11-17 evening)

## Closed this cycle

| Gate | Evidence |
|---|---|
| Neon maintenance fail-closed | PR **#213** merged → `f662312a…` |
| Guarded signed-context migration runner | PR **#212** merged → `e891fc6e…` |
| Primary manual snapshot | `snap-floral-sea-bcug7fd3` (source=primary) |
| Seller live dual-tenant session isolation | CERTIFIED on pin `4017497068defa9c1d0761fcb07bc746925e002a` |
| Manifest / CI 67-route suite | Proven in isolated CI (not Production HTTP matrix) |

## Still open (honest)

| Gate | Blocker |
|---|---|
| Apply 063–067 / 069 on **primary** | Maintenance window only; require restore drill from primary snapshot first |
| Production HMAC + signed route flags | Keys/env Production not configured; Preview-only today |
| 67-route **Production** HTTP evidence | Depends on schema + flags + matching deploy |
| Neon primary **protected** + scheduled backups | Plan limit (protect/schedule need paid tier) |
| Vercel **commercial** plan + custom domain | Billing / Hobby commercial terms |
| WAF log → challenge/deny on auth | After log review in Console |
| Buyer residuals | Mobile store · human i18n · licensed maps |

## Seller commercial posture (no contradiction)

- **Runtime pin** `4017497…` remains the sellable, CERTIFIED isolation surface until a **new** production deploy re-collects evidence.
- **Git `main` tip** may be ahead with ops/security hygiene; that tip is **not** automatically Production-certified.
- **Buyer environment** certification remains **NOT_ESTABLISHED** until measured under a signed License Schedule.
- **No license** is granted by repository presence or this document.


## Verified update after the non-finalizing Neon restore — 17 November 2026

The non-finalizing restore gate is now **VERIFIED** through the dedicated Neon
Restore Snapshot endpoint:

- Snapshot: `snap-floral-sea-bcug7fd3`, source Primary.
- Valid restored branch: `br-quiet-poetry-bc3uo0u3`, ready, with Neon metadata
  `restored_from`, `restore_status=restored`, and `restored_as=br-proud-salad-bcshhdap`.
- Read-only validation: PostgreSQL 18.7, 135 public tables, 62 migration-ledger
  rows, 068 present, 063–067 and 069 absent, and runtime role
  `opscore_runtime` has neither superuser nor BYPASSRLS; a role-scoped read with no
  tenant context returned zero organizations.
- The older `br-divine-fog-bcki2xa4` is **not** a restore branch and must not be
  cited as restore evidence.

The proof JSON is rebound to the valid branch. Its new SHA-256 is
`231b7d5a8b94ebaf2307f9b0a42cf5c95537ed6237db9842cf7f3da39297be28`.
Update GitHub Environment `production` secret
`OPSC_PRODUCTION_RESTORE_PROOF_SHA256` to this exact value after this change
is merged. Until that update is confirmed, the Production migration workflow
must remain un-dispatched.

Neon currently has **5 active branches and 3 roots** (Free plan: 10 total
branches). All observed branch protections remain disabled. No additional
branch pruning, snapshot deletion, Primary protection change, or plan upgrade
was done.

The signed-context Production migration remains scheduled for the approved
window **18 November 2026, 02:00–04:00 Africa/Cairo**. It is still subject to
the exact six-migration preflight and the new proof digest check. It does not
automatically deploy, rotate HMAC, or activate signed routes. Production stays
pinned to `4017497068defa9c1d0761fcb07bc746925e002a` until a later, separate
deployment and 67-route Production evidence cycle passes.
