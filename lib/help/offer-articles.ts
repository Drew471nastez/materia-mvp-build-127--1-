/**
 * ===========================================================================
 *  THE HELP CENTRE'S OFFERS GUIDE
 * ===========================================================================
 * Upsells and bundles, one kind of offer at a time, under Products (a topic
 * every store sees: offers work for downloads and for things that ship).
 * Written from the code and checked against it on the day in REVIEWED:
 *
 *   The list               app/app/offers/offers-client.tsx
 *   The editor             app/app/offers/offer-editor.tsx, offer-draft.ts
 *   What an offer takes    lib/offers/offers.ts (applyOffers, stackWithCode,
 *                          triggered, suggestionsFor, bundleCompletions)
 *   Quantity breaks        lib/offers/pricing.ts (tiers, blocks, labels)
 *   Try it in a cart       lib/offers/try-cart.ts (and its warnings)
 *   What a page shows      lib/offers/offers-public.ts, /api/offers/cart
 *   The website            components/website-builder/sections/renderers/
 *                          product/offers-block.tsx, themes/default/sections/
 *                          product.json (the block's settings),
 *                          lib/website-builder/product-page.ts withOffersBlock,
 *                          components/offers/* (cart, checkout)
 *   Featured products      components/offers/featured-offers.tsx, themes/
 *                          default/sections/product_featured.storelib,
 *                          product_spotlight.storelib and
 *                          hero_product.storelib (show_offers)
 *   An imported theme      lib/storelib-theme/compat/offers-app-block.ts
 *   Words                  lib/markets/ui-words.ts (Shop words),
 *                          lib/markets/checkout-words.ts (Checkout)
 *   Currency               lib/markets/checkout-charge.ts, lib/store/
 *                          currency-guard.ts
 *
 * Every field and button is named by the words on the screen. Pictures are
 * screenshots of the real components with made up demo data, taken by
 * scripts/help-offer-shots.mjs (see lib/help/offer-shots.ts).
 */

import type { HelpArticle, HelpBlock } from "./articles"
import { OFFER_SHOTS } from "./offer-shots"

/** The day every article below was last checked against the product. */
const REVIEWED = "2026-10-28"
const SECTION = "Upsells and bundles"

type ShotName = keyof typeof OFFER_SHOTS
/** A screenshot from public/help/offers/, at its real size, with its phone picture when there is one. */
function shot(name: ShotName, alt: string, caption?: string, phoneName?: ShotName): HelpBlock {
  const [width, height] = OFFER_SHOTS[name]
  const phone = phoneName ? { src: `/help/offers/${phoneName}.webp`, width: OFFER_SHOTS[phoneName][0], height: OFFER_SHOTS[phoneName][1] } : undefined
  return { type: "image", src: `/help/offers/${name}.webp`, alt, caption, width, height, ...(phone ? { phone } : {}) }
}
const link = (slug: string, label: string) => `[${label}](/help/products/${slug})`

type Article = Omit<HelpArticle, "category" | "section" | "updated">

