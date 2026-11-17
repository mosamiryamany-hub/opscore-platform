# Buyer residuals (explicit — not seller-certified)

These items are **out of seller certification** for the current commercial close. Include or exclude them explicitly in each signed License Schedule. A future buyer-specific License Schedule is a transaction document, not a seller-side release or marketing residual; it is prepared only after a prospective buyer is identified and must be executed before that buyer receives licensed rights or delivery.

| Residual | Status | Notes |
|---|---|---|
| Mobile app store signing / publication | REMAINING_BUYER | Android/iOS store artifacts, EAS keys, physical-device acceptance and store submission are unverified. The current preflight reports signed Android and iOS binaries as UNVERIFIED. |
| Native-speaker translation review | REMAINING_BUYER | 114 locales are listed; 109 are machine-assisted drafts and 4 use English fallback. Native-speaker reviewed: 0/114. Production-qualified: 0/114. Keep the machine-translation notice visible. |
| Licensed street maps / routing | REMAINING_BUYER | External map provider account, API keys, billing, and territorial license remain unverified. |
| Vercel commercial hosting entitlement and domain | REMAINING_BUYER / OPS — BLOCKING COMMERCIAL TRAFFIC | Current Vercel runtime-log response identifies the team as Hobby. Vercel Hobby is personal/non-commercial only; Pro or Enterprise is required for commercial usage. The project currently reports no custom domains and SSO protection is enabled. Attach and verify the buyer-facing domain and customer access policy after an approved plan change. |
| Neon recovery capacity and scheduled backups | REMAINING_BUYER / OPS — BLOCKING PRODUCTION MIGRATION | The project API does not expose a plan-name field. Observed effective limits match Free: 3 root branches, 1 manual snapshot, 6-hour history and 1 GB total Postgres storage cap per project. Launch removes the hard per-branch Postgres storage cap and bills storage by actual use. The project has 8 visible branches, of which 3 are roots; the current automatic snapshot schedule is empty. A restore attempt from `snap-floral-sea-bcug7fd3` failed with `root branches limit exceeded`. Neon Launch is the recommended minimum: no monthly minimum, $0.106/CU-hour compute, $0.35/GB-month database storage, $0.20/GB-month PITR history and $0.09/GB-month snapshots; includes 10 total branches, up to 5 roots, 100 manual snapshots, scheduled backups and up to 7-day history. Extra branches beyond ten are $1.50/branch-month. No upgrade or branch/snapshot deletion was performed. |
| Signed tenant context Production activation | REMAINING_ENGINEERING / OPS — BLOCKING | Signed operational routes remain Preview-only in source policy; Production HMAC key variables are not configured; Production deploy job is hard-disabled. Do not enable via environment variables alone. |
| Production 67-route signed-session HTTP matrix | REMAINING_ENGINEERING — NOT ESTABLISHED | Source manifest contains 67 route definitions and CI validates source policy plus isolated PostgreSQL behavior. No current Production 67-route session/tenant/backend-PID/transaction-bound evidence file exists. |
| Production recovery/rollback proof | REMAINING_ENGINEERING / OPS — NOT ESTABLISHED | CI logical dump/restore drill passes, but it is not a Neon Primary snapshot restore. The current manual snapshot has not passed a restore test; restore capacity is blocked by the root-branch limit. |
| Buyer-environment isolation certification | NOT_ESTABLISHED | Seller-reference CERTIFIED does not transfer. Each buyer environment needs exact-deployment and exact-database evidence. |
| Dual-tenant Preview HTTP for `/api/v1/assets` under SSO | REMAINING_OPS | Requires an approved protection-bypass or authentication-policy path; do not weaken protections by default. |

## Official product stance on languages

- The main web shell provides an **All languages** control (`#interfaceLanguageSelect`) filled from the package-owned catalogue.
- Every non–native-reviewed locale must keep the **machine-translation notice** visible (`data-i18n-machine-notice`).
- Do not market “114 languages certified” or “human-translated product” without native review evidence.
