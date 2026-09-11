# Storelib Theme Architecture

This is the plan for replacing the website builder's theme architecture with a
portable, source-based format, and the record of what the existing system
actually is. The second part exists because the first part has to be built on
it, not beside it.

## What exists today, precisely

Read from the code, not from memory, on the day this was written.

| Concern | Where it lives | What it is |
| --- | --- | --- |
| Section definitions | `themes/default/sections/*.json` (50 files) | `{type, name, category, icon, fields, blocks, presets}`. Loaded into `SECTION_SCHEMAS` by `lib/website-builder/section-schemas.ts`. |
| Section rendering | `components/website-builder/sections/renderers/*.tsx` (50 files) | Hand-written React. `registry.ts` maps `type` → component. **There is no template language; a section is a React file.** |
| Instance data | `store_theme_pages.sections` / `draft_sections` (JSONB) | Arrays of `{id, type, name, settings, blocks, hidden}`. Draft and published already exist at the page level. Settings and schema are already separate. |
| Theme settings | `store_theme_settings.settings` / `draft_settings` | One JSON object per install. |
| Code editor storage | `store_theme_custom_files (install_id, path, content)` | A virtual filesystem keyed by path. `theme-file-tree.ts` derives a Shopify-shaped tree from the schema registry. |
| Code editor behaviour | `app/api/website-builder/themes/[installId]/files/route.ts` | **Saving writes the row and nothing else.** Nothing compiles it. The preview keeps rendering the hardcoded React component. The saved content is inert. |
| Export | `.../export/route.ts` | A zip: `manifest.json {format, install, settings, pages, image_map, theme_pack?}` with pages embedding full instances, plus `images/<sha>.<ext>`. Assets are already content-hashed inside the zip; instance data references raw URLs remapped through `image_map`. |
| AI | `lib/website-builder/agent/operations.ts` (`ThemeOp`) | Instance edits only: add/update/move/remove sections and blocks, theme settings. **The AI cannot create a section type.** |
| Add Section | `themes/default/manifest.json` → `addable_sections` | A hardcoded list. |
| Sidebar | `FieldEditor` in the editor page | Already a switch on `field.type`. This is the seed of the control registry, not yet formalised. |
| Revisions | `store_theme_backups`, `theme_publish_history` | Exist. |

Two of these are load-bearing for the plan:

1. **Instance data is already the right shape.** The schema/instance split the new
   format requires is already how `store_theme_pages` works. Templates in the new
   format are a re-serialisation of what is stored today, not a new concept.
2. **The code editor is the gap.** Everything a developer or the AI writes into a
   file today is dead on arrival, because nothing reads it back. The new
   architecture's job, reduced to one sentence, is to make a saved
   `sections/hero.storelib` the thing that renders.

## The target

```
theme.json
config/
  settings_schema.json
  settings_data.json
layout/
  theme.storelib
templates/
  home.json
  product.json
  about.json
  contact.json
sections/
  hero.storelib
  feature-grid.storelib
  …
snippets/
assets/
locales/
```

A section is one `.storelib` file with four blocks:

```html
<template>
  <section class="hero" data-layout="{{ settings.layout }}">
    {% if settings.eyebrow %}<span class="eyebrow">{{ settings.eyebrow }}</span>{% endif %}
    <h1 style="font-size: {{ settings.heading_size }}px">{{ settings.heading }}</h1>
    {% for block in blocks %}
      <a class="button" href="{{ block.settings.url | url }}">{{ block.settings.label }}</a>
    {% endfor %}
  </section>
</template>

<style scoped>
  .hero { padding: 64px 32px; background: var(--theme-color-background); }
  .eyebrow { letter-spacing: 0.18em; text-transform: uppercase; }
</style>

<script>
  root.querySelector(".button")?.addEventListener("click", () => storelib.analytics.track("hero_cta"))
</script>

<schema>
{
  "schema_version": 1,
  "type": "hero",
  "name": "Hero",
  "category": "content",
  "version": "1.0.0",
  "settings": [
    { "type": "header", "id": "hdr_content", "label": "Content" },
    { "type": "text", "id": "eyebrow", "label": "Eyebrow", "default": "" },
    { "type": "text", "id": "heading", "label": "Heading", "default": "Welcome" },
    { "type": "range", "id": "heading_size", "label": "Heading size", "min": 24, "max": 96, "step": 2, "unit": "px", "default": 56, "responsive": true },
    { "type": "select", "id": "layout", "label": "Layout", "options": [{ "label": "Centre", "value": "center" }, { "label": "Split", "value": "split" }], "default": "center" }
  ],
  "blocks": [
    { "type": "button", "name": "Button", "settings": [
      { "type": "text", "id": "label", "label": "Label", "default": "Shop now" },
      { "type": "url", "id": "url", "label": "Link", "default": "/shop" }
    ] }
  ],
  "max_blocks": 2,
  "presets": [
    { "name": "Hero", "settings": { "heading": "Welcome to the store" }, "blocks": [{ "type": "button" }] }
  ]
}
</schema>
```

