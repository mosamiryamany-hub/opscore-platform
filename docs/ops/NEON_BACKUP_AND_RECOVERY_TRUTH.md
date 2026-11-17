# Neon backup and recovery — operational truth

## What Neon provides (plan-dependent)

| Capability | Free (typical) | Launch+ |
|---|---|---|
| History window (instant restore) | ~6 hours (capped) | up to 7 days |
| Manual snapshots | 1 | up to 100 |
| Scheduled snapshot jobs | Not available | Daily/weekly/monthly (retention up to 35 days) |
| Protected branches | Limited | Supported |

## OpsCore stance

- Branch-point recovery evidence is not a scheduled-backup certificate and not full RPO/RTO certification.
- An empty automatic backup schedule on Free is expected until a paid backup schedule exists.
- A snapshot taken from a recovery child branch is not proof of a primary-branch schedule.
- Workflow `neon-primary-manual-snapshot.yml` creates a manual snapshot of the configured primary branch when the API and plan allow.

## Required owner actions

1. Upgrade to Launch+ when multi-day PITR and scheduled snapshots are required.
2. Set history window under Project → Settings → Postgres.
3. Create a backup schedule on the root production branch.
4. Protect the production branch within plan limits.
5. Run periodic restore drills to disposable branches; delete drill branches after archiving evidence.
