# Security

Threat model, what was found, what was checked and is fine, and what is
still open. Full finding details are in [AUDIT.md](AUDIT.md).

## 1. Threat model (summary)

| Asset | Who might attack | How |
| --- | --- | --- |
| Buyers' purchases (digital goods, library) | any signed-up user | claiming another person's email (SEC-1), guessing codes (SEC-6), login CSRF (SEC-4) |
| Creator accounts and payouts | phishers, malicious apps | redirect after login to an attacker subdomain (SEC-7), token-bearing custom-scheme links (SEC-9) |
| The whole platform | anyone who can read the repository | admin fallback credentials (SEC-2) |
| Other creators' brands | a creator publishing an AI site | slug check failing open during a blip (SITE-6), wildcard lookup (SITE-10) |
| Community members | a malicious member | uninspected uploads (SHR-1) |
| Email reputation | spammers | unauthenticated verification mail (SEC-5) |
| Platform money and tokens | abuse during incidents | AI limits failing open (SITE-7) |
| Personal data | log readers | emails and codes in logs and URLs (SEC-11) |

Trust boundaries that matter most:

- **Published sites run creator or model-written JavaScript on
  `<slug>.storelib.com`.** They are same-site with `storelib.com`. Session
  cookies are host-only, and the proxy refuses same-site `/api` calls, but
  anything that trusts "any `*.storelib.com`" (SEC-7) or accepts a GET from a
  same-site page (SEC-4) crosses this boundary.
- **The service-role client bypasses RLS.** Most dashboard and community
  routes use it and enforce ownership in code. One missed check is an IDOR.
- **`storelib.me` only exposes the APIs a public OnePage needs**
  (`lib/onepage/host-route.ts`); the session and dashboard are not reachable
  there.

## 2. Findings

