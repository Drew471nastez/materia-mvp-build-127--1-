/**
 * ===========================================================================
 *  EVERY INTEGRATION, IN ONE LIST
 * ===========================================================================
 * Settings › Integrations reads this: each entry is a card in the directory
 * and a page of its own (About, At a glance, Data ownership, Install).
 *
 *   tracker    analytics and ad pixels on the store's website
 *              (lib/store/tracking.ts); every store
 *   commerce   fulfilment, shipping, print on demand and suppliers
 *              (lib/physical/providers.ts); while physical commerce is on.
 *              Printful, Printify, Gelato and CJ Dropshipping take orders
 *              and send tracking back (lib/integrations/fulfilment); Shippo
 *              and EasyPost sell labels on the order page and ShipStation
 *              takes orders and sends tracking back
 *              (lib/integrations/shipping); the rest are Coming soon, never
 *              a Connect button
 *   app        made by Storelib and run inside it, with a page of its own
 *              settings: Storelib Reviews (lib/reviews/app-settings.ts)
 *   listed     a service merchants ask for that Storelib does not connect
 *              to yet (LISTED below). It has a page that says so plainly
 *              and a "Tell me when it's ready" that is counted in /admin;
 *              it is never shown as installed or working.
 *
 * Built in means it works with nothing to connect. A provider whose orders
 * Storelib does not send yet says so on its page; nothing here claims a
 * connection that isn't there.
 */
import { PROVIDERS, type ProviderId, type ProviderInfo } from "@/lib/physical/providers"
import { TRACKERS, TRACKER_ORDER, type TrackerId } from "@/lib/store/tracking"

export type IntegrationCategory = "reviews" | "analytics" | "advertising" | "email" | "automation" | "shipping" | "print_on_demand" | "dropshipping" | "fulfillment" | "suppliers"

export const CATEGORY_NAMES: Record<IntegrationCategory, string> = {
  reviews: "Reviews",
  analytics: "Analytics",
  advertising: "Advertising",
  email: "Email marketing",
  automation: "Automation",
  shipping: "Shipping",
  print_on_demand: "Print on demand",
  dropshipping: "Dropshipping",
  fulfillment: "Fulfillment",
  suppliers: "Suppliers",
}
export const CATEGORY_ORDER: IntegrationCategory[] = ["reviews", "analytics", "advertising", "email", "automation", "shipping", "print_on_demand", "dropshipping", "fulfillment", "suppliers"]

export interface Integration {
  id: string
  name: string
  category: IntegrationCategory
  /** A file in /public/integrations, the service's own mark. */
  logo: string | null
  builtIn: boolean
  /** Physical commerce only. */
  physical: boolean
  kind: "tracker" | "commerce" | "listed" | "app"
  /** Made by Storelib and run inside it (kind "app"): its settings are its Set up card. */
  appId?: "storelib_reviews" | "courier_tracking" | "analytics_destinations" | "marketing_sync"
  /** appId marketing_sync: which email platform the sync card connects (lib/integrations/marketing/platforms.ts). */
  marketingProvider?: "brevo" | "mailerlite" | "kit"
  trackerId?: TrackerId
  providerId?: ProviderId
  summary: string
  /** What it does, in two short sentences, for the top of its page when the first paragraph of `about` is long. The whole of `about` is under "How it works". */
  lead?: string
  about: string[]
  glance: { label: string; value: string }[]
  data: string[]
  /** True while Storelib does not connect to it yet: a Coming soon page with Tell me when it's ready, never a Connect button. */
  comingSoon?: boolean
  /** Turned off for every store from /admin (lib/integrations/overrides.ts): shown, never installable. */
  paused?: boolean
  docsUrl?: string
}

