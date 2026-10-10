/**
 * ===========================================================================
 *  MOVING BETWEEN A LIVE SITE'S PAGES: FETCHED AHEAD, NO FLASH
 * ===========================================================================
 *   npx tsx scripts/check-live-navigation.ts
 *
 * Two pages of a site carrying the prefetch rules
 * (lib/website-builder/prefetch-rules.ts) and the cross-fade
 * (lib/website-builder/live-navigation.ts), as an imported theme's live
 * pages and a Storelib site's do, in Chromium:
 *
 *   AHEAD     resting the pointer on a link fetches its page before the
 *             click (a request marked Sec-Purpose: prefetch), and the click
 *             then asks the server for nothing more
 *   NEVER     a link to the cart, checkout or an account page is never
 *             fetched ahead
 *   NO FLASH  arriving on the next page starts a view transition: the page
 *             left stays on screen until the next is drawn
 *   CALM      with reduced motion asked for, there is no transition
 *
 * Exits 1 on any failure.
 */
import { createServer } from "node:http"
import puppeteer from "puppeteer-core"
import { liveNavigationMarkup } from "../lib/website-builder/live-navigation"
import { SITE_PREFETCH_RULES } from "../lib/website-builder/prefetch-rules"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail === undefined ? "" : `  (${JSON.stringify(detail)})`}`)
}

const page = (title: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><script type="speculationrules">${JSON.stringify(SITE_PREFETCH_RULES)}</script>${liveNavigationMarkup()}
<script>addEventListener("pagereveal", (e) => { window.__revealed = { transition: !!e.viewTransition } })</script></head>
<body style="margin:0;font:16px system-ui"><header style="height:64px;background:#1a1a2e;color:#fff;display:flex;align-items:center;padding:0 20px">Shop</header>
<nav style="padding:20px;display:flex;gap:24px"><a id="about" href="/about">About</a><a id="shop" href="/collections/all">Shop</a><a id="cart" href="/cart">Cart</a><a id="account" href="/account">Account</a></nav><h1 style="padding:0 20px">${title}</h1></body></html>`

const requests: { path: string; purpose: string }[] = []
const server = createServer((req, res) => {
  requests.push({ path: req.url ?? "", purpose: String(req.headers["sec-purpose"] ?? "") })
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-cache" })
  res.end(page(req.url === "/" ? "Home" : `Page ${req.url}`))
})

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
  try {
    const p = await browser.newPage()
    const warnings: string[] = []
    p.on("console", (m) => { if (/speculation|rule/i.test(m.text())) warnings.push(m.text()) })
    await p.setViewport({ width: 1280, height: 800 })
    await p.goto(`${origin}/`, { waitUntil: "load" })
    await sleep(300)

    const at = async (id: string) => p.evaluate((id) => { const r = document.getElementById(id)!.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, id)
    /* Resting on the cart and the account link first: neither may be fetched. */
    for (const id of ["cart", "account"]) { const c = await at(id); await p.mouse.move(c.x, c.y); await sleep(600) }
    check("a link to the cart or an account page is never fetched ahead", !requests.some((r) => /^\/(cart|account)/.test(r.path)), requests)
    const c = await at("about")
    await p.mouse.move(c.x, c.y)
    await sleep(700)
    const ahead = requests.filter((r) => r.path === "/about")
    check("resting the pointer on a link fetches its page ahead", ahead.length === 1 && /prefetch/.test(ahead[0].purpose), ahead)
    check("the rules are read without complaint", warnings.length === 0, warnings)
    await p.mouse.click(c.x, c.y)
    await p.waitForFunction(() => location.pathname === "/about" && document.readyState === "complete", { timeout: 10_000 })
    await sleep(400)
    check("the click asks the server for nothing more", requests.filter((r) => r.path === "/about").length === 1, requests.filter((r) => r.path === "/about"))
    const revealed = await p.evaluate(() => (window as unknown as { __revealed?: { transition: boolean } }).__revealed ?? null)
    check("arriving starts a view transition, so the page left stays until this one is drawn", revealed?.transition === true, revealed)

    await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    const s = await at("shop")
    await p.mouse.click(s.x, s.y)
    await p.waitForFunction(() => location.pathname === "/collections/all" && document.readyState === "complete", { timeout: 10_000 })
    await sleep(400)
    const calm = await p.evaluate(() => (window as unknown as { __revealed?: { transition: boolean } }).__revealed ?? null)
    check("with reduced motion asked for, there is no transition", calm?.transition === false, calm)
  } finally {
    await browser.close()
    server.close()
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
