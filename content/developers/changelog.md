# Changelog

Changes to the Storelib Builder Framework: the section format, the template language, the schema, the controls and the rules the compiler enforces. Changes to the builder's interface that do not change what a section can do are not listed.

## Versions

Five things carry a version, and they move independently so that one changing does not force the others.

@[versions]

A file written for a newer version is **refused, not misread**: a schema declaring `"schema_version": 2` against an engine that reads 1 is rejected with both numbers named. A file written for an older version is always read, and keys the engine does not recognise survive every read and write.

Every change since 1.0 has been additive. Nothing a section could do on 11 September 2026 has stopped working since, which is why every version above is still 1.

## 25 October 2026

**Added**

- Personalization fields for physical products. In an imported theme: `product.metafields.storelib.personalization` (each field's `label`, `type`, `required`, `max_length` and the input `name`, `properties[<label>]`), the `storelib-personalization` snippet and `storelib_personalization` filter, a Personalization app block, and photos sent through `/cart/upload` ([template language](/developers/imported-shopify-themes#template-language)). The cart answers 422 for a required answer that is missing, and the checkout checks again. On a Storelib theme: the product section's Personalization block set to The product's fields, and the fields above the buy buttons when the section has no such block.
- Quantity breaks and Buy X get Y free as a third kind of offer, with `GET /api/offers/quantity-breaks?product=` and `GET /api/offers?product=` (bundles, quantity breaks and checkout offers in one answer), the formula a theme shows them by and the checkout charges by ([Physical commerce](/developers/physical-commerce#quantity-breaks)).
- `product.metafields.storelib.offers` in an imported theme, the same JSON as `GET /api/offers`, and `line_item.properties` on the account's orders.
- Line item properties reach the order: the checkout's `items` takes `[productId, variantId, quantity, properties?]`, and links without them read as before. The codes `/cart/update.js` `discount` asks for are kept on the cart and listed by `/cart.js` with whether each applies.
- Pictures on a cart line: a product form's `<input type="file" name="properties[Photo]">` on a multipart `/cart/add`, `POST /cart/upload` and `POST /api/cart/uploads`, kept privately and copied to the order when paid. The product section's Personalization block in the Storelib theme ([Physical commerce](/developers/physical-commerce#personalization-words-and-pictures)).

## 24 October 2026

**Added**

- Size charts for physical products. In an imported theme: `product.metafields.storelib.size_chart`, the `storelib-size-chart` snippet and `storelib_size_chart` filter, and a Size chart app block ([template language](/developers/imported-shopify-themes#template-language)). On a Storelib theme: the product section's Size chart block, and a Size guide link in the variant picker.

## 23 October 2026

**Changed**

- A `select` or `radio` setting with one to three options is drawn as a row of buttons, four or more as a dropdown, and a short list with labels too long for its buttons as a dropdown. This is one rule for every schema: Storelib themes, imported themes' `settings_schema.json` and section schemas, Theme settings and Website settings ([how a choice is drawn](/developers/schema#choosing-the-type)).

## 11 October 2026

**Added**

- [Imported themes](/developers/imported-shopify-themes): a page on what an imported theme can use on Storelib, from its template code and the AJAX cart to accounts, the canvas and what does not come across.
- In an imported theme: sign in, sign up and the account page on the website's own host with an emailed code, in the theme's own `customers/*` templates when it has them; the theme's hearts kept in step with the website's wishlist; contact and newsletter forms that reach the creator; a blog page drawn with its title and no posts.
- In the builder's canvas, an imported theme's Add to cart, cart drawer and quantity changes work against a cart the builder keeps; checkout says it opens on the live site.
- In an imported theme, `/account` lists the visitor's downloads, `/account/orders/<id>` is an order's own page in the theme, and its files download from the website itself; account pages draw in the builder's canvas.
- Website checkout on the website's own address, `/checkout`, with its thank you page: an imported theme's Check out goes there.
- In an imported theme, a product's custom fields as `product.metafields.custom.<key>` and its questions as `product.metafields.storelib.faqs`, and a counted variant's `inventory_quantity` once few are left.
- Live websites cross-fade between pages, with the next page fetched while the pointer rests on its link ([between pages](/developers/imported-shopify-themes#between-pages-on-the-live-site)).

**Changed**

- `shop.name` falls back to the store's name from Settings › Store details before the creator's own name, on native and imported themes, live and in the canvas.
- A checkout button an imported theme keeps disabled until its terms box is ticked is freed when it is, and the header's cart icon in the canvas opens only the theme's drawer.

## 10 October 2026

**Added**

- [The overlay group](/developers/header-and-footer#over-every-page-the-overlay-group): a fourth section group, `"overlay"`, for what floats over every page. `enabled_on: { "groups": ["overlay"] }` puts a section there; it is shared by every page like the header and footer, saved in `sections/overlay-group.json` in a theme package.
- For a floating section, the page does what its own script cannot: `data-storelib-back-to-top`, `data-storelib-popup`, `data-storelib-popup-close` and `data-storelib-bottom-bar` ([what the page does](/developers/header-and-footer#what-the-page-does-for-a-floating-section)).
- Three sections in the default theme's Overlay category: Back to top, Phone tab bar and Popup.
- A section can be renamed from the title of its settings. The name is the page's own (`label` on the placed section) and wins over the schema's `name` in the sidebar and the canvas; clearing it goes back to the schema's.
- Every store starts with two collections, All products (smart, every product) and Home page (picked by hand), so a `collection_picker` always has something to name.

**Changed**

- A schema default written as a `t:` key (an imported theme's) is drawn as the word in the theme's schema locale, on the live site, in the canvas and in Add a section.
- Add a section never shows a blank card: a section drawn hidden until a script reveals it is shown, and one that draws nothing until it has content is named.
- A save the server refuses says what happened and what to do, in one line with one action, instead of the raw error.

## 7 October 2026

**Changed**

- A header, footer, menu, icon set, button, animation or logo size is the section's design. It is not refused. Write `sections/<name>.storelib` with `"kind": "header"` or `"kind": "footer"` and design it freely. `sections/header.storelib` and `sections/footer.storelib` stay reserved.
- What a save still refuses is a live Storelib value typed in by hand: menus and sub links (`link_list`, `link.links`), the logo (`theme.logo`), cart, search and menu drawers, account, buy buttons (`checkout_url`), products and prices, and email forms.
- Colours may follow the scheme and may be overwritten. Motion is the section's own. `prefers-reduced-motion` is a courtesy, not a reason to refuse a file.

## 5 October 2026

**Added**

- [The site's drawers](/developers/header-and-footer#the-sites-drawers) for a header of your own: `data-storelib-menu` with `data-storelib-menu-from`, `data-storelib-cart`, `data-storelib-cart-count` and `data-storelib-search` open the same menu drawer, cart drawer and search window as the built-in header.
- The built-in header: Menu on larger screens (`desktop_menu`), a phone menu that drops down from the top (`mobile_menu_style: "top"`), a search window with live results (`search_behaviour: "modal"`), and links that open their sub-links as a dropdown when they have no address of their own.

**Changed**

- Every drawer closes on the curve it opens with, and closes when pushed back toward its edge.
- A site with no favicon shows its logo in the browser tab.

## 3 October 2026

**Added**

- [The main product section](/developers/selling#the-main-product-section) is blocks: title, price, variant picker with swatches, pay what you want, quantity, buy buttons, low stock, badges, description, collapsible tabs, text, icon with text, share, wishlist, divider, breadcrumbs, file list and custom code. Its media is stacked, a grid, a slideshow with thumbnails or a carousel, swipes on a phone, opens larger with zoom, and shows the chosen variant's picture.
- [Filtering the shop](/developers/selling#filtering-the-shop): `page.filters` on the shop and search pages, from the address.
- [Breadcrumbs](/developers/selling#breadcrumbs): `page.breadcrumbs` on every page but home, `page.title`, and a Breadcrumbs section.
- `products` carry `category` and, for a product that ships, `options`.
- [Where a section may go](/developers/schema#where-a-section-may-go): `enabled_on` and `disabled_on` with section groups (`header`, `footer`, `template`), the usual spelling, and `"category": "announcement"` meaning the header group.
- [A header of your own](/developers/header-and-footer#a-header-of-your-own): `"kind": "header"` (or `"footer"`) makes one section the site's header in place of the built-in one. One of each per theme.
- [A section's own animation](/developers/schema#a-sections-own-animation): a `select` with the id `animation` and the values `theme`, `none`, `fade`, `fade_up` and `zoom` overrides the theme's animation for that section.
- [The theme's general settings](/developers/dynamic-values#the-themes-general-settings) as a section reads them: `theme.logo`, `theme.favicon`, `theme.buttons`, `theme.layout`, `theme.animation` and `theme.socials`, each with Theme settings' default.
- [Menus](/developers/dynamic-values#menus) documented in full: a `link_list` with its links and their sub links, read live in the builder and on the site.
- The image control draws an address box under the picker. Typing an address sets the picture; choosing a file replaces it.

**Changed**

- A picture declared as `text` or `url` is read as an `image_picker`, with a warning; nothing stored changes. See [Choosing the type](/developers/schema#choosing-the-type).
- `enabled_on.groups` no longer marks a file as a header: an announcement bar in the header group is saved like any section.
- A colour setting whose default names a scheme colour and holds `""` follows the scheme, so a colour picked in Advanced colors reaches it.
- A `range` with no default starts at its `min`, not at 0.
- New compile warnings: numbered link pairs, a range with no default, an unknown animation value, an `<img>` with no `alt`. Schema errors say which key is missing or of the wrong kind, in words.

- [Theme blocks](/developers/blocks#theme-blocks): a file each in `blocks/`, accepted by a section with `{ "type": "@theme" }` or by name, drawn with `{% content_for "blocks" %}`, private when the file name starts with `_`. Heading, Text, Button, Image, Video, Spacer and Group ship with every theme.
- Blocks inside blocks, eight levels deep: a theme block that accepts blocks draws them with the same tag. Group makes rows and columns out of any blocks.
- [Static blocks](/developers/blocks#static-blocks), placed by the template with `{% content_for "block", type: "…", id: "…" %}`: edited and hidden, never moved or deleted.
- [Presets](/developers/blocks#presets) in the keyed form, `blocks` by id with `block_order`, nested, with `static` and a `category` that files the card in Add section. A theme block's presets are its entries in Add block.
- Two sections built from theme blocks: Section, which takes any of them, and Image grid, which takes pictures and places its title as a static block.
- A block can be hidden from the sidebar's eye, and is kept.
- Agents may write theme blocks: `blocks/<type>.storelib` is writable over MCP, the agent API and GitHub, except the ones Storelib ships. Page tools take `parent_block_id` to add inside a block, and a block's path (`outer/inner`) as its id.

- A `color` setting's default may name a scheme colour, `"default": "scheme.accent"`. The setting follows the section's scheme until the creator picks a colour, and a section's own colour settings are now rows in its panel. See [Styling](/developers/styling#colours-of-the-sections-own).
- [The header and footer](/developers/header-and-footer): what the one header and one footer do, and every setting they take, generated from the files the builder draws them with.
- A `video_picker` uploads a video file or takes a link to one, and shows it.
- Website settings › Navigation: the header's links, the footer's menu columns and every menu, in one place.

**Changed**

- A section file that is a header, a navigation bar or a footer was refused on save. As of 7 October 2026 that refusal is gone: design it freely and keep the live values. Only the filenames `sections/header.storelib` and `sections/footer.storelib` stay reserved.
- The YouTube and Vimeo video section's link is a `video_url` setting, which checks the link as it is pasted.
- A section's 50 blocks are counted at every depth, and saving a page keeps the blocks inside blocks, whether they are hidden and whether the template placed them.
- Adding the same preset twice gives each section its own block ids. Before, the two shared them, and a click on a block in either selected the first.

## 25 September 2026

**Added**

- Eight setting types: `inline_richtext`, `html`, `color_background`, `datetime`, `focal_point`, `video_url`, `product_list` and `link_list`. See [Schema](/developers/schema#every-control-type).
- `visible_if` on a setting, written the usual way, so the panel shows a setting only when it matters. See [Showing a setting only when it matters](/developers/schema#showing-a-setting-only-when-it-matters).
- Shop data in a setting: `{{ shop.name }}`, `{{ creator.avatar }}`, `{{ product.price }}` and the rest of a closed list, filled in on the server. See [Shop data in a setting](/developers/schema#shop-data-in-a-setting).
- `shop`, `creator` and `product` in a template, beside `settings` and `blocks`.
- A `product_picker` carries the product's title, price and picture as well as its address.
- Menus, made in Theme settings, for a `link_list`. `main-menu` is the header's own links, and the header can show any menu.
- The `lines` filter, for a `textarea` typed one item per line.
- Three sections: Plans, Rows and Course Outline.
- The 404 page: every site draws its own inside its header and footer for an address it does not have, and a creator can arrange it in the builder like the shop and search pages.
- The Product Grid can show products the creator chooses from the shop.
- [Coming from another platform](/developers/shopify).
- [Themes](/developers/themes): what a theme holds, the website library, every theme setting key, colour schemes and typography, and the package format with `theme.json`, `manifest.json` and `templates/*.json`.
- [Pages and page settings](/developers/pages), [Sharing themes](/developers/sharing-themes), [Publishing and checks](/developers/publishing), [Dynamic values](/developers/dynamic-values) and [Data model](/developers/data-model).
- The hub is grouped the way it is used: Get started, Themes, Sections, Data and logic, Tools and AI, and Reference. Every page keeps its address.
- Four objects every section can read: `shop`, `routes`, `customer` and `wishlist`. See [What a template can read](/developers/sections#what-a-template-can-read).
- Contact forms: `data-storelib-form="contact"` sends a message to the creator, keeps it in Emails, and adds the sender to Subscribers only when they tick the box. See [Contact forms](/developers/javascript#contact-forms).
- Saving products: `data-storelib-wishlist` on a button saves a product to the visitor's Wishlist. See [Saving products](/developers/javascript#saving-products).
- Every website has an account page, a sign in page, a Wishlist and a contact page, drawn by the `main_account`, `main_login`, `main_wishlist` and `contact` sections.

**Changed**

- Every saved value is held to its type as a section is drawn. A value the type does not allow is drawn as the default and left as it was in storage.
- The countdown's exact time is a `datetime`, written out when no end is typed.
- The header's phone menu can slide in from either side or cover the screen, and its see-through setting can apply to the home page only.
- The announcement bar can hold several messages that take turns.
- `migrations` are applied: a section's own setting stored under `from` is read under `to` as the section is drawn.
- The theme export downloads media from public addresses only, checked at every redirect.

**Security**

- A creator's own sections are cleaned by the schema their file declares, not only by the built-in ones, when a page is saved, read in the builder and published.
- The builder's routes no longer return database error text.


**Fixed in these pages**

- `allowed_templates` is described as it ships: validated and kept, and not used yet.
- An unknown filter is not refused by the compiler. It prints the value unchanged.
- There is no `layout/theme.storelib`. A theme has no stylesheet for the whole site that you can write.
- An export names its page files by page key, `templates/home.json` and `templates/about.json`, and takes the theme settings from the draft and the pages as last published.
- Media settings hold public URLs on a site. `asset://` references exist only inside a theme package.
- The importer holds blocks to the ceiling of 50. `limit` and `max_blocks` are held by the builder's buttons, and `max_blocks` by the agent page tools.
- A page picker and a product picker store the address they link to.
- A section's script receives the settings stored on the instance, without schema defaults.
- A product's `tag` is always empty today.
- A page stores its preset's values and everything the creator sets, not only what differs from the defaults.

## 24 September 2026

**Added**

- [Rules before you ship](/developers/rules): what every agent follows before writing code on a Storelib site, and the `storelib_rules` tool that returns them. `storelib_guide` now starts with them.
- A navigation bar example, with menu links as blocks and a phone menu that opens with `popover`. Replaced on 3 October 2026 by [Page links](/developers/examples#page-links), because a site's navigation is its built-in header.

**Changed**

- An agent can no longer change a built-in section. A write to one over MCP, the agent API or a GitHub push is refused, and `storelib_list_files` marks each file `writable`. A different version is written as a new section.
- The builder's AI saves a section it rewrites as a draft with a version, like the code editor, instead of writing it straight to the live site.
- Connections has its own place in Website Settings, under Code, instead of inside Advanced. Links to `?settings=advanced` still open it.
- In the builder, `position: fixed`, `100vh` and `100vw` answer to the canvas, width-only media queries become container queries, and a `popover` or command-opened `<dialog>` opens inside the canvas. See [The page a section sees](/developers/styling#the-page-a-section-sees).
- A `<style>`, `<link>`, `<base>` or `<meta>` tag inside `<template>` is refused on save and removed from sections saved before.

## 23 September 2026

**Added**

- Section scripts run. A section's `<script>` runs on the published page and in the builder, inside a sandbox with an opaque origin, against a copy of the section's own markup. Changes to classes, allowed attributes, styles and text are mirrored to the page; clicks, keys and input are sent back. See [How the sandbox works](/developers/javascript#how-the-sandbox-works).
- `storelib.scrollTo(element, options)`, `storelib.inEditor`, and `storelib.navigate(path)` for a section that declares `navigation`.
- [Selling](/developers/selling): the fields `products` gives a section, the checkout link `/checkout?productId={{ block.id }}&src=website`, the cart, what checkout does with the money, and what a section may never do with payments.
- `storelib_site`, and `GET /api/agent/v1/site`: what a connected website is, its brand, fonts, colour schemes, the sections on each page and its published products, so an agent writes for the site it is connected to.
- Agent connections. A creator connects Claude Code, Codex or any MCP client to one site from Website Settings › Advanced (first shipped as Website settings › Connections). It can list, read, compile and save that site's section files, as drafts, over MCP at `/api/mcp` or HTTP at `/api/agent/v1`. See [Connect an agent directly](/developers/ai#connect-an-agent-directly).
- GitHub. A site can be linked to a repository. Its section files and an `AGENTS.md` are written into it, and every push to the linked branch that changes `sections/*.storelib` is compiled and saved to the site as a draft, with a Storelib status on the commit. See [Connect through GitHub](/developers/ai#connect-through-github).
- [Using the website builder](/developers/website-builder): every panel, control and theme setting, drawn from the lists the builder reads.
- The `timers` capability grants working `setTimeout`, `setInterval` and `requestAnimationFrame`.
- Forms. A `<form>` in a section is submitted by the page, with no script. `data-storelib-form="subscribe"`, or any form with an email box and no action of its own, sends each address to the creator's Subscribers; `data-storelib-form="native"` leaves a form to the browser. The form carries `data-state` while it sends, and shows an element marked `data-storelib-success` when it is done. See [Forms](/developers/javascript#forms).
- The library's Newsletter Signup section collects sign-ups with nothing set up. It previously showed no form until an outside mailing list address was pasted in.
- The Storelib Developer Hub, [llms.txt](/llms.txt) and [llms-full.txt](/llms-full.txt), built from the same modules as the builder's AI.

**Changed**

- The compiler's messages for `@click`, `v-on:` and `on*=` name the section's `<script>` block, beside the HTML that needs no script.

**Security**

- Creator HTML in `richtext` settings is cleaned on import and publish as well as on save and read.
- Sign-up endpoints are rate limited per visitor and per address.

## 20 September 2026

**Fixed**

- A link is no longer styled as a button by theme rules that assumed every `<a>` in a section was one.

## 19 September 2026

**Added**

- Shop and search pages exist on every published site from the day it is published, built from the home page's header and footer, and can be opened and edited in the builder like any other page.

## 13 September 2026

**Added**

- A theme export carries its videos and files as well as its images, each by content hash, or the export fails rather than producing a theme with holes in it.

## 12 September 2026

**Changed**

- A section's type is its file name. A schema whose `type` disagrees with the file it is in is refused, naming both.
- Secondary buttons take the scheme's own secondary button colours.

**Fixed**

- Every section in the library was audited against its schema. Controls that changed nothing were removed rather than left in the panel.

## 11 September 2026

**Added**

- **Storelib Builder Framework 1.0.** The `.storelib` section format with `<template>`, `<style>`, `<script>` and `<schema>` blocks; the template language; the control registry; the compiler, with every error carrying its file and line; CSS scoping; and the script checker with capabilities.
- The section library: thirty sections in ten categories, every one a `.storelib` file.
- Blocks, presets, `max_blocks` and per-type `limit`.
- Responsive settings, resolved as `{ desktop, tablet, mobile }`.
- Colour schemes and text styles as theme tokens, with per-section overrides.
- `migrations`, a list of setting renames a section can declare. It is validated and kept; nothing applies it yet (25 September 2026).
- Themes export to and import from a single `.storelib-theme` file, checked as a whole, with every file hashed.
- An accessibility baseline: on every built-in colour scheme, body text meets a contrast of 4.5 to 1 against its background and headings meet 3 to 1.