const TRACKER_COPY: Record<TrackerId, { category: IntegrationCategory; logo: string | null; summary: string; about: string[]; counts: string; docs: string }> = {
  ga4: {
    category: "analytics",
    logo: "/integrations/google-analytics.svg",
    summary: "See who visits your website, where they come from and what they read.",
    about: ["Google Analytics loads on every page of your website and counts each visit in your own Google Analytics property.", "An order paid at your shop's checkout for products that ship is sent as a purchase, with its value, when the buyer reaches their order page. Downloads, courses and memberships are counted in Storelib Analytics only, for now."],
    counts: "Page views and purchases",
    docs: "https://support.google.com/analytics/answer/9539598",
  },
  gtm: {
    category: "analytics",
    logo: "/integrations/google-tag-manager.svg",
    summary: "Run your own tags from one Google Tag Manager container.",
    about: ["Tag Manager loads your container on every page of your website. Whatever you publish in it runs there, so you can add tags without touching your site.", "What runs is up to your container: check what you publish there, because it runs for your buyers."],
    counts: "Whatever your container sends",
    docs: "https://support.google.com/tagmanager/answer/14842164",
  },
  google_ads: {
    category: "advertising",
    logo: "/integrations/google-ads.svg",
    summary: "Build audiences from your visitors for Google Ads.",
    about: ["The Google tag loads with your Google Ads conversion ID on every page of your website, so visitors can be added to your remarketing lists.", "An order paid at your shop's checkout for products that ship is sent to Google Ads as a purchase, with its value and currency, when the buyer reaches their order page. Downloads, courses and memberships are counted in Storelib Analytics only, for now."],
    counts: "Page views",
    docs: "https://support.google.com/google-ads/answer/7548399",
  },
  meta_pixel: {
    category: "advertising",
    logo: "/integrations/meta.svg",
    summary: "Reach your visitors again on Facebook and Instagram.",
    about: ["The Meta Pixel loads on every page of your website and sends a PageView, so you can build custom audiences and measure your ads.", "An order paid at your shop's checkout for products that ship is sent to Meta as a purchase, with its value and currency, when the buyer reaches their order page. Downloads, courses and memberships are counted in Storelib Analytics only, for now."],
    counts: "PageView and Purchase",
    docs: "https://www.facebook.com/business/help/952192354843755",
  },
  tiktok_pixel: {
    category: "advertising",
    logo: "/integrations/tiktok.svg",
    summary: "Measure and retarget your TikTok ads.",
    about: ["The TikTok Pixel loads on every page of your website and reports each page view to TikTok Ads Manager.", "An order paid at your shop's checkout for products that ship is sent to TikTok as a purchase, with its value and currency, when the buyer reaches their order page. Downloads, courses and memberships are counted in Storelib Analytics only, for now."],
    counts: "Page views",
    docs: "https://ads.tiktok.com/help/article/get-started-pixel",
  },
  pinterest_tag: {
    category: "advertising",
    logo: "/integrations/pinterest.svg",
    summary: "Build audiences from your visitors for Pinterest ads.",
    about: ["The Pinterest Tag loads on every page of your website and records each page visit for your Pinterest ad account.", "An order paid at your shop's checkout for products that ship is sent to Pinterest as a purchase, with its value and currency, when the buyer reaches their order page. Downloads, courses and memberships are counted in Storelib Analytics only, for now."],
    counts: "Page visits",
    docs: "https://help.pinterest.com/en/business/article/install-the-pinterest-tag",
  },
  clarity: {
    category: "analytics",
    logo: "/integrations/microsoft-clarity.png",
    summary: "Heatmaps and session recordings of how people use your website.",
    about: ["Microsoft Clarity loads on every page of your website and records how visitors scroll, click and move, as heatmaps and replays in your own Clarity project.", "Clarity hides what visitors type into fields by default. Check its masking settings before you rely on it."],
    counts: "Page views, clicks and scrolls",
    docs: "https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup",
  },
  klaviyo: {
    category: "email",
    logo: "/integrations/klaviyo.png",
    summary: "Your subscribers, customers and orders in Klaviyo, and its sign-up forms on your website.",
    about: [
      "Connect your Klaviyo account with a private API key and choose a list. The people who said yes to your emails (the news box at checkout, a sign up form, a contact you added with consent) join that list. Buyers who did not ask become profiles in Klaviyo, never list members.",
      "Every sale is sent as it happens, downloads included: Placed Order and Ordered Product, then Fulfilled Order, Canceled Order and Refunded Order. A checkout whose news box was ticked sends Started Checkout, for your abandoned checkout flow.",
      "Unsubscribes go both ways: someone who leaves in Klaviyo stops getting your Storelib emails, and someone who leaves on Storelib is unsubscribed in Klaviyo. Klaviyo's onsite script also loads on every page of your website with your public site ID, so your Klaviyo sign-up forms show there.",
    ],
    counts: "Form sign-ups and Active on Site",
    docs: "https://help.klaviyo.com/hc/en-us/articles/115005080407",
  },
  omnisend: {
    category: "email",
    logo: "/integrations/omnisend.png",
    summary: "Your subscribers, customers and orders in Omnisend, and its forms on your website.",
    about: [
      "Connect your Omnisend brand with an API key. The people who said yes to your emails are email subscribers there; buyers who did not ask are contacts with no subscription.",
      "Every sale is sent as it happens, downloads included, as Omnisend's own order events: placed order, paid for order, order fulfilled, order canceled and order refunded, so its order confirmation, shipping and win back automations work.",
      "Unsubscribes go both ways: someone who leaves in Omnisend stops getting your Storelib emails, and someone who leaves on Storelib is unsubscribed in Omnisend. Omnisend's snippet also loads on every page of your website with your brand ID, so your Omnisend forms show there.",
    ],
    counts: "Page views and form sign-ups",
    docs: "https://support.omnisend.com/en/articles/1061818-omnisend-snippet",
  },
}

const PROVIDER_LOGO: Partial<Record<ProviderId, string>> = {
  printful: "/integrations/printful.svg",
  printify: "/integrations/printify.png",
  gelato: "/integrations/gelato.png",
  cj_dropshipping: "/integrations/cj-dropshipping.png",
  shipstation: "/integrations/shipstation.png",
  shippo: "/integrations/shippo.png",
  easypost: "/integrations/easypost.png",
  shippypro: "/integrations/shippypro.png",
}

/** A line a card can carry, in the store's words. */
const PROVIDER_SUMMARY: Partial<Record<ProviderId, string>> = {
  manual: "Pack and ship orders yourself, then add the tracking.",
  supplier_email: "Every paid order emailed to your supplier with the address.",
  custom_webhook: "Every paid order sent to your own system, signed.",
  csv: "Unfulfilled orders as a spreadsheet, for a warehouse.",
  printful: "Shirts, mugs and prints made and shipped when they sell.",
  printify: "Print on demand from a network of print partners.",
  gelato: "Print on demand, printed close to your buyer.",
  cj_dropshipping: "A supplier's catalogue, shipped straight to your buyer.",
  shipstation: "Your orders in ShipStation to label, tracking back to your buyer.",
  shippo: "Buy and print labels from the order page.",
  easypost: "Buy and print labels from the order page.",
  shippypro: "The carriers you use in Italy, Romania and the rest of the EU.",
}

