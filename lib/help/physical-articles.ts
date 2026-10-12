/**
 * ===========================================================================
 *  THE HELP CENTRE'S PHYSICAL PRODUCTS GUIDE
 * ===========================================================================
 * Every article about selling things that are posted or picked up, in the
 * groups of PHYSICAL_SECTIONS, read top to bottom like a book: start, set up
 * the store, add products, set shipping, stock, tax, then orders, returns,
 * emails, the website and getting paid. Shown only while physical commerce
 * is on in /admin (lib/platform/physical-commerce.ts): off, the topic, its
 * articles, its search results and its sitemap rows are gone and its pages
 * are not found, exactly like the feature itself.
 *
 * WRITTEN FOR SOMEBODY DOING IT FOR THE FIRST TIME. Short sentences, one
 * thing per step, the words on the button in the step, what happens after
 * it, and the mistakes people actually make. Written from the code, like
 * every other article, and checked against it on the day in REVIEWED:
 *
 *   Store details        components/app/settings/store-details-panel.tsx
 *   Checkout             components/app/settings/checkout-panel.tsx
 *   Sales channels       components/app/settings/channels-panel.tsx
 *   Taxes                components/app/settings/taxes-panel.tsx
 *   Shipping, locations, components/physical/shipping-settings.tsx,
 *   low stock, returns   lib/physical/rates.ts (zones, rate types), pickup.ts
 *   The product          components/physical/product-cards.tsx
 *   The order            components/physical/order-panel.tsx and
 *                        app/app/orders/order-detail.tsx (Refund)
 *   Tracking             lib/physical/carriers.ts, partner-server.ts, the
 *                        buyer's order page and /checkout/track
 *   Emails               lib/emails/customer-catalog.ts
 *   Integrations         lib/integrations/catalog.ts, lib/physical/providers
 *
 * Where a screen is described, it is described by what it does and what its
 * main buttons say, so a small change to a screen does not make an article
 * wrong.
 *
 * Pictures: `shot()` blocks are screenshots of the real components with
 * made up demo data, taken by scripts/help-shots.mjs (see
 * lib/help/physical-shots.ts). A shot that also has a "-phone" picture is
 * shown as that on a narrow screen. `figure` blocks are diagrams of an idea
 * (an order's journey, boxes inside boxes), never a drawing of a screen.
 */

import type { HelpArticle, HelpBlock, HelpCategory } from "./articles"
import { PHYSICAL_SHOTS } from "./physical-shots"

export const PHYSICAL_CATEGORY: HelpCategory = {
  slug: "physical-products",
  title: "Physical products",
  description: "Sell things you post or hand over: set up your store, shipping, stock and tax, then ship orders, handle returns and get paid.",
  physical: true,
}

/** The day every article below was last checked against the product. */
const REVIEWED = "2026-10-11"

/** The groups of the guide, in reading order. Every article names one. */
export const PHYSICAL_SECTIONS = [
  "Getting started",
  "Set up your store",
  "Products",
  "Shipping and delivery",
  "Locations and inventory",
  "Taxes",
  "Orders and tracking",
  "Returns and refunds",
  "Customer emails",
  "Website and integrations",
  "Payouts, fees and policies",
] as const
export type PhysicalSection = (typeof PHYSICAL_SECTIONS)[number]

const C = PHYSICAL_CATEGORY.slug
const link = (slug: string, label: string) => `[${label}](/help/${C}/${slug})`

type ShotName = keyof typeof PHYSICAL_SHOTS
/** A screenshot from public/help/physical/, at its real size, with its phone picture when there is one. */
function shot(name: ShotName, alt: string, caption?: string): HelpBlock {
  const [width, height] = PHYSICAL_SHOTS[name]
  const phoneName = `${name}-phone`
  const phoneSize = (PHYSICAL_SHOTS as Record<string, readonly [number, number]>)[phoneName]
  const phone = phoneSize ? { src: `/help/physical/${phoneName}.webp`, width: phoneSize[0], height: phoneSize[1] } : undefined
  return { type: "image", src: `/help/physical/${name}.webp`, alt, caption, width, height, ...(phone ? { phone } : {}) }
}

type Article = Omit<HelpArticle, "category" | "section"> & { section: PhysicalSection }

