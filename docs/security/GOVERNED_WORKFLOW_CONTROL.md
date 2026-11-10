# OpsCore v0.11.61 — Governed Workflow Control

**Release: v0.11.62**

## Purpose

Turn the existing configurable Work Order workflow into a mutation-level operational control rather than an endpoint-only helper.

## Implemented

1. **Mutation-level enforcement** — active workflow rules are evaluated whenever a Work Order status changes through `updateWorkOrder` or `transitionWorkOrder`.
2. **Versioned definitions** — updating a workflow creates a new version snapshot while preserving the workflow identity.
3. **Preview without write** — administrators can evaluate a proposed transition without mutating the Work Order.
4. **Decision provenance** — governed transitions persist actor, source status, target status, workflow version, optional reason, and a SHA-256 decision hash.
5. **Evidence package inclusion** — completion packages include the persisted transition history.
6. **Tenant scoping** — workflow definitions, versions, and transition history are queried with organization boundaries.

## Verification boundary

Verified by automated tests in the release suite. PostgreSQL schema parity is verified by table inventory; PostgreSQL runtime integration is not certified in this environment. Signed mobile artifacts, physical-device acceptance, and store approval remain unverified.

No claim is made of legal immutability, WORM storage, autonomous approval, or AI decision-making.
