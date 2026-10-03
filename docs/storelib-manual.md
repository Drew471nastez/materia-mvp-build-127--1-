# The Storelib Manual: Sections, Themes, and the Website Builder Language

This is the complete reference for how a Storelib site is built: what a theme
is made of, how a section is written, what the template language does, what a
schema may declare, how settings resolve, how colour and type are decided, and
what the editor does with all of it.

It is written for three readers. Somebody building their own sections. A
developer packaging a theme. And a model asked to write a section, which needs
the rules stated rather than implied.

Everything here describes the engine as it ships. Where something is accepted
but not yet acted on, it says so rather than pretending.

---

## 1. The model, in one page

A Storelib site is a theme. A theme is a folder of source files plus the
content a merchant put into them.

```
Theme
 ├── Design tokens        colour schemes, text styles, spacing, radius
 ├── Sections             one file per type: markup, style, script, schema
 ├── Templates            which sections a page has, in order, with settings
 └── Assets               images, video, files, addressed by content hash
```

Two words carry the whole design.

A **section** is a type. It is one file, written once, and it decides what the
markup is and which settings exist. `sections/hero.storelib` is a section.

An **instance** is one use of a section on one page, with its own settings and
its own blocks. A home page with two heroes has one section and two instances.

Change a section and every page using it changes how it works, while nobody's
content moves. Change a template and one page's content changes, while no
section changes how it works. No file does both. That split is what makes a
theme updatable without breaking the sites built on it.

### The chain of ownership

```
Theme settings          the fonts, the colour schemes, the page width
    ↓
Section schema          which settings this type has, and their defaults
    ↓
Section instance        what this merchant typed, on this page
    ↓
Local overrides         the few colours this instance chose to differ on
```

Later wins, and each level stores only what differs from the one above. A
merchant who never touched a setting follows the theme forever, including
after an update.

---

## 2. Anatomy of a section file

A section is one file ending in `.storelib`, holding up to four blocks.

```html
<template>
  <section class="hero">
    <h2 class="hero__title">{{ settings.heading }}</h2>
    {% if settings.subheading %}
      <p class="hero__sub">{{ settings.subheading }}</p>
    {% endif %}
    {% if settings.button_text %}
      <a class="hero__btn" href="{{ settings.button_url | url }}">{{ settings.button_text }}</a>
    {% endif %}
  </section>
</template>

<style>
.hero {
  background: var(--scheme-background);
  color: var(--scheme-text);
  padding: {{ settings.padding_top }}px 0 {{ settings.padding_bottom }}px;
}
.hero__title {
  color: var(--scheme-heading);
  font-size: var(--section-heading-size, 32px);
  line-height: var(--section-heading-line-height, 1.15);
  font-weight: var(--section-heading-weight, 700);
}
.hero__btn {
  background: var(--scheme-button-primary);
  color: var(--scheme-button-primary-text);
  border-radius: var(--theme-button-radius, 8px);
}
@container (min-width: 768px) {
  .hero__title { font-size: var(--section-heading-size, 44px); }
}
</style>

<schema>
{
  "schema_version": 1,
  "type": "hero",
  "name": "Hero",
  "category": "hero",
  "icon": "star",
  "supports_color_scheme": true,
  "settings": [
    { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "white" },
    { "type": "text", "id": "heading", "label": "Heading", "default": "Welcome" },
    { "type": "textarea", "id": "subheading", "label": "Subheading", "default": "" },
    { "type": "text", "id": "button_text", "label": "Button text", "default": "" },
    { "type": "url", "id": "button_url", "label": "Button link", "default": "" },
    { "type": "range", "id": "padding_top", "label": "Padding top", "min": 0, "max": 160, "step": 4, "unit": "px", "default": 64 },
    { "type": "range", "id": "padding_bottom", "label": "Padding bottom", "min": 0, "max": 160, "step": 4, "unit": "px", "default": 64 }
  ],
  "presets": [{ "name": "Hero", "settings": { "color_scheme": "white" } }]
}
</schema>
```

| Block | Required | Holds |
| --- | --- | --- |
| `<template>` | Yes | Markup, output, conditionals, loops. |
| `<style>` | No | CSS. Always scoped to this section's instances. |
| `<script>` | No | Behaviour. Checked when saved, then run in a sandbox against a copy of the section. See section 11. |
| `<schema>` | Yes | JSON: what this section is and which settings it has. |

Rules the parser enforces:

- An opening tag starts a line. A closing tag is alone on its own line. That
  is what stops a `</style>` written inside template text from ending the
  style block.
- Order is free. Two blocks of the same kind is an error naming the first
  one's line.
- Only these four tags and single-line HTML comments may appear at the top
  level.
- The file name and the schema's `type` must agree. `sections/hero.storelib`
  must declare `"type": "hero"`.

You may write `<style scoped>`. The word is accepted and ignored: a section's
CSS is always scoped, because there is no such thing here as a section rule
that is not.

---

## 3. The template language

The template block is HTML plus four things: output, conditionals, loops and
comments. It compiles to a tree, and the tree is walked. There is no `eval`
anywhere in the pipeline, which is what lets a published storefront run under
a strict content security policy and makes two renders of the same input
identical.

It looks like Liquid and it is not Liquid. The list below is the whole
language. Anything not on it does not exist.

### 3.1 Output

```html
{{ settings.heading }}
```

Always HTML escaped. The only way to emit markup is the `raw` filter, which is
for `richtext` values, because those were sanitised when they were saved.

```html
<div class="prose">{{ settings.body | raw }}</div>
```

### 3.2 Comments

```html
{# This is never rendered and never reaches the page. #}
```

`{% comment %}` does not exist and is an error. Use `{# … #}`. It may span
lines, and it works between the top-level blocks as well as inside a template.

### 3.3 Conditionals

```html
{% if settings.show_subheading and settings.subheading != "" %}
  <p>{{ settings.subheading }}</p>
{% elsif settings.show_subheading %}
  <p>No subheading yet</p>
{% else %}
  <!-- nothing -->
{% endif %}
```

It is spelled `elsif`. Not `elseif`, not `else if`. Every `{% elsif %}` must
come before the `{% else %}`.

There is no `{% unless %}`, no `{% case %}` and no `{% when %}`. Write `not`,
or write an `if` chain.

### 3.4 Loops

