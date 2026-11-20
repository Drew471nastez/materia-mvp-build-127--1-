/* Part 475: Calendly and Cal.com bookings in Storelib. Two new tables. public.external_booking_connections keeps one row per store and provider ('calendly' or 'calcom'): the store owner's account (owner_id), the unguessable part of the webhook address Storelib gave the provider (hook_id), how it was connected ('api', subscription made by Storelib with the creator's token or key, or 'manual', webhook pasted by the creator), the token or key and the signing secret sealed by the server (secret_ciphertext, AES-256-GCM, 'v1.' prefix), the provider's own id for the subscription (remote_webhook_id, removed again on disconnect), and the last event and problem. Server only: row level security on, no policy, nothing granted to anon or authenticated. public.external_bookings keeps each booking made on Calendly or Cal.com: who booked (invitee_name, invitee_email), when (starts_at, ends_at, timezone), what (event_name), its state ('confirmed', 'cancelled', or 'rescheduled' for a booking moved to a new one, linked both ways by rescheduled_to and rescheduled_from), one row per owner, source and the provider's own booking id (external_id: Calendly's invitee URI, Cal.com's booking uid), so an event sent twice changes nothing. The owner reads their own rows (external_bookings_owner_read, owner_id = auth.uid(), as form_bookings_owner_read); only the service role writes. Additive: no existing table or row changes. Until it runs, Bookings shows native bookings only and connecting says this part is needed. Safe to run again. */
create table if not exists public.external_booking_connections (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('calendly', 'calcom')),
  hook_id text not null check (hook_id ~ '^[A-Za-z0-9_-]{24,64}$'),
  mode text not null default 'api' check (mode in ('api', 'manual')),
  status text not null default 'connected' check (status in ('connected', 'waiting')),
  secret_ciphertext text check (secret_ciphertext is null or secret_ciphertext like 'v1.%'),
  remote_webhook_id text check (remote_webhook_id is null or length(remote_webhook_id) <= 500),
  account_label text check (account_label is null or length(account_label) <= 200),
  last_event_at timestamptz,
  last_error text check (last_error is null or length(last_error) <= 500),
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_booking_connections_one_per_provider unique (creator_id, provider),
  constraint external_booking_connections_hook_unique unique (hook_id)
);
alter table public.external_booking_connections enable row level security;
revoke all on public.external_booking_connections from public, anon, authenticated;
grant select, insert, update, delete on public.external_booking_connections to service_role;

create table if not exists public.external_bookings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  source text not null check (source in ('calendly', 'calcom')),
  external_id text not null check (length(external_id) between 1 and 500),
  external_event_id text check (external_event_id is null or length(external_event_id) <= 500),
  event_name text check (event_name is null or length(event_name) <= 300),
  invitee_name text check (invitee_name is null or length(invitee_name) <= 200),
  invitee_email text check (invitee_email is null or length(invitee_email) <= 320),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text check (timezone is null or length(timezone) <= 80),
  location text check (location is null or length(location) <= 500),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'rescheduled')),
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 500),
  cancelled_by text check (cancelled_by is null or length(cancelled_by) <= 200),
  rescheduled_to text check (rescheduled_to is null or length(rescheduled_to) <= 500),
  rescheduled_from text check (rescheduled_from is null or length(rescheduled_from) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_bookings_time check (ends_at >= starts_at),
  constraint external_bookings_once unique (owner_id, source, external_id)
);
create index if not exists external_bookings_owner_start_idx on public.external_bookings (owner_id, starts_at);
alter table public.external_bookings enable row level security;
revoke all on public.external_bookings from public, anon, authenticated;
grant select on public.external_bookings to authenticated;
grant all on public.external_bookings to service_role;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'external_bookings' and policyname = 'external_bookings_owner_read') then
    create policy external_bookings_owner_read on public.external_bookings for select to authenticated using (owner_id = auth.uid());
  end if;
end $p$;
notify pgrst, 'reload schema';
