/**
 * ===========================================================================
 *  THE LIVE PREVIEW'S CART: ADD TO CART, THE DRAWER, THE CART PAGE
 * ===========================================================================
 * A template's live preview (scripts/build-template-previews.ts) is static
 * files: no store answers /cart/add. So a visitor can still add a product,
 * see Materia's own cart drawer open with it, change the quantity and go on
 * to the cart page, the build draws those two sections here, through the
 * same engine a live store answers with (lib/storelib-theme/compat/site.ts),
 * once for each thing that can be in the cart (every variant in stock, and
 * each product without options), and the preview's shim puts them together
 * in the browser for whatever the visitor's cart holds.
 *
 *   one line each   the drawer (minicart-form) and the cart page's section
 *                   drawn for a cart of that one line, quantity 1, with the
 *                   line key "pv<n>x"; the shim takes the line's own markup
 *                   out of each and lays the lines into the first one's
 *                   drawer or page, sets each quantity, multiplies the
 *                   line's price and writes the subtotal
 *   kept small      a variant's drawing is written as its difference from
 *                   its product's first variant, and that one as its
 *                   difference from the first line: about a product's worth
 *                   of markup each, instead of a whole drawer per variant.
 *                   Every difference is checked here by applying it, so the
 *                   shim draws exactly what the engine drew
 *   the cart        cart.js's own line for each, with its price; the shim
 *                   answers /cart.js, /cart/add, /cart/change, /cart/update
 *                   and ?sections= from them, as a store would
 *
 * The visitor's cart is kept per website in the page address (?slc=, which
 * the shim adds to the links it follows), the frame's window.name and, where
 * the page may use it, localStorage: the marketplace's frame is sandboxed
 * without storage, and each page is drawn in a frame of its own.
 * Checkout and Buy now stay a note: a preview takes no order.
 */
import { answer, type CartEntry, type SiteData } from "../../lib/storelib-theme/compat/site"