const PROVIDER_CATEGORY: Record<ProviderInfo["category"], IntegrationCategory> = {
  shipping: "shipping",
  print_on_demand: "print_on_demand",
  dropshipping: "dropshipping",
  fulfillment: "fulfillment",
  supplier: "suppliers",
}

/** Its page's address: ?integration=google-analytics */
const TRACKER_SLUG: Record<TrackerId, string> = { ga4: "google-analytics", gtm: "google-tag-manager", google_ads: "google-ads", meta_pixel: "meta-pixel", tiktok_pixel: "tiktok-pixel", pinterest_tag: "pinterest-tag", clarity: "microsoft-clarity", klaviyo: "klaviyo", omnisend: "omnisend" }

function fromTracker(id: TrackerId): Integration {
  const t = TRACKERS[id]
  const c = TRACKER_COPY[id]
  return {
    id: TRACKER_SLUG[id],
    name: t.name,
    category: c.category,
    logo: c.logo,
    builtIn: false,
    physical: false,
    kind: "tracker",
    trackerId: id,
    summary: c.summary,
    about: c.about,
    glance: [
      { label: "Works on", value: "Every page of your website" },
      { label: "Sends", value: c.counts },
      { label: "You add", value: `${t.label}, like ${t.example}` },
      { label: "Price", value: "Free on Storelib" },
    ],
    data: [
      `${t.name} receives what its tag collects on your website: the page, the visitor's browser and the cookies its tag sets.`,
      "Storelib doesn't send it your buyers' names, emails or addresses. A purchase it hears about is the order's number, value and currency. Your own Storelib Analytics keeps working as before.",
      "Where cookie consent is required, asking for it is up to you.",
    ],
    docsUrl: c.docs,
    ...(MARKETING_SYNC[id] ? { data: MARKETING_SYNC[id]!.data, glance: MARKETING_SYNC[id]!.glance } : {}),
  }
}

/**
 * Klaviyo and Omnisend take more than their script once connected with a
 * key (lib/integrations/marketing/sync-server.ts): what flows in and out,
 * in the seller's words.
 */
function marketingData(name: string): string[] {
  return [
    `Out to ${name}: the email address and name of the people who said yes to your emails (only they are subscribed), the email and name of your other buyers (as customers, with no subscription), and each order: its number, items, prices, totals, discount code, delivery address and tracking.`,
    `In from ${name}: who unsubscribed there, so Storelib stops emailing them. Nothing else is read.`,
    `Your ${name} key is checked with ${name}, stored encrypted on Storelib's server and never sent back to your browser: this page shows its last four characters. Disconnect and nothing more is sent.`,
  ]
}
const MARKETING_SYNC: Partial<Record<TrackerId, { data: string[]; glance: { label: string; value: string }[] }>> = {
  klaviyo: {
    data: marketingData("Klaviyo"),
    glance: [
      { label: "Sends", value: "Subscribers, customers, orders" },
      { label: "Reads back", value: "Unsubscribes" },
      { label: "You add", value: "A private API key and a list" },
      { label: "Price", value: "Free on Storelib; Klaviyo's own pricing applies" },
    ],
  },
  omnisend: {
    data: marketingData("Omnisend"),
    glance: [
      { label: "Sends", value: "Subscribers, customers, orders" },
      { label: "Reads back", value: "Unsubscribes" },
      { label: "You add", value: "An API key" },
      { label: "Price", value: "Free on Storelib; Omnisend's own pricing applies" },
    ],
  },
}

/** Printful, Printify, Gelato and CJ, connected: how an order gets there and tracking gets back, in the seller's words. */
const CONNECT_ABOUT: Partial<Record<ProviderId, string[]>> = {
  printful: [
    "Connect your Printful store with a private token. Storelib makes a location called Printful. A product you sell as Print on demand at that location goes to Printful when it is paid: each item by the SKU its Printful variant has, with the buyer's delivery address.",
    "Orders wait in Printful as drafts until you approve them, so Printful charges you only then. Turn on Send orders straight to production and they are made as soon as they are paid.",
    "When Printful ships a parcel, its carrier and tracking number come back to the order and your buyer gets the shipping email from your store. A product Printful doesn't have under that SKU is not sent: the order says so, for you to send it yourself.",
  ],
  printify: [
    "Connect your Printify shop with a personal access token. Storelib makes a location called Printify. A product you sell as Print on demand at that location goes to Printify when it is paid: each item by the SKU its Printify variant has, with the buyer's delivery address.",
    "Printify keeps each order on hold until you approve it there, and charges you only then. Turn on Send orders straight to production and they go to the print provider as soon as they are paid.",
    "When a parcel ships, and again when it is delivered, Printify tells Storelib: the tracking reaches the order and your buyer gets the shipping and delivery emails from your store. A SKU Printify doesn't have is not sent: the order says so, for you to send it yourself.",
  ],
  gelato: [
    "Connect Gelato with an API key. Storelib makes a location called Gelato. A product you sell as Print on demand at that location goes to Gelato when it is paid, printed in the Gelato country closest to your buyer.",
    "Match each variant once, in Storelib: the Gelato product UID for its size and colour, and your print file's https address. Storelib checks the product with Gelato before saving. A variant that isn't matched is never sent: the order says so, for you to send it yourself.",
    "Orders wait in Gelato as drafts until you approve them, so Gelato charges you only then. Turn on Send orders straight to production and they are made as soon as they are paid, by the shipment method you choose.",
    "Paste Storelib's address into Gelato's webhooks and each tracking code comes back as soon as Gelato has it; until then Storelib checks Gelato every few hours. Your buyer gets the shipping and delivery emails from your store.",
  ],
  cj_dropshipping: [
    "Connect CJ with your CJ API key. Storelib makes a location called CJ Dropshipping. A product you sell as Dropshipping at that location goes to CJ when it is paid, shipped from the CJ warehouse country you choose.",
    "Match each variant to a CJ variant once, by searching CJ's catalogue by SKU or words. A variant whose SKU is exactly CJ's goes without a match, because CJ confirms it. Anything else is never sent: the order says so, for you to send it yourself.",
    "Each order is made in CJ unpaid, for you to pay there. Turn on Send orders straight to production and it is confirmed and paid from your CJ balance as soon as your buyer pays; if the balance is too low, the order says so.",
    "CJ tells Storelib when an order ships and its tracking moves; your buyer gets the shipping and delivery emails from your store. Turn on Keep stock in step with CJ on a product and its stock follows CJ's warehouses.",
  ],
}

