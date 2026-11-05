import { tt } from "@/lib/i18n/text"
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

import { GA_PAGE_JS, gaConsentJs, gaSeenJs, scriptJson, type GaItem } from "./ga"
import { majorValue } from "@/lib/analytics/pixels"

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
    get label() { return tt("Measurement ID") },
    example: "G-1A2B3C4D5E",
    pattern: /^G-[A-Z0-9]{4,16}$/,
    get where() { return tt("Google Analytics › Admin › Data streams › your web stream.") },
    hosts: ["https://www.googletagmanager.com", "https://*.google-analytics.com", "https://*.analytics.google.com"],
  },
  gtm: {
    id: "gtm",
    name: "Google Tag Manager",
    get label() { return tt("Container ID") },
    example: "GTM-ABC1234",
    pattern: /^GTM-[A-Z0-9]{4,12}$/,
    get where() { return tt("Tag Manager, at the top of your workspace, next to the container's name.") },
    hosts: ["https://www.googletagmanager.com"],
  },
  google_ads: {
    id: "google_ads",
    name: "Google Ads",
    get label() { return tt("Conversion ID") },
    example: "AW-123456789",
    pattern: /^AW-[0-9]{6,12}$/,
    get where() { return tt("Google Ads › Goals › Conversions › Google tag.") },
    hosts: ["https://www.googletagmanager.com", "https://googleads.g.doubleclick.net", "https://www.google.com"],
  },
  meta_pixel: {
    id: "meta_pixel",
    name: "Meta Pixel",
    get label() { return tt("Pixel ID") },
    example: "1234567890123456",
    pattern: /^[0-9]{10,20}$/,
    get where() { return tt("Meta Events Manager › Data sources › your pixel.") },
    hosts: ["https://connect.facebook.net", "https://www.facebook.com"],
  },
  tiktok_pixel: {
    id: "tiktok_pixel",
    name: "TikTok Pixel",
    get label() { return tt("Pixel ID") },
    example: "C4A1B2C3D4E5F6G7H8I9",
    pattern: /^[A-Z0-9]{12,30}$/,
    get where() { return tt("TikTok Ads Manager › Tools › Events › Web events.") },
    hosts: ["https://analytics.tiktok.com"],
  },
  pinterest_tag: {
    id: "pinterest_tag",
    name: "Pinterest Tag",
    get label() { return tt("Tag ID") },
    example: "2612345678901",
    pattern: /^[0-9]{10,16}$/,
    get where() { return tt("Pinterest Ads › Conversions › Tag manager.") },
    hosts: ["https://s.pinimg.com", "https://ct.pinterest.com"],
  },
  clarity: {
    id: "clarity",
    name: "Microsoft Clarity",
    get label() { return tt("Project ID") },
    example: "k3x9q2w7ab",
    pattern: /^[a-z0-9]{6,16}$/,
    get where() { return tt("Clarity › your project › Settings › Overview.") },
    hosts: ["https://www.clarity.ms", "https://*.clarity.ms", "https://c.bing.com"],
    letters: "lower",
  },
  klaviyo: {
    id: "klaviyo",
    name: "Klaviyo",
    get label() { return tt("Public API key (site ID)") },
    example: "AbC123",
    pattern: /^[A-Za-z0-9]{6}$/,
    get where() { return tt("Klaviyo › Settings › Account › API keys, the six characters under Public API key.") },
    hosts: ["https://*.klaviyo.com", "https://klaviyo.com"],
    letters: "exact",
  },
  omnisend: {
    id: "omnisend",
    name: "Omnisend",
    get label() { return tt("Brand ID") },
    example: "5f8a1b2c3d4e5f6a7b8c9d0e",
    pattern: /^[a-f0-9]{24}$/,
    get where() { return tt("Omnisend › Store settings › Connect store › your brand ID.") },
    hosts: ["https://omnisnippet1.com", "https://*.omnisnippet1.com", "https://*.omnisend.com"],
    letters: "lower",
  },
}

