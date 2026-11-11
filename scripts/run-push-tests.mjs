/**
 * Runs every suite under tests/.
 *
 * tsc into a scratch directory, then node. There is no test runner in this
 * project and this does not add one: a runner is a dependency, a config file
 * and a watch mode, for a suite that is two files. If this grows past a
 * handful this should become vitest — that is the point at which the
 * dependency pays for itself, and not before.
 *
 * Both suites are compiled TOGETHER and run in separate processes. Together,
 * because they share modules and one tsc invocation is faster than two;
 * separately, because each suite calls process.exit(1) on failure and a shared
 * process would let the first failure hide the second suite entirely.
 *
 * `server-only` resolves to an empty module outside a bundler, so the modules
 * under test import cleanly here.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync, unlinkSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, basename, dirname, relative } from "node:path"

// Fresh/temporary checkouts and parallel SQL changes use the current source catalog.
execFileSync(process.execPath, ["scripts/build-sql-catalog.mjs"], { stdio: "inherit" })

const SUITES = [
  /* Create a website on /app/website-builder: Start with AI, Start from blank and Browse themes; POST /api/website-builder/themes/create (both modes, no one-copy check, the library limit, a rollback, a blank home the agent reads as new), the description handed to the editor's Ask panel once (sessionStorage, ten minutes, start=ai taken off the address), and no link to /app/sites. */
  "tests/website-start.test.ts",
  /* Start with AI as a server job (lib/website-builder/ai-site): one strong plan checked against the manifest and what is real, the build through plan-apply and the editor's applier, every section written in parallel on a shared cached prefix and checked with checkSettings (one repair, nothing invented), Openverse photos copied under the SSRF guard and credited with no grey boxes, the check, steps that resume, one job per press, the fallback without SQL part 380, the operations the editor replays, the progress view, and calls, tokens and cost measured with fakes. */
  "tests/ai-site-generator.test.ts",
  /* Round AP (track 3): Start with AI from the Fitness coach preset to a site of its own. The preset's words reach the create route, the job row and the planner verbatim; with a coder the plan may hold custom sections and header and footer briefs; each coded file is accepted only after the strict compile and quality gate, its schema, its kind, no secret, no remote script, no typed picture, no placeholder and no banned word; the coded header and footer replace the theme's on every page reading the site's own menu; the code step stops before its deadline and the next turn carries on, with a ceiling on turns; placeholders, banned words and broken pictures are findings; no key in any prompt; the Website page refreshes through one transition. */
  "tests/ai-site-free-design-ap.test.ts",
  /* Round AQ (track 3): the two engines after AP and L met. New jobs are classic unless AI_BUILDER_AGENT=1; a file the classic job codes and a file the agent writes are refused for the same reasons in the same words (lib/website-builder/ai-site/gate.ts: secrets and env reads, no settings, a header without the menu, a picture default, placeholders, banned words, em dashes); the agent's system prompt carries STUDIO_CRAFT and its own frame; the inline build (no jobs table) carries on after a reload from the checkpoint this tab kept; both progress panels drawn. */
  "tests/ai-site-engines-aq.test.ts",
  /* Round L (AI website builder as a coding agent, docs/ai-builder/architecture.md): the shared contract. AI components are ai_ .storelib section files; a manifest written as <schema> is accepted by the real compiler and the editor's schema reader with every prop on a registry control (form_picker included); SQL part 401 (agent columns on ai_site_jobs, ai_site_job_events owner read and server write, file version author) follows the run-now conventions and agrees with the TypeScript event kinds, statuses, phases and steps. */
  "tests/ai-builder-contracts.test.ts",
  /* Round L, L2: Start with AI's agent jobs on Vercel. Each request runs the loop's iterations that fit with room for one more call, saves a bounded checkpoint after each and hands over through the signed self call; budgets (iterations, spend with the own key's larger cap, working time over invocations, repair cycles) end a job partial with drafts kept or failed when nothing was made; cancel at the next safe point; a crashed runner resumed from its checkpoint and fenced out; duplicate kicks held; crash loops and stale jobs given up on; the global live limit; progress events numbered once, batched, resumed and capped; plain words and recovery actions; Continue's bounded extension; the five minute sweep and cron; the poll's view, the client's merge and back off; the progress panel's states. */
  "tests/ai-site-agent-jobs.test.ts",
  /* Round L, L2 x L3: L3's loop driven by L2's durable runner (agent-engine.ts sliceStepper): the scripted fitness coach website completes through the runner, one runner iteration per model call, spend carried, events numbered once with one ending, the loop's phases not repeated, counts from files and pages, the loop's checkpoint kept; chained across requests and cancelled between calls with drafts kept. */
  "tests/ai-site-agent-engine.test.ts",
  /* Round L (L6): the design knowledge library under lib/storelib-ai/library (179 markdown entries embedded by scripts/build-ai-knowledge.mjs, kept in step), retrieval for sample briefs within a token budget, the search_knowledge tool in the contract shapes, the anti-slop evaluator (lib/ai-builder/slop.ts) on seeded slop and clean pages relative to a visual concept, concept validation and diverse directions, and the external component registry with verified licences. */
  "tests/ai-knowledge.test.ts",
  /* Round O (O1): the visual reference library under lib/storelib-ai/references. Every record valid with rights and provenance (52 original seed patterns, condensed taste-skill and impeccable principles, generated awesome-design-md and ui-ux-pro-max records with their licences, NOTICE.md); no seed names a brand and the prompt block never names an analysed brand or a URL; searchReferences deterministic, fitting the business, roles and kinds spread, deduplicated by picture, file and brand; the vision analysis (scripted model) bounded and analysis only; uploads checked, admin handlers refuse non admins, store privately, dedup by hash, edit with a version bump; the agent's plan phase is shown the reference pictures and the build phase is not; SQL part 431. */
  "tests/ai-references-o1.test.ts",
  /* Round N (N4): design intelligence. A type library whose faces all load (font-options TYPE_LIBRARY_FAMILIES, font-link weights), the concept refusing a default display face (Inter, Poppins...) or one that cannot load, directions for many subjects, the anti-slop type and layout rules (default fonts, fixed type, equal card grids, centred hero over cards, one rhythm, emoji icons, stock copy), the fourteen interactive .storelib examples compiled, checked and drawn through the agent's own checks, search_knowledge handing one over by id, and the prompt teaching a free site's own chrome (HEADLESS_HOOK_GUIDE), 10+ sections and restrained motion. */
  "tests/ai-design-n4.test.ts",
  /* Round O (O5): the site motion feel (Theme settings > Animations > Motion feel) as --t-motion-* on the canvas and the page, stilled for reduced motion; the motion primitives compiled, drawn, render checked and editable; site stories per business and the planner refusing the generic Hero, Features, Pricing, FAQ, CTA skeleton outside software; Chromium at 390px with and without reduced motion. */
  "tests/ai-motion-layout-o5.test.ts",
  /* Round P (P2a): the site template library: six original whole sites, each file through the agent's gate, every section with filled blocks, the site and finish rules, the render check, no slop P0, real Chromium at 1440 and 390 with JavaScript off; chooseTemplate, applyTemplate through a memory store, untouchedTemplateParts, list_templates and search_knowledge. */
  "tests/ai-templates-p2a.test.ts",
  "tests/ai-templates-p2b.test.ts",
  /* Round P (P3): motion islands, Storelib's own interactive effects a section configures with data-storelib-motion and data-motion-* params (lib/storelib-theme/motion-islands.ts, components/website-builder/motion-islands): params clamped, modes for reduced motion, low power, no WebGL, phones and the canvas; the sandbox may not set them; the render check knows them; three.js only in a chunk a 3d-object island loads; nothing from the markup runs; knowledge, examples and prompt; every island in Chromium, scrub frames on scroll, the still page, the markup put back. */
  "tests/motion-islands-p3.test.ts",
  /* Round O (O2): creative direction before generation (lib/storelib-ai/direction: the brief, art directions fitted to the business, the choice and the concept check) and the per-site DESIGN.md contract in Google's format, synced both ways with Theme settings, user overrides kept across AI edits (lib/ai-builder/design-contract.ts). */
  "tests/ai-direction-o2.test.ts",
  /* Round L (L3): the agent engine (lib/ai-builder/agent) with a scripted provider and an in-memory website: a blank fitness coach site (concept first, tokens as Theme settings, five original ai_ components, three real pages in the Main menu, its own header and footer, a real product bound), edit mode touching only the target file, compile repair and the verify/repair cycle ending partial when it must, iteration/spend/wall clock budgets, cancel, provider failures, the path rule and other permissions, and checkpoint compaction and resume across slices. */
  "tests/ai-builder-agent.test.ts",
  /* Round P (P1): the AI builder makes pictures (lib/storelib-ai/images). Unsafe prompts refused before any call; the art direction, light, lens and "no text, no logos, no real people" shaped in; OpenAI (/v1/images/generations, gpt-image-2.5-flare since gpt-image-1 was shut down), Gemini (the Interactions API) and Pexels each over a fake HTTP with the documented request shape, a deadline and one retry; the chain (own OpenAI key first, a refused own key never replaced by a paid platform provider, then Gemini, then stock, then none said plainly); stored in the owner's ai-images folder with source and origin in file_details (and without them before part 441); no key in any log; the agent's generate_image and find_photo refused before the concept, three at a time, spend in the job's spend, the per-job cap, plain progress words, the brief's text-forward note when nothing is set up; Regenerate owner only, own AI pictures only, rate limited and capped; Files lists them as AI. */
  "tests/ai-images-p1.test.ts",
  /* Round M: the live smoke (scripts/ai-builder/live-smoke.ts) run with a SCRIPTED model through the real runner and stepper on an in-memory job table: one call per step, requests handed over with the checkpoint through JSON and a fresh stepper each, a step after a hand over that depends on the tool answer before it, the spend, wall clock and request caps, the report and the saved files, and the gate (switch and key by name, no value printed). */
  "tests/ai-builder-live-smoke.test.ts",
  /* Round L, L5: AI components fully editable. Every prop kind round-trips (manifest, schema, compiler, sidebar control, saved value, render, schemaToManifest); withManifest never flattens a file; design tokens are Theme settings with --t-* read from them; saves are version checked and history and conflicts name the author; Edit with AI, the Design tokens panel and the form and animation controls are wired. */
  "tests/ai-builder-editor.test.ts",
  /* Round L4 (the AI component runtime): form_picker resolved to the creator's own published forms only and drawn as the live native form (answers to /api/forms/<id>/submit), bindings that resolve only this creator's ids, an AI blank site with no header or footer anywhere (theme setting site_chrome "home", live and custom domain path, editor, preview, product page), a coded header found by kind on the product page, custom_tokens as --t-* variables with unsafe values refused, list_capabilities with real ids, the render check's diagnostics, the sandbox's reserved island marks and the preview error bridge. */
  "tests/ai-builder-runtime.test.ts",
  /* Round AL4: the OnePage cover edge to edge at 5:2 and fetched first, Your files for the cover, the pattern kept out from behind the header, the gradient drifting on one composited layer (still for reduced motion, paused in a hidden tab), the avatar viewer, a Classic theme keeping a Hero, the Design tab's sticky way back; scripts/check-onepage-header-al4.mjs measures them. */
  "tests/onepage-header-al4.test.ts",
  /* Round AK6: a founder hands a business they built to a client's own login: a single use, expiring claim link kept only as its SHA-256, wrong email, self claim and the three business limit refused, every table with a creator_id or user_id decided, every route asks who is signing in, sign up and an existing account through the real route handlers, a failed transfer changes nothing (SQL 20271131, run on the harness by scripts/check-business-handoff-sql.sh). Round op-app: the link is storelib.com/team/claim/k7m2-x9qp-4hfd-w3nc (80 random bits, older 43 character links still open), the page and email speak as the Storelib Team without the founder's name, the founder's ended plan row is cleared so the new owner's billing starts fresh, a used link answers "used", and the whole story end to end through the real routes: send, track, sign up from the email, a payout balance holding it, accept, ownership, team role, billing, sign in address, single use, then resend, cancel and expiry. */
  "tests/business-handoff.test.ts",
  "tests/onepage-link-metadata.test.ts",
  "tests/native-forms-actions-prices.test.ts",
  "tests/native-actions.test.ts",
  /* Round AK5: the form engine (types, rules, steps, scoring, templates, CSV), bookings across DST with the double booking guard, and public submit security (honeypot, limits, signed webhooks, sealed secrets). */
  "tests/forms-engine.test.ts",
  "tests/forms-bookings.test.ts",
  "tests/forms-security.test.ts",
  "tests/forms-booking-payment.test.ts",
  /* Round AR (track 2): OnePage bookings end to end. Availability across time zones and DST with date overrides, buffers, notice, the daily limit and chosen lengths; the double booking guard (capped function, a move refused onto a held time, the database's 23P01 a 409); every booking read and write named by its owner; who hears what for a new, moved and cancelled booking (bell and phone, creator email, visitor email with .ics); Google Calendar OAuth state, tokens, freeBusy and events with Meet replayed from tests/fixtures/google-calendar-ar2.json, never called; the signed change-or-cancel link. scripts/check-bookings-sql-ar2.mjs runs part 410 on a real Postgres. */
  "tests/onepage-bookings-ar2.test.ts",
  /* Round AL5: Leads in Emails, Forms beside it, the Audience item gone, missing forms tables said plainly, one retry, the pre-chat and the phone country list. */
  "tests/forms-leads-al5.test.ts",
  "tests/forms-an2.test.ts",
  /* Round 51: Forms in Contacts (kinds, response counts and usages in a fixed number of reads, ?form/?view/?response/?message deep links, Responses, Insights, Settings, View contact through /app/contacts/open) and Community connected (?member deep link, join answers and activity in the member sheet, one membership per person, joining never marketing consent). */
  "tests/forms-community-r51.test.ts",
  "tests/onepage-modern-blocks.test.ts",
  "tests/onepage-block-settings-ak3.test.ts",
  /* Round AL3: the editor drags past what is on screen, an open block follows its height, Layout draws and Settings says, Storelib fields, every block counted. */
  "tests/onepage-editor-al3.test.ts",
  "tests/admin-sql-updates.test.ts",
  "tests/typecheck-ratchet-process.test.ts",
  "tests/wizard27.test.ts",
  "tests/community-profile-j1.test.ts",
  "tests/surfaces25.test.ts",
  "tests/variants25.test.ts",
  "tests/topbar25.test.ts",
  "tests/post25.test.ts",
  "tests/explore25.test.ts",
  "tests/proxy-auth-speed.test.ts",
  "tests/net-request.test.ts",
  /* Round net-1028: every Supabase request has a deadline, a read that hit a blip is asked again (never a write), a failed read is not "no row", auth that did not answer falls back to the token's signature, request ids and clean log lines; scripts/check-settings-switch.mjs SWITCH_ONLY=hang measures a Settings section whose code never comes. */
  "tests/net-resilience.test.ts",
  /* Round rel-auth: a timeout, a 5xx or a slow Supabase Auth is never a sign out and never a yes (routes answer 503 with Try again, not 401), a change never takes the token's signature alone, the proxy reads no session for a request with none, one auth answer per /app render, the shell's and Home's extras with their own ceiling; scripts/check-dashboard-roundtrips.mjs counts auth requests per page (FULL=1 for full loads). */
  "tests/auth-reliability.test.ts",
  /* Round rel3-auth: an access token checked here when Supabase Auth does not answer: HS256 with SUPABASE_JWT_SECRET (the project is on the legacy shared secret, JWKS empty) or ES256 with the JWKS; forged, altered, expired, wrong issuer, audience or role, alg none or confusion all refused; the secret never in a client file. */
  "tests/auth-local-verify.test.ts",
  /* Round rel3-auth: Supabase Auth answering after 15s, never, or 503: /app's server render (currentUserForRequest, pageUser) still has the person from the token's verified HS256 claims in ~2.5s with one question to Auth; the proxy asks Auth nothing for a token that checks out; POST /auth/sync-session writes the session; a forged, altered, expired, wrong issuer or anon-role token is never a user; Auth's own "no" still signs out; a change (routeUser fresh) still never takes the signature alone. */
  "tests/auth-hs256-outage.test.ts",
  /* Round rel3-auth: "We could not check your sign in" and "Cannot reach the server" only after quiet tries: requestJson asks a 503 marked X-Storelib-Auth again twice with jitter inside its deadline (never an ordinary 503); the gate tries three times over ~6s before its screen and ten times in the background (2s..30s) while it is up, putting the page back when GET /api/auth/state says signed in (one word, no user data). */
  "tests/auth-client-retry.test.ts",
  /* Round 49: "We could not check your sign in just now" inside /app (Send analytics): one Supabase Auth question per request in API routes too (request cookie store, not only React cache); a read-only GET takes a page's answer (Auth, then the token's verified signature) and, with no local verifier, one more Auth try with backoff; a change still needs Auth itself and asks it again (token first, so a hung try's lock no longer blocks the retry); Auth's own no stays final; X-Storelib-Auth-Check names the check and the verifier kind, never a key; the browser asks a read's marked 503 again three times; no POST, PUT, PATCH or DELETE takes the lenient answer. */
  "tests/auth-r49.test.ts",
  /* Round rel-security (F1): the sign up code goes only to the account's own address and proves only that, five wrong codes burn it, and guest orders join only an account whose current address is the proven one (SQL part 345). */
  "tests/auth-email-code.test.ts",
  /* Round rel-security (F3): a 500, 502, 504 or 429 on the token refresh is handed to supabase-js as a 503, so the real GoTrue client keeps the session instead of signing out; a refused refresh token still signs out. */
  "tests/auth-refresh-outage.test.ts",
  /* Round 50: refresh outages keep the session, one renewal per token, the proxy waits for its renewal, the editor asks before "Sign in" */
  "tests/auth-session-reliability-r50.test.ts",
  /* Round 52: an ordinary read or change takes the access token's verified signature first and never waits on Supabase Auth (was every change: "We could not check your sign in just now"); the strict list (password, email, deletion, payouts, billing, Stripe Connect, keys, team roles) still asks Auth itself; forged, expired or foreign tokens never a user; the cookie's user_metadata and created_at, never its app_metadata or email; the verifier logged once. scripts/check-auth-local-r52.mjs counts it against a slow or down Auth. */
  "tests/auth-strict-r52.test.ts",
  /* Round rel-security (F4): GET /auth/sync-session writes no cookies, it only goes on to its path; every caller posts. */
  "tests/auth-sync-session-get.test.ts",
  /* Round rel-security (F6): a device code gets five guesses per order, then every live one is burned; confirm-device is limited per caller address. */
  "tests/device-code-guard.test.ts",
  /* Round rel-security (F2): the admin login is limited per caller address and warns loudly while its fallback credential is in use (the owner's fallback is kept). */
  "tests/admin-login-limit.test.ts",
  /* Round rel-security (F8): /auth/continue checks the token signature when Auth does not answer, so a signed in person is not sent to the login form during an outage. */
  "tests/auth-continue-outage.test.ts",
  /* Round rel2-security2 (SEC-10): an App Link bridge token is deleted and read in one statement, so two requests at once never both get the session; the stored path is checked; redirects are no-store. */
  "tests/bridge-token-once.test.ts",
  /* Round rel2-security2 (SEC-9): no live session token is handed to the storelib:// scheme, which any Android app can claim; the legacy reset link finishes in the browser. */
  "tests/custom-scheme-tokens.test.ts",
  /* Round rel2-security2 (SEC-11): no console call under app/, lib/ or proxy.ts logs a full email address, a session token, a cookie or a whole request body (lib/privacy/mask-email). */
  "tests/log-privacy.test.ts",
  /* Round rel2-security2 (SEC-12): Permissions-Policy on storelib.com and www only (camera and microphone for this site, camera and payment for Stripe's frames, geolocation, USB and screen capture off); the content security policy stays report only. */
  "tests/permissions-policy.test.ts",
  /* Round rel-jobs: long work that ends (Mailgun, the theme and code agents' deadlines from the request's start, fetchPublic's total deadline), providers that fail fast (lib/net/breaker.ts: Mailgun, fulfilment, GitHub), one run of a cron at a time (recordCronRun's lease), Storelib AI's per creator limit from its own rows, and faults that stay put (checkout imports no AI, publishing sends no email). */
  "tests/rel-jobs.test.ts",
  /* Round rel-shared: community files checked at posting (size and bytes, not only at the optional complete step), the payout push to the user and awaited, run-wide deadlines for the community, physical, seo-index, warm-sites and notify crons, deadline-wrapped Supabase clients in the email cron and Mailgun webhook, cron partial failures reported, a Web Push timeout. */
  "tests/rel-shared.test.ts",
  /* Round rel-sites: public sites when the database is slow or away: an AI site's failed lookup is a 503 with Retry-After (never a 404 or a 301) and its last live copy is held; a Creator Page's failed profile or creator read is the error screen, never the gate's 308 or a 404; a OnePage lookup that failed or ran out serves the last answer for the name or the error screen, never "missing"; an AI site publish whose switch did not take puts the live version back; an AI site address check that failed stops the publish (fail closed); a theme publish the database cancelled (57014, PGRST002) is asked once more, within a stated two minutes; Storelib AI limits whose count cannot be read refuse the run (503, Try again); a theme's draft stylesheets, scripts and settings are served only with the install's signed pass; a theme site's last good copy is kept by use and its held name and install entries outlive a deploy; a creator name is matched literally (`_` and `%` escaped). */
  "tests/rel-sites.test.ts",
  /* Round rel3-canvas: the builder's canvas on a site of its own (NEXT_PUBLIC_CANVAS_ORIGIN, off by default): the setting, the shell route's answer (404 off, off its host, without the install's draft pass, for an editor that is not the builder; framed only by the editor), the OnePage host's /__canvas/<uuid>, the shell's exact-origin relay with the page still sandboxed with no origin, and exact postMessage targets on both sides; scripts/check-canvas-site-r3.mjs is the browser half. */
  "tests/canvas-origin.test.ts",
  /* Round rel-obs: the request id on error rows and their log lines (onRequestError, crons, webhooks), informational lines at their real level, the load test refuses production, /api/health bounded. */
  "tests/rel-obs.test.ts",
  /* Round r48-obs: every server error line is one scrubbed JSON line with its route and request id (console guard, onRequestError logged once), no token, key, cookie, code, card or full address in a log, an error boundary per major segment, /api/health carries no secret, every cron says its maxDuration inside the one-run lease, smoke checks cover the critical paths, the load scripts stay local or off production. */
  "tests/obs-r48.test.ts",
  /* Round rel-sites2: published sites while the database is slow, on Next's real data cache. EVD-1: a server that never served a site (a new deploy, a scale-out) serves it from the copy every server can read when every read fails, and a Publish or a take down drops that copy. EVD-2: a gateway's HTML error page or a JSON body cut short is asked again and then a short 503 error, never data or the page as a message. EVD-3: robots.txt, sitemaps, the manifest, the icon, theme assets and the cover read no session through the real proxy (no Supabase Auth call), /app still does. EVD-5: the static /500 and /404 pages are added to every server trace after next build (scripts/trace-error-pages.mjs). */
  "tests/rel-sites2.test.ts",
  /* Round rel3-leftovers: the signed out redirect from /app and /sell is private, no-store through the real proxy (Vercel called it public). */
  "tests/rel3-leftovers.test.ts",
  "tests/live-speed-view.test.ts",
  "tests/translate-ai-speed.test.ts",
  "tests/open-translate.test.ts",
  /* Round 13: translation on free allowances that keeps working: the Gemini model read from Google's list (a retired one handed over), paced and rested by its own quotas, each text once, unsound answers refused; Cloudflare Workers AI second. */
  "tests/translation-providers.test.ts",
  "tests/commerce-attention.test.ts",
  "tests/cash-on-delivery.test.ts",
  "tests/order-currency.test.ts",
  /* Round AE4: one store logo for receipts, the Logo card and the checkout; the summary line kept per account; the owner's hand-off once per host for two minutes; legacy orders in the store's currency of their day; the unconverted count; CSV formulas behind a space; a second free claim; Customers less refunds. */
  "tests/ae4-leftovers.test.ts",
  "tests/ai-theme-settings.test.ts",
  "tests/translation-integrity.test.ts",
  "tests/translations-k3.test.ts",
  "tests/languages-checkout-w.test.ts",
  /* Round X3: light or dark in Website Settings (the shared choice), the quieter language chip, Copy under the creator's message, a product's translations one language at a time; scripts/check-ui-polish-x.mjs measures them. */
  "tests/ui-polish-x.test.ts",
  "tests/shop-money.test.ts",
  /* Round ed-1022: every edit on the canvas at once (the ease, the overlay kept after a drag, the currency code, variables-only theme values); scripts/check-editor-live.mjs measures them. */
  "tests/editor-live-updates.test.ts",
  /* Round 1023: the sidebar's drag (a trackpad scroll under a held row, Escape, a drag that always ends clean, each move said aloud) and every select setting's one rule, buttons for one to three options, the dropdown past that; scripts/check-sidebar-dnd.mjs and scripts/check-segmented.mjs measure them. */
  "tests/sidebar-dnd.test.ts",
  /* Round 1026: a swipe in the editor scrolls what is under the finger (from an icon, after a drag, a theme's hold in the canvas, the native guard, leftovers let go); scripts/check-editor-touch.mjs measures it. */
  "tests/editor-touch-scroll.test.ts",
  "tests/segmented-select.test.ts",
  /* Round canvas-1023: the canvas that stopped scrolling (a held page with nothing open, a preloader's wait that never ended, a page that left the frame), the toolbar over a selected block, Add section between an imported theme's sections; scripts/check-canvas-freeze.mjs and check-canvas-toolbar.mjs measure them. */
  "tests/editor-canvas-freeze.test.ts",
  "tests/editor-canvas-toolbar.test.ts",
  /* Round freeze2-1023: the canvas held from its first paint (the first look, the first wheel, a stopped smooth scroll, what holds a page, a preloader that never goes), a block's settings opening at their top, a layout setting changed in place; scripts/check-canvas-landing.mjs, check-sidebar-open.mjs and check-theme-settings-live.mjs measure them. */
  "tests/editor-freeze2.test.ts",
  "tests/store-currency.test.ts",
  "tests/round-am.test.ts",
  "tests/round-an.test.ts",
  "tests/checkout-market-overhaul.test.ts",
  "tests/languages-panel.test.ts",
  "tests/auto-translate.test.ts",
  "tests/checkout-words.test.ts",
  "tests/checkout-text.test.ts",
  /* Round chk-1021: "Buying for a business" only where the store turns on Company invoices, in every checkout and route; SQL part 256. */
  "tests/checkout-company-invoice.test.ts",
  "tests/order-emails-language.test.ts",
  "tests/site-languages-seo.test.ts",
  "tests/playbook24.test.ts",
  "tests/shippingapps24.test.ts",
  /* Round Y4: shipping labels across every fulfilment path (partial weight, kept labels, ship again, other orders, local delivery); scripts/check-labels-y4.mjs measures the label screens. */
  "tests/labels-fulfil-y4.test.ts",
  "tests/admindocs23.test.ts",
  "tests/buyer24.test.ts",
  /* Round 27 (B27): the buyer's order pages: Cancel order cancels and refunds, live status, words, logo, Visit store, returns. */
  "tests/buyer27.test.ts",
  /* Round 27 (H27): order help live on both sides, on the shop's website, Ask Storelib gated, Storelib's cases */
  "tests/help27.test.ts",
  "tests/storelib-reviews.test.ts",
  "tests/reviews-manage.test.ts",
  "tests/review-widgets.test.ts",
  /* Storelib Reviews › Add to website: the builder adds the widget once the page asked for is open (lib/reviews/widgets/arrival.ts). */
  "tests/review-widget-arrival.test.ts",
  "tests/reviews-import-v.test.ts",
  "tests/reviews-product-page.test.ts",
  /* Round reviews-1023: Storelib Reviews in an imported theme as a Shopify reviews app (the review metafields everywhere, Star rating and Reviews app blocks, Shop words, aggregateRating); scripts/check-compat-reviews.mjs measures them. */
  "tests/compat-reviews-blocks.test.ts",
  "tests/app-menu19.test.ts",
  "tests/builder-nav19.test.ts",
  "tests/canvas20.test.ts",
  "tests/canvas-scroll-motion.test.ts",
  "tests/builder25.test.ts",
  "tests/help23.test.ts",
  "tests/help-center.test.ts",
  /* The upsells and bundles guide (lib/help/offer-articles.ts): the screens' words and real screenshots, scripts/help-offer-shots.mjs. */
  "tests/help-offers.test.ts",
  "tests/select22.test.ts",
  "tests/files-picker19.test.ts",
  "tests/polish21.test.ts",
  "tests/files-w6.test.ts",
  "tests/perf-speed18.test.ts",
  "tests/perf-health18.test.ts",
  "tests/perf-collect.test.ts",
  "tests/profile-display-name.test.ts",
  "tests/new-tab-links.test.ts",
  "tests/publish-tap-away.test.ts",
  "tests/lean-images.test.ts",
  "tests/buy-buttons-checkout.test.ts",
  "tests/integrations-settings-sheet.test.ts",
  "tests/settings-sheet-desktop.test.ts",
  "tests/integrations-i4.test.ts",
  /* Round 30: the Integrations page's pill order, All mixed, the pill in the address, a return with no landing (scripts/check-integrations-round30.mjs measures them). */
  "tests/integrations-round30.test.ts",
  /* Round K4: the marketplace (pills with live counts, Filter, the list in the address) and the integration page's shell, its actions and the plug-in API for built-in apps. */
  "tests/integrations-k4.test.ts",
  /* Round 27: the /app page bar sticky only where it is worked from, the cards' hover and badges, an integration's page (no title, one line, the following Connect), /app/reviews and its tabs (scripts/check-integrations27.mjs measures them). */
  "tests/integrations27.test.ts",
  "tests/settings-r1.test.ts",
  "tests/settings20.test.ts",
  "tests/limit21.test.ts",
  "tests/storefront23.test.ts",
  "tests/followups23.test.ts",
  "tests/store-settings-reach.test.ts",
  "tests/ai-memory.test.ts",
  "tests/product-binding.test.ts",
  "tests/shopify-import.test.ts",
  "tests/editor-groups-saves.test.ts",
  "tests/site-resilience.test.ts",
  "tests/compat-engine.test.ts",
  "tests/compat-accounts.test.ts",
  "tests/compat-storefront-accuracy.test.ts",
  "tests/tab-title.test.ts",
  "tests/import22.test.ts",
  "tests/compat-section-preview.test.ts",
  "tests/section-preview-stable.test.ts",
  "tests/section-categories.test.ts",
  "tests/canvas-loading.test.ts",
  "tests/compat-recently-viewed.test.ts",
  "tests/compat-header-cards.test.ts",
  "tests/shopify-overlay-import.test.ts",
  "tests/editor-save-errors.test.ts",
  "tests/builder-october-fixes.test.ts",
  "tests/editor-inspector.test.ts",
  "tests/admin-ops.test.ts",
  "tests/native-app-links-inapp.test.ts",
  "tests/merge-markers.test.ts",
  "tests/imports-resolve.test.ts",
  "tests/canvas-containment.test.ts",
  "tests/new-user-site.test.ts",
  "tests/agent-rules.test.ts",
  "tests/agent-mcp.test.ts",
  "tests/agent-brain.test.ts",
  "tests/agent-intent.test.ts",
  "tests/agent-site-pages.test.ts",
  /* Round Z3: Storelib AI held to 22 owner prompts (routing and intent), no token budget failure, a cut off turn asked again, a new section on an imported theme, the store's currency and reviews. */
  "tests/agent-eval-z3.test.ts",
  "tests/coded-chrome.test.ts",
  "tests/product-source.test.ts",
  "tests/editor-stability.test.ts",
  "tests/community-mobile.test.ts",
  "tests/live-settings.test.ts",
  /* Round 34: a sidebar control and the canvas that follows it on a 44 section page: a theme value drawn by the sections on screen, one draw in flight, no whole-page restyle on the first press, the page not one layer, switches and selects in their own frame (scripts/check-editor-live-edit.mjs measures them at 1x and 4x). */
  "tests/editor-live-edit-34.test.ts",
  /* Round 35: a section's setting and a theme value dragged on an imported theme follow the finger; scripts/check-compat-live-edit.ts measures them. */
  "tests/compat-live-edit-35.test.ts",
  /* Round 36: a theme value only the layout's CSS reads, on an imported theme, written as the layout's styles drawn alone; scripts/check-compat-live-edit.ts measures it. */
  "tests/compat-theme-css-36.test.ts",
  /* Round 36: the builder's canvas draws a .storelib section's scheme colours as its root's variables, so a scheme colour under a finger draws no section again; scripts/check-scheme-vars.ts compares the computed styles, scripts/check-editor-live-edit.mjs measures the drag. */
  "tests/scheme-vars-36.test.ts",
  "tests/theme-freedom.test.ts",
  "tests/reference-diff.test.ts",
  "tests/ai-runs-admin.test.ts",
  "tests/site-media.test.ts",
  "tests/physical-separation.test.ts",
  "tests/section-integration.test.ts",
  "tests/section-framework-t.test.ts",
  "tests/shopify-parity-u.test.ts",
  "tests/site-seo.test.ts",
  "tests/page-seo.test.ts",
  "tests/section-flash.test.ts",
  "tests/site-focus.test.ts",
  "tests/button-colors.test.ts",
  "tests/canvas-parity.test.ts",
  "tests/cookie-banner.test.ts",
  "tests/ai-keeps-working.test.ts",
  "tests/site-address.test.ts",
  "tests/custom-domains.test.ts",
  "tests/creator-domain-seo.test.ts",
  /* Round 44: creator surfaces in search: storelib.com/<handle>/<slug> is that creator's product (a wrong handle goes to the right one, two creators may share a slug), a creator page domain lists only its own pages, /products/<slug> names the one canonical, a member profile and a banned creator's community follow the spam and ban rules, drafts and private pages in no index. */
  "tests/seo-creator-r44.test.ts",
  /* Round 31: a domain connected to one community: what it serves, who may connect it, the canonical, the panels */
  "tests/community-domains-round31.test.ts",
  "tests/emails-page.test.ts",
  /* Round 51: Emails in three tabs (Campaigns | Automations | Settings), older tabs redirected to Contacts, Campaigns as one list, people from Contacts limited to marketing eligible ones, Membership and Course onboarding entered once per event, templates only for wired triggers, SQL part 379. */
  "tests/emails-r51.test.ts",
  /* Wave 5: Contacts in Storelib's list look (the list bar, one ⋯ for import and export, one card with views, search, sort, chips and a footer; a profile on one Details card), every filter, bulk action and address kept. */
  "tests/contacts-simple-w5.test.ts",
  /* Wave 6: Contacts and Forms in the /app pane, one bar per screen; a form edited as a coupon or a product (its name as the title, phone bar, foot bar, cards the width of the bar). */
  "tests/contacts-forms-w6.test.ts",
  "tests/contacts-nav-w7.test.ts",
  /* Wave 8: Contacts switches without a flash or a fade: a form's tabs as Storelib's pills with Responses and Insights kept mounted and cached, People's views read ahead and swapped in place, a booking week in switch rows, message links straight to Contacts › Forms. */
  "tests/contacts-smooth-w8.test.ts",
  /* Wave 9: Add contact as one clean sheet (checked field by field, a person already there named, on the list at once, notes and a phone kept), a person's Edit shown at once and the journey in time order, Forms shown at once on a second visit, Publish resting when there is nothing new. */
  "tests/contacts-add-w9.test.ts",
  /* Wave 5: Emails on a phone as it was before round 51: one row of views, Automation and New email on every view, no second row; a computer keeps the three tabs. */
  "tests/emails-phone-w5.test.ts",
  "tests/orders-view.test.ts",
  /* The Orders page a page at a time (lib/orders/paged.ts): the same orders, numbers, counts and figures as when it read every row. */
  "tests/orders-paging.test.ts",
  "tests/orders-detail.test.ts",
  "tests/analytics-reports.test.ts",
  "tests/analytics-collection.test.ts",
  /* Round 42: each row's own line in an opened report (lib/analytics/row-series), clicks between pages of the same site (nav_click, lib/analytics/site-clicks), and the type filter as one chip. */
  "tests/analytics-row-series.test.ts",
  "tests/analytics-rollup-sql.test.ts",
  "tests/analytics-report-sql.test.ts",
  "tests/analytics-review.test.ts",
  "tests/own-marker.test.ts",
  "tests/dispute-orders.test.ts",
  /* Round AD2: orders end to end. A chargeback closes the library entry and a won one opens it, ledger money converted for memberships and disputes, a corrected email reaches an order that ships, money in its own unit, refunds of what is left, lists past 1,000 rows. */
  "tests/orders-ad2.test.ts",
  "tests/anon-visit.test.ts",
  "tests/analytics-completeness.test.ts",
  /* Round Z6: operating systems, referrers by company (official marks), page titles, the five step funnel, physical and digital sales, and the physical checkout's steps tracked (scripts/check-analytics-reports.mjs measures the cards). */
  "tests/analytics-audience.test.ts",
  /* Round ana-1021: a visitor's browser to the seller's report through the real tracker, collect, the reports' answer and a database fake (every surface, bots, repeats, orders); every timeframe, the comparison, product and place on every number, the seller's clock, the sections a seller sees and the reports they add (scripts/check-analytics-tabs.mjs measures the tabs, shifts and switching). */
  "tests/analytics-e2e.test.ts",
  /* Round AB2: every /app Analytics figure against a fixture counted by hand and an independent reference (7 ranges, 5 places, All/Digital/Physical), the sales reports counted by the tabs' own rules, the comparison across a DST week, the yen cards, the morph by what a store sells, Add report at the bottom and the CSV export (scripts/check-analytics-ab2.mjs measures the page). */
  "tests/analytics-accuracy.test.ts",
  "tests/order-followups.test.ts",
  /* Round AC2: a lei store selling in five other currencies through the routes' own code with day rates in the database fake, yen and dinar stores, the phantom discount of a converted line, refunds dated by the refund, shares that add up to 100, changes against nothing and below nothing, and the export's report and format choices (scripts/check-analytics-ac2.mjs measures the page). */
  "tests/analytics-currency.test.ts",
  /* Round AD1: bugs found by reading every analytics path, each a failing check first: Home's revenue line and the chart axis in the currency's own decimals, a product's orders as payments, kept answers of one period shown as another's, the jsonb origin, GA's purchase value in yen, the creator's own connected domain opened from the app. */
  "tests/analytics-ad1.test.ts",
  "tests/analytics-filters.test.ts",
  /* Round ana-1028: test sales out of every Analytics figure (and part 328's all time line), a community's money in the store's currency at each row's own day's rate, and the refund reads beside the orders (SQL part 324's indexes). */
  "tests/analytics-r1028.test.ts",
  "tests/home-figures.test.ts",
  "tests/auth-session.test.ts",
  "tests/library-depth.test.ts",
  "tests/provider-scope.test.ts",
  "tests/for-you.test.ts",
  "tests/own-reviews.test.ts",
  "tests/review-columns.test.ts",
  "tests/reviews-system.test.ts",
  "tests/avatar-one-rule.test.ts",
  "tests/nav-drawer.test.ts",
  "tests/header-motion.test.ts",
  "tests/storefront-mobile-drawer.test.ts",
  "tests/editor-navigation.test.ts",
  "tests/library-and-pages.test.ts",
  "tests/creator-page-products.test.ts",
  "tests/deleted-product-gone.test.ts",
  "tests/onepage-preview-parity.test.ts",
  /* Round 10 audit: the preview and the live page from one saved page (currency, social row, link addresses), the editor opens clean, archive and undo, undo back to saved; scripts/check-onepage-audit.mjs drives the real editor through the same cases. */
  "tests/onepage-preview-live-r10.test.ts",
  "tests/product-delete.test.ts",
  "tests/product-visibility.test.ts",
  "tests/course-player.test.ts",
  "tests/new-product-kinds.test.ts",
  "tests/native-scroll-guard.test.ts",
  "tests/app-mobile-nav.test.ts",
  "tests/buyer-tab-bar.test.ts",
  "tests/nav-tabs15.test.ts",
  "tests/nav-feel.test.ts",
  /* Round 29: the tab bar's glass, a community's header across its tabs, pictures arriving (scripts/check-mobile-round29.mjs measures them). */
  "tests/mobile-round29.test.ts",
  "tests/app-nav-round10.test.ts",
  "tests/buyer-chrome.test.ts",
  "tests/buyer-qa.test.ts",
  "tests/quick-search.test.ts",
  "tests/account-hub.test.ts",
  "tests/header-elements.test.ts",
  "tests/site-cart.test.ts",
  "tests/cart-checkout.test.ts",
  "tests/basket-checkout.test.ts",
  "tests/site-checkout.test.ts",
  "tests/site-checkout-physical.test.ts",
  /* Round cart-1023: an imported theme's discount box, Estimate shipping and order note, priced by the website checkout; scripts/check-compat-cart-drawer.ts presses them in a browser. */
  "tests/compat-cart-discount.test.ts",
  "tests/owned-checkout.test.ts",
  "tests/membership-duplicates.test.ts",
  "tests/checkout-safety.test.ts",
  /* Track X2: checkout speed (the server reads side by side, Stripe from the head, the physical cart priced first; scripts/check-checkout-speed.mjs times it). */
  "tests/checkout-speed-x.test.ts",
  "tests/checkout-receipt.test.ts",
  /* Round docs-1028: every document a sale makes (the receipt and invoice PDF, the receipt email, the order confirmation, the packing slip) drawn from fixture orders: a download, a parcel with options and an engraving, a bundle and a code, a market order in lei, a refund; invoice numbers in sequence per store (SQL part 321). */
  "tests/order-documents.test.ts",
  "tests/return-to.test.ts",
  "tests/sell-intent.test.ts",
  "tests/no-image-transforms.test.ts",
  "tests/page-performance.test.ts",
  "tests/products-area.test.ts",
  "tests/dom-guard.test.ts",
  "tests/product-bundle-zip.test.ts",
  "tests/invoice-logo.test.ts",
  "tests/follow-route.test.ts",
  "tests/cover-unpack.test.ts",
  "tests/auth-refresh-race.test.ts",
  "tests/mailgun-signature.test.ts",
  "tests/account-refusals.test.ts",
  "tests/editor-parts.test.ts",
  "tests/category-suggest.test.ts",
  "tests/sql-aggregate.test.ts",
  "tests/spam-defence.test.ts",
  "tests/digital-platform.test.ts",
  "tests/sites.test.ts",
  "tests/agent-loop.test.ts",
  "tests/openai-provider.test.ts",
  "tests/theme-agent.test.ts",
  "tests/storelib-ai.test.ts",
  "tests/client-errors.test.ts",
  "tests/new-deploy.test.ts",
  "tests/production-errors.test.ts",
  "tests/react-binding.test.ts",
  "tests/oauth-errors.test.ts",
  "tests/session-durability.test.ts",
  "tests/session-stability.test.ts",
  "tests/account-settings.test.ts",
  "tests/client-error-gate.test.ts",
  "tests/gallery-and-back.test.ts",
  "tests/motion-properties.test.ts",
  "tests/creator-page.test.ts",
  "tests/config-colour-field.test.ts",
  "tests/contact-gate.test.ts",
  "tests/hook-order.test.ts",
  "tests/link-navigation.test.ts",
  "tests/rsc-boundary.test.ts",
  "tests/editor-resync.test.ts",
  "tests/bar-colors.test.ts",
  "tests/cover-focal.test.ts",
  "tests/catalog-order.test.ts",
  "tests/sheet-controls.test.ts",
  "tests/product-media.test.ts",
  "tests/creator-url.test.ts",
  "tests/marketing-weight.test.ts",
  "tests/product-cache-scope.test.ts",
  "tests/icon-weight.test.ts",
  /* Round 46: what every marketing page carries before it can answer a tap (supabase-js, every screen's words, the lightbox, the phone's search screen, the language list), fetched when used. */
  "tests/shell-weight-r46.test.ts",
  "tests/reserved-segments.test.ts",
  "tests/import-shadowing.test.ts",
  "tests/jsx-comments.test.ts",
  "tests/admin-dashboard.test.ts",
  "tests/admin-queries.test.ts",
  "tests/admin-routes.test.ts",
  "tests/admin-logic.test.ts",
  "tests/cron-reachable.test.ts",
  "tests/theme-presets.test.ts",
  "tests/sheet-reserve.test.ts",
  "tests/featured-order.test.ts",
  "tests/product-bars.test.ts",
  "tests/product-page-load.test.ts",
  "tests/back-no-replay.test.ts",
  "tests/explore-entrance.test.ts",
  "tests/explore-browse.test.ts",
  "tests/explore-communities.test.ts",
  "tests/explore-speed.test.ts",
  "tests/explore-round11.test.ts",
  "tests/explore-polish.test.ts",
  "tests/community-cards.test.ts",
  "tests/route-loading-bar.test.ts",
  "tests/back-plan.test.ts",
  "tests/back-never-stalls.test.ts",
  "tests/edge-swipe-back.test.ts",
  "tests/avatar-grounds.test.ts",
  "tests/brand-logo.test.ts",
  "tests/quick-access-urls.test.ts",
  "tests/header-link-navigates.test.ts",
  "tests/header-buttons.test.ts",
  /* Cinematic homepage: fixed first line, reserved rotating phrases, one deferred video, native signup. scripts/check-home-hero.mjs measures real SSR/hydration and media fallbacks. */
  "tests/home-hero.test.ts",
  /* Round AD5: Library > Courses as compact cards with a thin bar and one line (no progress pills), and the dark header a step above the page with a hairline and a shadow once scrolled. scripts/check-library-courses.mjs and scripts/check-home-hero.mjs measure them. */
  "tests/library-courses-ad5.test.ts",
  "tests/header-flex.test.ts",
  "tests/search-strip-entrance.test.ts",
  "tests/site-autosave-safety.test.ts",
  "tests/site-nav-destinations.test.ts",
  "tests/field-panel.test.ts",
  "tests/sheet-controls.test.ts",
  "tests/return-navigation.test.ts",
  "tests/keyboard-viewport.test.ts",
  "tests/keyboard-scroll-loop.test.ts",
  "tests/product-page-cache.test.ts",
  "tests/purchase-verify.test.ts",
  "tests/receipt-download.test.ts",
  "tests/receipt-actions.test.ts",
  "tests/contact-seller.test.ts",
  "tests/no-self-recursion.test.ts",
  "tests/email-inbox-image.test.ts",
  "tests/onepage-search-share.test.ts",
  "tests/onepage-share-image.test.ts",
  /* Round 40: the OnePage editor's link stats are Analytics' own figures, each social icon its own click, noindex for a page that shows nothing. */
  "tests/onepage-analytics-seo-r40.test.ts",
  /* Round 41: every published OnePage, community and website indexed by one rule each, nofollow until an account sells, each website's sitemap, robots and its own icon on its own host. */
  "tests/indexing-r41.test.ts",
  "tests/onepage-host.test.ts",
  "tests/memory-r12.test.ts",
  "tests/onepage-old-links.test.ts",
  "tests/policy-pages.test.ts",
  "tests/footer-complete.test.ts",
  "tests/header-footer-t.test.ts",
  "tests/settings-cleanup.test.ts",
  "tests/section-responsive.test.ts",
  "tests/anthropic-provider.test.ts",
  "tests/ai-chatgpt-only.test.ts",
  "tests/own-ai.test.ts",
  "tests/payments-stripe-only.test.ts",
  "tests/admin-payments-fees.test.ts",
  "tests/payments-setup-errors.test.ts",
  "tests/stripe-payments-facts.test.ts",
  "tests/physical-commerce.test.ts",
  "tests/physical-shipping-r3.test.ts",
  "tests/storelib-fees.test.ts",
  "tests/fees-free-plan.test.ts",
  "tests/stripe-connect-production.test.ts",
  "tests/payouts-and-disputes.test.ts",
  "tests/payout-weekly.test.ts",
  "tests/onboarding-flow.test.ts",
  "tests/payouts-verification.test.ts",
  "tests/push-ask.test.ts",
  "tests/native-permissions.test.ts",
  "tests/native-permissions-ask.test.ts",
  "tests/payments-status.test.ts",
  "tests/payments-readiness.test.ts",
  "tests/payments-reconcile.test.ts",
  "tests/theme-code-editor.test.ts",
  "tests/section-settings.test.ts",
  "tests/section-render.test.ts",
  "tests/theme-settings.test.ts",
  "tests/app-sidebar.test.ts",
  "tests/analytics-chart.test.ts",
  "tests/website-builder.test.ts",
  /* Round Z5: the theme marketplace (library cards, storelib.com/themes, /admin/themes zip checks) and a plan set from /admin; scripts/check-theme-marketplace.mjs measures the cards and pages. */
  "tests/theme-marketplace.test.ts",
  /* Round AD3: every setting in /app/settings reaches what reads it (the live website's name and photo, Store details' form, the checklist, campaign emails). */
  "tests/settings-reach-ad3.test.ts",
  "tests/nav-links.test.ts",
  "tests/menus-main-menu.test.ts",
  "tests/store-menus.test.ts",
  "tests/theme-breadcrumbs.test.ts",
  "tests/date-control.test.ts",
  /* An imported theme's countdown: one calendar, time and zone for its end_date/end_hour/end_minute/utc_offset, end_iso or countdown_date, written back in the shape stored; scripts/check-countdown-restart.mjs measures the canvas. */
  "tests/countdown.test.ts",
  "tests/media-url.test.ts",
  "tests/navigation-and-collections.test.ts",
  "tests/collections-ui.test.ts",
  "tests/native-google-sign-in.test.ts",
  "tests/editor-feel.test.ts",
  "tests/value-pills-menus.test.ts",
  "tests/code-backups.test.ts",
  "tests/own-database.test.ts",
  "tests/builder-click-edit.test.ts",
  "tests/policy-editing.test.ts",
  "tests/web-vitals.test.ts",
  /* Website settings › Performance: real-user speed for every published website, the lab test, run-now part 210 */
  "tests/web-performance-v.test.ts",
  /* Website settings › Performance, round W: the quick check when Google's test cannot run, the switches, a new period without a flash */
  "tests/performance-tab-w.test.ts",
  "tests/sitemaps.test.ts",
  /* Round 44: the sitemap engine at millions of pages (slices read by id, never by offset; 1,000 and 50,000 row limits; RFC 3986 addresses; real lastmod; a 503 for a failed read; robots coverage; IndexNow on every publish, change and delete; SQL part 343). */
  "tests/seo-sitemap-engine-r44.test.ts",
  "tests/storelib-theme.test.ts",
  "tests/theme-setting-types.test.ts",
  "tests/storefront-data.test.ts",
  "tests/theme-sections.test.ts",
  "tests/public-fetch.test.ts",
  "tests/storelib-package.test.ts",
  "tests/storelib-hardening.test.ts",
  "tests/agent-own-sections.test.ts",
  "tests/theme-file-drafts.test.ts",
  "tests/storelib-blocks.test.ts",
  "tests/storelib-parity.test.ts",
  "tests/preview-link.test.ts",
  "tests/published-site.test.ts",
  "tests/shop-products.test.ts",
  "tests/canvas-scroll.test.ts",
  "tests/link-address.test.ts",
  "tests/link-menu.test.ts",
  "tests/anchors-motion.test.ts",
  "tests/connection-mark.test.ts",
  /* Background reads and crons, cut on purpose (the owner: lower Vercel costs) */
  "tests/polling-costs.test.ts",
  "tests/editor-fixes.test.ts",
  "tests/builder-round-3.test.ts",
  "tests/contrast.test.ts",
  "tests/design-sections-w5.test.ts",
  "tests/responsive-settings.test.ts",
  "tests/storelib-security.test.ts",
  "tests/storelib-performance.test.ts",
  "tests/design-tokens.test.ts",
  "tests/manual.test.ts",
  "tests/sanitize.test.ts",
  "tests/theme-sharing.test.ts",
  "tests/raw-html-surface.test.ts",
  "tests/admin-key-routes.test.ts",
  "tests/money-rows-server-only.test.ts",
  "tests/private-columns.test.ts",
  "tests/ledger-and-deletion.test.ts",
  /* Background jobs run once and stop (a Stripe event taken before it is handled, a job cut off every time ends), and run-now part 189 */
  "tests/jobs-and-isolation.test.ts",
  /* A job, a store's translation and an order line, each done once (a lost job lease writes nothing, the hourly translate claim, run-now part 190) */
  "tests/jobs-dupes.test.ts",
  "tests/backups.test.ts",
  /* Round Z4: a backup restore finishes on a 504 file theme, all or nothing, and the dialog always settles. */
  "tests/restore-backup.test.ts",
  "tests/schema-source.test.ts",
  "tests/ops-safety.test.ts",
  "tests/public-abuse.test.ts",
  "tests/section-signups.test.ts",
  /* The Email app's newsletter end to end: the subscribe route against an in-memory database, an imported theme's form naming its box, and the canvas sending nothing. */
  "tests/newsletter-signup.test.ts",
  /* Round 43: an integration's page settles in without a bump; every newsletter look has its controls and says where its sign ups go. */
  "tests/newsletter-r43.test.ts",
  "tests/developer-hub.test.ts",
  "tests/ai-section-placement.test.ts",
  "tests/email-automation.test.ts",
  "tests/automation-engine.test.ts",
  "tests/email-sending.test.ts",
  "tests/email-starters.test.ts",
  "tests/email-variables.test.ts",
  "tests/email-composer.test.ts",
  "tests/email-layouts.test.ts",
  "tests/email-automations-sql.test.ts",
  "tests/email-one-picture.test.ts",
  "tests/automations-audit.test.ts",
  "tests/automation-templates.test.ts",
  "tests/checkout-contacts.test.ts",
  "tests/checkout-welcome.test.ts",
  "tests/attribution.test.ts",
  "tests/section-sandbox.test.ts",
  "tests/agent-connection.test.ts",
  "tests/github-sync.test.ts",
  "tests/github-theme-sync.test.ts",
  "tests/github-publish-sync.test.ts",
  /* The whole theme reaches an empty repository (README.md first, every file read back), a branch is protected only when GitHub says so, a file push protection refuses is set apart, a send out of time finishes on the next. */
  "tests/github-complete-sync.test.ts",
  /* The stylesheet is compiled before next build, so the build fits Vercel's 8 GB Standard machine; the shipped CSS is the same. */
  "tests/build-css-precompiled.test.ts",
  /* Round Z4: a pushed file in the other format is taken or converted, AGENTS.md shows each folder with real files, one button per branch dead end, Recent five at a time. */
  "tests/github-format-z4.test.ts",
  /* Round repo-1022: Storelib's own Theme settings (Hover and focus, the built-in groups) in the repository both ways, the theme's placement winning in the builder, the store's menus, push results as a comment, a git note and the status's Details; everything the builder shows is in the export; Add block lists what the schema allows, and MCP adds the same blocks. */
  "tests/repo-export-platform-settings.test.ts",
  "tests/repo-export-coverage.test.ts",
  "tests/repo-export-blocks.test.ts",
  "tests/schema-edits-sidebar.test.ts",
  "tests/theme-config-files-v.test.ts",
  "tests/collection-binding-v.test.ts",
  "tests/date-range.test.ts",
  "tests/cookie-consent.test.ts",
  "tests/marketing-footer.test.ts",
  "tests/refund-sync.test.ts",
  "tests/refund-sync-sim.test.ts",
  "tests/image-picker.test.ts",
  "tests/site-pages.test.ts",
  "tests/admin-auth.test.ts",
  "tests/stuck-layer.test.ts",
  "tests/round-aw.test.ts",
  "tests/site-cache-and-buttons.test.ts",
  /* Marketing pages served from the CDN: their layout reads nothing about the request */
  "tests/marketing-cache.test.ts",
  "tests/keyboard-watch.test.ts",
  "tests/agent-attachments.test.ts",
  "tests/work-panel.test.ts",
  "tests/ask-section-edit.test.ts",
  "tests/ask-storelib.test.ts",
  "tests/ask-conversations.test.ts",
  "tests/ask-dock.test.ts",
  "tests/ask-pictures.test.ts",
  "tests/ask-answer-actions.test.ts",
  "tests/ask-images-u.test.ts",
  /* V round: one box routed by the server, the four Claude models at medium effort, AI Memory for Storelib AI and MCP (scripts/check-ask-dock.mjs ONLY=labels,models,unified measures the chip and the menu). */
  "tests/ask-unified-v.test.ts",
  "tests/ask-sounds.test.ts",
  "tests/ask-voice-mobile.test.ts",
  "tests/ai-reference.test.ts",
  "tests/native-feel.test.ts",
  "tests/theme-media.test.ts",
  "tests/settings-flow.test.ts",
  "tests/sheet-rest.test.ts",
  "tests/control-frames.test.ts",
  "tests/builder-sidebar.test.ts",
  "tests/media-field.test.ts",
  "tests/file-picker.test.ts",
  "tests/header-search.test.ts",
  "tests/creator-page-default.test.ts",
  "tests/explore-show-all.test.ts",
  "tests/onepage-stability.test.ts",
  "tests/onepage-save.test.ts",
  "tests/marketing-image-quality.test.ts",
  "tests/keyboard-safe-sheet.test.ts",
  "tests/analytics-chart-skeleton.test.ts",
  "tests/tab-strip.test.ts",
  "tests/scrim-blur.test.ts",
  "tests/app-shell-motion.test.ts",
  "tests/app-top-corners.test.ts",
  "tests/app-page-reads.test.ts",
  "tests/storage-upload-routes.test.ts",
  "tests/pricing-plans.test.ts",
  "tests/app-search.test.ts",
  "tests/notifications-panel.test.ts",
  "tests/notify-unsubscribe.test.ts",
  "tests/subscriber-unsubscribe.test.ts",
  "tests/notify-center.test.ts",
  "tests/notification-rules.test.ts",
  "tests/notification-snapshot.test.ts",
  "tests/notify-integration.test.ts",
  "tests/sale-push.test.ts",
  "tests/wb-live-r15.test.ts",
  "tests/wb-write-r16.test.ts",
  "tests/wb-r18.test.ts",
  "tests/wb-r19.test.ts",
  "tests/wb-r20.test.ts",
  "tests/wb-r21.test.ts",
  "tests/orders-phone-r22.test.ts",
  "tests/round23.test.ts",
  "tests/haptics25.test.ts",
  "tests/section-links25.test.ts",
  "tests/sold-count25.test.ts",
  "tests/compat-files25.test.ts",
  "tests/notify-engine.test.ts",
  "tests/notify-webhook.test.ts",
  "tests/rich-text.test.ts",
  "tests/upload-security.test.ts",
  "tests/owner-download.test.ts",
  "tests/direct-uploader.test.ts",
  "tests/settings-account-fixes.test.ts",
  "tests/settings-country.test.ts",
  "tests/payouts-phone.test.ts",
  "tests/checkout-phone.test.ts",
  "tests/translation-coverage.test.ts",
  "tests/vercel-costs.test.ts",
  "tests/build-minify-r53.test.ts",
  "tests/vercel-runtime-costs.test.ts",
  "tests/avatar-one-source.test.ts",
  "tests/creator-identity.test.ts",
  "tests/onepage-avatar-kept.test.ts",
  "tests/onepage-avatar-sync.test.ts",
  /* Round 11 media: what a OnePage picture or video may be (2 GB, MOV, HEIC), straight to storage in TUS parts with real progress and Stop, the cropper's maths, and every upload in the editor through the one helper; scripts/check-onepage-media-r11.mjs drives the real cropper and uploads in a browser. */
  "tests/onepage-media-r11.test.ts",
  "tests/profile-photo.test.ts",
  "tests/coupon-editor.test.ts",
  "tests/coupon-checkout.test.ts",
  "tests/cart-coupons.test.ts",
  /* Offers, coupons and size charts as sub pages (not dialogs or sheets), a code's collections and "physical only" in every checkout, the size chart table's keys and paste, Inventory's batched reads. */
  "tests/offers-subpages.test.ts",
  /* Round 41: community MRR and payments received agree everywhere, collections as pages, Edit profile, a code's minimum after offers, Low includes 0. */
  "tests/community-revenue-collections-r41.test.ts",
  /* Round 43: a community's MRR is one figure on the list, its Overview, its stats and both Analytics, whatever exchange rates are kept. */
  "tests/community-money-r43.test.ts",
  /* Round 51: test mode subscriptions, refunded periods and the owner's own plan are no MRR on any screen. */
  "tests/community-mrr-r51.test.ts",
  /* Round 52: a community's event tickets, programs and modules are Revenue on /app/analytics, Home's chart and the sales breakdown, as in Community Analytics. */
  "tests/community-sales-r52.test.ts",
  /* Round 52: Google Ads' purchase conversion label, and gtag('event','conversion',{send_to,value,currency,transaction_id}) on the thank you page as Google's snippet writes it. */
  "tests/google-ads-conversion-r52.test.ts",
  /* Round 51: every event to every tool in its documented format, recorded answers, last sent, GA4 session. */
  "tests/analytics-send-r51.test.ts",
  /* Round 51: empty analytics cards (a ghost of the line, the zero, one line), the breakdown and channels waiting at their own height, Send analytics closing whole. */
  "tests/analytics-empty-r51.test.ts",
  "tests/product-page-t.test.ts",
  "tests/home-cards.test.ts",
  "tests/home-announcements.test.ts",
  "tests/home-progress.test.ts",
  "tests/creator-badges.test.ts",
  "tests/sql-run-four.test.ts",
  "tests/buy-extras.test.ts",
  "tests/business-accounts.test.ts",
  "tests/shown-email.test.ts",
  /* Wave 8: a second business's tagged address is never drawn, exported or searched by its tag; one person per address shown. */
  "tests/alias-display-w8.test.ts",
  "tests/store-settings-t.test.ts",
  "tests/taxes-t.test.ts",
  "tests/markets.test.ts",
  /* Round AD4: currencies and languages, the bugs found and fixed. */
  "tests/ad4-currency-language.test.ts",
  "tests/visitors25.test.ts",
  "tests/compat-languages.test.ts",
  "tests/canvas-currency.test.ts",
  "tests/analytics-ad.test.ts",
  /* Wave 10: Analytics keeps its shape whatever place or type is chosen: the same cards in the same places (lib/analytics/sections slotsFor, slotNote), four figures in four fixed places for the store and the communities, the community answers kept between views. */
  "tests/analytics-stable-w10.test.ts",
  /* Wave 10: the About story fades into its own background on an eased mask (240ms, any theme), its Markdown read and drawn as React elements (lib/storefront/story-markdown, components/store-builder/story-text), never printed or made HTML. */
  "tests/story-fade-w10.test.ts",
  /* Wave 10: the product editor's Edit size chart dialog on the shared SheetDialog: one fixed height, Edit and Preview (the storefront's own table), More options folded, Save and Cancel at the foot, a discard question in the foot, the exit played before it unmounts. */
  "tests/size-chart-dialog-w10.test.ts",
  "tests/tax-settings-wiring.test.ts",
  "tests/customer-email-editor.test.ts",
  /* Round 28: a customer email's six parts, per language, saved and read back, drawn as sent (preview text, footer note), reset. */
  "tests/customer-email-roundtrip.test.ts",
  /* Round 28: a reply to a contact form message sent from its page, kept beside it, shown as a thread. */
  "tests/site-contact-reply.test.ts",
  "tests/abandoned-cart-reminder.test.ts",
  "tests/reasons-t.test.ts",
  "tests/channels-t.test.ts",
  "tests/integrations-t.test.ts",
  "tests/round-u.test.ts",
  "tests/compat-resilience.test.ts",
  "tests/physical-setup-t.test.ts",
  "tests/physical-readiness.test.ts",
  "tests/emails-t.test.ts",
  /* Emails › Customer emails in three families, the language and the signature by where it was bought, previews that are the sent email; scripts/check-emails-families.mjs measures the switch and the lists. */
  "tests/emails-families.test.ts",
  /* Wave 9: a family the store does not use (nothing shipped, no community) keeps its pill and says so, with where to start, instead of listing emails that never go out. */
  "tests/customer-emails-family-use.test.ts",
  "tests/emails-language.test.ts",
  /* One language for everything about a placed order: the store's default unless the order or a link names another it publishes; never a cookie, the browser or the country (lib/markets/buyer-language.ts). */
  "tests/buyer-language.test.ts",
  "tests/emails-identity.test.ts",
  "tests/emails-preview.test.ts",
  /* Round AE2: every buyer and member email editable (Digital, Physical, Community), every community email in the community's name, picture, reply address and domain, per community unsubscribe; scripts/check-ae2-email-branding.mjs opens a sample at 390 and 600. SQL part 301. */
  "tests/ae2-emails-branding.test.ts",
  "tests/files-t.test.ts",
  "tests/files-inventory-v.test.ts",
  "tests/activity-t.test.ts",
  "tests/support-t.test.ts",
  "tests/offers-t.test.ts",
  "tests/offers-v.test.ts",
  /* Round AF: quantity breaks and Buy X get Y free charged at checkout exactly as the theme showed them (one formula, every tier and variant, yen and lei), one offer per unit, properties to the order line, cart discount codes to checkout, GET /api/offers and the Liquid metafield; SQL part 304. */
  "tests/offers-af.test.ts",
  /* Round AG: offers end to end: a download basket's offers and properties on its order lines (receipt, invoice, emails, admin, export, each offer by name), a currency change converting quantity break amounts (SQL part 306, on Postgres when OFFERS_PG_HOST is set), /cart.js and the Liquid cart with Shopify's automatic discounts to the cent of checkout, the builder's canvas, the native tiers, the creator's try-a-cart and warnings. */
  "tests/offers-ag.test.ts",
  /* Offers, one number everywhere: the checkout's saving rows, the cart's and the product page's in a market that rounds; pay what you want never shown discounted; a break on a download; the offers' words translated. */
  "tests/offers-parity.test.ts",
  /* Storelib's own Featured products and Product spotlight show the featured product's offers, with the product page block's pieces and figures (components/offers/featured-offers.tsx). */
  "tests/offers-featured.test.ts",
  /* Round AG3: a buyer's words and pictures on a cart line: uploads checked by their bytes, drawn again without EXIF, kept privately per store and browser, refused on another store or cart, copied to the order when paid, shown in emails, slips, exports and the order page, sent to print partners, swept after 14 days; the Storelib theme's Personalization block; SQL part 308. */
  "tests/cart-uploads.test.ts",
  "tests/round-v.test.ts",
  "tests/round-w.test.ts",
  "tests/product-editor-physical.test.ts",
  "tests/product20.test.ts",
  "tests/product-variants-faq-h.test.ts",
  /* Round 12: every change in the product editor turns Save on, and changing it back turns it off (the sales channel the owner unchecked); scripts/check-product-save-r12.mjs drives the real editor. */
  "tests/product-save-r12.test.ts",
  "tests/round-x.test.ts",
  "tests/round-y.test.ts",
  "tests/round-z.test.ts",
  "tests/round-aa.test.ts",
  "tests/team.test.ts",
  "tests/emails-layout.test.ts",
  "tests/business-switch-flow.test.ts",
  "tests/push-recipients.test.ts",
  "tests/onboarding-polish.test.ts",
  "tests/section-markup-guard.test.ts",
  "tests/list-price.test.ts",
  "tests/upload-limits.test.ts",
  "tests/onepage-editor-shell.test.ts",
  "tests/onepage-leave.test.ts",
  "tests/onepage-theme-apply.test.ts",
  /* Round 40: five more themes, block layouts, hover colours, the themed product sheet and checkout window, the wallpaper library and the gradient direction. */
  "tests/onepage-themes-r40.test.ts",
  /* Round 42: two more themes (a cover page, a price list), products shown the theme's way, one-row pill rows with arrows, + Add's turn, the steady tab bar, the photo save's reasons, the OnePage SQL in one file. */
  "tests/onepage-themes-r42.test.ts",
  "tests/onepage-themes-ap.test.ts",
  /* Round AQ: the onboarding draws the theme preview, Layout pictures draw the block's own content, a form's row is named, the sheet kit's slow pull is slow; scripts/check-onepage-real-preview.mjs reads the preview in next dev. */
  "tests/onepage-aq2.test.ts",
  "tests/onepage-ar5.test.ts",
  "tests/onepage-themes-w8.test.ts",
  /* Round W9: six themes with a skin (Aero, Aqua, Messenger, Y2K, Playful, Grunge): every text and button pair and every colour the skin paints read at 4.5:1, the skin carried by both roots and the theme card, the generated stylesheet current and styling every kind of block, motion by transform and opacity only and still for reduced motion and in cards, the skin laid on and taken off with the theme. scripts/shot-onepage-skins.mjs photographs them. */
  "tests/onepage-themes-w9.test.ts",
  "tests/onepage-patterns-w10.test.ts",
  /* Round W10: the skins fixed at the source (every word on a form, a card and the legal links in a colour picked for that surface, 4.5:1 even at 70%), a second version of each of the six (Aero Aquarium, Aqua Graphite, Messenger Olive, Y2K Kawaii, Playful Night, Grunge Zine) drawn by the same rules with another palette, and Classic 98, Vaporwave and Arcade. */
  "tests/onepage-themes-w10.test.ts",
  /* OnePage themes (op-themes): Editorial retired and a page still on it drawn as Paper with the creator's own changes kept (lib/onepage/retired-themes, the live page and the editor), Renaissance (its settings, fonts, contrast at rest and on hover, its skin over every kind of block, its scene and every pair of words and paint), the picker's All in five groups with the quiet, most chosen first, and Aero Aquarium made quieter. scripts/shot-onepage-skins.mjs THEMES=renaissance,aero2 photographs them. */
  "tests/onepage-themes-renaissance.test.ts",
  /* Round 10 buttons: every saved button draws as before, the hover system, one drawing for page, preview and Design tab; a social link typed any way saved as the right address. scripts/check-onepage-buttons.mjs measures them. */
  "tests/onepage-buttons.test.ts",
  "tests/onepage-social-input.test.ts",
  "tests/onepage-open.test.ts",
  "tests/onepage-arrival.test.ts",
  /* Round 11: Storelib's pills in the editor, the Design pages as the app's sub-pages, a tab bar that holds still, a clean way out (scripts/check-onepage-motion-r11.mjs measures them). */
  "tests/onepage-motion-r11.test.ts",
  /* Round 11: + Add, the Add block sheet's open, Storelib's pills for its chips, brand marks, the embeds and their frame hosts, the social sheet's close and keyboard, Choose icon (scripts/check-onepage-addblock-r11.mjs measures them). */
  "tests/onepage-addblock-r11.test.ts",
  /* Round 40: the Header pencil, Hero with a video or a pattern, the video from its first frame, uploads and Your files, compact image rows, carousels, a return without a flash. */
  "tests/onepage-media-r40.test.ts",
  "tests/own-section-html.test.ts",
  "tests/website-builder-api.test.ts",
  "tests/security-scan.test.ts",
  "tests/site-accounts.test.ts",
  "tests/site-contact.test.ts",
  "tests/site-customer-pages.test.ts",
  "tests/account-sections.test.ts",
  "tests/onepage-blocks.test.ts",
  /* Round 11: the email signup's five layouts (drawn without an image), groups (what goes in, one edit in and out, what is drawn), the Products tab's short default, and the Integrations section; scripts/check-onepage-blocks-r11.mjs measures them. */
  "tests/onepage-blocks-r11.test.ts",
  "tests/onepage-editor-ui.test.ts",
  "tests/checkout-loads.test.ts",
  "tests/notify-templates.test.ts",
  "tests/sale-email.test.ts",
  "tests/wallet-domains.test.ts",
  "tests/file-scanner.test.ts",
  "tests/upload-inspector.test.ts",
  "tests/file-security-words.test.ts",
  "tests/library-downloads.test.ts",
  "tests/memberships.test.ts",
  "tests/memberships-folded.test.ts",
  "tests/site-chrome.test.ts",
  "tests/section-groups.test.ts",
  /* V5: the section menus, copy and paste, Edit code, the Apps category (scripts/check-section-menus.mjs measures them) */
  "tests/section-actions-v.test.ts",
  "tests/communities-foundation.test.ts",
  "tests/user-notifications.test.ts",
  "tests/push-bridge.test.ts",
  /* Round 37: community chat (order and duplicates, who may message whom, admin settings, when a phone is told, authorization, part 270). */
  "tests/community-chat-r37.test.ts",
  /* Round 38: who may start a conversation (level, days, the team), who can post in a channel, the Chat tab, Message on profiles, automated messages each member once and in batches, part 272. */
  "tests/community-chat-r38.test.ts",
  /* Round 38: community chat speed (kept pages and list, asked for early, no spinner) and rich content (signed link cards, YouTube, GIFs, video, emoji). */
  "tests/community-chat-speed-r38.test.ts",
  /* Round 39: New message's suggested people (the team, the people the member deals with, never the blocked or refused) and its search, a post sent in a message (only one the sender may see, its card per reader, "Post not available" otherwise). */
  "tests/community-people-r39.test.ts",
  "tests/community-post-card-r39.test.ts",
  /* Round 39: pictures in chat (both picture addresses read by the folder check), the box's one row, sent, delivered and seen, presence, the panel's motion, a conversation found on hover, part 275. */
  "tests/community-chat-r39.test.ts",
  "tests/communities-notify.test.ts",
  "tests/communities-public.test.ts",
  "tests/communities-plans-af.test.ts",
  "tests/round-ag.test.ts",
  "tests/round-ah.test.ts",
  "tests/round-ai.test.ts",
  "tests/round-aj.test.ts",
  /* Round 11 STORE: a busy Add to cart shows its spinner and never its icon (imported themes), and no checkout pins Pay to the foot of the screen; scripts/check-store-r11.mjs presses them. */
  "tests/store-r11.test.ts",
  "tests/round-ak.test.ts",
  "tests/communities-access-restore.test.ts",
  "tests/communities-platform.test.ts",
  "tests/communities-security.test.ts",
  "tests/communities-member.test.ts",
  "tests/communities-classroom.test.ts",
  "tests/communities-learn.test.ts",
  "tests/learn18.test.ts",
  "tests/communities-creator.test.ts",
  "tests/communities-shell.test.ts",
  "tests/communities-growth.test.ts",
  "tests/communities-membership13.test.ts",
  "tests/communities-frame10.test.ts",
  "tests/communities-frame11.test.ts",
  "tests/communities-feed15.test.ts",
  "tests/account-pills16.test.ts",
  "tests/pills17.test.ts",
  "tests/nav18.test.ts",
  "tests/nav23.test.ts",
  /* Round 26: the pull's spinner capped (lib/ui/pull-refresh-cap), the pill's pages kept warm through a router.refresh, the menu closed on the tap, the creator's reads started when the creator is known. */
  "tests/nav-speed.test.ts",
  /* V3: the builder's speed (scripts/check-editor-perf.mjs) and its Going back screen (scripts/check-editor-exit.mjs). */
  "tests/editor-perf-v.test.ts",
  /* Round perf2-1028: a push read back keeps the sections that did not change, an Ask run's lines are one render a frame, the activity poll no longer throws on every key and reads again after a scroll rests; scripts/check-editor-perf.mjs (PART=scroll,live) measures them. */
  "tests/editor-perf-incoming.test.ts",
  "tests/editor-y1.test.ts",
  "tests/editor-z1.test.ts",
  /* V12: no :has() whose subject is the root, so an insertion restyles what it touches (scripts/check-editor-perf.mjs, "insert one node"). */
  "tests/editor-css-v.test.ts",
  "tests/communities-frame12.test.ts",
  /* Round 31: the community content sections in /app: the icon picker, rows that open, the form sheet, the member composer as the Feed writer (scripts/check-community-content-round31.mjs measures them). */
  "tests/communities-content31.test.ts",
  "tests/communities-about11.test.ts",
  "tests/communities-frame13.test.ts",
  "tests/communities-posts.test.ts",
  "tests/communities-safety.test.ts",
  "tests/communities-safety2.test.ts",
  "tests/communities-posts12.test.ts",
  "tests/communities-posts13.test.ts",
  "tests/communities-post15.test.ts",
  "tests/communities-post16.test.ts",
  "tests/communities-post17.test.ts",
  "tests/community-mobile-r8.test.ts",
  "tests/communities-feed-rank.test.ts",
  "tests/communities-admin13.test.ts",
  "tests/communities-events-admin.test.ts",
  /* Round 31: a community analytics for any period, its visits and Google Analytics (scripts/check-community-analytics-round31.mjs measures the screen). */
  "tests/community-analytics-r31.test.ts",
  /* Round 32: a community's analytics counted against a seeded fixture, and read without a bar or a blur (scripts/check-community-analytics-round32.mjs measures it beside /app Analytics). */
  "tests/community-analytics-r32.test.ts",
  /* Round 33: a community's visits counted by the page once it is on a screen (sources, devices, countries, the app), member churn, DAU to MAU, new and returning, an overview over the sections (scripts/check-community-analytics-round33.mjs measures it). */
  "tests/community-analytics-r33.test.ts",
  /* Round 38: churn of the members at the start, the owner out of active members and engagement, modules and refunds in revenue (SQL part 274), five figures in the row, the grey fills (scripts/check-community-analytics-round38.mjs measures them). */
  "tests/community-analytics-r38.test.ts",
  "tests/round39.test.ts",
  /* Round 39: the community Library: who opens an item, files and links only through routes that ask again, the admin's items and sections, a sold item through Storelib's own checkout (orders, receipts, the buyer's library), refunds, the places and the tab (SQL part 278; scripts/check-community-library-r39.mjs measures the screens). */
  "tests/community-library-r39.test.ts",
  /* Round 39: signing in from a receipt (the way back, an existing address moved to sign in, a guest's orders joining the account once the address is verified), the guest purchase cookie (signed per order, a year, refunds close it), the header and pages agreeing (scripts/check-buyer-auth-r39.mjs walks it in a browser). */
  "tests/buyer-auth-r39.test.ts",
  /* AA3: a guest's purchase kept by the browser that paid on every product page (written by a website's own checkout, carried to its host), no follower counts on a seller's hub, Files never breaking a picture, orders in their own currency (scripts/check-aa3.mjs measures the screens). */
  "tests/aa3-guest-files-currency.test.ts",
  /* Round AA2: signed in everywhere at once (a page back from the back/forward cache asks again, the Google callback attaches a guest's orders), "Account created" or "Welcome back" from the account's age, sign up's no identities answer, no tab bar signed out, the header's Log in coming back (scripts/check-buyer-auth-aa2.mjs walks it in a browser). */
  "tests/buyer-auth-aa2.test.ts",
  /* Round 32: questions before joining, a new member's first steps and welcome message, scheduled posts and drafts, inviting a list (SQL parts 186 to 188). */
  "tests/community-features-round32.test.ts",
  /* Round 26: the admin's Posts: one writer that posts, schedules in the creator's zone and keeps team drafts (part 194), the writer's slide, the community's own post popup (scripts/check-posts26.mjs films them). */
  "tests/posts26.test.ts",
  /* Round 33: who opens a program (Open, Reach a level, Buy now, Days after joining, Private) decided on the server for the shelf, the page, every lesson and the checkout; modules and lessons added at once (SQL part 200; scripts/check-learn-round33.mjs measures the screens). */
  "tests/community-learn-access-round33.test.ts",
  /* Round 33: the community Page editor, the links as icons, the cover's focus, the join button, the About page's row (scripts/check-page-editor-round33.mjs measures them). */
  "tests/community-page-round33.test.ts",
  /* Round 26 (W4): the About page and the info card: the button's words, the admins and icons in the card, the short description, Share, Powered by, Privacy and Terms (scripts/check-about26.mjs measures it). */
  "tests/about26.test.ts",
  "tests/communities-paid-events.test.ts",
  "tests/communities-notify-budget.test.ts",
  "tests/communities-video13.test.ts",
  "tests/communities-round33.test.ts",
  /* Round 26 (W2): the community admin's row of tabs (stuck in the middle of its row, nothing moves on a hover, fades only where there is more) and an Overview of four figures (scripts/check-community-admin-nav26.mjs measures them). */
  "tests/nav26.test.ts",
  "tests/communities-events-notify.test.ts",
  "tests/communities-events-member.test.ts",
  "tests/communities-profiles15.test.ts",
  "tests/member18.test.ts",
  "tests/profiles-follows.test.ts",
  "tests/profile-one-page.test.ts",
  "tests/profile-seo-round12.test.ts",
  "tests/profile-page-s.test.ts",
  "tests/account-center.test.ts",
  "tests/theme-blocks.test.ts",
  "tests/place-navigator.test.ts",
  "tests/header-auth-menus.test.ts",
  "tests/builder-touch-intent.test.ts",
  "tests/publish-open-live.test.ts",
  "tests/header-round8.test.ts",
  "tests/native-app-links.test.ts",
  "tests/native-shell.test.ts",
  "tests/account-round11.test.ts",
  "tests/elastic-and-landings.test.ts",
  "tests/communities-shell15.test.ts",
  /* Round 31: the community admin shell keeps its sections, the settings list, the save bar, the gallery drag (scripts/check-community-admin-round31.mjs measures them). */
  "tests/communities-admin31.test.ts",
  /* Round 32: the community admin's Overview and Settings use the width, the gallery is the product editor's, members pick their own look (scripts/check-community-admin-round32.mjs measures them). */
  /* Round 32: moving between a community's sections (scripts/check-community-admin-round32.mjs, scripts/measure-community-admin-server.mjs measure it). */
  "tests/communities-admin32.test.ts",
  /* Round 33: the Page section after Overview, Settings without the page, the /app badge, one save bar, covers from the logo (scripts/check-community-admin-round33.mjs measures them). */
  "tests/communities-admin33.test.ts",
  /* Round 41: the list and a community there and back, New community and Create in one entry, Approve all in one request (scripts/check-community-roundtrip.mjs measures it). */
  "tests/community-roundtrip-r41.test.ts",
  "tests/communities-admin-nav32.test.ts",
  "tests/editor-r6.test.ts",
  "tests/favicon-sync.test.ts",
  "tests/page-seo-r6.test.ts",
  "tests/billing-cancel19.test.ts",
  "tests/billing-fail-closed.test.ts",
  /* Reliability: Stripe bounded (a 20s timeout, two retries with capped jittered backoff, a circuit breaker), the staleness window (Stripe's last answer, then the stored plan, never Free on an error) with a soft line on the billing page, one Stripe object per press (idempotency keys from exact params, no second plan checkout for a creator already paying), a late failed payment that cannot mark a paid plan past due; all against the real SDK and a fake Stripe. */
  "tests/billing-resilience.test.ts",
  "tests/physical-w7.test.ts",
  "tests/fulfil23.test.ts",
  "tests/tracking24.test.ts",
  "tests/editor-engine-w4b.test.ts",
  /* Round 20 (last: first in the list, tsc checked a few unrelated files in an order that typed a string as never). */
  "tests/orders20.test.ts",
  /* Round 21 */
  "tests/safety21.test.ts",
  /* Round 23 */
  "tests/store23.test.ts",
  "tests/emails23.test.ts",
  "tests/integrations23.test.ts",
  "tests/marketing24.test.ts",
  /* Connected email platforms: Brevo, MailerLite and Kit on the marketing sync (key checked, subscribers pushed, unsubscribes both ways and by webhook, order events as events, groups and tags, a 429 retried without sending twice), and the store's own sending domain with Mailgun, all against fake HTTP. */
  "tests/connected-platforms.test.ts",
  /* Wave 9, emails: every store email From the store's own verified domain (lib/mailgun.ts `store`), the domain checked again by the cron, the platforms synced within the minute also with physical commerce off. */
  "tests/emails-sending-w9.test.ts",
  "tests/emails-reply-w10.test.ts",
  "tests/partners24.test.ts",
  /* Round AE3: each partner's cancel and costs against stubs of its API, holds and the partner card read from the timeline, the packing slip's paper and prices, the buyer's paid rate in Buy a label. */
  "tests/fulfilment-ae3.test.ts",
  "tests/physical-ships-x1.test.ts",
  /* Round 25 */
  "tests/i18n25.test.ts",
  "tests/publishing-cache.test.ts",
  /* Reliability (public delivery): a published OnePage held for every visitor and cleared by each of its writers, no view row written by the render, private pages never given a shared cache, beacons limited in memory first, every public write or search limited; scripts/check-public-roundtrips.mjs measures each public surface on a build. */
  "tests/public-delivery.test.ts",
  /* Releases on Publish (SQL part 180) and an imported theme page held by the CDN for a stranger */
  "tests/site-releases.test.ts",
  /* An earlier publish live again (SQL part 188) */
  "tests/release-rollback.test.ts",
  /* Safety nets that measure: build memory, bundle budgets, the post-deploy smoke, the load test, the rollback runbook, each job from cron_runs */
  "tests/ops-safety-nets.test.ts",
  /* Indexes for the reads that searched a whole table (SQL part 187), the wishlist's one profile read, More from seller's columns */
  "tests/db-indexes.test.ts",
  /* Round rel-db: database load and store isolation, SQL part 334 (indexes for reads and deletes that searched whole tables, functions and policies that opened every store's rows, statement timeouts); Orders reads the store's currency once per request. */
  "tests/db-load-isolation.test.ts",
  /* Round rel-db (fix): every server Supabase client with a deadline, analytics that fall back to raw events only when the function is missing, Home without waiting on all time sales, Customers, Payouts and the tax summary past 1,000 rows, the /app shell's lean reads, the Products page's columns and paging. */
  "tests/rel-db-dashboard.test.ts",
  /* Round r48-db: SQL part 353 (every public policy reads auth.uid(), auth.jwt() and auth.role() once per query, each kept word for word otherwise, checked against pg_policies from local Postgres 16; a counted view or sale no longer moves products.updated_at), the Orders page's products read five columns a page at a time, and the /app shell's first sale read by the order's own creator. */
  "tests/db-r48.test.ts",
  /* Phones: the front page's globe loaded on approach, read ahead on the device's plan, polling paused in the background, native listeners taken off */
  "tests/mobile-perf.test.ts",
  /* Round V1: a published website held and cleared, its round trips counted, its links opened in place, its first picture first, one favicon, no about:blank tab (scripts/check-live-speed.ts measures them) */
  "tests/live-speed-v.test.ts",
  /* After a Publish no request and no page in the browser shows the old theme: the tag expired at once, the live release and its marker, an imported theme's hold, Back and bfcache, links opened in place, a switch of renderer */
  "tests/publish-shows-new-release.test.ts",
  /* Round AM: a live website stays fast after a Publish: one stamp per site expired by its tags and what each server keeps in memory under it, a held page from memory and drawn again by a Publish, the release marker by the live rows' count, the pages drawn for the publisher's country right after the caches are cleared (PUBLISH_FLOW=1 node scripts/measure-speed18.mjs measures it). */
  "tests/live-publish-am.test.ts",
  /* Round AP: a live page never waits Supabase's 20 seconds for a read it can do without (offers, menus, sold counts, size charts, tags), the theme's files fail within seconds, a page drawn without something is never held, shared or kept, and the hold no longer keeps "draw it again" for five minutes; scripts/check-live-nav-ap.mjs clicks through a live website and times it. */
  "tests/live-nav-ap.test.ts",
  /* Round AQ (track 1): live websites from themes right after a deploy. An imported theme's files read together and kept under their content address only when the bytes hash to it, the Liquid engine loaded for a .liquid file only; the warm after a deploy and after a Publish asks for the files its pages name; a buyer's own parts asked for from the top of the head and put in as each section is read; a picture's id the same in every draw; a market's page kept by the CDN; a stored copy naming another deployment's files never served. scripts/check-personal-flash-aq.mjs and scripts/check-site-nav-aq.mjs measure it in a browser. */
  "tests/live-assets-aq.test.ts",
  /* Round W1: an imported theme's live page stored by the CDN (no Vary: Cookie), its body's CSS gathered in the head in order, its flags lazy, plain HTML with no React, links fetched ahead (scripts/check-live-first-load.mjs measures it) */
  "tests/live-first-load-w.test.ts",
  "tests/live-speed-ax.test.ts",
  /* Round BA: a published website's page change fetches the page once (Next 16.1), and colour schemes are listed in groups on every theme */
  "tests/round-ba.test.ts",
  "tests/round-bb.test.ts",
  "tests/round-bc-aiagent.test.ts",
  /* Round 50: which section Storelib AI changes, or what it adds where, decided before the run (lib/website-builder/agent/targeting.ts): 55 requests plus 24 held out, selected and not, edit and new, ambiguous, several sections, six languages, scored against what decided before; "Edited: Hero" and "Added: Testimonials, after Hero" from what the run did. */
  "tests/agent-targeting-r50.test.ts",
  /* Round 50: no "ran out of time before it changed anything": the run's own clock (lib/website-builder/agent/run-clock.ts), the smallest change first, a per call limit with one retry for a call that hung, `working` lines through a long call, no doubled output room late in a part, and a part that kept nothing pausing with a checkpoint the chat sends back with the next part. */
  "tests/agent-deadline-r50.test.ts",
  /* Wave 5 (aifix): no thinking block replayed after an edit (drop_block + one stripped retry), a stop keeps the work, slow saves and reads retried, partial said as partial, restyle never deletes, no invented proof, every offered font weight loads, Auto model routing, build_page reviewed. */
  "tests/aifix-w5.test.ts",
  "tests/round-bc-previews.test.ts",
  /* Round 44: Add section on a slow phone, and the Header card: what is drawn closed stays closed, a card is a still picture, the header drawn ahead, cards kept across groups, drawing between presses (scripts/check-add-section-perf.mjs). */
  "tests/add-section-r44.test.ts",
  "tests/round-bc-liveseo.test.ts",
  "tests/round-bc-domains.test.ts",
  "tests/round-bc-dmnotify.test.ts",
  "tests/round-bc-sizecharts.test.ts",
  "tests/ag2-imported-theme.test.ts",
  /* Round 13: personalization fields (text, long text, photo upload) and custom fields, from the editor through every theme, the cart, the checkout's server check, the order, emails, slip and exports */
  "tests/personalization-r13.test.ts",
  /* Round 13 (SIZEFAQ): product questions and size charts wherever a product is shown (its own chart, else its collection's or category's, SQL part 309), Storelib and imported themes, the OnePage sheet; scripts/check-sizefaq-r13.ts takes the screenshots. */
  "tests/r13-sizefaq.test.ts",
  "tests/round-bc-productblocks.test.ts",
  "tests/round-bc-checkout.test.ts",
  "tests/round-bc-accounts.test.ts",
  "tests/round-bc-sidebar.test.ts",
  "tests/round-bc-canvas.test.ts",
  /* Round 13 (THEMESET): ten new fonts in every picker, previews fetched for the rows in view; a swatch choice in an imported theme's settings shown at once; scripts/check-themeset-r13.mjs measures them. */
  "tests/themeset-r13.test.ts",
  /* Round 13 (WBSTAB): pushes and large theme changes reach the canvas without the theme's code piling up (scripts/check-wb-stability-r13.mjs) */
  "tests/wb-stability-r13.test.ts",
  /* A push from GitHub or a coding agent redraws the sections it changed, and an imported theme's page once, instead of reloading the editor on every poll. */
  "tests/editor-incoming-push.test.ts",
  /* A section a push changed keeps its card in Add a section, imported theme; the probes push files the server would keep (scripts/check-library-push-cards.mjs). */
  "tests/library-push-cards.test.ts",
  /* The canvas scroll moves its chrome from the scroll offset, and a push waits until the gesture rests. */
  "tests/editor-scroll-rest.test.ts",
  /* Round 44: the canvas wheel holds hover (lib/website-builder/wheel-hold.ts) and its thumb moves by transform; scripts/check-editor-perf.mjs PART=scroll,smooth measures the canvas, the sidebar, a section switch and a push stream under a moving canvas. */
  "tests/editor-smooth-r44.test.ts",
  /* A push reaches an open editor without a reload: a sleep with no visibilitychange is an absence, a full page reads on and the pile lands once, an apply has a ceiling, online, pageshow and the app's return wake it; the session recovery and a stalled OnePage load end in something to press. */
  "tests/editor-live-follow.test.ts",
  /* Round 14 (SCROLL): the canvas scrolled with the owner's real Materia theme: the builder's layer in a shadow root, outlines read after layout, nothing said or measured per scroll frame, far sections at rest (scripts/check-wb-scroll-r14.mjs) */
  "tests/wb-scroll-r14.test.ts",
  /* Round 14 (INCOMING): changes from Storelib AI, an agent or a push taken in without freezing the editor, on the owner's real Materia (scripts/check-wb-incoming-r14.mjs) */
  "tests/wb-incoming-r14.test.ts",
  /* A section picked in Add a section lands cleanly: an imported theme's own stylesheets handed to the frame with it, the page making room as on a Storelib theme, the glide past a hidden drawer, the dialog closing in the first frame (scripts/check-section-insert-smooth.mjs) */
  "tests/section-insert-smooth.test.ts",
  /* 1 Nov 2026 (andrewrullz): no page of the builder waits for good on a stylesheet that does not answer: the Add a section cards' page draws after SHEET_WAIT_MS without its load event, the canvas page's bridge is let through by CANVAS_SHEET_GUARD, every queued change has STEP_MS, and each wait cut short is said to /api/client-errors (scripts/check-compat-stalls.mjs, scripts/check-canvas-stalls.mjs) */
  "tests/compat-stalls.test.ts",
  /* 1 Nov 2026 (andrewrullz, Materia): a theme file's own </template> line inside its markup no longer ends the file's block (theme.ts compatTemplateEnd), and whatever a section leaves open (a <template>, a <textarea>, a comment) is closed where it ends (seal.ts), so the footer and the canvas bridge after it stay in the page; reported to /api/client-errors */
  "tests/compat-template-seal.test.ts",
  /* Round X1: an imported theme's blocking scripts deferred in their order, app widgets started after load, one copy of each stylesheet, desktop prerender for pages with nobody else's scripts, no unload listeners, builder sub-pages held for strangers */
  "tests/live-speed-x.test.ts",
  /* Oct 21: an imported theme's page held for a returning visitor (only Storelib's own page cookies keep it private), routed after one round trip (SQL part 257 site_route_facts), its draw's reads started together (scripts/check-live-speed.mjs asks a live site the same questions) */
  "tests/live-speed-imported.test.ts",
  /* Round 26 (W6): community SEO by state, the sitemap and canonicals, the member links inside a community and their presses (SQL part 221) */
  "tests/seo26.test.ts",
  /* Round 44: Storelib's own public pages: each page's whole metadata, the auth steps noindex, Explore's canonicals, the blog's pages, feed and dates, the Help Center's og:url, legal pages in the sitemap, llms.txt. */
  "tests/seo-marketing-r44.test.ts",
  /* Round 45: storelib.com's own pages say noindex where private (X-Robots-Tag and the layouts), titles for the auth steps, the crawler table, Organization, WebSite and WebApplication priced from plans.ts, breadcrumbs, unique metadata, Explore's views and 404, the Help Center's metadata, llms.txt's plans. */
  "tests/seo-platform-r45.test.ts",
  /* Round 45: the public blog rebuilt (every block type, sanitizeInline, the contents list, BlogPosting and VideoObject, /blog/category with the old address a 308, the sign up box and the newsletter) and the help article in the same reading frame. */
  "tests/blog-public-r45.test.ts",
  /* Round 45: the blog admin: the sanitiser, a post live only when published and its date has come (scheduling with no job), an old slug's 308, a save from an old version refused with 409 (savePost against an in-memory table), the snippet and preview routes admin checked and noindex, SQL part 345. */
  "tests/blog-admin-r45.test.ts",
  /* Round 47: the blog redone after the owner looked at it live: one 720px reading column, 17/18px body, the byline as one row, no right rail or newsletter box, the rail's card naming everything Storelib sells, a typographic cover for posts with none, the category pills in the blog's own layout. */
  "tests/blog-r47.test.ts",
  /* Round 49: the blog after the owner looked at the rebuilt article live: no empty right column (the 260px rail and a 760px column, the pair centred, 19px body there), a light one line card under the contents, a short box inside the article that names all of Storelib, and the category pills' sliding fill and crossfade (transform and opacity only, off with reduced motion). */
  "tests/blog-r49.test.ts",
  /* Round 45, leftovers B: blog author pages (/blog/author/<slug>: ProfilePage, breadcrumbs, live posts, noindex when empty, a 404 with no table, the sitemap), no FAQPage or HowTo in the Help Center, the product file limit from the upload policy, STORELIB_SOCIAL for the footer and sameAs, Copy to Storelib (the https and private address guard, type by bytes, 10 MB, a post's addresses swapped in place). */
  "tests/seo-leftovers-b-r45.test.ts",
  /* Round 47: writing in the blog editor: markdown at the start of a line, undo and redo across blocks, Cmd+S, the search checklist (facts, no score) and its title counted as rendered, the writing page (panel, drawer, focus mode, the publish confirmation), and before SQL part 345 a reader's view no longer a false 409 (lib/blog/editor-tools.ts, lib/blog/save-rules.ts editVersion). */
  "tests/blog-editor-r47.test.ts",
  /* Round 48 (appperf): the signed in dashboard measured against a logging fake Supabase: the search takes the Community switch from the layout (no /api/platform/flags per load), Analytics reads in one round once the store is known, Settings asks the team store beside its first reads, still no loading screen under /app. */
  "tests/appperf-r48.test.ts",
  /* Round 45: the comparison pages (/alternatives): every competitor claim sourced and dated or marked, Storelib claims tied to code, the calculator charging as checkout does, metadata, FAQPage from the visible questions, sitemap, links, sign up tags. */
  "tests/alternatives.test.ts",
  /* Round 46: Payhip, Kajabi, Podia and Skool compared: each claim sourced on their own site and dated, each plan charged by its published rule (Skool Pro's higher rate over $899), where each is better said plainly, the hub, the sitemap and the /sell links. */
  "tests/alternatives-r46.test.ts",
  /* Round 45 (content): lib/marketing/facts read from the code (prices, fees, limits), the /sell pages, /features as Storelib in one page, the comparison pages' checked prices and moving guides, the YouTube video registry and its VideoObject. */
  "tests/content-r45.test.ts",
  /* The carrier picker's own carriers and live data: search, preselection, stars, defaults, the shop's carriers, connected accounts, no price without a provider, the logo's letters, part 233 (scripts/check-carrier-select.mjs photographs it). */
  "tests/carrier-select.test.ts",
  /* Round 27 (K27): the seller's orders: carriers with logos and tracking pages, the tracking number rule, unseen orders, the packing slip, the carrier picker */
  "tests/orders27.test.ts",
  /* Round 27 (M27): physical order emails link the live website, never the creator page (lib/physical/store-link), no unsubscribe on transactional mail, product thumbnails, the creator page language banner gone */
  "tests/emails27.test.ts",
  /* Round 27 (P27): scheduled posts carry their media and poll (SQL part 222), the composer's toolbar down with the keys, the New post pill, closed comments, the welcome post writer */
  "tests/posts27.test.ts",
  /* V round, the builder's AI: the theme brief cached per version, invented schema keys and unread settings refused, phone layouts checked without a browser, honest repair, follow ups scoped, one Undo step a run, calls and tokens on a budget */
  "tests/ai-quality-v.test.ts",
  /* Round V8: the website's words in each language, edited in the builder's sidebar in that language, a product's own Translations, one read per language (SQL part 211; scripts/check-translation-switch.mjs measures the sidebar) */
  "tests/translations-v.test.ts",
  /* Round X4: Join on a team invite works after any sign in (Origin "null" under no-referrer was refused), the invite kept across OAuth, another email may take a valid link once */
  "tests/team-join-x.test.ts",
  "tests/team-invite.test.ts",
  /* Round Y2: a team member opening /app lands in the team store (never /sell), Not now on /sell goes back to it, sign in follows /app for a member; an integration's bar carries Back (scripts/check-integrations-y2.mjs measures the bar and the card covers) */
  "tests/team-landing.test.ts",
  /* Round 40: team permissions like Shopify staff: a list per member (part 320), presets, the invite and change of access, requireTeamPermission on every open area, the sidebar and the access card. */
  "tests/team-permissions-r40.test.ts",
  /* Round 40, second pass: OnePage and Community open to the team (lib/team/onepage, lib/communities/server/team.ts), uploads in the store's folder, SQL part 319; website, creator page, products and settings still closed. */
  "tests/team-areas-r40.test.ts",
  "tests/team-areas-r41.test.ts",
  /* Round 42: the website, the creator page, payouts and billing open to the team (lib/team/website, creator-page, money), money as see and change, SQL part 333. */
  "tests/team-areas-r42.test.ts",
  "tests/integrations-y2.test.ts",
  /* Round X4: taxes end to end, part refunds and currencies in Tax collected, shipped and membership orders keep their tax, Who does what in a Modal (SQL part 243; scripts/check-tax-modal.mjs measures it) */
  "tests/taxes-x.test.ts",
  /* Round 34: Add block opens a picker with each block drawn in its section before it is added (scripts/check-block-picker.mjs measures it in the real editor) */
  "tests/block-picker.test.ts",
  /* Round 34: the builder's draft written one snapshot at a time (save ordering, Saved only for what is on screen, retry on its own), undo by reference and per field, memoised rows and insert strips (scripts/check-editor-sections.mjs measures them on 44 sections) */
  "tests/editor-sections-r34.test.ts",
  /* Round 10 (OnePage products): what a tap does, draft/published/archived, prices, tiles, instant checkout through the checkout's own routes, the button's hover; scripts/check-onepage-products.mjs measures them. */
  "tests/onepage-products-r10.test.ts",
  /* Round 49: every OnePage way to buy (the block's tap, the sheet's Check out, a download's link) opens the new checkout; a product that ships pays on its store website's checkout with its option, quantity, Back to the OnePage and src=onepage; old /checkout/physical and /checkout?productId=<ships> links go on to it. */
  "tests/checkout-r49.test.ts",
  /* Round 51 (commerce): the shop's name beside its logo at checkout (Settings › Checkout › Top of checkout), "From my own warehouse" shipped by the seller and a mix that moves no product, the packing slip's store details and the computer's notice, the order page's payment method, Clarity, Klaviyo, Omnisend and Tag Manager told the visitor's consent; scripts/check-commerce-r51.mjs measures the bar and the notice. */
  "tests/commerce-r51.test.ts",
  /* Round 52 (websites): a published website has a root layout and a stylesheet of its own (app/(site)/layout.tsx, app/site.css by scripts/site-css.cjs), Storelib's pages theirs (app/(storelib)/layout.tsx), and an imported theme's next page is drawn ahead on a capable phone; scripts/check-site-speed-r52.mjs and scripts/check-site-css-r52.mjs measure it in a browser. */
  "tests/site-root-r52.test.ts",
  /* Round 53 (SEO): Google's favicon (a theme's 32 pixel one replaced by the site's sized square; a creator page domain's own /favicon.ico from the photo; an hour for the unversioned address), og:site_name and the WebSite's alternateName, no "on Storelib" in a store's description, a OnePage titled by its name, and IndexNow for blog posts; scripts/check-site-seo-r53.mjs reads every page type on every host of a production build. */
  "tests/site-seo-r53.test.ts",
  /* Round 40 (OnePage editing): four products then Show all, a block's Remove, Choose icon, Add social link, the sheets' drag by pointer, Add block's tints, the product picker, scheduling on the live page, the sensitive question over a player, the file an email signup gives. */
  "tests/onepage-editor-r40.test.ts",
  /* Round 41 (OnePage blocks): grey Add block tiles again, settings that glide shut, groups that take any block and delete one, Add to group with the page's own blocks, and every catalogue block checked for settings, a live renderer and the page's look. */
  "tests/onepage-editor-r41.test.ts",
  "tests/onepage-app-blocks-al.test.ts",
  /* Round AR (track 4): the OnePage data and money blocks. The newsletter's phone and first name (checked, kept, sent to the tools) and its fields in each layout's shape, one of the creator's own products given to joiners; tips through Storelib checkout to the creator's own connected account with the amount checked on the server and one tip per Checkout Session; a poll's one vote each and the owner's totals; Pay to unlock with the locked part never in the page and access checked on the server; show from / until on the server and in every route; stats counted from real numbers; RSS, Bandsintown and Trustpilot read from recorded answers; each tap counted once and never from the preview. scripts/check-onepage-ar4.mjs measures them at 390 and 1440. */
  "tests/onepage-ar4.test.ts",
  /* Round 12 (WBPERF): a link typed in a menu draws only what shows a menu, memoised menu rows, a 401 asked about before it is a sign out, a page's sections read again quietly; scripts/check-wb-perf-r12.mjs measures them on 120 sections. */
  "tests/wb-perf-r12.test.ts",
  /* Round 12 (website builder): Add block between two blocks in the canvas, the collection pickers' Add collection, a menu link's new tab on the live site, product descriptions bound to Storelib, the shop's filters from real products; scripts/check-wb-ux-r12.mjs measures them. */
  "tests/wb-ux-r12.test.ts",
  /* Round 12 (live websites): a made up server action refused by the proxy, a Publish followed by its own pages drawn; scripts/check-site-perf-r12.mjs measures load and navigation. */
  "tests/site-perf-r12.test.ts",
  /* Round cn-1028: a credit note for every refund, in the store's invoice sequence (lib/checkout/credit-note.ts, SQL part 329), its lines and tax by rate negative, in the buyer's language; linked from the refund email, the receipt, the order page and the seller's menu. */
  "tests/credit-notes.test.ts",
  /* Round cn-1028: View in browser in campaign emails, a signed public page with the reader's own unsubscribe link and no tracking (lib/email-campaigns/view-online.ts). */
  "tests/view-online.test.ts",
  /* Round cn-1028: community emails and automations edited from Emails itself, Customer emails' family pills without the slide, the editor's preview drawn once per version and shown at once. */
  "tests/emails-community-in-place.test.ts",
  /* Round 43: every email draws the store's logo whole (lib/emails/brand-mark.ts), at its own shape inside 200 by 40, never round (round 49: the small shared corner), the name beside a square icon; settled at send from the picture's size. */
  "tests/email-logo-shape.test.ts",
  /* Round ana-1029: Storelib analytics sent on to GA4 (Measurement Protocol), Meta (Conversions API), PostHog and a signed webhook through a queued, idempotent, retrying sender with consent and hashing, the status view and Send test, GET /api/v1/analytics with read only keys, SQL part 338; scripts/check-send-analytics.mjs measures the dialog. */
  "tests/analytics-destinations.test.ts",
  "tests/analytics-r49.test.ts",
  /* Round 49: a dialog opens in one short task: modal state counted on <html> (lib/ui/modal-open.ts) instead of html:has() rules, the pause rules keyed on their own attributes, Radix's scroll lock property not inherited, the pressed card's inside by a style query, the first focus on the next frame where no keyboard depends on it (lib/ui/dialog-focus.ts); scripts/check-dialogs-r49.mjs measures it. */
  "tests/dialogs-r49.test.ts",
  /* Round 44: /admin/seo, every address in Storelib's sitemaps with Google's URL Inspection answer (service account JWT signed with node:crypto, per property, a quota counted in the database, rotated never checked and stalest first) and a score from the live page with every check; admin only, Check now rate limited, SQL part 342; scripts/check-admin-seo.mjs renders it. */
  "tests/admin-seo-console-r44.test.ts",
  /* Round 45: AI assistant sources on touches and Storelib's own sign ups (SQL part 346), the Audience view's AI assistants group, a spec-correct robots.txt matcher held to Google's examples, the sitemap file check, Search Console performance and Bing in /admin/seo with nothing called indexed without Google's answer, verification meta only when set, and the labels and landmarks the public journeys need; scripts/check-admin-seo.mjs and scripts/check-agent-journeys.mjs drive them in a browser. */
  "tests/seo-tracking-r45.test.ts",
  /* Round 46: visits to storelib.com's own pages from an AI assistant, counted by Storelib (SQL part 350): which paths and which assistant, one count per tab session only with analytics consent, the route with the database stubbed (only the assistant and the path reach it, always 204, quiet before 347), service role only grants, the Audience view's storelib.com visits and top pages; scripts/check-admin-ai-visits.mjs renders the panel. */
  "tests/ai-visits-r46.test.ts",
  /* Products › Import from Gumroad: the API's products as drafts (prices, currencies never converted, pay what you want, option combinations), pictures copied from Gumroad's CDN hosts only, descriptions through the allow list, once per Gumroad id (SQL part 344), the token in one header and nowhere else, the Products permission. */
  "tests/gumroad-import.test.ts",
  /* Round 45: every page a creator publishes, as a search engine reads it: page 2 of a shop or collection its own canonical and a page past the last a 404, an imported theme's shop at one address and a gone product a 404, /collections and /reviews and a community's public posts in the sitemaps, a website behind a password out of storelib.com's, IndexNow for collections and public posts, and every route of a website or a creator page held to a sitemap or a noindex. */
  "tests/seo-sites-r45.test.ts",
  /* Round 45 leftovers (a): a creator's contact address asked for on the click (/api/creator-contact, rate limited, noindex, no-store) and in no page's payload, nor a website contact form's inbox; Explore's cards without sign in ids; IndexNow for moderation, admin takedowns and bans; a product's JSON-LD in the page's language; one noindex on a 404; www and a trailing slash in one 308; the imported theme's 303 kept on purpose. */
  "tests/seo-leftovers-a-r45.test.ts",
  /* Round 46: Core Web Vitals of the SEO round's pages measured live (scripts/check-live-vitals.mjs): a list's first card eager when no large post is above it, covers with priority and sizes, no YouTube frame or script before a press, the phone's search strip drawn once the header is measured (a 63px shift), no preconnect to an unused host. */
  "tests/perf-r46.test.ts",
  /* Creator blogs in an imported theme (P3): Dawn-style blog, article and featured blog sections drawn with real posts, pagination, tags, categories, 308s for old slugs and handles, a preview noindex and no-store, BlogPosting and Blog JSON-LD on the custom domain, the sitemap's blog entries, and nothing changed without a blog. */
  "tests/site-blog-compat.test.ts",
  /* Creator blogs, package 2: one Blog item in Website Settings directly below Pages and no link anywhere else, the post list's query, selection, bulk actions and row menu, autosave one request at a time with its version and a 409 that stops and asks (blog/save-queue.ts on its own clock), scheduling in the app's time zone, the block editor's optional props only (the admin's menu word for word), every editor word translated, before SQL part 353. */
  "tests/site-blog-ui.test.ts",
  /* Round 48: live websites under a spike: a connected domain's lookup is one read per host however many visitors ask at once and is served stale while it refreshes, strangers arriving together on an imported theme's page share one draw, and the same deferred theme script written twice runs once. */
  "tests/sites-r48.test.ts",
  /* Round 48 security: the About story drawn through the allow list, redirects after sign up kept on Storelib, the reset code routes limited and single use, the CSP enforced on /app, /admin and the sign in pages (through the real proxy), HSTS and a Permissions-Policy on every host, no public SVG. */
  "tests/security-r48.test.ts",
  /* Round 48, R48-6: the creator page configs are read by the server (service role, published_config only, no contact address) for every public page, never with the anon key; the owner screens keep their own session; SQL part 354 closes both tables to anon. */
  "tests/configs-r48.test.ts",
  /* Round 48: the public pages' speed: the home page's head preloads only the hero, the cookie card in the server's HTML (lib/consent/early-ask), the product page's buy box its final height during the purchase check, no owner or editor code (or Supabase, Swiper, the app wide react-icons/si) in a visitor's creator and product page, Explore's chip as tall before its measurement. */
  "tests/pubperf-r48.test.ts",
  /* Round 49: a store's logo with one small corner (lib/brand/store-logo.ts) and no shadow wherever a buyer sees it: every email, the checkout's shop bar, the order status page, the receipt, the order help page (components/brand/store-logo.tsx), the packing slip and the invoice PDF. */
  "tests/logo-r49.test.ts",
  /* Round 49, edge: stored copies of public pages served while the database is away (lib/edge, docs/reliability/EDGE_FAILOVER.md). */
  "tests/edge-r49.test.ts",

  /* Round 49: creator pages, product pages and Explore are one HTML for everybody (no cookies() or headers() in their render), the owner's controls, Download, Contact and For you are asked after load, the CDN rule is the same for every request (never RSC, the editor's canvas or a scheme preview), a language is an address (?lang=, the proxy's 307), a save expires the data and the CDN copy by tag and path; scripts/check-creator-page-cache.mjs measures the bytes on a production build. */
  "tests/cdnpages-r49.test.ts",
  /* Round 50 (editor): every /api/creator-profile save takes the creator page's held copies down; undo and redo in the creator page editor (each sheet's save is a step the route says how to put back, kept by the workspace, toolbar and keys, and the form's own steps inside an open sheet, typing grouped); Arrange keeps a selection's neighbours in place, drops without a jump, scrolls a long list under a drag, moves by arrow keys; the canvas's way back and refused links. */
  "tests/creator-editor-r50.test.ts",
  /* Round 51: storelib.me/<name> held by the CDN for everybody (tagged by name, never RSC or a write, the render reads no cookie), a OnePage or product change expires the tag, a ban, an account deleted and a domain change take every public page of the creator down, a site password change redraws the site, the landing rule is storelib.com's alone, no new name for a fake sign in page, the payment confirm rate limited; scripts/check-public-delivery-r51.mjs measures a production build. */
  "tests/delivery-r51.test.ts",
  /* Round 53: an imported theme's page is one page for everybody, at the CDN under the site's tags (a cart or a sign in no longer keeps it private, only one without its readable hint), the visitor's sections, layout and owned notice filled in after load from a private answer, unknown query keys left out of the shared copy's address, the first big picture preloaded, limits on posts, private draws and shared misses; scripts/check-site-speed-r53.mjs measures a production build. */
  "tests/site-speed-r53.test.ts",
  /* Round 54: how long the CDN and ISR hold a public page (five minutes fresh and a day stale at the CDN; a website's pages an hour, and every held read in their draw at least the shop's five minutes so the page keeps it; the names a site answers to expired by every change that moves one; the front page no longer sent a five minute stale window), and who gets a shared copy unchanged; scripts/check-cdn-r54.mjs measures a production build. */
  "tests/cdn-r54.test.ts",
  /* Round N (N2): a free site is headless. The host draws no default theme UI on an AI built site (lib/website-builder/free-site.ts: breadcrumbs, the language switch and the bars only when asked, the Overlay group from home only), and the site's own code gets a search window (this creator's products, pages and posts, rate limited), language and currency lists, and panels opened from any section (sections/own-panels.ts); the render check knows the hooks; in Chromium: results as text, Escape, focus kept and given back, aria-expanded, the canvas, the built-in fallback. */
  "tests/storefront-headless-n2.test.ts",
  /* Round P (P4): the chrome kit (lib/storelib-ai/library/examples/chrome, chrome-kit.ts): six headers, three menu drawers, three carts, two search windows, the switches and six footers through validateFile, the render check and the anti-slop engine; the own menu drawer hook (data-storelib-menu-panel); chromeKitForPrompt in a new site's brief; in Chromium six composed pages with no sideways scroll at 390 and 1440, drawers, cart and search opened, kept and shut by keyboard, live results, an upsell add, a mega panel. */
  "tests/chrome-kit-p4.test.ts",
  /* Round Q (Q1): the chrome platform. Currency labels by currency (never a market's name), once each, languages in their own words, a dropdown switch with no script; a header's box sticks when it asks (data-storelib-sticky) with the scroll's state written on it; a menu drawer never empty (the site's menu or pages drawn in), the page still under it; the dark band's buttons in the site's own colours, no indigo fallback on a free site; icons by name; every field with a label and a placeholder. Real Chromium. */
  "tests/chrome-platform-q1.test.ts",
  /* Round O (O4): the rendered visual critic (lib/ai-builder/visual-critic). The draft drawn from the job's own project with no script in it (stripped, CSP), photographed in REAL Chromium at 1440 and 390 with JavaScript disabled (proven: a page script that would hide its overflow never runs) and a fenced network; measured (sideways scroll at 390, a dead call to action in the first screen and unreadable contrast are hard gates; heading wrap, tap targets, broken or missing pictures, no CTA, instructions to the creator printed in the page); a scripted vision model reviews 4 pictures per page on spec 8.2's seven axes with a bounded JSON repair retry; in the agent loop the defects come back as numbered repair tasks naming the file, two reviews at most, the review's spend in the job's spend, a gate that stays ends partial, and no browser is "Not visually checked", never a pass. Without Chromium the browser sections say so and skip. */
  "tests/ai-visual-critic-o4.test.ts",
  /* Round P (P5): the website agent's own quality. A placement with no blocks gets its schema's filled preset items (fresh ids); a section whose item types have no filled preset is refused at write; finish refuses too few items (min_blocks, 3 for a repeating list, fewer when the store has fewer), placeholder items and copies; template first with a scripted model and a stub template (applied in the brief phase, its components as few-shot, untouched copy and imagery refused, adapting clears it); every picture slot filled when pictures can be made, text-forward otherwise, an empty frame refused; the critic's hard gates for empty slots, empty item lists, empty sections and an empty <img>; models by phase (plan, build on opus high, repair on sonnet) and the cost estimate inside the raised cap. */
  "tests/ai-agent-quality-p5.test.ts",
]

