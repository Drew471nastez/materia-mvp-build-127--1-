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
  gtag?: (...args: unknown[]) => void
  dataLayer?: unknown[]
  fbq?: (...args: unknown[]) => void
  ttq?: { track?: (...args: unknown[]) => void }
  pintrk?: (...args: unknown[]) => void
}

const META: Record<PixelStep, string> = { view_item: "ViewContent", add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout" }
const PINTEREST: Partial<Record<PixelStep, string>> = { view_item: "pagevisit", add_to_cart: "addtocart" }

export function pixelEvent(win: Window | undefined, step: PixelStep, productId?: string | null): void {
  if (!win) return
  const w = win as PixelWindow
  const id = typeof productId === "string" && /^[A-Za-z0-9-]{1,64}$/.test(productId) ? productId : null
  const items = id ? [{ item_id: id }] : []
  try {
    if (typeof w.gtag === "function") w.gtag("event", step, { items })
    else if (Array.isArray(w.dataLayer)) w.dataLayer.push({ event: step, ecommerce: { items } })
  } catch {
    /* a service's own error is its own */
  }
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
  "window.__slPixel=function(s,id){var w=window,M={view_item:'ViewContent',add_to_cart:'AddToCart',begin_checkout:'InitiateCheckout'},P={view_item:'pagevisit',add_to_cart:'addtocart'};id=(typeof id==='string'&&/^[A-Za-z0-9-]{1,64}$/.test(id))?id:null;var it=id?[{item_id:id}]:[];" +
  "try{if(typeof w.gtag==='function')w.gtag('event',s,{items:it});else if(w.dataLayer&&w.dataLayer.push)w.dataLayer.push({event:s,ecommerce:{items:it}})}catch(e){}" +
  "try{if(typeof w.fbq==='function')w.fbq('track',M[s],id?{content_ids:[id],content_type:'product'}:{})}catch(e){}" +
  "try{if(w.ttq&&typeof w.ttq.track==='function')w.ttq.track(M[s],id?{content_id:id,content_type:'product'}:{})}catch(e){}" +
  "try{if(P[s]&&typeof w.pintrk==='function')w.pintrk('track',P[s],id?{product_id:id}:{})}catch(e){}};"
