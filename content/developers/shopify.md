# Coming from another platform

A Storelib theme is built the way an Online Store 2.0 theme is: pages are lists of sections, a section is one file with its schema inside it, repeated content is blocks, and the settings panel is generated from the schema. If you have written a Dawn section, most of what you know carries over. This page lists what maps to what, and what Storelib does not have and why.

The biggest differences first:

- **A section is one `.storelib` file** with `<template>`, `<style>`, `<script>` and `<schema>` blocks. The template language reads like other store template languages (`{{ }}`, `{% if %}`, `{% for %}`, `{% content_for %}`, filters) but is smaller: no `assign`, no `capture`, no `render` or snippets. See [Sections](/developers/sections).
- **Theme blocks work as they do elsewhere**: a file each in `blocks/`, accepted with `{ "type": "@theme" }`, drawn with `{% content_for "blocks" %}`, nested, static, private with a leading `_`, and preset in the keyed form with `block_order`. See [Blocks](/developers/blocks).
- **CSS is scoped for you**, and a script runs in a sandbox against a copy of the section. See [Styling](/developers/styling) and [JavaScript](/developers/javascript).
- **Storelib is for creators**, not merchants with warehouses. There is no blog and there are no metaobjects, so the settings that pick those do not exist. What a creator sells is `products`, grouped in collections, and what they arrange is sections.

How close the builder is to other theme editors, setting by setting and page by page, is in [Theme editor parity](/developers/shopify-parity). To bring a whole theme across as it is, template code and all, import its zip instead: see [Imported themes](/developers/imported-shopify-themes).

## Setting types

The usual name, then Storelib's. A schema may use either name where both are listed: `product`, `page`, `collection`, `text_alignment` and `liquid` are read as `product_picker`, `page_picker`, `collection_picker`, `alignment` and `html`.

| Usual name | Storelib | Notes |
| --- | --- | --- |
| `checkbox` | `checkbox`, `toggle` | The same value; `toggle` draws a switch. |
| `number`, `range`, `radio`, `select` | the same names | A `range` may be `responsive`, with a value per breakpoint. |
| `text`, `textarea`, `richtext` | the same names | |
| `inline_richtext` | `inline_richtext` | Bold, italic and links, on one line. |
| `html` | `html` | Cleaned against an allow list: no scripts, no event attributes, no frames. |
| `liquid` | `html` | The markup is kept and cleaned. A template tag in it is printed as text, never run: logic belongs in the section's template. |
| `url` | `url` | Every link setting refuses `javascript:` and other schemes. |
| `video_url` | `video_url` | YouTube and Vimeo; `accept` narrows it. |
| `video` | `video_picker` | An uploaded video. |
| `image_picker` | `image_picker` | Also `image_gallery` for several. |
| `color` | `color` | |
| `color_background` | `color_background` | A colour or a linear or radial gradient, checked piece by piece. |
| `color_scheme` | `color_scheme` | The schemes themselves are the theme's, edited in Theme settings. |
| `font_picker` | `font_picker` | |
| `text_alignment` | `alignment` | |
| `link_list` | `link_list` | Menus are made in Theme settings, Menus. `main-menu` is the header's own links. |
| `page` | `page_picker` | |
| `product` | `product_picker` | Prints as the product's address and carries its title, price and picture. |
| `product_list` | `product_list` | Up to `limit` products, shaped like `products`. |
| `collection` | `collection_picker` | Prints as the collection's address and carries its title, picture, count and first twelve products. |
| `collection_list` | `collection_list` | Up to `limit` collections, block-shaped. |
| `header`, `paragraph` | the same names | Also `divider`. |
| none | `datetime` | A date, or a date and a time, read as written. Format it with the `date` filter. |
| none | `focal_point` | Where the important part of a picture is, as `object-position` reads it. Other platforms keep this on the image; Storelib keeps it beside the setting. |
| none | `icon_picker`, `file_picker`, `community_picker` | An icon, a downloadable file, one of the creator's communities. |

Types Storelib does not have are refused with the reason, rather than as an unknown word:

| Type | Why not |
| --- | --- |
| `blog`, `article`, `article_list` | A Storelib site has no blog of its own yet. |
| `metaobject`, `metaobject_list` | There are no metaobjects. Repeated content is blocks. |
| `color_scheme_group` | Colour schemes belong to the theme and are edited in Theme settings, Colors. A section picks one. |

## Schema keys

| Usual key | Storelib |
| --- | --- |
| `name`, `settings`, `blocks`, `max_blocks`, `presets` | the same |
| a block's `limit` | the same |
| `{ "type": "@theme" }`, a theme block by name | the same |
| a preset's `blocks` keyed by id, `block_order`, `static` | the same |
| a preset's `category` | the same: where Add section files it |
| `enabled_on`, `disabled_on` | `allowed_templates`, `disabled_templates` |
| a setting's `visible_if` | the same, written the same way: `"{{ section.settings.layout == 'grid' }}"`. See [Schema](/developers/schema#showing-a-setting-only-when-it-matters). |
| `tag`, `class` on a section | none: the section's own markup is its wrapper. A theme block has both. |
| `locales`, `t:` labels | none: see below |
| none | `type`, which must be the file name, and `schema_version` |
| none | `migrations`, to rename a setting without losing what creators typed |
| none | `capabilities`, what the section's script and embeds may reach |

