# Importing a Shopify theme

A Shopify Online Store 2.0 theme, as the Shopify admin downloads it (a ZIP
with `assets/`, `blocks/`, `config/`, `layout/`, `locales/`, `sections/`,
`snippets/`, `templates/`), imports through the same Import button as a
`.storelib-theme` package. Its Liquid is converted to `.storelib` files, the
result is built into a package, and that package goes through `readPackage`
with every check in 11. A GitHub download, with the folders one level down
(`dawn-main/sections/…`), is read the same way.

The converter is `lib/storelib-theme/shopify/convert.ts` (the folders) and
`lib/storelib-theme/shopify/liquid.ts` (the markup). The route is
`POST /api/website-builder/themes/import`, unchanged for every other kind of
file.

## Liquid is never run

There is no Liquid engine in Storelib. The converter reads each tag and
writes text: the tag Storelib spells another way, or nothing. What comes out
is compiled by `compileSection` and `compileBlock` like a file typed into the
code editor, so a script, an `on…=` handler or a frame is refused there even
if the converter missed it. Tags that work a value out as the page is drawn
(`assign`, `capture`, `increment`, `cycle`, `break`, ranges, loop limits)
are written as Storelib's own, which the template engine runs
(docs/storelib-language.md): nothing Shopify computed is lost, and nothing is
worked out at import that should change per page.

The one thing worked out at import is the theme's look: `layout/theme.liquid`
is evaluated once against the theme's saved settings
(`lib/storelib-theme/shopify/static-liquid.ts`), so its CSS variables, colour
schemes, fonts and linked stylesheets become plain CSS.

A name Storelib cannot read (`cart.item_count`, a dropped setting) is read as
`null`, which is what Liquid gives for a name it does not know, and the
report lists every such name per file. `request.design_mode` is the builder
(`page.in_editor`), `template.name` is `page.template`, and
`collections.all.products` is the shop's products.

## What converts

| Shopify | Storelib |
| --- | --- |
| `sections/<name>.liquid` | `sections/<name>.storelib`, the type from the file name |
| `blocks/<name>.liquid` | `blocks/<name>.storelib`, a theme block; `{{ block.shopify_attributes }}` is `{{ block.storelib_attributes }}` with `"tag": null` |
| `{% schema %}` | `<schema>`: name, settings, blocks, max_blocks, presets; `t:` keys from `locales/en.default.schema.json`, else the id in words |
| `enabled_on` / `disabled_on` | the header, footer and page groups; `templates` as `allowed_templates` / `disabled_templates` |
| `{% stylesheet %}` in any section, block or snippet | `layout/theme.storelib`, every one, as Shopify's styles.css draws them all on every page |
| `layout/theme.liquid`'s `<style>`s and linked stylesheets | `layout/theme.storelib`, worked out against the saved settings, compiled to the page root |
| the classes on `<body>` | `theme_root_class`, on the page root |
| `{% style %}`, `'x.css' \| asset_url \| stylesheet_tag` in a section | `<style>`, scoped to the section; `{% if %}` inside it is kept |
| `{% javascript %}` | `<script>` only when it compiles against the scripting API (09); usually it does not and is left out |
| `section.settings.x` | `settings.x` |
| `settings.x` (the theme's) | `theme.settings.shopify.x`, from `config/settings_data.json` |
| `for block in section.blocks` | `for block in blocks` |
| `unless x` | `if not (x)` |
| `case` / `when` | an `if` / `elsif` chain |
| `assign x = y` | made once and before any if or loop: every later `x` read as `y`, so the builder knows the setting; otherwise `{% assign %}`, run as the page is drawn |
| `capture x` | written where it is printed, or `{% capture %}` when it is made more than once |
| `settings[key]`, `items[i]` | the same, worked out as the page is drawn |
| `content_for 'block', closest.product: product` | the same: the block and the blocks in it read `closest.product` |
| `product.featured_media`, `.variants`, `.selected_or_first_available_variant`… | the same names on Storelib's product (docs/storelib-language.md) |
| `'icon.svg' \| inline_asset_content` | the SVG written in, cleaned of scripts and handlers |
| colour `.rgb`, `.alpha`, `.red`… | the same, on a colour setting |
| `render 'name', a: b`, `include` | the snippet written in place, `a` read as `b`, four deep at most |
| `echo x`, `{% liquid %}` | the same statements as tags and outputs |
| `x != blank`, `x == empty` | `x`, `not x` |
| `{{ 'key' \| t }}` | the words from `locales/en.default.json` |
| `image_url`, `img_url` | removed: the setting already prints the picture's address |
| `x \| image_url \| image_tag` | `<img src="{{ x }}" alt="">` |
| `'logo.png' \| asset_url` | the picture as a package asset, by hash |
| richtext, inline_richtext, html settings | printed with `raw`, as Shopify prints them |
| `padding-block-start` setting ids | `padding_block_start` |
| `templates/index.json`, `product.json`, `page.contact.json`, `page.about*.json` | the home, product, contact and about pages |
| `{%- -%}`, `{{- -}}` | the whitespace trimmed, the dashes gone |

## What is left out, and why

Each of these is a line in the report, per file.

- **Setting types Storelib does not have**: blog, article, metaobject,
  metaobject_list, color_scheme_group. The setting is dropped and the
  template reads it as nothing.
- **App blocks** (`@app`): Storelib has no Shopify apps.
- **The header, the footer and the group files**: a Storelib site draws its
  own, set in Theme settings.
- **The layout's markup**: the page shell is Storelib's. Its styles are kept.
- **Scripts in `assets/`, `<script>` tags, `on…=` attributes, iframes**: a
  Shopify theme's scripts call Shopify's storefront, and a section's markup
  holds no scripts.
- **From the theme's stylesheet**: `@import` and `@font-face` (fonts load
  through Theme settings › Typography), an address that is not https, and
  page layout set on `<body>` or `<html>`, which would rearrange Storelib's
  own page. Colours, type and CSS variables set there are kept.
