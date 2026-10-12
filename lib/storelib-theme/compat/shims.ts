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

/**
 * `@shopify/partial-rendering`, which Shopify's newest themes (Skeleton)
 * import by that name: `partials.refresh(name)` draws the page again and
 * swaps in the region `{% partial name %}` marked (data-shopify-partial).
 */
export const PARTIAL_RENDERING_MODULE = `
async function refresh(name) {
  const res = await fetch(location.href, { headers: { Accept: "text/html" }, credentials: "same-origin" });
  if (!res.ok) throw new Error("The page could not be drawn again");
  const doc = new DOMParser().parseFromString(await res.text(), "text/html");
  const sel = '[data-shopify-partial="' + CSS.escape(String(name)) + '"]';
  const fresh = doc.querySelector(sel);
  const here = document.querySelector(sel);
  if (fresh && here) here.replaceWith(document.importNode(fresh, true));
}
export const partials = { refresh };
export default partials;
`.trim()

/** The modules a Shopify page can import by name, as Shopify's own import map gives them. */
export function shopifyModules(): Record<string, string> {
  return {
    "@shopify/events": standardEventsUrl(),
    "@shopify/partial-rendering": `data:text/javascript;charset=utf-8,${encodeURIComponent(PARTIAL_RENDERING_MODULE)}`,
  }
}

/**
 * THE MODULES SHOPIFY'S IMPORT MAP GIVES, IN THE PAGE'S FIRST IMPORT MAP. A
 * theme script may import `@shopify/partial-rendering` by name, which only
 * an import map can answer. A browser reads one import map (a second is
 * ignored by many, and a theme like Horizon has its own), so ours are added
 * to the theme's when it has one, never over a name the theme maps itself,
 * and given their own map at the top of the head when it has none.
 */
export function withShopifyModules(html: string): string {
  /* Every one, always: the import is usually in one of the theme's own script files, not in the page. */
  const want = shopifyModules()
  let merged = false
  const out = html.replace(/<script\b[^>]*type=["']?importmap["']?[^>]*>([\s\S]*?)<\/script>/i, (tag, body: string) => {
    try {
      const map = JSON.parse(body) as { imports?: Record<string, string> }
      map.imports = { ...want, ...(map.imports ?? {}) }
      merged = true
      return tag.replace(body, JSON.stringify(map).replace(/</g, "\\u003c"))
    } catch {
      return tag
    }
  })
  if (merged) return out
  const tag = `<script type="importmap">${JSON.stringify({ imports: want }).replace(/</g, "\\u003c")}</script>`
  return /<head\b[^>]*>/i.test(out) ? out.replace(/<head\b[^>]*>/i, (m) => `${m}${tag}`) : `${tag}${out}`
}

