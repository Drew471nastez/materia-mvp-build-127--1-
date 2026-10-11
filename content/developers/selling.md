# Selling: products, checkout and payments

A Storelib website sells the creator's products, and the part that takes the money is Storelib's, not the section's. A section shows products and sends a buyer to checkout. It never takes a payment, never asks for a card, and never loads a payment script. This page is what a section, and whoever writes it, needs to know about that: the product data a section reads, the buy link, and where the buyer goes after paying.

## Products reach a section as `products`

`products` holds the creator's published products, newest first, up to 24 on the live site, in the same `{ id, type, settings }` shape as blocks. The platform reads them on the server when the page is drawn, so a price changed in the shop is on the website within a minute. On the search page it holds the products that match. Which list each page has is in [Dynamic values](/developers/dynamic-values#products).

| Field | What it is |
| --- | --- |
| `block.id` | The product's id. Checkout takes it. |
| `block.settings.title` | Its name. |
| `block.settings.price` | Its price, already formatted, such as `$48.00`. Empty when it costs nothing. For pay what you want, the lowest price. |
| `block.settings.compare_price` | The price before a sale, formatted, or empty. Show it struck through. |
| `block.settings.currency` | `USD`. Every price on Storelib is charged in US dollars. |
| `block.settings.free` | `true` when it costs nothing. Write your own word for it, such as "Free", as a setting. |
| `block.settings.pay_what_you_want` | `true` when the buyer chooses the amount, from `price` up. |
| `block.settings.image` | Its main picture, or empty. |
| `block.settings.images` | Every picture, the main one first. Loop over it for a gallery. |
| `block.settings.url` | Its page on this website, such as `/products/preset-pack`. |
| `block.settings.slug` | The last part of that address, `preset-pack`. |
| `block.settings.kind` | What kind of product it is, as it was made: `digital`, `course` and so on. |
| `block.settings.available` | `true` when it can be bought. Stock is not read yet, so today it is always `true`. |
| `block.settings.tag` | `Sold out` when it cannot be bought, or empty. Today it is always empty, because stock is not read yet. |
| `block.settings.checkout_url` | Storelib checkout for this product, `/checkout?productId=<id>&src=website`. Empty when it cannot be bought. |
| `block.settings.variants` | Its options, such as sizes or licences. Empty when it has none. See below. |
| `block.settings.category` | Its category as the creator filed it, or empty. |
| `block.settings.options` | A product that ships: its options by name with their values, such as `{ name: "Size", values: ["S", "M"] }`. Empty for the rest. |

Templates do not do money: never compute, round or convert a price. Show the text you are given.

## Products are read, never typed

A product on a Storelib website is always a real one. A section never holds a product's name, price, photo or stock as text: not in its markup, not in a setting's default, not in a block, not in a preset. Typed, the product is wrong the day its price changes, it never sells out, and its buy button buys nothing.

A section written by Storelib AI, an agent over MCP, the agent API or a push from GitHub is held to it when it is saved:

| Refused | Because |
| --- | --- |
| A price that is a setting on a product (a `product` block or a product section with a `price` text setting), unless it is only the fallback for a `product_picker` beside it, printed after the product's own: `{{ settings.product.price \| default: settings.price }}` | The shop already has the price. Loop `products`, a `product_list` or a collection, or pick one with a `product_picker`. |
| A section about products (its type or category says so) that reads none of the shop's | It would draw nothing real. |
| A price written into the markup, a default or a preset, such as `$48.00`, or a list of products in a script | Prices are printed from the product they belong to. |

A pricing table, a menu of dishes, an event's tickets or a service's rates are priced by hand on purpose, and are left alone. A person writing in the builder's code editor is not held to it.

## Which products: the sidebar decides

The way Storelib's own product sections offer products: a `source` select, and a picker for each source that needs one, shown only when it is chosen.

```json
{ "type": "select", "id": "source", "label": "Products", "default": "shop", "options": [
  { "label": "All products, newest first", "value": "shop" },
  { "label": "A collection", "value": "collection" },
  { "label": "Products I choose", "value": "chosen" } ] },
{ "type": "collection_picker", "id": "collection", "label": "Collection", "visible_if": "{{ section.settings.source == 'collection' }}" },
{ "type": "product_list", "id": "chosen", "label": "Products", "limit": 12, "visible_if": "{{ section.settings.source == 'chosen' }}" },
{ "type": "range", "id": "product_count", "label": "Products to show", "min": 1, "max": 24, "step": 1, "default": 8, "visible_if": "{{ section.settings.source != 'chosen' }}" }
```

