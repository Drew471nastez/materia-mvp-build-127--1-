-- ===========================================================================
--  Storelib: the privacy switch that is saved, and codes that cannot be guessed
-- ===========================================================================
--  Run once in the Supabase SQL editor (supabase/sql/RUN_ACCOUNT_PRIVACY.sql
--  is the same file). Idempotent. Adds three columns; changes no rows.
--
--  1. profiles.personalized_recommendations
--     The "Personalized recommendations" switch in Settings, Privacy. On by
--     default, as it has always behaved. Explore reads it before it builds
--     "For you" from somebody's purchases and wishlist. Written by the person
--     through the profile update policy that already covers their own row.
--
--  2. email_change_codes.current_email_code
--     Changing the account email now needs a code from the NEW address and a
--     code from the CURRENT one, so a session somebody else got hold of cannot
--     move the account to an address they control. Until this column exists
--     the route falls back to the new address's code alone, as before.
--
--  3. email_change_codes.attempts, account_delete_codes.attempts
--     Wrong guesses are counted. After five the code is thrown away and a new
--     one has to be sent, so a six digit code cannot be walked through.
-- ===========================================================================

alter table public.profiles
  add column if not exists personalized_recommendations boolean not null default true;

alter table public.email_change_codes
  add column if not exists current_email_code text;

alter table public.email_change_codes
  add column if not exists attempts integer not null default 0;

alter table public.account_delete_codes
  add column if not exists attempts integer not null default 0;