```html
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

The `{% else %}` branch runs when the collection is empty or is not a list at
all. That is how a section says "add a block" to the person building the page
and says nothing to a visitor.

`forloop` has exactly five properties: `index` (1 based), `index0`, `first`,
`last`, `length`. There is no `rindex` and no `parentloop`; in a nested loop
the inner `forloop` hides the outer one.

There are no loop modifiers. `limit:`, `offset:` and `reversed` are not
supported, and neither are numeric ranges: `{% for i in (1..5) %}` is a parse
error. Loop over a real list, or write the repetition out.

### 3.5 What does not exist

No assignment of any kind. No `{% assign %}`, no `{% capture %}`. Loop
variables are the only names that ever enter scope.

No `{% include %}`, `{% render %}` or `{% section %}`. A section is one file.

No whitespace control. `{%-` and `-%}` are not stripped and will be read as
part of the tag.

An unrecognised tag is a compile error naming it: `unknown tag {% assign %}`.

### 3.6 Expressions

- Literals: `"text"`, `'text'`, `12`, `1.5`, `true`, `false`, and `null`,
  `nil` or `blank`, which all mean null.
- Strings have no escape sequences. A quote inside a string ends it.
- Numbers may be negative and may have decimals. No exponents, no hex.
- Paths: `settings.heading`, `block.settings.url`, `theme.colors.primary`,
  `items[0]`, `items["key"]`. Literal indexes only. There are no computed
  lookups and no dashes in names.
- Comparisons: `==`, `!=`, `<`, `<=`, `>`, `>=`, `contains`. One comparison per
  expression: `a < b < c` is a parse error.
- Logic: `and`, `or`, `not`, and parentheses.
- Filters: `value | name: arg1, arg2`, applied left to right, at the top level
  of an expression only. `( a | upcase )` is a parse error.

There are no arithmetic operators. `+`, `-`, `*`, `/` and `%` do not exist in
an expression. Use the `plus`, `minus`, `times` and `divided_by` filters.

Things that surprise people, all of them deliberate:

- `and` and `or` return `true` or `false`, not the operand. `{{ a or b }}`
  prints "true", never the value of `a`. For a value fallback use `default`.
- `<`, `<=`, `>` and `>=` coerce to numbers. Two strings do not compare
  alphabetically; they compare as `NaN`, which is always false.
- `==` is strict, except that null equals nil, and two non-objects compare as
  strings. `1 == "1"` is true.
- `contains` is `includes` on a list and a substring test on anything else.
- `not a == b` parses as `not (a == b)`.

### 3.7 Truthiness

Falsy: `undefined`, `null`, `false`, `""`, `NaN`, and an empty list.

Truthy: everything else, including `0`, `"0"`, `"false"`, a string of spaces,
and an empty object.

### 3.8 Path lookup

A path reads plain data and nothing else. `__proto__`, `constructor` and
`prototype` are unreachable. A function is never called. A path that does not
exist is null rather than an error, so a template written against a setting
that was later removed renders empty instead of failing.

Lists expose `size`, `length`, `first`, `last` and integer indexes. Strings
expose `size` and `length`. Objects expose their own keys only.

### 3.9 Filters

All 27 of them.

| Filter | Does |
| --- | --- |
| `default: x` | `x` when the value is falsy. Note `0` is truthy and is kept. |
| `upcase`, `downcase` | Case. |
| `capitalize` | Uppercases the first character. The rest is left alone. |
| `strip` | Trims both ends. |
| `size` | Length of a list or string. Anything else is `0`. |
| `first`, `last` | First or last of a list or string. |
| `join: ", "` | Joins a list. A non-list comes back as a string. |
| `truncate: 80` | Cuts to 80 characters and appends `…`. A second argument replaces the ellipsis. |
| `append: "…"`, `prepend: "…"` | Concatenate. |
| `replace: "a", "b"` | Replaces every occurrence. Plain text, not a pattern. |
| `plus`, `minus`, `times`, `divided_by` | Arithmetic. Dividing by zero gives `0`. |
| `round: 2` | To that many decimal places. |
| `json` | JSON encode. Safe in an attribute. |
| `escape` | HTML escape. Output is already escaped, so this double-escapes. |
| `raw` | Emit unescaped. For `richtext`, `inline_richtext`, `html` and `product.description_html` only. |
| `url` | Makes a link safe. See below. |
| `embed` | Turns a video URL into a player URL. See section 11.3. |
| `asset` | Turns `asset://<hash>` into the URL this account serves it from. |
| `alpha: 0.5` | The same colour at the given alpha. Hex only. |
| `date: "short"` | A `datetime` for people to read: `long` (14 March 2026), `short`, `time`, `long_time`, `iso`. Read as written, never moved to another time zone. |
| `strip_html` | The words of some markup, on one line. For an alt text made from rich text. |
| `lines` | Each line of a text with something on it, trimmed, as a list of at most 100. For a `textarea` typed one item per line: `{% for line in block.settings.features \| lines %}`. |

`url` keeps root-relative `/…`, `http://`, `https://`, `mailto:`, `tel:` and
`#…`. Everything else becomes `#`, including a protocol-relative `//host`,
`/\host` (which a browser reads as `//host`) and a plain relative path like
`products/thing`. Put it on every `href` that comes
from a setting, including the ones you believe are internal.

`alpha` accepts `#rgb` and `#rrggbb` only. Anything else passes through
unchanged, so a scheme value that is `transparent` stays `transparent` rather
than becoming nonsense.

One trap worth knowing: a misspelled filter name is not an error. It is
ignored and the value passes through unfiltered. `{{ settings.link | ur }}`
renders the raw value with no link checking. Spell them correctly.

### 3.10 What a template can read

| Name | What it is |
| --- | --- |
| `settings.<id>` | This instance's settings, resolved: defaults applied, `asset://` turned into URLs, responsive values as `{desktop, tablet, mobile}`. |
| `blocks` | This instance's blocks in order. Each is `{ id, type, settings }`. Hidden blocks are absent. |
| `section.id`, `section.type` | This instance's id and its type. |
| `section.settings`, `section.blocks` | The same objects as `settings` and `blocks`. Write whichever reads better. |
| `theme.*` | The theme's tokens. See section 7. |
| `scheme.*` | The colour scheme this instance chose, with the instance's own overrides applied. See section 8. |
| `page.template` | `"index"`, `"product"`, `"page.about"`. |
| `page.in_editor` | True only while the builder is drawing. |
| `forloop.*` | Inside a `for`. |
| `products` | The creator's published products, newest first, shaped like blocks. |
| `shop.*` | `name`, `description`, `url`, `product_count`. |
| `creator.*` | The creator's public `name`, `headline`, `bio` and `avatar`. |
| `product.*` | On the product page: `title`, `price`, `compare_price`, `description`, `description_html`, `image`, `images`, `url`, `includes`, `id`. Empty elsewhere. |

Those eleven roots are the whole context. Reading anything else is a compile
error that says so.

`page.in_editor` is how a section shows an empty state to the person building
the page and nothing to a visitor. It is false unless something sets it, so a
surface that forgets shows the visitor's version, which is the safe way round.

### 3.11 The compiler reads your template against your schema

This is the part that catches most mistakes before anybody sees them. Every
path the template reads is held against the schema, and these are errors, not
warnings:

- `No setting is called "headin". This section declares: heading, subheading, …`
- `A section has id, type, settings and blocks. "section.colour" is always empty.`
- `"product" is not something a section can read. A section reads settings, blocks, theme, scheme, page and section.`
- `This section declares no blocks, so "block.settings.title" is always empty. Add a "blocks" list to the schema.`

And one warning, which does not stop a save:

- `The template never reads settings.unused`

A control that changes nothing is worse than no control, so take the warning
seriously.

### 3.12 What is refused in markup

Each refusal names the file and the line.

- `<script>` anywhere in the template. Behaviour goes in the script block.
- `on*=` attributes: `onclick`, `onload`, and the rest.
- `javascript:` written literally. One arriving through a setting becomes `#`
  when it passes through the `url` filter, which is why that filter is not
  optional.
- `<object>` and `<embed>`.
- `<iframe>`, unless the schema declares the `embed` capability and the src is
  written exactly as `src="{{ something | embed }}"`.
- Vue directives, by name. `v-if`, `v-for`, `v-bind:`, `@click`, `:key` and the
  rest each produce a message telling you what to write instead. A section is
  not a Vue component.
- An unclosed `{{` or `{%`, an `{% if %}` with no `{% endif %}`, an unknown
  tag, a malformed expression.

None of these are style preferences. Each one is a way for a section to become
a hole in a site that other people's customers use.

---

## 4. The schema

The schema is JSON inside the `<schema>` block. Plain JSON: no comments, no
trailing commas. It decides what the section is called, where it can go, and
which settings the editor draws.

### 4.1 Top level

```json
{
  "schema_version": 1,
  "type": "faq",
  "name": "FAQ",
  "category": "faq",
  "icon": "help-circle",
  "description": "Questions and answers, in an accordion.",
  "version": "1.2.0",
  "settings": [],
  "blocks": [],
  "max_blocks": 30,
  "presets": [],
  "allowed_templates": ["index", "page.about"],
  "capabilities": ["analytics"],
  "supports_color_scheme": true,
  "supports_color_overrides": true,
  "supports_typography_overrides": true
}
```

| Key | Required | Means |
| --- | --- | --- |
| `type` | Yes | The section's stable id. Matches the file name. Never changes. |
| `name` | Yes | What the editor calls it. 1 to 80 characters. |
| `settings` | In practice | The controls, in the order the sidebar shows them. Omitting it means none. |
| `schema_version` | No | The schema format this file is written for. Defaults to 1. |
| `language_version` | No | The template language version. Absent means 1, permanently. |
| `category` | No | Which group of the Add Section list it appears in. |
| `icon` | No | The icon beside its name. |
| `description` | No | One line under the name. |
| `version` | No | The section author's own version. |
| `blocks` | No | Repeatable children. A section without this has no block interface at all. |
| `max_blocks` | No | Total blocks allowed. Must be 50 or less. |
| `presets` | No | What Add Section produces. A section with no preset is not offered. |
| `allowed_templates` | No | Where it may be placed. Absent means anywhere. |
| `disabled_templates` | No | Where it may not. Not with `allowed_templates`. |
| `enabled_on` | No | Shopify's spelling: `{ "groups": ["header"] }`. The section groups it may sit in, `header`, `footer`, `template` or `"*"`. Absent means a page section, or the header group for `"category": "announcement"`. |
| `disabled_on` | No | The groups it may not sit in. Not with `enabled_on`. |
| `kind` | No | `"header"` or `"footer"`: the section IS the site's header or footer and replaces the built-in one. One of each per theme. |
| `capabilities` | No | What the script and the template may reach. Absent means nothing. |
| `supports_color_scheme` | No | Whether the panel offers a scheme picker. Defaults to true when a `color_scheme` setting exists. |
| `supports_color_overrides` | No | `true`, `false`, or the list of slots this section allows. |
| `supports_typography_overrides` | No | Whether the panel offers heading and body style pickers. Defaults to true. |

