---
id: component-product-showcase
title: Product showcases
category: component
summary: Presenting store products: grids, featured product sections, quick add, variant pickers, prices and availability from real data.
intents: [build-component, build-section]
tags: [product, product-grid, product-card, featured-product, shop, quick-add]
components: [product-card, product-grid, product-showcase]
capabilities: [products]
phases: [build, review]
priority: 5
related: [storelib-products, style-contemporary-ecommerce, product_grid]
version: 1
---
**Featured product**: large gallery, name, real price (and compare at price if set), short description from the product, variant buttons, add to cart or buy now (checkout_url), delivery info from policies.

**Grid card**: image (consistent ratio across the grid), name (2 lines max), price, optional second image on hover (desktop), sold out state from availability, quick add only for single variant products (otherwise open the product).

**Variant pickers**: buttons (radio group semantics) for size and colour when there are few options; show unavailable options as disabled with a strike or label, never hidden silently; update price and image on change.

**Prices**: print the formatted value from the store. Never compute, round or type a price. Compare at prices only from the product.

**Buy buttons**: `data-storelib-add-to-cart` behind `{% if block.settings.available %}`; when unavailable, a disabled "Sold out" button.

**Empty**: no products yet shows an editor only note ("Your published products appear here"), nothing for visitors.

**Avoid**: star ratings with no reviews, "Bestseller" badges without data, countdown timers, fake stock counts.
