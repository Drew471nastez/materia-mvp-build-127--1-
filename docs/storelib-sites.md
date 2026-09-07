# Storelib Sites — architecture proposal

Written after reading the existing code, not from the brief. The short version:

**Storelib already has ~70% of Sites. It is called the website builder, and the
brief describes it almost exactly.** Building Sites as a new system beside it
would produce two section registries, two schema formats, two renderers and two
publish pipelines — which is the failure mode this codebase has already been
paying down all week. Sites should be the website builder, opened up.

This document says what exists, what is genuinely missing, and the order to
build it in.

---

## 1. What already exists

### The engine (`components/website-builder`, `lib/website-builder`, `themes/`)

| Brief asks for | Already built |
| --- | --- |
| "constrained metadata system that tells the editor what can be visually edited" | `themes/default/sections/<type>.json` — one schema per section, assembled by `lib/website-builder/section-schemas.ts`. This *is* the editable-component schema, and it is already data rather than code. |
| Section library with categories and presets | `themes/default/manifest.json` — `section_order`, `SECTION_CATEGORIES`, `ADDABLE_SECTIONS`, `STRUCTURE_SECTIONS`. |
| Section renderers | **51** of them under `sections/renderers/*`, dispatched by a data registry (`sections/registry.ts`) rather than a switch — deliberately, so a packaged theme can ship its own registry. |
| Global theme settings (colours, fonts, radius, width, spacing) | `lib/website-builder/theme-settings-schema.ts`, stored per install in `store_theme_settings`. |
| Draft vs published | Every table carries the split: `settings`/`draft_settings`, `sections`/`draft_sections`. |
| Templates with author, price, category, version | `themes` table: `is_free`, `price_cents`, `author`, `category`, `tags`, `preview_image_url`, `version`, `is_built_in`. |
| "Advanced code mode", export, import | `store_theme_custom_files` shadows theme files by path; `/website-builder/code/[installId]`; export + import routes exist. |
| Publish history | `theme_publish_history` with a JSONB snapshot per publish. |
| Autosave, duplicate, reorder | Sections API takes a whole array per page; duplicate route exists. |

### The platform Sites must reuse, not rebuild

- **Auth / ownership** — every website-builder table is RLS'd through
  `creators.user_id = auth.uid()`. Reuse verbatim.
- **Custom domains** — `custom_domains` with DNS `verification_token`,
  `status`, `ssl_status`, plus `/api/domains/{check,verify,resolve,cleanup}`
  and resolution already wired into `proxy.ts`. **Do not build a second domain
  system.**
- **Uploads** — `components/app/image-upload.tsx` → Supabase Storage, now with
  browser-side downscaling (`lib/images/compress.ts`) and a year of cache.
- **Products** — `products` + the checkout flow. Sites blocks must reference
  product ids, never copy product rows.
- **Plans** — `free | growth | pro`, resolved by
  `resolveSellerPlan()` in `lib/billing/fee-calculator.ts`.
- **Analytics** — `app/api/analytics`, `daily_rollups`, partitioned event
  tables.
- **Subdomain routing** — `proxy.ts` already rewrites `{name}.storelib.com` to
  a page and resolves custom domains.

---

## 2. What is actually missing

Five things. Everything else in the brief is either built or a variation on
something built.

### 2.1 Pages are not pages

`store_theme_pages` has `page_key TEXT` and `UNIQUE(install_id, page_key)`, and
the sections API already accepts **any** key (`z.string().min(1).max(64)`). So
the *storage* is multi-page today.

What is missing is everything around it:

- no `title`, `slug`, `seo`, `sort_order`, `is_homepage` columns;
- both public routes hardcode `.eq("page_key", "home")` —
  `app/(marketing)/w/[username]/page.tsx:123` and
  `app/(marketing)/[sellername]/page.tsx:214`. **Only the home page is ever
  served.** There is no route that can render a second page.

This is the single largest gap, and it is a routing + metadata change, not a
schema rewrite. That is a good position to be in.

### 2.2 A site is not an entity

Today a "site" is *the creator's storefront theme*: one published install per
creator (`uniq_sti_creator_published`), served at `/w/{username}`. Sites needs
a site to have its own name, its own subdomain, and to allow more than one per
creator on paid plans.

`store_theme_installs` is already 90% of `sites` — it has `name`, `status`,
`is_custom`, `parent_install_id`, `sort_order`. It needs a slug/subdomain and
the per-creator-published constraint relaxed to per-*site*.

### 2.3 No restore

`theme_publish_history` stores snapshots but nothing reads them back. Undo/redo
and version history need a restore path.

### 2.4 No Storelib community / commerce blocks beyond products

`product` and `product_list` sections exist. `community`, `community_cta`,
`creator_profile`, `checkout_button` do not.

### 2.5 No forms, no per-site analytics, no integrations, no template purchases

None of these exist. All are additive.

---

## 3. Proposed data model

Additive migrations only. **No renames, no drops** — the storefront, the public
`/w/` route and the editor all read these tables today.

