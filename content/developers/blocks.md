# Blocks

A block is a part of a section the creator can add, remove, reorder, duplicate and hide: one question in an FAQ, one slide, one logo, one tier on a pricing table, one picture in a grid. The section says which blocks it takes and the builder does the rest.

There are two kinds, the same two Shopify has:

| Kind | Where it is written | Who can hold it | Shopify's name |
| --- | --- | --- | --- |
| **Section blocks** | inside the section's own schema | that section only | section blocks |
| **Theme blocks** | a file of its own, `blocks/<type>.storelib` | any section, or block, that accepts it | theme blocks |

A section uses one kind or the other, never both. Section blocks are right for content that only makes sense in one place (an FAQ's questions). Theme blocks are right for the parts a page is built from (a heading, a picture, a button, a group of them), written once and used everywhere.

**Repeated content is always blocks.** Never `question_1`, `question_2`, `question_3` as settings. Numbered settings cannot be reordered, cannot grow past the number somebody guessed, and leave an empty control in the panel for every one that is not used.

## Section blocks

In the schema, `blocks` lists the types this section declares for itself. Each has a `name` and `settings`:

```json
"blocks": [
  {
    "type": "question",
    "name": "Question",
    "limit": 20,
    "settings": [
      { "type": "text", "id": "question", "label": "Question", "default": "What is your return policy?" },
      { "type": "richtext", "id": "answer", "label": "Answer", "default": "<p>Thirty days, no questions asked.</p>" }
    ]
  },
  { "type": "divider", "name": "Divider", "limit": 3, "settings": [] }
],
"max_blocks": 30
```

| Key | Meaning |
| --- | --- |
| `type` | Unique within the section and stable for ever, like a setting id. |
| `name` | What the builder calls it. |
| `settings` | The block's own settings, declared exactly like a section's. See [Schema](/developers/schema). |
| `limit` | The most of this type one section may hold. |

Draw them with a loop. `blocks` is the instance's blocks in order, each `{ id, type, settings }`, with the block type's defaults applied:

```storelib
{% for block in blocks %}
  {% if block.type == "question" %}
    <details class="faq__item" name="{{ section.id }}-faq" data-block-id="{{ block.id }}">
      <summary>{{ block.settings.question }}</summary>
      <div class="faq__answer">{{ block.settings.answer | raw }}</div>
    </details>
  {% elsif block.type == "divider" %}
    <hr data-block-id="{{ block.id }}">
  {% endif %}
{% else %}
  {% if page.in_editor %}<p class="faq__empty">Add a question</p>{% endif %}
{% endfor %}
```

- **`data-block-id="{{ block.id }}"` on each block's root** is what lets the creator click a block in the canvas to select it. Leave it out and the block can only be reached through the panel.
- Read a block's settings as `block.settings.<id>`. The id must be declared on that block type, or the template does not compile.
- The `{% else %}` branch of a `for` runs when there are no blocks. Keep an empty-state prompt behind `page.in_editor`, so it helps the creator and never reaches a visitor.
- Section blocks hold no blocks of their own. Blocks inside blocks are theme blocks.

## Theme blocks

A theme block is a `.storelib` file in `blocks/`: a template, a style and a schema, like a section, and no script. The file name is the type, so `blocks/heading.storelib` is the block `heading`.

@[library-block:heading]

Its schema:

| Key | Meaning |
| --- | --- |
| `name` | What Add block and the sidebar call it. Required. |
| `settings` | Its settings, declared exactly like a section's. A `visible_if` here reads `block.settings.<id>`. |
| `blocks` | The theme blocks it may hold: `[{ "type": "@theme" }]` for any, or types by name. Absent, it holds none. |
| `max_blocks` | The most blocks it may hold. |
| `presets` | What Add block offers for it, each a state it arrives in. See [Presets](#presets). |
| `tag` | The element wrapped round it: `div` (the default), `section`, `article`, `aside`, `figure`, `li`, `ul`, `ol`, `span`, `blockquote` or `p`. `null` for none. |
| `class` | Classes on that element, beside `sl-block`. |
| `capabilities` | `["embed"]` for a block that shows a YouTube or Vimeo player through the `embed` filter. Nothing else; a script belongs to the section. |

**A private block** is one whose file name starts with `_`, such as `blocks/_slide.storelib`. `@theme` does not offer it; only a section or block that names it (`{ "type": "_slide" }`) can hold it. That is how a slideshow keeps its slide out of every other Add block menu.

A block has no `<script>`. Its section owns the sandbox, and the section's script finds its blocks with `root.querySelectorAll('[data-block-type="heading"]')`.

These ship with every theme, and are what `@theme` offers on a new site:

@[theme-blocks]

## Accepting theme blocks

A section accepts theme blocks by listing them in `blocks` with a type and nothing else:

```json
"blocks": [{ "type": "@theme" }]
```

`@theme` is every public theme block in the theme, including the ones a creator or an agent adds later. To take only some, name them:

```json
"blocks": [{ "type": "image" }, { "type": "_slide" }]
```

A section that writes `{ "type": "@app" }` is refused: Storelib has no app blocks.

## Rendering theme blocks: content_for

```storelib
{% content_for "blocks" %}
```

draws every theme block this section holds, in the creator's order, each by its own file. Each is wrapped in its element:

```html
<div class="sl-block" data-block-id="b-k3f9" data-block-type="heading">
  <h2 class="sl-heading">…</h2>
</div>
```

`data-block-id` is what makes a click on the canvas select that block, at any depth. Style the wrapper from the parent: a row of blocks is `.row > .sl-block { flex: 1 1 0 }`.

With `"tag": null` nothing is wrapped round the block, and its template puts the attributes on its own outer element instead. The compiler refuses a `"tag": null` block that does not:

```storelib
<li class="slide" {{ block.storelib_attributes }}>…</li>
```

`content_for "blocks"` in a section whose blocks are its own is a compile error, and so is one in a section or block that accepts no blocks.

## Blocks inside blocks

A theme block that accepts blocks draws them with the same tag, in its own template. The Group block that ships is all of it:

@[library-block:group]

Inside a block's template:

| Path | Is |
| --- | --- |
| `block.settings.<id>`, or `settings.<id>` | this block's settings, checked against its schema when the file compiles |
| `block.id`, `block.type` | this block |
| `block.blocks` | the blocks it holds, in order, each `{ id, type, settings }` |
| `block.storelib_attributes` | `data-block-id` and `data-block-type`, for `"tag": null` |
| `section.settings.<id>` | the settings of whatever section it sits in, not checked, since that can be any section |
| `theme`, `scheme`, `page`, `shop`, `routes`, `customer`, `product` | the same as in the section |

Blocks nest **eight levels deep** at most, and a section holds **50 blocks** counting every level. The sidebar shows the tree: a block that holds blocks lists them in its open row, each with its own Add block.

## Static blocks

A static block is one the template places itself, at a fixed spot, instead of in the list:

```storelib
<div class="head">{% content_for "block", type: "heading", id: "title" %}</div>
<div class="grid">{% content_for "blocks" %}</div>
```

`type` and `id` are written in quotes, not worked out: the id is how the block is found again. The creator edits a static block like any other, and can hide it, but cannot move, duplicate or delete it, because the template decides where it is. Until it is edited it is drawn with its file's defaults; a preset can give it settings with `"static": true` and the same id. One template places each id once.

@[library-section:image_grid]

### A product's Details block holds its blocks

A product section is often two static blocks side by side: the pictures, and the details (title, price, options, buttons). Shopify's Horizon names them `_product-media-gallery` and `_product-details`. Whatever the section's own `{% content_for "blocks" %}` draws comes after both, full width, under the product.

So the builder keeps a rule for every theme: in a product section (one whose type says `product`, or one with a media block beside a static block called details, info or information), a block at the section's own level that the Details block can hold is moved into it, at its end. The editor does it when the page opens and after any drag or AI edit, and the website does it as it draws, so a page saved before the rule looks the same. Pictures stay where they are, and so does a block the Details block can't hold. Dragging a block out of Details to under the product isn't offered. The rule is `lib/website-builder/product-details-rule.ts`.

## Presets

A **preset** is a state a section, or a theme block, arrives in. It is written in the file, so changing what Add section adds is changing a few lines of JSON, and every preset is a card in Add section (or an entry in Add block) the moment the file saves.

Write blocks the way Shopify does, keyed by id, with their order beside them. This is the form that nests, and the one static blocks need:

```json
"presets": [
  {
    "name": "Image with text",
    "category": "media",
    "settings": { "max_width": "wide" },
    "blocks": {
      "row": {
        "type": "group",
        "settings": { "direction": "row", "gap": 40 },
        "blocks": {
          "image": { "type": "image", "settings": { "ratio": "portrait" } },
          "words": {
            "type": "group",
            "blocks": {
              "heading": { "type": "heading", "settings": { "text": "Made by hand" } },
              "button": { "type": "button" }
            },
            "block_order": ["heading", "button"]
          }
        },
        "block_order": ["image", "words"]
      }
    },
    "block_order": ["row"]
  }
]
```

The older list form still works, and may nest too:

```json
"presets": [
  { "name": "FAQ", "blocks": [{ "type": "question" }, { "type": "question" }, { "type": "question" }] }
]
```

| Key | Meaning |
| --- | --- |
| `name` | The card's title in Add section, or the entry in Add block. |
| `category` | Where Add section files this card. Absent, the section's own `category`. |
| `settings` | The section's (or block's) settings as it arrives. Each must be one it declares. |
| `blocks` | Its blocks: keyed by id with `block_order`, or a list. Each may have `settings`, `blocks` and `block_order` of its own. |
| `block_order` | The order of the keyed blocks. Every block is in it, except static ones. |
| `static` | `true` for a block the template places with `content_for "block"`. Its key is that id. |

What is refused, with the line: a block in `blocks` that is not in `block_order` and not static (it would never be drawn), an id in `block_order` with no block, a static block in `block_order`, a static block without an id, a type the owner does not accept, a setting it does not declare, and a tree deeper than eight or larger than 50.

When a preset is added, every block in it gets a new id, so adding the same preset twice gives two sets of blocks, not one shared. A static block keeps its key, because that is the id its template places it under.

**A theme block's presets** are what Add block offers for it: one entry per preset, named by the preset. The Group block's three presets ("Group", "Two columns", "Image with text") are three entries, each arriving with its blocks in it. A block with one preset, or none, is one entry under its own name.

**A section with no presets is not offered in Add Section** at all. An instance already on a page keeps working, and one can still arrive by import or from an agent's page tools.

## Limits

Where each limit is held:

| Where | `limit` per type | `max_blocks` | 50 per section, 8 deep |
| --- | --- | --- | --- |
| The builder's Add and Duplicate | yes | yes | yes |
| Ask AI and a connected agent's page tools | no | yes | yes |
| Saving a page, from anywhere | no | no | yes |
| Importing a theme | no | no | yes |

@[limits]

## How blocks are stored

In the page, as an ordered list on the section instance. A block that holds blocks carries them the same way; a static block is marked, and a hidden one too:

```json
"blocks": [
  { "id": "title", "type": "heading", "static": true, "settings": { "text": "From the studio" } },
  { "id": "b-8f2a", "type": "group", "settings": { "direction": "row" }, "blocks": [
    { "id": "b-c31d", "type": "image", "settings": {} },
    { "id": "b-77e0", "type": "text", "settings": {}, "hidden": true }
  ] }
]
```

- A block id is made when the block is created and never changes. Reordering changes the order of the list only; duplicating a block, or a section, gives the copy new ids all the way down. Treat an id as opaque.
- A block whose type nobody declares any more, or whose file was deleted, is **kept** with its settings and everything inside it. The editor shows where it was; a visitor sees nothing. Updating a section or deleting a block file never deletes content.
- A hidden block is kept and not drawn. It comes back with the eye in the sidebar.
- An exported theme writes blocks in the keyed form at every level, `"blocks": { "b-8f2a": { … } }` with `"block_order"`, the same form presets use, and import converts it back.

## Styling blocks

A theme block's `<style>` is scoped to `[data-block-type="<type>"]`, so it reaches every block of that type and nothing else. When a rule reads a setting (`{{ block.settings.gap }}`), the stylesheet is drawn once per block instead, scoped to that block in that section.

Blocks sit inside a section and take its colours: read the section's `--s-*` properties (`--s-heading`, `--s-para`, `--s-btn`, `--s-border`, `--s-radius`…) with a fallback, so the same block is right on a light scheme and a dark one. Give classes a prefix of the block's own (`sl-heading`, `card-block__title`): a section's rules reach into the blocks inside it.

### Colours a block has of its own

A block can have colours of its own, the way a section can: a `color` setting whose default names a colour of the section's scheme. Untouched, it is that colour of whichever section the block sits in, and it changes with the scheme, with the section's Advanced colors and with the theme. The creator can pick another in the block's panel, where it is a row that says **Scheme** until they do, and the reset arrow puts it back. See [Colours of the section's own](/developers/styling#colours-of-the-sections-own).

```json
{ "type": "color", "id": "color", "label": "Text color", "default": "scheme.heading" }
```

Write the colour into an inline custom property on the block's element and read it in the block's rule, with the section's property as the fallback. The rule stays one per type, so a block with its own colour needs no stylesheet of its own:

```storelib
<h2 class="sl-heading" style="--heading-color: {{ block.settings.color | default: scheme.heading }};">{{ block.settings.text }}</h2>
```

```css
.sl-heading { color: var(--heading-color, var(--s-heading, inherit)); }
```

`scheme` in a block is the section's scheme, overrides included. A custom property is inherited, so a block that can hold a block of its own type writes its property every time, even when it is empty: Group writes `--g-bg: transparent` rather than leaving a group inside a coloured group to paint the outer one's colour again.

The blocks that ship have these:

| Block | Colour settings | Default |
| --- | --- | --- |
| Heading | Text color | `scheme.heading` |
| Text | Text color | `scheme.text` |
| Button, Primary | Fill, Text, Hover fill, Hover text | `scheme.primary_button_background`, `scheme.primary_button_text`, and their hover pair |
| Button, Secondary | Fill, Text, Border, Hover fill, Hover text | `scheme.secondary_button_background`, `scheme.secondary_button_text`, `scheme.secondary_button_border`, and their hover pair |
| Group | Background, and a Corner radius | `""`, none: the section shows through |

A button's colours are shown for the style it is in and no other, with `"visible_if": "{{ block.settings.style == 'primary' }}"`. The hover colours follow the scheme's hover colours, so a button given its own fill should be given its own hover fill too.

## Products are shaped like blocks

`products` holds the creator's published products in the same `{ id, type, settings }` shape, so a card written for `blocks` works for `products` with nothing changed but the loop:

```storelib
{% for block in products %}
  <a class="card" href="{{ block.settings.url | url }}">
    {% if block.settings.image != "" %}<img src="{{ block.settings.image }}" alt="{{ block.settings.title }}">{% endif %}
    <span class="card__title">{{ block.settings.title }}</span>
    <span class="card__price">{{ block.settings.price }}</span>
  </a>
{% endfor %}
```

`price` arrives formatted, such as `$48.00`. Templates do not do money.

## From Shopify

| Shopify | Storelib |
| --- | --- |
| `blocks/heading.liquid` | `blocks/heading.storelib` |
| `"blocks": [{ "type": "@theme" }]` | the same |
| `{% content_for 'blocks' %}` | `{% content_for "blocks" %}` |
| `{% content_for 'block', type: 'heading', id: 'title' %}` | `{% content_for "block", type: "heading", id: "title" %}` |
| `{{ block.shopify_attributes }}` | `{{ block.storelib_attributes }}`, needed only with `"tag": null` |
| `blocks/_slide.liquid`, private | `blocks/_slide.storelib`, private |
| presets with `blocks` and `block_order` | the same, `static` included |
| `{% javascript %}` in a block | the section's `<script>` |
| `@app` blocks | none |
