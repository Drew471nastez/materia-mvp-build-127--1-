/* Native forms/quizzes, private lead answers and prepared integrations. No anonymous direct table access. Public reads and writes use validated, rate-limited server routes. Owners see only their own definitions/leads. New tables only; no existing products, pages, contacts or orders change. Safe to run again. */
create table if not exists public.native_forms (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null default '' check (char_length(title)<=160),
 draft jsonb not null,
 published jsonb,
 revision integer not null default 0 check (revision>=0),
 status text not null default 'draft' check(status in ('draft','published','archived')),
 integration_settings jsonb not null default '{}',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists native_forms_owner_created on public.native_forms(owner_id,created_at desc);
create table if not exists public.form_submissions (
 id uuid primary key default gen_random_uuid(),
 form_id uuid not null references public.native_forms(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 form_revision integer not null,
 form_title text not null,
 answers jsonb not null,
 contact_name text,contact_email text,contact_phone text,
 score integer not null default 0,
 consent jsonb not null,
 status text not null default 'new' check(status in ('new','contacted','qualified','converted')),
 source_kind text not null default 'form' check(source_kind in ('onepage','website','creator_page','form')),
 source_url text check(char_length(source_url)<=2048),
 dedupe_key uuid not null,
 submitted_at timestamptz not null default now(),
 unique(form_id,dedupe_key)
);
create index if not exists form_submissions_owner_time on public.form_submissions(owner_id,submitted_at desc,id desc);
create index if not exists form_submissions_owner_status on public.form_submissions(owner_id,status,submitted_at desc);
create index if not exists form_submissions_form on public.form_submissions(form_id,submitted_at desc);
create table if not exists public.form_integration_jobs (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 form_id uuid not null references public.native_forms(id) on delete cascade,
 submission_id uuid not null references public.form_submissions(id) on delete cascade,
 provider text not null check(provider in ('webhook','google_sheets')),
 state text not null default 'pending_setup' check(state in ('pending_setup','ready','delivered','failed')),
 attempts integer not null default 0,
 created_at timestamptz not null default now(),
 unique(submission_id,provider)
);
alter table public.native_forms enable row level security;
alter table public.form_submissions enable row level security;
alter table public.form_integration_jobs enable row level security;
revoke all on public.native_forms,public.form_submissions,public.form_integration_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.native_forms to authenticated;
grant select,delete on public.form_submissions to authenticated;
grant update(status) on public.form_submissions to authenticated;
grant select on public.form_integration_jobs to authenticated;
grant all on public.native_forms,public.form_submissions,public.form_integration_jobs to service_role;
do $f$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='native_forms' and policyname='native_forms_owner') then
 create policy native_forms_owner on public.native_forms for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid()); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='form_submissions' and policyname='form_leads_owner_read') then
 create policy form_leads_owner_read on public.form_submissions for select to authenticated using(owner_id=auth.uid()); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='form_submissions' and policyname='form_leads_owner_update') then
 create policy form_leads_owner_update on public.form_submissions for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid() and exists(select 1 from public.native_forms f where f.id=form_id and f.owner_id=auth.uid())); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='form_submissions' and policyname='form_leads_owner_delete') then
 create policy form_leads_owner_delete on public.form_submissions for delete to authenticated using(owner_id=auth.uid()); end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='form_integration_jobs' and policyname='form_jobs_owner_read') then
 create policy form_jobs_owner_read on public.form_integration_jobs for select to authenticated using(owner_id=auth.uid()); end if;
end $f$;
notify pgrst, 'reload schema';