/** Shippo, EasyPost and ShipStation (lib/integrations/shipping): what each does once connected. */
const LABEL_ABOUT = (name: string) => [
  `Connect your ${name} account with its API key. In an order, Fulfill items has Buy a label: choose the package (from Settings › Shipping › Packages, the default one first), and ${name} shows its live rates for the order's address and the address of the location it ships from. The address is checked first and anything ${name} finds wrong with it is shown before you buy.`,
  "Pick a rate and buy: the label opens as a PDF to print, the items are marked shipped with the carrier and tracking number, and your buyer gets the shipping email with the tracking link. The label's cost is kept on the order as your cost; the buyer is not charged for it.",
  `A label you haven't used can be voided from the order: ${name} refunds it once the carrier agrees, and the items go back to unfulfilled. A test key buys free sample labels, so you can try it first.`,
]
Object.assign(CONNECT_ABOUT, {
  shippo: LABEL_ABOUT("Shippo"),
  easypost: LABEL_ABOUT("EasyPost"),
  shipstation: [
    "Connect ShipStation with the API key and API secret from ShipStation › Settings › Account › API Settings. Storelib becomes one of your stores there.",
    "Each paid order with items you ship yourself is sent to ShipStation with the items, their SKUs and weights, the delivery your buyer chose and their address. Cancel the order, or change its address, and ShipStation is updated too. Items a print partner or supplier sends are left out.",
    "Print the label in ShipStation as you always do. ShipStation tells Storelib when it ships, and the carrier and tracking number come back to the order: the items are marked shipped and your buyer gets the shipping email with the tracking link.",
  ],
} satisfies Partial<Record<ProviderId, string[]>>)

const CONNECT_DATA: Partial<Record<ProviderId, (name: string) => string[]>> = {
  shippo: (name) => [
    `When you ask for rates or buy a label, ${name} receives the parcel's size and weight, your location's address, and the buyer's name, delivery address, phone and email, as the carrier needs them. Nothing is sent until you press Get rates.`,
    `Back from ${name}: the rates, the label PDF, the carrier and the tracking number, kept on the order with the label's cost.`,
    `Your ${name} key is checked with ${name}, stored encrypted on Storelib's server and never sent back to your browser: this page shows only its last four characters.`,
  ],
  shipstation: (name) => [
    `Each paid order you ship goes to ${name} with its number, the items (name, SKU, quantity, price, weight), the totals, the delivery chosen, the buyer's note, and the buyer's name, address, phone and email. Cancellations and address changes follow.`,
    `Back from ${name}: each shipment's carrier and tracking number. ${name} only says that something shipped; Storelib then reads the shipment from ${name} with your key before anything changes on the order.`,
    `Your ${name} key and secret are checked with ${name}, stored encrypted on Storelib's server and never sent back to your browser: this page shows only their last four characters.`,
  ],
}
CONNECT_DATA.easypost = CONNECT_DATA.shippo

