# Shopify gap analysis

What an Online Store 2.0 theme has, what the Storelib theme framework has, and
what was done about each difference. Written 25 September 2026, at the start of
the round that closed most of them, and updated at its end.

The developer-facing version of this, without the status column, is
`content/developers/shopify.md` (storelib.com/developers/shopify).

Status:

- **Had**: Storelib already had it, perhaps under another name.
- **Built**: added in this round.
- **Left out**: applies to creators, deliberately not built, with the reason.
- **N/A**: does not apply to a creator platform.

## Setting types

| Shopify | Storelib | Status | Notes |
| --- | --- | --- | --- |
| checkbox, number, radio, range, select, text, textarea, richtext | same names | Had | `range` also responsive |
| header, paragraph | same names | Had | plus `divider` |
| color, color_scheme, font_picker, image_picker, url | same names | Had | |
| text_alignment | alignment | Had | alias added |
| page | page_picker | Had | alias added |
| product | product_picker | Had, extended | now a Linked value: prints as the address, carries title, price, image |
| video | video_picker | Had | |
| inline_richtext | inline_richtext | Built | own inline sanitiser in the engine |
| html | html | Built | sanitize-html embed allow list |
| color_background | color_background | Built | colours and linear or radial gradients, parsed piece by piece |
| video_url | video_url | Built | YouTube and Vimeo, `accept` |
| product_list | product_list | Built | `limit` 1 to 24, order kept, missing products dropped |
| link_list | link_list | Built | menus are the store's (Navigation, shared by every theme) with a generated `main-menu` |
| none | datetime | Built | read as written, never shifted by a time zone; `date` filter |
| image focal point | focal_point | Built | beside the image setting, tap to choose |
| collection, collection_list | none | N/A | no collections; refused with the reason |
| blog, article, article_list | none | N/A | no blog model |
| metaobject, metaobject_list | none | N/A | no metaobjects |
| liquid | none | N/A | the template is the code; custom sections |
| color_scheme_group | none | N/A | schemes are theme settings |

## Schema keys and resolution

| Shopify | Storelib | Status |
| --- | --- | --- |
| settings, blocks, max_blocks, block limit, presets | same | Had |
| enabled_on, disabled_on | allowed_templates, disabled_templates | Had |
| visible_if | visible_if, same syntax | Built |
| setting value checked against its type | draw-time validation in resolve.ts | Built (values were only checked on save, and only for shape) |
| schema migrations | migrations | Had (and now applied, which they were not) |
| tag, class | none | N/A, the markup is the wrapper |
| locales, t: | none | Left out: sites are single language |

## Templates and pages

| Shopify | Storelib | Status |
| --- | --- | --- |
| index, product, page | home, product, about, contact, custom pages | Had |
| collection | shop at /products, generated | Had |
| search | search, generated | Had |
| cart | /cart, chrome around the cart | Had (not section-editable, by design) |
| 404 | 404 page, generated, editable, real 404 status | Built |
| policies | policy pages | Had |
| robots.txt, sitemap | per site | Had |
| customers/* | account, sign in and wishlist pages, generated | Built this round by the storefront accounts work; merged here |
| alternate templates | none | Left out: one product layout for every product |
| blog, article, list-collections, gift_card | none | N/A |
| password | none | N/A: a site is published or not; unpublished shows a notice |

## Sections

| Dawn | Storelib | Status |
| --- | --- | --- |
| image-banner, image-with-text, rich-text, multicolumn, collage, video, collapsible-content, newsletter, email-signup-banner, featured-product, featured-collection, header, footer, main-search, main-product, related-products | library sections and page renderers | Had |
| featured-collection with chosen products | product_grid source "chosen" | Built |
| multirow | multirow (Rows) | Built |
| main-404 | not_found | Built |
| none | pricing_table (Plans) | Built, for courses, memberships, services |
| none | course_curriculum (Course Outline) | Built |
| announcement-bar | theme announcement bar | Had, extended with several messages taking turns |
| slideshow | retired slideshow still renders | Left out: hides content behind a timer; heroes instead |
| contact-form | contact section and generated contact page | Built this round by the storefront accounts work |
| custom-liquid | custom sections | Had |
| predictive-search | none | Left out: search is a page; not asked for |
| featured-blog, collection-list, main-list-collections, apps, pickup-availability, quick-order-list, main-password | none | N/A |

## Header

| Dawn header setting | Storelib | Status |
| --- | --- | --- |
| logo, logo width | logo, height, nudge | Had |
| menu (link_list) | Links: own links or a menu | Built |
| desktop menu type (dropdown, mega, drawer) | dropdown under a link | Had dropdown; mega menu left out |
| mobile menu | Menu on phones: left, right, full screen | Built |
| sticky header | always, or on scroll up | Had |
| transparent over the first section | all pages or home only | Built (scope) |
| logo size on phones | phone logo height | Built |
| icons | search, account, wishlist, cart toggles | Had |
| country and language selectors | none | N/A |
| announcement bar group | theme announcement bar, rotating | Built (rotation) |

## Other concepts

| Shopify | Storelib | Status |
| --- | --- | --- |
| dynamic sources (metafields) | closed list: shop, creator, product, page, social, date | Built |
| header and footer groups | one header and footer, drawn on every page | Had |
| theme settings (settings_schema.json) | Theme settings groups | Had, plus Menus |
| snippets, render | none | Left out: sections are self-contained |
| assign, capture | none | Left out: `default` and block-shaped `products` cover the uses |
| theme blocks, nested blocks | none | Left out: one level of blocks |
| app blocks | none | N/A |
| section rendering API | none | N/A |
| Theme Check | compiler errors with file and line | Had |
| Shopify CLI, GitHub integration | GitHub sync, MCP, agent API | Had |
