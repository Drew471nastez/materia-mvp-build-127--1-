# Blocks

A block is a repeatable child of a section: one feature in a features grid, one
question in an FAQ, one slide in a carousel. A section declares which block
types it accepts and what settings each has; a person adds, removes, reorders,
duplicates and hides blocks in the sidebar without the section's author
writing any of that.

## Declaring blocks

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

- `type` is unique within the section and stable forever, like a setting id.
- `limit` caps one block type; `max_blocks` caps the total. Both are enforced
  by the editor and the importer. The hard ceiling is 50 per section.
- A section without `blocks` has no block UI at all.

## Rendering blocks

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

`blocks` is the instance's blocks in `block_order`, each resolved against its
block definition, with hidden blocks left out. Put `data-block-id="{{ block.id }}"`
on a block's root so the editor can select it from the canvas.

## How blocks are stored

In the template (instance) data, not the section:

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

- Block ids are minted when the block is created and never change. Reorder
  changes `block_order` only. Duplicate mints a new id for the copy.
- A block stores only the settings the person changed.
- A block whose type the section no longer declares is **kept** with its raw
  settings and rendered by nothing. Updating a section never deletes content;
  the editor shows the orphan so the person can decide.

## Presets and blocks

A preset can add blocks so Add Section produces something worth looking at:

```json
"presets": [
  { "name": "FAQ", "blocks": [{ "type": "question" }, { "type": "question" }, { "type": "question" }] }
]
```

Each entry becomes a block with a fresh id and the preset's settings, if any.
A preset that names a block type the section does not declare is a validation
error.
