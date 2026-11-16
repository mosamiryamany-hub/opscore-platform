# Buyer residuals (explicit — not seller-certified)

These items are **out of seller certification** for the current commercial close. Include or exclude them explicitly in each signed License Schedule. A future buyer-specific License Schedule is a transaction document, not a seller-side release or marketing residual; it is prepared only after a prospective buyer is identified and must be executed before that buyer receives licensed rights or delivery.

| Residual | Status | Notes |
|---|---|---|
| Mobile app store signing / publication | REMAINING_BUYER | iOS/Android store artifacts, EAS keys, physical device acceptance |
| Native-speaker translation review | REMAINING_BUYER | UI exposes **all supported languages** with a visible **machine-translation** notice; 0 locales are human-qualified |
| Licensed street maps / routing | REMAINING_BUYER | External map provider account and license |
| Vercel commercial plan (if required by ToS for resale) | REMAINING_BUYER / OPS | Confirm Billing plan before commercial processing under provider terms |
| Neon Launch (or higher) for protected branches + multi-day PITR + branch capacity | REMAINING_BUYER / OPS | Free tier: 10/10 branches; protected-branch limit; PITR window plan-limited |
| Production 67-route signed-session HTTP matrix | REMAINING_ENGINEERING | Preview/CI partial coverage only; not a Production signed-route certificate |
| Dual-tenant Preview HTTP for `/api/v1/assets` under SSO | REMAINING_OPS | Requires Protection Bypass or auth policy change |
| Buyer-environment isolation certification | NOT_ESTABLISHED | Seller-reference CERTIFIED does not transfer |

## Official product stance on languages

- The main web shell provides an **All languages** control (`#interfaceLanguageSelect`) filled from the package-owned catalogue.
- Every non–native-reviewed locale must keep the **machine-translation notice** visible (`data-i18n-machine-notice`).
- Do not market “114 languages certified” or “human-translated product” without native review evidence.