Unknown keys survive. A schema written for a later engine keeps everything it
carries when this one reads it. A `schema_version` newer than the engine reads
is refused with both numbers rather than misread.

### 4.2 Naming, and the id contract

| Thing | Allowed | Example |
| --- | --- | --- |
| Section `type` | Lowercase letter first, then lowercase letters, digits, `-`, `_` | `product_grid`, `faq-short` |
| Setting `id` | Lowercase letter first, then lowercase letters, digits, `_`. No hyphen | `heading`, `padding_top` |
| Block `type` | Same as section type | `question`, `slide` |

Setting ids are unique within the section's own list, and within each block's
list. A block may reuse an id the section also uses.

Ids are a contract with every page already using the section. An update may
add settings, add block types, change defaults, and change markup and CSS
freely. Instances that never overrode a default follow the new one. Instances
that did keep what they chose. An update must not rename or remove an id.

The schema accepts a `migrations` list for renames:

```json
"migrations": [{ "from": "title", "to": "heading", "since": "1.1.0" }]
```

**Be careful here.** The shape is validated and stored, and the rename is not
applied by the engine today. Saved content under the old id survives as an
unknown key, which means it is not lost, but a template reading the new id
sees the new id's default. Until that lands, treat a rename as something you
do not do.

### 4.3 Settings

Every setting is an object with `type`, `id` and usually `label`, plus
`default` and whatever extra keys its control reads.

```json
{ "type": "range", "id": "padding_top", "label": "Padding top",
  "min": 0, "max": 160, "step": 4, "unit": "px", "default": 64, "responsive": true }
```

These are all 35 control types, with what they hold, what a template sees when
nothing was set, and whether they may carry a value per breakpoint.

| Type | Holds | Default when unset | Responsive | Extra keys |
| --- | --- | --- | --- | --- |
| `text` | string | `""` | no | `placeholder` |
| `textarea` | string | `""` | no | `placeholder` |
| `richtext` | string | `""` | no | |
| `number` | number | `0` | yes | `min`, `max`, `step`, `unit`, `placeholder` |
| `toggle` | boolean | `false` | no | |
| `checkbox` | boolean | `false` | no | |
| `select` | enum | `""` | no | `options` |
| `radio` | enum | `""` | no | `options` |
| `range` | number | `0` | yes | `min`, `max`, `step`, `unit` |
| `color` | colour | `""` | no | |
| `color_scheme` | enum | `"white"` | no | |
| `color_background` | background | `""` | no | |
| `font_picker` | string | `""` | no | |
| `alignment` | enum | `"left"` | yes | |
| `inline_richtext` | string | `""` | no | `placeholder` |
| `html` | string | `""` | no | `placeholder` |
| `datetime` | string | `""` | no | |
| `focal_point` | string | `"50% 50%"` | no | `image` |
| `image_picker` | asset | `""` | no | |
| `image_gallery` | asset list | `[]` | no | `max` |
| `video_picker` | asset | `""` | no | |
| `file_picker` | asset | `""` | no | |
| `icon_picker` | string | `""` | no | |
| `url` | string | `""` | no | `placeholder` |
| `video_url` | string | `""` | no | `accept`, `placeholder` |
| `page_picker` | string | `""` | no | |
| `product_picker` | string | `""` | no | |
| `product_list` | reference list | `[]` | no | `limit` |
| `link_list` | string | `""` | no | |
| `community_picker` | string | `""` | no | |
| `collection_picker` | string | `""` | no | |
| `collection_list` | reference list | `[]` | no | `limit` |
| `header` | nothing | | no | |
| `paragraph` | nothing | | no | `content` |
| `divider` | nothing | | no | |

The last three hold no value. They organise the sidebar, they take no
`default`, and a template cannot read them.

Six older names still validate and mean the same as their current one: `link`
is `url`, `image` is `image_picker`, `video` is `video_picker`, `icon` is
`icon_picker`, `font` is `font_picker`, and `spacing` is `range`.

Five of Shopify's names are accepted for the same reason, so a section
brought across from a Shopify theme validates: `text_alignment` is
`alignment`, `product` is `product_picker`, `page` is `page_picker`,
`collection` is `collection_picker`, and `liquid` is `html` (the markup is
kept and cleaned; a Liquid tag in it is printed as text, never run).
`collection_list` is a type of its own under Shopify's name. Shopify types
with nothing to point at here (`blog`, `article`, `metaobject`,
`metaobject_list`, `color_scheme_group`) are refused with the reason.

What the newer types hold:

- `inline_richtext` is one line of formatted text: bold, italic, underline,
  links, a line break. It is rebuilt from an allow list when it is drawn, so
  nothing else survives, and it is printed with `raw`.
- `html` is markup a creator pastes. It is cleaned on save and on read against
  the custom HTML allow list: no script, no forms, frames only from known
  players. Printed with `raw`.
- `color_background` is one colour or one CSS gradient. Only colours,
  gradient functions, angles and stops pass; a value that could end the
  declaration it sits in is refused.
- `datetime` is `2026-03-14` or `2026-03-14T23:00`, with an optional zone.
  Format it with the `date` filter.
- `focal_point` is two percentages, `30% 70%`, for `object-position`. Its
  `image` key names the picture setting beside it, and the editor lets the
  creator tap the spot on that picture.
- `video_url` is a YouTube or Vimeo link. Print it through `embed`.
- `product_list` holds product ids and arrives as a list shaped like
  `products`, with live titles, prices and pictures. `limit` is 12 unless
  given, at most 24.
- `collection_picker` holds one of the creator's collection ids (Products ›
  Collections). It prints as the collection's address, `/collections/<handle>`,
  and carries `title`, `handle`, `description`, `image`, `url`,
  `products_count` and `products` (its first twelve published products,
  shaped like `products`). An id that is not a published collection of this
  creator's is empty.
- `collection_list` holds collection ids and arrives block-shaped, each
  `block.settings` carrying what a collection picker carries. `limit` is 12
  unless given, at most 24.
- `number` draws its `unit` inside the field's right edge.
- `font_picker` offers the fonts Theme settings › Typography offers, and a
  family a section picks is loaded on the page.
- `link_list` holds a menu's handle and arrives as `{ handle, title, links }`,
  each link `{ title, url, links }`, every address already made safe.
  `main-menu` is the header's own links unless a menu of that name exists.
  A menu is always this one setting, never `link_1_label` and `link_1_url`
  pairs, which compile with a warning and are refused for an agent.
- `image_picker` is drawn as the image picker with an address box under it.
  Typing an address sets the picture; choosing a file replaces the address.
  A `text` or `url` setting whose id or label names a picture (image, logo,
  photo, picture, avatar, src) and whose default is a picture's address or
  empty is READ as an `image_picker` (schema/normalise.ts): the panel draws
  the picker, the compile warns, and nothing in the file or the stored page
  changes. A value that is not an address is still drawn as it was.
- A `select` with the id `animation` and the values `theme`, `none`, `fade`,
  `fade_up` and `zoom` is the section's own entrance animation. The page reads
  it; anything but `theme` overrides the theme's animation for that section.

Every value is checked against its type as the section is drawn. A value the
type does not allow is drawn as the setting's default and kept as it was in
the stored page, so a section never draws a word in a `range`, an option its
`select` does not list, or a `javascript:` address in a `url`.

A setting that only means something in one mode says so with `visible_if`,
written the way Shopify writes it:

```json
{ "type": "product_list", "id": "chosen", "label": "Products to show",
  "visible_if": "{{ section.settings.source == 'chosen' }}" }
```

The condition is an expression of the template language inside `{{ }}`. A
section's setting reads `section.settings.<id>`; a block's setting reads its
own `block.settings.<id>` and the section's. Each is read as the page would
draw it, saved value or default. It decides only what the panel shows: a
hidden setting keeps its value and a template still reads it.

What the validator refuses:

- A type that is not one of the 35, with the list in the message.
- A `visible_if` that does not parse, reads a setting that is not declared,
  reads a block's settings from a section setting, or reads its own setting.
- A `product_list` or `collection_list` `limit` outside 1 to 24, a `video_url` `accept` naming a
  host other than `youtube` or `vimeo`, and a `focal_point` whose `image` is
  not an `image_picker` beside it.
- A `select` or `radio` with no options, or a default that is not one of them.
- `"responsive": true` on anything but `number`, `range` and `alignment`.
- A `range` without both `min` and `max`, or with `min` at or above `max`.
- A default of the wrong type for its control.
- A default on `header`, `paragraph` or `divider`.
- More than 120 settings. Block settings are counted separately.

