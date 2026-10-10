/**
 * The cart of an imported Shopify theme, on the website and in the
 * builder's canvas: Add to cart and the drawer work in the canvas (its
 * requests answered by the builder, lib/storelib-theme/compat/canvas-cart.ts),
 * checkout there says it is on the live site, a theme's hearts are the
 * website's wishlist, a ticked terms box frees Check out, and a theme's
 * wishlist page finds its products by `id:`.
 *
 *   npx tsx tests/compat-cart-canvas.test.ts
 */
import vm from "node:vm"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { answer, fieldMatches, type SiteData } from "../lib/storelib-theme/compat/site"
import { answerInCanvas, canvasPages, isCheckoutRequest, type CanvasCart } from "../lib/storelib-theme/compat/canvas-cart"
import { CANVAS_BRIDGE, CANVAS_HEAD, CANVAS_REQUESTS } from "../lib/storelib-theme/compat/canvas-bridge"
import { shopifyBootstrap } from "../lib/storelib-theme/compat/shims"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`
const card = (i: number) => ({
  id: ID(i),
  settings: {
    title: `Shirt ${i}`, price: "$40.00", image: "https://img.test/a.png", url: `/products/shirt-${i}`, slug: `shirt-${i}`, kind: "physical", available: true, category: "Shirts",
    variants: [{ id: `v${i}s`, name: "Small", price: "", available: true }, { id: `v${i}l`, name: "Large", price: "$55.00", available: true }],
    options: [{ name: "Size", values: ["Small", "Large"] }],
  },
})
const section = (type: string, markup: string) => `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify({ type, name: type, settings: [] })}\n</schema>\n`
const files: Record<string, string> = {
  "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}</head><body><main>{{ content_for_layout }}</main></body></html>`),
  "sections/cart-count.storelib": section("cart-count", `<span class="count">{{ cart.item_count }}</span>`),
  "sections/main-product.storelib": section("main-product", `<div class="p">{{ product.title }}</div>`),
  "sections/drawer.storelib": section("drawer", `<aside>{{ cart.item_count }} in the drawer{% for i in cart.items %} {{ i.title }}{% endfor %}</aside>`),
  "sections/results.storelib": section("results", `<ul>{% for p in search.results %}<li>{{ p.title }}</li>{% endfor %}</ul>`),
  "templates/product.json": JSON.stringify({ sections: { main: { type: "main-product" } }, order: ["main"] }),
}
const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
const products = [card(1), card(2), card(3)]
const shop = { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" }

async function main() {
  console.log("\nThe canvas answers the theme's requests, as the website would\n")
  {
    const home = [{ id: "cc", type: "cart-count", group: "header" }]
    const pages = canvasPages(theme, "home", home)
    const site: SiteData = { creatorId: "", theme, pages, products, collections: [], menus: {}, shop, host: "", designMode: true }
    let state: CanvasCart = { cart: [], note: "" }
    const ask = async (method: string, url: string, body: Record<string, unknown> | null, ajax: boolean) => {
      const r = await answerInCanvas(site, state, { method, url, body, ajax }, "/")
      state = r.state
      return r.answer
    }
    const added = await ask("POST", "/cart/add.js", { id: "v1l", quantity: 2, sections: "cc,drawer", sections_url: "srcdoc" }, true)
    const line = JSON.parse(added.body)
    check("Add to cart in the canvas adds the option asked for, to the builder's cart", added.status === 200 && line.variant_id === "v1l" && line.quantity === 2 && state.cart.length === 1, line)
    check("  and draws the sections it asked for again, about this page (not \"srcdoc\")", /class="count">2</.test(line.sections?.cc ?? "") && /2 in the drawer Shirt 1/.test(line.sections?.drawer ?? ""), line.sections)
    const changed = JSON.parse((await ask("POST", "/cart/change.js", { line: 1, quantity: 3 }, true)).body)
    check("a quantity changed in the drawer is changed", changed.item_count === 3 && state.cart[0].q === 3)
    const json = JSON.parse((await ask("GET", "/cart.js", null, false)).body)
    check("/cart.js reads the builder's cart", json.item_count === 3 && json.items[0].variant_id === "v1l")
    const product = await ask("GET", "/products/shirt-2.js", null, false)
    check("a product's data is the shop's product", JSON.parse(product.body).id === ID(2))
    const quick = await ask("GET", "/products/shirt-2?section_id=main", null, false)
    check("a product page asked for from another page is drawn from the theme's own template (a quick view)", quick.status === 200 && quick.body.includes("Shirt 2"), quick.body.slice(0, 120))

    const before = JSON.stringify(state)
    const tries: [string, string, Record<string, unknown> | null, boolean][] = [
      ["POST", "/cart", { "updates[]": ["3"], checkout: "" }, false],
      ["GET", "/checkout", null, false],
      ["GET", "/cart/v2s:1", null, false],
      ["POST", "/cart/add", { id: "v2s", quantity: "1", checkout: "1" }, false],
    ]
    const blocked = await Promise.all(tries.map(([m, u, b, a]) => answerInCanvas(site, state, { method: m, url: u, body: b, ajax: a }, "/")))
    check("Check out, /checkout, a cart permalink and Buy it now are checkout, and do nothing in the canvas", blocked.every((r) => r.answer.checkout === true && JSON.stringify(r.state) === before), blocked.map((r) => r.answer.checkout))
    check("  as the website reads them (a script's add with a checkout field is still an add)", isCheckoutRequest("POST", "/cart/add", { checkout: "" }, false) && !isCheckoutRequest("POST", "/cart/add.js", { checkout: "" }, true) && !isCheckoutRequest("POST", "/cart/add", { id: "x" }, false))
    const form = await ask("POST", "/cart/add", { id: "v3s", quantity: "1" }, false)
    check("a form posted to the cart adds, and says the cart page is where it lands", form.redirectedTo === "/cart" && state.cart.some((e) => e.v === "v3s") && form.status === 200)
  }

  console.log("\nThe canvas page asks the builder, never the network\n")
  {
    check("the request script reads", (() => { try { new Function(CANVAS_REQUESTS); new Function(CANVAS_BRIDGE); return true } catch { return false } })())
    check("  and is in the head, before the theme's scripts", CANVAS_HEAD.includes(CANVAS_REQUESTS) && CANVAS_HEAD.indexOf("__slSeed") >= 0)
    const posted: Record<string, unknown>[] = []
    const listeners: Record<string, ((e: unknown) => void)[]> = {}
    const network: string[] = []
    const g: Record<string, unknown> = {
      document: { baseURI: "https://storelib.com/website-builder/editor/abc" },
      parent: { postMessage: (m: Record<string, unknown>) => posted.push(m) },
      fetch: (u: unknown) => { network.push(String(u)); return Promise.resolve(new Response("x")) },
      addEventListener: (t: string, f: (e: unknown) => void) => { (listeners[t] ??= []).push(f) },
      removeEventListener: () => {},
      HTMLFormElement: class { submit() {} },
      URL, Headers, Response, Request, FormData, URLSearchParams, setTimeout, Promise, Date, Array, JSON, Object, String,
      __slPath: "/products/shirt-1",
    }
    g.window = g
    vm.runInNewContext(CANVAS_REQUESTS, g)
    const f = g.fetch as (u: string, i?: RequestInit) => Promise<Response>
    const reply = (body: string) => {
      const m = posted[posted.length - 1] as { id: number }
      for (const l of listeners.message ?? []) l({ data: { storelib: 1, type: "response", id: m.id, status: 200, contentType: "application/json", body } })
    }
    const pending = f("/cart/add.js", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "v1s", quantity: 1 }) })
    const req = posted[posted.length - 1] as { type: string; method: string; url: string; ajax: boolean; body: { id: string } }
    check("fetch('/cart/add.js') is asked of the builder, as a script's JSON request", req.type === "request" && req.method === "POST" && req.url === "/cart/add.js" && req.ajax === true && req.body.id === "v1s", req)
    reply(JSON.stringify({ id: "v1s", quantity: 1 }))
    const res = await pending
    check("  and the theme gets the builder's answer as a Response", res.status === 200 && (await res.json()).id === "v1s" && network.length === 0)
    const form = new FormData()
    form.append("id", "v2s")
    form.append("items[0][id]", "v2l")
    form.append("updates[]", "1")
    form.append("updates[]", "2")
    void f("/cart/update", { method: "POST", body: form })
    const formReq = posted[posted.length - 1] as { body: { id: string; items: { id: string }[]; updates: string[] }; ajax: boolean }
    check("a FormData body is read as the live route reads it (items[0][id], updates[])", formReq.body.id === "v2s" && formReq.body.items[0].id === "v2l" && formReq.body.updates.join() === "1,2" && formReq.ajax === false, formReq.body)
    reply("{}")
    void f("srcdoc?section_id=drawer")
    check("an address made from location.pathname (\"srcdoc\") is this page", (posted[posted.length - 1] as { url: string }).url === "/products/shirt-1?section_id=drawer")
    reply("")
    void f("null/cart.js")
    check("one made from location.origin (\"null\") is the website's address after it", (posted[posted.length - 1] as { url: string }).url === "/cart.js")
    reply("{}")
    const asked = posted.length
    await f("/api/site-theme/assets/x/theme.js")
    await f("https://cdn.example.com/lib.js")
    check("the theme's own files and other sites load from the network as before", posted.length === asked && network.length === 2, network)
    check("a base of location.origin (\"null\") resolves instead of throwing", (() => { try { return new (g.URL as typeof URL)("/search", "null").pathname === "/search" } catch { return false } })())

    let stopped = false
    const buyNow = { closest: (sel: string) => (sel.includes("[data-storelib-buy-now]") ? buyNow : null), innerText: "Buy it now" }
    for (const l of listeners.click ?? []) l({ target: buyNow, preventDefault: () => { stopped = true }, stopImmediatePropagation: () => {} })
    check("Buy it now is stopped before the theme sees it, and the builder is told checkout is on the live site", stopped && (posted[posted.length - 1] as { type: string }).type === "live-only")
    let linkStopped = false
    const link = { closest: (sel: string) => (sel === "a[href]" ? link : null), getAttribute: () => "/checkout", innerText: "Go" }
    for (const l of listeners.click ?? []) l({ target: link, preventDefault: () => { linkStopped = true }, stopImmediatePropagation: () => {} })
    check("  so is a link to /checkout", linkStopped)
    let addStopped = false
    const add = { closest: (sel: string) => (sel.startsWith("button,") ? add : null), innerText: "Add to cart", value: "" }
    for (const l of listeners.click ?? []) l({ target: add, preventDefault: () => { addStopped = true }, stopImmediatePropagation: () => {} })
    check("  and Add to cart is left to the theme", !addStopped)
  }

  console.log("\nA theme's hearts are the website's wishlist\n")
  {
    const SID = "11111111-1111-4111-8111-111111111111"
    const boot = shopifyBootstrap({ shopName: "S", currency: "USD", designMode: false, storeId: SID }).replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "")
    check("the bootstrap reads, with the store's id in it", (() => { try { new Function(boot); return true } catch { return false } })() && boot.includes(JSON.stringify(SID)))
    const designBoot = shopifyBootstrap({ shopName: "S", currency: "USD", designMode: true, storeId: SID })
    check("  and nothing is copied in the builder's canvas", /if\(!S\.designMode&&SID\)/.test(designBoot))
    const store = new Map<string, string>()
    class Storage {
      getItem(k: string) { return store.has(k) ? store.get(k)! : null }
      setItem(k: string, v: string) { store.set(k, String(v)) }
      removeItem(k: string) { store.delete(k) }
      key(i: number) { return [...store.keys()][i] ?? null }
      get length() { return store.size }
    }
    let cookie = ""
    const page = () => {
      const g: Record<string, unknown> = {
        Storage, location: { protocol: "https:" }, setTimeout, Promise, JSON, Object, Array, String, HTMLScriptElement: { supports: () => false },
        fetch: () => Promise.resolve({ ok: false }),
        document: { addEventListener: () => {}, get cookie() { return cookie }, set cookie(v: string) { cookie = v.split(";")[0] }, head: { appendChild: () => {} } },
      }
      g.window = g
      g.localStorage = new Storage()
      vm.runInNewContext(boot, g)
      return g.localStorage as Storage
    }
    const ls = page()
    ls.setItem("materia__wishlist-items", JSON.stringify([ID(1), ID(2)]))
    const mine = () => JSON.parse(store.get(`storelib:wishlist:${SID}`) ?? "[]") as string[]
    check("a heart the theme saves is in the website's list, and its cookie, for the Wishlist page", mine().sort().join() === [ID(1), ID(2)].join() && cookie.startsWith("sl_wishlist=") && cookie.includes(ID(1)) && cookie.includes(ID(2)), { mine: mine(), cookie })
    ls.setItem("materia__wishlist-items", JSON.stringify([ID(2)]))
    check("one the theme takes out is taken out", mine().join() === ID(2) && !cookie.includes(ID(1)))
    store.set(`storelib:wishlist:${SID}`, JSON.stringify([ID(2), ID(3)]))
    page()
    check("one saved on the Wishlist page is the theme's too on the next page, so its hearts and count agree", JSON.parse(store.get("materia__wishlist-items") ?? "[]").sort().join() === [ID(2), ID(3)].join())
    check("a key that is not a wishlist is left alone", (() => { const l = page(); l.setItem("recently-viewed", JSON.stringify([ID(4)])); return !mine().includes(ID(4)) })())
  }

  console.log("\nCheck out, freed by its terms box, and a wishlist page's search\n")
  {
    const boot = shopifyBootstrap({ shopName: "S", currency: "USD", designMode: false })
    check("a ticked terms box frees a Check out the theme left disabled, and never disables one", /terms\|agree\|condition\|policy/.test(boot) && /c\.disabled=false/.test(boot) && !/\.disabled=true/.test(boot) && /data-requires-terms/.test(boot))
    check("  in the canvas too", /const TERMS = `document\.addEventListener/.test((await import("node:fs")).readFileSync("lib/storelib-theme/compat/shims.ts", "utf8")))
    const found = fieldMatches(products, `id:${ID(1)} OR id:${ID(3)}`)
    check("`id:… OR id:…` finds those products", found?.map((p) => p.id).join() === `${ID(1)},${ID(3)}`)
    check("  `handle:` and `title:` too, and plain words are not fields", fieldMatches(products, "handle:shirt-2")?.[0]?.id === ID(2) && fieldMatches(products, "title:shirt")?.length === 3 && fieldMatches(products, "shirt 2") === null)
    const site: SiteData = { creatorId: "c0ffee00-0000-4000-8000-000000000000", theme, pages: { search: [{ id: "results", type: "results" }], home: [{ id: "cc", type: "cart-count", group: "header" }] }, products, collections: [], menus: {}, shop, host: "shop.test" }
    const ids = Array.from({ length: 3 }, (_, i) => `id:${ID(i + 1)}`).join(" OR ")
    const r = await answer(site, { method: "GET", path: "/search", query: new URLSearchParams({ q: ids, section_id: "results" }), body: null, cart: [] })
    check("a wishlist page's /search?section_id=&q=id:… draws the products it keeps", (String(r.body).match(/<li>/g) ?? []).length === 3, String(r.body).slice(0, 200))
    const homePage = await answer(site, { method: "GET", path: "/", query: new URLSearchParams(), body: null, cart: [] })
    check("the live page hands the bootstrap the creator's id, the key the website's wishlist is kept under", String(homePage.body).includes(`var SID="${site.creatorId}"`))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}
main()