A template holds instances and nothing else:

```json
{
  "sections": {
    "hero-a1b2c3": {
      "type": "hero",
      "settings": { "heading": "Presets that hit different" },
      "blocks": {
        "btn-1": { "type": "button", "settings": { "label": "Get the kits", "url": "/shop" } }
      },
      "block_order": ["btn-1"]
    }
  },
  "order": ["hero-a1b2c3"]
}
```

Note what is absent from the instance: no schema, no CSS, no source, and no
setting the user never changed. `heading_size` is not there because it is 56 by
default and nobody moved the slider. At render time,
`resolved = saved ?? schemaDefault`, in the order documented in
[07-settings-resolution.md](07-settings-resolution.md).

## The one contract

The editor sidebar, the AI, and a theme developer all speak to a section
through the same three things: its `<schema>`, the control registry, and the
template instance. There is no separate engine for built-in sections, for AI
sections, or for marketplace sections. The 50 built-in React renderers are the
last thing to migrate, one at a time, and until each one moves it keeps
rendering exactly as it does now.

The registry is the single source of truth for what a setting *is*:
`lib/storelib-theme/controls/registry.ts`, and the generated
`storelib-controls.json` beside it. The editor reads it to render a control,
the validator reads it to check a schema, the AI reads it to know what it may
ask for, and the docs are generated from it. A setting type that is not in the
registry does not exist.

## Migration strategy

The rule throughout: **nothing that renders today stops rendering.** Migration
happens per section type, and a section that has not migrated is untouched.

### Phase A: engine beside the old system (no behaviour change)

`lib/storelib-theme/` is new and self-contained. It imports nothing from the
editor, the renderers, or Supabase, so it can be tested without any of them:

- `types.ts`: the filesystem model, manifest, template, section source, compiled
  section, asset references, version fields.
- `controls/registry.ts` + `storelib-controls.json`: every setting type.
- `schema/validate.ts`: a section schema is valid or it is a list of errors with
  paths and line numbers.
- `storelib/parse.ts`: the four blocks of a `.storelib` file, with the line each
  starts on, so an error in the schema is reported at its real line.
- `storelib/template.ts`: the markup language, compiled to an AST and
  interpreted. No `eval`, no `new Function`. Settings are HTML-escaped on output;
  paths cannot reach `__proto__` or `constructor`.
- `storelib/css.ts`: `<style scoped>` is rewritten with postcss so every selector
  is prefixed with the instance's `[data-section-id]`. Global theme CSS is a
  separate, explicit mechanism: `layout/theme.storelib`'s `<style>` is not
  scoped.
- `storelib/script.ts`: a `<script>` is statically refused if it names
  `window`, `document`, `globalThis`, `eval`, `Function`, `import`, `fetch`, or
  `XMLHttpRequest`, and is otherwise wrapped into a function that receives only
  `{root, settings, blocks, theme, page, storelib}`. This is the first line;
  the iframe sandbox in Phase D is the second.
- `resolve.ts`: the inheritance order, responsive values, asset references.

### Phase B: Hero through the new engine, in the existing canvas

