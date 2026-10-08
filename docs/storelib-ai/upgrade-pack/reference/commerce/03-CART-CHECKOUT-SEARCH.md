# AI-defined visual commerce interfaces, trusted workflows

## Component patterns
Cart drawer, full cart page, mini cart, sticky add-to-cart, product card quick add, modal quick view, search overlay, predictive search and results page, filtering/sorting, mega menu, mobile nav, quantity controls, wishlists if supported. AI may design them from scratch. All event handlers must invoke Storelib adapters and display real state.

## Must handle
Cart line unique identifiers, quantity constraints, variant resolution, loading/submitting/failure, undo/remove, empty cart, logged-out carts, session persistence according to actual platform rules, disabled checkout, payment pending, inventory changes, network retry without duplicate order.

## Checkout boundary
Custom UI may precede checkout and connect to trusted backend, but never invent a card entry/payment credential handler. Server validates totals/stock/shipping/tax and places an order via approved provider. Trusted provider redirect/embedded display is determined by merchant configuration. Protect idempotency and webhook replay.

## Search
Search index or DB-backed query consistent with published products; debounce, keyboard accessible results, empty and failure states, filters by real fields, sort by authorized price/date data. No fake product search animation.

## UX
Drawer focus trap, Escape, overlay click rules, properly reset scroll lock, body scroll, keyboard and mobile touch. Test opening a PDP variant selector, add, update, remove, checkout, go back, empty and out-of-stock. Search modal must not flash and should not obstruct mobile keyboard.
