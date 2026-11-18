/**
 * ===========================================================================
 *  THE SITE CHROME EVERY GENERATED WEBSITE GETS, MEASURED (round 56)
 * ===========================================================================
 * Real generated websites (the scripted evaluation's sites from both engines,
 * and every starting template as applied), drawn on the server by the live
 * renderer (./ai-site-chrome-r56-sites.ts) and mounted in headless Chromium
 * with the live page's own React tree (./ai-site-chrome-r56-probe.tsx), in a
 * storefront with three languages and three currencies, at 360, 390, 414,
 * 768, 1024 and 1280 px. At each width:
 *
 *   overflow     the page does not scroll sideways; no element past the
 *                right edge
 *   header       no clipped or wrapped label; logo, menu and actions on
 *                screen and not on top of each other
 *   drawer       the phone menu (or a nav sidebar): opens by its button;
 *                closes by its close button, Escape and the backdrop; full
 *                height; the CSS says dvh/svh and env(safe-area-inset-*);
 *                nothing cut off and a long menu scrolls inside; the page
 *                behind does not scroll; focus moves in, stays in, and comes
 *                back to the button; nothing shows through
 *   selectors    language, currency and country: the panel stays on screen,
 *                in the header and inside the phone menu
 *   cart/search  open, on screen, close by Escape, focus in
 *   taps         nav and footer links and icon buttons at least 44 x 44
 *   contrast     WCAG ratio of the header's and footer's words and buttons
 *                against what is really behind them (4.5, or 3 for large)
 *   cta          the header's main action is in the site's palette, never the
 *                AI default indigo, and reads at 4.5:1
 *
 *   node scripts/check-ai-site-chrome-r56.mjs
 *     SITES_JSON=<file>   reuse a sites file (skips the evaluation, minutes)
 *     SITES=a,b           only sites whose key has one of these
 *     WIDTHS=360,1280     only these widths
 *     OUT=<dir>           results.json and screenshots (default scratchpad)
 *     SHOTS=0             no screenshots
 *
 * Writes <OUT>/results.json and, when it is the default place, the
 * repository's .ai-site-chrome-r56-last.json (read by
 * tests/ai-site-chrome-r56.test.ts). Exit 1 when anything fails.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const OUT = process.env.OUT || join(tmpdir(), "ai-site-chrome-r56")
const WIDTHS = (process.env.WIDTHS ?? "360,390,414,768,1024,1280").split(",").map(Number)
const SHOT_WIDTHS = new Set([360, 390, 768, 1280])
const SHOTS = process.env.SHOTS !== "0"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(2) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
mkdirSync(OUT, { recursive: true })

/* ── 1. the sites ─────────────────────────────────────────────────────── */

function makeSites() {
  const tmp = mkdtempSync(join(tmpdir(), "chrome-r56-sites-"))
  const tsconfig = `tsconfig.chrome-r56.generated.json`
  const file = join(OUT, "sites.json")
  try {
    writeFileSync(tsconfig, JSON.stringify({ compilerOptions: { outDir: tmp, rootDir: ".", target: "es2022", module: "esnext", moduleResolution: "bundler", jsx: "react-jsx", skipLibCheck: true, strict: true, noEmitOnError: false, baseUrl: ".", paths: { "@/*": ["./*"] } }, files: ["scripts/ai-site-chrome-r56-sites.ts"] }))
    try { execFileSync("pnpm", ["exec", "tsc", "-p", tsconfig], { stdio: "inherit" }) } catch { /* emitted anyway; type errors are tsc's to report */ }
    writeFileSync(join(tmp, "package.json"), '{"type":"module"}\n')
    symlinkSync(join(root, "node_modules"), join(tmp, "node_modules"), "junction")
    execFileSync(process.execPath, ["--import", join(root, "scripts/push-test-register.mjs"), join(tmp, "scripts/ai-site-chrome-r56-sites.js"), file], { stdio: "inherit", env: { ...process.env, PUSH_TEST_OUT: tmp } })
  } finally {
    rmSync(tmp, { recursive: true, force: true })
    if (existsSync(tsconfig)) unlinkSync(tsconfig)
  }
  return file
}

const sitesFile = process.env.SITES_JSON || makeSites()
let sites = JSON.parse(readFileSync(sitesFile, "utf8"))
const only = (process.env.SITES ?? "").split(",").filter(Boolean)
if (only.length) sites = sites.filter((s) => only.some((x) => s.key.includes(x)))
console.log(`${sites.length} sites: ${sites.map((s) => s.key).join(", ")}`)
/* The AI look warnings each starting template carries before any adaptation (lib/ai-builder/slop.ts). */
const slop = Object.fromEntries(sites.filter((s) => s.slop).map((s) => [s.key, s.slop]))
for (const [k, v] of Object.entries(slop)) console.log(`  ${k}: frame ${v.chrome.warnings} warnings, ${v.chrome.errors} errors; whole site ${v.site.warnings} warnings, ${v.site.errors} errors\n    ${v.chrome.rules.join("\n    ")}`)

/* ── 2. the probe (the live page's React tree) and the app's stylesheet ── */

