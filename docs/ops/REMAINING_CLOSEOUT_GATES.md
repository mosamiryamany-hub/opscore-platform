# Remaining closeout gates — 2026-11-17 evening

## Closed today (seller)

| Gate | Evidence |
|---|---|
| PR #222 mobile audit gate (picomatch GHSA documented, time-boxed, registry-checked) | Merged `10603557…` |
| Primary restore proof | `docs/ops/evidence/PRODUCTION_PRIMARY_RESTORE_PROOF.json` PASS |
| Live dual-tenant isolation on production pin | CERTIFIED on `4017497068defa9c1d0761fcb07bc746925e002a` |
| Neon valueless branch cleanup | vercel-dev + superseded proof branch removed |

## Explicitly REMAINING_BUYER (not seller deliverables)

| Item | Owner | Notes |
|---|---|---|
| Mobile store signing / App Store / Play listings | **Buyer** | Device certs, accounts, store review |
| Native human translation QA | **Buyer** | Machine catalog may ship with MT notice |
| Licensed street map provider contracts | **Buyer** | Tile/API commercial license |

## Explicitly REMAINING_ENGINEERING (seller, post-pin upgrade path)

| Item | Why not forced today |
|---|---|
| Apply 063–067 / 069 on Production primary | Requires maintenance window + matching app deploy; live pin remains CERTIFIED without it |
| Production HMAC + signed-route flags | After schema + deploy match |
| Full 67-route Production HTTP evidence matrix | After signed context on Production |
| Neon primary protected + scheduled backups | Paid plan |
| Vercel commercial plan + custom domain | Billing |
| WAF log → deny on auth routes | After log review |
| Remove `if: false` production deploy gate | Only with intentional production release cycle |

## Authority rule (no contradiction)

- **Runtime** `/api/verify/release` on the deployed pin is authoritative for that pin.
- **Git `main` tip** may include mobile/ops hardening without auto-promoting Production.
- **Buyer environment** remains NOT_ESTABLISHED until measured under a signed License Schedule.
- **No license** is granted by repository presence.
