# Imported themes

A theme exported from another store platform can be imported into Storelib whole. The website then draws the theme's own templates, CSS and JavaScript on Storelib's engine, filled with the creator's Storelib products, collections, menus and settings. Nothing is rewritten into a native Storelib section and nothing is sent to the old platform: every address the theme's markup and scripts reach for is answered by Storelib.

This page is about that path: what is imported, which parts of the template language and the storefront APIs a theme can use, what the builder does with it, and what does not come across. Writing a native Storelib theme instead is covered by [Coming from another platform](/developers/shopify), and the builder's own settings compared with other theme editors are in [Theme editor parity](/developers/shopify-parity).

## Importing a theme

In **Website**, press **Import theme** and choose the `.zip` your old store's admin hands out (a GitHub download of Dawn, Horizon or a commercial theme works too). The file is 50 MB or less. It becomes a new draft website in the library; nothing goes live until it is published.

| In the zip | On Storelib |
| --- | --- |
| `layout/*.liquid` | The page shell, `layout/<name>.storelib` |
| `sections/*.liquid` | A section each, markup and schema |
| `blocks/*.liquid` | A theme block each |
| `snippets/*.liquid` | A snippet each, for `render` and `include` |
| `templates/*.json` | The website's pages, one per template, editable in the builder |
| `sections/*.json` | The header, footer and overlay groups, placed on every page |
| `config/settings_schema.json`, `settings_data.json` | The theme's settings and their values |
| `locales/*.json` | Kept, for `t` and for `t:` schema labels |
| `assets/*` | Stylesheets, scripts, icons and fonts kept as the theme's files; pictures and videos stored as media |

**Nothing is left out silently.** A file that is not part of a theme, a name Storelib cannot store, a setting the builder's panel has no control for, a tag Storelib does not know, or a picture that lived in the old store's own files rather than in the theme: each is a line in the import's report, with what was done about it. When the import finishes, the library says how many sections, blocks and pages came across and how many files were left out.

Each section is stored in the compatible profile of the template language: `<template compat="shopify">` holds the markup as the theme wrote it, and the `<schema>` carries two schemas at once. The Storelib one is what the builder's panel draws; the theme's own, under `"shopify"`, is what the page is drawn with, so a setting the panel cannot show still keeps its value and its default.

## Template language

The engine reads the theme's template language itself, and it is lenient: a tag that does not parse becomes a comment in the page and the rest of the file still draws, and a filter given the wrong kind of value prints nothing rather than failing the page.

**Tags.** `if`, `elsif`, `else`, `unless`, `case` and `when`, `for` with `break`, `continue`, `limit`, `offset`, `reversed` and `forloop`, `tablerow`, `assign`, `capture`, `increment`, `decrement`, `cycle`, `render` and `include`, `section`, `sections`, `content_for` (`"blocks"` and `"block"`), `block`, `form`, `paginate`, `style`, `layout`, `raw`, `comment`, `doc`, and `liquid` with `echo`. `schema`, `javascript` and `stylesheet` are read whole.

**Filters.** The language's own (strings, numbers, arrays, `date`, `default`, `json`), and the ones store themes use, each answered from Storelib's data:

