# Template format

The `<template>` block is HTML plus three things: output, conditionals and
loops. It is compiled to a tree and the tree is walked; there is no `eval`
anywhere in the pipeline, which is what lets the storefront run under a strict
CSP and makes rendering deterministic.

```html
<h2>{{ settings.heading }}</h2>

{% if settings.show_subheading and settings.subheading != "" %}
  <p>{{ settings.subheading }}</p>
{% elsif settings.show_subheading %}
  <p>{{ "No subheading yet" }}</p>
{% else %}
  <!-- nothing -->
{% endif %}

<ul>
{% for item in blocks %}
  <li class="{% if forloop.first %}is-first{% endif %}">
    {{ forloop.index }}. {{ item.settings.title | upcase }}
  </li>
{% else %}
  <li>Add an item</li>
{% endfor %}
</ul>
```

## Output: `{{ expression }}`

Always HTML-escaped. The only way to emit markup is the `raw` filter, which is
for `richtext` values that were sanitised on the way in.

## Expressions

- Literals: `"text"`, `'text'`, `12`, `1.5`, `true`, `false`, `null`.
- Paths: `settings.heading`, `block.settings.url`, `theme.colors.primary`,
  `items[0]`, `items["key"]`. Only literal indexes; no computed lookups.
- Comparisons: `==`, `!=`, `<`, `<=`, `>`, `>=`, `contains`.
- Logic: `and`, `or`, `not`, parentheses.
- Filters: `value | name: arg1, arg2`, chained left to right.

A path reads plain data only. `__proto__`, `constructor` and `prototype` are
unreachable, a function is never called, and a missing path is `null`, not an
error. Arrays expose `.size`, `.first`, `.last`.

## Context: what a template can read

| Name | What it is |
| --- | --- |
| `settings.*` | This instance's settings, resolved: defaults applied, `asset://` turned into URLs, responsive values as `{desktop, tablet, mobile}`. |
| `blocks` | This instance's blocks in order; each is `{ id, type, settings }`. Hidden blocks are absent. |
| `theme.colors.*`, `theme.typography.*`, `theme.radius.*`, `theme.spacing.*`, `theme.schemes.*`, `theme.settings.*` | The theme's tokens (07). |
| `scheme.*` | The colour scheme this instance chose, resolved: `scheme.bg`, `scheme.heading`, `scheme.paragraph`, `scheme.border`, `scheme.text`. |
| `page.template`, `page.*` | Which template this section is on, and what that page is about (product, collection…). |
| `section.id`, `section.type` | This instance. For scoping; not for inventing ids. |
| `forloop.index`, `index0`, `first`, `last`, `length` | Inside a `for`. |

## Filters

| Filter | Does |
| --- | --- |
| `default: x` | `x` when the value is null, `""`, or `false`. |
| `upcase`, `downcase`, `capitalize`, `strip` | Strings. |
| `size`, `first`, `last`, `join: ", "` | Arrays and strings. |
| `truncate: 80`, `append: "…"`, `prepend: "…"`, `replace: "a", "b"` | Strings. |
| `plus`, `minus`, `times`, `divided_by`, `round` | Numbers. |
| `json` | JSON-encode, escaped for an attribute. |
| `escape` | HTML-escape (already the default for output). |
| `raw` | Emit unescaped. `richtext` only. |
| `url` | Keep `/…`, `http(s)://`, `mailto:`, `tel:`, `#…`; anything else becomes `#`. |
| `asset` | `asset://<hash>` → the URL this account serves it from. |
| `alpha: 0.5` | A colour with the given alpha. |

## What is refused at compile time

- `<script>` anywhere in the template. Behaviour goes in the `<script>` block.
- `on*=` attributes (`onclick`, `onload`…).
- `javascript:` URLs written literally. One arriving through a setting is
  turned into `#` by the `url` filter.
- `<iframe>`, `<object>`, `<embed>`.
- An unclosed `{{` or `{%`, an `{% if %}` without `{% endif %}`, an unknown
  tag, an unknown filter, a malformed expression.

Each refusal names the file and the line.

## Reading a template from code

```ts
import { compileTemplate, renderTemplate } from "@/lib/storelib-theme"

const t = compileTemplate(source, { file: "sections/x.storelib", line: 2 })
if (t.ok === true) {
  const html = renderTemplate(t.value, ctx) // ctx: RenderContext
}
```