function fromProvider(p: ProviderInfo): Integration {
  const builtIn = p.availability === "live"
  const connects = p.availability === "connect"
  return {
    id: p.id.replace(/_/g, "-"),
    name: p.name,
    category: PROVIDER_CATEGORY[p.category],
    logo: PROVIDER_LOGO[p.id] ?? null,
    builtIn,
    physical: true,
    kind: "commerce",
    providerId: p.id,
    summary: PROVIDER_SUMMARY[p.id] ?? p.description.split(". ")[0].replace(/\.$/, "") + ".",
    about: connects ? (CONNECT_ABOUT[p.id] ?? [p.description]) : builtIn ? [p.description] : [p.description, "Press Tell me when it's ready and you'll be counted: the integrations asked for most are built first."],
    glance: [
      { label: "Works with", value: "Physical products" },
      { label: "Status", value: builtIn ? "Works today" : connects ? "Works once connected" : "Coming soon" },
      /* Coming soon takes nothing, so it doesn't say what you would add. */
      ...(builtIn || connects ? [{ label: "You add", value: p.fields.length === 0 ? "Nothing" : p.id === "printful" ? "A private token" : p.id === "printify" ? "A personal access token" : p.id === "cj_dropshipping" ? "Your CJ API key" : p.fields.map((f) => ({ api_key: "An API key", api_secret: "An API secret", url: "A webhook address", email: "An email address", webhook_secret: "A signing secret" })[f]).join(", ") }] : []),
      { label: "Price", value: builtIn ? "Free" : `Free on Storelib; ${p.name}'s own pricing applies` },
    ],
    data: builtIn
      ? ["Nothing leaves Storelib except what this integration is for: the order's items and the delivery address, to whoever ships it."]
      : connects && CONNECT_DATA[p.id]
        ? CONNECT_DATA[p.id]!(p.name)
      : connects
        ? [
            `Each order sent to ${p.name} carries the items (${p.id === "gelato" ? "the matched Gelato product and print file" : p.id === "cj_dropshipping" ? "the matched CJ variant" : "by SKU"}) and quantity, the order number, and the buyer's name, delivery address, email and phone, so it can be shipped. Nothing about your other orders or products is sent.`,
            `Your ${p.name} ${p.id === "printful" || p.id === "printify" ? "token" : "key"} is checked with ${p.name}, stored encrypted on Storelib's server and never sent back to your browser: this page shows only its last four characters.`,
            `${p.name} tells Storelib which of its orders shipped; Storelib then reads that order from ${p.name} with your ${p.id === "printful" || p.id === "printify" ? "token" : "key"} before anything changes on yours.`,
            ...(p.id === "cj_dropshipping" ? ["Coming back from CJ: each order's status and tracking number, and, for the products you turn it on for, the stock in CJ's warehouses."] : []),
          ]
        : [`Nothing is sent to ${p.name}. When it is connected, its page will say exactly what goes there before you turn it on.`],
    comingSoon: !builtIn && !connects,
    docsUrl: p.docsUrl,
  }
}

/**
 * ASKED FOR, NOT CONNECTED YET. The services merchants name most, each with a
 * page that says what it would do and that Storelib does not connect to it
 * yet. "Tell me when it's ready" is a request, counted in /admin, so the
 * order they are built in follows what stores ask for.
 */
const LISTED: { id: string; name: string; category: IntegrationCategory; physical: boolean; summary: string; about: string; docsUrl: string; logo?: string }[] = [
  { id: "easyship", logo: "/integrations/easyship.png", name: "Easyship", category: "shipping", physical: true, summary: "Compare carriers and print discounted labels, with duties shown at checkout.", about: "Easyship would compare rates from many carriers, print labels at its discounted prices and work out duties and taxes for orders going abroad.", docsUrl: "https://developers.easyship.com/" },
  { id: "sendcloud", logo: "/integrations/sendcloud.jpg", name: "Sendcloud", category: "shipping", physical: true, summary: "Labels from European carriers, shipping rules and a returns portal.", about: "Sendcloud would print labels from European carriers in bulk, apply your shipping rules and give buyers a returns portal.", docsUrl: "https://api.sendcloud.dev/" },
  { id: "nshift", logo: "/integrations/nshift.png", name: "nShift", category: "shipping", physical: true, summary: "Labels and tracking from Nordic and European carriers.", about: "nShift would print labels from the carriers on your nShift contract and send tracking back. Its API is open only to nShift customers under contract.", docsUrl: "https://nshift.com/" },
  { id: "bigbuy", logo: "/integrations/bigbuy.png", name: "BigBuy", category: "dropshipping", physical: true, summary: "A European wholesaler that ships from Spain, fast across the EU.", about: "BigBuy would supply products from its warehouse in Spain and ship your orders across Europe under your store's name.", docsUrl: "https://api.bigbuy.eu/" },
  { id: "dropified", logo: "/integrations/dropified.png", name: "Dropified", category: "dropshipping", physical: true, summary: "Import products from many suppliers and order them in one click.", about: "Dropified would import products from AliExpress, eBay and private label suppliers and place your orders with them in one click.", docsUrl: "https://www.dropified.com/" },
  { id: "prodigi", logo: "/integrations/prodigi.png", name: "Prodigi", category: "print_on_demand", physical: true, summary: "Gallery quality art prints, framed prints and photo books.", about: "Prodigi would print your art prints, framed prints, canvases and photo books in its labs in the UK, Europe, the US and Australia and ship them to your buyers.", docsUrl: "https://www.prodigi.com/print-api/docs/" },
  { id: "hotjar", name: "Hotjar", category: "analytics", physical: false, logo: "/integrations/hotjar.svg", summary: "Heatmaps, recordings and quick surveys on your website.", about: "Hotjar would load on your website to show where visitors click and scroll, record sessions, and ask short on-page surveys.", docsUrl: "https://help.hotjar.com/" },
  { id: "snapchat-pixel", name: "Snapchat Pixel", category: "advertising", physical: false, logo: "/integrations/snapchat.svg", summary: "Measure and retarget your Snapchat ads.", about: "The Snap Pixel would load on your website and report page views and purchases to Snapchat Ads Manager, for audiences and conversion tracking.", docsUrl: "https://businesshelp.snapchat.com/s/article/snap-pixel-about" },
  { id: "reddit-pixel", name: "Reddit Pixel", category: "advertising", physical: false, logo: "/integrations/reddit.svg", summary: "Track conversions and build audiences for Reddit ads.", about: "The Reddit Pixel would load on your website and report page views and purchases to Reddit Ads, so you can measure campaigns and retarget visitors.", docsUrl: "https://business.reddithelp.com/s/article/Install-the-Reddit-Pixel-on-your-website" },
  { id: "dsers", logo: "/integrations/dsers.png", name: "DSers", category: "dropshipping", physical: true, summary: "AliExpress products, orders placed with the supplier in bulk.", about: "DSers imports products from AliExpress and places your orders with the supplier for you.", docsUrl: "https://www.dsers.com/" },
  { id: "zendrop", logo: "/integrations/zendrop.png", name: "Zendrop", category: "dropshipping", physical: true, summary: "US and global suppliers with fast shipping and custom packaging.", about: "Zendrop finds suppliers, fulfils orders and can add your own packaging.", docsUrl: "https://www.zendrop.com/" },
  { id: "spocket", logo: "/integrations/spocket.png", name: "Spocket", category: "dropshipping", physical: true, summary: "Suppliers in the US and Europe, shipped straight to your buyer.", about: "Spocket lists products from suppliers mostly in the US and Europe and ships them to your buyers.", docsUrl: "https://www.spocket.co/" },
  { id: "autods", logo: "/integrations/autods.png", name: "AutoDS", category: "dropshipping", physical: true, summary: "Product imports, price and stock monitoring, automatic orders.", about: "AutoDS imports products, keeps their price and stock in step with the supplier and orders them automatically.", docsUrl: "https://www.autods.com/" },
  { id: "syncee", logo: "/integrations/syncee.png", name: "Syncee", category: "dropshipping", physical: true, summary: "Wholesale and dropshipping suppliers from one marketplace.", about: "Syncee connects you with wholesale and dropshipping suppliers and keeps their catalogue in sync.", docsUrl: "https://syncee.com/" },
  { id: "mailchimp", logo: "/integrations/mailchimp.svg", name: "Mailchimp", category: "email", physical: false, summary: "Your subscribers and buyers in your Mailchimp audience.", about: "Mailchimp would receive your Storelib subscribers and buyers in one of your audiences, with their consent.", docsUrl: "https://mailchimp.com/developer/" },
  { id: "zapier", logo: "/integrations/zapier.svg", name: "Zapier", category: "automation", physical: false, summary: "Send new orders and subscribers to thousands of apps.", about: "Zapier would start your Zaps from Storelib events: a new order, a new subscriber, a refund.", docsUrl: "https://zapier.com/" },
  { id: "make", logo: "/integrations/make.svg", name: "Make", category: "automation", physical: false, summary: "Visual automations started by your store's events.", about: "Make would start your scenarios from Storelib events, like a new order or a new subscriber.", docsUrl: "https://www.make.com/" },
]

