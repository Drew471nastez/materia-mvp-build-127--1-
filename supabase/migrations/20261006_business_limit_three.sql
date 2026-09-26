-- =============================================================================
--  BUSINESS ACCOUNTS: ONE LOGIN, UP TO THREE BUSINESSES
-- =============================================================================
-- 20261001_business_accounts.sql let a login make one business beside its
-- first, with a unique key on business_links.owner_id. The owner asked for
-- three in all: the first, and two it makes. The number lives in the app as
-- MAX_BUSINESSES (lib/businesses/rules.ts); the database holds the same
-- number here, and tests/business-accounts.test.ts fails if they differ.
--
-- Run as part 38 in supabase/sql/run-now (the same statements, one per line).
-- Changes no rows. Needs 20261001_business_accounts.sql (part 26).

-- The owner's businesses are read by owner, oldest first (lib/businesses/
-- server businessGroup). The unique key dropped below was that index.
create index if not exists business_links_owner_created on public.business_links (owner_id, created_at);

-- The count. A login plus the businesses it already has, the row being
-- written aside (so an update of a row never counts itself), must stay
-- under three. The advisory lock is per owner and held to the end of the
-- transaction: two inserts for the same owner at once take turns, so the
-- second one counts the first and is refused. check_violation (23514) is
-- what the server reads as "you already have three" (lib/businesses/rules
-- linkRefusal).
create or replace function public.business_links_limit() returns trigger language plpgsql security definer set search_path = public as $$ begin perform pg_advisory_xact_lock(hashtextextended('business_links ' || new.owner_id::text, 0)); if 1 + (select count(*) from public.business_links where owner_id = new.owner_id and member_id <> new.member_id) >= 3 then raise exception 'One login can have at most 3 businesses' using errcode = 'check_violation', constraint = 'business_links_limit'; end if; return new; end; $$;
drop trigger if exists business_links_limit on public.business_links;
create trigger business_links_limit before insert or update of owner_id, member_id on public.business_links for each row execute function public.business_links_limit();

-- Only now the old one per login key goes, so there is no moment with no
-- limit at all, even when these lines are run one at a time.
alter table public.business_links drop constraint if exists business_links_one_per_owner;

notify pgrst, 'reload schema';
