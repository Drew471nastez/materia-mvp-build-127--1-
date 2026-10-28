/**
 * ===========================================================================
 *  THE STORE'S OWN ANALYTICS HEAR THE SAME STEPS STORELIB DOES
 * ===========================================================================
 * Google Analytics, Google Ads, Tag Manager, Meta, TikTok and Pinterest
 * (Settings › Integrations, lib/store/tracking.ts) already get each page
 * view from their own tag and each purchase on the order page
 * (purchaseTags). Here, the steps in between, told to whichever of them is
 * on the page, by the names each one knows:
 *
 *   view_item       a product page          GA4 view_item, Meta ViewContent, TikTok ViewContent, Pinterest pagevisit
 *   add_to_cart     Buy or Add to cart      GA4 add_to_cart, Meta AddToCart, TikTok AddToCart, Pinterest addtocart
 *   begin_checkout  the checkout opens      GA4 begin_checkout, Meta InitiateCheckout, TikTok InitiateCheckout
 *
 * Only the product's id goes, never anything about the person. A service
 * that is not on the page is skipped; nothing here can throw.
 *
 * The imported theme's tracker (lib/storelib-theme/compat/track-script.ts)
 * writes the same calls inline: PIXEL_EVENT_JS below is that code.
 */
import { minorUnits } from "@/lib/markets/money"

export type PixelStep = "view_item" | "add_to_cart" | "begin_checkout"

/**
 * Minor units as the major amount GA4, Meta, TikTok and Pinterest take, in
 * that currency's own decimals: 1250 USD is 12.5, 2500 JPY is 2500, 1250 KWD
 * is 1.25. Divided by 100 whatever the currency, a yen store told Google its
 * 2,500 yen sale was worth 25 yen.
 */
export function majorValue(minor: number, currency: string | null | undefined): number {
  const cents = Math.max(0, Math.round(Number(minor) || 0))
  return cents / 10 ** (currency ? minorUnits(currency) : 2)
}

type PixelWindow = Window & {
  __slGaWait?: boolean
  __slGaItems?: Record<string, { item: { item_id: string; item_name?: string; price?: number }; currency: string | null }>
  gtag?: (...args: unknown[]) => void
  dataLayer?: unknown[]
  fbq?: (...args: unknown[]) => void
  ttq?: { track?: (...args: unknown[]) => void }
  pintrk?: (...args: unknown[]) => void
}

