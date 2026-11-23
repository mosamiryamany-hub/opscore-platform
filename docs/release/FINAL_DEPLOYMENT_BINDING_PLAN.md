# OpsCore: final deployment binding and evidence-scope corrections

## Purpose

This change closes three distinct evidence-integrity issues without rewriting historical evidence or implying external accreditation.

## 1. Candidate evidence is not final-deployment acceptance

The 358-route PostgreSQL HTTP inventory was executed against the held candidate deployment `dpl_Gn3XmrJiqkjJecfKBvrhYz724cKd`; it is not final-deployment acceptance. The separately stored 67-route signed-tenant evidence is a different test scope: artifact `14828426545`, class `DISPOSABLE_POSTGRESQL_18_CI_ROUTE_PROBES`, environment `ci`, with `deploymentId=null` and `productionCertification=false`. It is not evidence for either the candidate or final Vercel deployment.

Rules enforced by the new binding workflow:

- The 358-route artifact is checked against the explicit candidate deployment ID and remains labelled `CANDIDATE_DEPLOYMENT_ONLY_NOT_FINAL_DEPLOYMENT_ACCEPTANCE`.
- The exact 67-route artifact is validated as disposable PostgreSQL 18 CI evidence (67 expected, 67 covered, 0 failed; 36 read and 31 write probes). The signed predicate preserves `environment=ci`, `deploymentId=null`, and `productionCertification=false`, classifying it as `DISPOSABLE_POSTGRESQL_18_CI_ONLY_NOT_BOUND_TO_ANY_VERCEL_DEPLOYMENT`. It must not be described as candidate or final Vercel deployment acceptance.
- After the Vercel API confirms that `opscore-platform.vercel.app` maps to the exact final deployment ID, the binding workflow makes fresh HTTPS GET requests to all six public endpoints. It fails on non-2xx responses, empty bodies, timeouts, or redirects outside the verified alias/final deployment host. It stores each path, status code, final URL, content type, response byte count, SHA-256 of the response body, and check timestamp in `FINAL_PUBLIC_HTTP_SMOKE.json`; that file is uploaded with the signed binding artifact.
- A full 358/67 final-deployment claim requires separate collectors to be executed against the final deployment and their evidence to name that exact final deployment ID. This workflow does not manufacture that claim.

## 2. Internal isolation qualification is not external accreditation

The signed statement labels the result `INTERNAL_PRODUCTION_ISOLATION_TEST_SCOPE` and records `externalAccreditation: false`. It explicitly disclaims ISO, SOC 2, PCI DSS, and independent third-party certification. Existing historical values are not rewritten.

## 3. Cryptographic archive-to-deployment association

The workflow:

1. Downloads the exact archive artifact selected by ID from a successful secure-release run.
2. Recomputes SHA-256 from the downloaded ZIP bytes.
3. Checks the external commercial statement and source-pinned provenance against the digest, source commit, and release run ID.
4. Independently verifies the GitHub source-pinned build attestation and SLSA provenance using `gh attestation verify`, enforcing the expected signer workflow, archive digest, source commit, workflow commit/ref, and exact release run ID plus attempt.
5. Verifies the original archive Sigstore bundle with Cosign using the signer identity declared by the verified source-pinned builder metadata and GitHub OIDC issuer.
6. Verifies the successful deployment workflow run, the final Vercel deployment ID, its production/READY state, source commit, and the public alias mapping.
7. Confirms the original deploy run's staged HTTP smoke, promotion, public-domain verification, and final-gate steps all concluded successfully; independently confirms the public alias still resolves to the exact final deployment ID.
8. Executes fresh HTTPS GET checks against all six public endpoints after alias verification and records per-endpoint status, response-body digest, byte count, final URL, and timestamp. The signed predicate consumes this generated evidence; it does not hardcode a PASS.
9. Creates an in-toto Statement JSON whose subject is the exact archive SHA-256 and whose predicate includes the final Vercel deployment ID, deployment URL, source commit, both workflow run IDs, candidate deployment ID, and evidence-scope limitations.
10. Signs that binding statement with a separate keyless Sigstore signature from this workflow and verifies that signature before uploading the statement, checksum, Sigstore bundle, and live HTTP smoke evidence.

### Important semantics

This creates a cryptographically signed association between the signed buyer archive and the final Vercel deployment. It does **not** claim that the buyer ZIP bytes are byte-for-byte identical to Vercel's prebuilt deployment output. They are separate deliverables. The signed predicate makes this distinction machine-readable.

## Manual inputs for the first historical binding

- Secure release run: `45202264084`
- Secure release artifact: `14831302681`
- Deploy run: `45195418125`
- Candidate deployment: `dpl_Gn3XmrJiqkjJecfKBvrhYz724cKd`
- Candidate 358-route artifact: `14835031194`
- Separate 67-route disposable PostgreSQL CI artifact: `14828426545`
- Final deployment: `dpl_6r4ZCJiuVHonja32AXhsjwMSDoig`

These are historical inputs, not a statement that this new workflow has already run. The binding is PASS only after the workflow succeeds and its signed artifact is independently retrievable and verifiable.

## Acceptance criteria

- [ ] Original archive digest matches the downloaded bytes and release statement.
- [ ] Original archive Sigstore signature verifies against the pinned builder identity and OIDC issuer.
- [ ] Release and deployment workflow runs are successful and source commits match.
- [ ] Candidate 358-route evidence identifies the candidate deployment, not the final deployment.
- [ ] The 67-route artifact is independently checked as CI-only: 67/67, 0 failed, 36 read and 31 write probes, `deploymentId=null`, `productionCertification=false`.
- [ ] No claim associates the 67-route CI artifact with a Vercel deployment.
- [ ] Final deployment is READY/production and its source commit matches.
- [ ] Public alias resolves to the exact final deployment ID.
- [ ] Six fresh public HTTP GET checks pass against the alias and are recorded with per-endpoint response digests in the uploaded artifact.
- [ ] Signed in-toto statement subject digest equals the archive SHA-256.
- [ ] Signed predicate names the exact final deployment ID and states candidate-only evidence scope.
- [ ] Internal isolation evidence is not described as external certification.
- [ ] Binding statement signature verifies with the binding workflow identity.

No production deployment, alias change, Neon mutation, main-branch change, or certification upgrade is performed by this branch.


## Verified historical artifact scope (read-only inspection)

| Evidence | Artifact | Observed result | Deployment binding |
|---|---:|---|---|
| PostgreSQL HTTP route inventory | `14835031194` | 358/358 passed; schema v2; production environment | Candidate `dpl_Gn3XmrJiqkjJecfKBvrhYz724cKd` only |
| Signed tenant-context route coverage | `14828426545` | 67/67 covered; 0 failed; 36 read + 31 write; disposable PostgreSQL 18 CI | `deploymentId=null`; no Vercel deployment association |

These observations were read from the downloaded artifact contents, not inferred from artifact names. A separate final-deployment 358-route run and a Vercel-deployment-bound 67-route run remain unverified.
