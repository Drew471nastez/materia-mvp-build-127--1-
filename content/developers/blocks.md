# Blocks

A block is a repeatable child of a section: one question in an FAQ, one slide in a carousel, one logo in a strip, one tier on a pricing table. The section declares which block types it accepts and what settings each has. The creator then adds, removes, reorders, duplicates and hides blocks in the builder, and the section's author writes none of that.

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

`max_blocks` on the section caps the total across all types. Both limits are enforced by the builder and by the importer, under a hard ceiling:

@[limits]

A section with no `blocks` key has no block controls at all.

## Rendering blocks

`blocks` is the instance's blocks in order, each `{ id, type, settings }`, with the block definition's defaults applied and hidden blocks already left out.

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

In the page, as an ordered list on the section instance. A block stores only the settings the creator changed.

```json
"blocks": [
  { "id": "blk_8f2a", "type": "question", "settings": { "question": "Do you ship abroad?" } },
  { "id": "blk_c31d", "type": "question", "settings": {} }
]
```

- A block id is minted when the block is created and never changes. Reordering changes the order of the list only; duplicating mints a new id for the copy.
- A block whose type the section no longer declares is **kept** with its settings and drawn by nothing. Updating a section never deletes content, so the creator can decide what to do with it.
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

Each preset block becomes a real block with a fresh id and the preset's settings, if it gives any, over the block's defaults. A preset that names a block type or a setting the section does not declare is a schema error. **A section with no presets is not offered in Add Section** at all; it can still be placed by code or by import.

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
