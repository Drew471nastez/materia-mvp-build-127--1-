# Importing a Shopify theme

A Shopify Online Store 2.0 theme, as the Shopify admin downloads it (a ZIP
with `assets/`, `blocks/`, `config/`, `layout/`, `locales/`, `sections/`,
`snippets/`, `templates/`), imports through the same Import button as a
`.storelib-theme` package. A GitHub download, with the folders one level
down (`dawn-main/sections/…`), is read the same way. Nothing has to be
prepared first.

The theme is kept whole, as its author wrote it, and drawn by Storelib's own
engine: its layout, its sections, blocks and snippets, its CSS, its
JavaScript, its settings and its words. Horizon and Dawn are the two themes
it was built and measured against.

A Shopify theme's license decides whether it may be used outside Shopify.
Shopify's own themes are licensed for Shopify stores. Import only a theme
you have the right to use.

## How it is kept

| Shopify | Storelib |
| --- | --- |
| `layout/*.liquid` | `layout/<name>.storelib` |
| `sections/<name>.liquid` | `sections/<name>.storelib`: the markup, then one `<schema>` that is the builder's panel and, under `"shopify"`, the theme's own |
| `blocks/<name>.liquid` | `blocks/<name>.storelib`, the same way |
| `snippets/<name>.liquid` | `snippets/<name>.storelib` |
| `templates/*.json` | the website's pages, below |
| `sections/header-group.json`, `footer-group.json` | the Header and Footer groups, on every page |
| `config/settings_data.json` | the theme's settings, under `shopify` in the website's theme settings |
| `config/settings_schema.json` | Theme settings in the builder: the theme's own groups |
| everything else | under `shopify/`, at the path it had: `shopify/templates/index.json`, `shopify/locales/en.default.json`, `shopify/assets/base.css` |
| pictures and videos in `assets/` | stored as media; `shopify/config/assets.json` names each one's address |

Each `.storelib` file is in the compatible profile of the template language
(`<template compat="shopify">`, lib/storelib-theme/compat). That is the full
language Shopify themes are written in: `assign`, `capture`, `case`,
`render`, `include`, `{% liquid %}`, whitespace control, `paginate`, `form`,
`content_for`, every filter a theme uses. It is Storelib's own
implementation, run by Storelib. No Shopify service and no third party
engine is involved.

`header` and `footer` are the names of Storelib's own built-in sections, so
Shopify's are kept as `theme-header` and `theme-footer`, marked as the site's
header and footer. A section whose name does not start with a letter
(Horizon's `_blocks`) is kept as `s_blocks`. The website's settings record
each rename, so `{% section 'header' %}` in a layout still finds it.

## Pages

| Template | Page |
| --- | --- |
| `index` | Home |
| `product` | Product, drawn for every product at `/products/<handle>` |
| `collection` | Collection, for every collection at `/collections/<handle>`, and `/collections/all` |
| `list-collections` | Collections list, `/collections` |
| `search` | Search |
| `cart` | Cart |
| `page` | every page without a template of its own, at `/pages/<handle>` |
| `page.<name>` | that page: `page.contact` is Contact |
| `blog`, `article` | Blog and Blog post |
| `404`, `password` | Not found and Password |

An alternate template (`product.preorder.json`) is kept under `shopify/` and
said in the report: a page is drawn with its kind's main template.

## The website

A website whose theme was imported answers every address the theme's markup
and scripts reach for, from the creator's own shop:

| Address | Answer |
| --- | --- |
| the pages above | the theme's layout and that page's sections |
| `?section_id=` and `?sections=` on any page | Shopify's section rendering API: those sections, drawn |
| `/cart.js`, `/cart/add`, `/cart/change`, `/cart/update`, `/cart/clear` | the cart, kept in a cookie; JSON to a script, a redirect to a form |
| `/cart` with `checkout`, `/checkout` | Storelib's own basket checkout, priced from the database |
| `/products/<handle>.js` | the product as data |
| `/search/suggest` | the search box's results |
| `/recommendations/products` | products like the one named |
| `/contact` | a contact form to the creator's inbox; a newsletter form to Subscribers |

A collection page and the search page carry `collection.filters` and
`search.filters`, made from the products themselves: Availability, Price,
one filter per option (Size, Colour…) and Product type, each value with how
many products it would leave. The theme's own filter markup asks for
`filter.v.availability`, `filter.v.price.gte`, `filter.v.option.<name>` and
`filter.p.product_type`, and the list is filtered by them: values of one
filter are OR'd, filters are AND'd, as on Shopify.

Prices, options and pictures are the creator's products. A product's price
reaches a theme in cents, as on Shopify, and `| money` writes it.
`window.Shopify` and the storefront events module a theme imports
(`@shopify/events`) are written by Storelib. Any other script or stylesheet
from Shopify's servers is taken out of the page, and named in the report.

### Where the theme's scripts run

A theme's JavaScript is someone else's code, so it never runs where a
Storelib session is:

- On the website it runs on the creator's own address
  (`<name>.storelib.com` or their domain). Session cookies are host only, so
  that origin holds none, and the app refuses API requests from a published
  site (`Sec-Fetch-Site: same-site`, or a write whose `Origin` is a site).
- The handler lives at `/api/site-theme/site/<name>/…`, an address that
  answers on every host. It draws nothing the proxy did not send it: the
  proxy seals each rewrite with an HMAC of the name, the host and a 60
  second expiry (`lib/storelib-theme/compat/site-seal.ts`), and an unsealed
  request is a 404. The secret is `COMPAT_SITE_SECRET` when set (32
  characters or more), otherwise derived from the service key.
- The theme's files are served with `Content-Security-Policy: sandbox`, so an
  HTML or SVG file in a theme runs nothing on storelib.com. The cover picture
  is drawn under `sandbox allow-scripts`, an origin of its own.
- In the builder it runs in a frame with no origin (below).

## The builder

The canvas draws the same page the website serves, with the same function,
inside a sandboxed frame that has no origin of its own: the theme's scripts
run there exactly as on the website (its sliders, drawers and option
pickers) and can reach nothing of the builder or the account.

Nothing in the canvas loads again for an edit. A setting changed draws its
section again and swaps it in place; a section added, hidden, deleted or
moved, or a theme setting changed, is worked out by drawing the page as text
and comparing it with the page on screen, and only what differs is changed
in the frame (`components/website-builder/compat/compat-canvas.tsx`,
`planPatch`). A page whose layout itself changed is loaded behind the one on
screen and takes its place once its pictures are in, so the canvas is never
seen empty. The toolbar over the canvas (move, duplicate, hide, delete)
follows the selected section inside the frame.

A link pressed in the page opens its page in the builder: always from the
header and the footer, and from anywhere while the inspector is off. The
store's menus reach the theme under Shopify's names (`main-menu`, `footer`),
on the website and in the builder alike (`lib/storelib-theme/compat/menus.ts`).

A click on the page selects the section and the block under it. A change in
the sidebar draws that one section again and puts it in place, with the
events Shopify's own editor sends (`shopify:section:load`,
`shopify:section:select`, `shopify:block:select`), so a theme opens the slide
or the tab that was chosen. Add section offers the theme's own sections, each
card drawn by the theme's own engine in a frame of its own as it scrolls into
view, and Add block its own blocks.

