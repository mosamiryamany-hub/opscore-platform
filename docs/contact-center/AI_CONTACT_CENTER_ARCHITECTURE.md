# OpsCore AI Contact Center — v0.11.62 candidate

## Delivery boundary

This package contains an implemented **guarded contact-center foundation**: tenant-scoped conversation records, a multilingual target catalogue, opt-in text chat using the OpenAI Responses API, optional browser voice using the Realtime API, authenticated human-handoff queueing/claim/reply/resolve workflows, encrypted transcript persistence, and audit events. It does **not** include an active PSTN/SIP/WhatsApp/email transport adapter or a live phone-to-agent bridge. Such channels must not be displayed as connected until a real provider adapter, signed webhooks, caller identity policy, retry rules, and end-to-end tests have been integrated.

A browser realtime audio session is different from a telephony call. A queued handoff means a human has been requested; it does not mean the call has been transferred or an agent has joined.

## First deployment configuration

1. Keep the contact-center feature disabled while generating secrets and configuring provider access.
2. Set `OPSC_CONTACT_CENTER_ENABLED=true` only after HTTPS, access controls, rate limiting, privacy/consent notices, and provider credentials are configured.
3. Generate an independent 32-byte encryption key outside source control. For example, in a trusted operator shell: `openssl rand -hex 32`. Set the resulting 64-hex-character value as `OPSC_CONTACT_CENTER_ENCRYPTION_KEY`; do not paste it into Git, a ticket, or a log. Set `OPSC_CONTACT_CENTER_ENCRYPTION_KEY_ID=v1`.
4. Set `AI_PROVIDER=openai`, `OPENAI_API_KEY` on the server only, `OPENAI_CONTACT_CENTER_MODEL` (or the existing `OPENAI_MODEL`), and `OPENAI_REALTIME_MODEL` if browser voice is wanted. The application does not assume model access or price tier.
5. Restart the backend and confirm `/api/v1/contact-center/status` while authenticated. It exposes readiness booleans, never the key or secret values.
6. Sign into the OpsCore console and open `/contact-center.html` over HTTPS. Consent is required before creating a conversation. Validate the queue and human-agent flow with test accounts in one tenant and isolation checks across two tenants.

The API key must never be sent to the browser. The browser voice flow receives only the short-lived Realtime client secret minted by the server. Configure the shortest provider-supported validity and rotate server secrets if exposure is suspected. Do not log provider responses that could contain customer content.

## Security and autonomy model

- Tenant ID is taken from the authenticated server context; clients cannot supply or override it.
- Conversation/queue SQL always includes `organization_id`; messages cannot be fetched by ID alone.
- Consent version and timestamp are stored. The configured AI provider processes customer input; the organization's lawful basis, notice, recording consent and retention duties still require operator/legal review.
- Message body is encrypted at rest with AES-256-GCM and associated data binds tenant, conversation, message, actor, language and key version. HMAC integrity check is performed after decrypt. The key is external configuration and must be backed up under a separate approved key-management plan.
- Key rotation is not automatic. Keep the active 32-byte key in `OPSC_CONTACT_CENTER_ENCRYPTION_KEY`, set its ID in `OPSC_CONTACT_CENTER_ENCRYPTION_KEY_ID`, and retain old key IDs in the server-only `OPSC_CONTACT_CENTER_ENCRYPTION_KEYS_JSON` JSON map until old rows are re-encrypted and verified. Never put this map in the browser or commit actual key values. Test restore and decryption before retiring an old key; a missing old key makes those rows unreadable.
- PII-like email, URL, telephone and likely secret strings are redacted before text context is sent to the text model. Voice audio is streamed directly to the configured Realtime provider, so this text-redaction layer does not apply to raw voice audio.
- Provider output is validated against a strict schema. It is a recommendation only: this path has no business tools and cannot execute refunds, payments, account changes, dispatches or cancellations.
- Deterministic rules can create a handoff for detected human requests, high/critical model risk, model-requested intervention or confidence below the configured floor. Intent phrase detection is not guaranteed for all languages; every experience exposes a human-request action, and language-specific tests are mandatory.
- Human claim uses compare-and-swap update and one active handoff per conversation. An agent can reply only when assigned to the case; cross-tenant rows are not reachable by the same API path.
- Audit events record decision metadata/hashes, not the transcript body. Erase action deletes encrypted messages and retains minimal conversation/audit metadata.

## The 114-row language target

`backend/src/contact-center-languages.js` contains 114 unique target codes. The supplied list repeated Welsh (`cy`) at row 104; to meet the explicit 114-language target, row 104 was corrected to Faroese (`fo`). This is a catalogue correction only: it does not certify translation, speech recognition, or speech synthesis support.

The status of every row is `planned_not_qualified`. Registration in the catalogue is not evidence that speech recognition, speech generation, language switching, accent/dialect coverage, names, numbers, noisy audio, code switching, sentiment/risk detection or human-request detection works well. No language may be marketed as production-qualified until a native-speaker and provider-backed acceptance matrix passes. Generate the current matrix with `npm run contact-center:languages` from `backend/`.

Minimum per-language acceptance suite: (1) inbound speech recognition with accents/noise, numbers, names and domain vocabulary; (2) response spoken in the requested language; (3) language switching and mixed-language utterances; (4) customer-requested human; (5) high-risk / unknown answer; (6) privacy/consent and prohibited secret collection; (7) latency and interruption behavior; (8) actual native-speaker review and signed acceptance result. Run separate suites for text and voice. A provider's generic multilingual claim is not a substitute.

## Release blockers / external requirements

- The full backend runner did not complete within the available command execution boundary for this candidate; no full-suite pass is claimed. Current status is recorded in `backend/docs/verification/RELEASE_TEST_RUN_RESULT.json`.
- Run current dependency audit against the online registry; cached offline results are not equivalent.
- Build Expo and test on supported physical iOS/Android devices.
- Test a real PostgreSQL instance, RLS policies/roles, concurrency, backup/restore and multi-instance behavior; static schema parity alone is not runtime verification.
- Validate the OpenAI Responses and Realtime requests in the deployer's own account. This package has no embedded API key.
- Add and test a separate PSTN/SIP provider adapter before inbound/outbound phone operation is advertised. Sign webhooks, validate provider signatures, constrain callback URLs, record consent/legal announcements where required, implement transfer/fallback behavior and run a real call handoff test.
- Configure monitoring, spend/call-duration limits, provider rate limits, transcript-retention schedule, key rotation/recovery and incident response before production.

Do not claim “114 supported languages”, “fully autonomous”, “zero vulnerabilities” or “production-ready” solely from installation of this module.