/**
 * SUITES THAT RUN ROUTE HANDLERS, compiled on their own with the project's
 * own `strict: true` (tsconfig.json). A route written against strict types
 * narrows a result by `if (!saved.ok)`, which only narrows with
 * strictNullChecks; under the list above's `strict: false` the same route is
 * a type error and the whole run stops before any suite. Same output
 * directory, run after the list above.
 */
const STRICT_SUITES = [
  /* Wave 7: /app/emails never falls over on an answer of another shape ("eN.find is not a function" from the live build): every loader fed objects, { error }, junk lists, HTML and empty bodies answers with lists or an Error to retry; the shapers (lib/emails/shapes.ts) never throw; each part of the page in its own net (components/app/emails/part-boundary). Strict: it draws the panels that read through components/physical/ui, which only narrow strict. */
  "tests/emails-shapes-w7.test.ts",
  /* Round 51: Contacts, one person per creator (an account first, an address only when verified or given here, never a name), Customers or Marketing opens it, another store's row refused through /app/contacts/open, exports of the store's own only, deleting never touches an order or a membership, an import never resubscribes, the legacy addresses redirected (SQL 378; its parity with lib/contacts/identity.ts on Postgres: scripts/check-contacts-sql.mjs). */
  "tests/contacts-r51.test.ts",
  /* Round 50: the creator page's About / Your story. The save through the real route (headline, rich story kept whole and cleaned, an emptied editor stored as none, a too long story refused, pictures, captions, both configs), the page purged after the write so the owner and visitors see it; the owner's page drawing the saved story at once (lib/storefront/story-draft); the Read more fade masked into any scheme; the gallery on scroll snap (dots in step while it moves, dots, keys, mouse drag); the inline caption. Strict: it drives the route through tests/_journey. */
  "tests/story-r50.test.ts",
  /* Round AK (AK2): a product's sales channels through the real route, before and after SQL 20271125: unticked and ticked again, read back, gone from Explore, the OnePage and the website and back; an older tab sends only its own change, so a newer save stays; a failed read refuses a change instead of writing over it; the editor's Saved after a read back. * Strict: it drives the real routes through tests/_journey, which only type-check strict. */
  "tests/product-channels-ak2.test.ts",
  /* Creator website blogs (SQL part 353, lib/site-blog): the sanitizer on save and on render (javascript: links, on* attributes, frames only from embedFrameSrc, gallery and button), slugs, status, preview tokens (24 hours, their own namespace), and the admin and public reads against the SQL in memory through supabase-js: a save from an old version answered 409, autosave into a live post's draft, publish/update/schedule, a live slug change's redirect, fifty revisions, bulk, categories, settings, a scheduled post live on time while the cache is held, null/503 before the SQL, and every query filtered by creator_id. Strict: it narrows save results by `ok`. */
  "tests/site-blog-data.test.ts",
  /* Round 10: the course, music, testimonials and contact blocks, the Add block sheet's catalogue and search, the + that turns under a mouse, the email signup's name, link and spam checks (strict: it draws components/onepage/brand-icons, which only type-checks strict); scripts/check-onepage-blocks.mjs measures them. */
  "tests/onepage-creator-blocks.test.ts",
  /* Round 40: OnePage integrations (Mailchimp, Kit, beehiiv, webhooks), consent-aware pixels, embeds without a jump, and the shelf, lead magnet, posts, followers and code blocks. */
  "tests/onepage-blocks-r40.test.ts",
  /* Round 41: every OnePage integration end to end with a fake transport (Mailchimp, Kit, beehiiv, MailerLite, Brevo, Flodesk, the webhooks), one delivery per signup, Klaviyo and Omnisend at once, the pixels' Lead, ViewContent, InitiateCheckout and Purchase, the directory's order on the first paint, SQL 323 and 324. */
  "tests/onepage-integrations-r41.test.ts",
  /* Round 10: a OnePage email signup and contact message through the real routes, to the one subscriber list (tests/_journey). */
  "tests/e2e-onepage-signup.test.ts",
  /* Round 11: a signup from each of the five layouts on a page served on storelib.me, and a group through Save, reload and Publish (tests/_journey). */
  "tests/e2e-onepage-blocks-r11.test.ts",
  /* ShippyPro: the adapter against recorded and documented answers, and the marketplace card in each state (components/physical/integrations-marketplace.tsx only type-checks strict) */
  "tests/shippypro.test.ts",
  /* Round 24: the whole commerce flow, through the real routes (tests/_journey) */
  "tests/e2e24.test.ts",
  /* Reliability (commerce): money paths under a failing Stripe or database, through the real routes (tests/_journey): a confirm that failed is never "nothing was charged" and Pay again reuses the same intent; a payout whose wallet step failed is retried by Stripe, and posted once; a library entry whose write failed is retried by the sweep; webhook database errors answer 500, and an early invoice is kept; a Connect PermissionError disconnects nobody while the platform key fails its own check; the payouts page makes one read, kept half a minute per person, and keeps what it showed when Stripe is unavailable; the plan sync reads every page of subscriptions; a hung database call ends at the shared deadline instead of holding a webhook. */
  "tests/rel-commerce.test.ts",
  /* Reliability (commerce, wave 2): the memberships job never cancels a trial whose buyer saved a card or one Stripe has as paid (PAY-8); the payment webhook answers once the order, library entry and ledger are written and runs the fee read, receipt PDF, emails and notifications after the answer, once each, a failed one left for the sweep (PAY-12); the legacy Checkout Session product path is unreachable from any session made today and reads latest_charge if an old one comes (PAY-11); a bank Stripe could not list is bankUnknown and the Payouts page says it could not check instead of Add bank (PAY-5). */
  "tests/rel-commerce2.test.ts",
  /* Reliability (wave 3, PAY-9): one product checkout order, one PaymentIntent: the page's attempt id and run-now part 352 (checkout_attempts) give the same PaymentIntent for Pay pressed again, a new one for a changed order or another buyer, a new attempt when Stripe refuses the key or the PaymentIntent was canceled, and the route exactly as before without the table (tests/_journey). */
  "tests/pay9-checkout-attempts.test.ts",
  /* Round 13: a personalized mug through the real routes: photo upload to private storage, refusals, two lines with different answers, the order, emails, the photo link, an imported theme (tests/_journey) */
  "tests/e2e-personalization.test.ts",
  /* A store priced in euros, bought, refunded and translated through the real routes (tests/_journey) */
  "tests/e2e-store-currency.test.ts",
  /* Round 13: a store translated by the cron on a fake Gemini, end to end: the retired model, refused answers left to wait, every call counted, translation memory across stores, /admin/translations (tests/_journey) */
  "tests/e2e-translations-cron.test.ts",
  /* A euro store moves to lei: what converts and what stays (plans, offers, smart collections, part 258), More currencies from the new base, caches expired, orders and totals never relabelled or added across currencies (tests/_journey) */
  "tests/store-currency-change.test.ts",
  /* One lei store with the marketplace in dollars for it alone: website, shared link and Explore purchases, stale and missing rates, a refund, emails, ledger, chart and Payouts (tests/_journey) */
  "tests/e2e-marketplace-usd.test.ts",
  /* Round AO: the price audit and restore scripts, as separate processes over HTTP against the journey database (tests/_journey) */
  "tests/round-ao.test.ts",
  /* Round AP: onboarding never opens an account Stripe cannot pay out (no recipient agreement, region only), the Connect audit flags them, the test-mode run opens its own account and ends with a payout */
  "tests/round-ap.test.ts",
  /* Cash on delivery in a lei store: the fee, a country refused, the order, the emails, Mark as paid, a parcel refused and restocked (tests/_journey) */
  "tests/e2e-cash-on-delivery.test.ts",
  /* More currencies: a lei store with euros for Germany and France, a visitor's card, cart, selector, card and cash checkout, order and emails all in the same euros; zloty shown and charged in lei (tests/_journey) */
  "tests/e2e-more-currencies.test.ts",
  /* The seller ships it themselves: part shipped with tracking, the number fixed, the rest from a second place, a fulfilment undone, a return restocked and refunded, a cancel after an undo, a pickup, refused cash (tests/_journey) */
  "tests/e2e-manual-fulfillment.test.ts",
  /* Round AE3: Hold fulfillment, Send again to a partner that refused, a send held back and released, a cancel that reaches Printful (tests/_journey) */
  "tests/e2e-fulfilment-ae3.test.ts",
  /* Round 51: every answer to "How you fulfil orders" from checkout to delivered over the journey (self, own warehouse, Printify by its signed webhooks, dropshipping, a supplier, a fulfillment center by their email and page, a mix), and the zone, flat and free rates at checkout. */
  "tests/fulfilment-modes-r51.test.ts",
  /* Quick setup through the real routes: explicit prices, whole or nothing, once */
  "tests/e2e-shipsetup.test.ts",
  /* Shipping quick setup, the summary, one fulfilment question, carrier rates gated (strict: it renders the settings component, which narrows on api() results) */
  "tests/shipsetup.test.ts",
  /* Several parcels in one Fulfill, Mark as fulfilled on many orders from the list, a tracking CSV previewed then imported (tests/_journey) */
  "tests/e2e-bulk-fulfillment.test.ts",
  /*
    The Claude provider's suite, here and not in the list above: its imports
    (the Anthropic SDK's types) change how the loose compile reads other
    files, and `value.match(...) ?? []` in a dozen of them became `never`,
    stopping the whole run before any suite. Compiled strict on its own it is
    clean.
  */
  "tests/claude-integration.test.ts",
  /*
    Round 33: making a community, its setup list, deleting one members pay for (scripts/check-create-round33.mjs
    measures the wizard and the pill). Here, not above: it runs lib/communities/server/creator.ts, whose results are
    narrowed by `if (!x.ok)`, which only narrows under strict.
  */
  "tests/community-lifecycle-round33.test.ts",
  /*
    Round 26 (W1): a community being deleted takes no place on the plan, Keep after a replacement, two tabs, the
    states and the cards (scripts/check-cards-round26.mjs measures the cards). Here for the same reason as the line
    above: it runs lib/communities/server/creator.ts.
  */
  "tests/cards26.test.ts",
  /*
    Round 26 (W5): the Page editor rebuilt, the short description and member links (SQL part 220), a join button that
    never states a price, every field saved and read back through creator.ts (strict, as above); scripts/
    check-page-editor26.mjs measures the editor.
  */
  "tests/editor26.test.ts",
  /*
    Round 27 (E27): the Page editor at every width (side or drawer by its own width, the panel dragged, the drawer's
    places), its outlines, the creator's own Privacy and Terms saved and read back through creator.ts (strict, as
    above), the About card's icons and Share; scripts/check-page-editor27.mjs measures the editor and its frame rates.
  */
  "tests/editor27.test.ts",
  /*
    Round Y3: Settings › Shipping in Storelib's own forms (no grey band behind Cancel and Save), one SaveButton and
    FormActions for every settings form, the summary's "from" and carrier zones, and a carrier rate's free over in the
    free shipping banner; scripts/check-shipping-settings.mjs measures the page at 390 and 1280. Strict, as it imports
    components/physical/shipping-settings.tsx (as tests/shipsetup.test.ts does).
  */
  "tests/shipping-settings-y3.test.ts",
  /* Round Z7: /app polish: no "Direct" in an order's source, no Paid community in New product, the sidebar's nested rows apart and its overlay thumb, the integration cards' specks, Everywhere else's globe and the shipping save toasts (scripts/check-app-sidebar-z7.mjs, check-integrations-y2.mjs P, check-shipping-settings.mjs measure them). */
  "tests/app-polish-z7.test.ts",
  /* Round 10: the OnePage's instant checkout bought end to end: facts, a code, paid and free, drafts refused (tests/_journey) */
  "tests/e2e-onepage-instant.test.ts",
  /* Round 11: the OnePage as storelib.me serves it: the way back from the checkout and the product page (never an open redirect), one-hop links, Instant checkout with every call routed as the host routes it, no Open in app card in the editor (tests/_journey) */
  "tests/e2e-onepage-live.test.ts",
  /* Round 40: /terms and /privacy laid out as the Help Center, one text in components/legal, /legal/* redirecting; a OnePage's Privacy and Terms in a sheet; Share and Subscribe as one theme aware dialog; Your own domain's icon, Settings' box the shown section's height, the preview's products asked again; no Follow on creator pages and profiles. */
  "tests/legal-and-onepage-settings-r40.test.ts",
  /* Round 41: a OnePage's button edges (the fill stops inside the border), X posts at their card's width and corners, social icons that do not grow, Share as it was with the creator's photo and Subscribe with it, neither touching the page's scrollbar; three choices for a product tap, the sheet's own button, option and quantity before paying; a new profile video with no gap. scripts/check-onepage-r41.mjs measures them. */
  "tests/onepage-public-r41.test.ts",
  /* Round 43: the OnePage product sheet chosen as the product page chooses (swatches, image swatches, sizes, a variant's picture, the sale badge, the price on the button, personalization on the cart line), the email signup's Connect, Personal note and Bar, product tiles paired in a group, the layout pickers in the page's colours. scripts/check-onepage-r43.mjs measures them. */
  "tests/onepage-r43-blocks.test.ts",
  /* Round 53: the product sheet's dots ride the scroll, 4:5 on a phone, themed arrows and question lines, videos in the gallery and full screen; scripts/check-product-sheet-r53.mjs measures it frame by frame. */
  "tests/product-sheet-r53.test.ts",
  /* Round AK: the product sheet closes before the checkout opens on top (one state, one backdrop, focus held, Back and Escape close the checkout alone), the checkout's head is the product's own picture, and the product editor's grey padding is cut off in the sheet and the checkout. scripts/check-onepage-checkout-stack.mjs measures it. */
  "tests/onepage-checkout-stack.test.ts",
  /* Round AL: a block opened in a sheet like Linktree's (rise, fade and slight scale in 300ms, back in 250ms, the page held still, Escape and Back, focus kept), the Interaction choice on the blocks that embed something (saved ones stay on the page), and Instagram posts folded in Instagram's own units with View full post on the fade. scripts/check-onepage-block-sheet.mjs measures them. */
  "tests/onepage-block-sheet-al.test.ts",
  "tests/onepage-sheets-an3.test.ts",
  /* Round 42: a OnePage's embeds with no scrollbar inside them (heights said and rounded up, Tally and Calendly asked for theirs, TikTok's player), buttons with room on every side in a carousel, one copy of a video playing, the social sheet as tall as it holds, a slideshow a mouse drags. scripts/check-onepage-r42.mjs measures them. */
  "tests/onepage-r42.test.ts",
  /* Round AP, track 1: the shared link card at a chat's size, a row's bin under a mouse, the block sheet opening with its content and easing to late content, its foot bar off over the keyboard, drawn down by a mouse, Share as a phone's bottom sheet, no crossed circle on a booking link, no cookie card in the preview, the thumbnail row, row tiles from the Add block entries, a shelf of chosen products (the owner's only), and every sideways row following a mouse. scripts/check-onepage-sheets-ap.mjs, check-onepage-drag-rows-ap.mjs, check-onepage-button-controls-ap.mjs, check-onepage-perf-ap.mjs and shot-onepage-editor-ap.mjs measure them. */
  "tests/onepage-ap1.test.ts",
  /* Round AR (track 6): the OnePage editor's one compact picture row (cover, group picture), descriptions that grow, the form builder's save round trip for every question type and setting, a block clicked in the phone preview opening in the list, Share's Add link to Instagram bio and its public page, the handoff's token rules and its row in the editor, and the AI's edits to social icons, the social links block and link blocks checked as a change by hand. scripts/check-onepage-ar6.mjs measures them at 390 and 1440. */
  "tests/onepage-ar6.test.ts",
  /* Round AR, track 1: how a OnePage feels. No round Close over the keyboard once Safari pans, sheets read while idle and opened with their content (no grey bars), one press on every button from pointerdown, Back a step inside a form sheet, the Hero darkening under the page with a bar once it has gone, a removed block folding away, a shelf kept drawn while a setting changes. scripts/check-onepage-ar1.mjs measures them. */
  "tests/onepage-ar1.test.ts",
  "tests/onepage-w8.test.ts",
  /* Round AR3: every block type's settings panel drawn and visible (image 137), music and video layouts with Storelib's own player, Cover, Fit and Full, links shown in place (Calendly, Typeform, Canva, Google Maps, podcasts), oEmbed cards from recorded answers, Fourthwall and Bonfire retired, followers from one field, more links in one block. scripts/check-onepage-ar3.mjs measures the layout matrix, the embeds and the settings at 390 and 1440. */
  "tests/onepage-ar3.test.ts",
  /* Round W9 (opblocks): a bin on every block row (the question first, the row folding away in 180ms, Delete still in the more menu); the block sheets (Contact, Subscribe, Share, music, Privacy) and the product sheet in the page's palette and typeface; a theme taking every block's own colours, a group's too; Mixed tiles as pairs and full rows taking turns, never a featured card halved or a half alone; Cards drawing every plain link as a card. */
  "tests/onepage-blocks-w9.test.ts",
  /* Wave 10 (legible): every word on a OnePage reads on what is painted under it (lib/onepage/legible, components/onepage/legible-guard), the creator's own Design shown over a skinned theme (lib/onepage/skin-own), the product sheet's square gallery, thumbnails and Buy bar, the share sheet as one surface, and one gap between every tool on a block's row. scripts/check-onepage-legible-w10.mjs walks every theme in the picker on pixels. */
  "tests/onepage-legible-w10.test.ts",
  /* Round 43: the OnePage editor's font sheet as tall as its list, an off block's controls unfaded, Remove's question in one compact line, a block's stats with the period as a popover and See in Analytics, the header's type and picture frame, the cover's ring that follows a Left header, one hold for every window over the live page. scripts/check-onepage-editor-r43.mjs measures them. */
  "tests/onepage-editor-r43.test.ts",
  /* Round 44: every page of a published website, for search engines: one indexable host (the Storelib address's sitemap goes to the domain's), a website not live is a 404 past its front page, a renamed product's old address a 308, the sitemap to 50,000 products held a page at a time, an imported theme's canonical and noindex, and IndexNow told about the addresses a publish or a deleted page took down. */
  "tests/seo-sites-r44.test.ts",
  /* Creator blogs, package 4: the Blog and Blog post templates on a Storelib theme (main_blog, main_article, blog_featured drawn with real posts), the /blogs routes' metadata, JSON-LD, 308s and private previews, a creator's own "blog" page kept, the canvas and link picker, and read_blog kept after the cached prefix. */
  "tests/site-blog-native.test.ts",
  /* Round 50 (server reliability): the editor's routes and clients against a stand-in Supabase that is slow (1 to 8s), cold, resets a connection, answers 503, 504 or 429: GETs take the read answer while Auth is slow, a database blip is a 503 the editor retries, a save sent twice is one save, the limiter has ceilings, retries come from a budget, a hung breaker trial does not refuse everybody, one quiet retry for a read in the app, and words that blame the connection only when it is the connection. Strict: it imports the website routes through lib/team/website. */
  "tests/server-reliability-r50.test.ts",
  /* Round 51 (communities): a deleted community shows nowhere: its rows leave every bell (both tables, its old addresses too) when it is deleted or its scheduled deletion completes, its addresses, About page and public posts go to IndexNow, its stored copies are asked again, /app search leaves it and its plans out, the dialog names what goes, archiving as before. */
  "tests/communities-delete-r51.test.ts",
  /* Round 51 (E): Edit profile on the creator page with one scroll, a taller cover, every field and switch on the page before Save, four Save states, "@" social fields, and its social links synced with the OnePage's both ways; Customer emails' and Settings' pills as Analytics' chips with no flash or jump. scripts/check-profile-sheet-r51.mjs and scripts/check-emails-pills-r51.mjs measure them. */
  "tests/creator-emails-r51.test.ts",
  /* Round 51 (website settings): a theme's own newsletter sends from the builder's canvas (an address on the builder's origin is the canvas page's own) and from a preview link, the lab test's newest result stays, a backup's preview, the owner as the blog's default author live from their profile with Written by and the photo, New post with no second read, Apps' marks, own database Coming soon, GitHub in one line, Team's access only while inviting, a domain's certificate followed; scripts/check-newsletter-canvas-r51.mjs and scripts/check-site-settings-r51.mjs measure them in a browser. Strict: the blog reads through supabase-js. */
  "tests/site-settings-r51.test.ts",
  "tests/editor-reliability-r51.test.ts",
  /* Round 51 (stability): a platform switch the database did not answer is not off (Explore sent everybody to the landing page), where /explore goes while it is off (never the landing page in the app), the /app menus offer Explore only while it is on, a failed creator read throws instead of sending a seller to /onboarding, /sell and /signup/verify, and the dashboard's boundary asks the server again quietly. scripts/check-app-navigation-r51.mjs measures the navigation. */
  "tests/app-stability-r51.test.ts",
  /* Round 53: a profile photo saved from the OnePage editor is read back with Storelib's own address (lib/storage/media-url mediaFetch) and is the same file, not a refusal (lib/account/avatar-save sameMediaAddress). */
  "tests/photo-save-r53.test.ts",
  /* Round 53 (reliability): a slow or failing read degrades only the part that needs it. The shell's two rows asked again once, then the last good copy (lib/net/last-good), and never the whole page screen; every decoration of the shell and Getting started on Home with a ceiling; Log out ends the session on this device whatever Supabase Auth answers (app/api/auth/logout). scripts/check-app-resilience-r53.mjs counts it in Chromium against a slow and a flaky database. */
  "tests/app-resilience-r53.test.ts",
  /* Round 54 (database load): the SEO cron takes only what is due (a page scored, a site listed and Google asked a day after the last time, a sitemap walk six hours after the last), a read with a missing column is refused once per server and not on every read (lib/supabase/missing-memory, tolerant-select), and the live site and the editor read only the columns they draw. */
  "tests/db-load-r54.test.ts",
  /* Round 55 (database load): one shop with almost no visitors asked Supabase 630 times a minute. A column a SQL part adds (131, 107, 307, 309) is refused once per server per ten minutes on product pages, card lists and size chart reads (lib/supabase/missing-memory readLadder), a real error is never remembered as missing, the shop's commerce settings, home country, profiles and locations are read once per request and stock every time (lib/supabase/per-client), and "Confirming your payment" (every 4 s, forever) and a website's 503 "One moment" (every 5 s, forever) back off and stop. */
  "tests/db-bundle-r55.test.ts",
  /* Round 55 (database load): the bell, a community's inbox, Home's orders and the plan watch hear their own private topic (lib/realtime/own-topic.ts, SQL part 370) instead of postgres_changes, and open the old subscription when the topic is refused; the warm after a deploy draws only the sites visited in the last 7 days, their front page and /products where it is used (SQL part 371), counted with a stub database and a stub fetch. */
  "tests/realtime-warm-r55.test.ts",
  /* Round L (L1): Start with AI from the Fitness coach chip to the job row through the real create route (one website and one job for a press sent twice, the exact prompt, category and blank page in options, the kick, the editor finding the job from the server); the chip never overwrites the person's own words. Strict: tests/_journey. */
  "tests/ai-start-l1.test.ts",
  /* Round L (L7): the Fitness coach journey end to end with AI_BUILDER_AGENT=1 and a SCRIPTED model (the model is the only fake): chip, Create twice, the agent job's turns chained on a fake clock, events in order, ai_ files compiled, pages, menu, no theme chrome, bindings to this store's products only, a prop saved through the editor and read back, publish, the live site's reader, cancel and Continue, reopen. Strict: tests/_journey. */
  "tests/ai-builder-journey.test.ts",
  /* Round L (L7): Andrew's benchmarks A to J through the real routes with a SCRIPTED model: four new websites that differ in structure (A fitness multi page, B editorial with its own header and footer, C music bound to products, D one page without chrome), E a redesign inside a theme kept and restored from its backup, F blank without AI as before, G edits that leave everything else byte identical, H a long job with a lost hand over found by the cron and read back by seq, I every control through save, reload and publish, J tenants, unsafe imports, paths and secrets; L6's anti slop score of each. Real model quality is not measured here. Strict: tests/_journey. */
  "tests/ai-builder-benchmarks.test.ts",
  /* Round M (M1): Redesign with AI on an existing website through the real routes with a SCRIPTED model: owner only, a key, a backup taken first through the Backups mechanism and recorded on the job, one live job per website, the same press twice one job and one backup, L2's runner on the agent engine, content and bindings kept; Undo this AI job puts every page, setting and file back exactly and removes the pages and ai_ files the AI added, keeps what the person made after the backup, is undoable itself and safe twice; Backups' restore does the same and removes the person's additions only when named; the per account switch (AI_BUILDER_AGENT_ACCOUNTS by username or user id, never an email; AI_BUILDER_AGENT=1 for everyone) on Start with AI, Edit with AI, Redesign and the editor's GET. Strict: tests/_journey. */
  "tests/ai-builder-redesign-m1.test.ts",
  /* Round N (N3): the whole site, every page and template. A free start stores home alone (no preset product page); the site plan (report_progress pages: home with ten sections, every template with sections or a reason, every page six or a reason) opens the writes; list_pages lists the templates and set_page_sections designs them by key; finish refuses an incomplete site with the exact list (home sections, page sections, the product and collection templates, its own header and footer, a page nobody links to) within the repair budget, then completes; the product template drawn by the server template engine with a real-shaped product (pictures, price, options with ids, add to cart, offers, cleaned description) and the collection template with real products; the render check draws a template with the store's own product; the live cart route draws the cart template's sections. */
  "tests/ai-builder-whole-site-n3.test.ts",
  /* Round N (N1): Start with AI lands in the editor and the build is seen as it happens. The create call no longer waits for a cover; the Website page draws the editor's shell from the press; the editor knows the build before its first paint and shows a building canvas (never the theme's "Empty Page"); the agent's drafts are read again debounced (not every 8 s), files before the page, following the page it is on until the person picks one; the progress card docked, in plain steps ("Designing the header"); From scratch is the default and, with the new AI builder off for the account, refused in words (409 agent_off) instead of run on the theme's sections. Strict: tests/_journey. */
  "tests/ai-builder-start-live-n1.test.ts",
  /* Round O (O6): the design intelligence on every AI surface (docs/ai-builder/design-intelligence.md). The website agent, the Ask for a change agent and its creative planner, the section writer, the classic planner and copy filler and the Storelib Sites agent each carry designRulesFor(surface); the agent's system prefix is byte identical across two jobs while the briefs (creative brief, art direction, references as text, motion) differ; every edit surface gets the install's DESIGN.md and the keep-the-brand rule (spec I.5) and a new site does not; no surface carries round N's "editorial serif" type steering, and a personal trainer is not handed the italic serif bundle. */
  "tests/ai-surfaces-o6.test.ts",
]