export const TRACKER_ORDER: TrackerId[] = ["ga4", "gtm", "google_ads", "meta_pixel", "tiktok_pixel", "pinterest_tag", "clarity", "klaviyo", "omnisend"]

/** The services purchaseTags below tells about a paid order. The others (Clarity, Klaviyo, Omnisend) only load on the pages. */
export const PURCHASE_TRACKERS: TrackerId[] = ["ga4", "gtm", "google_ads", "meta_pixel", "tiktok_pixel", "pinterest_tag"]

/** "A, B and C", for a sentence. */
function inWords(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : tt("{value} and {names}", { value: names.slice(0, -1).join(", "), names: names[names.length - 1] })
}

/** What Website settings › Commerce says about the integrations, from this list, so a service added here is named there. */
export function trackersHint(): string {
  const pagesOnly = TRACKER_ORDER.filter((id) => !PURCHASE_TRACKERS.includes(id)).map((id) => TRACKERS[id].name.replace(/^Microsoft /, ""))
  return tt("{value} load on every page of this website once you add them. Each paid order is reported to them once{value2}.", { value: inWords(TRACKER_ORDER.map((id) => TRACKERS[id].name)), value2: pagesOnly.length ? tt(", except {pagesOnly}", { pagesOnly: inWords(pagesOnly) }) : "" })
}

/**
 * WHAT IS KEPT. Each service's ID by its own key, and beside Google Ads its
 * purchase conversion's label (round 52, `google_ads_label`). The ID alone
 * loads the Google tag; a purchase is attributed to a conversion action
 * only when it names one, `send_to: 'AW-ID/label'`, so the label is what
 * makes Google Ads count a sale.
 */
export type Tracking = Partial<Record<TrackerId, string>> & { google_ads_label?: string }

/** A conversion label as Google Ads issues it: letters, digits, - and _, case sensitive. */
export const ADS_LABEL_PATTERN = /^[A-Za-z0-9_-]{6,40}$/

/**
 * A purchase conversion label as typed or pasted, tidied. Google's event
 * snippet names it as `'send_to': 'AW-123456789/AbC-D_efGh'`: pasted whole
 * or as that pair, the label is what follows the slash, and `id` is the
 * AW- ID it was issued with (a label is only good with its own ID). Empty
 * is "remove it".
 */
