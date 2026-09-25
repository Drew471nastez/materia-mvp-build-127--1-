/**
 * ===========================================================================
 *  THE PRODUCT PAGE THE AGENTS LEARN FROM, AND THE WAY BACK FROM CHECKOUT
 * ===========================================================================
 * Two things an AI-built Storelib site now shows a buyer, measured in a real
 * browser at phone and desktop widths:
 *
 *   THE PRODUCT PAGE EXAMPLE (content/developers/examples/product_page.storelib)
 *   rendered by the real engine with `page.product` from the real product
 *   data API. Nothing scrolls sideways; exactly one buy button shows, the
 *   chosen option's, and choosing another option (no script, radio inputs
 *   and :checked) swaps it for that option's checkout link; every option and
 *   the buy button is a 44px target; on a phone the next picture shows at
 *   the edge and a lone picture fills the row; nothing jumps when the
 *   pictures arrive, and they are served late on purpose so they always
 *   arrive after the first paint, as they do on a real connection; on a
 *   wide screen the gallery and the details sit side by side.
 *
 *   THE NOTICE a site shows when checkout brings the buyer back with
 *   ?checkout=paid. It sits 16px in from the edges and above the safe area,
 *   reads at well over 4.5:1, its Close is a 44px target that removes it,
 *   the flag leaves the address at once, and under reduced motion nothing
 *   moves.
 *
 * No build and no server: the section is rendered in Node, the notice is
 * bundled for the browser, both are opened from files.
 *
 *   node scripts/check-agent-commerce.mjs         (SHOTS_DIR=… keeps screenshots)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { extname, join, normalize } from "node:path"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const out = mkdtempSync(join(tmpdir(), "agent-commerce-"))
const shots = process.env.SHOTS_DIR ?? out
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

/* Pages and pictures over http, as a site serves them: the product data API
   passes http(s) picture addresses only, so a file:// page would draw none. */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".svg": "image/svg+xml" }
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "")
  const file = join(out, path)
  if (!file.startsWith(out) || !existsSync(file)) {
    res.writeHead(404)
    res.end()
    return
  }
  const send = () => {
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" })
    res.end(readFileSync(file))
  }
  /* Pictures come 400ms late, so they land after the first paint every run and
     a picture that resizes its row is caught every run, not only on a slow one. */
  if (extname(file) === ".svg") setTimeout(send, 400)
  else send()
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

const empty = join(out, "empty.js")
writeFileSync(empty, "module.exports = {}\n")
const esbuild = (args) => execFileSync(join(root, "node_modules/.bin/esbuild"), args, { cwd: root, stdio: "inherit" })

esbuild(["scripts/render-product-page-probe.ts", "--bundle", "--platform=node", "--format=cjs", "--alias:@=.", `--alias:server-only=${empty}`, `--outfile=${join(out, "render.cjs")}`, "--log-level=error"])
execFileSync(process.execPath, [join(out, "render.cjs")], { cwd: root, env: { ...process.env, OUT_DIR: out, PICTURE_BASE: origin }, stdio: "inherit" })
esbuild(["scripts/render-checkout-return-notice.tsx", "--bundle", "--platform=browser", "--format=iife", "--alias:@=.", "--jsx=automatic", "--define:process.env.NODE_ENV=\"production\"", `--outfile=${join(out, "notice.js")}`, "--log-level=error"])
writeFileSync(
  join(out, "notice.html"),
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;font-family:system-ui,sans-serif}main{padding:24px;min-height:200vh;background:#f5f1ea;color:#222}</style></head><body><main><h1>A creator\'s site</h1><p>The page the buyer bought from.</p></main><div id="root"></div><script src="notice.js"></script></body></html>',
)

