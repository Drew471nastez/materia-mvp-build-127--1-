/**
 * ===========================================================================
 *  HOW LONG A CHECKOUT TAKES TO BE PAYABLE, ON A PHONE AND ON A DESKTOP
 * ===========================================================================
 * Loads each checkout address in Chromium, a fresh profile every time (a
 * first visit, nothing cached), and prints what a buyer waits for:
 *
 *   ttfb      the first byte of the document
 *   fcp       first contentful paint
 *   lcp       the browser's largest contentful paint
 *   shell     the checkout's own content on screen (the order summary or the
 *             form, not the streamed frame in front of it)
 *   price     the first amount of money written on the page (the order
 *             summary priced)
 *   stripeAsked  when the page asked for Stripe.js (its request started)
 *   stripeJs  Stripe.js arrived (the response ended)
 *   mounted   the page handed Stripe its card form (the form's frame asked for):
 *             everything before it is this page's own scripts and Stripe.js
 *   frame     Stripe's card form frame drawn taller than its loader
 *   ready     the payment form can take a card: the page's own
 *             data-payment-ready (Stripe's onReady), else `frame` on a
 *             build from before that attribute
 *   js        script files and their bytes over the wire, first party and
 *             Stripe's apart
 *
 * Phone: 390 by 844, CPU four times slower, 10 Mbps down, 40ms round trip.
 * Desktop: 1440 by 900, the machine's own speed and network.
 *
 *   node scripts/check-checkout-speed.mjs <url> [<url> ...]
 *   RUNS=3 node scripts/check-checkout-speed.mjs <url>        (median of 3)
 *   ONLY=phone node scripts/check-checkout-speed.mjs <url>
 *   AB=1 node scripts/check-checkout-speed.mjs <url>           (live HTML against the same
 *                                                              HTML with Stripe's hints)
 *   AB=1 ARMS=A,B,C ...                                         (C: also the router's reads
 *                                                              ahead held back, as the card
 *                                                              form now holds them)
 *   FORM=0 node scripts/check-checkout-speed.mjs <url>         (a page with no card form
 *                                                              before Pay: waits for the price)
 *
 * Read only: it never types a card or presses Pay.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const URLS = process.argv.slice(2)
const RUNS = Number(process.env.RUNS || 1)
if (!URLS.length) {
  console.log("usage: node scripts/check-checkout-speed.mjs <checkout url> [...]")
  process.exit(1)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function reachabilityFlags() {
  const flags = []
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  if (!proxy) return flags
  flags.push(`--proxy-server=${proxy}`)
  for (const ca of ["/root/.ccr/agent-proxy-ca.crt", "/root/.ccr/ca-bundle.crt"]) {
    if (!existsSync(ca)) continue
    try {
      const pem = execFileSync("openssl", ["x509", "-in", ca, "-pubkey", "-noout"], { encoding: "buffer" })
      const spki = createHash("sha256").update(execFileSync("openssl", ["pkey", "-pubin", "-outform", "der"], { input: pem })).digest("base64")
      flags.push(`--ignore-certificate-errors-spki-list=${spki}`)
      break
    } catch {
      /* The run fails loudly instead. */
    }
  }
  return flags
}

