/**
 * ===========================================================================
 *  AN IMPORTED THEME'S SCRIPTS, DEFERRED: SAME ORDER, SAME PAGE, SOONER
 * ===========================================================================
 * lib/storelib-theme/compat/script-order.ts rewrites a live page's blocking
 * theme scripts to run deferred, in the order they would have run, and
 * starts app widgets after load. This runs both versions in Chromium and
 * measures, instead of trusting the rule:
 *
 *   ORDER    an older theme's page (jQuery blocking in the head, inline
 *            settings, inline $(…) calls in the body, vendor and theme
 *            scripts blocking at the end): the order every script ran in,
 *            and that each found what it needed (window.$, window.theme,
 *            its own section, a $(fn) callback the vendor script's plugin),
 *            before and after. Must be identical. jQuery here answers $(fn)
 *            the way jQuery 3 does: at DOMContentLoaded while the page says
 *            it is loading, else on the next turn.
 *   SOONER   the same page with jQuery taking 600ms to arrive: first
 *            contentful paint before and after (a blocking script in the head
 *            holds the first paint until it has run).
 *   LATER    an async reviews widget: when it ran, against the load event.
 *   PAGES    with addresses given (`-- <a> <b>` pairs, for example a saved
 *            live page and its rewritten copy served side by side), the same
 *            visitor actions on each, a phone and a desktop: script errors,
 *            the drawers and dialogs a header button opens, a details or
 *            accordion opened, sliders started, the cart asked by Add to
 *            cart. Each must match. (Computed styles are compared element
 *            by element by the round's samestyle probe.)
 *
 *   npx tsx scripts/check-imported-scripts.ts
 *   npx tsx scripts/check-imported-scripts.ts -- http://localhost:4120/ http://localhost:4120/x
 *
 * It prints what it measured and says FAIL for any difference.
 */
import { createServer } from "node:http"
import puppeteer, { type Browser, type Page } from "puppeteer-core"
import { calmerScripts } from "../lib/storelib-theme/compat/script-order"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
let failures = 0
const say = (ok: boolean, line: string) => {
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${line}`)
}

/* The page an older theme writes: every script blocking, each recording that it ran and what it found. */
const OLD = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Old theme</title>
<script data-storelib-head>window.__order=[];window.Shopify={shop:"x"};window.__order.push("storelib-head")</script>
<script src="/jquery.js"></script>
<script>window.__order.push("settings:"+(typeof $));window.theme={strings:{add:"Add"}}</script>
<style>body{font:16px sans-serif;margin:0}header{padding:20px;background:#eee}.ready{outline:1px solid red}</style>
</head><body>
<header><h1>Store</h1></header>
<main><p>Lots of products.</p>
<div id="shopify-section-a"><p>A</p><script>(function(){var el=document.getElementById("shopify-section-a");window.__order.push("section-a:"+!!el);$(function(){window.__order.push("ready-a:"+typeof window.slider)})})()</script></div>
<script>$(".x");window.__order.push("inline-uses-$")</script>
</main>
<script src="/vendor.js"></script>
<script src="/theme.js"></script>
<script>window.__order.push("after-theme:"+(window.themeBooted===true))</script>
<script async src="https://cdn.judge.me/widget_preloader.js"></script>
<script data-storelib-track>window.__order.push("track")</script>
</body></html>`

const FILES: Record<string, string> = {
  "/jquery.js": `window.__order.push("jquery:parsed-nodes="+document.getElementsByTagName("*").length);window.$=function(f){if(typeof f==="function"){if(document.readyState==="complete"||document.readyState!=="loading")setTimeout(f);else document.addEventListener("DOMContentLoaded",f)}return{}};`,
  "/vendor.js": `window.__order.push("vendor:"+(typeof $));window.slider=function(){}`,
  "/theme.js": `window.__order.push("theme:"+(window.theme&&window.theme.strings.add));window.themeBooted=true;document.addEventListener("DOMContentLoaded",function(){window.__order.push("theme-dcl")})`,
}

function serve(pages: Record<string, string>, slowJquery: number): Promise<{ origin: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = (req.url ?? "/").split("?")[0]
      const send = (type: string, body: string) => {
        res.writeHead(200, { "content-type": type, "cache-control": "no-store" })
        res.end(body)
      }
      if (pages[path]) return send("text/html; charset=utf-8", pages[path])
      if (FILES[path]) {
        if (path === "/jquery.js" && slowJquery) return void setTimeout(() => send("text/javascript", FILES[path]), slowJquery)
        return send("text/javascript", FILES[path])
      }
      res.writeHead(404)
      res.end()
    })
    server.listen(0, () => {
      const a = server.address()
      resolve({ origin: `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`, close: () => server.close() })
    })
  })
}