The sidebar has the theme's groups: Header, the page, Footer, and Overlay.
An older theme's static `{% section 'header' %}` and `{% section 'footer' %}`
come in as the Header and Footer groups' sections under their own names, so
they are selected and edited like any other; the engine draws the page's copy
where the tag stands, and an export puts them back in `settings_data.json`.
Any other group the layout draws (`overlay-group`, `aside-group`, a custom
one) comes into the Overlay group, each section remembering its group file.
Native Storelib themes have the Overlay group too, for a popup, a bar fixed to
the bottom of a phone or back to top: it shows when the theme has such a
section, and it is on every page, as the header and footer are.

Theme settings are the theme's groups from `settings_schema.json`, its words
from its locale, each setting with the builder's control for its type.
Colour schemes (Dawn) show each scheme the theme saved, with every colour
its definition names; a colour palette (Horizon) shows each of its colours,
and the settings that name a palette colour follow it.

## Saving

Every save of an imported theme's page goes through the same schema as any
page (`lib/website-builder/section-save-schema.ts`). A Shopify group names
none of its sections, and a missing name was refused as "Invalid body"; the
import now names each one, and the routes read a missing name as empty. A save
that does not land shows a small banner over the canvas, in words, with one
thing to do (`lib/website-builder/save-problem.ts`): reload, sign in, open your
themes, or nothing at all when a moment fixes it and it is tried again by
itself. It stays until a save lands.

## The report

Nothing is left out without a word. The import's answer has a one line
summary; the whole report is kept with the theme as
`shopify/import-report.json`, which the code editor shows. It names:

- each file that is not part of a theme, and why it was not kept
- each setting the builder has no control for: it keeps the theme's value
  and default on the page, and is not shown in the panel
- each tag the engine does not know, which draws nothing
- each picture or page a value names that lived in the Shopify store rather
  than in the theme (`shopify://shop_images/…`): the theme's placeholder
  draws until one is chosen
- each script or stylesheet from Shopify's servers the page went without
- app blocks, which have no Shopify apps to come from

## Checking a theme

```bash
npx tsx scripts/check-shopify-theme.ts horizon.zip dawn.zip
npx tsx scripts/check-compat-editor.ts horizon.zip
```

`check-compat-editor.ts` also hides, shows, deletes, undoes and moves a
section, adds one from Add section, changes a colour, presses a header link
and refuses a save, and checks each time that the page in the frame is the
same page and never empty.

The first serves each theme through the live site's own handler and drives
it in Chromium at 1440 and 390 wide: every page type, Add to cart, choosing
an option, the cart page, the search box, and that nothing is asked of
Shopify. The second opens the real builder on the theme: the canvas, a
click to select, an edit drawn in place, Theme settings.
`tests/compat-engine.test.ts` and `tests/shopify-import.test.ts` run with the
suite.