const build = mkdtempSync(join(tmpdir(), "chrome-r56-probe-"))
process.on("exit", () => rmSync(build, { recursive: true, force: true }))
writeFileSync(join(build, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const useSelectedLayoutSegment = () => null
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(build, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : String(href?.pathname ?? "#"), ref, ...rest }, children) })
`)
/* The 3D motion island's library is not installed here; the island is never on these pages. */
writeFileSync(join(build, "three.js"), "export default {}; export const RoomEnvironment = class {}; export const RoundedBoxGeometry = class {}\n")
const { build: esbuild } = await import("esbuild")
await esbuild({
  entryPoints: [join(root, "scripts/ai-site-chrome-r56-probe.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": root, "next/navigation": join(build, "navigation.js"), "next/link": join(build, "link.jsx") },
  plugins: [{ name: "three", setup(b) { b.onResolve({ filter: /^three(\/|$)/ }, () => ({ path: join(build, "three.js") })) } }],
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(build, "probe.js"),
  logLevel: "error",
  nodePaths: [join(root, "node_modules")],
})
const probeJs = readFileSync(join(build, "probe.js"), "utf8")

/*
  The app's site stylesheet compiled from THIS tree every run. The evaluation's
  shared cache (tmpdir/storelib-eval-site-css) is keyed on app/site.css alone,
  so a class a component gained since (min-w-11) was missing from it and the
  page was measured without it.
*/
async function siteCss() {
  const src = readFileSync(join(root, "app", "site.css"), "utf8")
  const { createRequire } = await import("node:module")
  const req = createRequire(join(root, "package.json"))
  const postcss = (await import("postcss")).default
  const out = await postcss([req(join(root, "scripts", "site-css.cjs"))(), req("@tailwindcss/postcss")()]).process(src, { from: join(root, "app", "site.css") })
  return out.css
}
const css = await siteCss()

function pageFor(site) {
  const probe = { theme: site.theme, sections: site.sections, prerendered: site.prerendered, template: site.template, pages: site.pages }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style></head><body style="margin:0"><div id="app"></div><script>window.__PROBE__=${JSON.stringify(probe).replace(/</g, "\\u003c")}</script><script>${probeJs.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
}

/* ── 3. the measurements, in the page ─────────────────────────────────── */

/* Helpers the page keeps on window (installed once per tab). */
const HELPERS = String.raw`(() => {
  const H = {}
  H.vis = (el) => { if (!el || !el.getClientRects().length) return false; const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  H.deepVis = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return false } return H.vis(el) }
  H.rgba = (c) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c || ""); if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]]; const s = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(c || ""); if (s) return [s[1] * 255, s[2] * 255, s[3] * 255, s[4] === undefined ? 1 : +s[4]]; return null }
  H.lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  H.ratio = (a, b) => { const x = H.lum(a), y = H.lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  H.blend = (top, under) => { const a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1] }
  /* What is really behind an element: its own and its ancestors' fills, blended, down to the page (null when a picture or gradient is under it). */
  H.bgOf = (el) => { const stack = []; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage && cs.backgroundImage !== "none" && !/^url\(.*\.svg/.test(cs.backgroundImage)) return null; const c = H.rgba(cs.backgroundColor); if (c && c[3] > 0) { stack.push(c); if (c[3] >= 0.999) break } } let out = [255, 255, 255, 1]; for (let i = stack.length - 1; i >= 0; i--) out = H.blend(stack[i], out); return out }
  H.hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0)
  H.label = (el) => { const cls = typeof el.className === "string" ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".") : ""; const t = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24); return el.tagName.toLowerCase() + (cls ? "." + cls : "") + (t ? ' "' + t + '"' : "") }
  H.headerRoot = () => document.querySelector('[data-storelib-theme] #section-header, [data-storelib-theme] [data-section-type="header"]') || document.querySelector("[data-storelib-theme] [data-chrome] header, [data-storelib-theme] header") || document.querySelector("header")
  H.headerBox = () => { const h = H.headerRoot(); if (!h) return null; let box = h; for (let e = h; e && !e.hasAttribute?.("data-storelib-theme"); e = e.parentElement) { if (e.hasAttribute("data-section-box") || e.hasAttribute("data-section-type")) { box = e; break } } return box }
  H.footerRoot = () => { const all = [...document.querySelectorAll("[data-storelib-theme] footer")]; return all[all.length - 1] || null }
  /* Fixed or top layer panels on screen now (drawers, sheets, popovers). */
  H.panels = () => [...document.querySelectorAll("body *")].filter((e) => { if (!H.deepVis(e)) return false; const cs = getComputedStyle(e); const top = e.matches(":popover-open") || e.matches("dialog[open]"); if (!(cs.position === "fixed" || top)) return false; const r = e.getBoundingClientRect(); return r.width >= 120 && r.height >= 80 })
  H.focusables = (rootEl) => [...rootEl.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"]), summary')].filter((e) => H.deepVis(e))
  H.cssFor = (el) => { const out = []; for (const sheet of document.styleSheets) { let rules; try { rules = sheet.cssRules } catch { continue } const walk = (list) => { for (const r of list) { if (r.cssRules && !r.selectorText) { walk(r.cssRules); continue } if (r.selectorText) { try { if (el.matches(r.selectorText.replace(/::?(backdrop|before|after|placeholder|-webkit-[\w-]+)/g, ""))) out.push(r.cssText) } catch {} } } }; walk(rules) } out.push(el.getAttribute("style") || ""); return out.join("\n") }
  window.__H = H
})()`

async function settle(tab, ms = 350) { await new Promise((r) => setTimeout(r, ms)) }

/** Whether focus is inside `panel` within 1.5 s of it opening (this machine is loaded; a visitor's is not). */
async function focusArrives(panel) {
  for (let i = 0; i < 30; i++) {
    if (await panel.evaluate((p) => p.contains(document.activeElement)).catch(() => false)) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return false
}

async function measureStatic(tab) {
  return tab.evaluate(() => {
    const H = window.__H
    const vw = document.documentElement.clientWidth
    const scrollOver = document.documentElement.scrollWidth - vw
    /* Elements past the right edge that nothing clips. */
    const past = []
    for (const e of document.querySelectorAll("[data-storelib-theme] *")) {
      if (!e.getClientRects().length) continue
      const r = e.getBoundingClientRect()
      if (r.right <= vw + 1 || r.width === 0 || r.height === 0) continue
      const cs = getComputedStyle(e)
      if (cs.visibility === "hidden" || cs.position === "fixed" || e.closest("[popover]:not(:popover-open)")) continue
      let clipped = false
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
        const s = getComputedStyle(a)
        if (/hidden|clip|auto|scroll/.test(s.overflowX) && a.getBoundingClientRect().right <= vw + 1) { clipped = true; break }
      }
      if (!clipped) past.push(`${H.label(e)} right ${Math.round(r.right)}`)
    }
    /* The header: labels clipped or wrapped, items off screen or on top of each other. */
    const hd = H.headerRoot()
    const header = { found: !!hd, clipped: [], wrapped: [], offscreen: [], overlap: [], height: 0, fontSizes: 0 }
    if (hd) {
      header.height = Math.round(hd.getBoundingClientRect().height)
      const sizes = new Set()
      const items = []
      for (const e of hd.querySelectorAll("*")) {
        if (!H.deepVis(e) || e.closest("[popover], [role=dialog], [data-storelib-cart-panel], [data-storelib-search-panel], aside")) continue
        const cs = getComputedStyle(e)
        if (cs.position === "fixed") continue
        if (H.hasOwnText(e)) {
          sizes.add(cs.fontSize)
          if (e.scrollWidth > e.clientWidth + 1 && /hidden|clip/.test(cs.overflowX) && cs.textOverflow !== "ellipsis") header.clipped.push(H.label(e))
          if (cs.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1) header.clipped.push(`${H.label(e)} (cut with an ellipsis)`)
          const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3
          const r = e.getBoundingClientRect()
          if ((e.matches("a, button") || e.closest("nav")) && r.height > lh * 1.8 && e.getClientRects().length >= 1 && e.textContent.trim().length < 40) {
            const lines = new Set()
            for (const n of e.childNodes) { if (n.nodeType !== 3 || !n.textContent.trim()) continue; const range = document.createRange(); range.selectNodeContents(n); for (const x of range.getClientRects()) lines.add(Math.round(x.top)) }
            if (lines.size > 1) header.wrapped.push(H.label(e))
          }
        }
        if (e.matches("a, button, [role=button]") && !e.parentElement.closest("a, button")) items.push(e)
      }
      header.fontSizes = sizes.size
      for (const e of items) {
        const r = e.getBoundingClientRect()
        if (r.left < -1 || r.right > vw + 1) header.offscreen.push(`${H.label(e)} ${Math.round(r.left)}..${Math.round(r.right)}`)
      }
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i].getBoundingClientRect(), b = items[j].getBoundingClientRect()
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (w > 4 && h > 4 && !items[i].contains(items[j]) && !items[j].contains(items[i])) header.overlap.push(`${H.label(items[i])} / ${H.label(items[j])}`)
      }
    }
    /* Tap targets: the header's and footer's links and buttons. */
    const small = []
    const roots = [hd, H.footerRoot()].filter(Boolean)
    let taps = 0
    for (const r0 of roots) for (const e of r0.querySelectorAll("a[href], button")) {
      if (!H.deepVis(e) || e.closest("[popover]:not(:popover-open), [data-storelib-cart-panel], [data-storelib-search-panel]")) continue
      const cs = getComputedStyle(e)
      if (cs.position === "fixed" && !e.closest("header, footer")) continue
      taps++
      const r = e.getBoundingClientRect()
      if (r.width < 43.5 || r.height < 43.5) small.push(`${H.label(e)} ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    /* Contrast: every word of the header and footer, and their buttons, against what is behind them. */
    const low = []
    let texts = 0
    for (const r0 of roots) for (const e of r0.querySelectorAll("*")) {
      if (!H.deepVis(e) || !H.hasOwnText(e) || e.closest("[popover]:not(:popover-open), [data-storelib-cart-panel]:not([data-open=true]), [data-storelib-search-panel]:not([data-open=true]), [hidden], .sr-only, [class*='-sr']")) continue
      const cs = getComputedStyle(e)
      const fg = H.rgba(cs.color)
      const bg = H.bgOf(e)
      if (!fg || !bg) continue
      texts++
      const opacity = (() => { let o = 1; for (let a = e; a && a.nodeType === 1; a = a.parentElement) o *= Number(getComputedStyle(a).opacity); return o })()
      const fgx = H.blend([fg[0], fg[1], fg[2], fg[3] * opacity], bg)
      const ratio = H.ratio(fgx, bg)
      const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700
      const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5
      if (ratio < need - 0.01) low.push(`${H.label(e)} ${ratio.toFixed(2)}:1 (needs ${need})`)
    }
    /* The header's main action: its fill and its words. */
    let cta = null
    if (hd) {
      const all = [...hd.querySelectorAll("a[data-sl-button], a.hd__cta, a[data-button], a[class*='cta']")].filter((e) => H.deepVis(e) && e.textContent.trim() && !e.closest("[popover], [role=dialog], aside"))
      const b = all.find((e) => (H.rgba(getComputedStyle(e).backgroundColor) ?? [0, 0, 0, 0])[3] > 0.5) ?? all[0]
      if (b) {
        const cs = getComputedStyle(b)
        const bg = H.bgOf(b), fg = H.rgba(cs.color)
        cta = { text: b.textContent.trim().slice(0, 40), href: b.getAttribute("href"), background: cs.backgroundColor, color: cs.color, ratio: bg && fg ? +H.ratio(H.blend(fg, bg), bg).toFixed(2) : null }
      }
    }
    return { scrollOver, past: past.slice(0, 8), pastCount: past.length, header, taps, small, texts, low, cta }
  })
}

