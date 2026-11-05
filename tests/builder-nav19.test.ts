/**
 * An imported theme's links and the builder's phone selector (round W19).
 *
 *   every link of the header, its drawer, the footer, the tab bar and the
 *   home page of a theme built as Posturex is (tests/fixtures/shopify-
 *   posture) lands on a page of the live site, never a 404 or the old
 *   Shopify store, and each one opens a page in the builder's canvas
 *   an address of the store the theme came from is sent on, once; any other
 *   address that is not a page is still a 404
 *   a live page holds itself back at most HOLD_MS after its first byte
 *   the canvas never moves its page frames, so a page it left cannot come back
 *   the phone selector: one outline, a mouse's hover only, a second tap up a level
 *
 * The browser half (timings, outlines measured against the element) is
 * scripts/check-builder-nav19.ts.
 *
 *   npx tsx tests/builder-nav19.test.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import vm from "node:vm"
import JSZip from "jszip"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { answer, type SiteData } from "../lib/storelib-theme/compat/site"
import { compatMenus } from "../lib/storelib-theme/compat/menus"
import { siteLink, shopifyAddress, linkFactsOf } from "../lib/storelib-theme/compat/links"
import { compatPageForHref } from "../lib/storelib-theme/compat/install"
import { CANVAS_BRIDGE } from "../lib/storelib-theme/compat/canvas-bridge"
import { HOLD_MS, NAVIGATION_HEAD_SCRIPT } from "../lib/website-builder/live-navigation"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(p, "utf8")

async function fixture() {
  const dir = join(process.cwd(), "tests", "fixtures", "shopify-posture")
  const zip = new JSZip()
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(dir, p), readFileSync(p))
    }
  }
  walk(dir)
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error("the fixture theme did not convert")
  return r.theme
}

const products = ["Posture corrector", "Lumbar belt"].map((title, i) => {
  const slug = title.toLowerCase().replace(/\W+/g, "-")
  return { id: `00000000-0000-4000-8000-00000000000${i + 1}`, settings: { title, slug, url: `/products/${slug}`, price: "$39.00", image: "", images: [], available: true, variants: [], options: [] } }
})
const collections = [{ id: "c-summer", title: "Summer", handle: "summer", description: "", image: "", url: "/collections/summer", products, products_count: 2 }]
const menus = {
  "main-menu": { title: "Main menu", links: [
    { title: "Home", url: "/" }, { title: "Shop", url: "/products" }, { title: "Correctors", url: "/collections/posture-correctors" },
    { title: "Best seller", url: "/products/posturex-pro" }, { title: "Summer", url: "/collections/summer" }, { title: "About", url: "/about" },
    { title: "Contact", url: "/contact" }, { title: "Journal", url: "/blogs/news" }, { title: "Refunds", url: "/policies/refund-policy" },
    { title: "Sale", url: "https://posturex.myshopify.com/collections/sale" },
  ] },
  footer: { title: "Footer", links: [{ title: "Shipping", url: "/policies/shipping-policy" }, { title: "Corrector", url: "/collections/summer/products/posture-corrector" }, { title: "Wishlist", url: "/wishlist" }] },
}

async function main() {
  console.log("\nWhere a link goes\n")
  {
    const facts = { pages: ["home", "product", "collection", "collections", "cart", "search", "contact", "page", "404"], products, collections, policies: ["refund-policy"] }
    const go = (h: string) => siteLink(h, facts)
    check("a collection or a product the shop does not have is the shop", go("/collections/posture-correctors") === "/collections/all" && go("/products/posturex-pro") === "/collections/all" && go("shopify://collections/x?sort_by=price") === "/collections/all?sort_by=price")
    check("  and one it has is itself, by handle, title or id", go("/collections/summer") === "/collections/summer" && go("/products/posture-corrector") === "/products/posture-corrector" && go(`/products/${products[1].id}`) === "/products/lumbar-belt" && go("/collections/summer/products/lumbar-belt") === "/products/lumbar-belt")
    check("Storelib's shop, /products, is the shop's collection without a redirect", go("/products") === "/collections/all" && go("/shop") === "/collections/all")
    check("Storelib's /about reaches the theme's page template; /contact the theme's contact page", go("/about") === "/pages/about" && go("/contact") === "/contact" && go("/pages/contact-us") === "/pages/contact")
    check("a blog or a policy the site has none of is home; one it has is itself", go("/blogs/news") === "/" && go("/policies/shipping-policy") === "/" && go("/policies/refund-policy") === "/policies/refund-policy" && go("shopify://policies/refund-policy") === "/policies/refund-policy")
    check("the old Shopify store's address, with or without a locale, is this site's", go("https://posturex.myshopify.com/collections/summer") === "/collections/summer" && go("/en/collections/summer") === "/collections/summer" && go("//posturex.myshopify.com/") === "/")
    check("another site, mail, a phone, an anchor and the visitor's own pages are left as they are", ["https://instagram.com/x", "mailto:a@b.c", "tel:1", "#top", "/account", "/cart", "/search?q=a", "/wishlist", "/pages/wishlist"].every((h) => go(h) === h))
    check("shopify://policies was an empty address (the footer's Refunds reloaded the page)", shopifyAddress("shopify://policies/refund-policy") === "/policies/refund-policy")
    check("in the builder an empty list is not yet known, never \"the shop has none\"", siteLink("/products/posture-corrector", linkFactsOf({ designMode: true, products: [], collections: [] })) === "/products/posture-corrector" && siteLink("/collections/summer", linkFactsOf({ designMode: true, collections: [] })) === "/collections/summer")
  }

  console.log("\nThe fixture theme, live\n")
  {
    const t = await fixture()
    const theme = themeOfInstall(t.files, t.settings, { assetUrl: (n) => `/a/${n}`, assetText: (n) => t.files[`shopify/assets/${n}`] ?? null })
    const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections])) as SiteData["pages"]
    const site: SiteData = { creatorId: "c", theme, pages, products: products as never, collections: collections as never, menus: compatMenus(menus, Object.keys(pages)), shop: { name: "Posturex", currency: "USD", moneyFormat: "${{amount}}", policies: [{ handle: "refund-policy", title: "Refund policy", body: "<p>30 days</p>" }] }, host: "x" }
    const get = (path: string) => {
      const [p, q = ""] = path.split("?")
      return answer(site, { method: "GET", path: p, query: new URLSearchParams(q), body: null, cart: [] })
    }
    const home = String((await get("/")).body)
    const hrefs = [...new Set([...home.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&")))]
    const dead: string[] = []
    for (const h of hrefs) {
      if (/^(https?:)?\/\//.test(h)) {
        if (/myshopify\.com/.test(h)) dead.push(h)
        continue
      }
      if (!h.startsWith("/")) { dead.push(h || "(empty)"); continue }
      let r = await get(h)
      if (r.status >= 300 && r.status < 400) r = await get(String(r.headers?.Location ?? ""))
      if (r.status >= 400) dead.push(`${h} ${r.status}`)
    }
    check("every link of the header, drawer, footer, tab bar and home page lands on a page", dead.length === 0 && hrefs.length >= 12, { links: hrefs.length, dead })
    const old = await get("/collections/posture-correctors?sort_by=price-ascending")
    check("an old store's collection arriving by address is sent on once, its query kept", old.status === 303 && old.headers?.Location === "/collections/all?sort_by=price-ascending", old.headers)
    check("  and a mistyped address is still a 404", (await get("/no-such-page")).status === 404 && (await get("/products/nope.js")).status === 404)
    const ed = (h: string) => compatPageForHref(h, Object.keys(pages))
    const opened = hrefs.filter((h) => h.startsWith("/") && !/^\/(account|wishlist|pages\/wishlist|policies)/.test(h)).map((h) => [h, ed(h)] as const)
    check("each of those links opens a page in the builder", opened.every(([, to]) => !!to), opened.filter(([, to]) => !to))
    check("Storelib's own names open the theme's pages in the builder", ed("/about")?.key === "page" && ed("/contact")?.key === "contact" && ed("/collections/summer/products/lumbar-belt")?.product === "lumbar-belt" && ed("https://posturex.myshopify.com/pages/contact")?.key === "contact" && ed("https://instagram.com/x") === null)
  }

  console.log("\nBetween two live pages\n")
  {
    check("the hold is short", HOLD_MS > 0 && HOLD_MS <= 300)
    check("counted from the page's first byte, for the blocker and the paused fade alike", /responseStart/.test(NAVIGATION_HEAD_SCRIPT) && (NAVIGATION_HEAD_SCRIPT.match(/left\(\)/g) ?? []).length >= 2 && !/1800|1000-performance/.test(NAVIGATION_HEAD_SCRIPT))
    const timers: number[] = []
    const ctx: Record<string, unknown> = {
      navigator: { userAgent: "Chrome/141", hardwareConcurrency: 8, deviceMemory: 8 },
      document: { documentElement: { setAttribute() {}, removeAttribute() {} }, head: { appendChild() {} }, getElementById: () => ({ remove() {} }), createElement: () => ({ setAttribute() {} }), addEventListener() {} },
      navigation: { activation: { from: {}, navigationType: "push" } },
      matchMedia: () => ({ matches: false }),
      performance: { now: () => 900, getEntriesByType: () => [{ responseStart: 800 }] },
      setTimeout: (_f: () => void, ms: number) => { timers.push(ms); return 0 },
      requestAnimationFrame: (f: () => void) => f(),
      addEventListener() {},
    }
    ctx.window = ctx
    vm.runInNewContext(NAVIGATION_HEAD_SCRIPT, ctx)
    check("a page whose first byte came 100ms ago is held 150ms more, not until the second mark", timers[0] === HOLD_MS - 100, timers)
  }

  console.log("\nThe canvas\n")
  {
    const canvas = read("components/website-builder/compat/compat-canvas.tsx")
    /* The page being left, while it fades off the next (round G), is drawn in its own place among them too. */
    check("the page frames are drawn in the order they were made, so none is ever moved (a moved frame loads again)", /\[\.\.\.slots, handover\] : \[\.\.\.slots\]\), \.\.\.kept\.filter\([^\n]*\]\.sort\(\(a, b\) => a\.n - b\.n\)/.test(canvas))
    /* Round 20 (tests/canvas20.test.ts): the one in front is taken out of the pages the moment the next comes forward, so nothing of it can come back; round G only lets it fade off, as a frame that hears nothing. */
    check("  and the page being left is no page the moment the next comes forward, so it cannot come back", /return i <= 0 \? prev : prev\.slice\(i\)/.test(canvas) && /const slot = slotsRef\.current\.find\(\(x\) => frames\.current\.get\(x\.n\)\?\.contentWindow === e\.source\)/.test(canvas))
    check("the canvas is told every page the site has", /pageKeys=\{rowPageKeys\}/.test(read("app/(storelib)/website-builder/editor/[installId]/page.tsx")) && /pageKeys: pageKeys \?/.test(canvas))
    const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
    check("a link that opens nothing in the canvas says why", /Opens \$\{other\[1\]/.test(editor) && /No page at \$\{path\} yet/.test(editor))
    check("the block panel's Back goes up one level", /parsePath\(key\)\.slice\(0, -1\)/.test(editor))
  }

  console.log("\nThe selector\n")
  {
    let reads = true
    try { new Function(CANVAS_BRIDGE) } catch { reads = false }
    check("the bridge reads as JavaScript", reads)
    /* Changed on purpose (round 14): the three boxes are measured first and written after (drawBoxes), so the section's reading is skipped when a block is outlined. */
    check("one outline: a selected block hides its section's ring", /var seen = b \? null : visibleRect\(sec, 0\);/.test(CANVAS_BRIDGE) && /place\(boxes\.section, seen\)/.test(CANVAS_BRIDGE))
    check("hover is a mouse's only", /pointerover[\s\S]{0,80}pointerType !== "mouse"/.test(CANVAS_BRIDGE) && !/addEventListener\("mouseover"/.test(CANVAS_BRIDGE))
    check("a second tap on the selected block goes up a level, a finger only", /touching && !link && selected\.section === id/.test(CANVAS_BRIDGE) && /path = path\.slice\(0, where\)/.test(CANVAS_BRIDGE))
    /* Changed on purpose (round 14): the boxes share one offset (boxDx/boxDy), read back from one box once the page is still (landed), not each box every frame. */
    check("a box is read back and moved by what a moved <html> or <body> did to it", /boxDx \+= ex; boxDy \+= ey;/.test(CANVAS_BRIDGE) && /var landed = function \(pairs\)/.test(CANVAS_BRIDGE))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}
void main()
