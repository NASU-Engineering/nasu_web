# supabase/ — reviewed SQL for the backend owner (nothing here is applied)

- `inspection/` — **read-only** queries (metadata, counts, record ids). Safe to run.
- `prepared/` — **current** migrations 00–04 with rollbacks. Each is a dry run
  (rolls back) unless the session sets `hub.apply = 'yes'`; each starts with a
  preflight. Tested in an isolated Postgres: `npm install && npm run test:db`.
  Plan and approvals: `docs/release/RELEASE.md` §2. Not in `supabase/migrations/`
  on purpose, so `supabase db push` can never apply them by accident.
- `proposals/` — the earlier 2026-10-09 WhatsApp proposals, **superseded** by
  `prepared/20261010_01` (kept for the record).
- `tests/` — the isolated test database (PGlite), fixture and tests.

Read `docs/data-integrity/README.md` for the findings, runbook, backup strategy
and verification steps. Never paste query results containing student data into
issues, chats or commits.
