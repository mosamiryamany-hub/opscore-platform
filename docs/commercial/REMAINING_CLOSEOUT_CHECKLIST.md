# Remaining closeout checklist (honest scope)

## Seller-owned engineering closeout
- [x] Commercial tiers A/B/C framework and transaction-specific License Schedule template
- [ ] Merge integrated security hardening (PR #163 lineage) after rebasing onto current main and passing exact-head CI
- [ ] Complete and verify the approved 67-route signed-session coverage matrix; do not substitute inventory counts or CI-only route contracts
- [ ] Obtain commit- and Neon-branch-bound Production dual-tenant and recovery evidence; do not reuse rebind-era JSON
- [ ] Verify Production deploy remains explicitly manual-only and cannot run on an ordinary push
- [ ] Generate the final exact-head Secure Release artifact, SBOM, provenance, test reports and checksum statement from one successful pipeline
- [ ] Reconcile the deliverable's source commit, package digest and release statement; ensure buyer package matches the selected release candidate

## Seller / account-owner commercial infrastructure decisions
- [ ] Decide on Vercel commercial hosting plan or alternate hosting before selling a hosted SaaS service; this is not a blocker to marketing a source-code handoff
- [ ] Decide whether Neon paid retention, multi-day PITR and protected-branch capacity are required for the seller-hosted service; do not claim these on the Free plan
- [ ] Resolve Preview SSO / authenticated Preview-test access without weakening Production or broadening deployment access

## Buyer-specific work — not a seller launch or marketing gate
- Mobile store signing, native-speaker translation review and licensed map/provider accounts are disclosed buyer/environment responsibilities unless separately included in a transaction.
- A named buyer, buyer-signed License Schedule and buyer-specific independent legal review happen only after a prospective buyer is identified and transaction terms are negotiated. These are transaction-closing requirements, not pre-sale release blockers.
- The rights holder and the named buyer must execute the License Schedule before licensed use, modification, redistribution or delivery of the pinned software package.
