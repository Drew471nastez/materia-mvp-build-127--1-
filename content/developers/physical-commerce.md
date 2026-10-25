# Physical products, the cart and checkout

Some Storelib stores sell things that get posted or picked up: t-shirts, candles, prints, honey. This page is what a section, a theme or an agent needs to know about them: the product fields, how a section puts something in the cart, where the cart goes to be paid for, and what Storelib works out on the server so a section never has to.

Physical products are switched on for all of Storelib from its admin. While they are off, nothing here shows: a physical product says it can't be bought right now, and the cart checkout below isn't there. A section should work either way and never assume they are on.

## The one rule

A section shows products and puts them in a cart. It never prices an order. Every number a buyer pays (the items, any bundle saving, a code, shipping, tax and the total) is worked out again by Storelib on the server, from the database, when the buyer opens checkout and again when they pay. Whatever a page shows or a cart line says is for display. A section that edits a price in the cart changes nothing anyone is charged.

## A product that ships

A product that ships reaches a section in `products` like any other (see [Products and checkout](/developers/selling)), with `kind` set to `physical` and its options:

| Field | What it is |
| --- | --- |
| `block.settings.kind` | `physical` for a product that ships. |
| `block.settings.options` | Its options by name with their values, such as `{ name: "Size", values: ["S", "M", "L"] }`. Up to three. |
| `block.settings.variants` | Each combination a buyer can choose, with its own id and price. |
| `block.settings.checkout_url` | Empty for a physical product: it goes in the cart, not straight to the digital checkout. |

Storelib's own product section draws the whole buy box for a physical product (options as chips, sold out combinations crossed out, quantity, Add to cart, Buy now) and, under it, any bundles the store has made with it. A custom section can use that, or build its own with the hooks below.

## Putting something in the cart

Any element with `data-storelib-add-to-cart` puts a line in the website's cart when pressed. Its value is the product's id; the rest describe the line for the cart drawer.

```html
<button
  data-storelib-add-to-cart="{{ block.id }}"
  data-kind="physical"
  data-variant-id="{{ variant.id }}"
  data-quantity="1"
  data-title="{{ block.settings.title }}"
  data-variant-name="{{ variant.name }}"
  data-price="{{ variant.price }}"
  data-image="{{ block.settings.image }}"
  data-url="{{ block.settings.url }}">
  Add to cart
</button>
```

| Attribute | What it does |
| --- | --- |
| `data-storelib-add-to-cart` | The product's id. Required. |
| `data-kind` | `physical` (or `shipped`) for a product that ships. Anything else is digital, and a digital line stays at one. |
| `data-variant-id` | The option chosen. A product with one option can leave it out; one with several can't be bought without it. |
| `data-quantity` | 1 to 99, for a physical line. |
| `data-title`, `data-variant-name`, `data-price`, `data-image`, `data-url` | What the cart drawer shows. Display only. |