/* The phone menu's button (or a sidebar opener at a desktop width): visible, in the header, says menu. */
async function menuButton(tab) {
  return tab.evaluateHandle(() => {
    const H = window.__H
    const hd = H.headerBox() || document
    const c = [...hd.querySelectorAll("button, [role=button], a[aria-controls]")].filter((e) => H.deepVis(e) && !e.closest("[popover], [role=dialog], aside"))
    return c.find((e) => /menu|navigation|open nav/i.test(`${e.getAttribute("aria-label") || ""} ${e.textContent || ""}`) && !/close|search|cart|bag|currency|language/i.test(e.getAttribute("aria-label") || "")) ||
      c.find((e) => e.hasAttribute("popovertarget") && /menu|nav|drawer/.test(e.getAttribute("popovertarget"))) || c.find((e) => e.matches("[data-menu-button], [data-storelib-menu]")) ||
      /* A button with its own word ("Index") whose popover holds the site's links. */
      c.find((e) => { const id = e.getAttribute("popovertarget"); const t = id && document.getElementById(id); return !!t && !/search|cart|bag|loc|currency|language/i.test(id) && t.querySelectorAll("a[href]").length >= 2 }) || null
  })
}

async function openPanelAfter(tab, before) {
  return tab.evaluateHandle((before) => {
    const H = window.__H
    const now = H.panels().filter((e) => !before.includes(H.label(e) + e.getBoundingClientRect().width))
    /* The outermost new panel that is not a plain backdrop. */
    const own = now.filter((e) => !now.some((o) => o !== e && o.contains(e)))
    const solid = own.filter((e) => e.querySelector("a, button"))
    return solid.sort((a, b) => b.getBoundingClientRect().height * b.getBoundingClientRect().width - a.getBoundingClientRect().height * a.getBoundingClientRect().width)[0] || null
  }, before)
}

