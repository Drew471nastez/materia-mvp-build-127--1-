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

### Round AR: bookings end to end

Run SQL part **410** (`supabase/sql/run-now/410_bookings_calendar.sql`, the same file as `supabase/migrations/20271410_bookings_calendar.sql`) after part 375. Until it runs, bookings keep working as part 375 keeps them (no daily limit under a lock, no stored length or meeting place, no Google Calendar), and the Google card says the update is needed. `node scripts/check-bookings-sql-ar2.mjs` runs it twice on a real Postgres and checks the guard.

- **Setup** (the form's Bookings row): lengths (one default and up to five more the visitor may choose), the break after, notice, days ahead, most per day, the weekly hours, date changes (a day off or other hours), the time zone, confirm each request or not, where (a video link shown only after booking, a Google Meet made per booking, a phone call, an address), a price (free, or one of the creator's products paid at the existing checkout), and a badge. Questions are the form's own.
- **The sheet**: the month first, every date drawn open or closed, then that date's times in the visitor's zone, then the questions. The steps are the sheet's own state (Back never reloads), and a time taken meanwhile is a 409 that reads the month again.
- **Change or cancel**: the visitor's emails carry `/booking/<token>`, the booking id signed with HMAC (`lib/bookings/manage-token.ts`). The creator moves or cancels from `/app/bookings`. Both go through `lib/bookings/server.ts`, which checks the new time with the same rules and names the owner on every write.
- **Notices** (`lib/bookings/announce.ts`): the creator's bell (and so the Storelib app and browser push, at once for a `booking:` key) for a new, moved or cancelled booking; the creator's email for a visitor's move or cancel; the visitor's email with an `.ics` file and an Add to Google Calendar link.
- **Google Calendar** (`lib/google-calendar/`): OAuth on the server, the refresh token sealed like integration secrets, busy times from the chosen calendars block slots (freeBusy), confirmed bookings written as events (with a Meet when chosen), moved and removed with the booking. Google failing never stops a booking.

Google Calendar needs, on the server only:

- `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET`: a Google Cloud OAuth client of type Web application, with the Google Calendar API enabled and the redirect URI `https://storelib.com/api/google-calendar/callback`. Scopes asked: `openid`, `email`, `calendar.readonly`, `calendar.events`.
- `COMMERCE_SECRETS_KEY` (already used for integration secrets): seals the tokens and signs the visitor's links. Without it the service role key is used, as for the other sealed secrets.

With either Google variable unset, `/app/bookings` and the form's Where setting say Google Calendar is not set up yet, and bookings work without it.

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
