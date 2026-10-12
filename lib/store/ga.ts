/**
 * ===========================================================================
 *  GOOGLE ANALYTICS ON A STORE'S PAGES: THE ID, CONSENT, PAGE VIEWS, PROOF
 * ===========================================================================
 * Settings › Integrations › Google Analytics keeps one GA4 measurement ID
 * (lib/store/tracking.ts). This file is everything about it that is more
 * than "load gtag with the ID":
 *
 *   THE ID        what a person pastes is often not the ID: the whole
 *                 snippet Google shows, the tag's address, a Universal
 *                 Analytics UA- number (switched off by Google in 2024), a
 *                 property's number, a Google tag GT- ID. readGaInput finds
 *                 the G- ID in it, or says exactly what was pasted instead.
 *
 *   CONSENT       Google's consent mode, before the tag's first hit. Where a
 *                 page shows Storelib's cookie banner, visitors in the EEA,
 *                 the UK and Switzerland start as "denied" (Google still
 *                 gets a cookieless ping, and models them) until they press
 *                 Accept; everyone else, and every page with no banner,
 *                 starts as "granted". A visitor's own answer
 *                 (storelib_consent, lib/consent) always wins, on load and
 *                 the moment they change it. Never "denied" for everyone:
 *                 that is the setup that makes Google say "Data collection
 *                 isn't active" while visitors are on the site.
 *
 *   PAGE VIEWS    gtag's config sends the first one. A page whose next pages
 *                 open without a full load (the creator page, the OnePage)
 *                 sends each later one itself (window.__slGaPage), unless
 *                 Google's own "page changes" listener already did, so a
 *                 page is one view either way.
 *
 *   PROOF         the tag tells Storelib, at most once a tab, when Google
 *                 took a hit from it (a /g/collect request with this ID, as
 *                 the browser saw it): Settings shows "Receiving data" with
 *                 the time (app/api/store/ga-seen). Only the creator and the
 *                 ID go, never anything about the visitor.
 *
 * Pure and free of the DOM: the strings are run in the browser, and the
 * tests run them in a small fake one.
 */

/** A GA4 measurement ID, as lib/store/tracking.ts keeps it. */
export const GA_ID = /^G-[A-Z0-9]{4,16}$/

/** Where Google wants consent asked before anything is stored: the EEA, the UK and Switzerland. */
export const CONSENT_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT", "LV", "LI", "LT", "LU",
  "MT", "NL", "NO", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "GB", "CH",
] as const

export type GaInput = { ok: true; id: string } | { ok: false; error: string }

/**
 * The measurement ID in whatever was pasted: the ID itself in any case, the
 * snippet from Google's "Install manually", or the tag's address. Anything
 * else is named, so the person knows what to look for instead.
 */
export function readGaInput(typed: unknown): GaInput {
  if (typeof typed !== "string" || !typed.trim()) return { ok: false, error: "Paste your Measurement ID. It starts with G-." }
  const text = typed.trim()
  /* The ID inside a snippet or an address: gtag/js?id=G-…, gtag('config', 'G-…'). */
  const found = text.toUpperCase().match(/(?:^|[^A-Z0-9])(G-[A-Z0-9]{4,16})(?![A-Z0-9])/)
  if (found) return { ok: true, id: found[1] }
  const bare = text.replace(/\s+/g, "").toUpperCase()
  if (/^UA-\d+(-\d+)?$/.test(bare) || /(^|[^A-Z])UA-\d{4,}/.test(text.toUpperCase())) {
    return { ok: false, error: "That is a Universal Analytics ID (UA-). Google switched those off in 2024. Paste the Measurement ID of your GA4 web stream: it starts with G-." }
  }
  if (/^GT-[A-Z0-9]{4,16}$/.test(bare)) return { ok: false, error: "That is a Google tag ID (GT-). Open Admin › Data streams › your web stream and copy the Measurement ID: it starts with G-." }
  if (/^AW-\d{6,12}$/.test(bare)) return { ok: false, error: "That is a Google Ads ID. Add it under Google Ads; here goes the Measurement ID that starts with G-." }
  if (/^GTM-[A-Z0-9]{4,12}$/.test(bare)) return { ok: false, error: "That is a Tag Manager container. Add it under Google Tag Manager; here goes the Measurement ID that starts with G-." }
  if (/^\d{6,12}$/.test(bare)) return { ok: false, error: "That number is your property or stream ID. The Measurement ID is on the same stream page and starts with G-." }
  return { ok: false, error: "That isn't a Measurement ID. It looks like G-1A2B3C4D5E, under Admin › Data streams › your web stream." }
}

