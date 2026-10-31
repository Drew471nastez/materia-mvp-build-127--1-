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
| CSP | `Content-Security-Policy-Report-Only` in `vercel.json`, reports to `/api/csp-report` | review reports, then enforce on apex app routes (sites may need their own policy) |
| Permissions-Policy | **sent on storelib.com and www only** (vercel.json, `tests/permissions-policy.test.ts`): `camera=(self "https://connect-js.stripe.com" "https://js.stripe.com"), microphone=(self), geolocation=(), payment=(self "https://js.stripe.com"), usb=(), display-capture=()`. Camera and microphone stay on because the ID photo and the builder's voice ask use them; payment for Apple Pay and Google Pay in Stripe's frame | creator sites and custom domains could get their own later (an AI site already sets one) |
| HSTS | Vercel default; not explicit, custom domains UNPROVEN | add explicitly for apex after checking subdomain impact |
| IDOR coverage | **done**: [IDOR_SWEEP.md](IDOR_SWEEP.md), no gap found | repeat the check for each new route that uses the service role with a request id |
| Repository visibility | not checked | owner confirms the GitHub repository is private; if not, SEC-2 is exploitable now |
| Admin identity | one shared login, no MFA, no per-person audit | longer term: per-person admin accounts on Supabase Auth with MFA |
| Private community pictures in a public bucket | design trade-off, URLs hard to guess | owner decision whether to move to signed URLs |
| `/auth/app-callback`, GET sync-session, custom-scheme reset | legacy; see section 5 | retire `/auth/app-callback` after Vercel logs show zero use |
| Email address in `/signup/verify?email=` URLs | still in 10 redirects and the code email's link (request logs) | move it to the session (the page can read `user.email`), or to the `#` fragment; touches every sign-up redirect, so its own change |

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
