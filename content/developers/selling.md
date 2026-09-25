# Selling: products, checkout and payments

A Storelib website sells the creator's products, and the part that takes the money is Storelib's, not the section's. A section shows products and sends a buyer to checkout. It never takes a payment, never asks for a card, and never loads a payment script. This page is what a section, and whoever writes it, needs to know about that: the product data a section reads, the buy link, and where the buyer goes after paying.

## Products reach a section as `products`

`products` holds the creator's published products, newest first, up to 24, in the same `{ id, type, settings }` shape as blocks. The platform reads them on the server when the page is drawn, so a price changed in the shop is on the website within a minute.

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
| `block.settings.available` | `true` when it can be bought right now. |
| `block.settings.tag` | `Sold out` when it cannot be bought, or empty. |
| `block.settings.checkout_url` | Storelib checkout for this product, `/checkout?productId=<id>&src=website`. Empty when it cannot be bought. |
| `block.settings.variants` | Its options, such as sizes or licences. Empty when it has none. See below. |

Templates do not do money: never compute, round or convert a price. Show the text you are given.

## A product's options: `variants`

A product with options is bought as one of them. Each entry in `block.settings.variants` has:

| Field | What it is |
| --- | --- |
| `variant.id` | The option's id. |
| `variant.name` | Its name, such as `Commercial licence`. |
| `variant.price` | Its own price, formatted, or empty when it is free. |
| `variant.compare_price` | Its price before a sale, or empty. |
| `variant.free` | `true` when this option costs nothing. |
| `variant.available` | `true` when it can be bought right now. |
| `variant.checkout_url` | Storelib checkout for this option, `/checkout?productId=<id>&variantId=<option id>&src=website`. |

A product with options that is sent to checkout without one arrives with its first option chosen, and the buyer can change it there.

## The product page: `page.product`

Every product has a page on the website at `/products/<slug>`. A section placed on the product page reads the product the page is about as `page.product`, with the same fields as a product in `products`, and one more:

| Field | What it is |
| --- | --- |
| `page.product.settings.description` | The product's description as plain text, line breaks kept. It is text, never HTML: print it with `{{ }}` and give it `white-space: pre-line`. |

In the builder, while the product page is open, `page.product` is the newest product, so the section draws something real. On any other page it is empty. Put `"allowed_templates": ["product"]` in the schema of a section that only makes sense there.

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

To let the creator pick which product a section shows, give it a `product_picker` setting. It holds the product's page address, so keep the product in `products` whose `url` matches it:

```storelib
{% for block in products %}
  {% if block.settings.url == settings.product or block.id == settings.product %}
    <h2>{{ block.settings.title }}</h2>
    <p>{{ block.settings.price }}</p>
    <a class="buy" href="{{ block.settings.checkout_url | url }}">{{ settings.button_label }}</a>
  {% endif %}
{% endfor %}
```

`products` is the newest 24. A product older than that is not in it; link to its page instead.

## Buy buttons and checkout

- A buy button links to `checkout_url`, or to one option's `variant.checkout_url`. Never build the address from pieces, and never add a price to it: checkout reads the price from the product.
- A product that is not `available` gets no buy button. Show its `tag`.
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

A website has a cart. The header's bag opens it, the product page's **Add to cart** fills it, and `/cart` shows it and sends it to checkout as one payment, after which the buyer comes back to the website's home page. It is kept in the visitor's browser, per shop. A section cannot add to it: link to the product's page, where the button is.

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
