/**
 * ===========================================================================
 *  WEBSITE SETTINGS › COMMERCE ON AN IMPORTED THEME
 * ===========================================================================
 * A site of Storelib's own draws the free shipping banner over its header and
 * the return policy line beside Check out from React (components/website-
 * builder/theme/ThemePage.tsx, shop-commerce.tsx). An imported Shopify theme
 * draws its own header and its own cart, so the same two controls are put on
 * its pages here, by the live site's handler (./site.ts):
 *
 *   the banner        the first thing in <body>, drawn on the server with the
 *                     visitor's cart, so it says "Spend $12.00 more" from the
 *                     first frame and never moves the page when it arrives.
 *                     A theme's cart script (a drawer's add, a quantity
 *                     changed) is followed, and the line said again from
 *                     /cart.js.
 *   the returns line  under each of the theme's own Check out buttons, on the
 *                     cart page and in a cart drawer the theme draws later.
 *
 * Nothing at all when both are off, which is the default for the banner. The
 * words are site-commerce.ts's, so both kinds of site say the same thing.
 */
import { freeShippingLine } from "@/lib/website-builder/site-commerce"
import { SHOP_CURRENCY } from "@/lib/store/shop-money"
import { formatMinor, minorUnits } from "@/lib/markets/money"

export interface CompatCommerce {
  /** Where shipping turns free, in cents (the amount typed in Website settings, else the shop's rates); null: no banner. */
  freeShippingFromCents: number | null
  /** "Returns accepted within 30 days of delivery.", or null for no line in the cart. */
  returnsLine: string | null
  /**
   * The currency the cart is shown in, when it is a market's (lib/markets/
   * compat-prices.ts commerceInMarket): the amount left is written its way,
   * in the page's language, whole when the market rounds to whole numbers.
   * Absent: the store's dollars.
   */
  money?: { currency: string; locale: string; whole: boolean }
}

