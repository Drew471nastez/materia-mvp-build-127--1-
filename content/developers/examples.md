# Examples

Ten complete sections. Each is a real `.storelib` file that the test suite compiles, and runs through the same quality checks the builder applies to AI-written sections, on every change to the platform. If one of these stopped compiling, the change that broke it would not ship. Copy any of them into the code editor as `sections/<type>.storelib` and it works as shown.

The examples below are written one way. That way is not a rule. A section may use other colours, other type, other motion and another layout. What they do share, and what a save still checks, is live values and editable content:

- Ids are built from `{{ section.id }}`, so each section can appear on a page twice.
- Words, links and pictures are settings or blocks.
- Empty states sit behind `page.in_editor`.

These particular files also happen to read a colour scheme, use `padding_top` and `padding_bottom`, lay out with `@container`, and stop motion under `prefers-reduced-motion`. Copy that when it helps. It is not required.

## Sign-up card

A sign-up box that sends every address to the creator's Subscribers with no script and no setup. Shows the explicit `data-storelib-form="subscribe"`, a success message the creator can edit, a visually hidden label, and a form that stacks on a phone and sits in one row wider. See [Forms](/developers/javascript#forms).

@[example:signup_card]

## FAQ, one open at a time

Blocks, a `richtext` answer printed with `raw`, and `<details>` elements sharing a `name` so opening one closes the others, all without script.

@[example:faq_exclusive]

## Logo strip

Image blocks that fall back to a text name, a row that swipes on a phone with scroll snapping, and wraps into a centred row once there is room.

@[example:logo_strip]

## Video with text

The `embed` capability and the `embed` filter: a creator pastes whatever link they have, and the frame only ever points at a known player. See [Embeds](/developers/javascript#embeds).

@[example:video_feature]

## Product cards

The creator's own published products through `products`, in the same `{ id, type, settings }` shape as blocks. Prices arrive formatted, and a sale shows the old price struck through.

@[example:product_cards]

## Product page

The product a product page is about, through `page.product`: a gallery that swipes on a phone, the price and the sale price, options chosen with radio inputs and `:checked` with a buy button for the chosen one, and the sold out state. Every buy button is the product's own `checkout_url`, and checkout brings the buyer back to the site. See [Selling](/developers/selling).

@[example:product_page]

## Tabs

Blocks as tabs, switched with radio inputs and `:checked`, keyboard reachable, with the first tab open. The same pattern works for any "one of these at a time" layout.

@[example:tabs_panel]

## Page links

A row of links inside a page, to a shop's topics or a course's parts: each link a block with a label and a `url`, chips on a computer, and on a phone a button that opens them as a sheet with `popover`, with no script. It is a band on a page, not the site's navigation: for that, see the header below and [The header and footer](/developers/header-and-footer).

@[example:page_links]

## Header with a mega menu

A header of its own (`"kind": "header"`): the site's menu from a `link_list`, a panel of columns under every top link that has links of its own, opened with `<details>` and no script, a picture in the panel, the site's menu drawer on a phone, and the live cart, search and account. See [Building a whole store](/developers/building-a-store).

@[example:mega_header]

## Collection page with a filter sidebar

For the Collection page template: the collection's own title and description from `collection`, the filters and sort from `page.filters` in a sticky sidebar, the products that pass from `products`, and the pages from `page.pagination`. See [Building a whole store](/developers/building-a-store).

@[example:collection_sidebar]