/** Splits markup into tokens that join back to it exactly, by the smallest pieces (0) or by lines (1); the shim splits the same way (PREVIEW_CART_SHIM). */
const SPLIT = [/(?=[<"\s>=])/, /(?=\n)/]
type Op = [at: number, remove: number, insert: string]
/** A difference: how the tokens of one kind (`t`, an index of SPLIT) change. */
export interface Diff { t: number; o: Op[] }
const MAX_CELLS = 64_000_000

/** The changes from tokens A to tokens B: what is the same at either end is left, and the middle by the longest run they share. Null when the middle is too long to compare. */
function changes(A: string[], B: string[]): Op[] | null {
  let p = 0
  while (p < A.length && p < B.length && A[p] === B[p]) p++
  let s = 0
  while (s < A.length - p && s < B.length - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s++
  const a1 = A.slice(p, A.length - s)
  const b1 = B.slice(p, B.length - s)
  const n = a1.length
  const m = b1.length
  if (!n || !m) return n || m ? [[p, n, b1.join("")]] : []
  if (n * m > MAX_CELLS || Math.min(n, m) > 65_000) return null
  /* The longest shared run from each pair of places on, read from the end. */
  const w = m + 1
  const dp = new Uint16Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a1[i] === b1[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
    }
  }
  const ops: Op[] = []
  let i = 0
  let j = 0
  let op: Op | null = null
  while (i < n || j < m) {
    if (i < n && j < m && a1[i] === b1[j]) {
      if (op) ops.push(op)
      op = null
      i++
      j++
    } else if (j < m && (i === n || dp[i * w + j + 1] >= dp[(i + 1) * w + j])) {
      op ??= [p + i, 0, ""]
      op[2] += b1[j++]
    } else {
      op ??= [p + i, 0, ""]
      op[1]++
      i++
    }
  }
  if (op) ops.push(op)
  return ops
}

/** How to turn markup `a` into `b`: by its smallest pieces where they can be compared, else by lines, else the middle whole. */
export function diffMarkup(a: string, b: string): Diff {
  for (let t = 0; t < SPLIT.length; t++) {
    const ops = changes(a.split(SPLIT[t]), b.split(SPLIT[t]))
    if (ops) return { t, o: ops }
  }
  return { t: 0, o: [[0, a.split(SPLIT[0]).length, b]] }
}

/** `diffMarkup`'s difference applied, as the shim applies it. */
export function patchMarkup(base: string, diff: Diff): string {
  if (!diff.o.length) return base
  const t = base.split(SPLIT[diff.t])
  for (let k = diff.o.length - 1; k >= 0; k--) t.splice(diff.o[k][0], diff.o[k][1], diff.o[k][2])
  return t.join("")
}

export interface PreviewCartData {
  /** The shop's money format ("${{amount}}"). */
  fmt: string
  cur: string
  /** The cart page's section, by the name its page gives it (data-id on #main-cart-items). */
  page: string
  /** The drawer and the cart page for an empty cart. */
  empty: [drawer: string, page: string]
  /** Each thing a cart can hold, in order: `b` the one its drawing and its cart line are told from (-1: the first, told from the empty cart); `d`, `r` and `item` a difference, or whole where that is no longer. */
  e: { k: string; id: string; p: string; one: boolean; b: number; d: Diff | string; r: Diff | string; item: Diff | string }[]
}

const MAX_LINES = 160

/**
 * The cart's drawings for a template's sample shop. `finish` makes a section's markup what a
 * page of the preview is (its pictures, scripts and links as the preview's own files), and
 * `pageOf` is the preview's file for a page's address.
 */
export async function previewCartData(site: SiteData, cartPageHtml: string, finish: (html: string) => Promise<string>, pageOf: (href: string) => string | null): Promise<PreviewCartData | null> {
  const page = /\bid="main-cart-items"[^>]*\bdata-id="([^"]+)"/.exec(cartPageHtml)?.[1] ?? /\bdata-id="([^"]+)"[^>]*\bid="main-cart-items"/.exec(cartPageHtml)?.[1]
  if (!page) return null
  type Card = { id: string; settings: { kind?: string; variants?: { id: string; available?: boolean }[] } }
  const things: { p: string; v: string | null; one: boolean }[] = []
  for (const card of site.products as unknown as Card[]) {
    const one = String(card.settings.kind ?? "") === "digital"
    const variants = card.settings.variants ?? []
    if (!variants.length) things.push({ p: card.id, v: null, one })
    else for (const v of variants) if (v.available !== false) things.push({ p: card.id, v: v.id, one })
  }
  if (!things.length) return null
  const list = things.slice(0, MAX_LINES)
  /* The stylesheets the cart page already carries are not written again: the drawer and the page section keep their own (see arrive in the shim). */
  const page0 = await finish(cartPageHtml)
  const draw = async (cart: CartEntry[], path: string, id: string): Promise<string> => {
    const res = await answer(site, { method: "GET", path, query: new URLSearchParams(`sections=${id}`), body: null, cart })
    const html = (JSON.parse(String(res.body)) as Record<string, string | null>)[id]
    if (!html) throw new Error(`the ${id} section did not draw for ${path}`)
    /* Only those before the section's own content (#minicart-form, #main-cart-items): what the theme swaps in later keeps its styles. */
    const out = await finish(html)
    const at = out.search(/\bid="(?:minicart-form|main-cart-items)"/)
    if (at < 0) return out
    const head = out.slice(0, out.lastIndexOf("<", at))
    return head.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (m) => (m.length > 200 && page0.includes(m) ? "" : m)) + out.slice(head.length)
  }
  const empty: [string, string] = [await draw([], "/", "minicart-form"), await draw([], "/cart", page)]
  const drawn: [string, string][] = []
  const items: Record<string, unknown>[] = []
  for (let i = 0; i < list.length; i++) {
    const t = list[i]
    const line: CartEntry = { k: `pv${i}x`, p: t.p, v: t.v, q: 1 }
    drawn.push([await draw([line], "/", "minicart-form"), await draw([line], "/cart", page)])
    const cart = JSON.parse(String((await answer(site, { method: "GET", path: "/cart.js", query: new URLSearchParams(), body: null, cart: [line] })).body)) as { items: Record<string, unknown>[] }
    /* The line's pictures and its link as the preview's own files, like the markup's. */
    const item = JSON.parse(await finish(JSON.stringify(cart.items[0]))) as Record<string, unknown>
    if (typeof item.url === "string") item.url = pageOf(item.url) ?? item.url
    items.push(item)
  }
  const firstOf = new Map<string, number>()
  const e: PreviewCartData["e"] = list.map((t, i) => {
    const item = items[i]
    let b = firstOf.get(t.p)
    if (b === undefined) {
      /* A product's first line: from whichever product's first line before it is nearest (the shortest difference). */
      const firsts = [...firstOf.values()]
      firstOf.set(t.p, i)
      b = -1
      let best = Infinity
      for (const f of firsts) {
        const size = JSON.stringify(diffMarkup(drawn[f][0], drawn[i][0]).o).length + JSON.stringify(diffMarkup(drawn[f][1], drawn[i][1]).o).length
        if (size < best) [best, b] = [size, f]
      }
    }
    /* Told from what it is nearest: its product's first line, another product's first line, and the first line itself from the empty cart. Kept whole where that is no shorter. */
    const told = (from: string, to: string): Diff | string => {
      const ops = diffMarkup(from, to)
      if (patchMarkup(from, ops) !== to) throw new Error(`the cart drawing of line ${i} does not come back from its difference`)
      return JSON.stringify(ops).length < to.length ? ops : to
    }
    const own = JSON.stringify(item)
    return {
      k: `pv${i}x`, id: String(item.variant_id ?? item.id ?? t.v ?? t.p), p: t.p, one: t.one, b: b!,
      d: told(b === -1 ? empty[0] : drawn[b!][0], drawn[i][0]),
      r: told(b === -1 ? empty[1] : drawn[b!][1], drawn[i][1]),
      item: b === -1 ? own : told(JSON.stringify(items[b!]), own),
    }
  })
  const shop = site.shop as { currency?: string; moneyFormat?: string }
  return { fmt: shop.moneyFormat ?? "${{amount}}", cur: shop.currency ?? "USD", page, empty, e }
}

/**
 * The shim's cart, inside the preview's shim (scripts/build-template-previews.ts SHIM): `W`, `D`, `F`
 * (the page's own fetch), `ROOT` and `showNote` are the shim's. `CART_DATA` is the address
 * of the template's PreviewCartData.
 */
export const PREVIEW_CART_SHIM = String.raw`
var SLUG=location.pathname.slice(ROOT.length).split("/")[0],CK="slpv-cart:"+SLUG,RE=[/(?=[<"\s>=])/,/(?=\n)/];
function dec(s){var m=/^(\d+)~(.*)$/.exec(s||"");if(!m)return null;var lines=[];(m[2]?m[2].split("-"):[]).forEach(function(x){var p=x.split(".");var e=+p[0],q=+p[1];if(e>=0&&q>0&&e===Math.floor(e))lines.push({e:e,q:Math.min(99,Math.floor(q))})});return{t:+m[1],l:lines}}
function enc(c){return c.t+"~"+c.l.map(function(x){return x.e+"."+x.q}).join("-")}
function names(){try{var n=JSON.parse(W.name||"null");return n&&typeof n==="object"&&n.slpv?n:null}catch(e){return null}}
var BAG=(function(){var best={t:0,l:[]},take=function(c){if(c&&c.t>=best.t)best=c};
var m=/[?&]slc=([^&#]*)/.exec(location.search);if(m)take(dec(decodeURIComponent(m[1])));
var n=names();if(n&&n.slpv[SLUG])take(dec(n.slpv[SLUG]));
try{take(dec(W.localStorage.getItem(CK)))}catch(e){}
return best})();
function keep(){BAG.t=Date.now();var s=enc(BAG);try{W.localStorage.setItem(CK,s)}catch(e){}
try{if(!W.name||names()){var n=names()||{slpv:{}};n.slpv[SLUG]=s;W.name=JSON.stringify(n)}}catch(e){}}
function carry(u){if(!BAG.t)return u;try{var x=new URL(u,location.href);if(x.pathname.indexOf(ROOT+SLUG+"/")!==0||!/[.]html$/.test(x.pathname))return u;x.searchParams.set("slc",enc(BAG));return x.href}catch(e){return u}}
D.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(a&&!a.hasAttribute("data-preview-inert")){var to=carry(a.href);if(to!==a.href)a.href=to}},true);
var DATA=null,DP=null;function data(){return DP||(DP=F(CART_DATA).then(function(r){return r.json()}).then(function(d){DATA=d;BAG.l=BAG.l.filter(function(x){return x.e<d.e.length});return d}))}
var made={};function sec(i,k){var id=i+":"+k;if(made[id])return made[id];var x=DATA.e[i],o=k?x.r:x.d,s=typeof o==="string"?o:patch(x.b<0?DATA.empty[k]:sec(x.b,k),o);return made[id]=s}
var its={};function itemOf(i){if(its[i])return its[i];var x=DATA.e[i],o=x.item;return its[i]=typeof o==="string"?o:patch(itemOf(x.b),o)}
function patch(b,x){var ops=x.o;if(!ops.length)return b;var t=b.split(RE[x.t]);for(var k=ops.length-1;k>=0;k--)t.splice(ops[k][0],ops[k][1],ops[k][2]);return t.join("")}
function money(c){var f=DATA.fmt||"$"+"{{amount}}",m=/\{\{\s*(\w+)\s*\}\}/.exec(f),k=m?m[1]:"amount",dp=/no_decimals/.test(k)?0:2,eu=/comma_separator/.test(k),p=(c/100).toFixed(dp).split(".");var s=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,eu?".":(/apostrophe/.test(k)?"'":","))+(p[1]?(eu?",":".")+p[1]:"");return f.replace(/\{\{\s*\w+\s*\}\}/,s)}
function moneyRe(){var f=DATA.fmt||"$"+"{{amount}}",at=f.search(/\{\{/),end=f.indexOf("}}")+2;var esc=function(s){return s.replace(/[.*+?^$()|[\]\\{}]/g,"\\$&")};return new RegExp(esc(f.slice(0,at))+"\\d[\\d.,']*"+esc(f.slice(end)),"g")}
function cents(s){var d=s.replace(/[^\d]/g,"");return /no_decimals/.test(DATA.fmt)?+d*100:+d}
function texts(root,fn){if(!root)return;var w=root.ownerDocument.createTreeWalker(root,4),n;while(n=w.nextNode())n.nodeValue=fn(n.nodeValue)}
function times(root,q){if(q===1)return;var re=moneyRe();texts(root,function(v){return v.replace(re,function(m){return money(cents(m)*q)})})}
function set(root,c){var re=moneyRe(),done=false;texts(root,function(v){return v.replace(re,function(){if(done)return"";done=true;return money(c)})})}
function line(el,q){el.querySelectorAll('input[name="updates[]"]').forEach(function(i){i.value=q;i.setAttribute("value",q);i.setAttribute("data-value",q)});el.querySelectorAll("[data-quantity]").forEach(function(x){x.setAttribute("data-quantity",q)});
el.querySelectorAll(".minicart__item-prices,.cart-item__totals").forEach(function(x){times(x,q)})}
function item(x,n){var it=JSON.parse(itemOf(x.e)),q=x.q;it.quantity=q;it.key=DATA.e[x.e].k;["line_price","original_line_price","final_line_price","discounted_line_price"].forEach(function(k){if(typeof it[k]==="number")it[k]=it[k]*q});return it}
function cartJson(){var items=BAG.l.map(item),sum=function(k){return items.reduce(function(a,b){return a+(+b[k]||0)},0)},total=sum("final_line_price")||sum("line_price");
return{token:"preview",note:BAG.note||"",attributes:{},original_total_price:sum("original_line_price")||total,total_price:total,total_discount:0,total_weight:0,item_count:items.reduce(function(a,b){return a+b.quantity},0),items:items,requires_shipping:items.some(function(i){return i.requires_shipping}),currency:DATA.cur,items_subtotal_price:total,cart_level_discount_applications:[]}}
var DP2=new DOMParser();
function compose(k){if(!BAG.l.length)return DATA.empty[k];var c=cartJson(),docs=BAG.l.map(function(x){return DP2.parseFromString(sec(x.e,k),"text/html")}),sk=docs[0];
var pick=function(d){return k?d.querySelector("table.cart-items tbody > tr.cart-item"):d.querySelector("#minicart-form .items > .cart-item")};
var first=pick(sk);if(!first)return DATA.empty[k];var box=first.parentNode;
BAG.l.forEach(function(x,n){var el=n?sk.importNode(pick(docs[n]),true):first;line(el,x.q);if(k)renumber(el,n+1);if(n)box.appendChild(el)});
sk.querySelectorAll("[data-cart-subtotal-price],.cart-info .totals").forEach(function(x){set(x,c.total_price)});
return sk.body.innerHTML}
function renumber(el,n){[el].concat([].slice.call(el.querySelectorAll("*"))).forEach(function(x){["id","for","data-index"].forEach(function(a){var v=x.getAttribute(a);if(v!=null&&/(^|-)1$/.test(v))x.setAttribute(a,v.replace(/1$/,n))});if(x.classList)[].slice.call(x.classList).forEach(function(c){if(/^cart-item__totals-1$/.test(c)){x.classList.remove(c);x.classList.add("cart-item__totals-"+n)}})})}
function sections(ask){var out={};(Array.isArray(ask)?ask:String(ask||"").split(",")).forEach(function(s){s=String(s).trim();if(!s)return;out[s]=s==="minicart-form"?compose(0):s===DATA.page?compose(1):null});return out}
function find(id){id=String(id==null?"":id);var m=/^pv(\d+)x$/.exec(id);if(m)return +m[1];for(var i=0;i<DATA.e.length;i++)if(DATA.e[i].id===id||DATA.e[i].k===id)return i;for(i=0;i<DATA.e.length;i++)if(DATA.e[i].p===id)return i;return -1}
function fieldsOf(b){var o={};if(!b)return o;if(typeof b==="string"){try{return JSON.parse(b)}catch(e){b=new URLSearchParams(b)}}
if(b.forEach&&!Array.isArray(b)){b.forEach(function(v,k){var m=/^items\[(\d+)\]\[(\w+)\]$/.exec(k);if(m){(o.items=o.items||[])[+m[1]]=(o.items[+m[1]]||{});o.items[+m[1]][m[2]]=v;return}var u=/^updates\[(.*)\]$/.exec(k);if(u){(o.updates=o.updates||(u[1]===""?[]:{}));if(Array.isArray(o.updates))o.updates.push(v);else o.updates[u[1]]=v;return}o[k]=v});return o}return o}
function lineOf(f){if(f.line!=null&&f.line!==""){var n=+f.line-1;return BAG.l[n]?n:-1}var e=find(f.id);for(var i=0;i<BAG.l.length;i++)if(BAG.l[i].e===e)return i;return -1}
function setQ(n,q){q=Math.max(0,Math.min(99,Math.floor(+q)||0));if(n<0)return;if(!q)BAG.l.splice(n,1);else BAG.l[n].q=DATA.e[BAG.l[n].e].one?1:q}
function bad(m){return[422,{status:422,message:m,description:m}]}
function cartReply(p,o){var f=fieldsOf(o&&o.body),act=/\/cart\/(add|change|update|clear)(?:\.js)?$/.exec(p);return data().then(function(){
if(!act){var j=cartJson();return[200,j]}
if(act[1]==="add"){var list=f.items&&f.items.length?f.items.filter(Boolean):[{id:f.id,quantity:f.quantity}],added=[];
for(var i=0;i<list.length;i++){var e=find(list[i].id);if(e<0)return bad("This option is sold out.");var q=Math.max(1,Math.min(99,Math.floor(+list[i].quantity)||1)),hit=null;
BAG.l.forEach(function(x){if(x.e===e)hit=x});if(hit)hit.q=DATA.e[e].one?1:Math.min(99,hit.q+q);else{hit={e:e,q:DATA.e[e].one?1:q};BAG.l.push(hit)}added.push(hit)}
keep();var out=f.items&&f.items.length?{items:added.map(item)}:item(added[0]);if(f.sections)out.sections=sections(f.sections);return[200,out]}
if(act[1]==="change"){setQ(lineOf(f),f.quantity)}
else if(act[1]==="clear"){BAG.l=[]}
else{if(f.note!=null)BAG.note=String(f.note);var u=f.updates;if(Array.isArray(u))u.forEach(function(q,n){setQ(n,q)});else if(u&&typeof u==="object")Object.keys(u).forEach(function(k){setQ(lineOf({id:k}),u[k])})}
BAG.l=BAG.l.filter(function(x){return x.q>0});keep();var j=cartJson();if(f.sections)j.sections=sections(f.sections);return[200,j]})}
function sectionsReply(u){return data().then(function(){var x=new URL(u,location.href);return[200,sections(x.searchParams.get("sections"))]})}
function count(){return BAG.l.reduce(function(a,b){return a+b.q},0)}
function paintCount(){var n=count();D.querySelectorAll(".cart-count").forEach(function(el){var t=el.classList.contains("cart-count-drawer")?"("+n+")":String(n);if(el.textContent.trim()!==t)el.textContent=t})}
var hold=null;if(BAG.l.length&&/\/cart\.html$/.test(location.pathname)){hold=D.createElement("style");hold.textContent="#main-cart-items{visibility:hidden}";(D.head||D.documentElement).appendChild(hold)}
function arrive(){if(W.routes){try{var cu=W.routes.cart_url;Object.defineProperty(W.routes,"cart_url",{configurable:true,get:function(){return carry(ROOT+SLUG+"/cart.html")}})}catch(e){}}
if(!CART_DATA||!BAG.l.length)return;paintCount();data().then(function(){if(!BAG.l.length){if(hold)hold.remove();return}
var dr=D.getElementById("minicart-form");if(dr){var d=DP2.parseFromString(compose(0),"text/html").querySelector("#minicart-form");if(d){dr.innerHTML=d.innerHTML;var cd=dr.closest("cart-drawer,cart-notification,.is-empty");if(cd)cd.classList.remove("is-empty")}}
var pg=D.getElementById("main-cart-items");if(pg){var s=pg.closest(".shopify-section")||pg.parentNode,n=DP2.parseFromString(compose(1),"text/html").querySelector(".shopify-section");if(s&&n){[].slice.call(s.childNodes).forEach(function(c){if(c.nodeName!=="STYLE"&&c.nodeName!=="LINK")s.removeChild(c)});[].slice.call(n.childNodes).forEach(function(c){s.appendChild(D.importNode(c,true))})}}
paintCount();if(hold)requestAnimationFrame(function(){hold.remove()})}).catch(function(){if(hold)hold.remove()})}
if(D.readyState==="loading")D.addEventListener("DOMContentLoaded",arrive);else arrive();
`
