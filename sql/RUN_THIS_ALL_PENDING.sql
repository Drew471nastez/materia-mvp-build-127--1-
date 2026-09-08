-- ===========================================================================
--  STORELIB — EVERY PENDING MIGRATION, IN ONE SCRIPT
-- ===========================================================================
--  Paste the whole thing into the Supabase SQL editor and run it once.
--
--  SAFE TO RUN AGAIN. Every statement is guarded — `if not exists`, `add
--  column if not exists`, a policy that is only created when it is missing —
--  so running it twice changes nothing the second time.
--
--  SAFE TO RUN EARLY. Each part checks that the table it extends is actually
--  there (`to_regclass`) and skips itself if not, rather than aborting the
--  script and leaving half of it applied. A deployment missing the Sites
--  feature gets the theme-chat table and skips the rest.
--
--  It contains five things:
--    1. sites.document          — the canonical page/section/theme state
--    2. creator bans            — banned_at, the moderation log, and the
--                                 products status check a ban has to write
--    3. site_chat_messages.questions
--    4. site_agent_questions    — the row a waiting run and the browser share
--    5. theme_chat_messages     — the theme editor's conversation
--
--  Number 5 is the one behind "We could not load this conversation" in the
--  Ask Storelib panel.
-- ===========================================================================


-- ===========================================================================
--  1. THE CANONICAL WEBSITE STATE
-- ===========================================================================
-- Nullable, and null is a real answer. Every site that exists today is a code
-- project with no document, and it goes on being edited as files — this is
-- additive, not a migration of anything.
--
-- JSONB rather than tables because the whole document is read and written as
-- one unit by both editors, and a relational split would buy joins nobody
-- performs while making the compare-and-swap below span several rows.
do $$
begin
  if to_regclass('public.sites') is null then
    raise notice 'skipping 1: public.sites does not exist here';
    return;
  end if;

  alter table public.sites add column if not exists document jsonb;

  -- The compare-and-swap key. Every operation bumps document->>'revision', and
  -- a write only matches while the stored revision is still the one the writer
  -- saw — which is what stops a creator's drag and an agent run silently
  -- overwriting each other. Indexed because that expression is in the WHERE
  -- clause of every write.
  create index if not exists sites_document_revision_idx
    on public.sites (((document ->> 'revision')::int))
    where document is not null;

  comment on column public.sites.document is
    'Canonical page/section/theme state. The source; site_files rows are rendered from it.';
end $$;


-- ===========================================================================
--  2. BANNING A CREATOR, AS A FACT ON THE ROW RATHER THAN A DELETION
-- ===========================================================================
-- A ban and a delete are different tools and conflating them is how a mistake
-- becomes permanent: a ban is a judgement that can be reviewed, reversed and
-- explained, and it keeps the evidence that led to it. Deletion is for when
-- there is nothing worth keeping.
do $$
begin
  if to_regclass('public.creators') is null then
    raise notice 'skipping 2: public.creators does not exist here';
    return;
  end if;

  alter table public.creators
    add column if not exists banned_at timestamptz,
    add column if not exists banned_reason text;

  -- Every read that lists creators or their products filters on this, so it is
  -- the shape of the index: partial, because the banned set is the small one.
  create index if not exists creators_banned_at_idx
    on public.creators (banned_at)
    where banned_at is not null;

  comment on column public.creators.banned_at is
    'When an operator banned this creator. Null means active. Their products are set to unpublished at the same moment.';
end $$;

-- ---------------------------------------------------------------------------
--  WHO WAS REMOVED, AND BY WHOM
-- ---------------------------------------------------------------------------
-- Deletion cascades into auth.users and cannot be undone, so the one thing
-- that must survive it is the record that it happened. Without this, "where
-- did that account go" has no answer at all.
create table if not exists public.admin_moderation_log (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('ban', 'unban', 'delete')),
  creator_id uuid,
  user_id uuid,
  username text,
  reason text,
  -- Counts at the moment of the action: what was actually destroyed.
  products_affected int default 0,
  created_at timestamptz not null default now()
);

create index if not exists admin_moderation_log_created_idx
  on public.admin_moderation_log (created_at desc);

alter table public.admin_moderation_log enable row level security;

-- No policy: the service role writes it, and nothing else may read it. An
-- audit log a user can read is an audit log that tells somebody they were
-- reported.

-- ---------------------------------------------------------------------------
--  MAKING 'unpublished' LEGAL ON PRODUCTS
-- ---------------------------------------------------------------------------
-- scripts/003_create_products.sql declared:
--
--   status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published'))
--
-- and nothing since has widened it. `sites` and `theme_installs` both allow
-- 'unpublished' already, so the vocabulary existed everywhere EXCEPT the one
-- table a ban has to write to.
--
-- Without this, the ban's `update products set status = 'unpublished'` is a
-- 23514 check violation. postgrest-js does not throw on that, so the ban would
-- have reported success while every product stayed published and buyable — the
-- storefront closed and the shelves still full.
--
-- 'draft' would have avoided the migration, but it conflates "an operator took
-- this down" with "the creator has not finished it yet", and unbanning could
-- never tell them apart.
do $$
begin
  if to_regclass('public.products') is null then
    raise notice 'skipping 2b: public.products does not exist here';
    return;
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_status_check'
  ) then
    alter table public.products drop constraint products_status_check;
  end if;

  alter table public.products
    add constraint products_status_check
    check (status in ('draft', 'published', 'unpublished'));
end $$;


