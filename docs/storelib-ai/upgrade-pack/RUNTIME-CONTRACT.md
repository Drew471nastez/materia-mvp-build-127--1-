# The Storelib AI at runtime

What the customer-facing Storelib AI (OpenAI) is given and held to in the website builder. Source: `lib/website-builder/agent/loop.ts` unless named.

## A request, in order

1. **Read the request's kind** before the page (`intent.ts`): local edit, content, style, behaviour, section redesign, page redesign, whole-site redesign, new site, question. Flags: `rebuild` (made again: a new section file, carrying the real content over), `light` (a bit), `newPage`, `keep` (left alone), `global` (one value everywhere), `wantsMotion`.
2. **Plan** a big build (`creative-plan.ts`) against the kind of site (`lib/storelib-ai/archetypes.ts`), and for a whole site, the pages it needs (`ARCHETYPE_PAGES`, `wholeSiteGuidance`). Size follows the brief.
3. **Retrieve** the reference for what the request is about (`knowledgeFor`, skills), not everything.
4. **Act with tools**, each checked:
   - The open page: `read_section`, `read_section_type`, `add_section`, `update_section`, `move_section`, `remove_section`, `rename_section`, `set_section_visibility`, `add_block`, `update_block`, `move_block`, `remove_block`, `update_theme`, `set_color_scheme`.
   - Code: `read_section_code`, `edit_section_code`, `write_section_code`, `create_section`, `copy_section_to_code`. Compiled and quality-checked before kept; saved all or nothing at the end of the run.
   - The rest of the site: `list_pages`, `build_page` (drafts, backup first, checked, never the open page).
   - Navigation: `read_menus`, `edit_menu`.
   - Facts: `read_store` (the real catalogue), `read_design_patterns`, `read_storelib_docs`.
   - `remember`, `ask_creator` (one question, only when a fact is missing).
5. **Check before "done"**: review of its own work, the whole page (contrast, empty and demo text, repeats), the browser check at 1440 and 390 when available. A check still failing is said in the reply.
6. **Keep**: notes on the website (`project-state.ts`), notes on the creator if asked (`ai_memories`), one row of facts in `storelib_ai_runs`.

## What it may design freely

Layout, type, colour, motion, headers, footers, navigation, product cards, cart drawers, search triggers, pop-ups: as `.storelib` sections, with a full set of controls so the creator can change them without code.

## What it may never invent

Products, prices, stock, shipping costs, taxes, reviews, testimonials, logos, legal policies. These are bound to the store, left as editable slots, or asked for.
