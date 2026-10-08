/**
 * ===========================================================================
 *  A CART OF THE SECTION'S OWN, PRESSED IN A BROWSER
 * ===========================================================================
 * lib/website-builder/storefront-hooks.ts (A CART OF THE SECTION'S OWN) and
 * its page half, components/website-builder/sections/site-chrome-hooks.tsx,
 * on the section in scripts/fixtures/own-cart.storelib drawn by the real
 * renderer, in headless Chromium:
 *
 *   ADD       a product's own button adds it to the site's one cart and opens
 *             the section's own panel, never the built-in drawer
 *   LINES     each line is drawn from the section's own pattern, as text:
 *             title, quantity, line price, picture, link
 *   QUANTITY  plus and minus change a shipped product's quantity; a digital
 *             one stays at one; minus at one removes the line
 *   EMPTY     the empty and filled states follow the cart; the subtotal is
 *             the sum
 *   KEPT      the cart is the site's: it is in local storage under the shop
 *   CHECKOUT  Check out goes where the built-in drawer's does (a cart with a
 *             shipped product: the physical checkout)
 *   CLOSE     the close button and Escape shut the panel
 *
 *   node scripts/check-own-cart.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".own-cart-probe")
mkdirSync(stubs, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://shop.example"

try {
  writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
  const { build } = await import("esbuild")
  /* The section drawn on the server by the real renderer, as the live site prerenders it. */
  await build({
    entryPoints: [join(root, "scripts/render-own-cart-html.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    alias: { "@": "." },
    external: ["server-only"],
    outfile: join(stubs, "render.cjs"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const rendered = execFileSync(process.execPath, [join(stubs, "render.cjs")], { encoding: "utf8" })
  await build({
    entryPoints: [join(root, "scripts/render-own-cart.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.own-cart-probe/navigation.js", "next/link": "./.own-cart-probe/link.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script>window.__SECTION__=${rendered.replace(/</g, "\\u003c")}</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e.message || e)))
  const went = []
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const url = r.url()
    if (r.isNavigationRequest() && url !== `${ORIGIN}/`) {
      went.push(url)
      return void r.respond({ status: 200, contentType: "text/html", body: "<p>checkout</p>" })
    }
    if (url === `${ORIGIN}/`) return void r.respond({ status: 200, contentType: "text/html", body: html })
    return void r.respond({ status: 204, body: "" })
  })
  await p.goto(`${ORIGIN}/`, { waitUntil: "load" })
  await sleep(300)
  const drawn = await p.evaluate(() => window.__render)
  expect(drawn === "ok", "the section is drawn by the real renderer", drawn)

  const state = () =>
    p.evaluate(() => {
      const panel = document.querySelector("[data-storelib-cart-panel]")
      const lines = [...document.querySelectorAll("[data-storelib-cart-line-item]")].map((li) => ({
        title: li.querySelector("[data-line-title]")?.textContent,
        qty: li.querySelector("[data-line-qty]")?.textContent,
        price: li.querySelector("[data-line-price]")?.textContent,
        img: li.querySelector("img[data-line-image]")?.getAttribute("src"),
        href: li.querySelector("a[data-line-url]")?.getAttribute("href"),
        incDisabled: li.querySelector("[data-line-inc]")?.hasAttribute("disabled"),
      }))
      return {
        open: panel?.getAttribute("data-open"),
        inert: panel?.hasAttribute("inert"),
        lines,
        pattern: document.querySelectorAll("[data-storelib-cart-line]").length,
        patternHidden: document.querySelector("[data-storelib-cart-line]")?.hidden,
        empty: document.querySelector("[data-storelib-cart-empty]")?.hidden,
        filled: document.querySelector("[data-storelib-cart-filled]")?.hidden,
        subtotal: document.querySelector("[data-storelib-cart-subtotal]")?.textContent,
        count: document.querySelector("[data-storelib-cart-count]")?.textContent,
        builtInDrawer: !!document.querySelector("[data-cart-drawer], [data-header-cart-drawer]"),
        stored: localStorage.getItem(Object.keys(localStorage).find((k) => k.includes("shop-1")) || ""),
      }
    })

  let s = await state()
  expect(s.open === "false" && s.inert === true, "the panel starts shut and out of reach", s)
  expect(s.empty === false && s.filled === true, "EMPTY: an empty cart shows the empty state", s)
  expect(s.pattern === 1 && s.patternHidden === true && s.lines.length === 0, "the line pattern is kept hidden and nothing is drawn from it yet", s)

  await p.click('[data-storelib-add-to-cart="linen-shirt"]')
  await sleep(120)
  s = await state()
  expect(s.open === "true" && s.inert === false, "ADD: the product's own button opens the section's own panel", s)
  expect(!s.builtInDrawer, "and never the built-in drawer", s.builtInDrawer)
  expect(s.lines.length === 1 && s.lines[0].title === "Linen shirt" && s.lines[0].qty === "1" && s.lines[0].price === "$48.00", "LINES: the line is drawn as text from the section's pattern", s.lines)
  expect(s.lines[0]?.img === "/img/linen-shirt.jpg" && s.lines[0]?.href === "/products/linen-shirt", "with its picture and its link", s.lines[0])
  expect(s.count === "1" && s.empty === true && s.filled === false && s.subtotal === "$48.00", "the count, the filled state and the subtotal follow", s)

  await p.click('[data-storelib-add-to-cart="lookbook-pdf"]')
  await sleep(120)
  await p.evaluate(() => [...document.querySelectorAll("[data-storelib-cart-line-item]")][0].querySelector("[data-line-inc]").click())
  await sleep(120)
  s = await state()
  const shirt = s.lines.find((l) => l.title === "Linen shirt")
  const pdf = s.lines.find((l) => l.title === "Lookbook PDF")
  expect(shirt?.qty === "2" && shirt?.price === "$96.00", "QUANTITY: plus raises a shipped product's quantity and its line price", shirt)
  expect(pdf?.qty === "1" && pdf?.incDisabled === true, "a digital product stays at one", pdf)
  expect(s.subtotal === "$108.00", "the subtotal is the sum", s.subtotal)
  expect(typeof s.stored === "string" && s.stored.includes("linen-shirt") && s.stored.includes("lookbook-pdf"), "KEPT: the cart is the site's, in local storage under the shop", s.stored?.slice(0, 120))

  await p.evaluate(() => {
    const li = [...document.querySelectorAll("[data-storelib-cart-line-item]")].find((x) => x.querySelector("[data-line-title]").textContent === "Lookbook PDF")
    li.querySelector("[data-line-dec]").click()
  })
  await sleep(120)
  s = await state()
  expect(s.lines.length === 1 && s.lines[0].title === "Linen shirt", "minus at one removes the line", s.lines)

  await p.click("[data-storelib-cart-close]")
  await sleep(80)
  s = await state()
  expect(s.open === "false", "CLOSE: the close button shuts the panel", s.open)
  await p.click("[data-storelib-cart]")
  await sleep(80)
  expect((await state()).open === "true", "the section's own bag opens its own panel", null)
  await p.keyboard.press("Escape")
  await sleep(80)
  expect((await state()).open === "false", "and Escape shuts it", null)

  await p.click("[data-storelib-cart]")
  await sleep(80)
  await Promise.all([p.waitForNavigation({ timeout: 4000 }).catch(() => null), p.click("[data-storelib-checkout]")])
  await sleep(200)
  expect(went.some((u) => /checkout|physical/i.test(u)), "CHECKOUT: a cart with a shipped product goes to the physical checkout", went)
  expect(errors.length === 0, "no page errors", errors)
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
