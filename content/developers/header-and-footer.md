# The header and footer

Every Storelib website has exactly **one header and one footer**. They are the built-in sections of type `header` and `footer`, the same on every page, and they are the parts of a shop that a section file cannot rebuild on its own: the cart drawer and its count, the search, the account and wishlist links for a signed-in visitor, the phone menu with its sub-menus, sticky behaviour, the logo from Theme settings and the menus from Website settings.

So they are **configured, not rebuilt**. This page lists everything they do and every setting that changes them, for a person in the editor and for an AI writing code.

> **Warning** Do not write a section file that is a header, a navigation bar or a footer, and do not put one in a page. It is refused when it is saved, by a person or an agent. It would be a second header under the real one, with a cart icon that opens nothing and a menu that is a typed copy of the real one. Change the real header's settings instead. The one exception is a creator who asks for a header of their own: see [A header of your own](#a-header-of-your-own).

## The right way, in short

| To change | Do this |
| --- | --- |
| The logo | Theme settings › Branding, `logo_url` (an image). The header and footer both show it. The header's own `logo_url` overrides it in the header only. |
| The store name beside or instead of the logo | Theme settings › Branding, `brand_name`. |
| The links | The header's `nav_link` blocks, or its `menu` setting set to one of the menus in Website settings › Navigation. |
| Social links | Theme settings › Social. The footer shows them, and the header when `social_show_in_header` is on. |
| Layout, sticky, icons, button, colours | The header's own settings. |

