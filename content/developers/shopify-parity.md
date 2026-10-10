# Shopify parity

How the Storelib website builder compares with Shopify's Online Store 2.0 theme editor, as Dawn and Horizon use it: the groups under Theme settings, the input types a section schema can declare, and the page templates a shop has. Each row is **Have**, **Partial** or **Missing**, with where it lives. For how Shopify's names map to Storelib's when you bring a section across, see [Coming from Shopify](/developers/shopify).

## Theme settings

| Shopify group | Storelib | Status | Notes |
| --- | --- | --- | --- |
| Logo | Branding | Have | Logo, its width, a separate phone logo, the store's name. |
| Colors, color schemes | Colors | Have | Five built-in schemes, more can be added, each with twenty-one colours and an optional gradient. |
| Typography | Typography | Have | Three fonts and nine text styles, each with a size per screen. |
| Layout | Layout | Have | Page width, side padding, section gap, spacing scale, card radius and shadow. |
| Animations | Animations | Have | Entrance style, duration and stagger. |
| Buttons | Buttons | Have | Style, shape, radius, size, weight, shadow, hover. |
| Variant pills | Variant pills | Have | Corner radius and border thickness on the product page's option buttons, and on every `[data-variant-pill]`. |
| Inputs | Inputs | Have | Corner radius, border thickness and border opacity on every text box, dropdown and text area in a section. |
| Product cards | Product cards | Have | Standard or Card, image padding, text alignment, radius, border, shadow, on every `[data-card="product"]`: Product Grid, Featured Products, Featured collection, search results, the 404 page. |
| Collection cards | Collection cards | Have | The same six, on every `[data-card="collection"]`: Collection list and the collections page. |
| Blog cards | none | Missing | A Storelib website has no blog. |
| Content containers | Content containers | Have | Radius, border, shadow on every `[data-container]`: Feature Cards, Plans. |
| Media | Media | Have | Radius (the old Image border radius, same setting), border, shadow on every `[data-media]`. |
| Dropdowns and pop-ups | Dropdowns and pop-ups | Have | Radius, border, shadow on every `[data-popup]`, the header's dropdown and the cart notice. |
| Drawers | none here | Partial | The header's menu drawer and cart drawer exist; their theme settings belong to the header work. |
| Badges | Badges | Have | Position, radius, Sale on discounted products with its own words, and the colours of Sale and Sold out. |
| Brand information | Brand information | Have | Headline, description, image and its width, read as `theme.brand` and inserted anywhere as `{{ shop.brand_headline }}`, `{{ shop.brand_description }}`, `{{ shop.brand_image }}`. |
| Social media | Social links | Have | Ten profiles, icons in the header and footer. |
| Search behaviour | none | Missing | Predictive search and what a result shows belong to the search page work. |
| Currency format | Currency format | Have | Show currency codes: `$48.00 USD` on every price a `.storelib` section is handed. Prices drawn by the older built-in React sections do not show the code. |
| Cart | Cart | Have | Cart type (drawer, page or notification), done by the cart on Add to cart, and the free shipping bar. |
| Custom CSS | Custom CSS | Partial | Theme-wide, scoped to the page and cleaned. Shopify also has Custom CSS per section, which Storelib does not. |
| Favicon | Branding | Have | |
| none | Announcement bar, Menus, SEO, Cookie and privacy | Storelib only | |

## Setting types

| Shopify type | Storelib type | Status | Notes |
| --- | --- | --- | --- |
| `checkbox` | `checkbox`, `toggle` | Have | Drawn as a switch. |
| `number` | `number` | Have | The `unit` shows inside the field. |
| `radio` | `radio` | Have | Segmented buttons up to three options, a dropdown past that. |
| `range` | `range` | Have | May carry a value per screen. |
| `select` | `select` | Have | |
| `text` | `text` | Have | |
| `textarea` | `textarea` | Have | |
| `article` | none | Missing | No blog, so no posts to pick. Refused with the reason. |
| `blog` | none | Missing | Refused with the reason. |
| `collection` | `collection_picker` | Have | One of the creator's collections, by id, read on the server for that creator only. |
| `collection_list` | `collection_list` | Have | Several, in the creator's order, up to `limit`. |
| `color` | `color` | Have | May follow a scheme colour, `scheme.accent`. |
| `color_background` | `color_background` | Have | A colour or a linear, radial or conic gradient. |
| `color_scheme` | `color_scheme` | Have | |
| `color_scheme_group` | Theme settings › Colors | Have | The schemes are the theme's; a section picks one. Refused in a section schema with the reason. |
| `font_picker` | `font_picker` | Have | The theme's fonts, each drawn in its own face, and loaded on the page when a section picks one. |
| `html` | `html` | Have | Cleaned on save and on read: no script, no forms, frames only from known players. |
| `image_picker` | `image_picker` | Have | Also `image_gallery` for several. |
| `inline_richtext` | `inline_richtext` | Have | Bold, italic, underline, links. |
| `link_list` | `link_list` | Have | The site's menus; `main-menu` is the header's links. |
| `liquid` | `html` | Partial | Accepted and drawn as an HTML box. The markup is kept and cleaned; Liquid in it is printed as text, never run. |
| `metaobject` | none | Missing | No metaobjects. Repeated content is blocks. |
| `page` | `page_picker` | Have | |
| `product` | `product_picker` | Have | Carries the product's live title, price and picture. |
| `product_list` | `product_list` | Have | |
| `richtext` | `richtext` | Have | Paragraphs, headings, lists, links. |
| `text_alignment` | `alignment` | Have | Left, centre, right; may carry a value per screen. |
| `url` | `url` | Have | The link picker over pages and products, or any address. |
| `video` | `video_picker` | Have | |
| `video_url` | `video_url` | Have | YouTube and Vimeo. |
| `header` | `header` | Have | |
| `paragraph` | `paragraph` | Have | |
| none | `datetime`, `focal_point`, `icon_picker`, `file_picker`, `community_picker`, `divider` | Storelib only | `file_picker` uploads a file to Storelib or takes a link; `accept` narrows it to kinds or extensions. |

