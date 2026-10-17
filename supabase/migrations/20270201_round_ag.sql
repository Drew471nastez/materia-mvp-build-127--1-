-- Round AG: community plans and memberships. Safe to run again.

-- A free trial is none, or 7 to 90 days. Plans saved with a shorter trial get 7 (the app already treats them as 7).
UPDATE public.membership_plans SET trial_days = 7, updated_at = now() WHERE trial_days BETWEEN 1 AND 6;
ALTER TABLE public.membership_plans DROP CONSTRAINT IF EXISTS membership_plans_trial;
ALTER TABLE public.membership_plans ADD CONSTRAINT membership_plans_trial CHECK (trial_days = 0 OR trial_days BETWEEN 7 AND 90);

-- A deleted account's email can sign up again. A closed sign in account kept its Google (and other) identities with the
-- real address, and Supabase counts an identity's address as taken. The server calls this after closing an account.
CREATE OR REPLACE FUNCTION public.storelib_release_auth_identities(p_user uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$ DECLARE v_email text; n integer; BEGIN SELECT email INTO v_email FROM auth.users WHERE id = p_user; IF v_email IS NULL OR v_email NOT LIKE 'deleted-%@deleted.storelib.invalid' THEN RAISE EXCEPTION 'storelib: only a closed account''s sign in methods are released'; END IF; DELETE FROM auth.identities WHERE user_id = p_user AND provider <> 'email'; GET DIAGNOSTICS n = ROW_COUNT; UPDATE auth.identities SET identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(v_email)), updated_at = now() WHERE user_id = p_user AND provider = 'email'; RETURN n; END $fn$;
REVOKE ALL ON FUNCTION public.storelib_release_auth_identities(uuid) FROM PUBLIC;
DO $do$ BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.storelib_release_auth_identities(uuid) FROM anon, authenticated'; EXCEPTION WHEN undefined_object THEN NULL; END $do$;
GRANT EXECUTE ON FUNCTION public.storelib_release_auth_identities(uuid) TO service_role;
-- Accounts deleted before this fix: a full delete that failed left the sign in account with the real address. Closed now (only where the profile is gone, so nobody who signed back in is touched).
DO $do$ BEGIN IF to_regclass('public.account_deletions') IS NULL THEN RETURN; END IF; UPDATE auth.users u SET email = 'deleted-' || u.id || '@deleted.storelib.invalid', banned_until = now() + interval '100 years', raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || '{"deleted": true}'::jsonb, updated_at = now() WHERE u.email NOT LIKE 'deleted-%@deleted.storelib.invalid' AND EXISTS (SELECT 1 FROM public.account_deletions d WHERE d.user_id = u.id AND d.mode = 'removed') AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id); END $do$;
-- Every closed account lets go of its other sign in methods and of the real address on its email one.
DELETE FROM auth.identities i USING auth.users u WHERE i.user_id = u.id AND u.email LIKE 'deleted-%@deleted.storelib.invalid' AND i.provider <> 'email';
UPDATE auth.identities i SET identity_data = jsonb_set(coalesce(i.identity_data, '{}'::jsonb), '{email}', to_jsonb(u.email)), updated_at = now() FROM auth.users u WHERE i.user_id = u.id AND u.email LIKE 'deleted-%@deleted.storelib.invalid' AND i.provider = 'email' AND coalesce(i.identity_data->>'email', '') <> u.email;
-- No closed account stays in a community's member list.
DELETE FROM public.community_members m USING auth.users u WHERE m.user_id = u.id AND u.email LIKE 'deleted-%@deleted.storelib.invalid' AND m.role <> 'owner';

-- A product photo whose name has a space is stored in pages and rows as %20. The cleanup now also looks for that form,
-- so it never takes such a photo for one nothing uses (same function as part 18, one check added to each image rule).
create or replace function public.storage_cleanup_candidates(p_limit integer default 200, p_image_from_days integer default 32)
returns table (bucket_id text, name text, reason text)
language plpgsql
stable
security definer
set search_path = public, storage
as $$
begin
  if to_regclass('public.digital_assets') is null or to_regclass('public.product_bundles') is null then
    return;
  end if;
  return query
  with imports as (
    select o.bucket_id::text, o.name::text, 'theme-import'::text as reason, o.created_at
      from storage.objects o
     where o.bucket_id = 'digital-products'
       and o.name ~ '^[0-9a-fA-F-]{36}/theme-imports/[0-9a-fA-F-]{36}\.zip$'
       and o.created_at < now() - interval '1 day'
     order by o.created_at
     limit p_limit
  ),
  digital as (
    select o.bucket_id::text, o.name::text, 'digital-orphan'::text, o.created_at
      from storage.objects o
     where o.bucket_id in ('digital-products', 'product-files')
       and (o.name like '%/digital-products/%' or o.name like 'products/%')
       and o.created_at < now() - interval '3 days'
       and not exists (
         select 1 from public.digital_assets da
          where da.file_path in (o.name, o.bucket_id || '/' || o.name)
       )
       and not exists (
         select 1 from public.digital_assets da
          where da.file_path like '%://%' and position(o.name in da.file_path) > 0
       )
     order by o.created_at
     limit p_limit
  ),
  bundles as (
    select o.bucket_id::text, o.name::text, 'bundle-orphan'::text, o.created_at
      from storage.objects o
     where o.bucket_id = 'digital-products'
       and o.name like '%/bundles/%.zip'
       and o.created_at < now() - interval '3 days'
       and not exists (select 1 from public.product_bundles pb where pb.zip_path = o.name)
     order by o.created_at
     limit p_limit
  ),
  descriptions as (
    select o.bucket_id::text, o.name::text, 'description-image'::text, o.created_at
      from storage.objects o
     where o.bucket_id = 'product-images'
       and o.name like '%\_description\_%' escape '\'
       and o.created_at < now() - interval '14 days'
       and o.created_at > now() - make_interval(days => greatest(p_image_from_days, 15))
       and not public.storage_object_referenced(o.bucket_id, o.name)
       and not public.storage_object_referenced(o.bucket_id, replace(o.name, ' ', '%20'))
     order by o.created_at
     limit p_limit
  ),
  removed as (
    select o.bucket_id::text, o.name::text, 'removed-image'::text, o.created_at
      from storage.objects o
     where o.bucket_id = 'product-images'
       and o.name ~ '^[0-9a-fA-F-]{36}/([0-9a-fA-F-]{36}|temp)/'
       and o.name not like '%\_description\_%' escape '\'
       and o.created_at < now() - interval '30 days'
       and o.created_at > now() - make_interval(days => greatest(p_image_from_days, 31))
       and not public.storage_object_referenced(o.bucket_id, o.name)
       and not public.storage_object_referenced(o.bucket_id, replace(o.name, ' ', '%20'))
     order by o.created_at
     limit p_limit
  )
  select c.bucket_id, c.name, c.reason
    from (
      select * from imports
      union all select * from digital
      union all select * from bundles
      union all select * from descriptions
      union all select * from removed
    ) c
   order by c.created_at
   limit p_limit;
end;
$$;

