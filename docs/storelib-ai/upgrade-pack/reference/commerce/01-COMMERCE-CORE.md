# All-commerce core — physical, digital, services, subscriptions

Storelib is NOT only a Shopify clone. The AI chooses modules based on site type; unified backend supports products, services, courses and memberships without forcing shipping forms on digital products or digital download UI on physical items.

## Commerce primitives
Store + merchant verification/payments state; product kind; SKU/variants/options; media; categories/collections; inventory; price/currency/tax; promotions; checkout availability; purchase state; order lines; order status; refunds/disputes as supported; fulfillment type; entitlement rights; shipping profile/zone/location/packaging where required; customer account and notification delivery.

## Product kinds
- **Digital downloads**: protected file IDs, post-purchase entitlement, secure signed URLs, expiry/rate limits and fraud safeguards; avoid exposing storage keys in public storefront.
- **Courses/memberships**: gated content, subscription/one-time availability, upgrade/cancel flows only when corresponding payment/subscription provider supports them.
- **Services/coaching**: offer, intake form, booking/scheduling if connected, contact lead, delivery expectations, pricing. No fake available booking slots.
- **Physical**: variants, inventory, address, shipping zones, profiles, locations and fulfillment, orders, return policy URL.
- **Hybrid**: bundle digital+physical with correct fulfillment/e-commerce semantics and delivery UX.

## Product page responsibilities
Media gallery, current description/details, dynamic variant selection, availability, price/currency/taxes message, estimated delivery only if trustworthy, policies, related products, genuine reviews only if data exists, real CTA actions. Custom designed UI can be entirely new. State and effects must be correct.

## Cart vs buy-now
Use the actual Storelib capability registry. User might want cart drawer/full cart, or buy-now only. Implement configurable cart module in platform if missing and product strategy accepts it; do not assume cart exists or force it by default. Both paths must create valid orders through trusted checkout with accurate totals.

## Payment readiness
Publishing pages can be allowed before payment setup, but purchasable CTA must expose truthful merchant payment status/disabled banner. Enforce backend readiness, country/merchant compliance and payment provider state at purchase. Do not make up provider integrations.
