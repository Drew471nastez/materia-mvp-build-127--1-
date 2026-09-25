# Dynamic values

A section's template prints values with `{{ }}` and decides what to draw with `{% if %}` and `{% for %}`. This page is every value a template can read, what each one holds and where it comes from, how the language compares and loops, and every filter. The syntax itself is in [Sections](/developers/sections#the-template-language).

## What a template can read

| Name | What it is |
| --- | --- |
| `settings` | This instance's settings, one per setting the schema declares, each already worked out. |
| `blocks` | This instance's blocks, in order, each `{ id, type, settings }`. |
| `section` | This instance: `section.id`, `section.type`, and `section.settings` and `section.blocks`, which are the two above under longer names. |
| `page` | Which page this is and where it is drawn: `page.template`, `page.in_editor`, and on the search page `page.query`. |
| `scheme` | The colour scheme this instance uses, with its own colour overrides applied. |
| `theme` | The theme's tokens and every theme setting. |
| `products` | The creator's published products, shaped like blocks. |
| `forloop` | The loop being drawn: `index`, `index0`, `first`, `last`, `length`. |

Nothing else can be read. The compiler checks every path against this list and against the schema beside it, so `{{ product.title }}` and `{{ settings.headng }}` are both errors with a line number, not an empty space on the page. A loop variable, `block` in `{% for block in blocks %}`, is checked against the block settings the schema declares.

## settings

One value for every setting that holds one. `header`, `paragraph` and `divider` draw in the panel and hold nothing.

Each value is worked out the same way every time the section is drawn:

```text
value = the value stored on this instance
     ?? the schema's default
     ?? the control's own value for "nothing" ("" for text, 0 for a number, false for a toggle, [] for a gallery)
```

