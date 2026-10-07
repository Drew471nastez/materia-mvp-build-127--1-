# The `.storelib` section file

One file describes one section type completely: how it looks, how it is
styled, what it does, and what a person can change about it. Four blocks, in
any order, at most one of each.

```html
<template>
  <section class="notice notice--{{ settings.tone }}">
    <p>{{ settings.message }}</p>
    {% if settings.link_url != "" %}
      <a href="{{ settings.link_url | url }}">{{ settings.link_text }}</a>
    {% endif %}
  </section>
</template>

<style scoped>
.notice { padding: 16px 24px; font: 500 14px/1.4 var(--font-body); }
.notice--info { background: {{ theme.colors.surface }}; }
.notice--warn { background: #fff7ed; color: #9a3412; }
</style>

<script>
root.querySelector("a")?.addEventListener("click", () => {
  storelib.analytics.track("notice_click", { tone: settings.tone })
})
</script>

<schema>
{
  "type": "notice",
  "name": "Notice bar",
  "category": "Promotion",
  "capabilities": ["analytics"],
  "settings": [
    { "type": "text", "id": "message", "label": "Message", "default": "Free shipping on orders over $50" },
    { "type": "select", "id": "tone", "label": "Tone", "default": "info",
      "options": [{ "label": "Info", "value": "info" }, { "label": "Warning", "value": "warn" }] },
    { "type": "text", "id": "link_text", "label": "Link text", "default": "" },
    { "type": "url", "id": "link_url", "label": "Link", "default": "" }
  ],
  "presets": [{ "name": "Notice bar" }]
}
</schema>
```

## The four blocks

| Block | Required | What it is | Documented in |
| --- | --- | --- | --- |
| `<template>` | yes | The markup, in the template language. | 03 |
| `<style>` | no | CSS that applies to this section's instances only. `scoped` is accepted and means the same. | 10 |
| `<script>` | no | Behaviour, run against the section's root. | 09 |
| `<schema>` | yes | JSON: the section's identity, settings, blocks, presets. | 04 |

## Rules the parser enforces

- An opening or closing tag counts only when it starts a line. `</style>`
  inside a template string is text, not the end of the style block.
- A second `<template>` (or any block) is refused: "A second `<template>`
  block; the first is on line 12. A section has one of each."
- A block that is never closed is refused at the line it opened.
- A file without `<template>` or `<schema>` is refused: "A section needs a
  `<schema>` block".
- `<style>` and `<style scoped>` mean the same thing in a section: both are
  scoped to the section. There is no way to write a section rule that is not,
  so the word is optional. Global CSS lives in `layout/theme.storelib`.
- The file is at most 5000 KB (`LIMITS.sourceBytes`).

Every error carries the file path and a 1-based line in that file, including
errors inside the schema's JSON, which are mapped from the JSON's line to the
file's line before they are reported.

## Reading the file

`parseStorelib(source, file)` in `lib/storelib-theme/storelib/parse.ts`
returns the four blocks with the line each one's content begins on.
`compileSection(source, { file })` in `storelib/compile.ts` runs the whole
pipeline: parse, schema JSON, schema validation, template, CSS scoping, script
check. It returns either a `CompiledSection` or a list of `ThemeError`s; it
never throws on a bad file.

```ts
import { compileSection } from "@/lib/storelib-theme"

const r = compileSection(source, { file: "sections/notice.storelib" })
if (r.ok === false) {
  for (const e of r.errors) console.log(`${e.file}:${e.line} [${e.stage}] ${e.message}`)
}
```