export function tidyAdsLabel(typed: unknown): { label: string; id: string | null } | null | "bad" {
  if (typed === null || typed === undefined) return null
  if (typeof typed !== "string") return "bad"
  const bare = typed.trim()
  if (!bare) return null
  const pair = bare.match(/(AW-[0-9]{6,12})\/([A-Za-z0-9_-]{6,40})(?![A-Za-z0-9_-])/i)
  if (pair) return { label: pair[2], id: pair[1].toUpperCase() }
  const label = bare.replace(/^['"]|['"]$/g, "")
  return ADS_LABEL_PATTERN.test(label) ? { label, id: null } : "bad"
}

/** An ID as typed, tidied: spaces gone, letters in the case its service issues. Empty is "remove it". */
export function tidyId(id: TrackerId, typed: unknown): string | null | "bad" {
  if (typed === null || typed === undefined) return null
  if (typeof typed !== "string") return "bad"
  const bare = typed.replace(/\s+/g, "")
  const letters = TRACKERS[id].letters ?? "upper"
  const v = letters === "exact" ? bare : letters === "lower" ? bare.toLowerCase() : bare.toUpperCase()
  if (!v) return null
  /* Exactly an ID. Google's whole snippet is read for its ID in Settings before it is sent (components/app/settings/ga-connect, lib/store/ga.ts readGaInput). */
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
  /* The label only with the ID it goes with. */
  const label = (stored as Record<string, unknown>).google_ads_label
  if (out.google_ads && typeof label === "string" && ADS_LABEL_PATTERN.test(label)) out.google_ads_label = label
  return out
}

/**
 * ROUND 40: THE AD PIXELS ASK FIRST. Meta, TikTok and Pinterest are
 * advertising (lib/consent/consent.ts, "marketing"), and they loaded for
 * every visitor whatever the cookie banner was told. Now each one reads the
 * visitor's own answer, the same cookie Google's consent mode reads
 * (gaConsentJs): a yes lets it send, a no keeps it quiet. With no answer
 * yet, on a page that shows the banner (`asks`), a browser whose time zone
 * is in Europe (the regions that need a yes first, as CONSENT_REGIONS is
 * for Google) waits; elsewhere it sends, as before. Meta waits with its own
 * consent call (fbq('consent','revoke'), then 'grant'), TikTok with its own
 * (ttq.holdConsent, then grantConsent), Pinterest by not loading until the
 * yes. A change on the banner (storelib:consent-changed) is followed at once.
 */
export function marketingConsentJs(asks: boolean): string {
  return (
    "window.__slMkOk=window.__slMkOk||function(asks){var m=document.cookie.match(/(?:^|;\\s*)storelib_consent=(\\d{1,3})(?:\\.|%2E)p[01](?:\\.|%2E)a[01](?:\\.|%2E)m([01])/);" +
    "if(m&&m[1]==='2')return m[2]==='1';if(!asks)return true;var z='';try{z=Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){}return !/^(Europe|Atlantic\\/(Reykjavik|Canary|Madeira|Azores|Faroe))\\//.test(z)};" +
    `window.__slMkAsks=${asks ? "true" : "false"};`
  )
}

/**
 * ROUND 51: THE ANALYTICS ANSWER, for Microsoft Clarity, read as
 * marketingConsentJs reads the marketing one: the visitor's Analytics answer
 * on the banner when there is one, else a wait in the regions that need a yes
 * first on a page that asks, else yes.
 */
export function analyticsConsentJs(): string {
  return (
    "window.__slAnOk=window.__slAnOk||function(asks){var m=document.cookie.match(/(?:^|;\\s*)storelib_consent=(\\d{1,3})(?:\\.|%2E)p[01](?:\\.|%2E)a([01])(?:\\.|%2E)m[01]/);" +
    "if(m&&m[1]==='2')return m[2]==='1';if(!asks)return true;var z='';try{z=Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){}return !/^(Europe|Atlantic\\/(Reykjavik|Canary|Madeira|Azores|Faroe))\\//.test(z)};"
  )
}

/**
 * The tags for a page: each service's own snippet, with its checked ID in
 * it. `src` is loaded as a script; `inline` runs once. Nothing here comes
 * from the store but the IDs, and each is checked again here.
 */
export function trackingTags(stored: unknown, opts: { creatorId?: string | null; asks?: boolean } = {}): { key: string; src?: string; inline?: string }[] {
  const t = readTracking(stored)
  const tags: { key: string; src?: string; inline?: string }[] = []
  const gtagIds = [t.ga4, t.google_ads].filter(Boolean) as string[]
  if (gtagIds.length) {
    tags.push({ key: "gtag-src", src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gtagIds[0])}` })
    /*
      Never in a frame (the editor's canvas, the Website page's preview: the
      owner looking at their own page is not a visit). Consent mode before
      anything else (lib/store/ga.ts gaConsentJs): never
      "denied" for every visitor, which is what keeps Google saying data
      collection isn't active. Then each ID's config, which sends the first
      page view; __slGaPage for the later pages of a page that changes
      without a full load; and, for Analytics, the line that tells Storelib
      Google took a hit (Settings shows "Receiving data").
    */
    tags.push({
      key: "gtag",
      inline: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}(function(){try{if(window.self!==window.top)return}catch(e){return}${gaConsentJs(opts.asks !== false)}gtag('js',new Date());${gtagIds.map((id) => `gtag('config',${JSON.stringify(id)});`).join("")}${t.ga4 && opts.creatorId ? gaSeenJs([t.ga4], opts.creatorId) : ""}})();${GA_PAGE_JS}`,
    })
  }
  if (t.gtm) {
    tags.push({
      key: "gtm",
      /*
        Consent mode's defaults before the container loads (round 51): with Tag Manager alone (no Analytics or Ads ID,
        so no gtag block above) the container's Google tags started with no consent state at all, so a visitor's No on
        the banner reached none of them. The same defaults and updates as the gtag block (lib/store/ga.ts gaConsentJs).
      */
      inline: `${gtagIds.length ? "" : `window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){dataLayer.push(arguments)};${gaConsentJs(opts.asks !== false)}`}(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${JSON.stringify(t.gtm)});`,
    })
  }
  const mk = marketingConsentJs(opts.asks !== false)
  if (t.meta_pixel) {
    tags.push({
      key: "meta",
      inline: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');${mk}if(!__slMkOk(__slMkAsks))fbq('consent','revoke');fbq('init',${JSON.stringify(t.meta_pixel)});fbq('track','PageView');try{window.addEventListener('storelib:consent-changed',function(){fbq('consent',__slMkOk(__slMkAsks)?'grant':'revoke')})}catch(e){}`,
    })
  }
  if (t.tiktok_pixel) {
    tags.push({
      key: "tiktok",
      inline: `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};${mk}if(!__slMkOk(__slMkAsks))ttq.holdConsent();ttq.load(${JSON.stringify(t.tiktok_pixel)});ttq.page();try{w.addEventListener('storelib:consent-changed',function(){__slMkOk(__slMkAsks)?ttq.grantConsent():ttq.revokeConsent()})}catch(e){}}(window,document,'ttq');`,
    })
  }
  if (t.pinterest_tag) {
    tags.push({
      key: "pinterest",
      /* Pinterest has no consent call of its own: it loads once there is a yes (marketingConsentJs). */
      inline: `${mk}(function(){var go=function(){if(window.__slPinOn||!__slMkOk(__slMkAsks))return;window.__slPinOn=1;!function(e){if(!window.pintrk){window.pintrk=function(){window.pintrk.queue.push(Array.prototype.slice.call(arguments))};var n=window.pintrk;n.queue=[],n.version="3.0";var t=document.createElement("script");t.async=!0,t.src=e;var r=document.getElementsByTagName("script")[0];r.parentNode.insertBefore(t,r)}}("https://s.pinimg.com/ct/core.js");pintrk('load',${JSON.stringify(t.pinterest_tag)});pintrk('page');};go();try{window.addEventListener('storelib:consent-changed',go)}catch(e){}})();`,
    })
  }
  if (t.clarity) {
    tags.push({
      key: "clarity",
      /*
        Clarity's own snippet, then its Consent API v2 (round 51): it used to record every visitor whatever the banner
        was told. clarity('consentv2', { analytics_Storage, ad_Storage }) with the visitor's Analytics and Marketing
        answers, and again when they change; Clarity keeps no cookie while analytics is denied.
      */
      inline: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${JSON.stringify(t.clarity)});${mk}${analyticsConsentJs()}(function(){var g=function(v){return v?'granted':'denied'};var u=function(){window.clarity('consentv2',{ad_Storage:g(__slMkOk(__slMkAsks)),analytics_Storage:g(__slAnOk(__slMkAsks))})};u();try{window.addEventListener('storelib:consent-changed',u)}catch(e){}})();`,
    })
  }
  /*
    Klaviyo's onsite script (its sign-up forms and Active on Site tracking, by the store's public site ID) and
    Omnisend's launcher are marketing, and set their own tracking cookies (__kla_id, omnisendContactID). Round 51:
    each loads once there is a yes, as Pinterest does (marketingConsentJs); they loaded for every visitor before.
  */
  if (t.klaviyo) {
    tags.push({
      key: "klaviyo",
      inline: `${mk}(function(){var go=function(){if(window.__slKlOn||!__slMkOk(__slMkAsks))return;window.__slKlOn=1;var e=document.createElement("script");e.async=!0;e.src=${JSON.stringify(`https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=${encodeURIComponent(t.klaviyo)}`)};var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(e,s)};go();try{window.addEventListener('storelib:consent-changed',go)}catch(e){}})();`,
    })
  }
  if (t.omnisend) {
    tags.push({
      key: "omnisend",
      inline: `${mk}(function(){var go=function(){if(window.__slOmOn||!__slMkOk(__slMkAsks))return;window.__slOmOn=1;window.omnisend=window.omnisend||[];omnisend.push(["brandID",${JSON.stringify(t.omnisend)}]);omnisend.push(["track","$pageViewed"]);var e=document.createElement("script");e.type="text/javascript",e.async=!0,e.src="https://omnisnippet1.com/inshop/launcher-v2.js";var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(e,s)};go();try{window.addEventListener('storelib:consent-changed',go)}catch(e){}})();`,
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
 * `purchase` (and Google Ads its conversion, when its label is saved), Tag Manager a `purchase` in its data layer, Meta a `Purchase`,
 * TikTok a `CompletePayment`, Pinterest a `checkout`. Only the order's
 * number, value and currency go: no name, no email, no address. Once told,
 * `paid` is taken off the address, so a reload is a later visit.
 */
export function purchaseTags(stored: unknown, order: { id: string; valueCents: number; currency: string; quantity: number; items?: GaItem[] }): { key: string; inline: string }[] {
  const t = readTracking(stored)
  if (!/^[A-Za-z0-9-]{1,64}$/.test(order.id) || !/^[A-Z]{3}$/.test(order.currency.toUpperCase())) return []
  /* In the currency's own decimals: a yen order's 2500 is 2500, not 25 (lib/analytics/pixels majorValue). */
  const value = majorValue(order.valueCents, order.currency.toUpperCase())
  const currency = JSON.stringify(order.currency.toUpperCase())
  const id = JSON.stringify(order.id)
  const qty = Math.max(1, Math.floor(order.quantity) || 1)
  const out: string[] = []
  /* With the products, when the page knows them, so GA's ecommerce reports name what sold (lib/store/ga.ts gaItem). */
  const items = order.items?.length ? `,items:${scriptJson(order.items.slice(0, 50))}` : ""
  if (t.ga4 || t.google_ads) out.push(`if(window.gtag)gtag('event','purchase',{transaction_id:${id},value:${value},currency:${currency}${items}});`)
  /*
    Google Ads' own purchase conversion (round 52), as its event snippet
    writes it: gtag('event','conversion',{send_to:'AW-ID/label',value,
    currency,transaction_id}). The purchase above reaches the Ads ID but
    names no conversion action, so Google Ads counted none. Under the same
    consent mode as every Google tag here (lib/store/ga.ts gaConsentJs: the
    banner's Marketing answer is ad_storage and ad_user_data), and once per
    order: in this browser by the guard below, at Google by transaction_id.
  */
  if (t.google_ads && t.google_ads_label) out.push(`if(window.gtag)gtag('event','conversion',{send_to:${JSON.stringify(`${t.google_ads}/${t.google_ads_label}`)},value:${value},currency:${currency},transaction_id:${id}});`)
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
  /* Once per order in this browser too: a thank you page opened again tells nobody twice (sl_tx, lib/consent STORED). */
  const once = `try{var k='sl_tx:'+${id};if(localStorage.getItem(k))return;localStorage.setItem(k,'1')}catch(e){}`
  return [{ key: "purchase", inline: `(function(){var go=function(){${unpaid}${once}try{${out.join("")}}catch(e){}};if(document.readyState==='complete')setTimeout(go,0);else window.addEventListener('load',function(){setTimeout(go,0)});})();` }]
}
