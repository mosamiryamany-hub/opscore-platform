# Signed tenant context — Production promotion plan (do not skip steps)

**Status:** Preview / CI capable · Production schema **not** yet on 063–067 · code gates signed routes off Production by design.

## Why Production is not flipped in this change

Live Production (`4017497068defa9c1d0761fcb07bc746925e002a`) is CERTIFIED on dual-tenant HTTP session probes + branch-point recovery for the **deployed** surface. That certification does **not** claim the full 67-route signed-session matrix on Production.

Applying 063–067 / 069 and enabling signed context on the live primary without a staged window would:

1. Change RLS predicates under load  
2. Require HMAC key material and rotation discipline on Production  
3. Risk login/session breakage if any path still sets unsigned GUC only  
4. Invalidate the current embed until a full new evidence cycle completes  

## Ordered promotion (fail closed)

1. **Preview branch only** — confirm ledger has 063–067 (and 068 if required) with matching sha256; HMAC keys present; synthetic dual-tenant proof PASS.  
2. **Candidate Production deploy** of the same commit that passed Preview signed proof — still with signed-route flags **off** if schema lag remains.  
3. **Migration window** — apply 063–067 on a Production clone/branch first (or maintenance window on primary only after clone proof); verify `opscore_security`, `verified_tenant_context()`, control-plane policies use signed accessor.  
4. **Enable flags** for signed routes gradually (feature flags / env), never all 67 at once without canary.  
5. **Re-run** dual-tenant Production evidence + expanded route matrix bound to **new** deployment identity.  
6. **Only then** set runtime isolation CERTIFIED for the new pin; retire previous pin from sales language.

## Explicit non-goals of docs-only updates

- No Production migration from this document alone  
- No claim that CI 67-route suite equals Production HTTP matrix  
- No Neon plan upgrade without owner cost approval  
