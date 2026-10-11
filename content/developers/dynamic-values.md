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
| `collections` | The creator's published collections the page was handed, shaped like blocks: `block.settings.title`, `handle`, `description`, `image`, `url`, `products_count` and `products`. Every one on the collections page; elsewhere, the ones a `collection_picker` or `collection_list` names, and empty where nothing does. |
| `shop` | The store: its name, tagline, logo, social links and, where a section asks for it, its support email; with `shop.description` and `shop.product_count` on a published page. |
| `routes` | The addresses every website answers on, such as the cart, the account and the contact page. |
| `customer` | The signed-in visitor and their orders, on the account page. `null` everywhere else. |
| `wishlist` | The visitor's saved products, on the account and Wishlist pages. `null` everywhere else. |
| `creator` | The creator's public profile: `creator.name`, `creator.headline`, `creator.bio`, `creator.avatar`. |
| `collection` | On a collection's page (`/collections/<handle>`), that collection: `title`, `handle`, `description`, `image`, `url`, `products_count` and `products`. In the builder's Collection page, the first collection stands in. `null` everywhere else. |
| `request` | Where the page is: `request.page_type` (the template, as `page.template`), `request.path` when the route knows it, and `request.design_mode`, `true` in the builder's canvas. |
| `product` | On a product page, the product it shows: `title`, `price`, `compare_price`, `description` (words), `description_html` (cleaned markup, printed with `raw`), `image`, `images`, `url`, `includes`, `id`. Empty everywhere else, so `{% if product %}` tells a section where it is. |
| `forloop` | The loop being drawn: `index`, `index0`, `first`, `last`, `length`. |

Nothing else can be read. The compiler checks every path against this list and against the schema beside it, so `{{ shop.nmae }}` and `{{ settings.headng }}` are both errors with a line number, not an empty space on the page. A loop variable, `block` in `{% for block in blocks %}`, is checked against the block settings the schema declares.

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
| `page_picker` | The page's address, such as `/about`. |
| `product_picker` | Prints as the product's address, such as `/products/preset-pack`, and carries the product: `.title`, `.price`, `.compare_price`, `.image`, `.url`, `.tag`. A product that is not this creator's and published is an address with no fields. |
| `product_list` | The chosen products, in order, shaped like `products`. |
| `link_list` | A menu: `{ handle, title, links }`, each link `{ title, url, links }`. |
| `inline_richtext`, `html` | Cleaned HTML. Print it with `raw`. |
| `color_background` | A colour or a CSS gradient, checked piece by piece. |
| `datetime` | `2026-03-14` or `2026-03-14T23:00`, as written. Print it with the `date` filter. |
| `focal_point` | Two percentages, such as `30% 70%`, for `object-position`. |
| `video_url` | A YouTube or Vimeo link. Print it through `embed`. |
| `community_picker` | Prints as the community page's address, such as `/community/morning-runners`, and carries the community: `.name`, `.tagline`, `.image`, `.logo`, `.members`, `.members_label`, `.posts`, `.events`, `.price`, `.join_label`, `.url`. A community that is not this creator's, published and public, or any community while communities are off, is empty. |

