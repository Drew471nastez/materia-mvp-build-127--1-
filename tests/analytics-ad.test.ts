/**
 * Round AD: Analytics counts every kind of website. An imported theme's
 * pages are tracked like a builder website's (they were not tracked at all),
 * the store's Google Analytics and pixels are on them too and hear product
 * views, add to cart and checkout, a missing column no longer costs a view
 * its page, and the physical sales card follows the page's period.
 *
 *   node scripts/run-push-tests.mjs (registered there)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { runInNewContext } from "node:vm"
import { compatTrackScript, compatTrackingTags } from "@/lib/storelib-theme/compat/track-script"
import { pixelEvent } from "@/lib/analytics/pixels"
import { trackingTags } from "@/lib/store/tracking"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const CREATOR = "11111111-2222-4333-8444-555555555555"
const PRODUCT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

/** A small browser: enough of window and document for the tracker to run, recording what it sends. */
function browser(opts: { consent?: boolean; path?: string; webdriver?: boolean; framed?: boolean; search?: string } = {}) {
  const sent: { path: string; body: Record<string, unknown> }[] = []
  const pixels: unknown[][] = []
  const listeners: Record<string, ((e: unknown) => void)[]> = {}
  const store = new Map<string, string>()
  let cookie = opts.consent ? `storelib_consent=2.p0.a1.m0.${Math.floor(Date.now() / 1000)}` : ""
  const document = {
    readyState: "complete",
    visibilityState: "visible",
    referrer: "https://www.instagram.com/",
    get cookie() {
      return cookie
    },
    set cookie(v: string) {
      const [pair] = v.split(";")
      cookie = cookie ? `${cookie}; ${pair}` : pair
    },
    addEventListener: (t: string, f: (e: unknown) => void) => ((listeners[`d:${t}`] ??= []).push(f)),
    removeEventListener: () => {},
  }
  const location = { href: `https://shop.example${opts.path ?? "/"}${opts.search ?? ""}`, pathname: opts.path ?? "/", search: opts.search ?? "", host: "shop.example", hostname: "shop.example" }
  const win: Record<string, unknown> = {
    document,
    location,
    navigator: { webdriver: !!opts.webdriver, language: "en-GB", sendBeacon: (p: string, b: { text: string }) => (sent.push({ path: p, body: JSON.parse(b.text) }), true) },
    screen: { width: 390, height: 844 },
    innerWidth: 390,
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
    fetch: (p: string, init: { body: string }) => (sent.push({ path: p, body: JSON.parse(init.body) }), Promise.resolve({ ok: true })),
    requestIdleCallback: (f: () => void) => (f(), 1),
    setTimeout: (f: () => void) => (f(), 1),
    clearTimeout: () => {},
    addEventListener: (t: string, f: (e: unknown) => void) => ((listeners[`w:${t}`] ??= []).push(f)),
    gtag: (...a: unknown[]) => pixels.push(a),
    URL,
    URLSearchParams,
    JSON,
    Date,
    Math,
    String,
    RegExp,
    Blob: class {
      text: string
      constructor(parts: string[]) {
        this.text = parts.join("")
      }
    },
  }
  win.window = win
  win.self = win
  win.top = opts.framed ? {} : win
  return { win, sent, pixels, listeners }
}
function run(b: ReturnType<typeof browser>, productId: string | null = null) {
  const html = compatTrackScript({ creatorId: CREATOR, productId, mainDomain: "storelib.com" })
  const js = html.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "")
  runInNewContext(js, b.win)
}