async function panelKeys(tab) { return tab.evaluate(() => window.__H.panels().map((e) => window.__H.label(e) + e.getBoundingClientRect().width)) }

async function isOpen(tab, panel) { return panel.evaluate((p) => window.__H.deepVis(p) && (p.matches(":popover-open") || !p.closest("[popover]") || p.closest("[popover]").matches(":popover-open"))).catch(() => false) }

async function drawerChecks(tab, vw, vh, shot) {
  const out = { found: false, opens: false, closeButton: null, escape: null, backdrop: null, fullHeight: null, dvh: null, safeArea: null, cutOff: [], scrolls: null, scrollLock: null, focusIn: null, focusTrap: null, focusBack: null, opaque: null, selector: null, detail: "" }
  const btn = await menuButton(tab)
  if (!(await btn.evaluate((b) => !!b))) { out.detail = "no menu button at this width"; return out }
  out.found = true
  /* Scroll the page a little first so a scroll lock has something to hold. */
  await tab.evaluate(() => window.scrollTo(0, 0))
  const before = await panelKeys(tab)
  await btn.click().catch(() => undefined)
  await settle(tab, 650)
  let panel = await openPanelAfter(tab, before)
  if (!(await panel.evaluate((p) => !!p))) { out.detail = "the button opened nothing on screen"; return out }
  out.opens = true
  if (shot) await tab.screenshot({ path: shot, type: "jpeg", quality: 72 }).catch(() => undefined)
  const geo = await panel.evaluate((p, vw, vh) => {
    const H = window.__H
    const r = p.getBoundingClientRect()
    const css = H.cssFor(p)
    const cut = []
    const hiddenFocusable = []
    for (const e of p.querySelectorAll("a, button, input, select, p, h2, h3, li, span, img")) {
      if (!H.deepVis(e)) continue
      const x = e.getBoundingClientRect()
      let hiddenByClip = false
      for (let a = e.parentElement; a && a !== p.parentElement; a = a.parentElement) {
        const s = getComputedStyle(a)
        if (!/hidden|clip/.test(s.overflowX)) continue
        const c = a.getBoundingClientRect()
        if (x.left >= c.right - 1 || x.right <= c.left + 1) { hiddenByClip = true; break }
      }
      if (hiddenByClip) { if (H.focusables(p).includes(e) && !e.closest("[inert]")) hiddenFocusable.push(H.label(e)); continue }
      if (x.right > Math.min(r.right, vw) + 1 || x.left < Math.max(r.left, 0) - 1) cut.push(`${H.label(e)} ${Math.round(x.left)}..${Math.round(x.right)}`)
    }
    const cs = getComputedStyle(p)
    const bg = H.rgba(cs.backgroundColor)
    /* What is on top at points inside the panel: the panel's own, or something behind it showing through. */
    const through = []
    for (const [fx, fy] of [[0.2, 0.15], [0.5, 0.5], [0.8, 0.85], [0.5, 0.95]]) {
      const x = r.left + r.width * fx, y = Math.min(vh - 2, r.top + r.height * fy)
      const top = document.elementFromPoint(x, y)
      if (top && !p.contains(top) && !top.contains(p)) through.push(H.label(top))
    }
    const anchored = (() => { for (let a = p; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (s.position === "fixed") return s.bottom === "0px" && s.top !== "auto" || /dvh|svh/.test(H.cssFor(a)) } return false })()
    const hd = H.headerRoot()
    return {
      rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height) },
      headerBottom: hd ? Math.round(hd.getBoundingClientRect().bottom) : 0,
      dvh: /\b\d*(dvh|svh)\b/.test(css) || anchored,
      hiddenFocusable: hiddenFocusable.slice(0, 4),
      safe: /safe-area-inset/.test(css + [...p.querySelectorAll("*")].slice(0, 40).map((e) => H.cssFor(e)).join("\n")),
      cut: cut.slice(0, 6),
      opaque: (bg && bg[3] >= 0.97) || false,
      through,
    }
  }, vw, vh)
  const sheet = geo.rect.top > vh * 0.15 && geo.rect.bottom >= vh - 2
  /* From the top of the screen, or from under a header that stays (its button is the close), down to the bottom. */
  out.fullHeight = sheet ? geo.rect.bottom >= vh - 2 : (geo.rect.top <= 1 || geo.rect.top <= geo.headerBottom + 1) && geo.rect.bottom >= vh - 2
  out.hiddenFocusable = geo.hiddenFocusable
  out.dvh = geo.dvh
  out.safeArea = geo.safe
  out.cutOff = geo.cut
  out.opaque = geo.opaque && geo.through.length === 0
  if (!out.opaque) out.detail += ` see-through: ${geo.opaque ? "" : "panel fill not solid; "}${geo.through.join(", ")}`
  /* Focus: moved in on open. */
  out.focusIn = await focusArrives(panel)
  /* Trapped: tab through every focusable and one more each way. */
  const n = await panel.evaluate((p) => window.__H.focusables(p).length)
  let trapped = true
  for (let i = 0; i < Math.min(n + 2, 24); i++) {
    await tab.keyboard.press("Tab")
    if (!(await panel.evaluate((p, b) => p.contains(document.activeElement) || document.activeElement === b, btn))) { trapped = false; break }
  }
  if (trapped) for (let i = 0; i < 2; i++) {
    await tab.keyboard.down("Shift"); await tab.keyboard.press("Tab"); await tab.keyboard.up("Shift")
    if (!(await panel.evaluate((p, b) => p.contains(document.activeElement) || document.activeElement === b, btn))) { trapped = false; break }
  }
  out.focusTrap = trapped
  /* The page behind does not scroll. */
  const y0 = await tab.evaluate(() => window.scrollY)
  await tab.evaluate(() => { window.scrollBy(0, 400) })
  await tab.mouse.move(vw - 4, vh - 4)
  await tab.mouse.wheel({ deltaY: 400 })
  await settle(tab, 200)
  const y1 = await tab.evaluate(() => window.scrollY)
  const locked = await tab.evaluate(() => { const h = getComputedStyle(document.documentElement), b = getComputedStyle(document.body); return /hidden|clip/.test(h.overflowY) || /hidden|clip/.test(b.overflowY) || b.position === "fixed" })
  out.scrollLock = y1 === y0 || locked
  await tab.evaluate((y) => window.scrollTo(0, y), y0)
  /* A long menu scrolls inside: thirty more links, and the last one reachable. */
  out.scrolls = await panel.evaluate(async (p, vh) => {
    const H = window.__H
    const link = [...p.querySelectorAll("li")].find((e) => H.deepVis(e) && e.querySelector("a")) || [...p.querySelectorAll("a")].find((e) => H.deepVis(e))
    if (!link) return null
    const added = []
    for (let i = 0; i < 30; i++) { const c = link.cloneNode(true); c.setAttribute("data-r56-clone", ""); link.parentElement.appendChild(c); added.push(c) }
    const last = added[added.length - 1]
    last.scrollIntoView({ block: "end" })
    await new Promise((r) => setTimeout(r, 120))
    const r = last.getBoundingClientRect()
    const top = document.elementFromPoint(Math.min(r.left + 8, window.innerWidth - 2), Math.max(0, r.bottom - 6))
    const ok = r.bottom <= vh + 1 && r.top >= 0 && !!top && (last.contains(top) || top === last)
    for (const c of added) c.remove()
    for (let e = p; e; e = e.parentElement) e.scrollTop = 0
    return ok
  }, vh)
  /* Language and currency inside the menu. */
  out.selector = await selectorIn(tab, panel, vw, vh)
  /* Close by its button. */
  const closeBtn = await panel.evaluateHandle((p, opener) => [...p.querySelectorAll("button, [role=button]")].find((b) => window.__H.deepVis(b) && /close|dismiss/i.test(`${b.getAttribute("aria-label") || ""} ${b.textContent || ""}`)) || (window.__H.deepVis(opener) && /close/i.test(opener.getAttribute("aria-label") || "") ? opener : null), btn)
  if (await closeBtn.evaluate((b) => !!b)) {
    await closeBtn.click().catch(() => undefined)
    await settle(tab, 600)
    out.closeButton = !(await isOpen(tab, panel))
    if (out.closeButton) {
      out.focusBack = await btn.evaluate((b) => document.activeElement === b || b.contains(document.activeElement))
    }
  } else out.closeButton = false
  /* Escape. */
  const reopen = async () => {
    if (await isOpen(tab, panel)) return true
    const before2 = await panelKeys(tab)
    await btn.click().catch(() => undefined)
    await settle(tab, 650)
    panel = await openPanelAfter(tab, before2)
    return panel.evaluate((p) => !!p)
  }
  if (await reopen()) {
    await tab.keyboard.press("Escape")
    await settle(tab, 600)
    out.escape = !(await isOpen(tab, panel))
    if (out.escape && out.focusBack === null) out.focusBack = await btn.evaluate((b) => document.activeElement === b || b.contains(document.activeElement))
  }
  /* The backdrop: a press outside the panel (a full screen panel has none to press). */
  if (await reopen()) {
    const r = await panel.evaluate((p) => { const x = p.getBoundingClientRect(); return { l: x.left, r: x.right, t: x.top, b: x.bottom } })
    const spot = r.r < vw - 30 ? [vw - 12, vh / 2] : r.l > 30 ? [12, vh / 2] : r.t > 60 ? [vw / 2, 20] : null
    if (spot) {
      await tab.mouse.click(spot[0], spot[1])
      await settle(tab, 600)
      out.backdrop = !(await isOpen(tab, panel))
    } else out.backdrop = "n/a (full screen)"
    if (await isOpen(tab, panel)) { await tab.keyboard.press("Escape"); await settle(tab, 400) }
  }
  return out
}