| Family | Filters |
| --- | --- |
| Money | `money`, `money_with_currency`, `money_without_currency`, `money_without_trailing_zeros`, `money_amount`, `unit_price_with_measurement` |
| Images and media | `image_url`, `img_url`, `image_tag`, `img_tag`, `placeholder_svg_tag`, `video_tag`, `media_tag`, `external_video_tag`, `external_video_url`, `model_viewer_tag` |
| Assets and URLs | `asset_url`, `asset_img_url`, `file_url`, `file_img_url`, `shopify_asset_url`, `global_asset_url`, `stylesheet_tag`, `script_tag`, `preload_tag`, `inline_asset_content`, `link_to`, `within`, `url_for_type`, `url_for_vendor` |
| Translations | `t`, `translate`, read from the theme's own `locales/` |
| Colours | `color_to_rgb`, `color_to_hex`, `color_to_hsl`, `color_to_oklch`, `color_lighten`, `color_darken`, `color_saturate`, `color_desaturate`, `color_mix`, `color_modify`, `color_brightness`, `color_contrast`, `color_extract`, `color_difference`, `brightness_difference`, `hex_to_rgba` |
| Fonts | `font_face`, `font_url`, `font_modify`, served from a public font library |
| Tags and forms | `link_to_tag`, `link_to_add_tag`, `link_to_remove_tag`, `highlight_active_tag`, `default_errors`, `default_pagination`, `customer_login_link`, `customer_logout_link`, `customer_register_link` |
| Commerce | `payment_type_svg_tag`, `payment_type_img_url`, `payment_button`, `weight_with_unit`, `format_address`, `structured_data`, `item_count_for_variant`, `line_items_for` |

**Colours.** A `color` setting, a colour scheme's colours and each entry of a palette setting (`settings.color_palette`) are colour objects with `.rgb`, `.alpha` and the colour filters, as themes expect them.

**Objects.** `shop`, `settings`, `section`, `block`, `product`, `collection`, `collections`, `all_products`, `cart`, `customer`, `linklists`, `routes`, `request` (with `design_mode`), `localization`, `template`, `page`, `page_title`, `page_description`, `canonical_url`, `search`, `predictive_search`, `recommendations`, `content_for_header` and `current_page`. Money is in cents, as themes expect.

`shop.name` is the website's brand name from Theme settings, else the store's name from Settings › Store details. `shop.policies` and `shop.refund_policy` (and the other three) are the creator's own policy pages. `shop.enabled_payment_types` lists what Storelib's checkout takes: Visa, Mastercard, American Express, Apple Pay and Google Pay.

