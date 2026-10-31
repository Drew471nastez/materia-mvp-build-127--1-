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
| SEC-9 | LOW-MEDIUM | recovery tokens via custom scheme | `claude/rel-security` |
| SEC-10 | LOW | dead bridge with non-atomic consume | `claude/rel-security` |
| SEC-11 | LOW | personal data in logs and URLs | `claude/rel-security` |
| SEC-12 | LOW | CSP report-only, no Permissions-Policy | Batch 6 |
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
- **IDOR sample.** About 12 service-role routes taking ids (orders resend and
  invoice, cashout, email messages, theme publish, memberships manage,
  payouts sheet, v1 analytics, site-account delete, sites run, team join)
  each resolve ownership through a helper. None vulnerable.

## 4. Open items

| Item | Status | Next step |
| --- | --- | --- |
| CSP | `Content-Security-Policy-Report-Only` in `vercel.json`, reports to `/api/csp-report` | review reports, then enforce on apex app routes (sites may need their own policy) |
| Permissions-Policy | not set | add `camera=(), microphone=(), geolocation=()` on apex app routes, not on creator sites |
| HSTS | Vercel default; not explicit, custom domains UNPROVEN | add explicitly for apex after checking subdomain impact |
| IDOR coverage | only about 12 of 300+ service-role routes sampled | **recommended: full sweep** of every route that takes an id from the path, query or body and uses `createAdminClient()`, checking it resolves ownership before use; turn each check into a route test |
| Repository visibility | not checked | owner confirms the GitHub repository is private; if not, SEC-2 is exploitable now |
| Admin identity | one shared login, no MFA, no per-person audit | longer term: per-person admin accounts on Supabase Auth with MFA |
| Private community pictures in a public bucket | design trade-off, URLs hard to guess | owner decision whether to move to signed URLs |
| `/auth/app-callback`, GET sync-session, custom-scheme reset | legacy | retire after Vercel logs show zero use |