console.log("\nAn imported theme's pages are counted\n")
{
  const b = browser({ consent: true, path: "/products/mug" })
  run(b, PRODUCT)
  const view = b.sent.find((s) => s.path === "/api/track-view")
  check("a page view goes to /api/track-view, with the creator, the product and the page", !!view && view.body.creatorId === CREATOR && view.body.productId === PRODUCT && view.body.href === "https://shop.example/products/mug", view)
  check("  where the visit came from, and the device", view?.body.referrerDomain === "instagram.com" && view?.body.deviceType === "mobile" && view?.body.screenWidth === 390, view)
  check("  with consent, the visit's and the browser's ids", typeof view?.body.sessionId === "string" && typeof view?.body.visitorId === "string")
  check("  and the store's Google Analytics hears view_item", b.pixels.some((p) => p[0] === "event" && p[1] === "view_item"), b.pixels)
  run(b, PRODUCT)
  check("the same page again in this tab is not a second view", b.sent.filter((s) => s.path === "/api/track-view").length === 1)

  const submit = b.listeners["d:submit"]?.[0]
  submit?.({ target: { getAttribute: (n: string) => (n === "action" ? "/cart/add" : null) } })
  submit?.({ target: { getAttribute: (n: string) => (n === "action" ? "/cart/add" : null) } })
  const adds = b.sent.filter((s) => s.path === "/api/track-event" && s.body.eventType === "buy_click")
  check("Add to cart is a buy_click for the product, once per page", adds.length === 1 && adds[0].body.productId === PRODUCT, adds)
  check("  and add_to_cart in Google Analytics", b.pixels.some((p) => p[1] === "add_to_cart"))
}
{
  const b = browser({ consent: false })
  run(b)
  const view = b.sent.find((s) => s.path === "/api/track-view")
  check("without consent the view still counts, with no ids and no cookies", !!view && view.body.sessionId === undefined && view.body.visitorId === undefined && !/sl_asid|materia_visitor/.test(String((b.win.document as { cookie: string }).cookie)), view)
}
{
  const robot = browser({ webdriver: true })
  run(robot)
  const framed = browser({ framed: true })
  run(framed)
  const preview = browser({ search: "?preview=abc" })
  run(preview)
  check("never a script-driven browser, a page in a frame (the editor), or a preview", robot.sent.length === 0 && framed.sent.length === 0 && preview.sent.length === 0)
}
check("a creator id that is not one writes nothing", compatTrackScript({ creatorId: "x", mainDomain: "storelib.com" }) === "")

console.log("\nThe store's own analytics on an imported theme\n")
{
  const tags = compatTrackingTags(trackingTags({ ga4: "G-ABC123DEF4" }))
  check("Google Analytics' tag, as on a builder website", /<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-ABC123DEF4"/.test(tags) && /gtag\('config',"G-ABC123DEF4"\)/.test(tags), tags)
  const route = read("app/api/site-theme/site/[username]/[[...path]]/route.ts")
  /* Round 25 (G25): the tags are built in lib/store/compat-page-tags.ts, so the route and the probe put the same string on the page. */
  const pageTags = read("lib/store/compat-page-tags.ts")
  check("  put on every live page of an imported theme, never a preview", /if \(html && !token && page && out\.status === 200/.test(route) && /* Round 25 (V25): the product's id from the lists already held. */ /compatPageTags\(\{ stored, creatorId: found\.site\.creatorId, productId, named/.test(route) && /compatTrackScript\(\{ creatorId: input\.creatorId, productId: input\.productId/.test(pageTags))
  const calls: unknown[][] = []
  pixelEvent({ gtag: (...a: unknown[]) => calls.push(a), fbq: (...a: unknown[]) => calls.push(["fb", ...a]) } as unknown as Window, "begin_checkout", PRODUCT)
  check("each step by the name each service knows: GA4 begin_checkout, Meta InitiateCheckout", calls.some((c) => c[1] === "begin_checkout") && calls.some((c) => c[0] === "fb" && c[2] === "InitiateCheckout"), calls)
  check("builder websites tell them too: Buy is add_to_cart, checkout is begin_checkout, a product page view_item", /pixelEvent\(window, eventType === "buy_click" \? "add_to_cart" : "begin_checkout", productId\)/.test(read("lib/analytics-utils.ts")) && /pixelEvent\(window, "view_item", productId\)/.test(read("components/analytics/track-view.tsx")))
}

console.log("\nEvery view keeps its page\n")
{
  const collect = read("lib/analytics/collect.ts")
  check("a column the database lacks is left out alone, the page and the place kept", /for \(let tries = 0; error && missingColumn\(error\) && tries < 3; tries\+\+\)/.test(collect) && /NEW_COLUMNS as readonly string\[\]\)\.includes\(col\)\) break/.test(collect))
  check("an older view with no page reads Page unknown, not as an error", /"Page unknown"/.test(read("lib/analytics/reports.ts")) && !/Page not recorded/.test(read("lib/analytics/reports.ts")))
}

console.log("\nPhysical sales follow the page\n")
{
  const card = read("components/physical/analytics-card.tsx")
  check("the card asks for the page's period, and has no range of its own", /from=\$\{Math\.floor\(span\.start\)\}&to=\$\{Math\.ceil\(span\.end\)\}/.test(card) && !/\[7, 30, 90\]/.test(card) && /<PhysicalAnalyticsCard span=\{safeSpan\} \/>/.test(read("app/app/analytics/analytics-client.tsx")))
  check("  no grey blocks while loading: the figures stay, softened", !/animate-pulse/.test(card) && /opacity-60 blur-\[1px\]/.test(card))
  check("  the API and the query take the period's end", /new Date\(to\)\.toISOString\(\)/.test(read("app/api/physical/analytics/route.ts")) && /if \(untilIso\) paid = paid\.lt\("paid_at", untilIso\)/.test(read("lib/physical/analytics-server.ts")))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