A section of your own that needs the same things reads them rather than asking again: `theme.logo.url`, `shop.name`, `shop.socials`, and a `link_list` setting for a menu. See [Dynamic values](/developers/dynamic-values#the-themes-general-settings).

## Where they live

In the Sections panel a page is three groups, the way a shop's theme editor shows it:

| Group | Holds | Add section |
| --- | --- | --- |
| Header | The site's header, and nothing else. | Under it: adds at the top of the page. |
| Page | The page's own sections, in order. | At the end: adds at the bottom of the page. Between two rows: adds there. |
| Footer | The site's footer, and nothing else. | None. |

The header and footer can be hidden, which hides them on every page, but not dragged, copied or deleted. A section can never be moved above the header or below the footer, by a drag, by Ask AI or by an agent. Every page stores a copy of both, and the live site draws the home page's on every page, so they cannot drift apart.

## What the header does

- **Logo or store name.** The logo image (the header's own, or Theme settings › Branding's `logo_url`, kept within Branding's `logo_width`), its height, a separate logo for phones, and a nudge left or right. With no logo it prints the store name from Theme settings › Branding. With no favicon set, the logo is also the site's icon in the browser tab.
- **Links.** Its own links (its `nav_link` blocks, each with a label, an address and up to one level of sub-links), or one of the site's menus. Both are edited in Website settings › Navigation, and the links in the header's own panel too.
- **A link, or a button that opens its links.** A link with sub-links goes to its address and shows its sub-links under a resting pointer. Set to open its sub-links instead (When pressed, Opens its sub-links, stored as the address `#`), it is a button: pressing it opens them as a dropdown on a computer and in the drawer on a phone. Escape, a press elsewhere or choosing a link closes it.
- **Layouts.** Five on a computer and two on a phone. On a phone the menu slides in from the left or the right, drops down from the top, or covers the screen, with each sub-menu pushed in over the top level.
- **Menu on larger screens.** The links in the header row, or a menu button beside the logo that opens the same drawer from the left, the right or the top (`desktop_menu`).
- **Drawers.** The menu, the cart and the search window open and close on transform and opacity alone, on the same curve both ways, starting on a frame the browser has painted. A tap on the dark backdrop, Escape, or pushing the panel back toward its edge closes it. With reduced motion asked for, they appear and go without moving.
- **Sticky.** Normal (scrolls away), always on top, or on top only while scrolling up. Optionally transparent over the top of the page, on every page or on the home page only.
- **Icons.** Search (`search_behaviour`: a field over the header row, a search window over the page with live results from the store's products, or a link to `/search`), account, wishlist and cart. The cart opens the cart drawer with the visitor's basket and its count, and checkout from there.
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

## A header of your own

When the creator asks for a header (or footer) that the built-in one cannot be configured into, and says so, write **one** section whose schema says what it is:

```json
{
  "type": "studio_header",
  "name": "Studio header",
  "kind": "header",
  "settings": [
    { "type": "image_picker", "id": "logo", "label": "Logo" },
    { "type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu" },
    { "type": "color_scheme", "id": "color_scheme", "label": "Colour scheme", "default": "white" },
    { "type": "color", "id": "link_color", "label": "Links", "default": "scheme.text" },
    { "type": "color", "id": "button_color", "label": "Button", "default": "scheme.primary_button_background" },
    { "type": "text", "id": "button_label", "label": "Button text", "default": "Shop" },
    { "type": "url", "id": "button_url", "label": "Button link", "default": "/products" }
  ],
  "presets": [{ "name": "Studio header" }]
}
```

- `"kind": "header"` makes it the site's header. It replaces the built-in one on every page, sits in the header group, and is never placed among a page's own sections. `"kind": "footer"` does the same for the footer.
- **One per theme.** A second file of the same kind is refused when it is saved. Never two headers.
- Its menu is a `link_list` setting, defaulting to `main-menu`, so the creator keeps editing links in Website settings › Navigation. Never `link_1_label`, `link_1_url` pairs.
- Its logo is an `image_picker` setting, or `theme.logo.url` with `{{ theme.logo.text }}` when there is no picture. Never a text box holding an address.
- Each element it draws has a colour setting that follows the scheme. See [Styling](/developers/styling#a-colour-setting-for-each-element).
- It has what you build into it, and it reaches the site's own drawers by attribute: see [The site's drawers](#the-sites-drawers) below. The built-in header is still the first answer: everything above is already in it.

### The site's drawers

A header of your own draws its own buttons, and the page opens the same cart, search window and menu drawer the built-in header does, with the same motion, in the builder and on the live site. Mark the element and the page handles it. A section's script is not needed and could not do it: it runs in a sandbox with no access to the visitor's cart.

| Attribute | On | Does |
| --- | --- | --- |
| `data-storelib-menu` | a button | Opens the menu drawer with the menu its value names, usually `{{ settings.menu.handle }}`. Empty means `main-menu`. Pressed again, it closes. |
| `data-storelib-menu-from` | the same button | `left` (the default), `right` or `top`: where the drawer comes from. |
| `data-storelib-cart` | a button or link | Opens the cart drawer. |
| `data-storelib-cart-count` | any element | The page writes the cart's count into it, and sets `data-count` to the number, so `[data-count="0"] { display: none }` hides an empty badge. |
| `data-storelib-search` | a button or link | Opens the search window, with live results from the store's products. Its value, if any, is the field's placeholder. |

The page also sets `aria-expanded` on each of these triggers while its drawer is open, so a menu icon can turn into a close with CSS alone. Use a `<button>`, or a link to the page it stands for, so it still works before the page's script has loaded: `routes.cart_url` and `routes.search_url`. The account is a link: `routes.account_url` opens the account for a signed-in visitor and the sign in page for anybody else.

```storelib
<header class="hdr">
  <button type="button" class="hdr__menu" data-storelib-menu="{{ settings.menu.handle }}" data-storelib-menu-from="left" aria-label="Menu">
    <span></span><span></span>
  </button>
  <a class="hdr__logo" href="{{ routes.root_url }}">{% if theme.logo.url %}<img src="{{ theme.logo.url }}" alt="{{ shop.name }}">{% else %}{{ shop.name }}{% endif %}</a>
  <nav class="hdr__links">
    {% for link in settings.menu.links %}<a href="{{ link.url }}">{{ link.title }}</a>{% endfor %}
  </nav>
  <a class="hdr__icon" href="{{ routes.search_url }}" data-storelib-search="Search the shop" aria-label="Search">Search</a>
  <a class="hdr__icon" href="{{ routes.account_url }}" aria-label="Account">Account</a>
  <a class="hdr__icon" href="{{ routes.cart_url }}" data-storelib-cart aria-label="Cart">
    Cart <span class="hdr__count" data-storelib-cart-count></span>
  </a>
</header>
```

```css
.hdr { display: flex; align-items: center; gap: 16px; padding: 12px 20px; }
.hdr__links { display: none; gap: 20px; margin-right: auto; }
.hdr__count[data-count="0"] { display: none; }
.hdr__menu span { display: block; width: 20px; height: 2px; margin: 4px 0; background: currentColor; transition: transform 200ms ease; }
.hdr__menu[aria-expanded="true"] span:first-child { transform: translateY(3px) rotate(45deg); }
.hdr__menu[aria-expanded="true"] span:last-child { transform: translateY(-3px) rotate(-45deg); }
@media (min-width: 768px) {
  .hdr__menu { display: none; }
  .hdr__links { display: flex; }
}
```

The menu drawer draws the menu's links with their sub-links, two levels deep; a menu by that name that does not exist falls back to the links inside the section's own `<nav>`. Only what the markup asks for is mounted, and the cart drawer is drawn once a page whoever asks for it.

## Above the header

An announcement bar, or anything else that belongs above the header on every page, sits in the **header group**. Its schema says so, the way a Shopify theme does:

```json
{ "type": "promo_strip", "name": "Promo strip", "category": "announcement", "enabled_on": { "groups": ["header"] } }
```

`"category": "announcement"` puts a section in the header group even without `enabled_on`. Nothing else goes there: header content in the page's own sections, or page content in the header group, is the wrong group. See [Schema](/developers/schema#where-a-section-may-go).

## How a file is recognised as a header or footer

The rule is in `lib/storelib-theme/chrome.ts` and runs at every door a file comes through: the code editor's save, Ask AI, the MCP and agent tools, a GitHub push and a theme import. A file that does not declare `"kind"` is a header or footer when any of these holds:

1. Its schema says so in a key Storelib does not use: `"group": "header"` or `"footer"`. (`enabled_on` is where a section may go, not what it is: an announcement bar in the header group is not a header.)
2. Its type or name is one: Header, Site header, Navbar, Navigation bar, Top bar, Footer, with a word like Main or Custom in front or a version after. A heading band called "Page header" or "Collection header" is not.
3. Its markup is one: the outermost element is a `<header>` holding a `<nav>`, a `<nav>`, or a `<footer>`, and its name says header, nav, menu or footer.

Saved, it is refused with what to change instead, and with how to declare `"kind"` if the creator really asked for a header of their own. In an imported theme it is left out, its uses are taken off the pages, and the import says so; the site keeps its own header and footer. A file that declares `"kind"` is not refused.

## The rest of a shop

The pages every website has from the start, and where each is:

@[default-pages]

The cart drawer, the cart page, checkout, the account and sign in pages and the wishlist are the platform's, so they work the same on every site and every theme. A section reaches them through links (`/products`, `/cart`, `/account`, `/wishlist`, `/search`) and through the product data in [Dynamic values](/developers/dynamic-values), never by building its own.
