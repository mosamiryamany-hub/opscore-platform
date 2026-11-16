# Buyer-Owned Deliverables and Commercial Rights Negotiation

**Document status:** Proposed commercial allocation — pending internal approval and buyer-specific agreement  
**Prepared:** 2026-11-17  
**Applies to:** OpsCore Platform commercial evaluation, buyer onboarding, deployment, and handover  
**Governing principle:** Zero Illusion. A responsibility allocation is not evidence that a deliverable, integration, license, approval, or production capability already exists.

## 1. Executive decision

The following items are treated as **buyer-dependent deliverables**, not unconditional vendor delivery obligations:

1. Mobile store accounts, buyer-specific signing credentials, store submissions, and store approvals.
2. Human translation review, domain terminology approval, and dialect acceptance.
3. Commercial map, geocoding, routing, and related data-provider licenses and buyer credentials.
4. The commercial grant of rights, which will be negotiated with the buyer and recorded in a separately executed agreement.

These allocations prevent buyer-controlled decisions and third-party commercial arrangements from being misrepresented as defects in the platform's core source-code delivery. They do **not** waive the vendor's responsibility to deliver documented integration points, secure configuration mechanisms, reproducible build procedures where included in scope, accurate status reporting, and evidence for any capability expressly promised in the signed statement of work.

**No buyer-dependent item is considered completed merely because responsibility is assigned to the buyer.** Each remains pending until the relevant buyer evidence, approval, or signed agreement is received.

## 2. Responsibility matrix

| Workstream | Vendor / platform responsibility | Buyer responsibility | Closure evidence |
|---|---|---|---|
| Android, iOS, and Huawei distribution | Document supported build targets and prerequisites; provide the agreed source/build configuration and integration guidance; identify required permissions, signing inputs, and release steps. Do not expose signing secrets in source control or logs. | Own developer accounts and organization verification; provide or control signing keys/certificates and store credentials; approve store metadata, privacy declarations, age ratings, and submit/release the buyer's apps; pay store/provider fees. | Reproducible build record for the agreed target; buyer-controlled signing and submission record; store approval/publication evidence if publication is in scope. |
| Human translation and dialect approval | Maintain locale/resource structure and documented translation workflow where included; expose translation status accurately; preserve fallback behavior; identify machine-generated, reviewed, and approved content separately. | Appoint qualified native-language and domain reviewers; approve terminology, dialect, legal notices, and customer-facing wording; authorize final language release. | Signed language acceptance matrix identifying locale, reviewer, review date, scope, and accepted version. |
| Maps, geocoding, routing, and geographic data | Document provider adapter/configuration requirements and supported capabilities; protect credentials; implement only the provider functionality actually included and verified; document attribution, quota, and data-residency dependencies. | Select and contract with licensed provider(s); obtain geographic-data rights, API keys, quotas, and regional permissions; pay third-party charges; approve applicable attribution and usage terms. | Executed provider license/order, buyer-owned credentials configured securely, provider entitlement/region confirmation, and integration acceptance evidence. |
| Commercial rights and resale | Supply a clear proposal and rights schedule; identify vendor-owned IP and third-party/open-source components and their applicable licenses; negotiate and execute only the rights expressly agreed by authorized parties. | Select the desired commercial model; negotiate scope, price, term, territory, permitted deployments, resale/sub-licensing, support, and any exclusivity; sign through an authorized representative and satisfy payment conditions. | Fully executed agreement and any schedules, purchase orders, and payment/acceptance records required by that agreement. |

## 3. Mobile distribution — buyer-owned release credentials

The vendor must not request that the buyer publish private signing keys or account passwords in GitHub, tickets, chat, build logs, or ordinary configuration files. Credentials must be supplied through an agreed secure channel and stored in an approved secret-management mechanism.

The vendor's delivery boundary must state exactly which artifacts are included: source code, build scripts, dependency lockfiles, signing configuration templates, release notes, and build instructions. A signed binary, store submission, store approval, and public availability are separate milestones and must not be conflated.

Unless a signed statement of work says otherwise, buyer-specific store account ownership, identity verification, legal declarations, signing credentials, fees, submission, and store approval remain buyer responsibilities. Vendor assistance with a submission does not transfer account ownership or guarantee store approval.

## 4. Translation — distinguish machine output from human acceptance

Machine-generated translations are not native-speaker-reviewed translations and must not be marketed as such. Any existing language catalogue must retain explicit per-locale status labels, such as:

- **Machine-generated / unreviewed**
- **Human review in progress**
- **Human-reviewed**
- **Buyer-approved for production**

Only the last status, supported by a recorded buyer acceptance, qualifies as buyer-approved production language content. Review must include domain terminology, user-interface context, pluralization, date/number formats, right-to-left behavior where relevant, legal and safety text, and the buyer's selected dialect.

The buyer supplies qualified reviewers and final approval. The vendor remains responsible for accurately representing the state of the catalogue and not silently upgrading translation status.

## 5. Maps and geographic data — licensing boundary

The buyer selects and licenses the map, geocoding, routing, satellite imagery, traffic, and other geographic-data providers required for its territory and use case. The buyer is responsible for provider fees, contractual usage rights, regional restrictions, and credentials unless expressly included in a signed commercial schedule.

