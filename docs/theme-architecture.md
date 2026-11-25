# The Storelib theme: how it is built

Every Storelib template is the same theme, Materia, with a different overlay on
top. This page is for creators and developers who change that theme: where
things live, what loads on every page and what loads only when a section is on
the page, and the rules that keep it fast and keep live stores unchanged.

## Where things live

```
theme-packages/materia/
  base/                         the theme every template shares
    layout/theme.liquid         the page shell: head, global CSS and JS, body
    layout/password.liquid      the password page shell
    sections/                   ~320 section types, one file each
    blocks/                     theme blocks (variant picker, offers, menus)
    snippets/                   shared markup: cards, icons, buy buttons
    assets/                     CSS, JS, fonts, sample pictures
    config/settings_schema.json the theme settings and their defaults
    config/settings_data.json   the base's own saved settings
    locales/                    storefront and editor strings
    templates/                  base page templates (cart, search, 404 ...)
  templates/<folder>/           one overlay per template
    templates/*.json            which sections each page has, with settings
    sections/*-group.json       header, footer and overlay groups
    config/settings_data.json   merged over the base settings
    assets/*.webp               the template's own pictures
    menus.json                  its menus
```

`lib/themes/template-packages.ts` composes base plus overlay. The list of
templates is `CODE_TEMPLATES` in `lib/themes/marketplace-shared.ts`.

### Who sees a change

| You change | Who sees it |
| --- | --- |
| `base/` or a template overlay | New installs, the marketplace previews, and an existing store only after its owner takes the theme update (`lib/themes/theme-update.ts`). An installed theme is the store's own copy. |
| The engine (`lib/storelib-theme/**`) | Every live store at the next deploy. Engine changes must reproduce today's output for old theme files: feature detect, and gate anything new behind a setting that defaults to the old behaviour. |

## What a page loads

### CSS

1. **One render-blocking bundle in the head.** `assets/base.css` is
   critical, section-isolation, animation, product-card, swiper,
   theme, theme-button-contract, localization-controls, product-block-runtime,
   layout-guard, late-css-guard and section-type, in that cascade order.
   Stores with *Scroll animation: None* link `assets/base-static.css`, the
   same bundle without animation.css. Both are generated:

   ```bash
   node scripts/build-materia-base-css.mjs          # writes both
   node scripts/build-materia-base-css.mjs --check  # fails when either is stale
   ```

   Edit the source files, never the bundles. `tests/theme-templates.test.ts`
   fails on a stale bundle. The theme editor and right-to-left stores link the
   sources one by one (the editor needs them separate, and rtl.css sits in the
   middle of the order).
2. **Section CSS comes with its section.** A section that needs its own
   stylesheet links it at the top of its file (`stylesheet_tag`). A page
   without that section never downloads it. On a live store the engine
   gathers these links into the head in the same order
   (`lib/storelib-theme/compat/first-load.ts`) and drops exact duplicates.
3. **Late CSS.** Popups and the modal library load after the page has loaded
   or at the first interaction. Review stars and the hover zoom load as
   `media="print" onload` so they never hold the first paint.
4. **Fonts.** `snippets/font-variables.liquid` asks Google Fonts once for
   every family in use, with only the weights in use and `display=swap`.
   Font library picks are linked by the engine. Preconnects come from
   `snippets/speed-optimization.liquid` and are read from real addresses.

### JavaScript

| How | What | Why |
| --- | --- | --- |
| `defer` in the head | swiper, utils, global, cart drawer safety, section links, product counters, product block runtime, product dialogs, hero-image-one (the painter API other section runtimes call) | needed by many sections, runs in order after parsing |
| `type="module"` | theme.js (with a `modulepreload` of cart-components.js), motion, photoswipe-init | module graph, low priority |
| Per template (`snippets/scripts-tag.liquid`) | main-product.js on products, collection.js on collections and search, the 360 viewer only for a product that has 360 images | a page runs only what it shows |
| Per section | a section's own runtime, `<script src defer>` at the top of the section | each runtime returns at once if its `window.Materia*` object exists, so a type placed twice runs once |
| `mtLazy(src)` | size charts, cart line editing, form sending | loaded at the first tap, key or focus, or when the page goes idle |
| Idle prefetch (`assets/theme-navigation.js`) | the few product pages in view | a tap on a phone opens them from cache; off with *Performance > Snappier page navigation* |

The editor loads every section runtime with the page (list `S` in
`layout/theme.liquid`), because a section the editor adds is inserted without
running its script tags.

### Pictures

Use the theme's image snippets (`image_url` with `widths`, `sizes`,
`loading="lazy"` below the first screen, `fetchpriority="high"` on the first
image). A section never sets a picture's width and height to anything but its
real ratio: that is what keeps the page from jumping.

## Rules for a new or changed section