| ID | Severity | Summary | Branch |
| --- | --- | --- | --- |
| SEC-1 | CRITICAL | unauthenticated email verification lets an attacker claim another person's guest orders | `claude/rel-security` + SQL part |
| SEC-2 | CRITICAL (if repo readable or env unset) | admin login falls back to source credentials, no rate limit | owner env vars + `claude/rel-security` |
| SEC-3 | HIGH | Auth 500/429 on refresh deletes the session (SDK) | `claude/rel-security` |
| SHR-1 | HIGH | community files skip size and content checks | `claude/rel-shared` |
| SEC-4 | MEDIUM | GET sync-session with tokens: login CSRF, tokens in logs | `claude/rel-security` |
| SEC-5 | MEDIUM | verify-email open mail relay | `claude/rel-security` |
| SEC-6 | MEDIUM | 6-digit codes unlimited guesses | `claude/rel-security` |
| SEC-7 | MEDIUM | `next` allows any subdomain | `claude/rel-security` |
| SITE-6 | MEDIUM | AI site slug check fails open | `claude/rel-sites` |
| SITE-7 | MEDIUM | AI limits fail open | `claude/rel-sites` |
| SITE-9 | MEDIUM | draft theme assets public | `claude/rel-sites` (later) |
| SEC-8 | LOW-MEDIUM | `/auth/continue` lacks claims fallback (availability) | `claude/rel-security` |
| SEC-9 | LOW-MEDIUM | recovery tokens via custom scheme | `claude/rel2-security2`: raw tokens no longer sent; bridge code handoff documented (section 5) |
| SEC-10 | LOW | dead bridge with non-atomic consume | `claude/rel2-security2`: atomic consume (section 5) |
| SEC-11 | LOW | personal data in logs and URLs | `claude/rel2-security2`: logs masked; addresses in URLs open (section 4) |
| SEC-12 | LOW | CSP report-only, no Permissions-Policy | `claude/rel2-security2`: Permissions-Policy on storelib.com; CSP still report only |
| SITE-10 | LOW | unescaped `ilike` on creator name | `claude/rel-sites` |
| EVD-3 | MEDIUM | auth calls on public routes (cost and latency, not a leak) | not assigned |
| R48-1 | HIGH | creator page About story rendered as raw HTML; the page builder save stored it as sent (stored XSS on storelib.com/<handle>) | `r48-security` (section 7) |
| R48-2 | MEDIUM | `?redirect=` on /verify-email and /signup, the stored redirect and `?fallback=` on /auth/complete followed to any site | `r48-security` |
| R48-3 | LOW | reset code routes: no rate limit, a reset code could be exchanged twice at once | `r48-security` |
| R48-4 | LOW (hardening) | CSP report only everywhere | `r48-security`: enforced on /app, /admin, sign in pages |
| R48-5 | LOW (hardening) | HSTS without includeSubDomains; no Permissions-Policy off storelib.com | `r48-security` |
| R48-6 | MEDIUM (unproven in production) | `store_builder_configs` readable with the public anon key: `published_config.headerSettings.contactEmail` and, per the baseline, `draft_config` | code fixed in round 48 (public reads on the service role, `lib/store-builder/public-config.ts`); SQL part 354 to run after that deploy (section 7) |
| AX-2 | HIGH (proven on the production shaped harness) | the website builder's public read policies (`sti_select_published`, `sts_select_published`, `stp_select_published`, for anon and authenticated) let the anon key and any signed in account read, for every published website, `store_theme_installs.preview_token` (opens the unpublished preview), `store_theme_settings.draft_settings` and `store_theme_pages.draft_sections`; the same policy shape on `onepages` gives `draft_blocks` and `archived_blocks` to the anon key | no code reads these with the anon key or another creator's session (live site, previews, sitemaps and team members read on the service role, owners on their own session). SQL part 463: the three policies for anon only, SELECT on the three tables given back to anon column by column without the private column. Part 464: the same column grant on `onepages`. Still open: a signed in stranger reads another published OnePage's `draft_blocks` (the owner's editor reads `select *` on its own session, and the onboarding slug check reads other pages with the browser key, so neither a column grant nor a narrower policy is safe for authenticated yet); proof in `tests/drafts-private-ax.test.ts` |

## 3. Verified fine

- **Cron auth.** All 16 `/api/cron/*` routes (GET and POST) plus metrics,
  email retry, SEO announce and domain cleanup use
  `requireBearerSecret("CRON_SECRET")`: refuses when the secret is unset,
  compares in constant time (`lib/api/require-secret.ts:58-76`). Lease rows
  are written only after a valid bearer.
- **Webhook signatures.** Stripe platform and Connect with separate secrets
  and a destination check, fail closed without a secret, 400 without a
  signature. Mailgun HMAC with a 5 minute window and event-id dedupe. GitHub
  `x-hub-signature-256` before parsing. Supabase auth hook via Standard
  Webhooks. Marketing: hashed per-store token plus signature. Airwallex
  answers 410.
- **Admin gating.** Every `/api/admin/*` route except the login calls
  `isAdminAuthenticated` / `requireAdmin` or a bearer `ADMIN_SECRET`.
- **No service key in client code.** `server-only` on `lib/supabase/admin.ts`
  and `lib/admin/gate.ts`; none of the 1,268 `'use client'` files imports an
  admin or secret module; no secret-bearing `NEXT_PUBLIC_*` variable.
- **Proxy blocks published sites from `/api`.** Refuses `Sec-Fetch-Site:
  same-site` to `/api/*` and a published-site `Origin` on mutating methods
  (proxy.ts:1951-1976).
- **Open redirects on plain paths.** `sameOriginPath` rejects `//`, `/\`,
  control characters and whitespace; `/auth/start` limits providers.
- **CORS.** Credentials only for `https://help.<main>`.
- **Session cookies** are host-only, `secure`, `sameSite: lax`.
- **Logs.** `logLine`, `hrefForLog` and `DeadlineExceeded` keep tokens and
  query strings out; alert emails mask addresses and drop secret-named fields.
