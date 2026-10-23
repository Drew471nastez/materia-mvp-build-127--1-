/**
 * ===========================================================================
 *  AN IMPORTED THEME'S CART DRAWER, PRESSED IN A BROWSER
 * ===========================================================================
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/check-compat-cart-drawer.ts
 *
 * A theme's cart drawer written the way Shopify's own themes write theirs
 * (Horizon's cart-discount: /cart/update.js `discount` with `sections`, the
 * error when a code comes back `applicable: false`, the pills that take a
 * code off; Dawn's cart note: /cart/update.js `note` on change; a shipping
 * calculator on /cart/shipping_rates.json), served by the live site's own
 * handler (lib/storelib-theme/compat/site.ts) with the cart cookie written
 * and read as the route writes it, and the cart priced by the website
 * checkout's own physical pricing on an in-memory database
 * (lib/storelib-theme/compat/cart-pricing-server.ts). In headless Chromium,
 * at 1440 and at 390 wide:
 *
 *   CODE      a valid code typed and applied: the drawer's total and its row
 *             change, a pill shows the code; a reload keeps it
 *   WRONG     an unknown code: the theme's own error shows, the total stays
 *   OFF       the pill's remove: the price comes back
 *   NOTE      a note typed: still there after a reload
 *   SHIPPING  Romania: each rate with its price; France (a zone with no
 *             rate): the theme's own "not supported" sentence
 *   CHECKOUT  Check out goes to the website's checkout with the code and note
 *   FIT       no sideways scroll at either width
 *
 * Measurements: each line prints what it measured. Exits 1 on any failure.
 */
import { createServer } from "node:http"
import puppeteer from "puppeteer-core"
import { fakeDb } from "../tests/_fake-db"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { answer, readCartCookie, writeCartCookie, CART_COOKIE, type SiteData } from "../lib/storelib-theme/compat/site"
import { formFields } from "../lib/storelib-theme/compat/form-fields"
import { compatCartPricing } from "../lib/storelib-theme/compat/cart-pricing-server"
import { shippedQuote } from "../lib/checkout/site-quote-server"
import { readSiteCheckoutParams } from "../lib/checkout/site-checkout"

let failed = 0
const check = (label: string, ok: boolean, detail: unknown = "") => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail !== "" ? `  (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`)
}

const SHOP = "5b1c0000-0000-4000-8000-000000000001"
const SLEEVE = "5b1c0000-0000-4000-8000-0000000000a1"
const M = "5b1c0000-0000-4000-8000-0000000000b1"
const STUDIO = "5b1c0000-0000-4000-8000-0000000000c1"

function db() {
  const rate = (r: Record<string, unknown>) => ({ creator_id: SHOP, active: true, position: 0, tiers: [], min_value: null, max_value: null, free_over_cents: null, min_days: 2, max_days: 4, ...r })
  return fakeDb({
    products: [{ id: SLEEVE, creator_id: SHOP, title: "Black Sleeve", slug: "black-sleeve", type: "physical", status: "published", price_cents: 3500, thumbnail_url: null, requires_shipping: true, weight_grams: 200, taxable: true, track_inventory: true, continue_selling: false, fulfillment_location_id: null, fulfillment_method: "self", shipping_profile_id: null, max_per_order: null }],
    product_variants: [{ id: M, product_id: SLEEVE, name: "M", option1: "M", position: 0, price_cents: 3500, weight_grams: 200, track_inventory: true, inventory_policy: "deny", requires_shipping: null, taxable: true, active: true, fulfillment_location_id: null, fulfillment_method: null }],
    product_options: [],
    commerce_settings: [{ creator_id: SHOP, default_location_id: STUDIO, unit_system: "metric", returns_enabled: true, return_window_days: 30, tax_mode: "none", low_stock_default: 5, low_stock_alerts: true }],
    inventory_locations: [{ id: STUDIO, creator_id: SHOP, name: "Studio", kind: "home", country: "RO", city: "Cluj", address_line1: "Str. Lunga 1", postal_code: "400001", active: true, fulfills_orders: true, holds_inventory: true, priority: 0, forwarding: "none", pickup_enabled: false }],
    inventory_levels: [{ variant_id: M, location_id: STUDIO, creator_id: SHOP, available: 50 }],
    shipping_profiles: [{ id: "general", creator_id: SHOP, name: "General", is_default: true, created_at: "2026-01-01" }],
    shipping_zones: [
      { id: "z-ro", creator_id: SHOP, profile_id: "general", name: "Romania", countries: ["RO"], regions: [], rest_of_world: false },
      { id: "z-fr", creator_id: SHOP, profile_id: "general", name: "France", countries: ["FR"], regions: [], rest_of_world: false },
    ],
    shipping_rates: [rate({ id: "r-ro", zone_id: "z-ro", name: "Standard", kind: "flat", price_cents: 1500 }), rate({ id: "r-ro2", zone_id: "z-ro", name: "Express", kind: "flat", price_cents: 2500, position: 1 })],
    shipping_packages: [],
    store_settings: [{ creator_id: SHOP, currency: "USD", default_country: "RO" }],
    coupons: [{ id: "c1", code: "SAVE10", creator_id: SHOP, discount_type: "percentage", discount_value: 10, starts_at: null, expires_at: null, usage_limit: null, usage_count: 0, product_ids: null, is_active: true, min_purchase_cents: null }],
  })
}

