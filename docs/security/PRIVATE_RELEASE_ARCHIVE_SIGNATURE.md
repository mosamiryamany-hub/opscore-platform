# Private-repository release archive signature

## Decision

The repository remains private. The secure-release workflow signs the completed ZIP as a Sigstore keyless blob using the GitHub Actions OIDC identity. The signature bundle is uploaded beside the ZIP and external commercial statement.

## Verification contract

The release workflow must:

1. Sign the exact completed `OpsCore-release.zip` bytes with `cosign sign-blob`.
2. Verify the bundle against the exact workflow identity for the run's validated ref. The workflow binds the expected identity to `${{ github.ref }}`: manual dispatch is restricted to `refs/heads/main`, while a tag run is restricted to a version-matching `v*` tag whose commit is contained in `main`. Examples:
   - `https://github.com/mosamiryamany-hub/opscore-platform/.github/workflows/opscore-secure-release.yml@refs/heads/main`
   - `https://github.com/mosamiryamany-hub/opscore-platform/.github/workflows/opscore-secure-release.yml@refs/tags/v0.11.62.20-commercial-licensed`.
3. Require the GitHub Actions OIDC issuer `https://token.actions.githubusercontent.com`.
4. Reject a modified archive and reject a different certificate identity.
5. Upload the archive, detached Sigstore bundle, and external commercial statement together in the same workflow run.

No static hash, filename, release tag, or historical signature substitutes for this verification.

## Privacy and transparency

Cosign keyless signing uses the Sigstore public trust infrastructure. The public transparency record can reveal the signer/workflow identity and the signed artifact digest. It does not publish the private source tree or the archive bytes. This metadata exposure is accepted by this workflow design and must be reconsidered if the repository or workflow naming itself is confidential.

## Scope limitation

This is a cryptographic signature over the archive bytes, bound to a short-lived Fulcio certificate and Sigstore transparency evidence. It is **not** a GitHub artifact-attestation record and does **not**, by itself, create an in-toto/SLSA provenance predicate or prove that every statement inside the archive is true.

The buyer-facing release proof must not report the signature as verified until it independently verifies the Sigstore bundle and binds the verified archive digest, workflow identity, source commit, and run ID to the deployment being displayed. Until that integration is implemented and exercised on a real release, the buyer-facing archive-signature status remains `NOT VERIFIED`.
