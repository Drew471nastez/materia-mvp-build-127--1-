# The header and footer

Every Storelib website draws **one header and one footer**, the same on every page. How they look is yours: layout, icons, buttons, type, motion and logo size. Code them however the page needs.

What is not yours to invent is the **live Storelib data**, the same way a shop platform keeps a cart and a menu in sync with the shop:

- **Menus and sub links.** A `link_list` setting, default `main-menu`, looped `{% for link in settings.menu.links %}` with `{% for child in link.links %}` for the links under it. Footer columns that are the site's menus are `link_list` settings too. A header that declares a menu but draws other links is refused, because a change in Website settings › Navigation would never reach the site.
- **Logo.** `theme.logo.url`, `theme.logo.width`, `theme.logo.height`, `theme.logo.mobile_url` and `theme.logo.text`. Size and colour are settings the creator can change. `theme.logo.width` is a starting width, not a rule. When Theme settings › Branding has no logo, these are the logo uploaded in the built-in header's panel, its height and its words, so a header of your own shows the logo the creator already has, in the builder and on the live site alike.
- **One header.** A section whose schema says `"kind": "header"` (or `"footer"`) is placed in the Header group (or the Footer group) when it is added, on every page, and the header that was showing is hidden, never deleted: its eye brings it back.
- **Cart, search, menu drawer.** `data-storelib-cart`, `data-storelib-cart-count`, `data-storelib-search`, `data-storelib-menu`. See [The site's drawers](#the-sites-drawers).
- **Account, sign in, sign up.** `routes.account_url`. Sign in and a new account are the same page.
- **Buy, products, prices, checkout.** A buy button uses the product's `checkout_url`. Titles and prices come from `products`, already formatted.
- **Email.** `data-storelib-form="subscribe"` on a form. `shop.email` is the support address when the section asks for it.
- **A map or an address** is a text or url setting the creator edits. There is no map object to fetch. Do not paste an analytics script; analytics are the platform's.

The built-in `header` and `footer` sections already do this. Their settings are listed below for when you are editing those. They are not a list you have to copy. A header of your own is [A header of your own](#a-header-of-your-own).

## The right way, in short

| To change | Do this |
| --- | --- |
| The logo | `theme.logo.url`. Size and colour are settings on the section. Theme settings › Branding sets the shared picture. |
| The store name | `shop.name` or `theme.logo.text`. |
| The links | A `link_list` (default `main-menu`), including sub links in `link.links`. Edit the menu in Website settings › Navigation. |
| Social links | `shop.socials`. |
| Layout, icons, buttons, motion, colours | The section's own design. Colours may follow the scheme and may be overwritten. |

A section reads `theme.logo.url`, `shop.name`, `shop.socials` and a `link_list` rather than asking the creator to type them again. See [Dynamic values](/developers/dynamic-values#the-themes-general-settings).

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
| In the editor | Sections › Header (or Footer), or replace it with a section of your own. Links are in Website settings › Navigation. |
| Ask AI in the builder | Ask for the header you want, including a new layout, new icons or your own markup. It designs it and keeps the live values above. |
| An agent over MCP | Write `sections/<name>.storelib` with `"kind": "header"` or `"kind": "footer"`, or change the one on the page. Change menu links with `edit_menu`, not by typing label and address pairs. |
| Editing an exported theme | A header file under any name but `header` or `footer` is kept. `"kind": "header"` makes it the site's header. |

A `nav_link` block:

```json
{ "id": "nav-courses", "type": "nav_link", "settings": { "label": "Courses", "url": "/products", "link_type": "custom" } }
```

and a sub-link under it:

```json
{ "id": "nav-courses-1", "type": "nav_link", "settings": { "label": "Beginner", "url": "/products/beginner", "link_type": "custom", "parent_id": "nav-courses" } }
```

## A header of your own

When the header or footer should be designed differently, write **one** section whose schema says what it is. Layout, icons, buttons, type, motion and logo size are yours. Do not copy the built-in setting list.

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

- `"kind": "header"` makes it the site's header. It replaces the built-in one on every page and sits in the header group. `"kind": "footer"` does the same for the footer.
- **One of each kind.** A second file that declares the same `kind` is refused. Change the existing file, or take `kind` off one of them.
- `sections/header.storelib` and `sections/footer.storelib` are reserved. Use another file name, such as `sections/studio_header.storelib`.
- Its menu is a `link_list` setting, defaulting to `main-menu`, so the creator keeps editing links in Website settings › Navigation. Sub links are `link.links`. Never `link_1_label`, `link_1_url` pairs.
- Its logo is `theme.logo.url` or an `image_picker`. Size and colour are settings. Never a text box holding an address.
- Colours may follow the scheme and may be `color` settings the creator overwrites. See [Styling](/developers/styling#a-colour-setting-for-each-element).
- Cart, search and the menu drawer are attributes on the buttons you design: see [The site's drawers](#the-sites-drawers) below.

### The site's drawers

A header of your own draws its own buttons, icons and motion. The page opens the cart, the search window and the menu drawer when the markup asks, in the builder and on the live site. Mark the element and the page handles the data. A section's script is not needed and could not do it: it runs in a sandbox with no access to the visitor's cart. The drawer's own motion is the page's; the header's motion is yours.

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

### A cart of your own

The built-in cart drawer is a choice, not a requirement. Any section can add products to the cart from its own buttons and draw its own cart drawer, with its own layout and motion, on the site's one cart. The cart is kept in the visitor's browser under the shop and priced again from the database at checkout, so nothing written into the markup can change what anybody is charged.

| Attribute | On | Does |
| --- | --- | --- |
| `data-storelib-add-to-cart` | a button | Adds the product whose id is its value. The line's title, price (as printed), picture, page and kind are read from `data-title`, `data-price`, `data-image`, `data-url` and `data-kind`; an option adds `data-variant-id` and `data-variant-name`; `data-quantity` for a shipped product. A digital product is always one. |
| `data-storelib-cart-panel` | any element | The section's own cart drawer. The section's `data-storelib-cart` button and every add open it instead of the built-in drawer. The page sets `data-open="true"` or `"false"` for your CSS, `aria-hidden`, and `inert` while it is shut. Escape closes it. |
| `data-storelib-cart-lines` | an element in the panel | Where the lines go. It holds one element marked `data-storelib-cart-line hidden`, the pattern, copied once per line. Not a `<template>` tag: that is the file's own delimiter. |
| `data-line-title`, `data-line-variant`, `data-line-price`, `data-line-qty` | inside the pattern | The page writes the line's name, option, line total and quantity in, as text. |
| `data-line-image`, `data-line-url` | an `<img>`, an `<a>` in the pattern | The line's picture and its product page. |
| `data-line-inc`, `data-line-dec`, `data-line-remove` | buttons in the pattern | One more, one less (at one, it removes the line), remove. `data-line-inc` is disabled on a digital product. |
| `data-storelib-cart-subtotal` | any element | The subtotal, as text. |
| `data-storelib-cart-empty`, `data-storelib-cart-filled` | any element | Shown and hidden with the cart. |
| `data-storelib-checkout` | a button | Straight to checkout, as the built-in drawer's Check out: a cart with something shipped goes to the physical checkout. In the builder it opens the cart page instead. |
| `data-storelib-cart-close` | a button | Closes the panel. |

```storelib
{% for block in products %}
  {% if block.settings.available %}
  <button type="button" data-storelib-add-to-cart="{{ block.id }}" data-title="{{ block.settings.title }}" data-price="{{ block.settings.price }}" data-image="{{ block.settings.image }}" data-url="{{ block.settings.url }}" data-kind="{{ block.settings.kind }}">{{ settings.add_label }}</button>
  {% endif %}
{% endfor %}
<button type="button" data-storelib-cart aria-label="Cart"><span data-storelib-cart-count></span></button>
<aside class="bag" data-storelib-cart-panel aria-label="Cart">
  <button type="button" data-storelib-cart-close aria-label="Close">Close</button>
  <p data-storelib-cart-empty>{{ settings.empty_text }}</p>
  <ul data-storelib-cart-lines>
    <li class="bag__line" data-storelib-cart-line hidden><img data-line-image width="56" height="56" alt=""><a data-line-url><span data-line-title></span></a><span data-line-qty></span><span data-line-price></span><button type="button" data-line-dec aria-label="One less">-</button><button type="button" data-line-inc aria-label="One more">+</button><button type="button" data-line-remove>Remove</button></li>
  </ul>
  <div data-storelib-cart-filled><span data-storelib-cart-subtotal></span><button type="button" data-storelib-checkout>{{ settings.checkout_label }}</button></div>
</aside>
```

```css
.bag { position: fixed; inset: 0 0 0 auto; width: min(420px, 100%); transform: translateX(100%); transition: transform 300ms cubic-bezier(0.32, 0.72, 0, 1); }
.bag[data-open="true"] { transform: none; }
@media (prefers-reduced-motion: reduce) { .bag { transition: none; } }
```

`scripts/check-own-cart.mjs` presses every one of these in a browser on a section drawn by the real renderer.

## Above the header

An announcement bar, or anything else that belongs above the header on every page, sits in the **header group**. Its schema says so:

```json
{ "type": "promo_strip", "name": "Promo strip", "category": "announcement", "enabled_on": { "groups": ["header"] } }
```

`"category": "announcement"` puts a section in the header group even without `enabled_on`. Nothing else goes there: header content in the page's own sections, or page content in the header group, is the wrong group. See [Schema](/developers/schema#where-a-section-may-go).

## Over every page: the overlay group

What floats over the page rather than sitting in it (a mobile bottom bar, a popup, a back to top button, a sticky add to cart, a cookie or age check) sits in the **overlay group**. It is the fourth group in the sidebar, under the footer, shown when the theme has such a section or the page already holds one. Like the header and footer groups, it is the same on every page.

```json
{ "type": "bottom_bar", "name": "Mobile bottom bar", "enabled_on": { "groups": ["overlay"] } }
```

A section whose name or type plainly says what it is (popup, modal, back to top, bottom nav, mobile menu bar, sticky cart, cookie, age gate, chat button) may go there without saying so, and still on a page if you add it there. `"*"` in `enabled_on` and anything `disabled_on` mean the header, page and footer, never the overlay: a section goes over the page only when it is meant to. Overlay sections are drawn after the footer, so they sit on top; position them yourself (`position: fixed`) as the design needs.

### What the page does for a floating section

Its box has no query container, so `position: fixed` inside it is fixed to the screen, and it is drawn above the sticky header. A width-only `@media` query is read as a container query (see [Rules](/developers/rules)); for the screen's own width write it so it stays a media query, `@media not all and (min-width: 750px)`. The builder draws the section with `page.in_editor` true, in the page and visible, so it can be selected and edited; write that version too.

Three things a floating section cannot do from its own script, the page does when asked by attribute:

| Attribute | On | What the page does |
| --- | --- | --- |
| `data-storelib-back-to-top` | a button | Sets `data-shown` once the page is scrolled past `data-after` pixels (400 when unset). A press scrolls back to the top. |
| `data-storelib-popup` | the popup's root | Sets `data-open` after `data-delay` seconds (5 when unset). Once a visitor closes it, it does not open for them again, unless `data-once="0"`. In the builder it is always open. |
| `data-storelib-popup-close` | any element inside it | Closes it, as Escape does. |
| `data-storelib-bottom-bar` | a bar fixed to the bottom | Publishes its height as `--sl-bottom-bar-h` on the page (0 while it is hidden), so anything else in a bottom corner can sit above it. |

The default theme's `back_to_top`, `mobile_bottom_bar` and `popup` are written this way. `scripts/check-overlay-live.ts` measures them on a visitor's page, `scripts/check-overlay-sections.mjs` in the builder.

## How a file is recognised as a header or footer

Recognition places a header, it does not refuse one. The rule is in `lib/storelib-theme/chrome.ts`. An imported theme that brings a header file keeps it and draws it as the site's header, with the built-in one hidden. A save of any file except the two reserved names goes through.

A file is treated as a header or footer, for that placement, when any of these holds:

1. Its schema says `"kind": "header"` or `"kind": "footer"`.
2. Its schema says so in a key Storelib does not use: `"group": "header"` or `"footer"`. (`enabled_on` is where a section may go, not what it is: an announcement bar in the header group is not a header.)
3. Its type or name is one: Header, Site header, Navbar, Navigation bar, Footer, with a word like Main or Custom in front or a version after. A heading band called "Page header" or "Collection header" is not, and neither is a Top bar, a Menu bar, a Navigation menu or a Mega menu: those are sections of their own, placed wherever they are put.
4. Its markup is one: the outermost element is a `<header>` holding a `<nav>`, a `<nav>`, or a `<footer>`, and its name says header, navigation or footer. A `<nav>` named for a menu is a menu.

Only `sections/header.storelib` and `sections/footer.storelib` are refused, because those names are the built-in sections. Save a header of your own as `sections/studio_header.storelib` (any other name) and set `"kind"`.

## The rest of a shop

The pages every website has from the start, and where each is:

@[default-pages]

The cart drawer, the cart page, checkout, the account and sign in pages and the wishlist are the platform's, so they work the same on every site and every theme. A section reaches them through links (`/products`, `/cart`, `/account`, `/wishlist`, `/search`) and through the product data in [Dynamic values](/developers/dynamic-values), never by building its own.