const section = (type: string, markup: string) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings: [] })}\n</schema>\n`
/* The drawer: lines, the order's discounts, a pill per code, the discount box, the note, the shipping calculator, Check out. */
const DRAWER = `<cart-drawer class="drawer" data-section-id="{{ section.id }}">
<h2>Cart ({{ cart.item_count }})</h2>
{% for item in cart.items %}<p class="line">{{ item.title }} <span>{{ item.final_line_price | money }}</span></p>{% endfor %}
{% assign codes = cart.cart_level_discount_applications | where: 'type', 'discount_code' | map: 'title' %}
{% for d in cart.cart_level_discount_applications %}<p class="disc-row">{{ d.title }} -{{ d.total_allocated_amount | money }}</p>{% endfor %}
<p class="total">Total <strong>{{ cart.total_price | money }}</strong></p>
<div class="pills">{% for c in codes %}<button type="button" class="pill" data-code="{{ c }}">{{ c }} &times;</button>{% endfor %}</div>
<form class="disc"><input name="code" placeholder="Discount code" autocomplete="off"><button type="submit">Apply</button></form>
<p class="disc-error" hidden>Enter a valid discount code</p>
<textarea class="note" name="note" placeholder="Order note">{{ cart.note }}</textarea>
<form class="ship"><select name="country"><option value="Romania">Romania</option><option value="France">France</option></select><input name="zip" value="400001"><button type="submit">Estimate shipping</button></form>
<ul class="rates"></ul><p class="ship-error"></p>
<form action="/cart" method="post"><button type="submit" name="checkout" class="checkout">Check out</button></form>
</cart-drawer>`
const SCRIPT = `<script>
function codes(){return [].map.call(document.querySelectorAll('.pill'),function(p){return p.dataset.code})}
function swap(html){var t=document.createElement('template');t.innerHTML=html;var n=t.content.querySelector('cart-drawer');var o=document.querySelector('cart-drawer');var note=o.querySelector('.note').value;o.replaceWith(n);n.querySelector('.note').value=note}
function update(body){return fetch('/cart/update.js',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json()})}
document.addEventListener('submit',function(e){var f=e.target;
 if(f.classList.contains('disc')){e.preventDefault();var code=f.code.value.trim();if(!code)return;var err=document.querySelector('.disc-error');err.hidden=true;
  update({discount:codes().concat([code]).join(','),sections:['drawer']}).then(function(d){if(d.discount_codes.find(function(x){return x.code.toLowerCase()===code.toLowerCase()&&x.applicable===false})){f.code.value='';document.querySelector('.disc-error').hidden=false;return}swap(d.sections.drawer)})}
 if(f.classList.contains('ship')){e.preventDefault();var q=new URLSearchParams({'shipping_address[country]':f.country.value,'shipping_address[zip]':f.zip.value});
  fetch('/cart/shipping_rates.json?'+q,{headers:{Accept:'application/json'}}).then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(x){var ul=document.querySelector('.rates'),er=document.querySelector('.ship-error');ul.innerHTML='';er.textContent='';
   if(!x.ok){er.textContent=Object.keys(x.j).map(function(k){return k.charAt(0).toUpperCase()+k.slice(1)+' '+x.j[k].join(', ')}).join('; ');return}
   x.j.shipping_rates.forEach(function(r){var li=document.createElement('li');li.textContent=r.name+': $'+r.price;ul.appendChild(li)})})}
});
document.addEventListener('click',function(e){var p=e.target.closest&&e.target.closest('.pill');if(!p)return;var left=codes().filter(function(c){return c!==p.dataset.code});update({discount:left.join(','),sections:['drawer']}).then(function(d){swap(d.sections.drawer)})});
document.addEventListener('change',function(e){if(e.target.classList&&e.target.classList.contains('note'))update({note:e.target.value})});
</script>`
const files: Record<string, string> = {
  "layout/theme.storelib": wrapCompatTemplate(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1">{{ content_for_header }}<style>body{font:15px/1.5 system-ui;margin:0;padding:16px}.drawer{display:block;max-width:420px}input,select,textarea{max-width:100%;box-sizing:border-box}textarea{width:100%}</style></head><body>{% section 'drawer' %}<main>{{ content_for_layout }}</main>${SCRIPT}</body></html>`),
  "sections/drawer.storelib": section("drawer", DRAWER),
  "sections/main-cart.storelib": section("main-cart", `<div class="cart-page">{{ cart.item_count }} items</div>`),
  "templates/cart.json": JSON.stringify({ sections: { main: { type: "main-cart" } }, order: ["main"] }),
}
const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
const products = [{ id: SLEEVE, settings: { title: "Black Sleeve", price: "$35.00", image: "", url: "/products/black-sleeve", slug: "black-sleeve", kind: "physical", available: true, variants: [{ id: M, name: "M", price: "", available: true }], options: [] } }]

