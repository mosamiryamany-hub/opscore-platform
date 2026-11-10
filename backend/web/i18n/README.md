# Contact Center localization — current integrated scope

**Release:** OpsCore v0.11.62  
**Runtime:** `backend/web/contact-center.html` + `backend/web/contact-center.js` + `backend/web/i18n/i18n-loader.js`  
**Locale resources:** `backend/web/i18n/locales/` (114 locale JSON resources plus a manifest)

The locale selector is wired into the Contact Center runtime. The interface-language selector is separate from the conversation language. The loader runs before the Contact Center application script, applies text through safe text APIs, preserves placeholders, handles RTL direction, and shows a persistent machine-translation notice.

## One canonical coverage statement

- 114 locale codes are registered and selectable in the Contact Center.
- 89 source keys are present per locale (88 data keys plus the additional registered UI key, as tracked by the register).
- 109 locales contain machine-assisted draft translations.
- 4 locales (`din`, `nus`, `pau`, `ch`) remain explicit English fallback.
- English (`en`) is the source locale.
- Native-speaker linguistic review completed: **0/114**.
- Production-qualified locales: **0/114** until native-speaker/domain review and required voice/provider tests are independently completed.

A selectable locale is not a claim that its wording has been approved, that speech recognition/synthesis works, or that the entire OpsCore application is translated. This 114-locale scope applies to the Contact Center module and its registered strings, not every screen of the entire product.

## Four forensic / structural audit rounds

The reproducible CI command `npm run contact-center:i18n:forensic` writes `backend/docs/verification/I18N_FORENSIC_AUDIT_RESULT.json`. It executes four distinct rounds:

1. Inventory, strict JSON parse, and duplicate-key scan for all 114 locale files.
2. Exact key-set, non-empty value, and placeholder parity against the English source.
3. Locale-code parity across resource files, server catalogue, loader allow-list, manifest, and provenance register; reconcile the 1/109/4 coverage counts.
4. Runtime notice wiring and safety: loader ordering, visible notice selector, `textContent` rendering, no `innerHTML =` assignment in the locale loader, and required runtime test files.

The buyer should consider the four-round forensic/structural audit passed only when the generated report says `status: PASS` and `passedRounds: 4` for the exact delivered commit. The audit validates file integrity and integration safety; it does **not** validate the linguistic meaning of every translation.

## Prominent translation notice

The interface notice says that these are AI/machine translations that passed four structural/integrity checks but still need native-speaker linguistic review. The notice must not be rewritten as “human-reviewed,” “certified translations,” or “114 production-qualified languages.”

## Reproducible checks

From `backend/`:

```bash
npm run contact-center:i18n
npm run contact-center:i18n:forensic
node --test test/contact_center_i18n.test.js test/contact_center_i18n_completion.test.js
```

The release pipeline runs these commands and retains the generated four-round report with the build artifacts.
