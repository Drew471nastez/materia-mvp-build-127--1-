/**
 * An imported theme's product page for scripts/check-store-r11.mjs, served by
 * the live site's own handler (lib/storelib-theme/compat/site.ts answer), so
 * the page carries exactly the head every imported theme's page carries.
 *
 * Three sections with an Add to cart button, each written the way a family
 * of Shopify themes writes it, each with a cart icon in the button:
 *
 *   main-product      Dawn: `loading` on the button, its .loading__spinner
 *                     shown, the label made transparent, an icon drawn in a
 *                     colour of its own (so the theme's transparent label
 *                     does not hide it)
 *   featured-product  aria-busy="true" on the button and a spinner span of
 *                     its own; the label stays
 *   product-grid      a card's quick add: `is-loading` on the form, not on
 *                     the button
 *
 * The theme's script does what theirs do: marks the button busy, posts to
 * /cart/add.js with the drawer's section, draws the drawer from the answer,
 * slides it open, and takes the busy mark off (on an error too). The server
 * waits 450ms before answering, so a probe can watch the busy frames.
 *
 * NO_FIX=1 takes Storelib's busy-button rule out of the page, to see the
 * bug it fixes.
 */
import { createServer, type Server } from "node:http"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { answer, readCartCookie, writeCartCookie, CART_COOKIE, type SiteData } from "../lib/storelib-theme/compat/site"
import { formFields } from "../lib/storelib-theme/compat/form-fields"

const SHOP = "5b1c0000-0000-4000-8000-000000000011"
const MUG = "5b1c0000-0000-4000-8000-0000000000d1"
const MUG_V = "5b1c0000-0000-4000-8000-0000000000e1"
/** An option that is not for sale: Add to cart answers 422, as Shopify does. */
const GONE_V = "5b1c0000-0000-4000-8000-0000000000e2"

const ICON = `<svg class="icon icon-cart" aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24"><path fill="#e11d48" d="M3 4h2l2.4 10.2A2 2 0 0 0 9.3 16H18a2 2 0 0 0 1.9-1.4L22 8H6.2"/><circle fill="#e11d48" cx="9.5" cy="20" r="1.5"/><circle fill="#e11d48" cx="17.5" cy="20" r="1.5"/></svg>`
const SPINNER_SVG = `<svg class="spinner" viewBox="0 0 66 66" width="20" height="20" aria-hidden="true"><circle class="path" fill="none" stroke="currentColor" stroke-width="6" cx="33" cy="33" r="30" stroke-dasharray="140" stroke-dashoffset="40"/></svg>`

