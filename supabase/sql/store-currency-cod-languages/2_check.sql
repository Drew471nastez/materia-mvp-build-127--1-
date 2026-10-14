-- STORELIB: STORE CURRENCY, CASH ON DELIVERY AND LANGUAGES, CHECKED
-- Read only. Every row should say true; a false names what to run again.

select 'store_settings.currency' as what, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'store_settings' and column_name = 'currency') as ok
union all select 'currency is a three letter code or empty', exists (select 1 from pg_constraint where conname = 'store_settings_currency_code')
union all select 'store_currency_changes', to_regclass('public.store_currency_changes') is not null
union all select 'store_currency_snapshots', to_regclass('public.store_currency_snapshots') is not null
union all select 'one change per request key', exists (select 1 from pg_constraint where conname = 'store_currency_changes_once')
union all select 'history tables have row level security on', coalesce((select bool_and(relrowsecurity) from pg_class where oid in ('public.store_currency_changes'::regclass, 'public.store_currency_snapshots'::regclass)), false)
union all select 'nobody but the server reads the history', not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name in ('store_currency_changes', 'store_currency_snapshots') and grantee in ('anon', 'authenticated'))
union all select 'store_change_currency', to_regprocedure('public.store_change_currency(uuid,text,text,text,numeric,date,text,uuid)') is not null
union all select 'store_currency_restore', to_regprocedure('public.store_currency_restore(uuid,uuid)') is not null
union all select 'only the server can change a currency', not has_function_privilege('anon', 'public.store_change_currency(uuid,text,text,text,numeric,date,text,uuid)', 'execute') and not has_function_privilege('authenticated', 'public.store_change_currency(uuid,text,text,text,numeric,date,text,uuid)', 'execute')
union all select 'cash on delivery: provider takes cod', to_regclass('public.commerce_checkouts') is null or exists (select 1 from pg_constraint where conname = 'commerce_checkouts_provider_check' and pg_get_constraintdef(oid) like '%cod%')
union all select 'cash on delivery: cod_collected_at', to_regclass('public.commerce_checkouts') is null or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'commerce_checkouts' and column_name = 'cod_collected_at')
union all select 'translate changes automatically', to_regclass('public.store_localization') is null or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'store_localization' and column_name = 'auto_translate')
union all select 'translate with AI in the background', to_regclass('public.store_translation_jobs') is not null
union all select 'nobody but the server reads translation jobs', to_regclass('public.store_translation_jobs') is null or not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'store_translation_jobs' and grantee in ('anon', 'authenticated'))
union all select 'translation memory, the permanent cache', to_regclass('public.translation_memory') is not null
union all select 'nobody but the server reads translation memory', to_regclass('public.translation_memory') is null or not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'translation_memory' and grantee in ('anon', 'authenticated'));

-- What stores sell in now (empty: the platform's currency, as before).
select coalesce(currency, '(platform)') as currency, count(*) as stores from public.store_settings group by 1 order by 2 desc;

-- Translations running in the background now, and the last of each.
select creator_id, locale, status, done, total, drafted, error, updated_at from public.store_translation_jobs order by updated_at desc limit 50;

-- How much the translation memory holds, by language pair.
select source_lang, target_lang, provider, count(*) as words from public.translation_memory group by 1, 2, 3 order by 4 desc limit 50;

-- Every currency change, newest first, and whether it was undone.
select creator_id, from_currency, to_currency, mode, rate, rate_as_of, counts, created_at, restored_at from public.store_currency_changes order by created_at desc limit 50;
