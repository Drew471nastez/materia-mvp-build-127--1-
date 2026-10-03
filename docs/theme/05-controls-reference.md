# Controls reference

Generated from `lib/storelib-theme/controls/registry.ts` by `scripts/emit-controls.ts`. Do not edit by hand; edit the registry and run `npx tsx scripts/emit-controls.ts`.

Every `type` a schema setting may use is here, and only these. A setting's `type` names one entry; the entry decides what the stored value may be, what the template sees when nothing was set, whether the setting may carry a value per breakpoint, and which editor control draws it. The same list is available as JSON at `lib/storelib-theme/controls/storelib-controls.json` for the AI and the editor.

| Type | Holds | Default when unset | Responsive | Extra keys |
| --- | --- | --- | --- | --- |
| [`text`](#text) | string | `""` | no | `placeholder` |
| [`textarea`](#textarea) | string | `""` | no | `placeholder` |
| [`richtext`](#richtext) | string | `""` | no |  |
| [`number`](#number) | number | `0` | yes | `min`, `max`, `step`, `unit`, `placeholder` |
| [`toggle`](#toggle) | boolean | `false` | no |  |
| [`checkbox`](#checkbox) | boolean | `false` | no |  |
| [`select`](#select) | enum | `""` | no | `options` |
| [`radio`](#radio) | enum | `""` | no | `options` |
| [`range`](#range) | number | `0` | yes | `min`, `max`, `step`, `unit` |
| [`color`](#color) | color | `""` | no |  |
| [`color_scheme`](#color_scheme) | enum | `"white"` | no |  |
| [`color_background`](#color_background) | background | `""` | no |  |
| [`font_picker`](#font_picker) | string | `""` | no |  |
| [`alignment`](#alignment) | enum | `"left"` | yes |  |
| [`inline_richtext`](#inline_richtext) | string | `""` | no | `placeholder` |
| [`html`](#html) | string | `""` | no | `placeholder` |
| [`datetime`](#datetime) | string | `""` | no |  |
| [`focal_point`](#focal_point) | string | `"50% 50%"` | no | `image` |
| [`image_picker`](#image_picker) | asset | `""` | no |  |
| [`image_gallery`](#image_gallery) | asset_list | `[]` | no | `max` |
| [`video_picker`](#video_picker) | asset | `""` | no |  |
| [`file_picker`](#file_picker) | asset | `""` | no |  |
| [`icon_picker`](#icon_picker) | string | `""` | no |  |
| [`url`](#url) | string | `""` | no | `placeholder` |
| [`video_url`](#video_url) | string | `""` | no | `accept`, `placeholder` |
| [`page_picker`](#page_picker) | string | `""` | no |  |
| [`product_picker`](#product_picker) | string | `""` | no |  |
| [`product_list`](#product_list) | reference_list | `[]` | no | `limit` |
| [`link_list`](#link_list) | string | `""` | no |  |
| [`community_picker`](#community_picker) | string | `""` | no |  |
| [`header`](#header) | none | `undefined` | no |  |
| [`paragraph`](#paragraph) | none | `undefined` | no | `content` |
| [`divider`](#divider) | none | `undefined` | no |  |

## Legacy names

The JSON schemas the builder shipped with used a few other names. They still validate, and mean:

- `link` → `url`
- `image` → `image_picker`
- `video` → `video_picker`
- `icon` → `icon_picker`
- `font` → `font_picker`
- `spacing` → `range`

### Shopify names

A schema written for a Shopify theme may use Shopify's names for the controls Storelib has under another name. They validate and mean:

- `text_alignment` → `alignment`
- `product` → `product_picker`
- `page` → `page_picker`

These Shopify types have nothing to point at on Storelib and are refused with the reason:

- `collection`: Storelib has no collections. Use product_list for chosen products, or the section's `products` for the whole shop.
- `collection_list`: Storelib has no collections. Use product_list for chosen products.
- `blog`: A Storelib site has no blog of its own yet.
- `article`: A Storelib site has no blog of its own yet.
- `metaobject`: Storelib has no metaobjects. Use blocks for repeated content.
- `metaobject_list`: Storelib has no metaobjects. Use blocks for repeated content.
- `liquid`: A section's template is its code. Write the markup in <template>, or make a section of your own in the code editor.
- `color_scheme_group`: Colour schemes are the theme's, edited in Theme settings › Colors. A section picks one with color_scheme.

## text

**Text.** A single line of text.

- Value: string
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `TextInput`
- Reads these extra keys: `placeholder`

```json
{
  "type": "text",
  "id": "heading",
  "label": "Heading",
  "default": "Welcome"
}
```

## textarea

**Text area.** Several lines of plain text.

- Value: string
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `TextArea`
- Reads these extra keys: `placeholder`

```json
{
  "type": "textarea",
  "id": "body",
  "label": "Body"
}
```

## richtext

**Rich text.** Formatted text. Stored as sanitised HTML; output with the `raw` filter.

- Value: string
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `RichTextEditor`

```json
{
  "type": "richtext",
  "id": "content",
  "label": "Content"
}
```

## number

**Number.** A number typed in.

- Value: number
- Default when the schema gives none: `0`
- Responsive: may carry `{desktop, tablet, mobile}` when the setting says `"responsive": true`
- Editor control: `NumberInput`
- Reads these extra keys: `min`, `max`, `step`, `unit`, `placeholder`

```json
{
  "type": "number",
  "id": "columns",
  "label": "Columns",
  "min": 1,
  "max": 6,
  "default": 3
}
```

## toggle

**Toggle.** On or off.

- Value: boolean
- Default when the schema gives none: `false`
- Responsive: no
- Editor control: `Toggle`

```json
{
  "type": "toggle",
  "id": "show_badge",
  "label": "Show badge",
  "default": true
}
```

## checkbox

**Checkbox.** On or off, drawn as a checkbox. Prefer `toggle` for a single switch.

- Value: boolean
- Default when the schema gives none: `false`
- Responsive: no
- Editor control: `Checkbox`

```json
{
  "type": "checkbox",
  "id": "agree",
  "label": "Require agreement"
}
```

## select

**Select.** One of a list, drawn as a dropdown.

- Value: enum
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `Select`
- Reads these extra keys: `options`

```json
{
  "type": "select",
  "id": "layout",
  "label": "Layout",
  "options": [
    {
      "label": "Centre",
      "value": "center"
    },
    {
      "label": "Split",
      "value": "split"
    }
  ],
  "default": "center"
}
```

## radio

**Radio.** One of a short list, every option visible.

- Value: enum
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `RadioGroup`
- Reads these extra keys: `options`

```json
{
  "type": "radio",
  "id": "style",
  "label": "Button style",
  "options": [
    {
      "label": "Filled",
      "value": "filled"
    },
    {
      "label": "Outline",
      "value": "outline"
    }
  ],
  "default": "filled"
}
```

## range

**Range.** A number on a slider.

- Value: number
- Default when the schema gives none: `0`
- Responsive: may carry `{desktop, tablet, mobile}` when the setting says `"responsive": true`
- Editor control: `Slider`
- Reads these extra keys: `min`, `max`, `step`, `unit`

```json
{
  "type": "range",
  "id": "padding",
  "label": "Padding",
  "min": 0,
  "max": 160,
  "step": 4,
  "unit": "px",
  "default": 64,
  "responsive": true
}
```

## color

**Colour.** A hex colour. The default may name a scheme colour, "scheme.accent", which the setting follows until somebody picks one.

- Value: color
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `ColorPicker`

```json
{
  "type": "color",
  "id": "background",
  "label": "Background",
  "default": "#ffffff"
}
```

## color_scheme

**Colour scheme.** One of the theme's named colour schemes, by key: the built-in white, light, dark, black and highlight (Light, Soft, Dark, Brand and Accent in the editor) or one the creator added. The editor offers every scheme the theme has; see docs/theme/16-design-tokens.md.

- Value: enum
- Default when the schema gives none: `"white"`
- Responsive: no
- Editor control: `ColorSchemePicker`

```json
{
  "type": "color_scheme",
  "id": "scheme",
  "label": "Colour scheme",
  "default": "white"
}
```

## color_background

**Background.** A colour or a CSS gradient for something to sit on. Only colours, gradient functions, angles and stops: a value that could leave the declaration it is written in is refused.

- Value: background
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `BackgroundPicker`

```json
{
  "type": "color_background",
  "id": "backdrop",
  "label": "Backdrop",
  "default": "linear-gradient(135deg, #f8f9fa 0%, #e5e7eb 100%)"
}
```

## font_picker

**Font.** A font family from the theme's font list.

- Value: string
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `FontPicker`

```json
{
  "type": "font_picker",
  "id": "font",
  "label": "Heading font",
  "default": "Inter"
}
```

## alignment

**Alignment.** Left, centre or right.

- Value: enum
- Default when the schema gives none: `"left"`
- Responsive: may carry `{desktop, tablet, mobile}` when the setting says `"responsive": true`
- Editor control: `AlignmentPicker`

```json
{
  "type": "alignment",
  "id": "align",
  "label": "Align",
  "default": "center"
}
```

## inline_richtext

**Inline rich text.** One line of formatted text: bold, italic, underline and links, nothing that starts a new block. Stored as cleaned HTML; output with the `raw` filter.

- Value: string
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `InlineRichText`
- Reads these extra keys: `placeholder`

```json
{
  "type": "inline_richtext",
  "id": "heading",
  "label": "Heading",
  "default": "Made <em>slowly</em>, by hand"
}
```

## html

**HTML.** Markup a creator pastes, such as an embed from another service. Cleaned on save against the custom HTML allow list: no script, no forms, frames only from known players. Output with the `raw` filter.

- Value: string
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `HtmlInput`
- Reads these extra keys: `placeholder`

```json
{
  "type": "html",
  "id": "embed",
  "label": "Embed code"
}
```

## datetime

**Date and time.** A date, or a date and a time, written as 2026-03-14 or 2026-03-14T23:00 with an optional zone such as +02:00. Read as written, never shifted to the server's time zone. Format it with the `date` filter.

- Value: string
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `DateTimeInput`

```json
{
  "type": "datetime",
  "id": "ends_at",
  "label": "Sale ends"
}
```

## focal_point

**Focal point.** Where the important part of a picture is, as `object-position` reads it: "30% 70%". Name the picture setting it belongs to with `image`, and the editor lets the creator tap the spot on that picture.

- Value: string
- Default when the schema gives none: `"50% 50%"`
- Responsive: no
- Editor control: `FocalPointPicker`
- Reads these extra keys: `image`

```json
{
  "type": "focal_point",
  "id": "image_focus",
  "label": "Focus",
  "default": "50% 30%"
}
```

## image_picker

**Image.** One image from the media library. Stored as an asset reference, rendered as a URL.

- Value: asset
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `ImagePicker`

```json
{
  "type": "image_picker",
  "id": "image",
  "label": "Image"
}
```

## image_gallery

**Image gallery.** Several images, in order.

- Value: asset_list
- Default when the schema gives none: `[]`
- Responsive: no
- Editor control: `ImageGallery`
- Reads these extra keys: `max`

```json
{
  "type": "image_gallery",
  "id": "images",
  "label": "Images",
  "max": 12
}
```

## video_picker

**Video.** A video file from the media library, or a hosted video URL.

- Value: asset
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `VideoPicker`

```json
{
  "type": "video_picker",
  "id": "video",
  "label": "Background video"
}
```

## file_picker

**File.** Any file from the media library.

- Value: asset
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `FilePicker`

```json
{
  "type": "file_picker",
  "id": "download",
  "label": "Downloadable file"
}
```

## icon_picker

**Icon.** One icon from Storelib's icon library, by name.

- Value: string
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `IconPicker`

```json
{
  "type": "icon_picker",
  "id": "icon",
  "label": "Icon",
  "default": "zap"
}
```

## url

**Link.** Where something links to: a page of the site, a product, or any address.

- Value: string
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `LinkPicker`
- Reads these extra keys: `placeholder`

```json
{
  "type": "url",
  "id": "button_url",
  "label": "Button link",
  "default": "/shop"
}
```

## video_url

**Video link.** A YouTube or Vimeo link, in any shape people paste: a watch page, a short link, a Shorts link or a player address. Anything else is refused. Show it with `src="{{ settings.video | embed }}"` and the `embed` capability. `accept` narrows it to one host.

- Value: string
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `VideoUrlInput`
- Reads these extra keys: `accept`, `placeholder`

```json
{
  "type": "video_url",
  "id": "video",
  "label": "Video",
  "accept": [
    "youtube",
    "vimeo"
  ]
}
```

## page_picker

**Page.** One of the site's pages, by key.

- Value: string
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `PagePicker`

```json
{
  "type": "page_picker",
  "id": "page",
  "label": "Page"
}
```

## product_picker

**Product.** One of the creator's products. Printed on its own it is the product's address, so `href="{{ settings.product | url }}"` works as it always has; it also carries the product's live `title`, `price`, `compare_price`, `image`, `url` and `id`, read as `settings.product.title`, whenever the page knows that product.

- Value: string
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `ProductPicker`

```json
{
  "type": "product_picker",
  "id": "product",
  "label": "Product"
}
```

## product_list

**Product list.** Several of the creator's products, chosen and ordered by the creator, stored by id. The template receives them block-shaped, like `products`, with the live title, price and picture: `{% for block in settings.featured %}`. `limit` caps how many, 12 unless given, never more than 24.

- Value: reference_list
- Default when the schema gives none: `[]`
- Responsive: no
- Editor control: `ProductListPicker`
- Reads these extra keys: `limit`

```json
{
  "type": "product_list",
  "id": "featured",
  "label": "Products",
  "limit": 4
}
```

## link_list

**Menu.** One of the site's menus, by handle. The template receives `{ handle, title, links }`, each link `{ title, url, links }` with every address already made safe. `main-menu` is the header's own links unless the creator made a menu of that name.

- Value: string
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `MenuPicker`

```json
{
  "type": "link_list",
  "id": "menu",
  "label": "Menu",
  "default": "main-menu"
}
```

## community_picker

**Community.** One of the creator's own communities, stored by id. Printed on its own it is the community page's address, so `href="{{ settings.community | url }}"` works; it also carries the community's live `name`, `tagline`, `image` (the cover), `logo`, `members`, `members_label`, `posts`, `events` (upcoming), `price` and `join_label`, read as `settings.community.name`. Only a community that is the creator's own, published and public, while communities are on: any other id is empty, so `{% if settings.community.name %}` draws nothing for it.

- Value: string
- Default when the schema gives none: `""`
- Responsive: no
- Editor control: `CommunityPicker`

```json
{
  "type": "community_picker",
  "id": "community",
  "label": "Community"
}
```

## header

**Header.** A heading in the sidebar. Holds no value.

- Value: none (draws in the sidebar, stores nothing)
- Default when the schema gives none: `undefined`
- Responsive: no
- Editor control: `SettingsHeader`

```json
{
  "type": "header",
  "id": "hdr_content",
  "label": "Content"
}
```

## paragraph

**Paragraph.** A line of help text in the sidebar. Holds no value.

- Value: none (draws in the sidebar, stores nothing)
- Default when the schema gives none: `undefined`
- Responsive: no
- Editor control: `SettingsParagraph`
- Reads these extra keys: `content`

```json
{
  "type": "paragraph",
  "id": "note",
  "content": "Shown above the fold on every page."
}
```

## divider

**Divider.** A rule between groups of settings. Holds no value.

- Value: none (draws in the sidebar, stores nothing)
- Default when the schema gives none: `undefined`
- Responsive: no
- Editor control: `SettingsDivider`

```json
{
  "type": "divider",
  "id": "div_1"
}
```