- **Rate limits** exist on password reset, signup guard, OnePage forms,
  contact, subscribe, support, order help, site-account codes, analytics API
  keys.
- **Community privacy.** Private responses are `no-store`/`private`; share
  cards show a post only if it is public.
- **Tenant isolation (IDOR), full sweep.** 463 route handlers and pages that
  take an id, handle, token or address from the request and reach the
  service-role client, directly or through a helper, were checked; none
  reads or writes another tenant's rows. Method, notes and the per-route
  table: [IDOR_SWEEP.md](IDOR_SWEEP.md).

## 4. Open items

| Item | Status | Next step |
| --- | --- | --- |
| CSP | **enforced on storelib.com /app, /admin, /login, /signup, /reset-password, /verify-email, /auth** (round 48, proxy.ts + `lib/security/csp.ts` `enforcesCsp`); report only everywhere else | widen to the checkout once a week of `[csp] would have blocked` lines on /checkout shows nothing from Stripe (section 7) |
| Permissions-Policy | **round 48: every other host now gets `usb=(), serial=(), hid=(), bluetooth=(), display-capture=()`** (a `missing` host rule). Before that, **sent on storelib.com and www only** (vercel.json, `tests/permissions-policy.test.ts`): `camera=(self "https://connect-js.stripe.com" "https://js.stripe.com"), microphone=(self), geolocation=(), payment=(self "https://js.stripe.com"), usb=(), display-capture=()`. Camera and microphone stay on because the ID photo and the builder's voice ask use them; payment for Apple Pay and Google Pay in Stripe's frame | creator sites and custom domains could get their own later (an AI site already sets one) |
| HSTS | **round 48: `max-age=63072000; includeSubDomains` on storelib.com and www** (vercel.json). Custom domains and creator subdomains keep Vercel's `max-age=63072000` (measured live on andrewrullz.storelib.com, help, images, storelib.me) | preload: owner step in section 7 |
| IDOR coverage | **done**: [IDOR_SWEEP.md](IDOR_SWEEP.md), no gap found | repeat the check for each new route that uses the service role with a request id |
| Repository visibility | not checked | owner confirms the GitHub repository is private; if not, SEC-2 is exploitable now |
| Admin identity | one shared login, no MFA, no per-person audit | longer term: per-person admin accounts on Supabase Auth with MFA |
| Private community pictures in a public bucket | design trade-off, URLs hard to guess | owner decision whether to move to signed URLs |
| `/auth/app-callback`, GET sync-session, custom-scheme reset | legacy; see section 5 | retire `/auth/app-callback` after Vercel logs show zero use |
| Email address in `/signup/verify?email=` URLs | **done outside `lib/auth`** (rel3-leftovers): every redirect, the login and signup pages and the VERIFY_EMAIL email open the page by account id; the page shows the address from the tab or the session, still accepts an old link's `email` and takes it off the address bar | the code email's copy link (`lib/auth/email-code.ts`) and `sellDecision` (`lib/auth/continue.ts`) still add `&email=`; drop it there (owned by the auth branch) |

## 5. Native app links (SEC-9, SEC-10)

What was found (grep over `app/`, `lib/`, `components/`, `android/`,
`ios/`, `capacitor.config.ts`, `public/.well-known`, `app/api/app-links`):

- The installed apps load the live site (`capacitor.config.ts`
  `server.url = https://storelib.com/native-start`), so the deep link
  handling that matters is the web code in `lib/native-oauth.ts`, not the
  app build. Android declares the custom scheme `storelib://auth/callback`
  and `storelib://reset-password`, and verified https App Links for
  `/app/auth/callback` and `/reset-password`
  (`android/app/src/main/AndroidManifest.xml`; the files are served by
  `app/api/app-links/assetlinks` and `apple-app-site-association`).
