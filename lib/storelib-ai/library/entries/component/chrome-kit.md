---
id: chrome-kit
title: The chrome kit: premium headers, drawers, search, switches and footers to adapt
category: component
summary: Twenty one complete .storelib sections for a free site's chrome (six headers, three menu drawers, three carts, two search windows, language and currency switches, six footers) on the page's hooks; pick one per role that fits the direction and adapt it, never copy it verbatim.
intents: [build-header, build-footer, build-site, navigation, design-header, build-section]
tags: [chrome kit, header, footer, mega menu, menu drawer, full screen menu, side sheet, bottom sheet, cart drawer, side cart, upsell, search panel, live search, language selector, currency selector, locale, wordmark footer, newsletter footer, sitemap footer, transparent header, announcement bar, category tabs, own chrome]
components: [header, footer, navigation, drawer, search]
phases: [plan, build]
priority: 5
related: [component-interactive-library, storelib-own-chrome, header-transparent, header-fullscreen-menu, footer-big-type, component-drawer, motion-tiers]
version: 1
---
A free site draws its own chrome, and a plain bar of text links (name, menu, Search, Cart) reads as unfinished. Start from the kit: ask search_knowledge for an id to get the whole file, then adapt it to the direction. Rename the ai_ type, set the type, colours, spacing, words, motion strength and details the direction calls for, and drop what the site does not need. Never ship a kit file unchanged, and never mix two kit headers on one site.

| Role | Id | What it is | Suits |
| --- | --- | --- | --- |
| header | ai_chrome_header_overlay | transparent over a full bleed hero, solid after the first scroll (CSS scroll timeline), drop down sub menus | imagery led: hotels, restaurants, travel, sport, real estate |
| header | ai_chrome_header_split | centred logo, a menu either side, thin utility line, rolling link hover | boutiques, beauty, jewellery, florists, bakeries |
| header | ai_chrome_header_mega | mega menu panels: link columns, image cards and chosen products per top link | shops with collections |
| header | ai_chrome_header_minimal | name, bag and one Menu button with its own full screen menu and a picture | studios, agencies, portfolios, coaches |
| header | ai_chrome_header_announce | rotating, moving or side by side announcement bar over an inline menu with switches | drops, launches, food and drink |
| header | ai_chrome_header_shop | compact pinned bar, wide search field, sideways category tabs, top row slides away | marketplaces, grocery, large catalogues |
| menu | ai_chrome_menu_fullscreen | full screen, huge staggered links, wipe, fade or drop, sub links fold open | bold and expressive directions |
| menu | ai_chrome_menu_sheet | side sheet over a dimmed page, sub menus slide over, featured cards | shops |
| menu | ai_chrome_menu_bottom | bottom sheet on phones, a panel on wide screens, quick action tiles | booking, local services, app like sites |
| cart | ai_chrome_cart_side | side drawer with pictures, steppers and an upsell row (product_list) | most shops |
| cart | ai_chrome_cart_minimal | full height, set in type, numbered lines, the total large | luxury, editorial, few products |
| cart | ai_chrome_cart_card | floating card under the bag, above the bottom edge on phones | playful, single product, quick buys |
| search | ai_chrome_search_full | full screen, huge input, popular searches and chosen products, live picture grid | visual catalogues |
| search | ai_chrome_search_drop | drop down with suggestions and quick links, compact live list | large catalogues, content sites |
| locale | ai_chrome_locale | languages and currencies as pills, a drop down or a sentence; flags off by default | sites in more than one market |
| footer | ai_chrome_footer_wordmark | the name across the whole width, rising into view | brands with a strong name |
| footer | ai_chrome_footer_newsletter | a big sign up and reasons to join, then menus | communities, creators, drops |
| footer | ai_chrome_footer_columns | columns as blocks: menus, address and hours, socials | classic shops and services |
| footer | ai_chrome_footer_line | one quiet line | portfolios, landing pages |
| footer | ai_chrome_footer_image | full bleed photograph, a last statement and one action | venues, hospitality, travel |
| footer | ai_chrome_footer_sitemap | the whole menu as a directory grid | large sites |

**How to compose**: one header in the header group. Right after it, in the same group, one menu drawer, one cart and one search window: every data-storelib-menu, data-storelib-cart, add to cart and data-storelib-search button on the page opens them (data-storelib-menu-panel, data-storelib-cart-panel, data-storelib-search-panel). Language and currency go inside the drawer, the footer or ai_chrome_locale, and the page hides each list when the site has only one. One footer in the footer group.

**Bind, do not type**: menus are link_list settings (main-menu, footer), the logo is theme.logo, products in the mega menu, the search window and the cart's upsell come from product_list settings. Never type a product, a price or a menu link into markup.

**What each already does**: CSS first motion on the site's motion feel (--t-motion-*), still under prefers-reduced-motion and with a `motion` select set to Still; panels are dialogs through the hooks (focus moves in, stays inside and goes back, Escape and the close buttons shut them); every target is 44px or more; each has its own phone layout. Settings cover layout variant, sticky or over the hero, logo size, menu style, colour scheme, spacing, motion strength and which parts show; blocks (menu columns, featured cards, footer columns, social links, popular searches) come with filled presets. A drawer has "Keep it open in the editor" so the creator can style it.
