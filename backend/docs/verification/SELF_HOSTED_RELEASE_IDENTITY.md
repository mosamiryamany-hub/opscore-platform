# Self-hosted release identity (buyer-owned deployment)

## Why this exists

`/api/verify/release` (`backend/src/release-proof.js`) proves a **Vercel** release: it requires a
`dpl_...` deployment id, a matching Git pipeline id, Neon recovery-point evidence and a signed
tenant-context matrix bound to that deployment. A buyer hosting OpsCore on their own infrastructure
can never satisfy that identity — and that is by design: the Vercel path stays untouched and remains
the only source of `CERTIFIED` on Vercel.

Without a platform-neutral proof, a self-hosted install hits a dead end: `firewall.js`
`productionSafetyGate` refuses traffic unless `OPSC_PRODUCTION_HOLD=false`, but once traffic is open
the operator still sees `UNVERIFIED` on `/api/verify/release`.

`backend/src/self-hosted-release-proof.js` supplies a **disjoint** gate for that case. It adds no HTTP
route (a new route would change `docs/API_INVENTORY.json` and break the 358-route production
acceptance contract), so it is consumed by operators, scripts and startup verification instead.

## What it proves — and what it does not

Proved (all fields mandatory, all exact):

| Fact | Rule |
| --- | --- |
| Source commit | 40-hex SHA, optionally pinned to the expected commit via `OPSC_SOURCE_COMMIT_SHA` |
| Archive digest | SHA-256 of the delivered release archive |
| Transport | `https:` origin, no embedded credentials, no path/query/fragment |
| TLS certificate | SHA-256 of the served certificate |
| Database | `postgres`/`postgresql`, explicit server version, database name, runtime role, direct (non-pooled) host |
| Runtime role privileges | `bypassRls`, `superuser`, `createRole`, `createDb` must each be exactly `false` |
| Freshness | `generatedAt` within `OPSC_SELF_HOSTED_IDENTITY_MAX_AGE` (default 7 days), never >5 min in the future |
| Binding | Detached `sha256` attestation over the canonical JSON of all attested fields |

Not proved: the Vercel-specific evidence bundle (Neon PITR, Vercel deployment id, signed
tenant-context 67-route matrix). Those remain buyer/operator responsibilities, and this gate never
reports `CERTIFIED` — it reports `PASS` or `NOT_VERIFIED` only.

## Producing the identity

```bash
node backend/scripts/self-hosted-release-identity.js --print-partial > partial.json
# fill measured values, then:
node backend/scripts/self-hosted-release-identity.js --input partial.json --output SELF_HOSTED_RELEASE_IDENTITY.json
```

Place the result at `backend/docs/verification/SELF_HOSTED_RELEASE_IDENTITY.json` (default) or point
`OPSC_SELF_HOSTED_IDENTITY_PATH` at it. No password, key or connection string is ever written to the
file — only measured digests and boolean capability flags.

## Verifying

```bash
node -e "console.log(JSON.stringify(require('./backend/src/self-hosted-release-proof')
  .createSelfHostedReleaseProof(process.env), null, 2))"
```

`status: "PASS"` requires every rule above. Anything missing, stale, drifted or elevated yields
`status: "NOT_VERIFIED"` with an explicit `reasons[]` array — never a silent pass.
