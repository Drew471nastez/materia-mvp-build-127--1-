/**
 * ===========================================================================
 *  A PUBLISHED WEBSITE'S SPEED, MEASURED (ROUND V1)
 * ===========================================================================
 *   npx tsx scripts/check-live-speed.ts            (Chromium at /opt/pw-browsers/chromium)
 *   LIVE=0 npx tsx scripts/check-live-speed.ts     (skip the live site read)
 *
 * Four measurements, each before and after, each from real markup:
 *
 *   FIRST PICTURE   a page whose first section is a picture section written
 *                   with loading="lazy" (about_image, as Storelib's theme
 *                   ships it), drawn by renderWithSources, in Chromium on a
 *                   throttled connection: when the picture is asked for and
 *                   the page's Largest Contentful Paint, with the pass alone
 *                   (before) and with the top of the page marked (after)
 *   SCRIPT          the published site's client entry bundled with esbuild:
 *                   everything in one file (what every visitor downloaded
 *                   before) against the entry and what it loads statically
 *                   once the legacy section renderers are fetched on demand
 *   IMPORTED PAGE   a live imported theme's front page read from the web, and
 *                   the same page with no srcset of five copies of a picture
 *                   the optimizer cannot size (lib/storelib-theme/compat/
 *                   filters.ts): bytes, raw and compressed
 *   OPENING TAB     the tab the builder opens for a preview, in Chromium:
 *                   its title the moment it opens (never "about:blank"),
 *                   its message when the link cannot be made
 *
 * Exits 1 on a failed check.
 */
import { createServer } from "node:http"
import { gzipSync, brotliCompressSync } from "node:zlib"
import { build } from "esbuild"
import puppeteer, { type Browser, type Page, type Target } from "puppeteer-core"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"
import { renderWithSources } from "../lib/website-builder/storefront-render"
import { renderStorelibSection } from "../lib/website-builder/storelib-runtime"
import type { SectionInstance, ThemeSettingsValues } from "../lib/website-builder/types"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const ROOT = process.cwd()
let failed = 0
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail === undefined ? "" : `  (${typeof detail === "string" ? detail : JSON.stringify(detail)})`}`)
}
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`

/* ── 1. The first picture ─────────────────────────────────────────────── */

const theme = {} as ThemeSettingsValues
const sections: SectionInstance[] = [
  { id: "a1", type: "about_image", settings: { heading: "Made by hand", body: "<p>Small batches.</p>", image: "https://storelib.com/media/fixture/first.jpg" } } as unknown as SectionInstance,
  { id: "a2", type: "about_image", settings: { heading: "Second", image: "https://storelib.com/media/fixture/second.jpg" } } as unknown as SectionInstance,
  { id: "a3", type: "about_image", settings: { heading: "Third", image: "https://storelib.com/media/fixture/third.jpg" } } as unknown as SectionInstance,
  { id: "a4", type: "about_image", settings: { heading: "Fourth", image: "https://storelib.com/media/fixture/fourth.jpg" } } as unknown as SectionInstance,
]