```storelib
{% if settings.source == 'collection' %}
  {% for block in settings.collection.products limit: settings.product_count %} …the card… {% endfor %}
{% elsif settings.source == 'chosen' %}
  {% for block in settings.chosen %} …the card… {% endfor %}
{% else %}
  {% for block in products limit: settings.product_count %} …the card… {% else %}
    {% if page.in_editor %}<p>Your published products appear here</p>{% endif %}
  {% endfor %}
{% endif %}
```

Each list is block-shaped, so the card is the same markup in every branch. `settings.collection.products` is the collection's own order, up to twelve; `settings.chosen` is the creator's order, and a product that is unpublished or deleted is left out. `limit:`, `offset:` and `reversed` work on any loop, each a number or a setting.

An empty state says what to do, behind `page.in_editor`, so a visitor never sees it. Nothing stands in for a product: with none published, the section draws nothing on the live site.

## A product's options: `variants`

A product with options is bought as one of them. Each entry in `block.settings.variants` has:

| Field | What it is |
| --- | --- |
| `variant.id` | The option's id. |
| `variant.name` | Its name, such as `Commercial licence`. |
| `variant.price` | Its own price, formatted, or empty when it is free. |
| `variant.compare_price` | Its price before a sale, or empty. |
| `variant.free` | `true` when this option costs nothing. |
| `variant.available` | `true` when it can be bought. Always `true` today, as above. |
| `variant.checkout_url` | Storelib checkout for this option, `/checkout?productId=<id>&variantId=<option id>&src=website`. |

A product with options that is sent to checkout without one arrives with its first option chosen, and the buyer can change it there.

## The product page: `page.product`

Every product has a page on the website at `/products/<slug>`. A section placed on the product page reads the product the page is about as `page.product`, with the same fields as a product in `products`, and one more:

| Field | What it is |
| --- | --- |
| `page.product.settings.description` | The product's description as plain text, line breaks kept. It is text, never HTML: print it with `{{ }}` and give it `white-space: pre-line`. |

On a product page `products` is there too, the newest 24, for a row of more products under this one.

In the builder, while the product page is open, `page.product` is the newest product, so the section draws something real. There it has no description and no options yet. On any other page it is empty, so a section written for the product page draws nothing without it, and a note behind `page.in_editor` for the creator, as the example below does. `"allowed_templates": ["product"]` in its schema says where it belongs, though Add Section does not act on that yet: see [Schema](/developers/schema).

## The main product section

The product page's own section is `product`, the one every product template starts with. It reads whichever product's page is open, on the live site and in the builder (where it is the product chosen to preview), and is built the way a store theme's main product section is: the product's pictures in one column, and blocks in the other, which the creator adds, removes, reorders and styles in the sidebar.

| Block | What it draws |
| --- | --- |
| `breadcrumbs` | Home > Shop > the product. |
| `badges` | Sale (or the saving, such as `20% off`), New for a set number of days, and Sold out. |
| `title` | The product's name, as H1 or H2, at a size and weight. |
| `price` | The price, and the price before a sale struck through with the saving. For pay what you want, the lowest price. |
| `variant_picker` | The product's options, as buttons or dropdowns. An option named Colour or Color is drawn as swatches: a colour named in its value (`Navy`, `#1f2a44`), or the variant's own picture. A value that cannot be bought is crossed out. |
| `pay_what_you_want` | The amount box for a pay what you want product, with amounts to tap and the lowest price. Draws nothing on a product with a price. |
| `quantity` | A stepper, up to the stock left, on a product that ships. A download, a course or a membership is bought once. |
| `buy_buttons` | Add to cart and Buy now, side by side or one under the other. A free product has one button, straight to the download. |
| `low_stock` | "Only 3 left" at or under a threshold, when stock is counted. |
| `description` | The product's description, cleaned for the page. |
| `collapsible_tab` | A heading that opens to rich text, or to the description. |
| `text`, `icon_with_text`, `divider` | Words, an icon beside a heading and a line, and a rule. |
| `share`, `wishlist` | Copy link, X, Facebook, Pinterest and email; the site's wishlist. |
| `files` | The kinds and sizes of the files a download holds. |
| `custom_code` | HTML and CSS of the creator's own. Scripts are removed. |

Every block has its own space above and below, and its colours follow the section's scheme until the creator picks others.

The section's settings are the media: **Stacked**, **Grid** (two to a row), **Slideshow with thumbnails** or **Carousel**; the media column's width (35% to 75%); the pictures' shape; on a phone a row to swipe with dots, or one under the other; a click that opens the picture larger, with zoom; and the details column kept in view while the pictures scroll past on a computer. Every picture is drawn once, however it is stored, and choosing a variant shows its picture.

**From the choice to checkout.** The chosen variant, the quantity and the amount a buyer named go into the cart, which opens, or straight to checkout with Buy now. Checkout reads every price again from the product and the variant; a named amount is held to the product's own lowest price and to $10,000, and a basket with an amount below the lowest is refused with the reason. A product that ships goes to the physical checkout with its variant and quantity.

