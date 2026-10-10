/**
 * ===========================================================================
 *  WHAT A SHOPIFY THEME'S SCRIPTS EXPECT TO FIND, FROM STORELIB
 * ===========================================================================
 * A theme's own JavaScript runs on the website as it was written. It reaches
 * for three things Shopify's servers would have put on the page, and each is
 * supplied here, by Storelib, with nothing loaded from Shopify:
 *
 *   window.Shopify       the shop, its currency and locale, the routes, and
 *                        `designMode` (true in the builder's canvas). Written
 *                        by `{{ content_for_header }}`, where Shopify writes it.
 *
 *   @shopify/events      the storefront events module a theme imports by that
 *                        name (Horizon: ProductSelectEvent, CartLinesUpdateEvent
 *                        and the rest). The same classes, as a module the page
 *                        carries inline, so an event a theme dispatches is the
 *                        event its listeners wait for.
 *
 *   cdn.shopify.com      any other script or stylesheet on Shopify's CDN
 *                        (3D model viewers, payment buttons) is taken out of
 *                        the page and named in the theme's diagnostics, never
 *                        dropped without a word.
 */
import { SITE_PREFETCH_RULES } from "@/lib/website-builder/prefetch-rules"

/** The storefront events module. Plain ES2020; it runs in the visitor's browser. */
export const STANDARD_EVENTS_MODULE = `
const StandardEvents = Object.freeze({
  pageView: "shopify:page:view",
  productView: "shopify:product:view",
  productSelect: "shopify:product:select",
  cartView: "shopify:cart:view",
  cartError: "shopify:cart:error",
  cartLinesUpdate: "shopify:cart:lines-update",
  cartNoteUpdate: "shopify:cart:note-update",
  cartDiscountUpdate: "shopify:cart:discount-update",
  searchUpdate: "shopify:search:update",
  collectionView: "shopify:collection:view",
  collectionUpdate: "shopify:collection:update",
});
function createGid(type, id) {
  const s = String(id);
  return s.startsWith("gid://") ? s : "gid://shopify/" + type + "/" + s;
}
function money(cents, code) { return { amount: ((Number(cents) || 0) / 100).toFixed(2), currencyCode: code || "USD" }; }
function fromAjaxCart(cart) {
  const c = cart || {};
  const code = c.currency || "USD";
  return {
    id: createGid("Cart", c.token || "storelib"),
    totalQuantity: Number(c.item_count) || 0,
    cost: { totalAmount: money(c.total_price, code) },
    lines: (c.items || []).map((l) => ({ id: createGid("CartLine", l.key), quantity: Number(l.quantity) || 0, cost: { totalAmount: money(l.final_line_price, code) } })),
    discountCodes: [],
  };
}
function parseProductFilters(searchParams) {
  const p = searchParams || new URLSearchParams(location.search);
  const out = [];
  for (const [k, v] of p.entries()) {
    if (!k.startsWith("filter.")) continue;
    if (k === "filter.v.availability") out.push({ available: v === "1" });
    else if (k === "filter.v.price.gte") out.push({ price: { min: Number(v) } });
    else if (k === "filter.v.price.lte") out.push({ price: { max: Number(v) } });
    else if (k === "filter.p.product_type") out.push({ productType: v });
    else if (k === "filter.p.vendor") out.push({ productVendor: v });
    else if (k === "filter.p.tag") out.push({ tag: v });
    else if (k.startsWith("filter.v.option.")) out.push({ variantOption: { name: k.slice(16), value: v } });
  }
  return out.length ? out : undefined;
}
function sortKey(searchParams, search) {
  const v = (searchParams || new URLSearchParams(location.search)).get("sort_by") || "";
  if (v.startsWith("price")) return "PRICE";
  if (search) return "RELEVANCE";
  if (v.startsWith("title")) return "TITLE";
  if (v.startsWith("created")) return "CREATED";
  if (v === "best-selling") return "BEST_SELLING";
  return v ? "MANUAL" : "COLLECTION_DEFAULT";
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  promise.catch(() => {});
  return { promise, resolve, reject };
}
class ShopifyStandardEvent extends Event {
  constructor(type, payload, options) {
    super(type, Object.assign({ bubbles: true, composed: true }, options || {}));
    const p = payload || {};
    for (const k of Object.keys(p)) {
      try { Object.defineProperty(this, k, { value: p[k], enumerable: true, configurable: true, writable: true }); } catch (e) {}
    }
    if (!("promise" in p)) {
      try { Object.defineProperty(this, "promise", { value: Promise.resolve({ detail: p.detail }), enumerable: true, configurable: true }); } catch (e) {}
    }
  }
}
ShopifyStandardEvent.createGid = createGid;
const make = (name, extra) => {
  const C = class extends ShopifyStandardEvent { constructor(payload) { super(StandardEvents[name], payload); } };
  C.eventName = StandardEvents[name];
  C.createPromise = deferred;
  Object.assign(C, extra || {});
  return C;
};
export const PageViewEvent = make("pageView");
export const ProductViewEvent = make("productView");
export const ProductSelectEvent = make("productSelect");
export const CartViewEvent = make("cartView", { createCartFromAjaxResponse: fromAjaxCart });
export const CartErrorEvent = make("cartError");
export const CartLinesUpdateEvent = make("cartLinesUpdate", { createCartFromAjaxResponse: fromAjaxCart });
export const CartNoteUpdateEvent = make("cartNoteUpdate", { createCartFromAjaxResponse: fromAjaxCart });
export const CartDiscountUpdateEvent = make("cartDiscountUpdate", { createCartFromAjaxResponse: fromAjaxCart });
export const SearchUpdateEvent = make("searchUpdate", { parseProductFilters, getSortKey: (p) => sortKey(p, true) });
export const CollectionViewEvent = make("collectionView");
export const CollectionUpdateEvent = make("collectionUpdate", { parseProductFilters, getSortKey: (p) => sortKey(p, false) });
const VIEW_EVENTS = { "product-component": ProductViewEvent, "collection-component": CollectionViewEvent };
export function createViewEventElement(Base, options) {
  const B = Base || HTMLElement;
  const opts = options || {};
  return class extends B {
    connectedCallback() {
      if (super.connectedCallback) super.connectedCallback();
      const trigger = this.getAttribute("view-event-trigger") || opts.defaultTrigger || "connect";
      if (trigger === "connect") this.dispatchViewEvent();
      else if (trigger === "intersect" && "IntersectionObserver" in window) {
        const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { io.disconnect(); this.dispatchViewEvent(); } });
        io.observe(this);
      }
    }
    dispatchViewEvent() {
      let payload = null;
      const raw = this.getAttribute("view-event-payload") || this.querySelector("script[data-view-event-payload]")?.textContent;
      try { payload = raw ? JSON.parse(raw) : null; } catch (e) { payload = null; }
      if (!payload) return;
      const Kind = payload.cart ? CartViewEvent : payload.collection ? CollectionViewEvent : payload.product ? ProductViewEvent : VIEW_EVENTS[this.localName];
      if (Kind) this.dispatchEvent(new Kind(payload));
    }
  };
}
export const ViewEventElement = createViewEventElement(HTMLElement);
export { StandardEvents, ShopifyStandardEvent };
`.trim()