**Metafields.** A product's custom fields from the product editor are `product.metafields.custom.<key>`, each printing as its value and with `.value`, `.key` and `.type`, so `{{ product.metafields.custom.material }}` and `.material.value` both work. The product's questions are `product.metafields.storelib.faqs.value`, a list of `{ question, answer, answer_html }` in the order the product editor keeps them: `question` and `answer` are plain text, and `answer_html` is the answer escaped with a `<br>` for each line, safe to print as it is. `product.metafields.storelib.faqs` prints as how many there are and is blank for a product with none. Every product object has them, the page's product and any product a section features (a Featured product, `all_products`, a collection's products), the same in the builder's canvas as on the live site. A theme whose code reads `metafields.storelib.faqs` draws them itself; otherwise Storelib puts them in an empty collapsible row headed FAQ, a new row like the section's last, or under the description, on the product page and in a Featured product. On the product page, what the store offers with the product is `product.metafields.storelib.offers.value`: `{ bundles, quantityBreaks, checkoutOffers }`, the same JSON as `GET /api/offers?product=` ([Physical commerce](/developers/physical-commerce#upsells-and-bundles)), so a theme can draw its quantity breaks and bundles in Liquid.

**Size charts.** A product's size chart (Products › Size charts) is `product.metafields.storelib.size_chart`, which prints as the chart's name and is blank for a product with none. The chart is the one the product was given in the product editor, else one set for a collection it is in, else one set for its category. It is the same on the product's own page, in a featured product section, on a product card, in `all_products` and in a quick view, live and in the builder. Its `.value` is:

| Key | What it is |
| --- | --- |
| `name`, `title` | The chart's name, shown as the title when a buyer opens it |
| `unit` | `cm` or `in`, the unit the seller typed the numbers in |
| `unit_label` | That unit as it is printed |
| `units` | The units the chart can be read in: `["cm", "in"]` when a measurement column has a number in it, else only its own |
| `has_measurements` | Whether a measurement column has a number, so the cm and in switch means something |
| `columns` | A list of `{ name, measure, unit }`: `measure` is true for a measurement (Chest, Waist) and false for a label (Size, EU); `unit` is the measurement's unit, nil for a label |
| `rows` | A list of rows, each a list of cells as typed, one per column; the first cell is the size |
| `rows_cm`, `rows_in` | The same rows with the measurement columns in cm and in, so a theme can offer the switch without doing the arithmetic |
| `tables` | `{ cm: { unit, unit_label, rows }, in: { ... } }`, one entry per unit in `units` |
| `notes` | The line under the table, plain text |
| `notes_html` | The same note escaped, a `<br>` for each line, safe to print as it is |
| `image` | The picture of where to measure (an https address), or nil |
| `source` | `product`, `collection` or `category`: where the chart came from |
| `measuring_guide` | `{ text, image }`: the notes and the picture, for a How to measure part |

Numbers convert at 2.54 cm to the inch, to one decimal, every number in a cell ("86-91" becomes "33.9-35.8"), with the decimal mark the seller typed. A label column and a cell with words in it are left as typed.

Most Shopify themes read a size chart as a page in `product.metafields.custom.size_chart`; that is there too, unless the product has a custom field of that name: `.value.title` the chart's name, `.value.content` the table in the chart's own unit, and every key above beside them.

```liquid
{%- assign chart = product.metafields.storelib.size_chart.value -%}
{%- if chart -%}
  <table>
    <tr>{% for c in chart.columns %}<th>{{ c.name }}{% if c.measure %} ({{ chart.unit }}){% endif %}</th>{% endfor %}</tr>
    {% for row in chart.rows %}<tr>{% for cell in row %}<td>{{ cell }}</td>{% endfor %}</tr>{% endfor %}
  </table>
{%- endif -%}
```

A theme whose code reads the metafield draws the chart itself and Storelib adds nothing. To place Storelib's own link and chart (a pop-up with a cm and in switch, no script needed), render `{% render 'storelib-size-chart' %}` or use the filter `{{ product | storelib_size_chart: label: 'Size guide', style: 'button' }}`; both print nothing for a product without a chart. A section that takes `@app` offers **Size chart** under Apps in Add block, and a block a theme kept from a size chart app on Shopify (Kiwi Sizing and the like) is drawn as Storelib's chart. With none of these on the page, the product page gets a Size guide link beside its size option by itself.

**Reviews.** Storelib Reviews fills Shopify's standard review metafields from the product's published reviews (the ones the store shows on its website; sample reviews never count): `product.metafields.reviews.rating.value` is `{ rating, value, scale_min, scale_max }` (the average to one decimal, on 1 to 5) and prints as the average, and `product.metafields.reviews.rating_count.value` is how many. `product.metafields.storelib.reviews.value` has the same `average`, `count`, `scale_min`, `scale_max`, and on the product's page and a featured product `distribution`, five `{ stars, count, percent }` from five stars down. On the product's own page they are that page's reviews; a featured product reads the shop's ratings; a card has them while Stars on product cards is on. With none they are absent, so a theme's `!= blank` draws no stars. `{{ product | structured_data }}` writes the same numbers as its `aggregateRating`.
**Personalization fields.** A physical product can ask the buyer for something when they buy it: a name to engrave, a message, a photo to print (Products › the product › Personalization). The fields are `product.metafields.storelib.personalization`, which prints as how many there are. Its `.value` is a list in the seller's order, each:

| Key | What it is |
| --- | --- |
| `id` | The field's id, stable when the label is renamed: what an upload names it by |
| `label` | What the buyer is asked, exactly as the seller typed it. Print it as it is |
| `type` | `text` (one line), `textarea` (keeps line breaks) or `image` (a photo upload) |
| `required` | `true` when the item cannot be added or paid for without it |
| `max_length` | For text, the most characters (1 to 250); `nil` for a photo |
| `placeholder`, `help_text` | The hint inside the box and the line under it, either may be empty |
| `name` | The input name to post: `properties[<label>]` |
| `accept`, `max_size` | For a photo: `image/jpeg,image/png,image/webp` and 10485760 (10 MB) |

Each answer is posted with the product form as a line item property, `properties[<label>]`, the way every Shopify theme already sends them: a form post, `/cart/add.js` with `properties: { ... }` or `items: [{ id, quantity, properties }]`. The cart checks each line against the product's fields and answers **422** with `{ status, message, description }` (for example `Mug: Fill in Name to engrave`) when a required answer is missing, one is longer than its `max_length`, or a photo's answer is not an upload of this shop. The checkout checks again. Lines of the same variant with different answers are separate lines in the cart and on the order.

A photo is one of the buyer's pictures on a cart line ([Personalization in Physical commerce](/developers/physical-commerce)): `POST /cart/upload` with the file as `multipart/form-data` (a field named `file`) answers `{ "upload": { "value", "name", "width", "height" } }`, or `{ status, message, description }` with 400, 413, 415 or 429. Put `upload.value` in the field's `properties[<label>]` input. A product form posted as `multipart/form-data` with `<input type="file" name="properties[<label>]">` works too: the file is kept and its value put in its place before the cart reads the form.

The value (`/api/cart/uploads/<id>.<signature>/<name>`) opens the picture only in the browser that sent it, on that store; the store opens and downloads it from the order once it is paid. It contains `/uploads/`, so a cart template that shows uploads as links keeps working, and a cart says it by its file name.

Storelib's script sends the photo, and holds Add to cart while a required field is empty, for markup in this shape anywhere on the page: a wrapper with `data-storelib-personalization` and `data-product-id`; each field with `data-storelib-pz-field="<id>"`, `data-label`, `data-required` when required, and a `.sl-pz__err` element for its message; for a photo, a hidden input named `properties[<label>]` with `data-storelib-upload-value` and a nameless `<input type="file" data-storelib-upload>`. The full contract, with a ready snippet, is in the repository at `docs/theme-contracts/personalization-and-custom-fields.md`.

A theme whose code reads the metafield (or renders the snippet, or uses the filter) draws the fields itself and Storelib adds only its script. To place Storelib's own fields, render `{% render 'storelib-personalization' %}` or use `{{ product | storelib_personalization: heading: 'Make it yours' }}`; both print nothing for a product without fields. A section that takes `@app` offers **Personalization** under Apps in Add block, and a block a theme kept from a product options app is drawn as Storelib's fields. With none of these, the product page gets the fields inside its product form, above the buy buttons, by itself. `/products/<handle>.js` also lists them, as `personalization_fields`.

**Stock.** A variant Storelib counts, once it is at its low stock line, has `inventory_management` set and `inventory_quantity` as the number left, so a theme's "Only 3 left" shows (Website settings › Commerce › Show how many are left can turn it off). Otherwise `inventory_quantity` only says whether it can be bought.

A value Storelib does not have is present and empty, so a theme's `{% if %}` around it reads false: other metafields, metaobjects, vendors, blogs and articles, gift cards. A blog page draws the theme's blog template with its title and no posts.

## Sections, blocks and groups

Every page is the header group, the template's sections and the footer group. A section on a page has its settings and its blocks, nested theme blocks included, and the builder edits them with the same panel as any section.

**Storelib's own sections and app blocks need no file in the theme.** A template (in the ZIP, or pushed from GitHub) may name these, and they are kept with their settings and blocks:

| Type | What it is |
| --- | --- |
| `storelib-review-widget` | One of the store's review widgets, with the look saved in Storelib Reviews › Widgets (`widget`, `review_config`, `heading` and the rest) |
| `storelib-reviews` | The Storelib Reviews section: the product's reviews on its page, the shop's elsewhere |
| `shopify://apps/storelib-reviews/blocks/star-rating/storelib`, `.../blocks/reviews/storelib` | Star rating and Reviews, in any section that takes `@app` |
| `shopify://apps/storelib/blocks/stock-status/storelib`, `.../blocks/estimated-delivery/storelib` | Stock status and Estimated delivery |
| `shopify://apps/storelib-size-charts/blocks/size-chart/storelib` | Size chart |

Any other section type the theme has no file for is left off, and the import report (or the push's result) says which, and why. A push or a re-import whose template leaves out one of the creator's Storelib sections or app blocks keeps it where it was, after the section it followed, with its id and settings; the same section in both keeps the settings the creator saved.

**Dynamic sources.** A setting whose value is `{{ ... }}` is read where the section is drawn, on the live site and in the builder alike: `{{ product.metafields.custom.material }}`, `{{ closest.product.title }}`, `{{ shop.name }}`, `{{ product.metafields.reviews.rating.value.rating }}`, `{{ product.metafields.storelib.size_chart }}`, a Shopify dynamic source kept in the template, or text around them ("Made of {{ product.metafields.custom.material }}"). What it reads is escaped for the setting it lands in: a text or rich text setting gets each value with `| escape`, except a description or a page's content in a rich text setting, which is markup already cleaned; a description in a text setting is its words only; a link that is not an address becomes `#`. The builder's Shop data button on a setting offers what an imported theme can fill (the product's title, price, description, picture, address, rating, number of reviews and size chart, the shop's name, description, address and product count, the page title, the year), and `{{ product.price }}` there is the price formatted, not cents.

A theme's group files become Storelib's section groups:

| Theme | Storelib |
| --- | --- |
| `sections/header-group.json` | The header group, on every page |
| `sections/footer-group.json` | The footer group, on every page |
| `sections/overlay-group.json` and other floating groups | [The overlay group](/developers/header-and-footer#over-every-page-the-overlay-group): what floats over every page, such as a pop up |

**The Section Rendering API** works on any page: `?section_id=<id or type>` answers one section's markup, and `?sections=a,b` up to five as JSON, drawn for the page the request names. Cart responses carry `sections` when the request asks for them, the way a theme's cart drawer redraws itself.

## The cart

The cart lives in a cookie on the website's own host, up to 50 lines and 99 of each. Every cart address a theme uses answers, in HTML or JSON as the request asks:

| Address | What it does |
| --- | --- |
| `GET /cart.js`, `/cart.json` | The cart, in the shape themes expect |
| `POST /cart/add`, `/cart/add.js` | Adds `id` and `quantity`, or an `items` list, with `properties`; the same option with other properties is its own line. A multipart form's file inputs (`properties[Photo]`) are kept as the buyer's pictures (see Personalization in Physical commerce) |
| `POST /cart/upload` | One or more pictures (`file`), answered with `upload.value` for the line's properties |
| `POST /cart/change`, `/cart/change.js` | Changes one line, by `line` or by key |
| `POST /cart/update`, `/cart/update.js` | Sets quantities with `updates`, the `note`, and the discount codes with `discount` ("A,B"), which `/cart.js` lists as `discount_codes` with whether each applies |
| `POST /cart/clear`, `/cart/clear.js` | Empties it |
| `GET /cart/add?id=…&quantity=…` | A link that adds and opens the cart |
| `GET /cart/<variant>:<qty>,…` | A cart permalink: those lines, straight to checkout |

A request from a script (a JSON body, `X-Requested-With`, or `Accept: application/json`) is answered with JSON whatever the address ends in. A product that cannot be added is a `422` with a message the theme can show.

**Savings in the cart.** The store's quantity breaks, bundles and upsells come off the cart exactly as checkout will charge them, priced on the server, as Shopify's automatic discounts: each line's `line_level_discount_allocations` lists `{ amount, discount_application }` per offer (`type: "automatic"`, `title` the offer's name or the tier's label, `offer_id`), `final_line_price` and `final_price` are after them, and `cart.total_price`, `cart.original_total_price`, `cart.total_discount` and `cart.discount_applications` add up the same way, a discount code after the offers (`cart_level_discount_applications` when it is for the whole order). The same in `/cart.js`, every add, change and update answer, and the Liquid `cart`, so a theme's drawer and cart page show the right numbers without a script of their own. A property never changes a price.

## Checkout

**Check out** (a form with `checkout`, `/cart/checkout`, a permalink) hands the lines to the website's own checkout at `/checkout`, on the same host: the website's logo with Back to the cart, the order on one side and paying on the other, the card in Storelib's own form rather than a payment provider's page. Prices, stock, shipping and tax are worked out there, on the server, from the creator's products and settings; nothing a theme sends about a price is read. A cart with something to post asks for the address and delivery on the same page. After paying, the thank you page is on the website too, and the cart is emptied. What checkout asks for follows Settings › Checkout, and a store that asks buyers to sign in sends them to the website's own sign in first.

**Buy it now** (`payment_button`, or any `[data-storelib-buy-now]`) buys the item it belongs to alone and goes straight to checkout, leaving the cart as it was, even when the theme's own script has caught the form.

A checkout button a theme leaves disabled until a terms box is ticked is freed when the box is ticked.

## Products, search and recommendations

| Address | Answers |
| --- | --- |
| `/products/<handle>.js`, `.json` | The product as data |
| `/search/suggest(.json)?q=` | Predictive search: products and collections, or the theme's section with `section_id` |
| `/recommendations/products?product_id=&limit=&section_id=` | Other products from the shop, as JSON or as the theme's section |
| `/search?q=` | The search page, with `search.results` |
| `/collections/<handle>`, `/collections/all` | Collection pages, with filters and sorting from the address |

## Forms

| Form | Where it goes |
| --- | --- |
| `{% form 'contact' %}` | The creator's inbox, through Storelib's contact endpoint |
| `{% form 'customer' %}` (a newsletter box) | The creator's Subscribers |
| `{% form 'customer_login' %}`, `'create_customer'`, `'recover_customer_password'` | Storelib's sign in: a code emailed to the address |
| `{% form 'localization' %}` | Back to the page; a website has one currency and one language |

Contact and newsletter posts go through the same spam checks and rate limits as every Storelib form, then back to the page with the theme's own `form.posted_successfully` or `form.errors`.

## Customer accounts

A visitor signs in on the website's own host with a six digit code emailed to them, in an email with the store's name and logo. There are no passwords, so a theme's password fields and Forgot your password link are taken out of its forms, and every sign in, sign up and recover form becomes "email me a code".

- **`/account/login`, `/account/register`**: the theme's own `customers/login` and `customers/register` templates when it has them, Storelib's sign in drawn in the theme's fonts and colours when it does not (Dawn and Horizon have none). The code step is always Storelib's.
- **`/account`**: the theme's `customers/account` template with the signed in `customer`, or Storelib's account page, in the theme's header and footer. It lists the visitor's orders from this store, a Downloads list for what they bought to download, and Edit name and Delete account.
- **`/account/orders/<id>`**: one order's page, in the theme. Its files download from the website itself (`/api/site-account/download`), checked against the website's own session: only an order placed with the email the visitor proved, and only the files its receipt lists.
- **`/account/addresses`**: addresses are saved by checkout, so the list is shown and nothing is edited there.
- **`customer`** has `first_name`, `last_name`, `name`, `email`, `orders` (each with `name`, `order_number`, `created_at`, `total_price` in cents, `fulfillment_status` and its label, `line_items_count`) and the addresses. A header that reads `customer` says Account rather than Log in.

## Wishlist

A theme that keeps its own wishlist in `localStorage` (a key with `wish` in it, holding product ids or handles) is kept in step with the website's wishlist: each change the theme makes is saved, for a guest in the browser and for a signed in visitor to their account, and the theme's wishlist page and its link open the website's Wishlist inside the theme's header and footer. `/search?q=id:… OR id:…` answers a wishlist page's search by ids.

## The theme's scripts

The theme's JavaScript runs on the website as it was written. Storelib supplies what the old platform's servers would have put on the page:

- **`window.Shopify`**: the shop, its currency and locale, the routes, and `designMode` (true in the builder), written by `{{ content_for_header }}`.
- **`@shopify/events`**: the storefront events module a theme imports by that name (Horizon's `ProductSelectEvent`, `CartLinesUpdateEvent` and the rest), inline, so an event the theme dispatches is the one its listeners wait for.
- **The old platform's CDN**: any other script or stylesheet on `cdn.shopify.com` (payment buttons, 3D viewers) is taken out of the page and named in the theme's diagnostics.

On the live site the scripts keep their order but stop holding up the page, as Shopify's own themes write them:

- A blocking `<script src>` is given `defer`, and every classic script after it joins the same queue in its place (an inline one as a `data:` address), so jQuery still runs before the inline script that calls it. Scripts already `defer`, `async` or `type="module"` are left as they are.
- An `async` app script from a reviews, chat, popup or analytics service the theme writes starts once the page has loaded and the browser is idle, or at the visitor's first tap or key. Consent tools and the scripts they hold back are never touched, and neither are the store's own analytics and pixels.
- Nothing is changed when the theme asks for its scripts as written (`<html data-storelib-scripts="as-written">` or `<meta name="storelib-scripts" content="as-written">` in its layout), or when the page writes into itself while it is read (`document.write`), has an `onload` or `onerror` handler that calls a function, has a script inside an SVG, or already has a `defer` script before one that would move. The page's `X-Storelib-Scripts` header says what was done, or why nothing was.

## In the builder

The canvas draws an imported theme's page in a sandboxed frame with no origin of its own, so the theme's scripts run as they do on the website and reach nothing of the builder or the signed in person. The builder adds one script, which talks to it by `postMessage` and does what a theme editor is expected to do:

- A click selects the section and the block under it. Links and forms do not leave the page. A link is only followed after every listener the theme has on the click has run, so a header cart icon that opens the drawer opens only the drawer.
- A section the builder changed is swapped in place, with `shopify:section:unload` and `shopify:section:load` around it. Only the sections whose markup a change touches are drawn again: turning on Show currency codes redraws the sections that print prices and nothing else.
- **A theme setting changes the page where it is, never by loading it again.** The theme's settings stylesheets (a `{% style %}` of CSS variables in the layout, a `css-variables` snippet), the `<meta>` and `<link>` tags in the head and the `<style>` tags around the sections are written again in place, and the page keeps its scroll. A stylesheet a theme's script adds to the head is left alone. The page is loaded again only when the markup around the sections or the head's scripts change, or when a setting is printed in an inline script of the layout (`window.theme = { settings: ... }`, a JSON block), which a theme's JavaScript reads once as it starts; then it is loaded behind the page on screen, at the same scroll: at once for a choice (a select, a radio button, a checkbox), and once the control is let go or the typing pauses for anything else. The page on screen is sent `storelib:settings-change` first, so a theme that applies the value itself shows it in the same frame. A section's custom element whose attribute changed is drawn again on the next frame for a choice, so its `connectedCallback` reads the new value. A section drawn again with a new value in one of its own inline scripts runs that script, as Shopify's editor does.
- While a slider or a colour is under a finger, the value is written straight into the places the page prints it, every frame. A theme's own transitions do not ease a value from the sidebar: an ease that starts with a builder change is taken to its end in the same frame (a reveal, a fade or a transform as the page is scrolled still plays).
- Storelib's **Hover and focus** group (buttons on hover, links on hover, fields) is one stylesheet after the theme's own, rewritten in place as its values move.

Two events of Storelib's own let a theme's code follow the builder:

| Event | Dispatched on | `event.detail` | When |
| --- | --- | --- | --- |
| `storelib:settings-change` | `document` | `{ settings, live }`: the theme settings that changed, by id, with their new values; `live` is `true` while a finger is still on the control. For a section's own setting the detail also has `section`, that section's id | After the page shows a theme setting change, and as a section's setting changes: every value of a slider or a colour while it moves, and once more when it is let go |
| `storelib:section-load` | the section's element (`#shopify-section-<id>`), bubbling | `{ sectionId }` | After a section is drawn again, whether it was swapped (after `shopify:section:load`) or changed in place, where Shopify's editor sends nothing |

```js
document.addEventListener("storelib:settings-change", (event) => {
  if ("cart_type" in event.detail.settings) cartDrawer.refresh()
})
document.addEventListener("storelib:section-load", (event) => {
  if (event.detail.sectionId === "slideshow") slider.reset()
})
```

A listener that writes a section's value itself (a height into a CSS variable on the section) can call `event.preventDefault()`. While the slider moves, the builder then stops drawing that section again for each value and only sends the event; it draws the section once more when the slider is let go.

```js
document.addEventListener("storelib:settings-change", (event) => {
  const { settings, section } = event.detail
  if (!section || !("header_height" in settings)) return
  document.getElementById(`shopify-section-${section}`)?.style.setProperty("--header-height", `${settings.header_height}px`)
  event.preventDefault()
})
```

Neither event is sent on the live site, where settings do not change under a visitor.
- Selecting sends `shopify:section:select` and `shopify:block:select` (and the `deselect` pair), so a theme opens the slide or tab that was picked.
- What the theme's scripts ask the shop for (the cart, `?sections=`, `/products/<handle>.js`, search suggestions, a quick view) is answered by the builder, with the same code as the live site, from the page being edited and a cart kept in the builder's memory while it is open. **Add to cart, the cart drawer, quantities and Remove work in the canvas.**
- **Checkout is the live site's.** Check out, Buy it now, a link to `/checkout` and a cart permalink are stopped, and the builder says that checkout only works on the live site. Nothing is bought from the builder.
- **Account pages draw in the canvas**, so `/account`, `/account/login` and `/account/register` can be designed. A sign in form sent there sends nothing and says that sign in works on the live site.

## Between pages on the live site

A live website, imported or native, goes from page to page by loading the next page whole, and it does it without a white flash:

- A link the visitor rests on or presses is fetched ahead by the browser (Speculation Rules). The cart, checkout, account and API are left out, as is a link marked `nofollow`, one opening a new tab, or one with `data-no-prefetch`.
- On a desktop, an imported theme's page that runs no script from anyone but the site and Storelib is prerendered instead: drawn with its scripts run while the pointer rests on the link, so the click shows a finished page. A page with analytics, pixels or an app widget is only fetched ahead, so none of them runs for a page nobody opened. Storelib's own page view and speed measurements wait until the page is shown.
- The two pages cross-fade with a cross-document view transition. The arriving page waits, under the one being left, until it has been read to its end, so a theme's own start-up (an entrance animation, a slider laying out) is not shown half done.
- It is off for a visitor who asks for less motion, in app web views where such transitions do not paint, and on a slow phone; there the page loads as any page does.

## What does not come across

| From the old store | On Storelib |
| --- | --- |
| Apps and app blocks | Not run. Their markup has nothing to draw. |
| Metafields other than a product's custom fields and questions, metaobjects | Empty |
| Blog posts and articles | A blog page shows its title and no posts |
| Shop Pay, PayPal and other wallet buttons | Not shown; checkout takes cards, Apple Pay and Google Pay |
| Gift cards, selling plans, B2B prices | Not available |
| Several currencies or languages | One of each per website |
| Pictures in the old store's files | Not in the zip, so not imported; named in the report |
| Products, customers and orders | Not imported; the theme is filled with the creator's Storelib products |
