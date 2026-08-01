-- storelib — the official Storelib account, sitting in every inbox.
--
-- Storelib itself should be a correspondent: it sends product news and selling
-- tips, and people can write back to it for support. That thread is about
-- nothing in particular — there is no listing behind it — which is the one
-- shape 20260802_messages_offers.sql did not allow, so this migration widens
-- the schema by exactly that much. Safe to run more than once.

-- A system thread has no item. listing_id stays a foreign key to products; it
-- just stops being mandatory, so a conversation can exist without one.
alter table public.conversations
  alter column listing_id drop not null;

-- Which of the two shapes a row is. Everything written before today is a
-- listing thread, and the default keeps the buyer→seller insert in
-- app/api/messages/route.ts correct without that route knowing this column
-- exists. `if not exists` skips the CHECK too on a re-run, which is what makes
-- the whole statement idempotent.
alter table public.conversations
  add column if not exists kind text not null default 'listing'
    check (kind in ('listing', 'system'));

-- The table's `unique (listing_id, buyer_id)` cannot police system rows: NULLs
-- are never equal to one another in a unique index, so every system thread
-- would read as distinct and a user could accumulate dozens. This partial
-- index is the real rule — one Storelib thread per person — and the
-- find-or-create in lib/system-account.ts leans on it to survive two requests
-- racing on a first page load.
create unique index if not exists conversations_system_unique
  on public.conversations (buyer_id)
  where kind = 'system';

-- The blue check. A boolean rather than a roles table, because "official" is
-- one bit about a handful of accounts and the inbox reads it in the same trip
-- that already fetches the display name.
alter table public.profiles
  add column if not exists is_official boolean not null default false;

-- Row-level security needs no change here, and that is worth stating rather
-- than assuming:
--
--   conversations_select is (auth.uid() = buyer_id or auth.uid() = seller_id).
--   A person is the buyer_id on their own system thread, so they read it.
--
--   messages_select and messages_insert both test membership of the parent
--   conversation, so replying to Storelib is an ordinary message, and
--   messages_update lets the reader mark Storelib's messages read exactly the
--   way they mark a seller's.
--
--   conversations_insert (auth.uid() = buyer_id) is deliberately left alone.
--   System threads are created server-side with the service role, which
--   bypasses RLS entirely, so loosening this policy would buy nothing and
--   would only widen what a client is able to forge.
--
-- One inherited constraint does bite, and lib/system-account.ts respects it:
-- conversations_distinct_parties (buyer_id <> seller_id) means the Storelib
-- account cannot hold a system thread with itself. It is skipped rather than
-- special-cased.

-- ---------------------------------------------------------------------------
-- Operator step, deliberately not automated.
--
-- Pick the auth user that IS Storelib and mark its profile. Nothing above
-- invents that account: a uuid guessed in a migration would silently promote
-- somebody else's profile to official, and there is no undoing that quietly.
--
--   update public.profiles
--      set is_official  = true,
--          display_name = 'Storelib',
--          username     = 'storelib'
--    where id = '<uuid of the Storelib auth user>';
--
-- Then either set STORELIB_SYSTEM_USER_ID to that same uuid, or leave it unset
-- and let lib/system-account.ts find the flagged row on its own. Note that it
-- keys off is_official and not off the username: nothing reserves "storelib"
-- as a handle today, so the flag — which only this statement can set — is what
-- actually confers the identity.
--
-- Until one of those is true the feature is inert on purpose: no system thread
-- is created, no blue check renders, and the inbox behaves exactly as it did
-- before this file ran.
-- ---------------------------------------------------------------------------
