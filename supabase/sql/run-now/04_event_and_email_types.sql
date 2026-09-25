/* Tracking events and receipt email records the database was refusing. Old rows are not rechecked. */
alter table public.analytics_events drop constraint if exists analytics_events_event_type_check;
alter table public.analytics_events add constraint analytics_events_event_type_check check (event_type in ( 'view', 'purchase', 'session_start', 'store_view', 'product_view', 'add_to_cart', 'checkout_start', 'buy_click', 'checkout_complete', 'download' )) not valid;
alter table public.email_logs drop constraint if exists email_logs_email_type_check;
alter table public.email_logs add constraint email_logs_email_type_check check (email_type in ('buyer_download', 'seller_notification', 'receipt_resend')) not valid;