A product section saved before it had blocks draws the blocks its old switches described, and the builder shows them in the sidebar when the page opens. Nothing stored is removed.

Write a new section for the product page only for something these blocks cannot do. Reading `page.product` is how.

## Filtering the shop

The shop (`/products`) and the search page filter the way a store's collection does: a price range, in stock only, the kind of product, the values of its options (Size, Colour) and an order. The address is the state, so a filtered list can be linked and reloaded:

```
/products?price_min=10&price_max=50&available=1&type=physical&opt.size=M&sort=price-asc
```

| Parameter | What it does |
| --- | --- |
| `q` | The words searched for (the search page). |
| `price_min`, `price_max` | Whole dollars. |
| `available` | `1` for in stock only. |
| `type` | A product kind, such as `digital` or `physical`. More than one is either. |
| `opt.<option>` | An option's value, such as `opt.colour=Black`. More than one is either. |
| `sort` | `featured`, `newest`, `price-asc`, `price-desc`, `title-asc` or `title-desc`. |

The page lists the products that pass as `products`, in that order, and hands the section `page.filters`:

| Path | What it is |
| --- | --- |
| `page.filters.groups` | Each `{ label, param, values }`; each value `{ label, value, count, checked, disabled, swatch }`. A group that would not narrow anything is left out. |
| `page.filters.price` | `{ show, min, max, from, to }`, in whole dollars. |
| `page.filters.sort_options` | Each `{ value, label, selected }`. |
| `page.filters.chips` | Each filter that is on, `{ label, url }`, the url turning it off. |
| `page.filters.count_label`, `.count`, `.total` | `12 products`, and the numbers. |
| `page.filters.clear_url`, `.path`, `.active`, `.active_count`, `.q` | Clearing them, where the form goes, and whether any is on. |

The Product grid (with **Show filters** on, as the shop has) and Search results draw it: a sidebar on a computer, a panel under a Filter button on a phone. It is a plain `GET` form with an Apply button, so it works before any script; on the live site a ticked box applies at once. A form of your own works the same way: `method="get"`, `action="{{ page.filters.path | url }}"` and `data-storelib-filters` on the form.

## Breadcrumbs

Every page but home has `page.breadcrumbs`, a list of `{ label, url }`: Home, then Shop and the product on a product page, the shop's name on the shop, or the page's own title. The last has no `url`, because it is the page being read. The **Breadcrumbs** section draws it on any page, with its own words for Home and Shop, a separator, a size and an alignment; the product section has the same trail as a block.

## Two ways to sell from a section

**Link to the product's page.** Every product has a page on the website with its pictures, its description and the Buy and Add to cart buttons, which already work. This is the right link for a card in a grid.

```storelib
{% for block in products %}
  <a class="card" href="{{ block.settings.url | url }}">
    {% if block.settings.image != "" %}<img src="{{ block.settings.image }}" alt="{{ block.settings.title }}" width="600" height="600" loading="lazy">{% endif %}
    <span class="card__title">{{ block.settings.title }}</span>
    <span class="card__price">
      {% if block.settings.compare_price != "" %}<s>{{ block.settings.compare_price }}</s>{% endif %}
      {{ block.settings.price }}
    </span>
  </a>
{% endfor %}
```

**Link straight to checkout.** For a section whose job is the purchase, a hero with one product or a pricing table, send the buyer to Storelib checkout with the product's own buy link:

```storelib
{% if block.settings.available %}
  <a class="buy" href="{{ block.settings.checkout_url | url }}">{{ settings.button_label }}</a>
{% else %}
  <span class="sold">{{ block.settings.tag }}</span>
{% endif %}
```

`src=website` in that link is how the order is recorded as a Website order in the creator's Orders. Use `checkout_url` rather than writing the link yourself, and it is always right.

## One product, chosen in the sidebar

To let the creator pick which product a section shows, give it a `product_picker` setting. The sidebar lists their products with a picture, a name and a price, searchable. The setting reads as the product itself, whether it is among the newest 24 or not:

```storelib
{% if settings.product.title %}
  <h2>{{ settings.product.title }}</h2>
  <p>{{ settings.product.price }}{% if settings.product.compare_price %} <s>{{ settings.product.compare_price }}</s>{% endif %}</p>
  {% if settings.product.image %}<img src="{{ settings.product.image | asset }}" alt="{{ settings.product.title }}">{% endif %}
  <a class="buy" href="{{ settings.product.checkout_url | default: settings.product | url }}">{{ settings.button_label }}</a>
{% elsif page.in_editor %}
  <p>Choose a product in the sidebar</p>
{% endif %}
```

Printed on its own, `{{ settings.product | url }}` is still the product's page address. The setting holds the address, the id or the handle, so an imported theme's `waxed-tote` resolves too.

