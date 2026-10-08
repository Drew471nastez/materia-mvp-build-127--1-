# Storelib Universal AI Builder, adapted to this repository

The Universal AI Builder Upgrade v2 pack, mapped onto the Storelib code as it is. The pack as written is kept unchanged in `reference/`; the files here say where each part of it lives in this repository, what is done, and what is not.

## Two kinds of AI, kept apart

- **Storelib AI** is the product: the assistant creators talk to in the website builder. It runs on **OpenAI** (`lib/sites/agent/openai-provider.ts`), driven by `lib/website-builder/agent/loop.ts` and reached through `app/api/website-builder/themes/[installId]/agent/route.ts`. Everything in `RUNTIME-CONTRACT.md` is about it.
- **Coding agents** (Claude Code, Codex, Cursor) are development tools used to change this repository. `AGENT-INSTRUCTION.md` is for them. Nothing in the product calls them.

The pack's `agent/` folder describes behaviour for the Storelib AI. It is not pasted into a longer system prompt: the rules that apply to every request are in `lib/storelib-ai/` (cached prefix), and the rest is retrieved per request (`lib/storelib-ai/knowledge.ts knowledgeFor`, `lib/agent-skills`, the `read_storelib_docs` and `read_design_patterns` tools), which is what the pack's `architecture/01` asks for.

## Where each part of the pack lives

| Pack | In this repository | State |
| --- | --- | --- |
| `implementation/00-DISCOVERY-FIRST.md` | `docs/storelib-ai/capability-inventory.md` | Written, with evidence per row |
| `implementation/02-SHOPIFY-GAP-MATRIX.md` | `content/developers/shopify-parity.md` (published at /developers/shopify-parity) | Theme settings, setting types, templates, and now theme-facing commerce |
| `architecture/01` pipeline | `loop.ts`: intent, creative plan, tools, review, project check, browser check, repair | Present; tested by `tests/agent-intent.test.ts` |
| `architecture/02` memory and edit scope | `intent.ts` (kinds plus `rebuild`, `light`, `newPage`, `keep`, `global`), `memory.ts`, `project-state.ts`, `lib/ai-memory` | Present; tested by `tests/agent-site-pages.test.ts` |
| `architecture/03` intermediate representation | Page state as sections and blocks (`operations.ts`), checked operations (`lib/agent-access/page-ops.ts`) | Present |
| `architecture/04` capabilities and security | Section script sandbox, compile gate, built-in files protected (`lib/agent-access/protected.ts`), RLS on every write | Present |
| `architecture/05` dynamic execution | Section `<script>` in a sandbox with capabilities; platform actions by attribute (`storefront-hooks.ts`) | Partial: no arbitrary app backend |
| `framework/01` sections, blocks, customizer | `.storelib` sections and theme blocks, controls registry | Present |
| `framework/02` pages, templates, navigation | Pages per install (`store_theme_pages`), menus (`menu-edits.ts`), `build_page` | Present |
| `framework/03` dynamic data | `shop-products.ts`, `values.ts`, globals (logo, socials, shop) | Present; no metafields |
| `commerce/` | `lib/physical`, `lib/website-builder/cart*.ts`, checkout | Present; gaps listed in the inventory |
| `design/` | `lib/storelib-ai/design.ts`, `archetypes.ts`, `patterns.ts`, `house-style.ts` | Present |
| `qa/` two passes | Structural: compile, quality, integration, project check. Visual: `visual-check.ts` at 1440 and 390 | Partial: no tablet width, no reference diff |
| Admin capability health | `supabase/sql/CHECK_STORELIB_AI_BUILDER.sql`, `storelib_ai_runs` | Partial: data and SQL, no admin page yet |

## Added in this pass

- `build_page` and `list_pages`: the Storelib AI builds the rest of a site (shop, product page, collections, About, FAQ, Contact, lookbook) as drafts, checked, with a backup first, and links them in the menu.
- Intent flags: rebuild vs light touch, new page, things to leave alone, values changed once where they live. "Make the FAQ completely different" no longer redesigns the whole site.
- A cart of the section's own: add to cart from any button, and a cart drawer of its own design on the site's one cart (`data-storelib-add-to-cart`, `data-storelib-cart-panel`).
- The run log (`storelib_ai_runs`) and a readiness check.

See `../capability-inventory.md` for "Not met yet".