The vendor must document the integration contract, required credentials, attribution obligations, quotas, supported regions, and any known limitations. Credentials must be tenant/environment scoped where supported and must not be embedded in client bundles or committed to source control.

A map integration being technically present does not establish a commercial data license. Conversely, a buyer's provider contract does not prove that the platform integration has passed technical acceptance. Both proofs are required for the relevant buyer deployment.

## 6. Commercial rights — negotiation, not an implied grant

No fixed commercial grant is assumed by this document. Rights will be negotiated with the buyer and become effective only through a separate written agreement signed by authorized parties.

The agreement should explicitly select and define, as applicable:

1. **License model:** SaaS subscription, dedicated/on-premises deployment, hybrid deployment, or another expressly described model.
2. **Permitted use:** internal use, number of legal entities, tenants, users, sites, environments, and geographic territory.
3. **Resale and sublicensing:** whether resale is permitted; to whom; under what conditions; whether the buyer may sublicense; and whether downstream customer terms are required.
4. **Exclusivity:** whether any exclusivity exists, its exact field, territory, term, and performance conditions. No exclusivity is implied.
5. **Intellectual property:** pre-existing vendor IP, buyer materials/data, bespoke paid development, derivative works, improvements, and any separately negotiated assignment.
6. **Source-code rights:** access, permitted modification, redistribution, source escrow (if any), and restrictions on disclosure or onward transfer.
7. **Third-party components:** open-source notices and licenses, commercial dependencies, provider terms, and any restrictions that cannot be transferred by the vendor.
8. **Commercial terms:** price, payment milestones, taxes, usage limits, overages, hosting/provider costs, renewal, and price changes.
9. **Support and service levels:** support term, channels, response targets, maintenance, upgrades, incident handling, and exclusions.
10. **Data and security:** data ownership, processing roles, permitted use, residency, retention, export, deletion, incident notification, and subcontractors.
11. **Term and exit:** commencement, renewal, suspension, termination, transition assistance, data export, and post-termination rights.
12. **Acceptance and liability:** acceptance tests, cure periods, warranties, liability allocation, indemnities, and dispute resolution.

The final agreement must resolve conflicts between the master agreement, statement of work, order form, technical schedule, and third-party terms. Legal review by the parties is required. This document is not itself a license, assignment, legal opinion, or authority to distribute the platform.

## 7. How these items affect release decisions

Use separate gates so that vendor engineering evidence is not confused with buyer readiness:

- **Vendor engineering gate:** source integrity, security, tenant isolation, automated tests, release provenance, deployment controls, backup/recovery evidence, and verified platform capabilities. Buyer-owned commercial decisions do not substitute for or waive these gates.
- **Buyer deployment gate:** buyer credentials, store accounts, provider contracts, regional configuration, human language acceptance, and buyer-specific operational readiness.
- **Commercial authorization gate:** executed rights agreement, applicable order form/SOW, and required payment/approvals.

A vendor engineering release may be declared only when its own technical gates pass. A buyer-specific production go-live or commercial handover requiring any of the buyer gates remains pending until the corresponding evidence is received. Do not label the overall transaction "commercially closed", "licensed", "store-published", "human-language-approved", or "map-licensed" without the relevant proof.

## 8. Required buyer handover checklist

- [ ] Buyer legal entity and authorized signatory confirmed.
- [ ] Commercial model and permitted use documented.
- [ ] Resale, sublicensing, exclusivity, and IP terms explicitly resolved.
- [ ] Agreement and applicable SOW/order form executed.
- [ ] Buyer mobile developer accounts and signing ownership confirmed, if mobile publication is in scope.
- [ ] Buyer store submission and approval completed, if publication is in scope.
- [ ] Language review owners appointed and locale acceptance matrix signed.
- [ ] Map/geospatial provider contracts and regional rights confirmed.
- [ ] Buyer credentials supplied through approved secure channels and verified without exposing secret values.
- [ ] Buyer-specific deployment and acceptance tests completed.
- [ ] Residuals, exclusions, third-party charges, and support boundaries acknowledged in writing.

## 9. Reporting language

Use the following precise status wording:

- **Buyer-owned — pending:** responsibility is allocated, but evidence has not been received.
- **Buyer evidence received — verification pending:** documents or credentials have been supplied but not yet validated.
- **Buyer-accepted:** the buyer's authorized representative has recorded acceptance for the stated scope/version.
- **Not applicable:** the buyer has explicitly excluded the item from the agreed scope.
- **Vendor technical prerequisite — open:** a platform-side capability or evidence item remains unverified; it cannot be shifted to the buyer by relabeling it.

Never use "complete" for a buyer-owned item based only on this responsibility allocation.

## 10. Approval and change control

This allocation is proposed for internal commercial use and buyer negotiation. Before it is issued as a binding offer, the vendor must approve the scope and have the final contract reviewed by qualified counsel. Buyer-specific exceptions must be recorded in the signed agreement or its schedules, not silently introduced into operational checklists.

Changes to this document should preserve the distinction between vendor obligations, buyer obligations, third-party dependencies, and unverified assumptions.
