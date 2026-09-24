-- ===========================================================================
--  TWO CHECKS THAT REFUSE WHAT THE APP WRITES
-- ===========================================================================
--  Run this in the Supabase SQL editor. Safe to run more than once.
--
--  1. analytics_events only accepted the event names of an older tracker.
--     The checkout funnel writes buy_click, checkout_complete and download,
--     and every one of those was refused (the production log shows
--     "violates check constraint analytics_events_event_type_check"), so the
--     "Pressed Buy" step of the funnel in Analytics could only ever read 0.
--
--  2. email_logs refused a buyer_download row, so a receipt that went out
--     left no record, and the duplicate guard that reads those rows had
--     nothing to read.
--
--  Both checks are rebuilt to list every name the app writes. NOT VALID: new
--  rows are checked, rows already stored are left exactly as they are, so
--  this cannot fail on old data.
-- ===========================================================================

alter table public.analytics_events
  drop constraint if exists analytics_events_event_type_check;
alter table public.analytics_events
  add constraint analytics_events_event_type_check
  check (event_type in (
    'view', 'purchase', 'session_start', 'store_view', 'product_view', 'add_to_cart',
    'checkout_start', 'buy_click', 'checkout_complete', 'download'
  )) not valid;

alter table public.email_logs
  drop constraint if exists email_logs_email_type_check;
alter table public.email_logs
  add constraint email_logs_email_type_check
  check (email_type in ('buyer_download', 'seller_notification', 'receipt_resend')) not valid;
