# OpsCore Truth Boundaries (must never be crossed)

These rules protect buyer trust and keep the package defensible.

1. **Source kit, not SaaS**  
   OpsCore is delivered as source. Buyer owns infrastructure, keys, mobile signing, and production hardening. Never imply hosted multi-tenant production service.

2. **No autonomous agents**  
   Any AI or suggestion layer is advisory. Operator or technician always confirms. No "auto-remediate", "auto-dispatch", or "self-healing" claims.

3. **No fabricated predictions**  
   Scores and readiness values must be explainable functions of persisted records only. Never invent future failure probabilities or revenue forecasts.

4. **External providers are optional + buyer-keyed**  
   Vision, notifications (email/SMS), maps, OIDC, KMS, push (FCM/APNs) — all require the buyer to supply credentials. Package ships adapters and fail-closed defaults.

5. **Offline contracts are sacred**  
   Do not change sync payload shapes, idempotency keys, or conflict-center behavior without a versioned contract update and migration path.

6. **Evidence integrity**  
   Large binaries stay out of conflict records. Always retain SHA-256 + length. Audit and provenance must remain regenerable.

7. **Test before claim**  
   Any new feature must pass the existing automated suite + cross-tenant checks + buyer-acceptance harness before it appears as "available" in sales or RELEASE_SCOPE docs.

8. **Version + SHA binding**  
   Every published test count or feature list is bound to a concrete package version and its SHA-256 sums.

When writing docs or code comments, prefer the language already used in EXECUTIVE_SUMMARY_AR.md, PRODUCT_POSITIONING_EN.md, and 2026_HIGH_VALUE_EXTENSIONS.md.
