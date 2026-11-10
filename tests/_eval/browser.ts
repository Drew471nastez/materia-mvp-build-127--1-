/**
 * Round R (R4): every generated website in real Chromium.
 *
 *   JS OFF   O4's own draft document (composeDraftDocument: the page drawn by
 *            the template engine from the draft, scripts stripped, a CSP that
 *            forbids them) with JavaScript disabled, at 1440 and 390, measured
 *            by O4's own script and turned into O4's defects (measuredDefects).
 *            Photographed: the first screen and the whole page.
 *   JS ON    the same sections mounted the way the live site mounts them
 *            (tests/_headless/chrome-platform-probe.tsx: the real section box,
 *            the real storefront hooks and header scroll state, in the real
 *            cart and storefront providers), at 390: any page error, and the
 *            phone menu opened by its own button.
 *
 * The network is answered here: pictures on the eval host are drawn by
 * ./images.ts, Google Fonts are fetched once through curl (the environment's
 * proxy) and cached, anything else is refused. Nothing an AI wrote runs: the
 * documents carry no section script (the runtime keeps them out of the markup,
 * and the JS-off document strips and forbids them).
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { composeDraftDocument } from "@/lib/ai-builder/visual-critic/document"
import { measureScript, measuredDefects } from "@/lib/ai-builder/visual-critic/measure"
import type { Measurements } from "@/lib/ai-builder/visual-critic/measure"
import { themeStylesheet, themeVars } from "@/lib/website-builder/theme-css"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"
import type { BrowserPage, BrowserResult, EvalShot, EvalSite } from "@/lib/ai-builder/eval/types"
import { evalImageBytes } from "./images"

type Browser = import("puppeteer-core").Browser
type Page = import("puppeteer-core").Page

export const CHROMIUM = process.env.CHROMIUM_PATH && existsSync(process.env.CHROMIUM_PATH) ? process.env.CHROMIUM_PATH : "/opt/pw-browsers/chromium"
export const browserHere = () => existsSync(CHROMIUM)

const FONT_CACHE = join(tmpdir(), "storelib-eval-fonts")
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
let fontsReachable: boolean | null = null

/** A Google Fonts file through curl (the environment's proxy), cached on disk. Null when it cannot be had. */
function fontBytes(url: string): { body: Buffer; type: string } | null {
  if (!/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url) || fontsReachable === false) return null
  mkdirSync(FONT_CACHE, { recursive: true })
  const file = join(FONT_CACHE, createHash("sha1").update(url).digest("hex"))
  const type = url.includes("googleapis") ? "text/css" : "font/woff2"
  if (existsSync(file)) return { body: readFileSync(file), type }
  try {
    const body = execFileSync("curl", ["-sSfL", "--max-time", "12", "-A", UA, url], { maxBuffer: 8 << 20 })
    writeFileSync(file, body)
    fontsReachable = true
    return { body, type }
  } catch {
    fontsReachable = fontsReachable ?? false
    return null
  }
}

export function fontsLoaded(): boolean | null {
  return fontsReachable
}

async function fence(tab: Page, html: string | null): Promise<void> {
  await tab.setRequestInterception(true)
  tab.on("request", (req) => {
    if (req.isInterceptResolutionHandled()) return
    const url = req.url()
    if (html !== null && req.isNavigationRequest() && url.startsWith("https://site.eval.storelib.test/")) return void req.respond({ status: 200, contentType: "text/html", body: html })
    if (/^(data|blob|about):/.test(url)) return void req.continue().catch(() => undefined)
    void (async () => {
      const picture = await evalImageBytes(url).catch(() => null)
      if (picture) return req.respond({ status: 200, contentType: "image/jpeg", body: picture })
      const font = fontBytes(url)
      if (font) return req.respond({ status: 200, contentType: font.type, body: font.body, headers: { "access-control-allow-origin": "*" } })
      return req.abort("blockedbyclient")
    })().catch(() => undefined)
  })
}