/* A language, currency or country selector inside `scope` (a handle or null for the header). */
async function selectorIn(tab, scope, vw, vh) {
  const btn = await tab.evaluateHandle((scope) => {
    const H = window.__H
    const rootEl = scope || H.headerBox() || document
    return [...rootEl.querySelectorAll("button, [role=button], select")].find((e) => H.deepVis(e) && /language|currency|region|country|locale|EUR|USD|\bEN\b/i.test(`${e.getAttribute("aria-label") || ""} ${e.getAttribute("popovertarget") || ""} ${e.textContent || ""}`) && !e.closest("[popover]:not(:popover-open)") && (!scope || scope.contains(e))) || null
  }, scope)
  if (!(await btn.evaluate((b) => !!b))) return { found: false }
  if (await btn.evaluate((b) => b.tagName === "SELECT")) {
    const ok = await btn.evaluate((b, vw) => { const r = b.getBoundingClientRect(); return r.left >= -1 && r.right <= vw + 1 }, vw)
    return { found: true, kind: "select", onScreen: ok, usable: ok }
  }
  const before = await panelKeys(tab)
  const popBefore = await tab.evaluate(() => [...document.querySelectorAll(":popover-open")].length)
  await btn.click().catch(() => undefined)
  await settle(tab, 450)
  /* Its panel: a popover it names, a newly shown fixed panel, or the element after it. */
  const panel = await tab.evaluateHandle((b, before) => {
    const H = window.__H
    const id = b.getAttribute("popovertarget") || b.getAttribute("aria-controls")
    if (id && document.getElementById(id) && H.deepVis(document.getElementById(id))) return document.getElementById(id)
    const pops = [...document.querySelectorAll(":popover-open")].filter((p) => !p.contains(b))
    if (pops.length) return pops[pops.length - 1]
    const now = H.panels().filter((e) => !before.includes(H.label(e) + e.getBoundingClientRect().width) && !e.contains(b))
    if (now.length) return now[0]
    const list = [...document.querySelectorAll("[role=listbox], [role=menu], [role=dialog]")].filter((e) => H.deepVis(e) && !e.contains(b))
    return list[list.length - 1] || null
  }, btn, before)
  if (!(await panel.evaluate((p) => !!p))) return { found: true, opens: false, popBefore }
  const r = await panel.evaluate((p, vw, vh) => {
    const H = window.__H
    const x = p.getBoundingClientRect()
    const opts = [...p.querySelectorAll("button, a, [role=option], [role=menuitem]")].filter((e) => H.deepVis(e))
    const reachable = opts.filter((o) => { const q = o.getBoundingClientRect(); const t = document.elementFromPoint(Math.min(vw - 2, q.left + q.width / 2), Math.min(vh - 2, q.top + q.height / 2)); return t && (o.contains(t) || t === o) }).length
    return { left: Math.round(x.left), right: Math.round(x.right), top: Math.round(x.top), bottom: Math.round(x.bottom), options: opts.length, reachable }
  }, vw, vh)
  const onScreen = r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1
  await tab.keyboard.press("Escape")
  await settle(tab, 300)
  return { found: true, opens: true, onScreen, usable: r.options > 0 && r.reachable === r.options, rect: r }
}

