/* Forms, bookings and Leads, completing 20271123_native_forms_leads.sql (part 372), which stays as it is. Run after part 372. Adds: lead notes and the block or page a response came from (only status and notes are writable by the owner; answers and consent stay immutable); a retention period per form; the delivery queue for owner emails, booking emails and signed webhooks, with retry timing and a lease so two workers never send the same job; private file uploads (the private `form-uploads` bucket, 4 MB (under the 4.5 MB request limit of a Vercel function), JPEG, PNG, WebP and PDF, no storage policy so only the server reads it, owner downloads go through short signed links); and appointment bookings with the double booking guard: one active booking per owner and start time (unique index) and no overlapping active bookings per owner (exclusion constraint, btree_gist), written together with the response by native_form_book in one transaction; a booking with a payment is held unpaid for 30 minutes and confirmed by the Stripe webhook only when product, currency and amount match. RLS on every new table, owner-scoped; visitors never touch a table directly. New tables and columns only; no existing row, column or policy is removed. Safe to run again. */

/* ── Leads: notes, source block, retention ───────────────────────────── */
alter table public.form_submissions add column if not exists notes text;
alter table public.form_submissions add column if not exists source_block text;
alter table public.form_submissions add column if not exists updated_at timestamptz;
do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'form_submissions_notes_len' and conrelid = 'public.form_submissions'::regclass) then
    alter table public.form_submissions add constraint form_submissions_notes_len check (notes is null or char_length(notes) <= 5000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'form_submissions_source_block_len' and conrelid = 'public.form_submissions'::regclass) then
    alter table public.form_submissions add constraint form_submissions_source_block_len check (source_block is null or char_length(source_block) <= 160);
  end if;
end $c$;
grant update (status, notes, updated_at) on public.form_submissions to authenticated;

alter table public.native_forms add column if not exists retention_days integer;
do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'native_forms_retention_days' and conrelid = 'public.native_forms'::regclass) then
    alter table public.native_forms add constraint native_forms_retention_days check (retention_days is null or retention_days between 7 and 3650);
  end if;
end $c$;

/* Leads search and filters, always inside one owner's rows. */
create index if not exists form_submissions_owner_form_time on public.form_submissions (owner_id, form_id, submitted_at desc, id desc);
create index if not exists form_submissions_owner_email on public.form_submissions (owner_id, lower(contact_email));
create index if not exists form_submissions_retention on public.form_submissions (form_id, submitted_at);

/* ── Delivery queue (form_integration_jobs from part 372, widened) ───── */
alter table public.form_integration_jobs add column if not exists next_attempt_at timestamptz not null default now();
alter table public.form_integration_jobs add column if not exists locked_until timestamptz;
alter table public.form_integration_jobs add column if not exists last_error text;
alter table public.form_integration_jobs add column if not exists delivered_at timestamptz;
alter table public.form_integration_jobs add column if not exists updated_at timestamptz not null default now();
do $c$ begin
  if exists (select 1 from pg_constraint where conname = 'form_integration_jobs_provider_check' and conrelid = 'public.form_integration_jobs'::regclass and pg_get_constraintdef(oid) not like '%owner_email%') then
    alter table public.form_integration_jobs drop constraint form_integration_jobs_provider_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'form_integration_jobs_provider_check' and conrelid = 'public.form_integration_jobs'::regclass) then
    alter table public.form_integration_jobs add constraint form_integration_jobs_provider_check check (provider in ('webhook', 'google_sheets', 'owner_email', 'visitor_email', 'booking_confirmed', 'booking_declined'));
  end if;
end $c$;
create index if not exists form_integration_jobs_due on public.form_integration_jobs (next_attempt_at) where state = 'ready';
create index if not exists form_integration_jobs_owner on public.form_integration_jobs (owner_id, created_at desc);
create index if not exists form_integration_jobs_form on public.form_integration_jobs (form_id);