const VIEWS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const

async function save(buf: Buffer, file: string, width: number): Promise<void> {
  await sharp(buf).resize({ width, withoutEnlargement: true }).jpeg({ quality: 70 }).toFile(file)
}

/** The draft document O4 photographs (JS off), for one page. */
export function draftHtml(site: EvalSite, page: string): { html: string; failed: string[] } {
  const doc = composeDraftDocument({ page, pages: site.pages, settings: site.settings, sources: site.sources, capabilities: site.capabilities })
  return { html: doc.html, failed: doc.failed.map((f) => `${f.type}: ${f.error}`) }
}

/** One page at one size, JS off: measured, and photographed when `shot` names a file stem. */
async function measurePage(browser: Browser, html: string, view: "desktop" | "mobile", shot: string | null): Promise<{ m: Measurements; fold?: string; full?: string }> {
  const tab = await browser.newPage()
  try {
    await tab.setJavaScriptEnabled(false)
    await fence(tab, null)
    await tab.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    const v = VIEWS[view]
    await tab.setViewport({ width: v.width, height: v.height, deviceScaleFactor: 1, isMobile: view === "mobile", hasTouch: view === "mobile" })
    await tab.setContent(html, { waitUntil: "load", timeout: 20_000 }).catch(() => undefined)
    await tab.waitForNetworkIdle({ idleTime: 250, timeout: 5_000 }).catch(() => undefined)
    await tab.evaluate("document.fonts && document.fonts.ready.then(() => true)").catch(() => undefined)
    const m = { ...((await tab.evaluate(measureScript(v.height))) as Omit<Measurements, "viewport">), viewport: view } as Measurements
    const out: { m: Measurements; fold?: string; full?: string } = { m }
    if (shot) {
      const fold = Buffer.from(await tab.screenshot({ type: "jpeg", quality: 82, clip: { x: 0, y: 0, width: v.width, height: v.height } }))
      await save(fold, `${shot}-${view}-fold.jpg`, view === "desktop" ? 1200 : 390)
      out.fold = `${shot}-${view}-fold.jpg`
      const height = Math.max(v.height, Math.min(m.pageHeight, view === "desktop" ? 9000 : 12000))
      const full = Buffer.from(await tab.screenshot({ type: "jpeg", quality: 75, clip: { x: 0, y: 0, width: v.width, height }, captureBeyondViewport: true }))
      await save(full, `${shot}-${view}-full.jpg`, view === "desktop" ? 640 : 300)
      out.full = `${shot}-${view}-full.jpg`
    }
    return out
  } finally {
    await tab.close().catch(() => undefined)
  }
}

/* ── JS on: the live site's runtime, from the Q1 probe ────────────────── */

let probeJs: string | null = null

/** The probe page's bundle (React, the real hooks), built once with esbuild. */
export async function buildProbe(root = process.cwd()): Promise<string> {
  if (probeJs) return probeJs
  const stubs = join(root, ".ai-eval-r4-probe")
  mkdirSync(stubs, { recursive: true })
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
    await build({
      entryPoints: [join(root, "tests/_headless/chrome-platform-probe.tsx")],
      bundle: true,
      format: "iife",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      alias: { "@": ".", "next/navigation": "./.ai-eval-r4-probe/navigation.js", "next/link": "./.ai-eval-r4-probe/link.jsx" },
      banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
      loader: { ".css": "empty" },
      outfile: join(stubs, "app.js"),
      logLevel: "error",
      absWorkingDir: root,
      nodePaths: [join(root, "node_modules")],
    })
    probeJs = readFileSync(join(stubs, "app.js"), "utf8")
    return probeJs
  } finally {
    rmSync(stubs, { recursive: true, force: true })
  }
}

