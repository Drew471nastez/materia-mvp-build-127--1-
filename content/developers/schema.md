# Schema

The `<schema>` block is JSON. It says what the section is, what a creator can change about it, which blocks it may hold, and how Add Section offers it. **The builder's settings panel for a section is generated from its schema and nothing else.** There is no per-section panel code to write: declare a setting and its control appears.

## A complete schema

This is the schema of the library's Accordion FAQ, `sections/faq_accordion.storelib`, which the library keeps as its reference section. It is read from the file itself, so it is exactly what ships:

@[library-schema:faq_accordion]

- `header` settings divide the panel into Content, Layout, Style and Spacing. They hold nothing.
- `color_scheme` has the id `color_scheme`. Keep that id: the scheme picker at the top of a section's panel writes to it.
- The questions are **blocks** of type `qa`, up to 30, each with its own three settings. See [Blocks](/developers/blocks).
- The **preset** is what Add Section places: the section with three questions already in it. Without a preset, the section is not offered at all.
- Padding is two `range` settings in pixels, so a creator can tighten a section without new code.

@[library-section:faq_accordion]

## Top level

| Key | Required | Meaning |
| --- | --- | --- |
| `type` | yes | The section type: lowercase letters, digits, `-` and `_`, starting with a letter. The file name is what counts, `sections/<type>.storelib`; keep the two the same. |
| `name` | yes | What the builder calls it, 1 to 80 characters. No two sections on a website may share a name. |
| `settings` | no, none | The settings, in panel order. At most 120. |
| `schema_version` | no, 1 | The schema format. A file asking for a newer one than the engine reads is refused rather than misread. |
| `language_version` | no, 1 | The template language the file is written in. A file that says nothing is version 1 for good. |
| `category` | no | Which group of Add Section lists it: `hero`, `products`, `features`, `content`, `social-proof`, `cta`, `media`, `about`, `faq` or `marketing`. A section you write is listed under Created, whatever it says. |
| `description` | no | Found by Add Section's search box. |
| `icon` | no | Kept. Add Section does not show it. |
| `version` | no | The section's own version. Nothing reads it yet. |
| `blocks` | no | The block types this section accepts. See [Blocks](/developers/blocks). |
| `max_blocks` | no | The most blocks in all, up to 50. |
| `presets` | no | What Add Section places. No presets means the section is not offered. |
| `capabilities` | no | What the section may reach: `embed` for a player frame, and the script capabilities. See [JavaScript](/developers/javascript#capabilities). |
| `supports_color_scheme` | no | `false` hides the scheme picker. Unset, it is shown when the schema has a `color_scheme` setting. |
| `supports_color_overrides` | no | Which colours Advanced colors offers for this section: `true`, `false`, or a list. See [Styling](/developers/styling#a-sections-own-colour-overrides). |
| `supports_typography_overrides` | no | `false` hides the Heading style and Body style controls. Shown unless it says `false`. |
| `allowed_templates`, `disabled_templates` | no | Meant to limit the pages a section may be placed on; one or the other, never both. Validated and kept. **Nothing uses them yet**: Add Section offers every section on every page. |
| `migrations` | no | Meant for renaming a setting across versions. Validated and kept. **Nothing applies them yet**; see [Changing a section safely](#changing-a-section-safely). |

A key the engine does not recognise is kept in the schema, not stripped.

## A setting

| Key | Meaning |
| --- | --- |
| `type` | One of the control types below. Nothing else exists. |
| `id` | Lowercase letters, digits and `_`, starting with a letter, unique within the section or within its block type. **Stable for ever**: it is the key the creator's content is stored under. |
| `label` | What the panel shows. |
| `info` | A short line of help under the control. |
| `placeholder` | Shown in an empty box. |
| `default` | Must be a valid value for the type. Omitted means the control's own value for nothing. |
| `options` | Required for `select` and `radio`: `[{ "label": "…", "value": "…" }]`. The default must be one of the values. |
| `min`, `max`, `step`, `unit` | For `range` and `number`. A range needs `min` and `max`, with `min` below `max`. `step` is above 0, and `unit` is at most 8 characters, such as `px`. |
| `responsive` | `true`, on a `number`, `range` or `alignment`, makes the value `{ desktop, tablet, mobile }` and puts a Desktop, Tablet, Phone switch above the control. |
| `content` | For `paragraph`: the line of help it shows. |

`header`, `paragraph` and `divider` draw in the panel and hold no value. They still need an `id`, and take no default. An id starting `hdr_` is how the library names its headers.

## Every control type

This list is generated from the builder's control registry, the same one the compiler validates against and the panel draws from. If a type is here, it exists; if it is not, it does not.

@[controls]

### Older type names

Early sections used different names for some types. They still validate and mean the same thing, but new sections should use the names above.

@[legacy-controls]

## How a value is resolved

When a section is drawn, every setting is worked out in one order:

```text
value = the value stored on this instance  ??  the schema's default  ??  the control's value for nothing
```

For a block setting, the block's stored value comes first, then the block type's default. The theme is not a step in this chain: it provides tokens a template reads directly, and never overrides a setting by name. Every value a template can read is in [Dynamic values](/developers/dynamic-values).

**What an instance stores.** A section added from Add Section stores its preset's settings. Every value the creator sets after that is stored, even one they set back to the default. A block added with the Add button stores all of its block type's defaults at that moment. So a default changed in the file reaches every instance that does not store that setting, and not the ones that do.

**Responsive values** arrive as `{ desktop, tablet, mobile }`, filled downwards. Set desktop only and tablet and mobile take it.

```json
stored: { "columns": { "desktop": 4, "mobile": 1 } }
read:   { "columns": { "desktop": 4, "tablet": 4, "mobile": 1 } }
```

The builder stores a single value while all three are the same and the object the moment they differ. Read one breakpoint in the template as `{{ settings.columns.desktop }}`, or pass all three to CSS as custom properties and choose with container queries.

## Media

An `image_picker`, `video_picker` or `file_picker` setting holds the file's **public URL**, and an `image_gallery` a list of them. An upload goes to the creator's storage and the setting is its address; a pasted link is kept as it was typed. A template prints it directly:

```storelib
{% if settings.image != "" %}
  <img src="{{ settings.image }}" alt="{{ settings.image_alt }}" width="1200" height="800" loading="lazy">
{% endif %}
```

An empty value means nothing is chosen yet, so put the element behind `{% if %}`. Give every image a width and height, or an `aspect-ratio`, so nothing moves as it loads.

**In a theme package**, the same settings hold `asset://` and the SHA-256 of the file, and the file travels in `assets/`. An import stores each file in the importing account and writes its new URL back, so on a site a setting is always a URL. See [Sharing themes](/developers/sharing-themes). The `asset` filter passes a URL through, and prints an `asset://` reference as nothing.

## Changing a section safely

Setting ids and block types are the contract between a section file and every page that uses it. An update may freely:

- add settings and block types; existing instances get their defaults,
- change defaults; instances that do not store the setting follow,
- change markup and CSS.

**Renaming or removing an id loses what was stored under it**, from the section's point of view. The value stays on each page under the old id, where the template cannot read it, and the new id starts at its default. Putting the old id back brings the value back. `migrations`, a list of `{ "from", "to", "since" }` renames, is accepted and kept, and nothing applies it yet: do not rely on it. To change what a setting is called in the panel, change its `label`; the `id` can stay.

## What the validator refuses

Each refusal names the path, such as `settings[3].default`, and the line in the file:

- a `type` that is not a control type, listing the ones that are,
- a bad or duplicate `id`,
- `options` missing on a `select` or `radio`, or a default that is not among them,
- a default of the wrong type, such as `default "big" is not a range`, or any default on a `header`, `paragraph` or `divider`,
- `responsive` on a type that cannot be,
- a `range` without `min` and `max`, or with `min` not below `max`,
- a `name` that is empty or over 80 characters,
- a block type declared twice, a block `limit` that is not a positive whole number, or `max_blocks` over 50,
- a preset that sets a setting or adds a block the section does not declare,
- both `allowed_templates` and `disabled_templates`,
- a `schema_version` or `language_version` newer than the engine,
- more than 120 settings.
