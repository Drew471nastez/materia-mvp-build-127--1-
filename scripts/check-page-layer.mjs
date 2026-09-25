/**
 * ===========================================================================
 *  A PAGE OVER THE WHOLE SHELL ON A PHONE, AND THE EDITOR IN IT FROM md
 * ===========================================================================
 * "The black top bar overlaps the actual page; fix it fully." and "The edit
 * or add product page should be full screen, on iOS, Android, browser,
 * Capacitor, all: the top black bar must not be visible." That was about the
 * phone. On a computer: "On desktop large screen the edit product page should
 * be with the sidebar, with the header up there, with all those things you
 * know. Not how it is on mobile."
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
 * The plans page at every width, and the editor at 390:
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
 * The editor at 1440:
 *
 *   THE SHELL AROUND IT     the black header and the rail are painted and a
 *                           point in each lands in it; the editor fills the
 *                           content area and nothing else
 *   ITS BAR UNDER THE HEADER  the bar's top is the header's bottom, to the
 *                           pixel, with no padding of its own for the inset
 *                           (the header took it): a point 1px above the seam
 *                           is the header, 1px below is the bar, all the way
 *                           across; still so with the editor scrolled 600px
 *   ITS COLUMN              the bar's row and the form share one column,
 *                           centred in the content area
 *   ACROSS THE BREAKPOINT   the same boxes at 767 (a layer over the window)
 *                           and 768 (in the shell): the editor's scroll is
 *                           kept both ways and its bar is at the top of it
 *
 *   node scripts/check-page-layer.mjs
 */
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
/* The description is cleaned by a server action (description-action.ts, "use
   server"): a network call in the real app, server-only code if bundled for
   the browser. Stood in for by its answer for a signed-in owner, as
   scripts/check-product-editor.mjs does. */
writeFileSync(join(dir, "description-action.js"), `export async function cleanDescription(html) { return { ok: true, html: String(html ?? "") } }
`)
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-page-layer.tsx")],
    bundle: true,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    logLevel: "error",
    outfile: join(dir, "probe.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    alias: { "next/navigation": join(dir, "navigation.js"), "next/link": join(dir, "link.jsx"), "next/image": join(dir, "image.jsx"), "@": root },
    loader: { ".jsx": "jsx", ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
    plugins: [{
      name: "server-action-stub",
      setup(b) { b.onResolve({ filter: /description-action$/ }, () => ({ path: join(dir, "description-action.js") })) },
    }],
  })
} catch (e) { rmSync(dir, { recursive: true, force: true }); fail(`the probe did not bundle: ${e.message}`) }
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
const frames = (p) => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

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

/** The page drawn over the whole window: the plans page anywhere, the editor on a phone. */
async function measureLayer(p, which) {
  return p.evaluate((which) => {
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
    const controls = [...bar.querySelectorAll("a, button")].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
    const controlsTop = Math.min(...controls.map((r) => r.top))
    const controlsBottom = Math.max(...controls.map((r) => r.bottom))
    const first = controls.find((r) => r.top === controlsTop)
    const barHit = document.elementFromPoint(first.x + first.width / 2, first.y + first.height / 2)
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
      bar: { top: Math.round(br.top * 10) / 10, bottom: Math.round(br.bottom * 10) / 10, controlsTop: Math.round(controlsTop * 10) / 10, controlsBottom: Math.round(controlsBottom * 10) / 10 },
      barReached: !!barHit && bar.contains(barHit),
      shield: getComputedStyle(document.documentElement, "::before").display,
      pillVisible: getComputedStyle(pill).visibility === "visible" && pr.width > 0,
      pillReached: !!pillHit?.closest("[data-pill-tab]"),
      pillTop: Math.round(pr.top),
    }
  }, which)
}

