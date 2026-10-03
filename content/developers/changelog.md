# Changelog

Changes to the Storelib Builder Framework: the section format, the template language, the schema, the controls and the rules the compiler enforces. Changes to the builder's interface that do not change what a section can do are not listed.

## Versions

Five things carry a version, and they move independently so that one changing does not force the others.

@[versions]

A file written for a newer version is **refused, not misread**: a schema declaring `"schema_version": 2` against an engine that reads 1 is rejected with both numbers named. A file written for an older version is always read, and keys the engine does not recognise survive every read and write.

Every change since 1.0 has been additive. Nothing a section could do on 11 September 2026 has stopped working since, which is why every version above is still 1.

## 3 October 2026

**Added**

- [The main product section](/developers/selling#the-main-product-section) is blocks: title, price, variant picker with swatches, pay what you want, quantity, buy buttons, low stock, badges, description, collapsible tabs, text, icon with text, share, wishlist, divider, breadcrumbs, file list and custom code. Its media is stacked, a grid, a slideshow with thumbnails or a carousel, swipes on a phone, opens larger with zoom, and shows the chosen variant's picture.
- [Filtering the shop](/developers/selling#filtering-the-shop): `page.filters` on the shop and search pages, from the address.
- [Breadcrumbs](/developers/selling#breadcrumbs): `page.breadcrumbs` on every page but home, `page.title`, and a Breadcrumbs section.
- `products` carry `category` and, for a product that ships, `options`.

- [Theme blocks](/developers/blocks#theme-blocks), the way Shopify has them: a file each in `blocks/`, accepted by a section with `{ "type": "@theme" }` or by name, drawn with `{% content_for "blocks" %}`, private when the file name starts with `_`. Heading, Text, Button, Image, Video, Spacer and Group ship with every theme.
- Blocks inside blocks, eight levels deep: a theme block that accepts blocks draws them with the same tag. Group makes rows and columns out of any blocks.
- [Static blocks](/developers/blocks#static-blocks), placed by the template with `{% content_for "block", type: "…", id: "…" %}`: edited and hidden, never moved or deleted.
- [Presets](/developers/blocks#presets) in Shopify's keyed form, `blocks` by id with `block_order`, nested, with `static` and a `category` that files the card in Add section. A theme block's presets are its entries in Add block.
- Two sections built from theme blocks: Section, which takes any of them, and Image grid, which takes pictures and places its title as a static block.
- A block can be hidden from the sidebar's eye, and is kept.
- Agents may write theme blocks: `blocks/<type>.storelib` is writable over MCP, the agent API and GitHub, except the ones Storelib ships. Page tools take `parent_block_id` to add inside a block, and a block's path (`outer/inner`) as its id.

- A `color` setting's default may name a scheme colour, `"default": "scheme.accent"`. The setting follows the section's scheme until the creator picks a colour, and a section's own colour settings are now rows in its panel. See [Styling](/developers/styling#colours-of-the-sections-own).
- [The header and footer](/developers/header-and-footer): what the one header and one footer do, and every setting they take, generated from the files the builder draws them with.
- A `video_picker` uploads a video file or takes a link to one, and shows it.
- Website settings › Navigation: the header's links, the footer's menu columns and every menu, in one place.

**Changed**

- A section file that is a header, a navigation bar or a footer is refused when it is saved, by the code editor, Ask AI, an agent or a GitHub push, and left out of an imported theme. Recognised by `"group"`, by Shopify's `enabled_on.groups`, by its name, or by an outermost `<header>` holding a `<nav>`. A site has one of each, and they are changed through their settings.
- The YouTube and Vimeo video section's link is a `video_url` setting, which checks the link as it is pasted.
- A section's 50 blocks are counted at every depth, and saving a page keeps the blocks inside blocks, whether they are hidden and whether the template placed them.
- Adding the same preset twice gives each section its own block ids. Before, the two shared them, and a click on a block in either selected the first.

## 25 September 2026

**Added**

- Eight setting types: `inline_richtext`, `html`, `color_background`, `datetime`, `focal_point`, `video_url`, `product_list` and `link_list`. See [Schema](/developers/schema#every-control-type).
- `visible_if` on a setting, written as Shopify writes it, so the panel shows a setting only when it matters. See [Showing a setting only when it matters](/developers/schema#showing-a-setting-only-when-it-matters).
- Shop data in a setting: `{{ shop.name }}`, `{{ creator.avatar }}`, `{{ product.price }}` and the rest of a closed list, filled in on the server. See [Shop data in a setting](/developers/schema#shop-data-in-a-setting).
- `shop`, `creator` and `product` in a template, beside `settings` and `blocks`.
- A `product_picker` carries the product's title, price and picture as well as its address.
- Menus, made in Theme settings, for a `link_list`. `main-menu` is the header's own links, and the header can show any menu.
- The `lines` filter, for a `textarea` typed one item per line.
- Three sections: Plans, Rows and Course Outline.
- The 404 page: every site draws its own inside its header and footer for an address it does not have, and a creator can arrange it in the builder like the shop and search pages.
- The Product Grid can show products the creator chooses from the shop.
- [Coming from Shopify](/developers/shopify).
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
