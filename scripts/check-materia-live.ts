/**
 * ===========================================================================
 *  MATERIA'S LIVE PAGES: ONE OF EACH, BACK WHERE IT WAS (round 25)
 * ===========================================================================
 *   MATERIA=/path/to/materia [MATERIA_REV=b6cabaa] npx tsx scripts/check-materia-live.ts
 *   (the Materia repository cloned; its history must hold MATERIA_REV)
 *
 * The Materia theme as its repository holds it (storelib-repo/1, the shape
 * GitHub sync writes and reads back), drawn by the compat engine's own
 * answer() with the live site's navigation markup, the way a visitor gets it
 * (lib/website-builder/compat-site.ts), in Chromium on a phone and a desktop:
 *
 *   ONCE        every section on the page is drawn once (no id twice), and
 *               no script file is loaded twice
 *   NO ERRORS   the theme's scripts start without an uncaught error
 *   ONE PAGE    the theme's own landing rule is there (the page being left is
 *               never blended into the next), and so is the platform's
 *   BACK        a product page and Back: the home page comes back whole from
 *               the back/forward cache (no second start of its scripts),
 *               at the scroll it was left at
 *
 * This is the theme's files and the platform's own code, served locally:
 * no live store, no database, no real device.
 */
import { createServer } from "node:http"
import { execFileSync } from "node:child_process"
import puppeteer from "puppeteer-core"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { answer, themeAsset, type SiteData } from "../lib/storelib-theme/compat/site"
import { compatMenus } from "../lib/storelib-theme/compat/menus"
import { pagesFromPackageFiles } from "../lib/website-builder/theme-pages"
import { liveNavigationEnd, liveNavigationMarkup } from "../lib/website-builder/live-navigation"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const DIR = process.env.MATERIA ?? "/home/user/drew471nastez/materia"
const REV = process.env.MATERIA_REV ?? "b6cabaa"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let failed = 0

