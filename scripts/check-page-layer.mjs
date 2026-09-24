/**
 * ===========================================================================
 *  A PAGE OVER THE WHOLE SHELL: NOTHING OF THE HEADER, AT 390 AND 1440
 * ===========================================================================
 * "The black top bar overlaps the actual page; fix it fully." and "The edit
 * or add product page should be full screen, on iOS, Android, browser,
 * Capacitor, all: the top black bar must not be visible."
 *
 * The plans page and the product editor (new and saved) through their real
 * layouts (components/app/page-layer.tsx), in a shell shaped like
 * app/app/layout.tsx (scripts/render-page-layer.tsx), with a real safe-area
 * inset: Chromium's own override, so env(safe-area-inset-top) is 47px and
 * env(safe-area-inset-bottom) 34px, as on an iPhone with a Dynamic Island.
 *
 * Each page is measured twice: as Chromium draws it, and as WebKit on iOS
 * does. WebKit makes any element with `-webkit-overflow-scrolling: touch` a
 * stacking context, which Chromium does not; the second pass reproduces that
 * by rewriting the property in the real stylesheet to `isolation: isolate`
 * (and `auto` to `auto`). That is the rule that put the owner's header over
 * the plans page, so a pass here that did not survive it would prove nothing.
 *
 *   NOTHING OF THE HEADER   elementFromPoint on a grid over the top 120px
 *                           (every 20px across, every 4px down) never lands
 *                           in the shell's chrome, and always in the layer
 *   THE WHOLE WINDOW        the layer is exactly the viewport
 *   ITS BAR, ALL OF IT      the page's top bar starts at the inset (47px, or
 *                           0 in a browser without one), ends inside the
 *                           window, and a tap on its middle reaches it
 *   THE STATUS BAR STRIP    in the native shell the black shield is stood
 *                           down; the strip is the layer's own
 *   BACK                    the plans page's Back is router.back() with an
 *                           /app page behind it, a link without one
 *   THE PILL                gone and unreachable over the plans page; on the
 *                           editor, on a phone, visible, on top, reachable,
 *                           and the editor's last content scrolls clear of it
 *
 *   node scripts/check-page-layer.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const INSET = { top: 47, bottom: 34 }

const dir = join(root, ".page-layer-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `const page = new URLSearchParams(location.search).get("page") || "plans"
const path = page === "plans" ? "/app/settings/billing/upgrade" : page === "new" ? "/app/products/new" : "/app/products/x"
export const usePathname = () => path
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
export const useRouter = () => ({ push(h) { (window.__pushed = window.__pushed || []).push(h) }, replace(h) { (window.__pushed = window.__pushed || []).push(h) }, prefetch() {}, refresh() {}, back() { window.__back = (window.__back || 0) + 1 } })
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, onClick, prefetch, ...rest }, ref) {
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => { onClick && onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__pushed = window.__pushed || []).push(href) } } }, children)
})
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined, ...rest }) }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-page-layer.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    "--banner:js=var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};",
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const js = readFileSync(join(dir, "probe.js"), "utf8").replace(/<\/script/gi, "<\\/script")
rmSync(dir, { recursive: true, force: true })

const css = await appCss(root)
/* WebKit's rule, written into the real stylesheet: the property makes a stacking context. */
const webkitCss = css
  .replace(/-webkit-overflow-scrolling:\s*touch/g, "isolation:isolate")
  .replace(/-webkit-overflow-scrolling:\s*auto/g, "isolation:auto")
