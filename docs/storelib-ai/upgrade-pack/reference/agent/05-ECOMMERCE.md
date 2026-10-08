# Real e-commerce website behavior

This applies ONLY if the store's e-commerce capabilities are enabled. The front-end must not pretend the backend exists.

## Visitor journey

Discover → browse/filter → inspect product details/variants → understand shipping and returns → purchase via supported checkout → receive confirmation. Global search and filters are optional only if actually supported. Do not invent a cart when Storelib uses buy-now; use the product-to-checkout flow currently present. Respect disabled checkout and onboarding states.

## Home sections, chosen contextually

Brand-appropriate announcement (only when true); navigation; product-led hero; curated categories; new arrivals/featured products (data-bound); editorial campaign; product benefits and material details if provided; verified trust content; curated collection; size/fit FAQ; email capture only when wired; complete footer. Avoid all of these appearing automatically if irrelevant. Good sneakers example: hero → category tiles → selected new releases → editorial story → bestsellers → fit guide → final collection CTA.

## Required page roles for most established multi-product physical stores

- Home: distinct brand statement and catalog discovery.
- Shop/collections: real filters and sorting only if backed by data.
- Product detail template: gallery, title, description, actual price/currency, variants, stock and purchase action, fit info if known.
- Collection pages: category-specific product grids and headings.
- About: brand story only from provided facts or clearly editable generic draft with no fake founding story.
- Contact/FAQ: working contact options; accurate shipping/returns answers based on configured business settings.
- Legal, shipping and return pages: only publish truthful, user-authorized policies; missing facts require clearly unconfigured draft states.

## Storelib specifics

Check the existing e-commerce toggle and implementation for products, inventory, shipping origins/locations, zones/profiles, fulfillment, taxes, payment provider onboarding, disputes and checkout availability. Reflect actual status. Do not create fake shipping calculators or stock claims; reuse real metadata and services. Keep product pages theme-editable and data-backed.

## Merchandising & trust

High-quality real images; clear variant selection; mobile purchase CTA; visible availability; reasonable default filter/sort ordering; keyboard-operable interactions; product details discoverable without hover; sizes and shipping links only when accurate. No fake five-star ratings, social proof, countdowns, scarcity, or invented discounts.
