# Manual actions for the owner

Things the code cannot do for itself. Each one says why, where, what, whether
it changes production, what it costs and how to check it. Nothing here was
done by the reliability work; all of it is waiting for the owner.

Order of importance: 1, 2, 3, then the rest.

## 1. Approve and deploy the reliability branches

- **Why:** none of the fixes are live. The five fix branches
  (`claude/rel-security`, `claude/rel-commerce`, `claude/rel-sites`,
  `claude/rel-shared`, `claude/rel-db`) and this documentation branch exist
  only on GitHub. Vercel does not deploy `claude/*` branches.
- **Service:** GitHub, then Vercel.
- **Where:** GitHub, the repository, Pull requests.
- **What:**
  1. Read [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md) for each branch's
     status and test results.
  2. Open one pull request per branch into `main` (or the lead opens them).
     Merge in batch order: security, commerce, sites, shared, db. Merge one,
     let CI go green and the deploy settle, then the next.
  3. Run any SQL part a branch prepared (action 3) before merging code that
     depends on it. The log says which.
  4. After each production deploy, run the smoke check
     (`BASE_URL=https://storelib.com node scripts/smoke-deploy.mjs`) and
     watch Admin, Health, Errors for an hour.
- **Value/permission:** repository write; Vercel project access.
- **Changes production:** yes, on merge to `main`.
- **Cost:** none beyond normal build minutes.
- **Verify:** Vercel shows the new production deployment; smoke passes; the
  error groups in [AUDIT.md](AUDIT.md) section 1 fall over the following week.
- **Undo:** Vercel Instant Rollback ([rollback.md](../operations/rollback.md)).

## 2. Set the admin login variables in production (SEC-2)

- **Why:** without them the admin console accepts a username and password
  written in the source.
- **Service:** Vercel.
- **Where:** Vercel, the project, Settings, Environment Variables, Production.
- **What:** `BLOG_ADMIN_USER` (note: the code reads `BLOG_ADMIN_USER`, not
  `BLOG_ADMIN_USERNAME`; `app/api/admin/blog/auth/route.ts:39`),
  `BLOG_ADMIN_PASSWORD`, and `BLOG_ADMIN_SECRET` (a separate cookie signing
  key, e.g. `openssl rand -hex 32`, so the service-role key is no longer
  reused for it). The username is folded to lower case; the password is not.
  No code change is needed: set variables win over the source fallback.
- **Value/permission:** a strong unique password; Vercel env edit access.
- **Changes production:** yes, after a redeploy. Existing admin sessions are
  signed out when `BLOG_ADMIN_SECRET` changes.
- **Cost:** none.
- **Verify:** the source fallback credentials no longer work at
  `/admin`; the new ones do.

## 3. SQL parts prepared by the fix agents

Run each in the Supabase SQL editor, one new tab per file, after reading it.
Part numbers are picked by the fix agents (base branch highest is 344) and
filled in by the lead.

| Part | Finding | What | Notes |
| --- | --- | --- | --- |
| TBD | SEC-1 | `profiles_keep_email_verified` trigger: `authenticated` and `anon` cannot change `email_verified` / `email_verified_at` | additive; can be disabled with `ALTER TABLE … DISABLE TRIGGER` |
| TBD | DB-9 IDX-1 | `CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_buyer_email_trgm_idx …` | run alone, not inside a transaction or with other statements |
| TBD | DB-9 IDX-2 | `CREATE INDEX CONCURRENTLY IF NOT EXISTS commerce_checkouts_buyer_email_trgm_idx …` | run alone |
| TBD | others | anything else a branch reports (e.g. SITE-1 RPC later) | see the log |

- **Service:** Supabase. **Where:** Dashboard, SQL Editor.
- **Changes production:** yes (schema, additive).
- **Cost:** none; index builds use CPU for a while on large tables.
- **Verify:** each part's `99_check_after` query returns true; for indexes,
  `select indexname from pg_indexes where indexname in (...)`.

## 4. Storage bucket size limit for community uploads (SHR-1)

- **Why:** the private bucket `digital-products` has no per-file limit in the
  repo SQL, so only the project-wide limit caps a file that skips the check.
- **Service:** Supabase Storage.
- **Where:** Dashboard, Storage, bucket `digital-products`, Edit bucket,
  "Restrict file upload size".
- **What:** a limit at least as large as the largest legitimate upload
  (staff community files are allowed 500 MB in code; product files may be
  larger, so check the product upload limit first and pick the larger).