async function panelCheck(tab, kind, vw, vh) {
  const btn = await tab.evaluateHandle((kind) => {
    const H = window.__H
    const hd = H.headerBox() || document
    const re = kind === "cart" ? /cart|bag|basket/i : /search/i
    return [...hd.querySelectorAll("button, a")].find((e) => H.deepVis(e) && !e.closest("[popover], aside, [role=dialog]") && (re.test(e.getAttribute("aria-label") || "") || e.hasAttribute(kind === "cart" ? "data-storelib-cart" : "data-storelib-search"))) || null
  }, kind)
  if (!(await btn.evaluate((b) => !!b))) return { found: false }
  await tab.evaluate(() => window.scrollTo(0, 0))
  const before = await panelKeys(tab)
  await btn.evaluate((b) => b.addEventListener("click", (e) => { if (b.tagName === "A") e.preventDefault() }, { once: true }))
  await btn.click().catch(() => undefined)
  await settle(tab, 650)
  let panel = await openPanelAfter(tab, before)
  if (!(await panel.evaluate((p) => !!p)) && kind === "search") {
    /* A search that opens in the header row: its field, shown and focused. */
    panel = await tab.evaluateHandle(() => { const a = document.activeElement; return a && a.matches("input") && window.__H.deepVis(a) ? (a.closest("form, [role=search], [role=dialog]") || a.parentElement) : null })
  }
  if (!(await panel.evaluate((p) => !!p))) return { found: true, opens: false }
  const r = await panel.evaluate((p, vw, vh) => {
    const x = p.getBoundingClientRect()
    const cut = [...p.querySelectorAll("a, button, input, p, h2")].filter((e) => window.__H.deepVis(e)).filter((e) => { const q = e.getBoundingClientRect(); return q.right > vw + 1 || q.left < -1 }).map((e) => window.__H.label(e))
    return { left: Math.round(x.left), right: Math.round(x.right), top: Math.round(x.top), bottom: Math.round(x.bottom), focusIn: p.contains(document.activeElement), cut: cut.slice(0, 4) }
  }, vw, vh)
  const onScreen = r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1 && r.cut.length === 0
  const focusIn = r.focusIn || (await focusArrives(panel))
  await tab.keyboard.press("Escape")
  await settle(tab, 600)
  const closes = !(await panel.evaluate((p) => window.__H.deepVis(p) && getComputedStyle(p).visibility !== "hidden").catch(() => false))
  return { found: true, opens: true, onScreen, focusIn, escape: closes, rect: r }
}