async function open(browser: Browser, url: string): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(String(e instanceof Error ? e.message : e)))
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    if (r.url().startsWith("https://cdn.judge.me/")) return void r.respond({ status: 200, contentType: "text/javascript", body: `window.__order.push("widget");window.__widgetAt=performance.now()` })
    void r.continue()
  })
  await page.goto(url, { waitUntil: "load" })
  await new Promise((r) => setTimeout(r, 1200))
  return { page, errors }
}

async function order(browser: Browser) {
  console.log("\nOrder: an older theme's page, as written and as rewritten")
  const plan = calmerScripts(OLD)
  const { origin, close } = await serve({ "/old": OLD, "/new": plan.html }, 0)
  const a = await open(browser, `${origin}/old`)
  const b = await open(browser, `${origin}/new`)
  const run = async (p: Page) => (await p.evaluate(() => (window as unknown as { __order: string[] }).__order)).map((s) => s.replace(/parsed-nodes=\d+/, "parsed-nodes"))
  const [ra, rb] = [await run(a.page), await run(b.page)]
  console.log(`    rewritten: ${plan.deferred} deferred, ${plan.queued} inline queued, ${plan.later} app script started later`)
  console.log(`    as written: ${ra.join(", ")}`)
  console.log(`    rewritten:  ${rb.join(", ")}`)
  const noWidget = (xs: string[]) => xs.filter((x) => x !== "widget" && x !== "track")
  say(JSON.stringify(noWidget(ra)) === JSON.stringify(noWidget(rb)), "every theme script ran in the same order and found what it needed")
  say(rb.includes("settings:function") && rb.includes("vendor:function") && rb.includes("theme:Add") && rb.includes("after-theme:true") && rb.includes("section-a:true") && rb.includes("ready-a:function"), "jQuery before its callers, a ready callback after the plugin it calls, the settings before the theme, each section script with its section")
  say(!a.errors.length && !b.errors.length, `no script errors (${a.errors.length} as written, ${b.errors.length} rewritten)`)
  const nodes = async (p: Page) => {
    const line = await p.evaluate(() => (window as unknown as { __order: string[] }).__order.find((s) => s.startsWith("jquery:")) ?? "")
    return Number(line.split("=")[1])
  }
  const [na, nb] = [await nodes(a.page), await nodes(b.page)]
  say(nb > na, `the parser is no longer held: jQuery ran with ${na} elements read as written, ${nb} rewritten`)
  const widget = await b.page.evaluate(() => ({ at: (window as unknown as { __widgetAt?: number }).__widgetAt ?? -1, load: (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).loadEventEnd }))
  say(widget.at > widget.load, `the reviews widget started after the load event (${Math.round(widget.at)}ms, load ${Math.round(widget.load)}ms)`)
  await a.page.close()
  await b.page.close()
  close()
}

async function sooner(browser: Browser) {
  console.log("\nSooner: the same page with jQuery taking 600ms to arrive")
  const plan = calmerScripts(OLD)
  const { origin, close } = await serve({ "/old": OLD, "/new": plan.html }, 600)
  const fcp = async (url: string) => {
    const { page } = await open(browser, url)
    const v = await page.evaluate(() => Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? -1))
    await page.close()
    return v
  }
  const runs = { old: [] as number[], new: [] as number[] }
  for (let i = 0; i < 3; i++) {
    runs.old.push(await fcp(`${origin}/old`))
    runs.new.push(await fcp(`${origin}/new`))
  }
  const med = (xs: number[]) => [...xs].sort((x, y) => x - y)[1]
  console.log(`    first contentful paint, median of 3: as written ${med(runs.old)}ms (${runs.old.join(", ")}), rewritten ${med(runs.new)}ms (${runs.new.join(", ")})`)
  say(med(runs.new) < med(runs.old) - 300, "the first paint no longer waits for a blocking script")
  close()
}