async function main() {
  const database = db()
  let checkoutAt = ""
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/checkout/site" || (url.pathname === "/checkout" && url.searchParams.has("items"))) {
      checkoutAt = url.search
      res.writeHead(200, { "Content-Type": "text/html" })
      return res.end("<p>checkout</p>")
    }
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const raw = Buffer.concat(chunks).toString("utf8")
    const type = String(req.headers["content-type"] ?? "")
    const body = raw ? (type.includes("json") ? JSON.parse(raw) : formFields(new URLSearchParams(raw).entries())) : null
    const cookie = String(req.headers.cookie ?? "").match(new RegExp(`(?:^|;\\s*)${CART_COOKIE}=([^;]*)`))?.[1]
    const kept = readCartCookie(cookie)
    /* A new pricing each request, as the route makes one. */
    const site: SiteData = { creatorId: SHOP, theme, pages: { cart: [{ id: "main", type: "main-cart" }] as never }, products: products as never, collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" }, host: "127.0.0.1", pricing: compatCartPricing({ creatorId: SHOP, storeCurrency: "USD", market: null, db: database, quote: (d, id, b) => shippedQuote(d, id, b, null) }) }
    const ajax = type.includes("json") || String(req.headers.accept ?? "").includes("application/json")
    const out = await answer(site, { method: req.method ?? "GET", path: url.pathname, query: url.searchParams, body, cart: kept.cart, note: kept.note, attributes: kept.attributes, discountCode: kept.discount, ajax, referer: "/cart" })
    const headers: Record<string, string | string[]> = { ...(out.headers ?? {}), "Content-Type": out.type }
    if (out.cart) headers["Set-Cookie"] = `${CART_COOKIE}=${writeCartCookie(out.cart, out.note ?? "", out.attributes ?? kept.attributes, out.discountCode ?? kept.discount)}; Path=/; SameSite=Lax; HttpOnly`
    res.writeHead(out.status, headers)
    res.end(out.body)
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  const port = (server.address() as { port: number }).port
  const origin = `http://127.0.0.1:${port}`
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--hide-scrollbars"] })
  try {
    for (const [width, height, label] of [[1440, 900, "desktop"], [390, 844, "phone"]] as const) {
      console.log(`\n ${label}`)
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      await page.setViewport({ width, height, isMobile: label === "phone", hasTouch: label === "phone" })
      /* tsx names the functions it compiles with a helper the page does not have. */
      await page.evaluateOnNewDocument("window.__name = (f) => f")
      const errors: string[] = []
      page.on("pageerror", (e) => errors.push(String(e)))
      await page.goto(`${origin}/cart/add?id=${M}&quantity=2`, { waitUntil: "load" })
      const text = (sel: string) => page.$eval(sel, (n) => (n as HTMLElement).innerText.trim()).catch(() => "")
      check("two sleeves in the drawer, $70.00", (await text(".total")) === "Total $70.00", await text(".total"))

      await page.type(".disc input", "save10")
      await Promise.all([page.waitForResponse((r) => r.url().includes("/cart/update.js")), page.click(".disc button")])
      await page.waitForSelector(".pill")
      check("CODE: a valid code applied: the total is $63.00", (await text(".total")) === "Total $63.00", await text(".total"))
      check("  its row says what came off", (await text(".disc-row")) === "SAVE10 -$7.00", await text(".disc-row"))
      check("  and a pill names it", (await text(".pill")).startsWith("SAVE10"), await text(".pill"))
      await page.reload({ waitUntil: "load" })
      check("  a reload keeps it", (await text(".total")) === "Total $63.00" && (await page.$(".pill")) !== null, await text(".total"))

      await page.type(".disc input", "NOPE")
      await Promise.all([page.waitForResponse((r) => r.url().includes("/cart/update.js")), page.click(".disc button")])
      await page.waitForFunction(() => !(document.querySelector(".disc-error") as HTMLElement).hidden, { timeout: 5000 }).catch(() => {})
      const shown = await page.$eval(".disc-error", (n) => !(n as HTMLElement).hidden && (n as HTMLElement).getBoundingClientRect().height > 0)
      check("WRONG: an unknown code shows the theme's own error", shown)
      check("  the total stays at $63.00 and SAVE10 stays on", (await text(".total")) === "Total $63.00" && (await text(".pill")).startsWith("SAVE10"), await text(".total"))

      await page.type(".note", "Leave it with the neighbour")
      await Promise.all([page.waitForResponse((r) => r.url().includes("/cart/update.js")), page.$eval(".note", (n) => (n as HTMLElement).blur())])
      await page.reload({ waitUntil: "load" })
      check("NOTE: the note is still there after a reload", (await page.$eval(".note", (n) => (n as HTMLTextAreaElement).value)) === "Leave it with the neighbour")

      await Promise.all([page.waitForResponse((r) => r.url().includes("shipping_rates")), page.click(".ship button")])
      await page.waitForSelector(".rates li", { timeout: 5000 }).catch(() => {})
      const rates = await page.$$eval(".rates li", (ns) => ns.map((n) => (n as HTMLElement).innerText))
      check("SHIPPING: Romania lists each rate with its price", JSON.stringify(rates) === '["Standard: $15.00","Express: $25.00"]', rates)
      await page.select(".ship select", "France")
      await Promise.all([page.waitForResponse((r) => r.url().includes("shipping_rates")), page.click(".ship button")])
      await page.waitForFunction(() => (document.querySelector(".ship-error") as HTMLElement).innerText.trim() !== "", { timeout: 5000 }).catch(() => {})
      check("  France, a zone with no rate: the theme's own sentence", (await text(".ship-error")) === "Country is not supported", await text(".ship-error"))

      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      check("FIT: no sideways scroll", sideways <= 0, `${sideways}px`)

      await Promise.all([page.waitForResponse((r) => r.url().includes("/pill") || r.url().includes("/cart/update.js")), page.click(".pill")])
      await page.waitForFunction(() => !document.querySelector(".pill"), { timeout: 5000 }).catch(() => {})
      check("OFF: the pill takes the code off and the price comes back", (await text(".total")) === "Total $70.00" && (await page.$(".pill")) === null, await text(".total"))
      await page.type(".disc input", "SAVE10")
      await Promise.all([page.waitForResponse((r) => r.url().includes("/cart/update.js")), page.click(".disc button")])
      await page.waitForSelector(".pill")

      await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click(".checkout")])
      const params = readSiteCheckoutParams(new URLSearchParams(checkoutAt))
      check("CHECKOUT: the website's checkout opens with the code and the note", params.couponCode === "SAVE10" && params.note === "Leave it with the neighbour" && params.items[0]?.quantity === 2, { code: params.couponCode, note: params.note })
      check("no script error on the page", errors.length === 0, errors.join(" | "))
      await context.close()
    }
  } finally {
    await browser.close()
    server.close()
  }
  console.log(failed ? `\n${failed} failed\n` : "\nall passed\n")
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
