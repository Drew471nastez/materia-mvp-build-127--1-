# Schema

The `<schema>` block is JSON. It says what the section is, what a creator can change about it, which blocks it may hold, and how Add Section offers it. **The builder's settings panel for a section is generated from its schema and nothing else.** There is no per-section panel code to write: declare a setting and its control appears.

```json
{
  "schema_version": 1,
  "type": "features",
  "name": "Features",
  "category": "Content",
  "version": "1.0.0",
  "settings": [
    { "type": "header", "id": "hdr_content", "label": "Content" },
    { "type": "text", "id": "heading", "label": "Heading", "default": "Why us" },
    { "type": "range", "id": "columns", "label": "Columns", "default": 3, "min": 1, "max": 4, "step": 1, "responsive": true },
    { "type": "range", "id": "padding_top", "label": "Top padding", "default": 64, "min": 0, "max": 200, "step": 4, "unit": "px" },
    { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "white" }
  ],
  "blocks": [
    {
      "type": "feature",
      "name": "Feature",
      "limit": 12,
      "settings": [
        { "type": "icon_picker", "id": "icon", "label": "Icon", "default": "star" },
        { "type": "text", "id": "title", "label": "Title", "default": "Fast shipping" },
        { "type": "textarea", "id": "text", "label": "Text", "default": "" }
      ]
    }
  ],
  "max_blocks": 12,
  "presets": [
    { "name": "Three features", "blocks": [{ "type": "feature" }, { "type": "feature" }, { "type": "feature" }] }
  ],
  "capabilities": []
}
```

## Top level

| Key | Required | Meaning |
| --- | --- | --- |
| `schema_version` | no, defaults to 1 | The schema format this file is written in. A file from a newer engine is refused rather than misread. |
| `type` | yes | The section type. Must equal the file name, `sections/<type>.storelib`. |
| `name` | yes | What the builder calls it. |
| `category` | no | Groups Add Section. |
| `description`, `icon` | no | Shown in Add Section. |
| `version` | no | The section's own version, which `migrations` refer to. |
| `settings` | yes | The settings, in panel order. |
| `blocks` | no | The block types this section accepts. See [Blocks](/developers/blocks). |
| `max_blocks` | no | Cap across all block types. |
| `presets` | no | What Add Section offers. No presets means the section is not offered. |
| `allowed_templates`, `disabled_templates` | no | The pages it may be placed on, or may not. One or the other, never both. |
| `capabilities` | no | What the section may reach: `embed` for a player frame, and the script capabilities. See [JavaScript](/developers/javascript#capabilities). |
| `migrations` | no | Setting renames across versions. See [Changing a section safely](#changing-a-section-safely). |
| `supports_color_overrides`, `supports_typography_overrides` | no | Which colour and type overrides the builder offers for this section. See [Styling](/developers/styling). |

A key the engine does not recognise is kept and written back untouched. Nothing you add is stripped.

## A setting

| Key | Meaning |
| --- | --- |
| `type` | One of the control types below. Nothing else exists. |
| `id` | Lowercase letters, digits and `_`, starting with a letter, unique within the section. **Stable for ever**: it is the key the creator's content is stored under, so renaming one is a migration, not an edit. |
| `label` | What the panel shows. |
| `info` | A short line of help under the control. |
| `placeholder` | Shown in an empty text field. |
| `default` | Must be a valid value for the type. Omitted means the control's own fallback. |
| `options` | Required for `select` and `radio`: `[{ "label": "…", "value": "…" }]`. The default must be one of the values. |
| `min`, `max`, `step`, `unit` | For `range` and `number`. A range needs `min` and `max`, and `min` below `max`. |
| `responsive` | `true`, on a type that allows it, makes the value `{ desktop, tablet, mobile }`. |

`header`, `paragraph` and `divider` draw in the panel and hold no value. They take no default.

## Every control type

This list is generated from the builder's control registry, the same one the compiler validates against and the panel draws from. If a type is here, it exists; if it is not, it does not.

@[controls]

### Older type names

Early sections used different names for some types. They still validate and mean the same thing, but new sections should use the names above.

@[legacy-controls]

## How a value is resolved

A page stores only what the creator changed. Everything else is decided in one order, every time a section renders:

```text
resolved = saved value  ??  schema default  ??  control fallback
```

For a block setting, the block's saved value comes first, then the block definition's default, then the fallback. The theme is not a step in this chain: it provides tokens that a template reads directly, and never overrides a setting by name.

**Responsive values** arrive as `{ desktop, tablet, mobile }`, filled downwards. Set desktop only and tablet and mobile inherit it.

```json
saved:    { "columns": { "desktop": 4, "mobile": 1 } }
resolved: { "columns": { "desktop": 4, "tablet": 4, "mobile": 1 } }
```

Read one breakpoint in the template as `{{ settings.columns.desktop }}`, or pass all three to CSS as custom properties and pick with container queries.

**Saving strips defaults.** A value equal to the default is not stored, and a responsive value equal at every breakpoint collapses to a plain one. That keeps pages small, and it is why changing a default reaches every instance that never overrode it.

## Assets

An image, video, file or gallery setting holds an **asset reference**, `asset://<sha256>`, never a URL. By the time the template runs, the reference has been turned into the URL this account serves the file from, so you print it directly:

```storelib
{% if settings.image != "" %}
  <img src="{{ settings.image }}" alt="{{ settings.image_alt }}" width="1200" height="800">
{% endif %}
```

A reference held anywhere else goes through the `asset` filter: `{{ block.settings.clip | asset }}`. A reference the account does not have resolves to an empty string, so an empty image means "no image chosen", never an error. Because no stored page knows where bytes live, a theme moves between accounts and storage can change without a page being touched.

## Changing a section safely

Setting ids and block types are the contract between a section file and every page that uses it. An update may freely:

- add settings and block types; existing instances get the defaults,
- change defaults; instances that never overrode them follow,
- change markup and CSS.

It must not rename or remove an id without saying so. Declare the rename and the old value is read under the new name:

```json
"version": "1.1.0",
"migrations": [
  { "from": "title", "to": "heading", "since": "1.1.0" }
]
```

A removed setting's saved value is kept as an unknown key, so putting the setting back restores it.

## What the validator refuses

Each refusal names the path, such as `settings[3].default`, and the line in the file:

- a `type` that is not a control type, listing the ones that are,
- a bad or duplicate `id`,
- `options` missing on a `select` or `radio`, or a default that is not among them,
- a default of the wrong type, such as `default "big" is not a range`,
- `responsive` on a type that cannot be,
- a `range` without `min` and `max`, or with `min` not below `max`,
- a preset that sets a setting or adds a block the section does not declare,
- a block type declared twice,
- both `allowed_templates` and `disabled_templates`,
- a `schema_version` newer than the engine,
- more settings than the limit.