The cart's own hooks are `data-storelib-cart` (opens it), `data-storelib-cart-count`, `data-storelib-cart-panel`, `data-storelib-cart-lines`, `data-storelib-cart-line`, `data-storelib-cart-subtotal`, `data-storelib-cart-empty`, `data-storelib-cart-filled`, `data-storelib-checkout` and `data-storelib-cart-close`. They are covered in [The site's drawers](/developers/header-and-footer#the-sites-drawers).

## Where the cart goes

On a website, the cart goes to the website's own checkout, on the same host:

```
/checkout?items=<cart>&return=<page on the site to come back to>
```

It is drawn like the Explore checkout, with the website's logo and Back across the top, the order on one side and paying on the other, and the card in Storelib's own form. Digital lines, things that ship and local pickup are paid in one order there, and the thank you page is on the website too. What it asks for follows Settings › Checkout: the name as one field or two, and for an order that ships, company, phone and the second address line as off, optional or required. A store that asks buyers to sign in sends them to the website's own sign in first.

A preview on storelib.com, and a Buy link outside a website, use Storelib's cart checkout instead:

```
/checkout/physical?shop=<store id>&items=<cart>&return=<page to come back to>
```

A product that ships is never paid for in the digital checkout: a `/checkout?productId=` link for one (an older theme's Buy button, a shared link) is sent on to a checkout that can ship it. A checkout's Back link is the page the buyer came from only when that page is one of the store's own websites.

`items` is the cart as ids and quantities: a JSON list of `[productId, variantId, quantity, properties?]`, base64url encoded, up to 50 lines. `properties` is the line's properties as an object of strings (up to 20, a name up to 64 characters, a value up to 500); a link without them, `[productId, variantId, quantity]`, reads as it always has. Nothing in it is trusted beyond being well formed, and properties never change a price. The website's own checkout button builds this for you; a section only needs it to make a Buy now link of its own.

## Line item properties

A product form's `properties[Engraving]`, or `properties` on `/cart/add.js`, stays with the line all the way to the order: in the cart cookie, in `/cart.js` as each item's `properties`, in Liquid as `item.properties` in the cart and `line_item.properties` on the account's orders, on the checkout under the line, and on the order line, its emails, the order page and the orders export. The same option with different properties is a line of its own, as on Shopify.

A name that starts with `_` is the theme's own note: it is kept on the order and shown to the store, and left out of everything the buyer reads (the checkout, the order emails, the order page). A theme can use these to say which offer added a line:

| Property | What it says |
| --- | --- |
| `_sl_offer` | `bundle`, `bundle_partial`, `quantity_break`, `upsell`, `pair` or `addon` |
| `_sl_offer_id` | The offer's id from `GET /api/offers`, when the page had one |
| `_sl_group` | One id per add, shared by every line of that add |
| `_sl_block`, `_sl_source` | The block, and the product page it was added from |
| `_sl_tier`, `_sl_paid_qty`, `_sl_free_qty` | A quantity break's tier, units charged and units free |
| `_sl_discount` | What the page showed: `percent:15`, `amount:500` (cents) or `free` |

They are informational. The checkout prices every line from the database and the store's own offers, so a line that says `_sl_discount: percent:90` pays what it would without it. Products › Upsells and bundles counts, for each offer, the units sold through it in the last 90 days: the order lines it saved on, and the ones whose `_sl_offer_id` names it.

## Personalization: words and pictures

A buyer can write something for a line (a name to engrave) or send a picture (a photo for a mug). Both are line properties and reach the order the same way. In the Storelib theme, add the product section's **Personalization** block: it asks for text, a picture or both, with its own labels, a Required switch and a longest text. In an imported Shopify theme, the product form's own fields do it:

```html
<input type="text" name="properties[Name]" maxlength="40">
<input type="file" name="properties[Photo]" accept="image/jpeg,image/png,image/webp">
```

A form with a file must be `enctype="multipart/form-data"`, posted to `/cart/add` or `/cart/add.js`. A theme script can also send the picture first, `POST /cart/upload` (or `/api/cart/uploads` on any website) with a `file` field, and put the answer's `upload.value` in the line's properties itself.

| | |
| --- | --- |
| Formats | JPEG, PNG and WebP, decided by the file's bytes, not its name. HEIC, GIF, SVG and anything else are refused |
| Size | Up to 10 MB, at least 16 and at most 12000 pixels a side, at most 50 megapixels |
| At once | Up to 5 pictures a request; 30 requests an hour per browser, 600 per store |
| What is kept | The picture drawn again in its own format, upright, with its EXIF, GPS, XMP and comments gone |
| Where | A private bucket, under the store and a random id. Nothing lists or opens it but Storelib |

The line holds a value like `/api/cart/uploads/<id>.<signature>/photo.jpg`, never a public address. It opens only in the browser that uploaded it, on the store it was uploaded to, as a link that lasts ten minutes: copied to another browser or another store it is `Not found`, and a checkout given one refuses it with "A picture on this order can't be used any more. Add it to the cart again." When the order is paid the picture is copied to the order, so it stays after the cart is gone; the store opens and downloads it from the order page, the buyer sees it on the order status page. An upload no paid order took is removed after 14 days.

The buyer sees a picture by its file name in the cart, the checkout, the emails and the packing slip, and as a small picture where the page can show one. The orders export says the file name.

Print partners get what each of them takes:

| Partner | Words | Picture |
| --- | --- | --- |
| Printful | After the item's name, which its dashboard and packing slip show | Not sent: download it from the order page |
| Printify | Not sent: its order items take a SKU and a quantity only | Not sent |
| Gelato | In the order's metadata | The item's print file when the product is matched without a file of its own; otherwise on the order page |

An order with anything personalised is sent as a draft, whatever the integration's Send straight to production says, so the store checks it there first.

## Discount codes from the cart

`POST /cart/update.js` with `{"discount": "CODE,CODE2"}` (Shopify's) keeps the codes on the cart. Each is checked against the store's own codes by the checkout's rules, and `/cart.js` answers `discount_codes: [{ "code": "CODE", "applicable": true }, { "code": "CODE2", "applicable": false }]`: an unknown or expired code is `applicable: false`, never an error. The checkout takes one code, the first that applies, and opens with it already entered, so the buyer does not type it again. `{"discount": ""}` takes them off.

## What the checkout does

In order, on the server, every time the buyer changes something:

1. Reads each product and option from the database. A product that isn't published, isn't this store's, or is a digital product the buyer already owns is left out, and the page says so.
2. Checks the stock at the locations that fulfil orders. A line that can't be met is shown as short, and Pay waits until it's fixed.
3. Applies the store's **offers**: a quantity break on every unit of its product, a bundle's discount on each complete set in the cart, and a checkout offer's discount on the one item it offers. A unit gets one offer at most: when two want it, the one that saves more on that unit. Each saving is its own line in the checkout's summary, named by the offer or the tier, and the order keeps the same lines.
4. Applies a **discount code**, if one was entered, to what each line costs after step 3.
5. Quotes **shipping** from the store's profiles, zones and rates for the buyer's country and region, or offers **local pickup** at a location that can hand over the whole cart.
6. Works out **tax** from the store's own tax regions, including per product rates, and whether prices already include it.
7. When the buyer pays: holds the stock, takes the payment with Stripe, makes the order, emails the buyer an order confirmation and the store a new order, and tells the store's pixels about the purchase once.

A section never needs to repeat any of it.

## Upsells and bundles

A store makes them under Products › Upsells and bundles. They are of three kinds:

| Kind | What a buyer sees | What it takes off |
| --- | --- | --- |
| Bundle | Two to five products under each one's buy box, with the set's price and Add all to cart | A percent off each item of every complete set in the cart, or an amount off each set |
| Checkout offer | One product under the order in the checkout, with Add | A percent or amount off one of it, while the cart holds something else (or one of the offer's trigger products) |
| Quantity break | Up to six tiers on the product page: buy 2 get 1 free, 3 for 15% off | Per block of a tier: units free, then a percent or an amount off the units paid for |

One call answers everything a product page offers with a product:

```
GET /api/offers?product=<product id>
```

```json
{ "bundles": [ … ], "quantityBreaks": [ … ], "checkoutOffers": [ … ] }
```

`bundles` is the list below, `quantityBreaks` the list `GET /api/offers/quantity-breaks` answers, and `checkoutOffers` the checkout offers this product triggers, each with its `product` and the `offerPriceCents` it adds at. An imported theme reads the same JSON in Liquid, on the product page, as `product.metafields.storelib.offers.value`, so it can draw offers on the server. Only offers that are on now, for a published product, are listed, and nothing of the store's own settings beyond what a buyer is shown. Answers may be cached for a minute.

### Quantity breaks

```
GET /api/offers/quantity-breaks?product=<product id>
```

```json
{
  "offers": [
    {
      "offerId": "…",
      "productId": "…",
      "title": "Buy more, save more",
      "tiers": [
        { "quantity": 2, "freeQuantity": 1, "discountType": "none", "discountValue": 0, "label": "Buy 2 get 1 free", "badge": "Most popular", "unitPriceCents": 2400, "totalCents": 7200, "compareCents": 10800 },
        { "quantity": 3, "freeQuantity": 2, "discountType": "none", "discountValue": 0, "label": "Buy 3 get 2 free", "badge": "", "unitPriceCents": 2160, "totalCents": 10800, "compareCents": 18000 }
      ]
    }
  ]
}
```

A quantity break is for one product, or for every product of one collection (each product on its own). A tier is `quantity` units paid, `freeQuantity` units free (0 to 10), and `discountType` `percent` (`discountValue` 0 to 90), `amount` (`discountValue` in cents off the block) or `none`; tiers grow strictly from one to the next. The prices are the product's default variant's. For another variant, work the numbers out with the same formula the checkout charges by, in integer cents:

```
paid    = quantity
free    = freeQuantity
total   = round(price * (100 - percent) / 100) * paid - amountCents   (never below 0)
compare = price * (paid + free)
          (a plain tier, with no free units and no discount, on a product with a
           compare at price: compare_at_price * paid)
saving  = compare - total
```

`round` is half up, as JavaScript's `Math.round`. In a currency without cents, such as yen, `price` is in yen and the same formula applies.

At checkout, every unit of the product counts, whatever its variant, line or properties. The units are split into tier blocks by repeating the largest tier that fits (paid plus free no more than the units left), then the next one down for the rest, and so on; units no tier fits pay full price. With tiers 2+1 and 3+2, five units are one 3+2 block, eight are 3+2 and 2+1, and seven are 3+2 with two at full price. The free units are the product's cheapest units in the cart; a percent or an amount comes off the units paid for in each block, an amount per block shared by price. A unit a bundle or a checkout offer also wants gets whichever saves more on it.

### Bundles

A custom product section that wants to show a bundle itself can read the same list the buy box does:

```
GET /api/offers/bundles?product=<product id>
```

```json
{
  "bundles": [
    {
      "offerId": "…",
      "title": "Breakfast set",
      "label": "15% off",
      "discountType": "percent",
      "discountValue": 15,
      "fullCents": 4000,
      "priceCents": 3400,
      "items": [
        { "id": "…", "title": "Wildflower honey", "slug": "honey", "imageUrl": "/media/…", "type": "physical", "priceCents": 3200, "variants": [{ "id": "…", "name": "Default", "priceCents": 3200 }] }
      ]
    }
  ]
}
```

Only active bundles whose every product is still on sale are listed, and the product asked about comes first. Put every item in the cart with `data-storelib-add-to-cart` and the checkout applies the saving by itself. The prices here are for showing; when a buyer picks an option with its own price, show the set's price from the options they chose.

## Orders after checkout

An order's items move through **Unfulfilled**, **Processing**, **Shipped** and **Delivered** (or **Ready for pickup** and **Picked up**), and a buyer can ask to return items from their order page while the store's return window is open. Each step emails the buyer from the store, with its name on it, and a reply goes to the store's contact email. None of it is a section's to draw: the buyer's order page and its emails are Storelib's.

## Pixels and analytics

A store adds its Google Analytics, Tag Manager, Google Ads, Meta, TikTok and Pinterest IDs under Settings › Integrations, and every page of its website loads them. A paid order is reported to each once, as `purchase` (Google), `Purchase` (Meta), `CompletePayment` (TikTok) or `checkout` (Pinterest), with the order's number, value and currency and nothing about the buyer. A section must not add these services' scripts itself: they would load twice and count every visit twice.

## The tables behind it

For agents and integrations reading the database through the store's own connection. Row level security keeps every one of them to its store.

| Table | What a row is |
| --- | --- |
| `products` | A product. Physical ones have `type = 'physical'`, weight, dimensions, `requires_shipping`, `track_inventory`, `fulfillment_method` and `shipping_profile_id`. |
| `product_options`, `product_variants` | Its options, and each combination with its own price, SKU, photo and stock policy. |
| `inventory_locations`, `inventory_levels`, `inventory_movements`, `inventory_reservations` | Where stock is, how much, every change to it, and what an unpaid checkout is holding. |
| `inventory_transfers`, `inventory_transfer_items` | Stock moving between locations. |
| `shipping_profiles`, `shipping_zones`, `shipping_rates`, `shipping_packages` | What shipping costs, where, and in what box. |
| `commerce_settings`, `commerce_tax_rates`, `commerce_tax_overrides` | The store's shipping and pickup settings, its tax regions and its per product tax rates. |
| `commerce_checkouts` | An order through the cart checkout: buyer, address, delivery, totals and its lines. |
| `fulfillments`, `fulfillment_items`, `fulfillment_events` | What was shipped or handed over, with tracking. |
| `commerce_returns`, `commerce_return_items`, `commerce_reasons` | Returns, and the store's own return and refund reasons. |
| `commerce_order_events` | An order's timeline. |
| `store_offers` | The store's bundles, checkout offers and quantity breaks (with their `tiers`). |
| `store_activity_log` | Every change made to the store, for its Activity page. |
