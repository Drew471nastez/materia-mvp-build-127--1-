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
 *
 * Built in means it works with nothing to connect. A provider whose orders
 * Storelib does not send yet says so on its page; nothing here claims a
 * connection that isn't there.
 */
import { PROVIDERS, type ProviderId, type ProviderInfo } from "@/lib/physical/providers"
import { TRACKERS, TRACKER_ORDER, type TrackerId } from "@/lib/store/tracking"

export type IntegrationCategory = "analytics" | "advertising" | "shipping" | "print_on_demand" | "dropshipping" | "fulfillment" | "suppliers"

export const CATEGORY_NAMES: Record<IntegrationCategory, string> = {
  analytics: "Analytics",
  advertising: "Advertising",
  shipping: "Shipping",
  print_on_demand: "Print on demand",
  dropshipping: "Dropshipping",
  fulfillment: "Fulfillment",
  suppliers: "Suppliers",
}
export const CATEGORY_ORDER: IntegrationCategory[] = ["analytics", "advertising", "shipping", "print_on_demand", "dropshipping", "fulfillment", "suppliers"]

export interface Integration {
  id: string
  name: string
  category: IntegrationCategory
  /** A file in /public/integrations, the service's own mark. */
  logo: string | null
  builtIn: boolean
  /** Physical commerce only. */
  physical: boolean
  kind: "tracker" | "commerce"
  trackerId?: TrackerId
  providerId?: ProviderId
  summary: string
  about: string[]
  glance: { label: string; value: string }[]
  data: string[]
  /** True while Storelib keeps the key but does not send orders there yet. */
  comingSoon?: boolean
  docsUrl?: string
}

const TRACKER_COPY: Record<TrackerId, { category: IntegrationCategory; logo: string; summary: string; about: string[]; counts: string; docs: string }> = {
  ga4: {
    category: "analytics",
    logo: "/integrations/google-analytics.svg",
    summary: "See who visits your website, where they come from and what they read.",
    about: ["Google Analytics loads on every page of your website and counts each visit in your own Google Analytics property.", "Use it beside Storelib's Analytics when you already report in Google, or to join your website up with other Google tools."],
    counts: "Page views",
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
    about: ["The Google tag loads with your Google Ads conversion ID on every page of your website, so visitors can be added to your remarketing lists.", "Purchases happen on Storelib checkout, so they are counted in Storelib Analytics, not sent to Google Ads."],
    counts: "Page views",
    docs: "https://support.google.com/google-ads/answer/7548399",
  },
  meta_pixel: {
    category: "advertising",
    logo: "/integrations/meta.svg",
    summary: "Reach your visitors again on Facebook and Instagram.",
    about: ["The Meta Pixel loads on every page of your website and sends a PageView, so you can build custom audiences and measure your ads.", "Purchases happen on Storelib checkout, so they are counted in Storelib Analytics, not sent to Meta."],
    counts: "PageView",
    docs: "https://www.facebook.com/business/help/952192354843755",
  },
  tiktok_pixel: {
    category: "advertising",
    logo: "/integrations/tiktok.svg",
    summary: "Measure and retarget your TikTok ads.",
    about: ["The TikTok Pixel loads on every page of your website and reports each page view to TikTok Ads Manager.", "Purchases happen on Storelib checkout, so they are counted in Storelib Analytics, not sent to TikTok."],
    counts: "Page views",
    docs: "https://ads.tiktok.com/help/article/get-started-pixel",
  },
  pinterest_tag: {
    category: "advertising",
    logo: "/integrations/pinterest.svg",
    summary: "Build audiences from your visitors for Pinterest ads.",
    about: ["The Pinterest Tag loads on every page of your website and records each page visit for your Pinterest ad account.", "Purchases happen on Storelib checkout, so they are counted in Storelib Analytics, not sent to Pinterest."],
    counts: "Page visits",
    docs: "https://help.pinterest.com/en/business/article/install-the-pinterest-tag",
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
const TRACKER_SLUG: Record<TrackerId, string> = { ga4: "google-analytics", gtm: "google-tag-manager", google_ads: "google-ads", meta_pixel: "meta-pixel", tiktok_pixel: "tiktok-pixel", pinterest_tag: "pinterest-tag" }

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
      "Storelib doesn't send it your buyers' names, emails or orders. Your own Storelib Analytics keeps working as before.",
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

export const INTEGRATIONS: Integration[] = [...TRACKER_ORDER.map(fromTracker), ...PROVIDERS.map(fromProvider)]

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
