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
 *              (lib/physical/providers.ts); while physical commerce is on
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

export type IntegrationCategory = "analytics" | "advertising" | "email" | "automation" | "shipping" | "print_on_demand" | "dropshipping" | "fulfillment" | "suppliers"

export const CATEGORY_NAMES: Record<IntegrationCategory, string> = {
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
export const CATEGORY_ORDER: IntegrationCategory[] = ["analytics", "advertising", "email", "automation", "shipping", "print_on_demand", "dropshipping", "fulfillment", "suppliers"]

export interface Integration {
  id: string
  name: string
  category: IntegrationCategory
  /** A file in /public/integrations, the service's own mark. */
  logo: string | null
  builtIn: boolean
  /** Physical commerce only. */
  physical: boolean
  kind: "tracker" | "commerce" | "listed"
  trackerId?: TrackerId
  providerId?: ProviderId
  summary: string
  about: string[]
  glance: { label: string; value: string }[]
  data: string[]
  /** True while Storelib keeps the key but does not send orders there yet, or connects to it not at all (listed). */
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
    logo: null,
    summary: "Heatmaps and session recordings of how people use your website.",
    about: ["Microsoft Clarity loads on every page of your website and records how visitors scroll, click and move, as heatmaps and replays in your own Clarity project.", "Clarity hides what visitors type into fields by default. Check its masking settings before you rely on it."],
    counts: "Page views, clicks and scrolls",
    docs: "https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup",
  },
  klaviyo: {
    category: "email",
    logo: null,
    summary: "Your Klaviyo sign-up forms and onsite tracking on your website.",
    about: ["Klaviyo's onsite script loads on every page of your website with your public site ID, so the sign-up forms you publish in Klaviyo show on your site and visitors who are already in Klaviyo are seen when they come back.", "Not connected yet: your Storelib subscribers and orders are not sent to Klaviyo. Keep exporting subscribers from Storelib for now."],
    counts: "Form sign-ups and Active on Site",
    docs: "https://help.klaviyo.com/hc/en-us/articles/115005080407",
  },
  omnisend: {
    category: "email",
    logo: null,
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

function fromProvider(p: ProviderInfo): Integration {
  const builtIn = p.availability === "live"
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
    about: [p.description],
    glance: [
      { label: "Works with", value: "Physical products" },
      { label: "Status", value: builtIn ? "Works today" : "Key stored, orders not sent yet" },
      { label: "You add", value: p.fields.length === 0 ? "Nothing" : p.fields.map((f) => ({ api_key: "An API key", url: "A webhook address", email: "An email address", webhook_secret: "A signing secret" })[f]).join(", ") },
      { label: "Price", value: builtIn ? "Free" : `Free on Storelib; ${p.name}'s own pricing applies` },
    ],
    data: builtIn
      ? ["Nothing leaves Storelib except what this integration is for: the order's items and the delivery address, to whoever ships it."]
      : [`Your ${p.name} key is stored encrypted and never shown again, only its last four characters.`, `When orders go to ${p.name}, they will carry the items and the delivery address and nothing else.`],
    comingSoon: !builtIn,
    docsUrl: p.docsUrl,
  }
}

/**
 * ASKED FOR, NOT CONNECTED YET. The services merchants name most, each with a
 * page that says what it would do and that Storelib does not connect to it
 * yet. "Tell me when it's ready" is a request, counted in /admin, so the
 * order they are built in follows what stores ask for.
 */
const LISTED: { id: string; name: string; category: IntegrationCategory; physical: boolean; summary: string; about: string; docsUrl: string }[] = [
  { id: "dsers", name: "DSers", category: "dropshipping", physical: true, summary: "AliExpress products, orders placed with the supplier in bulk.", about: "DSers imports products from AliExpress and places your orders with the supplier for you.", docsUrl: "https://www.dsers.com/" },
  { id: "zendrop", name: "Zendrop", category: "dropshipping", physical: true, summary: "US and global suppliers with fast shipping and custom packaging.", about: "Zendrop finds suppliers, fulfils orders and can add your own packaging.", docsUrl: "https://www.zendrop.com/" },
  { id: "spocket", name: "Spocket", category: "dropshipping", physical: true, summary: "Suppliers in the US and Europe, shipped straight to your buyer.", about: "Spocket lists products from suppliers mostly in the US and Europe and ships them to your buyers.", docsUrl: "https://www.spocket.co/" },
  { id: "autods", name: "AutoDS", category: "dropshipping", physical: true, summary: "Product imports, price and stock monitoring, automatic orders.", about: "AutoDS imports products, keeps their price and stock in step with the supplier and orders them automatically.", docsUrl: "https://www.autods.com/" },
  { id: "syncee", name: "Syncee", category: "dropshipping", physical: true, summary: "Wholesale and dropshipping suppliers from one marketplace.", about: "Syncee connects you with wholesale and dropshipping suppliers and keeps their catalogue in sync.", docsUrl: "https://syncee.com/" },
  { id: "mailchimp", name: "Mailchimp", category: "email", physical: false, summary: "Your subscribers and buyers in your Mailchimp audience.", about: "Mailchimp would receive your Storelib subscribers and buyers in one of your audiences, with their consent.", docsUrl: "https://mailchimp.com/developer/" },
  { id: "brevo", name: "Brevo", category: "email", physical: false, summary: "Email and SMS campaigns to your Storelib contacts.", about: "Brevo would receive your Storelib contacts for email and SMS campaigns.", docsUrl: "https://developers.brevo.com/" },
  { id: "zapier", name: "Zapier", category: "automation", physical: false, summary: "Send new orders and subscribers to thousands of apps.", about: "Zapier would start your Zaps from Storelib events: a new order, a new subscriber, a refund.", docsUrl: "https://zapier.com/" },
  { id: "make", name: "Make", category: "automation", physical: false, summary: "Visual automations started by your store's events.", about: "Make would start your scenarios from Storelib events, like a new order or a new subscriber.", docsUrl: "https://www.make.com/" },
]

function fromListed(l: (typeof LISTED)[number]): Integration {
  return {
    id: l.id,
    name: l.name,
    category: l.category,
    logo: null,
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

export const INTEGRATIONS: Integration[] = [...TRACKER_ORDER.map(fromTracker), ...PROVIDERS.map(fromProvider), ...LISTED.map(fromListed)]

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