/* ── 4. run ───────────────────────────────────────────────────────────── */

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--font-render-hinting=none"] })
const results = []
for (const site of sites) {
  const html = pageFor(site)
  for (const vw of WIDTHS) {
    const vh = vw < 768 ? 780 : vw < 1100 ? 1000 : 820
    const tab = await browser.newPage()
    const errors = []
    tab.on("pageerror", (e) => errors.push(String(e?.message || e).slice(0, 160)))
    await tab.setRequestInterception(true)
    tab.on("request", (req) => {
      const u = req.url()
      if (u === "https://site.r56.test/") return void req.respond({ status: 200, contentType: "text/html", body: html })
      if (/^(data|blob|about):/.test(u)) return void req.continue().catch(() => undefined)
      /* Pictures and fonts are not fetched: a grey picture in their place. */
      if (req.resourceType() === "image") return void req.respond({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#9a9a9a"/></svg>' }).catch(() => undefined)
      return void req.respond({ status: 404, body: "" }).catch(() => undefined)
    })
    const phone = vw < 768
    const shotOk = SHOTS && SHOT_WIDTHS.has(vw)
    await tab.setViewport({ width: vw, height: vh, deviceScaleFactor: shotOk ? 2 : 1, isMobile: phone, hasTouch: phone })
    await tab.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    const row = { site: site.key, engine: site.engine, label: site.label, width: vw, errors }
    try {
      await tab.goto("https://site.r56.test/", { waitUntil: "load", timeout: 30_000 })
      await tab.waitForFunction("window.__ready === true || !!window.__error", { timeout: 20_000 })
      await settle(tab, 500)
      await tab.evaluate(HELPERS)
      if (process.env.DUMP) writeFileSync(join(OUT, `${site.key}-${vw}.html`), await tab.evaluate(() => document.getElementById("app").outerHTML))
      if (shotOk) await tab.screenshot({ path: join(OUT, `${site.key}-${vw}.jpg`), type: "jpeg", quality: 72 }).catch(() => undefined)
      row.static = await measureStatic(tab)
      row.drawer = await drawerChecks(tab, vw, vh, shotOk ? join(OUT, `${site.key}-${vw}-menu.jpg`) : null)
      await tab.evaluate(() => window.scrollTo(0, 0))
      row.selector = await selectorIn(tab, null, vw, vh)
      row.cart = await panelCheck(tab, "cart", vw, vh)
      row.search = await panelCheck(tab, "search", vw, vh)
    } catch (e) {
      row.crash = String(e?.message || e).slice(0, 300)
    }
    await tab.close().catch(() => undefined)
    results.push(row)
    process.stdout.write(".")
  }
}
await browser.close()
console.log("")

/* ── 5. verdicts ──────────────────────────────────────────────────────── */

const INDIGO = (c) => { const m = /rgba?\((\d+), (\d+), (\d+)/.exec(c || ""); if (!m) return false; const [r, g, b] = [+m[1], +m[2], +m[3]]; return Math.abs(r - 99) < 6 && Math.abs(g - 102) < 6 && Math.abs(b - 241) < 6 }

/** Each row's checks, as [check, ok, detail]; null ok is "not applicable". */
export function verdicts(r) {
  const v = []
  const add = (id, ok, detail = "") => v.push({ id, ok, detail })
  if (r.crash) { add("render", false, r.crash); return v }
  add("render", r.errors.length === 0, r.errors.join(" | "))
  const s = r.static
  add("overflow", s.scrollOver <= 0 && s.pastCount === 0, `${s.scrollOver}px; ${s.past.join(", ")}`)
  add("header.fits", s.header.found && s.header.offscreen.length === 0 && s.header.overlap.length === 0, [...s.header.offscreen, ...s.header.overlap].join(", "))
  add("header.no-clip-or-wrap", s.header.clipped.length === 0 && s.header.wrapped.length === 0, [...s.header.clipped, ...s.header.wrapped].join(", "))
  add("taps.44", s.small.length === 0, `${s.small.length}/${s.taps}: ${s.small.slice(0, 6).join(", ")}`)
  add("contrast", s.low.length === 0, `${s.low.length}/${s.texts}: ${s.low.slice(0, 5).join(", ")}`)
  if (s.cta) add("cta.palette", !INDIGO(s.cta.background) && (s.cta.ratio ?? 0) >= 4.5, `${s.cta.text} ${s.cta.background} on ${s.cta.color} ${s.cta.ratio}:1 → ${s.cta.href}`)
  const d = r.drawer
  if (d.found) {
    add("drawer.opens", d.opens, d.detail)
    if (d.opens) {
      add("drawer.close-button", d.closeButton === true)
      add("drawer.escape", d.escape === true)
      add("drawer.backdrop", d.backdrop === true || String(d.backdrop).startsWith("n/a") ? true : d.backdrop === null ? null : false, String(d.backdrop))
      add("drawer.full-height", d.fullHeight === true)
      add("drawer.dvh-css", d.dvh === true)
      add("drawer.safe-area-css", d.safeArea === true)
      add("drawer.nothing-cut", d.cutOff.length === 0, d.cutOff.join(", "))
      if (d.hiddenFocusable) add("drawer.no-hidden-focus", d.hiddenFocusable.length === 0, d.hiddenFocusable.join(", "))
      add("drawer.long-scrolls", d.scrolls === null ? null : d.scrolls === true)
      add("drawer.scroll-lock", d.scrollLock === true)
      add("drawer.focus-in", d.focusIn === true)
      add("drawer.focus-trap", d.focusTrap === true)
      add("drawer.focus-back", d.focusBack === true)
      add("drawer.opaque", d.opaque === true, d.detail)
      if (d.selector?.found) add("drawer.selector", d.selector.opens !== false && d.selector.onScreen !== false && d.selector.usable !== false, JSON.stringify(d.selector.rect ?? {}))
    }
  } else if (r.width < 768) add("drawer.opens", false, d.detail)
  if (r.selector?.found) add("selector.on-screen", r.selector.opens !== false && r.selector.onScreen === true && r.selector.usable !== false, JSON.stringify(r.selector.rect ?? {}))
  for (const k of ["cart", "search"]) {
    const p = r[k]
    if (!p?.found) continue
    add(`${k}.opens`, p.opens === true)
    if (p.opens) {
      add(`${k}.on-screen`, p.onScreen === true, JSON.stringify(p.rect ?? {}))
      add(`${k}.escape`, p.escape === true)
      add(`${k}.focus-in`, p.focusIn === true)
    }
  }
  return v
}

const table = {}
let failures = 0
for (const r of results) {
  r.checks = verdicts(r)
  for (const c of r.checks) {
    const k = `${c.id}@${r.width}`
    table[k] ??= { pass: 0, fail: 0, sites: [] }
    if (c.ok === null) continue
    if (c.ok) table[k].pass++
    else { table[k].fail++; failures++; table[k].sites.push(r.site) }
  }
}
const ids = [...new Set(Object.keys(table).map((k) => k.split("@")[0]))]
console.log(`\n${"check".padEnd(26)}${WIDTHS.map((w) => String(w).padStart(10)).join("")}   (failing sites / measured)`)
for (const id of ids) {
  const cells = WIDTHS.map((w) => { const t = table[`${id}@${w}`]; return (t ? `${t.fail}/${t.pass + t.fail}` : "-").padStart(10) })
  console.log(`${id.padEnd(26)}${cells.join("")}`)
}
const summary = { at: new Date().toISOString(), sites: sites.map((s) => s.key), widths: WIDTHS, failures, table, slop: Object.fromEntries(Object.entries(slop).map(([k, v]) => [k, { chrome: v.chrome.warnings, chromeErrors: v.chrome.errors, site: v.site.warnings, siteErrors: v.site.errors, rules: v.chrome.rules }])) }
writeFileSync(join(OUT, "results.json"), JSON.stringify({ summary, results }, null, 2))
if (!process.env.OUT || process.env.SAVE_LAST === "1") writeFileSync(join(root, ".ai-site-chrome-r56-last.json"), JSON.stringify(summary, null, 2))
console.log(`\n${failures} failing checks. ${join(OUT, "results.json")}`)
process.exit(failures ? 1 : 0)