### 4.4 Responsive settings

```json
{ "type": "range", "id": "columns", "label": "Columns", "min": 1, "max": 6, "default": 3, "responsive": true }
```

The template then receives an object with every breakpoint filled:

```html
<div style="--cols: {{ settings.columns.desktop }}; --cols-t: {{ settings.columns.tablet }}; --cols-m: {{ settings.columns.mobile }}">
```

Set desktop only and tablet and mobile inherit it. Set all three and each is
its own. The filling happens before the template runs, so a template never has
to check whether a breakpoint was set.

### 4.5 Blocks

```json
"blocks": [
  { "type": "question", "name": "Question", "settings": [
    { "type": "text", "id": "q", "label": "Question", "default": "" },
    { "type": "richtext", "id": "a", "label": "Answer", "default": "" }
  ]},
  { "type": "divider", "name": "Divider", "limit": 3, "settings": [] }
],
"max_blocks": 30
```

`limit` caps one block type and `max_blocks` caps the total. The ceiling is 50
per section, counting blocks inside blocks. A block type declared twice is an
error.

Instead of declaring its own, a section may accept THEME BLOCKS, the files in
`blocks/` (section 9.1):

```json
"blocks": [{ "type": "@theme" }]
```

or by name, `[{ "type": "image" }]`. A section does one or the other.

### 4.6 Presets

A preset is what Add Section produces. A section with no preset is not offered
in the list, which is how a section is retired without breaking the pages
already using it.

```json
"presets": [
  { "name": "FAQ", "settings": { "color_scheme": "white", "heading": "Questions" },
    "blocks": [{ "type": "question" }, { "type": "question" }, { "type": "question" }] }
]
```

A preset that sets a key which is not a setting of the section is an error, and
so is one that adds a block type the section does not declare.

For theme blocks, write the blocks the way Shopify does, keyed by id with their
order beside them, nested as deep as blocks go, with `"static": true` for a
block the template places itself and an optional `category` for where Add
section files the card:

```json
"presets": [
  { "name": "Image grid", "category": "media",
    "blocks": {
      "title":   { "type": "heading", "static": true, "settings": { "text": "From the studio" } },
      "image_1": { "type": "image" },
      "image_2": { "type": "image" }
    },
    "block_order": ["image_1", "image_2"] }
]
```

Every block that is not static is in `block_order`, or the preset is refused.
When the preset is added every block gets a new id, except a static one, whose
id is how its template finds it.

Do not bake colours into a preset. A preset that sets `bg_color` to a literal
makes the colour scheme picker do nothing on a section somebody just added, at
the moment they are most likely to try it. Name the scheme instead.

---

## 5. How a setting gets its value

Every value a template reads was decided in one order, every time.

1. Storelib's own default for that control type.
2. The section schema's `default`.
3. The instance's saved value.
4. For a block, the block instance's saved value.

Later wins. Three transformations happen on the way through so a template never
has to do them.

**Responsive.** A setting marked responsive comes out as `{desktop, tablet,
mobile}` with every breakpoint filled.

**Assets.** An `asset://…` reference in an image, video or file setting comes
out as the URL this account serves it from. The template sees a URL; the stored
data never contains one.

**Unknown keys.** A saved key the schema does not declare is passed through
untouched. A theme from a later engine, or a setting that was renamed, keeps
its data.

Saving runs the same order backwards: only what differs from the default is
written. That is what makes a later change to a default reach every instance
that never overrode it.

---

## 6. Styling a section

### 6.1 Scoping

Every section's CSS applies to that section's instances and nothing else. Two
sections that both declare `.title` do not fight, and two instances of one
section do not share a rule that reads a setting.

Given this:

```css
.hero { padding: 64px 0; }
h1 { font-size: 48px; }
:root { --gap: 16px; }
@keyframes rise { from { opacity: 0 } to { opacity: 1 } }
.hero h1 { animation: rise 400ms ease-out; }
@media (max-width: 640px) { .hero { padding: 32px 0; } }
```

the compiler emits this:

```css
[data-section-id="sec_8f2a"] .hero { padding: 64px 0; }
[data-section-id="sec_8f2a"] h1 { font-size: 48px; }
[data-section-id="sec_8f2a"] { --gap: 16px; }
@keyframes sl-hero-rise { from { opacity: 0 } to { opacity: 1 } }
[data-section-id="sec_8f2a"] .hero h1 { animation: sl-hero-rise 400ms ease-out; }
@media (max-width: 640px) { [data-section-id="sec_8f2a"] .hero { padding: 32px 0; } }
```

- Every selector is prefixed, inside `@media`, `@container`, `@supports` and
  `@layer` too.
- `html`, `body` and `:root` become the section root. A section cannot style
  the page.
- A selector starting with `&` is joined without a descendant space, so
  `&.is-open` works as you would expect.
- Keyframe names are prefixed with the section type, and every `animation` and
  `animation-name` that uses one is rewritten. Write `animation`, not
  `-webkit-animation`, or the rename will miss it.
- `@import` is refused. There is no fetching from a stylesheet.
- Over 128 KB is refused.

### 6.2 Settings in CSS

A rule can read a setting:

```css
.hero { padding: {{ settings.padding_top }}px 0 {{ settings.padding_bottom }}px; }
```

The block is scoped once at compile time, with each expression masked so the
CSS parser sees valid CSS and reports real line numbers, and the expressions
are filled per instance at render. Values are made safe for a stylesheet
rather than for HTML: `< > { } ;` and `@import` are stripped, because no
legitimate CSS value holds one.

### 6.3 Container queries, not viewport queries

This is the single most common mistake in a Storelib section.

The builder does not render its preview in an iframe. It renders the real
section inline, in the editor's own document, inside a card that is 390px wide
when somebody presses the phone button. A viewport media query asks how wide
the browser window is. The window is still 1400px. So a section built with
`@media (min-width: 768px)` shows its desktop layout inside a phone preview,
and the person building the page cannot see what their visitors will see.

Write container queries against the section's own width:

```css
.grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
@container (min-width: 768px) { .grid { grid-template-columns: repeat(3, 1fr); } }
```

Every section is given a container by the renderer, so this works with no
setup. It is also more correct on a real device, because a section in a narrow
column is narrow whatever the screen is doing.

### 6.4 Long words

One unbreakable string, a pasted URL or a long product name, will push a page
sideways. The theme sets `overflow-wrap: anywhere` on every section for that
reason. Do not undo it.

---

## 7. Theme tokens

A template reads tokens rather than raw settings, so a theme can rename a
setting without every section noticing.

```
theme.colors.{primary, secondary, accent, background, surface, text, muted}
theme.typography.{heading, body, accent}
theme.typography.styles.{h1, h2, h3, h4, body_large, body, body_small, button, caption}
theme.radius.{small, medium, large, pill}
theme.spacing.{small, medium, large, xlarge}
theme.schemes.<key>
theme.logo.{url, width, mobile_url, mobile_width, text}
theme.favicon
theme.buttons.{style, shape, radius, size, weight, shadow, hover}
theme.layout.{page_width, padding_x, section_gap, spacing_scale, card_radius, image_radius, card_shadow}
theme.animation.{enabled, style, duration, stagger}
theme.socials           the social links that are set, as shop.socials
theme.settings.*        the raw settings, for anything a token does not cover
```

`theme.logo`, `theme.buttons`, `theme.layout` and `theme.animation` are what a
Shopify section reads as `settings.logo` and the other general settings. Each
carries Theme settings' own default, so a site that never opened a panel still
has a value: `theme.logo.width` is 120, `theme.buttons.style` is `filled`.
`theme.settings.*` has only what was saved. The store's name and social links
are also `shop.name` and `shop.socials`.

The theme also compiles to CSS custom properties on the page root, which is
how a theme setting reaches a section without either side knowing about the
other:

```
--theme-page-width      --theme-padding-x       --theme-spacing-scale
--theme-radius          --theme-card-shadow     --theme-image-radius
--theme-button-radius   --theme-button-padding  --theme-button-weight
--theme-font-heading    --theme-font-body       --theme-font-accent
--theme-animation-duration                      --theme-animation-stagger
```

Use them:

```css
.wrap { max-width: var(--theme-page-width); padding-inline: var(--theme-padding-x); }
.card { border-radius: var(--theme-radius); box-shadow: var(--theme-card-shadow); }
.btn  { border-radius: var(--theme-button-radius); font-weight: var(--theme-button-weight); }
```

A section that hard codes 1230px instead of reading the page width is a section
whose merchant cannot change the page width.

---

