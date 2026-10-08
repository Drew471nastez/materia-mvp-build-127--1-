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
if the converter missed it. A tag that would compute something on Shopify's
server (`increment`, `capture`, `cycle`) is removed, not evaluated.

A name Storelib cannot read (`request.design_mode`, `cart.item_count`, a
dropped setting) is read as `null`, which is what Liquid gives for a name it
does not know. `{% if request.design_mode %}` takes its else branch; `{{ x |
default: "Shop" }}` prints Shop.

## What converts

| Shopify | Storelib |
| --- | --- |
| `sections/<name>.liquid` | `sections/<name>.storelib`, the type from the file name |
| `blocks/<name>.liquid` | `blocks/<name>.storelib`, a theme block; `{{ block.shopify_attributes }}` is `{{ block.storelib_attributes }}` with `"tag": null` |
| `{% schema %}` | `<schema>`: name, settings, blocks, max_blocks, presets; `t:` keys from `locales/en.default.schema.json`, else the id in words |
| `enabled_on` / `disabled_on` | the header, footer and page groups; `templates` as `allowed_templates` / `disabled_templates` |
| `{% stylesheet %}`, `{% style %}`, `'x.css' \| asset_url \| stylesheet_tag` | `<style>`, scoped to the section |
| `{% javascript %}` | `<script>` only when it compiles against the scripting API (09); usually it does not and is left out |
| `section.settings.x` | `settings.x` |
| `settings.x` (the theme's) | `theme.settings.shopify.x`, from `config/settings_data.json` |
| `for block in section.blocks` | `for block in blocks` |
| `unless x` | `if not (x)` |
| `case` / `when` | an `if` / `elsif` chain |
| `assign x = y` | every later `x` read as `y`; assigned twice, read as nothing |
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
- **The layout**: the page shell is Storelib's.
- **Scripts in `assets/`, `<script>` tags, `on…=` attributes, iframes**: a
  Shopify theme's scripts call Shopify's storefront, and a section's markup
  holds no scripts.
- **CSS with Liquid tags between rules**: no stylesheet parser reads it. A
  filled button rule with no label colour gets `color: var(--s-btn-text)`,
  which is what the CSS compiler asks for.
- **Filters Storelib lacks** (`money`, `handleize`, `where`…): removed from
  the chain and the value printed as it is. Filters that write Shopify
  markup (`payment_type_svg_tag`, `link_to`, `font_face`…) take their output
  with them.
- **`form`, `paginate`**: the tag goes, what was inside stays.
- **`capture`, `cycle`, `increment`, `break`, `limit:` and `offset:` on a
  loop, ranges**: there is nothing for them to mean in a Storelib template.
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
`readPackage`.

## Licensing

A Shopify theme's license decides whether it may be used outside Shopify.
Shopify's own themes, such as Dawn and Horizon, are licensed for use on
Shopify stores. The person importing a theme is responsible for having the
right to use it. The import route says so once, in `shopify.license`.

## Limits

The theme's ZIP is held to the import's own limits first: 50 MB, and the
upload check in `lib/security/uploads`, which runs before the ZIP is opened.
That check refuses a theme package containing any `.js` file
(`zip_blocked_entry`), and every theme Shopify ships has scripts in `assets/`.
So today a Dawn or Horizon ZIP must have its `.js` files removed before it is
imported; the converter never reads them either way. The converter then refuses a theme of more than 4000 files or one
that declares more than 200 MB unpacked, before reading any of it. One
section grows by at most 400 KB of inlined snippets and 1 MB of the theme's
CSS; past that, the rest is left out and said.
