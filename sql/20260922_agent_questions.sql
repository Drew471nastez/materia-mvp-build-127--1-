-- ===========================================================================
--  A QUESTION THE RUN IS WAITING ON
-- ===========================================================================
-- The agent asks one thing, then STOPS AND WAITS. That needs somewhere for the
-- answer to land that is not the process doing the waiting: the browser posts
-- to one request and the run is blocked inside another, and on a serverless
-- platform those are not the same machine. A row both can see is the only
-- thing that works.
--
-- One row per question asked. The run inserts it and polls; the answer route
-- updates it; the run reads the update and carries on.
create table if not exists public.site_agent_questions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  run_id uuid not null,
  -- {id, question, why, suggestions, placeholder} — the shape the chat renders.
  question jsonb not null,
  answer text,
  -- Answered and skipped are different facts. A skip is a decision the creator
  -- made and the agent should hear about; a null answer is nobody home.
  skipped boolean not null default false,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

-- The poll is "this run, still unanswered", every second or so while somebody
-- is thinking. Without this it is a sequential scan on every tick.
create index if not exists site_agent_questions_pending_idx
  on public.site_agent_questions (run_id, created_at desc)
  where answered_at is null;

create index if not exists site_agent_questions_site_idx
  on public.site_agent_questions (site_id, created_at desc);

alter table public.site_agent_questions enable row level security;

-- No policy, so only the service role reaches it. Both routes that touch this
-- already prove the creator owns the site before they get here — through the
-- user's own client, so RLS decides — and a second authorisation path over the
-- same data is a second place to get it wrong.
