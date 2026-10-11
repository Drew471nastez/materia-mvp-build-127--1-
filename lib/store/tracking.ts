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

export type TrackerId = "ga4" | "gtm" | "google_ads" | "meta_pixel" | "tiktok_pixel" | "pinterest_tag" | "clarity" | "klaviyo" | "omnisend"

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
  /** How an ID is tidied: upper case (the default), lower case, or exactly as typed (a Klaviyo site ID is case sensitive). */
  letters?: "upper" | "lower" | "exact"
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
  clarity: {
    id: "clarity",
    name: "Microsoft Clarity",
    label: "Project ID",
    example: "k3x9q2w7ab",
    pattern: /^[a-z0-9]{6,16}$/,
    where: "Clarity › your project › Settings › Overview.",
    hosts: ["https://www.clarity.ms", "https://*.clarity.ms", "https://c.bing.com"],
    letters: "lower",
  },
  klaviyo: {
    id: "klaviyo",
    name: "Klaviyo",
    label: "Public API key (site ID)",
    example: "AbC123",
    pattern: /^[A-Za-z0-9]{6}$/,
    where: "Klaviyo › Settings › Account › API keys, the six characters under Public API key.",
    hosts: ["https://*.klaviyo.com", "https://klaviyo.com"],
    letters: "exact",
  },
  omnisend: {
    id: "omnisend",
    name: "Omnisend",
    label: "Brand ID",
    example: "5f8a1b2c3d4e5f6a7b8c9d0e",
    pattern: /^[a-f0-9]{24}$/,
    where: "Omnisend › Store settings › Connect store › your brand ID.",
    hosts: ["https://omnisnippet1.com", "https://*.omnisnippet1.com", "https://*.omnisend.com"],
    letters: "lower",
  },
}

export const TRACKER_ORDER: TrackerId[] = ["ga4", "gtm", "google_ads", "meta_pixel", "tiktok_pixel", "pinterest_tag", "clarity", "klaviyo", "omnisend"]

/** The services purchaseTags below tells about a paid order. The others (Clarity, Klaviyo, Omnisend) only load on the pages. */
export const PURCHASE_TRACKERS: TrackerId[] = ["ga4", "gtm", "google_ads", "meta_pixel", "tiktok_pixel", "pinterest_tag"]

/** "A, B and C", for a sentence. */
function inWords(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/** What Website settings › Commerce says about the integrations, from this list, so a service added here is named there. */
export function trackersHint(): string {
  const pagesOnly = TRACKER_ORDER.filter((id) => !PURCHASE_TRACKERS.includes(id)).map((id) => TRACKERS[id].name.replace(/^Microsoft /, ""))
  return `${inWords(TRACKER_ORDER.map((id) => TRACKERS[id].name))} load on every page of this website once you add them. Each paid order is reported to them once${pagesOnly.length ? `, except ${inWords(pagesOnly)}` : ""}.`
}

export type Tracking = Partial<Record<TrackerId, string>>

/** An ID as typed, tidied: spaces gone, letters in the case its service issues. Empty is "remove it". */
export function tidyId(id: TrackerId, typed: unknown): string | null | "bad" {
  if (typed === null || typed === undefined) return null
  if (typeof typed !== "string") return "bad"
  const bare = typed.replace(/\s+/g, "")
  const letters = TRACKERS[id].letters ?? "upper"
  const v = letters === "exact" ? bare : letters === "lower" ? bare.toLowerCase() : bare.toUpperCase()
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
  if (t.clarity) {
    tags.push({
      key: "clarity",
      inline: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${JSON.stringify(t.clarity)});`,
    })
  }
  /* Klaviyo's onsite script: its sign-up forms and its Active on Site tracking, by the store's public site ID. */
  if (t.klaviyo) tags.push({ key: "klaviyo", src: `https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=${encodeURIComponent(t.klaviyo)}` })
  if (t.omnisend) {
    tags.push({
      key: "omnisend",
      inline: `window.omnisend=window.omnisend||[];omnisend.push(["brandID",${JSON.stringify(t.omnisend)}]);omnisend.push(["track","$pageViewed"]);!function(){var e=document.createElement("script");e.type="text/javascript",e.async=!0,e.src="https://omnisnippet1.com/inshop/launcher-v2.js";var t=document.getElementsByTagName("script")[0];t.parentNode.insertBefore(e,t)}();`,
    })
  }
  return tags
}

/** Every host a tag above loads from or reports to, for the content security policy. */
export const TRACKER_HOSTS = [...new Set(TRACKER_ORDER.flatMap((id) => TRACKERS[id].hosts))]

/**
 * A PAID ORDER, TOLD TO THE STORE'S PIXELS. Run once, on the buyer's order
 * page as it opens straight after paying (never on a later visit to it), so
 * each order is one purchase in each service: GA4 and Google Ads a
 * `purchase`, Tag Manager a `purchase` in its data layer, Meta a `Purchase`,
 * TikTok a `CompletePayment`, Pinterest a `checkout`. Only the order's
 * number, value and currency go: no name, no email, no address. Once told,
 * `paid` is taken off the address, so a reload is a later visit.
 */
export function purchaseTags(stored: unknown, order: { id: string; valueCents: number; currency: string; quantity: number }): { key: string; inline: string }[] {
  const t = readTracking(stored)
  if (!/^[A-Za-z0-9-]{1,64}$/.test(order.id) || !/^[A-Z]{3}$/.test(order.currency.toUpperCase())) return []
  const value = Math.max(0, Math.round(order.valueCents)) / 100
  const currency = JSON.stringify(order.currency.toUpperCase())
  const id = JSON.stringify(order.id)
  const qty = Math.max(1, Math.floor(order.quantity) || 1)
  const out: string[] = []
  if (t.ga4 || t.google_ads) out.push(`if(window.gtag)gtag('event','purchase',{transaction_id:${id},value:${value},currency:${currency}});`)
  if (t.gtm) out.push(`window.dataLayer=window.dataLayer||[];dataLayer.push({event:'purchase',transaction_id:${id},event_id:${id},ecommerce:{transaction_id:${id},value:${value},currency:${currency}}});`)
  if (t.meta_pixel) out.push(`if(window.fbq)fbq('track','Purchase',{value:${value},currency:${currency}},{eventID:${id}});`)
  if (t.tiktok_pixel) out.push(`if(window.ttq)ttq.track('CompletePayment',{value:${value},currency:${currency},content_type:'product'},{event_id:${id}});`)
  if (t.pinterest_tag) out.push(`if(window.pintrk)pintrk('track','checkout',{value:${value},order_quantity:${qty},currency:${currency},order_id:${id}});`)
  if (out.length === 0) return []
  /* After the base tags (afterInteractive), so each service's queue is there to take it. Then ?paid=1
     comes off the address (history.replaceState, the router's state kept), so a reload or Back to the
     page does not tell the pixels again; the order's id goes with each as its event id, for the
     services that drop a repeat (Meta eventID, TikTok event_id, Tag Manager transaction_id). */
  const unpaid = `try{var u=new URL(location.href);if(u.searchParams.has('paid')){u.searchParams.delete('paid');history.replaceState(history.state,'',u.pathname+u.search+u.hash);}}catch(e){}`
  return [{ key: "purchase", inline: `(function(){var go=function(){try{${out.join("")}}catch(e){}${unpaid}};if(document.readyState==='complete')setTimeout(go,0);else window.addEventListener('load',function(){setTimeout(go,0)});})();` }]
}
