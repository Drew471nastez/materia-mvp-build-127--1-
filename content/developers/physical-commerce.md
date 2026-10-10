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

A cart with anything that ships goes to Storelib's cart checkout:

```
/checkout/physical?shop=<store id>&items=<cart>&return=<page to come back to>
```

`items` is the cart as ids and quantities only: a JSON list of `[productId, variantId, quantity]`, base64url encoded, up to 50 lines. Nothing else in it is read, and nothing in it is trusted beyond being well formed. The website's own checkout button builds this for you; a section only needs it to make a Buy now link of its own.

## What the checkout does

In order, on the server, every time the buyer changes something:

1. Reads each product and option from the database. A product that isn't published, isn't this store's, or is a digital product the buyer already owns is left out, and the page says so.
2. Checks the stock at the locations that fulfil orders. A line that can't be met is shown as short, and Pay waits until it's fixed.
3. Applies the store's **upsells and bundles**: a bundle's discount on each complete set in the cart, and a checkout offer's discount on the one item it offers, each unit at most once.
4. Applies a **discount code**, if one was entered, to what each line costs after step 3.
5. Quotes **shipping** from the store's profiles, zones and rates for the buyer's country and region, or offers **local pickup** at a location that can hand over the whole cart.
6. Works out **tax** from the store's own tax regions, including per product rates, and whether prices already include it.
7. When the buyer pays: holds the stock, takes the payment with Stripe, makes the order, emails the buyer an order confirmation and the store a new order, and tells the store's pixels about the purchase once.

A section never needs to repeat any of it.

## Upsells and bundles

A store makes them under Products › Upsells and bundles. They are of two kinds:

| Kind | What a buyer sees | What it takes off |
| --- | --- | --- |
| Bundle | Two to five products under each one's buy box, with the set's price and Add all to cart | A percent off each item of every complete set in the cart, or an amount off each set |
| Checkout offer | One product under the order in the checkout, with Add | A percent or amount off one of it, while the cart holds something else (or one of the offer's trigger products) |

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
| `store_offers` | The store's bundles and checkout offers. |
| `store_activity_log` | Every change made to the store, for its Activity page. |