const META: Record<PixelStep, string> = { view_item: "ViewContent", add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout" }
const PINTEREST: Partial<Record<PixelStep, string>> = { view_item: "pagevisit", add_to_cart: "addtocart" }

/**
 * GA4's step. The store's tag loads after the page is interactive, so a step
 * can come first (a product page's view_item on a fast load): when the page
 * says its Google tag is on the way (components/analytics/ga-route sets
 * __slGaWait), the step waits for it, up to six seconds, instead of being
 * lost. Otherwise Tag Manager's data layer, or nothing.
 */
function gaStep(w: PixelWindow, step: PixelStep | "purchase", params: Record<string, unknown>, tries: number): void {
  try {
    if (typeof w.gtag === "function") w.gtag("event", step, params)
    else if (w.__slGaWait && tries < 20 && typeof w.setTimeout === "function") w.setTimeout(() => gaStep(w, step, params, tries + 1), 300)
    else if (Array.isArray(w.dataLayer)) w.dataLayer.push({ event: step, ecommerce: params })
  } catch {
    /* a service's own error is its own */
  }
}

/**
 * Checkout itself, opened: begin_checkout with the whole cart, unless this
 * tab told GA a moment ago (the Buy or Check out press that opened it).
 */
export function gaBeginCheckout(win: Window | undefined, params: { currency: string | null; valueCents: number; items: Record<string, unknown>[] }): void {
  if (!win) return
  const w = win as PixelWindow
  try {
    const at = Number(w.sessionStorage?.getItem("sl_ga_bc"))
    if (at > 0 && Date.now() - at < 120_000) return
    w.sessionStorage?.setItem("sl_ga_bc", String(Date.now()))
  } catch {
    /* storage off: told once more at most */
  }
  gaStep(w, "begin_checkout", { ...(params.currency ? { currency: params.currency, value: majorValue(params.valueCents, params.currency) } : {}), items: params.items }, 0)
}

/** A purchase paid on this page, to the store's Google Analytics only, once per order in this browser (the thank you pages use purchaseTags). */
export function gaPurchase(win: Window | undefined, p: { transactionId: string; valueCents: number; currency: string | null; items: Record<string, unknown>[] | unknown[] }): void {
  if (!win || !/^[A-Za-z0-9-]{1,64}$/.test(p.transactionId)) return
  const w = win as PixelWindow
  try {
    const k = `sl_tx:${p.transactionId}`
    if (w.localStorage?.getItem(k)) return
    w.localStorage?.setItem(k, "1")
  } catch {
    /* storage off: Google drops a repeated transaction_id */
  }
  gaStep(w, "purchase", { transaction_id: p.transactionId, ...(p.currency ? { currency: p.currency, value: majorValue(p.valueCents, p.currency) } : {}), items: p.items, transport_type: "beacon" }, 0)
}

/**
 * `price`: what the page itself knows (round 41: the OnePage's product
 * sheet and its checkout window read the product's price), so Meta and
 * TikTok get value and currency on ViewContent and InitiateCheckout too.
 */
export function pixelEvent(win: Window | undefined, step: PixelStep, productId?: string | null, price?: { valueCents: number; currency: string | null } | null): void {
  if (!win) return
  const w = win as PixelWindow
  const id = typeof productId === "string" && /^[A-Za-z0-9-]{1,64}$/.test(productId) ? productId : null
  /* The product's name and price when the page registered it (components/analytics/ga-route), so GA's ecommerce reports have them. */
  const known = id ? w.__slGaItems?.[id] : undefined
  const items = id ? [known ? { ...known.item, quantity: 1 } : { item_id: id }] : []
  const own = price && price.currency && /^[A-Za-z]{3}$/.test(price.currency) ? { currency: price.currency.toUpperCase(), value: majorValue(price.valueCents, price.currency.toUpperCase()) } : null
  const priced = own ?? (known && typeof known.item.price === "number" && known.currency ? { currency: known.currency, value: known.item.price } : {})
  try {
    if (step === "begin_checkout") w.sessionStorage?.setItem("sl_ga_bc", String(Date.now()))
  } catch {
    /* storage off: checkout may count it once more */
  }
  gaStep(w, step, { ...priced, items }, 0)
  try {
    if (typeof w.fbq === "function") w.fbq("track", META[step], { ...(id ? { content_ids: [id], content_type: "product" } : {}), ...priced })
  } catch {
    /* as above */
  }
  try {
    if (w.ttq && typeof w.ttq.track === "function") w.ttq.track(META[step], { ...(id ? { content_id: id, content_type: "product", contents: [{ content_id: id, quantity: 1 }] } : {}), ...priced })
  } catch {
    /* as above */
  }
  try {
    const pin = PINTEREST[step]
    if (pin && typeof w.pintrk === "function") w.pintrk("track", pin, id ? { product_id: id } : {})
  } catch {
    /* as above */
  }
}

/* ─── Round 41: a signup and a purchase made on the page itself ─────────── */

/**
 * "sl-" and sixteen hex characters of the reference's SHA-256: the same
 * order is the same id, and the reference (a receipt token, a credential)
 * cannot be read back from it. GA's transaction_id, Meta's eventID and
 * TikTok's event_id are all this, so a server event sent later with the
 * same id is dropped as a repeat by each service.
 */
export async function paidEventId(ref: string): Promise<string> {
  try {
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ref)))
    return `sl-${Array.from(bytes.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("")}`
  } catch {
    /* No SubtleCrypto (a page that is not https): two FNV-1a passes, the same sixteen characters every time for the same reference. */
    const fnv = (seed: number) => {
      let h = seed >>> 0
      for (let i = 0; i < ref.length; i++) h = Math.imul(h ^ ref.charCodeAt(i), 16777619) >>> 0
      return h.toString(16).padStart(8, "0")
    }
    return `sl-${fnv(2166136261)}${fnv(0x811c9dc5 ^ 0x5bd1e995)}`
  }
}

const EVENT_ID = /^[A-Za-z0-9_-]{1,64}$/

/**
 * A signup on the page (the email signup, a lead magnet, Subscribe): GA4
 * generate_lead, Tag Manager's data layer, Meta Lead, TikTok SubmitForm,
 * Pinterest lead. `eventId` is the lead's own id when the server gave one,
 * as Meta's eventID and TikTok's event_id, so a server event for the same
 * lead can be matched to it. Nothing about the person goes.
 */
