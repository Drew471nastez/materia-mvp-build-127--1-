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
 *              Printful and Printify take orders and send tracking back
 *              (lib/integrations/fulfilment); the rest of the shipping and
 *              dropshipping services are Coming soon, never a Connect button
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
  appId?: "storelib_reviews"
  trackerId?: TrackerId
  providerId?: ProviderId
  summary: string
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
    summary: "Your Klaviyo sign-up forms and onsite tracking on your website.",
    about: ["Klaviyo's onsite script loads on every page of your website with your public site ID, so the sign-up forms you publish in Klaviyo show on your site and visitors who are already in Klaviyo are seen when they come back.", "Not connected yet: your Storelib subscribers and orders are not sent to Klaviyo. Keep exporting subscribers from Storelib for now."],
    counts: "Form sign-ups and Active on Site",
    docs: "https://help.klaviyo.com/hc/en-us/articles/115005080407",
  },
  omnisend: {
    category: "email",
    logo: "/integrations/omnisend.png",
    summary: "Omnisend forms and page tracking on your website.",
    about: ["Omnisend's snippet loads on every page of your website with your brand ID, so your Omnisend forms show there and page views are tracked for your automations.", "Not connected yet: your Storelib subscribers and orders are not sent to Omnisend."],
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
  shipstation: "Labels and live carrier rates for every order.",
  shippo: "Discounted labels and live rates from many carriers.",
  easypost: "Labels and tracking from one shipping API.",
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
  }
}

/** Printful and Printify, connected: how an order gets there and tracking gets back, in the seller's words. */
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
}

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
      ...(builtIn || connects ? [{ label: "You add", value: p.fields.length === 0 ? "Nothing" : p.id === "printful" ? "A private token" : p.id === "printify" ? "A personal access token" : p.fields.map((f) => ({ api_key: "An API key", url: "A webhook address", email: "An email address", webhook_secret: "A signing secret" })[f]).join(", ") }] : []),
      { label: "Price", value: builtIn ? "Free" : `Free on Storelib; ${p.name}'s own pricing applies` },
    ],
    data: builtIn
      ? ["Nothing leaves Storelib except what this integration is for: the order's items and the delivery address, to whoever ships it."]
      : connects
        ? [
            `Each order sent to ${p.name} carries the items by SKU and quantity, the order number, and the buyer's name, delivery address, email and phone, so it can be shipped. Nothing about your other orders or products is sent.`,
            `Your ${p.name} token is checked with ${p.name}, stored encrypted on Storelib's server and never sent back to your browser: this page shows only its last four characters.`,
            `${p.name} tells Storelib which of its orders shipped; Storelib then reads that order from ${p.name} with your token before anything changes on yours.`,
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
  { id: "aftership", name: "AfterShip", category: "shipping", physical: true, logo: "/integrations/aftership.svg", summary: "A branded tracking page and delivery updates for every parcel.", about: "AfterShip would follow each shipment across carriers and send your buyers branded delivery updates and a tracking page.", docsUrl: "https://www.aftership.com/docs" },
  { id: "easyship", logo: "/integrations/easyship.png", name: "Easyship", category: "shipping", physical: true, summary: "Compare carriers and print discounted labels, with duties shown at checkout.", about: "Easyship would compare rates from many carriers, print labels at its discounted prices and work out duties and taxes for orders going abroad.", docsUrl: "https://developers.easyship.com/" },
  { id: "sendcloud", logo: "/integrations/sendcloud.jpg", name: "Sendcloud", category: "shipping", physical: true, summary: "Labels from European carriers, shipping rules and a returns portal.", about: "Sendcloud would print labels from European carriers in bulk, apply your shipping rules and give buyers a returns portal.", docsUrl: "https://api.sendcloud.dev/" },
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
  { id: "brevo", logo: "/integrations/brevo.svg", name: "Brevo", category: "email", physical: false, summary: "Email and SMS campaigns to your Storelib contacts.", about: "Brevo would receive your Storelib contacts for email and SMS campaigns.", docsUrl: "https://developers.brevo.com/" },
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
      "Reviews show on your website with the Product reviews, Star rating, Reviews carousel and All reviews sections, and on a reviews page at /reviews. Imported Shopify themes show their own stars from the same ratings. Your creator page and Explore read the same reviews.",
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

export const INTEGRATIONS: Integration[] = [...STORELIB_APPS, ...TRACKER_ORDER.map(fromTracker), ...PROVIDERS.map(fromProvider), ...LISTED.map(fromListed)]

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
