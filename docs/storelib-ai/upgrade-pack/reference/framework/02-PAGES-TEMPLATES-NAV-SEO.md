# Pages, dynamic templates and custom navigation

## Dynamic site architecture
Static pages (home/about/contact/FAQ/blog/landing), dynamic template routes (`/products/:slug`, `/collections/:slug`, `/courses/:slug` etc based on real repo routing), protected membership/customer area and app views. Every route must resolve through Storelib's router with valid metadata and permission checks.

Page planner should decide number of pages and content density by user brief, sales journey and site type. Do not enforce a universal 7-page rule; use full site coverage when 'whole website/full store' requested. For full apparel/physical store: home, catalog/shop, category/collection template, product template, about, contact, FAQ, policies; account/cart optional if enabled; extra editorial/lookbook/shipping/returns as appropriate. Products are dynamic templates, not manually duplicated pages per SKU.

## Custom UI shell
Header/footer/sidebar, navigation mega menu, mobile sheet, sticky header, announcement bar, top-level search, drawers, quick view, floating CTA, subnav, anchor navigation and modal can all be generated variants. Do not force predefined Storelib header/footer appearance. Bind logo, logo text, logo size, favicon, menu data and links to real theme/store data instead of hardcoding. Layout settings reflect styles; accessibility and navigation behavior apply in every variant.

## Source-of-truth
Use canonical menu registry + link resolution; preserve internal/external URLs, navigation grouping, open states, mobile and desktop behavioral parity. Validate links, breadcrumbs, redirects and pagination; dynamic data fallback on missing catalog items.

## SEO and identity
Per-page title/meta, canonical, OpenGraph and share media, structured data for valid product/course/articles only, sitemap, robots rules, image alt text, 404/not-found, human-friendly slugs, translated slugs if supported, breadcrumbs. Keep merchant-provided legal policies rather than fabricate them. Avoid duplicate titles/canonicals between dynamic route instances.

## Pages need real interactions
Search page works; contact form submits to real endpoint; newsletter writes to real provider; sign-in uses Storelib auth; shopping pages bind correct selected variant and stock. Don't create a CTA to an unregistered route.
