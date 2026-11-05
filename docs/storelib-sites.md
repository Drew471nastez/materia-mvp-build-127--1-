# Storelib Sites — architecture

> **This replaces the previous version of this document.** That one proposed
> building Sites on the website-builder's section-JSON engine. This brief rules
> that out in as many words — *"Do NOT create a second giant visual-builder JSON
> architecture"*, *"The website's REAL CODE is the source of truth"* — so the
> design below is a different product with a different data model. §8 says what
> happens to the work already merged under the old design.

## 1. What Sites is now

An AI-first code editor that happens to produce websites. Closer to Bolt than
to Webflow: chat on the left, a live preview on the right, real files
underneath, and a small visual editor that patches those files rather than a
parallel model.

The section-based website builder stays exactly where it is and keeps powering
creator storefronts. The two are different products that happen to both make
web pages; merging them would give both the worst of the other.

---

## 2. The one decision everything else follows from: where does the build run?

The brief asks for three things that pull against each other:

- `run_build` and `read_build_errors` as agent tools, and a preview that
  refreshes after every file change;
- *"Avoid permanent servers/containers for each user"*;
- *"Published websites should be static/CDN-friendly."*

Three ways to resolve it:

| | How | Why not |
| --- | --- | --- |
| **WebContainers** (what Bolt uses) | A Node runtime in the browser | Commercially licensed; ~50MB; needs `Cross-Origin-Isolation` headers site-wide, which would change every existing Storelib page; does not work in the iOS/Android webview Storelib ships |
| **Server build per change** | A container or function per keystroke | The cost model the brief explicitly rules out |
| **esbuild-wasm in a worker** ✅ | Bundle the user's files in the browser, ~30–80ms | Cannot `npm install` or run Vite plugins — the dependency set must be fixed |

**The recommendation is esbuild-wasm in a web worker for the editor, and one
short-lived serverless invocation on Publish.**

The constraint it imposes is the one the brief already asked for: *"Keep the
initial supported stack constrained. Do not allow arbitrary backend runtimes."*
React, react-dom and `@storelib/site` are pre-bundled as ESM; the user's files
are bundled in-browser into a single module; the preview iframe pulls both
through an import map. No install step, no container, no cost per keystroke, and
`run_build` is a function call that returns esbuild's diagnostics — which is
exactly the shape the agent tool needs.

**Everything the editor needs is served from our own origin**, not from a CDN:
esbuild's wasm, Monaco, and the React the preview imports. The default for all
three is a third-party CDN, and all three are load-bearing — without them there
is no preview, no code tab and no editor. Whether a creator can work on their
website today should not depend on jsDelivr. `scripts/build-sites-assets.mjs`
produces them from `node_modules` at build time, so the version being served is
the version in `package.json` rather than one written into a URL beside it.

Publishing runs the same bundle server-side once, writes the output to Storage,
and serves it statically from then on.

**Vite is the project's shape, not its runtime.** Projects are laid out as Vite
projects — `src/`, `index.html`, `vite.config.ts`, a real `package.json` — so
that "Export" and, later, GitHub sync produce something a developer can `npm
install && npm run dev` on their own machine. The editor just does not run Vite
itself.

---

## 3. Data model

Files are the source of truth. No section JSON anywhere in this feature.

```
sites                  id, creator_id, name, slug, status, template_id,
                       settings, published_deployment_id, created_at, updated_at
site_files             id, site_id, path, content, created_at, updated_at
                       UNIQUE (site_id, path)        -- read_file/write_file are one row
site_versions          id, site_id, snapshot JSONB, label, created_by, created_at
site_deployments       id, site_id, version_id, status, output_path, error, created_at
site_domains           id, site_id, domain, status, verification_token, ...
site_assets            id, site_id, path, storage_key, mime, bytes
site_integrations      id, site_id, provider, config JSONB, secret_ref
site_forms             id, site_id, name, fields JSONB
site_form_submissions  id, form_id, site_id, fields JSONB, created_at
site_collections       id, site_id, name, slug, schema JSONB
site_collection_items  id, collection_id, data JSONB, sort_order
```

Text files live in `site_files` because a project is a few dozen small files and
the agent's whole vocabulary is per-path reads and writes. Binary assets go to
Supabase Storage with a row in `site_assets` — the same buckets and the same
upload path the rest of Storelib already uses.

Every table is tenant-scoped through `sites.creator_id → creators.user_id =
auth.uid()`, which is the shape every `store_theme_*` table already uses.

**Site Collections are why the AI never touches SQL.** *"Create a real estate
site where I can add properties"* becomes a row in `site_collections` with a
JSONB schema and rows in `site_collection_items` — not `CREATE TABLE`. The agent
gets `create_collection` and `add_collection_field`; it does not get a database
connection.

---

## 4. What already exists and gets reused

| Need | Reuse |
| --- | --- |
| Auth, ownership, RLS | `creators.user_id = auth.uid()`, unchanged |
| Custom domains | `custom_domains` with DNS verification, already resolved in `proxy.ts` — add a `site_id` |
| Uploads | `components/app/image-upload.tsx` → Storage, with the browser-side downscaling added this week |
| Plans and gating | `resolveSellerPlan`, plus `lib/sites/plan.ts` from the previous slice, which survives unchanged |
| Products / communities | Referenced by id through the Site API. Never copied |
| Subdomain routing | `proxy.ts` already rewrites `{name}.storelib.com` |
| Dashboard shell | `components/app/sidebar.tsx`, `AppLayoutWrapper` |
| Design system | shadcn/ui as used everywhere else |