const section = (type: string, markup: string) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings: [] })}\n</schema>\n`

const MAIN = `<section class="main-product" data-section="main-product">
<h1>{{ product.title }}</h1><p class="price">{{ product.price | money }}</p>
<form action="/cart/add" method="post" class="product-form" data-variant="{{ product.selected_or_first_available_variant.id }}">
<input type="hidden" name="id" value="{{ product.selected_or_first_available_variant.id }}">
<button type="submit" name="add" class="product-form__submit button" data-probe="main">${ICON}<span>Add to cart</span><div class="loading__spinner hidden">${SPINNER_SVG}</div></button>
</form>
<form action="/cart/add" method="post" class="product-form">
<input type="hidden" name="id" value="${GONE_V}">
<button type="submit" name="add" class="product-form__submit button" data-probe="error">${ICON}<span>Add to cart</span><div class="loading__spinner hidden">${SPINNER_SVG}</div></button>
</form>
</section>`

const FEATURED = `<section class="featured-product" data-section="featured-product">
<h2>Featured: {{ product.title }}</h2>
<form action="/cart/add" method="post" class="featured__form">
<input type="hidden" name="id" value="{{ product.selected_or_first_available_variant.id }}">
<button type="submit" class="btn add-to-cart" data-probe="featured">${ICON}<span class="btn__text">Add to cart</span><span class="btn__spinner" hidden></span></button>
</form>
</section>`

const GRID = `<section class="product-grid" data-section="product-grid"><ul class="grid">
<li class="card"><p>{{ product.title }}</p>
<form action="/cart/add" method="post" class="quick-add">
<input type="hidden" name="id" value="{{ product.selected_or_first_available_variant.id }}">
<button type="submit" class="quick-add__submit" data-probe="card">${ICON}<span>Add</span><span class="quick-add__loader" hidden></span></button>
</form></li>
</ul></section>`

const DRAWER = `<cart-drawer class="drawer" data-section-id="{{ section.id }}"><div class="drawer__inner"><h2>Your cart ({{ cart.item_count }})</h2>{% for item in cart.items %}<p class="line">{{ item.title }} &times; {{ item.quantity }}</p>{% endfor %}</div></cart-drawer>`

const CSS = `<style>
*{box-sizing:border-box}body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:16px;color:#111113;background:#fff}
section{max-width:520px;margin:0 auto 28px}
.button,.btn,.quick-add__submit{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:50px;padding:0 24px;border:0;border-radius:10px;background:#111113;color:#fff;font:600 15px/1 system-ui,sans-serif;cursor:pointer}
.quick-add__submit{width:auto;min-height:40px;font-size:13px;background:#fff;color:#111113;border:1.5px solid #111113}
.product-form+.product-form{margin-top:10px}
/* Dawn: the label goes transparent and the spinner sits in the middle. */
.button.loading{color:transparent;pointer-events:none}
.loading__spinner{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff}
.loading__spinner.hidden{display:none}
.spinner{animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
/* A theme whose label stays: the spinner takes a box of its own after it. */
.btn__spinner,.quick-add__loader{position:absolute;right:16px;top:50%;width:16px;height:16px;margin-top:-8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .8s linear infinite}
.btn__spinner[hidden],.quick-add__loader[hidden]{display:none}
.drawer{position:fixed;top:0;right:0;bottom:0;width:min(380px,90vw);background:#fff;box-shadow:-8px 0 24px rgba(0,0,0,.12);transform:translateX(100%);transition:transform .28s cubic-bezier(.2,.8,.2,1);padding:20px}
.drawer.active{transform:none}
.error{color:#b42318;font-size:13px}
</style>`

const SCRIPT = `<script>
function busyOn(f,b){if(b.dataset.probe==="main"||b.dataset.probe==="error"){b.classList.add("loading");b.setAttribute("aria-disabled","true");b.querySelector(".loading__spinner").classList.remove("hidden")}
 else if(b.dataset.probe==="featured"){b.setAttribute("aria-busy","true");b.querySelector(".btn__spinner").hidden=false}
 else{f.classList.add("is-loading");b.querySelector(".quick-add__loader").hidden=false}}
function busyOff(f,b){b.classList.remove("loading");b.removeAttribute("aria-disabled");b.removeAttribute("aria-busy");f.classList.remove("is-loading");
 var s=b.querySelector(".loading__spinner");if(s)s.classList.add("hidden");var t=b.querySelector(".btn__spinner,.quick-add__loader");if(t)t.hidden=true}
document.addEventListener("submit",function(e){var f=e.target;if(!f.matches('form[action="/cart/add"]'))return;e.preventDefault();var b=f.querySelector("button");
 busyOn(f,b);var old=f.querySelector(".error");if(old)old.remove();
 fetch("/cart/add.js",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({items:[{id:f.querySelector('[name=id]').value,quantity:1}],sections:["cart-drawer"]})})
 .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})})
 .then(function(x){
   if(!x.ok){var p=document.createElement("p");p.className="error";p.textContent=x.j.description||x.j.message||"Could not add";f.appendChild(p);return}
   var t=document.createElement("template");t.innerHTML=(x.j.sections&&x.j.sections["cart-drawer"])||"";var n=t.content.querySelector("cart-drawer");var o=document.querySelector("cart-drawer");
   if(n&&o){o.querySelector(".drawer__inner").replaceWith(n.querySelector(".drawer__inner"))}
   requestAnimationFrame(function(){document.querySelector("cart-drawer").classList.add("active")})})
 .catch(function(){}).then(function(){busyOff(f,b)})});
