/**
 * ===========================================================================
 *  A REAL SHOPIFY THEME, IMPORTED AND USED IN A BROWSER
 * ===========================================================================
 *   npx tsx scripts/check-shopify-theme.ts <theme.zip> [<theme.zip> …]
 *
 * Each ZIP (Horizon and Dawn are the two this was built against; neither is
 * in the repository, their license is Shopify's) goes through the import's
 * own converter, and the result is served by the live site's own handler
 * (lib/storelib-theme/compat/site.ts) on a local port, with a made up shop of
 * eight products. Then headless Chromium, at 1440 and at 390 wide:
 *
 *   every page type draws, with no script error and no sideways scroll
 *   Add to cart on a product page puts the product in the cart (/cart.js)
 *   and the header's count says so
 *   choosing another option changes the price on the page
 *   the cart page lists the line, and its quantity can be changed
 *   Buy it now sends that item alone to checkout and leaves the cart as it was
 *   the search box finds a product (/search/suggest, section rendering)
 *   the drawer's own Check out (its terms box ticked) reaches checkout
 *   in the builder's canvas (a sandboxed frame, its requests answered by
 *   canvas-cart.ts): Add to cart fills the builder's cart with no request
 *   to the network, and Buy it now says checkout is on the live site
 *   nothing is requested from Shopify's servers
 *
 * Measurements, not opinions: each line prints what it measured. Exits 1 on
 * any failure. Screenshots go to $OUT (default /tmp/shopify-theme-check).
 */
import { createServer } from "node:http"
import { mkdirSync, readFileSync } from "node:fs"
import { basename } from "node:path"
import JSZip from "jszip"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { convertShopifyTheme, conversionSummary } from "../lib/storelib-theme/shopify/convert"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { compileScss } from "../lib/storelib-theme/compat/scss"
import { answer, themeAsset, readCartCookie, writeCartCookie, CART_COOKIE, type SiteData } from "../lib/storelib-theme/compat/site"
import { CANVAS_BRIDGE, CANVAS_HEAD } from "../lib/storelib-theme/compat/canvas-bridge"
import { answerInCanvas, canvasPages, type CanvasCart } from "../lib/storelib-theme/compat/canvas-cart"

const OUT = process.env.OUT ?? "/tmp/shopify-theme-check"
/** What the page last sent to the basket checkout. */
let lastCheckout: { items?: unknown[] } | null = null
/* The builder's cart, for the canvas check, and any request the canvas frame sent to the network instead. */
let canvasCart: CanvasCart = { cart: [], note: "" }
const canvasLeaks: string[] = []
mkdirSync(OUT, { recursive: true })
let failed = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}

/* One colour per picture, so a screenshot shows which picture is where. */
const COLOURS = ["#c9b8a6", "#8fa3b0", "#b5c4a1", "#d4a5a5", "#a7a2c9", "#e0c68a"]
const PNGS: Buffer[] = []

function shop() {
  const products = Array.from({ length: 8 }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    settings: {
      title: `Linen shirt ${i + 1}`,
      price: `$${(40 + i * 5).toFixed(2)}`,
      compare_price: i % 3 === 0 ? `$${(60 + i * 5).toFixed(2)}` : "",
      image: `https://img.test/p${i}.png`,
      images: [`https://img.test/p${i}.png`, `https://img.test/p${i}b.png`],
      url: `/products/linen-shirt-${i + 1}`,
      slug: `linen-shirt-${i + 1}`,
      kind: "physical",
      available: true,
      category: "Shirts",
      description: "Washed linen, cut loose.",
      variants: [
        { id: `v-${i}-s`, name: "Small", price: "", compare_price: "", available: true },
        { id: `v-${i}-l`, name: "Large", price: `$${(55 + i * 5).toFixed(2)}`, compare_price: "", available: true },
      ],
      options: [{ name: "Size", values: ["Small", "Large"] }],
    },
  }))
  const collections = [
    { id: "c-summer", title: "Summer", handle: "summer", description: "Light things", image: "https://img.test/c1.png", url: "/collections/summer", products: products.slice(0, 4), products_count: 4 },
    { id: "c-winter", title: "Winter", handle: "winter", description: "", image: "", url: "/collections/winter", products: products.slice(4), products_count: 4 },
  ]
  const menus = {
    "main-menu": { title: "Main menu", links: [{ title: "Home", url: "/" }, { title: "Shop", url: "/collections/all", links: [{ title: "Summer", url: "/collections/summer" }, { title: "Winter", url: "/collections/winter" }] }, { title: "Contact", url: "/pages/contact" }] },
    footer: { title: "Footer", links: [{ title: "Search", url: "/search" }] },
  }
  return { products, collections, menus }
}

