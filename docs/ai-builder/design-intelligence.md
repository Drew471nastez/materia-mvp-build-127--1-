# Design intelligence on every AI surface (round O, O6)

Andrew asked for the design intelligence "across all AI generating, everything": a whole site from a sentence, an edit to an existing theme or website, one section, the look of a form, cart or checkout section, a site from a template. This is the map of every place Storelib asks a model to design or change a website, and what each one now receives.

Audit base: `origin/main` at `b2c9989f3` (2026-11-10).

## The shared pieces

| Piece | File | Owner | What it gives |
| --- | --- | --- | --- |
| Design rules | `lib/storelib-ai/design-rules.ts` `DESIGN_RULES`, `designRulesFor(surface)` | O3 (O6 ships a stub with the same names) | anti-ai-slop.md plus spec 8.1: fit the business, cliche combinations (the editorial serif bundle among them), honest content, no instructions to the creator in visible copy, craft. One text per surface, stable, so it sits in cached system prefixes |
| Surfaces | `lib/storelib-ai/surfaces.ts` | O6 | `surfaceRules(surface)` (the rules for a system prefix), `KEEP_BRAND_TOKENS` (spec I.5), `TYPE_FROM_DIRECTION` (what replaced round N's type steering), `findDesignContract(files)`, `designContractBlock()`, `editDesignContext(files)` |
| Contract read | `lib/storelib-ai/design-contract-server.ts` `readDesignContract(db, installId)` | O6 | the install's `DESIGN.md` from `store_theme_custom_files`, with the caller's own client (RLS decides). The Ask and Code a section routes read only `%.storelib`, so this is their one extra read |
| Creative brief and direction | `lib/storelib-ai/direction/` `briefFrom`, `chooseDirection`, `directionForPrompt`, `DESIGN_MD_PATH` | O2 (O6 ships a stub) | the brief, the primary direction and a secondary influence, said for a prompt. The stub refuses the editorial serif bundle unless the creator's words ask for it |
| References | `lib/storelib-ai/references/` `searchReferences`, `referencesForPrompt`, `referenceImagesFor` | O1 (O6 ships a stub that returns nothing) | analyses as text in the brief, pictures on the plan turn |
| Motion and site story | `lib/storelib-ai/motion/` `motionForPrompt`, `layoutStoryFor` | O5 (O6 ships a stub; the brief did not fix the path) | the motion tier line, the industry site story |
| The website agent's per-job brief | `lib/ai-builder/agent/design-brief.ts` `jobDesignBrief()` | O6 | the ONE place the agent calls O1, O2 and O5. A lane whose real shape differs is adjusted here |

## The surfaces

| # | Surface | Entry | Prompt assembly | Now receives |
| --- | --- | --- | --- | --- |
| 1 | Website agent, new site (Start with AI, blank or inside a theme / template) | `POST /api/website-builder/themes/create` → `lib/website-builder/ai-site/runner.ts` → `agent-runner.ts` → `lib/ai-builder/agent/loop.ts` `runAgentSlice` | system `AGENT_SYSTEM` (`lib/ai-builder/agent/prompts.ts`), first turn `briefMessage()` | prefix: core rules, `designRulesFor("site_agent")`, `STUDIO_CRAFT`, pages and templates; type rule is `TYPE_FROM_DIRECTION`. Turn: request, choices, store, pages, then `jobDesignBrief()` (CREATIVE BRIEF, DIRECTION FOR THIS SITE, REFERENCES as text, MOTION, SITE STORY), the starting directions as alternatives, type systems with the italic serif bundle left out unless asked, knowledge. Reference pictures: `cp.referenceIds` in the checkpoint, the images on the first turn only while `phase === "plan"` (`withPlanImages` in `loop.ts`, priced as ~1,600 tokens each) |
| 2 | Website agent, edit one component (Edit with AI) | `POST .../themes/[installId]/ai-edit` → agent job with `options.edit` | same system; `briefMessage()` with `job.edit` | the same prefix; in the turn `editDesignContext(files)`: the install's DESIGN.md and `KEEP_BRAND_TOKENS`. No new direction, no references |
| 3 | Website agent, redesign | `POST .../themes/[installId]/redesign` → agent job with `redesign` | same | `"changes"`: as an edit (contract + keep the brand). `"full"`: a new direction like a new site, with the old DESIGN.md said as the design being replaced |
| 4 | Ask for a change (the editor's chat agent: sections, header, footer, cart drawer, forms, product and checkout looks, theme settings) | `POST .../themes/[installId]/agent` → `lib/website-builder/agent/loop.ts` `themeAgent` | `SYSTEM_PROMPT` (module constant) and the first user turn | prefix: `designRulesFor("editor_agent")` after DESIGN LATITUDE. Turn: after THEME SETTINGS, `designContractBlock(input.designContract ?? findDesignContract(sources))` with `KEEP_BRAND_TOKENS`; the route reads the contract with `readDesignContract` |
| 5 | Ask for a change, creative plan (a whole page or site rebuilt from the chat) | same run, `PLANNER_SYSTEM` (`lib/website-builder/agent/creative-plan.ts`) | constant | `DESIGN_DEFAULTS` (its "labels in small capitals" line removed), `DESIGN_RULES_BRIEF`, `designRulesFor("site_agent")`; the per-run contract is in the run's own turn (4) |
| 6 | Section writer: Code a section | `POST .../themes/[installId]/sections/code` → `lib/website-builder/agent/write-section.ts` `writeSection` | `writeSectionSystem()` and the opening turn | prefix: `designRulesFor("section_writer")`. Turn: `designContract` (read by the route) with `KEEP_BRAND_TOKENS`, after the site's theme brief |
| 7 | Section writer as the classic job's coder | `lib/website-builder/ai-site/code.ts` `writerCoder` | same writer, no `designContract` | the writer's prefix with the rules; no keep-the-brand line, because it writes a new site to its own plan (`codePrompt` carries the plan's art direction and `STUDIO_CRAFT`) |
| 8 | Section repair | `POST .../sections/code/fix` → `lib/website-builder/agent/fix-section.ts` | `editSectionRules()` | unchanged on purpose: it fixes compile errors and must not touch the design |
| 9 | Classic pipeline planner (agent engine switched off) | `lib/website-builder/ai-site/job.ts` → `sitePlannerSystem()` (`lib/website-builder/agent/site-plan.ts`) | `SITE_PLANNER_SYSTEM` constant | `designRulesFor("classic_planner")` inside the constant (both with and without a coder) |
| 10 | Classic pipeline copy filler | `lib/website-builder/ai-site/fill.ts` `fillSystem()` | per job, cached for the job | `designRulesFor("classic_fill")` after FILL_RULES |
| 11 | Storelib Sites coding agent (React on Vite) | `POST /api/sites/[siteId]/agent` → `lib/sites/agent/loop.ts` | `SYSTEM_PROMPT` + `buildSystemPrompt()` | `designRulesFor("sites_agent")` at the end of `SYSTEM_PROMPT`, so a new and an existing project both get it; existing projects keep `PRESERVATION_RULES` (their own keep-the-brand rules) |

Not design generation, left alone: product SEO descriptions (`app/api/ai/seo`), market translation (`lib/markets/translate-ai.ts`), category suggestions, support reply suggestions, request routing (`lib/website-builder/agent/router-model.ts`), voice transcription, OnePage integration list reading. OnePage, Creator Page, forms, email and checkout have no AI design generation of their own today; their looks inside a website are sections the Ask agent (4) and the writer (6) change.

## What was removed

Round N's agent prompt told the model to pick "a display face with character (editorial serif, characterful grotesk, condensed display, mono)", editorial serif first, and the type library ranks "Editorial italic" (Instrument Serif italic with DM Mono caps labels) for coaching. Together with the direction library's "Quiet Strength" (Fraunces on #f4efe6) for fitness, that is the italic serif on cream with mono caps labels Andrew saw on a personal trainer site. Now:

- `AGENT_SYSTEM` says `TYPE_FROM_DIRECTION`: fit the business, from the direction, never the editorial serif bundle unless asked.
- the brief's type systems leave out an italic display serif or a serif with spaced capital labels unless the creator's words ask for editorial, serif, magazine, literary or journal.
- the direction stub leaves out a serif display on a light warm page under the same condition.
- `DESIGN_DEFAULTS` no longer says "Labels in small capitals with letter spacing".

Still in other lanes' files (not changed here): the "editorial serif" wording in `lib/ai-builder/slop.ts` (O3), the type library and direction library entries themselves (`lib/storelib-ai/library/*`), and the classic design presets with Fraunces, cream and terracotta (`lib/website-builder/design-presets.ts`).

## Tests

`tests/ai-surfaces-o6.test.ts`: every surface's assembled prompt contains its rules; the agent's system prefix is byte identical across two different jobs while the briefs differ; reference pictures only on the plan turn; edit surfaces carry the DESIGN.md and the keep-the-brand rule (and a new site does not); no surface carries the old steering.