- **`/app/auth/callback` (SEC-10).** Nothing writes `oauth_bridge_tokens`
  any more; `MainActivity` sees the App Link and lets the WebView JS finish
  OAuth with PKCE, it does not load the route. The route stays because an
  older build may still open it. Its token is now single use for real: the
  delete returns the row (`DELETE ... RETURNING`,
  `lib/auth/bridge-token.ts`), so two requests at once cannot both get the
  session; the stored path is checked like the query's, and redirects are
  `no-store`. Test: `tests/bridge-token-once.test.ts`.
- **`/auth/app-callback`.** No producer anywhere (no web, Java or JS code
  links to it), and the current app JS does not understand its
  `storelib://auth/callback?token=` links. It only relays tokens it is given,
  so no victim token reaches it. Left in place (no route deleted); retire it
  after Vercel logs show no hits.

**The risk of a custom scheme.** Any Android app can declare `storelib://`
in its manifest. When two apps claim one scheme, Android shows a chooser or
picks one; either way a link on that scheme can be delivered to an app that
is not Storelib, with everything in it. iOS custom schemes have the same
weakness. A credential in such a link is a credential handed to whichever
app answers.

- **Recovery tokens (fixed).** The reset page's legacy link (tokens in the
  `#` fragment) sent the live access and refresh tokens on as
  `storelib://auth/callback?type=recovery&access_token=...`. It now finishes
  the reset in the browser. Test: `tests/custom-scheme-tokens.test.ts`
  (also refuses any new `storelib://` address carrying a session token).
- **Bridge code (kept, risk accepted for now).** A phone browser opening the
  emailed reset link (`/reset-password?code=`) hands the one-time bridge code
  to `storelib://reset-password?code=` and, after 6 seconds, uses it itself.
  An app that intercepts it can exchange the code at
  `/api/auth/exchange-reset-code` for a recovery session first. The app's
  handler (`lib/native-oauth.ts` `isBridgeCodeResetLink`) depends on it, so it
  was not changed.
- **OAuth code (fine).** `storelib://auth/callback?code=` carries a PKCE code,
  useless without the verifier stored inside the app.

**The safe alternative.** Use the verified https links the app already has:
Android App Links (`autoVerify` with `assetlinks.json`) and iOS Universal
Links. The OS gives a verified https link only to the app whose signing
certificate the site names, so no other app can receive it. For the reset:
the emailed `https://storelib.com/reset-password?code=` link already opens
the app when it is installed (the manifest has the App Link). The browser
page's custom-scheme handoff can then go: on a phone browser, offer an
"Open in the app" button that links to the same https address (a user tap
on a verified App Link opens the app), and otherwise finish in the browser.
That is a change to the app's reset path, to be made and tested on real
devices together with the owner.

## 6. CSP readiness (report only, not enforced)

The policy is written once in `lib/security/csp.ts` (`CONTENT_SECURITY_POLICY`)
and copied into `vercel.json` as `Content-Security-Policy-Report-Only` on every
path of every host (`source: "/(.*)"`): storelib.com, creator subdomains,
custom domains and imported themes. `tests/integrations-t.test.ts` fails if
the two copies differ. Browsers evaluate it and block nothing.

**Where reports go.** Each browser that sees a violation posts it to
`/api/csp-report` (`report-uri` in the policy). The proxy answers 19 in 20 of
those posts itself with a 204 (`CSP_REPORT_SAMPLE_RATE = 0.05`), so only a
sample reaches the route. The route (`app/api/csp-report/route.ts`) stores
nothing; it drops reports about browser extensions, cuts every URL at `?`
or `#` (tokens never reach a log), and writes at most 30 lines a minute per
instance, each one:

    [csp] would have blocked <blocked uri> (<directive>) on <page path>

at `warn` level in the Vercel runtime logs of the production deployment.