function fromListed(l: (typeof LISTED)[number]): Integration {
  return {
    id: l.id,
    name: l.name,
    category: l.category,
    logo: l.logo ?? null,
    builtIn: false,
    physical: l.physical,
    kind: "listed",
    summary: l.summary,
    about: [l.about, `Storelib doesn't connect to ${l.name} yet. Press Tell me when it's ready and you'll be counted: the integrations asked for most are built first.`],
    glance: [
      { label: "Status", value: "Coming soon" },
      { label: "Works with", value: l.physical ? "Physical products" : "Every store" },
      { label: "Price", value: `${l.name}'s own pricing applies` },
    ],
    data: [`Nothing is sent to ${l.name}. When it is connected, its page will say exactly what goes there before you turn it on.`],
    comingSoon: true,
    docsUrl: l.docsUrl,
  }
}

/**
 * STORELIB'S OWN APPS. Storelib Reviews: product reviews like Shopify's
 * Product Reviews or Judge.me, on the store's own data (the reviews the
 * creator page and Explore already show).
 */
const STORELIB_APPS: Integration[] = [
  {
    id: "storelib-reviews",
    name: "Storelib Reviews",
    category: "reviews",
    logo: null,
    builtIn: false,
    physical: false,
    kind: "app",
    appId: "storelib_reviews",
    summary: "Collect product reviews by email and show them on your website.",
    about: [
      "Buyers get an email from your store a few days after they buy, or after their parcel arrives, with five stars to tap. The link opens a review page on your website, with no account needed, and photos if you allow them.",
      "Turn it on and every product page shows the stars under the product name and the reviews under the product, in Storelib themes and imported ones, with stars on product cards too. Product reviews, Star rating, Reviews carousel and All reviews are sections you can add to any page, and your website has a reviews page at /reviews. Your creator page and Explore read the same reviews.",
      "Approve, hide, feature and answer reviews in Reviews. A review hidden by you is kept but leaves your store and its rating.",
    ],
    glance: [
      { label: "Made by", value: "Storelib" },
      { label: "Works on", value: "Your website, creator page and Explore" },
      { label: "Emails", value: "One ask and one reminder per item" },
      { label: "Price", value: "Free on Storelib" },
    ],
    data: [
      "Reviews stay in your Storelib store. Nothing is sent anywhere else.",
      "A review shows the buyer's first name and last initial, never their email or order.",
      "Buyers can turn review emails off from any of them, and are never asked again.",
    ],
  },
]

/**
 * EMAIL PLATFORMS, CONNECTED WITH A KEY (lib/integrations/marketing/
 * platforms.ts): the same sync as Klaviyo and Omnisend, also in Emails ›
 * Platforms. Consented subscribers onto the chosen list, unsubscribes both
 * ways, order events in each one's own terms.
 */