async function serve(zipPath: string) {
  const zip = await JSZip.loadAsync(readFileSync(zipPath))
  const t0 = Date.now()
  const r = await convertShopifyTheme(zip, { fallbackName: basename(zipPath, ".zip") })
  if (!r.ok) throw new Error(r.error)
  console.log(`\n${r.theme.name}: ${conversionSummary(r.report)} ${Date.now() - t0} ms, ${r.report.notes.length} notes`)
  const files = r.theme.files
  /* SETTINGS='{"cart_type":"drawer"}' runs the same checks with the theme's own settings changed, as a store owner would. */
  if (process.env.SETTINGS) {
    const values = (r.theme.settings as { shopify?: Record<string, unknown> }).shopify
    if (values) Object.assign(values, JSON.parse(process.env.SETTINGS))
  }
  const theme = themeOfInstall(files, r.theme.settings, {
    assetUrl: (n) => `/api/site-theme/assets/x/1/${encodeURIComponent(n)}`,
    assetText: (n) => files[`shopify/assets/${n}`] ?? null,
  })
  const { products, collections, menus } = shop()
  const pages = Object.fromEntries(r.theme.pages.map((p) => [p.page_key, p.sections]))
  const site: SiteData = { creatorId: "c", theme, pages, products, collections, menus, shop: { name: "Linen & Co", currency: "USD", moneyFormat: "${{amount}}", policies: [{ handle: "refund-policy", title: "Refund Policy", body: "<p>Returns are accepted within 30 days of delivery.</p>" }] }, host: "127.0.0.1" }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname.startsWith("/api/site-theme/assets/")) {
      const name = decodeURIComponent(url.pathname.split("/").pop() ?? "")
      const a = themeAsset(theme, name, () => theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "" } }), { scss: compileScss })
      if (!a) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { "Content-Type": a.type, "Access-Control-Allow-Origin": "*" })
      res.end(a.body)
      return
    }
    if (url.pathname.startsWith("/api/checkout/cart")) {
      const sent: Buffer[] = []
      for await (const c of req) sent.push(c as Buffer)
      try { lastCheckout = JSON.parse(Buffer.concat(sent).toString("utf8")) } catch { lastCheckout = null }
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ url: "http://127.0.0.1/__checkout_opened" }))
      return
    }
    /* The builder's canvas, as compat-canvas.tsx draws it: the page in a sandboxed frame, what its scripts ask answered by the parent. */
    if (url.pathname === "/__canvas") {
      const path = url.searchParams.get("path") ?? "/"
      const drawn = await answer({ ...site, designMode: true, extraBodyEnd: `<script>window.__slSite="";${CANVAS_BRIDGE}</script>` }, { method: "GET", path, query: new URLSearchParams(), body: null, cart: [] })
      const doc = String(drawn.body).replace(/<head\b[^>]*>/i, (m) => `${m}<script>window.__slPath=${JSON.stringify(path)};window.__slSeed={};</script>${CANVAS_HEAD}`)
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(`<!doctype html><style>html,body,iframe{margin:0;border:0;width:100%;height:100%;display:block}</style><iframe id="f" sandbox="allow-scripts allow-forms allow-popups"></iframe><script>window.__events=[];var f=document.getElementById("f");f.srcdoc=${JSON.stringify(doc).replace(/</g, "\\u003c")};addEventListener("message",function(e){var m=e.data;if(!m||m.storelib!==1)return;if(m.type==="live-only")__events.push(m.what);if(m.type!=="request")return;fetch("/__canvas-answer",{method:"POST",body:JSON.stringify({m:m,path:${JSON.stringify(path)}})}).then(function(r){return r.json()}).then(function(a){a.storelib=1;a.type="response";a.id=m.id;e.source.postMessage(a,"*")})});</script>`)
      return
    }
    if (url.pathname === "/__canvas-answer") {
      const sent: Buffer[] = []
      for await (const c of req) sent.push(c as Buffer)
      const { m, path } = JSON.parse(Buffer.concat(sent).toString("utf8"))
      const own = pages.product ?? []
      const chrome = (pages.home ?? []).filter((x) => x.group === "header" || x.group === "footer" || x.group === "overlay")
      const sections = [...chrome.filter((x) => x.group === "header"), ...own.filter((x) => !x.group), ...chrome.filter((x) => x.group !== "header")]
      const r = await answerInCanvas({ ...site, designMode: true, pages: canvasPages(theme, "product", sections as never) }, canvasCart, { method: m.method, url: m.url, body: m.body, ajax: m.ajax === true }, path)
      canvasCart = r.state
      const { type: contentType, ...rest } = r.answer
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ contentType, ...rest }))
      return
    }
    /* A request from the canvas frame (no origin of its own) that reached the network: in the builder, it would have failed. */
    if (req.headers.origin === "null") {
      canvasLeaks.push(`${req.method} ${url.pathname}`)
      res.writeHead(404)
      res.end()
      return
    }
    /* The account page itself, as Storelib draws it inside the theme's shell (the proxy sends the framed request there). */
    if (url.searchParams.has("sl_embed")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(`<!doctype html><html><head></head><body style="margin:0"><main style="padding:40px;height:420px">Sign in to your account</main></body></html>`)
      return
    }
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const raw = Buffer.concat(chunks).toString("utf8")
    let body: Record<string, unknown> | null = null
    const type = String(req.headers["content-type"] ?? "")
    if (raw && type.includes("json")) body = JSON.parse(raw)
    else if (raw && type.includes("urlencoded")) body = Object.fromEntries(new URLSearchParams(raw))
    else if (raw && type.includes("multipart")) {
      body = {}
      for (const part of raw.split(/--[-\w]+/)) {
        const m = part.match(/name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n$/)
        if (m) body[m[1]] = m[2]
      }
    }
    const cookie = String(req.headers.cookie ?? "").match(new RegExp(`${CART_COOKIE}=([^;]*)`))?.[1]
    const { cart, note } = readCartCookie(cookie)
    const ajax = req.headers["x-requested-with"] === "XMLHttpRequest" || type.includes("json") || String(req.headers.accept ?? "").includes("application/json")
    /* The page a script's request came from, as the site route reads it (app/api/site-theme/site route.ts refererPath). */
    const referer = (() => { try { const u = new URL(String(req.headers.referer ?? "")); return `${u.pathname}${u.search}` } catch { return undefined } })()
    const out = await answer(site, { method: req.method ?? "GET", path: url.pathname, query: url.searchParams, body, cart, note, ajax, referer })
    const headers: Record<string, string> = { ...(out.headers ?? {}), "Content-Type": out.type }
    if (out.cart) headers["Set-Cookie"] = `${CART_COOKIE}=${writeCartCookie(out.cart, out.note ?? "")}; Path=/; SameSite=Lax`
    res.writeHead(out.status, headers)
    res.end(out.body)
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  const port = (server.address() as { port: number }).port
  return { server, base: `http://127.0.0.1:${port}`, name: r.theme.name.toLowerCase().replace(/\W+/g, "-") }
}

