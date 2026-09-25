-- ===========================================================================
--  Storelib: browser notifications that save, and a time zone on the account
-- ===========================================================================
--  Run once in the Supabase SQL editor (supabase/sql/run-now/22 is the same
--  statements, one per line). Idempotent. Changes no rows.
--
--  1. push_tokens accepts platform 'web'
--     "Notifications on this browser" in Settings, Privacy saves the
--     browser's subscription in push_tokens beside the phones' tokens. The
--     table was created with CHECK (platform IN ('ios', 'android')), so every
--     browser was refused (23514) and the switch said "Could not turn
--     notifications on". The check now lists 'web' too. Until this runs, the
--     route keeps a browser's subscription on the account instead
--     (app/api/push/web), so the switch works either way.
--
--  2. push_tokens(token) is unique
--     What the phones' registration upserts on. Created by
--     scripts/060_create_push_tokens.sql; made sure of here.
--
--  3. profiles.timezone
--     The time zone chosen in Settings, General, as an IANA name
--     ("Europe/Bucharest"). Read by the emails Storelib sends the creator
--     about a sale, so the time in them is theirs. Null until chosen, and set
--     to the browser's own zone the first time /app runs. The route also
--     keeps it on the account for pages that already have the user.
-- ===========================================================================

do $$
declare c record;
begin
  if to_regclass('public.push_tokens') is null then
    raise notice 'skipping push_tokens: the table does not exist here (scripts/060_create_push_tokens.sql)';
    return;
  end if;
  -- Every check on the platform column, whatever it was named when made.
  for c in select conname from pg_constraint where conrelid = 'public.push_tokens'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%platform%' loop
    execute format('alter table public.push_tokens drop constraint %I', c.conname);
  end loop;
  alter table public.push_tokens add constraint push_tokens_platform_check check (platform in ('ios', 'android', 'web'));
  create unique index if not exists push_tokens_token_idx on public.push_tokens (token);
end;
$$;

alter table public.profiles
  add column if not exists timezone text;

notify pgrst, 'reload schema';
