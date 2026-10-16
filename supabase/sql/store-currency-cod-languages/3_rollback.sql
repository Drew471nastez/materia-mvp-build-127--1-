-- STORELIB: STORE CURRENCY, UNDONE
-- Read all of this before running any of it.
--
-- 1. FIRST, PUT PRICES BACK. A store that converted its prices has them in its
--    new currency. Dropping the history below loses the values they had, for
--    good. While the tables exist, undo each store's latest change (the same
--    as Undo in Settings, which offers it for a day). Its id is in
--    store_currency_changes. Repeat for a store with more than one change:
--    only the latest can be undone, then the one before it becomes the latest.
--
--      select public.store_currency_restore('<creator id>', '<change id>');
--
--    A "keep" change never moved a number: undoing it only puts the old
--    currency back.
--
-- 2. THEN THE CODE. Deploy the commit before this overhaul, or every website
--    keeps reading store_settings.currency. With the column gone the code
--    reads every store as the platform's currency, which is safe.
--
-- 3. THEN THE SCHEMA, in one transaction. IRREVERSIBLE: the change history and
--    the values kept for Undo are deleted, and every store's chosen currency is
--    forgotten. Orders, refunds and payouts are not touched: they keep the
--    currency they were made in.

begin;
drop table if exists public.store_translation_jobs;
drop function if exists public.store_currency_restore(uuid, uuid);
drop function if exists public.store_change_currency(uuid, text, text, text, numeric, date, text, uuid);
drop function if exists public.store_currency_targets();
drop table if exists public.store_currency_snapshots;
drop table if exists public.store_currency_changes;
alter table public.store_settings drop constraint if exists store_settings_currency_code;
alter table public.store_settings drop column if exists currency;
do $do$ begin if to_regclass('public.storelib_applied_parts') is not null then delete from public.storelib_applied_parts where part in ('176', '177'); end if; end $do$;
commit;
notify pgrst, 'reload schema';

-- Part 177's table only says where background translations stand: dropping it
-- loses that, never a translation (they are in store_translations), and the
-- page translates round by round again.
--
-- Part 186's two columns only say which stores have changes waiting to be
-- translated. Taking them away is harmless: the code reads their absence as
-- "work through the stores hourly", as before. Only if wanted:
--   alter table public.store_localization drop column if exists translate_dirty_at, drop column if exists translate_lease_until;
--
-- Part 203: the trigger only refuses an automatic write over the merchant's own
-- translation, and the column is a list that defaults to empty. Only if wanted:
--   drop trigger if exists site_translations_keep_manual on public.site_translations; drop function if exists public.site_translations_keep_manual();
--   alter table public.store_localization drop column if exists translation_glossary;
--
-- Parts 174 (cash on delivery) and 175 (translate automatically) are left in
-- place: they only allow more (a provider value, a column defaulting to off)
-- and the code before this overhaul already used them.
