# The header and footer

Every Storelib website has exactly **one header and one footer**. They are the built-in sections of type `header` and `footer`, the same on every page, and they are the parts of a shop that a section file cannot rebuild on its own: the cart drawer and its count, the search, the account and wishlist links for a signed-in visitor, the phone menu with its sub-menus, sticky behaviour, the logo from Theme settings and the menus from Website settings.

So they are **customised, never replaced**. This page lists everything they do and every setting that changes them, for a person in the editor and for an AI writing code.

> **Warning** Do not write a section file that is a header, a navigation bar or a footer, and do not put one in a page. It is refused when it is saved, by a person or an agent, and left out of an imported theme. It would be a second header under the real one, with a cart icon that opens nothing and a menu that is a typed copy of the real one. Change the real header's settings instead.

## Where they live

In the Sections panel a page is three groups, the way a shop's theme editor shows it:

| Group | Holds | Add section |
| --- | --- | --- |
| Header | The site's header, and nothing else. | Under it: adds at the top of the page. |
| Template | The page's own sections, in order. | At the end: adds at the bottom of the page. Between two rows: adds there. |
| Footer | The site's footer, and nothing else. | None. |

The header and footer can be hidden, which hides them on every page, but not dragged, copied or deleted. A section can never be moved above the header or below the footer, by a drag, by Ask AI or by an agent. Every page stores a copy of both, and the live site draws the home page's on every page, so they cannot drift apart.

## What the header does

- **Logo or store name.** The logo image, its height, a separate logo for phones, and a nudge left or right. With no logo it prints the store name from Theme settings › Branding.
- **Links.** Its own links (its `nav_link` blocks, each with a label, an address and up to one level of sub-links), or one of the site's menus. Both are edited in Website settings › Navigation, and the links in the header's own panel too.
- **Layouts.** Five on a computer and two on a phone. On a phone the menu slides in from the left or the right, or covers the screen, with each sub-menu pushed in over the top level.
- **Sticky.** Normal (scrolls away), always on top, or on top only while scrolling up. Optionally transparent over the top of the page, on every page or on the home page only.
- **Icons.** Search (opens a search box in the header, or goes to `/search`), account, wishlist and cart. The cart opens the cart drawer with the visitor's basket and its count, and checkout from there.
- **A button**, with its own words and link, painted from the scheme's primary button.
- **Its colours** come from its colour scheme, with Advanced colors for this section alone, and the drop-down menus are painted by the same scheme.

Every setting, read from the file the builder draws it with:

@[chrome-settings:header]

## What the footer does

The logo, tagline and copyright line; two menu columns chosen from the site's menus; its own link columns (`footer_column` and `footer_link` blocks); the policy pages and Contact, linked automatically; a newsletter sign up that collects for the creator; social icons; payment icons; a layout and a colour scheme.

@[chrome-settings:footer]

## Changing them

| You are | Do this |
| --- | --- |
| In the editor | Sections › Header (or Footer). Links and menus are also in Website settings › Navigation. |
| Ask AI in the builder | Ask in words: "make the header sticky", "add a Courses link with three sub-links". It reads the header and changes its settings and `nav_link` blocks. |
| An agent over MCP | `storelib_create_safe_patch` with `update_section` on the section of type `header` or `footer`, and `add_block`, `update_block`, `move_block` or `remove_block` for the header's `nav_link` links (a sub-link names its parent in `parent_id`). `storelib_update_styles` with scope `section` for its colours. |
| Editing an exported theme | Change the `header` and `footer` entries in `templates/*.json`: their `settings` and `blocks`. Do not add a `sections/*.storelib` file for either. |

A `nav_link` block:

```json
{ "id": "nav-courses", "type": "nav_link", "settings": { "label": "Courses", "url": "/products", "link_type": "custom" } }
```

and a sub-link under it:

```json
{ "id": "nav-courses-1", "type": "nav_link", "settings": { "label": "Beginner", "url": "/products/beginner", "link_type": "custom", "parent_id": "nav-courses" } }
```

## How a file is recognised as a header or footer

The rule is in `lib/storelib-theme/chrome.ts` and runs at every door a file comes through: the code editor's save, Ask AI, the MCP and agent tools, a GitHub push and a theme import. A file is a header or footer when any of these holds:

1. Its schema says so: `"group": "header"` or `"footer"`, or Shopify's `"enabled_on": { "groups": ["header"] }`.
2. Its type or name is one: Header, Site header, Navbar, Navigation bar, Top bar, Footer, with a word like Main or Custom in front or a version after. A heading band called "Page header" or "Collection header" is not.
3. Its markup is one: the outermost element is a `<header>` holding a `<nav>`, a `<nav>`, or a `<footer>`, and its name says header, nav, menu or footer.

Saved, it is refused with what to change instead. In an imported theme it is left out, its uses are taken off the pages, and the import says so; the site keeps its own header and footer.

## The rest of a shop

The pages every website has from the start, and where each is:

@[default-pages]

The cart drawer, the cart page, checkout, the account and sign in pages and the wishlist are the platform's, so they work the same on every site and every theme. A section reaches them through links (`/products`, `/cart`, `/account`, `/wishlist`, `/search`) and through the product data in [Dynamic values](/developers/dynamic-values), never by building its own.