**How to review them.** Over at least two weeks of real traffic that
includes a checkout with a card and with Apple Pay or Google Pay, Stripe's
onboarding forms, the website builder and code editor, a creator site, an
imported theme, a OnePage with embeds and a community video upload:

1. Vercel dashboard, the project, Logs, production, search
   `[csp] would have blocked` (or `vercel logs <deployment> | grep "\[csp\]"`).
2. Group the lines by blocked host and directive. Multiply counts by 20 for
   the real volume (the sample).
3. For each group decide: a host Storelib really uses (add it to the
   directive in `DIRECTIVES` in `lib/security/csp.ts` and paste the new
   `CONTENT_SECURITY_POLICY` string into `vercel.json`), or something that
   should be blocked (leave it). `inline`/`eval` lines on storelib.com are
   expected under `'unsafe-inline'`/`'unsafe-eval'` and should not appear.
4. Ready when a week passes with no new group on storelib.com.

**The exact switch, later.** Not done now.

- Storelib's own app hosts first (recommended). Creator sites and imported
  themes run a creator's or a theme's own scripts and may need their own
  policy, so leave the report only header on every host and add, in
  `vercel.json` `headers`, one entry like the existing `Permissions-Policy`
  one:

      { "source": "/(.*)",
        "has": [{ "type": "host", "value": "^(www\\.)?storelib\\.com$" }],
        "headers": [{ "key": "Content-Security-Policy", "value": "<CONTENT_SECURITY_POLICY>" }] }

  Reports keep coming from the report only copy everywhere.
- Every host at once: in `vercel.json` rename the key
  `"Content-Security-Policy-Report-Only"` to `"Content-Security-Policy"`.
  That is the whole switch (see the header of `lib/security/csp.ts`).

Either way, update the pins that expect the report only key
(`tests/vercel-runtime-costs.test.ts`, `tests/visitors25.test.ts`), deploy,
run `scripts/smoke-deploy.mjs` and walk the same flows as in the review.
Rolling back is the same edit reversed. The Capacitor app already gets an
enforced `frame-src` from the proxy; an enforced policy is applied together
with it (both must allow a frame), which is fine because the proxy's list is
a subset of this one.


## 7. Round 48 (security hardening)

### Findings

