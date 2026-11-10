# OpenPage study (round R, R2)

Source: https://github.com/buildingopen/openpage, read at the default branch in November 2026 (a shallow clone, read only, never run).
Licence: MIT, "Copyright (c) 2026 Federico De Ponte". We copied no code, prompt text, theme values, templates, copy or images from it. What we took are ideas, adapted to Storelib's own sections; this note is the attribution.

## What OpenPage is

A JSON-first website builder (Vite, React 19, Zustand). A site is one `SiteConfig`: `{ name, theme, pages: [{ id, name, path, blocks }] }`, and a block is `{ id, type, variant, props }`. Nineteen block types (navbar, hero, features, pricing, cta, footer, testimonials, stats, faq, team, contact, newsletter, logocloud, divider, banner, content, image, video, gallery) with 42 layout variants. The visual editor, the AI endpoint and the HTML exporter all read and write that one JSON.

What we read:

| File | What it does |
| --- | --- |
| `api/generate.ts` | One Gemini call (`responseMimeType: application/json`, temperature 0.8) with a system prompt that lists the schema, every block type with its variants and props, two theme examples and the rules (navbar, hero, 2+ content sections, CTA, footer; 5-8 blocks; no lorem ipsum). 30 s `AbortController` timeout, 504 on timeout, 502 on an empty or failed upstream answer, `JSON.parse` of the text. |
| `src/lib/generation-prompt.ts` | The client-side version of the prompt, multi-page (at least two pages, 6-10 blocks each). |
| `src/lib/generate-site.ts` | The fallback chain (client key, then the server endpoint, then a template picked from the prompt) and `validateSiteConfig`: unknown block types dropped, an unknown variant replaced by the type's first, props merged over the type's defaults, theme colours kept only when `#rrggbb`, radius clamped, ids made when missing, a site with no blocks replaced by a template. |
| `src/blocks/types.ts`, `src/lib/block-metadata.ts` | The block registry: type, label, category, variants, default props. |
| `src/lib/theme-presets.ts` | Ten theme presets as complete token sets (six surface colours, four text colours, accent, borders, three fonts, two radii). |
| `src/store/configStore.ts` | Editing: Zustand + immer mutations of the JSON (update props, add, move, duplicate, pages, theme), an undo/redo stack of whole snapshots. |
| `src/lib/export-html.ts` | Rendering for publish: every prop HTML-escaped, links escaped, one standalone file. |
| `api/pexels.ts` | Stock photo search behind a server key. |

## What we adopt (and where it lives)

1. **JSON first, one composition call.** The whole site is generated as data in one call and validated before anything is placed: `lib/website-builder/ai-site/native/generate.ts`. Storelib's classic engine used to plan in one call and then write every section in its own call; the native engine composes the pages, theme tokens, settings and blocks together.
2. **A registry of blocks with variants and defaults, as the generator's vocabulary.** Ours is generated from Storelib's real section schemas (the default theme's `.storelib` files and JSON schemas, `ADDABLE_SECTIONS`) and Theme settings, never a second hand-written set: `native/registry.ts`. Variants are the sections' own choice settings (`image_side`, `layout`, `columns`...), with their allowed values and ranges. A test (`tests/native-engine-r2.test.ts`) fails when the registry drifts from the schemas (`native/registry-snapshot.ts`).
3. **Validate and coerce, field by field.** Like `validateSiteConfig`, unknown things are dropped and invalid values never reach the page, but stricter and with a record: `native/validate.ts` checks types, allowed values, ranges (clamped, noted), responsive values, links (this site's pages and the store's products only), bindings to the creator's own ids only, no markup or script in text, no invented prices or numbers, and runs the page sanitiser (`sanitizeSections`) last.
4. **Theme as a token set picked from presets.** The model picks one of Storelib's tested design presets and adjusts its palette, fonts and a few Theme settings, all checked against the real controls.
5. **A timeout, and honest errors.** Per call timeouts inside the job's own deadline; a refusal or an empty answer is its own outcome.
6. **Mapping other builders' names.** OpenPage's block names (`hero`, `testimonials`, `logocloud`...) are mapped to the closest Storelib type when a model uses them, and navbar/footer/divider entries are left out (the header and footer are the site's frame). Every mapping is recorded on the job.

## What we do differently, or do not adopt

- **No second schema, renderer, editor or storage.** The output is Storelib section instances placed with the editor's own operations (`ThemeOp`) through the classic job's build, saved as drafts by the same `SiteIO`, rendered by Storelib's own renderer and edited in Storelib's own editor. OpenPage's editor, store, exporter and block components are not imported.
- **Structured output as a strict tool, not "return only JSON".** `native/schema.ts` builds a tool schema from the registry: every object closed, every property required, enums for section and block types, presets and fonts, no numeric or length rules, so `strictReady` passes and the providers send it strict. Per-section settings are `[{id, value}]` pairs (a union per section type would exceed provider limits); the validator types each value exactly.
- **Repair instead of silent fallback.** OpenPage falls back to a template when the answer is unusable. We send the validator's exact issues back (one or two repair turns, only when a whole call still fits before the job hands over), keep the best answer, and take out what is still invalid. When nothing can be placed, the job plans the classic way and records why.
- **Nothing invented.** OpenPage's prompt asks for testimonials, stats and pricing tiers written by the model. Storelib never fabricates testimonials, metrics, prices or people: people sections are filled from real reviews by the builder, numbers and prices are checked against the store's facts.
- **Bindings to real data.** Product, collection, community and form settings take only the creator's own ids; pictures are the creator's own (P1) or briefed for the photo step.
- **Design intelligence in the prompt.** The prompt carries R1's design brain (`designBrainFor(brief)`), O2's art direction and the site's DESIGN.md, and the shared design rules (`surfaceRules`), so six businesses do not get one template.
- **Keys stay on the server.** OpenPage can call Gemini from the browser with a key in localStorage; Storelib calls through `lib/sites/agent/provider.ts` on the server only, with the creator's own key when they connected one, and counts the spend on the job.

## Rough edges seen in OpenPage (avoided)

- `JSON.parse` of model text with no repair, and a template replacing the whole answer on any failure.
- Props merged over defaults without type checks (a string where a list is expected reaches the component; the error boundary catches the crash).
- Default props with demo copy ("Your Headline Here") survive when the model leaves a prop out.
