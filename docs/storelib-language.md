# The Storelib section language

A reference for writing a `.storelib` section: the file, the template
language, the schema, the CSS rules, the script sandbox, and what the
compiler will refuse.

Written against the engine in `lib/storelib-theme/`. Everything here is
checked by `tests/storelib-theme.test.ts`; where a rule has a test, it is
because the rule was once broken.

---

## 1. What a section is

A section is one file in `sections/`. Its file name is its type:
`sections/faq_accordion.storelib` is the section type `faq_accordion`, and
that is the word a page stores when somebody adds it.

A page is an ordered list of section instances. An instance is a type, an id,
its settings and its blocks. The same type can appear on a page many times;
each instance has its own id and its own settings, and its CSS is scoped to
that instance rather than to the type, so two of the same section on one page
never fight over a rule.

```
sections/faq_accordion.storelib     the section: what it is and how it draws
templates/index.json                a page: which sections, in what order
```

## 2. The file

Four blocks, each opening and closing on its own line, in any order:

```storelib
<template>
  <!-- markup, with {{ }} and {% %} -->
</template>

<style>
  /* CSS, scoped to this section */
</style>

<script>
  // optional behaviour
</script>

<schema>
  { "type": "…", "name": "…", "settings": [], "presets": [] }
</schema>
```

| Block | Required | Holds |
| --- | --- | --- |
| `<template>` | yes | the markup |
| `<style>` | no | CSS for this section. `<style scoped>` means the same thing |
| `<script>` | no | behaviour, in a sandbox |
| `<schema>` | yes | JSON: the settings, blocks and presets |

A block's closing tag must start its own line. That is what lets a template
contain the text `</style>` without ending the style block.

The file is at most 512 KB. Anything at the top level that is not one of the
four blocks is refused with the line it is on.

## 3. The template language

Three forms. `{{ … }}` prints a value, `{% … %}` is a tag, and `{# … #}` is
a comment that is read and thrown away. A comment may sit above the blocks at
the top of the file, which is where a section explains itself; an HTML comment
would have been sent to every visitor instead.

**This is not Vue, React or Liquid-with-extras.** `v-if`, `v-for`, `@click`,
`:class` and the rest are refused by name, with the line and what to write
instead, because an HTML parser would otherwise accept them as oddly named
attributes and the section would render every branch at once and do nothing on
click.

Output is HTML-escaped. There is no `eval` anywhere in the engine: a template
is parsed once into a tree and that tree is walked. A section cannot reach
the page, the server, another section, or anything not handed to it.

### What a template can read

| Name | What it is |
| --- | --- |
| `settings.<id>` | this instance's settings, by the ids the schema declares |
| `blocks` | this instance's blocks, in order |
| `section.id` | the instance's id, unique on the page |
| `section.type` | the section's type |
| `section.settings` | the same as `settings` |
| `section.blocks` | the same as `blocks` |
| `theme` | the theme's own settings: `theme.typography.heading`, colours, spacing |
| `scheme` | the colours of the colour scheme this section is set to |
| `page.template` | `"index"`, `"product"`, `"page.about"` |
| `page.in_editor` | true only while the builder is drawing |
| `forloop` | inside a `{% for %}`: `.index`, `.index0`, `.first`, `.last`, `.length` |

`settings` and `section.settings` are the same object, as are `blocks` and
`section.blocks`. Write whichever reads better.

`page.in_editor` is the one sanctioned difference between the editor and a
published page. A section with no blocks yet has to tell the person adding
them and say nothing at all to a visitor:

```storelib
{% for block in blocks %}
  …
{% else %}
  {% if page.in_editor %}<p>Add questions in the sidebar</p>{% endif %}
{% endfor %}
```

Everything else about a render is identical on both surfaces, which
`tests/storelib-parity.test.ts` holds them to across every section in the
library.

### Tags

```storelib
{% if settings.heading %} … {% elsif settings.eyebrow %} … {% else %} … {% endif %}

{% for block in blocks %}
  <p>{{ block.settings.question }}</p>
{% else %}
  <p>Nothing here yet.</p>
{% endfor %}
```

