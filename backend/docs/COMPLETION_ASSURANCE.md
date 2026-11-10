# Completion Assurance

OpsCore v0.11.31 adds a configurable closeout control for work orders. An organization can define a policy by `workType` or `*` and require one or more persisted operational proofs before a transition to `completed` is accepted.

Supported gates:
- customer sign-off present
- safety acknowledgement present
- at least one completed guided procedure
- evidence attached, optionally with a minimum evidence count

`GET /api/v1/work-orders/{id}/completion-assurance` returns the active policy, observed evidence/sign-off/safety/procedure counts and exact blocker codes. `POST /api/v1/completion-policies` is admin-scoped.

No external forecast, AI judgment or legal immutability claim is involved; the gate evaluates persisted records only.


### Governance
Policy changes create versioned snapshots. A completed work order records the policy id and version used for its closeout decision. Preview evaluates candidate controls without writing.