/* ── Private uploads ──────────────────────────────────────────────────── */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('form-uploads', 'form-uploads', false, 4194304, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 4194304, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

create table if not exists public.form_uploads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  form_id uuid not null references public.native_forms(id) on delete cascade,
  submission_id uuid references public.form_submissions(id) on delete set null,
  field_id text not null check (char_length(field_id) <= 64),
  file_name text not null check (char_length(file_name) <= 200),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  bytes integer not null check (bytes > 0 and bytes <= 4194304),
  path text not null unique check (char_length(path) <= 300),
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index if not exists form_uploads_submission on public.form_uploads (submission_id);
create index if not exists form_uploads_owner on public.form_uploads (owner_id, created_at desc);
create index if not exists form_uploads_form on public.form_uploads (form_id);
create index if not exists form_uploads_sweep on public.form_uploads (created_at) where submission_id is null;
alter table public.form_uploads enable row level security;
revoke all on public.form_uploads from public, anon, authenticated;
grant select on public.form_uploads to authenticated;
grant all on public.form_uploads to service_role;

/* ── Bookings ─────────────────────────────────────────────────────────── */
create table if not exists public.form_bookings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  form_id uuid not null references public.native_forms(id) on delete cascade,
  submission_id uuid not null unique references public.form_submissions(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  hold_until timestamptz not null,
  visitor_timezone text check (visitor_timezone is null or char_length(visitor_timezone) <= 64),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  payment_product_id uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (ends_at > starts_at and hold_until >= ends_at)
);
create unique index if not exists form_bookings_owner_slot
  on public.form_bookings (owner_id, starts_at) where status in ('pending', 'confirmed');
create index if not exists form_bookings_owner_time on public.form_bookings (owner_id, starts_at);
create index if not exists form_bookings_form on public.form_bookings (form_id);

/* A booking paid through the product checkout: held unpaid until payment_due_at, confirmed by the Stripe webhook only when product, currency and amount match what the checkout recorded, cancelled on a full refund or when the hold runs out (lib/forms/booking-payment.ts). */
alter table public.form_bookings add column if not exists payment_status text not null default 'none';
alter table public.form_bookings add column if not exists payment_due_at timestamptz;
alter table public.form_bookings add column if not exists payment_amount_cents integer;
alter table public.form_bookings add column if not exists payment_currency text;
alter table public.form_bookings add column if not exists payment_intent_id text;
alter table public.form_bookings add column if not exists paid_at timestamptz;
alter table public.form_bookings add column if not exists payment_note text;
do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'form_bookings_payment_status' and conrelid = 'public.form_bookings'::regclass) then
    alter table public.form_bookings add constraint form_bookings_payment_status check (payment_status in ('none', 'unpaid', 'paid', 'failed', 'refunded', 'review'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'form_bookings_payment_fields' and conrelid = 'public.form_bookings'::regclass) then
    alter table public.form_bookings add constraint form_bookings_payment_fields check ((payment_amount_cents is null or payment_amount_cents > 0) and (payment_currency is null or char_length(payment_currency) = 3) and (payment_intent_id is null or char_length(payment_intent_id) <= 255) and (payment_note is null or char_length(payment_note) <= 500));
  end if;
end $c$;
create index if not exists form_bookings_payment_intent on public.form_bookings (payment_intent_id) where payment_intent_id is not null;
create index if not exists form_bookings_unpaid_due on public.form_bookings (payment_due_at) where status = 'pending' and payment_status in ('unpaid', 'failed');

/* No two active bookings of one owner may overlap, whatever their forms. Needs btree_gist; without it the unique index above still refuses the same start twice. */
do $x$ begin
  begin
    create extension if not exists btree_gist with schema extensions;
  exception when others then
    begin
      create extension if not exists btree_gist;
    exception when others then
      raise notice 'btree_gist is not available: only the same start time is guarded';
    end;
  end;
  if not exists (select 1 from pg_constraint where conname = 'form_bookings_no_overlap' and conrelid = 'public.form_bookings'::regclass) then
    begin
      alter table public.form_bookings add constraint form_bookings_no_overlap
        exclude using gist (owner_id with =, tstzrange(starts_at, hold_until) with &&) where (status in ('pending', 'confirmed'));
    exception when others then
      raise notice 'form_bookings_no_overlap was not added: %', sqlerrm;
    end;
  end if;
end $x$;

alter table public.form_bookings enable row level security;
revoke all on public.form_bookings from public, anon, authenticated;
grant select on public.form_bookings to authenticated;
grant update (status, decided_at) on public.form_bookings to authenticated;
grant all on public.form_bookings to service_role;

do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'form_uploads' and policyname = 'form_uploads_owner_read') then
    create policy form_uploads_owner_read on public.form_uploads for select to authenticated using (owner_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'form_bookings' and policyname = 'form_bookings_owner_read') then
    create policy form_bookings_owner_read on public.form_bookings for select to authenticated using (owner_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'form_bookings' and policyname = 'form_bookings_owner_decide') then
    create policy form_bookings_owner_decide on public.form_bookings for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;