## 8. Colour schemes and text styles

This is the part of the system that decides what a site looks like, and it
rests on one rule: a section never names a colour the theme should own.

### 8.1 What a scheme is

A theme has named colour schemes. Five ship with every theme, keyed `white`,
`light`, `dark`, `black` and `highlight`, and named Light, Soft, Dark, Brand
and Accent. A merchant can rename them, add more, and delete the ones they
added. The keys never change, which is why a section saved years ago still
resolves.

A scheme is twenty-one semantic values and an optional gradient. Each is
published as a custom property on the section's root.

| Value | Custom property |
| --- | --- |
| `background` | `--scheme-background` |
| `background_secondary` | `--scheme-background-secondary` |
| `text` | `--scheme-text` |
| `text_muted` | `--scheme-text-muted` |
| `heading` | `--scheme-heading` |
| `accent` | `--scheme-accent` |
| `link` | `--scheme-link` |
| `border` | `--scheme-border` |
| `primary_button_background` | `--scheme-button-primary` |
| `primary_button_text` | `--scheme-button-primary-text` |
| `primary_button_border` | `--scheme-button-primary-border` |
| `secondary_button_background` | `--scheme-button-secondary` |
| `secondary_button_text` | `--scheme-button-secondary-text` |
| `secondary_button_border` | `--scheme-button-secondary-border` |
| `input_background` | `--scheme-input` |
| `input_text` | `--scheme-input-text` |
| `input_border` | `--scheme-input-border` |
| `primary_button_hover_background` | `--scheme-button-primary-hover` |
| `primary_button_hover_text` | `--scheme-button-primary-hover-text` |
| `secondary_button_hover_background` | `--scheme-button-secondary-hover` |
| `secondary_button_hover_text` | `--scheme-button-secondary-hover-text` |
| `gradient` | `--scheme-gradient`, which is the background when there is none |

The four hover values are automatic until someone sets one: the primary
button's background a step darker (a step lighter when it is already near
black), the secondary
button's (or the section's, when it is transparent) moved 8% towards its
text, and each button's own text colour. A scheme or a section that changes
a button's colour and not its hover gets a hover worked out from the new
colour. `automaticHover()` in `lib/storelib-theme/color-schemes.ts`.

In a template the same values are `scheme.background`, `scheme.heading`,
`scheme.primary_button_background` and so on. Older names still read:
`scheme.bg`, `scheme.paragraph`, `scheme.primary_btn_bg` and the rest of the
legacy slot names, each derived from a semantic value.

### 8.2 A section picks one

```json
{ "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "white" }
```

That is the whole of what a section has to do. Recolour the scheme in theme
settings and every section on it changes at once, in the editor and on the
published site, because both go through one resolver.

### 8.3 Overrides

A section may override a few of the scheme's values on its own: background,
text, heading, accent, border, and the two buttons. They are stored apart from
the scheme, under `color_overrides`, so a later change to the scheme still
reaches every value the section did not touch.

In the editor this sits behind Advanced colors rather than as fifteen pickers
in everybody's face. Each slot reads "use the scheme" until it is set, and
Reset to scheme puts them all back.

### 8.3.1 Colours of the section's own

A section may declare `color` settings for colours that are not the scheme's:
review stars, a timeline's dot, the scrim over a photo. They are rows in the
section's panel, and what the creator picks there is for that section alone,
over the scheme and over Advanced colors.

The default may name a scheme colour:

```json
{ "type": "color", "id": "star_color", "label": "Stars", "default": "scheme.accent" }
```

Until the creator picks a colour, `settings.star_color` is the section's own
accent (render.ts swaps the name for the colour, after the section's
overrides are applied), so it follows the scheme and the theme. Picking one
stores its hex; the reset arrow goes back to following. Any key `scheme` has
works, semantic or legacy. An empty default means the template decides:
`{{ settings.star_color | default: scheme.accent }}`. A colour whose default
names a scheme colour and holds `""` follows the scheme too, which is what
Advanced colors leaves behind when it takes over `heading_color`,
`text_color`, `button_color` and the other older ids.