/** The editor from md: a page in the shell, under the header, beside the rail. */
async function measureInShell(p) {
  return p.evaluate(() => {
    const W = innerWidth, H = innerHeight
    const r1 = (n) => Math.round(n * 10) / 10
    const header = document.querySelector("[data-desktop-header]")
    const rail = document.querySelector("[data-rail]")
    const layer = document.querySelector("[data-page-layer]")
    const scroller = layer.querySelector("[data-page-layer-scroll] > .page-scroll")
    const bar = document.querySelector("[data-editor-bar]")
    const hr = header.getBoundingClientRect()
    const lr = layer.getBoundingClientRect()
    const br = bar.getBoundingClientRect()
    const railR = rail.getBoundingClientRect()
    const headerHit = document.elementFromPoint(W / 2, hr.bottom / 2)
    const railHit = document.elementFromPoint(railR.left + railR.width / 2, railR.top + railR.height / 2)
    /* The seam, all the way across the content area. */
    let above = 0, below = 0, seamPoints = 0
    for (let x = lr.left + 8; x < lr.right - 12; x += 24) {
      seamPoints++
      if (document.elementFromPoint(x, hr.bottom - 1)?.closest("[data-desktop-header]")) above++
      if (bar.contains(document.elementFromPoint(x, hr.bottom + 1))) below++
    }
    const controls = [...bar.querySelectorAll("a, button")].filter((c) => { const r = c.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
    const first = controls[0].getBoundingClientRect()
    const firstHit = document.elementFromPoint(first.x + first.width / 2, first.y + first.height / 2)
    const row = bar.querySelector(":scope > div.mx-auto")
    const rowR = row.getBoundingClientRect()
    const column = scroller.querySelector(":scope > div.mx-auto")?.getBoundingClientRect()
    /* The content area: where the scroller's box is, less its scrollbar column. */
    const sr = scroller.getBoundingClientRect()
    const areaCentre = sr.left + scroller.clientLeft + scroller.clientWidth / 2
    return {
      W, H,
      header: { top: r1(hr.top), bottom: r1(hr.bottom), visibility: getComputedStyle(header).visibility, hit: !!headerHit?.closest("[data-desktop-header]") },
      rail: { width: r1(railR.width), visibility: getComputedStyle(rail).visibility, hit: !!railHit?.closest("[data-rail]") },
      layer: { x: r1(lr.x), y: r1(lr.y), w: r1(lr.width), h: r1(lr.height), position: getComputedStyle(layer).position },
      bar: { top: r1(br.top), height: r1(br.height), paddingTop: getComputedStyle(bar).paddingTop },
      seam: { points: seamPoints, headerAbove: above, barBelow: below },
      firstControlReached: !!firstHit && controls[0].contains(firstHit),
      row: { left: r1(rowR.left), width: r1(rowR.width), centreOff: r1(rowR.left + rowR.width / 2 - areaCentre) },
      column: column ? { left: r1(column.left), width: r1(column.width) } : null,
      scrollTop: scroller.scrollTop,
      scrollable: scroller.scrollHeight - scroller.clientHeight,
    }
  })
}

for (const which of (process.env.PAGES || "plans,new,edit").split(",")) {
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
    await p.waitForSelector("[data-page-layer]", { timeout: 8000 }).catch(() => fail(`${label}: the page did not render${errors.length ? `: ${errors[0]}` : ""}`))
    await wait(500)
    /* LAYER_SHOTS=<dir>: a picture of each run, for the eye. */
    if (process.env.LAYER_SHOTS) await p.screenshot({ path: join(process.env.LAYER_SHOTS, `${label.replace(/ /g, "-")}.png`) })
    const at = `${label}:`
    const wantTop = inset ? inset.top : 0

    if (which !== "plans" && width >= 768) {
      /* ── The editor in the shell ─────────────────────────────────────── */
      const m = await measureInShell(p)
      const wantHeader = 58 + wantTop
      const railW = 240
      const scrolled = await p.evaluate(async () => {
        const s = document.querySelector("[data-page-layer-scroll] > .page-scroll")
        s.scrollTop = 600
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        return s.scrollTop
      })
      const after = await measureInShell(p)
      let across = null
      if (engine === "chromium") {
        /* Across the breakpoint and back, the same boxes and the same scroll. */
        across = {}
        await p.evaluate(() => { window.__editorNode = document.querySelector("[data-page-layer-scroll] > .page-scroll") })
        for (const w of [767, 768, 1440]) {
          await p.setViewport({ width: w, height: 900, deviceScaleFactor: 1 })
          await frames(p)
          across[w] = await p.evaluate(() => {
            const layer = document.querySelector("[data-page-layer]")
            const s = document.querySelector("[data-page-layer-scroll] > .page-scroll")
            const lr = layer.getBoundingClientRect()
            return {
              sameNode: s === window.__editorNode,
              scrollTop: s.scrollTop,
              position: getComputedStyle(layer).position,
              layer: `${Math.round(lr.x)},${Math.round(lr.y)} ${Math.round(lr.width)}x${Math.round(lr.height)}`,
              barTop: Math.round(document.querySelector("[data-editor-bar]").getBoundingClientRect().top * 10) / 10,
              chrome: getComputedStyle(document.querySelector("[data-desktop-header]")).display !== "none" && getComputedStyle(document.querySelector("[data-desktop-header]")).visibility === "visible",
            }
          })
        }
      }
      await p.close()
      report[label] = { ...m, scrolled: { to: scrolled, barTop: after.bar.top, seam: after.seam }, ...(across ? { across } : {}), errors }
      if (errors.length) problems.push(`${at} the page threw: ${errors[0]}`)
      if (m.header.visibility !== "visible" || !m.header.hit) problems.push(`${at} the black header is not showing over the editor (${m.header.visibility}, hit ${m.header.hit})`)
      if (Math.abs(m.header.bottom - wantHeader) > 0.5) problems.push(`${at} the header ends at ${m.header.bottom}, not ${wantHeader}`)
      if (m.rail.visibility !== "visible" || !m.rail.hit || m.rail.width !== railW) problems.push(`${at} the rail is not showing beside the editor: ${JSON.stringify(m.rail)}`)
      if (m.layer.position === "fixed" || m.layer.x !== railW || Math.abs(m.layer.y - wantHeader) > 0.5 || m.layer.w !== m.W - railW || Math.abs(m.layer.h - (m.H - wantHeader)) > 0.5)
        problems.push(`${at} the editor does not fill exactly the content area: ${JSON.stringify(m.layer)}`)
      if (Math.abs(m.bar.top - m.header.bottom) > 0.5) problems.push(`${at} the editor's bar starts at ${m.bar.top}, the header ends at ${m.header.bottom}: ${m.bar.top > m.header.bottom ? "a gap" : "an overlap"}`)
      if (m.bar.paddingTop !== "0px") problems.push(`${at} the bar pads itself ${m.bar.paddingTop} under a header that already took the inset`)
      if (m.seam.headerAbove !== m.seam.points || m.seam.barBelow !== m.seam.points) problems.push(`${at} at the seam, ${m.seam.headerAbove} of ${m.seam.points} points 1px above are the header and ${m.seam.barBelow} 1px below are the bar`)
      if (!m.firstControlReached) problems.push(`${at} a click on the bar's first control does not reach it`)
      if (Math.abs(m.row.centreOff) > 1) problems.push(`${at} the bar's row is ${m.row.centreOff}px off the centre of the content area`)
      if (!m.column || m.column.left !== m.row.left || m.column.width !== m.row.width) problems.push(`${at} the bar's row (${m.row.left}/${m.row.width}) and the form's column (${m.column?.left}/${m.column?.width}) are not one column`)
      if (m.scrollable < 600 || scrolled < 600) problems.push(`${at} the editor did not scroll 600px (${scrolled} of ${m.scrollable})`)
      if (Math.abs(after.bar.top - m.header.bottom) > 0.5 || after.seam.headerAbove !== after.seam.points || after.seam.barBelow !== after.seam.points)
        problems.push(`${at} scrolled 600px, the bar left the header's edge: ${after.bar.top}, seam ${JSON.stringify(after.seam)}`)
      if (across) {
        const a = across
        if (!a[767].sameNode || !a[768].sameNode || !a[1440].sameNode) problems.push(`${at} crossing the breakpoint put up a different editor: ${JSON.stringify(a)}`)
        if (a[767].scrollTop !== scrolled || a[768].scrollTop !== scrolled || a[1440].scrollTop !== scrolled) problems.push(`${at} crossing the breakpoint lost the editor's scroll: ${scrolled} then ${a[767].scrollTop}, ${a[768].scrollTop}, ${a[1440].scrollTop}`)
        if (a[767].position !== "fixed" || a[767].layer !== "0,0 767x900" || a[767].barTop !== 0) problems.push(`${at} at 767 the editor should be the whole window with its bar at the top: ${JSON.stringify(a[767])}`)
        if (a[768].position === "fixed" || a[768].layer !== "240,58 528x842" || a[768].barTop !== 58 || !a[768].chrome) problems.push(`${at} at 768 the editor should be in the shell under the header: ${JSON.stringify(a[768])}`)
      }
      continue
    }

    /* ── A layer over the whole window ─────────────────────────────────── */
    const m = await measureLayer(p, which)
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
        /* Boxes somebody can see: not the 1px screen reader inputs (.sr-only, the picture pickers' file fields). */
        const boxes = [...s.querySelectorAll("*")].filter((e) => { const r = e.getBoundingClientRect(); return r.height > 1 && r.width > 1 && !e.closest(".sr-only") && getComputedStyle(e).visibility !== "hidden" && !(e.closest(".fixed") && s.contains(e.closest(".fixed"))) })
        const last = Math.max(...boxes.map((e) => e.getBoundingClientRect().bottom))
        return { lastContentBottom: Math.round(last), scrollerBottom: Math.round(s.getBoundingClientRect().bottom) }
      })
    }
    await p.close()
    report[label] = { ...m, ...extra, errors }
    if (errors.length) problems.push(`${at} the page threw: ${errors[0]}`)
    if (inset && Math.abs(m.sat - inset.top) > 0.5) problems.push(`${at} the inset override did not apply (${m.sat})`)
    if (m.layer.x !== 0 || m.layer.y !== 0 || m.layer.w !== m.W || m.layer.h !== m.H) problems.push(`${at} the layer is not the window: ${JSON.stringify(m.layer)}`)
    if (m.chromeHits) problems.push(`${at} ${m.chromeHits} of ${m.points} points in the top 120px landed on the shell's header`)
    if (m.outsideLayer) problems.push(`${at} ${m.outsideLayer} of ${m.points} points in the top 120px landed outside the layer`)
    /* The plans page: the layer pads, so its bar starts at the inset. The
       editor: its bar pads itself, so the bar starts at 0 and paints the strip. */
    const wantBarTop = which === "plans" ? wantTop : 0
    if (Math.abs(m.bar.top - wantBarTop) > 0.5) problems.push(`${at} the page's bar starts at ${m.bar.top}px, not at ${wantBarTop}`)
    if (m.bar.controlsTop < wantTop - 0.5) problems.push(`${at} the bar's controls start at ${m.bar.controlsTop}px, under the status bar (${wantTop})`)
    if (m.bar.controlsBottom > m.H || m.bar.bottom - m.bar.top < 44) problems.push(`${at} the page's bar is not whole inside the window: ${JSON.stringify(m.bar)}`)
    if (!m.barReached) problems.push(`${at} a tap on the first control in the page's bar does not reach it`)
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
} : v.header ? {
  header: v.header, rail: v.rail, layer: `${v.layer.x},${v.layer.y} ${v.layer.w}x${v.layer.h} ${v.layer.position}`, bar: v.bar, seam: v.seam,
  row: v.row, column: v.column, scrolled: v.scrolled, ...(v.across ? { across: v.across } : {}),
} : v]))
console.log(JSON.stringify(brief, null, 1))
if (problems.length) fail(problems.join("\n"))
console.log("ok: the plans page covers the whole shell at every width and the editor does on a phone, bars under the status bar and nothing of the header, in Chromium and under WebKit's stacking rule; from md the editor sits in the shell, its bar exactly under the header, beside the rail, the same boxes and scroll across the breakpoint")