---

## 5. New surface

```
app/(storelib)/app/sites/                    dashboard, new-site flow, settings
app/(storelib)/sites/[siteId]/               the editor (its own route, outside /app's chrome)
app/api/sites/…                   projects, files, build, publish, agent
lib/sites/                        types, plan gates (exists), project ops, starter templates
components/sites/                 dashboard cards, editor shell, chat, file tree
```

The editor lives outside `/app` deliberately: it is a full-viewport tool with
its own chrome, and `/app`'s sidebar and mobile nav would fight it.

---

## 6. Security

- **The generated site never gets Supabase credentials.** Dynamic features go
  through `@storelib/site` → Storelib Site API → Supabase. The site's bundle
  holds a public site id and nothing else.
- **The preview iframe is `sandbox="allow-scripts"` without
  `allow-same-origin`**, so user code runs on a null origin and cannot read the
  editor's session, cookies or storage. That also gives the CSS isolation the
  brief asks for, free.
- **BYOK keys are encrypted at rest and never reach the client.** The agent runs
  server-side; the browser sends a prompt and receives a diff.
- **No arbitrary server-side code in V1.** A project is client-rendered React;
  there is no server runtime for a generated site to occupy.

---

## 7. Risks

1. **esbuild-wasm is the bet.** If a template ever needs a dependency outside
   the pre-bundled set, it cannot be added without a server build. Mitigated by
   fixing the stack now and treating "add a dependency" as a Phase 3 feature
   with a real answer, not a hack.
2. **Source mapping for the visual editor** needs a Babel JSX transform that
   stamps `data-storelib-loc` onto elements at build time, and an AST patch on
   write. Not Phase 1, but the transform has to exist in the bundler from the
   start or retrofitting it means rebuilding every project.
3. **Agent context.** *"Do not send the entire repository to the AI for every
   request"* is a correctness requirement, not an optimisation: a 40-file
   project blows the budget and the model starts editing the wrong file. The
   agent gets `list_files`/`search_files` and reads on demand.
4. **A broken AI edit must be recoverable.** Snapshot before every agent run,
   not after.
5. **Publishing must not serve the editor's JavaScript.** Two separate
   entry points, enforced by a test.

---

## 8. What happens to the previous design

Merged last turn under the section-JSON design:

- `supabase/migrations/20260908_storelib_sites.sql` — **keep**. It is additive,
  and the one genuinely important thing in it is narrowing
  `uniq_sti_creator_published` to storefronts, which was a real latent bug: a
  creator could otherwise end up with two published storefronts and a live page
  that changed by itself. The `kind`/`slug` columns become unused; they are
  harmless and removing them is a destructive migration for no gain.
- `lib/sites/plan.ts`, `lib/sites/slug.ts` — **keep and use**. Plan gates and
  hostname rules are the same either way.
- `lib/sites/types.ts`, `lib/sites/queries.ts` — **replaced**. They describe
  sections.
- `app/(storelib)/(marketing)/s/[slug]/[[...page]]` — **repointed**, not deleted. Same URL
  shape; it serves built static output instead of rendering sections.

---

## 9. Phases

**Phase 1 — the vertical slice**
1. ✅ Migration and the project persistence layer.
2. ✅ Sites dashboard, New Site (AI / Template / Blank), nav entry.
3. ✅ The React/Vite starter as real files.
4. ✅ Editor shell: chat pane, preview, code. The chat pane is the shell only —
   the transcript, the composer and the empty state — because the layout is
   worth settling before there is a model behind it. Its composer says so
   rather than pretending.
5. ✅ esbuild-wasm bundler in a worker; preview iframe; build errors.
6. ⬜ Publish: serverless build → Storage → static serve.

**What only showed up in a browser.** Four of these compiled, typechecked and
passed every assertion that read the source — and did not work:

- `unavailableDependencies` scanned every file in the project, including
  `vite.config.ts`, which imports `vite`. **The starter itself refused to
  build**, before the author had typed anything. It follows the module graph
  from the entry point now.
- `new Worker(new URL("./bundler.worker.ts", import.meta.url))` is the
  documented pattern. It builds, then throws `Failed to construct 'URL'` in
  production, where `import.meta.url` is empty in the client chunk. The worker
  is compiled to a static file.
- esbuild refuses to plan a CSS output without an output path even when
  `write: false`, so any project importing a stylesheet failed with a message
  about a path that is never written to.
- The preview frame has no `allow-same-origin`, so its origin is `null` and its
  imports of **our own** React are cross-origin. Chrome blocked them silently:
  a preview that built perfectly and rendered nothing. Fixed with an
  `Access-Control-Allow-Origin` header on `/sites/vendor/*` — the other fix
  would have been relaxing the sandbox, which trades the whole boundary for a
  header.

**Phase 2** — visual editing with source mapping, `@storelib/site`, products and
communities in the agent's vocabulary.

**Phase 3** — forms, collections, the Data tab, templates.

**Phase 4** — Shopify, third-party templates, GitHub sync.