Every element a section draws gets one of these: `heading_color`
(`scheme.heading`), `text_color` (`scheme.text`), `button_color` and
`button_text_color` (the primary button's), `card_color`
(`scheme.background_secondary`), `border_color` (`scheme.border`). Untouched,
the section looks exactly like its scheme; a creator can then change one
element's colour the way Shopify's custom colours allow, without moving the
scheme every other section uses. Agents are held to it: a section they write
with no colour setting is handed back with the list of elements that need one.

### 8.4 Text styles

A theme names three fonts, heading, body and accent, and nine text styles: H1
to H4, Body large, Body, Body small, Button and Caption. Each style is a font
role, a weight, a size at desktop, tablet and phone width, a line height, a
letter spacing and a transform.

They compile to custom properties on the page root:

```
--type-h1-font   --type-h1-size    --type-h1-weight
--type-h1-line-height              --type-h1-tracking   --type-h1-transform
```

and the same for `h2`, `h3`, `h4`, `body-large`, `body`, `body-small`,
`button` and `caption`. The tablet and phone sizes take over inside container queries at
1023px and 767px, measured against the section's own container, so the phone
size is what the editor's phone preview draws.

A section does not pick fonts. It says which style its heading is and which its
body is, and the choice arrives in its CSS:

```css
.s__h {
  font-size: var(--section-heading-size, 32px);
  line-height: var(--section-heading-line-height, 1.15);
  font-weight: var(--section-heading-weight, 700);
  letter-spacing: var(--section-heading-tracking, -0.01em);
  text-transform: var(--section-heading-transform, none);
}
.s__sub {
  font-size: var(--section-text-size, 17px);
  line-height: var(--section-text-line-height, 1.6);
}
```

The fallback is what the section draws when nobody has chosen a style, so a
section written this way looks right before anyone touches it and follows the
theme after.

A section with a size control of its own should declare
`"supports_typography_overrides": false` rather than offer two controls for
one size.

### 8.5 Deleting a scheme

Deleting a scheme moves every section on it to the replacement on the page that
is open, and records the remap so a section on a page that was not open follows
the same move the next time it renders. A scheme nobody remapped falls back to
the theme's default. No section is ever left pointing at nothing.

---

## 9. Blocks

A block is a repeatable child of a section: one question in an FAQ, one slide
in a carousel, one feature in a grid. A section declares which block types it
accepts and what settings each has, and the creator adds, removes, reorders,
duplicates and hides them without the section's author writing any of that.

```html
{% for block in blocks %}
  {% if block.type == "question" %}
    <details data-block-id="{{ block.id }}">
      <summary>{{ block.settings.q }}</summary>
      <div>{{ block.settings.a | raw }}</div>
    </details>
  {% elsif block.type == "divider" %}
    <hr data-block-id="{{ block.id }}">
  {% endif %}
{% endfor %}
```

Put `data-block-id="{{ block.id }}"` on a block's root. That is what lets
somebody click a block in the preview and land on its settings.

Blocks are stored on the instance, not the section:

```json
{
  "type": "faq",
  "settings": { "heading": "Questions" },
  "blocks": {
    "blk_8f2a": { "type": "question", "settings": { "q": "Do you ship abroad?", "a": "<p>Yes.</p>" } },
    "blk_c31d": { "type": "question", "settings": { "q": "Returns?" }, "hidden": true }
  },
  "block_order": ["blk_8f2a", "blk_c31d"]
}
```

Ids are minted when the block is created and never change. Reordering changes
`block_order` only. Duplicating mints a new id.

A block whose type the section no longer declares is kept with its raw
settings and rendered by nothing. Updating a section never deletes content.

### 9.1 Theme blocks

A theme block is a file of its own, `blocks/<type>.storelib`, with a
`<template>`, a `<style>` and a `<schema>`, and no script. Any section that
accepts it can hold it, and so can another theme block. The theme ships
heading, text, button, image, video, spacer and group. A file whose name
starts with `_` is private: only a section or block that names it can hold it.

```html
<template>
<h2 class="sl-heading sl-heading--{{ block.settings.size }}">{{ block.settings.text }}</h2>
</template>
<style>
.sl-heading { margin: 0; color: var(--s-heading, inherit); }
</style>
<schema>
{ "name": "Heading",
  "settings": [{ "type": "text", "id": "text", "label": "Heading", "default": "A heading" }],
  "presets": [{ "name": "Heading" }] }
</schema>
```

A section draws the theme blocks it holds with `{% content_for "blocks" %}`.
Each is wrapped in `<div class="sl-block" data-block-id data-block-type>`
(the element is the block's `tag`, `null` for none, in which case its own
root prints `{{ block.storelib_attributes }}`). A block that accepts blocks
draws them the same way, to eight levels. `{% content_for "block", type:
"heading", id: "title" %}` places one STATIC block: edited and hidden, never
moved or deleted.

Inside a block: `block.settings`, `block.blocks`, `block.id`, and
`section.settings` for the section it sits in. Its CSS is scoped to
`[data-block-type="<type>"]`, or to the one block when a rule reads a setting.
The sidebar shows the tree, and each level has its own Add block, which lists
every block it accepts and each of a block's presets as its own entry.

A block's colours are `color` settings whose default names a colour of the
section's scheme (`"default": "scheme.heading"`): untouched they follow the
section the block is in, and a colour the creator picks wins for that block
alone. The template writes the value into an inline custom property
(`style="--heading-color: {{ block.settings.color | default: scheme.heading }};"`)
and the block's one rule reads it, with the section's `--s-*` property as the
fallback. Heading and text have a text color, button a fill, text and hover
pair for each style, and group an optional background and corner radius.

---

## 10. Assets

An asset is a binary file a theme uses. A theme refers to one by its content,
never by where it is stored:

```
asset://3f2a9c0e4b1d…        the SHA-256 of the bytes
```

That is what an `image_picker`, `video_picker`, `file_picker` or
`image_gallery` setting holds, what a template file stores, and what a package
carries. It is never a URL.

Two identical files are one asset. Changing storage or CDNs changes no
template, because no template knows where the bytes are. A package moves
between accounts because the hashes match the files in its `assets/` folder.

Settings are resolved before the template runs, so an image setting is already
a URL:

```html
<img src="{{ settings.image }}" alt="{{ settings.image_alt }}" width="1200" height="675" loading="lazy" decoding="async">
```

A reference held somewhere else goes through the `asset` filter:

```html
<video src="{{ block.settings.clip | asset }}" muted playsinline></video>
```

A reference the account does not have resolves to `""`. Treat an empty image as
"no image", never as an error.

Two rules that matter more than they look. Give every image an explicit width
and height or an aspect ratio, or the page will jump when the picture arrives.
And do not put `loading="lazy"` on the image at the top of the page: it asks
the browser to wait before fetching the one thing the page is measured on.

---

## 11. Scripts, capabilities and embeds

### 11.1 Status

A section's `<script>` is for behaviour that belongs to that section: opening a
menu, advancing a slider, submitting a form.

**Scripts are parsed and checked when saved, then run in a sandbox**, on the
published page and in the editor. The sandbox is one `<iframe sandbox="allow-scripts">`
per page, with an opaque origin, so a script cannot read the visitor's cookies,
storage or session, and cannot see the page.

Inside it, `root` is a copy of the section's own markup in a real document.
Ordinary DOM code works on it, and each change is sent to the page, checked,
and applied to the real section: classes and the attributes that describe
rather than load (`hidden`, `open`, `aria-*`, `data-*` and a few more), style
properties one at a time, and the text of an element that holds only text.
Clicks, keys and input on the real section are sent back to the copy, so the
script's own listeners run.

What does not cross: adding or removing elements, anything that loads or runs
(`src`, `href`, `action`, `on*`, a style value with `url(`), markup (text
arrives as text), and measurements, because the copy is not laid out. Scroll
with `storelib.scrollTo(element, { left, top, behavior })`.
`storelib.inEditor` is true in the editor. The page-side rules are
`lib/storelib-theme/sandbox/protocol.ts`.

Prefer HTML and CSS where they do the job alone: they work before any script
has loaded.

### 11.2 The sandbox

The bundle is wrapped as:

```js
"use strict";
(function (root, settings, blocks, theme, page, storelib) { … })
```

| Name | What it is |
| --- | --- |
| `root` | A copy of the section's markup, in the sandbox. The whole DOM the script has. |
| `settings`, `blocks`, `theme`, `page` | The same resolved data the template rendered from. |
| `storelib` | The API surface. What is on it depends on `capabilities`. |

These identifiers are refused at compile time, each with its line: `window`,
`document`, `globalThis`, `self`, `top`, `parent`, `frames`, `opener`, `eval`,
`Function`, `import`, `require`, `WebAssembly`, `fetch`, `XMLHttpRequest`,
`WebSocket`, `EventSource`, `navigator`, `sendBeacon`, `localStorage`,
`sessionStorage`, `indexedDB`, `cookie`, `location`, `history`, `postMessage`,
`Worker`, `SharedWorker`, `ServiceWorker`, `setTimeout`, `setInterval`,
`requestAnimationFrame` and `queueMicrotask`.

The check skips strings, comments and member access, so `"window"` inside a
string and `obj.window` are both fine. Only the bare identifier is refused.
The message tells you where to go instead.

A script is at most 64 KB.

### 11.3 Capabilities

Six, declared in the schema and shown in the editor.

```json
"capabilities": ["navigation", "analytics", "timers"]
```

| Capability | Grants |
| --- | --- |
| `navigation` | `storelib.navigate(path)`, a path on this site only. Ignored in the editor. |
| `commerce` | Accepted. `storelib.cart.add` and `storelib.cart.get` are not on `storelib` yet. |
| `analytics` | Accepted. `storelib.analytics.track` is not on `storelib` yet. |
| `forms` | Accepted. `storelib.forms.submit` is not on `storelib` yet; a sign-up form needs no script. |
| `timers` | Working `setTimeout`, `setInterval` and `requestAnimationFrame`. Not `queueMicrotask`, which stays out. |
| `embed` | Markup rather than script: it lets the template open one allow-listed iframe. |

An unknown capability is refused with the list of real ones. Everything a
capability exposes goes to Storelib's own endpoints for this site. A section
never gets an arbitrary host.

`embed` is the one capability that changes what the template may contain:

```html
<iframe src="{{ settings.video_url | embed }}" loading="lazy" allowfullscreen></iframe>
```

The `embed` filter accepts YouTube, Vimeo, Spotify and SoundCloud URLs and
normalises them to their player form. YouTube becomes `youtube-nocookie.com`.
Anything else returns an empty string, so an iframe whose src came from a link
the filter did not recognise renders empty rather than loading it.

---

## 12. Templates and pages

A template is a page: which section instances it has, in what order, with what
settings. A theme ships `home`, `product`, `about` and `contact`, and a creator
can add their own. A page a creator adds starts as Shopify's default page
template: the header, a `page_content` section holding the title they typed and
a rich text body, and the footer. Four more exist on every site before anybody arranges
them, generated from the home page's header and footer and one section each,
and stored like any other page once the creator opens and saves one:

| Page | Address | Its section | `page.template` |
| --- | --- | --- | --- |
| Shop | `/products` | `product_grid` reading the shop | `page.products` |
| Collections | `/collections` | `collections_grid` showing every collection | `page.collections` |
| Search | `/search` | `search` | `page.search` |
| 404 | any address the site does not have | `not_found` | `page.404` |

The 404 page is drawn inside the real 404 answer: Next's root not-found keeps
the status, and on a creator's host it fetches `/not_found` (the site's own
route, published content only) and draws the page the creator arranged in
place of the plain one. `404` is a reserved key, so `/404` is one more address
the site does not have.

The cart (`/cart`) is the site's header and footer around the visitor's cart,
and is not arranged with sections. Policy pages come from the creator's own
policies.

```json
{
  "sections": [
    { "id": "sec_1a", "type": "header", "settings": {} },
    { "id": "sec_2b", "type": "hero", "settings": { "heading": "New season", "color_scheme": "black" } },
    { "id": "sec_3c", "type": "faq", "settings": {}, "blocks": {}, "block_order": [] },
    { "id": "sec_4d", "type": "footer", "settings": {} }
  ]
}
```

A template holds no markup. A section holds no content.

The header and the footer are chrome rather than content. They sit outside the
section container, they are excluded from the theme's entrance animation, and
the heading rules that follow a section's text style leave them alone, because
a cart drawer's title is not the section's heading.

### 12.1 One header, one footer

A site has exactly one header and one footer, the built-in `header` and
`footer` sections, and they are changed, never replaced. They carry what a
section file cannot rebuild: the cart drawer and its count, the search, the
account and wishlist links, the phone menu with sub-menus, sticky and
hide-on-scroll behaviour, the transparent header over a hero, the logo from
Theme settings and the menus from Website settings.

A section file that IS a header or a footer, and does not say so with
`kind`, is refused at every door (the code editor, Ask AI, MCP, the agent
API, a GitHub push) and left out of an imported theme, with its uses taken
off the pages. It is recognised by `"group": "header"`, by its type or name
(Header, Site header, Navbar, Navigation bar, Top bar, Footer), or by an
outermost `<header>` holding a `<nav>`. The rule is
lib/storelib-theme/chrome.ts. Shopify's `enabled_on.groups` says where a
section may go, not what it is: an announcement bar with
`"enabled_on": { "groups": ["header"] }` (or `"category": "announcement"`)
sits in the header group above the header and is saved like any section.

