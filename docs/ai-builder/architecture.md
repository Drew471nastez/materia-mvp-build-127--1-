# AI Website Builder as a coding agent (round L architecture)

Owner of this document: L0 (architect). Contracts live on branch `l0-contracts`:
`lib/ai-builder/types.ts`, `lib/ai-builder/agent-tools.ts`,
`lib/ai-builder/runtime-contract.ts`, `lib/ai-builder/manifest.ts`,
SQL part `401_ai_builder_agent.sql`, test `tests/ai-builder-contracts.test.ts`.

Audit base: `origin/main` at `f5c4a9b02` (2026-11-09). Line numbers below are from that commit.

---

## 1. What exists today (audit)

### 1.1 The creation flow

| Piece | File | What it does |
| --- | --- | --- |
| Website page | `app/(storelib)/app/website-builder/page.tsx`, `website-builder-client.tsx` | Library + "Create a website" doors |
| Describe your website | `app/(storelib)/app/website-builder/start-website.tsx:44-49` | Textarea, four example chips (`Candle shop`, `Fitness coach`, `Photographer`, `Online course`). A chip only fills the textarea (`:194 setPrompt(x.prompt)`); there is no category id, it is just text. `onStart("ai", prompt.trim())` at `:109` |
| Create action | `website-builder-client.tsx:1230-1276` `startWebsite` | Makes a per-press key (`newStartKey`), `POST /api/website-builder/themes/create {mode, prompt, key}`. With a job id: navigates to `editor?job=<id>` (`withJobParam`). Without (no table): stores the prompt in **sessionStorage** (`saveStartPrompt`) and navigates with `start=ai` |
| Create route | `app/api/website-builder/themes/create/route.ts` (`maxDuration = 60`) | Idempotency on `(creator_id, idempotency_key)`, `MAX_RUNNING_JOBS = 1`, `createStartWebsite`, `startJobRow`, then `after(() => kickJob(origin, job.id))` |
| New site rows | `lib/website-builder/create-website.ts:90-101` `startRows()` | ALWAYS `STORELIB_DEFAULT_ID` ("Foundation" = Storelib Default theme), its preset settings, home = **header + footer**, product page from the preset. Blank and AI modes get the same rows |
| Handoff fallback | `lib/website-builder/start-handoff.ts` | sessionStorage, `START_TTL_MS = 10 min`, `START_PROMPT_MAX = 2000` |

### 1.2 The job (other session's work, SQL part 380)

