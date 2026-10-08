# Storelib dynamic data: platform-owned, theme-agnostic

Require a typed, introspectable binding registry. **Abstract names below are contracts to design/verify in the repo, not known Storelib syntax.** The AI should not invent template variable syntax.

## Store identity
store.name, store.logo, store.logoAlt, store.logoSize, store.favicon, store.description, store.socials, store.domain, store.locale, store.currency, store.supportEmail, store.legalLinks, store.themeSettings, menus.namedMenu, navigation.children.

## Catalog and commerce
product.current, product.title, product.description, product.gallery, product.media, product.variants, variant.selected, variant.price, variant.compareAtPrice, variant.currency, variant.available, variant.inventory, product.options, collection.current, collection.image, collection.products, catalog.featured, catalog.searchResults, cart.items, cart.subtotal, cart.discount, cart.currency, checkout.status, market.country, shipping.rates (checkout-only when validated).

## Content & creator
creator.profile, downloads, digitalProduct.files (protected), course.lessons (entitlement-protected), membership.plans, community/posts (only when implemented), services and booking times (only if real), user.session, user.library and purchase entitlements, analytics overview (authorized only).

## States
Each binding must define `loading`, `empty`, `error`, `missing`, `unauthorized`, `disabled`, `stale` and localized formatting behavior. Editor mock previews must be marked clearly and never mistakenly published as live prices or invent real items.

## Custom UI ↔ platform actions
Any generated component can call **trusted platform actions** through typed adapters: navigate, openCart, addCartLine, removeCartLine, updateQuantity, selectProductVariant, startCheckout, searchCatalog, submitContact, subscribeEmail, authenticate, downloadPurchasedFile, createCustomerRecord (if permissions allow). UI geometry remains completely independent.

## Consistency contract
- Changing variant updates media/price/availability/sale price and correct cart line.
- Switching currency/locales updates formatting and correct backend price source, not client-only conversion.
- Collection cards, search results, nav, product page and checkout all refer to same canonical product record.
- Shipping rules follow store/profile/zone/location/fulfillment and match checkout.
- Customer app pages obey entitlement permissions; no data leakage from protected files.

## Test case example
Given a product with 2 variants, one out of stock: select out-of-stock variant; title/media/price update; add button disables; cart cannot add it; checkout never charges alternate SKU. Independently verify in editor, preview, live storefront and API.