| ID | Severity | What | Proof | Fix | Test |
| --- | --- | --- | --- | --- | --- |
| R48-1 | HIGH | `components/store-builder/unified-section-renderer.tsx` drew `settings.aboutContent` with `dangerouslySetInnerHTML` whenever it contained a tag. `app/api/creator-profile` cleans it, but `POST /api/store-builder` stores `config.sections` as sent, and `PUT` publishes the draft. A creator (or a team member with Creator page access) could put `<img src=x onerror=...>` on storelib.com/<handle>, script on the platform origin for every visitor and the owner. | the path above; `cleanStoredHtml` of the payload keeps the `onerror` out (test) | cleaned at the sink with `cleanStoredHtml` (the product description's allow list, same code server and browser), and on save in `POST /api/store-builder` with `sanitizeRichText` | `tests/security-r48.test.ts` R48-1 |
| R48-2 | MEDIUM | open redirect after sign up: `/verify-email?redirect=https://evil` was `router.push`ed after the code; `/signup?redirect=` was stored in a `.storelib.com` cookie that a published subdomain can also write, then followed by `/auth/complete`, as was `?fallback=` | source; `safeReturnTarget` refuses each form (test) | all four read through `safeReturnTarget` (lib/auth/return-to.ts). Every producer (receipt, review form) sends a path, which is kept | R48-2 |
| R48-3 | LOW | `/api/auth/exchange-reset-code`, `complete-reset-password`, `validate-reset-token` had no rate limit and no type check; the exchange marked a code used without checking it was unused, so two requests at once both got a recovery session (the code is 384 random bits, so this needs the code) | source | `rateLimit` by address, string and length checks, `update ... eq("used", false) ... select` claim before the session or password change | R48-3 |
| R48-4 | hardening | CSP report only on every page | live headers | enforced on Storelib's own pages, see below | R48-4 (real proxy) |
| R48-5 | hardening | HSTS without includeSubDomains; no Permissions-Policy on creator hosts | live headers | vercel.json | R48-5 |
| R48-6 | MEDIUM, unproven | the public pages read `store_builder_configs` with the anon role (`lib/store-builder/get-published-config.ts`), so the anon key (in every page) can read the table directly through PostgREST. The baseline policy (`RUN_CREATOR_PAGE_AND_SITES.sql`) allows anon SELECT on every row with a published config, which includes `draft_config` and `published_config.headerSettings.contactEmail`, the address round 45 took out of the page payload. Production's policies were made by hand and are not in the repository. | not run against production (no secrets, no production queries); on the local harness (repo baseline) the anon role read both rows, drafts and contact emails, and any signed in user read every draft | round 48 (configs): every public read moved to the service role, `published_config` only, contact address taken out (`lib/store-builder/public-config.ts`; `/api/store-builder/published` was also answering the address to anybody); SQL part 354 drops every non-owner SELECT/ALL policy on both tables, keeps owner policies, revokes anon. After 354 on the harness: anon permission denied, owner reads 1 row, a stranger signed in 0, service role all. Run 354 only after the deploy | `tests/configs-r48.test.ts` |

### CSP enforcement

Enforced (`Content-Security-Policy`, the same directives as the report only
copy, reports to `/api/csp-report?enforced=1`, logged as `[csp] blocked`,
never sampled) on storelib.com and www for `/app`, `/admin`, `/login`,
`/signup`, `/reset-password`, `/verify-email` and `/auth`. Set in `proxy()`
after the routing and joined to any policy the routing set, so the
Capacitor Stripe frame list and the enforced policy both apply.

Kept report only, and why:

- creator subdomains, custom domains, storelib.me: creators' themes, pixels
  and embeds; a missing host there is a blank site for buyers;
- `/website-builder`: imported themes are drawn in srcdoc frames, which
  inherit the page's policy, and they load from any CDN (every non extension
  report on Nov 1 2026 was Font Awesome from cdnjs inside such a frame);
- the checkout, `/p`, creator pages, OnePages: creator content on
  storelib.com itself.

`script-src` keeps `'unsafe-inline'`: Next.js puts a nonce on its inline
scripts only when a page is rendered per request, and `/login`, `/signup`
and the reset page are served from the CDN. Hashes cannot cover Next's
per page hydration script. The enforced policy's value is the rest: no
unlisted script, frame or connection host, no `<object>`, no `<base>`, no
form posting away, no framing by other sites.