export function pixelLead(win: Window | undefined, p: { form: string; eventId?: string | null }): void {
  if (!win) return
  const w = win as PixelWindow
  const form = /^[a-z_]{1,32}$/.test(p.form) ? p.form : "signup"
  const eventId = p.eventId && EVENT_ID.test(p.eventId) ? p.eventId : `lead-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  try {
    if (typeof w.gtag === "function") w.gtag("event", "generate_lead", { lead_source: form, event_id: eventId })
    else if (Array.isArray(w.dataLayer)) w.dataLayer.push({ event: "generate_lead", lead_source: form, event_id: eventId })
  } catch {
    /* a service's own error is its own */
  }
  try {
    if (typeof w.fbq === "function") w.fbq("track", "Lead", { content_name: form }, { eventID: eventId })
  } catch {
    /* as above */
  }
  try {
    if (w.ttq && typeof w.ttq.track === "function") w.ttq.track("SubmitForm", { content_name: form }, { event_id: eventId })
  } catch {
    /* as above */
  }
  try {
    if (typeof w.pintrk === "function") w.pintrk("track", "lead", { lead_type: form, event_id: eventId })
  } catch {
    /* as above */
  }
}

/**
 * Paid on the page (the OnePage's checkout window, Storelib's checkout):
 * every pixel's purchase, once per order in this browser. GA4 through
 * gaPurchase (its own once, the same id); Meta Purchase, TikTok
 * CompletePayment and Pinterest checkout with value, currency and the
 * order's id as their dedup id, as purchaseTags does on a thank you page.
 */
export function pixelPurchase(win: Window | undefined, p: { eventId: string; valueCents: number; currency: string | null; productIds?: string[]; items?: Record<string, unknown>[] }): void {
  if (!win || !EVENT_ID.test(p.eventId)) return
  const w = win as PixelWindow
  const currency = p.currency && /^[A-Za-z]{3}$/.test(p.currency) ? p.currency.toUpperCase() : null
  const ids = (p.productIds ?? []).filter((x) => /^[A-Za-z0-9-]{1,64}$/.test(x)).slice(0, 50)
  gaPurchase(win, { transactionId: p.eventId, valueCents: p.valueCents, currency, items: p.items ?? ids.map((item_id) => ({ item_id, quantity: 1 })) })
  try {
    const k = `sl_px:${p.eventId}`
    if (w.localStorage?.getItem(k)) return
    w.localStorage?.setItem(k, "1")
  } catch {
    /* storage off: each service drops a repeat by its event id */
  }
  const value = currency ? { value: majorValue(p.valueCents, currency), currency } : {}
  try {
    if (typeof w.fbq === "function") w.fbq("track", "Purchase", { ...value, ...(ids.length ? { content_ids: ids, content_type: "product", num_items: ids.length } : {}) }, { eventID: p.eventId })
  } catch {
    /* as above */
  }
  try {
    if (w.ttq && typeof w.ttq.track === "function") w.ttq.track("CompletePayment", { ...value, content_type: "product", ...(ids.length ? { contents: ids.map((content_id) => ({ content_id, quantity: 1 })) } : {}) }, { event_id: p.eventId })
  } catch {
    /* as above */
  }
  try {
    if (typeof w.pintrk === "function") w.pintrk("track", "checkout", { ...value, order_quantity: Math.max(1, ids.length), order_id: p.eventId })
  } catch {
    /* as above */
  }
}

/** The same, as a small script for a page that is not React (an imported theme): defines window.__slPixel(step, productId). */
export const PIXEL_EVENT_JS =
  "window.__slPixel=function(s,id){var w=window,M={view_item:'ViewContent',add_to_cart:'AddToCart',begin_checkout:'InitiateCheckout'},P={view_item:'pagevisit',add_to_cart:'addtocart'};id=(typeof id==='string'&&/^[A-Za-z0-9-]{1,64}$/.test(id))?id:null;" +
  "var k=id&&w.__slGaItems&&w.__slGaItems[id],it=id?[k?Object.assign({},k.item,{quantity:1}):{item_id:id}]:[],g={items:it};if(k&&typeof k.item.price==='number'&&k.currency){g.currency=k.currency;g.value=k.item.price}" +
  "try{if(s==='begin_checkout')sessionStorage.setItem('sl_ga_bc',String(Date.now()))}catch(e){}" +
  "try{if(typeof w.gtag==='function')w.gtag('event',s,g);else if(w.dataLayer&&w.dataLayer.push)w.dataLayer.push({event:s,ecommerce:g})}catch(e){}" +
  "try{if(typeof w.fbq==='function')w.fbq('track',M[s],id?{content_ids:[id],content_type:'product'}:{})}catch(e){}" +
  "try{if(w.ttq&&typeof w.ttq.track==='function')w.ttq.track(M[s],id?{content_id:id,content_type:'product'}:{})}catch(e){}" +
  "try{if(P[s]&&typeof w.pintrk==='function')w.pintrk('track',P[s],id?{product_id:id}:{})}catch(e){}};"