`{% for %}`'s `{% else %}` runs when the list is empty. `{% unless %}` does
not exist; write `{% if not … %}`.

### Operators

`==` `!=` `<` `<=` `>` `>=` `and` `or` `not` `contains`.

`blocks.size` is the length of a list; so is `.length`. `.first` and `.last`
read the ends of a list or a string.

### Filters

`{{ value | filter }}`, chainable. An argument follows a colon:
`{{ settings.heading | default: "Welcome" | upcase }}`.

| Filter | Does |
| --- | --- |
| `default: "…"` | the fallback when the value is empty |
| `url` | makes a link safe: refuses `javascript:` and other schemes |
| `asset` | turns `asset://name.jpg` into this account's real URL |
| `alpha: 0.4` | a colour with opacity |
| `embed` | the only way a URL may reach an `<iframe>` |
| `upcase` `downcase` `capitalize` `strip` | text |
| `append: "…"` `prepend: "…"` `replace: "a", "b"` `truncate: 40` | text |
| `size` `first` `last` `join: ", "` | lists |
| `plus` `minus` `times` `divided_by` `round` | numbers |
| `json` | the value as JSON, for a data attribute |
| `escape` | escape again; output is already escaped |
| `raw` | do NOT escape. Richtext settings only |

`raw` is the one that can put markup on a page, so it is the one to be
deliberate about. It exists for `richtext` settings, which are sanitised when
they are saved.

### `<iframe>`

Refused, unless the schema declares the `embed` capability **and** the src is
written `src="{{ settings.video | embed }}"`. `embed` only passes URLs on a
known list of players. A section that shows somebody else's player says so in
its schema.

## 4. The schema

JSON. It is what the sidebar is built from, so a setting that is not declared
has no control, and a control you want is a setting you declare.

```json
{
  "type": "faq_accordion",
  "name": "Accordion FAQ",
  "category": "faq",
  "description": "Questions that open one at a time",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Questions" },
    { "type": "select", "id": "align", "label": "Header alignment",
      "options": [{ "value": "left", "label": "Left" }, { "value": "center", "label": "Center" }],
      "default": "left" }
  ],
  "blocks": [
    { "type": "item", "name": "Question", "limit": 25, "settings": [
      { "type": "text", "id": "question", "label": "Question" },
      { "type": "richtext", "id": "answer", "label": "Answer" }
    ] }
  ],
  "presets": [
    { "name": "Accordion FAQ", "settings": { "align": "center" },
      "blocks": [{ "type": "item" }, { "type": "item" }] }
  ],
  "capabilities": [],
  "allowed_templates": ["index", "page"]
}
```

`language_version` says which version of this language the file is written in.
A file that says nothing is version 1, permanently, rather than "whatever is
current": that default is the promise that an existing valid file never
changes behaviour under a newer engine. A file naming a version this Storelib
does not have is refused rather than guessed at.

`type` must match the file name. `presets` are how the section first appears
when it is added; one preset is one card in the Add Section library, so a
section with two presets is offered twice, each with its own preview. A
section with no preset is not offered at all, which is how a section is
retired without breaking the pages already using it.

### Setting types

Values somebody types or picks:

`text` `textarea` `richtext` `number` `toggle` `checkbox` `select` `radio`
`range` `color` `color_scheme` `font_picker` `alignment`

Values that are references to something else:

`image_picker` `image_gallery` `video_picker` `file_picker` `icon_picker`
`url` `page_picker` `product_picker` `community_picker`

Presentational, holding no value:

`header` `paragraph` `divider`

The presentational three draw nothing on the page. They organise the sidebar.

Every type, every option it takes and the shape of the value it stores is in
`docs/theme/05-controls-reference.md`, which is generated from the registry
the sidebar itself reads, so it cannot drift from what the editor shows.

### Blocks

Blocks are the repeatable part of a section: FAQ entries, slides, logos. The
schema declares the block types and their settings; the instance holds the
blocks somebody actually added, in the order they dragged them. `limit` caps how many of that
kind, and `max_blocks` caps how many in total; both are enforced when a block
is added or duplicated, not only described. A block's own id is `block.id`, which is worth putting on the
element if the script needs to find it.