* `lib/website-builder/ai-site/job.ts`: a fixed **five step pipeline** `plan → build → write → photos → check` (`STEPS` at `:47`). Each step is resumable, the job is saved after every wave.
* `runner.ts` `driveJob`: claims a lease (`claimJob`, `LEASE_MS = 295s`), runs steps until `RUN_BUDGET_MS = 240s` (`server.ts:36`), releases, then `kickJob` POSTs `/api/website-builder/ai-jobs/<id>/run` on **storelib.com itself** (`own-origin.ts`) with an HMAC token (`jobToken`, `server.ts:52`). The run route answers 202 and works in `after()` (`maxDuration = 300`).
* Poll `GET /api/website-builder/ai-jobs/[jobId]?after=<seq>` (RLS read, light columns first). If the lease lapsed it re-drives the job in `after()`: self healing.
* Continue `POST .../continue` (owner only, rate limited).
* Editor: `lib/website-builder/ai-site/use-generation.ts` polls every `1.5s` (`6s` hidden) and replays `ThemeOp`s onto the canvas.
* Models: `ai-site/models.ts` plan `claude-opus-5-5`, write `claude-sonnet-5-5`, small `claude-haiku-5-5`, resolved by `lib/sites/agent/provider.ts resolveForCreator` (creator's own key from `/api/ai-keys` first, platform `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` otherwise). Spend is recorded (`Spend`, `cost_usd` column) but **not capped**.
* Table `ai_site_jobs` (`380_ai_site_jobs.sql`): status `queued|running|complete|partial|failed`, step CHECK, `state jsonb` holds the op log, owner select RLS, server writes.

### 1.3 Code-backed sections ALREADY exist (the most important finding)

Storelib already has a code component format and every layer around it:

* **Format**: `.storelib` files = `<template>` (Liquid-like, `lib/storelib-theme/storelib/template.ts`) + `<style scoped>` + `<script>` + `<schema>` JSON (`themes/default/sections/*.storelib`, e.g. `community_card.storelib:90`).
* **Source of truth per install**: `store_theme_custom_files (install_id, path, content, draft_content)` (draft/live halves, `lib/website-builder/theme-file-drafts.ts`) + `store_theme_file_versions` (every save, kind save/publish/restore) + publish RPC `publish_theme_install` moves `draft_content → content` + `site_releases`/`theme_file_blobs` (content addressed releases, rollback).
* **Editor controls**: the `<schema>` settings ARE the manifest. `lib/website-builder/storelib-schemas.ts schemasFromSources` turns them into `SectionSchema.fields` and the sidebar's `FieldEditor` draws them (control registry `lib/storelib-theme/controls/registry.ts`, 35 control types incl. `responsive`, pickers, `focal_point`, `color_scheme`). Repeating items = blocks.
* **Live site**: `lib/website-builder/storefront-render.ts prerenderStorelibSections` renders custom files **on the server through Storelib's own template interpreter** (data in, escaped markup out; no generated JS is executed on the server). SEO safe.
* **Behaviour**: `<script>` runs only in `<iframe sandbox="allow-scripts">` with an opaque origin and a DOM copy (`lib/storelib-theme/sandbox/protocol.ts`, `storelib/script.ts` static denylist + declared capabilities `navigation|commerce|analytics|forms|timers|embed|database`).
* **Commerce/runtime hooks**: trusted host behaviour via attributes (`lib/website-builder/storefront-hooks.ts`: `data-storelib-add-to-cart`, `-checkout`, `-cart`, `-cart-panel`, `-search`, `-menu`, `-form`, `-offers`, `-wishlist`).
* **Data bindings**: picker settings resolved server side, tenant scoped (`lib/storelib-theme/resolve.ts:252` `product_picker`, `product_list`, `collection_picker`, `community_picker`, `link_list`; an id that is not this creator's resolves empty), plus dynamic sources `{{ product.title }}` (`dynamic.ts`).
* **Custom header/footer**: a section with `"kind": "header"` / `enabled_on.groups` replaces the built-in one (`lib/storelib-theme/section-groups.ts`).
* **An AI writer for one section**: `lib/website-builder/agent/write-section.ts` + `compile-feedback.ts checkSectionSource` (compile gate, `MAX_CODE_ATTEMPTS = 3`), behind `POST themes/[installId]/sections/code`. Used by the editor's Ask panel only.
* **A full coding agent exists in the other product**: Storelib Sites (`lib/sites/*`, React/Vite projects): tool loop (`lib/sites/agent/loop.ts`, tools `list_files/read_file/write_file/replace_in_file/run_build/...` in `tools.ts`), esbuild bundling (`bundle.ts`), `typecheck.ts`, `render-check.ts`, sandboxed preview served from another origin (`preview-document.ts`), static publish (`publish.ts`). It has **no** section model and no visual editor controls by design (`lib/sites/types.ts:1-10`).

### 1.4 Root causes of the reported limitations

| Limitation | Root cause (evidence) |
| --- | --- |
| Foundation locked | `create-website.ts:93-101` always installs `STORELIB_DEFAULT_ID` with its preset; `job.ts stepPlan` picks one of `DESIGN_PRESETS` (enum, `site-plan.ts:254`) and `ADJUSTABLE_SETTINGS` only (`site-plan.ts:52`). The look is "a preset over the Default theme's sections". |
| Forced header/footer | `startRows()` keeps `preset.pages.home.filter(isChromeSection)` (`create-website.ts:97`) for **both** modes; `apply.ts:97 syncChrome` and `apply.ts:198 chromeOps` copy the Default header/footer to every page and rewrite their links; `universal-chrome.ts` renders home's chrome everywhere. There is no "no chrome" or "code chrome" path in the job. |
| Section catalog only | `site-plan.ts:140 plannableTypes` = `ADDABLE_SECTIONS` filtered; the tool schema enumerates them (`site-plan.ts:230 enum: types`). `fill.ts` only writes **settings/blocks** of existing types. The job never calls `writeSection`, never writes a file to `store_theme_custom_files`. |
| Single response generation | The plan is ONE call (`job.ts stepPlan`, `maxOutputTokens 32000`, one retry); each section is ONE call (`fillSection`). There is no tool loop, no read-back of what was made, no compile/render feedback in the job (only `verify.ts` text checks + one rewrite wave of 8). |
| Short timeouts | Per invocation 240 s (`server.ts:36`) is fine and chained, but the pipeline is shaped as a fixed list of steps whose budgets are guessed (`timeoutMs: 170_000` for the plan call, `job.ts`); the in-editor fallback (`themes/[installId]/generate`, the Ask agent `agent/route.ts:93 maxDuration 300`) dies with the request/tab. No total wall clock, iteration or cost cap (`Spend` is recorded, never enforced). |
| Prompt loss | Fixed on the job path (prompt in the row). Still lossy on the fallback path: sessionStorage is per tab, 10 minute TTL (`start-handoff.ts:39`), `takeStartPrompt` removes it on first read. Also the **chip choice** is never sent (only its text), and any future preferences (mode, style) have nowhere to go: the create body is `{mode, prompt, key}` and `ai_site_jobs` has no options column. |
| Progress not "real" | Progress is a step-percentage map (`STEP_PROGRESS`, `job.ts:120`), not events; the view replays ops but cannot show "writing sections/ai_hero.storelib", "compile failed, repairing". No cancel (only Continue). |
| Bindings guessed | `capabilities.ts` gives counts for forms/bookings (`forms: { published, bookings }`), no ids; there is no `form_picker` control (native_form uses a `form_url` text field). |

---

## 2. Decisions

### D1. The code component runtime is the `.storelib` section, not TSX (for round L)

Andrew allowed "React/TSX or the supported runtime". The supported runtime wins on every hard constraint:

1. **Never execute generated code on the server**: `.storelib` templates are interpreted by Storelib's engine (data, escaping, closed filter list), scripts only run in the opaque-origin sandbox. TSX would have to be either server rendered (executes AI code on the server: forbidden) or client only (an SEO and LCP regression for every published site).
2. **Editable in the existing editor for free**: the `<schema>` is already the typed manifest; `FieldEditor` already draws it; blocks already give repeating items; responsive values already exist.
3. **Source preserved**: files are stored as text with draft/live halves, versions, releases, rollback, GitHub sync, the code editor at `/website-builder/code/[installId]`. Nothing is flattened into settings.
4. **Publishing, caching, warm sites, cover shots, sitemap**: unchanged.

TSX stays possible later as an **island** runtime (`ComponentRuntime = "storelib" | "tsx_island"`, the second reserved, not implemented): compiled in the browser with the `lib/sites/bundle.ts` esbuild path, mounted inside the same sandbox as section scripts, with a server rendered `.storelib` fallback as its SSR. Not in this round.

### D2. Where a component lives and how a page uses it

* An AI component is a custom section file `sections/ai_<slug>.storelib` (repeating item types may be theme blocks `blocks/ai_<slug>.storelib`) in `store_theme_custom_files` of that install. Type names start with `ai_` (`AI_COMPONENT_PREFIX`) so they can never shadow a theme section (`write-section.ts` already checks taken names).
* A page places it as an ordinary `SectionInstance { id, type: "ai_<slug>", settings, blocks }` in `store_theme_pages.draft_sections`. **No new "code" section type**: the existing renderer already resolves custom types from files, so code components and native sections share one page JSON. Instance ids are the existing stable `SectionInstance.id` (generated `ai_<slug>-<jobseed>-<n>`, never reused).
* Header/footer: a component whose schema says `"kind": "header"` / `"footer"` and `enabled_on.groups`, placed with `group: "header"|"footer"`. In blank mode there may be none at all.
* The **manifest** (`ComponentManifest` in `lib/ai-builder/types.ts`) is what the agent writes and reasons about; `lib/ai-builder/manifest.ts manifestToSchema` turns it into the `<schema>` `settings`/`blocks` (existing control types). The file is the truth; the manifest is re-read from the file's schema (`schemaToManifest`, L5) so a creator's hand edit is never overwritten by a stale manifest.
* Editable prop kinds map to existing control types (table in `manifest.ts`): text, textarea, richtext, inline_richtext, image (image_picker + focal_point), video (video_picker/video_url), color, color_scheme, font (font_picker), spacing (range, px), number (range/number), select/radio, boolean (checkbox), link (url), icon (icon_picker), alignment, animation (select of the `animation_style` values in `theme-settings-schema.ts:397`), items (block type), and bindings: product, products, collection, collections, community, page, menu (link_list), form (NEW control `form_picker`, owned by L5/L4). `responsive: true` reuses the existing breakpoint values.

### D3. Design tokens per site

Tokens are **Theme settings**, so they show in Theme settings and are editable there: colour schemes (`color_schemes`), typography (`typography_styles`, fonts), radius, spacing scale, page width, motion. `DesignTokens` (types.ts) is the agent facing shape; `set_tokens` writes it through a mapper (L5 owns `tokensToThemeSettings`) into `store_theme_settings.draft_settings`. Values that have no Theme setting go to `custom_tokens` (a new namespaced theme setting key) emitted as `--t-<name>` CSS custom properties by the theme stylesheet. Components must read tokens through CSS variables (`var(--theme-*)`, `var(--t-*)`, scheme vars), never hard code brand colours; `validate` warns on raw hex outside `:root`-like token blocks.

**The site's own Theme settings (round N, N5).** `set_tokens` also takes `settings`: groups of labelled settings (`color`, `font`, `range`, `select`, `toggle`), grouped as the site's designer would (Palette, Type, Shape, Texture). A setting with `token` (a DesignTokens path such as `colors.accent`, `fonts.heading`, `typeScale.ratio`) stands for that token, so it stays a Theme setting the platform understands; fonts always use a token, because only the three font slots are loaded. One without a token is the site's own value, kept in `custom_tokens`. They are stored as the Theme setting `design_settings` (lib/ai-builder/site-settings.ts, checked there once) and every one comes out as `--t-<id>`. On a free site (`site_chrome: "home"` plus a design of its own) Theme settings lists those groups, then only the groups that act on every site (logo and brand, social links, cart, cookies, animations, custom CSS); the default theme's style groups wait under one Built-in sections row. The token panel and the agent both edit the agent's `site` scheme (it used to read and write `white`), and the agent's section rhythm is `ai_section_y`.

### D4. Start from blank vs inside an existing theme

* `GenerationMode = "blank" | "theme"` sent at create time and stored on the job (`ai_site_jobs.options`).
* **blank**: `createStartWebsite` gets a `chrome: "none"` option: home page has NO sections, no preset header/footer, preset settings reduced to neutral tokens. The agent writes its own header/footer components or none. `apply.ts` chrome helpers must not run for agent jobs. L4 verifies `universal-chrome` + the live layout draw nothing when home has no chrome (risk: a built-in fallback header somewhere in `app/(site)/w/[username]`).
* **theme** (generate inside an existing website): the job runs against a **backup first** (`store_theme_backups`, existing restore route) and writes drafts only; bindings in existing sections are preserved because the agent edits settings via ops and files via `edit_file`; "Undo AI changes" = restore that backup. Native sections stay native; the agent may add `ai_` components beside them.

### D5. The agent

* Engine column `ai_site_jobs.engine = 'classic' | 'agent'`. Classic (today's pipeline) stays as is and is the fallback; `agent` is new. Feature flag: platform setting / env `AI_BUILDER_AGENT=1` (L1/L2 decide where).
* Phases (`AgentPhase`): `brief → plan → build (tool loop) → verify (validate all + render check + anti slop review) → repair (bounded) → finish`. `ai_site_jobs.step` gains `'agent'` (one step, phases live in `phase`).
* Models: plan/review `claude-opus-5-5` (effort medium), loop `claude-sonnet-5-5`, small edits `claude-haiku-5-5`, through `resolveForCreator` exactly as `jobModels` does. Prompt caching on the stable prefix (rules + knowledge core + tool list).
* Tools (`lib/ai-builder/agent-tools.ts`): `list_files, read_file, write_file, edit_file, delete_file, list_pages, add_page, set_page_sections, set_section_settings, set_tokens, list_capabilities, bind_data, search_knowledge, validate, render_check, report_progress, finish`. Every write goes to DRAFT halves through the existing sanitisers (`sanitizeSections`, `saveDraft` + `recordVersion` with `author: 'ai'`). File writes are compiled first (`checkSectionSource`); a file that does not compile is not saved, the error goes back to the model.
* `validate` = compile (`storelib/compile.ts`) + schema validate (`schema/validate.ts`) + script static check (`script.ts`) + manifest lint (labels, defaults, every visible text is a setting, ids unique) + token use + import/remote URL allowlist (no `<script src>`, no remote CSS except Google Fonts through `font_picker`, `embed` hosts only) + binding check (every picker value exists in capabilities).
* `render_check` = server side **template render** of the page with the engine (interpretation, not execution) checking: renders non empty, no unresolved `{{ }}`, images have alt, headings order; plus **client reported runtime errors** from the editor canvas sandbox (`RuntimePreviewError`, sent by the editor bridge to `POST .../ai-jobs/[id]/events`), read by the next iteration. A headless screenshot check reuses `agent/visual-check.ts` only where it already works server side (it does not run generated scripts: it renders markup).
* Budgets (`JobBudget`, defaults in types.ts; raised in round N for whole sites): wall clock 45 min, 200 iterations, $10 platform spend (creator own key: $30), 24k output tokens per call, 240 s per invocation, 3 repair rounds per file, 3 verify→repair cycles for the site. A budget hit ends the job `partial` with what was made kept, never silently.
* Checkpoints: after each iteration the compacted transcript (`AgentCheckpoint`) is saved to `ai_site_jobs.checkpoint` (bounded to 256 KB: old tool results are replaced by one-line summaries; files are never in the transcript beyond the last read because they are in the DB). The next invocation resumes from it.

### D6. Durable execution on Vercel (extends part 380, no new system)

* Keep `driveJob → runUntil → kickJob` chaining to storelib.com with the HMAC token and lease. For `engine='agent'` `runUntil` calls `runAgentSlice(job, deps)` (L3) which runs iterations until `deadline = start + RUN_BUDGET_MS` minus the longest expected model call (stop starting new calls after ~180 s), saves the checkpoint, returns.
* Progress = **events**, not percentages: table `ai_site_job_events (job_id, seq, kind, payload, created_at)` (part 401). Writes by service role only; owner reads by RLS. A trigger tells the owner on their private topic (`storelib_tell_owner`, part 370) `{ job_id, seq }`; the editor then reads `GET .../ai-jobs/[id]?after=<seq>`. Poll stays as fallback (1.5 s visible / 6 s hidden), so nothing depends on realtime.
* Cancel: `POST .../ai-jobs/[id]/cancel` sets `cancel_requested_at`; the loop checks it before each model call and each tool; the job ends `cancelled`, drafts kept. Retry: `continue` (exists) resumes from the checkpoint; "Start again" makes a new job with a new key.
* Concurrency: one live job per install (partial unique index `ai_site_jobs_one_live_per_install` on `install_id WHERE status IN ('queued','running')`) plus the existing per creator `MAX_RUNNING_JOBS`. The editor shows the job instead of letting the creator edit the same draft; edits the creator makes anyway win: every agent write of a file passes `expectedVersion` (sha256 of the draft it read), a mismatch is a `conflict` result the agent must re-read.
* Cron safety net: a `*/5` cron `api/cron/ai-jobs` (L2) re-drives jobs whose lease lapsed and nobody polls (tab closed and the chain call was lost). Vercel cron limits allow it (other `*/5` crons exist).

### D7. Creation flow

* Body: `{ mode: "ai", prompt, key, options: { generation: "blank"|"theme", category?, preset?, preferences? } }`. The **chip** sends its `category` id (`fitness_coach`, ...) alongside the text; the text is still the exact prompt the person sees and may edit.
* Persisted before redirect: the job row (prompt, options, idempotency key) is inserted in the create route before the response; the client navigates to `editor/<installId>?job=<id>`. sessionStorage remains only as the no-table fallback.
* Idempotency: unchanged `(creator_id, idempotency_key)`; the client keeps the key in sessionStorage keyed by prompt hash too, so a reload of the Website page after a lost response re-sends the same key.
* The editor auto-starts nothing itself; the server already started the job. Opening the editor on a job that is `queued` with a lapsed lease drives it (exists).

### D8. Knowledge library

* In repo, as modules (not markdown read at runtime: `knowledge.ts:5-12` explains Vercel tracing): `lib/storelib-ai/library/` with one file per topic group: `styles.ts`, `layouts.ts`, `components.ts`, `motion.ts`, `industries.ts`, `anti-slop.ts`, `resources.ts` (external component registry). Each entry `KnowledgeEntry { id, kind, title, tags, industries, body, examples?, avoid?, license? }`.
* Build time index: `scripts/build-ai-knowledge.mjs` writes `lib/storelib-ai/library/index.generated.ts` (tokenised tags + BM25 weights). Retrieval `searchKnowledge(query, {kind, industry, limit})` is pure, deterministic, tested; no embeddings service.
* External registry (`resources.ts`): shadcn/ui (MIT), Radix (MIT), Origin UI / coss UI (MIT, verify), Tremor (Apache 2.0), Aceternity UI (verify: free components have their own licence), Magic UI (MIT), 21st.dev (per component author licence). They are **pattern references** for the agent (what a component does, its interaction, its a11y), never imported: the runtime has no npm. `adapterSafe` is true only for patterns re-implemented as `.storelib` examples in the library.
* Anti slop evaluator: deterministic checks on the generated files (banned words from CLAUDE.md, purple gradients, glassmorphism, identical card grids, emoji icons, fake metrics/testimonials without data, giant centered hero + three cards pattern, more than N pills) + an LLM review pass in `verify`. Returns `ValidationIssue[]` with code `slop.*`.

---

## 3. Data model changes (SQL part 401, drafted on this branch)

`supabase/sql/run-now/401_ai_builder_agent.sql` (+ migration copy `supabase/migrations/20271201_ai_builder_agent.sql`):

* `ai_site_jobs`: `engine text default 'classic'`, `mode text` (`blank|theme`), `options jsonb`, `budget jsonb`, `phase text`, `iteration int`, `checkpoint jsonb`, `cancel_requested_at timestamptz`, `last_event_seq bigint`; status CHECK widened with `cancelled`; step CHECK widened with `agent`; one live job per install.
* `ai_site_job_events`: append only, `(job_id, seq)` unique, owner select RLS via the job's creator, service role writes, owner notified on insert through `storelib_tell_owner` when part 370 is there.
* `store_theme_file_versions`: `author text` (`creator|ai|import|restore`), `job_id uuid` so history shows what the AI wrote and "undo this job" is possible.
* No new project files table: `store_theme_custom_files` is the project file store.

---

## 4. Workstreams

| WS | Owns (files) | Uses contracts | Main risks |
| --- | --- | --- | --- |
| **L1 Creation flow** | `start-website.tsx`, `website-builder-client.tsx startWebsite`, `themes/create/route.ts`, `create-website.ts` (blank chrome option), `ai-site/start.ts`, `start-handoff.ts` | `StartRequest`, `GenerationMode`, `StartOptions`, `CATEGORY_IDS`, SQL 401 `options/mode/engine` | Library limit and rollback paths; blank chrome must not break existing `blank` users (keep the old blank behind `generation` default) |
| **L2 Durable jobs + progress + realtime** | `ai-site/server.ts`, `runner.ts`, `job.ts` (engine switch only), routes `ai-jobs/[jobId]/*` (+ `cancel`, `events`), `use-generation.ts`, `api/cron/ai-jobs`, SQL 401 (finalise) and its 99 check | `AgentEvent`, `JobBudget`, `AgentCheckpoint`, `AgentJobStatus` | Lease races, chain loss, event table growth (prune > 30 days), RLS. Must keep classic jobs working byte for byte |
| **L3 Agent loop + tools + prompts + validation/repair** | `lib/ai-builder/agent/*` (new: `loop.ts`, `tools-impl.ts`, `prompts.ts`, `validate.ts`, `compact.ts`), reuse `agent/write-section.ts`, `compile-feedback.ts` | `AgentToolName`, `AgentToolInputs/Outputs`, `ValidationIssue`, `JobBudget`, `ComponentManifest`, `manifestToSchema` | Cost runaway (enforce budget per call), transcript size, model writing invalid schema, conflicting writes |
| **L4 Component runtime** | `lib/ai-builder/runtime-contract.ts` (implement), capabilities with ids (`ai-site/capabilities.ts`), `form_picker` resolution in `lib/storelib-theme/resolve.ts`, blank chrome rendering (`universal-chrome.ts`, `app/(site)/w/...`), token CSS emission (`custom_tokens`), render check helper, preview error bridge (canvas → `events`) | `RuntimeContext`, `StorelibHooks`, `DataBinding`, `DesignTokens`, `RuntimePreviewError` | Touches the live renderer: every change behind "only when the site has ai_ files/custom_tokens"; no regression on published sites (run the storefront suites) |
| **L5 Editor integration** | `components/website-builder/editor/*` field controls (`form_picker`, animation select, token panel), `lib/ai-builder/manifest.ts` (`schemaToManifest`, `tokensToThemeSettings`), "Edit with AI" per component (calls `sections/code` with the file), history (file versions with `author`), conflict UX | `EditableProp`, `ComponentManifest`, `DesignTokens`, `ProjectFileWrite.expectedVersion` | Editor is large and perf sensitive; keep controls from the registry, no parallel control set |
| **L6 Knowledge + registry + anti slop + retrieval** | `lib/storelib-ai/library/*`, `scripts/build-ai-knowledge.mjs`, `lib/ai-builder/slop.ts` | `KnowledgeEntry`, `KnowledgeQuery`, `ResourceEntry`, `ValidationIssue` | Licence claims must be verified (mark `verify` when unsure); content quality; keep tokens per retrieval small |
| **L7 Tests / E2E / benchmarks** | `tests/ai-builder-*.test.ts`, `scripts/check-ai-builder-*.mjs` (Chromium at `/opt/pw-browsers/chromium`), a fake provider benchmark of N prompts (cost, iterations, wall time, slop score) | all | Real model calls cost money: default to scripted providers; one opt in live run with a hard $ cap |

Order: L1, L2, L4, L6 can start at once on the contracts. L3 starts at once against fakes for tools it does not own. L5 needs L4's `form_picker` and `custom_tokens` names (fixed in the contract). L7 last but writes fakes early.

---

## 5. Security checklist (every workstream)

* No generated code runs on the server: templates interpreted, scripts sandboxed, no `eval` on the server, no `node:vm`.
* Provider keys server side; spend capped per job; per creator rate limits (`LIMITS.siteGenerate`).
* Tenant isolation: every route via `websiteCaller()` + `creator_id` filter; service role only after ownership check; capabilities and bindings only from this creator's rows; ids never invented (`bind_data` rejects unknown ids).
* No remote JS: no `<script src>`, `embed` hosts allowlisted, fonts only through the font picker.
* Drafts only; publish stays a human action.

---

## 6. Contract files on `l0-contracts` and how to extend them

| File | What it fixes | Who fills in |
| --- | --- | --- |
| `lib/ai-builder/types.ts` | `ProjectFile`, `ProjectFileWrite` (`expectedVersion`), `EditableProp` union, `ComponentManifest`, `CodeSectionInstance`, `DesignTokens`, `StartRequest`/`StartOptions`/`START_CATEGORIES`, `JobEngine`, `AgentJobStatus`, `AgentPhase`, `JobBudget` + `DEFAULT_JOB_BUDGET`, `AgentCheckpoint`, `AgentEvent` + `AGENT_EVENT_KINDS`, `ValidationIssue`, `RuntimePreviewError`, `AGENT_TOOL_NAMES`, `KnowledgeEntry`/`KnowledgeQuery`/`ResourceEntry` | everyone reads; extend minimally |
| `lib/ai-builder/agent-tools.ts` | `AgentToolInputs`/`AgentToolOutputs` per tool, `WRITE_TOOLS`, `WRITABLE_PATH`, `ToolSet` | L3 implements, L7 fakes |
| `lib/ai-builder/runtime-contract.ts` | `RuntimeProduct`, `RuntimeForm`, `RuntimeCapabilities` (what `list_capabilities` returns), `STORELIB_HOOKS`, `SandboxStorelib`, `AGENT_DEFAULT_CAPABILITIES` | L4 |
| `lib/ai-builder/manifest.ts` | `PROP_CONTROL`, `BINDING_CONTROL`, `propsToSettings`, `manifestToSchema` (real, tested against the compiler and `schemasFromSources`) | L5 adds `schemaToManifest`, `tokensToThemeSettings` |
| `supabase/sql/run-now/401_ai_builder_agent.sql` | columns, events table, trigger, file version author | L2 finalises; other round L SQL uses 402 to 409 |
| `tests/ai-builder-contracts.test.ts` | the above agree | everyone keeps it green |

Changing an event kind, status, phase or step means changing the TypeScript list AND part 401 together (the test compares them).

## 7. Open risks

* `form_picker` does not exist yet: until L4/L5 land it, form bindings are a `binding: "form"` prop the editor cannot draw. The agent must not emit it before then (L3: gate on a feature check).
* `buy now` has no native hook (only imported themes handle `data-storelib-buy-now`); components use add to cart then `data-storelib-checkout`.
* Blank mode depends on the live layout drawing nothing when home has no chrome; L4 must measure it on `/w/<username>` before L1 ships `generation: "blank"`.
* The checkpoint is bounded at 256 KB (column CHECK allows 400 KB of JSON text); L3 must compact before saving.
* One live job per install is a partial unique index created only when no install already has two live jobs (part 401 says so in a notice); the route checks it too.
* The SQL harness (`scripts/sql-harness/run.sh editor`) runs both bundles twice with part 401 and the check row reads `p401_ai_builder_agent = t`. Its second-run schema diff shows policy text drift on `form_bookings`, `form_submissions`, `native_forms` (parts 372/375, unrelated to this round).

## 9. Round M (M2): refusals, dead links, the live smoke

* **A refusal is never `ok: true`.** `report_progress` with a concept `validateConcept` rejects answers `ok: false`, a `reason` and one `plan.concept_invalid` issue per problem (contract `AgentToolOutputs["report_progress"]` widened); the tool event says "The visual concept needs another pass". The same for a phase move before the concept, `set_section_settings` where every key is dropped (`settings.nothing`), `set_tokens` that sets nothing, and `delete_file` (now with `reason`).
* **Dead links block finish.** `lib/ai-builder/render-check.ts`: a link with a job (a call to action by class or words, anything in a `<nav>` or the site's header/footer, a commerce link) is an error when it is `#`, empty, has no href, or goes to a missing page or id; `render.dead_button` for a `<button>` with no hook, form or script; `binding.empty` for a bound product list that draws empty titles or prices. Decorative links in running text stay warnings; in-page anchors to ids on the page pass. The prompt no longer teaches `| default: '#'`; knowledge entry `core-links-and-actions`.
* **The live smoke goes through the real path.** `scripts/ai-builder/smoke-run.ts` drives `runAgentInvocation` + `sliceStepper` (a fresh stepper per request) on `MemoryAgentStore` (`lib/website-builder/ai-site/agent-memory-store.ts`, checkpoint through JSON on every save) with spend, wall clock and request caps. `scripts/ai-builder/live-smoke.ts` runs it against Anthropic only with `STORELIB_LIVE_AI_SMOKE=1` and `ANTHROPIC_API_KEY` (default cap $1, 15 minutes); `tests/ai-builder-live-smoke.test.ts` runs the same smoke with a scripted model.

---

## 8. Round M (M1): theme mode on an existing website, Undo, the agent per account

### 8.1 Who gets the agent engine

| Switch | Effect |
| --- | --- |
| `AI_BUILDER_AGENT` | **Round N: on for every account by default.** Unset or `1` = everyone; `0` / `off` / `false` = the emergency off switch (classic builder for all except the allowlist). |
| `AI_BUILDER_AGENT_ACCOUNTS` | Comma separated allowlist, read on the server only. Each entry is a creator **username or slug** (any case, `@` optional), or a store owner's **user id** or a **creator id** (uuid). Emails are not accepted: an entry that looks like one is ignored and the log says only how many were ignored, never which. |

`lib/website-builder/ai-site/agent-access.ts` (`agentEnabledFor(db, { ownerUserId, creatorId })`) is the one check, applied in:

* Start with AI (`themes/create`): the new job's `engine` is `agent` for an allowed account, `classic` otherwise.
* Edit with AI (`themes/[id]/ai-edit`): 501 for an account that is not allowed (the editor falls back to Ask Storelib).
* Redesign with AI (`themes/[id]/redesign`): 501 for an account that is not allowed.
* The editor: `GET themes/[id]/redesign` answers `{ agent, job }`; `agent` decides whether the project menu offers Redesign with AI and whether Edit with AI asks the agent. The browser has no flag of its own (the old `NEXT_PUBLIC_AI_BUILDER_AGENT_EDIT` is gone).

The account is the store's owner; team members are refused by those routes anyway. No table, no SQL part: turning it on for one account is one env var.

### 8.2 Redesign with AI (D4 theme mode, now wired)

`POST /api/website-builder/themes/[installId]/redesign` body `{ prompt, key, scope?: "changes" | "full" }`:

1. owner only, this creator's website, the agent on for the account (else 501);
2. `(creator, key)` replays the first job (and its backup);
3. `LIMITS.siteAi` per person, `LIMITS.siteGenerate` per store, one live job per creator and per website (409 `ai_busy_site`; the database's `ai_site_jobs_one_live_per_install` index too);
4. **a backup first**: `takeBackup(..., { source: "ai", verify: true })`, the Backups route's own mechanism, before the job row exists (no backup, no job);
5. the job: `engine agent`, `step agent`, `mode theme`, `options = { generation: "theme", redesign: { scope, backupId } }` (no new column), kicked to L2's runner. The editor follows it with the same progress panel as Start with AI.

The loop (`AgentJobInput.redesign`): `changes` works like an edit across the whole site (no concept required, checks only the pages it touched, keep every page, section, word, picture and binding by id; native sections stay native); `full` asks for a concept and a new look but keeps the content and bindings. Neither may delete a page. `lib/ai-builder/agent/prompts.ts` says so in the brief.

### 8.3 Undo this AI job, and restores that really go back

`POST /api/website-builder/ai-jobs/[jobId]/undo` (owner only, 409 while the job runs) restores the job's backup through `lib/website-builder/restore-backup.ts`, the same steps as `backups/[backupId]/restore` (safety copy verified first, all or nothing), and marks the job `state.undo` (Continue and Start over drop it). The progress view's `redesign.undo` is `available | done | none`.

A restore used to leave whatever the backup did not know about. Now `lib/website-builder/added-since.ts` finds, **on evidence only**:

* added after the backup = not in the backup and the row's `created_at` is at or after the backup's;
* made by the AI = a file on an `ai_` path whose versions since the backup are the AI's (`store_theme_file_versions.author`, part 401) and none a person's; a page an AI job of this website reported creating (`ai_site_job_events` kind `page`, action `created`);
* not live (nothing published).

All three: removed with the restore (Undo and Backups alike). Anything else added since is returned as `added.kept` with its reason (`person`, `live`, `unknown`) and stays; Backups' preview (`GET backups/[id]`) lists both and the restore removes a kept one only when the body names it (`removeAdded: ["page:<key>", "file:<path>"]`), never a live one. Menus and page SEO live in Theme settings, so they come back with the settings.

Limits: a backup is pruned after 30 newer ones (the undo then answers 410 and points to Backups); an AI page the person edited afterwards is still the AI's page (pages have no history of their own).

Tests: `tests/ai-builder-redesign-m1.test.ts` (real routes, scripted model).

## Round N (N3): the whole site, every page and template

* **Free start rows.** `startRows("none")` stores home alone (empty). No preset product page any more; `startRows("theme")` is unchanged.
* **Templates are pages the agent designs.** `lib/ai-builder/agent/site-plan.ts` lists them (`product`, `collection`, `products` = shop, `search`, `cart`, `404`, `contact`, and `blogs`/`article` when the store has a blog) with where a visitor meets each and what its sections read. `list_pages` lists them even before they are stored; `set_page_sections` places on them by key (the first placement makes the row with home's chrome, event `page created`); `add_page` refuses a template key and says how to design it.
* **The site plan.** `report_progress` phase `plan` takes `pages: { key, sections: string[], reason? }[]` (`readSitePlan`). A new website (not edit, not redesign) needs it, with the concept, before any write (`plan.site_missing`, `plan.site_invalid`). Home lists at least 10 sections, every template sections or a reason (product, collection, shop and search need sections when the store sells), every other page 6 or a reason.
* **Finish** (`completenessIssues`, codes `site.*`, new websites only): home has 10 visible `ai_` body sections (6 distinct), every main page 6 or the plan's reason, product/collection/shop/search templates designed when the store sells (a product section that draws the product, list sections that loop `products`), every template the plan gave sections designed, every planned page made, own header and footer in free mode (`mode: "blank"`), every main page linked from the header or footer (their menus, url settings, typed links). Bounded by `maxVerifyCycles`: a hit ends `partial`, naming the codes.
* **Before the agent designs a template** a visitor gets the platform's working section (product with buy button via `withMainProduct`, the grid, search, the 404 line) drawn in the site's own tokens inside its own frame; `chromeScheme` reads an AI header/footer's scheme, so it is not the default white.
* **Render check of a template** draws it with the store's newest product as `product` and `page.product` and its first collection (`templateSample` in `lib/ai-builder/render-check.ts`); the in-memory check gets the store's products as cards.
* **Cart.** `/cart` draws the cart template's own sections under the cart body and prerenders coded sections there (an AI header drew nothing on `/cart` before).
* Tests: `tests/ai-builder-whole-site-n3.test.ts`; the journey, benchmarks, agent, engine and smoke scripts build whole sites (`tests/ai-builder-whole-site-fixtures.ts`). Benchmarks E and G3 (a change to an existing website) run as redesign `changes` jobs.

## 10. Round N (N1): Start with AI lands in the editor and the build is seen live

Andrew: "it needs to open the website builder immediately and start designing in real time. I cannot see it", and "It should NOT take me to the default theme".

What stood in the way, and what replaced it:

| Root cause | Now |
| --- | --- |
| `themes/create` waited up to 8 s (`QUICK_COVER_MS`) for a photograph of the empty site before answering; the page showed a spinner in Create | An AI start answers without a cover (`AI_START_COVER`); the Website page takes one later as for any site without one |
| Nothing between the press and the editor but that spinner, then "Loading the editor" | `StartingShell` (`components/website-builder/ai-generation/building-canvas.tsx`): the editor's frame with the building canvas, from the press; the editor reads `job=` in a layout effect and shows the same building canvas from its first paint |
| The job was followed only once the editor had loaded, and only after a classic poll said "agent" | `use-generation.ts`: one probe at once; an agent job's events are read from the first frame, draft changes handed to the editor once it is ready (`onAgentChange(finished, events)`); fallback poll 1.5 s backing off to 5 s (was 2 s to 10 s) |
| The canvas showed the theme's header and footer around "Empty Page", or a white card | `BuildingCanvas` whenever a build is live and the open page has nothing of its own (`showBuilding`) |
| Drafts read again at most every 8 s, only for the open page | `lib/website-builder/ai-site/live-build.ts`: `liveRefreshDelay` (900 ms after the last change, never more than 3 s after the first), section files before the page, `followPage` switches to the page the agent is on until the person picks a page, `arrivedIds` ring the new sections and the newest glides into view |
| The progress card was a 440 px card in the middle of the canvas, in the tool's own words | Docked (`GENERATION_DOCK`: top right on a computer, a one line card under the bar on a phone), plain steps (`toolStep`, `currentStep`: "Designing the header", "Writing the product page") |
| Start with AI built inside Storelib's theme unless a checkbox was ticked; with the agent off a "from scratch" press ran the classic builder on the theme's sections | From scratch is the default (`START_GENERATION = "blank"`), "Inside Storelib's theme" the second option; the Website page knows whether the agent is on (`agentEnabledFor`), says so in one line when it is not, and the create route refuses a blank press without it (409 `agent_off`) before anything is made or counted. The classic progress card says it is built from the theme's sections |

Tests: `tests/ai-builder-start-live-n1.test.ts`. Measured in the real editor with a scripted job (scripts/render-editor-probe.tsx with the job's routes answered locally): building canvas from the first frames, never "Loading the editor" or "Empty Page", a placed section drawn about 1 s after the poll that brought it, the canvas following the agent to the About page, desktop and a 390 px phone.

---

---

## 11. After round AP met round L (round AQ)

* **Which engine runs.** `startEngine()` (`lib/website-builder/ai-site/start.ts`) makes a new Start with AI job `agent` unless the platform turns it off (`AI_BUILDER_AGENT=0`, `off` or `false`), or `agentEnabledFor` allows it for one account; otherwise `classic`. Classic is the five step job plus round AP's `code` step (stored as step `build` with `state.coding`, because part 380's step CHECK has no `code`): its own header, footer and custom sections written by `writerCoder`, the theme's frame removed (`placementOps`). The agent engine is the same freedom by construction: `ai_` files, its own chrome, Theme settings as tokens.
* **One gate.** `lib/website-builder/ai-site/gate.ts` holds the file rules both engines refuse a file for, in the same words: a secret or env read, a remote script, a typed picture, a loop with no reduced motion rule, no settings, a header without the menu (the classic job also asks it of the footer), a picture default that is not https, a richtext setting printed without `| raw`, a placeholder, a banned word or an em dash. `acceptCoded` (classic) and `validateFile` (agent, `gate.*` codes) both call it.
* **One craft.** `STUDIO_CRAFT` (`ai-site/craft.ts`) is in the classic planner and coder prompts and, whole, in `AGENT_SYSTEM`. The agent is told to write its own header and footer in place of the theme's in theme mode too, and no longer to leave "goes here" slots.
* **Inline build.** Without the jobs table, `themes/[installId]/generate` sends a checkpoint with every saved state; the editor keeps the latest in this tab (`start-handoff.ts saveInlineBuild`) and a reload carries the build on. A closed tab or another device cannot: before part 380 there is no server row to keep it in, and the website's own settings and files are published and synced, so they are not a place for a description.
* **Measured.** `scripts/check-ai-sample-site.mjs` draws the test designs end to end through the real engine at 390 and 1440; `scripts/check-website-refresh.mjs` counts the Website page's `router.refresh()` calls per trigger.