function pageOf(drawn: Record<string, { html: string; css: string }>): string {
  const css = Object.values(drawn).map((d) => d.css).join("\n")
  const body = sections.map((s) => drawn[s.id]?.html ?? "").join("\n")
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixture</title><style>body{margin:0;font:16px system-ui}img{max-width:100%;height:auto;display:block}${css}</style>
<script>window.__lcp=0;new PerformanceObserver(function(l){var e=l.getEntries();window.__lcp=e[e.length-1].startTime}).observe({type:"largest-contentful-paint",buffered:true})</script></head><body>${body}</body></html>`
}

/* A 1200 by 800 picture, the same bytes for every request: big enough that its arrival is the page's largest paint. */
let jpeg: Buffer | null = null
async function picture(): Promise<Buffer> {
  if (jpeg) return jpeg
  const sharp = (await import("sharp")).default
  jpeg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 180, g: 140, b: 200 } } }).jpeg({ quality: 90 }).toBuffer()
  return jpeg
}

async function firstPicture(browser: Browser) {
  console.log("\nThe first picture of a page")
  const before: Record<string, { html: string; css: string }> = {}
  for (const s of sections) {
    const out = renderStorelibSection(s, theme, { template: "index" }, DEFAULT_THEME_SOURCES, [], undefined, undefined)
    if (out.ok) before[s.id] = { html: out.html, css: out.css }
  }
  const after = renderWithSources(DEFAULT_THEME_SOURCES, sections, theme, "index")
  const firstBefore = before.a1?.html.match(/<img\b[^>]*>/)?.[0] ?? ""
  const firstAfter = after.a1?.html.match(/<img\b[^>]*>/)?.[0] ?? ""
  check("before: the first picture was lazy", /loading="lazy"/.test(firstBefore), firstBefore.slice(0, 160))
  check("after: eager, fetchpriority high", /loading="eager"/.test(firstAfter) && /fetchpriority="high"/.test(firstAfter), firstAfter.slice(0, 200))
  check("after: a picture past the top three sections stays lazy", /loading="lazy"/.test(after.a4?.html ?? ""))

  const pages: Record<string, string> = { "/before": pageOf(before), "/after": pageOf(after) }
  const asked: { path: string; at: number }[] = []
  const t0 = { v: 0 }
  const server = createServer(async (req, res) => {
    const path = req.url ?? "/"
    if (pages[path]) {
      t0.v = Date.now()
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" })
      res.end(pages[path])
      return
    }
    asked.push({ path, at: Date.now() - t0.v })
    const body = await picture()
    res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store" })
    res.end(body)
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const results: Record<string, { lcp: number; firstAsked: number | null }> = {}
  try {
    for (const which of ["/before", "/after", "/before", "/after", "/before", "/after"]) {
      const p = await browser.newPage()
      await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
      const cdp = await p.createCDPSession()
      await cdp.send("Network.enable")
      /* A phone on a fast 3G connection, as Lighthouse's mobile run. */
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 })
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      asked.splice(0)
      await p.goto(`${origin}${which}`, { waitUntil: "networkidle0", timeout: 60_000 })
      await new Promise((r) => setTimeout(r, 300))
      const lcp = await p.evaluate(() => (window as unknown as { __lcp: number }).__lcp)
      const first = asked.find((a) => /first\.jpg/.test(decodeURIComponent(a.path)))
      const prev = results[which]
      /* The best of three runs each, so a stall on the shared machine is not counted against either. */
      if (!prev || lcp < prev.lcp) results[which] = { lcp, firstAsked: first?.at ?? null }
      await p.close()
    }
  } finally {
    server.close()
  }
  const b = results["/before"], a = results["/after"]
  console.log(`        before: first picture asked ${b.firstAsked} ms after the page, LCP ${Math.round(b.lcp)} ms`)
  console.log(`        after:  first picture asked ${a.firstAsked} ms after the page, LCP ${Math.round(a.lcp)} ms`)
  check("after: the page's largest paint is no later than before", a.lcp <= b.lcp + 50, { before: Math.round(b.lcp), after: Math.round(a.lcp) })
}

/* ── 2. The script ────────────────────────────────────────────────────── */

async function script() {
  console.log("\nThe published site's script")
  const entry = `
export { ThemePage } from "@/components/website-builder/theme/ThemePage"
export { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
export { CheckoutLinkOrigin } from "@/components/website-builder/checkout-link-origin"
export { CaptureTouch } from "@/components/attribution/capture-touch"
export { CheckoutReturnNotice } from "@/components/website-builder/checkout-return-notice"
export { SiteDocument } from "@/components/website-builder/site-document"
export { NewTabLinks } from "@/components/website-builder/new-tab-links"
export { SiteLinks } from "@/components/website-builder/site-links"
export { TrackView } from "@/components/analytics/track-view"
export { SiteVitals } from "@/components/website-builder/site-vitals"
`
  const common = {
    stdin: { contents: entry, resolveDir: ROOT, loader: "tsx" as const, sourcefile: "site-entry.tsx" },
    bundle: true, minify: true, format: "esm" as const, platform: "browser" as const, write: false, metafile: true,
    outdir: "/tmp/check-live-speed-unused", jsx: "automatic" as const, target: "es2020",
    alias: { "@": ROOT },
    external: ["react", "react-dom", "react/*", "react-dom/*", "next", "next/*", "server-only"],
    loader: { ".css": "empty" as const, ".svg": "dataurl" as const, ".png": "empty" as const, ".woff2": "empty" as const },
    define: { "process.env.NODE_ENV": '"production"' },
    absWorkingDir: ROOT, logLevel: "error" as const,
  }
  /* Before: every section renderer in the file every visitor downloads (no splitting puts every import() into the entry). */
  const whole = await build({ ...common, splitting: false })
  /* The language catalogues are fetched on their own in both, so they are left out of both counts. */
  const one = whole.outputFiles!.find((f) => /stdin\.js$/.test(f.path))!
  const split = await build({ ...common, splitting: true })
  const metaKey = (p: string) => Object.keys(split.metafile!.outputs).find((k) => k.split("/").pop() === p.split("/").pop())!
  const entryFile = split.outputFiles!.find((f) => /stdin\.js$/.test(f.path))!
  const entryMeta = split.metafile!.outputs[metaKey(entryFile.path)]
  let raw = entryFile.contents.length
  let gz = gzipSync(entryFile.contents).length
  for (const imp of entryMeta.imports ?? []) {
    if (imp.kind !== "import-statement") continue
    const f = split.outputFiles!.find((o) => o.path.split("/").pop() === imp.path.split("/").pop())
    if (f) { raw += f.contents.length; gz += gzipSync(f.contents).length }
  }
  /* What the whole file holds of the language catalogues, which are their own files in production too. */
  const catalogue = Object.entries(whole.metafile!.outputs[Object.keys(whole.metafile!.outputs).find((k) => /stdin\.js$/.test(k))!].inputs).filter(([f]) => /lib\/i18n\/catalog\/(?!index)/.test(f)).reduce((n, [, v]) => n + v.bytesInOutput, 0)
  const beforeRaw = one.contents.length - catalogue
  console.log(`        before: ${kb(beforeRaw)} minified in one file (the language catalogues left out)`)
  console.log(`        after:  ${kb(raw)} minified, ${kb(gz)} gzipped, loaded before the page can answer a tap; the section renderers in ${split.outputFiles!.filter((f) => /Section-[A-Z0-9]+\.js$/.test(f.path)).length} files of their own`)
  check("the script a page loads first is smaller", raw < beforeRaw - 60 * 1024, { before: kb(beforeRaw), after: kb(raw) })
}

/* ── 3. An imported theme's page ──────────────────────────────────────── */

async function importedPage() {
  console.log("\nAn imported theme's front page (live)")
  if (process.env.LIVE === "0") return console.log("        skipped (LIVE=0)")
  const url = process.env.LIVE_URL ?? "https://andrewrullz.storelib.com/"
  let html = ""
  try {
    const r = await fetch(url, { headers: { Accept: "text/html" } })
    html = await r.text()
  } catch (e) {
    return console.log(`        could not read ${url}: ${(e as Error).message}`)
  }
  /* What filters.ts now writes for a picture the optimizer cannot size: its src, no srcset of copies. */
  let copies = 0
  const after = html.replace(/<img\b([^>]*?)\ssrcset="([^"]*)"([^>]*)>/gi, (whole, a: string, set: string, b: string) => {
    const src = /\ssrc="([^"]*)"/.exec(` ${a} ${b}`)?.[1]
    const urls = set.split(/,\s+(?=\S)/).map((p) => p.trim().replace(/\s+\d+w$/, ""))
    if (!src || !urls.every((u) => u === src)) return whole
    copies++
    return `<img${a}${b}>`
  })
  console.log(`        ${url}: ${copies} pictures with a srcset of copies of themselves`)
  console.log(`        before: ${kb(html.length)} raw, ${kb(brotliCompressSync(html).length)} brotli`)
  console.log(`        after:  ${kb(after.length)} raw, ${kb(brotliCompressSync(after).length)} brotli`)
  check("the page is smaller without them", copies === 0 || after.length < html.length)
}

/* ── 4. The opening tab ───────────────────────────────────────────────── */

async function openingTab(browser: Browser) {
  console.log("\nThe tab opened for a preview")
  const bundled = await build({
    entryPoints: [`${ROOT}/lib/website-builder/opening-tab.ts`], bundle: true, write: false, format: "iife", globalName: "OpeningTab", platform: "browser", logLevel: "error",
  })
  const lib = bundled.outputFiles[0].text
  const page = `<!doctype html><html><head><meta charset="utf-8"><title>Builder</title><script>${lib}</script></head><body>
<button id="ok" onclick="var t=OpeningTab.openOpeningTab('Getting the preview of your drafts.');setTimeout(function(){t.go(location.origin+'/site')},600)">Preview</button>
<button id="bad" onclick="var t=OpeningTab.openOpeningTab();setTimeout(function(){t.fail('Could not make a preview link.')},300)">Broken</button></body></html>`
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    res.end(req.url === "/site" ? "<!doctype html><title>Maya's shop</title><h1>Maya</h1>" : page)
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  try {
    const p = await browser.newPage()
    await p.goto(origin, { waitUntil: "load" })
    const opened = new Promise<Page>((resolve) => browser.once("targetcreated", async (t: Target) => resolve((await t.page())!)))
    await p.click("#ok")
    const tab = await opened
    await new Promise((r) => setTimeout(r, 150))
    const early = { title: await tab.title(), text: await tab.evaluate(() => document.body?.innerText ?? "") }
    check("the moment it opens it says what it is, not about:blank", early.title === "Opening your website" && /Opening your website/.test(early.text), early)
    check("and the builder cannot be reached from it", await tab.evaluate(() => window.opener === null))
    await tab.waitForFunction(() => document.title === "Maya's shop", { timeout: 5000 })
    check("then it is the website", (await tab.title()) === "Maya's shop")
    await tab.close()

    const opened2 = new Promise<Page>((resolve) => browser.once("targetcreated", async (t: Target) => resolve((await t.page())!)))
    await p.click("#bad")
    const tab2 = await opened2
    await tab2.waitForFunction(() => /Could not make a preview link/.test(document.body?.innerText ?? ""), { timeout: 5000 })
    const said = { title: await tab2.title(), text: await tab2.evaluate(() => document.body.innerText) }
    check("a link that cannot be made is said in that tab, with a way to close it", said.title === "Could not open your website" && /Close this tab/.test(said.text), said)
  } finally {
    server.close()
  }
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
  try {
    await firstPicture(browser)
    await script()
    await importedPage()
    await openingTab(browser)
  } finally {
    await browser.close()
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  process.exit(failed ? 1 : 0)
}

void main()
