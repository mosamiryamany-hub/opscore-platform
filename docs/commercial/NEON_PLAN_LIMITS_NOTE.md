# Neon plan limits affecting closeout (2026-11-12)

Observed when attempting production hardening:

| Action | Result |
|--------|--------|
| Set `main` branch `protected=true` | `422 BRANCHES_PROTECTED_LIMIT_EXCEEDED` — protected branches are a **paid** feature |
| Scheduled backup snapshots | Not available on Free plan per Neon docs |
| Instant restore history on Free | Up to ~6 hours / 1 GB change history (plan default) |

**Root solution:** upgrade Neon to Launch/Scale when production SLA requires protected branches and scheduled snapshots. Until then, document as buyer residual / operational limit — do not claim production backup certification on Free.