if (webkitCss === css) fail("the stylesheet has no -webkit-overflow-scrolling to rewrite: the WebKit pass would measure nothing")
const page = (sheet) => `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${sheet}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>${js}</script></body></html>`
const pages = { "/chromium": page(css), "/webkit": page(webkitCss) }
const server = createServer((req, res) => {
  const html = pages[req.url.split("?")[0]]
  res.writeHead(html ? 200 : 404, { "content-type": "text/html" })
  res.end(html ?? "")
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const problems = []
const report = {}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const VIEWPORTS = {
  390: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  1440: { width: 1440, height: 900, deviceScaleFactor: 1 },
}
/* width, engine, native shell, inset */
const RUNS = [
  [390, "webkit", true, INSET],
  [390, "webkit", false, INSET],
  [390, "chromium", false, INSET],
  [390, "chromium", false, null],
  /* Not the native shell at 1440: a landscape window there is the rotation
     guard's (a phone held sideways), which covers everything by design. */
  [1440, "webkit", false, INSET],
  [1440, "chromium", false, null],
]

for (const which of ["plans", "new", "edit"]) {
  for (const [width, engine, native, inset] of RUNS) {
    const label = `${which} ${width} ${engine}${native ? " native" : ""}${inset ? " inset" : ""}`
    const p = await browser.newPage()
    await p.setViewport(VIEWPORTS[width])
    const cdp = await p.createCDPSession()
    if (inset) await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: inset })
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e)))
    await p.setRequestInterception(true)
    p.on("request", (r) => (r.url().startsWith(base) || r.url().startsWith("data:") ? r.continue() : r.abort()))
    const query = `?page=${which}${native ? "&capacitor=1" : ""}`
    await p.goto(`${base}/${engine}${query}`)
    await p.waitForSelector("[data-page-layer]")
    await wait(500)
    const m = await p.evaluate((which) => {
      const W = innerWidth, H = innerHeight
      const layer = document.querySelector("[data-page-layer]")
      const lr = layer.getBoundingClientRect()
      let chrome = 0, outside = 0, points = 0
      for (let y = 0; y <= 120; y += 4) {
        for (let x = 10; x < W; x += 20) {
          points++
          const el = document.elementFromPoint(x, y)
          if (el?.closest("[data-shell-chrome]")) chrome++
          if (!el || !layer.contains(el)) outside++
        }
      }
      const bar = which === "plans" ? document.querySelector("[data-upgrade-page] > div") : document.querySelector("[data-editor-bar]")
      const br = bar.getBoundingClientRect()
      const barHit = document.elementFromPoint(W / 2, br.top + br.height / 2)
      const probe = document.createElement("div")
      probe.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top,0px)"
      document.body.appendChild(probe)
      const sat = probe.getBoundingClientRect().height
      probe.remove()
      const pill = document.querySelector("[data-pill-tab]")
      const pr = pill.getBoundingClientRect()
      const pillHit = pr.width ? document.elementFromPoint(pr.x + pr.width / 2, pr.y + pr.height / 2) : null
      return {
        W, H, sat,
        layer: { x: lr.x, y: lr.y, w: lr.width, h: lr.height },
        points, chromeHits: chrome, outsideLayer: outside,
        headerVisibility: [...document.querySelectorAll("[data-shell-chrome]")].map((h) => getComputedStyle(h).visibility),
        bar: { top: Math.round(br.top * 10) / 10, bottom: Math.round(br.bottom * 10) / 10 },
        barReached: !!barHit && bar.contains(barHit),
        shield: getComputedStyle(document.documentElement, "::before").display,
        pillVisible: getComputedStyle(pill).visibility === "visible" && pr.width > 0,
        pillReached: !!pillHit?.closest("[data-pill-tab]"),
        pillTop: Math.round(pr.top),
      }
    }, which)
    let extra = {}
    if (which === "plans") {
      await p.click("[data-upgrade-back]")
      extra.back = await p.evaluate(() => ({ back: window.__back || 0, pushed: window.__pushed || [] }))
    } else if (width === 390) {
      /* The foot of the editor, scrolled all the way down: its last box above the pill. */
      extra.foot = await p.evaluate(async () => {
        const s = document.querySelector("[data-page-layer-scroll] > .page-scroll")
        s.scrollTop = s.scrollHeight
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        const boxes = [...s.querySelectorAll("*")].filter((e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.width > 0 && getComputedStyle(e).visibility !== "hidden" && !(e.closest(".fixed") && s.contains(e.closest(".fixed"))) })
        const last = Math.max(...boxes.map((e) => e.getBoundingClientRect().bottom))
        return { lastContentBottom: Math.round(last), scrollerBottom: Math.round(s.getBoundingClientRect().bottom) }
      })
    }
    await p.close()
    report[label] = { ...m, ...extra, errors }
    const at = `${label}:`
    const wantTop = inset ? inset.top : 0
    if (errors.length) problems.push(`${at} the page threw: ${errors[0]}`)
    if (inset && Math.abs(m.sat - inset.top) > 0.5) problems.push(`${at} the inset override did not apply (${m.sat})`)
    if (m.layer.x !== 0 || m.layer.y !== 0 || m.layer.w !== m.W || m.layer.h !== m.H) problems.push(`${at} the layer is not the window: ${JSON.stringify(m.layer)}`)
    if (m.chromeHits) problems.push(`${at} ${m.chromeHits} of ${m.points} points in the top 120px landed on the shell's header`)
    if (m.outsideLayer) problems.push(`${at} ${m.outsideLayer} of ${m.points} points in the top 120px landed outside the layer`)
    if (Math.abs(m.bar.top - wantTop) > 0.5) problems.push(`${at} the page's bar starts at ${m.bar.top}px, not at the inset (${wantTop})`)
    if (m.bar.bottom > m.H || m.bar.bottom - m.bar.top < 44) problems.push(`${at} the page's bar is not whole inside the window: ${JSON.stringify(m.bar)}`)
    if (!m.barReached) problems.push(`${at} a tap on the middle of the page's bar does not reach it`)
    if (native && m.shield !== "none") problems.push(`${at} the native black shield is still drawn over the status bar strip (${m.shield})`)
    if (which === "plans") {
      if (width === 390 && (m.pillVisible || m.pillReached)) problems.push(`${at} the nav pill shows over the plans page`)
      if (extra.back.back !== 0 || extra.back.pushed[0] !== "/app/settings?tab=billing") problems.push(`${at} Back with nothing behind it should link to Billing: ${JSON.stringify(extra.back)}`)
    } else if (width === 390) {
      if (!m.pillVisible || !m.pillReached) problems.push(`${at} the nav pill should stay over the editor on a phone (visible ${m.pillVisible}, reached ${m.pillReached})`)
      if (extra.foot.lastContentBottom > m.pillTop) problems.push(`${at} the editor's last content ends at ${extra.foot.lastContentBottom}px, under the pill at ${m.pillTop}px`)
      if (extra.foot.scrollerBottom !== m.H) problems.push(`${at} the editor's scroller stops at ${extra.foot.scrollerBottom}px, short of the bottom edge (${m.H})`)
    }
  }
}

