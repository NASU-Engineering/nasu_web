# Engagement — Quizzes, Activities, XP, Levels, Leaderboards

**Status: proposal. Nothing here exists in the production database.** The preview
runs on mock data (`services/mock-engage.js`); the production adapter
(`services/supabase-engage.js`) answers `backend_required` for every call and the
UI shows "not live yet". Applying this schema needs backend-owner approval, a
reviewed migration and the usual dry run / rollback plan.

The rules are already implemented as pure, tested functions the server version
must match:

| Rule | Code | Tests |
|---|---|---|
| XP rules, idempotency, daily cap, levels, leaderboard | `assets/js/services/xp.js` | `tests/engagement.test.mjs` |
| Quiz window, attempt limit, scoring, answer stripping | `assets/js/services/quiz.js` | `tests/engagement.test.mjs` |

## 1. Principles

1. **Server-authoritative.** The browser never sends an XP amount, a score or a
   correct answer. It reports an action ("submit these answers for quiz Q") and
   a `SECURITY DEFINER` RPC decides what it is worth.
2. **Only meaningful actions earn XP.** Finishing a quiz, improving a best score,
   attending an activity (confirmed by an organiser). Never: page views,
   sign-ins, refreshes, opening resources.
3. **Exactly once.** Every award has an idempotency key; a unique index makes a
   duplicate award impossible, even under retries or double-clicks.
4. **Bounded.** A per-student daily cap (200 XP) limits damage from any bug or abuse.
5. **Private by default.** Leaderboards show "First L." only; students can opt out.

## 2. XP rules

| Event (`xp_events.type`) | Amount | Once per | Idempotency key |
|---|---|---|---|
| `quiz_completed` | 10 | quiz | `user:quiz_completed:quiz_id` |
| `quiz_score` | 2 per full 10 % of the score, **only the improvement over the previous best** (max 20 per quiz in total) | improvement | `user:quiz_score:quiz_id:best-<percent>` |
| `activity_completed` | per activity (`activities.xp`, default 30) | activity, after organiser confirmation | `user:activity_completed:activity_id` |

- Retaking a quiz with an equal or lower score earns nothing.
- Daily cap: the award is trimmed to what remains of 200 XP for that UTC day;
  at the cap the event is recorded as rejected (`reason = 'daily_cap'`) for audit.
- Levels: total XP needed for level *n* is `25 × (n − 1) × n` → 0, 50, 150, 300, 500, …
- Leaderboards (section, group, university): standard competition ranking
  (ties share a rank: 1, 2, 2, 4), opted-out students excluded.

## 3. Proposed schema (Postgres / Supabase)

```sql
-- Quizzes (authored by staff; questions hold the answers — never selectable by students)
create table quizzes (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null references subjects(id),
  week smallint not null check (week between 1 and 20),
  title text not null check (length(title) <= 160),
  time_limit_min smallint not null check (time_limit_min between 1 and 180),
  max_attempts smallint not null default 2 check (max_attempts between 1 and 10),
  opens_at timestamptz not null,
  closes_at timestamptz not null check (closes_at > opens_at),
  audience_group text, audience_section text,          -- null = everyone
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  position smallint not null,
  text text not null,
  options jsonb not null,            -- [{id, text}], 2–6 options
  answer text not null,              -- option id — server only
  explanation text,
  unique (quiz_id, position)
);
create table quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id),
  user_id uuid not null references profiles(id),
  attempt_no smallint not null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  answers jsonb,                     -- {question_id: option_id}
  correct smallint, total smallint, percent smallint,
  unique (quiz_id, user_id, attempt_no)
);

-- Activities
create table activities (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('workshop','competition','club','event')),
  title text not null, description text,
  starts_at timestamptz not null, location text,
  capacity int not null check (capacity > 0),
  xp smallint not null default 30 check (xp between 0 and 100),
  status text not null default 'draft' check (status in ('draft','published','cancelled')),
  created_by uuid not null references profiles(id)
);
create table activity_participants (
  activity_id uuid references activities(id),
  user_id uuid references profiles(id),
  joined_at timestamptz not null default now(),
  attended_confirmed_by uuid references profiles(id),   -- organiser/staff
  attended_confirmed_at timestamptz,
  primary key (activity_id, user_id)
);

-- XP ledger (append-only) and per-student settings
create table xp_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id),
  type text not null check (type in ('quiz_completed','quiz_score','activity_completed','adjustment')),
  source_id uuid not null,
  variant text,
  amount smallint not null check (amount between -200 and 200),
  idempotency_key text not null unique,      -- the "exactly once" guarantee
  awarded_by uuid,                            -- staff id for adjustments
  reason text,
  created_at timestamptz not null default now()
);
create index on xp_events (user_id, created_at);
create table engagement_settings (
  user_id uuid primary key references profiles(id),
  leaderboard_opt_out boolean not null default false
);
-- Leaderboard read model: a view (or materialised view refreshed every few minutes)
-- summing xp_events per user joined to profiles(group, section) and exposing only
-- user_id, public_name ("Sara M."), group, section, xp.
```

## 4. RLS and RPCs

All writes go through RPCs; tables have RLS enabled with no direct
insert/update/delete for students.

| RPC | Who | Does |
|---|---|---|
| `list_quizzes(subject_id?)` | student | published quizzes for the caller's audience + own attempt counts and best score — **no answers** |
| `start_quiz_attempt(quiz_id)` | student | checks window and attempt limit (`not_open` / `closed` / `limit`), creates the attempt, returns questions without answers |
| `submit_quiz_attempt(attempt_id, answers jsonb)` | student, own attempt | rejects late submissions (time limit + grace), scores on the server, writes XP events with idempotency keys and the daily cap, returns score, review (with answers and explanations, now that it is submitted) and XP awarded |
| `list_activities()` / `join_activity(id)` / `leave_activity(id)` | student | capacity and start-time checks in one transaction (`select … for update`) |
| `confirm_attendance(activity_id, user_ids[])` | organiser / admin | sets confirmation and awards activity XP (idempotent) |
| `get_my_progress()` | student | XP, level, ranks, recent XP |
| `get_leaderboard(scope)` | student | ranked rows for the caller's section / group / university; opted-out users removed |
| `admin_engagement_stats()` | admin | aggregates only |
| `admin_adjust_xp(user_id, amount, reason)` | admin | `adjustment` event, audit-logged, reason required |

- Every privileged RPC writes `audit_logs`.
- `quiz_questions.answer` is never exposed through a policy; only the RPCs read it.
- Rate limit `start_quiz_attempt` / `join_activity` per user (e.g. 30 calls / minute).

## 5. Anti-abuse checklist

- No XP for refreshing or viewing: there is no event type for it.
- Duplicate awards impossible: unique `idempotency_key`.
- Farming retakes impossible: score XP pays only improvements, attempts are limited.
- Time limit enforced on the server (`started_at + time_limit + 30 s grace`).
- Activity XP only after an organiser confirms attendance.
- Daily cap and admin-only, audited manual adjustments.
- Leaderboards show no full names, IDs or emails; opt-out respected.

## 6. Rollout

1. Backend owner reviews this proposal; migration written with dry run and rollback.
2. Apply to a staging project; run `tests/engagement.test.mjs` scenarios against the RPCs.
3. Replace the stubs in `supabase-engage.js` with RPC calls (same return shapes as the mock).
4. Enable per feature; the UI's "not live yet" state disappears automatically.