document.addEventListener("keydown",function(e){if(e.key==="Escape")document.querySelector("cart-drawer").classList.remove("active")});
window.__closeDrawer=function(){document.querySelector("cart-drawer").classList.remove("active")};
</script>`

const files: Record<string, string> = {
  "layout/theme.storelib": wrapCompatTemplate(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1">{{ content_for_header }}${CSS}</head><body>{% section 'cart-drawer' %}<main>{{ content_for_layout }}</main>${SCRIPT}</body></html>`),
  "sections/cart-drawer.storelib": section("cart-drawer", DRAWER),
  "sections/main-product.storelib": section("main-product", MAIN),
  "sections/featured-product.storelib": section("featured-product", FEATURED),
  "sections/product-grid.storelib": section("product-grid", GRID),
  "templates/product.json": JSON.stringify({ sections: { main: { type: "main-product" }, featured: { type: "featured-product" }, grid: { type: "product-grid" } }, order: ["main", "featured", "grid"] }),
}

export function startThemeServer(): Promise<{ origin: string; server: Server }> {
  const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
  const products = [
    {
      id: MUG,
      settings: {
        title: "Stoneware mug",
        price: "$24.00",
        image: "",
        url: "/products/stoneware-mug",
        slug: "stoneware-mug",
        kind: "physical",
        available: true,
        variants: [
          { id: MUG_V, name: "Sand", price: "$24.00", available: true },
          { id: GONE_V, name: "Clay", price: "$24.00", available: false },
        ],
        options: [],
      },
    },
  ]
  const pages = { product: [{ id: "main", type: "main-product" }, { id: "featured", type: "featured-product" }, { id: "grid", type: "product-grid" }] }
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1")
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      const raw = Buffer.concat(chunks).toString("utf8")
      const type = String(req.headers["content-type"] ?? "")
      const body = raw ? (type.includes("json") ? JSON.parse(raw) : formFields(new URLSearchParams(raw).entries())) : null
      const cookie = String(req.headers.cookie ?? "").match(new RegExp(`(?:^|;\\s*)${CART_COOKIE}=([^;]*)`))?.[1]
      const kept = readCartCookie(cookie)
      if (url.pathname.startsWith("/cart/add")) await new Promise((r) => setTimeout(r, 450))
      const site: SiteData = { creatorId: SHOP, theme, pages: pages as never, products: products as never, collections: [], menus: {}, shop: { name: "Clay Shop", currency: "USD", moneyFormat: "${{amount}}" } as never, host: "127.0.0.1" }
      const ajax = type.includes("json") || String(req.headers.accept ?? "").includes("application/json")
      const out = await answer(site, { method: req.method ?? "GET", path: url.pathname, query: url.searchParams, body, cart: kept.cart, note: kept.note, attributes: kept.attributes, discountCode: kept.discount, ajax, referer: "/products/stoneware-mug" })
      const headers: Record<string, string | string[]> = { ...(out.headers ?? {}), "Content-Type": out.type }
      if (out.cart) headers["Set-Cookie"] = `${CART_COOKIE}=${writeCartCookie(out.cart, out.note ?? "", out.attributes ?? kept.attributes, out.discountCode ?? kept.discount)}; Path=/; SameSite=Lax; HttpOnly`
      let text = out.body
      if (process.env.NO_FIX && out.type.includes("html")) text = text.replace(/<style data-sl-busy-buttons>[\s\S]*?<\/style>/g, "")
      res.writeHead(out.status, headers)
      res.end(text)
    } catch (e) {
      res.writeHead(500, { "Content-Type": "text/plain" })
      res.end(String(e))
    }
  })
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ origin: `http://127.0.0.1:${(server.address() as { port: number }).port}`, server })))
}