A page stores what the section's preset set and what the creator changed since. Everything else comes from the schema, so a default changed in the file reaches every instance that does not store that setting. The control's own values are in the table in [Schema](/developers/schema#every-control-type).

What each control gives a template:

| Control | The value |
| --- | --- |
| `text`, `textarea`, `url` | Text. A `url` holds whatever the link picker chose: `/about`, `/products/preset-pack`, `https://…`, `mailto:…` or `tel:…`. |
| `richtext` | HTML, cleaned when it was saved. Print it with `raw`. |
| `number`, `range` | A number. |
| `toggle`, `checkbox` | `true` or `false`. |
| `select`, `radio` | The chosen option's `value`, never its label. |
| `color` | A hex colour, or `""`. |
| `color_scheme` | The scheme's key, such as `dark`. The colours themselves are in `scheme`. |
| `font_picker` | A font family name. |
| `alignment` | `left`, `center` or `right`. |
| `image_picker`, `video_picker`, `file_picker` | The file's URL, or `""` when nothing is chosen. |
| `image_gallery` | A list of URLs. |
| `icon_picker` | An icon's name, such as `zap`. |
| `page_picker`, `product_picker` | The page's or product's address, such as `/about` or `/products/preset-pack`. |
| `community_picker` | A community id, as typed. |

### Responsive values

A setting with `"responsive": true` on `number`, `range` or `alignment` arrives as an object with all three breakpoints, filled from the top down:

```json
stored:  { "columns": { "desktop": 4, "mobile": 1 } }
read:    { "columns": { "desktop": 4, "tablet": 4, "mobile": 1 } }
```

Read one breakpoint with `settings.columns.desktop`. Printing the whole object prints it as JSON text, which is never what a stylesheet wants. Hand all three to CSS as custom properties and choose with container queries:

```storelib
<div class="grid" style="--cols: {{ settings.columns.desktop }}; --cols-tablet: {{ settings.columns.tablet }}; --cols-phone: {{ settings.columns.mobile }}">
```

```css
.grid { container-type: inline-size; display: grid; grid-template-columns: repeat(var(--cols-phone), minmax(0, 1fr)); }
@container (min-width: 640px) { .grid { grid-template-columns: repeat(var(--cols-tablet), minmax(0, 1fr)); } }
@container (min-width: 1024px) { .grid { grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); } }
```

## blocks

The instance's blocks in order. Each is `{ id, type, settings }`, and each block's settings are worked out like a section's, against its block type's defaults.

```storelib
{% for block in blocks %}
  {% if block.type == "qa" %}
    <details data-block-id="{{ block.id }}"><summary>{{ block.settings.question }}</summary>{{ block.settings.answer | raw }}</details>
  {% endif %}
{% else %}
  {% if page.in_editor %}<p>Add a question in the sidebar</p>{% endif %}
{% endfor %}
```

- `blocks.size`, `blocks.first`, `blocks.last` and `blocks[0]` work on the list.
- A block whose type the schema no longer declares is still in the list, with its stored settings as they are. Test `block.type` and it is drawn by nothing.
- A block marked hidden in a theme package is left out. The builder has no way to hide a block.
- `data-block-id="{{ block.id }}"` on each block's outermost element is what lets the creator click the block in the builder to open it.

## section

| Path | What it is |
| --- | --- |
| `section.id` | This instance's id, the same for as long as the instance exists. Build element ids from it, `id="{{ section.id }}-menu"`, so the section can be on a page twice. |
| `section.type` | The section type, which is its file name. |
| `section.settings` | The same as `settings`. |
| `section.blocks` | The same as `blocks`. |

## page

| Path | What it is |
| --- | --- |
| `page.template` | Which page this is. `index` for home and `page.<key>` for the others, with the differences below. |
| `page.in_editor` | `true` while the builder draws the page, and absent on the live site. |
| `page.query` | On the live search page, what was searched for, up to 120 characters. Absent everywhere else. |

`page.template` on each page:

| Page | On the live site | In the builder |
| --- | --- | --- |
| Home | `index` | `index` |
| A product page | `product` | `page.product` |
| The shop | `page.products` | `page.products` |
| Search results | `page.search` | `page.search` |
| Any other page | `page.<key>` | `page.<key>` |

`page.in_editor` is the one sanctioned difference between the builder and the live site. Put anything meant for the person editing behind it, and a visitor never sees it:

```storelib
{% if blocks.size == 0 and page.in_editor %}
  <p class="empty">Add a logo in the sidebar</p>
{% endif %}
```

## scheme

The colour scheme this instance uses: the one its `color_scheme` setting names, with the colours it overrides in the builder's Advanced colors applied on top. See [Themes](/developers/themes#colour-schemes) for how a scheme is chosen when the key is missing.

It has the scheme's 21 colours under their names, such as `scheme.background`, `scheme.heading` and `scheme.primary_button_background`. The full list, with the CSS variable for each, is in [Styling](/developers/styling#colour-schemes). The library's own sections read a scheme by shorter, older names, and both work:

@[scheme-names]

In CSS, read the same colours as custom properties, which the renderer sets on the section's root: `var(--scheme-background)`, `var(--scheme-heading)`. A template needs `scheme` only where a colour goes into markup.

## theme

The theme's tokens, which a section reads directly, and every theme setting as it was saved:

@[theme-tokens]

`theme.colors` are the page's own colours, behind and between sections, not a section's. Paint a section from `scheme`, which follows the colour scheme the creator chose for it.

`theme.settings` has everything else: `theme.settings.brand_name`, `theme.settings.logo_url`, `theme.settings.tagline`, `theme.settings.social_instagram`. A key a website has never set may be absent, so give it a fallback:

```storelib
<a class="brand" href="/">{{ theme.settings.brand_name | default: "Shop" }}</a>
```

## products

The creator's published products, newest first, in the same shape as `blocks`, so one card is written once for both:

| Path | What it is |
| --- | --- |
| `block.id` | The product's id. [Checkout](/developers/selling#two-ways-to-sell-from-a-section) takes it. |
| `block.type` | Always `product`. |
| `block.settings.title` | Its name. |
| `block.settings.price` | Its price, formatted, such as `$48.00`. Empty when it is free. |
| `block.settings.compare_price` | The price before a sale, formatted, only when it is higher than `price`. Otherwise empty. |
| `block.settings.image` | Its main picture's URL, or empty. |
| `block.settings.url` | Its page, `/products/<slug>`. |
| `block.settings.tag` | Meant to read `Sold out` when none are left. Today it is always empty, because stock is not read yet. |

Which products a page has:

| Where | `products` |
| --- | --- |
| Home, the shop and your own pages, live | The newest 24 published products. A change to a product reaches the site within about a minute. |
| Search results, live | Those of the 24 that match `page.query`. |
| A product page, live | Empty. |
| The builder | Up to 100 of the newest published products, on every page. |

```storelib
{% for block in products %}
  <a class="card" href="{{ block.settings.url | url }}">{{ block.settings.title }} <span>{{ block.settings.price | default: "Free" }}</span></a>
{% else %}
  {% if page.in_editor %}<p>Publish a product and it appears here</p>{% endif %}
{% endfor %}
```

A template never does money: print `price` as it arrives. See [Selling](/developers/selling).

## forloop

Inside `{% for %}`, the innermost loop:

| Path | What it is |
| --- | --- |
| `forloop.index` | 1 for the first item. |
| `forloop.index0` | 0 for the first item. |
| `forloop.first` | `true` on the first item. |
| `forloop.last` | `true` on the last item. |
| `forloop.length` | How many items the loop has. |

Outside a loop, `forloop` is empty.

## How values compare

- **Printing.** `{{ }}` escapes what it prints. `null`, `false` and a missing value print nothing. A list or an object prints as JSON text.
- **Truth.** An empty string, `null`, `false` and an empty list are false. Everything else is true, and that includes `0` and `"0"`.
- **Equality.** `==` and `!=` compare as text, so `1 == "1"` is true. `nil`, `null` and `blank` are the same empty value, and an empty text setting is `""`, which is not equal to it: test `settings.x != ""`, or just `settings.x`.
- **Order.** `<`, `<=`, `>` and `>=` compare as numbers.
- **`contains`** looks for a piece of text in text, or an item in a list.
- **`and`, `or`, `not`** and parentheses combine conditions. `not` takes everything after it, so `not settings.a == "x"` is `not (settings.a == "x")`.
- **Paths** are dots and literal indexes: `blocks[0]`, `settings["key"]`. There are no computed lookups such as `items[forloop.index0]`. A list has `.size`, `.length`, `.first` and `.last`; text has `.size` and `.length`.
- **Loops.** `{% for x in list %}` runs its `{% else %}` when the list is empty or is not a list.

## Filters

`{{ value | filter: argument, argument }}`, chained left to right: `{{ settings.heading | strip | truncate: 60 }}`.

@[filters]

## Values in CSS

A section's `<style>` can print values with `{{ }}` too, and reads the same names. A value going into CSS loses any `<`, `>`, `{`, `}` and `;` and any `@import`, so it cannot end the rule it is in. Where a value differs per instance, prefer a custom property set in the markup and a static rule that reads it: the stylesheet stays the same for every instance. See [Styling](/developers/styling#settings-in-css).

A setting read only in `<style>` still counts as unread for the compiler's warning about settings a template never reads. The warning does not stop a save.

## In a script

A section's `<script>` receives `settings`, `blocks`, `theme` and `page` too, but not worked out the way a template's are: see [JavaScript](/developers/javascript#the-scripting-api).

## What the language does not have

It is not Liquid, although it looks like it. These are not in the language, and an unknown tag is a compile error:

- `assign`, `capture`, `include`, `render`, `unless`, `case`, `break`, `continue` and a `raw` tag,
- whitespace control, `{%-` and `-%}`,
- ranges such as `(1..3)`, and arithmetic with `+` or `-`: use the `plus` and `minus` filters,
- filters for dates or money. Prices arrive formatted, and a date has to be text in a setting.

An unknown **filter** is not refused: it prints the value unchanged. Check a filter's name against the table above.