/** An amount in hundredths of the currency's major unit, as the banner says it. */
function moneyOf(m: CompatCommerce["money"]): ((cents: number) => string) | undefined {
  if (!m) return undefined
  return (cents) => formatMinor(Math.round((cents / 100) * 10 ** minorUnits(m.currency)), m.currency, m.locale, { wholeAsWhole: m.whole })
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const BAR_CSS =
  "#sl-free-shipping{display:block;width:100%;box-sizing:border-box;padding:8px 16px;text-align:center;font:500 13px/1.4 Inter,system-ui,-apple-system,sans-serif;background:#f3f4f6;color:#1a1a2e;letter-spacing:0}" +
  "#sl-free-shipping i{display:block;height:3px;max-width:240px;margin:6px auto 0;border-radius:3px;background:#e5e7eb;overflow:hidden}" +
  "#sl-free-shipping b{display:block;height:100%;border-radius:3px;background:#1a1a2e;transition:width .4s ease}" +
  "[data-cart-returns]{margin:10px 0 0;font:400 13px/1.45 Inter,system-ui,-apple-system,sans-serif;opacity:.75;text-align:center}" +
  "[data-cart-returns] a{color:inherit;text-decoration:underline;text-underline-offset:2px}"

/** The banner as it stands for a cart of this subtotal. */
function bar(fromCents: number, subtotalCents: number, money: string | ((cents: number) => string)): string {
  const said = freeShippingLine(subtotalCents, fromCents, money)
  if (!said) return ""
  return `<div id="sl-free-shipping" role="status" data-free-shipping-bar=""><span>${esc(said.text)}</span><i aria-hidden="true"><b style="width:${Math.round(said.progress * 100)}%"></b></i></div>`
}

/**
 * Follows the theme's cart: after any add, change, update or clear it asks
 * /cart.js again and says the line again. The theme's own fetch is left as
 * it was; a page that posts its cart form reloads, and is drawn anew.
 */
function barScript(fromCents: number, currency: string, m?: CompatCommerce["money"]): string {
  /* A market's: the same writing as formatMinor (lib/markets/money.ts), in the page: Intl, the currency's own decimals, none for a whole amount in a market that rounds to whole numbers. The store's own: as the page's first line wrote it (shopMoneyIn), en-US style, no grouping. */
  const fmt = m
    ? `function(c){var d=${minorUnits(m.currency)},u=Math.pow(10,d),a=Math.round(c/100*u),k=${m.whole ? "a%u===0?0:d" : "d"};try{return new Intl.NumberFormat(${JSON.stringify(m.locale)},{style:"currency",currency:${JSON.stringify(m.currency)},minimumFractionDigits:k,maximumFractionDigits:k}).format(a/u)}catch(e){return (a/u).toFixed(k)+" ${m.currency}"}}`
    : `function(c){try{return new Intl.NumberFormat("en-US",{style:"currency",currency:${JSON.stringify(currency)},minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:false}).format(c/100)}catch(e){return (c/100).toFixed(2)+" ${currency}"}}`
  return `(function(){var from=${fromCents};var money=${fmt};var el=document.getElementById("sl-free-shipping");if(!el)return;function say(sub){var left=Math.max(0,from-Math.max(0,sub));var t=from===0?"Free shipping on every order":left===0?"You have earned free shipping":"Spend "+money(left)+" more for free shipping";var p=from===0||left===0?1:Math.max(0,Math.min(1,sub/from));el.firstChild.textContent=t;var b=el.querySelector("b");if(b)b.style.width=Math.round(p*100)+"%"}function read(){window.__slFetch("/cart.js",{credentials:"same-origin",headers:{Accept:"application/json"}}).then(function(r){return r.ok?r.json():null}).then(function(c){if(c&&typeof c.total_price==="number")say(c.total_price)}).catch(function(){})}var f=window.fetch;window.__slFetch=f.bind(window);window.fetch=function(i){var p=f.apply(this,arguments);try{var u=typeof i==="string"?i:i&&i.url?i.url:String(i);if(/\\/cart\\/(add|change|update|clear)/.test(u))p.then(function(){setTimeout(read,0)},function(){})}catch(e){}return p};window.addEventListener("pageshow",function(e){if(e.persisted)read()});if(/(?:^|;\\s*)sl_cart_n=[1-9]/.test(document.cookie))read()})();`
}

/** Puts the returns line under each Check out button of the theme's cart, now and whenever the theme draws its cart again. */
function returnsScript(line: string): string {
  const html = `${esc(line)} <a href="/policies/refund-policy">Return policy</a>`
  return `(function(){var html=${JSON.stringify(html)};var sel='button[name="checkout"],input[name="checkout"],a[href="/checkout"],a[href^="/checkout?"]';function put(){var all=document.querySelectorAll(sel);for(var i=0;i<all.length;i++){var b=all[i];if(b.closest("[data-cart-returns]"))continue;var at=b.parentElement&&b.parentElement.children.length<=3?b.parentElement:b;var n=at.nextElementSibling;if(n&&n.hasAttribute("data-cart-returns"))continue;var p=document.createElement("p");p.setAttribute("data-cart-returns","");p.innerHTML=html;at.insertAdjacentElement("afterend",p)}}put();var q=0;new MutationObserver(function(){if(q)return;q=1;requestAnimationFrame(function(){q=0;put()})}).observe(document.body,{childList:true,subtree:true})})();`
}

/** What a page of the site carries for these settings: the start of its body and the end. Empty strings when there is nothing to say. */
export function commerceMarkup(c: CompatCommerce | null | undefined, subtotalCents: number, currency: string = SHOP_CURRENCY): { bodyStart: string; head: string; bodyEnd: string } {
  if (!c) return { bodyStart: "", head: "", bodyEnd: "" }
  const banner = c.freeShippingFromCents !== null ? bar(c.freeShippingFromCents, subtotalCents, moneyOf(c.money) ?? currency) : ""
  const returns = c.returnsLine ? returnsScript(c.returnsLine) : ""
  if (!banner && !returns) return { bodyStart: "", head: "", bodyEnd: "" }
  const scripts = `${banner ? barScript(c.freeShippingFromCents as number, currency, c.money) : ""}${returns}`
  return {
    bodyStart: banner,
    head: `<style data-storelib-commerce>${BAR_CSS}</style>`,
    bodyEnd: `<script data-storelib-commerce>${scripts}</script>`,
  }
}

/** The page with the banner as the first thing in its body. */
export function withBodyStart(html: string, start: string): string {
  if (!start) return html
  return /<body\b[^>]*>/i.test(html) ? html.replace(/<body\b[^>]*>/i, (m) => `${m}${start}`) : `${start}${html}`
}
