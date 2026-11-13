# Vercel costs: audit and fixes (round 54, November 2026)

Bill for Oct 22 to Nov 22 so far: $98.71, all 20 projects of the team. Goal: $30 to $40 a month now, and an architecture that stays cheap with thousands of creators, without making Storelib slower or less capable.

Evidence came from production itself: response headers on storelib.com and creator sites (`x-vercel-cache`), Vercel runtime logs (the last 23 hours; Pro keeps one day), the deployment list, a cold `pnpm build` on 4 CPUs, and the code. Vercel's billing and metrics APIs answered "not found" for this team, so cost per line could not be split by project or route (see H).

## A. What was actually costing money

1. **Pictures never came from Vercel's cache.** Every `/media/...` file (every picture on every page, email and OnePage) was fetched from Supabase through Vercel on each request: `x-vercel-cache: MISS` every time. Two causes: the project predates Vercel caching external rewrites by default, and Supabase's Cloudflare sets a `__cf_bm` cookie on every answer, which Vercel never caches. This is the likely bulk of **Fast Origin Transfer (131 GB)**, and it also costs Supabase egress.
2. **An open website editor called the server once a second, all day.** `components/website-builder/site-connections.tsx` read agent activity every second while the tab was visible, used or not: about 28,800 calls in 8 hours, doubled by the proxy that runs on each. A few editor tabs left open during the 24/7 work on the site explains millions of **Function Invocations** and much of **Active CPU / Provisioned Memory**.
3. **Each deploy re-captured whole sites.** After every production deploy (about 11 a day, up to 40), the warm run re-captured every page of every visited site (up to 24 each) through the new deployment, each one a render and an ISR write. This, with several 1-5 minute cache lifetimes on large entries, is the main source of **ISR Writes (3.16M units)**.
4. **Bots got a full render on every visit to a published website.** The CDN only kept the copy browsers ask for (`Sec-Fetch-Dest: document`). Crawlers, uptime monitors and link previews send no such header, so one monitor opening `andrewrullz.storelib.com/collections/all` every minute was a full render each time.
5. **Observability Events ($36.88)** came from Observability Plus, already turned off by the owner. Nothing in the code needed to change for it.
6. **Build CPU (110 h)** matches the deploy count exactly: about 11 production deploys a day × about 5 minutes × 4 CPUs. There are no preview deployments (`claude/*` and `codex/*` branches are not deployed). The cost is the number of pushes to main.

The Oct 26-28 peak is consistent with 1-4 (heavy editor and AI builder work with many deploys a day). It could not be tied to a route, because logs older than a day are not kept.

## B. Ranked findings

| # | Where | Status | What it did | Fix |
|---|---|---|---|---|
| 1 | `next.config.mjs` `/media` rewrite | **Confirmed** (MISS live) | Every picture fetched through Vercel | `app/api/media/[...path]`: pictures without the storage cookie, held by the CDN up to a day; other files unchanged |
| 2 | `site-connections.tsx` tick loop | **Confirmed** (code) | Once a second while visible, all day | Once a second only while in use; 5 s after 2 quiet minutes; 15 s after 10 |
| 3 | `lib/edge/snapshot-capture.ts` `backfillSiteCopies` | **Confirmed** (code) | Up to 24 pages per site re-captured per deploy | Only the pages just warmed |
| 4 | Website route, CDN header only for `document` | **Confirmed** (MISS live) | Crawlers re-rendered every time | Clients with no `Sec-Fetch-Dest` share the CDN copy (same markup as before) |
| 5 | `/api/public/site-release` | **Confirmed** | 1-3 function calls per website page view | Held 30 s at the CDN under the site's tag; Publish clears it |
| 6 | `shared-copy.ts` (300 s), store currency (300 s), blog and help (60 s) | **Confirmed** (code) | Large entries rewritten every 1-5 minutes | One hour; saves and Publish clear them at once |
| 7 | Report-only CSP on every host | **Confirmed** (code) | Creator themes posted reports to the proxy | storelib.com only |
| 8 | Part 179 cache-ping triggers | **Confirmed** (code) | A no-op UPDATE cleared a store's caches | SQL part 444 (owner runs it) |
| 9 | Proxy matcher | **Confirmed** | Ran for `/media` video, PDF and font files | `/media/` excluded |
| 10 | AI build poll, certificate checks, email send progress, site link token, Settings warm-up | **Confirmed** (code) | Polls with no backoff, or running in hidden tabs | Backoff, slow-down, paused when hidden |
| 11 | `/api/ai/seo` | **Confirmed** | Paid model call with no per-account limit | 30 per 10 min, 300 a day |
| - | Crons (17) | **Checked, fine** | Logs: most runs 0.15-0.3 s with nothing to do | Left as they are |
| - | Autosave | **Checked, fine** | Website editor 1.5 s debounce, sites editor 1.2 s, OnePage on Publish | Left |
| - | Realtime channels | **Checked, fine** | Created once per mount, removed on unmount | Left |