const ARTICLES: Article[] = [
  /* ── Getting started ──────────────────────────────────────────────── */
  {
    section: "Getting started",
    slug: "zero-to-100",
    title: "Zero to 100: start selling physical products on Storelib",
    summary: "Everything from an empty account to your first parcel in the post, in order. Nine steps, about an hour in all.",
    keywords: ["start", "getting started", "first sale", "setup", "checklist", "beginner", "guide", "how to sell", "launch", "merch", "physical", "online store", "ecommerce"],
    related: ["how-physical-products-work", "store-details", "shipping-profiles-zones-and-rates", "ship-your-orders"],
    body: [
      { type: "p", text: "This is the whole journey on one page. Do the steps in this order. Each takes a few minutes, and each links to a longer article if you get stuck." },
      { type: "note", text: "Short on time? Steps 1 to 4 are the ones you can't skip. Without them, buyers can't pay you or can't check out." },

      { type: "h", text: "Step 1. Set up payments" },
      { type: "p", text: "Do this first. Checkout stays closed until payments are on." },
      {
        type: "steps",
        items: [
          "Open Payouts in the dashboard menu.",
          "Press Set up payments.",
          "Fill in your name, your details and your bank account. Have your ID ready in case you're asked for a photo of it.",
          "Wait for the green light. Payouts says when payments are on, and we email you too.",
        ],
      },
      { type: "p", text: `More help: ${link("physical-payouts", "Getting paid for physical orders")}.` },

      { type: "h", text: "Step 2. Say who ships your orders" },
      {
        type: "steps",
        items: [
          "Open Settings from the menu under your profile picture.",
          "Choose Shipping and delivery.",
          "The first time, Storelib asks How do you fulfil your physical orders? Pick the answer that fits. Most people pick I ship orders myself.",
          "Press Continue. Storelib makes your first location to match.",
        ],
      },
      shot("fulfil-question", "The question How do you fulfil your physical orders, with seven answers such as I ship orders myself and Print on demand.", "The first thing Shipping and delivery asks."),

      { type: "h", text: "Step 3. Set your shipping prices" },
      { type: "p", text: "Buyers can't check out until there's a shipping price for their address. Set at least one." },
      {
        type: "steps",
        items: [
          "Still in Shipping and delivery, find the General profile.",
          "Press Add shipping zone, pick the countries you ship to and save the zone.",
          "Press Add rate inside that zone. Name it Standard, pick Flat rate and type a price.",
          "Type the delivery time in business days, for example 3 to 5.",
          "Ship everywhere else too? Add another zone and turn on Rest of world.",
        ],
      },
      { type: "p", text: `More help: ${link("shipping-profiles-zones-and-rates", "Set up shipping")}.` },

      { type: "h", text: "Step 4. Add your first product" },
      {
        type: "steps",
        items: [
          "Open Products and press New product.",
          "Choose Physical product.",
          "Add a title, photos, a description and a price.",
          "In Inventory, type how many you have.",
          "If it comes in sizes or colors, add them in Variants.",
          "In Shipping, type the weight with its packaging.",
          "Press Publish.",
        ],
      },
      { type: "p", text: `More help: ${link("create-a-physical-product", "Create a physical product")}.` },

      { type: "h", text: "Step 5. Check your store details" },
      {
        type: "steps",
        items: [
          "Open Settings and choose Store details.",
          "Add your logo, your store's name and a contact email. Receipts and order emails use all three, and buyers' replies go to that email.",
          "Choose the country your store is based in. New locations and tax regions start there.",
        ],
      },
      { type: "p", text: `More help: ${link("store-details", "Store details")}.` },

      { type: "h", text: "Step 6. Decide about tax" },
      { type: "p", text: `Storelib charges no tax until you tell it to. If you have to collect tax, open Settings, then Taxes, turn on Charge tax and add a region for each place you're registered. Not sure? Ask an accountant first. More help: ${link("taxes", "Taxes")}.` },

      { type: "h", text: "Step 7. Publish your website" },
      { type: "p", text: "Physical products are sold on your website, at yourname.storelib.com. They aren't listed on your creator page or on Explore, so you need a published website." },
      {
        type: "steps",
        items: [
          "Open Website in the dashboard menu.",
          "Pick a theme. Your products, the cart and checkout are already built in.",
          "Change the words, colors and pictures to yours.",
          "Press Publish.",
        ],
      },
      { type: "p", text: `More help: ${link("sell-on-your-website", "Sell physical products on your website")}. Moving from another store? ${link("import-a-shopify-theme", "Bring your theme")} with you.` },

      { type: "h", text: "Step 8. Try it as a buyer" },
      { type: "p", text: "Open your live website, add a product to the cart and go to checkout. Type your own address and check that the shipping options and prices are the ones you expect. You don't have to pay to check this: the prices show before Pay." },

      { type: "h", text: "Step 9. Ship your first order" },
      {
        type: "steps",
        items: [
          "You get an email when an order comes in. It shows in Orders as Unfulfilled.",
          "Open it. Press Packing slip in the card's menu if you want a list for the box.",
          "Pack it and post it.",
          "Press Fulfill items, type the tracking number and pick the carrier.",
          "Keep Send shipment details to the buyer on and press Fulfill. The buyer gets an email with a Track your package button. Done.",
        ],
      },
      shot("order-unfulfilled", "An order with two items to send from Studio and a Fulfill items button, with the shipping address and the buyer's note under it.", "A new order, ready to pack."),
      { type: "p", text: `More help: ${link("ship-your-orders", "Ship your orders")}.` },

      { type: "h", text: "After your first sale" },
      {
        type: "list",
        items: [
          `Offer ${link("local-pickup", "local pickup")} if buyers live near you.`,
          `Set your ${link("returns-physical", "returns")} window and reasons.`,
          `Add ${link("upsells-and-bundles", "bundles and a checkout offer")} to sell one more thing per order.`,
          `Write your ${link("store-policies", "refund and shipping policies")}.`,
          `Connect ${link("store-domain", "your own domain")}.`,
          `Add your analytics and ad pixels in ${link("integrations", "Integrations")}.`,
        ],
      },
      { type: "h", text: "When a first sale doesn't happen" },
      {
        type: "table",
        head: ["You see", "Why", "Fix"],
        rows: [
          ["Checkout won't open", "Payments aren't set up or not checked yet", "Finish setup in Payouts"],
          ["Shipping isn't available to an address", "That country is in no zone, or no rate fits the cart", "Add the country to a zone, or add a Rest of world zone"],
          ["The product shows Sold out", "Its quantity is 0", "Type the real quantity in Inventory"],
          ["The product isn't on your website", "It's still a draft, or taken off the Online store channel", "Publish it, and check its Sales channels card"],
          ["Nobody can find your products", "The website isn't published", "Publish it in Website"],
        ],
      },
    ],
  },
  {
    section: "Getting started",
    slug: "how-physical-products-work",
    title: "How selling physical products works",
    summary: "The whole journey of one order, from the buyer pressing Pay to the parcel arriving, and the words you'll see on the way.",
    keywords: ["physical", "shipping", "merch", "t-shirt", "print", "post", "parcel", "stock", "overview", "start", "ecommerce", "how it works"],
    related: ["zero-to-100", "fulfillment-methods", "ship-your-orders"],
    body: [
      { type: "p", text: "A physical product is anything that has to reach the buyer in the real world: a t-shirt, a mug, a printed book, a candle. Storelib does the selling. You, or a partner, pack it and post it." },
      { type: "figure", figure: "order-journey", caption: "What happens to one order, from left to right." },
      { type: "h", text: "The six steps of every order" },
      {
        type: "steps",
        items: [
          "The buyer picks a variant (like 12 oz in Sand), adds it to the cart and goes to checkout.",
          "At checkout they type their address. Storelib shows only the shipping options that work for that address and that cart. If you offer local pickup, they can choose Pick up instead.",
          "They pay. Storelib holds the stock while they pay, so nobody else can buy the last one.",
          "The order shows in Orders as Unfulfilled and you get an email. If a partner ships it, they get the order by email too.",
          "You pack it and press Fulfill items with the tracking number. The buyer gets an email with a Track your package button.",
          "When it arrives, press Mark as delivered. Done.",
        ],
      },
      { type: "h", text: "The words you'll see" },
      {
        type: "table",
        head: ["Word", "What it means"],
        rows: [
          ["Variant", "One version of a product, like 16 oz in Moss. Each has its own price, quantity and photo."],
          ["Inventory", "How many you have. Storelib counts it down with every sale."],
          ["Location", "A place that holds stock or ships orders: your home, a warehouse, a print partner."],
          ["Shipping profile", "A set of shipping prices. The General profile covers every product unless you make a custom one."],
          ["Zone", "A group of countries or states you charge the same for."],
          ["Rate", "A shipping option inside a zone, like Standard for $6 or Express for $14."],
          ["Fulfill", "Send the items: you pack and post them, or a partner does."],
          ["Local pickup", "The buyer collects the order from you instead of it being posted."],
        ],
      },
      { type: "note", text: "Digital products and courses can share a cart with physical products. The download is ready at once and the physical part ships as normal." },
      { type: "p", text: `Ready? Follow ${link("zero-to-100", "Zero to 100")} from the top.` },
    ],
  },
  {
    section: "Getting started",
    slug: "physical-products-questions",
    title: "Physical products: common questions",
    summary: "Quick answers when a buyer can't check out, stock looks wrong, a partner missed an order or a buyer lost their order email.",
    keywords: ["faq", "problem", "not working", "can't checkout", "shipping unavailable", "stock wrong", "help", "questions"],
    faq: true,
    related: ["shipping-zones", "inventory-and-stock", "tracking-and-order-status"],
    body: [
      { type: "h", text: "Why does a buyer see that shipping isn't available?" },
      { type: "p", text: "Their address is in no zone, or the cart doesn't fit any rate (too heavy, or outside your price steps). Add the country to a zone, add a Rest of world zone, or widen the steps in Settings > Shipping and delivery." },
      { type: "h", text: "Why is the quantity lower than what I have?" },
      { type: "p", text: "Open Products > Inventory. Available is On hand minus Committed, which is what's held for checkouts in progress and orders not sent yet. A checkout left unpaid gives its items back within the hour. Send the open orders and the numbers line up again." },
      { type: "h", text: "Why didn't my partner get the order?" },
      { type: "p", text: "Open Settings > Locations and edit the partner's location. Check that Who ships the orders? says A partner: email each order to them, and that the Orders email is right. The order's timeline says who it was emailed to." },
      { type: "h", text: "Can I sell without counting stock?" },
      { type: "p", text: "Yes. Turn off Track inventory on the product. It can always be bought, which suits print on demand." },
      { type: "h", text: "Why isn't my physical product on my creator page?" },
      { type: "p", text: "Physical products are sold on your website, at yourname.storelib.com. Your creator page and Explore list your other products. Publish a website to sell what you ship." },
      { type: "h", text: "Can a buyer get one item posted and pick another up?" },
      { type: "p", text: "Not in one order. They choose Ship or Pick up for the whole cart." },
      { type: "h", text: "How does a buyer find their order again?" },
      { type: "p", text: `Every order email has a link to their order page. Lost the email? On your website, /checkout/track asks for the order number and email and sends the link again. See ${link("tracking-and-order-status", "Tracking and the buyer's order page")}.` },
      { type: "h", text: "Where did these settings go?" },
      { type: "p", text: "Physical products can be switched off for all of Storelib. When they are, these settings and pages are hidden. Nothing you set up is deleted, and it all comes back when they're on." },
    ],
  },

  /* ── Set up your store ────────────────────────────────────────────── */
  {
    section: "Set up your store",
    slug: "store-details",
    title: "Store details: your logo, name, contact email and country",
    summary: "What buyers see on receipts, order emails and checkout, and where your store is based. Set it once in Settings > Store details.",
    keywords: ["store details", "store name", "logo", "contact email", "support email", "phone", "country", "based in", "default location", "business name"],
    related: ["checkout-settings", "physical-order-emails", "locations"],
    body: [
      { type: "p", text: "Store details is who your store is to your buyers. It takes two minutes, and it shows on every receipt, order email and checkout." },
      shot("store-details", "Settings, Store details: a Logo card, then Store name, Contact email and Phone, then Where your store is based with a country.", "Store details, with a demo store."),
      { type: "h", text: "Fill it in" },
      {
        type: "steps",
        items: [
          "Open Settings and choose Store details.",
          "Under Logo, press Choose a logo and pick a picture. It goes at the top of receipts, order pages and every email your buyers get.",
          "Type your Store name. Receipts, order emails and checkout say the order is from this name.",
          "Type a Contact email. Buyers write to it about their orders, and it's the address on your receipts.",
          "Add a Phone number if you want buyers and couriers to reach you. Pick the country code first.",
          "Press Save.",
          "Under Where your store is based, choose your country and press Save. New locations and tax regions start there. Buyers can be anywhere.",
        ],
      },
      { type: "h", text: "What each one changes" },
      {
        type: "table",
        head: ["Field", "Where buyers see it"],
        rows: [
          ["Logo", "Receipts, the order page and every customer email. With no logo, your website's logo is used, then your profile photo."],
          ["Store name", "Receipts, order emails and the top of checkout. Empty, your Storelib name is used."],
          ["Contact email", "Receipts and order emails. Replies to order emails go here."],
          ["Phone", "Order emails, so a buyer or a courier can call."],
          ["Country", "Nowhere directly. It's where new locations and tax start."],
        ],
      },
      { type: "h", text: "Where orders ship from" },
      { type: "p", text: `With more than one location, a last card picks your Default location. New orders are assigned to it and its stock goes down, unless a product says otherwise. With one location, every order ships from there. See ${link("locations", "Locations")}.` },
      { type: "note", text: "Store name and Contact email start filled in from your account. They're only saved when you press Save." },
    ],
  },
  {
    section: "Set up your store",
    slug: "checkout-settings",
    title: "Checkout settings: what checkout asks for",
    summary: "Choose the name fields, company, phone and address line 2, the news box, checkout reminders, and whether buyers sign in first.",
    keywords: ["checkout", "checkout settings", "phone number", "company", "address line 2", "marketing", "opt in", "abandoned checkout", "reminder", "sign in", "account", "confirmed email"],
    related: ["what-buyers-see-at-checkout", "customer-accounts", "physical-order-emails"],
    body: [
      { type: "p", text: "Open Settings and choose Checkout. These settings apply to every checkout your store has: your website's and the one for a single product. Everything saves as you change it and reaches checkout within a few seconds. Orders already placed don't change." },
      shot("checkout-settings", "Settings, Checkout: Customer accounts, Marketing, Abandoned checkouts and Customer information with choices for name, company, phone and address line 2."),
      { type: "h", text: "Customer information" },
      {
        type: "table",
        head: ["Field", "Choices", "Good to know"],
        rows: [
          ["Full name", "One field, or First and last", "Email is always asked."],
          ["Company name", "Don't include, Optional, Required", "Only asked on orders that ship. Most shops pick Don't include."],
          ["Phone number", "Don't include, Optional, Required", "Only on orders that ship or are picked up. Couriers use it to reach the buyer."],
          ["Address line 2", "Don't include, Optional, Required", "Apartment, suite or unit. Optional suits most shops."],
        ],
      },
      { type: "p", text: "A field you mark Required is required on the page and checked again when the order is placed, so it can't be skipped." },
      { type: "h", text: "Marketing" },
      { type: "p", text: "Show the email news box adds an Email me with news and offers box under the email. It's never ticked for the buyer. Only buyers who tick it get your campaigns." },
      { type: "h", text: "Abandoned checkouts" },
      {
        type: "list",
        items: [
          "Send a checkout reminder emails a buyer who reached Pay and left without paying, an hour later, with a link back to what they chose.",
          "It only goes to buyers who ticked the news box or are already on your list, because a reminder is marketing and needs their yes. It always has an unsubscribe link.",
          "It doesn't go if they bought in the meantime. Its Finish checkout button opens checkout again with the same items.",
          "One person gets it at most once a week.",
          "Built your own reminder in Emails > Automations? Then buyers get yours instead.",
          "Change its words in Settings > Customer emails > Checkout reminder.",
        ],
      },
      { type: "h", text: "Customer accounts" },
      {
        type: "list",
        items: [
          `Require customers to sign in: on your website, buyers sign in to their account before they pay, with a code emailed to them. Visitors can still browse. See ${link("customer-accounts", "Customer accounts")}.`,
          "Require a confirmed email address: the buyer has to prove the email is theirs. On your website, signing in with the emailed code proves it, so this also turns on sign in.",
          "Signed in, the email at checkout is the account's, and the order shows on their account page.",
        ],
      },
      { type: "note", text: "Asking for sign in stops some people buying. Leave both off unless you need them." },
      { type: "h", text: "Free products" },
      { type: "p", text: "A product with a price of 0, or an order a discount code takes to 0, has no card step. The buyer presses Get it free or Place order and the order is made." },
    ],
  },
  {
    section: "Set up your store",
    slug: "what-buyers-see-at-checkout",
    title: "What buyers see at checkout",
    summary: "Your website's checkout, step by step: on your own address, with your logo, and the card form inside the page.",
    keywords: ["checkout", "buyer", "pay", "shipping method", "pick up", "apple pay", "google pay", "card", "discount code", "promotion code", "invoice", "business", "thank you page"],
    related: ["checkout-settings", "local-pickup", "taxes"],
    body: [
      { type: "p", text: "Buyers reach checkout from Check out in the cart or a Buy button on your website. Checkout opens on your website's own address, at /checkout, with your logo across the top, a Back arrow and Continue shopping. The card form is inside the page, so buyers never leave your site to pay." },
      shot("checkout-ship", "The website checkout: the order and total on the left; on the right the email, the news box, Ship or Pick up, the delivery address, Standard and Express shipping, and the card form.", "Checkout for two items, shipped."),
      { type: "h", text: "On the left: the order" },
      {
        type: "list",
        items: [
          "Pay and your store's name, with the total.",
          "The items, with their variant and quantity.",
          "Add promotion code, for a discount code.",
          "Subtotal, shipping or pickup, tax if you charge it, and Total due.",
        ],
      },
      { type: "h", text: "On the right: what the buyer fills in" },
      {
        type: "steps",
        items: [
          "Apple Pay or Google Pay at the top, when their device has one.",
          "Contact information: their email, and the news box if you turned it on. If you ask buyers to sign in, a Sign in box shows here first.",
          "Delivery, for orders that ship: Ship or Pick up (Pick up only if you offer it), the country first, then the name and address in that country's format, and the fields you chose in Settings > Checkout.",
          "Shipping method: the rates that fit the address and cart, with price and delivery time. One is picked for them, and they can change it.",
          "Payment method: the card form.",
          "Optional: a note for the shop, and Buying for a business to get an invoice with a company name and tax number.",
          "A box to agree to the terms and the refund policy, then Pay with the total on it.",
        ],
      },
      shot("checkout-pickup", "The website checkout with Pick up chosen: the studio's address, Usually ready in 24 hours, the instructions, and a name field instead of the address.", "With Pick up, there's no address and nothing to pay for delivery."),
      { type: "h", text: "After they pay" },
      { type: "p", text: "A thank you page opens on your website, the cart empties, and they get the order confirmation email. You get an email and the order shows in Orders as Unfulfilled." },
      { type: "h", text: "Good to know" },
      {
        type: "list",
        items: [
          "Every price, shipping cost and tax is worked out by Storelib's server from your settings. Nothing the page sends is trusted for money.",
          "A free order shows Get it free or Place order and needs no card.",
          "If something in the cart sold out or can't ship to the address, checkout says so before Pay.",
        ],
      },
    ],
  },
  {
    section: "Set up your store",
    slug: "customer-accounts",
    title: "Customer accounts on your website",
    summary: "Buyers sign in on your website with a code sent to their email, see their orders and keep a wishlist. No passwords.",
    keywords: ["customer account", "sign in", "log in", "login", "account page", "order history", "wishlist", "code", "password", "delete account"],
    related: ["checkout-settings", "tracking-and-order-status"],
    body: [
      { type: "p", text: "Every Storelib website has customer accounts built in. There's nothing to turn on. A buyer presses Sign in (or the account icon) on your website and follows two steps." },
      { type: "h", text: "How a buyer signs in" },
      {
        type: "steps",
        items: [
          "They type their email and press Continue.",
          "They get an email from your store with a 6 digit code.",
          "They type the code. They're signed in, on your website only.",
        ],
      },
      { type: "list", items: [
        "There's no password to remember or reset.",
        "A code works once and for ten minutes. Asking again sends a new one.",
        "The first sign in makes the account. There's no form to fill in.",
      ] },
      { type: "h", text: "What they see on their account page" },
      {
        type: "list",
        items: [
          "Their name and email, with Edit name.",
          "Their orders from your store, newest first, each opening its order page or receipt.",
          "Their wishlist: everything they saved with a heart. A wishlist made before signing in moves into the account.",
          "Delete account, which removes their account and saved items on your website. Their orders stay with your store.",
        ],
      },
      { type: "h", text: "Good to know" },
      {
        type: "list",
        items: [
          "Orders show up when they were placed with the same email the buyer signs in with.",
          "An account on your website is only for your store. It doesn't create a Storelib account, and it never opens your dashboard.",
          "Imported themes use the same sign in, drawn in the theme's own design, and list bought downloads there.",
          "The sign in email comes from your store's name, so buyers recognise it.",
          "In the website editor you can open the account pages to design them. Signing in only works on your live site.",
        ],
      },
      { type: "note", text: `To make buyers sign in before they pay, turn on Require customers to sign in in Settings > Checkout. See ${link("checkout-settings", "Checkout settings")}.` },
      { type: "h", text: "When a buyer can't sign in" },
      {
        type: "table",
        head: ["They say", "Tell them"],
        rows: [
          ["The code never came", "Check spam, wait a minute, then ask for a new code."],
          ["The code doesn't work", "It may have expired or been replaced by a newer one. Use the latest email."],
          ["My old orders aren't there", "They were placed with another email. Sign in with that one."],
        ],
      },
    ],
  },
  {
    section: "Set up your store",
    slug: "sales-channels",
    title: "Sales channels: where your products are listed",
    summary: "Show a product on your website, your creator page and Explore, or take it off one, without deleting it.",
    keywords: ["sales channels", "channel", "online store", "creator page", "explore", "marketplace", "hide product", "wholesale", "market stall", "list new products on"],
    related: ["sell-on-your-website", "create-a-physical-product"],
    body: [
      { type: "p", text: "A sales channel is a place your products are listed. Storelib runs three, and every product is on all of them until you take it off one." },
      shot("sales-channels", "Settings, Sales channels: Online store, Creator page and Explore marked Built in, a channel called Saturday market, and New products set to Every channel."),
      {
        type: "table",
        head: ["Channel", "Where it is"],
        rows: [
          ["Online store", "Your website: its product lists, collections and search."],
          ["Creator page", "storelib.com/yourname and your OnePage."],
          ["Explore", "Storelib's marketplace, where buyers find new creators."],
        ],
      },
      { type: "h", text: "Take a product off a channel" },
      {
        type: "steps",
        items: [
          "Open the product.",
          "Find the Sales channels card.",
          "Untick the channel and save.",
        ],
      },
      { type: "p", text: "It disappears from that place's lists and search straight away. Its own link keeps working, so anyone you send it to can still buy." },
      { type: "h", text: "Channels of your own" },
      { type: "p", text: "Press Create channel in Settings > Sales channels to keep track of somewhere else you sell, like a market stall or a wholesale list. Storelib doesn't show anything there. It only keeps which products belong to it." },
      { type: "h", text: "Where new products start" },
      { type: "p", text: "Under New products, List new products on picks Every channel, or one channel alone. You can always change it on the product." },
      { type: "note", text: "Right now physical products are only listed on your website (Online store). They don't show on your creator page or Explore, whatever their channels say. Channels still decide where your digital products show." },
    ],
  },
  {
    section: "Set up your store",
    slug: "store-domain",
    title: "Put your store on your own domain",
    summary: "Connect a domain you own, like yourstore.com, to your Storelib website. Checkout, sign in and order pages move with it.",
    keywords: ["domain", "custom domain", "own domain", "dns", "url", "web address", "www", "ssl", "https"],
    related: ["sell-on-your-website", "website-builder/custom-domain"],
    body: [
      { type: "p", text: "Your website starts at yourname.storelib.com. With Pro you can connect a domain you own, like fernandclay.com. Your storelib.com address keeps working too." },
      {
        type: "steps",
        items: [
          "Buy a domain from any domain company if you don't have one.",
          "In Storelib, open Settings and choose Domains. You can also get there from Website settings > Domains in the editor.",
          "Add your domain.",
          "At your domain company, add the DNS records Storelib shows you. Copy them exactly.",
          "Wait. The domain shows Waiting for DNS, then Securing while HTTPS is set up, then Connected.",
        ],
      },
      { type: "p", text: "Once it's connected, everything happens on your domain: your pages, sign in and the account pages, and checkout at yourstore.com/checkout, with its thank you page." },
      shot("website-domains", "Website settings, Domains, with a connected domain."),
      { type: "p", text: "The records and what each one is: [Connect your own domain](/help/website-builder/custom-domain)." },
      { type: "h", text: "Common mistakes" },
      {
        type: "list",
        items: [
          "An old A record left on @. It sends visitors somewhere else. Remove it.",
          "A typo in a record. Copy and paste instead of typing.",
          "Expecting it to work in a minute. DNS can take from a few minutes to a day.",
        ],
      },
    ],
  },

  /* ── Products ─────────────────────────────────────────────────────── */
  {
    section: "Products",
    slug: "create-a-physical-product",
    title: "Create a physical product, step by step",
    summary: "From an empty product to one people can buy and you can ship, in about five minutes.",
    keywords: ["new product", "add product", "physical product", "setup", "weight", "publish", "merch"],
    related: ["variants-and-options", "inventory-and-stock", "fulfillment-methods"],
    body: [
      { type: "note", text: `Do this once first: set at least one shipping rate. Without one, buyers can't check out. See ${link("shipping-profiles-zones-and-rates", "Set up shipping")}.` },
      { type: "h", text: "1. Start the product" },
      {
        type: "steps",
        items: [
          "Open Products and press New product.",
          "Choose Physical product.",
        ],
      },
      shot("new-product-kinds", "The New product question with three answers: Digital product, Video course and Physical product.", "Pick Physical product."),
      { type: "h", text: "2. The basics" },
      {
        type: "steps",
        items: [
          "Type a title. Keep it short: Speckled mug, not Handmade speckled stoneware mug for coffee.",
          "Add photos. The first one is the cover.",
          "Write a description: what it is, what it's made of, its size.",
          "Set the price, in your store's currency. If every variant costs the same, this is the price of all of them.",
        ],
      },
      { type: "h", text: "3. Inventory: how many you have" },
      {
        type: "steps",
        items: [
          "Leave Track inventory on.",
          "Type how many you have in Quantity. With variants, you type a quantity for each one in the Variants table instead.",
          "Optional: set Low stock alert, so you get an email before it runs out.",
        ],
      },
      shot("product-inventory", "The Inventory card with Track inventory on, a Low stock alert of 3 and Keep selling when out of stock off."),
      { type: "h", text: "4. Variants, if it comes in sizes or colors" },
      { type: "p", text: `Skip this if there's only one version. Otherwise see ${link("variants-and-options", "Variants and options")}.` },
      { type: "h", text: "5. Shipping" },
      {
        type: "steps",
        items: [
          "Leave This product is shipped on. Turn it off only for things you hand over yourself.",
          "Type the weight with its packaging.",
          "Leave Shipping rates on General unless this product ships at different prices.",
        ],
      },
      shot("product-shipping", "The Shipping card with This product is shipped on, a weight, a unit and the General shipping profile."),
      { type: "h", text: "6. Who ships it" },
      { type: "p", text: `Nothing to do for most products. Every product follows your store's answer in Settings > Shipping and delivery. Only if this one product ships another way (say, one hoodie printed on demand in a shop that posts everything else), open Advanced, then Fulfilment, and turn on Fulfil this product differently. See ${link("fulfillment-methods", "Who ships it")}.` },
      shot("product-fulfillment", "Advanced, Fulfilment: Fulfil this product differently turned on, with four answers: I'll ship it myself, A fulfillment center, A supplier or manufacturer, and Print on demand.", "One product with its own answer."),
      { type: "h", text: "7. Publish" },
      { type: "p", text: "Press Publish. The product shows on your website straight away. Physical products are sold on your website, not on your creator page or Explore, so make sure your website is published too." },
      { type: "h", text: "What you can leave for later" },
      { type: "list", items: [
        "Under Advanced: codes and cost (SKU, barcode, cost per item to see your margin), package size, customs (country of origin, HS code), tax, brand and tags, and fulfilment.",
        "Custom fields, for details like material or care. Turned on, they show under Details on the product page.",
        "Questions (FAQ), shown on the product page in the Product questions block.",
        "Storelib gives every product and variant its own ID, so a SKU is never required.",
      ] },
      { type: "h", text: "Common mistakes" },
      {
        type: "list",
        items: [
          "Leaving the weight empty. If any of your rates are based on weight, an empty weight counts as nothing, so the buyer pays too little shipping.",
          "Typing the weight without the box. Weigh it packed.",
          "Forgetting the quantity. A quantity of 0 shows as Sold out.",
        ],
      },
    ],
  },
  {
    section: "Products",
    slug: "variants-and-options",
    title: "Variants and options: sizes, colors, materials",
    summary: "Add up to three options and Storelib makes every combination for you, each with its own price, quantity, photo and weight.",
    keywords: ["variant", "variants", "option", "size", "color", "colour", "material", "combination", "sku", "photo per variant"],
    related: ["create-a-physical-product", "inventory-and-stock"],
    body: [
      { type: "p", text: "An option is a choice the buyer makes, like Size. Its values are the answers, like 12 oz and 16 oz. Add a second option, like Glaze with Sand, Moss and Ink, and Storelib makes every combination. Each combination is a variant." },
      shot("product-variants", "The Variants card with two options, Size and Glaze, and six variants grouped by size, each with a photo, price and quantity, and an Edit all button.", "Two options with two and three values make six variants, grouped by the first option."),
      {
        type: "steps",
        items: [
          "In the Variants card, add an option. Pick a ready one like Size or Color, or name your own.",
          "Type a value, like Small, and press Enter or a comma. The next empty field is ready for the next value.",
          "Add up to three options, with up to 100 values each. Press Finish to close an option.",
          "To change the order, hold the handle beside an option or a value and move it.",
          "Fill in the rows: price and quantity. With two or more options, rows are grouped by the first one, and a group's price or photo applies to every variant in it.",
          "Press the photo square on a row to give that variant its own photo.",
          "Press the arrow at the end of a row for compare at price, SKU, barcode, weight, cost, and Sell this variant.",
          "To set one price, quantity, weight or cost for many variants at once, press Edit all.",
          "Save the product.",
        ],
      },
      { type: "h", text: "Good to know" },
      {
        type: "list",
        items: [
          "A price left empty uses the product's price. Prices are in your store's currency.",
          "A weight left empty uses the product's weight. Set it when, say, the large one weighs more.",
          "Turn off Sell this variant to stop selling one variant without deleting it. Buyers don't see it, and its stock and orders stay.",
          "Removing a value removes its variants. A variant somebody already bought is kept, hidden, so their order still makes sense.",
          "The product page shows the cheapest price until the buyer picks a variant. Colors with a common name get a swatch.",
          "Up to 250 variants per product.",
          "With more than one location, the Quantity at menu picks which location's stock you're typing.",
        ],
      },
      { type: "h", text: "Common mistakes" },
      {
        type: "list",
        items: [
          "Making separate products for each color. Use one product with a Color option instead, so buyers pick on one page.",
          "Typing a value and leaving it half done. Press Enter or a comma so it's added before you move on.",
        ],
      },
    ],
  },
  {
    section: "Products",
    slug: "upsells-and-bundles",
    title: "Upsells and bundles: sell more to people already buying",
    summary: "Bundle products at a better price on their pages, and suggest one more thing in the checkout.",
    keywords: ["upsell", "bundle", "cross sell", "order bump", "frequently bought together", "add on", "offer", "aov", "average order"],
    related: ["sell-on-your-website", "what-buyers-see-at-checkout"],
    body: [
      { type: "p", text: "Someone already buying from you is the easiest person to sell one more thing to. Open Products > Upsells and bundles. There are two kinds of offer." },
      shot("upsells-and-bundles", "The Upsells and bundles page listing a bundle called Breakfast set and a checkout offer called Add an apron."),
      { type: "table", head: ["", "Bundle", "Checkout offer"], rows: [
        ["What it is", "Two to five products bought together", "One product suggested before they pay"],
        ["Where buyers see it", "Under the buy box on each of its products", "In the checkout, under their order"],
        ["The discount", "A percent off every item, or an amount off the whole set", "A percent or amount off that one product"],
        ["When it applies", "For every complete set in the cart", "When the cart has something else, or one of the products you choose"],
      ] },
      { type: "h", text: "Make a bundle" },
      { type: "steps", items: [
        "Press Create offer and choose Bundle.",
        "Give it a name buyers will see, like Breakfast set.",
        "Tick two to five products.",
        "Choose the discount: Percent, Amount or None. The preview shows what the set costs.",
        "Save. It shows on each product's page straight away, with Add all to cart.",
      ] },
      { type: "h", text: "Make a checkout offer" },
      { type: "steps", items: [
        "Press Create offer and choose Checkout offer.",
        "Name it, like Add an apron, and pick the one product to offer.",
        "Choose Any order, or The cart has certain products and tick them.",
        "Choose the discount and save.",
      ] },
      { type: "p", text: "Switch any offer off from the list without deleting it. The saving comes off before any discount code, and the code comes off what's left." },
      { type: "note", text: "Offers work in the cart checkout. A digital product can be in a bundle or offered at checkout too, as long as it's bought through the cart." },
    ],
  },

  /* ── Shipping and delivery ────────────────────────────────────────── */
  {
    section: "Shipping and delivery",
    slug: "shipping-profiles-zones-and-rates",
    title: "Set up shipping: profiles, zones and rates",
    summary: "Where you ship and what it costs, set once in Settings > Shipping and delivery. One General profile covers every product.",
    keywords: ["shipping", "postage", "delivery", "rates", "zone", "zones", "profile", "countries", "international", "express", "standard", "free shipping", "states", "shipping settings"],
    related: ["shipping-zones", "shipping-rate-examples", "units-and-packages"],
    body: [
      { type: "p", text: "Shipping is three boxes inside each other. A profile holds zones. A zone holds rates." },
      { type: "figure", figure: "profiles", caption: "Profiles hold zones, zones hold rates." },
      {
        type: "table",
        head: ["Box", "What it is", "Example"],
        rows: [
          ["Profile", "Which products these prices are for", "General (every product), or Heavy items (only the products you pick)"],
          ["Zone", "Where these prices apply", "United States; Europe; Rest of world"],
          ["Rate", "An option the buyer picks, its price and how long it takes", "Standard, $6, 3 to 5 business days"],
        ],
      },
      { type: "h", text: "Set up your General profile" },
      {
        type: "steps",
        items: [
          "Open Settings and choose Shipping and delivery.",
          "Under Units, choose Metric (kg, cm) or Imperial (lb, in).",
          "In the General profile, press Add shipping zone.",
          "Pick the countries, or a country's states. Select all picks every country at once.",
          "Save the zone, then press Add rate inside it.",
          "Type the name buyers see, like Standard. Pick the rate type and the price, and type how many business days it takes.",
          "Add an Express rate the same way if you want one.",
          "Add a Rest of world zone if you ship everywhere else too.",
        ],
      },
      shot("shipping-general-profile", "The General shipping profile with a United States zone holding Standard at $6 and Express at $14, and a Rest of world zone with a weight based International rate.", "A General profile with two zones."),
      shot("shipping-add-rate", "The rate form: Name buyers see, Delivery estimate in business days, and the rate types such as Flat rate and Based on order weight.", "Adding a rate."),
      { type: "p", text: `Zones in detail, with states and Rest of world: ${link("shipping-zones", "Shipping zones")}. Every rate type, with real numbers: ${link("shipping-rate-examples", "Shipping rates")}.` },
      { type: "h", text: "Custom profiles" },
      { type: "p", text: "Make a custom profile when some products ship at different prices, like a heavy lamp next to light prints." },
      {
        type: "steps",
        items: [
          "Press Custom shipping profile and name it, like Heavy items.",
          "Add the products that ship at these rates. Picking a product that's in another profile moves it here.",
          "Give the profile its own zones and rates, the same way as General.",
        ],
      },
      { type: "p", text: "You can also pick a product's profile from the product itself, in its Shipping card under Shipping rates. Every other product keeps using General." },
      { type: "h", text: "A cart with products from two profiles" },
      { type: "p", text: "Checkout adds them up. If both profiles have a rate with the same name, like Standard, the buyer sees one Standard at the two prices added together. If they share no name, the buyer sees Standard shipping: the cheapest rate of each, added together." },
      { type: "h", text: "When nothing ships to an address" },
      { type: "p", text: "If a buyer's address is in no zone, or the cart doesn't fit any rate (for example it's heavier than your last step allows), checkout says shipping isn't available there and Pay stays off. If you offer local pickup, the buyer can choose that instead. Nobody can pay for shipping you don't offer." },
      { type: "h", text: "Common mistakes" },
      {
        type: "list",
        items: [
          "No zone for your own country. Add it first.",
          "Forgetting Rest of world when you do ship abroad. Buyers abroad can't check out without it.",
          "A weight based rate with products that have no weight. They count as weighing nothing.",
        ],
      },
    ],
  },
  {
    section: "Shipping and delivery",
    slug: "shipping-zones",
    title: "Shipping zones: countries, states and Rest of world",
    summary: "How a zone picks up a buyer's address, how to ship to only some states, and what Rest of world covers.",
    keywords: ["zone", "zones", "shipping zone", "countries", "states", "provinces", "rest of world", "international", "lower 48", "alaska", "hawaii", "europe"],
    related: ["shipping-profiles-zones-and-rates", "shipping-rate-examples", "local-pickup"],
    body: [
      { type: "p", text: "A zone is a list of places you charge the same for. Each profile has its own zones. A buyer sees the rates of the one zone their address falls in." },
      { type: "h", text: "Add a zone" },
      {
        type: "steps",
        items: [
          "Open Settings > Shipping and delivery.",
          "In a profile, press Add shipping zone.",
          "Give it a name only you see, like Europe.",
          "Tick the countries. Search by name, or press Select all for every country.",
          "To ship to only part of a country, tick its states or provinces instead of the whole country.",
          "Save, then add at least one rate to the zone.",
        ],
      },
      shot("shipping-general-profile", "A General profile with a United States zone and a Rest of world zone, each with its rates."),
      { type: "h", text: "Which zone an address falls in" },
      { type: "p", text: "Storelib reads the country and state of the delivery address and looks, in this order, for:" },
      {
        type: "steps",
        items: [
          "A zone that names the address's state or province.",
          "A zone that names the whole country.",
          "If you picked only some states of that country, nothing more: the other states aren't shipped to.",
          "Otherwise the Rest of world zone, if the profile has one.",
        ],
      },
      { type: "p", text: "No zone found means no shipping to that address, and checkout says so before Pay." },
      { type: "h", text: "Shipping to only some states" },
      { type: "p", text: "Say you ship to the lower 48 US states but not Alaska or Hawaii. Make a zone with the 48 states ticked, not the whole United States. A buyer in Alaska then sees that shipping isn't available, even if you have Rest of world. Want Alaska and Hawaii at a higher price? Add a second zone with just those two." },
      { type: "h", text: "Rest of world" },
      { type: "p", text: "Turn on Rest of world in a zone to cover every country no other zone in that profile names. It's the easy way to ship everywhere. A country where you picked only some states stays out of it." },
      { type: "h", text: "Good to know" },
      {
        type: "list",
        items: [
          "A zone with only states is listed under its country's name, so you can tell zones apart.",
          "Two rates with the same name in one zone: the buyer only sees the cheaper.",
          "Each custom profile needs its own zones. A product in a profile with no zone for an address can't ship there.",
        ],
      },
    ],
  },
  {
    section: "Shipping and delivery",
    slug: "shipping-rate-examples",
    title: "Shipping rates: every type, with real numbers",
    summary: "Flat, free, by order price, by order weight and by item weight: what each rate charges, worked through with examples.",
    keywords: ["shipping rates", "rate types", "shipping examples", "flat rate", "free shipping", "weight based", "price based", "item weight", "free shipping threshold", "calculate shipping"],
    related: ["shipping-profiles-zones-and-rates", "units-and-packages", "shipping-zones"],
    body: [
      { type: "p", text: "Every rate has a name buyers see, a delivery estimate in business days, and a type. The type decides the price." },
      {
        type: "table",
        head: ["Type", "How the price is worked out", "Example"],
        rows: [
          ["Flat rate", "Always the same price", "$6 for any order"],
          ["Free shipping", "Free, always or from an order value", "Free on orders over $75"],
          ["Based on order price", "Steps by how much the order costs", "From $0: $8. From $30: $4. From $80: free"],
          ["Based on order weight", "Steps by the order's total weight", "From 0 kg: $5. From 1 kg: $9. From 5 kg: $15"],
          ["Based on item weight", "Each item priced by its own weight, then added up", "Up to 0.5 kg: $2 each. From 0.5 kg: $4 each"],
        ],
      },
      { type: "p", text: "A rate can also be offered only for some orders: Only on orders over an amount, Not offered above a weight, or only between a number of items. Outside its limits the rate isn't shown." },
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
      { type: "note", text: `Weights come from the product's Shipping card, or the variant's own weight when it has one. Your default package's empty weight is added for weight based rates (see ${link("units-and-packages", "Units and packages")}). Prices are after any discount code, so free over $50 means the buyer actually pays $50 or more.` },
    ],
  },
  {
    section: "Shipping and delivery",
    slug: "units-and-packages",
    title: "Units and packages",
    summary: "Pick kilograms or pounds, and save the boxes you ship in so weight based rates charge for the whole parcel.",
    keywords: ["units", "kg", "lb", "pounds", "kilograms", "metric", "imperial", "inches", "weight", "package", "packages", "box", "mailer", "envelope"],
    related: ["shipping-rate-examples", "create-a-physical-product"],
    body: [
      { type: "h", text: "Units" },
      {
        type: "steps",
        items: [
          "Open Settings > Shipping and delivery.",
          "Under Units, choose Metric (kg, cm) or Imperial (lb, in).",
        ],
      },
      { type: "p", text: "Weights and sizes are typed and shown in that system: on new products, in rates and in packages. Your rates keep working when you switch. A product can still use another unit: its Shipping card has its own unit picker, and the weight you typed is converted for you." },
      { type: "h", text: "Packages" },
      { type: "p", text: "A package is a box or mailer you ship in, with its size and empty weight. Storelib adds the empty weight of your default package to what's inside when it works out a weight based rate, so the buyer pays for what the parcel really weighs." },
      {
        type: "steps",
        items: [
          "In Shipping and delivery, find Packages and press Add package.",
          "Name it, pick the type, and type its size and empty weight.",
          "Save. Mark the one you use most as the default.",
        ],
      },
      shot("shipping-packages", "The Packages card with one box called Mug box marked Default, its size and empty weight."),
      { type: "note", text: "Without a package, weight based rates count the products alone, so buyers pay a little less than the parcel really weighs." },
    ],
  },
  {
    section: "Shipping and delivery",
    slug: "local-pickup",
    title: "Local pickup",
    summary: "Let buyers collect their order from your studio, shop or home instead of paying for shipping.",
    keywords: ["pickup", "pick up", "collect", "collection", "click and collect", "in person", "local", "store pickup"],
    related: ["locations", "ship-your-orders", "what-buyers-see-at-checkout"],
    body: [
      { type: "p", text: "Local pickup lets a buyer choose Pick up at checkout. They pay nothing for delivery, give no address, and you email them when the order is ready." },
      { type: "h", text: "Turn it on" },
      {
        type: "steps",
        items: [
          "Open Settings and choose Locations.",
          "Press the pencil on your location, or Add location.",
          "Make sure it has the street, city and country. Buyers see this address.",
          "Turn on Local pickup.",
          "Choose Usually ready in, for example 24 hours.",
          "Write Pickup instructions: opening times, which door, what to bring.",
          "Press Save location.",
        ],
      },
      shot("location-pickup", "Inside a location: Ships orders from here on, Local pickup on, Usually ready in 24 hours and the pickup instructions.", "Local pickup is turned on per location."),
      { type: "h", text: "What the buyer sees" },
      shot("checkout-pickup", "Checkout with Pick up chosen: the studio's name and address, Usually ready in 24 hours and the instructions, with no address fields.", "At checkout the buyer chooses Ship or Pick up."),
      { type: "p", text: "Choosing Pick up shows your location, its address, when it's usually ready and your instructions. They type their email and name, and a phone number if you ask for one. No address." },
      { type: "h", text: "When Pick up is offered" },
      {
        type: "list",
        items: [
          "Only for items you ship yourself. A print on demand or dropshipped item never passes through your hands, so a cart with one can't be picked up.",
          "Only when that location has enough stock of everything in the cart, or the items aren't tracked.",
          "Tax, if you charge it, is worked out for the pickup location's country and state.",
        ],
      },
      { type: "h", text: "Handing it over" },
      {
        type: "steps",
        items: [
          "Get the order ready and press Mark ready for pickup on the order. Keep Tell the buyer it's ready on: they get an email with your address and instructions.",
          "When they collect it, press Mark picked up. The order is done.",
          "Marked ready too soon? Choose Not ready after all in that card's menu.",
        ],
      },
      shot("order-pickup", "A pickup order with its items to get ready at Studio and a Mark ready for pickup button."),
    ],
  },
  {
    section: "Shipping and delivery",
    slug: "fulfillment-methods",
    title: "Who ships it: fulfilment types",
    summary: "Ship it yourself, or use a fulfillment center, a supplier or print on demand: one answer for the store, and any product can have its own.",
    keywords: ["fulfillment", "fulfilment", "fulfilment type", "3pl", "warehouse", "dropshipping", "dropship", "supplier", "print on demand", "pod", "printful", "printify", "gelato"],
    related: ["locations", "integrations", "ship-your-orders"],
    body: [
      { type: "p", text: "Your store answers one question once, in Settings > Shipping and delivery: How you fulfil orders. Every product follows that answer. A product that ships another way can have its own." },
      shot("fulfil-question", "The question How do you fulfil your physical orders, with seven answers such as I ship orders myself, Print on demand and A mix of these."),
      { type: "h", text: "The store's answer" },
      {
        type: "table",
        head: ["Answer", "What it means"],
        rows: [
          ["I ship orders myself", "From home, a studio or a shop."],
          ["From my own warehouse", "Stock in a place you run."],
          ["Print on demand", "Each order is printed and shipped for you."],
          ["Dropshipping", "A supplier ships straight to your buyers."],
          ["A supplier or manufacturer", "They hold the stock and ship it."],
          ["A fulfillment center", "A 3PL stores, packs and ships."],
          ["A mix of these", "Different products ship from different places."],
        ],
      },
      { type: "p", text: "Change it any time under How you fulfil orders and press Save. The first time you answer, Storelib makes a location to match." },
      { type: "h", text: "One product shipped another way" },
      {
        type: "steps",
        items: [
          "Open the product, then Advanced, then Fulfilment.",
          "Turn on Fulfil this product differently.",
          "Choose I'll ship it myself, A fulfillment center (3PL), A supplier or manufacturer, or Print on demand.",
          "Pick the partner it ships from. For a new one, press New and type their name and the email address they want orders sent to.",
          "Save the product.",
        ],
      },
      { type: "p", text: "From then on, every paid order with this product is emailed to that address with the items, quantities, SKUs and the buyer's address. The email has a link where the partner adds the tracking themselves, and the buyer is emailed the moment they do. Partners live in Settings > Locations, so you can change their email there." },
      { type: "note", text: `Printful, Printify, Gelato and CJ Dropshipping take orders directly once you connect them in Settings > Integrations, and send tracking back. For any other partner, use the email address they give you. See ${link("integrations", "Integrations")}.` },
      { type: "h", text: "Orders that mix methods" },
      { type: "figure", figure: "split-order", caption: "One order, two senders: each part is sent and tracked on its own." },
      { type: "p", text: "If one order has a hoodie printed on demand and stickers you post yourself, the order page shows two Unfulfilled cards, one per sender. Each gets its own Fulfill items and its own tracking, and the buyer gets an email for each parcel. The order shows Partially shipped until both are out." },
    ],
  },

  /* ── Locations and inventory ──────────────────────────────────────── */
  {
    section: "Locations and inventory",
    slug: "locations",
    title: "Locations: where your stock lives and ships from",
    summary: "Add your home, studio, warehouse or partner as a location, choose who ships from it, and pick the default.",
    keywords: ["location", "locations", "warehouse", "studio", "address", "ship from", "default location", "partner", "3pl", "multiple locations"],
    related: ["inventory-and-stock", "local-pickup", "fulfillment-methods"],
    body: [
      { type: "p", text: "A location is any place that holds your stock or ships your orders: your home, a studio, a warehouse, or a partner who ships for you. You have at least one. Most small shops only ever need one." },
      shot("locations-list", "The Locations card listing Studio, marked Default and Local pickup, and Print partner, marked Emails orders."),
      { type: "h", text: "Add a location" },
      {
        type: "steps",
        items: [
          "Open Settings and choose Locations.",
          "Press Add location.",
          "Give it a name only you see, like Studio, and pick its type.",
          "Pick the country first, then type the address the way that country writes it.",
          "Under Who ships the orders?, pick I do, from here for your own place, or A partner: email each order to them and type their orders email.",
          "Press Add location.",
        ],
      },
      shot("location-form", "The location form: name, type, country, address, Who ships the orders, phone, and switches for Ships orders from here, Local pickup and In use."),
      { type: "h", text: "The switches inside a location" },
      {
        type: "table",
        head: ["Switch", "What it does"],
        rows: [
          ["Ships orders from here", "Off keeps stock here without shipping from it."],
          ["Local pickup", "Buyers can collect here for free."],
          ["In use", "Off keeps the location without shipping from it or offering pickup."],
        ],
      },
      { type: "h", text: "The default location" },
      { type: "p", text: "New orders are assigned to your default location, and its stock goes down there. Its address is also where return emails tell buyers to send items. Press Make default on another location to change it, or pick it in Settings > Store details." },
      { type: "h", text: "Common mistakes" },
      {
        type: "list",
        items: [
          "A partner with no orders email. Their orders aren't sent anywhere. Add the email in the location.",
          "Your home as the default with no street address. Return emails need it.",
        ],
      },
    ],
  },
  {
    section: "Locations and inventory",
    slug: "inventory-and-stock",
    title: "Inventory: how Storelib counts your stock",
    summary: "Tracking quantity, why you can never oversell, the Inventory page, and keeping selling when out of stock.",
    keywords: ["stock", "inventory", "quantity", "oversell", "sold out", "out of stock", "backorder", "count", "on hand", "committed", "available", "adjust"],
    related: ["low-stock-alerts", "variants-and-options", "locations"],
    body: [
      { type: "p", text: "With Track inventory on, every product has a quantity. A simple product has one number. A product with variants has one number per variant, because you might have 10 large mugs in Sand and none in Ink." },
      { type: "h", text: "What happens to the number" },
      {
        type: "table",
        head: ["When", "What changes"],
        rows: [
          ["A buyer starts paying", "The items are held for them for about 35 minutes. Nobody else can buy them in that time."],
          ["They pay", "The items stay taken. Available goes down for good."],
          ["They leave without paying", "The hold ends and the items are back on sale."],
          ["You fulfill the items", "They leave your shelf: On hand goes down."],
          ["You cancel an order that hasn't shipped", "The items go back on sale."],
          ["A return arrives and you restock it", "On hand goes back up."],
        ],
      },
      { type: "p", text: "So you never sell more than you have, even if two people press Pay for the last one at the same second. One gets it; the other is told how many are left." },
      { type: "h", text: "The Inventory page" },
      shot("inventory-page", "The Inventory page listing each variant with On hand, Committed, Available and Incoming, and an Adjust button on each row."),
      {
        type: "steps",
        items: [
          "Open Products > Inventory in the dashboard menu.",
          "Each row is one variant. On hand is what's on your shelf. Committed is held for checkouts and orders not sent yet. Available is what can still be sold.",
          "Use the views at the top, like Low stock and Out of stock, to see what to reorder.",
          "To change a number, press Adjust. Choose Add or remove, Set count (after you count the shelf) or Incoming (units you've ordered), and pick a reason. Every change is kept in that variant's history.",
        ],
      },
      { type: "h", text: "Sold out, and keeping selling" },
      { type: "p", text: "When a variant reaches 0 it shows as Sold out and can't be added to a cart. To take orders anyway and ship later, turn on Keep selling when out of stock on the product. Then the number can go below 0, which tells you how many you owe." },
      { type: "p", text: `Want an email before something runs out? See ${link("low-stock-alerts", "Low stock alerts")}.` },
    ],
  },
  {
    section: "Locations and inventory",
    slug: "low-stock-alerts",
    title: "Low stock alerts and Only N left",
    summary: "Set the line where stock counts as low, get an email when something sells down to it, and show buyers when few are left.",
    keywords: ["low stock", "low stock alert", "low stock email", "reorder", "only left", "running low", "threshold", "stock alert", "notification"],
    related: ["inventory-and-stock", "sell-on-your-website"],
    body: [
      { type: "p", text: "The low stock line is a number. At or below it, a variant counts as low. One line drives three things: an email to you, the Low stock view in Inventory, and Only 3 left on your website." },
      shot("low-stock", "The Low stock card with a Low stock line of 5 and Email me when stock runs low turned on."),
      { type: "h", text: "Set it up" },
      {
        type: "steps",
        items: [
          "Open Settings > Locations and find Low stock.",
          "Type the Low stock line for your shop, for example 5.",
          "Keep Email me when stock runs low on.",
          "Press Save.",
          "For a product that needs its own line, open it and set Low stock alert in its Inventory card. That number wins for that product.",
        ],
      },
      { type: "h", text: "The email" },
      shot("low-stock-email", "The low stock email: the product and variant that are running low, how many are left, and a button to open Inventory.", "The real email, with demo products."),
      {
        type: "list",
        items: [
          "It's sent after a sale brings a variant to its line or below.",
          "It lists everything that is low at that moment, with how many are left.",
          "The same items don't email you twice in one day.",
          "Products with Track inventory off never count as low.",
          "To stop these emails, turn off Email me when stock runs low.",
        ],
      },
      { type: "h", text: "Only N left on your website" },
      { type: "p", text: "In the website editor, open Website settings > Commerce and turn on Show how many are left. A product page then says Only 3 left once stock reaches that product's line. Change the words with Low stock message, where {count} is the number left." },
      shot("website-on-this-website", "Website settings, Commerce, On this website: Show how many are left, Low stock message, Free shipping banner and Return policy in the cart."),
    ],
  },

  /* ── Taxes ────────────────────────────────────────────────────────── */
  {
    section: "Taxes",
    slug: "taxes",
    title: "Taxes: how Storelib charges tax on your orders",
    summary: "Add a tax region for each place you have to charge tax, choose whether prices include it, and see exactly what a buyer pays.",
    keywords: ["tax", "taxes", "vat", "sales tax", "gst", "hst", "tax region", "tax rate", "tax inclusive", "prices include tax", "tax on shipping", "reduced rate", "tax exempt", "eu vat", "oss"],
    related: ["what-buyers-see-at-checkout", "store-details"],
    body: [
      { type: "p", text: "Storelib charges the tax you set and nothing else. No rates are switched on for you and nothing is guessed, because what you owe depends on where you're registered. Only you and your accountant know that." },
      { type: "h", text: "Set it up" },
      {
        type: "steps",
        items: [
          "Open Settings and choose Taxes.",
          "Turn on Charge tax. While it's off, buyers pay your prices and nothing more.",
          "Choose Added on top or Included. Added on top is how the US and Canada show prices. Included is how most of Europe, the UK and Australia show them.",
          "Under Tax regions, press Create region.",
          "Pick the country. Pick a state or province only if the rate is different there. Type the rate, and the name receipts use, like VAT or Sales tax.",
          "Press Create region. Repeat for every place you're registered to collect tax.",
          "If delivery is taxed where you sell, turn on Charge tax on shipping.",
        ],
      },
      shot("taxes-settings", "Settings, Taxes: Charge tax on, Added on top chosen, and three tax regions with their rates.", "Taxes with three regions."),
      shot("taxes-create-region", "The Create tax region window with Country, State, Name and Rate."),
      { type: "h", text: "Which rate a buyer pays" },
      { type: "p", text: "At checkout Storelib reads the buyer's shipping address and looks for a region in this order:" },
      {
        type: "list",
        items: [
          "A region for their state or province, if you made one.",
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
          "Open Settings > Taxes and press the region.",
          "Under Product rates, choose the product and type its rate, for example 7% for books.",
          "Save. It applies only in that region.",
        ],
      },
      { type: "p", text: "For a product that should never be taxed, open the product, then Advanced, and turn off Charge tax on this product." },
      { type: "h", text: "Discounts, free shipping and tips" },
      {
        type: "list",
        items: [
          "A discount code comes off before tax, so tax is on what the buyer actually pays.",
          "Free shipping means there's no delivery to tax.",
          "A tip is never taxed.",
        ],
      },
      { type: "h", text: "Digital products in the same store" },
      { type: "p", text: "Downloads, courses and memberships are taxed only while Charge tax on digital products is on. In a cart with something you ship, they're taxed by the delivery address like the rest of the order. Bought on their own there's no address, so the buyer's country decides and only whole-country regions count." },
      { type: "note", text: "In the EU, VAT on digital sales is charged at the rate of the buyer's country, not yours. If you sell digital products to EU buyers, add a region for each EU country you sell to." },
      { type: "h", text: "Where tax shows up" },
      {
        type: "list",
        items: [
          "Every checkout shows the tax line before the buyer pays.",
          "The order in Orders shows the tax on its own line, with the rate used.",
          "The receipt, the invoice, the order confirmation email and the buyer's order page show it too.",
          "Changing a rate later never changes orders already paid.",
        ],
      },
      { type: "h", text: "Registrations and exemptions" },
      { type: "p", text: "Add a region only where you're registered or required to collect. Storelib doesn't file or pay tax for you, and doesn't check registration numbers." },
      { type: "p", text: "A buyer can tick Buying for a business at checkout and add the company's name, address and tax number. They go on the invoice, but they don't remove the tax. For a business buyer who is exempt, refund the tax part from the order." },
      { type: "h", text: "When something looks wrong" },
      {
        type: "table",
        head: ["You see", "Why", "What to do"],
        rows: [
          ["No tax at checkout", "Charge tax is off, or the buyer's country has no region.", "Turn on Charge tax and add a region for that country."],
          ["Tax on top when your prices already include it", "The store is set to Added on top.", "Switch to Included."],
          ["Shipping is not taxed", "Charge tax on shipping is off.", "Turn it on if delivery is taxed where you sell."],
          ["A state pays the country rate", "There's no region for that state.", "Add the state as its own region."],
          ["One product has no tax", "Charge tax on this product is off in its Advanced settings.", "Turn it back on."],
          ["Digital products have no tax", "Charge tax on digital products is off.", "Turn it on and add the countries you sell to."],
        ],
      },
      { type: "note", text: "Automatic rates from a tax service aren't available yet. Rates change, so check yours once a year." },
    ],
  },

  /* ── Orders and tracking ──────────────────────────────────────────── */
  {
    section: "Orders and tracking",
    slug: "ship-your-orders",
    title: "Ship your orders: from Unfulfilled to Delivered",
    summary: "What each order status means, how to fulfill items with tracking, send part of an order and print a packing slip.",
    keywords: ["fulfil", "fulfill", "fulfill items", "ship order", "tracking", "tracking number", "carrier", "mark as shipped", "delivered", "processing", "in progress", "packing slip", "partial", "split"],
    related: ["tracking-and-order-status", "cancel-a-physical-order", "physical-order-emails"],
    body: [
      { type: "figure", figure: "order-steps", caption: "Every physical order moves through four steps." },
      {
        type: "table",
        head: ["Status", "What it means", "How it gets there"],
        rows: [
          ["Unfulfilled", "Paid, nothing sent yet", "On its own, when the buyer pays"],
          ["In progress", "You're working on it", "Mark as in progress, in the card's menu (optional)"],
          ["Partially shipped", "Some of it is sent", "You fulfilled part of the order"],
          ["Shipped", "Everything is sent", "You fulfilled every item"],
          ["Delivered", "Every parcel arrived", "Mark as delivered on each shipment"],
        ],
      },
      { type: "p", text: `For pickup orders the steps read Ready for pickup and Picked up. See ${link("local-pickup", "Local pickup")}.` },
      { type: "h", text: "Fulfill an order" },
      {
        type: "steps",
        items: [
          "Open Orders and press the order. Each Unfulfilled card says where it ships from.",
          "Want a list for the box? Open the card's menu (the three dots) and press Packing slip.",
          "Pack it and post it.",
          "Press Fulfill items.",
          "Check the quantities. Lower one to send only part of the order now.",
          "Type the tracking number. Storelib often knows the carrier from the number; if not, pick it. For a carrier that isn't listed, choose Other and type its name and tracking link.",
          "Keep Send shipment details to the buyer on and press Fulfill.",
        ],
      },
      shot("order-fulfill-items", "The Fulfill items window: the items with their quantities, a tracking number, the carrier USPS and Send shipment details to the buyer turned on.", "Fulfill items, with tracking."),
      { type: "p", text: "What happens next: the buyer gets a shipping email with a Track your package button, the stock leaves your shelf, and the order moves to Shipped." },
      shot("order-shipped", "A fulfilled shipment: USPS with its tracking number, a Track button, the items, and a Mark as delivered button.", "A sent shipment, with its tracking."),
      { type: "h", text: "Sending an order in several parcels" },
      { type: "p", text: "Fulfill what you have now and leave the rest. The order stays Partially shipped, with what's left in the Unfulfilled card. Fulfill the rest later the same way. Each parcel gets its own tracking and its own email." },
      { type: "h", text: "After it's sent" },
      {
        type: "list",
        items: [
          "Fix a typo with Edit tracking in the shipment's menu. Keep Email the buyer the new number on and they're told.",
          "Mark as in transit and Mark as delivered move the shipment on. The buyer is emailed when it's delivered.",
          "Cancel fulfillment if it never left. Its items go back to unfulfilled and back in stock.",
        ],
      },
      { type: "p", text: `Tracking in detail, and what the buyer sees: ${link("tracking-and-order-status", "Tracking and the buyer's order page")}.` },
      { type: "h", text: "Common mistakes" },
      {
        type: "list",
        items: [
          "Pressing Fulfill before the parcel is posted. The buyer gets the email at once.",
          "Typing the tracking number with spaces from the receipt. That's fine: spaces are taken out for you.",
          "Turning off Send shipment details to the buyer by accident. Leave it on unless you've told the buyer yourself.",
        ],
      },
    ],
  },
  {
    section: "Orders and tracking",
    slug: "tracking-and-order-status",
    title: "Tracking and the buyer's order page",
    summary: "How tracking links are made, how a partner adds tracking for you, and the order page where buyers follow their parcel.",
    keywords: ["tracking", "track package", "tracking link", "tracking number", "carrier", "order status", "order page", "where is my order", "track your order", "usps", "ups", "fedex", "dhl", "royal mail", "partner tracking"],
    related: ["ship-your-orders", "physical-order-emails", "fulfillment-methods"],
    body: [
      { type: "p", text: "Every shipment can carry a tracking number. Storelib turns it into a link to the carrier's own tracking page, and puts that link in the buyer's email and on their order page." },
      { type: "h", text: "Carriers Storelib knows" },
      { type: "p", text: "For these, the tracking link is made for you: USPS, UPS, FedEx, DHL Express, DHL Paket, Royal Mail, Evri, Hermes, DPD, GLS, FAN Courier, Sameday, Cargus, Posta Romana, Canada Post, Australia Post, PostNL, La Poste / Colissimo, Aramex, InPost, PostNord, Correos, Poste Italiane, An Post and Purolator." },
      {
        type: "list",
        items: [
          "Type the number first: Storelib often picks the carrier from how the number looks.",
          "Under the fields, The buyer can follow it at names the carrier's site, so you can check before you save.",
          "For any other carrier, choose Other, type its name and paste its tracking link. Without a link, the buyer sees the number on its own.",
        ],
      },
      { type: "h", text: "When a partner ships" },
      { type: "p", text: "A warehouse, supplier or print partner gets each order by email. That email has a link to a short form where they type the carrier and tracking number. When they save it, the items are marked sent and the buyer gets the shipping email straight away. The link works for 60 days." },
      { type: "p", text: `A partner on a webhook (Your own system, in ${link("integrations", "Integrations")}) can send the tracking back the same way, signed with your webhook secret. Later updates for the same number move the shipment on: in transit, out for delivery, delivered.` },
      { type: "h", text: "What the buyer sees" },
      shot("buyer-order-page", "The buyer's order page: Your order is on the way, the steps Confirmed, Processing, Shipped and Delivered, the USPS tracking with a Track package button, then the items and totals.", "The buyer's order page."),
      {
        type: "list",
        items: [
          "Every order email has a link to their order page. It shows the steps, each shipment with a Track package button, the items, the totals, the address, and Return items when you accept returns.",
          "Signed in on your website, they also find it under their orders.",
          "Lost the email? On your website, /checkout/track asks for the order number and the email they ordered with, and emails the link again. It never says whether an order exists, so nobody can look up someone else's.",
        ],
      },
      { type: "h", text: "The emails that go with tracking" },
      shot("shipping-email", "The shipping confirmation email: Your order is on the way, the steps, the USPS tracking number with a Track your package button, the items and where it's going.", "The real shipping email, with demo data."),
      {
        type: "table",
        head: ["Email", "Sent when"],
        rows: [
          ["Shipping confirmation", "You fulfill items with Send shipment details to the buyer on"],
          ["Tracking number changed", "You edit the tracking with Email the buyer the new number on"],
          ["Out for delivery", "A partner's update says it's out for delivery"],
          ["Delivered", "The shipment is marked delivered"],
        ],
      },
    ],
  },
  {
    section: "Orders and tracking",
    slug: "cancel-a-physical-order",
    title: "Cancel an order and give the money back",
    summary: "Cancel an order that hasn't shipped, put the stock back on sale and refund the buyer, or answer a buyer who asked to cancel.",
    keywords: ["cancel", "cancel order", "out of stock", "can't fulfil", "refund", "void", "buyer cancel", "cancel request", "customer wants to cancel"],
    related: ["refund-a-physical-order", "ship-your-orders"],
    body: [
      { type: "p", text: "Cancel an order when you can't send it: you ran out, the buyer changed their mind before you posted it, or the address is wrong and they can't be reached." },
      {
        type: "steps",
        items: [
          "Open Orders and press the order.",
          "Open the Unfulfilled card's menu (the three dots) and press Cancel order. It's there only while nothing has been sent.",
          "Add a reason if you like (only you see it) and confirm. The stock goes back on sale and the buyer gets an Order cancelled email.",
          "Then press More actions at the top of the order and choose Refund to give the money back. Cancelling doesn't refund on its own.",
        ],
      },
      { type: "note", text: "Already sent part of it? You can't cancel the whole order any more. Refund the part you didn't send instead." },
      { type: "h", text: "When the buyer asks to cancel" },
      { type: "p", text: "While an order is still Unfulfilled, your buyer sees Cancel order on their order page. Pressing it only asks you. Nothing is cancelled until you answer." },
      {
        type: "steps",
        items: [
          "You get an email saying the buyer asked to cancel, with their reason.",
          "Open the order. A Cancel requested card is at the top.",
          "Press Cancel and refund to cancel it and refund every paid item in full. The buyer gets the Order cancelled email and the refund email.",
          "Or press Keep order to send it after all. Their order page then says you're going ahead. Tell them why by email.",
        ],
      },
      { type: "p", text: "Once you press Mark as in progress or send anything, Cancel order is gone from their page. To stop buyers asking at all, turn off Let buyers ask to cancel in Settings, Checkout." },
      { type: "p", text: `More about refunds: ${link("refund-a-physical-order", "Refund a physical order")}.` },
    ],
  },

  /* ── Returns and refunds ──────────────────────────────────────────── */
  {
    section: "Returns and refunds",
    slug: "returns-physical",
    title: "Returns for physical orders",
    summary: "Set your return window and reasons, then approve a return, take the items back into stock and refund, step by step.",
    keywords: ["return", "returns", "exchange", "send back", "restock", "damaged", "return window", "return reasons", "accept returns"],
    related: ["refund-a-physical-order", "store-policies", "tracking-and-order-status"],
    body: [
      { type: "h", text: "Set your returns" },
      {
        type: "steps",
        items: [
          "Open Settings and choose Returns and refunds.",
          "Leave Accept returns on. Off, the buyer's order page has no return button.",
          "Set Return window in days. It counts from delivery, or from shipping when there's no tracking.",
          "Press Save.",
          "Check Return reasons, the choices a buyer picks from, and Refund reasons, the ones you pick from. Add, rename or remove them.",
        ],
      },
      shot("returns-settings", "Settings, Returns and refunds: Accept returns on, a 30 day Return window, and the lists of return reasons and refund reasons."),
      { type: "p", text: "Your website's refund policy page ends with your return window, kept up to date for you. To show it in the cart too, turn on Return policy in the cart in Website settings > Commerce." },
      { type: "h", text: "When a buyer asks for a return" },
      {
        type: "steps",
        items: [
          "The buyer opens their order page (the link is in every order email) and presses Return items. They choose what, how many and why.",
          "You get an email, and the request shows on the order. Approve it or decline it. When you approve, say how it comes back and add instructions. The buyer is emailed either way.",
          "When the parcel arrives, mark it received. Choose which items go back in stock. Damaged ones can stay out.",
          "Refund with More actions > Refund at the top of the order, all of it or part of it.",
          "Close the return.",
        ],
      },
      shot("buyer-order-page", "The buyer's order page with the steps, the tracking, the items and totals, where the Return items button sits.", "The buyer's order page, where Return items is."),
      { type: "note", text: "A return doesn't refund by itself. Choose Refund when you're ready." },
      { type: "h", text: "Start a return yourself" },
      { type: "p", text: "After a phone call or an email, open the shipment's menu on the order and press Start return. Choose the items, the reason, how it comes back (the buyer ships it, drops it off, or keeps it) and whether it goes back in stock when received." },
      { type: "h", text: "Common mistakes" },
      {
        type: "list",
        items: [
          "A refund policy that says 14 days when Return window says 30. Keep them the same.",
          "Forgetting to refund after marking the return received.",
          "Restocking a damaged item. Leave it out so you don't sell it again.",
        ],
      },
    ],
  },
  {
    section: "Returns and refunds",
    slug: "refund-a-physical-order",
    title: "Refund a physical order",
    summary: "Give back all or part of a payment, with a reason, and what happens to stock and your balance.",
    keywords: ["refund", "money back", "partial refund", "refund shipping", "refund reason"],
    related: ["returns-physical", "cancel-a-physical-order", "physical-payouts"],
    body: [
      {
        type: "steps",
        items: [
          "Open Orders and press the order.",
          "Press Refund in the payment card, or open More actions at the top (the three dots on a phone) and choose Refund.",
          "If the order has more than one product, pick the one you're refunding.",
          "Type the amount, up to what hasn't been refunded yet.",
          "Pick a reason from your refund reasons, and press Refund.",
        ],
      },
      { type: "h", text: "What happens" },
      {
        type: "list",
        items: [
          "The money goes back to the buyer's card or wallet. Their bank decides how fast it shows.",
          "The buyer gets a Refund email.",
          "The amount comes out of your balance. Storelib's fee on the sale is not returned.",
          "A full refund before anything was sent puts the stock back on sale and cancels the order. A partial refund, or one after sending, leaves stock alone: mark a return received to put items back.",
          "You can refund the same order more than once, until all of it is refunded.",
          "Only the store's owner can refund. A team member working in Orders doesn't see Refund.",
        ],
      },
      { type: "h", text: "Refund reasons" },
      { type: "p", text: "The reasons you pick from are in Settings > Returns and refunds, under Refund reasons. The reason stays on the order's timeline, and Analytics counts them." },
    ],
  },

  /* ── Customer emails ──────────────────────────────────────────────── */
  {
    section: "Customer emails",
    slug: "physical-order-emails",
    title: "Customer emails: what your buyers get, and when",
    summary: "Order confirmation, shipping, delivery, pickup, refunds, returns and the checkout reminder: when each goes and how to change its words.",
    keywords: ["email", "emails", "customer emails", "notification", "order confirmation", "shipping confirmation", "tracking email", "receipt", "edit email", "email template"],
    related: ["tracking-and-order-status", "store-details", "checkout-settings"],
    body: [
      { type: "p", text: "Storelib emails your buyers at every step of an order. You don't send anything yourself. Each email carries your store's name and logo, and a buyer's reply goes to your contact email in Settings > Store details." },
      shot("customer-emails", "Settings, Customer emails: lists under Orders, Shipping, Local pickup, Returns and Checkout, each email with a line saying when it goes."),
      { type: "h", text: "Change an email" },
      {
        type: "steps",
        items: [
          "Open Settings and choose Customer emails.",
          "Press an email. Its preview opens with a sample order.",
          "Change the words: Subject, Heading, Text and Button.",
          "To add the buyer's first name, the order number, your store name or what they bought, tap that placeholder while you're typing. It's filled in for each order.",
          "Watch the preview change as you type, then press Save.",
          "Changed your mind? Reset to default puts our words back.",
        ],
      },
      { type: "list", items: [
        "The items, totals, tracking and links stay as they are, filled in from each order. You change the words around them.",
        "Close an email with unsaved changes and it asks before throwing them away.",
        "On a phone, an email opens as a sheet from the bottom, with Preview and Edit.",
      ] },
      { type: "h", text: "When each one goes" },
      {
        type: "table",
        head: ["Email", "Sent when"],
        rows: [
          ["Order confirmation", "Right after the buyer pays for something you ship or they pick up."],
          ["Order updated", "You change the shipping address on an order before it ships."],
          ["Payment failed", "Half an hour after a buyer's bank declines their payment, if they still haven't paid. That cart then gets no checkout reminder."],
          ["Shipping confirmation", "You fulfill items. It has the Track your package button."],
          ["Tracking number changed", "You change the tracking on a shipment that already went out."],
          ["Out for delivery", "A partner's update says it's out for delivery."],
          ["Delivered", "It's marked delivered."],
          ["Delivery issue", "A shipment is marked failed, by you or a partner's update. You get an email too."],
          ["Ready for pickup", "You mark a pickup order ready."],
          ["Picked up", "You mark it collected."],
          ["Order cancelled", "You cancel an order before it ships."],
          ["Refund", "You refund all or part of an order."],
          ["Return requested", "A buyer asks to return items, so they know it arrived. You get an email too."],
          ["Return approved, declined, received and complete", "At each step of a return."],
          ["Checkout reminder", "An hour after a buyer leaves checkout without paying, only if they asked for news. Turn it on in Settings > Checkout."],
        ],
      },
      { type: "h", text: "Emails to you" },
      { type: "p", text: `You get an email for each new order (where it goes, how, who fulfils each item, and what to do next), one when a buyer asks to return something or a delivery fails, and a low stock email when something sells down to its line (see ${link("low-stock-alerts", "Low stock alerts")}). Choose what you get in Settings > Notifications.` },
      { type: "note", text: "These are order emails. Newsletters and automations are in Emails in the dashboard menu, and only go to people who agreed to hear from you." },
    ],
  },

  /* ── Website and integrations ─────────────────────────────────────── */
  {
    section: "Website and integrations",
    slug: "sell-on-your-website",
    title: "Sell physical products on your website",
    summary: "Your products, the cart and checkout are built into every Storelib website. Here's how to set them up and check them.",
    keywords: ["website", "store", "shop page", "cart", "add to cart", "buy now", "cart drawer", "theme", "storefront", "free shipping banner", "collections"],
    related: ["import-a-shopify-theme", "what-buyers-see-at-checkout", "low-stock-alerts"],
    body: [
      { type: "p", text: "You don't add products to your website by hand. Every published product is on it, with its own page, and the cart and checkout come with every theme." },
      { type: "h", text: "Set it up" },
      {
        type: "steps",
        items: [
          "Open Website in the dashboard menu and pick a theme, or open the one you have.",
          "Add a section that shows products, like a product grid, to your home page.",
          "Open a product page in the editor to see how products look. One layout is used for every product.",
          "Press Publish.",
        ],
      },
      { type: "h", text: "What buyers get" },
      {
        type: "list",
        items: [
          "A product page with the photos, the variant picker, the price and Add to cart.",
          "Sold out variants crossed out, and Only 2 left when stock is low, if you turn it on.",
          "A cart they can change, then checkout on your website's own address, with your logo across the top.",
          "A cart with something to post asks for the address and delivery on the same page as the card.",
        ],
      },
      shot("product-buy-box", "A product page buy box: Size and Glaze choices, one sold out choice crossed out, a quantity and Add to cart.", "On the product page, a sold out combination can't be picked."),
      { type: "h", text: "The commerce settings, all in one place" },
      { type: "p", text: "In the editor, open Website settings and choose Commerce. It lists everything that decides how your website sells, with a button to each: products and sales channels, checkout, taxes, payouts, rates and zones, locations, returns, discount codes, upsells, analytics and customer emails." },
      shot("website-commerce", "Website settings, Commerce: rows for Products on this website, Sales channels, Checkout, Taxes, Payouts, Rates and zones, Locations and Returns, each with a button.", "Website settings > Commerce."),
      { type: "h", text: "What your website shows buyers" },
      { type: "p", text: "Lower down, On this website has four settings that only change your website:" },
      {
        type: "table",
        head: ["Setting", "What buyers see"],
        rows: [
          ["Show how many are left", "Only 3 left on a product page once stock reaches that product's low stock line."],
          ["Low stock message", "Your own words for it. {count} is the number left."],
          ["Free shipping banner", "A line over the header saying how much more gets free shipping. It uses the amount from your rates unless you type one."],
          ["Return policy in the cart", "Your return window and a link to your refund policy, under Check out."],
        ],
      },
      shot("website-on-this-website", "Website settings, Commerce, On this website: Show how many are left, Low stock message, Free shipping banner and Return policy in the cart."),
      { type: "p", text: "These are saved with your draft. Visitors see them after you publish." },
      { type: "h", text: "Collections" },
      { type: "p", text: "Group products in Products > Collections, then show a collection in a section. A smart collection fills itself by rules, like a category, a tag or a price, so a new product joins on its own." },
      { type: "h", text: "Trying it in the editor" },
      { type: "p", text: `In the editor you can press Add to cart and open your cart to see how it looks. Checkout only opens on your live site, so test a full order there. See ${link("what-buyers-see-at-checkout", "What buyers see at checkout")}.` },
      { type: "h", text: "Common mistakes" },
      {
        type: "list",
        items: [
          "Editing and not publishing. Visitors see the last version you published.",
          "A product missing from the website. Check it's published and that Online store is on in its Sales channels card.",
        ],
      },
    ],
  },
  {
    section: "Website and integrations",
    slug: "import-a-shopify-theme",
    title: "Bring your store's theme to Storelib",
    summary: "Import your old store's theme file and your store looks the same, with Storelib's products, cart, accounts and checkout behind it.",
    keywords: ["shopify", "import", "theme", "dawn", "horizon", "migrate", "move from shopify", "liquid", "zip"],
    related: ["sell-on-your-website", "customer-accounts"],
    body: [
      { type: "p", text: "If your store is on another platform, you can bring its theme. Storelib draws the theme's own design, sections and scripts, and fills them with your Storelib products." },
      { type: "h", text: "Import it" },
      {
        type: "steps",
        items: [
          "In your old store's admin, download your theme file. It usually comes as a link to a .zip by email.",
          "In Storelib, open Website in the dashboard menu.",
          "Press Import theme and choose the .zip. Don't unzip it.",
          "Wait for the upload and the import to finish. It says how many sections came across.",
          "Open the new website in the editor, check each page, then press Publish.",
        ],
      },
      { type: "h", text: "What works" },
      {
        type: "list",
        items: [
          "The theme's sections and blocks, editable in the Storelib editor, with its header, footer and pop ups shared by every page.",
          "Product pages with variants, collections, search with live suggestions and product recommendations.",
          "The theme's cart drawer and cart page: add, change quantities, remove, and a note.",
          "Check out, which opens checkout on your website's own address with everything in the cart. Buy it now buys that one item.",
          "Sign in and the account page, with a code emailed to the buyer instead of a password, and their orders and downloads.",
          "The theme's hearts, saved to your website's wishlist.",
          "Newsletter and contact forms. Sign ups join your subscribers and messages reach you.",
          "Your policies, linked from the theme's footer.",
          "A product's custom fields and questions, which the theme can read like metafields.",
        ],
      },
      { type: "h", text: "What doesn't come across" },
      {
        type: "list",
        items: [
          "Apps from your old store and anything they added to the theme.",
          "Other metafields. Settings that read them show nothing.",
          "Blog posts. A blog page shows its title with no posts.",
          "Your old store's own express payment buttons. Storelib's checkout takes cards, Apple Pay and Google Pay.",
          "Pictures kept in your old store's files rather than in the theme. Upload them again in the editor.",
        ],
      },
      { type: "h", text: "Common mistakes" },
      {
        type: "list",
        items: [
          "Unzipping the file first. Upload the .zip just as you downloaded it.",
          "Testing checkout or sign in in the editor. Both only work on your live site. Add to cart and the cart drawer work in the editor.",
          "Forgetting your products. The theme comes across, your old store's products don't. Add them in Storelib.",
        ],
      },
      { type: "p", text: "Building or debugging themes? The developer guide is at [Imported themes](/developers/imported-shopify-themes)." },
    ],
  },
  {
    section: "Website and integrations",
    slug: "integrations",
    title: "Integrations: analytics, pixels and fulfilment partners",
    summary: "Add Google Analytics, Meta, TikTok and other pixels to your website, send orders to Printful, Printify or your own system, and see what's next.",
    keywords: ["integrations", "integration", "google analytics", "ga4", "meta pixel", "facebook pixel", "tiktok pixel", "pinterest", "google ads", "tag manager", "clarity", "klaviyo", "webhook", "csv", "printful", "printify", "shipstation", "apps"],
    related: ["fulfillment-methods", "tracking-and-order-status", "sell-on-your-website"],
    body: [
      { type: "p", text: "Open Settings and choose Integrations. Every service you can connect is there, with a search, categories, and Installed for what you've already set up. Press a card to open its page: what it does, what it sends, and how to install it." },
      shot("integrations-directory", "Settings, Integrations: a search field, category filters, and cards for services like Google Analytics, Meta Pixel and Printful, each with its status.", "Settings > Integrations."),
      { type: "h", text: "Analytics and ad pixels" },
      { type: "p", text: "Google Analytics, Google Tag Manager, Google Ads, Meta Pixel, TikTok Pixel, Pinterest Tag and Microsoft Clarity load on every page of your website once you add their ID. Klaviyo and Omnisend load their sign up forms." },
      {
        type: "steps",
        items: [
          "Press the service's card.",
          "Copy the ID from that service, like a Google Analytics Measurement ID (G-1A2B3C4D5E) or a Meta Pixel ID.",
          "Paste it under Set up and press Install.",
          "It loads on your website from its next page view. To stop it, press Remove.",
        ],
      },
      shot("integration-page", "The Meta Pixel page in Integrations: About, At a glance, Data ownership, and an Install box asking for the Pixel ID.", "One integration's page."),
      { type: "list", items: [
        "An order paid at your website's checkout for something that ships is sent to Google Analytics, Google Ads, Meta, TikTok and Pinterest as a purchase, with its value, when the buyer reaches their order page.",
        "They never get your buyers' names, emails or addresses from Storelib.",
        "Where cookie consent is required, asking for it is up to you.",
      ] },
      { type: "h", text: "Getting orders to whoever ships them" },
      {
        type: "table",
        head: ["Integration", "What it does today"],
        rows: [
          ["Ship it yourself", "Built in. You pack and send, then add the tracking."],
          ["Supplier by email", "Each paid order is emailed to your partner with the items and address. They add tracking from a link in the email."],
          ["Your own system (webhook)", "Each paid order is sent to your https address as JSON, signed with your secret. Tracking can come back the same way. Send a test checks your address first."],
          ["CSV export", "Download unfulfilled orders as a spreadsheet for a warehouse."],
          ["Printful, Printify", "Connect with your token. Each paid order for their location goes to them by SKU, and the tracking comes back to your buyer."],
          ["Gelato", "Connect with your API key and match each variant to a Gelato product and print file. Each paid order goes to Gelato, and the tracking comes back."],
          ["CJ Dropshipping", "Connect with your CJ API key and match each variant to a CJ variant. Each paid order goes to CJ, tracking comes back, and stock can follow CJ's."],
          ["ShipStation, Shippo, EasyPost", "Save your key now. Labels and live rates aren't available yet."],
        ],
      },
      { type: "p", text: "A key you save is stored encrypted and never shown again, only its last four characters." },
      { type: "p", text: `Setting up Printful or Printify, step by step: ${link("printful-and-printify", "Printful and Printify")}. Gelato and CJ Dropshipping: ${link("gelato-and-cj-dropshipping", "Gelato and CJ Dropshipping")}.` },
      { type: "h", text: "Check your own webhook with Send a test" },
      {
        type: "steps",
        items: [
          "Open Your own system (webhook) and press Connect.",
          "Type your https address and a signing secret of 16 characters or more, then press Save.",
          "Press Send a test. Storelib sends a signed test request, the same shape as an order.",
          "The page says what your address answered, like 200. Anything else means your system didn't take it yet.",
        ],
      },
      { type: "p", text: "Check the X-Storelib-Signature header against your secret before you trust a request." },
      { type: "h", text: "Storelib apps" },
      { type: "p", text: "Storelib Reviews is made by Storelib and runs inside it. Open its card, turn it on, and choose who can write a review and when reviews are published." },
      { type: "h", text: "Not there yet?" },
      { type: "p", text: "Some cards say Coming soon. Press Tell me when it's ready and you're counted: the most asked for are built first. For a service that isn't listed at all, press Request integration." },
    ],
  },

  {
    section: "Website and integrations",
    slug: "printful-and-printify",
    title: "Printful and Printify: send orders and get tracking back",
    summary: "Connect Printful or Printify with a token, match your SKUs, choose drafts or straight to production, and let tracking reach your buyers.",
    keywords: ["printful", "printify", "print on demand", "pod", "token", "api token", "sku", "draft", "production", "tracking", "t-shirt", "merch", "coming soon"],
    related: ["gelato-and-cj-dropshipping", "integrations", "fulfillment-methods", "tracking-and-order-status"],
    body: [
      { type: "p", text: "Printful and Printify make each product when it sells and post it to your buyer. Connect one, and every paid order for its products goes to it by itself. Its tracking number comes back to the order." },
      shot("integration-printful", "The Printful page in Settings, Integrations: Connected, orders from the Printful location, drafts to approve, tracking by webhook, and Send orders straight to production.", "Printful, connected."),
      { type: "h", text: "Connect it with your token" },
      {
        type: "steps",
        items: [
          "In Printful, open the Developer portal and make a private token with the orders, sync products and webhooks scopes. In Printify, open My account, then Connections, and make an API token.",
          "In Storelib, open Settings, then Integrations, and press Printful or Printify.",
          "Press Connect, paste the token and press Connect again. Storelib checks it with them first.",
          "The page says Connected, with your store or shop's name. The token is stored encrypted and only its last four characters are shown.",
        ],
      },
      { type: "h", text: "The location it makes" },
      { type: "p", text: "Connecting makes a location named Printful or Printify in Settings, Locations. It says Connected to Printful while the token works. If you disconnect, the location stays with its products, and orders for it are marked for you to send yourself." },
      shot("locations-list", "Settings, Locations: a studio, a print partner that gets orders by email, and a Printful location that says Connected to Printful.", "The location Printful made."),
      { type: "p", text: "This location holds no stock. A product printed there is never counted and never shows as sold out." },
      { type: "h", text: "Match your SKUs" },
      {
        type: "steps",
        items: [
          "Open the product in Storelib and choose Print on demand under how it is fulfilled.",
          "Choose the Printful or Printify location. The editor says orders go there automatically.",
          "Give each variant the same SKU it has in Printful or Printify. That is how they know what to make.",
          "Save. Stock tracking is off for it, since nothing is kept in stock.",
        ],
      },
      { type: "note", text: "A variant without a SKU, or with one they don't have, is not sent. The order says which item, so you can fix the SKU and send that order yourself." },
      { type: "h", text: "Drafts, or straight to production" },
      { type: "p", text: "By default each order waits there as a draft. You approve it in Printful or Printify, and they charge you then. Turn on Send orders straight to production to have each order made as soon as it is paid." },
      { type: "h", text: "Tracking comes back" },
      { type: "list", items: [
        "When they ship a parcel, they tell Storelib. Storelib then reads the order from them with your token.",
        "The carrier and tracking number land on the order, and your buyer gets the shipping email from your store.",
        "If their update can't reach Storelib, Storelib checks them every few hours instead.",
        "Every step is on the order's timeline: sent, shipped, or anything they refused.",
      ] },
      { type: "h", text: "Coming soon" },
      { type: "p", text: `Gelato and CJ Dropshipping take orders too: see ${link("gelato-and-cj-dropshipping", "Gelato and CJ Dropshipping")}. A card that says Coming soon can't take orders yet. Press Tell me when it's ready on one and you're counted: the most asked for are built first.` },
    ],
  },

  {
    section: "Website and integrations",
    slug: "gelato-and-cj-dropshipping",
    title: "Gelato and CJ Dropshipping: match products, send orders",
    summary: "Connect Gelato or CJ Dropshipping with an API key, match each variant to theirs, choose drafts or paid orders, and get tracking and stock back.",
    keywords: ["gelato", "cj", "cj dropshipping", "cjdropshipping", "dropshipping", "dropship", "print on demand", "api key", "match", "product uid", "print file", "vid", "stock sync", "tracking"],
    related: ["printful-and-printify", "integrations", "fulfillment-methods", "tracking-and-order-status"],
    body: [
      { type: "p", text: "Gelato prints each product near your buyer. CJ Dropshipping sends products from its own warehouses. Connect one and every paid order for its location goes to it by itself, and its tracking number comes back to the order." },
      { type: "h", text: "Connect it with your API key" },
      {
        type: "steps",
        items: [
          "In Gelato, open Developer, then API keys, and make a key. In CJ, open My CJ, then Authorization, then API, and copy your API key. It looks like CJ1234567@api@ and a long code.",
          "In Storelib, open Settings, then Integrations, and press Gelato or CJ Dropshipping.",
          "Press Connect, paste the key and press Connect again. Storelib checks it with them first, and a key they refuse is not saved.",
          "The page says Connected. The key is stored encrypted and only its last four characters are shown.",
        ],
      },
      { type: "p", text: "Connecting makes a location named Gelato or CJ Dropshipping in Settings, Locations. In a product, choose Print on demand and the Gelato location, or Dropshipping and the CJ Dropshipping location." },
      { type: "h", text: "Match each variant to theirs" },
      { type: "p", text: "Gelato and CJ don't know your SKUs, so you tell Storelib which of their products each variant is. Press Match products on the connected card. Products sold from their location are listed first." },
      { type: "list", items: [
        "CJ: press Match, search CJ by SKU or by words, open a product and press Choose on its variant. A variant whose SKU is exactly the same as a CJ variant's goes without a match, because CJ confirms the SKU when the order is sent.",
        "Gelato: press Match, paste the Gelato product UID for that size and colour from Gelato's catalogue, and the https address of your print file. Storelib checks the product with Gelato before saving.",
        "Anything not matched is never sent on a guess. The order says which item, so you can match it and send that order yourself.",
      ] },
      { type: "h", text: "Drafts, or straight to production" },
      { type: "p", text: "Gelato: each order waits as a draft until you approve it in Gelato, and Gelato charges you then. CJ: each order is made unpaid, and you pay it in CJ. Turn on Send orders straight to production to have Gelato make it at once, or CJ confirm it and pay it from your CJ balance. If your CJ balance is too low, the order says so and waits in CJ." },
      { type: "p", text: "Gelato orders go by the shipment method you choose on the card. CJ orders go by the cheapest method CJ quotes for that order, unless you type one, from the warehouse country you choose." },
      { type: "h", text: "Tracking comes back" },
      { type: "list", items: [
        "CJ tells Storelib when an order ships and its tracking moves. Storelib then reads the order from CJ with your key.",
        "Gelato's updates are set up in Gelato: the card shows an address to paste in Gelato, under Developer, Webhooks, for order status and tracking code updates. Until the first one arrives, Storelib checks Gelato every few hours.",
        "The carrier and tracking number land on the order, and your buyer gets the shipping email from your store, then the delivery email.",
        "If either is busy, Storelib tries again a little later. Nothing is sent twice.",
      ] },
      { type: "h", text: "Stock from CJ" },
      { type: "p", text: "On a matched CJ product, turn on Keep stock in step with CJ. Its stock at the CJ Dropshipping location then follows CJ's warehouses in the country you ship from: read when you turn it on, when CJ says it changed, and every six hours. With stock tracking on, the product sells out when CJ runs out. Each change is in the product's stock history as Synced from provider. Leave it off and the CJ Dropshipping location only has the stock you count there yourself, so turn off Track stock on a product you don't want to count." },
    ],
  },

  /* ── Payouts, fees and policies ───────────────────────────────────── */
  {
    section: "Payouts, fees and policies",
    slug: "physical-payouts",
    title: "Getting paid for physical orders",
    summary: "Where the money from a physical order goes, what Storelib keeps, and how it reaches your bank.",
    keywords: ["payout", "payouts", "paid", "money", "balance", "cash out", "bank", "stripe", "fee", "when do i get paid"],
    related: ["physical-fees-and-plans", "refund-a-physical-order"],
    body: [
      { type: "p", text: "A physical order is paid the same way as any other sale on Storelib. The buyer pays by card, Apple Pay or Google Pay, and the money goes into your balance." },
      { type: "h", text: "Before your first order" },
      {
        type: "steps",
        items: [
          "Open Payouts and press Set up payments.",
          "Add your details and your bank account.",
          "Wait until Payouts says payments are on. Checkout stays closed until then.",
        ],
      },
      { type: "p", text: "Step by step: [Set up payments](/help/orders-and-payouts/connect-stripe)." },
      { type: "h", text: "What's in a payment" },
      {
        type: "list",
        items: [
          "The buyer pays the items, the shipping and any tax in one payment.",
          "Storelib's fee is taken from that payment. It's the same fee as any sale, worked out on the whole amount the buyer paid. See [What Storelib charges per sale](/help/orders-and-payouts/fees).",
          "Shipping money is yours. You pay the carrier yourself, the way you normally would.",
          "Tax you collect is yours to pay to the tax office. Storelib doesn't file it for you.",
        ],
      },
      { type: "h", text: "From your balance to your bank" },
      shot("payouts-balance", "The Payouts page with three figures: Available, Arriving soon and On the way, and a Cash out button.", "Payouts, with made up numbers."),
      {
        type: "steps",
        items: [
          "A payment settles first. Payouts shows it under Arriving soon, with the day it will be ready.",
          "Once settled, it moves to Available.",
          "Press Cash out. Your whole available balance goes to your bank, usually in 1 to 3 business days.",
        ],
      },
      { type: "p", text: "More detail: [When you get paid](/help/orders-and-payouts/how-payouts-work)." },
      { type: "h", text: "Refunds and your balance" },
      { type: "p", text: "A refund comes out of your balance. If it takes the balance below zero, your next sales cover it on their own." },
      { type: "h", text: "The name on the buyer's statement" },
      { type: "p", text: "Open Settings > Payments to set the name buyers see on their card statement. Use a name they'll recognise. A buyer who doesn't recognise a charge is more likely to dispute it." },
    ],
  },
  {
    section: "Payouts, fees and policies",
    slug: "physical-fees-and-plans",
    title: "Plans and fees for physical sales",
    summary: "What a physical sale costs you on each plan, what's included, and what needs Pro.",
    keywords: ["plan", "pro", "free plan", "fee", "fees", "price", "cost", "billing", "subscription", "upgrade"],
    related: ["physical-payouts", "store-domain"],
    body: [
      { type: "p", text: "Selling physical products works on every plan. There's no extra charge for shipping, stock or locations." },
      {
        type: "list",
        items: [
          "Each sale pays Storelib's fee for your plan, the same as a digital sale. See [What Storelib charges per sale](/help/orders-and-payouts/fees).",
          "The fee is worked out on what the buyer paid, shipping and tax included.",
          "Your own domain is part of Pro. See [Plans](/help/account-and-billing/plans).",
          "Change or cancel your plan in Settings > Plan.",
        ],
      },
      { type: "note", text: "Carriers charge you for postage the normal way. Storelib doesn't buy labels or postage for you yet." },
    ],
  },
  {
    section: "Payouts, fees and policies",
    slug: "store-policies",
    title: "Refund, shipping and privacy policies for your store",
    summary: "Your website comes with policy pages to fill in. Here's how to write them and where buyers see them.",
    keywords: ["policy", "policies", "refund policy", "shipping policy", "privacy policy", "terms", "terms of service", "legal", "returns policy"],
    related: ["returns-physical", "sell-on-your-website"],
    body: [
      { type: "p", text: "Every store needs a refund policy, a privacy policy and terms of service. Payment providers ask for them, and buyers look for them before they pay. Your Storelib website comes with all three, plus an optional shipping policy." },
      { type: "h", text: "Write them" },
      {
        type: "steps",
        items: [
          "Open Website and the editor.",
          "Open Website settings and choose Policies.",
          "Press Edit on a policy, or Use template to start from ours.",
          "Replace everything in [square brackets] with your own terms. The card counts how many are left.",
          "Write a shipping policy too: where you ship, how long it takes and what it costs.",
          "Publish the website so visitors see the changes.",
        ],
      },
      shot("website-policies", "Website settings, Policies: a card for each policy with how many placeholders are left to fill in."),
      { type: "h", text: "Make them match your settings" },
      {
        type: "list",
        items: [
          "Your refund policy ends with your return window from Settings > Returns and refunds, kept up to date for you. Make sure the rest of the text doesn't say something different.",
          "Your shipping times should match the delivery estimates on your rates.",
          "If you offer local pickup, say where and when.",
        ],
      },
      { type: "note", text: "The templates are a starting point, not legal advice. Check them with someone who knows the rules where you sell." },
      { type: "p", text: "Each policy is a page of your website, linked from its footer. Imported themes link to them from their own footer too." },
    ],
  },
]

export const PHYSICAL_ARTICLES: HelpArticle[] = ARTICLES.map((a) => ({ updated: REVIEWED, ...a, category: C }))