A creator who asks for a header of their own gets ONE section whose schema
says `"kind": "header"` (or `"footer"`). It replaces the built-in one on
every page and never sits in a page's own sections. A theme holds at most one
of each kind; the save refuses a second. Its menu is a `link_list` setting
defaulting to `main-menu`, its logo an `image_picker` or `theme.logo.url`.
The schema keys are validated by lib/storelib-theme/schema/validate.ts, and
lib/storelib-theme/schema/normalise.ts (`sectionGroupsOf`) says which group
a schema belongs to.

To make a site's header look like a reference, change the real one: its
layout settings, `header_sticky_enabled` and `header_sticky_on_scroll_up`,
`header_transparent`, the icon toggles, the button, its colour scheme, and
its links as `nav_link` blocks (`label`, `url`, and `parent_id` for a
sub-link). Every setting is listed, from the file itself, on the developer
hub's page The header and footer.

A template may hold at most 60 sections.

Every storefront page fills the placeholders a creator typed into settings
(`{{ shop.name }}`, `{{ product.price }}` and the rest of the closed list in
lib/storelib-theme/dynamic.ts) on the server before a section is drawn, and
hands the engine the site's menus and the products its pickers name.

---

## 13. The editor

What a merchant sees maps directly onto what a schema declares.

- The **Add section** list is built from every section with a preset, grouped
  by `category`, with a preview of the preset rendered at the width the device
  switch is set to.
- The **sidebar** lists the sections on the page. Drag to reorder, and each row
  has hide, duplicate and delete.
- Selecting a section draws its settings in the order the schema lists them.
  `header`, `paragraph` and `divider` settings organise that list.
- **Colour** is not in that list. It is the scheme picker at the top, with the
  section's own overrides behind Advanced colors.
- **Theme settings** holds Colors and Typography, then buttons, layout,
  animations, the announcement bar, social links and the cart.
- The **code editor** opens the theme's files, with the merchant's own sections
  under `sections/`, and writes a revision on every save.

Clicking an element in the preview selects the section it belongs to, which is
what `data-section-id` and `data-block-id` are for.

---

## 14. Draft and published

Two copies of every page exist: what is live, and what is being worked on.

- Editing writes the draft.
- Publish copies the draft over the live version.
- The public site serves what was published. A page that has never been
  published shows nothing rather than showing work in progress.
- A preview link, `?preview=<token>`, renders the drafts for somebody holding
  the token, and asks search engines not to index the page. The token is per
  install, unguessable, and rotating it revokes every link already shared.
- Every save writes a revision. Restoring one writes a new revision rather than
  deleting history.

---

## 15. Packaging a theme

A theme leaves Storelib as one file and comes back the same way.

```
my-theme.storelib-theme
├── theme.json           name, version, engine requirement
├── manifest.json        every file's hash and size, every asset's metadata
├── config/settings.json the theme's own settings
├── layout/theme.storelib
├── templates/*.json
├── sections/*.storelib
├── snippets/*.storelib
├── assets/<hash>.<ext>
└── locales/*.json
```

```json
{
  "format": "storelib-theme",
  "format_version": 1,
  "name": "Workbench",
  "version": "1.2.0",
  "author": "Ada",
  "engine": { "min": 1 }
}
```

`engine.min` is the lowest engine that can render the theme. A package needing
a newer engine is refused with the number rather than misread.

The importer recomputes every hash and refuses a package whose file does not
match its name. That is a corrupted or tampered package, not a warning.

`layout/theme.storelib` is the page shell and the only place a theme may put
CSS that is not scoped to a section.

| Limit | Value |
| --- | --- |
| Package | 50 MB |
| One asset | 15 MB |
| One source file | 512 KB |
| A section's CSS | 128 KB |
| A section's script | 64 KB |
| Files per package | 2000 |
| Sections per template | 60 |
| Blocks per section | 50 |
| Settings per schema | 120 |

---

## 16. Versioning

Four things carry a version, and they move independently.

| Thing | Bumped when |
| --- | --- |
| Engine | The engine gains something a theme can require. |
| Package format | The zip layout or the manifest changes. |
| Section schema format | The schema JSON gains or changes a key. |
| A theme, and a section | The author says so. |

A file written for a newer version is refused rather than misread, and the
refusal carries both numbers. A file written for an older version is read.
Unknown keys survive every read and write, so nothing is lost in the meantime.

The template language carries its own version. A section may declare
`"language_version": 1`, and absent means 1, permanently. A section written for
a language version this engine does not read is refused with a message saying
what to do about it.

---

## 17. Errors

Nothing in the engine throws on bad input. Every function that reads a file, a
schema, a template, a stylesheet or a script returns a result.

```ts
type Result<T> =
  | { ok: true; value: T; warnings?: ThemeError[] }
  | { ok: false; errors: ThemeError[] }

interface ThemeError {
  stage: "parse" | "schema" | "template" | "css" | "script" | "package"
  message: string
  file?: string      // "sections/hero.storelib"
  line?: number      // 1 based, in that file
  column?: number
  path?: string      // "settings[3].default"
}
```

The code editor shows `file:line message`. The assistant receives the same list
and fixes its own output against it. The importer refuses a package with the
list attached. One shape, three readers.

| Stage | Refuses |
| --- | --- |
| `parse` | A malformed file: a block never closed, two of the same block, junk at the top level. |
| `schema` | Bad JSON, or a schema that breaks a rule in section 4. |
| `template` | Refused markup, an unknown tag, a malformed expression, a path that cannot exist. |
| `css` | A syntax error, `@import`, size. |
| `script` | A forbidden identifier, an unknown capability, size. |
| `package` | A hash that does not match, an engine that is too old, a limit. |

A warning is something worth knowing that the compiler cannot be sure is
wrong, such as a setting the template never reads. Warnings do not stop a save.

---

## 18. Writing a section, end to end

A testimonials section, from nothing.

**1. Decide the instance data.** A heading, and a repeatable quote with an
author, a photo and a rating. That is a few settings and one block type.

**2. Write the schema first.** It is the contract, and the markup follows it.

```json
{
  "schema_version": 1,
  "type": "quotes",
  "name": "Quotes",
  "category": "social-proof",
  "icon": "message-square",
  "supports_color_scheme": true,
  "settings": [
    { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "white" },
    { "type": "text", "id": "heading", "label": "Heading", "default": "What people say" },
    { "type": "range", "id": "columns", "label": "Columns", "min": 1, "max": 4, "step": 1, "default": 3, "responsive": true },
    { "type": "range", "id": "padding_top", "label": "Padding top", "min": 0, "max": 160, "step": 4, "unit": "px", "default": 80 },
    { "type": "range", "id": "padding_bottom", "label": "Padding bottom", "min": 0, "max": 160, "step": 4, "unit": "px", "default": 80 }
  ],
  "blocks": [
    { "type": "quote", "name": "Quote", "settings": [
      { "type": "textarea", "id": "text", "label": "Quote", "default": "" },
      { "type": "text", "id": "author", "label": "Author", "default": "" },
      { "type": "image_picker", "id": "avatar", "label": "Photo" },
      { "type": "range", "id": "stars", "label": "Rating", "min": 0, "max": 5, "step": 1, "default": 5 }
    ]}
  ],
  "max_blocks": 12,
  "presets": [
    { "name": "Quotes", "settings": { "color_scheme": "white" },
      "blocks": [{ "type": "quote" }, { "type": "quote" }, { "type": "quote" }] }
  ]
}
```

Save it as `sections/quotes.storelib`. The file name and the `type` must match.

**3. Write the markup against it.** Every setting is read, blocks carry their
id, and the empty state speaks only to the builder.

```html
<template>
  <section class="q" style="--cols: {{ settings.columns.desktop }}; --cols-t: {{ settings.columns.tablet }};">
    {% if settings.heading %}<h2 class="q__h">{{ settings.heading }}</h2>{% endif %}

    <div class="q__grid">
      {% for block in blocks %}
        <figure class="q__card" data-block-id="{{ block.id }}">
          {% if block.settings.stars > 0 %}
            <div class="q__stars" style="--filled: {{ block.settings.stars }}"
                 aria-label="{{ block.settings.stars }} out of 5">
              <span class="q__stars-on">★★★★★</span>
              <span class="q__stars-off" aria-hidden="true">★★★★★</span>
            </div>
          {% endif %}
          <blockquote class="q__quote">{{ block.settings.text }}</blockquote>
          <figcaption class="q__by">
            {% if block.settings.avatar %}
              <img class="q__avatar" src="{{ block.settings.avatar }}" alt=""
                   width="40" height="40" loading="lazy" decoding="async">
            {% endif %}
            {{ block.settings.author }}
          </figcaption>
        </figure>
      {% else %}
        {% if page.in_editor %}<p class="q__empty">Add a quote to get started</p>{% endif %}
      {% endfor %}
    </div>
  </section>
</template>
```

