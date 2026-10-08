# supabase/ — reviewed SQL for the backend owner (nothing here is applied)

- `inspection/` — **read-only** queries (metadata, counts, record ids). Safe to run.
- `proposals/` — migrations that **end in `ROLLBACK`** by default, each with a
  rollback script. Change the final line to `COMMIT` only after approval,
  on staging first.

Read `docs/data-integrity/README.md` for the findings, runbook, backup strategy
and verification steps. Never paste query results containing student data into
issues, chats or commits.