Policy changes from the evidence: `https://cdnjs.cloudflare.com` added to
`style-src` and `font-src` (Font Awesome, the production reports), and
`https://platform.twitter.com` to `script-src` (the product description
renderer loads X's widgets.js).

### Evidence (local production build, Nov 2 2026)

`pnpm build` of this branch in a copy, `next start`, Chromium with
storelib.com mapped to it, a `securitypolicyviolation` listener on every page
plus the route's own log:

| Page | Status | Violations |
| --- | --- | --- |
| /login, /signup, /reset-password, /verify-email, /admin, /auth/complete, /app (to /login) | 200 | 0 |
| a page loading Stripe.js (Payment Element, Card Element, payment request), Connect embedded onboarding (connect-js) and pdf.js from cdnjs, under the enforced policy | 200 | 0; frames from js.stripe.com, connect-js.stripe.com and m.stripe.network (inside Stripe's frame) all loaded |
| the same with the app's WebView user agent | 200 | 1: `frame-src https://js.stripe.com` (Stripe's controller frame), refused by the Capacitor frame list in proxy.ts on purpose, as before |
| control: /login injecting a script from unpkg, an iframe and a fetch to example.com | | 3 enforced, logged as `[csp] blocked ...` |

/login, /signup, /reset-password and /verify-email stay `○ (Static)` in the
build and keep their `s-maxage` Cache-Control: the header is added by the
proxy, not by rendering.

Production reports (Vercel runtime logs, Nov 1 08:00 to Nov 2 08:00 UTC,
5% sample): 12 lines, 11 Font Awesome from cdnjs in srcdoc theme frames and
1 `app.materiathemes.com` heartbeat on a theme cover; none on /app, /admin
or a sign in page.

### Checked and fine this round

- Public mutating API routes: 508 POST/PUT/PATCH/DELETE handlers, 161 with
  no sign in check in the file; the rest of those use a caller helper
  (shopCaller, physicalCaller, websiteCaller, a signed token, a webhook
  signature). The truly public ones are rate limited (rateLimit or the
  analytics memory limiter) except the three reset routes (R48-3, fixed) and
  `checkout/confirm-payment` (needs the PaymentIntent's client secret).
  CSRF: session cookies are SameSite=Lax and host only, the proxy refuses
  same-site /api calls and published-site Origins.
- Stripe webhooks verify `constructEvent` on `request.text()`; prices come
  from the database (`lib/checkout/pricing.ts baseFor`).
- Client chunks (`.next/static`, 44 MB): no service role JWT, `sk_`,
  `whsec_`, `re_` key or private key; every `NEXT_PUBLIC_*` is a public value.
- Raw HTML: JSON-LD through `jsonLdScript` (escapes `<`), inline scripts
  built from constants or `JSON.stringify` of checked values, descriptions,
  events and community pages cleaned on the server; React 19 blocks
  `javascript:` hrefs; the review widget escapes every string.
- Uploads: SVG and HTML refused as public pictures and page files, stored as
  `application/octet-stream` when rendered; downloads signed for 5 minutes.
- RLS: 338 tables in the repository's SQL, every one with RLS on (the AI site
  tables and partitioned analytics through dynamic SQL, parts 334 and the
  sites migration); `using (true)` only on public data (blog, follows, SEO
  overrides, the theme catalog) and insert only counters.

### Owner steps

1. **R48-6 check, then part 354.** In the Supabase SQL editor:
   `select policyname, roles, cmd, permissive, qual from pg_policies where schemaname = 'public' and tablename in ('store_builder_configs','product_page_configs') order by tablename, policyname;`
   and `select has_table_privilege('anon','public.store_builder_configs','SELECT') as sbc_anon, has_table_privilege('anon','public.product_page_configs','SELECT') as ppc_anon;`
   A SELECT or ALL policy for `anon`, `public` or `authenticated` whose
   qual is not "creator_id of a creator whose user_id is auth.uid()" (for
   example `published_config <> '{}'`) means anybody with the page's key
   reads drafts and contact emails. Round 48 moved every public read to the
   server (`lib/store-builder/public-config.ts`, `tests/configs-r48.test.ts`).
   Order: deploy that code first, open a creator page, a product page and a
   OnePage signed out, then run `supabase/sql/run-now/354_builder_configs_private.sql`
   (or the bundle that carries it); its notices name each policy dropped.
   Run the two queries again: only owner policies left, both `false`.
2. **HSTS preload** (optional, slow to undo). Confirm every DNS name under
   storelib.com serves HTTPS (`email.mg.storelib.com` does not: Mailgun
   tracking is off in `lib/mailgun.ts`, so nothing links to it), then add
   `; preload` to the header in vercel.json and submit storelib.com at
   hstspreload.org.
3. **After deploy**, open /app, Settings, Payments and Payouts (Stripe's
   embedded forms), Billing (card update), the admin console and a Google
   sign in, then search the Vercel logs for `[csp] blocked`. Rolling back
   is removing the `enforcesCsp` block in `proxy()`.