async function run(zipPath: string) {
  const { server, base, name } = await serve(zipPath)
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--hide-scrollbars"] })
  try {
    for (const [width, height, label] of [[1440, 900, "desktop"], [390, 844, "phone"]] as const) {
      console.log(` ${label}`)
      const page = await browser.newPage()
      await page.setViewport({ width, height, isMobile: label === "phone", hasTouch: label === "phone" })
      /* tsx names the functions it compiles with a helper the page does not have. */
      await page.evaluateOnNewDocument("window.__name = (f) => f")
      const errors: string[] = []
      const shopifyHits: string[] = []
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
      if (process.env.DEBUG) page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") console.log("    console:", m.text().slice(0, 200)) })
      await page.setRequestInterception(true)
      let checkoutHits = 0
      page.on("request", (r) => {
        const u = r.url()
        /* Anything on its way to checkout: /checkout, the basket checkout, or the cart posted with \`checkout\`. */
        if (u.startsWith(base) && (/^\/(checkout|cart\/checkout|api\/checkout)/.test(u.slice(base.length)) || (r.method() === "POST" && /^\/cart/.test(u.slice(base.length)) && /(^|&|name="|\b)checkout/.test(r.postData() ?? "")))) checkoutHits++
        /* A theme's own demo pictures and videos on Shopify's CDN load as they do on Shopify; a script or stylesheet from there never may. */
        if (/shopify(cdn|cloud)?\.com/.test(u)) { if (!["image", "media"].includes(r.resourceType())) shopifyHits.push(u); return r.abort() }
        if (u.startsWith("https://img.test/")) return r.respond({ status: 200, contentType: "image/png", body: PNGS[(Number(u.match(/p(\d)/)?.[1] ?? 0)) % PNGS.length] })
        if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return r.respond({ status: 200, contentType: "text/css", body: "" })
        if (process.env.DEBUG && u.startsWith(base) && !/assets/.test(u)) console.log("    >", r.method(), u.slice(base.length, base.length + 140), (r.postData() ?? "").slice(0, 200))
        if (u.startsWith(base) || u.startsWith("data:")) return r.continue()
        return r.abort()
      })
      const visit = async (path: string) => {
        errors.length = 0
        await page.goto(`${base}${path}`, { waitUntil: "networkidle0", timeout: 60_000 })
        await new Promise((r) => setTimeout(r, 400))
        return page.evaluate(() => ({
          sections: document.querySelectorAll(".shopify-section").length,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          title: document.title,
        }))
      }

      for (const path of ["/", "/collections/all", "/collections/summer?sort_by=price-descending", "/search?q=linen", "/pages/contact", "/no-such-page"]) {
        const m = await visit(path)
        check(`${path} draws`, m.sections > 0 && errors.length === 0, `${m.sections} sections, ${errors.length} script errors${errors[0] ? `: ${errors[0]}` : ""}`)
        check(`${path} no sideways scroll`, m.overflow <= 1, `${m.overflow}px`)
      }
      await page.screenshot({ path: `${OUT}/${name}-${label}-home.png` })

      /* The collection's filters: drawn by the theme, applied by the site. Four of the eight shirts cost $60 or more. */
      const shirtsOn = async (path: string) => {
        await visit(path)
        return page.evaluate(() => {
          const main = document.querySelector("main, #MainContent") ?? document.body
          return { shirts: new Set([...main.querySelectorAll<HTMLAnchorElement>("a[href*='/products/linen-shirt-']")].map((a) => new URL(a.href).pathname)).size, drawn: /Availability/i.test(main.textContent ?? "") && /Price/i.test(main.textContent ?? "") }
        })
      }
      /* Policies and the account pages, in the theme's own header and footer. */
      for (const at of ["/policies/refund-policy", "/refund-policy"]) {
        await visit(at)
        const p = await page.evaluate(() => ({ header: !!document.querySelector(".shopify-section-group-header-group"), footer: !!document.querySelector(".shopify-section-group-footer-group"), words: /Returns are accepted within 30 days/.test(document.body.textContent ?? "") }))
        check(`${at} draws the policy in the theme's header and footer`, p.header && p.footer && p.words, JSON.stringify(p))
      }
      await visit("/account")
      await new Promise((r) => setTimeout(r, 800))
      const acc = await page.evaluate(() => {
        const f = document.getElementById("sl-account-frame") as HTMLIFrameElement | null
        return { header: !!document.querySelector(".shopify-section-group-header-group"), footer: !!document.querySelector(".shopify-section-group-footer-group"), framed: !!f && (f.getAttribute("src") ?? "").includes("sl_embed=1"), fits: f ? Math.round(f.getBoundingClientRect().height) : 0, words: f?.contentDocument?.body.textContent?.includes("Sign in to your account") ?? false }
      })
      check("/account is Storelib's account page inside the theme's header and footer, as tall as it is", acc.header && acc.footer && acc.framed && acc.words && acc.fits >= 420 && acc.fits < 700, JSON.stringify(acc))
      const all = await shirtsOn("/collections/all")
      const dear = await shirtsOn("/collections/all?filter.v.price.gte=60")
      check("the collection draws its filters", all.drawn, `${all.shirts} shirts`)
      check("a price filter leaves the four shirts at $60 or more", all.shirts === 8 && dear.shirts === 4, `${all.shirts} then ${dear.shirts}`)
      await page.screenshot({ path: `${OUT}/${name}-${label}-filtered.png` })

      /* A product, its options and the cart. */
      await visit("/products/linen-shirt-2")
      await page.screenshot({ path: `${OUT}/${name}-${label}-product.png` })
      check("product page has no script errors", errors.length === 0, errors[0] ?? "")
      const pictures = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll<HTMLImageElement>("[data-section-type=\"product-information\"] img, [data-section-type=\"main-product\"] img")].filter((i) => { const r = i.getBoundingClientRect(); return r.width > 40 && r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0 && getComputedStyle(i).visibility !== "hidden" && !!i.offsetParent })
        return { shown: imgs.length, loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length, missing: imgs.filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => `${i.className} ${i.currentSrc || i.src}`.slice(0, 120)) }
      })
      check("product pictures load", pictures.shown > 0 && pictures.loaded === pictures.shown, `${pictures.loaded} of ${pictures.shown}${pictures.missing[0] ? `; not loaded: ${pictures.missing.join(" | ")}` : ""}`)
      const priceBefore = await page.evaluate(() => (document.querySelector("product-price, .price, [ref='priceContainer']")?.textContent ?? "").replace(/\s+/g, " ").trim())
      const picked = await page.evaluate(() => {
        const inputs = [...document.querySelectorAll<HTMLInputElement>("variant-picker input[type=radio], variant-selects input[type=radio], variant-picker select, variant-selects select")]
        const radio = inputs.find((i) => i instanceof HTMLInputElement && i.value === "Large" && !i.checked) as HTMLInputElement | undefined
        if (radio) { (radio.labels?.[0] ?? radio).click(); return "radio" }
        const select = document.querySelector<HTMLSelectElement>("variant-picker select, variant-selects select")
        if (select) { select.value = [...select.options].find((o) => o.text.includes("Large"))?.value ?? select.value; select.dispatchEvent(new Event("change", { bubbles: true })); return "select" }
        return ""
      })
      await new Promise((r) => setTimeout(r, 1200))
      const priceAfter = await page.evaluate(() => (document.querySelector("product-price, .price, [ref='priceContainer']")?.textContent ?? "").replace(/\s+/g, " ").trim())
      /* A product template with no picker (a bundle selector instead, as Posturex's demo) has nothing to choose. */
      if (picked) check("choosing Large changes the price", priceBefore !== priceAfter && /60\.00/.test(priceAfter), `${picked}: "${priceBefore.slice(0, 40)}" to "${priceAfter.slice(0, 40)}"`)
      else console.log("  --    this product template has no variant picker")

      if (process.env.DEBUG_CART) page.on("response", async (r) => { if (/\/cart\/add/.test(r.url())) { const b = await r.text().catch(() => ""); console.log("ADD", r.status(), (r.request().postData() ?? "").replace(/\s+/g, " ").slice(0, 400), "=>", b.slice(0, 200), "sections:", Object.entries(JSON.parse(b).sections ?? {}).map(([k, v]) => `${k}:${String(v).length}:${/Linen shirt/.test(String(v))}`).join(" ")) } })
      const clicked = await page.evaluate(() => {
        const b = document.querySelector<HTMLButtonElement>("form[data-type='add-to-cart-form'] button[type='submit'], form[action='/cart/add'] button[name='add'], form[action='/cart/add'] button[type='submit']")
        if (!b) return false
        b.click()
        return true
      })
      await new Promise((r) => setTimeout(r, 2000))
      const cart = await page.evaluate(async () => (await fetch("/cart.js")).json())
      /* A bundle preselected by the theme adds its products together: at least the one, and it is in the cart. */
      const added = cart.item_count ?? 0
      check("Add to cart puts it in the cart", clicked && added >= 1 && (cart.items ?? []).some((i: { title?: string }) => /Linen shirt 2/.test(i.title ?? "")), `clicked ${clicked}, item_count ${added}, ${cart.items?.[0]?.title ?? ""}`)
      const bubble = await page.evaluate(() => {
        const el = document.querySelector(".cart-count-bubble, cart-icon .cart-bubble__text-count, .cart-bubble__text-count, [ref='cartBubbleCount'], header .cart-count")
        /* Dawn writes the number twice: once to see, once for a screen reader ("1 item"). The one to see. */
        const shown = el?.querySelector("[aria-hidden='true']") ?? el
        return (shown?.textContent ?? "").trim()
      })
      check("the header's cart count says what the cart holds", bubble === String(added), `"${bubble}" for ${added}`)
      /*
        What the theme opens after an add, as on Shopify: its cart drawer, or
        its notification, on screen with the product in it. A theme set not
        to open anything on an add (Horizon's "Open the cart drawer" is off
        by default) opens its drawer from the header's cart instead.
      */
      const findOpen = () => page.evaluate(() => {
        const shown = (el: Element) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 40 && r.height > 40 && r.right > 0 && r.left < innerWidth && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.5 }
        const panels = [...document.querySelectorAll("cart-drawer, cart-notification, cart-drawer-component dialog, #CartDrawer, .cart-drawer, .cart-notification, dialog[open], #minicart-form, .minicart__wrapper")]
        const open = panels.find((el) => shown(el) && /Linen shirt/i.test((el as HTMLElement).innerText))
        return { ok: !!open, what: open ? open.tagName.toLowerCase() + (open.id ? `#${open.id}` : "") : panels.map((el) => `${el.tagName.toLowerCase()}:${shown(el) ? `shown "${(el as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 90)}"` : "hidden"}`).join(",") || "none" }
      })
      let opened = await findOpen()
      let how = "on the add"
      if (!opened.ok) {
        await page.evaluate(() => {
          const icon = [...document.querySelectorAll<HTMLElement>("header cart-icon, header .header__icon--cart, header [ref='cartIcon'], header a[href='/cart'], header button[aria-controls*='cart' i], .header-actions__cart-icon, header [data-testid*='cart' i]")].find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
          ;(icon?.closest("button, a") as HTMLElement | null ?? icon)?.click()
        })
        await new Promise((r) => setTimeout(r, 1200))
        opened = await findOpen()
        how = "from the header's cart"
      }
      check(`the theme's cart drawer or notification opens with the product in it (${how})`, opened.ok, opened.what)
      await page.screenshot({ path: `${OUT}/${name}-${label}-added.png` })
      /* Its own Check out, as a visitor presses it: any terms box in it ticked first (Posturex draws one). */
      if (opened.ok) {
        checkoutHits = 0
        const pressed = await page.evaluate(() => {
          const shown = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" }
          const panel = [...document.querySelectorAll("cart-drawer, cart-notification, cart-drawer-component, #CartDrawer, .cart-drawer, .cart-notification, dialog[open], #minicart-form")].find((el) => shown(el) && /Linen shirt/i.test((el as HTMLElement).innerText))
          if (!panel) return "no panel"
          for (const box of panel.querySelectorAll<HTMLInputElement>("input[type=checkbox]")) if ((box.required || /terms|agree/i.test(box.name + box.id)) && !box.checked) box.click()
          return new Promise<string>((done) => setTimeout(() => {
            const formIds = [...panel.querySelectorAll("form[id]")].map((f) => f.id)
            const co = [...document.querySelectorAll<HTMLElement>("[name='checkout'], a[href*='/checkout']")].find((b) => shown(b) && (panel.contains(b) || formIds.includes(b.getAttribute("form") ?? "")))
            if (!co) return done("no checkout button")
            if ((co as HTMLButtonElement).disabled) return done("disabled")
            co.click()
            done("pressed")
          }, 100))
        })
        for (let t = 0; t < 30 && !checkoutHits; t++) await new Promise((r) => setTimeout(r, 200))
        check("the drawer's own Check out reaches checkout", pressed === "pressed" && checkoutHits > 0, `${pressed}, ${checkoutHits} checkout requests`)
      }

      await visit("/cart")
      await page.screenshot({ path: `${OUT}/${name}-${label}-cart.png` })
      const lines = await page.evaluate(() => document.body.innerText.includes("Linen shirt 2"))
      check("the cart page lists the line", lines && errors.length === 0, errors[0] ?? "")
      const plus = await page.evaluate(() => {
        const b = document.querySelector<HTMLButtonElement>("button[name='plus'], .quantity__button[name='plus'], quantity-selector-component button[name='plus']")
        if (!b) return false
        b.click()
        return true
      })
      await new Promise((r) => setTimeout(r, 2000))
      const after = await page.evaluate(async () => (await fetch("/cart.js")).json())
      check("+ adds one", plus && after.item_count === added + 1, `clicked ${plus}, item_count ${added} to ${after.item_count}`)

      /* Buy it now: that item alone, straight to checkout; the cart is left as it was. */
      await visit("/products/linen-shirt-3")
      lastCheckout = null
      const buyNow = await page.evaluate(() => {
        const b = document.querySelector<HTMLButtonElement>("[data-storelib-buy-now]")
        if (!b) return false
        b.click()
        return true
      })
      /* The handoff page posts the lines to the basket checkout and follows the address it answers. */
      for (let t = 0; t < 40 && !lastCheckout; t++) await new Promise((r) => setTimeout(r, 200))
      await visit("/cart")
      const kept = await page.evaluate(async () => (await fetch("/cart.js")).json())
      const sentItems = (lastCheckout as { items?: { quantity?: number }[] } | null)?.items ?? []
      check("Buy it now goes straight to checkout with that item alone", buyNow && sentItems.length === 1 && sentItems[0]?.quantity === 1, `button ${buyNow}, sent ${JSON.stringify(sentItems).slice(0, 120)}`)
      check("  and the cart is left as it was", kept.item_count === after.item_count, `item_count ${after.item_count} then ${kept.item_count}`)

      /* The search box. */
      await visit("/")
      const typed = await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>("input[type='search'], predictive-search input, input[name='q']")
        return !!input
      })
      if (typed) {
        /* The header's search: its first visible opener, then its first visible box. */
        await page.evaluate(() => {
          const shown = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" }
          const opener = [...document.querySelectorAll<HTMLElement>("[on\\:click*='search' i], .search-modal__button, button[aria-label*='Search' i], summary[aria-label*='Search' i], details-modal summary")].find(shown)
          opener?.click()
        })
        await new Promise((r) => setTimeout(r, 600))
        await page.evaluate(() => {
          const shown = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
          const input = [...document.querySelectorAll<HTMLInputElement>("predictive-search input[type='search'], predictive-search-component input, input[type='search'], input[name='q']")].find(shown)
          input?.setAttribute("data-probe-search", "")
        })
        const input = await page.$("[data-probe-search]")
        await input?.focus()
        await page.keyboard.type("shirt 3", { delay: 30 })
        await new Promise((r) => setTimeout(r, 2000))
        const found = await page.evaluate(() => [...document.querySelectorAll("predictive-search, predictive-search-component, .predictive-search")].some((el) => /Linen shirt 3/.test(el.textContent ?? "")))
        check("the search box finds Linen shirt 3", found)
        await page.screenshot({ path: `${OUT}/${name}-${label}-search.png` })
      } else check("the theme has a search box", false)

      /* The builder's canvas: Add to cart answered by the builder, Buy it now kept for the live site. */
      canvasCart = { cart: [], note: "" }
      canvasLeaks.length = 0
      errors.length = 0
      await page.goto(`${base}/__canvas?path=${encodeURIComponent("/products/linen-shirt-2")}`, { waitUntil: "networkidle0", timeout: 60_000 })
      await new Promise((r) => setTimeout(r, 800))
      const frame = page.frames().find((f) => f !== page.mainFrame())
      const pressIn = (sel: string) => frame!.evaluate((s) => { const b = [...document.querySelectorAll<HTMLElement>(s)].find((el) => el.getBoundingClientRect().width > 0); if (!b) return false; b.click(); return true }, sel)
      const buyInCanvas = await pressIn("[data-storelib-buy-now]")
      await new Promise((r) => setTimeout(r, 600))
      const liveOnly = await page.evaluate(() => (window as unknown as { __events: string[] }).__events.join())
      check("in the canvas, Buy it now says checkout is on the live site and adds nothing", buyInCanvas && liveOnly === "checkout" && canvasCart.cart.length === 0, `pressed ${buyInCanvas}, "${liveOnly}", ${canvasCart.cart.length} lines`)
      /* From the press on: a theme's own broken markup on load (Posturex's empty preload, " 800w") is not the cart's. */
      canvasLeaks.length = 0
      const addInCanvas = await pressIn("form[data-type='add-to-cart-form'] button[type='submit'], form[action='/cart/add'] button[name='add'], form[action='/cart/add'] button[type='submit']:not([name='checkout'])")
      await new Promise((r) => setTimeout(r, 2500))
      check("in the canvas, Add to cart fills the builder's cart, with nothing sent to the network", addInCanvas && canvasCart.cart.length >= 1 && canvasLeaks.length === 0 && errors.length === 0, `pressed ${addInCanvas}, ${canvasCart.cart.length} lines, leaks: ${canvasLeaks.join(" ") || "none"}${errors[0] ? `, ${errors[0]}` : ""}`)
      await page.screenshot({ path: `${OUT}/${name}-${label}-canvas.png` })

      check("nothing was asked of Shopify's servers", shopifyHits.length === 0, shopifyHits[0] ?? "")
      await page.deleteCookie({ name: CART_COOKIE, url: base })
      await page.close()
    }
  } finally {
    await browser.close()
    server.close()
  }
}

async function main() {
  for (const c of COLOURS) PNGS.push(await sharp({ create: { width: 800, height: 800, channels: 3, background: c } }).png().toBuffer())
  const zips = process.argv.slice(2)
  if (!zips.length) {
    console.log("usage: npx tsx scripts/check-shopify-theme.ts <theme.zip> [...]")
    process.exit(2)
  }
  for (const z of zips) await run(z)
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  process.exit(failed ? 1 : 0)
}
main()
