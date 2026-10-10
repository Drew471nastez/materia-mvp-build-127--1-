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
 *   the search box finds a product (/search/suggest, section rendering)
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
import { answer, themeAsset, readCartCookie, writeCartCookie, CART_COOKIE, type SiteData } from "../lib/storelib-theme/compat/site"

const OUT = process.env.OUT ?? "/tmp/shopify-theme-check"
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
      const a = themeAsset(theme, name, () => theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "" } }))
      if (!a) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { "Content-Type": a.type, "Access-Control-Allow-Origin": "*" })
      res.end(a.body)
      return
    }
    if (url.pathname.startsWith("/api/checkout/cart")) {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ url: "http://127.0.0.1/__checkout_opened" }))
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
    const out = await answer(site, { method: req.method ?? "GET", path: url.pathname, query: url.searchParams, body, cart, note, ajax })
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
      page.on("request", (r) => {
        const u = r.url()
        if (/shopify(cdn|cloud)?\.com/.test(u)) { shopifyHits.push(u); return r.abort() }
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
      check("choosing Large changes the price", !!picked && priceBefore !== priceAfter && /60\.00/.test(priceAfter), `${picked || "no picker"}: "${priceBefore.slice(0, 40)}" to "${priceAfter.slice(0, 40)}"`)

      const clicked = await page.evaluate(() => {
        const b = document.querySelector<HTMLButtonElement>("form[data-type='add-to-cart-form'] button[type='submit'], form[action='/cart/add'] button[name='add'], form[action='/cart/add'] button[type='submit']")
        if (!b) return false
        b.click()
        return true
      })
      await new Promise((r) => setTimeout(r, 2000))
      const cart = await page.evaluate(async () => (await fetch("/cart.js")).json())
      check("Add to cart puts it in the cart", clicked && cart.item_count === 1, `clicked ${clicked}, item_count ${cart.item_count}, ${cart.items?.[0]?.title ?? ""}`)
      const bubble = await page.evaluate(() => {
        const el = document.querySelector(".cart-count-bubble, cart-icon .cart-bubble__text-count, .cart-bubble__text-count, [ref='cartBubbleCount']")
        /* Dawn writes the number twice: once to see, once for a screen reader ("1 item"). The one to see. */
        const shown = el?.querySelector("[aria-hidden='true']") ?? el
        return (shown?.textContent ?? "").trim()
      })
      check("the header's cart count says 1", bubble === "1", `"${bubble}"`)
      await page.screenshot({ path: `${OUT}/${name}-${label}-added.png` })

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
      check("+ makes the quantity 2", plus && after.item_count === 2, `clicked ${plus}, item_count ${after.item_count}`)

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