## 5. CSS

A section's `<style>` is scoped to the instance. Every selector is rewritten
to sit under `[data-section-id="…"]`, so the section's rules reach that
section and nothing else. Two instances of the same section on one page get
two stylesheets, one per id, and neither can reach the other.

```css
.faq__q::after { content: "+"; }
```
becomes
```css
[data-section-id="sec-1"] .faq__q::after { content: "+"; }
```

All of this survives scoping, and each is covered by a test:

- pseudo-elements and pseudo-classes, `::after`, `:hover`, `::-webkit-details-marker`
- attribute selectors, including `[open]` on `<details>`
- `@media`, whose inner rules are scoped and whose condition is left alone
- `@keyframes`, renamed to `sl-<type>-<name>` so two sections cannot collide
  on an animation name, with every `animation` that uses it renamed to match
- `@supports`, `@container`

A rule can read a setting: `padding: {{ settings.pad }}px;`. The value is
filtered, so `<`, `>`, `{`, `}`, `;` and `@import` cannot get through. A
setting can size a rule but cannot write one.

Page-wide CSS belongs in `layout/theme.storelib`, whose `<style>` is global
on purpose. That is the only place it is.

## 6. Script

Optional, sandboxed, and given exactly one thing: `root`, the section's own
element. No `window`, no `document`, no `fetch`, no timers unless the schema
declares the capability.

```js
export default function (root) {
  root.querySelectorAll("details").forEach((d) => { /* … */ })
}
```

Capabilities are declared in the schema and checked at compile time:
`navigation`, `commerce`, `analytics`, `forms`, `timers`, `embed`. A script
that calls something it has not declared does not compile.

Most sections need no script. `<details>` and `<summary>` give an accordion
that opens and closes with no JavaScript at all, and works before any script
has loaded.

## 7. What the compiler refuses

A file that does not compile is not saved. Every error carries the file and a
1-based line in that file, including errors inside the schema's JSON, which
are mapped back to the line of the `.storelib` file rather than of the JSON.

**Names are checked against the schema.** `{{ settings.headng }}` is a legal
expression that can only ever be empty, and a section built out of those
renders as a shell: markup there, CSS there, every word missing. So the
compiler reads every name the template reads and holds it against the schema:

```
sections/faq.storelib:4 No setting is called "headng". This section declares: heading, eyebrow.
sections/faq.storelib:7 This section reads its blocks but declares none, so the list is always empty.
sections/faq.storelib:9 No block setting is called "q". This section's blocks have: question, answer.
sections/faq.storelib:3 "product" is not something a section can read. A section reads settings, blocks, theme, scheme, page and section.
```

A declared setting that happens to be empty is not an error. That is a
section nobody has typed into yet.

Also refused: a second block of the same kind, an unclosed block, a missing
`<template>` or `<schema>`, a `type` that disagrees with the file name, an
`<iframe>` without the capability, a script calling something undeclared, and
a name another section already has.

## 8. Where a section is drawn

Once per surface, from the same pure function.

A **published page** compiles on the server and sends finished HTML and CSS.
The visitor's browser never receives the compiler.

The **editor** compiles on every keystroke, in the browser, so the canvas is
the section as it is being written.

Both call `renderSection`, so they cannot disagree. A section that does not
compile renders nothing on a published page, which is a gap rather than a
broken storefront, and renders a card naming the file and the line in the
editor, where somebody can fix it.

## 9. Writing one

In the website builder, open the code editor, **New file**, and type a name.
The folder and the extension are fixed; what you type is the name. The
starter that appears is a section that compiles, so you can add it to a page
before changing a word of it.

Save compiles first. If it does not compile, nothing is stored and the errors
appear against their lines. If it does, the canvas reloads and the section is
in the Add Section library under **Created by you**, with a preview drawn
from the file you just wrote.

`docs/theme/14-creating-a-section.md` walks through one from an empty file.
