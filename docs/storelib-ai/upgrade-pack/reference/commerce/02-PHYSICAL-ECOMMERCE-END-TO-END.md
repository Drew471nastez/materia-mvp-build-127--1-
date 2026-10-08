# Physical-commerce end-to-end consistency — owned internal platform features

User will personally handle external integrations. Claude should finish **internal** feature models, backend API orchestration, UI settings, validations, webhook wiring points and lifecycle; use provider interfaces for integrations not yet configured. Mark external dependencies as blocked.

## Admin settings and data models
1. Enable/disable physical commerce per store with migration-safe product-kind handling.
2. Products/variants/SKUs/options/media; stock tracking, oversell/backorder policy, allocations/reservations, publish visibility and sale price.
3. Collections & categories; manual/automatic rules if available; collection template bindings.
4. Inventory locations (physical/warehouse/3PL/POD), address/country, priority, fulfillability flags, quantities per variant-location.
5. Shipping profiles assigned by product/variant, destination countries/regions/postcodes, zones, rate tables (flat/weight/price), free shipping threshold, origin location and delivery eligibility. If carrier/calculated rates not integrated, show 'unavailable' instead of invented quotes.
6. Packaging/physical dimensions/weight, processing times and merchant-set fulfillment notes.
7. Order flow: cart/buy-now, address validation, selected variant, price/tax/discount/delivery quote, payment state, reservation, create order, shipping/fulfillment status, tracking where configured, cancellation/refund updates.
8. Returns/contact/policy pages are configurable content; do not generate fraudulent policies.
9. Taxes/currencies/markets settings use verified store/business and provider rules; calculate in backend. Respect local tax advice and legal compliance.
10. POD/dropship/warehouse/3PL must be represented as fulfillment types/locations/adapters and honest statuses, not claimed integrations.

## Cross-service matrix
- `Store settings → storefront globals`: logo, menus, icon, brand, currency and feature flags update correctly.
- `Catalog → collection/product/search`: same canonical SKU/media/pricing/availability.
- `Product → cart`: active variant/options/quantity, price recalculated server-side, no client authority.
- `Cart → delivery quote`: cart items, shipping profile, address, origin, destination produce same quote as checkout.
- `Checkout → orders`: idempotent paid/failed/pending events, correct order and stock reservation/release.
- `Orders → fulfillment/refund`: state machine updates customer, admin, inventory and transactional notifications consistently.
- `Admin settings → AI`: capability snapshot and dynamic schema values updated; AI does not hallucinate merchant feature support.
- `Draft preview → published storefront`: same routes, pricing source, UI state and no debug fixtures.

## End-to-end test fixtures
Physical store with 3 regions, 2 locations, 2 shipping profiles, variable sizes/colors, one out-of-stock SKU, one physical+digital mixed order if supported, free shipping minimum, variant image swaps, cart updates, payment disabled state, tracking update. Test admin persists settings, API responds, preview displays, checkout selects eligible rates, order events work. When any step missing, keep explicit blocker and create remediation issue.
