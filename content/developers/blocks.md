# Blocks

A block is a repeatable child of a section: one question in an FAQ, one slide in a carousel, one logo in a strip, one tier on a pricing table. The section declares which block types it accepts and what settings each has. The creator then adds, removes, reorders and duplicates blocks in the builder, and the section's author writes none of that.

**Repeated content is always blocks.** Never `question_1`, `question_2`, `question_3` as settings. Numbered settings cannot be reordered, cannot grow past the number somebody guessed, and leave an empty control in the panel for every one that is not used.

## Declaring blocks

In the schema, `blocks` lists the types this section accepts:

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

`max_blocks` on the section caps the total across all types. Where each limit is held:

| Where | `limit` per type | `max_blocks` | 50 per section |
| --- | --- | --- | --- |
| The builder's Add and Duplicate buttons | yes | yes | yes |
| A connected agent's page tools | no | yes | yes |
| Saving a page, from anywhere | no | no | yes |
| Importing a theme | no | no | yes |

So `limit` and `max_blocks` shape what a creator can do in the builder, and the ceiling of 50 holds everywhere. The ceiling, with the framework's other limits:

@[limits]

A section with no `blocks` key has no block controls at all.

## Rendering blocks

`blocks` is the instance's blocks in order, each `{ id, type, settings }`, with the block type's defaults applied.

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

## How blocks are stored

In the page, as an ordered list on the section instance. A block that came with a preset stores the preset's settings for it; a block added with Add stores all of its type's defaults at that moment; and every value the creator sets is stored.

```json
"blocks": [
  { "id": "blk_8f2a", "type": "question", "settings": { "question": "Do you ship abroad?" } },
  { "id": "blk_c31d", "type": "question", "settings": {} }
]
```

- A block id is a string made when the block is created, and it never changes. Reordering changes the order of the list only; duplicating a block, or a section, gives the copy new ids. Treat an id as opaque.
- A block whose type the section no longer declares is **kept** with its settings. It is still in `blocks`, so a template that tests `block.type` draws nothing for it. Updating a section never deletes content, so the creator can decide what to do with it.
- There is no hidden block in the builder. A theme package may mark a block `"hidden": true`, and such a block is left out of `blocks`.
- An exported theme writes blocks in the portable form, `"blocks": { "blk_8f2a": { … } }` with a separate `"block_order"` array, and import converts it back. You will only meet that form inside a `.storelib-theme` file.

## Presets fill a new section

A **preset** is what Add Section offers. One that adds blocks makes the section arrive finished rather than empty:

```json
"presets": [
  {
    "name": "FAQ",
    "blocks": [{ "type": "question" }, { "type": "question" }, { "type": "question" }]
  },
  {
    "name": "Short FAQ",
    "settings": { "heading": "Quick answers" },
    "blocks": [{ "type": "question" }, { "type": "question" }]
  }
]
```

Each preset block becomes a real block with the preset's settings, if it gives any, and the block type's defaults for the rest when it is drawn. A preset that names a block type the section does not declare, or a section setting it does not declare, is a schema error. **A section with no presets is not offered in Add Section** at all; an instance already on a page keeps working, and one can still arrive by import or from an agent's page tools.

With several presets, Add Section shows one card for each, named by the preset.

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
