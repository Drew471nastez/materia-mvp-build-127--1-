---
id: storelib-own-chrome
title: A free site's own header, footer, cart drawer, search and switches
category: storelib
summary: On a free site the host draws no built-in chrome; the site's own header and footer use the page's hooks for the cart drawer, search window, menus, language and currency, so they look like the concept and still use live data.
intents: [build-header, build-footer, build-site, add-cart, add-search]
tags: [header, footer, cart drawer, cart, search, search panel, language, locale, currency, selector, switcher, hooks, own chrome, free site, mega menu, mobile menu]
components: [header, footer, drawer, navigation]
capabilities: []
phases: [plan, build]
priority: 5
related: [component-interactive-library, header-mobile-menu, storelib-checkout-cta, core-links-and-actions]
version: 1
---
**Free site**: when the site's chrome is the AI's own (blank mode, agent jobs), the page draws no built-in header, footer, announcement bar, breadcrumbs, cart drawer, search window, language or currency switcher, cookie bar or floating UI. Your header (schema kind header) and footer (kind footer) are the site's chrome on every page. Write both, always.

**Hooks the page wires for your markup** (no script needed):
- Menu: a link_list setting (default main-menu) looped with `settings.menu.links` and `link.links`; your own mobile menu with a popover, or `data-storelib-menu` for the built-in drawer.
- Cart: `data-storelib-cart` on the button, `data-storelib-cart-count` for the badge (`[data-count="0"]` hides it). Your own drawer: an element with `data-storelib-cart-panel` in the same section (the page sets `data-open="true"` or `"false"`, aria-hidden and inert), inside it `data-storelib-cart-lines` holding ONE hidden `data-storelib-cart-line` pattern with `data-line-title`, `-variant`, `-price`, `-qty`, `-image`, `-url` and the buttons `data-line-inc`, `-dec`, `-remove`; plus `data-storelib-cart-subtotal`, `data-storelib-cart-empty`, `data-storelib-cart-filled`, `data-storelib-checkout`, `data-storelib-cart-close`.
- Panels are not drawn while shut: the page keeps a cart, search or menu panel off the page until it opens and removes it again after its closing motion. Style the shut look as the default and the open look under `[data-open="true"]`; make a drawer or window `position: fixed` on the panel element (the page puts it above everything); never use `display`, `visibility` or `hidden` to shut one.
- Search: your own window is an element with `data-storelib-search-panel` in the section; its `data-storelib-search` buttons open it instead of the built-in one. Inside: `data-storelib-search-input`, `data-storelib-search-results` holding ONE hidden `data-storelib-search-result` with `data-result-title`, `-price`, `-image` (img), `-url` (link), `-kind`; and `data-storelib-search-empty`, `-loading`, `-close`.
- Language: `data-storelib-locale-list` holding ONE hidden `data-storelib-locale-option` with `data-option-label` and `data-option-code`; the page copies it per language, marks the active one `aria-current="true"`, switches on click, writes the active label into `data-storelib-locale-current`, and hides the list when the site has one language. Currency: the same with `data-storelib-currency-list`, `-option`, `-current`.
- Sign up: a form with `data-storelib-form="subscribe"`, an email input named email, a submit button, and a `data-storelib-success hidden` message.

**Always link the plain page too**: the cart button is a link to `routes.cart_url` and search to `routes.search_url`, so they work before the page's script loads.

**Design**: the header is the first thing a visitor reads; make it belong to the concept (a type led bar, a split logo, a side rail, a floating pill only if the concept is playful). Footers can carry the brand name set huge, the sign up, menus and switches. The working example is ai_site_header and ai_site_footer (component-interactive-library).