const out = mkdtempSync(join(tmpdir(), "storelib-push-"))
const tsconfigPath = "tsconfig.tests.generated.json"
let anyFailed = false
try {
  // A real tsconfig rather than a file list, because the modules under test
  // import each other through the `@/…` alias. Passing files on the command
  // line gives tsc no baseUrl and no paths, so the first cross-module alias
  // import fails to RESOLVE — TS2307, exit 2, before a single assertion runs.
  // Written into the PROJECT ROOT, not the temp dir. tsc resolves `node_modules`
  // and `typeRoots` relative to the config file, so a config living in /tmp
  // cannot see @types/node — "Cannot find type definition file for 'node'",
  // exit 2, before any assertion runs. Removed in the finally block below.
  writeFileSync(
    tsconfigPath,
    JSON.stringify({
      compilerOptions: {
        outDir: out,
        rootDir: ".",
        target: "es2022",
        module: "esnext",
        moduleResolution: "bundler",
        /**
         * The section renderers are TSX, and tests/section-render.test.ts
         * imports them to render each section for real. `react-jsx` is what
         * Next.js compiles them with; without it tsc refuses the JSX and the
         * suite cannot see a section at all.
         */
        jsx: "react-jsx",
        skipLibCheck: true,
        strict: false,
        baseUrl: ".",
        paths: { "@/*": ["./*"] },
      },
      files: SUITES,
    }),
  )
  /**
   * `pnpm exec`, not `npx`. This project is pnpm — one lockfile, a
   * `packageManager` field, a pnpm-shaped node_modules — and npx is the one
   * command in it that was not. That is not only tidiness: npx will FETCH a
   * package from the registry when it cannot find the binary locally, so a
   * broken install turns into a silent download of some other tsc and a suite
   * that passes against the wrong compiler. `pnpm exec` fails instead.
   */
  execFileSync("pnpm", ["exec", "tsc", "-p", tsconfigPath], { stdio: "inherit" })
  if (STRICT_SUITES.length) {
    const generated = JSON.parse(readFileSync(tsconfigPath, "utf8"))
    writeFileSync(tsconfigPath, JSON.stringify({ ...generated, compilerOptions: { ...generated.compilerOptions, strict: true }, files: STRICT_SUITES }))
    execFileSync("pnpm", ["exec", "tsc", "-p", tsconfigPath], { stdio: "inherit" })
  }

  /**
   * NOTHING IS REWRITTEN. Resolution is a loader hook — see
   * scripts/push-test-loader.mjs.
   *
   * It used to be three regexes over the emitted text, which could not tell
   * code from data: one of them rewrote `import App from "./App"` INSIDE a
   * template literal in tests/sites.test.ts's project fixture, and the suite
   * then failed against code that was correct.
   */
  const walk = (dir) =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })

  writeFileSync(join(out, "package.json"), '{"type":"module"}\n')

  // Plain .mjs scripts a suite imports (tests/editor-freeze2 reads
  // scripts/materia-store-kit.mjs): tsc compiles only TypeScript, so each one
  // is copied next to the compiled tests at the same relative path.
  for (const file of walk(out).filter((f) => f.endsWith(".js"))) {
    for (const m of readFileSync(file, "utf8").matchAll(/from\s+["']((?:\.\.?\/)+scripts\/[\w./-]+\.mjs)["']/g)) {
      const target = join(dirname(file), m[1])
      const source = join(process.cwd(), relative(out, target))
      if (!existsSync(target) && existsSync(source)) {
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, readFileSync(source))
      }
    }
  }

  // Real packages, for suites that use one.
  //
  // The `@/…` rewrite above only handles this project's own modules. A BARE
  // specifier — `sharp` in tests/reprocess.test.ts — is resolved by Node
  // walking up from the importing file looking for node_modules, and the
  // importing file is in a temp directory that has none. So it fails with
  // ERR_MODULE_NOT_FOUND on a package that is plainly installed.
  //
  // A symlink rather than a copy: node_modules is hundreds of megabytes and
  // this runs on every push. Failing softly, because a symlink can be refused
  // (Windows without developer mode, an exotic filesystem) and every suite that
  // does not import a package still runs perfectly without it.
  try {
    symlinkSync(join(process.cwd(), "node_modules"), join(out, "node_modules"), "junction")
  } catch {
    /* suites importing real packages will say so themselves */
  }

  const compiled = walk(out)
  for (const suite of [...SUITES, ...STRICT_SUITES]) {
    const wanted = basename(suite).replace(/\.ts$/, ".js")
    /* By its whole name: page-seo.test.js is also the end of onepage-seo.test.js. */
    const entry = compiled.find((f) => basename(f) === wanted)
    if (!entry) throw new Error(`compiled test not found for ${suite}`)
    console.log(`\n──────── ${suite} ────────`)
    try {
      execFileSync(
        process.execPath,
        ["--import", join(process.cwd(), "scripts/push-test-register.mjs"), entry],
        { stdio: "inherit", env: { ...process.env, PUSH_TEST_OUT: out } },
      )
    } catch {
      // The suite already printed which assertions failed. Recorded and
      // carried on, so a failure in the first suite does not hide the second.
      anyFailed = true
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true })
  if (existsSync(tsconfigPath)) unlinkSync(tsconfigPath)
}

if (anyFailed) {
  console.log("\nsome suites failed")
  process.exit(1)
}
console.log("\nall suites passed")