### This page's product: `@current`

On the product page the first choice in the picker is **This page's product**, stored as `@current`. One section set once then shows each product on its own page, the way a setting with a dynamic source does. On any other page `@current` is empty, never another product.

### Several products, in the creator's order

A `product_list` setting is looped exactly like `products`: `{% for block in settings.featured %}` with the same `block.settings` fields.

### Collections

A `collection_picker` reads as the collection: `settings.collection.title`, `.url`, `.products_count`, and `.products` to loop. A `collection_list` is several, `{% for block in settings.collections %}`. On `/collections/<handle>` the page's own collection is `collection` in every section, and a collection picker set to `@current` is that collection. Every member is on the page, not only the newest 24.

### Custom fields

A product can carry up to twenty named details the creator writes in the product editor's Custom fields card: Material, Care, Length, an ISBN. A section prints them by name, in lower case with underscores for spaces ("Care instructions" is `care_instructions`):

```storelib
{% if block.settings.fields.material %}<p>{{ block.settings.fields.material }}</p>{% endif %}
{{ settings.product.fields.care_instructions }}
{{ page.product.fields.isbn }}
```

They are plain words, never markup, and an empty one is absent. They need SQL part 107; until it has run, products save and show as before, with no fields.

### A card's own words, never its price

A card the creator fills in starts from its product and may change a word or the picture: `{{ block.settings.title | default: block.settings.product.title }}`. Its price is always the product's, so it is never a setting. Defaults and presets never invent a product or a price. The section checker refuses a price setting on a product (`integration-product-typed`), a typed price, invented products in a default or a preset, and a product array in a script (`integration-products`), so the AI's sections follow this as well.

## Buy buttons and checkout

- A buy button links to `checkout_url`, or to one option's `variant.checkout_url`. Never build the address from pieces, and never add a price to it: checkout reads the price from the product.
- A product that is not `available` gets no buy button: show its `tag` instead, so the section is right on the day stock is read.
- **The buyer comes back to the website.** When a buy link is followed on a website, the site adds which website it is and the page the buyer was on. After paying, checkout sends the buyer back to that page with `?checkout=paid` on the address, and the site says the payment went through. Back on the checkout page goes to the same page.
- **A page of your own to come back to.** Add `return` to the link with a path on this site, such as `{{ block.settings.checkout_url }}&return=/thank-you`, and the buyer lands there after paying. `cancel` does the same for Back.
- **Only this creator's own addresses.** Checkout checks `return` and `cancel` on the server against the creator's own sites: their Storelib addresses and their verified domains. Anything else is ignored, never followed.
- **The receipt.** The receipt and its download link are emailed to the buyer either way. When checkout was not started on the creator's website, the buyer lands on the Storelib receipt, as before.

## What checkout does

- It is Storelib's page, at storelib.com, where the buyer is signed in. On a website's own address, `/checkout` goes there.
- The buyer pays by card or Google Pay, through Stripe. Every price is charged in US dollars.
- **The price is read from the product, never from the link or the page.** Nothing a section writes can change what is charged.
- A buyer who already owns a product is not charged for it again.
- After paying, a digital product is in the buyer's Storelib library straight away, and the download link is emailed to them.
- The money goes to the creator's connected Stripe account, set up in Settings › Payments.

## The cart

A website has a cart. The header's bag opens it, the product page's **Add to cart** fills it (with the variant, the quantity and, for pay what you want, the amount named) and opens it, and `/cart` shows it and sends it to checkout as one payment, after which the buyer comes back to the website's home page. It is kept in the visitor's browser, per shop, and every price in it is read again at checkout. A section adds to it with a button marked `data-storelib-add-to-cart`, and may draw a cart drawer of its own: see [Header and footer](/developers/header-and-footer).

## What a section may not do

- Build a payment form, or ask for a card number, a bank account or a password. Ever.
- Load Stripe, PayPal or any other payment or tracking script. A `<script>` tag in a template is refused when the file is saved, and a section's own script runs in a sandbox where `fetch` and the network are refused too.
- Put a price in a default, or invent a product, a discount or a review. Show the products the site has.
- Promise delivery times, refunds or guarantees the creator has not written. Those belong on the policy pages, which the creator edits.

## Where this lives in the builder

- **Website Settings › Commerce** shows how many products the website can show, what checkout takes and where payouts go.
- **Website Settings › Policies** has the refund, privacy and terms pages every website links to from its footer.
- A connected agent reads the site's products, with their ids, buy links and options, from `storelib_site`. See [Building with AI agents](/developers/ai).

## A product page done properly

A product page section: the product's pictures as a gallery that swipes on a phone, its price with the sale price struck through, its options as choices with a buy button for the one chosen (no script: radio inputs and `:checked`), the sold out state, and the description. Every word the section adds is a setting.

@[example:product_page]
