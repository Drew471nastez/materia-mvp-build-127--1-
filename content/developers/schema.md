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
| `blocks` | no | The block types this section declares, or the theme blocks it accepts: `[{ "type": "@theme" }]`. See [Blocks](/developers/blocks). |
| `max_blocks` | no | The most blocks in all, up to 50. |
| `presets` | no | What Add Section places: its settings and its blocks, keyed by id with `block_order`, nested as deep as blocks go, with an optional `category`. No presets means the section is not offered. |
| `capabilities` | no | What the section may reach: `embed` for a player frame, and the script capabilities. See [JavaScript](/developers/javascript#capabilities). |
| `supports_color_scheme` | no | `false` hides the scheme picker. Unset, it is shown when the schema has a `color_scheme` setting. |
| `supports_color_overrides` | no | Which colours Advanced colors offers for this section: `true`, `false`, or a list. See [Styling](/developers/styling#a-sections-own-colour-overrides). |
| `supports_typography_overrides` | no | `false` hides the Heading style and Body style controls. Shown unless it says `false`. |
| `allowed_templates`, `disabled_templates` | no | Meant to limit the pages a section may be placed on; one or the other, never both. Validated and kept. **Nothing uses them yet**: Add Section offers every section on every page. |
| `enabled_on`, `disabled_on` | no | Which section groups it may sit in, the usual spelling: `{ "groups": ["header"] }`. The groups are `header`, `footer`, `template` (the page's own sections) and `overlay` (what floats over every page), or `"*"` for the header, page and footer. One or the other, never both. Unset, a section is a page section, and one with `"category": "announcement"` belongs to the header group. See [Where a section may go](#where-a-section-may-go). |
| `kind` | no | `"header"` or `"footer"`: this section IS the site's header or footer, and replaces the built-in one on every page. Only for a creator who asked for one of their own; at most one of each per theme. See [The header and footer](/developers/header-and-footer#a-header-of-your-own). |
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
| `visible_if` | When the panel shows the setting, such as `"{{ section.settings.source == 'chosen' }}"`. See [Showing a setting only when it matters](#showing-a-setting-only-when-it-matters). |
| `limit` | For `product_list` and `collection_list`: how many it holds, 1 to 24. 12 unless set. |
| `unit` | For `number` and `range`: the unit shown beside the value, such as `px`, `%` or `s`. |
| `accept` | For `video_url`: the hosts it takes, from `["youtube", "vimeo"]`. Both unless set. |
| `image` | For `focal_point`: the id of the `image_picker` beside it, which the creator taps to choose the spot. |

`header`, `paragraph` and `divider` draw in the panel and hold no value. They still need an `id`, and take no default. An id starting `hdr_` is how the library names its headers.

### Choosing the type

Pick the type by what the value is, because the type decides the control the creator gets:

| The value is | Type | The creator gets |
| --- | --- | --- |
| A picture: a logo, a photo, an avatar, a background | `image_picker` | The image picker, with an address box under it. Choosing a file replaces a typed address. |
| Where something links to | `url` | The link picker: a page, a product, a section on the page, or any address. |
| One of the creator's collections | `collection_picker` | Their collections with a picture and a product count, and a search box. |
| Several collections, in an order | `collection_list` | The same list, with Add collection, Up, Down and Remove. |
| A size, a count, a time | `number` with `unit`, or `range` | A number box with the unit inside it, or a slider. |
| Alignment of text | `alignment` (`text_alignment` is read as this) | Left, centre and right. |
| A font for one part of the section | `font_picker` | The fonts Theme settings offers, each in its own face. The page loads the one picked. |
| Markup pasted from another service | `html` (`liquid` is read as this) | A code box. Scripts, forms and unknown frames are removed. |
| A list of links: a menu, a nav, footer links | `link_list` | A choice of the site's menus. See [Menus](/developers/dynamic-values#menus). |
| A colour of one element | `color` with `"default": "scheme.<name>"` | A colour row that follows the scheme until they pick one. See [Styling](/developers/styling#a-colour-setting-for-each-element). |
| Words | `text`, `textarea`, `inline_richtext`, `richtext` | A box to type in. |

**A picture declared as `text` or `url` is read as a picture.** When a setting's id or label names a picture (image, logo, photo, picture, avatar, src) and its default is a picture's address or empty, the engine treats it as an `image_picker`: the panel draws the picker with the address box under it, and the compile says so as a warning. The file is not changed and neither is anything stored under the setting: an address saved while it was a text box is the picture, and a word typed there is still drawn as it was. Declare it as `image_picker` to make the warning go away. An agent's file that does this is refused until it does.

**A menu typed out as pairs** (`link_1_label`, `link_1_url`, `link_2_label`...) compiles, with a warning that names `link_list`, and an agent's file that does it is refused.

### A section's own animation

A section enters the page the way Theme settings, Animations says. A section that needs its own declares a `select` with the id `animation`:

```json
{ "type": "select", "id": "animation", "label": "Animation", "default": "theme",
  "options": [
    { "label": "Theme default", "value": "theme" },
    { "label": "None", "value": "none" },
    { "label": "Fade", "value": "fade" },
    { "label": "Fade up", "value": "fade_up" },
    { "label": "Rise", "value": "rise" },
    { "label": "From the left", "value": "slide_right" },
    { "label": "From the right", "value": "slide_left" },
    { "label": "Zoom", "value": "zoom" },
    { "label": "Blur in", "value": "blur" }
  ] }
```

`theme` follows the theme. Any other value **overrides the theme's animation for this section**, including `none` on a site whose theme animates everything. The page reads the setting itself, so the template does not print it and the compile does not warn that it is unread. A value other than these nine plays as `theme`, and the compile warns about it.

This select is optional. A section may also animate itself in CSS, however the design needs, and that is not refused. `prefers-reduced-motion` is a courtesy.

### Showing a setting only when it matters

A setting that only means something in one mode can say so, and the panel leaves it out until the section is in that mode:

```json
{ "type": "select", "id": "source", "label": "Products", "default": "picked",
  "options": [{ "label": "Cards I fill in", "value": "picked" }, { "label": "Products I choose", "value": "chosen" }] },
{ "type": "product_list", "id": "chosen", "label": "Products to show",
  "visible_if": "{{ section.settings.source == 'chosen' }}" }
```

- The condition is an expression of the template language inside `{{ }}`, the same one an `{% if %}` takes: `==`, `!=`, `<`, `>`, `<=`, `>=`, `contains`, `and`, `or` and `not`.
- A section's setting may read `section.settings.<id>`. A block's setting may read its own block's `block.settings.<id>` and the section's `section.settings.<id>`.
- Each setting is read as the page would draw it: the saved value, or the default when nothing was saved. A condition on a toggle that is on by default holds until somebody turns it off.
- It decides what the panel shows and nothing else. A hidden setting keeps its value, and the template still reads it.
- The validator refuses a condition that does not parse, one that reads a setting the section or block does not declare, and one that reads its own setting.

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

**A colour may name a scheme colour as its default**, `"default": "scheme.accent"`, and then follows the section's scheme until somebody picks a colour. See [Styling](/developers/styling#colours-of-the-sections-own).

**Every value is held to its type.** A saved value the control does not allow is drawn as the default, as if it had never been set: a word in a `range`, an option a `select` does not list, a `color` that is not a colour, a link to `javascript:`, a date that is not a date. The stored value is left as it was, so nothing a creator typed is thrown away, and a schema change that makes an old value valid again brings it back.

## Settings that name the shop's own things

A `product_picker`, a `product_list`, a `collection_picker`, a `collection_list` and a `link_list` each store a name, and each arrives in the template as the thing it names. Every one of them is read on the server for the site's own creator: a setting holding somebody else's product or collection id finds nothing, the same as a deleted one.

**A `product_picker`** stores a product's address or id. It prints as the address, so `href="{{ settings.product | url }}"` works as it always has, and it carries the product's own fields: `title`, `price`, `compare_price`, `image`, `url` and `tag`.

```storelib
<a class="pick" href="{{ settings.product | url }}">
  {% if settings.product.image %}<img src="{{ settings.product.image }}" alt="{{ settings.product.title }}">{% endif %}
  <span>{{ settings.product.title }}</span> <span>{{ settings.product.price }}</span>
</a>
```

A product that is unpublished, deleted or somebody else's is an address with no fields, so `{% if settings.product.title %}` tells a section whether it has one. A price typed into the section can fall back to the product's with `default`: `{{ block.settings.price | default: block.settings.product.price }}`.

**A `product_list`** stores up to `limit` products and arrives shaped like `products`, so one card body serves the chosen products and the whole shop:

```storelib
{% for block in settings.chosen %}
  <a href="{{ block.settings.url | url }}">{{ block.settings.title }} {{ block.settings.price }}</a>
{% endfor %}
```

They come in the order the creator chose them, each once. One that has since been unpublished or deleted is left out rather than drawn empty.

**A `collection_picker`** stores one of the creator's collections from Products › Collections, by id. It prints as the collection's address, `/collections/<handle>`, and carries `title`, `handle`, `description`, `image`, `url`, `products_count` and `products`, its first twelve published products shaped like `products`:

```storelib
{% if settings.collection.title %}
  <h2>{{ settings.collection.title }}</h2>
  {% for block in settings.collection.products %}
    <a href="{{ block.settings.url | url }}">{{ block.settings.title }} {{ block.settings.price }}</a>
  {% endfor %}
  <a href="{{ settings.collection | url }}">See all {{ settings.collection.products_count }}</a>
{% endif %}
```

A collection that is unpublished, deleted or somebody else's is empty. **A `collection_list`** stores up to `limit` of them and arrives block-shaped, `{% for block in settings.collections %}` with `block.settings.title`. On the collections page, `collections` is every published one, in the same shape. The library's Collection list and Featured collection sections are written this way.

**A `link_list`** stores a menu's handle and arrives as `{ handle, title, links }`, each link `{ title, url, links }` with one level of links under it:

```storelib
<nav>
  {% for link in settings.menu.links %}
    <a href="{{ link.url | url }}">{{ link.title }}</a>
    {% for child in link.links %}<a href="{{ child.url | url }}">{{ child.title }}</a>{% endfor %}
  {% endfor %}
</nav>
```

A creator makes menus in Website settings, Navigation. `main-menu` is always there and is the header's own links, so a section showing the main menu never has them typed twice. A handle with no menu behind it is an empty menu, never an error. Every field is in [Dynamic values](/developers/dynamic-values#menus).

## Where a section may go

A page has three groups: the header group, the page's own sections (`template`) and the footer group. A section says which it belongs to:

```json
{ "name": "Announcement bar", "category": "announcement", "enabled_on": { "groups": ["header"] } }
```

- **Nothing said**: a page section. This is almost every section.
- **`"enabled_on": { "groups": ["header"] }`**: it sits in the header group, above the site's header, the way an announcement bar does. `"category": "announcement"` means the same when `enabled_on` is not given.
- **`"disabled_on": { "groups": ["header", "footer"] }`**: anywhere but those.
- **`"kind": "header"`**: it is the header. It replaces the built-in header on every page and is never placed in a page's own sections. `"kind": "footer"` likewise. If `enabled_on` is given too, it must include that group.

The validator refuses a group that is not `header`, `footer`, `template` or `"*"`, both `enabled_on` and `disabled_on`, and a `kind` other than `header` or `footer`. A second file of the same kind in one theme is refused when it is saved.

## Shop data in a setting

A creator can put a fact about the shop into a setting rather than typing it: `{{ shop.name }}` in a heading, `{{ creator.avatar }}` in a picture, `© {{ date.year }}` in a footer. The page fills it in on the server before the section is drawn, so the template reads a finished value and needs nothing special. In the builder, **Insert shop data** under a setting offers the ones that fit it.

@[dynamic-sources]

- Text takes any number of placeholders among other words. A link or a picture takes one, as its whole value.
- Each value is made safe for where it goes: words in text, cleaned markup only in a rich text setting, and only an address that passes the `url` rules in a link.
- The list is closed. A name that is not on it is left exactly as typed, so `{{ product.cost }}` in a heading is shown as written rather than filled with something it should not show.
- Nothing filled in is stored. The setting keeps its placeholder, so the page stays right when the shop's name or a price changes.
- A section's own template reads the same facts directly, as `shop`, `creator` and `product`. See [Sections](/developers/sections).

## Media

An `image_picker`, `video_picker` or `file_picker` setting holds the file's **public URL**, and an `image_gallery` a list of them. An upload goes to the creator's storage and the setting is its address; a pasted link is kept as it was typed. A template prints it directly:

```storelib
{% if settings.image != "" %}
  <img src="{{ settings.image }}" alt="{{ settings.image_alt }}" width="1200" height="800" loading="lazy">
{% endif %}
```

In the builder a `video_picker` uploads an MP4, WebM or MOV of up to 200 MB, or takes a link to a video file, and shows the video itself. A YouTube or Vimeo address is a page, not a file, so it belongs in a `video_url` setting, printed through the `embed` filter.

### Files: `file_picker` and `accept`

A `file_picker` is an attachment on the website: a PDF sample, a press kit, a price list, a track. In the builder it is a picker, not an address box: the creator uploads the file (it goes to their Storelib storage and is checked like every public file), or pastes a link to one that lives elsewhere. Either way the setting holds the file's public URL.

`accept` says what the setting takes, so the picker offers only those files and says which in words ("Upload or drop a PDF"). Each entry is a kind or an extension:

| Kind | Takes |
| --- | --- |
| `pdf` | .pdf |
| `document` | .pdf, .doc, .docx, .odt, .rtf, .txt, .md |
| `spreadsheet` | .xls, .xlsx, .ods, .csv |
| `presentation` | .ppt, .pptx, .odp |
| `archive` | .zip, .rar, .7z, .tar, .gz |
| `audio` | .mp3, .wav, .m4a, .aac, .flac, .ogg, .aiff |
| `ebook` | .epub, .mobi, .pdf |

```json
{ "type": "file_picker", "id": "sample", "label": "Sample", "accept": ["pdf"] }
{ "type": "file_picker", "id": "kit", "label": "Press kit", "accept": ["document", "archive"] }
{ "type": "file_picker", "id": "stems", "label": "Stems", "accept": [".zip", ".wav"] }
```

Without `accept` any file a website may hand out is taken. Whatever `accept` says, a web page, a script or an SVG never is: `"accept": [".html"]` is a validation error. Link to the file with `download` so it saves rather than opening in place when that is what you mean:

```storelib
{% if settings.sample != "" %}
  <a href="{{ settings.sample }}" download>{{ settings.link_text | default: "Download the sample" }}</a>
{% endif %}
```

An empty value means nothing is chosen yet, so put the element behind `{% if %}`. Give every image a width and height, or an `aspect-ratio`, so nothing moves as it loads.

**In a theme package**, the same settings hold `asset://` and the SHA-256 of the file, and the file travels in `assets/`. An import stores each file in the importing account and writes its new URL back, so on a site a setting is always a URL. See [Sharing themes](/developers/sharing-themes). The `asset` filter passes a URL through, and prints an `asset://` reference as nothing.

## Changing a section safely

Setting ids and block types are the contract between a section file and every page that uses it. An update may freely:

- add settings and block types; existing instances get their defaults,
- change defaults; instances that do not store the setting follow,
- change markup and CSS.

**Renaming or removing an id loses what was stored under it**, from the section's point of view. The value stays on each page under the old id, where the template cannot read it, and the new id starts at its default. Putting the old id back brings the value back. Declare the rename in `migrations`, a list of `{ "from", "to", "since" }`, and a section's own setting stored under `from` is read under `to` whenever `to` holds nothing, as the section is drawn. It applies to the section's settings, not to its blocks' settings, and the stored page is not rewritten. To change what a setting is called in the panel, change its `label`; the `id` can stay.

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
- a preset that sets a setting or adds a block the section does not declare or accept, a keyed preset whose `block_order` and `blocks` disagree, or a static block without an id,
- a section that both declares its own blocks and accepts theme blocks, or accepts `@app`,
- both `allowed_templates` and `disabled_templates`,
- a `visible_if` that does not parse, or reads a setting that is not declared,
- a `product_list` whose `limit` is not a whole number from 1 to 24, a `video_url` that accepts a host Storelib does not play, or a `focal_point` whose `image` is not an `image_picker` beside it,
- a `schema_version` or `language_version` newer than the engine,
- more than 120 settings,
- an `enabled_on` or `disabled_on` group that is not `header`, `footer`, `template` or `"*"`, both of them at once, or a `kind` other than `header` or `footer`.

A schema that is not JSON is refused with the line and what was expected there. A key that is missing or of the wrong kind is said in words, such as `"name" is missing` or `"settings" should be an array, not an object`.

## What the compile warns about

A warning never stops a save. Each is said in a sentence that names the fix:

- a picture declared as `text` or `url` (it is drawn as an `image_picker`; see [Choosing the type](#choosing-the-type)),
- links typed out as numbered label and address settings, where a `link_list` belongs,
- a `range` with no default, which then starts at its `min` rather than at 0,
- an `animation` setting with a value the page does not play,
- an `<img>` with no `alt`,
- a setting the template never reads.

A file that is not a section at all, or one the compiler did not expect, is answered with what it could not read. It is never a stack trace.
