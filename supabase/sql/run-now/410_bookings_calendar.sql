/* Bookings, round AR, part 410 (run after part 375): what a booking needs to be moved, called off and kept in a Google Calendar. form_bookings takes its own length, where it happens (the video link, the Google Meet, the phone or the address, kept with the booking so a later change to the form never rewrites a booked call), who called it off and why, when it was last moved and how often, its Google Calendar event, and an updated time. google_calendar_connections keeps one Google account per creator: the refresh token sealed on the server (AES-256-GCM, lib/physical/secrets.ts, the way integration secrets are kept), the calendars whose busy times block bookings, and the calendar new bookings are written to; no browser reads it, the server reads it for the signed in owner only. native_form_book_capped books like native_form_book under a per owner lock, so a daily limit cannot be passed by two visitors at once. New table, columns and function only; no row, column or policy is removed. Safe to run again. */
alter table public.form_bookings add column if not exists duration_minutes integer;
alter table public.form_bookings add column if not exists location jsonb;
alter table public.form_bookings add column if not exists cancelled_by text;
alter table public.form_bookings add column if not exists cancel_reason text;
alter table public.form_bookings add column if not exists rescheduled_at timestamptz;
alter table public.form_bookings add column if not exists reschedule_count integer not null default 0;
alter table public.form_bookings add column if not exists google_event_id text;
alter table public.form_bookings add column if not exists google_calendar_id text;
alter table public.form_bookings add column if not exists updated_at timestamptz;
do $c$ begin if not exists (select 1 from pg_constraint where conname = 'form_bookings_round_ar_fields' and conrelid = 'public.form_bookings'::regclass) then alter table public.form_bookings add constraint form_bookings_round_ar_fields check ((duration_minutes is null or duration_minutes between 5 and 480) and (cancelled_by is null or cancelled_by in ('owner', 'visitor', 'system')) and (cancel_reason is null or char_length(cancel_reason) <= 500) and (google_event_id is null or char_length(google_event_id) <= 1024) and (google_calendar_id is null or char_length(google_calendar_id) <= 1024) and reschedule_count between 0 and 1000 and (location is null or pg_column_size(location) <= 4096)); end if; end $c$;
create index if not exists form_bookings_form_time on public.form_bookings (form_id, starts_at) where status in ('pending', 'confirmed');
create index if not exists form_bookings_owner_upcoming on public.form_bookings (owner_id, starts_at desc, id desc);

create table if not exists public.google_calendar_connections (owner_id uuid primary key references auth.users(id) on delete cascade, google_email text check (google_email is null or char_length(google_email) <= 320), refresh_token_sealed text not null check (char_length(refresh_token_sealed) <= 4096), access_token_sealed text check (access_token_sealed is null or char_length(access_token_sealed) <= 8192), access_expires_at timestamptz, scopes text check (scopes is null or char_length(scopes) <= 2000), busy_calendar_ids jsonb not null default '["primary"]'::jsonb check (jsonb_typeof(busy_calendar_ids) = 'array' and jsonb_array_length(busy_calendar_ids) <= 20), write_calendar_id text not null default 'primary' check (char_length(write_calendar_id) <= 1024), status text not null default 'connected' check (status in ('connected', 'needs_reconnect')), last_error text check (last_error is null or char_length(last_error) <= 500), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.google_calendar_connections enable row level security;
revoke all on public.google_calendar_connections from public, anon, authenticated;
grant all on public.google_calendar_connections to service_role;

/* The same booking as native_form_book, after taking a lock for this owner and counting the form's active bookings between p_day_start and p_day_end: at p_max_per_day or more it raises check_violation (23514) and keeps nothing. Server only. */
create or replace function public.native_form_book_capped(
  p_submission jsonb,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_hold_until timestamptz,
  p_visitor_timezone text,
  p_status text,
  p_payment_product_id uuid,
  p_max_per_day integer,
  p_day_start timestamptz,
  p_day_end timestamptz,
  p_duration_minutes integer,
  p_location jsonb
) returns table (submission_id uuid, booking_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = public
as $f$
#variable_conflict use_column
declare
  v_owner uuid := (p_submission->>'owner_id')::uuid;
  v_form uuid := (p_submission->>'form_id')::uuid;
  v_taken integer;
  r record;
begin
  perform pg_advisory_xact_lock(hashtextextended('form_bookings:' || v_owner::text, 0));
  /* The same submission sent again is answered by native_form_book with the first result, so it is never counted against the day. */
  if coalesce(p_max_per_day, 0) > 0 and not exists (select 1 from public.form_submissions s where s.form_id = v_form and s.dedupe_key = (p_submission->>'dedupe_key')::uuid) then
    select count(*) into v_taken from public.form_bookings b where b.form_id = v_form and b.status in ('pending', 'confirmed') and b.starts_at >= p_day_start and b.starts_at < p_day_end;
    if v_taken >= p_max_per_day then
      raise exception 'daily limit reached' using errcode = '23514';
    end if;
  end if;
  for r in select * from public.native_form_book(p_submission, p_starts_at, p_ends_at, p_hold_until, p_visitor_timezone, p_status, p_payment_product_id) loop
    if r.booking_id is not null and not r.duplicate then
      update public.form_bookings set duration_minutes = p_duration_minutes, location = p_location, updated_at = now() where id = r.booking_id;
    end if;
    return query select r.submission_id, r.booking_id, r.duplicate;
  end loop;
end
$f$;
revoke all on function public.native_form_book_capped(jsonb, timestamptz, timestamptz, timestamptz, text, text, uuid, integer, timestamptz, timestamptz, integer, jsonb) from public, anon, authenticated;
grant execute on function public.native_form_book_capped(jsonb, timestamptz, timestamptz, timestamptz, text, text, uuid, integer, timestamptz, timestamptz, integer, jsonb) to service_role;

notify pgrst, 'reload schema';
