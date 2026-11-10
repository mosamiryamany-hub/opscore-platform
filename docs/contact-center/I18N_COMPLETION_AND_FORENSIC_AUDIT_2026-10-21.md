# Contact Center i18n — Completion Pass and Forensic Audit

**Release candidate:** OpsCore FIELD v0.11.62 (integrated package)
**Audit date:** 2026-10-21
**Scope:** close the two unlocalized-copy findings left open by the earlier audit, re-audit all 114 locale
files independently, and re-verify the release tests and archive integrity after the change.

## What changed

- Added **22 keys** to **all 114 locale files** (89 keys per file). Every user-visible string that was
  still hardcoded in `contact-center.html` / `contact-center.js` is now key-driven: interface-language label,
  browser-voice stream disclosure, browser-voice requirements, assigned-conversation heading, agent-reply
  storage note, resolution note, API-unavailable message, suggested-next-step, queue-only handoff, voice-handoff,
  voice-credential request/active, realtime error, active-voice notice, queue-unavailable, and the
  `errors.*` codes shown to users.
- Error codes are now mapped to readable copy through `errors.*` keys, so a raw code such as
  `CONTACT_CENTER_CONSENT_REQUIRED` is no longer printed at the user.
- `i18n-loader.setLocale()` canonicalises requested locale case and still rejects unsupported values.
- Added `test/contact_center_i18n_completion.test.js`: fails on any hardcoded English copy in the Contact Center
  HTML/JS, on any locale whose key set drifts from `en.json`, and on a stale coverage register.
- Added `backend/docs/contact-center/I18N_COMPLETION_REGISTER.json`: the machine-checkable gap list that
  `validate-i18n.js` now enforces.

## Independent forensic re-audit (own tooling, not the package validator)

The audit re-parsed every locale file from raw bytes, independent of the project's validator:

| Check | Result |
|---|---|
| Locale files found | 114 (+ `manifest.json`) |
| Valid JSON | 114 / 114 |
| Invalid JSON | 0 |
| UTF-8 BOM present | 0 |
| Duplicate keys | 0 |
| Empty / null values | 0 |
| Key-set mismatches vs `en.json` | 0 |
| Placeholder mismatches vs `en.json` | 0 |
| RTL locales detected | 8 (ar, fa, he, ku, ps, ug, ur, yi) |
| Files with parse/warning findings | 0 errors / 0 warnings |

Key-set, placeholder, empty-value and encoding findings are **zero** across all 114 files.

## Test evidence actually executed

| Gate | Result |
|---|---|
| `node scripts/validate-i18n.js` (structural + declared-coverage gate) | PASS |
| Focused i18n tests (`test/contact_center_i18n.test.js`) | 6 / 6 passed, 0 failed |
| Completion gate (`test/contact_center_i18n_completion.test.js`) | 6 / 6 passed, 0 failed |
| Full backend release suite (`npm test`) | PASS — 404 / 404 passed, 0 failed |

## Coverage status per class

- `source`: 1 locale (`en`).
- `draft_translation_pending_native_review`: 14 locales — ar, de, es, fr, he, hi, it, ja, ko, pt, ru, tr, zh-CN, zh-TW.
- `english_fallback_pending`: 99 locales — the new keys are present and translatable but still hold the
  English source text. This is a declared, machine-verified gap, not a hidden one.

## Open findings — do not waive

1. **No locale is production-qualified.** 99 of 114 locales still show English for the 22 new keys,
   and the 14 drafted locales are unreviewed drafts. Native-speaker review, terminology and locale-format
   checks, and reading-level checks are outstanding for every locale.
2. **Draft translation risk.** The drafted values were produced in this pass without a native reviewer; treat them as
   drafts until signed off.
3. **Speech/provider acceptance not run.** ASR, TTS, accent, dialect and voice-provider behaviour were not tested
   against a live configured provider.
4. **Live infrastructure not certified.** Production PostgreSQL/PostGIS/RLS, KMS, identity provider, external
   webhooks and the end-to-end network boundary were not exercised.
5. **No zero-defect claim.** Passing finite tests does not prove the absence of defects.

## Bottom line

The two unlocalized-copy findings from the earlier audit are **closed with evidence** (22 keys × 114 locales,
gates green). Full localization qualification stays **HOLD**.