**Hypotheses, not confirmed:** the share of Fast Origin Transfer from pictures versus other files; how much of ISR Writes came from deploy captures versus short lifetimes; whether the other 19 `v0-*` projects contribute.

## C. Map: what triggers what

**Public visitor, website page** (`*.storelib.com`, own domains):
- proxy → `/api/site-theme/site/...` (imported theme) or `/w/...` (ISR) → CDN copy (now also for crawlers)
- then `/api/track-view`, `/api/public/sv` (vitals), `/api/public/site-release` (now CDN), and pictures from `/media` (now CDN).

**Public visitor, creator page or product page** (`storelib.com/<handle>`): CDN for 5 minutes (stale up to a day), cleared by tag on save.

**Creator in the dashboard:**
- Home: token refresh (paused when hidden), live visitors through Supabase directly (no Vercel).
- Analytics: every 60 s while visible. Payouts: every 60 s and 120 s while visible (the owner's choice, pinned by a test).
- Website editor: the activity follow (fixed), a 60 s brief re-check, autosave 1.5 s after the last change.

**Crons** (`vercel.json`):
- every 5 min: notify, community, translation-jobs, warm-sites, ai-jobs
- every 10 min: seo-index
- every 15 min: memberships
- every 10 min, offset: physical
- hourly: process-scheduled-emails, strip-image-metadata, notifications, translations
- daily: fx-rates, release-holds, rollup-daily, purge-chat-attachments, storage-cleanup

Each exits after one indexed read when there is nothing to do. warm-sites does real work only on the first run after a deploy.

**Saves and Publish:** tenant tags only (`published-site:<id>`, `shop:<id>`, `creator-page-<handle>`). The only global tags are Explore, platform flags, FX and the themes marketplace. No `revalidatePath('/')`.

**Database:** service-role reads are always filtered by creator. The proxy's lookups (domain, site, password gate) are held in memory per server. The proxy runs in the region nearest the visitor (Stockholm in the logs) while Supabase is in us-east, so a cold lookup crosses the Atlantic.

## D. Fixes made (all on main, production)

| Commit | What |
|---|---|
| `8566af0b1` | Build: Turbopack does not minify; `scripts/minify-after-build.mjs` does after it exits (8.26 → about 7.8 GB peak) |
| `f6e181e9e` | Websites for crawlers at the CDN, `/media` rewrite caching, editor poll, deploy captures, site-release, cache lifetimes, AI poll backoff, certificate checks, token in hidden tabs |
| `51159a5c5` | `/media` CDN rule, CSP reports on storelib.com only, SQL part 444, email send progress, Settings warm-up |
| `bdd0109a8` | Pictures through `app/api/media` (the cookie fix) |
| this round | `/api/ai/seo` limit, `scripts/check-cdn-cache.mjs`, this document |

Tests: `tests/vercel-costs-r54.test.ts` and `tests/build-minify-r53.test.ts` pin each change; existing checks updated where marked "Changed on purpose (round 54)". The full push suite passed before every push. The production build passed before every push (peak about 7.7-7.9 GB on 4 CPUs).

## E. Before and after

| | Before | After (measured) |
|---|---|---|
| `/media` picture, 2nd request | MISS | HIT |
| Website page as a crawler, 2nd request | MISS | HIT |
| `site-release`, 2nd request | MISS (no-store) | HIT |
| Open editor, 8 h visible, unused | about 28,800 calls (+ proxy) | about 2,000 (15 s after 10 quiet minutes) |
| Site re-captures per deploy | up to 24 pages a site | 1-2 |
| Build peak, 4 CPUs | 8.26 GB (deploys failing) | about 7.7-7.9 GB |

**Expected monthly effect (estimate, wide uncertainty):**
- Fast Origin Transfer: most of the 131 GB was pictures, which are now kept after the first view per region, so roughly −70-90%.
- Function invocations and active CPU: −50% or more with fewer forgotten editor tabs.
- ISR writes: roughly −60-80%.
- Observability: $0 with Plus off.

The infrastructure line should land around $15-30, plus the $30 subscription minus credits. Check the Usage page after 7 days to confirm.

## F. Architecture for 1,000+ creators

Cost should grow with **visitors served from cache** and **active creators**, not with registered creators.

| Creators (active / day) | Public views a day | What matters |
|---|---|---|
| 5 (3) | ~1K | Crons are a fixed floor (~1,900 short runs a day). Builds dominate. |
| 100 (20) | ~20K | CDN hit rate. Pictures and pages must stay HIT. |
| 500 (100) | ~100K | Per-tenant tags keep Publish local. The data cache stays bounded by tags, not by time. |
| 1,000 (200) | ~250K | Editor and dashboard polling × active creators. Keep every poll pausing when hidden and slowing when idle. |
| 5,000 (1,000) | ~1.5M | Crons that scan all creators (notifications: 101 creators in 5 batches) need a change-driven queue. AI jobs need a concurrency cap per account and per platform. |

What to keep:
- Every public answer is CDN-cacheable and keyed so private data never enters it.
- Invalidation is by tenant tag only.
- Background work only for creators with something due: claim rows with an index on `due_at`, never a scan of everyone.
- Pictures from the CDN. Large files straight from storage.
- No per-tenant infrastructure.

At 5,000 creators, `notifications` (hourly, all creators) should become event-driven. The others already read only due rows.

**Simulated usage test plan (no production load tests without approval):** use the Supabase stub (`scripts/supabase-stub-server.mjs`) with a local production build. Drive 5, 100, 500, 1,000 and 5,000 tenants with k6 or autocannon against `/w/<name>`, `/<handle>`, `/media/...` and `/api/track-view`. Record function calls per view (proxy and route logs), database queries per view (stub counter) and CDN-eligible responses (headers).

## G. Vercel dashboard settings for the owner

1. **Spend Management:** monthly budget of $40, alerts at 50 / 75 / 100%, and "pause production deployments" at the limit if a hard stop is wanted.
2. **Old projects:** delete or pause the 19 old `v0-*` projects that share this bill.
3. **Observability Plus:** keep it off. Speed Insights off unless it is read.
4. **Build machine:** Standard (8 GB) fits today at about 7.8 GB, with little margin as main grows. If deploys fail with exit 137, either turn on Enhanced Builds or trim code.
5. **Deploys:** fewer pushes to main (batch work) is the only lever on Build CPU.
6. **Usage page weekly:** Fast Origin Transfer, Function Invocations and ISR Writes should fall after Nov 12. Run `node scripts/check-cdn-cache.mjs` after a deploy: every line should be HIT or STALE.

## Re-checked on Nov 13

- Every production deploy since the fixes finished (83 more commits from other work), none out of memory. Build peak on today's main: about 7.8 GB on 4 CPUs. At the peak, Turbopack itself is about 7.5 GB, pnpm's own two processes about 180 MB and three small CSS workers about 180 MB. The last two come from how the build is launched, not from Storelib's code.
- `node scripts/check-cdn-cache.mjs`: every public address HIT (pages, creator page, website as a browser and as a crawler, live marker, picture). Also HIT: storelib.me OnePages, Explore, product pages, and creator pages with `?utm_` links.
- Still a function per visit, by design: `/p/<slug>` (the old product address; the main `/<handle>/<product>` address is cached), community pages (they show a member and a stranger different things; their data is cached), AI-built sites (10 seconds at the CDN so a publish shows at once).
- Production errors (last day): rare Supabase timeouts on Explore's product read, which its cache rides out. SQL part 445 adds the index that keeps that read quick as products grow.
- Scale of the hourly notifications job: leased batches, least recently checked first, stopping at a time budget, about 5,000 creators an hour at today's speed. It carries over safely when there are more.

## H. Open items and missing evidence

- Per-project and per-route cost was not available (billing and metrics APIs said not found; logs keep one day). The owner can open Usage grouped by project and by path.
- SQL part 444 is not run yet (and part 179's pings only fire once pg_net and `CACHE_INVALIDATE_SECRET` are set).
- Some products link to deleted `temp/` pictures (Supabase answers 404). The pages fall back, but re-uploading fixes them.
- Made-up subdomains and paths can still create cached 404 entries. Fixing that safely needs care around draft previews and password pages.
- The proxy runs near the visitor while the database is in us-east. A move would need Vercel support for pinning Routing Middleware to one region.
- Chat read marks (every 20 s while a chat is open) and community presence (every 60 s) were left as they are. They only run while someone has those screens open.