/** The JS-off document's sections, read back out of it (markup and CSS each), in order. */
async function sectionsOf(browser: Browser, html: string): Promise<{ id: string; type: string; html: string; css: string }[]> {
  const tab = await browser.newPage()
  try {
    await tab.setJavaScriptEnabled(false)
    await fence(tab, null)
    await tab.setContent(html, { waitUntil: "domcontentloaded" }).catch(() => undefined)
    return (await tab.evaluate(`[...document.querySelectorAll("[data-critic-section]")].map((el) => { const style = el.querySelector(":scope > style"); const css = style ? style.textContent : ""; if (style) style.remove(); return { id: el.getAttribute("data-critic-section"), type: el.getAttribute("data-critic-type"), html: el.innerHTML, css } })`)) as { id: string; type: string; html: string; css: string }[]
  } finally {
    await tab.close().catch(() => undefined)
  }
}

async function interactive(browser: Browser, site: EvalSite, html: string, shot: string | null): Promise<NonNullable<BrowserResult["interactive"]> & { menuShot?: string }> {
  const js = await buildProbe()
  const home = site.pages.find((p) => p.key === "home")?.sections ?? []
  const groupOf = new Map(home.map((s) => [s.id, s.group]))
  const sections = (await sectionsOf(browser, html)).map((s) => ({ id: s.id, html: s.html, css: s.css, ...(groupOf.get(s.id) ? { group: groupOf.get(s.id) } : {}) }))
  const theme = site.settings as unknown as ThemeSettingsValues
  const probe = { sections, css: themeStylesheet(theme), vars: themeVars(theme), theme, storefront: { creatorId: "11111111-1111-4111-8111-111111111111", pages: site.pages.map((p) => p.key) } }
  const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="app"></div><script>window.__PROBE__=${JSON.stringify(probe).replace(/</g, "\\u003c")}</script><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const tab = await browser.newPage()
  const errors: string[] = []
  tab.on("pageerror", (e) => errors.push(String((e as Error).message || e).slice(0, 200)))
  try {
    await fence(tab, page)
    await tab.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
    await tab.goto("https://site.eval.storelib.test/", { waitUntil: "load", timeout: 20_000 })
    await new Promise((r) => setTimeout(r, 400))
    if (!sections.some((s) => s.group === "header")) return { errors, menu: "builtin", menuLinks: 0, detail: "the site wears Storelib's built-in header (a React component the app draws), not drawn outside the app" }
    /* The phone menu's button: a hooked one (data-storelib-menu) or a native popover (the P4 kit's headers). */
    const handles = await tab.$$("[data-chrome] [data-storelib-menu]:not([data-storelib-menu-panel]), [data-chrome] button[popovertarget]")
    let button: (typeof handles)[number] | null = null
    for (const h of handles) {
      const fits = await h.evaluate((el) => (el as HTMLElement).getClientRects().length > 0 && getComputedStyle(el as HTMLElement).visibility !== "hidden" && !/search|cart|bag|currency|language|locale/i.test(`${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("popovertarget") ?? ""}`))
      if (fits) {
        button = h
        break
      }
    }
    if (!button) return { errors, menu: "no-menu", menuLinks: 0, detail: handles.length ? "the menu button is hidden at 390" : "no menu button (data-storelib-menu or a popover) in the header" }
    const target = await button.evaluate((el) => el.getAttribute("popovertarget"))
    await button.click()
    await new Promise((r) => setTimeout(r, 450))
    /* The drawer's own pictures load lazily once it is open. */
    await tab.waitForNetworkIdle({ idleTime: 250, timeout: 4_000 }).catch(() => undefined)
    const state = (await tab.evaluate(`(() => { const t = ${JSON.stringify(target)}; const p = t ? document.getElementById(t) : document.querySelector("[data-storelib-menu-panel]"); if (!p) return { open: false, links: 0, how: "no panel of its own" }; const open = t ? p.matches(":popover-open") : (p.getAttribute("data-open") === "true" || (!p.hidden && p.getClientRects().length > 0 && getComputedStyle(p).visibility !== "hidden")); const links = [...p.querySelectorAll("a[href]")].filter((a) => a.getClientRects().length > 0).length; return { open, links, how: t ? "the header's own popover drawer" : "the header's own drawer (hooks)" } })()`)) as { open: boolean; links: number; how: string }
    let menuShot: string | undefined
    if (shot && state.open) {
      const buf = Buffer.from(await tab.screenshot({ type: "jpeg", quality: 80 }))
      await save(buf, `${shot}-mobile-menu.jpg`, 390)
      menuShot = `${shot}-mobile-menu.jpg`
    }
    return { errors, menu: state.open && state.links > 0 ? "opened" : "did-not-open", menuLinks: state.links, detail: state.how, ...(menuShot ? { menuShot } : {}) }
  } catch (e) {
    errors.push(e instanceof Error ? e.message.slice(0, 200) : "the probe failed")
    return { errors, menu: "did-not-open", menuLinks: 0, detail: "the probe failed" }
  } finally {
    await tab.close().catch(() => undefined)
  }
}

