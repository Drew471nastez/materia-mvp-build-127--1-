/* Storage safety, functions: the two open functions closed, path ownership checks, usage counts pending uploads. */
create or replace function public.ensure_storage_rls(p_bucket_id text) returns jsonb language plpgsql security definer set search_path = public as $$ begin return jsonb_build_object('bucket', p_bucket_id, 'created', '[]'::jsonb, 'note', 'policies are managed by migration'); end; $$;
revoke all on function public.ensure_storage_rls(text) from public, anon, authenticated;
grant execute on function public.ensure_storage_rls(text) to service_role;
create or replace function public.fix_storage_bucket_limit(p_bucket_id text, p_file_size_limit bigint default 0) returns void language plpgsql security definer set search_path = storage, public as $$ begin update storage.buckets set file_size_limit = nullif(p_file_size_limit, 0) where id = p_bucket_id; end; $$;
revoke all on function public.fix_storage_bucket_limit(text, bigint) from public, anon, authenticated;
grant execute on function public.fix_storage_bucket_limit(text, bigint) to service_role;
create or replace function public.storage_owns_path(p_name text) returns boolean language sql stable security definer set search_path = public as $$ select auth.uid() is not null and position('/' in coalesce(p_name, '')) > 1 and ( split_part(p_name, '/', 1) = auth.uid()::text or exists ( select 1 from public.creators c where c.user_id = auth.uid() and c.id::text = split_part(p_name, '/', 1) ) ); $$;
revoke all on function public.storage_owns_path(text) from public, anon;
grant execute on function public.storage_owns_path(text) to authenticated, service_role;
create or replace function public.storage_reserved_upload(p_bucket text, p_name text) returns boolean language plpgsql stable security definer set search_path = public as $$ begin if auth.uid() is null or to_regclass('public.digital_assets') is null then return false; end if; return exists ( select 1 from public.digital_assets da where da.file_path = p_name and coalesce(da.storage_bucket, 'digital-products') = p_bucket and da.uploaded_by = auth.uid() and da.upload_status = 'pending' ); end; $$;
revoke all on function public.storage_reserved_upload(text, text) from public, anon;
grant execute on function public.storage_reserved_upload(text, text) to authenticated, service_role;
create or replace function public.get_creator_storage_usage(p_creator_id uuid) returns bigint language plpgsql stable security definer set search_path = public as $$ begin if to_regclass('public.digital_assets') is null then return 0; end if; return ( select coalesce(sum(da.file_size), 0)::bigint from public.digital_assets da join public.products p on da.product_id = p.id where p.creator_id = p_creator_id and coalesce(da.upload_status, 'completed') in ('pending', 'completed') ); end; $$;
revoke all on function public.get_creator_storage_usage(uuid) from public, anon, authenticated;
grant execute on function public.get_creator_storage_usage(uuid) to service_role;
notify pgrst, 'reload schema';
