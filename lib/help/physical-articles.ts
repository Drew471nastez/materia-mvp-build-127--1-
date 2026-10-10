/**
 * ===========================================================================
 *  THE HELP CENTRE'S PHYSICAL PRODUCTS GUIDE
 * ===========================================================================
 * Every article about selling things that are posted or picked up: setting a
 * product up, stock, variants, who fulfils it, shipping profiles and rates,
 * local pickup, getting orders out, returns, tax and units. Shown only while
 * physical commerce is on in /admin (lib/platform/physical-commerce.ts): off,
 * the topic, its articles, its search results and its sitemap rows are gone
 * and its pages are not found, exactly like the feature itself.
 *
 * Written from the code, like every other article: the rate types are
 * lib/physical/rates.ts, pickup is lib/physical/pickup.ts, the order steps
 * are lib/physical/status.ts, the fulfilment answers are
 * lib/physical/fulfillment.ts. Figures are drawn by components/help/help-figures.
 */

import type { HelpArticle, HelpCategory } from "./articles"

export const PHYSICAL_CATEGORY: HelpCategory = {
  slug: "physical-products",
  title: "Physical products",
  description: "Selling things you post or hand over: stock, variants, shipping, pickup and getting orders out.",
  physical: true,
}

const C = PHYSICAL_CATEGORY.slug
const link = (slug: string, label: string) => `[${label}](/help/${C}/${slug})`

