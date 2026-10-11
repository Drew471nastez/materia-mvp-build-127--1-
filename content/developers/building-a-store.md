# Building a whole store

Every part of a Storelib store can be written as your own section: the header and its mega menu, a drawer, a sidebar, the product page, the collection page with its filters, search results, the cart drawer, a page of any kind. Nothing in the theme engine requires the built-in sections. They are a starting point, not a boundary.

What stays the platform's is what has to be true for a store to work, and only that:

- **Live data.** Products, prices, stock, collections, menus, the logo and the customer come from the store, never typed into a file. A price typed into markup would sell nothing.
- **Checkout.** A buy button points at the product's `checkout_url`. The cart, payment and order are Storelib's.
- **Safety.** A section's script runs in a sandbox, a template cannot write `<script>`, `on*` handlers or `javascript:` addresses, and every link goes through the `url` filter.

Everything else (layout, markup, type, colour, motion, which elements, how many sections, what a page holds) is yours.

## What a page knows

Every section on every page can read these, whoever wrote it:

| Value | What it is |
| --- | --- |
| `products` | The products the page was handed, block-shaped: `block.settings.title`, `price`, `compare_price`, `image`, `images`, `url`, `available`, `options`, `variants`, `checkout_url`, `fields`. On the shop and a collection page, the ones that pass the visitor's filters, in the order asked for. |
| `collections` | The store's published collections, block-shaped. |
| `collection` | On `/collections/<handle>`, that collection: `title`, `handle`, `description`, `image`, `url`, `products_count`, `products`. In the builder, the first collection stands in. |
| `product` | On a product page, the product. In the builder, the newest product stands in. |
| `page.filters` | On the shop, search and collection pages: `groups` (each with `label`, `param` and `values` with `label`, `value`, `count`, `checked`), `price`, `sort_options`, `active`, `active_count`, `chips`, `count_label`, `path` and `clear_url`. |
| `page.pagination` | `pages`, `prev_url`, `next_url` and `links`, each with `number`, `url` and `current`. |
| `page.query` | What was searched for, on the search page. |
| `request` | `page_type` (index, product, collection, page.products, page.search, ...), `path` and `design_mode` (true in the builder's canvas). |
| `shop`, `routes`, `customer`, `wishlist` | The store's name and socials, the site's fixed addresses (`routes.cart_url`, `routes.search_url`, `routes.account_url`), the signed-in customer on account pages, the visitor's saved products. |
| `theme`, `scheme` | The theme's tokens and the section's colour scheme. |

A setting can also pick: `product_picker`, `product_list`, `collection_picker`, `collection_list` and `link_list` (a menu). See [Dynamic values](/developers/dynamic-values) for every field.

## The pages, as templates

A Storelib site has the usual store templates. Each is a page in the builder's page switcher, built from the home page's header and footer and a default section until you arrange it, and what you save is what every visitor gets:

| Page | Template | Drawn for |
| --- | --- | --- |
| Product page | `product` | every `/products/<slug>` |
| Collection page | `collection` | every `/collections/<handle>` |
| Collections | `page.collections` | `/collections` |
| Shop | `page.products` | `/products` |
| Search | `page.search` | `/search?q=` |
| 404 page | `page.404` | any missing address |

A product page of your own is a section that reads `product`. With one on the Product page, the built-in product section is not added, so the product is never drawn twice.

## Example: a header with a mega menu

A header of your own says `"kind": "header"` and replaces the built-in one on every page. This one opens a panel of columns for every top link that has links under it, using `<details>` so it needs no script, and opens the site's own menu drawer on a phone. Its links are the site's menu, edited in Website settings › Navigation. The cart, search and account are the site's own, through `data-storelib-cart`, `data-storelib-search` and `routes.account_url`.

@[example:mega_header]

Ideas from here: a second `link_list` for a utility bar, a `<dialog>` drawer instead of the built-in one, an announcement strip above it as its own section, a sticky bar that shrinks as the page scrolls (a script toggling a class on scroll).

## Example: a collection page with a filter sidebar

Put this on the **Collection page** in the builder and it draws every collection. It reads the collection's own title and description, the visitor's filters and sort from `page.filters`, the products that pass from `products`, and the pages from `page.pagination`. The forms are ordinary GET forms marked `data-storelib-filters`: the address carries the filters, so a filtered page can be linked, shared and gone back to.

@[example:collection_sidebar]

## A cart drawer, search and drawers of your own

- **Cart.** Mark any button `data-storelib-cart` and the site's cart drawer opens; `data-storelib-cart-count` shows the count. For a cart drawer of your own design, see [A cart of your own](/developers/header-and-footer#a-cart-of-your-own).
- **Search.** `data-storelib-search` opens the live search window. A search page of your own is a section on the Search page reading `page.query`, `products` and `page.filters`.
- **Drawers, modals, sidebars.** `<dialog>`, `<details>` and the `popover` attribute work in a section's markup, and `position: fixed` is the screen's, not the section's. A theme block can be a `<nav>`, `<details>` or `<dialog>` too (`"tag"` in its schema).

## Asking Storelib AI for it

Storelib AI in the builder writes all of this. "Code me a store for my coffee roastery" builds the pages a store needs, and writes its own sections wherever the design asks for something the built-in ones do not draw: a header with a mega menu, a product page laid out its own way, a collection page with its own filters, a cart drawer. It keeps the live values above and nothing else limits it. Ask for a specific part ("a sidebar of filters on the collection page", "a mega menu with a picture in each panel") and it writes that part.
