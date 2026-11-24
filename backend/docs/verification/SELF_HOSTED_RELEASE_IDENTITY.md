# Self-hosted release identity (buyer-owned deployment)

## Why this exists

The Vercel release proof remains platform-specific. This separate gate lets a buyer-owned installation verify a signed release-identity statement without requiring a Vercel deployment ID. It adds no HTTP route and does not change the Vercel certification path.

## Security meaning of PASS

A `PASS` means **the runtime verified an Ed25519 signature made by a private key whose matching public key is pinned in the buyer's runtime configuration**, and that the signed fields meet the schema, commit, freshness, TLS-origin and database-role policy checks.

A plain SHA-256 digest is not an authenticity mechanism: anyone can calculate one. SHA-only identity files are rejected.

**Important boundary:** the verifier checks the signed claims; it does not independently collect the archive bytes, make a TLS handshake, or connect to PostgreSQL to measure the declared facts. The signing operator is responsible for measuring those facts through the buyer's approved procedure before signing. Therefore this gate is a trusted-operator attestation, not independent infrastructure certification, not an end-to-end tenant acceptance test, and never reports `CERTIFIED`.

## Required signed facts

| Fact | Rule |
| --- | --- |
| Source commit | 40-hex SHA, optionally pinned via `OPSC_SOURCE_COMMIT_SHA` |
| Archive digest | SHA-256 of the exact delivered archive |
| Transport | HTTPS origin only, no embedded credentials, path, query or fragment |
| TLS certificate | SHA-256 of the certificate actually served by the buyer's host |
| Database | PostgreSQL, exact server version, database name, runtime role and direct non-pooled host |
| Runtime role | `bypassRls`, `superuser`, `createRole`, `createDb` must each be exactly `false` |
| Freshness | Within the configured maximum age (default 7 days), never more than 5 minutes in the future |
| Authenticity | Ed25519 signature over canonical JSON, verified against a pinned public key and key ID |

## Create an operator signing key

Generate a dedicated Ed25519 key pair on a trusted operator workstation. Keep the private key offline or in an approved secrets manager; never commit or upload it.

```bash
openssl genpkey -algorithm ED25519 -out opscore-self-hosted-private.pem
openssl pkey -in opscore-self-hosted-private.pem -pubout -out opscore-self-hosted-public.pem
chmod 600 opscore-self-hosted-private.pem
```

Pin the public PEM in the buyer runtime:

- `OPSC_SELF_HOSTED_ATTESTATION_PUBLIC_KEY` — trusted public key PEM
- `OPSC_SELF_HOSTED_ATTESTATION_KEY_ID` — expected key identifier
- `OPSC_SELF_HOSTED_IDENTITY_PATH` — optional identity file path
- `OPSC_SOURCE_COMMIT_SHA` — optional expected source commit

The private key must never be configured as an application runtime variable.

## Produce the signed identity

```bash
node backend/scripts/self-hosted-release-identity.js --print-partial > partial.json
# Fill every value using measurements from the actual buyer-owned release.
node backend/scripts/self-hosted-release-identity.js \
  --input partial.json \
  --output SELF_HOSTED_RELEASE_IDENTITY.json \
  --private-key opscore-self-hosted-private.pem \
  --key-id buyer-release-2026
```

The script reads the private key locally, signs the canonical payload and writes the identity file with restrictive file permissions. It does not print or copy the private key. The signing operator remains responsible for measuring each value accurately.

Place the identity at `backend/docs/verification/SELF_HOSTED_RELEASE_IDENTITY.json` (default) or configure `OPSC_SELF_HOSTED_IDENTITY_PATH`.

## Verify

```bash
node -e "console.log(JSON.stringify(require('./backend/src/self-hosted-release-proof').createSelfHostedReleaseProof(process.env), null, 2))"
```

Missing trust keys, wrong key IDs, malformed signatures, tampering, stale identities, mismatched commits or elevated database-role flags return `NOT_VERIFIED` with explicit `reasons[]`.

## Explicit exclusions

This does not prove Vercel deployment identity, Neon PITR, the signed tenant-context 67-route matrix, buyer app-store signing, native device QA, translation review, licensed maps, or independent compliance certification. Those remain separate acceptance items.