`themes/default/sections/hero.storelib` reproduces `HeroSection.tsx`. A
`StorelibSection` React component renders any compiled section from instance
data and registers itself in `SECTION_COMPONENTS` under the type. The existing
canvas, selection outline, floating toolbar and sidebar keep working because
the section still arrives through the same `SectionProps`. Existing hero
instances keep their settings, because instance data was never the thing that
changed.

The sidebar for a `.storelib` section is generated by walking its schema and
rendering each setting through the registry. The existing `FieldEditor` becomes
the registry's implementation rather than being replaced.

### Phase C: source is what the code editor edits

Saving `sections/*.storelib` parses, validates, compiles, and either returns
errors with line numbers or updates the compiled section and tells the canvas
to reload it. Add Section is derived from `sections/*.storelib` that carry a
preset. Deleting a file removes it; deleting one that templates still use is
warned about first.

The AI gains one capability: writing a `.storelib` file. It gets the same
compiler errors a human does, and it repairs them the same way. Its edits are a
change set — files created, files modified, assets added — validated whole and
committed whole, or not at all.

### Phase D: portability and hardening

Export as `.storelib-theme`: a zip with the full source tree, `assets/`
content-addressed and carrying metadata, `theme.json` with format, versions,
author and engine compatibility, and a file manifest with SHA-256 per file.
Import validates the package (schema, scripts, external domains, sizes, counts,
forbidden APIs), uploads the assets to the importing account, remaps every
`asset://` reference, and installs. A theme exported by one account renders
identically when imported by another, because nothing in it names the first
account's storage.

Reading today's `manifest.json` v1/v2 into this form is a converter, not a
break: pages become templates, `image_map` entries become assets, section
types that have a `.storelib` source use it and the rest keep their React
renderer.

The preview moves into a sandboxed iframe; scripts declare capabilities and
network access is an allowlist or a proxy; a strict CSP is the design
constraint rather than an afterthought.

### What can migrate today, measured

Counted across the fifty renderers on 2026-09-11, by whether the component
uses a React hook or attaches a handler of its own (the editor's own
`onClick={onClick}` does not count):

| | Count | What it means |
| --- | --- | --- |
| No behaviour of its own | 30 | Can move to `.storelib` now. The hero and the testimonials have. |
| Needs behaviour in the browser | 20 | A `<script>` block is checked and stored but not executed until Phase D, so these wait — or are rewritten to need no script. |

The twenty: announcement_banner, collection_list, contact_form,
countdown_timer, counter, cta, faq, footer, gallery, header,
image_comparison, newsletter, pricing, product, products_carousel,
size_guide, slideshow, stats, sticky_bar, tabs_content.

Some of them need less than they look. An FAQ accordion is
`<details>`/`<summary>` and no script at all; a carousel is scroll snapping.
Rewriting one that way is a change to how the section behaves, so it is a
decision to take per section rather than a mechanical conversion, and it is
not counted as "can migrate today" above.

One thing the format does not have yet, and the count above hides: an
`icon_picker` setting resolves to a React component from `ICON_MAP`, and a
template cannot render a React component. A section that draws icons needs
the icon's SVG reachable from the engine before it can move. Two of the
thirty are in that position.

### How a section is proved to have migrated

`scripts/check-storelib-parity.mjs <type>` renders the section both ways —
the renderer it is leaving and the `.storelib` file it is becoming — at
1100px and 380px, for the shipped defaults, every preset, and a
scheme-only instance. It compares, for each pair: the text in order, the
section's height, the heading's size, colour and family, the subheading's
colour, every button's background, colour, border and radius, the surface,
every element that paints a background or a border (its rectangle, colour
and radius), and every image, video or SVG with its size. A control run
enlarges one size by 10px in the engine's copy and the script fails if that
goes unnoticed.

The section names the renderer it is migrating from in `BEFORE` in
`scripts/render-storelib-parity-probe.tsx`; the renderer stays in the tree,
unregistered, until the probe no longer needs it.

It earns its place. Measured on the two sections that have moved, it found:
buttons falling back to the wrong scheme colour, a gradient preset losing
its gradient, three line-box mismatches, a scroll indicator whose ring was
drawn with element opacity instead of border alpha, and a split hero whose
content was centred 259px to the right of where it belonged — the last two
only after the painted-box comparison was added.