- **Changes production:** yes; uploads above the limit are refused.
- **Cost:** none.
- **Verify:** an upload above the limit is refused; a normal product file
  still uploads.

## 5. Earlier pending owner items

| Item | Why | Where | What | Changes prod | Cost | Verify |
| --- | --- | --- | --- | --- | --- | --- |
| SQL parts 305 to 309 | translation providers log (305), store currency quantity breaks (306), product personalization (307), cart uploads (308), size chart rules (309) | Supabase SQL Editor | run `supabase/sql/run-now/305_*.sql` … `309_*.sql`, one per tab | yes, additive | none | each file's check query |
| SQL parts 233, 281, 282 (if not yet run) | physical carrier prefs, OnePage leads country, OnePage media uploads | same | run `233_physical_carrier_prefs.sql`, `281_onepage_leads_country.sql`, `282_onepage_media_uploads.sql` | yes, additive | none | check queries |
| Supabase Storage global upload limit 2 GB | large product files | Supabase, Project Settings, Storage, upload file size limit | 2 GB (check the plan allows it) | yes | check current plan limits | a 1.5 GB upload succeeds |
| Apple Pay domain | Apple Pay on checkout | `storelib.com/admin?view=system`, Apple Pay, Register domain | press Register | yes (Stripe domain registration) | none | Stripe shows the domain registered; Apple Pay button appears in Safari |
| `GEMINI_API_KEY` | translation (Hugging Face credits exhausted in production logs) | Vercel, Environment Variables, Production | key from aistudio.google.com/apikey | yes after redeploy | free tier | `/admin/translations` shows Gemini models |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN`, `TRANSLATE_PROVIDERS` (optional) | second free translator | same | see [translation-and-crons.md](../operations/translation-and-crons.md) | yes after redeploy | free tier | `/admin/translations` |
| Remove `HF_TOKEN` | credits exhausted; 19 errors in 7 days | same | delete the variable | yes after redeploy | none | no HF errors in logs |
| EU decision on Gemini free tier | Google's terms limit free tier for EEA, Switzerland, UK users | owner decision | enable billing on the Google project, or `TRANSLATE_PROVIDERS=cloudflare,gemini` | yes | check current Gemini pricing | decision recorded |
| Confirm `CRON_SECRET` set | crons fail closed without it | Vercel env, Production | long random value | no (check only) | none | crons show 200 in Vercel, Cron Jobs |
| Confirm `MAILGUN_WEBHOOK_SIGNING_KEY` set | inbound webhook refuses unsigned deliveries | Vercel env, Production | Mailgun webhook signing key | no (check only) | none | Mailgun webhook log shows 2xx |
| Stripe platform account status | PAY-7 risk; any restriction would affect every store | Stripe Dashboard, Settings, Account; Connect settings | confirm no restrictions or pending requirements; confirm the live secret key has Connect permissions | no | none | no warnings shown |
| Supabase compute and plan review | most production errors are database slowness (statement timeouts, pool exhaustion on 10-27) | Supabase Dashboard: Reports (CPU, memory, connections), Query Performance (slow queries), Settings, Compute | read CPU and connection peaks around 10-27 06:30-09:44 UTC and 10-28; list top slow queries; decide whether compute size is enough | no (review); yes if upgraded | upgrade costs: check current Supabase pricing | numbers shared with the lead |
| Log drain or alerting (optional) | today errors go to `error_events` plus email/webhook; no long-term searchable logs | Vercel, Settings, Log Drains, or a Marketplace integration | pick a destination | no app change | check current pricing; see [COSTS.md](COSTS.md) | logs arrive at the destination |

## 6. Access the lead needs

The lead has Vercel read access (runtime errors and logs) and the repository.
It does not have:

| Access | Why | Smallest form that works |
| --- | --- | --- |
| Supabase read-only database access, or a Query Performance export | find why `profile` reads time out (EVD-1), confirm assumed indexes exist, check duplicate indexes (DB-12), RLS settings and statement timeouts | a read-only Postgres role, or a CSV export from Dashboard, Query Performance, plus the output of the index checks in [AUDIT.md](AUDIT.md) section 5 |
| A staging Supabase project | load tests and `EXPLAIN` without touching production; previews today read production data | a second Supabase project restored from a backup with personal data scrubbed, wired to a Vercel preview environment |
| Stripe test-mode keys in a preview environment | exercise checkout, webhook replay and breaker behaviour end to end | `STRIPE_SECRET_KEY=sk_test_…` and test webhook secrets on a Preview-only environment |
