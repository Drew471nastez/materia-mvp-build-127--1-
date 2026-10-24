/**
 * Imported themes between pages and in the builder's canvas:
 *
 *   an empty cart is `empty`, `assign x = blank` is blank, a page has its
 *   own title, a theme's gift wrap names the shop's product or none
 *   the live page's navigation script: no transition in an Android web
 *   view or an in-app browser, the next page held until it is read, its
 *   fade paused until it has started
 *   the canvas answers the theme's requests (sections, recommendations,
 *   the cart) as the website does, and its pages come forward early
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx tests/compat-navigation-canvas.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import vm from "node:vm"
import { Ctx, renderString } from "../lib/storelib-theme/compat/runtime"
import { compatFilter } from "../lib/storelib-theme/compat/filters"
import { cartObject, typedSettings, type Resources } from "../lib/storelib-theme/compat/objects"
import { CompatTheme, defaultPageTitle } from "../lib/storelib-theme/compat/theme"
import { NAVIGATION_HEAD_SCRIPT, PAGE_END_ID, VIEW_TRANSITION_CSS, liveNavigationEnd, liveNavigationMarkup } from "../lib/website-builder/live-navigation"
import { CANVAS_SHOWN } from "../lib/storelib-theme/compat/canvas-network"
import { answerInCanvas, type CanvasCart } from "../lib/storelib-theme/compat/canvas-cart"
import type { CartEntry, SiteData } from "../lib/storelib-theme/compat/site"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const env = { snippet: () => null, filter: (n: string) => compatFilter(n) }
const liquid = (src: string, g: Record<string, unknown> = {}) => renderString(src, new Ctx(g, env), { lax: true })

const card = (i: number) => ({ id: `p${i}`, settings: { title: `Shirt ${i}`, slug: `shirt-${i}`, url: `/products/shirt-${i}`, price: "$40.00", image: "", available: true, variants: [] } })

async function main() {
  console.log("\nWhat a theme reads\n")
  {
    const empty = cartObject([], "USD")
    check("an empty cart is `empty` (Dawn and Posturex draw their empty cart on this)", liquid("{% if cart == empty %}E{% else %}F{% endif %}{% if cart != empty %}x{% endif %}", { cart: empty }) === "E")
    const one = cartObject([{ key: "k", productId: "p1", variantId: null, quantity: 1, product: { id: "p1", title: "Shirt", price: 4000, variants: [], url: "/products/shirt" } } as never], "USD")
    check("a cart with a line is not", liquid("{% if cart == empty %}E{% else %}F{% endif %}", { cart: one }) === "F")
    check("`assign x = blank` is blank and prints nothing (no preload of \" 800w\")", liquid("{% assign x = blank %}[{{ x }}]{% if x != blank %}NOT{% endif %}{% if x == blank %}B{% endif %}{% if x == empty %}E{% endif %}") === "[]BE")
    check("an object with keys is still not empty", liquid("{% if o == empty %}E{% else %}F{% endif %}", { o: { a: 1 } }) === "F")
    const shop = { name: "My store", currency: "USD", moneyFormat: "${{amount}}" }
    const page = { designMode: true, path: "/", products: [], collections: [], menus: {}, shop }
    check("the cart's title is Shopify's, never the shop's name (Home > My store)", defaultPageTitle({ ...page, template: "cart" }) === "Your Shopping Cart")
    check("a product page's title is the product's", defaultPageTitle({ ...page, template: "product", product: card(2) }) === "Shirt 2")
    check("the home page's is the shop's", defaultPageTitle({ ...page, template: "index" }) === "My store")
    const res: Resources = { products: [card(1)], catalog: [card(1)], collections: [], menus: {}, schemes: {}, imageUrl: (v) => v, currentPath: "/" }
    const schema = [{ type: "product", id: "choose_gift_wrap_product" }]
    const themeLevel = typedSettings(schema, { choose_gift_wrap_product: "digital-gift-card" }, res, undefined, { exactProducts: true })
    check("a theme setting naming a product of the store it came from is none, not the shop's first product (the $0.00 gift wrap)", themeLevel.choose_gift_wrap_product === null, themeLevel)
    const own = typedSettings(schema, { choose_gift_wrap_product: "shirt-1" }, res, undefined, { exactProducts: true })
    check("  and one the shop has is that product", (own.choose_gift_wrap_product as { title?: string } | null)?.title === "Shirt 1")
    const section = typedSettings([{ type: "product", id: "product" }], { product: "the-original-shirt" }, res)
    check("a section's featured product still falls back to the shop's first", (section.product as { title?: string } | null)?.title === "Shirt 1")
    const blogTheme = new CompatTheme({ "layout/theme.liquid": "<html><body>{{ content_for_layout }}</body></html>" }, {}, { assetUrl: (n) => `/a/${n}` })
    const blog = blogTheme.pageContext({ ...page, template: "blog", path: "/blogs/news" }).globals.blog as { title?: string; articles?: unknown[] } | null
    check("a blog page has its blog, titled by its address and with no posts (Dawn's main-blog drew nothing at all)", blog?.title === "News" && Array.isArray(blog?.articles) && blog!.articles!.length === 0, blog)
    check("the theme's settings are read exactly", /typedSettings\(allSettings, this\.settingsValues, res, resolverFor\(\(\) => pageCtx\), \{ exactProducts: true \}\)/.test(read("lib/storelib-theme/compat/theme.ts")))
  }

  console.log("\nBetween two pages of a live site\n")
  {
    const head = liveNavigationMarkup()
    check("the render blocker is markup, before the script that may drop it (a script-made one blocks nothing)", head.indexOf(`<link rel="expect" href="#${PAGE_END_ID}" blocking="render" id="sl-render-blocker">`) === 0 && head.indexOf("<script") > 0)
    check("the page ends with what it waits for", liveNavigationEnd() === `<div id="${PAGE_END_ID}" hidden></div>`)
    check("the arriving page's fade is paused while it starts", /:root\[data-sl-arriving\]::view-transition-new\(\*\)[^}]*animation-play-state:paused/.test(VIEW_TRANSITION_CSS))
    check("still off for less motion", /prefers-reduced-motion: no-preference\)\{@view-transition\{navigation:auto\}/.test(VIEW_TRANSITION_CSS))
    check("the live site carries both", /extraHead: draft \? undefined : liveNavigationMarkup\(\)/.test(read("lib/website-builder/compat-site.ts")) && /: liveNavigationEnd\(\),/.test(read("lib/website-builder/compat-site.ts")))
    check("a Storelib theme's site has the script too", /NAVIGATION_HEAD_SCRIPT/.test(read("app/(site)/layout.tsx")))

    /* The script in a pretend browser. */
    const run = (ua: string, opts: { from?: boolean; type?: string; blocker?: boolean; cores?: number } = {}) => {
      const appended: string[] = []
      const listeners: Record<string, ((e: unknown) => void)[]> = {}
      const docListeners: Record<string, ((e: unknown) => void)[]> = {}
      let removed = false
      const attrs: Record<string, string> = {}
      const blocker = opts.blocker === false ? null : { remove: () => { removed = true } }
      const document = {
        documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v }, removeAttribute: (k: string) => { delete attrs[k] } },
        head: { appendChild: (el: { textContent?: string }) => appended.push(String(el.textContent ?? "")) },
        getElementById: (id: string) => (id === "sl-render-blocker" ? blocker : null),
        createElement: () => ({ setAttribute() {}, textContent: "" }),
        addEventListener: (n: string, f: (e: unknown) => void) => { (docListeners[n] ??= []).push(f) },
      }
      const timers: (() => void)[] = []
      const ctx = {
        navigator: { userAgent: ua, hardwareConcurrency: opts.cores ?? 8, deviceMemory: 8 },
        document,
        navigation: { activation: { from: opts.from === false ? null : {}, navigationType: opts.type ?? "push" } },
        matchMedia: () => ({ matches: false }),
        performance: { now: () => 100 },
        setTimeout: (f: () => void) => { timers.push(f); return 0 },
        requestAnimationFrame: (f: () => void) => f(),
        addEventListener: (n: string, f: (e: unknown) => void) => { (listeners[n] ??= []).push(f) },
      }
      ;(ctx as Record<string, unknown>).window = ctx
      vm.runInNewContext(NAVIGATION_HEAD_SCRIPT, ctx)
      return { appended, removed, listeners, docListeners, attrs, timers }
    }
    const chrome = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36"
    const webview = "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0 Mobile Safari/537.36"
    const insta = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0"
    const wv = run(webview)
    check("Android's web view (Storelib's own app): transitions off, and nothing holds the page", wv.appended.some((t) => /@view-transition\{navigation:none\}/.test(t)) && wv.removed, wv)
    check("an in-app browser (Instagram): off", run(insta).appended.some((t) => /navigation:none/.test(t)))
    check("a phone with two cores: off", run(chrome, { cores: 2 }).appended.some((t) => /navigation:none/.test(t)))
    const ch = run(chrome)
    check("Chrome following a link on the site: on, and the blocker stays until its time is up", ch.appended.length === 0 && !ch.removed && ch.timers.length >= 1)
    check("a first visit or a reload is never held", run(chrome, { from: false }).removed && run(chrome, { type: "reload" }).removed)
    /* The arriving page: paused at its reveal, going once DOMContentLoaded has run. */
    let skipped = false
    const t = { skipTransition: () => { skipped = true }, finished: new Promise(() => {}) }
    ch.listeners.pagereveal?.forEach((f) => f({ viewTransition: t }))
    check("a page drawn as text arrives paused", ch.attrs["data-sl-arriving"] === "")
    ch.docListeners.DOMContentLoaded?.forEach((f) => f({}))
    ch.timers.forEach((f) => f())
    check("  and goes once it has started", ch.attrs["data-sl-arriving"] === undefined)
    ch.docListeners.pointerdown?.forEach((f) => f({}))
    check("a press during the fade ends it", skipped)
    const native = run(chrome, { blocker: false })
    native.listeners.pagereveal?.forEach((f) => f({ viewTransition: t }))
    check("a Storelib theme's page (no blocker) is never paused", native.attrs["data-sl-arriving"] === undefined)
    let reads = true
    try { new Function(NAVIGATION_HEAD_SCRIPT) } catch { reads = false }
    check("the script reads as JavaScript", reads)
  }

  console.log("\nThe builder's canvas\n")
  {
    let shownReads = true
    try { new Function(CANVAS_SHOWN.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "")) } catch { shownReads = false }
    check("the frame's shown script reads", shownReads)
    const canvas = read("components/website-builder/compat/compat-canvas.tsx")
    check("the canvas puts the shown script in the page and answers what the theme asks (canvas-cart answerInCanvas)", /\$\{CANVAS_HEAD\}\$\{CANVAS_SHOWN\}/.test(canvas) && /answerInCanvas\(/.test(canvas))
    check("another page opens at its top", /* Changed on purpose (round ed-1022): another page is another page id (pageIdFor), not a different count of files: the same page drawn from changed files stays where it was scrolled and comes forward as a cut. */ /if \(front\(\) && front\(\)!\.key\.split\("\|"\)\[0\] !== pageIdFor\(pageKey, productId, accountPath\)\) scrollY\.current = 0/.test(canvas))

    const theme = new CompatTheme({
      "layout/theme.liquid": "<html><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>",
      "sections/related.liquid": "<div class=\"rel\">{% for p in recommendations.products %}<a>{{ p.title }}</a>{% endfor %}</div>{% schema %}{\"name\":\"Related\",\"settings\":[]}{% endschema %}",
      "sections/count.liquid": "<b>{{ cart.item_count }}</b>{% schema %}{\"name\":\"Count\",\"settings\":[]}{% endschema %}",
    }, {}, { assetUrl: (n) => `/a/${n}` })
    const products = [card(1), card(2), card(3)]
    const site: SiteData = { creatorId: "", theme, pages: { product: [{ id: "rel", type: "related" }], cart: [{ id: "count", type: "count" }], search: [] }, products, collections: [], menus: {}, shop: { name: "S", currency: "USD", moneyFormat: "${{amount}}" }, host: "", designMode: true }
    let state: CanvasCart = { cart: [] as CartEntry[], note: "" }
    const ask = async (method: string, url: string, body: Record<string, unknown> | null, ajax: boolean) => {
      const r = await answerInCanvas(site, state, { method, url, body, ajax }, "/products/shirt-1")
      state = r.state
      return r.answer
    }
    const rec = await ask("GET", "/recommendations/products?product_id=p1&limit=4&section_id=rel", null, true)
    check("recommendations are drawn as the website draws them (Dawn's \"You may also like\")", rec.status === 200 && /Shirt 2/.test(rec.body) && !/Shirt 1</.test(rec.body), rec)
    const add = await ask("POST", "/cart/add.js", { id: "p2", quantity: 1 }, true)
    check("an add goes into the canvas's own cart", add.status === 200 && state.cart.length === 1 && state.cart[0].p === "p2", { add, state })
    const json = await ask("GET", "/cart.js", null, true)
    check("  and /cart.js says so", JSON.parse(json.body).item_count === 1)
    const form = await ask("POST", "/cart/add", { id: "p3", quantity: "2" }, true)
    check("a form add lands in the cart too", form.status === 200 && state.cart.some((e) => e.p === "p3" && e.q === 2), state)
    const count = await ask("GET", "/cart?section_id=count", null, true)
    check("a section of the cart page, drawn about the cart", /<b>3<\/b>/.test(count.body), count.body.slice(0, 200))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}
main()