export const PHYSICAL_ARTICLES: HelpArticle[] = [
  /* ── The big picture ──────────────────────────────────────────────── */
  {
    slug: "how-physical-products-work",
    category: C,
    title: "How selling physical products works",
    summary: "The whole journey of a physical order, from the buyer pressing Pay to the parcel arriving, in six steps.",
    keywords: ["physical", "shipping", "merch", "t-shirt", "print", "post", "parcel", "stock", "overview", "start", "ecommerce"],
    body: [
      { type: "p", text: "A physical product is anything that has to reach the buyer in the real world: a t-shirt, a vinyl record, a printed book, a candle. Storelib handles the selling part. You handle (or a partner handles) the packing and posting." },
      { type: "figure", figure: "order-journey", caption: "What happens to one order, from left to right." },
      { type: "h", text: "The six steps of every order" },
      {
        type: "steps",
        items: [
          "The buyer picks a variant (like size M in black), adds it to their cart and goes to checkout.",
          "At checkout they enter their address. Storelib shows only the shipping options that work for that address and that cart. If you offer local pickup, they can choose Pick up instead.",
          "They pay. At that moment Storelib holds the stock for them, so nobody else can buy the last one while they pay.",
          "The order appears in Orders as Unfulfilled. You get an email. If a partner ships it, they get the order by email too.",
          "You pack it and press Mark as shipped, with the carrier and tracking number. The buyer gets an email with a Track package button.",
          "When it arrives you (or the buyer's tracking) mark it Delivered. Done.",
        ],
      },
      { type: "h", text: "The words you will see" },
      {
        type: "table",
        head: ["Word", "What it means"],
        rows: [
          ["Variant", "One version of a product, like Medium / Black. Each one has its own price, quantity and photo."],
          ["Inventory", "How many you have. Storelib counts it down with every sale."],
          ["Shipping profile", "A set of shipping prices. The General profile covers every product unless you make a custom one."],
          ["Zone", "A group of countries or states you charge the same for, like Europe or Alaska and Hawaii."],
          ["Rate", "A shipping option inside a zone, like Standard for $5 or Express for $15."],
          ["Fulfillment", "Getting the order to the buyer: packing and posting it, or a partner doing it for you."],
          ["Local pickup", "The buyer collects the order from you instead of it being posted."],
        ],
      },
      { type: "note", text: "Digital products and courses can share a cart with physical products. The download is ready at once and the physical part ships as normal." },
      { type: "p", text: `Ready to start? Go to ${link("create-a-physical-product", "Create a physical product")}.` },
    ],
  },

  /* ── Creating a product ───────────────────────────────────────────── */
  {
    slug: "create-a-physical-product",
    category: C,
    title: "Create a physical product, step by step",
    summary: "From an empty product to one people can buy and you can ship, in about five minutes.",
    keywords: ["new product", "add product", "physical product", "setup", "weight", "publish", "merch"],
    body: [
      { type: "p", text: "Before your first physical product, set where you ship once. It takes two minutes: see " + link("shipping-profiles-zones-and-rates", "Shipping profiles, zones and rates") + ". Without at least one rate, buyers can't check out." },
      { type: "figure", figure: "product-type", caption: "Choose Physical when you make a new product." },
      {
        type: "steps",
        items: [
          "Open Products and press New product.",
          "Choose Physical.",
          "Add a title, photos and a description, just like any other product.",
          "Set the price. If every variant costs the same, this is the price of all of them.",
          "In Inventory, leave Track inventory on and type how many you have.",
          "If it comes in sizes or colors, open Variants and add options. See " + link("variants-and-options", "Variants and options") + ".",
          "In Shipping, type the weight with its packaging. Leave the shipping profile on General unless this product ships differently.",
          "In Fulfillment, choose who ships it. Most people pick I'll ship it myself.",
          "Press Publish.",
        ],
      },
      { type: "figure", figure: "product-cards", caption: "The cards a physical product has, from top to bottom." },
      { type: "h", text: "What you can leave for later" },
      { type: "p", text: "Everything under Advanced is optional: SKU and barcode, cost per item (to see your margin), package size, country of origin and HS code for customs, tax category, brand and tags. Storelib gives every product and variant its own ID, so a SKU is never required." },
      { type: "note", text: "The weight matters if any of your rates are based on weight. If you leave it empty, weight based rates treat the product as weighing nothing." },
    ],
  },

  /* ── Inventory ────────────────────────────────────────────────────── */
  {
    slug: "inventory-and-stock",
    category: C,
    title: "Inventory: how Storelib counts your stock",
    summary: "Tracking quantity, why you can never oversell, keeping selling when out of stock, and low stock emails.",
    keywords: ["stock", "inventory", "quantity", "oversell", "sold out", "out of stock", "low stock", "alert", "backorder", "count"],
    body: [
      { type: "p", text: "With Track inventory on, every product has a quantity. A simple product has one number. A product with variants has one number per variant, because you might have 10 black mediums and 0 white smalls." },
      { type: "figure", figure: "inventory-card", caption: "The Inventory card on a simple product." },
      { type: "h", text: "What happens to the number" },
      {
        type: "table",
        head: ["When", "What changes"],
        rows: [
          ["A buyer starts paying", "The items are held for them for about 35 minutes. Nobody else can buy them in that time."],
          ["They pay", "The held items stay taken. Available goes down for good."],
          ["They leave without paying", "The hold ends and the items are back on sale."],
          ["You mark the order shipped", "The items leave your shelf: on hand goes down."],
          ["You cancel an unshipped order", "The items go back on sale."],
          ["A return arrives and you restock it", "On hand goes back up."],
        ],
      },
      { type: "p", text: "So you never sell more than you have, even if two people press Pay for the last one at the same second. One of them gets it; the other is told how many are left." },
      { type: "h", text: "Sold out, and keeping selling" },
      { type: "p", text: "When a variant reaches 0 it shows as Sold out and can't be added to a cart. If you would rather take orders anyway and ship later, turn on Keep selling when out of stock. Then the number can go below 0, which tells you how many you owe." },
      { type: "h", text: "Low stock emails" },
      { type: "figure", figure: "low-stock-email", caption: "The email you get when something sells down to its low stock line." },
      {
        type: "steps",
        items: [
          "In the product's Inventory card, set Low stock alert, for example 5. Leave it empty to use your shop's line (5 unless you change it).",
          "In Settings > Shipping > Advanced, keep Email me when stock runs low on.",
          "After a sale that brings a variant to 5 or fewer, you get one email listing everything that is low. At most one a day for the same items.",
        ],
      },
      { type: "h", text: "The Inventory page" },
      { type: "p", text: "Inventory in the sidebar lists every physical variant with what is on hand, held for orders and available. Use the Low stock and Out of stock views to see what to reorder. Adjust a number there and the change is written in that variant's history, with the reason." },
    ],
  },

  /* ── Variants ─────────────────────────────────────────────────────── */
  {
    slug: "variants-and-options",
    category: C,
    title: "Variants and options: sizes, colors, materials",
    summary: "Add up to three options and Storelib makes every combination for you, each with its own price, quantity, photo and weight.",
    keywords: ["variant", "variants", "option", "size", "color", "colour", "material", "combination", "sku", "photo per variant"],
    body: [
      { type: "p", text: "An option is a choice the buyer makes, like Size. Its values are the answers, like S, M and L. Add a second option, like Color with Black and White, and Storelib makes every combination: S / Black, S / White, M / Black and so on. Each combination is a variant." },
      { type: "figure", figure: "variants", caption: "Two options make six variants, each a row you can fill in." },
      {
        type: "steps",
        items: [
          "In the Variants card, press Add options like size or color.",
          "Type the option name, like Size.",
          "Type a value and press Enter. Repeat for each value.",
          "Add another option if you need one. Up to three: for example Size, Color and Material.",
          "Fill in the table: price, quantity and, if you want, a SKU.",
          "Press the small square on the left of a row to give that variant its own photo, from the product's photos or a new upload.",
          "Press the arrow at the end of a row for weight, compare-at price, cost, barcode, who fulfils it and whether it is on sale.",
        ],
      },
      { type: "h", text: "Good to know" },
      {
        type: "list",
        items: [
          "A price left empty uses the product's price.",
          "A weight left empty uses the product's weight. Set it when, say, the XL weighs more.",
          "Turn On sale off to stop selling one variant without deleting it. It disappears from the product page.",
          "Removing a value removes its variants. A variant somebody already bought is kept, hidden, so their order still makes sense.",
          "The product page shows the cheapest variant's price until the buyer picks one.",
          "Up to 250 variants per product.",
        ],
      },
    ],
  },

  /* ── Fulfillment ──────────────────────────────────────────────────── */
  {
    slug: "fulfillment-methods",
    category: C,
    title: "Who ships it: the four fulfillment methods",
    summary: "Ship it yourself, use a warehouse or 3PL, a dropshipping supplier or print on demand, per product or even per variant.",
    keywords: ["fulfillment", "fulfilment", "3pl", "warehouse", "dropshipping", "dropship", "supplier", "print on demand", "pod", "printful", "printify", "gelato"],
    body: [
      { type: "p", text: "Every physical product answers one question: How will this product be fulfilled? You can answer differently for different products, and even for different variants of one product." },
      { type: "figure", figure: "fulfillment", caption: "The Fulfillment card. Pick one answer." },
      {
        type: "table",
        head: ["Answer", "Who packs and posts", "What you do after a sale"],
        rows: [
          ["I'll ship it myself", "You", "Pack it, press Mark as shipped, add tracking."],
          ["A fulfillment center (3PL)", "Your fulfillment center", "Nothing, if they receive orders by email. Add their tracking when they send it."],
          ["A supplier or manufacturer", "Your supplier or manufacturer", "Nothing, if the supplier receives orders by email. Add their tracking when they send it."],
          ["Print on demand", "Your print partner", "Nothing, if the partner receives orders by email. Add their tracking when they send it."],
        ],
      },
      { type: "h", text: "Setting up a partner" },
      {
        type: "steps",
        items: [
          "Choose A fulfillment center (3PL), A supplier or manufacturer, or Print on demand.",
          "Press New, type the partner's name and the email address they want orders sent to.",
          "Save the product. From now on every paid order with this product is emailed to that address, with the items, quantities, SKUs and the buyer's address.",
        ],
      },
      { type: "note", text: "Direct connections to Printful, Printify, Gelato, CJ Dropshipping, ShipStation, Shippo and EasyPost are not available yet. You can save a key in Settings > Shipping > Advanced > Integrations so you are ready, but no orders are sent to those services. Until then, use the email address your partner gives you, or pass orders on yourself." },
      { type: "h", text: "Orders that mix methods" },
      { type: "figure", figure: "split-order", caption: "One order, two senders: each part is shipped and tracked on its own." },
      { type: "p", text: "If one order has a hoodie you print on demand and stickers you post yourself, the order page splits it into two groups. Each group gets its own Mark as shipped and its own tracking, and the buyer gets an email for each parcel. The order shows Partially shipped until both are out." },
    ],
  },

  /* ── Shipping profiles, zones, rates ──────────────────────────────── */
  {
    slug: "shipping-profiles-zones-and-rates",
    category: C,
    title: "Shipping profiles, zones and rates",
    summary: "Where you ship and what it costs, set once in Settings > Shipping. One General profile covers every product.",
    keywords: ["shipping", "postage", "delivery", "rates", "zone", "zones", "profile", "countries", "international", "express", "standard", "free shipping", "states"],
    body: [
      { type: "p", text: "Shipping in Storelib is three boxes inside each other. A profile holds zones. A zone holds rates." },
      { type: "figure", figure: "profiles", caption: "Profiles hold zones, zones hold rates." },
      {
        type: "table",
        head: ["Box", "What it is", "Example"],
        rows: [
          ["Profile", "Which products these prices are for", "General (every product), or Heavy items (only the products you pick)"],
          ["Zone", "Where these prices apply", "United States; Europe; Alaska and Hawaii; Rest of world"],
          ["Rate", "An option the buyer can pick, its price and how long it takes", "Standard, $5, 3 to 5 business days"],
        ],
      },
      { type: "h", text: "Set up your General profile" },
      {
        type: "steps",
        items: [
          "Open Settings and choose the Shipping tab.",
          "Under Units, choose Metric (kg) or Imperial (lb).",
          "In the General profile, press Add shipping zone.",
          "Pick the countries. For the United States, Canada or Australia you can pick only some states or provinces instead.",
          "Press Add zone, then Add rate.",
          "Give the rate the name buyers will see, like Standard, choose its type and price, and type how many business days it takes.",
          "Add an Express rate the same way if you want to offer one.",
          "Add a Rest of world zone if you ship everywhere else too.",
        ],
      },
      { type: "figure", figure: "zone-rates", caption: "A zone with two rates, as the settings show it." },
      { type: "h", text: "The rate types" },
      {
        type: "table",
        head: ["Type", "How the price is worked out", "Example"],
        rows: [
          ["Flat rate", "Always the same price", "$5 for any order"],
          ["Free shipping", "Free, always or from an order value", "Free on orders over $50"],
          ["Based on order price", "Steps by how much the order costs", "$0 to $25: $6. From $25: $3. From $75: free"],
          ["Based on order weight", "Steps by the order's total weight", "0 to 1 kg: $5. From 1 kg: $9. From 5 kg: $15"],
          ["Based on item weight", "Each item priced by its own weight, then added up", "Items up to 0.5 kg: $2 each. From 0.5 kg: $4 each"],
        ],
      },
      { type: "p", text: `There are worked examples with real numbers in ${link("shipping-rate-examples", "Shipping rate examples")}.` },
      { type: "h", text: "Custom profiles" },
      { type: "p", text: "Make a custom profile when some products ship differently, like a heavy lamp next to light prints. Press Custom shipping profile, give it zones and rates, then open each of those products and choose that profile in its Shipping card. Every other product keeps using General." },
      { type: "h", text: "When nothing ships to an address" },
      { type: "p", text: "If a buyer's address is in no zone, or the cart doesn't qualify for any rate (for example it is heavier than your last step allows), the checkout says Shipping isn't available to that country and Pay stays off. If you offer local pickup, the buyer can choose that instead. Nobody can pay for shipping you don't offer." },
    ],
  },
  {
    slug: "shipping-rate-examples",
    category: C,
    title: "Shipping rate examples, with real numbers",
    summary: "Five common setups worked through, so you can see exactly what a buyer would pay.",
    keywords: ["shipping examples", "rate examples", "weight based", "price based", "item weight", "free shipping threshold", "calculate shipping"],
    body: [
      { type: "h", text: "1. One price for everything" },
      { type: "p", text: "Rate: Standard, Flat rate, $5. A buyer orders three t-shirts: shipping is $5. One t-shirt: still $5." },
      { type: "h", text: "2. Free over $50" },
      { type: "p", text: "Rate: Standard, Flat rate, $5, Free over $50. An order of $42 pays $5. An order of $58 pays nothing. Or use a separate Free shipping rate with Only on orders over $50 next to a Standard rate: under $50 the buyer only sees Standard; over $50 they see both, and the free one is listed first." },
      { type: "h", text: "3. Bigger orders pay less" },
      { type: "figure", figure: "tiers", caption: "Steps of a rate based on order price." },
      { type: "p", text: "Rate: Standard, Based on order price. Steps: from $0, $8. From $30, $4. From $80, $0. An order of $25 pays $8, $45 pays $4, $95 pays nothing. Each order pays the price of the last step it reaches." },
      { type: "h", text: "4. Heavier orders pay more" },
      { type: "p", text: "Rate: Standard, Based on order weight. Steps: from 0 kg, $5. From 2 kg, $9. From 10 kg, $20. Not offered above 30 kg. Two books of 0.6 kg each weigh 1.2 kg: $5. Ten books, 6 kg: $9. Fifty books, 30 kg: $20. Sixty books, 36 kg: shipping isn't available, so the buyer has to order fewer." },
      { type: "h", text: "5. Every item priced by its own weight" },
      { type: "p", text: "Rate: Standard, Based on item weight. Steps: from 0 kg, $2. From 1 kg, $6. A cart with three 0.2 kg pins and one 1.5 kg hoodie pays 3 times $2 plus 1 times $6, so $12." },
      { type: "note", text: "Weights come from the product's Shipping card, or the variant's own weight when it has one. Prices are after any discount code, so free over $50 means the buyer actually pays $50 or more." },
    ],
  },

  /* ── Local pickup ─────────────────────────────────────────────────── */
  {
    slug: "local-pickup",
    category: C,
    title: "Local pickup",
    summary: "Let buyers collect their order from your studio, shop or home instead of paying for shipping.",
    keywords: ["pickup", "pick up", "collect", "collection", "click and collect", "in person", "local", "store pickup"],
    body: [
      { type: "p", text: "Local pickup lets a buyer choose Pick up at checkout. They pay nothing for delivery, give no address, and you email them when the order is ready." },
      { type: "figure", figure: "pickup-settings", caption: "Turn pickup on for a location in Settings." },
      {
        type: "steps",
        items: [
          "Open Settings > Shipping > Locations and pickup.",
          "Edit your location (or add one). Make sure it has the street, city and country.",
          "Turn on Offer local pickup here.",
          "Choose Usually ready in, for example 24 hours.",
          "Write your pickup instructions: opening times, which door, what to bring.",
          "Save.",
        ],
      },
      { type: "h", text: "What the buyer sees" },
      { type: "figure", figure: "checkout-pickup", caption: "At checkout the buyer chooses Ship or Pick up." },
      { type: "p", text: "At checkout they see Ship and Pick up. Choosing Pick up shows your location, the address, when it is usually ready and your instructions. They only enter their name and email." },
      { type: "h", text: "When Pick up is offered" },
      {
        type: "list",
        items: [
          "Only for items you ship yourself. A print on demand or dropshipped item never passes through your hands, so a cart with one can't be picked up.",
          "Only when that location has enough stock of everything in the cart (or the items aren't tracked).",
          "Tax, if you charge it, is worked out for the pickup location's country and state.",
        ],
      },
      { type: "h", text: "Handing it over" },
      {
        type: "steps",
        items: [
          "Get the order ready and press Mark ready for pickup on the order. The buyer gets an email with your address and instructions.",
          "When they collect it, press Mark picked up. The order is done.",
        ],
      },
    ],
  },

  /* ── Orders ───────────────────────────────────────────────────────── */
  {
    slug: "ship-your-orders",
    category: C,
    title: "Ship your orders: Unfulfilled, Processing, Shipped, Delivered",
    summary: "What each order status means, how to add tracking, send part of an order, print a packing slip and cancel.",
    keywords: ["fulfil", "fulfill", "ship order", "tracking", "tracking number", "carrier", "mark as shipped", "delivered", "processing", "packing slip", "partial", "split"],
    body: [
      { type: "figure", figure: "order-steps", caption: "Every physical order moves through four steps." },
      {
        type: "table",
        head: ["Status", "What it means", "How it gets there"],
        rows: [
          ["Unfulfilled", "Paid, nothing sent yet", "Automatically, when the buyer pays"],
          ["Processing", "You are working on it", "You press Mark as processing (optional)"],
          ["Shipped", "Everything has been sent", "You press Mark as shipped for every part"],
          ["Partially shipped", "Some parts sent, some not", "You shipped one part of a split order"],
          ["Delivered", "Every parcel arrived", "You press Mark delivered on each shipment"],
        ],
      },
      { type: "p", text: "For pickup orders the same steps read Ready for pickup and Picked up." },
      { type: "h", text: "Mark an order as shipped" },
      { type: "figure", figure: "mark-shipped", caption: "Add the carrier and tracking number when you ship." },
      {
        type: "steps",
        items: [
          "Open Orders and the order.",
          "Press Packing slip if you want a printed list of what goes in the box.",
          "Press Mark as shipped.",
          "Check the quantities. Lower one to send only part now.",
          "Pick the carrier and type the tracking number. For carriers Storelib knows (USPS, UPS, FedEx, DHL, Royal Mail, DPD, GLS and more) the tracking link is made for you. For Other, paste the link.",
          "Keep Email the buyer on, and press Mark as shipped.",
        ],
      },
      { type: "h", text: "Sending an order in several parcels" },
      { type: "p", text: "Ship what you have now and leave the rest. The order stays Partially shipped, with what is left listed on top. Ship the rest later the same way. Each parcel has its own tracking and its own email to the buyer." },
      { type: "h", text: "After it is sent" },
      {
        type: "list",
        items: [
          "Add or fix tracking later with Edit tracking.",
          "Press In transit and then Mark delivered as the parcel moves. The buyer is emailed when it is delivered.",
          "Cancel shipment if it never left: its items go back to unfulfilled and back in stock.",
        ],
      },
      { type: "h", text: "Cancelling an order" },
      { type: "p", text: "Before anything ships, press Cancel order. The stock goes back on sale. The money is not refunded automatically: press Refund at the top of the order to give it back." },
    ],
  },
  {
    slug: "returns-physical",
    category: C,
    title: "Returns and refunds for physical orders",
    summary: "How buyers ask for a return, how you approve it, put items back in stock and refund.",
    keywords: ["return", "returns", "refund", "exchange", "send back", "restock", "damaged"],
    body: [
      { type: "p", text: "Returns are on by default with a 30 day window from shipping. Change it, or turn returns off, in Settings > Shipping > Advanced." },
      {
        type: "steps",
        items: [
          "The buyer opens their order page (the link is in every order email) and presses Return items. They choose what, how many and why.",
          "You get the request on the order. Approve it or decline it. The buyer is emailed either way.",
          "When the parcel comes back, press Received. Choose which items go back in stock; damaged ones can stay out.",
          "Refund with the Refund button at the top of the order, all of it or part of it.",
          "Close the return.",
        ],
      },
      { type: "p", text: "You can also open a return yourself from the order, for example after a phone call." },
    ],
  },

  /* ── Taxes ────────────────────────────────────────────────────────── */
  {
    slug: "taxes",
    category: C,
    title: "Taxes: how Storelib charges tax on your orders",
    summary: "Add a tax region for each place you have to charge tax, choose whether prices include it, and see exactly what a buyer pays.",
    keywords: ["tax", "taxes", "vat", "sales tax", "gst", "hst", "tax region", "tax rate", "tax inclusive", "prices include tax", "tax on shipping", "reduced rate", "tax exempt", "eu vat", "oss"],
    body: [
      { type: "p", text: "Storelib charges the tax you set and nothing else. There are no rates switched on for you and nothing is guessed from where you live, because what you owe depends on where you are registered, and only you and your accountant know that." },
      { type: "p", text: "So the setup is small: you tell Storelib where you collect tax and at what rate, and checkout does the maths for every order." },
      { type: "h", text: "Set it up" },
      {
        type: "steps",
        items: [
          "Open Settings > Taxes.",
          "Turn on Charge tax. While it is off, buyers pay your prices and nothing more.",
          "Choose Added on top or Included. Added on top is how the US and Canada show prices. Included is how most of Europe, the UK and Australia show them.",
          "Under Tax regions, press Add region. Pick the country, a state or province if the rate is different there, the rate, and the name receipts use (VAT, GST, Sales tax).",
          "Repeat for every place where you are registered to collect tax.",
          "If delivery is taxed where you sell, turn on Charge tax on shipping.",
        ],
      },
      { type: "h", text: "Which rate a buyer pays" },
      { type: "p", text: "At checkout Storelib reads the buyer's shipping address and looks for a region in this order:" },
      {
        type: "list",
        items: [
          "A region for their state or province, if you made one. California, CA and the full name are treated as the same place.",
          "Otherwise the region for their whole country.",
          "Otherwise no tax at all. A buyer in a country you have no region for pays no tax.",
        ],
      },
      { type: "p", text: "Inside that region, a product with its own rate there uses its own rate. Every other product uses the region's rate." },
      { type: "h", text: "Added on top or included" },
      {
        type: "table",
        head: ["Setting", "Price", "Rate", "Buyer pays", "Tax on the receipt"],
        rows: [
          ["Added on top", "$100.00", "8%", "$108.00", "$8.00"],
          ["Included", "€100.00", "19%", "€100.00", "€15.97"],
        ],
      },
      { type: "p", text: "With Included the total never moves. Storelib works out the part of the price that was tax (100 minus 100 divided by 1.19) and shows it on the receipt." },
      { type: "h", text: "A worked example" },
      { type: "p", text: "A store in Germany with prices included, a Germany region at 19% VAT, a reduced 7% rate on one book, and Charge tax on shipping on. A buyer in Berlin orders a €30 hoodie and that €20 book, with €5 delivery:" },
      {
        type: "table",
        head: ["Line", "Amount", "Rate", "Tax inside"],
        rows: [
          ["Hoodie", "€30.00", "19%", "€4.79"],
          ["Book", "€20.00", "7%", "€1.31"],
          ["Delivery", "€5.00", "19%", "€0.80"],
          ["Total", "€55.00", "", "€6.90"],
        ],
      },
      { type: "p", text: "The buyer pays €55.00. The order and the receipt show €6.90 of VAT. Delivery always uses the region's rate, never a product's own rate." },
      { type: "h", text: "Different rates for some products" },
      {
        type: "steps",
        items: [
          "Open Settings > Taxes and open the region.",
          "Under Product rates, choose the product and type its rate, for example 5% for books.",
          "Save. It applies only in that region. Delete the region or the product and its rate goes with it.",
        ],
      },
      { type: "p", text: "A product that should never be taxed, like a gift card in most places: open the product, Advanced, and turn off Charge tax on this product." },
      { type: "h", text: "Discounts, free shipping and tips" },
      {
        type: "list",
        items: [
          "A discount code comes off before tax, so tax is worked out on what the buyer actually pays.",
          "Free shipping means there is no delivery to tax.",
          "A tip is never taxed.",
        ],
      },
      { type: "h", text: "Digital products in the same store" },
      { type: "p", text: "Downloads, courses and memberships are not taxed unless you turn on Charge tax on digital products. A digital sale has no shipping address, so it uses the buyer's country, and only country regions apply to it, never a state's." },
      { type: "note", text: "In the EU, VAT on digital sales is charged at the rate of the buyer's country, not yours. If you sell digital products to EU buyers, add a region for each EU country you sell to, with that country's rate." },
      { type: "h", text: "Where tax shows up" },
      {
        type: "list",
        items: [
          "Checkout shows the tax line before the buyer pays, worked out from the address they typed.",
          "The order page in Orders shows the tax and the rate that was used.",
          "The order confirmation email and the buyer's order page show it too, and Analytics counts the tax you collected.",
          "Changing a rate later never changes orders already paid. They keep the tax they were charged.",
        ],
      },
      { type: "h", text: "Registrations and exemptions" },
      { type: "p", text: "A region is your registration in practice: add one only where you are registered or required to collect. Storelib does not file or pay tax for you, and it does not check registration numbers. Keep your numbers with your accountant and on your invoices." },
      { type: "p", text: "Selling to a business that is exempt, or that handles VAT itself under the reverse charge: Storelib does not take tax IDs at checkout yet. For now, refund the tax part from the order when that happens." },
      { type: "h", text: "When something looks wrong" },
      {
        type: "table",
        head: ["What you see", "Why", "What to do"],
        rows: [
          ["No tax at checkout", "Charge tax is off, or the buyer's country has no region.", "Turn on Charge tax and add a region for that country."],
          ["Tax on top when your prices already include it", "The store is set to Added on top.", "Switch to Included."],
          ["Shipping is not taxed", "Charge tax on shipping is off.", "Turn it on if delivery is taxed where you sell."],
          ["A state pays the country rate", "There is no region for that state.", "Add the state as its own region."],
          ["One product has no tax", "Charge tax on this product is off in its Advanced settings.", "Turn it back on."],
          ["Digital products have no tax", "Charge tax on digital products is off.", "Turn it on and add the countries you sell to."],
        ],
      },
      { type: "note", text: "Automatic rates from a tax service are not available yet. Rates change, so check yours once a year." },
    ],
  },

  /* ── Units ────────────────────────────────────────────────────────── */
  {
    slug: "tax-and-units",
    category: C,
    title: "Units for physical products: kilograms or pounds",
    summary: "Pick metric or imperial for weights and sizes. Tax has its own guide.",
    keywords: ["units", "kg", "lb", "pounds", "kilograms", "metric", "imperial", "inches", "weight"],
    body: [
      { type: "h", text: "Units" },
      { type: "p", text: "In Settings > Shipping, choose Metric (kg, cm) or Imperial (lb, in). New products and weight based rates are typed in that system. A product can still use another unit: its weight card has its own unit picker." },
      { type: "h", text: "Tax" },
      { type: "p", text: `Tax has its own guide now: ${link("taxes", "Taxes: how Storelib charges tax on your orders")}.` },
    ],
  },

  /* ── Selling more ─────────────────────────────────────────────────── */
  {
    slug: "upsells-and-bundles",
    category: C,
    title: "Upsells and bundles: sell more to people already buying",
    summary: "Bundle products at a better price on their pages, and suggest one more thing in the checkout.",
    keywords: ["upsell", "bundle", "cross sell", "order bump", "frequently bought together", "add on", "offer", "aov", "average order"],
    body: [
      { type: "p", text: "Someone already buying from you is the easiest person to sell one more thing to. Storelib gives you two ways, under Products, Upsells and bundles." },
      { type: "table", head: ["", "Bundle", "Checkout offer"], rows: [
        ["What it is", "Two to five products bought together", "One product suggested before they pay"],
        ["Where buyers see it", "Under the buy box on each of its products", "In the checkout, under their order"],
        ["The discount", "A percent off every item in the set, or an amount off the whole set", "A percent or amount off one of it"],
        ["When it applies", "For every complete set in the cart", "When the cart has something else, or one of the products you choose"],
      ] },
      { type: "h", text: "Make a bundle" },
      { type: "steps", items: [
        "Press Create offer and choose Bundle.",
        "Give it a name buyers will see, like Breakfast set.",
        "Tick two to five products.",
        "Choose the discount: Percent, Amount or None. The preview shows what the set costs buyers.",
        "Save. It's on each product's page straight away, with Add all to cart.",
      ] },
      { type: "h", text: "Make a checkout offer" },
      { type: "steps", items: [
        "Press Create offer and choose Checkout offer.",
        "Name it, like Add a candle, and pick the one product to offer.",
        "Choose Any order, or The cart has certain products and tick them. A candle offer that only shows to people buying honey reads like a good idea, not an ad.",
        "Choose the discount and save.",
      ] },
      { type: "p", text: "Switch any offer off from the list without deleting it. The checkout works the saving out by itself, before any discount code, and the code then comes off what's left. A buyer's Discount line shows each offer's saving by name." },
      { type: "note", text: "Offers work in the cart checkout, so they're here while physical products are on. A digital product can be in a bundle or offered at checkout too, as long as it's bought through the cart." },
    ],
  },

  /* ── FAQ ──────────────────────────────────────────────────────────── */
  {
    slug: "physical-products-questions",
    category: C,
    title: "Physical products: common questions",
    summary: "Quick answers when a buyer can't check out, stock looks wrong or an email didn't arrive.",
    keywords: ["faq", "problem", "not working", "can't checkout", "shipping unavailable", "stock wrong", "help"],
    body: [
      { type: "h", text: "A buyer says shipping isn't available" },
      { type: "p", text: "Their address is in no zone of the product's profile, or the cart doesn't fit any rate (too heavy, too expensive or too cheap for your steps). Add the country to a zone, or a Rest of world zone, or widen the steps." },
      { type: "h", text: "The quantity looks lower than what I have" },
      { type: "p", text: "Open Inventory. Available is on hand minus what is held for unpaid checkouts and unshipped orders. A checkout left unpaid gives its items back within the hour. Ship the open orders and on hand and available line up again." },
      { type: "h", text: "My supplier didn't get the order" },
      { type: "p", text: "Open the product, Fulfillment, and check the partner has an email address under Change. The order's history shows Order emailed to, or a note telling you to send it yourself." },
      { type: "h", text: "Can I sell a product without counting stock?" },
      { type: "p", text: "Yes. Turn off Track inventory. It can always be bought, which suits print on demand." },
      { type: "h", text: "Can a buyer get one item posted and pick another up?" },
      { type: "p", text: "Not in one order. They choose Ship or Pick up for the whole cart." },
      { type: "h", text: "Where did all this go?" },
      { type: "p", text: "Physical products can be switched off for all of Storelib. When they are, these settings and pages are hidden, nothing you set up is deleted, and it all comes back when they are on." },
    ],
  },
]
