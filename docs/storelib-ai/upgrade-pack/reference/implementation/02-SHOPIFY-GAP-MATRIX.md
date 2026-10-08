# Shopify benchmark: audited requirements, not assumed Storelib completeness

Official current public sources are in `sources/VERIFIED-OFFICIAL-DOCS.md`. Shopify architecture is **an inspiration for feature capability and merchant customizability**. Storelib DOES NOT implement or parse Shopify Liquid; its own `.storelib` grammar must govern source generation. Some Shopify capabilities (e.g. Shopify Plus checkout extensions) have unique restrictions and are **not** parity requirements.

For each row below, Claude must record: `Storelib status [unknown/verified/partial/missing]`, evidence (file line/test), UI coverage, preview/live parity, remediation, priority, acceptance test. This pack cannot pre-check Storelib code.

| Area | Shopify reference concept | Required Storelib outcome |
|---|---|---|
| Theme structure | Layouts, JSON templates, reusable sections | Storelib-native typed layouts/routes/templates/sections, versioned and compiled |
| Dynamic section groups | Configurable global header/footer region | Merchant/AI-customizable header/footer stacks, independently editable, no rigid fixed navbar |
| Blocks | Repeatable, re-orderable, nested theme blocks | Typed composable blocks/containers; support arbitrary layout within safe runtime |
| Design settings | Global, section, block settings + dynamic sources | Rich semantic controls and saved responsive overrides; binding sources resolve correctly |
| Styles | Schemes, typography, layout settings | Tokenized palettes, sizing, type scale, button variants, hover/focus, accessible contrast |
| Localization | Locale translation + context | Site locale strings, currency formatting, date/number, RTL where supported |
| Navigation | Link menus and policies | Nested menus, mega menus, mobile drawer, custom header and nav interactions |
| Asset management | Managed images/videos/fonts | Valid upload, optimize, manifest, licensing, CDN, srcset, alt and fallback |
| Catalog | Product templates/collection templates | Real dynamic product/collection pages; no hardcoded product IDs or broken sample data |
| Variants and inventory | Distinct variant selection and availability | Selected variant ↔ price ↔ media ↔ inventory ↔ cart/checkout synchronized |
| Cart | Transactional cart API | Storelib cart if implemented, atomic updates; preserve existing buy-now mode if intentional |
| Checkout | Platform-controlled checkout | Unique trusted checkout entry; never let arbitrary client code charge/store card data |
| Shipping | Delivery zones, profiles, origins | Admin create/update/validate; persisted shipping contexts and accurate checkout delivery info |
| Locations/inventory | Location-aware fulfillment | Assign fulfillable stock, location/service profile; handle unavailable combinations |
| Discounts/taxes | Central pricing rules | Backend authoritative calculations, eligibility and display consistency |
| Orders | Fulfillment/payment lifecycle | Order status transitions, stock reservations/reconciliation, email/events |
| Customer | Accounts/orders/preferences | Authenticated pages + correct entitlement and user/tenant permission controls |
| Metadata | Metafields/metaobjects equivalent | Extensible field registry and dynamic content references without arbitrary SQL |
| Search | Site and catalog search | Functional search overlay/results/filter/sort with indexes or safe fallback |
| Editor | live configurable sections and templates | Undo/redo, version history, draft/live preview parity, per-page/device controls |
| SEO | URLs, canonical, meta, structured data | Route-level metadata, dynamic product rich data, sitemap and safe redirects |
| Accessibility | Theme guidance | Keyboard, contrast, focus, reduced-motion, meaningful interactions |
| Performance | Limits and render performance | Size budgets, lazy media, cache, hydration split and analytics |
| Import (optional) | Shopify themes | Translate eligible Liquid theme source into Storelib AST, not execute Liquid; report unsupported constructs |

**Do not copy Shopify limits blindly.** Its current documented section/template limits are Shopify-specific. Storelib limits must be explicitly defined, discoverable and tested against the real compiler. Source: Shopify themes sections, blocks, settings, section groups, theme limits, Storefront Cart API.

**Required output:** a Markdown / machine-readable matrix generated after repo audit; if any row lacks evidence set it `unknown`, not `complete`. Add missing features to the roadmap with tests and no silent omissions.
