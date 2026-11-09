---
id: storelib-products
title: Presenting Storelib products
category: storelib
summary: How sections read products (shop, collection, chosen list, single product), what each card prints, and the add to cart and checkout hooks.
intents: [product-page, collection-page, build-section]
tags: [products, product-grid, collection, product-picker, add-to-cart, shop]
components: [product-card, product-grid, product-showcase]
capabilities: [products]
phases: [plan, build]
priority: 5
related: [store-binding, component-product-showcase, storelib-checkout-cta]
version: 1
---
**Choosing which products** (a section setting, chosen in the sidebar): a select `source` with `shop` (all published products, `{% for block in products limit: settings.product_count %}`), `collection` (a collection_picker), or `chosen` (a product_list). One featured product uses a product_picker.

**A card prints** `block.settings.title`, `.price` (already formatted, print it as is), `.compare_price`, `.image | asset` (with width, height, alt), `.url | url`, `.available`, `.tag` ("Sold out" or empty), `.variants`, `.checkout_url`.

**Buying**
- Add to cart: `<button type="button" data-storelib-add-to-cart="{{ block.id }}" ...>` inside `{% if block.settings.available %}`.
- Straight to checkout (single product pages, digital products): link to `checkout_url`.

**Design guidance**: one image ratio per grid; price close to the name; sold out shown as text, not hidden; quick add only for products without options.

**Never**: type a product name, price, photo or "Sold out" into markup, defaults or presets; give a product a price setting; compute discounts.