```sql
-- Sites identity, on the existing install row
ALTER TABLE store_theme_installs
  ADD COLUMN slug TEXT,                     -- {slug}.storelib.site
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'storefront'
    CHECK (kind IN ('storefront', 'site')),
  ADD COLUMN published_version_id UUID,
  ADD COLUMN settings JSONB NOT NULL DEFAULT '{}';   -- favicon, language, scripts
CREATE UNIQUE INDEX ON store_theme_installs (slug) WHERE slug IS NOT NULL;

-- Pages become real pages
ALTER TABLE store_theme_pages
  ADD COLUMN title TEXT,
  ADD COLUMN seo JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN is_homepage BOOLEAN NOT NULL DEFAULT false;
-- page_key stays as the slug; it is already unique per install.

-- New tables
site_versions          (id, install_id, snapshot, label, created_by, created_at)
site_form_submissions  (id, install_id, page_key, fields JSONB, created_at)
site_integrations      (id, install_id, provider, config JSONB, secret_ref)
site_template_purchases(id, theme_id, buyer_id, price_cents, purchased_at)

-- Domains: link the existing table to a site rather than a second system
ALTER TABLE custom_domains ADD COLUMN install_id UUID REFERENCES store_theme_installs(id);
```

`kind` is what keeps this safe. Every existing row is a `storefront` and
behaves exactly as it does today; Sites creates rows with `kind = 'site'`, and
the per-creator-published uniqueness index is narrowed to
`WHERE status = 'published' AND kind = 'storefront'`.

---

## 4. Routing

| URL | Renders |
| --- | --- |
| `/w/{username}` | unchanged — the creator's storefront theme, home page |
| `/s/{siteSlug}` and `/s/{siteSlug}/{...page}` | a Sites site, any page |
| `{siteSlug}.storelib.site` | rewritten to `/s/{siteSlug}` in `proxy.ts` |
| `{customdomain}` | resolved by the existing domain logic, then as above |

The public renderer is `SectionRenderer` in both cases. One renderer.

**Static-first**, as the brief asks: `/s/[slug]/[[...page]]` should be
`generateStaticParams` + `revalidate`, not `force-dynamic` (which is what
`/w/[username]` is today). A published site is the same bytes for every
visitor, so it can be cached at the edge — unlike the creator storefront, which
renders per-viewer and is deliberately `private, no-cache`.

---

## 5. Editor

`app/website-builder/editor/[installId]/page.tsx` is **5,896 lines in one
file**. It is the largest risk in this plan.

Do not extend it and do not rewrite it. Build the Sites editor as a new shell
that composes the *existing* pieces — `SectionRenderer`, the section schemas,
the settings schema — with a pages rail the current editor does not have. The
two editors then share the engine and not the shell, and the old one keeps
working for storefronts while the new one proves itself.

Layout, per the brief: left rail (Pages / Sections / Site), centre preview,
right inspector driven by the section JSON schema, AI bar along the bottom.

---

## 6. Risks

1. **The 5,896-line editor.** Any change to it is high-blast-radius. Mitigated
   by not touching it.
2. **`page_key = "home"` is hardcoded in two public routes.** Adding pages
   without fixing these makes pages that exist and cannot be visited.
3. **RLS + the admin client.** `store_theme_*` is owner-only, so the public
   route uses `createAdminClient()` to read a published install. Every new
   public Sites read must be equally narrow — filtered to `status='published'`
   — or it becomes a way to read anyone's drafts.
4. **`uniq_sti_creator_published`** will block a second published site until it
   is narrowed to `kind = 'storefront'`.
5. **Editor JS must not ship to published sites.** The brief calls this out and
   it is real: the editor is a client bundle, `SectionRenderer` is not. Keep the
   published route free of any editor import.
6. **Custom scripts and AI-authored code** are the security boundary. Anything
   user-supplied belongs in a sandboxed iframe or a CSP'd island, never inline
   in the page shell.

---

## 7. Phases

**Phase 1 — foundation** (data model + gating + the pieces with no UI risk)
1. Migration: the columns and tables in §3.
2. `lib/sites/` — types, queries, slug rules, plan limits.
3. Public route `/s/[slug]/[[...page]]`, static-first.
4. `proxy.ts` rewrite for `*.storelib.site`.

**Phase 2 — the product surface**
5. Sites dashboard, New Site flow, template picker.
6. Editor shell: pages rail, section list, preview, inspector.
7. Inline text + image editing.
8. Publish.

**Phase 3 — Storelib blocks**
9. `community`, `community_cta`, `creator_profile`, `checkout_button`
   sections, plus the Digital Product and Community templates that use them.

**Phase 4 — AI, versions, forms, marketplace, Shopify.**

---

## 8. What this proposal deliberately does not do

- No new section format. The `themes/default/sections/*.json` schema is the
  format.
- No second renderer, no second registry, no second settings schema.
- No drag-and-drop canvas, no absolute positioning — matching the brief.
- No Shopify work until a Storelib-only site is genuinely good.
- No touching `app/website-builder/editor/[installId]/page.tsx`.