A stored value the control does not allow is read as the default, as if it had never been set: a word in a `range`, an option a `select` does not list, a link to `javascript:`. The stored value is kept. A setting may also hold a placeholder such as `{{ shop.name }}`, filled in before the section is drawn: see [Shop data in a setting](/developers/schema#shop-data-in-a-setting).

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
| `page.product` | On a product page, the product it is about: the fields of a product in `products` and its description. Empty everywhere else. See [Selling](/developers/selling#the-product-page-pageproduct). |
| `page.title` | The page's own title, such as `About`, on the creator's own pages. |
| `page.breadcrumbs` | Where the page is, as a list of `{ label, url }`: Home, then Shop and the product on a product page, or the page's title. The last has no `url`. Empty on home. See [Selling](/developers/selling#breadcrumbs). |
| `page.filters` | On the shop, search and collection pages, the filter form: groups, values, counts and the sort. See [Selling](/developers/selling#filtering-the-shop). |
| `page.pagination` | On the shop and collection pages, `pages`, `prev_url`, `next_url` and `links` (`number`, `url`, `current`). |

`page.template` on each page:

| Page | On the live site | In the builder |
| --- | --- | --- |
| Home | `index` | `index` |
| A product page | `product` | `page.product` |
| A collection's page | `collection` | `collection` |
| The shop | `page.products` | `page.products` |
| Search results | `page.search` | `page.search` |
| The 404 page | `page.404` | `page.404` |
| The account, sign in and Wishlist pages | `page.account`, `page.login`, `page.wishlist` | the same |
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

### The theme's general settings

What other store themes read as `settings.logo` and the other general settings, a Storelib section reads under `theme`, because a section's own `settings` are its own. Each has Theme settings' default filled in, so a site that never opened a panel still gives a value:

| Path | What it is |
| --- | --- |
| `theme.logo.url` | The logo from Theme settings › Branding, or `""`. |
| `theme.logo.width` | Its width in px. |
| `theme.logo.mobile_url`, `theme.logo.mobile_width` | The phone logo and its width, or the logo when there is no phone logo. |
| `theme.logo.text` | The store's name, for when there is no logo picture. |
| `theme.favicon` | The favicon's address, or `""`. |
| `theme.buttons` | `.style` (`filled`, `outline`, `ghost`), `.shape`, `.radius`, `.size`, `.weight`, `.shadow`, `.hover`. |
| `theme.layout` | `.page_width`, `.padding_x`, `.section_gap`, `.spacing_scale`, `.card_radius`, `.image_radius`, `.card_shadow`. |
| `theme.animation` | `.enabled`, `.style`, `.duration`, `.stagger`. A section's own `animation` setting overrides it: see [Schema](/developers/schema#a-sections-own-animation). |
| `theme.socials` | The social links that are set, the same list as `shop.socials`. |
| `theme.brand` | Theme settings › Brand information: `.headline`, `.description`, `.image`, `.image_width`. |
| `theme.badges` | `.sale` (whether a discounted product shows Sale), `.sale_text`, `.position` (`top_left`, `top_right`, `bottom_left`). |
| `theme.cart` | `.type`: `drawer`, `page` or `notification`, what Add to cart does. |
| `theme.currency` | `.code` (`USD`) and `.show_code`, whether prices carry it. Prices a section is handed already do. |
| `theme.schemes` | Every colour scheme, by key. |
| `theme.typography` | The fonts and the nine text styles. |

```storelib
<a class="brand" href="{{ routes.root_url }}">
  {% if theme.logo.url %}<img src="{{ theme.logo.url }}" alt="{{ theme.logo.text }}" width="{{ theme.logo.width }}" height="40">{% else %}{{ theme.logo.text | default: shop.name }}{% endif %}
</a>
{% for link in shop.socials %}<a href="{{ link.url | url }}">{{ link.label }}</a>{% endfor %}
```

`theme.logo.width` is the width stored in Theme settings. A section may ignore it and size the logo with its own setting, or with CSS. The height in the example is the section's choice, not a required size. Colour of the wordmark is the section's too.

The same values reach CSS as custom properties on the page, `var(--theme-page-width)`, `var(--theme-button-radius)`, `var(--theme-spacing-scale)` and the rest, listed in [Styling](/developers/styling#the-page-a-section-sees).

`theme.settings` has every theme setting exactly as stored: `theme.settings.brand_name`, `theme.settings.logo_url`, `theme.settings.tagline`, `theme.settings.social_instagram`. A key a website has never set is absent there, so prefer the paths above, or give it a fallback:

```storelib
<a class="brand" href="/">{{ theme.settings.brand_name | default: "Shop" }}</a>
```

## Menus

A `link_list` setting is one of the site's menus, chosen by the creator. Menus are made in Website settings, Navigation, and `main-menu` is always there: it is the header's own links, sub links included, unless the creator made a menu by that name.

```json
{ "type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu" }
```

| Path | What it is |
| --- | --- |
| `settings.menu.handle` | The menu's handle, such as `main-menu`. |
| `settings.menu.title` | Its name, such as Main menu. |
| `settings.menu.links` | Its links in order. |
| `link.title`, `link.url` | One link's words and address. The address is already made safe. |
| `link.links` | The links under it, the same shape, two levels deep at most. Empty when it has none. |

```storelib
<nav aria-label="{{ settings.menu.title }}">
  {% for link in settings.menu.links %}
    {% if link.links.size > 0 %}
      <details><summary>{{ link.title }}</summary>
        {% for child in link.links %}<a href="{{ child.url | url }}">{{ child.title }}</a>{% endfor %}
      </details>
    {% else %}
      <a href="{{ link.url | url }}">{{ link.title }}</a>
    {% endif %}
  {% endfor %}
</nav>
```

A menu is read live on every page, in the builder and on the published site, so a link the creator adds in Navigation appears in every section that shows that menu. A handle with no menu behind it is an empty menu, never an error.

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

It has more than these: every picture, the options, the buy link and whether it can be bought. The full list is in [Selling](/developers/selling#products-reach-a-section-as-products).

Which products a page has:

| Where | `products` |
| --- | --- |
| Home, the shop and your own pages, live | The newest 24 published products. A change to a product reaches the site within about a minute. |
| Search results, live | Those of the 24 that match `page.query` and the filters in the address, in the order asked for. |
| The shop, live, with filters in the address | Those of the 24 that pass them, in the order asked for. |
| A product page, live | The newest 24 published products. The product the page is about is `page.product`. |
| The builder | Up to 100 of the newest published products, on every page. |

```storelib
{% for block in products %}
  <a class="card" href="{{ block.settings.url | url }}">{{ block.settings.title }} <span>{{ block.settings.price | default: "Free" }}</span></a>
{% else %}
  {% if page.in_editor %}<p>Publish a product and it appears here</p>{% endif %}
{% endfor %}
```

A template never does money: print `price` as it arrives. See [Selling](/developers/selling).

## shop

The store the website belongs to, from what the creator has already set, so a section never asks for it twice:

| Path | What it is |
| --- | --- |
| `shop.name` | The brand name from the theme settings, else the store's name from Settings › Store details, else the creator's name. |
| `shop.tagline` | The tagline from the theme settings, or empty. |
| `shop.logo` | The logo's URL, or empty. |
| `shop.url` | `/`, the website's home. |
| `shop.socials` | The theme's social links that are set, each `{ key, label, url }`, such as `{ key: "instagram", label: "Instagram", url: "https://…" }`. Only `https`, `http` and path links are kept. |
| `shop.email` | The support email from Settings, on a page where a section has a `show_email` setting turned on. Empty everywhere else, so an address is never printed by a section that did not ask for it. |

```storelib
<h2>{{ settings.heading | default: shop.name }}</h2>
{% for link in shop.socials %}<a href="{{ link.url | url }}">{{ link.label }}</a>{% endfor %}
```

## routes

The addresses every Storelib website answers on. Link to them by name rather than typing the path:

| Path | Where it goes |
| --- | --- |
| `routes.root_url` | `/` |
| `routes.products_url` | `/products`, every product |
| `routes.search_url` | `/search` |
| `routes.cart_url` | `/cart` |
| `routes.contact_url` | `/contact` |
| `routes.wishlist_url` | `/wishlist` |
| `routes.account_url` | `/account`, which sends a visitor who is not signed in to the sign in page |
| `routes.account_login_url` | `/account/login`, the sign in page: an email, then the code sent to it. A new email makes the account there, so there is no separate sign up. Add `?return=/a/path` to land somewhere else afterwards. |
| `routes.account_signin_url` | The sign in page too. |
| `routes.account_register_url` | The sign in page too: a new email makes the account. |
| `routes.account_code_url` | Where the sign in page's email form posts `email` (and `return`). Sends the code. |
| `routes.account_verify_url` | Where the code form posts `code`. Signs the visitor in. |
| `routes.account_profile_url` | Where the account page's form posts `name`. |
| `routes.account_logout_url` | `/account/logout`. Post a form to it: `<form method="post" action="{{ routes.account_logout_url }}" data-storelib-form="native">` |
| `routes.password_url` | `/password`, the page a website shows while its owner asks visitors for a password. |
| `routes.password_enter_url` | Where the password page's form posts `password` (and `return`). Lets the visitor in for thirty days. |

Post these forms with `data-storelib-form="native"`, so the browser sends them and the page follows where the answer leads.

## customer

The customer who is signed in, on the account page. A customer account belongs to your website alone, the way a store's does: it is made the first time somebody signs in with an email, and it is not a Storelib login. `null` on every other page, and on the account page for a visitor who is not signed in, so test it before reading it:

| Path | What it is |
| --- | --- |
| `customer.name` | The name they gave on their profile, or empty. |
| `customer.first_name` | The first word of it. |
| `customer.email` | The email they signed in with. |
| `customer.orders_count` | How many orders they have placed with you. |
| `customer.orders` | Those orders, most recent first, one per payment, each `{ number, date, status, total, items, item_count, action_label, action_url }`. `items` is a list of `{ title, image, url, variant }`. `status` is in words (`Complete`, `Confirmed`, `Shipped`, `Delivered`, `Partly refunded`, `Refunded`, `On hold`). `action_url` opens the order's receipt on Storelib, which is also where its files are, and `action_label` says what it does: `Download`, `Access` or `View order`. |
| `customer.sample` | `true` in the builder only, where there is no customer: the name and email are the words "Customer name" and "Customer email", and the orders are your own products. Style them as placeholders. |

```storelib
{% if customer %}
  <p>{{ customer.orders_count }} orders</p>
{% else %}
  <a href="{{ routes.account_login_url }}">Sign in</a>
{% endif %}
```

## wishlist

The products the visitor saved, on the account page and the Wishlist page. `null` on every other page: a cached page cannot know who is looking. A section anywhere can still draw a heart, and the page fills it in; see [Saving products](/developers/javascript#saving-products).

| Path | What it is |
| --- | --- |
| `wishlist.items` | The saved products, most recently saved first, each `{ id, title, price, compare_price, image, url, tag }`, the same fields as a product's `settings`. |
| `wishlist.count` | How many. |
| `wishlist.signed_in` | `true` when the list is the visitor's account's and follows them to any device, `false` when it is kept in this browser. |

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

A loop can take part of its list: `limit:` and `offset:` after the list, each a number or a setting, and `reversed`. The offset is taken first, then the limit, then the order is turned round, and `forloop` counts what is drawn.

```storelib
{% for block in products limit: settings.product_count %} … {% endfor %}
{% for block in products offset: 1 limit: 3 reversed %} … {% endfor %}
```

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

It looks like other template languages, but these are not in it, and an unknown tag is a compile error:

- `assign`, `capture`, `include`, `render`, `unless`, `case`, `break`, `continue` and a `raw` tag,
- whitespace control, `{%-` and `-%}`,
- ranges such as `(1..3)`, and arithmetic with `+` or `-`: use the `plus` and `minus` filters,
- filters for money. Prices arrive formatted. A date is a `datetime` setting, printed with the `date` filter.

An unknown **filter** is not refused: it prints the value unchanged. Check a filter's name against the table above.
