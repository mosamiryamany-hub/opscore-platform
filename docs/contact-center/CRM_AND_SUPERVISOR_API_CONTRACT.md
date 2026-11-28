# Contact Center CRM and Supervisor API Contract

**Contract:** `opscore.contact-center-supervisor.v1`  
**Scope:** authenticated tenant-scoped CRM lookup/linking, escalation reassignment, and supervisor audit review.

## Authorization model

All routes require the existing authenticated OpsCore session (`bearerAuth` in OpenAPI). In addition, the server enforces the following:

- CRM customer search, customer profile retrieval, customer linking, eligible-agent listing, employee activity review, and escalation reassignment are restricted to `owner`, `admin`, or `manager`.
- Mutations require the normal `write` scope. Read operations require the normal `read` scope.
- Customer records and eligible assignees are always scoped to the authenticated organization.
- Reassignment targets must be active organization members with role `member` or `manager`.
- The UI is not an authorization boundary. Role, tenant, status, and resource checks are performed by the server for every request.

## CRM endpoints

### `GET /api/v1/contact-center/crm/customers?query={text}`

Search active CRM customers in the caller's organization. `query` must contain at least two characters; the server caps the query at 80 characters and returns at most 20 records.

Response fields are deliberately limited to `id`, `name`, `email`, `phone`, and `externalRef`. This endpoint does not search transcript text and does not infer identity from name/email similarity.

### `GET /api/v1/contact-center/conversations/{id}/customer-profile`

Returns the explicit CRM association for a conversation. If no association exists, returns `linked: false` and `customer: null`. The profile is available only to supervisor roles.

### `POST /api/v1/contact-center/conversations/{id}/customer-link`

Request:

```json
{ "customerId": "cus_..." }
```

The server verifies that the conversation and active customer both belong to the authenticated organization, writes the association, increments the conversation version, and appends an audit event. Repeating the same association is idempotent and returns `duplicate: true`.

## Supervisor endpoints

### `GET /api/v1/contact-center/supervisor/agents`

Returns active, same-organization `member` and `manager` accounts as `{ id, email, role }`. Email is exposed only to supervisor roles for operational assignment and accountability; no display names are invented.

### `POST /api/v1/contact-center/handoffs/{id}/reassign`

Request:

```json
{
  "assignedTo": "user_...",
  "reason": "Transfer to the available trained operator"
}
```

The reason must be 8–300 characters. The server permits reassignment only while the handoff is `queued` or `claimed`. In a single transaction it changes the handoff assignment, synchronizes the conversation assignee/status, and writes `contact_center_handoff_reassigned` with the previous assignee, new assignee, and redacted reason. Repeating the current assignee is idempotent.

### `GET /api/v1/contact-center/supervisor/activity?actorUserId={userId}`

Returns up to 100 recent `contact_center_*` audit entries from the tenant audit log, optionally filtered by actor, together with the audit-chain verification result (`valid`, `checked`, and failure details when invalid).

## Data integrity

- SQLite: a foreign key plus insert/update triggers reject a CRM customer whose `organization_id` differs from the conversation.
- PostgreSQL: migration `076_contact_center_crm_customer_link.sql` follows GIS/Digital Twin migrations 073–075. It adds `customer_id`, reuses the existing unique `(id, organization_id)` customer index (creating one only for a compatible reduced schema), adds a composite tenant foreign key with `ON DELETE SET NULL (customer_id)`, and adds a tenant/customer lookup index.
- Customer profile joins include both customer ID and organization ID. A cross-tenant association is not returned even if a legacy or out-of-band write exists.
- Customer link and escalation reassignment operations are audited. The supervisor activity response includes the audit-chain verification result.

## Explicit limitations

This contract does not create CRM customer records, infer customer identity, expose transcript content through CRM search, create PSTN/SIP transfers, or invent supervisor reassignment capabilities outside the contact-center handoff queue. The current UI requires an authenticated supervisor session to exercise these actions.
