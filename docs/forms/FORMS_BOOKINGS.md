# Forms, bookings and Leads

One engine (`lib/forms/definition.ts`) defines, renders and validates every form. The OnePage block, the website section (`NativeFormSection`) and the creator page section all render `components/forms/native-form-block.tsx`, shown as a card, inline, expandable or a button with a pop-up.

## Database

Run SQL part **375** (`supabase/sql/run-now/375_forms_bookings.sql`, the same file as `supabase/migrations/20271130_forms_bookings.sql`) after part 372. Until it runs, forms keep working without notes, bookings, file answers, retention or delivery retries, and the screens that need them say so.

`node scripts/check-forms-sql.mjs` runs parts 372 and 375 (twice) on a real Postgres and checks RLS, column grants and the double booking guard. It needs `FORMS_PG_HOST` (and `FORMS_PG_PORT`).

## Public submissions

`POST /api/forms/<id>/submit` is the only way a response is kept. In order: a rate limit per address and one per address and form, a 96 KB body cap, the honeypot (a bot is thanked, nothing is kept), a minimum and maximum time the form was open, the consent tick, the published revision, then every answer checked against the definition with only the questions the visitor's answers make visible. A browser's submission UUID makes a retry return the first result. Owners come from the form row, never the request.

Files go through `POST /api/forms/<id>/upload`: JPEG, PNG, WebP (decided by their bytes, drawn again without metadata, as cart uploads are) and PDF without scripts or attachments, up to 4 MB (a Vercel function accepts 4.5 MB per request). They are kept in the private `form-uploads` bucket and opened by the owner through a one minute signed link.

## Bookings

Weekly hours in the owner's time zone become exact instants per date (`lib/forms/slots.ts`), so 09:00 stays 09:00 across daylight saving changes; visitors see times in their own zone. The submit route only accepts a time the same function offers, and `native_form_book` keeps the response and the booking in one transaction. Postgres refuses a second active booking at the same start (unique index) or overlapping one (exclusion constraint with btree_gist), and the route answers 409 with new times.

With "Confirm each request myself" on, requests wait in Leads; Confirm or Decline emails the visitor once. Off, a free time is confirmed at once.

For Calendly or another booking page, use a button action of type Appointment instead.

### Payment

A booking form can name a product. Such a booking is kept as pending and unpaid, and its time is held for 30 minutes (`payment_due_at`). The visitor's Pay button opens the product's normal checkout with `&booking=<token>`, the booking id signed for that product (`lib/forms/booking-payment.ts`).

- `/api/checkout/stripe-session` checks the token, that the booking is still held and unpaid, and that it belongs to this product. It records the amount and currency it is about to charge on the booking, extends the hold to at least 15 more minutes (never past 2 hours from booking), and adds `form_booking` and `form_booking_amount` to the PaymentIntent metadata.
- The existing Stripe webhook, on `payment_intent.succeeded`, confirms the booking only when the product, the currency and the full amount match what the checkout recorded. A repeated event changes nothing, and the visitor's confirmation email is one job per booking. A mismatch is kept as "Payment needs a look" for the owner and never confirms.
- `payment_intent.payment_failed` marks it failed and leaves it unconfirmed. A full refund (`charge.refunded`) cancels it and frees the time.
- An unpaid hold that runs out is cancelled by `/api/cron/notify`, and by the slots and submit routes of that form before they read busy times, so the time is free again. A payment that lands after that confirms only if the time is still free; otherwise it is flagged for the owner to refund.

With a payment, "Confirm each request myself" does not apply: paying confirms the booking. A free product cannot pay a booking (the free checkout path does not carry it), so its bookings run out unpaid; use no payment instead.

## Leads

Audience › Leads lists responses with contact details, answers, files, source (OnePage, website, creator page or form link, plus the block's title and the page), timestamps, status (New, Contacted, Qualified, Converted), notes and bookings. Filters (form, status, source, dates) and search run on the server inside the owner's rows. CSV export uses the same filters, and every cell starting with `=`, `+`, `-`, `@`, a tab or a return is written as text.

A lead can be deleted, or every lead of one form; a form can keep responses for a set number of days, and the cron removes older ones with their files.

## Deliveries

Each response queues its deliveries once (`form_integration_jobs`, one row per response and kind): the owner's email, a booking decision email, the webhook. They run right after the response and again from `/api/cron/notify`, with a lease so two workers never take the same job, retried after 1 min, 5 min, 30 min, 2 h, 6 h and a day.

### Webhook

Create a signing secret in the form's Responses settings (shown once), set an https address and turn it on. Each delivery is a POST with:

- `x-storelib-timestamp`: seconds since 1970
- `x-storelib-signature`: `v1=` and the hex HMAC SHA-256 of `<timestamp>.<raw body>` with the secret
- `x-storelib-event`: `form.response` (or `form.test`)
- `x-storelib-delivery`: the job id, the same on every retry

Refuse a timestamp more than five minutes old. `verifyWebhook` in `lib/forms/webhook.ts` is the check.

### Google Sheets

Not connected. Storelib has no Google OAuth connection for Sheets, so "Queue responses for Google Sheets" only writes `google_sheets` jobs in `pending_setup`; nothing is sent. Connecting it needs a Google OAuth client with the `spreadsheets` scope, a per-owner token store, a sheet picker, and a worker that appends a row per job (the job rows are already there to backfill from). Until then, use the CSV export or point the webhook at Zapier or Make.