end $p$;

/* A booking and its response in one transaction. The same submission UUID sent again returns the first response (duplicate = true) and books nothing. A slot another booking holds raises unique_violation (23505) or exclusion_violation (23P01) and the response is not kept either. Server only: the route checks the form, the answers and the slot first. */
create or replace function public.native_form_book(
  p_submission jsonb,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_hold_until timestamptz,
  p_visitor_timezone text,
  p_status text,
  p_payment_product_id uuid default null
) returns table (submission_id uuid, booking_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = public
as $f$
#variable_conflict use_column
declare
  v_owner uuid := (p_submission->>'owner_id')::uuid;
  v_form uuid := (p_submission->>'form_id')::uuid;
  v_key uuid := (p_submission->>'dedupe_key')::uuid;
  v_sub uuid;
  v_book uuid;
begin
  if p_status not in ('pending', 'confirmed') then
    raise exception 'invalid booking status' using errcode = '22023';
  end if;
  if not exists (select 1 from public.native_forms f where f.id = v_form and f.owner_id = v_owner and f.status = 'published') then
    raise exception 'form not found' using errcode = 'P0002';
  end if;
  insert into public.form_submissions (owner_id, form_id, form_revision, form_title, answers, contact_name, contact_email, contact_phone, score, consent, source_kind, source_url, source_block, dedupe_key)
  values (
    v_owner, v_form, (p_submission->>'form_revision')::integer, p_submission->>'form_title', p_submission->'answers',
    p_submission->>'contact_name', p_submission->>'contact_email', p_submission->>'contact_phone',
    coalesce((p_submission->>'score')::integer, 0), p_submission->'consent',
    coalesce(p_submission->>'source_kind', 'form'), p_submission->>'source_url', p_submission->>'source_block', v_key
  )
  on conflict (form_id, dedupe_key) do nothing
  returning id into v_sub;
  if v_sub is null then
    select s.id into v_sub from public.form_submissions s where s.form_id = v_form and s.dedupe_key = v_key;
    select b.id into v_book from public.form_bookings b where b.submission_id = v_sub;
    return query select v_sub, v_book, true;
    return;
  end if;
  insert into public.form_bookings (owner_id, form_id, submission_id, starts_at, ends_at, hold_until, visitor_timezone, status, payment_product_id, decided_at, payment_status, payment_due_at)
  values (
    v_owner, v_form, v_sub, p_starts_at, p_ends_at, p_hold_until, p_visitor_timezone,
    case when p_payment_product_id is not null then 'pending' else p_status end,
    p_payment_product_id,
    case when p_status = 'confirmed' and p_payment_product_id is null then now() end,
    case when p_payment_product_id is not null then 'unpaid' else 'none' end,
    case when p_payment_product_id is not null then now() + interval '30 minutes' end
  )
  returning id into v_book;
  return query select v_sub, v_book, false;
end
$f$;
revoke all on function public.native_form_book(jsonb, timestamptz, timestamptz, timestamptz, text, text, uuid) from public, anon, authenticated;
grant execute on function public.native_form_book(jsonb, timestamptz, timestamptz, timestamptz, text, text, uuid) to service_role;

notify pgrst, 'reload schema';