## Page templates

| Shopify template | Storelib page | Status | Notes |
| --- | --- | --- | --- |
| `index` | Home page | Have | |
| `product` | Product page | Have | One layout for every product. |
| `collection` | `/collections/<handle>` | Missing | A collection's own page belongs to the collection filtering work. Collection cards link there. |
| `list-collections` | Collections, `/collections` | Have | Every published collection, generated from the header and footer and a Collection list until it is edited. |
| `page` | Any page you add | Have | Starts as the header, a Page content section with the title and a rich text body, and the footer. |
| `blog` | none | Missing | No blog. |
| `article` | none | Missing | No blog. |
| `cart` | Cart, `/cart` | Have | |
| `search` | Search, `/search` | Have | |
| `404` | 404 page | Have | Customisable in the builder, served with a real 404 status. |
| `customers/account`, `customers/login` | Account, Sign in | Have | |
| `page.contact` | Contact | Have | |
| `gift_card` | none | Missing | Storelib has no gift cards. |
| `password` | none | Missing | An unfinished site is left unpublished instead. |

## Commerce a theme can use

Shopify's theme-facing commerce, as Storelib provides it to a `.storelib` section. **Tested** says what a browser or the test suite presses on every push; the other rows are where the code is.

| Shopify | Storelib | Status | Notes |
| --- | --- | --- | --- |
| Ajax Cart API, add to cart from any section | `data-storelib-add-to-cart` | Have | From any button a section draws, with the product's own values. Tested: `scripts/check-own-cart.mjs`. |
| A cart drawer the theme draws | `data-storelib-cart-panel` and its parts | Have | The section's own drawer on the site's one cart: lines, quantities, subtotal, empty state, checkout. Tested: `scripts/check-own-cart.mjs`. See [A cart of your own](/developers/header-and-footer). |
| The theme's cart drawer, cart page, notification | Theme settings › Cart | Have | Drawer, page or notification on Add to cart. |
| Buy it now (`payment_button`) | Shopify's unbranded Buy it now | Have | In an imported theme it buys that item alone and goes straight to checkout, leaving the cart as it was, even when the theme's own script catches the form. Tested: `scripts/check-shopify-theme.ts`. |
| Cart and checkout | Storelib checkout | Have | One payment for the basket. A basket with something shipped goes to the physical checkout. Prices are read again from the database; nothing in the browser can change a charge. |
| Product options and variants | `product_variants`, `product_options` | Have | A section reads `block.settings.variants` and, for shipped products, `options`. |
| Collections | `product_collections` | Have | `collection_picker`, `collection_list`, the collections page. A collection's own page is still missing (above). |
| A section's products chosen in the editor (all, a collection, hand-picked) | a `source` select with `collection_picker` and `product_list` | Have | Product Grid and Featured Products start on the shop. A section an agent writes with typed products is refused when saved. See [Selling](/developers/selling). |
| Featured product | `product_picker`, read as `settings.product.title`, `.price`, `.image` | Have | Product Hero and Product Spotlight take the name, price and photo from the chosen product. In an imported theme a `product` setting reads the picked product by id, by its address (`/products/<handle>`, as the picker stores it), by `shopify://products/<handle>`, or `@current` for the page's own product. |
| `{% for … limit: offset: reversed %}` | the same | Have | A number or a setting. |
| Inventory and locations | `inventory_locations`, `inventory_levels` | Have | Stock per location, movements and transfers (`lib/physical/inventory-server.ts`). A section is told "Sold out", never a count. |
| Shipping profiles, zones and rates | `shipping_profiles`, `shipping_zones`, `shipping_rates` | Have | Flat and tiered rates, carriers, packages, pickup (`lib/physical/rates.ts`, `pickup.ts`). |
| Taxes | `commerce_tax_rates` | Have | Rates the creator sets (`lib/physical`). |
| Fulfilment, returns | `fulfillments`, `commerce_returns` | Have | Shipments with their items, returns with theirs. |
| Discounts | Coupons | Have | Codes at checkout. |
| Predictive search | The search window | Partial | Live results from the store's products as the visitor types. No search settings and no suggestions for pages yet. |
| Metafields, metaobjects | none | Missing | A product has no custom fields a theme can bind. Repeated content is blocks; per-product facts go in the description. |
| Gift cards | none | Missing | |
| Draft orders | none | Missing | |
| Markets, several currencies | none | Missing | Every price is charged in US dollars. |

## What the builder's AI does with this

The Storelib AI in the website builder (it runs on OpenAI's models; see [Building with AI agents](/developers/ai)) builds on the same features, never around them:

- A whole site, not one page: it builds the shop, the product page, collections, About, Contact, a FAQ and whatever else the brief needs as drafts, each filled, and links them in the menu.
- Headers, footers, navigation, product cards, cart drawers and search triggers of its own, written as sections, reading the live menu, logo, products and cart.
- Real data only: products, prices, stock and shipping come from the store. It never types a price, a stock level or a shipping cost.