export interface BootstrapInput {
  shopName: string
  host?: string
  currency: string
  locale?: string
  country?: string
  themeName?: string
  designMode: boolean
  /** The creator's id, which keys the website's own wishlist (lib/site-accounts/wishlist-list.ts). */
  storeId?: string
  /** A customer is signed in to this website (the page's `customer`): where the account button goes. */
  signedIn?: boolean
  /** How many items the cart held when the page was drawn: a page brought back by Back checks it is still true (BACK_FORWARD). */
  cartCount?: number
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
/* Buy it now follows the form's own Add to cart: off for a sold out or unavailable choice, as Shopify's dynamic checkout button is. */
const BUY_NOW = `(function(){var add=function(b){var f=b.form||b.closest("form");return f&&f.querySelector('button[name="add"],button[type="submit"]:not([name="checkout"]):not([data-storelib-buy-now])')};var sync=function(){document.querySelectorAll("[data-storelib-buy-now]").forEach(function(b){var a=add(b);if(!a)return;var off=a.disabled||a.getAttribute("aria-disabled")==="true";if(b.disabled!==off)b.disabled=off})};var queued=0;var later=function(){if(queued)return;queued=1;requestAnimationFrame(function(){queued=0;sync()})};var watch=function(){sync();new MutationObserver(later).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["disabled","aria-disabled"]})};if(document.body)watch();else document.addEventListener("DOMContentLoaded",watch)})();if(!S.designMode)document.addEventListener("click",function(e){var b=e.target&&e.target.closest&&e.target.closest("[data-storelib-buy-now]");if(!b)return;if(b.disabled){e.preventDefault();return}var src=b.form||b.closest("form")||document.querySelector('form[action*="/cart/add"]');if(!src)return;e.preventDefault();e.stopImmediatePropagation();var f=document.createElement("form");f.method="post";f.action="/cart/add";f.style.display="none";new FormData(src).forEach(function(v,k){if(typeof v!=="string"||k==="checkout")return;var i=document.createElement("input");i.type="hidden";i.name=k;i.value=v;f.appendChild(i)});var c=document.createElement("input");c.type="hidden";c.name="checkout";c.value="1";f.appendChild(c);document.body.appendChild(f);f.submit()},true);`

/*
  A CHECKOUT LEFT DISABLED AFTER ITS BOX IS TICKED. A theme can draw its
  "I agree to the terms" box with Check out disabled and leave the script
  that enables it out of the page (Posturex: the drawer's box is drawn by one
  setting, the script that listens to it by another, and a section drawn
  again after an add brings its script as markup, which never runs). Once
  every such box near the button is ticked, the theme's own script has had
  its turn and Check out is still disabled, it is enabled here. Nothing is
  ever disabled here: a theme that keeps its own rule keeps it. In the
  builder's canvas too, where Check out then says it opens on the live site.
*/
const TERMS = `document.addEventListener("change",function(e){var box=e.target;if(!box||box.type!=="checkbox"||!box.closest)return;var terms=box.required||/terms|agree|condition|policy/i.test((box.name||"")+" "+(box.id||"")+" "+(box.className||""));if(!terms)return;setTimeout(function(){var CO='button[name="checkout"],input[name="checkout"],a[href*="/checkout"],[data-requires-terms]';var at=box.parentElement,n=0;while(at&&at!==document.body&&!at.querySelector(CO)&&n<12){at=at.parentElement;n++}if(!at||at===document.body||!at.querySelector(CO))return;var boxes=at.querySelectorAll('input[type="checkbox"]');for(var i=0;i<boxes.length;i++){var b=boxes[i];if((b.required||/terms|agree|condition|policy/i.test((b.name||"")+" "+(b.id||"")+" "+(b.className||"")))&&!b.checked)return}at.querySelectorAll(CO).forEach(function(c){if(c.disabled)c.disabled=false;if(c.getAttribute("aria-disabled")==="true")c.removeAttribute("aria-disabled");if(c.getAttribute("tabindex")==="-1"&&c.tagName==="A")c.removeAttribute("tabindex")})},0)},true);`

/*
  A THEME'S HEARTS ARE THE WEBSITE'S WISHLIST. A Shopify theme keeps the
  products a visitor hearts in this browser's local storage, under a key of
  its own with "wish" in it (Posturex: materia__wishlist-items, a list of
  product ids), and its wishlist link opens Storelib's own Wishlist page
  (site.ts accountShell), which reads the website's list: local storage
  under the creator's id and the sl_wishlist cookie for a guest, the
  account's for a signed in visitor (lib/site-accounts/wishlist-list.ts,
  components/website-builder/site-wishlist.tsx). So each change the theme
  writes is copied into the website's list, and a change made on the
  Wishlist page is copied back into the theme's key on the next page, so
  its hearts and its count agree. A theme that keeps handles has them read
  as ids from /products/<handle>.js.
*/
const WISHLIST = `if(!S.designMode&&SID)(function(){var ls;try{ls=window.localStorage;ls.getItem("x")}catch(e){return}
var U=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,P=Storage.prototype,rg=P.getItem,rs=P.setItem,rr=P.removeItem;
var G="storelib:wishlist:"+SID,A="storelib:wishlist-account:"+SID,SN="storelib:wishlist-theme:"+SID,HK="storelib:wishlist-handles";
var get=function(k){try{return rg.call(ls,k)}catch(e){return null}},put=function(k,v){try{if(v==null)rr.call(ls,k);else rs.call(ls,k,v)}catch(e){}};
var json=function(v){try{return JSON.parse(v)}catch(e){return null}};
var ids=function(v){var a=Array.isArray(v)?v:[],o=[];a.forEach(function(x){x=String(x).toLowerCase();if(U.test(x)&&o.indexOf(x)<0)o.push(x)});return o};
var same=function(a,b){return a.length===b.length&&a.every(function(x){return b.indexOf(x)>=0})};
var handles=json(get(HK))||{};
var entries=function(raw){var v=json(raw);if(v&&typeof v==="object"&&!Array.isArray(v))v=v.items||v.products||v.list||v.ids||null;if(!Array.isArray(v))return null;return v.map(function(x){if(x&&typeof x==="object")x=x.id||x.product_id||x.productId||x.handle||"";x=String(x);var m=x.match(U);return m?{id:m[0].toLowerCase()}:/^[a-z0-9][a-z0-9-]{0,200}$/i.test(x)?{handle:x.toLowerCase()}:null}).filter(Boolean)};
var plain=function(raw){var v=json(raw);return Array.isArray(v)&&v.every(function(x){return typeof x==="string"&&U.test(x)})};
var signed=function(){return /(?:^|;\\s*)sl_signed_in=1/.test(document.cookie)};
var mine=function(){return ids(json(get(signed()?A:G)))};
var cookie=function(list){try{document.cookie="sl_wishlist="+list.join(".")+"; Path=/; "+(list.length?"Max-Age=31536000":"Max-Age=0")+"; SameSite=Lax"+(location.protocol==="https:"?"; Secure":"")}catch(e){}};
var save=function(list,before){if(signed()){put(A,JSON.stringify(list));list.forEach(function(id){if(before.indexOf(id)<0)call("add",id)});before.forEach(function(id){if(list.indexOf(id)<0)call("remove",id)})}else{put(G,list.length?JSON.stringify(list):null);cookie(list)}put(SN,JSON.stringify(list))};
var call=function(action,id){try{fetch("/api/site-account/wishlist",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({action:action,productId:id})}).catch(function(){})}catch(e){}};
var resolve=function(list,done){var want=list.filter(function(x){return x.handle&&!handles[x.handle]});if(!want.length)return done(list.map(function(x){return x.id||handles[x.handle]}).filter(Boolean));Promise.all(want.map(function(x){return fetch("/products/"+encodeURIComponent(x.handle)+".js",{headers:{Accept:"application/json"}}).then(function(r){return r.ok?r.json():null}).then(function(p){if(p&&U.test(String(p.id)))handles[x.handle]=String(p.id).toLowerCase()}).catch(function(){})})).then(function(){put(HK,JSON.stringify(handles));done(list.map(function(x){return x.id||handles[x.handle]}).filter(Boolean))})};
var themeKey=function(k){return typeof k==="string"&&/wish/i.test(k)&&k.indexOf("storelib:")!==0};
var changed=function(k,raw){var list=raw==null?[]:entries(raw);if(!list)return;resolve(list,function(now){now=ids(now);var snap=json(get(SN));var before=mine();var base=Array.isArray(snap)?ids(snap):before;var next=before.filter(function(id){return !(base.indexOf(id)>=0&&now.indexOf(id)<0)});now.forEach(function(id){if(next.indexOf(id)<0)next.unshift(id)});if(!same(next,before)||!Array.isArray(snap))save(next.slice(0,60),before);else put(SN,JSON.stringify(next))})};
P.setItem=function(k,v){var r=rs.apply(this,arguments);if(this===ls&&themeKey(k))changed(k,String(v));return r};
P.removeItem=function(k){var r=rr.apply(this,arguments);if(this===ls&&themeKey(k))changed(k,null);return r};
try{for(var i=0;i<ls.length;i++){var k=ls.key(i);if(!themeKey(k))continue;var raw=get(k),snap=json(get(SN)),w=mine(),t=ids((entries(raw)||[]).map(function(x){return x.id}));
if(Array.isArray(snap)&&same(t,ids(snap))&&!same(w,ids(snap))){if(plain(raw)){put(k,JSON.stringify(w));put(SN,JSON.stringify(w));if(!signed())cookie(w)}}else if(!Array.isArray(snap)||!same(t,ids(snap)))changed(k,raw)}}catch(e){}})();`

/*
  THE ACCOUNT BUTTON. Dawn and Horizon draw it as <shopify-account>, a
  component Shopify's own script defines; without that script it is an icon
  that does nothing. Defined here as a plain link around what the theme put
  inside it: the account page when signed in, sign in when not, on this
  website's own host. It keeps the size the theme gave it while undefined,
  and wraps its children once they are parsed (the definition runs in the
  head, before the element's contents exist).
*/
const ACCOUNT_BUTTON = `if(window.customElements&&!customElements.get("shopify-account")){customElements.define("shopify-account",class extends HTMLElement{connectedCallback(){var el=this;el.style.display="flex";el.style.alignItems="center";el.style.justifyContent="center";el.style.minWidth="44px";el.style.minHeight="44px";if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){el.wrap()},{once:true});else el.wrap()}wrap(){if(this.querySelector(":scope>a[data-storelib-account]"))return;var href=S.storelibSignedIn?"/account":"/account/login";var a=document.createElement("a");a.href=href;a.setAttribute("data-storelib-account","");a.setAttribute("aria-label",S.storelibSignedIn?"Account":"Log in");a.style.cssText="display:flex;align-items:center;justify-content:center;gap:6px;min-width:44px;min-height:44px;color:inherit;text-decoration:none";while(this.firstChild)a.appendChild(this.firstChild);if(!a.textContent.trim()&&!a.querySelector("svg,img,div,span")){a.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>'}a.querySelectorAll("[slot]").forEach(function(n){n.removeAttribute("slot")});this.appendChild(a)}})}`

/*
  A NEWSLETTER OR CONTACT FORM, SENT WITHOUT LEAVING THE PAGE. The theme's
  form (posted to /contact, form_type customer or contact) is posted by
  fetch instead; then its section is drawn again with the answer in the
  address (customer_posted=true, or form_error) and the form is swapped for
  the new one, so the visitor sees the theme's own thank you or error in
  place (a theme can only draw those inside the form, where \`form\` is).
  Only the form is swapped: a popup around it stays open. A section that draws neither, or
  a form outside any section, gets one short line under the form. A theme
  that sends the form itself (its handler called preventDefault) is left
  alone. Without script the form posts as written and comes back the same
  way (site.ts formSubmit).
*/
const FORMS = `if(!S.designMode)document.addEventListener("submit",function(e){var f=e.target;if(!f||f.tagName!=="FORM"||e.defaultPrevented)return;var act=(f.getAttribute("action")||"").replace(location.origin,"");var ti=f.querySelector('input[name="form_type"]');var type=ti&&ti.value;if(!/^\\/contact(?:[\\/?#]|$)/.test(act)||(type!=="customer"&&type!=="contact"))return;e.preventDefault();if(f.getAttribute("data-storelib-sending"))return;f.setAttribute("data-storelib-sending","1");var btns=[].slice.call(f.querySelectorAll('button,input[type=submit]'));btns.forEach(function(b){b.disabled=true});f.setAttribute("aria-busy","true");var sec=f.closest(".shopify-section");var data=new FormData(f);var kept={};data.forEach(function(v,k){if(typeof v==="string")kept[k]=v});var done=function(){f.removeAttribute("data-storelib-sending");f.removeAttribute("aria-busy");btns.forEach(function(b){b.disabled=false})};var note=function(x,where){var t=where||f;var old=t.parentNode&&t.parentNode.querySelector(":scope>.storelib-form-note");if(old)old.remove();var p=document.createElement("p");p.className="storelib-form-note";p.setAttribute("role",x.ok?"status":"alert");p.style.cssText="margin:12px 0 0;font-size:.95em";p.textContent=x.ok?(type==="customer"?"Thanks for subscribing.":"Thanks for writing. We'll get back to you soon."):(x.message||"It did not send. Try again.");t.insertAdjacentElement("afterend",p)};fetch("/contact",{method:"POST",body:data,credentials:"same-origin",headers:{"X-Requested-With":"XMLHttpRequest",Accept:"application/json"}}).then(function(r){return r.json().catch(function(){return{ok:false}})}).then(function(x){if(x.ok)f.reset();if(!sec||!sec.id){done();note(x);return}var q=new URLSearchParams(location.search);["customer_posted","contact_posted","form_error","form_type","section_id","sections"].forEach(function(k){q.delete(k)});if(x.ok)q.set(type+"_posted","true");else{q.set("form_error",x.code||"failed");q.set("form_type",type)}q.set("section_id",sec.id.replace(/^shopify-section-/,""));var forms=function(root){return[].slice.call(root.querySelectorAll('form')).filter(function(g){var t=g.querySelector('input[name="form_type"]');return t&&t.value===type})};var at=forms(sec).indexOf(f);var before=f.innerText;return fetch(location.pathname+"?"+q.toString(),{credentials:"same-origin"}).then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(html){var t=document.createElement("template");t.innerHTML=html.trim();var n=t.content.firstElementChild;if(!n||n.id!==sec.id)throw 0;var nf=forms(n)[at];if(!nf)throw 0;f.replaceWith(nf);if(!x.ok)Object.keys(kept).forEach(function(k){if(k==="form_type"||k==="utf8")return;nf.querySelectorAll('[name="'+(window.CSS&&CSS.escape?CSS.escape(k):k)+'"]').forEach(function(i){if(i.type!=="hidden"&&i.type!=="checkbox"&&i.type!=="radio"&&i.type!=="submit")i.value=kept[k]})});if(nf.innerText===before)note(x,nf);var m=nf.querySelector('[role=alert],[role=status],.form__message,.newsletter-form__message,.errors')||(nf.nextElementSibling&&nf.nextElementSibling.classList.contains("storelib-form-note")?nf.nextElementSibling:null);if(m){if(!m.hasAttribute("tabindex"))m.setAttribute("tabindex","-1");m.focus({preventScroll:true})}}).catch(function(){done();note(x)})}).catch(function(){done();note({ok:false})})});`

/* The next page fetched while the visitor rests on its link, as on a Storelib theme's site (lib/website-builder/prefetch-rules.ts). */
const PREFETCH = `if(!S.designMode&&HTMLScriptElement.supports&&HTMLScriptElement.supports("speculationrules")){var sr=document.createElement("script");sr.type="speculationrules";sr.textContent=${JSON.stringify(JSON.stringify(SITE_PREFETCH_RULES))};document.head.appendChild(sr)}`

/*
  BACK AND FORWARD ARE INSTANT. A page is now sent "private, no-cache"
  (./site.ts), so the browser keeps it whole in its back/forward cache and
  Back shows it at once, scrolled where it was, as on Shopify. The one thing
  that can be out of date is the cart: something added on the next page is
  not in this page's header. So a page brought back that way asks the cart
  how many items it holds now and, if that is not what it was drawn with,
  loads itself again. Nothing happens on an ordinary visit.
*/
const BACK_FORWARD = `if(!S.designMode)window.addEventListener("pageshow",function(e){if(!e.persisted)return;fetch("/cart.js",{credentials:"same-origin",headers:{Accept:"application/json"}}).then(function(r){return r.ok?r.json():null}).then(function(c){if(c&&Number(c.item_count)!==CART_AT_DRAW)location.reload()}).catch(function(){})});`

/*
  ONE PAGE FADES INTO THE NEXT. Between a store's own pages the browser
  cross-fades the old page into the new one (cross-document view
  transitions, as Shopify's Horizon does) instead of a white frame between
  them: Chrome and Safari 18.2 on; elsewhere nothing changes. Added first in
  the head, so a theme that sets its own rule (or turns it off) wins, and
  never for a visitor who asked for less motion. Not in the editor, whose
  canvas is not navigated.
*/
const VIEW_TRANSITION = `if(!S.designMode){var vt=document.createElement("style");vt.setAttribute("data-storelib-view-transition","");vt.textContent="@media (prefers-reduced-motion:no-preference){@view-transition{navigation:auto}}";(document.head||document.documentElement).appendChild(vt)}`

/*
  WHAT SHOPIFY'S OWN SCRIPTS GAVE A THEME. An older theme loads api.jquery.js
  or option_selection.js from Shopify's servers (left out here) for
  Shopify.formatMoney and Shopify.resizeImage, and builds a product card in
  script with them: a recently viewed row, a quick view, a cart drawer.
  Without them the card threw and stayed empty. A theme that defines its
  own (most do) replaces these as it loads.

  A PICTURE ASKED FOR AT A SHOPIFY SIZE. Those scripts size a picture by
  its name ("shirt_400x.jpg", Shopify's CDN), which Storelib's files do not
  answer: a picture that fails with a size in its name is asked for once
  more without it.
*/
const HELPERS = `S.formatMoney=S.formatMoney||function(c,f){if(typeof c==="string")c=c.replace(".","");c=Number(c)||0;f=f||"\${{amount}}";var d=function(n,p,t,s){n=(n/100).toFixed(p);var x=n.split("."),i=x[0].replace(/(\\d)(?=(\\d\\d\\d)+(?!\\d))/g,"$1"+t);return i+(x[1]?s+x[1]:"")};return f.replace(/\\{\\{\\s*(\\w+)\\s*\\}\\}/,function(m,k){switch(k){case"amount":return d(c,2,",",".");case"amount_no_decimals":return d(c,0,",",".");case"amount_with_comma_separator":return d(c,2,".",",");case"amount_no_decimals_with_comma_separator":return d(c,0,".",",");case"amount_with_apostrophe_separator":return d(c,2,"'",".");case"amount_with_space_separator":return d(c,2," ",",");case"amount_no_decimals_with_space_separator":return d(c,0," ",",");case"amount_with_period_and_space_separator":return d(c,2," ",".");default:return d(c,2,",",".")}})};S.resizeImage=S.resizeImage||function(src){return src};document.addEventListener("error",function(e){var im=e.target;if(!im||im.tagName!=="IMG"||im.getAttribute("data-sl-sized"))return;var core="_(?:[0-9]+x[0-9]*|[0-9]*x[0-9]+|pico|icon|thumb|small|compact|medium|large|grande|original|master)(?:@2x)?(?:_crop_[a-z]+)?([.](?:jpe?g|png|gif|webp|avif))";var one=new RegExp(core+"(?=[?#]|$)","i");var src=im.getAttribute("src")||"";if(!one.test(src))return;im.setAttribute("data-sl-sized","");var set=im.getAttribute("srcset");if(set)im.setAttribute("srcset",set.replace(new RegExp(core+"(?=[?# ,]|$)","gi"),"$1"));im.setAttribute("src",src.replace(one,"$1"))},true);`

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
    storelibSignedIn: i.signedIn === true,
  }
  return `<script data-storelib-head>(function(){var d=${js(data)};var S=window.Shopify=window.Shopify||{};for(var k in d)S[k]=d[k];S.cdnHost="";S.loadFeatures=function(f,cb){if(typeof cb==="function")setTimeout(function(){cb(new Error("This feature is not available on Storelib"))},0)};S.PaymentButton=S.PaymentButton||{init:function(){}};S.analytics=S.analytics||{publish:function(){},visitor:function(){}};var SID=${js(i.storeId ?? "")};var CART_AT_DRAW=${js(Math.max(0, Math.floor(i.cartCount ?? 0)))};${HELPERS}${BUY_NOW}${TERMS}${WISHLIST}${ACCOUNT_BUTTON}${FORMS}${PREFETCH}${BACK_FORWARD}${VIEW_TRANSITION}})();</script>`
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
