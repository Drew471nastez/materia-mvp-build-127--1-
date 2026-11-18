# End to end matrix

The journeys the platform audit brief names, what in the repository drives each one, and what has not been verified. Written Nov 13 2026 (round AW).

Read the "How it is checked" column with care. There are three kinds of evidence here and they are not equal:

- **Journey harness.** The real route handlers and server modules, run against `tests/_journey`: an in-memory PostgREST with the SQL's keys and functions ported, a GoTrue, a Mailgun mailbox, and a Stripe world whose webhooks are signed and delivered to the real webhook route. 26 suites use it. This proves the code paths agree with each other. It does not prove they agree with the real Supabase, Stripe or Mailgun.
- **Module and source checks.** A function called with fakes, or a route's source read for the line that matters. Most of the 1,097 suites.
- **Production.** What the live site did: Vercel logs, response headers, the smoke workflow.

Nobody has run these journeys by hand, or in a browser, against a staging copy with Stripe test keys. That is the largest gap in this table, and it needs a staging Supabase project and test keys (MANUAL_ACTIONS.md, section 6).

| Journey | Modules it crosses | How it is checked | Not verified |
| --- | --- | --- | --- |
| A. New creator: register, onboard, product, store, publish, checkout, order, analytics | auth, onboarding, products, creator page, checkout, Stripe webhook, orders, emails, analytics | Journey harness: `e2e24` (signup through paid order, seller and buyer pages, emails counted), `e2e-onepage-signup`, `e2e-marketplace-usd`. Onboarding: `onboarding-flow` | analytics numbers after the order against a real database; the browser flow |
| B. Website creator: create, edit, save, preview, publish, public site, republish | website builder, theme installs, releases, CDN tags, snapshots | Module and source: `website-start`, `publishing-cache`, `publish-shows-new-release`, `published-site`, `edge-r49`. Production: the published site answers HIT as a browser and as a crawler; the live marker is cleared on Publish | editing in a real browser canvas; a republish seen from a second region |
| C. AI builder: describe, generate, render, edit, save, reload, publish | AI jobs, agent, provider, images, backups, editor | `ai-builder-journey`, `ai-builder-start-live-n1`, `ai-start-l1` (harness, model faked); the cost limits in `platform-reliability-aw` | a real model run end to end in this round; generated design quality is not something a suite measures |
| D. Digital product: upload, price, publish, purchase, payment, order, delivery | files, products, checkout, webhook, entitlements, downloads, receipts | Journey harness: `rel-commerce`, `rel-commerce2`, `pay9-checkout-attempts` (lost answers, webhook replay, one charge). Module: `digital-platform`, `delivery-r51` | a card payment in Stripe test mode; a large file download from real Storage |
| E. Membership: create, subscribe, access, renewal, cancel | memberships, Stripe subscriptions, entitlements, cron | `memberships`, `memberships-folded`, `membership-duplicates` over `tests/_membership-env`; billing state: `billing-resilience`, `billing-fail-closed` (a Stripe failure never reads as Free) | a real renewal and a real failed payment arriving by webhook |
| F. OnePage: blocks, products, form, publish, mobile, submit, contact, checkout | OnePage, forms, leads, contacts, checkout | Journey harness: `e2e-onepage-blocks-r11`, `e2e-onepage-instant`, `e2e-onepage-live`, `e2e-onepage-signup`. Forms: `forms-engine`, `forms-security`, `forms-leads-al5`. Round AV: saves are atomic | a phone, by hand |
| G. Team: invite, accept, permissions, restricted action, remove | team, areas, permissions, every `*Caller` gate | `team`, `team-invite`, `team-join-x`, `team-permissions-r40`, `team-areas-r40` to `r42` | two real sessions in two browsers |
| H. Failed operation: failure, feedback, safe retry, consistent data | deadlines, breaker, retry budget, idempotency keys, outbox | `rel-commerce` (connection error with a succeeded PaymentIntent answers 200; both failing answers 503), `auth-reliability`, `billing-resilience`, `refund-sync-sim`, `platform-reliability-aw` (a slept-through read) | fault injection against a deployed preview |
| I. Two tenants: cross access refused at API and database | every service role route, RLS | By reading, not by a running attack: `IDOR_SWEEP.md` (463 handlers, plus the 95 added since, Nov 13). `forms-security`, `contact-gate`, `cdnpages-r49` (one HTML for everybody) | an automated two-account test against a real database with RLS on. This is the test the brief asks for and it does not exist yet |
| J. Handover: invite, preview, accept, ownership, permissions | handoff, business links, auth, billing, calendar | `business-handoff` (every table keyed by a creator or a person must be named with what a handoff does to it; accept is one transaction; a second accept is refused). Round AW: the founder's calendar | tables keyed only by `owner_id` are outside that coverage test (how the calendar was missed) |

## Open failures

None of the suites fails on main as of this round (see IMPLEMENTATION_LOG.md, round AW, for the run). Open risks that are not test failures are in MANUAL_ACTIONS.md and at the end of the round AW log entry.

## What would raise confidence most, in order

1. A staging Supabase project restored from a backup, wired to a Vercel preview with Stripe test keys. Then journeys A, D, E and I can run against the real services.
2. A two-account isolation suite on that staging database (journey I).
3. The handoff coverage test widened to `owner_id` tables.