const ARTICLES: Article[] = [
  {
    slug: "offers",
    title: "Upsells and bundles: the three kinds of offer",
    summary: "Quantity breaks, bundles and upsells: what each one does for a buyer, where it shows, and how Storelib prices it in the cart and at checkout.",
    keywords: ["offer", "offers", "upsell", "upsells", "bundle", "bundles", "quantity break", "volume discount", "tiered pricing", "cross sell", "order bump", "frequently bought together", "aov", "average order value", "buy x get y", "bogo"],
    related: ["quantity-breaks", "bundles", "upsells", "offers-on-your-website"],
    body: [
      { type: "p", text: "An offer gives a buyer a better price for buying more from you. Open Products > Upsells and bundles in the dashboard. Every offer you make there is read from your store by your website, your cart and your checkout. You don't copy prices anywhere." },
      shot("offers-list", "Products, Upsells and bundles: four offers in a table with their type, discount, units sold in 90 days, where each is shown and its status. Tote for the road is Scheduled.", undefined, "offers-list-phone"),
      { type: "table", head: ["", "Quantity break", "Bundle", "Upsell"], rows: [
        ["What the buyer gets", "More of one product for less each, or some free", "Two to five products together for less", "One more product at a lower price"],
        ["Example", "Buy 2 get 1 free", "Mug and bowl, 10% off the set", "Add an apron, $5 off"],
        ["Where it shows", "Product page, cart", "Product page, cart", "Product page, cart, checkout"],
        ["When it applies", "For every block of units that fits a tier", "For every complete set in the cart", "When the cart holds the products you chose, or anything"],
      ] },
      { type: "p", text: "Before your first offer the page has one button for each kind: Create bundle, Create upsell and Create quantity break." },
      shot("offers-empty", "Upsells and bundles with no offers yet: No offers yet, and the buttons Create bundle, Create upsell and Create quantity break."),
      { type: "h", text: "Which one to use" },
      { type: "list", items: [
        "People buy one of something and could use more: a quantity break. See " + link("quantity-breaks", "Set up a quantity break") + ".",
        "Two or more products are used together: a bundle. See " + link("bundles", "Set up a bundle") + ".",
        "A small extra goes with what's in the cart: an upsell. Pointed at certain products, it's a cross sell. See " + link("upsells", "Set up an upsell") + ".",
      ] },
      { type: "h", text: "How it connects to your store" },
      { type: "list", items: [
        "Offers use your products as they are now: their prices, their options, whether they're published.",
        "Your website shows them by itself. The product page has a Bundles and upsells block, Featured products, Product spotlight and Product hero sections show them for their products, and the cart and checkout show savings and suggestions. An imported theme shows them once you add its Bundles and upsells block. See " + link("offers-on-your-website", "Show offers on your website") + ".",
        "The checkout works out every discount again on Storelib's server from your offers and your prices. A buyer can't change a price in their browser.",
        "Each order keeps which offer saved what. It's on the receipt, the order and the order emails.",
        "Discount codes, other currencies and languages work alongside offers. See " + link("how-offers-are-priced", "How offers are priced") + ".",
      ] },
      { type: "note", text: "Offers apply in the cart checkout, for downloads and for things you ship alike, as long as they're bought through the cart." },
      { type: "h", text: "Not the same as a ZIP bundle" },
      { type: "p", text: "A download with six or more files can arrive as one ZIP named after the product, up to 400 MB in all. Storelib makes that ZIP for you. It has nothing to do with offers and changes no price." },
    ],
  },
  {
    slug: "quantity-breaks",
    title: "Set up a quantity break: buy more, pay less",
    summary: "Give one product, or every product in a collection, tiers like Buy 2 get 1 free or 4 for 30% off, shown as choices on the product page.",
    keywords: ["quantity break", "quantity breaks", "volume discount", "tiered pricing", "tiers", "buy 2 get 1 free", "buy x get y", "bogo", "multi buy", "bulk discount", "free item"],
    related: ["offers", "bundles", "how-offers-are-priced", "offers-common-problems"],
    howTo: "Make a quantity break",
    body: [
      { type: "p", text: "A quantity break rewards buying more of one product. On the product page the buyer sees each tier as a choice with its total. Picking one sets the quantity, and the cart and the checkout charge exactly the total the tier showed." },
      shot("product-page-offers", "A website product page for the Speckled mug with a quantity break box, Buy more mugs, save more: Buy 1 at $32.00, Buy 2 get 1 free at $64.00 marked Most popular, and Buy 4, save 30% at $89.60. Under it the Breakfast set bundle and an apron upsell.", "The quantity break, a bundle and an upsell on one product page.", "product-page-offers-phone"),
      { type: "h", text: "Make a quantity break" },
      { type: "steps", items: [
        "Open Products > Upsells and bundles and press New offer (or Create quantity break if you have no offers yet).",
        "Choose Quantity break at the top.",
        "Type the Name buyers see. It's the heading above the tiers, like Buy more mugs, save more.",
        "Under Applies to, pick the product. If you have collections, you can choose A collection instead: every product in it gets the same tiers, each at its own price.",
        "Set the tiers, pressing Add tier for each one after the first. Each has Buy (how many they pay for), Free (how many come free), and a Discount of None, Percent off or Amount off on the ones they pay for.",
        "Leave Label empty to use the tier's own words, like Buy 2 get 1 free, or type your own. Add a short Badge, like Most popular, to one tier if you want.",
        "Check the Preview and press Price this cart under Try it in a cart.",
        "Press Create.",
      ] },
      shot("offer-quantity-break-editor", "The quantity break editor: the Speckled mug chosen, three tiers (Buy 1; Buy 2 get 1 free with the badge Most popular; Buy 4 with 30% off), Show it on Product page and Cart, the preview with each tier's total, two warnings and Try it in a cart."),
      { type: "h", text: "The rules for tiers" },
      { type: "list", items: [
        "Up to six tiers. Buy is 1 to 99, Free is 0 to 10, a percent is up to 90.",
        "Each tier needs more units than the one above it (what they pay for and what's free, together).",
        "At least one tier has to give something: free units or a discount. A plain Buy 1 tier is fine as the first choice.",
        "Every unit of the product in the cart counts, whatever its option, color or size.",
      ] },
      { type: "h", text: "How units are counted" },
      { type: "p", text: "The cart is split into the biggest tier that fits, again and again, then the next one down. Units that fit no tier pay full price. With tiers of 2 + 1 free and 3 + 2 free, five mugs are one 3 + 2 block, so the buyer pays for 3. Eight mugs are a 3 + 2 block and a 2 + 1 block, so they pay for 5. When the units have different prices, the free ones are the cheapest." },
      { type: "h", text: "Try it before you save" },
      { type: "p", text: "Try it in a cart starts with the units of your last tier. Change the number, press Price this cart, and you see what the checkout would take off and which tier did it. It uses your other offers too, so you see what really happens." },
      shot("offer-try-cart", "Try it in a cart with 4 Speckled mugs: Buy 4, save 30% takes $38.40 off, so $128 becomes $89.60. Total, $38.40 off."),
      { type: "note", text: "Watch the yellow notes under the preview. Tier 3 costs more per item than tier 2 means a bigger tier is worse value: in the picture above, 3 mugs for $64.00 is $21.33 each but 4 for $89.60 is $22.40 each. Raise the bigger tier's discount until it costs less per item." },
    ],
  },
  {
    slug: "bundles",
    title: "Set up a bundle: products bought together for less",
    summary: "Put two to five products in a set with a percent or amount off, shown on each product's page with Add all to cart and finished in the cart.",
    keywords: ["bundle", "bundles", "set", "kit", "frequently bought together", "buy together", "add all to cart", "complete the set", "product bundle", "combo"],
    related: ["offers", "upsells", "offers-on-your-website", "offers-common-problems"],
    howTo: "Make a bundle",
    body: [
      { type: "p", text: "A bundle is a set of two to five of your products at a better price together. Each product's page shows the set, its price together and Add all to cart. A buyer who has only part of the set in the cart is shown the rest, with what they'd save." },
      { type: "h", text: "Make a bundle" },
      { type: "steps", items: [
        "Open Products > Upsells and bundles and press New offer (or Create bundle).",
        "Keep Bundle chosen at the top.",
        "Type the Name buyers see, like Breakfast set.",
        "Under Products in the bundle, tick two to five products.",
        "Choose the Discount: Percent comes off every product in each complete set, Amount comes off each complete set, and None shows the set at its normal price. Free shipping, where selling things that ship is available, makes the whole order ship free once the set is in the cart.",
        "Under Show it on, keep Product page, Cart or both.",
        "Check the Preview. It shows the set's price with the full price struck through.",
        "Press Create.",
      ] },
      shot("offer-new", "A new offer with Bundle chosen: Name buyers see, Products in the bundle with four products to tick, Discount set to 10 percent off every product in each complete set, Show it on Product page and Cart, Dates and limits, and the Create button."),
      { type: "h", text: "What the buyer sees" },
      { type: "list", items: [
        "On each product's page: the products in the set, This item first, then Together with both prices and Add all to cart. The product the buyer is on goes in with the option they picked; another product with options gets a small choice of its own.",
        "In the cart: with part of the set in it, a row with the missing products, Save on the set, and Add.",
        "At checkout: the saving as its own line under the subtotal, named as you named the bundle.",
      ] },
      shot("cart-page-offers", "The website cart page with three Speckled mugs. Under them: Breakfast set, add the Serving bowl and save $7.60 on the set; and Add an apron at $33.00 instead of $38.00. The summary shows Buy 2 get 1 free, minus $32.00."),
      { type: "h", text: "Good to know" },
      { type: "list", items: [
        "Every complete set gets the discount: two mugs and two bowls are two sets. Set Discounted sets per order under Dates and limits to stop at a number.",
        "An amount off is shared across the set's products by their price.",
        "A pay what you want product can be in a bundle. It counts toward the set, but its price is never discounted: the rest of the set takes the discount.",
        "A bundle shows only while every product in it is published.",
        "A bundle is never added at checkout in one press. It's completed on a product page or in the cart.",
      ] },
    ],
  },
  {
    slug: "upsells",
    title: "Set up an upsell: one more product at a lower price",
    summary: "Suggest one product on product pages, in the cart and at checkout when the cart holds the products you choose, with a percent or amount off.",
    keywords: ["upsell", "upsells", "cross sell", "cross sells", "cross selling", "order bump", "checkout offer", "add to your order", "add on", "you may also like", "post purchase", "related product"],
    related: ["offers", "bundles", "offers-on-your-website", "offers-common-problems"],
    howTo: "Make an upsell",
    body: [
      { type: "p", text: "An upsell suggests one product to someone already buying, at a lower price. It shows on a product page under the buy buttons, in the cart, and at checkout under Add to your order. One press adds it, and the checkout takes the discount off while the cart still qualifies." },
      { type: "h", text: "Make an upsell" },
      { type: "steps", items: [
        "Open Products > Upsells and bundles and press New offer (or Create upsell).",
        "Choose Upsell at the top.",
        "Type the Name buyers see. It's the line above the product, like Add an apron.",
        "Under Product to offer, pick one product.",
        "Under Show it when the cart has, choose Anything, Certain products, or A collection (when you have collections), and tick the ones that should bring it up.",
        "If you want a minimum, fill in And the rest of the order is at least. The product you offer doesn't count toward it.",
        "Choose the Discount: Percent or Amount off the product it offers, Free shipping on the whole order once it's added (where selling things that ship is available), or None to suggest it at its own price.",
        "Under Show it on, keep Product page, Cart, Checkout or any of them.",
        "Press Create.",
      ] },
      shot("offer-upsell-editor", "The upsell editor for Add an apron: the Linen apron as the product to offer, shown when the cart has the Speckled mug or the Serving bowl and the rest of the order is at least $30.00, $5.00 off, shown on product page, cart and checkout, with a preview at $33 instead of $38."),
      { type: "h", text: "Upsell or cross sell" },
      { type: "p", text: "They're the same offer. Anything suggests the product to every cart. Certain products or A collection makes it a cross sell: an apron for people buying mugs, a case for people buying a camera. On a product page, an upsell shows only on the pages of the products that bring it up (every page, with Anything)." },
      { type: "h", text: "Where buyers see it" },
      { type: "list", items: [
        "Product page: under the buy buttons, with its price and Add. Up to two upsells per page.",
        "Cart: in the cart drawer and on the cart page, with Add. Up to three at once.",
        "Checkout: under the order's lines, as Add to your order. A product with options gets its choice right there.",
        "It isn't suggested once its product is in the cart, and never to a cart with nothing else in it.",
      ] },
      shot("checkout-offers", "The website checkout's order summary: three Speckled mugs and a Serving bowl, then Add an apron at $33.00 instead of $38.00 with an Add button, then the savings lines Breakfast set minus $7.60 and Buy 2 get 1 free minus $32.00, Shipping $6.00, Total due $106.40."),
      { type: "h", text: "Limits" },
      { type: "list", items: [
        "By default one unit of the product gets the discount. Change Discounted items per order under Dates and limits for more.",
        "The discount stays only while the cart still has what brought the upsell up. Remove the mug and the apron goes back to its own price.",
        "A pay what you want product can be offered, but its price is never discounted.",
      ] },
    ],
  },
  {
    slug: "offers-on-your-website",
    title: "Show offers on your website: product page, cart and checkout",
    summary: "The Bundles and upsells block, Featured products and Product spotlight, an imported theme's block, and what the cart and checkout show by themselves.",
    keywords: ["bundles and upsells block", "offers block", "product page", "website builder", "theme", "block", "cart drawer", "cart page", "checkout", "featured product", "featured products", "product spotlight", "product hero", "choose options", "imported theme", "app block", "add block", "colors", "button"],
    related: ["offers", "offers-common-problems", "website-builder/build-your-website"],
    body: [
      { type: "p", text: "On Storelib's own theme you don't place offers by hand. Each offer has Show it on in its editor, and your website reads that. On an imported theme you add one block. This is where each place comes from." },
      { type: "table", head: ["Place", "What shows", "Where it comes from"], rows: [
        ["Product page", "Quantity break tiers, bundles with this product, upsells this product brings up", "The Bundles and upsells block in the Product section"],
        ["Featured products, Product spotlight, Product hero", "The same, for each product the section shows", "The section itself, while Show bundles and upsells is on"],
        ["An imported theme", "The same, on a product page or a Featured product", "The Bundles and upsells block, once you add it"],
        ["Cart drawer", "Each saving above the subtotal, upsells to add, bundles to finish", "The cart itself, on your live website"],
        ["Cart page", "The same as the cart drawer", "The cart page itself"],
        ["Checkout", "Each saving in the summary, upsells under Add to your order", "The checkout itself"],
        ["Your creator page", "Bundles under the buy button, as Buy together", "The product page at storelib.com/you"],
      ] },
      { type: "h", text: "The Bundles and upsells block" },
      { type: "p", text: "Storelib's Product section has a block called Bundles and upsells. A product page already gets it after Delivery and pickup (or after the buy buttons), so an offer shows without you adding anything. It draws nothing on a product no offer names." },
      { type: "steps", items: [
        "Open Website and the editor, and go to a product page.",
        "In the sidebar, open the Product section and find Bundles and upsells among its blocks.",
        "Drag it to move it. To put it back after removing it, press Add block in the Product section and choose Bundles and upsells. A section has one at most.",
        "Press the block to change its settings, then publish the website.",
      ] },
      { type: "table", head: ["Setting", "What it does"], rows: [
        ["Quantity breaks, Bundles, Upsells", "Turn each kind off on this page without turning the offer off."],
        ["Bundle button", "The words on the bundle's button. Add all to cart by default."],
        ["Upsell button", "The words on the upsell's button. Add by default."],
        ["Button style", "Outline or Filled."],
        ["Heading, Text, Price, Border", "Colors, following the section's color scheme until you pick your own."],
        ["Saving background, Saving text", "The colors of the saving badge, like 10% off."],
        ["Button background, Button text", "The button's colors."],
        ["Space above, Space below", "The room above and below the block."],
      ] },
      { type: "p", text: "In the editor, the builder's stand in product shows a sample quantity break, bundle and upsell, so you can set the colors before you have offers. A real product with no offer shows one quiet line instead: No bundle, quantity break or upsell shows this product yet." },
      shot("product-page-offers", "The Bundles and upsells block on a product page, under Add to cart and Buy now: quantity break tiers, the Breakfast set bundle with Add all to cart, and the Add an apron upsell with Add.", undefined, "product-page-offers-phone"),
      { type: "h", text: "Featured products, Product spotlight and Product hero" },
      { type: "p", text: "Storelib's Featured products section shows each product's offers on its card, under the price. Product spotlight and Product hero show their product's offers under the button. They show offers with Product page ticked under Show it on, at the same prices the cart and checkout charge, in the visitor's currency." },
      { type: "list", items: [
        "Quantity break: the tiers, with Add to cart under them. Picking a tier sets how many Add to cart puts in the cart.",
        "Bundle: the set and Add all to cart, which puts the whole set in the cart.",
        "Upsell: the product and Add.",
        "These sections have no option picker and no personalization fields. A product with options to pick, or one that asks for a required answer like a name to engrave, shows Choose options instead, which opens its page. The same goes for a set or an upsell with a product that asks for a required answer.",
        "The section's own button still opens checkout for one. A tier or a set goes in through Add to cart or Add all to cart.",
        "To hide them, turn off Show bundles and upsells in the section's settings.",
      ] },
      shot("featured-products-offers", "A Featured products section with three cards. The Speckled mug's card shows the tiers Buy 1, Buy 2 get 1 free and Buy 4, save 30% with Add to cart, the Breakfast set with Add all to cart, and the Add an apron upsell. The Serving bowl's card shows the Breakfast set and the apron upsell. The Linen apron's card shows none."),
      { type: "h", text: "On an imported theme" },
      { type: "p", text: "An imported theme gets a Bundles and upsells block of its own. It isn't placed for you: add it where you want offers to show." },
      { type: "steps", items: [
        "Open Website and the editor, and go to a product page, or the page with a Featured product section.",
        "In the sidebar, open the theme's product section or its Featured product section and press Add block.",
        "Choose Bundles and upsells. A section has one at most.",
        "Press the block to change its settings, then publish the website.",
      ] },
      { type: "p", text: "Its settings are Quantity breaks, Bundles and Upsells, to turn each kind off, and Bundle button and Upsell button for the buttons' words. Picking a tier sets the theme's own quantity box, and Add all to cart puts the set in the cart with the option picked in the theme's form. A theme whose product section takes no blocks from Add block has no place for it." },
      { type: "h", text: "Cart and checkout" },
      { type: "p", text: "The cart drawer, the cart page and the checkout have no offer settings. An offer shows there when Cart or Checkout is ticked under Show it on. The cart asks for the savings again each time it changes, and the checkout works them out again before payment." },
      { type: "h", text: "Sections that don't show offers" },
      { type: "list", items: [
        "Product grid, product list and carousel sections show a product's card, not its offers. Link the card to the product page, or use Featured products.",
        "A product page you built with your own section instead of the Product section shows no offers until you add a Product section.",
      ] },
    ],
  },
  {
    slug: "how-offers-are-priced",
    title: "How offers are priced: codes, currency and language",
    summary: "Which offer wins when two want the same item, how offers and discount codes add up, and what happens in another currency or language.",
    keywords: ["discount code", "coupon", "stack", "stacking", "combine", "currency", "convert", "language", "translate", "which offer", "priority", "order", "move up", "free shipping", "refund"],
    related: ["offers", "coupons", "offers-common-problems", "website-builder/sell-in-more-currencies"],
    body: [
      { type: "h", text: "One offer per item" },
      { type: "p", text: "An item in the cart gets one offer at most. When a bundle and a quantity break both want the same mug, the buyer gets whichever saves more on that mug, and a tie goes to the quantity break. A bundle takes the units the quantity break saves least on first, so the two meet only when they have to." },
      { type: "p", text: "Bundles apply before upsells, and among them, in the order of your list. Use Move up and Move down in an offer's menu to change it. An item an earlier offer took isn't discounted again." },
      { type: "h", text: "Offers and discount codes" },
      { type: "list", items: [
        "Discount codes can be used too is on for every new offer. The offer comes off first, and the code comes off what's left.",
        "Turn it off and a buyer with a code gets whichever saves more on the whole order: the code, or the offer. When the offer wins, checkout says the code can't be used with that offer, which already saves more on this order.",
        "Nothing ever takes an item below zero.",
      ] },
      shot("offer-bundle-editor", "The editor of the Breakfast set bundle: the Speckled mug and the Serving bowl ticked, 10% off, a preview of the set at $68.40 instead of $76.00, and under Dates and limits the Starts and Ends fields, Discounted sets per order, and the switches Discount codes can be used too and Active."),
      { type: "h", text: "Dates" },
      { type: "p", text: "Under Dates and limits, Starts and Ends are optional. Before the start an offer is Scheduled, after the end it's Ended: either way it neither shows nor applies. Turn an offer off from its menu without deleting it. Deleting stops it at once, and orders already placed keep their discount." },
      { type: "h", text: "Currency" },
      { type: "list", items: [
        "You type amounts in your store's currency, set in Settings.",
        "A visitor shopping in another currency sees the offer's prices converted, the same way the product prices are, and checkout charges what they saw.",
        "Change your store's currency and the fixed amounts in your offers are converted with it. An offer that was open while it changed won't save: Your store currency changed. Reload to see the converted prices.",
      ] },
      { type: "h", text: "Language" },
      { type: "p", text: "The words Storelib writes around an offer follow your website's language: This item, Together, Add all to cart, Add, a price each, the cart's suggestions and savings, and the checkout's Add to your order. A tier left without a label, like Buy 2 get 1 free, is said in the visitor's language too, with its amount in their currency." },
      { type: "p", text: "To change those words, open Translate (Settings > Languages & Currency, a language's menu, Review and edit). The product page, Featured products, Choose options and cart words are under Shop words, and the checkout's under Checkout." },
      { type: "p", text: "The words you type for an offer (its name, a tier's own label and its badge) are shown as you typed them, in every language. Write them in the language most of your buyers read. Button words you type in the Product section's Bundles and upsells block are translated with the rest of the page." },
      { type: "h", text: "On the order" },
      { type: "p", text: "Each order line keeps which offer saved what, by the name the checkout showed. The receipt and the order show those savings, and Upsells and bundles counts the units each offer sold in its Sold, 90 days column." },
    ],
  },
  {
    slug: "offers-common-problems",
    title: "Upsells and bundles: common problems and fixes",
    summary: "An offer that doesn't show, doesn't apply, or applies differently than you expected, and what to change.",
    keywords: ["not showing", "not working", "not applied", "missing", "offer gone", "wrong price", "discount missing", "upsell not showing", "bundle not showing", "quantity break not working", "troubleshoot", "fix"],
    related: ["offers", "offers-on-your-website", "how-offers-are-priced"],
    faq: true,
    body: [
      { type: "h", text: "Why doesn't my offer show on the product page?" },
      { type: "p", text: "Check four things. The offer is Active in the list, not Off, Scheduled or Ended. Product page is ticked under Show it on. Every product in it is published (the editor says when one is a draft). And the page uses Storelib's Product section with its Bundles and upsells block, and the block's toggle for that kind is on. On an imported theme, the block has to be added from Add block first." },
      { type: "h", text: "Why doesn't my upsell show on a product's page?" },
      { type: "p", text: "With Certain products or A collection, an upsell shows only on the pages of those products. It also never shows on the page of the product it offers. Choose Anything to show it on every product page." },
      { type: "h", text: "Why doesn't the upsell show in the cart?" },
      { type: "p", text: "The cart has to hold something else that brings it up, and the rest of the order has to reach your minimum. It also stops showing once its product is in the cart. Check that Cart is ticked under Show it on." },
      { type: "h", text: "Why does the cart show no savings in the builder?" },
      { type: "p", text: "The cart drawer asks for offers only on your live website. Open the published website, add the products, then open the cart." },
      { type: "h", text: "Why did the buyer pay full price for a bundle?" },
      { type: "p", text: "A bundle applies only to complete sets: one of each product in it. Two of the same product and none of the other is no set. Also check Discounted sets per order, and whether another offer saved more on those items." },
      { type: "h", text: "Why does my quantity break say a tier costs more per item?" },
      { type: "p", text: "A bigger tier is worse value than a smaller one: buyers who take more would pay more each. Raise the bigger tier's discount, or give it more free units, until its price per item is lower. The preview shows each tier's total." },
      { type: "h", text: "Why didn't a quantity break and a bundle both apply to the same item?" },
      { type: "p", text: "Each item gets one offer, the one that saves more on it. The editor warns you when a product is in two offers. To change which bundle or upsell goes first, use Move up and Move down." },
      { type: "h", text: "Why was a discount code refused?" },
      { type: "p", text: "The offer has Discount codes can be used too turned off, and it saves more than the code. Turn it on to let codes come off on top." },
      { type: "h", text: "Why does a list row say A product in it was deleted?" },
      { type: "p", text: "One of its products is gone from your store, so the offer can't apply. Open it, pick another product, and save." },
      { type: "h", text: "Why is there no Free shipping choice?" },
      { type: "p", text: "Free shipping is offered only where selling things that ship is available on Storelib. Use a percent or an amount instead." },
      { type: "h", text: "Why don't offers show on my home page's featured product?" },
      { type: "p", text: "Featured products, Product spotlight and Product hero show them when Show bundles and upsells is on in the section's settings and the offer has Product page ticked. Product grid, product list and carousel sections show only the card. On an imported theme, add the Bundles and upsells block to its Featured product section from Add block." },
      { type: "h", text: "Why won't my offer save after I changed the store currency?" },
      { type: "p", text: "It was open before the change. Reload the page to see the converted amounts, then edit it again." },
    ],
  },
]

export const OFFER_ARTICLES: HelpArticle[] = ARTICLES.map((a) => ({ updated: REVIEWED, ...a, category: "products", section: SECTION }))