/* Back with an /app page behind it: the browser's back, nothing pushed. */
{
  const p = await browser.newPage()
  await p.setViewport(VIEWPORTS[390])
  await p.goto(`${base}/webkit?page=plans&history=1`)
  await p.waitForSelector("[data-upgrade-back]")
  await p.click("[data-upgrade-back]")
  const warm = await p.evaluate(() => ({ back: window.__back || 0, pushed: window.__pushed || [] }))
  report.backWithHistory = warm
  if (warm.back !== 1 || warm.pushed.length) problems.push(`Back with an /app page behind it should be router.back(): ${JSON.stringify(warm)}`)
  await p.close()
}

await browser.close()
server.close()
const brief = Object.fromEntries(Object.entries(report).map(([k, v]) => [k, v.points ? {
  chromeHits: v.chromeHits, outsideLayer: v.outsideLayer, bar: v.bar, layer: `${v.layer.x},${v.layer.y} ${v.layer.w}x${v.layer.h}`, shield: v.shield,
  pill: v.pillVisible ? (v.pillReached ? "visible, reachable" : "visible, covered") : "hidden", ...(v.foot ? { foot: v.foot } : {}), ...(v.back ? { back: v.back } : {}),
} : v]))
console.log(JSON.stringify(brief, null, 1))
if (problems.length) fail(problems.join("\n"))
console.log("ok: the plans page and the product editor cover the whole shell, their bars sit under the status bar, and nothing of the header shows, in Chromium and under WebKit's stacking rule")
