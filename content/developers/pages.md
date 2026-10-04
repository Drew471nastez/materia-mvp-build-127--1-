# Pages and page settings

A website is a set of pages, and a page is an ordered list of sections. Each page is stored under a **page key**, and the key is also its address: the page `size-guide` is at `/size-guide`. This page covers which keys exist, which a page cannot take, what a page stores, and the settings each page has of its own.

## The pages every website has

| Key | Address | What it is |
| --- | --- | --- |
| `home` | `/` | The home page. Its header and footer are the site's. |
| `product` | `/products/<slug>` | The one template every product page is drawn with. The product comes from the address. |
| `about` | `/about` | In the page list from the start, and stored the first time it is saved. |
| `contact` | `/contact` | The same. |
| `products` | `/products` | The shop. Until it is edited, it is built from the home page's header and footer and a product grid. |
| `search` | `/search?q=` | Search results over the newest 24 published products. Built the same way until it is edited. |
| `collections` | `/collections` | Every published collection, Shopify's list-collections page: the header and footer around a Collection list. Built the same way until it is edited. Every shop has one, whatever it sells. A collection's own page, `/collections/<handle>`, is the shop page under the collection's name: its published products in its order, with the shop's filters and sort. |
| `404` | any address the site does not have | The page a visitor gets for a missing address: the header and footer around the Page not found section, with a search box and a few products. Built the same way until it is edited, and opened from the page switcher as **404 page**. |

A new website starts with its home and product pages stored. The shop, search and 404 pages exist on the live site from the first publish, whether or not anyone has opened them. Generated, each takes the header's colour scheme, so a dark site's shop is dark too.

The 404 page keeps the real 404 status. The site's missing address is answered by Storelib's one not-found page, which on a creator's own address asks the site for its 404 page (at `/not_found`, published content only) and draws it in place of a plain message. `404` is a reserved key, so `/404` is one more address the site does not have.

Three **policy pages** are added the first time a website opens in the builder, as ordinary pages made of ordinary sections, linked from the footer. Their text is a template with the parts only the business can fill in written in [square brackets], so an unedited page reads as unfinished.

@[policy-pages]

## Pages you make

**Create page**, in the page switcher at the top of the builder, and **Add page** in Website settings › Pages, ask for a name and make the key from it: letters with accents plain, lower case, and every run of anything that is not a letter or digit turned into one `-`. "Size Guide!" becomes `size-guide`. A key is 1 to 63 characters of `a` to `z`, `0` to `9` and `-`, starting with a letter or digit. The name you type is not stored: the builder lists the page by its key, so `size-guide` reads as Size guide.

A new page starts as Shopify's default page template: the site's header, a **Page content** section holding the name you typed as its title and a rich text body to write the page in, and the footer, saved as a draft. Page content is a section like any other: it can be moved, hidden, removed, or added again from the library. The page is on the live site after the next publish.

These keys are never a page you make, because the platform answers at those addresses or keeps them for later:

@[page-keys]

The built-in keys above are taken too, and so is any key another page has.

**Deleting a page.** Pages you made, the policy pages among them, have Delete in the page switcher, which asks first. Deleting takes the page off the live site at once; it does not wait for Publish, and Undo does not bring it back. The home and product pages cannot be deleted.

## The header and footer

Every page stores the header and the footer, and the builder keeps them the same everywhere: when a page is saved, its header and footer are copied onto every other page of the website. The live site goes further and draws the home page's header and footer on every page, whatever a page's own copy says. Change the menu on one page and it has changed on all of them. Both can be hidden, which hides them everywhere; neither can be moved, copied or deleted.

The header and footer are drawn by the platform's own components, with a panel of their own in the builder, rather than by `.storelib` files, and a section file can never be another one. Everything they do and every setting they take is in [The header and footer](/developers/header-and-footer).

## What a page stores

A page is a list of section instances, each with its own blocks:

```json
[
  {
    "id": "faq_accordion-1727200000000",
    "type": "faq_accordion",
    "name": "Accordion FAQ",
    "settings": { "heading": "Questions", "color_scheme": "light" },
    "blocks": [
      { "id": "block-m1x2-1-ab3cd", "type": "qa", "settings": { "question": "Do you ship abroad?", "answer": "<p>Yes, everywhere.</p>" } }
    ],
    "hidden": false
  }
]
```

| Field | Meaning |
| --- | --- |
| `id` | Made once, when the section is added, and never changed. Reordering moves the section; duplicating gives the copy a new id and new block ids. Treat it as an opaque string. |
| `type` | The section type, which is the name of its file, `sections/<type>.storelib`. |
| `name` | What the Sections panel calls it. A copy is named with `(copy)` after it. |
| `settings` | The values this instance holds: what its preset set, and every value the creator has set since. A value that is not stored falls back to the schema's default when the section is drawn. |
| `blocks` | The instance's blocks in order, each `{ id, type, settings }`. A block added with Add stores its block type's defaults at that moment. |
| `hidden` | `true` leaves the section out of the page. It stays in the list, faded. |

The builder writes a few keys into `settings` itself, from the section's design panel rather than from its schema: `color_scheme` and `color_overrides` for its colours, and `heading_style`, `body_style`, `custom_heading` and `custom_body` for its text. Declare a `color_scheme` setting in a schema; leave the other five to the panel.

A setting the schema no longer declares is kept in `settings` and ignored by the template, so taking a setting out of a file and putting it back restores the value. A block whose type the section no longer declares is kept too.

A page holds at most 60 sections, and a section at most 50 blocks. Every save is refused past either.

## Which template a page is

A section can ask which page it is on through `page.template`. Home is `index`, and every other page is `page.` and its key, such as `page.about` or `page.size-guide`. Two differ between the live site and the builder:

| Page | On the live site | In the builder |
| --- | --- | --- |
| Home | `index` | `index` |
| A product page | `product` | `page.product` |
| The shop | `page.products` | `page.products` |
| Every collection | `page.collections` | `page.collections` |
| One collection | `collection` | `collection` |
| Search results | `page.search`, with the search as `page.query` | `page.search` |
| The 404 page | `page.404` | `page.404` |
| Any other page | `page.<key>` | `page.<key>` |

So a section that should draw differently on product pages tests for both: `{% if page.template == "product" or page.template == "page.product" %}`. See [Dynamic values](/developers/dynamic-values#page).

A section's schema may list `allowed_templates` or `disabled_templates`. Both are validated and kept, and **nothing uses them yet**: Add Section offers every section on every page.

## Each page's search settings

Every page except home has its own entry under Website settings › Pages & Navigation › Search:

| Field | Stored as | Notes |
| --- | --- | --- |
| Title | `page_seo.<key>.title` | What a search result shows. About 70 characters are shown; up to 120 are kept. |
| Description | `page_seo.<key>.description` | The line under it. About 160 characters are shown; up to 320 are kept. |
| Show in search engines | `page_seo.<key>.hidden` | Off gives the page `noindex` and leaves it out of the sitemap. |

They are theme settings, so they are part of the draft: undone with it, and live when the website is published. The home page's title and description are the site's own, under Website settings › SEO & Social, and the switch there that keeps search engines off applies to every page.
