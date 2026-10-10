/**
 * ===========================================================================
 *  ANALYTICS AND AD PIXELS ON A STORE'S WEBSITE
 * ===========================================================================
 * Settings › Integrations: a store pastes the ID its analytics or ad account
 * gave it, and every page of its website (the Online store) loads that
 * service's own tag. Kept in store_settings.tracking (SQL part 112).
 *
 * ONLY AN ID, NEVER CODE. Each ID is checked against the exact shape its
 * service issues (a GA4 measurement ID is G- and letters and digits, a Meta
 * pixel is digits) and the tag is Storelib's copy of the service's published
 * snippet with that ID in it. A store can't put a script of its own on the
 * page through here, and an ID that is not one is refused when it is saved
 * and skipped if it ever reaches a page.
 *
 * What it counts: page views on the website, which is what each service's
 * base tag does. Paying happens on Storelib's checkout, on storelib.com, so
 * a purchase is counted in Storelib's own Analytics and the integration's
 * page says so rather than promise a purchase event it can't send.
 */

export type TrackerId = "ga4" | "gtm" | "google_ads" | "meta_pixel" | "tiktok_pixel" | "pinterest_tag"

export interface TrackerInfo {
  id: TrackerId
  name: string
  /** The field's label and an example of what goes in it. */
  label: string
  example: string
  pattern: RegExp
  /** Where to find it, in a line. */
  where: string
  /** Hosts its tag loads from and sends to, for the content security policy (lib/security/csp.ts). */
  hosts: string[]
}

export const TRACKERS: Record<TrackerId, TrackerInfo> = {
  ga4: {
    id: "ga4",
    name: "Google Analytics",
    label: "Measurement ID",
    example: "G-1A2B3C4D5E",
    pattern: /^G-[A-Z0-9]{4,16}$/,
    where: "Google Analytics › Admin › Data streams › your web stream.",
    hosts: ["https://www.googletagmanager.com", "https://*.google-analytics.com", "https://*.analytics.google.com"],
  },
  gtm: {
    id: "gtm",
    name: "Google Tag Manager",
    label: "Container ID",
    example: "GTM-ABC1234",
    pattern: /^GTM-[A-Z0-9]{4,12}$/,
    where: "Tag Manager, at the top of your workspace, next to the container's name.",
    hosts: ["https://www.googletagmanager.com"],
  },
  google_ads: {
    id: "google_ads",
    name: "Google Ads",
    label: "Conversion ID",
    example: "AW-123456789",
    pattern: /^AW-[0-9]{6,12}$/,
    where: "Google Ads › Goals › Conversions › Google tag.",
    hosts: ["https://www.googletagmanager.com", "https://googleads.g.doubleclick.net", "https://www.google.com"],
  },
  meta_pixel: {
    id: "meta_pixel",
    name: "Meta Pixel",
    label: "Pixel ID",
    example: "1234567890123456",
    pattern: /^[0-9]{10,20}$/,
    where: "Meta Events Manager › Data sources › your pixel.",
    hosts: ["https://connect.facebook.net", "https://www.facebook.com"],
  },
  tiktok_pixel: {
    id: "tiktok_pixel",
    name: "TikTok Pixel",
    label: "Pixel ID",
    example: "C4A1B2C3D4E5F6G7H8I9",
    pattern: /^[A-Z0-9]{12,30}$/,
    where: "TikTok Ads Manager › Tools › Events › Web events.",
    hosts: ["https://analytics.tiktok.com"],
  },
  pinterest_tag: {
    id: "pinterest_tag",
    name: "Pinterest Tag",
    label: "Tag ID",
    example: "2612345678901",
    pattern: /^[0-9]{10,16}$/,
    where: "Pinterest Ads › Conversions › Tag manager.",
    hosts: ["https://s.pinimg.com", "https://ct.pinterest.com"],
  },
}

export const TRACKER_ORDER: TrackerId[] = ["ga4", "gtm", "google_ads", "meta_pixel", "tiktok_pixel", "pinterest_tag"]

export type Tracking = Partial<Record<TrackerId, string>>

/** An ID as typed, tidied: spaces gone, letters upper case. Empty is "remove it". */
export function tidyId(id: TrackerId, typed: unknown): string | null | "bad" {
  if (typed === null || typed === undefined) return null
  if (typeof typed !== "string") return "bad"
  const v = typed.replace(/\s+/g, "").toUpperCase()
  if (!v) return null
  return TRACKERS[id].pattern.test(v) ? v : "bad"
}

/** What is stored, read back: only IDs of the right shape survive. */
export function readTracking(stored: unknown): Tracking {
  const out: Tracking = {}
  if (!stored || typeof stored !== "object") return out
  for (const id of TRACKER_ORDER) {
    const v = (stored as Record<string, unknown>)[id]
    if (typeof v === "string" && TRACKERS[id].pattern.test(v)) out[id] = v
  }
  return out
}

/**
 * The tags for a page: each service's own snippet, with its checked ID in
 * it. `src` is loaded as a script; `inline` runs once. Nothing here comes
 * from the store but the IDs, and each is checked again here.
 */
export function trackingTags(stored: unknown): { key: string; src?: string; inline?: string }[] {
  const t = readTracking(stored)
  const tags: { key: string; src?: string; inline?: string }[] = []
  const gtagIds = [t.ga4, t.google_ads].filter(Boolean) as string[]
  if (gtagIds.length) {
    tags.push({ key: "gtag-src", src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gtagIds[0])}` })
    tags.push({
      key: "gtag",
      inline: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${gtagIds.map((id) => `gtag('config',${JSON.stringify(id)});`).join("")}`,
    })
  }
  if (t.gtm) {
    tags.push({
      key: "gtm",
      inline: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${JSON.stringify(t.gtm)});`,
    })
  }
  if (t.meta_pixel) {
    tags.push({
      key: "meta",
      inline: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(t.meta_pixel)});fbq('track','PageView');`,
    })
  }
  if (t.tiktok_pixel) {
    tags.push({
      key: "tiktok",
      inline: `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load(${JSON.stringify(t.tiktok_pixel)});ttq.page();}(window,document,'ttq');`,
    })
  }
  if (t.pinterest_tag) {
    tags.push({
      key: "pinterest",
      inline: `!function(e){if(!window.pintrk){window.pintrk=function(){window.pintrk.queue.push(Array.prototype.slice.call(arguments))};var n=window.pintrk;n.queue=[],n.version="3.0";var t=document.createElement("script");t.async=!0,t.src=e;var r=document.getElementsByTagName("script")[0];r.parentNode.insertBefore(t,r)}}("https://s.pinimg.com/ct/core.js");pintrk('load',${JSON.stringify(t.pinterest_tag)});pintrk('page');`,
    })
  }
  return tags
}

/** Every host a tag above loads from or reports to, for the content security policy. */
export const TRACKER_HOSTS = [...new Set(TRACKER_ORDER.flatMap((id) => TRACKERS[id].hosts))]
