# Materia: make scrolling smooth (a prompt for the theme's AI)

Paste everything below the line into the AI that edits the Materia theme's code in its GitHub repository.

---

You maintain the Materia theme, an imported (Shopify-format) theme that runs on Storelib, at https://andrewrullz.storelib.com and inside Storelib's website builder canvas. Scrolling the store stutters, live and in the builder alike. Storelib measured the live pages (home, `/products/pants-down`, `/collections/all`) in Chromium while scrolling the whole page with a mouse wheel and a touch fling. At CPU 1x, about a third of the frames were dropped live, with frames up to 100–250ms. Almost all of that main-thread time is the theme's own code and CSS. The builder now adds very little on top: its own scroll work fell from 2.4s to 0.25s in a 13s scroll.

Fix the theme so that scrolling does almost no work on the main thread. Keep how every page looks and behaves exactly as it is now.

## What costs the time (live page, home, desktop, CPU 1x, one wheel scroll down the page, about 12s)

| Cost | Where | Time |
|---|---|---|
| Restyling the whole page for small changes | `:has()` rules (below) | 4.3–4.6s, about 35% of the scroll; each change restyles about 2,000 elements |
| Forced style read right after a class change | `assets/animation.js`, the `revealObserver` callback (lines about 77–97): `classList.remove('scroll-trigger--offscreen')`, then `getComputedStyle(target).animationDuration` | 0.3–0.4s |
| Bottom inset measured on every scroll frame | `assets/materia-popups.js`, `queueInset` on `scroll`, then `measureInset` and `bottomInset` (lines about 368–395): `getClientRects`, `getComputedStyle`, `getBoundingClientRect` for the phone tab bar and the cookie banner | 0.15–0.19s |
| Sticky header's scroll handler | the inline `<script>` in `sections/header.liquid` (`update`, `StorelibStickyStack`): `getComputedStyle(html).getPropertyValue('--storelib-header-top')` and `marker.getBoundingClientRect()` on every scroll | 0.11–0.14s |
| Sliders set up while scrolling | `assets/swiper-bundle.min.js` `init`, `updateSlides`, `updateSize` (computed styles of every slide) | 0.10–0.14s |
| Reveal scan | the inline script after the `countdown_promo_popup` section (`inView`, `scan`) | 0.05–0.08s |
| Cookie banner placement | `assets/cookie-consent.js` `place` (`getClientRects`) | about 0.07s |

### The `:has()` rules

There are 132 `:has()` rules: 28 in `cart-drawer.css`, 24 in `section-isolation.css`, 20 in `minicart.css`, 18 in `animation.css`, 15 in `product-card.css`, 10 in `product-page-ui.css`, 8 in `navigation.css`, 8 in `product-offers.css`, 21 inline in the layout and sections, and a few in other files. Chromium has to check a `:has()` rule again whenever something its argument could match changes anywhere under the element it is on. A rule on a broad element (`body`, a section, every card) with a broad argument (a tag name, `svg`, `button`, `a`, `[style]`) turns one class change during a scroll into a restyle of the whole page. These matched on every scroll frame:

- `.tingle-modal-box:has(#product-form-quick-edit) .tingle-modal__close svg` (`minicart.css`, `cart-drawer.css`) re-checks every `svg` on the page.
- `#shopify-section-header .header__menu .horizontal-list:has(.menu_label) > .level0 > menu-item > a` (inline, header) re-checks every `a`.
- `.product-item__inner:has(> .pc-corner > :is(.pc-heart, .product-item__button-wishlist.absolute)) .product__badges.absolute` and the other `body[data-badge-position=…] .product-item__inner:has(…)` rules (`product-card.css`).
- `.ti-tabs__panel:has(.ti-tabs__empty) :is(.product-item, button-wishlist, …)` (`materia-experience.css`).
- `.product__submit-form-cart:has(> .pdp-wishlist--icon) > .button_buy-now > button` (`product-page-ui.css`) re-checks every `button`.
- `[data-theme-button].loading:has(> .icon-load) > :is(…)` (`theme-button-contract.css`).
- `.review_sold:has(.jdgm-widget[style="display: none;"])` (`product-card.css`). This one reads the `style` attribute, so **any inline style change anywhere on the page**, by any script, restyles the page. Measured in the builder: 18ms for one style write on an element in `<body>`.