/** One product as GA4's ecommerce events take it. */
export interface GaItem {
  item_id: string
  item_name?: string
  price?: number
  quantity?: number
  item_variant?: string
  item_category?: string
}

/** A product's id, name and price (in cents), tidied for GA4: nothing else about it. */
export function gaItem(p: { id: string; title?: string | null; priceCents?: number | null; quantity?: number | null; variant?: string | null; kind?: string | null }): GaItem | null {
  if (typeof p.id !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(p.id)) return null
  const item: GaItem = { item_id: p.id }
  const name = typeof p.title === "string" ? p.title.replace(/\s+/g, " ").trim().slice(0, 100) : ""
  if (name) item.item_name = name
  if (typeof p.priceCents === "number" && Number.isFinite(p.priceCents) && p.priceCents >= 0) item.price = Math.round(p.priceCents) / 100
  if (typeof p.quantity === "number" && p.quantity > 0) item.quantity = Math.floor(p.quantity)
  const variant = typeof p.variant === "string" ? p.variant.trim().slice(0, 100) : ""
  if (variant) item.item_variant = variant
  if (p.kind === "physical" || p.kind === "digital") item.item_category = p.kind === "physical" ? "Physical" : "Digital"
  return item
}

/** A currency as GA4 takes it, or null. */
export function gaCurrency(c: unknown): string | null {
  return typeof c === "string" && /^[A-Za-z]{3}$/.test(c) ? c.toUpperCase() : null
}

/** JSON for a script: never closes the tag it is written in. */
export function scriptJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")
}

/**
 * Consent mode, before gtag('js') and every config. `asks`: this page shows
 * Storelib's cookie banner, so the regions that need a yes wait for it.
 * Analytics follows the banner's Analytics answer, the ad signals its
 * Marketing answer.
 */
export function gaConsentJs(asks: boolean): string {
  const denied = "{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500,region:" + JSON.stringify(CONSENT_REGIONS) + "}"
  const granted = "{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'}"
  return (
    (asks ? `gtag('consent','default',${denied});` : "") +
    `gtag('consent','default',${granted});` +
    /* The visitor's own answer (lib/consent/consent.ts: version 2, then p, a, m). */
    "(function(){function c(){var m=document.cookie.match(/(?:^|;\\s*)storelib_consent=(\\d{1,3})(?:\\.|%2E)p[01](?:\\.|%2E)a([01])(?:\\.|%2E)m([01])/);return m&&m[1]==='2'?{a:m[2]==='1',m:m[3]==='1'}:null}" +
    "function u(){var x=c();if(!x)return;var g=function(v){return v?'granted':'denied'};gtag('consent','update',{analytics_storage:g(x.a),ad_storage:g(x.m),ad_user_data:g(x.m),ad_personalization:g(x.m)})}" +
    "u();try{window.addEventListener('storelib:consent-changed',u)}catch(e){}})();"
  )
}

/**
 * window.__slGaPage(ids): a page that opened without a full load, as a
 * page_view to these IDs. Waits a moment and looks in the data layer first:
 * when Google's own "page changes based on browser history" is on, gtag has
 * already counted it (gtm.historyChange-v2 for this address), and a second
 * would count the page twice. The same address twice in a row is one view.
 */
export const GA_PAGE_JS =
  "window.__slGaPage=window.__slGaPage||function(ids){var w=window,href=location.href,dl=w.dataLayer||[],from=dl.length;" +
  "w.__slGaSent=w.__slGaSent||{};" +
  "setTimeout(function(){try{if(location.href!==href)return;var own=false;for(var i=from;i<dl.length;i++){var e=dl[i];if(e&&typeof e==='object'&&!('length' in e)&&/^gtm\\.historyChange/.test(String(e.event||''))&&(!e['gtm.newUrl']||e['gtm.newUrl']===href))own=true}" +
  "for(var j=0;j<ids.length;j++){var id=ids[j];if(w.__slGaSent[id]===href)continue;w.__slGaSent[id]=href;if(own||w['ga-disable-'+id])continue;w.gtag('event','page_view',{send_to:id,page_location:href,page_title:document.title})}}catch(x){}},700)};"

/**
 * Tell Storelib, once a tab, that Google took a hit from this page with one
 * of these IDs: the browser's own list of the requests it made, read for a
 * /g/collect address naming the ID. Nothing about the visitor is sent.
 */
