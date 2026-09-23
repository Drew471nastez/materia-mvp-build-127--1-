# Selling: products, checkout and payments

A Storelib website sells the creator's products, and the part that takes the money is Storelib's, not the section's. A section shows products and sends a buyer to checkout. It never takes a payment, never asks for a card, and never loads a payment script. This page is what a section, and whoever writes it, needs to know about that.

## Products reach a section as `products`

`products` holds the creator's published products, newest first, up to 24, in the same `{ id, type, settings }` shape as blocks:

| Field | What it is |
| --- | --- |
| `block.id` | The product's id. Checkout takes it. |
| `block.settings.title` | Its name. |
| `block.settings.price` | Its price, already formatted, such as `$48.00`. Empty when it costs nothing: write "Free" in the template if you show one. |
| `block.settings.compare_price` | The price before a sale, formatted, or empty. Show it struck through. |
| `block.settings.image` | Its main picture, or empty. |
| `block.settings.url` | Its page on this website, such as `/products/preset-pack`. |
| `block.settings.tag` | `Sold out` when there are none left, or empty. |

Templates do not do money: never compute, round or convert a price. Show the text you are given.

## Two ways to sell from a section

**Link to the product's page.** Every product has a page on the website with its pictures, its description and the Buy and Add to cart buttons, which already work. This is the right link for a card in a grid.

```storelib
{% for block in products %}
  <a class="card" href="{{ block.settings.url | url }}">
    {% if block.settings.image != "" %}<img src="{{ block.settings.image }}" alt="{{ block.settings.title }}">{% endif %}
    <span class="card__title">{{ block.settings.title }}</span>
    <span class="card__price">
      {% if block.settings.compare_price != "" %}<s>{{ block.settings.compare_price }}</s>{% endif %}
      {{ block.settings.price }}
    </span>
  </a>
{% endfor %}
```

**Link straight to checkout.** For a section whose job is the purchase, a hero with one product or a pricing table, send the buyer to Storelib checkout with the product's id:

```storelib
<a class="buy" href="/checkout?productId={{ block.id }}&src=website">Buy {{ block.settings.title }}</a>
```

`src=website` is how the order is recorded as a Website order in the creator's Orders. Keep it.

Do not link to checkout for a product that is `Sold out`. Show the tag instead.

## What checkout does

- It is Storelib's page, at storelib.com, where the buyer is signed in. On a website's own address, `/checkout` goes there.
- The buyer pays by card or Google Pay, through Stripe. Every price is charged in US dollars.
- **The price is read from the product, never from the link or the page.** Nothing a section writes can change what is charged.
- A buyer who already owns a product is not charged for it again.
- After paying, a digital product is in the buyer's Storelib library straight away, and the download link is emailed to them.
- The money goes to the creator's connected Stripe account, set up in Settings › Payments.

## The cart

A website has a cart. The header's bag opens it, the product page's **Add to cart** fills it, and `/cart` shows it and sends it to checkout as one payment. It is kept in the visitor's browser, per shop. A section cannot add to it: link to the product's page, where the button is.

## What a section may not do

- Build a payment form, or ask for a card number, a bank account or a password. Ever.
- Load Stripe, PayPal or any other payment or tracking script. A `<script>` tag in a template is refused when the file is saved, and a section's own script runs in a sandbox where `fetch` and the network are refused too.
- Put a price in a default, or invent a product, a discount or a review. Show the products the site has.
- Promise delivery times, refunds or guarantees the creator has not written. Those belong on the policy pages, which the creator edits.

## Where this lives in the builder

- **Website Settings › Commerce** shows how many products the website can show, what checkout takes and where payouts go.
- **Website Settings › Policies** has the refund, privacy and terms pages every website links to from its footer.
- A connected agent reads the site's products, with their ids, from `storelib_site`. See [Building with AI agents](/developers/ai).
