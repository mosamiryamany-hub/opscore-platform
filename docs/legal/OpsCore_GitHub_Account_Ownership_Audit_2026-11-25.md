# OpsCore — GitHub Account-Based Ownership & Source-Rights Audit
**Prepared under GitHub account:** `@mosamiryamany-hub`  
**Repository:** `mosamiryamany-hub/opscore-platform`  
**Audit reference date:** 25 November 2026  
**Scope:** GitHub account and repository only. The separate GitLab project is not merged into this assessment.

## 1. Account identity used in this document
The account identity used as the repository/account holder label is **`@mosamiryamany-hub`**. The account is associated with private repository `mosamiryamany-hub/opscore-platform` (repository ID `1452803785`). The connected GitHub permissions observed were admin, maintain, push, pull and triage.

This is an account/repository identity designation. It is **not**, by itself, a legal determination that every line of code, design, document, asset or third-party component is exclusively owned by the account holder.

## 2. GitHub evidence observed
- GitHub account: `mosamiryamany-hub` (account ID `331081173`).
- Repository: `https://github.com/mosamiryamany-hub/opscore-platform` (private).
- Default branch: `main`.
- Observed `main` HEAD: `d62ec709a61446f8a8598bd2d4d23d8be9065630`.
- Commit date: `2026-11-24 11:00:35 UTC`.
- Latest commit author identity reported by GitHub: `mosamiryamany-hub <mosamiryamany@gmail.com>`; GitHub reported the signature as verified.
- The 100-commit page inspected covered 2026-11-20 through 2026-11-24 and attributed all 100 returned commits to `mosamiryamany-hub`. This is a bounded recent-history observation, not a complete lifetime contributor census.

The commit email above is a Git author identity and is not assumed to be the correspondence email `czar.yamany@gmail.com`.

## 3. Separate-project boundary
The GitLab project `codespine-group/op-score` is a **separate repository on a separate platform**. It is not included in the GitHub repository identity above, and no GitLab commits, branches, files or contributor history are attributed to this GitHub repository in this document. Its content was not inspected in the cited audit because the available repository-search integration returned HTTP 403. No connection was restored.

The separate repository `codespine78-web/FiberNexus-1` is also outside this OpsCore GitHub audit.

## 4. Repository rights and licence findings
- `NO_LICENSE_GRANT_NOTICE.txt` states “ALL RIGHTS RESERVED” and requires a signed written License Schedule tied to the exact deliverable before buyer use, delivery, modification, distribution, resale or sublicensing.
- Root package metadata is `UNLICENSED`; no root `LICENSE` or `NOTICE` file was found at the inspected paths.
- The repository's buyer evidence index describes a 496-component SBOM inventory as not constituting legal clearance; two first-party entries lack declared licence expressions and notice/licence-text collection is incomplete.
- Root package declares `pg` 8.23.1; the lockfile identifies MIT. The root dependency audit reported 14 dependencies and zero vulnerabilities for that limited root audit only.
- Complete third-party clearance for backend/mobile dependency trees, assets, SDKs, maps, fonts, icons, datasets, models and vendor components is not established.

## 5. Technical and commercial truth boundaries
Repository documentation classifies the product as a source-code candidate; provider-neutral self-hosted production remains blocked/not qualified. Seller Vercel service was documented as `live=false` and HTTP 402 `DEPLOYMENT_DISABLED` on 2026-11-24; this is a dated finding and must be re-probed before making current live-demo claims. Expo source was included, but signed native binaries, device QA and store publication were not established. Native-speaker language review was recorded as 0/114. No external ISO 27001, SOC 2, PCI DSS or other independent certification is claimed.

## 6. Evidence required before an exclusive ownership declaration or buyer licence
- Complete contributor census for this GitHub repository across all branches, tags, merge commits, co-author trailers, imported/mirrored commits and bots.
- Signed IP assignment or legally effective work-for-hire/commissioning agreements for every employee, contractor and contributor.
- Confirmation that no employer, former client, university, funder, customer or subcontractor retains ownership or restrictive rights.
- Moral-rights consent/waiver only where legally permitted.
- Contracts, invoices, acceptance records, payment proofs and dated source handoffs linked to commit references.
- Exact-head CycloneDX SBOM covering root, backend, mobile, containers/base images, GitHub Actions, vendored code and non-code assets.
- Per-component SPDX licence, exact version, origin, source URL, copyright notice, attribution and redistribution obligations.
- Legal review of reciprocal/copyleft/network-copyleft obligations and compatibility with the proposed commercial model.
- Collection and inclusion of all required licence texts and notices.
- Separate licensing or exclusion of non-transferable commercial assets and hosted services.

## 7. Disposition
**GitHub account/repository control:** strongly supported by the observed connected permissions.  
**Recent GitHub commit activity:** strongly supported for the inspected 100-commit window.  
**Complete legal chain of title:** not yet proven.  
**Third-party licence clearance:** open.  
**Buyer licence/source delivery:** HOLD until the exact deliverable, contributor rights and third-party obligations are cleared and a written licence schedule is signed.

No GitHub repository, branch, file, permission, database, deployment or external connection was changed during preparation of this document.

## References
- Repository: https://github.com/mosamiryamany-hub/opscore-platform
- Observed `main` commit: https://github.com/mosamiryamany-hub/opscore-platform/commit/d62ec709a61446f8a8598bd2d4d23d8be9065630
- Separate GitLab project (not included in this GitHub assessment): https://gitlab.com/codespine-group/op-score
