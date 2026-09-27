/**
 * ATTRIBUTION IN A REAL BROWSER: A VISIT FROM INSTAGRAM REACHES CHECKOUT
 *
 *   node scripts/check-attribution.mjs
 *
 * The real modules (components/attribution/capture-touch,
 * components/website-builder/checkout-link-origin, lib/attribution/browser,
 * lib/orders/checkout-origin-browser), bundled, in headless Chromium. The
 * hosts are answered by the probe itself, so the browser's own rules apply
 * for real: document.referrer, local storage per host, the consent cookie per
 * host, the redirect a website's /checkout gets to storelib.com (as proxy.ts
 * sends it), and history.replaceState.
 *
 *   1. instagram.com links to luca.storelib.com with UTM tags; the link is followed.
 *   2. Days later, a new tab: luca.storelib.com/about typed in (direct).
 *   3. Buy on the website: a section's plain /checkout link.
 *   4. storelib.com/checkout: Pay. The request the checkout page sends is read.
 *
 * Then the same without analytics consent, in one tab.
 *
 * Prints what the numbers are, and exits 1 when one of them is not what
 * docs/analytics/attribution.md says.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const CREATOR = "c0ffee00-0000-4000-8000-000000000001"
const PRODUCT = "f0000000-0000-4000-8000-000000000001"
const dir = join(root, ".attribution-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(
  join(dir, "entry.tsx"),
  `import React from "react"
import { createRoot } from "react-dom/client"
import { CaptureTouch } from "@/components/attribution/capture-touch"
import { CheckoutLinkOrigin } from "@/components/website-builder/checkout-link-origin"
import { checkoutOrigin } from "@/lib/orders/checkout-origin-browser"
import { adoptCarriedTouches } from "@/lib/attribution/browser"

const page = document.body.dataset.page
if (page === "site") {
  createRoot(document.getElementById("app")!).render(<><CaptureTouch property="website" /><CheckoutLinkOrigin /></>)
}
if (page === "checkout") {
  /* What app/checkout/checkout-client.tsx does: read on mount, send with Pay. */
  adoptCarriedTouches()
  ;(window as any).__addressAfterRead = location.href
  document.getElementById("pay")!.addEventListener("click", async () => {
    await fetch("/api/checkout/stripe-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "${PRODUCT}", origin: checkoutOrigin(document.body.dataset.creator) }),
    })
    document.body.dataset.sent = "1"
  })
}
`,
)
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => location.pathname
export const useRouter = () => ({ push(h) { location.href = h }, replace() {}, prefetch() {}, back() {} })
export const useSearchParams = () => new URLSearchParams(location.search)
`)
try {
  execFileSync(
    "pnpm",
    ["exec", "esbuild", join(dir, "entry.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
      `--outfile=${join(dir, "probe.js")}`, '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN="storelib.com"',
      `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:@=${root}`],
    { stdio: ["ignore", "ignore", "inherit"] },
  )
  /* The server's decoder, for reading what arrived. */
  execFileSync(
    "pnpm",
    ["exec", "esbuild", join(root, "lib/attribution/touch.ts"), "--bundle", "--format=esm", "--platform=node", "--log-level=error", `--outfile=${join(dir, "touch.mjs")}`, `--alias:@=${root}`],
    { stdio: ["ignore", "ignore", "inherit"] },
  )
} catch {
  rmSync(dir, { recursive: true, force: true })
  fail("the probe did not bundle")
}
const bundle = readFileSync(join(dir, "probe.js"), "utf8")
const { decodeTouches } = await import(pathToFileURL(join(dir, "touch.mjs")).href)
rmSync(dir, { recursive: true, force: true })

const doc = (body, data = "") =>
  `<!doctype html><html><head><meta charset="utf-8"><title>probe</title></head><body ${data}>${body}<div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${bundle}</script></body></html>`
const html = (body) => ({ status: 200, contentType: "text/html", body })

let problems = 0
const expect = (label, ok, value) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${value === undefined ? "" : `: ${typeof value === "string" ? value : JSON.stringify(value)}`}`)
  if (!ok) problems++
}

async function run(browser, { consent }) {
  const context = await browser.createBrowserContext()
  const seen = { checkoutUrl: null, body: null }
  const serve = async (page) => {
    await page.setRequestInterception(true)
    page.on("request", (req) => {
      const url = new URL(req.url())
      if (url.hostname === "www.instagram.com") return req.respond(html(`<a id="go" href="https://luca.storelib.com/?utm_source=ig&utm_medium=social&utm_campaign=spring">Luca's shop</a>`))
      if (url.hostname === "luca.storelib.com" && url.pathname === "/checkout") {
        /* proxy.ts: a website's /checkout goes to storelib.com, query and all (307). */
        return req.respond({ status: 307, headers: { location: `https://storelib.com/checkout${url.search}` }, body: "" })
      }
      if (url.hostname === "luca.storelib.com") return req.respond(html(doc(`<h1>Luca</h1><a id="buy" href="/checkout?productId=${PRODUCT}&src=website">Buy</a>`, 'data-page="site"')))
      if (url.hostname === "storelib.com" && url.pathname === "/checkout") {
        seen.checkoutUrl = req.url()
        return req.respond(html(doc(`<button id="pay">Pay</button>`, `data-page="checkout" data-creator="${CREATOR}"`)))
      }
      if (url.hostname === "storelib.com" && url.pathname === "/api/checkout/stripe-session") {
        seen.body = req.postData() ?? null
        return req.respond({ status: 200, contentType: "application/json", body: "{}" })
      }
      return req.respond({ status: 404, body: "" })
    })
  }
  if (consent) {
    const at = Math.floor(Date.now() / 1000)
    await context.setCookie({ name: "storelib_consent", value: `2.p1.a1.m1.${at}`, domain: "luca.storelib.com", path: "/", secure: true })
  }
  const idle = (page) => new Promise((r) => page.evaluate(() => new Promise((res) => requestIdleCallback(res, { timeout: 500 }))).then(r, r))
  const stored = (page) => page.evaluate(() => localStorage.getItem("materia_attr_touches"))

  /* 1. From Instagram, by following the link. */
  let page = await context.newPage()
  await serve(page)
  await page.goto("https://www.instagram.com/p/abc", { waitUntil: "load" })
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("#go")])
  await idle(page)
  const referrer = await page.evaluate(() => document.referrer)
  const afterInstagram = await stored(page)

  if (consent) {
    /* 2. A new tab, typed in: a direct visit. */
    await page.close()
    page = await context.newPage()
    await serve(page)
    await page.goto("https://luca.storelib.com/about", { waitUntil: "load" })
    await idle(page)
  }
  const beforeBuy = await stored(page)

  /* 3. Buy. */
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("#buy")])
  await page.waitForFunction(() => "__addressAfterRead" in window)
  const addressAfter = await page.evaluate(() => window.__addressAfterRead)
  /* 4. Pay. */
  await page.click("#pay")
  await page.waitForFunction(() => document.body.dataset.sent === "1")
  await context.close()

  const carried = seen.checkoutUrl ? new URL(seen.checkoutUrl).searchParams.get("sl_at") : null
  const origin = seen.body ? JSON.parse(seen.body).origin : null
  const touches = origin?.touches ? decodeTouches(origin.touches, Date.now()) : null
  return { referrer, afterInstagram, beforeBuy, checkoutUrl: seen.checkoutUrl, carried, addressAfter, origin, touches }
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
try {
  console.log("\nWith analytics consent: Instagram, a direct visit days later, then Buy")
  const a = await run(browser, { consent: true })
  expect("the website saw the referrer", a.referrer === "https://www.instagram.com/", a.referrer)
  expect("the website kept the touch in materia_attr_touches", /"h:luca\.storelib\.com"/.test(a.afterInstagram ?? ""), `${(a.afterInstagram ?? "").length} characters`)
  expect("checkout was reached through the redirect, with sl_at on its address", !!a.carried, a.carried ? `${a.carried.length} characters` : "none")
  expect("checkout took sl_at off its address once read", !!a.addressAfter && !a.addressAfter.includes("sl_at=") && a.addressAfter.includes(`productId=${PRODUCT}`), a.addressAfter)
  expect("the Pay request carries the touches in origin.touches", !!a.touches, a.origin ? Object.keys(a.origin) : null)
  expect("  first touch: Instagram, with the campaign", a.touches?.first?.source === "social_instagram" && a.touches?.first?.utm_campaign === "spring", a.touches?.first)
  expect("  last touch: still Instagram after the direct visit", a.touches?.last?.source === "social_instagram", a.touches?.last?.source)
  expect("  landed on the website, as a website", a.touches?.first?.landing_host === "luca.storelib.com" && a.touches?.first?.property_type === "website")
  expect("the order's source detail still says the website", a.origin?.surface === "website" && a.origin?.site === "luca.storelib.com", { surface: a.origin?.surface, site: a.origin?.site })

  console.log("\nWithout consent: Instagram, then Buy in the same tab")
  const b = await run(browser, { consent: false })
  expect("nothing was written to local storage", b.afterInstagram === null && b.beforeBuy === null, b.beforeBuy)
  expect("the visit still reached the Pay request, from memory", b.touches?.first?.source === "social_instagram", b.touches?.first?.source)
  expect("and was taken off checkout's address", !!b.addressAfter && !b.addressAfter.includes("sl_at="))
} finally {
  await browser.close()
}
console.log(problems === 0 ? "\nall as documented" : `\n${problems} not as documented`)
process.exit(problems === 0 ? 0 : 1)