const WIDTHS = [360, 390, 430, 1280, 1440, 1920]
const results = []
let problems = 0
const expect = (ok, what) => {
  if (!ok) {
    problems++
    console.log(`  FAIL  ${what}`)
  }
  return ok
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const rgbOf = (s) => (s.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu"] })
try {
  let page = await browser.newPage()
  for (const width of WIDTHS) {
    /**
     * A FRESH PAGE AT EACH WIDTH. A full-page screenshot resizes the
     * viewport and puts it back, and the next load on the same page could
     * start mid-resize and record that as the section shifting.
     */
    await page.close()
    page = await browser.newPage()
    /* Every layout shift from the first paint, however small, summed as CLS counts it. */
    await page.evaluateOnNewDocument(() => {
      window.__cls = 0
      window.__shifted = []
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.hadRecentInput) continue
          window.__cls += e.value
          /* What moved, so a failure names it. */
          for (const s of e.sources || []) {
            const n = s.node
            window.__shifted.push(`${n && n.className ? n.className : n ? n.nodeName : "?"} ${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)} h${Math.round(s.previousRect.height)}->${Math.round(s.currentRect.height)} at ${Math.round(e.startTime)}ms`)
          }
        }
      }).observe({ type: "layout-shift", buffered: true })
    })
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 })
    await page.goto(`${origin}/product-page.html`, { waitUntil: "load" })
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), { timeout: 10_000 }).catch(() => {})
    await new Promise((r) => setTimeout(r, 250))
    const shift = await page.evaluate(() => ({ cls: window.__cls, shifted: window.__shifted, loaded: [...document.images].every((i) => i.complete && i.naturalWidth > 0), pictures: document.images.length }))
    const m = await page.evaluate(() => {
      const vis = (el) => getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0
      const box = (el) => el.getBoundingClientRect()
      const opts = document.querySelector('[data-case="options"]')
      const buys = [...opts.querySelectorAll(".pp__btn")].filter(vis)
      const labels = [...opts.querySelectorAll(".pp__option")]
      const gallery = box(opts.querySelector(".pp__gallery"))
      const info = box(opts.querySelector(".pp__info"))
      const imgs = [...document.querySelectorAll("img")]
      const btn = buys[0]
      const cs = btn ? getComputedStyle(btn) : null
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        visibleBuys: buys.length,
        firstHref: btn ? btn.getAttribute("href") : null,
        labelHeights: labels.map((l) => Math.round(box(l).height)),
        buyHeight: btn ? Math.round(box(btn).height) : 0,
        sideBySide: info.left >= gallery.right - 1,
        imgsSized: imgs.every((i) => i.getAttribute("width") && i.getAttribute("height")),
        imgCount: imgs.length,
        buyColors: cs ? [cs.color, cs.backgroundColor] : null,
        singleBuys: [...document.querySelectorAll('[data-case="single"] .pp__btn')].filter(vis).map((a) => a.getAttribute("href")),
        soldBuys: document.querySelectorAll('[data-case="sold-out"] .pp__btn').length,
        soldTag: document.querySelector('[data-case="sold-out"] .pp__tag')?.textContent?.trim() ?? "",
        h1: Math.round(parseFloat(getComputedStyle(opts.querySelector("h1")).fontSize)),
        /* Share of the row the first picture takes, and the lone picture's. */
        firstShare: box(opts.querySelector(".pp__img")).width / box(opts.querySelector(".pp__track")).width,
        loneShare: box(document.querySelector('[data-case="one-picture"] .pp__img')).width / box(document.querySelector('[data-case="one-picture"] .pp__track')).width,
      }
    })
    await page.click('[data-case="options"] .pp__option:nth-of-type(2)')
    const after = await page.evaluate(() => {
      const opts = document.querySelector('[data-case="options"]')
      const shown = [...opts.querySelectorAll(".pp__btn")].filter((el) => getComputedStyle(el).display !== "none")
      return { count: shown.length, href: shown[0] ? shown[0].getAttribute("href") : null }
    })
    const phone = width < 900
    expect(m.scrollWidth <= m.innerWidth, `${width}: the product page scrolls sideways (${m.scrollWidth} > ${m.innerWidth})`)
    expect(m.visibleBuys === 1 && /variantId=v1/.test(m.firstHref ?? ""), `${width}: one buy button, the first option's (${m.visibleBuys}, ${m.firstHref})`)
    expect(after.count === 1 && /variantId=v2/.test(after.href ?? ""), `${width}: choosing the second option shows its buy button (${after.count}, ${after.href})`)
    expect(m.labelHeights.every((h) => h >= 44) && m.buyHeight >= 44, `${width}: targets under 44px (${m.labelHeights.join(",")} / ${m.buyHeight})`)
    expect(m.imgsSized, `${width}: a picture without its size`)
    expect(shift.pictures >= 10 && shift.loaded, `${width}: the gallery's pictures did not all load (${shift.pictures})`)
    expect(!phone || (m.firstShare > 0.8 && m.firstShare < 0.95), `${width}: on a phone the next picture should show at the edge (first picture takes ${(m.firstShare * 100).toFixed(0)}% of the row)`)
    expect(!phone || m.loneShare > 0.99, `${width}: a lone picture should fill the row (${(m.loneShare * 100).toFixed(0)}%)`)
    expect(shift.cls < 0.01, `${width}: layout shift ${shift.cls.toFixed(4)}: ${shift.shifted.join("; ")}`)
    expect(!phone || m.h1 <= 40, `${width}: the product title is ${m.h1}px on a phone`)
    expect(phone || m.sideBySide, `${width}: gallery and details should sit side by side on a wide screen`)
    expect(m.singleBuys.length === 1 && /productId=p3&src=website$/.test(m.singleBuys[0] ?? ""), `${width}: a product without options has one buy link to its own checkout`)
    expect(m.soldBuys === 0 && m.soldTag === "Sold out", `${width}: sold out shows its tag and no buy button`)
    const contrast = m.buyColors ? ratio(rgbOf(m.buyColors[0]), rgbOf(m.buyColors[1])) : 0
    expect(contrast >= 4.5, `${width}: buy button text contrast ${contrast.toFixed(2)}:1`)
    if (width === 390 || width === 1440) await page.screenshot({ path: join(shots, `product-page-${width}.png`), fullPage: true })
    results.push({ surface: "product page", width, overflow: m.scrollWidth - m.innerWidth, cls: Number(shift.cls.toFixed(4)), buys: m.visibleBuys, swapped: /v2/.test(after.href ?? ""), targets: Math.min(...m.labelHeights, m.buyHeight), contrast: Number(contrast.toFixed(2)), h1: m.h1, first: `${Math.round(m.firstShare * 100)}%`, lone: `${Math.round(m.loneShare * 100)}%`, layout: phone ? "stacked" : m.sideBySide ? "side by side" : "stacked" })
  }

  for (const width of WIDTHS) {
    await page.setViewport({ width, height: 800, deviceScaleFactor: 1 })
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }])
    await page.goto(`${origin}/notice.html?checkout=paid`, { waitUntil: "load" })
    await page.waitForSelector("[data-checkout-return]")
    await new Promise((r) => setTimeout(r, 350))
    const n = await page.evaluate(() => {
      const el = document.querySelector("[data-checkout-return]")
      const b = el.getBoundingClientRect()
      const close = el.querySelector("button").getBoundingClientRect()
      const cs = getComputedStyle(el)
      const p = el.querySelector("p")
      return {
        left: b.left,
        right: window.innerWidth - b.right,
        bottom: window.innerHeight - b.bottom,
        closeW: close.width,
        closeH: close.height,
        role: el.getAttribute("role"),
        search: location.search,
        color: getComputedStyle(p).color,
        bg: cs.backgroundColor,
        transition: cs.transitionProperty,
        opacity: cs.opacity,
      }
    })
    const contrast = ratio(rgbOf(n.color), rgbOf(n.bg))
    expect(n.left >= 15.5 && n.right >= 15.5, `${width}: the notice sits 16px in from the edges (${n.left}, ${n.right})`)
    expect(n.bottom >= 15.5, `${width}: the notice sits 16px above the bottom (${n.bottom})`)
    expect(n.closeW >= 44 && n.closeH >= 44, `${width}: Close is under 44px (${n.closeW}x${n.closeH})`)
    expect(n.role === "status", `${width}: the notice is not announced as a status`)
    expect(!/checkout=paid/.test(n.search), `${width}: the flag stayed in the address`)
    expect(contrast >= 4.5, `${width}: notice text contrast ${contrast.toFixed(2)}:1`)
    expect(/^opacity, transform$|^opacity,transform$/.test(n.transition.replace(/\s+/g, " ").trim()) || n.transition.split(",").every((t) => /opacity|transform/.test(t)), `${width}: the notice animates something other than opacity and transform (${n.transition})`)
    if (width === 390 || width === 1280) await page.screenshot({ path: join(shots, `checkout-return-notice-${width}.png`) })
    await page.click("[data-checkout-return] button")
    const gone = await page.evaluate(() => !document.querySelector("[data-checkout-return]"))
    expect(gone, `${width}: Close did not remove the notice`)
    results.push({ surface: "notice", width, inset: Math.round(Math.min(n.left, n.right)), bottom: Math.round(n.bottom), close: `${Math.round(n.closeW)}x${Math.round(n.closeH)}`, contrast: Number(contrast.toFixed(2)), closes: gone })
  }

  await page.setViewport({ width: 390, height: 800, deviceScaleFactor: 1 })
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await page.goto(`${origin}/notice.html?checkout=paid`, { waitUntil: "load" })
  await page.waitForSelector("[data-checkout-return]")
  const still = await page.evaluate(() => getComputedStyle(document.querySelector("[data-checkout-return]")).transitionDuration)
  expect(/^0s(, 0s)*$/.test(still.replace(/\s+/g, " ")), `under reduced motion the notice still moves (${still})`)
  results.push({ surface: "notice", reducedMotion: still })
} finally {
  await browser.close()
  server.close()
}

console.table(results)
console.log(`screenshots in ${shots}`)
if (problems) fail(`${problems} problem${problems === 1 ? "" : "s"}`)
console.log("\nall measurements pass")