const PROFILES = {
  phone: {
    viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    network: { offline: false, latency: 40, downloadThroughput: (10 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8 },
    cpu: 4,
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  },
  desktop: { viewport: { width: 1440, height: 900, deviceScaleFactor: 1 }, network: null, cpu: 1, ua: null },
}

/* Watches the page from its first frame: paints, the checkout's own content, the card form. */
function watch() {
  window.__m = { fcp: 0, lcp: 0, shell: 0, price: 0, iframeTall: 0, ready: 0, cls: 0 }
  const m = window.__m
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) m.lcp = e.startTime }).observe({ type: "largest-contentful-paint", buffered: true })
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") m.fcp = e.startTime }).observe({ type: "paint", buffered: true })
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) m.cls += e.value }).observe({ type: "layout-shift", buffered: true })
  } catch {
    /* An old engine: those stay 0. */
  }
  const tick = () => {
    const now = performance.now()
    if (!m.shell) {
      const page = document.querySelector('[data-page="checkout"]:not([data-checkout-loading]):not([data-checkout-skeleton])')
      if (page && page.getBoundingClientRect().height > 200 && page.querySelector("h1, h2, button")) m.shell = now
    }
    if (!m.price && document.body) {
      const page = document.querySelector('[data-page="checkout"]:not([data-checkout-loading]):not([data-checkout-skeleton]), [data-physical-checkout]') || document.body
      if (/(\$|€|£|lei|RON|USD|EUR)\s?\d|\d[.,]\d\d\s?(\$|€|£|lei)/.test(page.innerText || "")) m.price = now
    }
    if (!m.iframeTall) {
      const f = [...document.querySelectorAll('iframe[name^="__privateStripeFrame"]')].find((x) => !/loader|controller/.test(x.src.split("#")[0]) && x.getBoundingClientRect().height > 100)
      if (f) m.iframeTall = now
    }
    if (!m.ready && document.querySelector("[data-payment-ready]")) m.ready = now
    if (m.ready && m.shell && m.price) return
    if (now > 60000) return
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", ...reachabilityFlags()] })

/*
  AB=1: THE LIVE PAGE AGAINST THE SAME PAGE WITH STRIPE IN ITS HEAD. The
  document is fetched once and served to both arms from memory, so the
  server's time is the same in both; arm B is that HTML with exactly the
  hints app/checkout/parts/stripe-early.ts makes React write at the top of
  <head>. Everything else goes to the network through the same throttling.
  It measures the browser side of the change before it is deployed.
*/
const HINTS =
  '<link rel="preconnect" href="https://js.stripe.com"/><link rel="preconnect" href="https://api.stripe.com" crossorigin=""/><link rel="preconnect" href="https://m.stripe.network"/><link rel="preload" href="https://js.stripe.com/clover/stripe.js" as="script"/>'
const documents = new Map()
async function documentOf(url) {
  if (!documents.has(url)) documents.set(url, await (await fetch(url)).text())
  return documents.get(url)
}

async function measure(url, profile, arm = null) {
  const ctx = await browser.createBrowserContext()
  const p = await ctx.newPage()
  if (arm) {
    const live = await documentOf(url)
    const body = arm === "A" ? live : live.replace(/<head>/, `<head>${HINTS}`)
    await p.setRequestInterception(true)
    p.on("request", (req) => {
      if (req.resourceType() === "document" && req.url() === url) return req.respond({ status: 200, contentType: "text/html; charset=utf-8", body })
      /* Arm C: the router's reads ahead held back, as the deployed checkout now holds them until the card form is ready. */
      if (arm === "C" && req.headers()["next-router-prefetch"]) return req.abort()
      req.continue()
    })
  }
  await p.setViewport(profile.viewport)
  if (profile.ua) await p.setUserAgent(profile.ua)
  const cdp = await p.createCDPSession()
  await cdp.send("Network.enable")
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true })
  if (profile.network) await cdp.send("Network.emulateNetworkConditions", profile.network)
  if (profile.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu })
  await p.evaluateOnNewDocument(watch)
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 }).catch((e) => console.log("  goto:", e.message))
  if (process.env.FORM === "0") await p.waitForFunction(() => window.__m && window.__m.price > 0, { timeout: 45_000, polling: 100 }).catch(() => {})
  else await p.waitForFunction(() => window.__m && (window.__m.ready || window.__m.iframeTall), { timeout: 45_000, polling: 100 }).catch(() => {})
  await sleep(1500)
  const r = await p.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0]
    const res = performance.getEntriesByType("resource")
    const js = res.filter((x) => x.initiatorType === "script" || /\.js(\?|$)/.test(x.name))
    const mine = js.filter((x) => x.name.startsWith(location.origin))
    const stripe = js.filter((x) => /stripe\.(com|network)/.test(x.name))
    const kb = (list) => Math.round(list.reduce((s, x) => s + (x.transferSize || x.encodedBodySize || 0), 0) / 1024)
    const m = window.__m
    const stripeJsAt = res.find((x) => /js\.stripe\.com\/(v3\/?|[a-z]+\/stripe\.js)(\?|$)/.test(x.name))
    const stripeJs = stripeJsAt ? Math.round(stripeJsAt.responseEnd) : 0
    const stripeAsked = stripeJsAt ? Math.round(stripeJsAt.startTime) : 0
    const frame = Math.round(m.iframeTall)
    const startOf = (re) => {
      const e = res.find((x) => re.test(x.name))
      return e ? Math.round(e.startTime) : 0
    }
    const ready = m.ready ? Math.round(m.ready) : frame
    return {
      ttfb: Math.round(n.responseStart),
      fcp: Math.round(m.fcp),
      lcp: Math.round(m.lcp),
      shell: Math.round(m.shell),
      price: Math.round(m.price),
      stripeAsked,
      stripeJs,
      mounted: startOf(/js\.stripe\.com\/v3\/elements-inner-(accessory|payment)/),
      frame,
      ready,
      readySignal: m.ready ? "page" : ready ? "frame" : "none",
      cls: Number(m.cls.toFixed(3)),
      doc: Math.round((n.transferSize || n.encodedBodySize || 0) / 1024),
      js: `${mine.length} files ${kb(mine)}kB`,
      stripe: `${stripe.length} files ${kb(stripe)}kB`,
      requests: res.length,
    }
  })
  if (process.env.DEBUG) {
    console.log(await p.evaluate(() => JSON.stringify({
      stripe: performance.getEntriesByType("resource").filter((x) => /stripe/.test(x.name)).map((x) => `${Math.round(x.startTime)}-${Math.round(x.responseEnd)} ${x.name.slice(0, 110)}`),
      scripts: performance.getEntriesByType("resource").filter((x) => /\.js(\?|$)/.test(x.name) && x.name.startsWith(location.origin)).sort((x, y) => (y.transferSize || 0) - (x.transferSize || 0)).slice(0, 40).map((x) => `${Math.round((x.transferSize || 0) / 1024)}kB @${Math.round(x.startTime)} ${x.initiatorType} ${x.name.split("/").pop().slice(0, 40)}`),
      frames: [...document.querySelectorAll("iframe")].map((f) => `${f.name.slice(0, 30)} ${Math.round(f.getBoundingClientRect().height)} ${f.src.slice(0, 90)}`),
    }, null, 1)))
  }
  await ctx.close()
  return r
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

for (const url of URLS) {
  console.log(`\n${url}`)
  for (const [name, profile] of Object.entries(PROFILES)) {
    if (process.env.ONLY && process.env.ONLY !== name) continue
    const keys = ["ttfb", "fcp", "lcp", "shell", "price", "stripeAsked", "stripeJs", "mounted", "frame", "ready", "cls", "requests"]
    for (const arm of process.env.AB === "1" ? (process.env.ARMS || "A,B").split(",") : [null]) {
      const runs = []
      for (let i = 0; i < RUNS; i++) runs.push(await measure(url, profile, arm))
      const out = { ...runs[runs.length - 1] }
      if (RUNS > 1) for (const k of keys) out[k] = median(runs.map((r) => r[k]))
      const label = { A: "live        ", B: "with hints  ", C: "hints, no ahead" }[arm] ?? ""
      console.log(`  ${name.padEnd(7)}${arm ? ` ${label}` : ""} ${JSON.stringify(out)}`)
    }
  }
}
await browser.close()