-- ===========================================================================
--  3. THE QUESTIONS THE AGENT ASKED, KEPT WITH THE MESSAGE THAT ASKED THEM
-- ===========================================================================
-- Without this they live only in the event stream: ask four questions, reload
-- the page before answering, and they are gone — along with any idea that the
-- agent wanted to know anything. The creator is then looking at a site full of
-- invented details and no explanation of which ones were invented.
--
-- Beside `steps` rather than in a table of their own. They belong to exactly
-- one message, they are read only with that message, and they are never
-- queried across messages — which is the shape of a column, not a relation.
do $$
begin
  if to_regclass('public.site_chat_messages') is null then
    raise notice 'skipping 3: public.site_chat_messages does not exist here';
    return;
  end if;

  alter table public.site_chat_messages
    add column if not exists questions jsonb not null default '[]'::jsonb;

  comment on column public.site_chat_messages.questions is
    'What the agent asked the creator during this run: [{id, question, why, suggestions, placeholder}]. Empty when it asked nothing.';
end $$;


-- ===========================================================================
--  4. A QUESTION THE RUN IS WAITING ON
-- ===========================================================================
-- The agent asks one thing, then STOPS AND WAITS. That needs somewhere for the
-- answer to land that is not the process doing the waiting: the browser posts
-- to one request and the run is blocked inside another, and on a serverless
-- platform those are not the same machine. A row both can see is the only
-- thing that works.
--
-- One row per question asked. The run inserts it and polls; the answer route
-- updates it; the run reads the update and carries on.
do $$
begin
  if to_regclass('public.sites') is null then
    raise notice 'skipping 4: public.sites does not exist here';
    return;
  end if;

  create table if not exists public.site_agent_questions (
    id uuid primary key default gen_random_uuid(),
    site_id uuid not null references public.sites(id) on delete cascade,
    run_id uuid not null,
    -- {id, question, why, suggestions, placeholder} — the shape the chat renders.
    question jsonb not null,
    answer text,
    -- Answered and skipped are different facts. A skip is a decision the
    -- creator made and the agent should hear about; a null answer is nobody
    -- home.
    skipped boolean not null default false,
    created_at timestamptz not null default now(),
    answered_at timestamptz
  );

  -- The poll is "this run, still unanswered", every second or so while
  -- somebody is thinking. Without this it is a sequential scan on every tick.
  create index if not exists site_agent_questions_pending_idx
    on public.site_agent_questions (run_id, created_at desc)
    where answered_at is null;

  create index if not exists site_agent_questions_site_idx
    on public.site_agent_questions (site_id, created_at desc);

  alter table public.site_agent_questions enable row level security;
end $$;

-- No policy, so only the service role reaches it. Both routes that touch this
-- already prove the creator owns the site before they get here — through the
-- user's own client, so RLS decides — and a second authorisation path over the
-- same data is a second place to get it wrong.


-- ===========================================================================
--  5. THE THEME EDITOR'S CONVERSATION, KEPT
-- ===========================================================================
--  THIS IS THE ONE BEHIND "We could not load this conversation."
--
-- It lived in React state and died on reload: ask for three changes, refresh,
-- and there was no record of what you had asked for or what it had done. The
-- sections survived — they are the site — but the reasoning behind them did
-- not, which is the question somebody actually has when they come back.
--
-- Modelled on site_chat_messages, deliberately: the same two-row-per-exchange
-- shape, the same "written server-side, never posted by the client" rule. A
-- client that writes its own transcript can write a transcript that never
-- happened.
do $$
begin
  if to_regclass('public.store_theme_installs') is null then
    raise notice 'skipping 5: public.store_theme_installs does not exist here';
    return;
  end if;

  create table if not exists public.theme_chat_messages (
    id uuid primary key default gen_random_uuid(),
    install_id uuid not null references public.store_theme_installs(id) on delete cascade,
    -- Which page the exchange was about. The same theme has several, and "make
    -- the hero shorter" means nothing without knowing which hero.
    page_key text not null default 'home',
    role text not null check (role in ('user', 'assistant')),
    content text not null default '',
    -- What actually changed, as the operations that were applied. Read back
    -- only with their message and never queried across messages, which is the
    -- shape of a column rather than a second table.
    ops jsonb not null default '[]',
    error text,
    created_at timestamptz not null default now()
  );

  create index if not exists theme_chat_messages_install_idx
    on public.theme_chat_messages (install_id, created_at);

  alter table public.theme_chat_messages enable row level security;
end $$;

-- Readable by the creator who owns the theme, through the same ownership path
-- every other theme table uses. The writes come from the service role in the
-- agent route, which has already proved ownership against the user's own
-- client before it gets there.
do $$
declare
  owned text := '
    install_id in (
      select i.id from public.store_theme_installs i
      join public.creators c on c.id = i.creator_id
      where c.user_id = auth.uid()
    )';
begin
  if to_regclass('public.theme_chat_messages') is null then
    return;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'theme_chat_messages' and policyname = 'tcm_own'
  ) then
    execute format('create policy tcm_own on public.theme_chat_messages using (%s) with check (%s)', owned, owned);
  end if;
end $$;


-- ===========================================================================
--  DID IT WORK?
-- ===========================================================================
-- Run this last. Every row should say `true`; a `false` names the part that
-- was skipped and why (its table was not there).
select 'sites.document'          as thing, to_regclass('public.sites') is null
       or exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'sites' and column_name = 'document') as ok
union all
select 'creators.banned_at',      to_regclass('public.creators') is null
       or exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'creators' and column_name = 'banned_at')
union all
select 'admin_moderation_log',    to_regclass('public.admin_moderation_log') is not null
union all
select 'site_chat_messages.questions', to_regclass('public.site_chat_messages') is null
       or exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'site_chat_messages' and column_name = 'questions')
union all
select 'site_agent_questions',    to_regclass('public.sites') is null
       or to_regclass('public.site_agent_questions') is not null
union all
select 'theme_chat_messages',     to_regclass('public.store_theme_installs') is null
       or to_regclass('public.theme_chat_messages') is not null;