/** Two products and a menu, as a creator's shop has them. */
function shop() {
  const products = ["Posture corrector", "Lumbar belt"].map((title, i) => {
    const slug = title.toLowerCase().replace(/\W+/g, "-")
    return {
      id: `00000000-0000-4000-8000-00000000000${i + 1}`,
      settings: { title, slug, url: `/products/${slug}`, price: `$${39 + i * 10}.00`, image: "", images: [], kind: "physical", available: true, description: "", variants: [], options: [] },
    }
  })
  const collections = [{ id: "c-summer", title: "Summer", handle: "summer", description: "", image: "", url: "/collections/summer", products, products_count: 2 }]
  const menus = { "main-menu": { title: "Main menu", links: [{ title: "Home", url: "/" }, { title: "Corrector", url: "/products/posture-corrector" }, { title: "Summer", url: "/collections/summer" }] } }
  return { products, collections, menus }
}
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail === undefined ? "" : `  (${JSON.stringify(detail).slice(0, 400)})`}`)
}

/** The repository's text files at that commit, as GitHub sync reads them back. */
function repoFiles(): Record<string, string> {
  const git = (...a: string[]) => execFileSync("git", ["-C", DIR, ...a], { maxBuffer: 1 << 28 }).toString()
  const out: Record<string, string> = {}
  for (const path of git("ls-tree", "-r", "--name-only", REV).split("\n").filter(Boolean)) {
    if (/\.(png|jpe?g|gif|webp|avif|svg|ico|mp4|webm|woff2?|ttf|otf|eot)$/i.test(path) || /^(tests|docs)\//.test(path)) continue
    out[path] = git("show", `${REV}:${path}`)
  }
  return out
}

async function main() {
  const files = repoFiles()
  const settings = JSON.parse(files["config/settings.json"] ?? "{}") as Record<string, unknown>
  const theme = themeOfInstall(files, settings, {
    assetUrl: (n) => `/api/site-theme/assets/x/1/${encodeURIComponent(n)}`,
    assetText: (n) => files[`shopify/assets/${n}`] ?? null,
  })
  const pages = Object.fromEntries(pagesFromPackageFiles(files).map((p) => [p.page_key, p.sections])) as SiteData["pages"]
  const { products, collections, menus } = shop()
  const site: SiteData = {
    creatorId: "c",
    theme,
    pages,
    products: products as never,
    collections: collections as never,
    menus: compatMenus(menus, Object.keys(pages)),
    shop: { name: "Materia", currency: "USD", moneyFormat: "${{amount}}" },
    host: "127.0.0.1",
    extraHead: liveNavigationMarkup(),
    extraBodyEnd: liveNavigationEnd(),
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname.startsWith("/api/site-theme/assets/")) {
      const name = decodeURIComponent(url.pathname.split("/").pop() ?? "")
      const a = themeAsset(theme, name, () => theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "" } }))
      if (!a) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { "Content-Type": a.type, "Cache-Control": "public, max-age=3600" })
      res.end(a.body)
      return
    }
    if (url.pathname === "/cart.js") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ item_count: 0, items: [], total_price: 0 }))
      return
    }
    try {
      const out = await answer(site, { method: req.method ?? "GET", path: url.pathname, query: url.searchParams, body: null, cart: [] })
      /* As the live site sends a page (./site.ts): kept for Back, asked again otherwise. */
      res.writeHead(out.status, { ...(out.headers ?? {}), "Content-Type": out.type, "Cache-Control": "private, no-cache" })
      res.end(out.body)
    } catch (e) {
      res.writeHead(500)
      res.end(String(e))
    }
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
  try {
    for (const [name, vp] of [["phone", { width: 390, height: 844, isMobile: true, hasTouch: true }], ["desktop", { width: 1366, height: 900 }]] as const) {
      console.log(`\n${name} ${vp.width}x${vp.height}`)
      const p = await browser.newPage()
      await p.setViewport(vp)
      const errors: string[] = []
      p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
      /* Counts each start of the page's scripts, kept across a Back from the cache (the window is the same one). */
      await p.evaluateOnNewDocument("window.__name = (f) => f")
      await p.evaluateOnNewDocument(`window.__starts=(window.__starts||0)+1;addEventListener("pageshow",function(e){window.__shown=(window.__shown||[]).concat(e.persisted?"cache":"load")})`)
      await p.goto(`${base}/`, { waitUntil: "load" })
      await sleep(800)
      const home = await p.evaluate(() => {
        const ids = [...document.querySelectorAll<HTMLElement>("[id^='shopify-section-']")].map((e) => e.id)
        const srcs = [...document.querySelectorAll<HTMLScriptElement>("script[src]")].map((s) => s.getAttribute("src") ?? "")
        const dup = (l: string[]) => [...new Set(l.filter((x, i) => l.indexOf(x) !== i))]
        return {
          sections: ids.length,
          dupSections: dup(ids),
          dupScripts: dup(srcs),
          landing: !!document.getElementById("speed-page-landing"),
          platformRule: [...document.querySelectorAll("style")].some((s) => /@view-transition\s*\{\s*navigation:\s*auto/.test(s.textContent ?? "")),
          height: document.documentElement.scrollHeight,
        }
      })
      check("the home page has its sections, each drawn once", home.sections > 3 && home.dupSections.length === 0, { sections: home.sections, dup: home.dupSections })
      check("no script file is loaded twice", home.dupScripts.length === 0, home.dupScripts)
      check("the theme's own landing rule and the platform's transition are both there", home.landing && home.platformRule, { landing: home.landing, platform: home.platformRule })

      const y = Math.min(1400, Math.max(0, home.height - vp.height - 10))
      await p.evaluate((y) => window.scrollTo(0, y), y)
      await sleep(400)
      const left = await p.evaluate(() => Math.round(window.scrollY))
      await p.goto(`${base}/products/posture-corrector`, { waitUntil: "load" })
      await sleep(600)
      const product = await p.evaluate(() => ({ path: location.pathname, dup: (() => { const l = [...document.querySelectorAll("[id^='shopify-section-']")].map((e) => e.id); return l.filter((x, i) => l.indexOf(x) !== i) })(), main: !!document.querySelector("[id*='main-product'],[id*='main_product'],product-info,.product") }))
      check("the product page is drawn, its sections once", product.path === "/products/posture-corrector" && product.dup.length === 0 && product.main, product)
      await p.goBack({ waitUntil: "load" })
      await sleep(800)
      const back = await p.evaluate(() => ({ path: location.pathname, y: Math.round(window.scrollY), starts: (window as unknown as { __starts: number }).__starts, shown: (window as unknown as { __shown: string[] }).__shown }))
      check("Back brings the home page back from the cache, its scripts not started again", back.path === "/" && back.starts === 1 && back.shown.at(-1) === "cache", back)
      check("  at the scroll it was left at", Math.abs(back.y - left) <= 2, { left, back: back.y })
      check("no uncaught error from the theme's scripts", errors.length === 0, errors)
      await p.close()
    }
  } finally {
    await browser.close()
    server.close()
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  process.exit(failed ? 1 : 0)
}

void main()