### What migrates, and in what order

1. types, 2. registry, 3. validator, 4. parser and compiler — Phase A.
5. Hero converted, 6. rendered through the canvas, 7. sidebar from schema — Phase B.
8. Add Section discovery, 9. code editor save and reload — Phase C.
10. Export and import — Phase D.

Then the remaining 49 renderers, one at a time, each with a fixture that
renders the old React component and the new `.storelib` for the same instance
and compares.

## Architecture rules, and where each one lands

The forty rules the format was designed against are numbered in the brief.
Where each is honoured:

| Rule | Where |
| --- | --- |
| 1 Theme/runtime isolation | `lib/storelib-theme` imports nothing from the app; scripts see only the documented context. |
| 2 Source vs instance | Templates carry `type, settings, blocks, block_order, hidden, meta` only. |
| 3 Stable IDs | IDs are in the template JSON and survive every operation; the engine never mints one on render. |
| 4 Versioning | `schema_version` on every `.storelib`, `format_version` and `engine` on `theme.json`. |
| 5 Unknown settings | Every schema is `passthrough`; unknown keys are kept and re-emitted. |
| 6 Defaults vs saved | `resolve.ts`; templates omit defaults. |
| 7 Setting ID stability | IDs are the contract; a rename is a migration entry in the schema. |
| 8 Update safety | Source and instance are separate tables; recompiling source never touches instances. |
| 9 Draft vs published | Already the shape of `store_theme_pages`; source gets the same pair. |
| 10 Revisions | `store_theme_backups` today; file revisions in Phase C. |
| 11 Transactional AI edits | Change sets, validated whole. |
| 12 Preview sandbox | Phase D iframe; Phase A static script checks. |
| 13–15 Permissions, network, CSP | Capabilities in the schema; no `eval`; compiled bundles. |
| 16–17 Assets | `asset://<sha256>`; metadata record. |
| 18 Responsive | `"responsive": true` on a setting resolves to `{desktop, tablet, mobile}`. |
| 19–20 Tokens, inheritance | `theme.*` context; documented order in 07. |
| 21–23 Dynamic sources, bindings, context | Expression language reads paths; context is per template. |
| 24 Template compatibility | `allowed_templates` / `disabled_templates` in the schema. |
| 25–26 Section groups | `layout/theme.storelib` names group slots; templates reference groups by id. |
| 27 Extensions | Blocks may be registered by an extension id; no source rewriting. |
| 28–30 Marketplace, manifest, limits | `package.ts` validates and enforces `LIMITS`. |
| 31–33 Performance, caching, determinism | Compiled sections are cached by source hash; instance changes never recompile; same input, same output. |
| 34 Error boundaries | `StorelibSection` renders an error card in the editor and nothing in production. |
| 35–37 AI context, diffs, ownership | AI receives source, schema, tokens, controls, errors; edits are patches; files are ordinary files. |
| 38 One engine | This document. |
| 39 Docs from source | Controls reference is generated from the registry. |
| 40 Fixtures | `tests/fixtures/themes/*`. |

## Documents

- [01-folder-structure.md](01-folder-structure.md)
- [02-storelib-section-syntax.md](02-storelib-section-syntax.md)
- [03-template-format.md](03-template-format.md)
- [04-schema-format.md](04-schema-format.md)
- [05-controls-reference.md](05-controls-reference.md), generated
- [06-blocks.md](06-blocks.md)
- [07-settings-resolution.md](07-settings-resolution.md)
- [08-assets.md](08-assets.md)
- [09-scripting-api.md](09-scripting-api.md)
- [10-css-scoping.md](10-css-scoping.md)
- [11-export-import.md](11-export-import.md)
- [12-validation-and-errors.md](12-validation-and-errors.md)
- [13-versioning.md](13-versioning.md)
- [14-creating-a-section.md](14-creating-a-section.md)
- [15-creating-sections-with-ai.md](15-creating-sections-with-ai.md)
