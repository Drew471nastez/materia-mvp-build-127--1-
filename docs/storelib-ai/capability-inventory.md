# Storelib AI builder: capability inventory

What the customer-facing Storelib AI and the website builder can do today, with the file that does it and how it is checked. Written for the Universal AI Builder Upgrade v2 pack (`docs/storelib-ai/upgrade-pack/`), from the code as it stands on `main`, 8 October 2026.

**Statuses.** `verified`: a test or browser probe exercises it on every push or was run for this report. `present`: the code is there and was read, but this pass ran no test of it. `partial`: works with a stated limit. `missing`: not in the code. Nothing is marked verified from a menu label or a migration name.

**Which AI.** The Storelib AI that creators talk to runs on OpenAI (`lib/sites/agent/openai-provider.ts`, `lib/website-builder/agent/loop.ts`). Claude, Codex and Cursor are development tools used on this repository; nothing in the product depends on them.

## The agent

| Feature | Status | Files | Evidence |
| --- | --- | --- | --- |
| Tool loop, streamed to the editor as operations | verified | `lib/website-builder/agent/loop.ts`, `app/api/website-builder/themes/[installId]/agent/route.ts` | `tests/agent-intent.test.ts` drives it with a scripted provider |
| Intent read before the page (local edit, content, style, behaviour, section/page/site redesign, new site, question) | verified | `lib/website-builder/agent/intent.ts` | `tests/agent-intent.test.ts` |
| Rebuild vs adjust ("completely different" vs "a bit") | verified | `intent.ts` (`rebuild`, `light`) | `tests/agent-site-pages.test.ts` INTENT |
| A named section stays the target of "completely different" (was read as a whole-site redesign) | verified, fixed in this pass | `intent.ts` (`NAMES_SECTION`, `NAMES_SITE`) | `tests/agent-site-pages.test.ts` |
| New page, keep-list, site-wide values | verified | `intent.ts` (`newPage`, `keep`, `global`) | `tests/agent-site-pages.test.ts` |
| Whole site: other pages built as drafts | verified | `page-builder.ts`, `page-builder-server.ts`, `build_page`/`list_pages` in `loop.ts` | `tests/agent-site-pages.test.ts` PLAN, REPLACE, KEYS, LOOP |
| Page set per kind of site | verified | `lib/storelib-ai/archetypes.ts` `ARCHETYPE_PAGES`, `wholeSiteGuidance` in `loop.ts` | `tests/agent-site-pages.test.ts` SITE |
| Creative plan before a big build | verified | `creative-plan.ts`, `plan-apply.ts` | `tests/agent-intent.test.ts` |
| Rules retrieved per request, not one long prompt | verified | `lib/storelib-ai/knowledge.ts` `knowledgeFor`, `lib/agent-skills`, `read_storelib_docs` tool | `tests/agent-brain.test.ts`, `tests/agent-site-pages.test.ts` (own-cart topic) |
| Section files compiled and quality-checked before they are kept | verified | `lib/storelib-ai/validate.ts`, `quality.ts`, `integration.ts`, `code-journal.ts` | `tests/section-integration.test.ts`, `tests/agent-intent.test.ts` |
| Whole-page check before "done" (contrast, empty text, demo copy, repeated entries) | verified | `project-check.ts`, `review.ts` | `tests/agent-intent.test.ts` |
| Browser check of its own page at 1440, 834 and 390 | verified | `visual-check.ts`, `page-document.ts` | `tests/reference-diff.test.ts` (with `CHROMIUM_PATH`); deployed via `@sparticuz/chromium` (`lib/website-builder/cover-shot.ts`) |
| A picture to match, measured (0 to 100, by region) and repaired up to three rounds | verified | `reference-diff.ts`, `visual-check.ts`, `intent.ts` (`recreate`), `loop.ts` | `tests/reference-diff.test.ts`: same 99, moved 60, inverted 54; in Chromium a page against its own shot 99, against another design 42 |
| Pictures sent with a request | present | `lib/sites/agent/attachments.ts`, `attachment-store.ts`, `IMAGE_FIDELITY_RULES` | not re-run in this pass |
| Memory: last messages of the conversation | verified | `memory.ts` | `tests/agent-intent.test.ts` |
| Memory: notes on this website (plan, direction, what each section is for) | verified | `project-state.ts` (kept in theme settings) | `tests/agent-intent.test.ts` |
| Memory: notes on every website of the creator | present | `lib/ai-memory/store.ts` (`ai_memories`) | |
| Asking one question when a fact is missing | verified | `ask.ts` | `tests/agent-intent.test.ts` |
| Run log (facts per run), read at /admin/ai-runs | verified | `run-ledger.ts`, `supabase/sql/RUN_STORELIB_AI_BUILDER.sql` | RLS tested on Postgres 16 for this report: own rows only, no update or delete |
| Undo of a run, backups | present | editor `undoAiRun`, `lib/website-builder/backups.ts` | |
| Long tasks continue past the five minute limit | present | route `continue` event, `theme-chat.tsx` `CONTINUE_PROMPT` | |