/* What a visitor can do, as numbers that must be the same on both pages. */
async function signature(browser: Browser, url: string, width: number) {
  const page = await browser.newPage()
  await page.setViewport({ width, height: 900, isMobile: width < 600, hasTouch: width < 600 })
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(String(e instanceof Error ? e.message : e).slice(0, 120)))
  const asked: string[] = []
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (/^\/cart\/(add|change|update)/.test(u.pathname) && r.method() === "POST") {
      asked.push(`POST ${u.pathname}`)
      return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], item_count: 1, sections: {} }) })
    }
    if (/^\/search\/suggest/.test(u.pathname)) asked.push("GET /search/suggest")
    void r.continue()
  })
  await page.goto(url, { waitUntil: "load", timeout: 120000 })
  await new Promise((r) => setTimeout(r, 2500))
  const visible = () => page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0 }).length)
  const out: Record<string, unknown> = {}
  out.sliders = await page.evaluate(() => document.querySelectorAll(".swiper-initialized, .swiper-container-initialized, .slick-initialized, .flickity-enabled").length)
  out.visibleAtRest = await visible()
  /* The header's buttons that open something (a menu, the cart, search, the country list), one at a time, closed again by Escape and a reload. */
  const buttons = await page.evaluate(() => [...document.querySelectorAll("header button, header [role=button], header summary, header a[href='/cart'], header a[href*='search'], .header button, [id*=header] summary, [id*=header] button")].map((e, i) => { (e as HTMLElement).dataset.slProbe = String(i); const r = e.getBoundingClientRect(); return { i, ok: r.width > 0 && r.height > 0, label: (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 30) } }).filter((b) => b.ok).slice(0, 6))
  const opened: string[] = []
  for (const b of buttons) {
    const before = await visible()
    await page.click(`[data-sl-probe="${b.i}"]`).catch(() => {})
    await new Promise((r) => setTimeout(r, 900))
    const after = await visible()
    const dialogs = await page.evaluate(() => [...document.querySelectorAll("[role=dialog], dialog[open], details[open], [aria-expanded=true], .is-open, .active, .open")].filter((e) => e.getBoundingClientRect().height > 0).length)
    opened.push(`${b.label}: ${after - before >= 0 ? "+" : ""}${after - before} shown, ${dialogs} open`)
    await page.keyboard.press("Escape").catch(() => {})
    await page.reload({ waitUntil: "load" }).catch(() => {})
    await new Promise((r) => setTimeout(r, 1500))
    await page.evaluate(() => [...document.querySelectorAll("header button, header [role=button], header summary, header a[href='/cart'], header a[href*='search'], .header button, [id*=header] summary, [id*=header] button")].forEach((e, i) => { (e as HTMLElement).dataset.slProbe = String(i) }))
  }
  out.header = opened
  /* A details or accordion in the page, opened. */
  out.accordion = await page.evaluate(() => {
    const s = [...document.querySelectorAll("main summary, main [aria-expanded=false], .collapsible-trigger, [data-accordion] button")].find((e) => e.getBoundingClientRect().height > 0) as HTMLElement | undefined
    if (!s) return "none on the page"
    s.click()
    return "clicked"
  })
  await new Promise((r) => setTimeout(r, 700))
  out.accordionOpen = await page.evaluate(() => document.querySelectorAll("main details[open], main [aria-expanded=true]").length)
  /* Add to cart on the first product form. */
  out.addToCart = await page.evaluate(() => {
    const b = document.querySelector("form[action*='/cart/add'] [type=submit], form[action*='/cart/add'] button[name=add]") as HTMLElement | null
    if (!b) return "no product form"
    b.scrollIntoView()
    b.click()
    return "clicked"
  })
  await new Promise((r) => setTimeout(r, 1500))
  out.asked = [...new Set(asked)]
  out.visibleAfterAdd = await visible()
  out.errors = errors.length
  await page.close()
  return out
}

async function pages(browser: Browser, pairs: [string, string][]) {
  for (const [a, b] of pairs) {
    for (const width of [390, 1440]) {
      console.log(`\nPages at ${width}px: ${a}  vs  ${b}`)
      const [x, y] = [await signature(browser, a, width), await signature(browser, b, width)]
      for (const k of Object.keys(x)) {
        const same = JSON.stringify(x[k]) === JSON.stringify(y[k])
        /* A count of visible elements can move by a few with an animation caught mid way; the actions themselves must match. */
        const close = typeof x[k] === "number" && typeof y[k] === "number" && k.startsWith("visible") && Math.abs((x[k] as number) - (y[k] as number)) <= 3
        say(same || close, `${k}: ${JSON.stringify(x[k])}${same ? "" : `  vs  ${JSON.stringify(y[k])}`}`)
      }
    }
  }
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
  try {
    await order(browser)
    await sooner(browser)
    const rest = process.argv.slice(process.argv.indexOf("--") + 1)
    if (process.argv.includes("--") && rest.length >= 2) {
      const pairs: [string, string][] = []
      for (let i = 0; i + 1 < rest.length; i += 2) pairs.push([rest[i], rest[i + 1]])
      await pages(browser, pairs)
    }
  } finally {
    await browser.close()
  }
  console.log(failures ? `\n${failures} FAILED` : "\nall measured the same")
  process.exit(failures ? 1 : 0)
}

void main()
