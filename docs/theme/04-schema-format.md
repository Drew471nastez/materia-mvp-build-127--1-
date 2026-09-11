# Schema format

The `<schema>` block is JSON. It says what the section is, what a person can
change about it, what blocks it may hold, and how the Add Section list offers
it. The editor's sidebar for a section is generated from this and nothing
else: there is no per-section sidebar code.

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
    { "name": "Three features", "blocks": [{ "type": "feature" }, { "type": "feature" }, { "type": "feature" }] },
    { "name": "Feature grid", "settings": { "columns": 4 }, "blocks": [{ "type": "feature" }, { "type": "feature" }, { "type": "feature" }, { "type": "feature" }] }
  ],
  "allowed_templates": ["index", "page"],
  "capabilities": []
}
```

## Top level

| Key | Required | Meaning |
| --- | --- | --- |
| `schema_version` | no (defaults to 1) | The schema format this file is written in. A file from a newer engine is refused rather than misread. |
| `type` | yes | The section type. Must equal the file name (`sections/<type>.storelib`). |
| `name` | yes | What the editor calls it. |
| `category` | no | Groups the Add Section list. |
| `version` | no | The section's own version, for `migrations`. |
| `description`, `icon` | no | Shown in Add Section. |
| `settings` | yes | The settings, in sidebar order. Up to 120. |
| `blocks` | no | The block types this section may hold (06). |
| `max_blocks` | no | Cap across all block types. Up to 50. |
| `presets` | no | What Add Section offers. No presets means the section is not offered, only reachable through code or import. |
| `allowed_templates` / `disabled_templates` | no | Where it may be placed. One or the other, not both. |
| `capabilities` | no | What the `<script>` may reach (09). |
| `migrations` | no | Setting renames across versions: `[{ "from": "title", "to": "heading", "since": "1.1.0" }]`. |

Any key not listed is kept and written back untouched. The engine does not
strip what it does not understand.

## A setting

| Key | Meaning |
| --- | --- |
| `type` | One of the control types in 05. Nothing else. |
| `id` | Lowercase letters, digits and `_`, starting with a letter. Unique within the section. **Stable forever**: it is the key the person's content is stored under. Renaming one is a migration, not an edit. |
| `label`, `info`, `placeholder` | What the sidebar shows. |
| `default` | Must be a valid value for the type. Omitted means the control's own fallback (05). |
| `options` | Required for `select` and `radio`: `[{ "label", "value" }]`. The default must be one of them. |
| `min`, `max`, `step`, `unit` | `range` and `number`. `range` needs `min` and `max`, and `min < max`. |
| `responsive` | `true` on a type that allows it (05) makes the value `{desktop, tablet, mobile}`. |

`header`, `paragraph` and `divider` draw in the sidebar and hold no value.
They take no default.

## What the validator refuses

From `lib/storelib-theme/schema/validate.ts`, each with a path like
`settings[3].default` and the file line when it is known:

- a `type` not in the registry ("… is not a Storelib control. Use one of: …")
- a bad or duplicate `id`
- `options` missing on a select or radio; a default not among the options
- a default of the wrong type ("default "big" is not a range")
- `responsive` on a type that cannot be
- a range without `min`/`max`, or `min` not below `max`
- a preset that sets a setting or adds a block the section does not declare
- a block type declared twice; more than `LIMITS.settingsPerSchema` settings
- both `allowed_templates` and `disabled_templates`
- a `schema_version` newer than the engine

## Legacy type names

The JSON schemas the builder shipped with used `link`, `image`, `video`,
`icon`, `font`, `spacing`. They still validate and mean `url`, `image_picker`,
`video_picker`, `icon_picker`, `font_picker`, `range`. New sections should use
the canonical names.