/** The module as an address a page can import from without a server: an import map entry, a `<script type="module" src>`. */
export function standardEventsUrl(): string {
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(STANDARD_EVENTS_MODULE)}`
}

export interface BootstrapInput {
  shopName: string
  host?: string
  currency: string
  locale?: string
  country?: string
  themeName?: string
  designMode: boolean
}

const js = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c")

/** `{{ content_for_header }}`: window.Shopify, as Shopify's own head script leaves it. */
/*
  BUY IT NOW, WHATEVER THE THEME'S OWN SCRIPT DOES WITH A SUBMIT. A theme
  like Horizon catches every submit of its product form and adds to the cart
  by fetch, so the button would only ever add. Caught first (capture phase),
  the press posts the form's own fields with \`checkout\` to /cart/add, which
  sends that item alone to checkout (site.ts). Not in the builder's canvas.
*/
const BUY_NOW = `if(!S.designMode)document.addEventListener("click",function(e){var b=e.target&&e.target.closest&&e.target.closest("[data-storelib-buy-now]");if(!b)return;var src=b.form||b.closest("form")||document.querySelector('form[action*="/cart/add"]');if(!src)return;e.preventDefault();e.stopImmediatePropagation();var f=document.createElement("form");f.method="post";f.action="/cart/add";f.style.display="none";new FormData(src).forEach(function(v,k){if(typeof v!=="string"||k==="checkout")return;var i=document.createElement("input");i.type="hidden";i.name=k;i.value=v;f.appendChild(i)});var c=document.createElement("input");c.type="hidden";c.name="checkout";c.value="1";f.appendChild(c);document.body.appendChild(f);f.submit()},true);`

/* The next page fetched while the visitor rests on its link, as on a Storelib theme's site (lib/website-builder/prefetch-rules.ts). */
const PREFETCH = `if(!S.designMode&&HTMLScriptElement.supports&&HTMLScriptElement.supports("speculationrules")){var sr=document.createElement("script");sr.type="speculationrules";sr.textContent=${JSON.stringify(JSON.stringify(SITE_PREFETCH_RULES))};document.head.appendChild(sr)}`

export function shopifyBootstrap(i: BootstrapInput): string {
  const data = {
    shop: i.host ?? "",
    locale: i.locale ?? "en",
    currency: { active: i.currency, rate: "1.0" },
    country: i.country ?? "US",
    theme: { name: i.themeName ?? "", id: null, schema_name: i.themeName ?? "", role: "main" },
    routes: { root: "/" },
    designMode: i.designMode,
    storelib: true,
  }
  return `<script data-storelib-shopify>(function(){var d=${js(data)};var S=window.Shopify=window.Shopify||{};for(var k in d)S[k]=d[k];S.cdnHost="";S.loadFeatures=function(f,cb){if(typeof cb==="function")setTimeout(function(){cb(new Error("This feature is not available on Storelib"))},0)};S.PaymentButton=S.PaymentButton||{init:function(){}};S.analytics=S.analytics||{publish:function(){},visitor:function(){}};${BUY_NOW}${PREFETCH}})();</script>`
}

/** Shopify's CDN and its other hosts, which a page drawn by Storelib never loads. */
const SHOPIFY_HOST = /https?:\/\/(?:cdn\.shopify\.com|[a-z0-9-]+\.shopifycdn\.com|[a-z0-9-]+\.shopifycloud\.com|[a-z0-9-]+\.myshopify\.com)\/[^"'\s)>]*/gi
const EVENTS_URL = /https?:\/\/cdn\.shopify\.com\/storefront\/standard-events\.js/gi

/**
 * The page without Shopify's servers in it. The storefront events module is
 * swapped for Storelib's own; a `<script>` or `<link>` that loads anything
 * else from Shopify is taken out, and each address is handed to `note`.
 */
export function withoutShopifyCdn(html: string, note: (url: string) => void): string {
  if (!/shopify(?:cdn|cloud)?\.com/i.test(html)) return html
  let out = html.replace(EVENTS_URL, standardEventsUrl())
  out = out.replace(/<script\b[^>]*\bsrc=["']?(https?:\/\/[^"'\s>]+)["']?[^>]*>\s*<\/script>/gi, (tag, url: string) => {
    if (!SHOPIFY_HOST.test(url)) { SHOPIFY_HOST.lastIndex = 0; return tag }
    SHOPIFY_HOST.lastIndex = 0
    note(url)
    return ""
  })
  out = out.replace(/<link\b[^>]*\bhref=["']?(https?:\/\/[^"'\s>]+)["']?[^>]*>/gi, (tag, url: string) => {
    if (!SHOPIFY_HOST.test(url)) { SHOPIFY_HOST.lastIndex = 0; return tag }
    SHOPIFY_HOST.lastIndex = 0
    note(url)
    return ""
  })
  return out
}