- Settings for everything a creator should change; colours, fonts, buttons and
  radius from the theme's global settings unless the creator overrides them.
- CSS scoped to the section's id or a prefixed class. No unscoped selectors
  outside `layout/`.
- Animations with `transform` and `opacity` only, and nothing moves under
  `prefers-reduced-motion: reduce`.
- No script on the first screen that reads layout in a loop. Read sizes once
  (a `ResizeObserver`), write styles after.
- An element fixed to the bottom of the screen (a taskbar, a tab bar) carries
  `data-mt-bottom-bar`. The sticky add to cart bar reads every such bar and
  sits above it, on every screen size (`assets/main-product.js`,
  `placeAboveNav`). The phone tab bar (`mobile-navigation-bar`) is read the
  same way.
- Icons: one icon set per row. A trust or benefit row draws every icon from the
  same snippet so the stroke, box and weight match. The returns icon in the
  line sets is a U-turn arrow drawn centred in the same 24 unit box as its
  neighbours (`snippets/hp-icon.liquid`, `snippets/product-info-blocks.liquid`,
  `snippets/product-info-extras-icon.liquid`).
- Accessibility: a control that shows only an icon on a phone keeps an
  `aria-label`; `role="listitem"` sits inside `role="list"`.

## Checking a change

```bash
node scripts/build-materia-base-css.mjs      # after editing base CSS sources
node scripts/build-materia-catalogue.mjs     # after base or template edits
npx tsx scripts/build-template-previews.ts <slug> [slug ...]   # always name the slugs
```

Then look at the preview at 1440 and 390, and run
`tests/theme-templates.test.ts`, `tests/theme-templates-pages.test.ts`,
`tests/theme-templates-links-forms.test.ts` and
`tests/theme-template-previews.test.ts`.

Previews under `public/theme-previews/` are static copies. The preview builder
writes a script or style that two pages repeat as a shared file, so a preview
makes more requests than the live store, where those stay inline. Measure the
theme on the live route, or serve a preview with those files put back inline.

## Measured, round 27

Lighthouse 12.6 (phone, simulated slow 4G), median of four runs, on the
template previews served as a live store serves them (hoisted inline code put
back inline, gzip). Old and new built from the same theme files, only the
layout change between them.

Scroll animation set to None (14 of 34 templates), `base-static.css`
instead of the eleven separate stylesheets:

| Page | Requests | Render-blocking CSS files | First paint (FCP) | LCP |
| --- | --- | --- | --- | --- |
| Retro desktop, home | 65 to 55 | 15 to 5 | 2.27 s to 2.02 s | 5.91 s to 5.59 s |
| Retro desktop, product | 76 to 66 | 15 to 5 | 2.35 s to 2.36 s | 5.43 s to 5.16 s |
| XP shop, home | 68 to 58 | 15 to 5 | 2.91 s to 2.29 s | 6.57 s to 6.14 s |
| XP shop, product | 80 to 70 | 15 to 5 | 2.60 s to 2.63 s | 6.37 s to 5.89 s |
| Night shop, home | 85 to 75 | 15 to 5 | 2.37 s to 2.21 s | 6.61 s to 6.46 s |
| Night shop, product | 99 to 89 | 15 to 5 | 2.62 s to 2.41 s | 7.15 s to 6.65 s |
| Online course, home | 81 to 71 | 15 to 5 | 2.54 s to 2.35 s | 5.70 s to 5.46 s |
| Online course, product | 88 to 78 | 15 to 5 | 2.68 s to 2.46 s | 6.09 s to 5.71 s |

The four remaining render-blocking files are font stylesheets. Total
blocking time moved by up to several hundred milliseconds in both
directions between runs on a shared machine, so it is not reported as a
change. Full page screenshots of home, a product, a collection, the cart and
About at 1440 and 390 were compared pixel by pixel between the two builds:
Retro desktop and XP shop are identical; Online course and Night shop
differ only where two renders of the old build also differ from each other
(a moving starfield and a marquee).

What is still slow, and why it was left:

- **LCP render delay.** On every template measured the first picture has
  arrived about 3.5 s before Lighthouse counts it painted; in its simulation
  the main thread (style, layout and the deferred scripts) is what the paint
  waits on. How pictures and reveals arrive is the motion and image loading
  work of this round, so it was measured here and not changed.
- **Unused font stylesheets.** The engine links a stylesheet for every font
  picker in the settings (`fontStylesheets` in
  `lib/storelib-theme/compat/theme.ts`), also when the template uses another
  font. Two extra render-blocking requests on every page. Fixing it is an
  engine change for every live store, so it needs a theme opt-in first.
- **swiper-bundle.min.js** (41 KB compressed) runs on every page, also where
  no section uses a slider. The sections that use it expect it before their
  own scripts, so it stays global until each slider section links it itself.