/** Pages to look at: home, and the first page of the site's own (about, coaching...). */
export function pagesToCheck(site: EvalSite): string[] {
  const own = site.pages.filter((p) => !["home", "product", "collection", "products", "search", "cart", "404", "contact", "blogs", "article"].includes(p.key) && p.sections.some((s) => !s.group))
  return ["home", ...(own[0] ? [own[0].key] : [])]
}

/**
 * The browser's whole look at a site: both pages JS off at both sizes (home photographed), and home JS on.
 * `shotStem` is a file path stem for the pictures (null: no pictures).
 */
export async function browseSite(browser: Browser | null, site: EvalSite, shotStem: string | null): Promise<BrowserResult> {
  if (!browser) return { unavailable: `no Chromium at ${CHROMIUM}`, pages: [], interactive: null, shots: [] }
  const pages: BrowserPage[] = []
  const shots: EvalShot[] = []
  let homeHtml = ""
  for (const key of pagesToCheck(site)) {
    const { html } = draftHtml(site, key)
    if (key === "home") homeHtml = html
    const stem = shotStem ? `${shotStem}-${key}` : null
    const d = await measurePage(browser, html, "desktop", stem)
    const m = await measurePage(browser, html, "mobile", stem)
    pages.push({ page: key, desktop: d.m, mobile: m.m, defects: [...measuredDefects(key, d.m), ...measuredDefects(key, m.m)] })
    shots.push({ page: key, ...(d.full ? { desktop: d.full } : {}), ...(m.full ? { mobile: m.full } : {}), ...(d.fold ? { desktopFold: d.fold } : {}), ...(m.fold ? { mobileFold: m.fold } : {}) })
  }
  const i = await interactive(browser, site, homeHtml, shotStem ? `${shotStem}-home` : null)
  if (i.menuShot) shots[0] = { ...shots[0], mobileMenu: i.menuShot }
  const { menuShot: _m, ...rest } = i
  return { pages, interactive: rest, shots }
}

/** Only photographs of one state (the refinement's before), JS off, home. */
export async function shootHome(browser: Browser | null, site: EvalSite, shotStem: string): Promise<EvalShot | null> {
  if (!browser) return null
  const { html } = draftHtml(site, "home")
  const d = await measurePage(browser, html, "desktop", shotStem)
  const m = await measurePage(browser, html, "mobile", shotStem)
  return { page: "home", ...(d.full ? { desktop: d.full } : {}), ...(m.full ? { mobile: m.full } : {}), ...(d.fold ? { desktopFold: d.fold } : {}), ...(m.fold ? { mobileFold: m.fold } : {}) }
}

export async function launchBrowser(): Promise<Browser | null> {
  if (!browserHere()) return null
  const puppeteer = (await import("puppeteer-core")).default
  /* Over a pipe, not a socket: the journey's network refuses node's http (tests/_journey/net.ts). */
  return puppeteer.launch({ executablePath: CHROMIUM, headless: true, pipe: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--font-render-hinting=none"] })
}
