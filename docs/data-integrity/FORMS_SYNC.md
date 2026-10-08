# Google Forms → Supabase synchronisation — design (needs approval)

Goal: every form response reaches the database exactly once, keeps its
original content and provenance, and failures are visible and retried — with
no automatic approvals.

## Flow

```
Google Form ──onFormSubmit──▶ Apps Script ──HTTPS (HMAC-signed)──▶ Edge Function `form-intake`
     │                                                                   │
     └── nightly reconciliation (Apps Script trigger) ─────────────────▶ │
                                                                         ▼
                                                     form_responses_raw  (append-only, provenance)
                                                                         │ normalise + validate (SQL function)
                                                                         ▼
                                       applications (status: pending / needs_review)  ──▶ admin approves
```

## Tables (proposed)

`form_responses_raw` — immutable record of every submission
- `response_id text primary key` — Google Forms response id (**idempotency key**)
- `form_id text`, `submitted_at timestamptz`, `received_at timestamptz default now()`
- `payload jsonb` — the answers exactly as submitted
- `payload_sha256 text` — detects edited responses (same id, new content → new revision row in `form_response_revisions`)
- `source text` — `trigger` | `nightly_backfill` | `manual_import`
- RLS: no API access; written only by the Edge Function (service role inside the function, never in the browser)

`form_intake_errors` — `response_id`, `stage` (`signature` | `parse` | `validate` | `link`), `error_code`, `attempts`, `last_attempt_at`, `resolved_at`. Error codes only — no answer values.

## Processing rules

1. **Idempotent insert**: `insert … on conflict (response_id) do nothing`. Retries
   and the nightly job can resend safely.
2. **Normalise** (SQL function, same rules as `tools/reconcile`): student code
   (Latin digits, no spaces), phone → E.164 text, trimmed names.
3. **Validate**: code format; code exists in `university_students`; phone valid.
   Failures → application `status = 'needs_review'` with a reason code, never
   dropped.
4. **Duplicates**: several responses for one code → all kept in raw; the
   application links to the latest valid one and is flagged
   `has_duplicates = true` for review. Never merges silently.
5. **No auto-approval**: the pipeline only creates/updates applications.
   Approval is an explicit admin action that copies `whatsapp_e164` (text).

## Reliability

- **Signing**: Apps Script signs `timestamp + body` with an HMAC secret stored in
  Script Properties; the function rejects bad signatures and timestamps older
  than 5 minutes (replay protection).
- **Retries**: Apps Script retries with exponential backoff (1, 2, 4, 8, 16 min
  via time-based triggers) and records the last error code in a hidden sheet.
- **Nightly reconciliation**: lists all form response ids and posts any not yet
  acknowledged (`source = nightly_backfill`). The function reports counts:
  received, already present, failed.
- **Admin visibility**: the Admin Control Center can show intake counts and open
  errors (codes only) once these tables exist.

## Privacy

- No answer values in logs, error rows or alerts — ids and error codes only.
- The HMAC secret lives only in Apps Script properties and Edge Function
  secrets; never in the repository or the browser.
- Retention: raw responses kept for the academic year, then purged per policy.

## One-time backfill of the current 74 responses

Import the CSV through the same Edge Function (`source = manual_import`) so the
same validation and idempotency apply; the 7 unmatched codes land as
`needs_review` applications, not approvals.