export function gaSeenJs(ids: string[], creatorId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(creatorId)) return ""
  const own = ids.filter((id) => GA_ID.test(id))
  if (own.length === 0) return ""
  return (
    `(function(I,C){try{var w=window;if(!w.PerformanceObserver||!navigator.sendBeacon)return;var k='sl_ga_seen:'+C,done=false;` +
    "try{if(sessionStorage.getItem(k))return}catch(e){}" +
    "function hit(n){if(done||!/\\/g\\/collect/.test(n))return;var m=n.match(/[?&]tid=([^&]+)/);if(!m)return;var id=decodeURIComponent(m[1]).toUpperCase();if(I.indexOf(id)<0)return;done=true;" +
    "try{sessionStorage.setItem(k,'1')}catch(e){}try{o.disconnect()}catch(e){}" +
    "try{navigator.sendBeacon('/api/store/ga-seen',new Blob([JSON.stringify({creatorId:C,id:id})],{type:'text/plain;charset=UTF-8'}))}catch(e){}}" +
    "var o=new PerformanceObserver(function(l){l.getEntries().forEach(function(e){hit(e.name)})});o.observe({type:'resource',buffered:true})" +
    `}catch(e){}})(${scriptJson(own)},${scriptJson(creatorId)});`
  )
}

/**
 * The product a page is about, for the store's Google Analytics: view_item,
 * add_to_cart and begin_checkout read its name and price from here
 * (lib/analytics/pixels.ts), so GA's ecommerce reports have them.
 */
export function gaProductJs(item: GaItem | null, currency: string | null): string {
  if (!item) return ""
  return `window.__slGaItems=window.__slGaItems||{};window.__slGaItems[${scriptJson(item.item_id)}]=${scriptJson({ item, currency: gaCurrency(currency) })};`
}

/** A checkout's lines as GA4 items, with the value before shipping and tax (what begin_checkout reports). */
export function gaCheckoutOf(lines: { productId: string; title?: string | null; variantName?: string | null; unitCents: number; quantity: number; discountCents?: number; type?: string | null }[], currency: string | null): { items: GaItem[]; valueCents: number; currency: string | null } {
  const items = lines.map((l) => gaItem({ id: l.productId, title: l.title, priceCents: l.unitCents, quantity: l.quantity, variant: l.variantName, kind: l.type === "physical" ? "physical" : "digital" })).filter((i): i is GaItem => !!i)
  const valueCents = lines.reduce((n, l) => n + Math.max(0, l.unitCents * l.quantity - (l.discountCents ?? 0)), 0)
  return { items: items.slice(0, 50), valueCents, currency: gaCurrency(currency) }
}

/**
 * The page Settings' Check loads in a hidden frame (app/api/store/ga-check):
 * Google's tag with this ID, one storelib_connected event (Realtime shows
 * it), and what the browser saw told to the settings page. Google's cookies
 * are kept to this page's address and this session.
 */
export function gaCheckHtml(id: string, site: string | null): string {
  if (!GA_ID.test(id)) return ""
  const js =
    `(function(ID,SITE){var done=false,loaded=false;function say(m){if(done)return;done=true;m.type='storelib-ga-check';m.id=ID;try{parent.postMessage(m,location.origin)}catch(e){}}` +
    "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;" +
    "gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});" +
    "gtag('js',new Date());gtag('config',ID,{send_page_view:false,cookie_path:location.pathname,cookie_expires:0,cookie_prefix:'sl_check'});" +
    "gtag('event','storelib_connected',SITE?{page_location:SITE,page_title:'Storelib connection check'}:{page_title:'Storelib connection check'});" +
    "try{new PerformanceObserver(function(l){l.getEntries().forEach(function(e){if(/\\/g\\/collect/.test(e.name)&&e.name.indexOf('tid='+ID)>=0)say({ok:true,sent:true})})}).observe({type:'resource',buffered:true})}catch(e){}" +
    "var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(ID);" +
    "s.onerror=function(){say({ok:false,reason:'tag'})};" +
    /* Loaded: Google knows the ID (an unknown one is not served). Where the browser does not list the hit itself, that is the answer. */
    "s.onload=function(){loaded=true;setTimeout(function(){say({ok:true,sent:false})},6000)};" +
    "document.head.appendChild(s);setTimeout(function(){say({ok:false,reason:loaded?'no_hit':'timeout'})},15000)" +
    `})(${scriptJson(id)},${scriptJson(site)})`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Google Analytics check</title></head><body><script>${js}</script></body></html>`
}