## The storefront a section can use

| Feature | Status | Files | Evidence |
| --- | --- | --- | --- |
| Header, footer, navigation of its own | verified | `lib/storelib-theme/chrome.ts`, `storefront-hooks.ts`, `site-chrome-hooks.tsx` | `tests/site-chrome.test.ts`, `tests/header-flex.test.ts` |
| A coded header placed as the header on every page, with the logo uploaded in the built-in header | verified, fixed round 22 | `operations.ts` (`declaredChromeKind`), `chrome-logo.ts`, `storefront-render.ts`, `storelib-live.tsx` | `tests/coded-chrome.test.ts` |
| Built-in cart drawer, search window, menu drawer from any section | verified | `storefront-hooks.ts`, `site-chrome-hooks.tsx` | `tests/header-flex.test.ts` |
| Add to cart from any section | verified, new in this pass | `storefront-hooks.ts` `addToCartLine`, `site-chrome-hooks.tsx` | `scripts/check-own-cart.mjs` (Chromium), `tests/agent-site-pages.test.ts` |
| A cart drawer of the section's own | verified, new in this pass | same | `scripts/check-own-cart.mjs`: add, lines, quantity, subtotal, storage, close, Escape, checkout |
| Live products, collections, menus, logo, socials in templates | verified | `lib/website-builder/shop-products.ts`, `lib/storelib-theme/values.ts` | `tests/section-framework-t.test.ts` and others |
| Email sign up and contact forms | verified | `form-intent.ts`, `StorelibSection.tsx` | existing suites |
| Section scripts in a sandbox | present | `components/website-builder/sections/section-sandbox.tsx` | |

## Commerce

| Feature | Status | Files |
| --- | --- | --- |
| Cart, one per site, priced again at checkout | present | `lib/website-builder/cart.ts`, `site-cart.tsx`, `cart-checkout.ts` |
| Physical checkout | present | `lib/physical/checkout-server.ts`, `checkout-pricing-server.ts` |
| Variants and options | present | `lib/physical/variants.ts`, `product_variants`, `product_options` |
| Inventory, locations, movements, transfers | present | `lib/physical/inventory-server.ts` |
| Shipping profiles, zones, flat and tiered rates, carriers, packages | present | `lib/physical/rates.ts`, `providers.ts` |
| Local pickup | present | `lib/physical/pickup.ts` |
| Tax rates | present | `commerce_tax_rates` in `lib/physical` |
| Orders, fulfilment, returns | present | `orders-server.ts`, `fulfillment.ts`, `commerce_returns` |
| Coupons | present | `lib/physical/coupon-options.ts` |
| Digital delivery, entitlements | present | `entitlements` |
| Metafields / custom product fields a theme can bind | missing | |
| Gift cards | missing | |
| Draft orders | missing | |
| Several currencies | missing | every price is charged in USD (`shop-products.ts` `SHOP_CURRENCY`) |

`supabase/sql/CHECK_STORELIB_AI_BUILDER.sql` lists every table above and says, on a real database, which are there.

## Not met yet

Truthfully open:

1. **A live, signed-in end to end run against OpenAI** (a full clothing brand site, a SaaS page, a coaching site, a dashboard, a redesign of an existing site) was not run from this environment: there are no OpenAI credentials here. The tools, checks, measurements and instructions are proven with scripted runs and real browsers; what the model builds on a real brief is to be judged in the product, and /admin/ai-runs now shows how those runs go.
2. **Interactive web apps with a backend of their own.** A section's script runs in a sandbox with capabilities; Storelib's platform actions (cart, forms, search, menus) are reachable by attribute. There is no per-site database or server code for a generated app; a dashboard can be built with state in the page, not with stored data of its own.
3. **The open builder tab** lists pages the AI built; a second open tab of the same site sees them on reload, not live.
4. **Commerce gaps against Shopify:** metafields (custom product fields a theme binds), gift cards, draft orders, several currencies. Each is a feature of its own (data model, admin, checkout), not a setting, and none is faked.
5. **The test suite** has 134 failing checks across 57 suites on `main` (an earlier report said 390, which counted passing checks whose names contain FAILED). None is in the AI builder; most are source-text checks in communities, accounts and mobile navigation that other work changed, listed by suite in the round 22 report.