function marketingApp(id: "brevo" | "mailerlite" | "kit", name: string, logo: string | null, summary: string, events: string, docsUrl: string): Integration {
  const subscribersOnly = id !== "brevo"
  return {
    id,
    name,
    category: "email",
    logo,
    builtIn: false,
    physical: false,
    kind: "app",
    appId: "marketing_sync",
    marketingProvider: id,
    summary,
    about: [
      `Your subscribers who said yes go to ${name} within a minute of signing up anywhere on Storelib: your website, your OnePage, the checkout's news box, a community. Anyone who unsubscribes on Storelib is unsubscribed in ${name} too, and an unsubscribe in ${name} comes back to Storelib.`,
      events,
      subscribersOnly ? `Buyers who did not ask for news are never sent to ${name}: everyone in it can be mailed.` : `Buyers who did not ask for news are contacts on no list, so they get no campaign.`,
    ],
    glance: [
      { label: "Works with", value: "Every store" },
      { label: "You add", value: "An API key" },
      { label: "Price", value: `Free on Storelib; ${name}'s own pricing applies` },
    ],
    data: [
      `Sent to ${name}: each subscriber's email and name, and for orders the order number, total, currency and items.`,
      `Your ${name} key is checked with ${name}, stored encrypted on Storelib's server and never sent back to your browser: only its last four characters show.`,
      `${name} tells Storelib about unsubscribes through a webhook Storelib adds to your account, removed again when you disconnect.`,
    ],
    docsUrl,
  }
}

const MARKETING_APPS: Integration[] = [
  marketingApp("brevo", "Brevo", "/integrations/brevo.svg", "Your subscribers and orders in Brevo, unsubscribes both ways.", "Each order is a Brevo event: order_placed, order_fulfilled, order_cancelled and order_refunded, with its total and items, for your automations and segments.", "https://developers.brevo.com/"),
  marketingApp("mailerlite", "MailerLite", "/integrations/mailerlite.svg", "Your subscribers in a MailerLite group, buyers and refunds as groups.", "A subscriber who buys joins the Storelib buyers group, and one refunded joins Storelib refunded, so your automations can start from them.", "https://developers.mailerlite.com/"),
  marketingApp("kit", "Kit", "/integrations/kit.svg", "Your subscribers in Kit with your tag, buyers and refunds as tags.", "A subscriber who buys gets the Storelib buyer tag, and one refunded the Storelib refunded tag, so your sequences can start from them.", "https://developers.kit.com/"),
]

/**
 * COURIER TRACKING (lib/physical/tracking): built into Storelib for every
 * store that ships, with Storelib's own tracking account. AfterShip is also
 * listed under its own name, because that is what stores search for: its page
 * is the same panel, where a store can follow its parcels with its own
 * AfterShip (or 17TRACK) account instead.
 */
const TRACKING_ABOUT = [
  "Every shipment with a tracking number is followed with the carrier, whoever ships it: you, a supplier, or a partner like Printful or Printify. Over a thousand carriers work, found from the number when you don't pick one.",
  "The order moves on by itself: in transit, out for delivery, delivered, or a delivery problem. Your buyer's order page shows each scan with where and when, and the estimated delivery. They get the Out for delivery, Delivered and Delivery issue emails once each, and you get an email when a parcel runs into a problem.",
  "Delivered uses the carrier's own time, so the return window counts from the day the parcel arrived. You can still set any status yourself, and pause automatic updates on one package from its menu.",
]
const TRACKING_DATA = [
  "Sent to the tracking service: the tracking number, the carrier when you picked one, and the order's id. Never the buyer's name, address or email.",
  "Back from it: where the parcel is, each scan with its place and time, and the estimated delivery.",
  "With your own AfterShip or 17TRACK account, your key is encrypted on Storelib's servers and never shown again, only its last four characters.",
]
const TRACKING_APPS: Integration[] = [
  {
    id: "courier-tracking",
    name: "Courier tracking",
    category: "shipping",
    logo: null,
    builtIn: true,
    physical: true,
    kind: "app",
    appId: "courier_tracking",
    summary: "Every parcel followed with its carrier, and your buyers told when it moves.",
    about: TRACKING_ABOUT,
    glance: [
      { label: "Made by", value: "Storelib" },
      { label: "Carriers", value: "Over 1,000, through AfterShip or 17TRACK" },
      { label: "Emails", value: "Out for delivery, Delivered, Delivery issue" },
      { label: "Price", value: "Free on Storelib" },
    ],
    data: TRACKING_DATA,
  },
  {
    id: "aftership",
    name: "AfterShip",
    category: "shipping",
    logo: "/integrations/aftership.svg",
    builtIn: false,
    physical: true,
    kind: "app",
    appId: "courier_tracking",
    summary: "Follow your parcels with your own AfterShip account.",
    about: ["Storelib already follows every parcel for you (Courier tracking). If you have your own AfterShip account, add its API key here and your parcels are followed there instead, with your AfterShip carriers and settings.", ...TRACKING_ABOUT.slice(1)],
    glance: [
      { label: "Works with", value: "Physical products" },
      { label: "You add", value: "An API key, and a webhook secret for instant updates" },
      { label: "Price", value: "Free on Storelib; AfterShip's own pricing applies" },
    ],
    data: TRACKING_DATA,
    docsUrl: "https://www.aftership.com/docs/tracking",
  },
]

/**
 * SEND ANALYTICS (lib/analytics/destinations): Storelib's own page views,
 * purchases, refunds, signups and memberships sent on from the server to
 * Google Analytics 4, Meta's Conversions API, PostHog or a signed webhook,
 * and read by other tools through the read only Analytics API. The same
 * list as Analytics › Send to.
 */
