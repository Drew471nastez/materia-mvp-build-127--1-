# Operations, integrations, AI Memory and the settings sheet

What was added in the October 2026 round, where it lives, and what is still
not live. Everything here is real against the database and the providers; the
gaps are named at the end rather than hidden behind a button.

## Operations view (/admin?view=ops)

`lib/admin/views/ops.ts` reads every part of Storelib once and the page
(`app/(storelib)/admin/_console/view-ops.tsx`) refreshes it every 30 seconds.

| Module | Measured from |
| --- | --- |
| Database | a timed read of `platform_settings` (over 1.5 s is degraded) |
| Payments (Stripe) and Payment webhooks | `buildPaymentsHealth`: a Stripe balance read, both webhook secrets, failed webhook processing in 24 h |
| Email, Push, Storelib AI, GitHub sync, Custom domains | `ENV_CHECKS` in `lib/admin/schema-expectations.ts`; values never leave the server |
| Scheduled jobs | `cronChecks` in `lib/admin/views/system.ts`: the work each job leaves behind |
| Errors | `error_events` seen in the last 24 h, top five by count |
| Physical commerce | the admin switch, `commerce_jobs` failed, given up and waiting over 30 minutes |
| Commerce integrations | `commerce_integrations` rows in `error` |

A check that could not be made reads "unknown" with the reason. Alerts are the
modules that are down (critical) or degraded (warning), each with what was
measured and a link to where it is fixed.

## Integrations (Settings > Integrations)

`components/physical/integrations-marketplace.tsx`, over
`GET /api/physical/integrations` and `PUT /api/physical/integrations/[provider]`.
The provider list is `lib/physical/providers.ts`.

- A key for Shippo, Printful, Gelato, Printify or EasyPost is put to the
  provider's own API once on save (`lib/physical/provider-verify.ts`, reads
  only). A refused key is not stored. An accepted key keeps the account name
  when the provider gives one, and whether it is a test key.
- Keys are sealed with `lib/physical/secrets.ts` and only the last four
  characters are ever shown again.
- Logos: set `logo` on a provider in `providers.ts` to a file in
  `public/integrations/` taken from the provider's brand kit. Without one the
  card draws the provider's initial.
- **Not live yet:** Storelib does not send orders, buy labels or fetch live
  carrier rates from these providers. Their cards say so. Orders for a
  location set to a provider are flagged to send by hand. Live carrier rates
  need the full destination address at quote time
  (`lib/physical/checkout-pricing-server.ts` passes country and region only)
  and a `carrierQuotes` map into `quoteDelivery`, which already accepts one.

## Refunds made in Stripe

`charge.refunded` (app/api/stripe/webhook) writes each line's refund
(`lib/stripe/refund-sync.ts`) and then `syncCheckoutRefunds` in
`lib/physical/orders-server.ts` restates every physical checkout the payment
paid for, so the order list agrees with Stripe, with one timeline line per
new refunded total.

## AI Memory

SQL part `supabase/sql/run-now/106_ai_memory.sql` (same as
`supabase/migrations/20261126_ai_memory.sql`) creates `ai_memories`. Run it in
Supabase; until then Storelib AI keeps only each website's own notes and the
settings card says memory is not set up.

- Two scopes. Everywhere: a row with no `install_id`, true of the creator on
  every website. One website: the website's own brief
  (`lib/website-builder/agent/project-state.ts`), saved with the theme.
- `lib/ai-memory/store.ts` lists, adds and deletes through the creator's own
  Supabase client, so row level security decides. Rows cannot be updated in
  place.
- The website agent route loads up to 30 memories into each turn and keeps
  what the `remember` tool marks `scope: "everywhere"`, with source
  `assistant`.
- Settings > Store > AI Memory (`components/app/settings/ai-memory-panel.tsx`)
  lists them, adds one and deletes one. API: `GET/POST /api/ai-memory`,
  `DELETE /api/ai-memory/[id]`.

## Long tasks

A run is capped at 300 seconds by Vercel. When the agent route's own deadline
stops a run that had already changed something, it sends
`{ type: "continue", reason: "time" }`, and the chat
(`components/website-builder/theme-chat.tsx`) sends `CONTINUE_PROMPT` on its
own, up to `MAX_CONTINUES` (3) times, so a long request is finished in parts
with the last twelve messages as context. Stopping the run by hand never
continues it.

## Settings as a sheet

`components/app/settings-sheet.tsx` draws /app/settings as one large sheet:
drag the top strip with a finger or a mouse (past a quarter of its height or a
downward flick closes it), Escape, the close button, or a click on the dimmed
page. It scrolls inside itself only, and at rest it carries no transform so
the save bar stays fixed to the screen. The sections are grouped Account,
Store, Commerce and Integrations in `settings-form-new.tsx` (`TABS`,
`TAB_GROUPS`); every `?tab=` address still works.