Note what the rating does **not** do. There is no loop over a number and no
arithmetic in the template, because the language has neither. The count goes
into a custom property and CSS draws it.

**4. Style it against the tokens.** No colour is named, no page width is
guessed, and the layout is a container query.

```html
<style>
.q {
  background: var(--scheme-background);
  color: var(--scheme-text);
  padding: calc({{ settings.padding_top }}px * var(--theme-spacing-scale, 1)) var(--theme-padding-x, 24px)
           calc({{ settings.padding_bottom }}px * var(--theme-spacing-scale, 1));
}
.q__h {
  margin: 0 0 32px;
  color: var(--scheme-heading);
  font-family: var(--section-heading-font, var(--theme-font-heading), ui-sans-serif, system-ui, sans-serif);
  font-size: var(--section-heading-size, 32px);
  line-height: var(--section-heading-line-height, 1.15);
  font-weight: var(--section-heading-weight, 700);
  text-align: center;
}
.q__grid {
  display: grid; gap: 20px; grid-template-columns: 1fr;
  max-width: var(--theme-page-width, 1230px); margin-inline: auto;
}
@container (min-width: 640px)  { .q__grid { grid-template-columns: repeat(var(--cols-t, 2), 1fr); } }
@container (min-width: 1024px) { .q__grid { grid-template-columns: repeat(var(--cols, 3), 1fr); } }
.q__card {
  margin: 0; padding: 24px;
  background: var(--scheme-background-secondary);
  border: 1px solid var(--scheme-border);
  border-radius: var(--theme-radius, 8px);
}
.q__stars { position: relative; display: inline-block; margin-bottom: 12px; letter-spacing: 2px; }
.q__stars-off { color: var(--scheme-border); }
.q__stars-on {
  position: absolute; inset: 0; overflow: hidden; white-space: nowrap;
  color: var(--scheme-accent);
  width: calc(var(--filled) / 5 * 100%);
}
.q__quote { margin: 0 0 16px; font-size: var(--section-text-size, 15px); line-height: var(--section-text-line-height, 1.6); }
.q__by { display: flex; align-items: center; gap: 10px; color: var(--scheme-text-muted); font-size: 13px; }
.q__avatar { width: 40px; height: 40px; border-radius: 999px; object-fit: cover; }
.q__empty { text-align: center; color: var(--scheme-text-muted); }
</style>
```

**5. Check it.** Add it to a page, switch the preview to phone, and read the
result rather than the intention. Then change the colour scheme in theme
settings and confirm the whole section follows.

---

## 19. Rules of thumb

For anybody writing a section, including a model asked to write one.

1. **Never name a colour the theme should own.** Read `var(--scheme-*)` or
   `scheme.*`. A literal hex in a section is a section the merchant cannot
   recolour.
2. **Never name a page width, a radius or a spacing scale.** They are theme
   tokens.
3. **Container queries, never viewport media queries.** A section is as wide as
   the column it is in.
4. **Every setting the schema declares must be read by the template**, and
   every path the template reads must be declared. The compiler checks both.
5. **Run every href through `| url`.**
6. **Give blocks `data-block-id`.**
7. **Say something in the editor when a section is empty, and nothing to a
   visitor.** That is `page.in_editor`.
8. **Do not bake colours into a preset.** Name the scheme.
9. **Ids are forever.** Do not rename one.
10. **Images get a width and a height.** And the first image on the page is not
    lazy.
11. **Check your defaults for contrast.** What a section ships with is what
    somebody sees a second after they add it, before they have touched
    anything. Body text wants 4.5:1 against its background.
12. **No arithmetic and no ranges in a template.** Push the number into a
    custom property and let CSS do the work.
13. **Prefer fewer settings.** Ten controls somebody understands beat forty
    they scroll past.

---

## 20. Reference

### Context roots

| Root | Holds |
| --- | --- |
| `settings` | This instance's settings, resolved. |
| `blocks` | This instance's blocks, in order. |
| `section` | `.id`, `.type`, `.settings`, `.blocks`. |
| `theme` | `.colors`, `.typography`, `.radius`, `.spacing`, `.schemes`, `.settings`. |
| `scheme` | The chosen scheme, with this instance's overrides applied. |
| `page` | `.template`, `.in_editor`. |
| `forloop` | `.index`, `.index0`, `.first`, `.last`, `.length`. |
| `products` | The creator's published products, block-shaped. |
| `collections` | The creator's published collections the page was handed, block-shaped. Every one on the collections page. |
| `shop` | `.name`, `.description`, `.url`, `.product_count`. |
| `creator` | `.name`, `.headline`, `.bio`, `.avatar`. |
| `product` | On the product page only: the product it shows. |

### Tags

```
{{ expression }}          output, HTML escaped
{# comment #}             never rendered
{% if %} {% elsif %} {% else %} {% endif %}
{% for x in list %} {% else %} {% endfor %}
```

That is all of them.

### Setting types

Values somebody types or picks: `text`, `textarea`, `richtext`,
`inline_richtext`, `html`, `number`, `toggle`, `checkbox`, `select`, `radio`,
`range`, `color`, `color_background`, `color_scheme`, `font_picker`,
`alignment`, `datetime`, `focal_point`.

References to something else: `image_picker`, `image_gallery`, `video_picker`,
`video_url`, `file_picker`, `icon_picker`, `url`, `page_picker`,
`product_picker`, `product_list`, `link_list`, `community_picker`,
`collection_picker`, `collection_list`.

Presentational, holding no value: `header`, `paragraph`, `divider`.

### Custom properties a section can read

```
--scheme-background            --scheme-background-secondary
--scheme-text                  --scheme-text-muted
--scheme-heading               --scheme-accent
--scheme-link                  --scheme-border
--scheme-button-primary        --scheme-button-primary-text
--scheme-button-primary-border
--scheme-button-secondary      --scheme-button-secondary-text
--scheme-button-secondary-border
--scheme-input                 --scheme-input-text   --scheme-input-border
--scheme-gradient

--section-heading-font    --section-heading-size    --section-heading-weight
--section-heading-line-height   --section-heading-tracking
--section-heading-transform
--section-text-size       --section-text-line-height

--theme-page-width    --theme-padding-x     --theme-spacing-scale
--theme-radius        --theme-card-shadow   --theme-image-radius
--theme-button-radius --theme-button-weight --theme-button-padding
--theme-font-heading  --theme-font-body     --theme-font-accent
--theme-animation-duration    --theme-animation-stagger

Written only once the creator sets the setting behind them:
--theme-input-radius  --theme-input-border-width  --theme-input-border-opacity
--theme-pill-radius   --theme-pill-border-width
--theme-product-card-radius  --theme-product-card-border
--theme-product-card-shadow  --theme-product-card-image-padding
--theme-collection-card-radius  --theme-collection-card-border
--theme-collection-card-shadow  --theme-collection-card-image-padding
--theme-container-radius  --theme-container-border  --theme-container-shadow
--theme-media-border  --theme-media-shadow
--theme-popup-radius  --theme-popup-border  --theme-popup-shadow
--theme-badge-radius  --theme-badge-top  --theme-badge-bottom
--theme-badge-left    --theme-badge-right
--theme-badge-sale-bg  --theme-badge-sale-color
--theme-badge-soldout-bg  --theme-badge-soldout-color
```

Attributes a section puts on its elements so Theme settings reach them:
`data-card="product"` or `data-card="collection"` on a card, with
`data-card-media` on its picture; `data-badges` round a card's labels and
`data-badge="sale"`, `"soldout"` or `"tag"` on each; `data-container` on a box
that holds text; `data-media` on a picture or video frame; `data-popup` on
anything that drops down or pops up; `data-variant-pill` on an option button.

### Glossary

**Section** a type, written once, in one file.
**Instance** one use of a section on one page.
**Block** a repeatable child of an instance.
**Template** a page: which instances it has, in order.
**Scheme** a named set of twenty-one colours the whole theme shares.
**Token** a value the theme owns and a section reads.
**Preset** what Add Section produces.
**Draft** what is being worked on. **Published** what visitors get.
