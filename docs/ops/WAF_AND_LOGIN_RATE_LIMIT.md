# WAF and login rate limiting

## Application layer (always on)

`backend/src/firewall.js` + config:

- Global firewall rate limit (default 240 / 60s).
- Dedicated login rate limit: `LOGIN_RATE_LIMIT` default **10** / `LOGIN_RATE_WINDOW_MS` default 60000.
- Suspicious path/header/body checks deny (not log-only).

## Vercel Firewall (edge)

Best practice: start rules in **log**, observe, then promote auth routes to **rate limit + deny/challenge**.

Recommended edge rules (Console; plan-dependent):

1. Rate limit POST to `/api/v1/auth/*` — e.g. 10/min/IP — Deny or 429 after log observation.
2. Optional challenge on bot user-agents hitting auth.
3. Do not broadly deny `/api/health` or `/api/verify/*`.
