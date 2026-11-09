---
id: storelib-checkout-cta
title: Checkout and buy calls to action
category: storelib
summary: Where buy buttons go, wording by product type, cart drawer vs direct checkout, and honest pricing next to every buy action.
intents: [product-page, build-section, conversion]
tags: [checkout, buy-button, cta, cart, add-to-bag, conversion, purchase]
components: [button, cart, drawer]
capabilities: [products]
phases: [plan, build]
priority: 5
related: [storelib-products, component-buttons, component-drawer]
version: 1
---
**Wording by product**
- Physical goods: "Add to bag" or "Add to cart" (cart flow, people buy several).
- A single digital product, course or pack: "Buy now" or "Get the pack" straight to `checkout_url` (one item flows are faster).
- Memberships and subscriptions: "Join for {{ price }} a month" with the real price and period.
- Bookings: "Book a session" or "Choose a time".

**Placement**: one primary buy action per product view; repeat at the end of long sales pages; a sticky bar on phones for long product pages.

**Next to every buy action**: the real price, what happens next (instant download, ships in N days only if the creator states it), and the refund or cancellation policy link if one exists.

**Cart**: sections can use the built-in drawer (`data-storelib-cart`) or their own panel (`data-storelib-cart-panel`). The checkout itself is Storelib's, priced again on the server; nothing a section prints can change what is charged.

**Never**: fake urgency ("Offer ends in 09:59"), pre-ticked add ons, hidden fees language, discount codes the creator did not create.