const ANALYTICS_APPS: Integration[] = [
  {
    id: "send-analytics",
    name: "Send analytics",
    category: "analytics",
    logo: null,
    builtIn: false,
    physical: false,
    kind: "app",
    appId: "analytics_destinations",
    summary: "Your Storelib analytics in Google Analytics, Meta, PostHog or your own system.",
    about: [
      "Storelib sends what it already counts from its own server: page views, purchases with their items, refunds, signups and memberships. Google Analytics 4 gets them through the Measurement Protocol, Meta through the Conversions API, PostHog as events, and your own system as signed JSON.",
      "A purchase is sent with the same id your store's browser pixel uses, so Google and Meta count it once. A tool that is busy or down is asked again for a day. Google Ads conversions come from Google Analytics 4: link the two and import purchase and generate_lead.",
      "The Analytics API gives a spreadsheet or a script your daily visitors, views, orders and revenue, and your top products and pages, with a read only key you can revoke.",
    ],
    glance: [
      { label: "Made by", value: "Storelib" },
      { label: "Sends to", value: "Google Analytics 4, Meta, PostHog, a webhook" },
      { label: "You add", value: "The tool's own ID and key" },
      { label: "Price", value: "Free on Storelib" },
    ],
    data: [
      "A visitor's ids and browser details go only when their cookie choice allows it: analytics for Google Analytics and PostHog, marketing for Meta.",
      "Emails and phone numbers go to Google and Meta only as SHA-256 hashes, and only with marketing consent. PostHog never gets them.",
      "Test sales and free claims are never sent. Keys are encrypted on Storelib's servers and never shown again.",
    ],
  },
]

/** The top of a page, short (round I4: "don't have that much text"). Only where the first paragraph runs long. */
const LEAD: Record<string, string> = {
  shippypro: "Labels and rates from the carriers on your own ShippyPro account. Coming soon: it has not been run against a real ShippyPro account yet.",
  "storelib-reviews": "Buyers get an email asking for a review. Reviews show on your website with stars.",
  "send-analytics": "Page views, purchases, refunds and signups from Storelib's server to Google Analytics 4, Meta, PostHog or your own system.",
  "courier-tracking": "Every parcel is followed with its carrier. Your buyer sees each scan and hears when it's out for delivery and delivered.",
  aftership: "Follow your parcels with your own AfterShip account instead of Storelib's.",
  klaviyo: "Your subscribers, buyers and every order go to Klaviyo. Unsubscribes come back.",
  omnisend: "Your subscribers, buyers and every order go to Omnisend. Unsubscribes come back.",
  brevo: "Your subscribers and every order go to Brevo. Unsubscribes come back.",
  mailerlite: "Your subscribers go to MailerLite, buyers and refunds as groups. Unsubscribes come back.",
  kit: "Your subscribers go to Kit, buyers and refunds as tags. Unsubscribes come back.",
  printful: "Products you sell as print on demand go to Printful when they're paid. Tracking comes back to the order.",
  printify: "Products you sell as print on demand go to Printify when they're paid. Tracking comes back to the order.",
  gelato: "Products you sell as print on demand go to Gelato when they're paid, printed close to your buyer. Tracking comes back.",
  "cj-dropshipping": "Products you sell as dropshipping go to CJ when they're paid. Tracking comes back to the order.",
  shippo: "Buy a label from the order page at Shippo's live rates. Your buyer gets the tracking link.",
  easypost: "Buy a label from the order page at EasyPost's live rates. Your buyer gets the tracking link.",
  shipstation: "Paid orders go to ShipStation. Print the label there and the tracking comes back to the order.",
}

/*
  NATIVE FULFILMENT IS NOT AN INTEGRATION. Shipping it yourself is what every
  store does with nothing set up; a supplier's email is a location's "Who
  ships the orders?" (Settings › Locations); the CSV of unfulfilled orders is
  Orders › Export. They were cards here too, beside real services, and made
  the catalog read as if Storelib's own features had to be installed. The
  providers stay in lib/physical/providers.ts, where orders route by them.
  Your own system (webhook) stays: its address and secret are set on its card.
*/
const NOT_LISTED = new Set(["manual", "supplier_email", "csv"])

export const INTEGRATIONS: Integration[] = [...STORELIB_APPS, ...ANALYTICS_APPS, ...TRACKING_APPS, ...TRACKER_ORDER.map(fromTracker), ...MARKETING_APPS, ...PROVIDERS.filter((p) => !NOT_LISTED.has(p.id)).map(fromProvider), ...LISTED.map(fromListed)].map((i) => (LEAD[i.id] ? { ...i, lead: LEAD[i.id] } : i))

/** Where a card stands, in the words it shows (badges and the Install section). */
export type IntegrationStatus = "built_in" | "installed" | "needs_attention" | "error" | "available" | "coming_soon"
export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  built_in: "Built in",
  installed: "Installed",
  needs_attention: "Needs attention",
  error: "Error",
  available: "Available",
  coming_soon: "Coming soon",
}

export function integrationById(id: string | null | undefined): Integration | null {
  return INTEGRATIONS.find((i) => i.id === id) ?? null
}

/** What a store sees: everything, or without the physical ones while physical commerce is off. */
export function visibleIntegrations(physical: boolean): Integration[] {
  return INTEGRATIONS.filter((i) => physical || !i.physical)
}

/** A search over names, summaries and categories. */
export function searchIntegrations(list: Integration[], q: string): Integration[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return list
  return list.filter((i) => {
    const hay = `${i.name} ${i.summary} ${CATEGORY_NAMES[i.category]}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}