## Templates and pages

Every site has these pages from the day it is published. The ones marked generated are built from the home page's header and footer and one section until the creator opens them in the builder; from then on, what they saved is what is served.

| Usual template | Storelib page | `page.template` |
| --- | --- | --- |
| `index` | Home page | `index` |
| `product` | Product page, one layout for every product | `product` |
| `collection` | Shop, at `/products`: every published product, generated | `page.products` |
| `search` | Search, at `/search`, generated | `page.search` |
| `404` | 404 page, generated, drawn inside the site's header and footer for any address the site does not have, with a real 404 status | `page.404` |
| `page` | About, Contact, and any page the creator makes. A new page starts as the usual default does: the header, a Page content section with the page's title and a rich text body, and the footer. | `page.<key>` |
| `list-collections` | Collections, at `/collections`: every published collection, generated | `page.collections` |
| `cart` | Cart, at `/cart`: the site's header and footer around the visitor's cart. Not arranged with sections, because a cart is one visitor's list. | none |
| `customers/account`, `customers/login` | Account at `/account` and Sign in at `/account/login`, generated | `page.account`, `page.login` |
| none | Wishlist at `/wishlist`, generated | `page.wishlist` |
| `page.contact` | Contact at `/contact`, generated when the creator has not made one | `page.contact` |
| policy pages | Refund, privacy and terms pages, from the creator's own policies | `page.<key>` |
| `robots.txt.liquid`, sitemap | Each site answers its own `robots.txt` and `sitemap.xml` | none |
| `blog`, `article`, `gift_card`, `password` | none. There is no blog and no gift card. A site that is not ready is left unpublished, and visitors see that it is not published rather than a password form. | |

A header and a footer are the same on every page, like the usual header and footer groups: the builder keeps one of each and the site draws it on every page. The announcement bar is a theme setting above the header, with several messages that take turns.

## Sections

The library's sections against Dawn's:

| Dawn | Storelib |
| --- | --- |
| Image banner, Slideshow | Centered Hero, Split Hero, Product Hero. A slideshow is not offered: it hides all but one message behind a timer. Older pages that used one still draw it. |
| Featured collection | Featured collection, from Products › Collections; or Product Grid: cards you fill in, products you choose, or the whole shop, newest first |
| Collection list | Collection list: every collection, or the ones you choose |
| Main page | Page content, on every page you add |
| Featured product | Featured Products, Product Spotlight |
| Multicolumn | Feature Grid, Feature Cards, Two Column Content |
| Multirow | Rows |
| Image with text | Image + Text, Image + Features |
| Rich text | Rich Text |
| Collage | Image Collage |
| Video | Video Section |
| Collapsible content | Accordion FAQ, Two Column FAQ, FAQ + CTA |
| Email signup, Newsletter | Newsletter Signup. It collects for the creator with nothing to set up. |
| Custom code | A section of your own, written in the code editor or by an agent |
| Contact form | Contact form, on the contact page and addable anywhere |
| Main account, Main login | The account and sign in pages' own sections |
| Main 404 | Page not found, on the 404 page |
| Main search | Search results, on the search page |
| none | Plans, for a course, a membership or a service sold more than one way |
| none | Course Outline, the modules of a course and the lessons in each |
| none | Testimonials, logos, countdown, announcement, founder story and timeline sections |
| Featured blog, Apps, Pickup availability, Quick order list | none: no blog, no app blocks, nothing to pick up and no wholesale orders |

## Dynamic sources

Other platforms connect a setting to a metafield. Storelib has no metafields, so the list of what a setting can be connected to is closed and small: the shop, the creator, the product on a product page, the page, the creator's social links and the year. A creator types or inserts `{{ shop.name }}` into a setting, and the page fills it in on the server. See [Schema](/developers/schema#shop-data-in-a-setting) for the list.

A template reads the same facts directly: `shop`, `creator` and `product`, beside `settings` and `blocks`. The other usual globals have their counterparts too: `routes` for the addresses every site answers on, and `customer` and `wishlist` on the pages drawn for one visitor.

## Not in Storelib

| Elsewhere | Why |
| --- | --- |
| Snippets and `{% render %}` | A section is self-contained so that it can be moved, exported and checked on its own. Shared styles live in the theme's tokens and colour schemes. |
| `assign`, `capture` | The language has no variables. `default` covers most of what they are used for, and `products` is shaped like `blocks` so one loop body serves both. |
| App blocks | There is no app store to provide them. A section's `embed` capability covers a player or a booking widget. |
| Alternate templates, such as `product.special` | Every product uses the one product page. |
| Translations and `locales/` | Sites are drawn in one language, the one the creator writes in. |
| The section rendering API | A section is drawn on the server with its page. Its script changes the markup it was drawn with and does not fetch new markup. |
