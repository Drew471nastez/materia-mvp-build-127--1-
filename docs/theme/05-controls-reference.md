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
| [`font_picker`](#font_picker) | string | `""` | no |  |
| [`alignment`](#alignment) | enum | `"left"` | yes |  |
| [`image_picker`](#image_picker) | asset | `""` | no |  |
| [`image_gallery`](#image_gallery) | asset_list | `[]` | no | `max` |
| [`video_picker`](#video_picker) | asset | `""` | no |  |
| [`file_picker`](#file_picker) | asset | `""` | no |  |
| [`icon_picker`](#icon_picker) | string | `""` | no |  |
| [`url`](#url) | string | `""` | no | `placeholder` |
| [`page_picker`](#page_picker) | string | `""` | no |  |
| [`product_picker`](#product_picker) | string | `""` | no |  |
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

**Colour.** A hex colour.

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

**Colour scheme.** One of the theme's named colour schemes.

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

**Product.** One of the creator's products, by id.

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

## community_picker

**Community.** One of the creator's communities, by id.

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