- **Filters Storelib lacks** (`payment_terms`, `standard_event_data`…):
  removed from the chain and the value printed as it is. Filters that write
  Shopify markup (`payment_type_svg_tag`, `link_to`, `font_face`…) take
  their output with them.
- **`form`, `paginate`**: the tag goes, what was inside stays.
- **The theme's own scripts** (custom elements such as `slideshow-component`
  and `product-form-component`): the markup and its CSS are kept, so a
  slider is still a scrolling row and an accordion is still `<details>`, but
  what the script added on top (arrows that move the slider, add to cart
  without leaving the page) does not run.
- **Templates with no Storelib page**: collection, blog, article, cart,
  search, 404, password, customers. The pages Storelib generates are used.
- **Colours, fonts and colour schemes** from `settings_data.json`: their
  shapes are Shopify's. The plain values (true and false, numbers, short
  words) are kept for the sections that read them.
- **Locales** beyond the English words a section prints: sites are single
  language.

A section that still does not compile after the conversion is retried
without its script, then without the CSS that carried Liquid, then without
its CSS, then with each line the compiler names emptied of everything but
its tags. If it still does not compile it is left out, and the report gives
the compiler's first error with the file and line.

## The answer

The import route answers as it does for a package, plus:

```json
"shopify": {
  "converted": ["sections/rich-text.liquid", "templates/index.json"],
  "skipped": [{ "file": "sections/header.liquid", "reason": "A Storelib site draws its own header, set in Theme settings › Header" }],
  "notes": [{ "file": "sections/rich-text.liquid", "message": "The \"money\" filter was removed, so its value is printed as it is" }],
  "summary": "Converted 36 of 46 sections from Shopify. 10 were left out.",
  "license": "A Shopify theme's license decides whether it may be used outside Shopify. …"
}
```

The library's toast after an import ends with the summary.

Measured on Shopify's own themes: Dawn converts 36 of its 46 sections (the
other ten are the header, the footer and eight with no schema, such as
cart-drawer); Horizon converts 38 of its 40 sections (all but the header and
footer) and all 95 of its theme blocks. Every converted package passes
`readPackage`. Horizon's home page, drawn by Storelib's renderer in Chromium
at 1280 and 390 wide with four products, has its hero, its four column grid
(two on a phone), its page margins, its badges and its compare at prices as
Horizon draws them.

## Licensing

A Shopify theme's license decides whether it may be used outside Shopify.
Shopify's own themes, such as Dawn and Horizon, are licensed for use on
Shopify stores. The person importing a theme is responsible for having the
right to use it. The import route says so once, in `shopify.license`.

## Limits

The theme's ZIP is held to the import's own limits first: 50 MB, and the
upload check in `lib/security/uploads`, which runs before the ZIP is opened.
That check refuses a theme package containing a `.js` file
(`zip_blocked_entry`), with one exception: in an archive whose own file list
is a Shopify theme (`sections/*.liquid` beside `config/settings_schema.json`
or `layout/theme.liquid`, and no `theme.json`), a `.js` directly inside
`assets/` is let in (`shopifyThemeRoot` and `shopifyScriptEntry` in
`lib/security/uploads/zip.ts`), and the admin log notes
`zip_shopify_scripts_ignored`. Every theme Shopify ships keeps its scripts
there, and the converter never reads or keeps them. A `.js` anywhere else,
and every other blocked type, is still refused. The converter then refuses a theme of more than 4000 files or one
that declares more than 200 MB unpacked, before reading any of it. One
section grows by at most 400 KB of inlined snippets and 1 MB of the theme's
CSS; past that, the rest is left out and said.
