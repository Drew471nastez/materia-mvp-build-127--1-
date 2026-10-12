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
export type PixelStep = "view_item" | "add_to_cart" | "begin_checkout"

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
  gaStep(w, "begin_checkout", { ...(params.currency ? { currency: params.currency, value: Math.max(0, Math.round(params.valueCents)) / 100 } : {}), items: params.items }, 0)
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
  gaStep(w, "purchase", { transaction_id: p.transactionId, ...(p.currency ? { currency: p.currency, value: Math.max(0, Math.round(p.valueCents)) / 100 } : {}), items: p.items, transport_type: "beacon" }, 0)
}

export function pixelEvent(win: Window | undefined, step: PixelStep, productId?: string | null): void {
  if (!win) return
  const w = win as PixelWindow
  const id = typeof productId === "string" && /^[A-Za-z0-9-]{1,64}$/.test(productId) ? productId : null
  /* The product's name and price when the page registered it (components/analytics/ga-route), so GA's ecommerce reports have them. */
  const known = id ? w.__slGaItems?.[id] : undefined
  const items = id ? [known ? { ...known.item, quantity: 1 } : { item_id: id }] : []
  const priced = known && typeof known.item.price === "number" && known.currency ? { currency: known.currency, value: known.item.price } : {}
  try {
    if (step === "begin_checkout") w.sessionStorage?.setItem("sl_ga_bc", String(Date.now()))
  } catch {
    /* storage off: checkout may count it once more */
  }
  gaStep(w, step, { ...priced, items }, 0)
  try {
    if (typeof w.fbq === "function") w.fbq("track", META[step], id ? { content_ids: [id], content_type: "product" } : {})
  } catch {
    /* as above */
  }
  try {
    if (w.ttq && typeof w.ttq.track === "function") w.ttq.track(META[step], id ? { content_id: id, content_type: "product" } : {})
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

/** The same, as a small script for a page that is not React (an imported theme): defines window.__slPixel(step, productId). */
export const PIXEL_EVENT_JS =
  "window.__slPixel=function(s,id){var w=window,M={view_item:'ViewContent',add_to_cart:'AddToCart',begin_checkout:'InitiateCheckout'},P={view_item:'pagevisit',add_to_cart:'addtocart'};id=(typeof id==='string'&&/^[A-Za-z0-9-]{1,64}$/.test(id))?id:null;" +
  "var k=id&&w.__slGaItems&&w.__slGaItems[id],it=id?[k?Object.assign({},k.item,{quantity:1}):{item_id:id}]:[],g={items:it};if(k&&typeof k.item.price==='number'&&k.currency){g.currency=k.currency;g.value=k.item.price}" +
  "try{if(s==='begin_checkout')sessionStorage.setItem('sl_ga_bc',String(Date.now()))}catch(e){}" +
  "try{if(typeof w.gtag==='function')w.gtag('event',s,g);else if(w.dataLayer&&w.dataLayer.push)w.dataLayer.push({event:s,ecommerce:g})}catch(e){}" +
  "try{if(typeof w.fbq==='function')w.fbq('track',M[s],id?{content_ids:[id],content_type:'product'}:{})}catch(e){}" +
  "try{if(w.ttq&&typeof w.ttq.track==='function')w.ttq.track(M[s],id?{content_id:id,content_type:'product'}:{})}catch(e){}" +
  "try{if(P[s]&&typeof w.pintrk==='function')w.pintrk('track',P[s],id?{product_id:id}:{})}catch(e){}};"