## What to do

1. **Replace the broad `:has()` rules with classes the theme sets itself**, once, where the state changes. For example, add `is-empty` to `.ti-tabs__panel` when the tab is empty, `has-wishlist-icon` to `.product__submit-form-cart` when it renders the icon, and `is-loading` to the button where the theme already toggles `.loading`. Never use `[style…]` inside `:has()`: give `.jdgm-widget`'s hidden state a class or an attribute that only the reviews script sets. Where a `:has()` must stay, keep its subject narrow and its argument specific (a child combinator and a class, never a bare tag). Keep the look identical.
2. **`animation.js` reveal**: do not read `getComputedStyle` in the observer callback. Read the durations once per element type at setup, or use a CSS custom property, or rely on `animationend` with a fixed fallback timer from a constant. Do all reads before all class changes.
3. **`materia-popups.js` bottom inset**: the inset does not change when the page scrolls. Drop the `scroll` listener. Measure on `resize`, from the existing `ResizeObserver` on the bar and the banner, and on the `data-open` / `hidden` changes it already watches.
4. **Header sticky script** (`sections/header.liquid`): read `--storelib-header-top` once, and again on resize or when `StorelibStickyStack` says it changed. Cache the marker's page offset (`top + scrollY`) and update it from a `ResizeObserver`, not every scroll. On scroll, only compare `scrollY` with cached numbers and toggle classes in a `requestAnimationFrame`, writes only.
5. **Swiper**: initialise every slider at page load (or when idle), not when it scrolls into view. Give slides their size in CSS so `updateSize` and `updateSlides` find nothing to change.
6. **Inline reveal scan** (after `countdown_promo_popup`) and **`cookie-consent.js` `place`**: run on load, resize and the events that change them, not per scroll. Use `IntersectionObserver` entries (`entry.boundingClientRect`) instead of `getBoundingClientRect` where possible.
7. Every scroll, touch and wheel listener must be `{ passive: true }` (most are) and must only read cached numbers or schedule one `requestAnimationFrame`.

## The builder's side (already done by Storelib, for your information)

- The builder's outlines, the "Add section" strip and its other marks live in a **shadow root** behind one host element, `<div data-sl-box="layer">`, appended to `<body>`. Nothing in the theme can match them, and their changes no longer restyle the theme. Do not style or remove `[data-sl-box]`, `[data-sl-*]` or `[data-storelib-*]` elements.
- In the builder only, a top-level section in `<main>` that is more than one and a half screens away from the view gets `data-sl-rest` and `data-sl-far`, and is drawn with `content-visibility: hidden` at the size it last had. It is drawn again before it comes on screen. It is never applied to a section of a group (header, footer, overlays) or to a section with anything `position: fixed` or `sticky` in it. The theme's `IntersectionObserver`s, reveals and lazy pictures work as on the live site. Don't measure sections that are far from the screen while the page scrolls.
- The theme sees the same events as on Shopify's theme editor (`shopify:section:load`, `shopify:section:select`, …) and Storelib's `storelib:section-load` on a section drawn again. Start a section's code once per load and take it down on `shopify:section:unload`.

## How to check

Storelib's probe `scripts/check-wb-scroll-r14.mjs` (in the Storelib repository) scrolls the live pages and the builder canvas and prints dropped frames, the longest frame and where the main-thread time went, by file and function. The goal is under 5% dropped frames and no frame over 50ms at CPU 1x on the live home page. Your change should also remove the theme rows above from its `forced` and `topFunctions` output.
