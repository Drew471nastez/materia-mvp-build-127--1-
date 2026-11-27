/**
 * ===========================================================================
 *  EVERY CARD IN ADD A SECTION, COUNTED
 * ===========================================================================
 *   npx tsx scripts/check-preview-reliability.ts <theme.zip | theme folder | native> [shots dir]
 *
 * "Many cards show only grey text with the section's name instead of a
 * preview." This opens the real editor (scripts/editor-probe-harness.mjs) on
 * an imported Shopify theme (a zip, or a folder such as
 * tests/fixtures/shopify-materia) or on the native default theme, opens Add
 * a section on All, scrolls the list from top to bottom as somebody would,
 * and counts every card: a real preview, a designed fallback, or still
 * waiting. For an imported theme it also reads each drawn section in the
 * cards' frame for words that should never be shown (a Liquid error, a
 * missing translation, a tag left in the text).
 *
 * Prints the counts and a line per card that is not a preview. Exits 1 when
 * a card is still waiting at the end, or any card shows broken words.
 */
import { createServer } from "node:http"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import JSZip from "jszip"
import puppeteer from "puppeteer-core"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function zipOf(path: string): Promise<JSZip> {
  if (statSync(path).isFile()) return JSZip.loadAsync(readFileSync(path))
  const zip = new JSZip()
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(path, p), readFileSync(p))
    }
  }
  walk(path)
  return zip
}

async function main() {
  const target = process.argv[2]
  const shots = process.argv[3]
  if (!target) { console.log("usage: npx tsx scripts/check-preview-reliability.ts <theme.zip | folder | native> [shots dir]"); process.exit(2) }
  const { bundle, css } = (await import("./editor-probe-harness.mjs")) as { bundle: string; css: string }
  let compat: unknown = null
  let assets: Record<string, string> = {}
  /* The theme's pictures, which the import keeps apart from its text files (served by the asset route on the site). */
  let binaries = new Map<string, Uint8Array>()
  if (target !== "native") {
    const r = await convertShopifyTheme(await zipOf(target))
    if (!r.ok) throw new Error(r.error)
    const sources = Object.fromEntries(Object.entries(r.theme.files).filter(([p]) => p.endsWith(".storelib")))
    const files = Object.fromEntries(Object.entries(r.theme.files).filter(([p, t]) => p.startsWith("shopify/") && !t.startsWith("base64:") && !/^shopify\/locales\/(?!.*\.default(\.schema)?\.json$)/.test(p)))
    const pages = Object.fromEntries(r.theme.pages.map((p) => [p.page_key, p.sections]))
    compat = { settings: r.theme.settings, pages, sources, files }
    assets = r.theme.files
    binaries = new Map(r.theme.binaries.map((b) => [b.name, b.bytes]))
    console.log(`${r.theme.name}: Add a section`)
  } else {
    console.log("Native default theme: Add a section")
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html" })
      const globals = compat ? `window.PROBE_COMPAT=${JSON.stringify(compat).replace(/</g, "\\u003c")};` : ""
      res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false;${globals}</script><script src="/editor-probe.js"></script></body></html>`)
      return
    }
    if (url.pathname === "/editor-probe.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" })
      res.end(readFileSync(bundle))
      return
    }
    /* Round 69: storelib.com's own public files (the placeholder picture a card draws an empty picture with), and the optimizer answered by the picture itself, as on the site. */
    if (url.pathname === "/_next/image") {
      const to = url.searchParams.get("url") ?? ""
      if (to.startsWith("/") && !to.startsWith("//") && !/\.svg$/i.test(to)) { res.writeHead(302, { Location: to }); res.end(); return }
      res.writeHead(400); res.end(); return
    }
    const pub = join("public", decodeURIComponent(url.pathname).replace(/\.\.+/g, ""))
    if (url.pathname.length > 1 && existsSync(pub) && statSync(pub).isFile()) {
      const ext = pub.split(".").pop()!.toLowerCase()
      res.writeHead(200, { "Content-Type": ({ svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" } as Record<string, string>)[ext] ?? "application/octet-stream" })
      res.end(readFileSync(pub))
      return
    }
    const asset = url.pathname.match(/^\/api\/site-theme\/assets\/[^/]+\/[^/]+\/(.+)$/)
    if (asset) {
      const name = decodeURIComponent(asset[1])
      const text = assets[`shopify/assets/${name}`]
      const picture = binaries.get(name)
      if (text === undefined && picture) { res.writeHead(200, { "Content-Type": ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", avif: "image/avif" } as Record<string, string>)[name.split(".").pop()!.toLowerCase()] ?? "application/octet-stream", "Access-Control-Allow-Origin": "*" }); res.end(Buffer.from(picture)); return }
      if (text === undefined) { res.writeHead(404, { "Access-Control-Allow-Origin": "*" }); res.end(); return }
      const type = name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : name.endsWith(".svg") ? "image/svg+xml" : "text/plain"
      res.writeHead(200, { "Content-Type": type, "Access-Control-Allow-Origin": "*" })
      res.end(text.startsWith("base64:") ? Buffer.from(text.slice(7), "base64") : text)
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  let failed = 0
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    await page.evaluateOnNewDocument("window.__name = (f) => f")
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(String((e as Error).message ?? e).slice(0, 200)))
    await page.goto(base, { waitUntil: "domcontentloaded" })
    /* The editor settles, then the page's list and its own Add section. */
    await sleep(4000)
    let opened = false
    for (let i = 0; i < 60 && !opened; i++) {
      opened = await page.evaluate(() => {
        const add = document.querySelector<HTMLElement>("[data-section-group='template'] [data-add-section]") ?? document.querySelector<HTMLElement>("[data-add-section]")
        if (add) { add.click(); return true }
        const tab = [...document.querySelectorAll<HTMLElement>("button, [role='tab']")].find((b) => (b.textContent ?? "").trim() === "Sections")
        tab?.click()
        return false
      })
      if (!opened) await sleep(250)
    }
    if (!opened) { console.log("  FAIL  no Add section button"); failed++; return }
    await sleep(800)
    /* Down the whole list, a screen at a time, as somebody looking would. */
    const t0 = Date.now()
    for (let step = 0; step < 400; step++) {
      const done = await page.evaluate(() => {
        const lists = [...document.querySelectorAll<HTMLElement>("[data-library-scroll]")].filter((l) => l.clientHeight > 0 && l.scrollHeight > l.clientHeight + 4)
        const list = lists.sort((a, b) => b.scrollHeight - a.scrollHeight)[0]
        if (!list) return true
        const at = list.scrollTop
        list.scrollTop = at + list.clientHeight * 0.8
        return list.scrollTop === at
      })
      await sleep(350)
      if (done) break
    }
    /* Then a moment for whatever is still coming. */
    const count = () => page.evaluate(() => {
      const cards = [...document.querySelectorAll<HTMLElement>("[data-library-card]")].filter((c) => !c.hidden)
      const out = { cards: cards.length, shown: 0, fallback: 0, waiting: 0, names: [] as string[] }
      for (const c of cards) {
        const box = c.querySelector<HTMLElement>("[data-preview-box]")
        const st = box?.getAttribute("data-compat-preview-state")
        const name = `${c.getAttribute("data-library-card")}:${c.getAttribute("data-preset")}`
        if (st) {
          if (st === "shown") out.shown++
          else if (st === "named") { out.fallback++; out.names.push(`fallback ${name}`) }
          else { out.waiting++; out.names.push(`waiting ${name}`) }
        } else if (box?.querySelector("[data-preview-empty]")) { out.fallback++; out.names.push(`fallback ${name}`) }
        else if (box?.matches("[data-preview-shimmer]") || box?.querySelector("[data-preview-shimmer]")) { out.waiting++; out.names.push(`waiting ${name}`) }
        else out.shown++
      }
      return out
    })
    let c = await count()
    for (let i = 0; i < 40 && c.waiting > 0; i++) {
      await sleep(250)
      c = await count()
    }
    const took = Date.now() - t0
    console.log(`  cards ${c.cards}: ${c.shown} previews, ${c.fallback} fallbacks, ${c.waiting} waiting (${took}ms)`)
    for (const n of c.names) console.log(`    ${n}`)
    if (c.waiting) failed++
    /* Words a shopper should never see, in what is drawn. */
    const bad = /Liquid (syntax )?error|translation missing|\{\{|\{%|undefined|\[object Object\]|NaN/i
    const texts: { key: string; text: string }[] = []
    for (const f of page.frames()) {
      if (f.parentFrame() !== page.mainFrame()) continue
      const got = await f.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-sl-pv]")].map((w) => ({ key: w.getAttribute("data-sl-pv") ?? "", text: (w.innerText ?? "").replace(/\s+/g, " ").trim() }))).catch(() => [] as { key: string; text: string }[])
      texts.push(...got)
    }
    /*
      ONE CARD NEVER CHANGES ANOTHER. A section's own unscoped rules (a bare
      `h2 { display: none }`) must stay in its own card: every other drawn
      card's headings and words keep their theme's look.
    */
    let touched: string[] = []
    for (const f of page.frames()) {
      if (f.parentFrame() !== page.mainFrame()) continue
      touched.push(...(await f.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-sl-pv][data-on]")].filter((w) => {
        const own = w.querySelector("style")?.textContent ?? ""
        if (/h2\s*\{\s*display:\s*none/.test(own)) return false
        /* The markers are the stress fixture's (tests/fixtures/shopify-preview-stress, leaky-banner): its red words, its blue page, its hidden headings. */
        return [...w.querySelectorAll<HTMLElement>("h2, h3, p")].some((el) => getComputedStyle(el).color === "rgb(255, 0, 0)") || [...w.querySelectorAll<HTMLElement>(".rt__h, .cdf__title, .ctabs__heading")].some((el) => getComputedStyle(el).display === "none") || getComputedStyle(w).backgroundColor === "rgb(0, 0, 255)"
      }).map((w) => w.getAttribute("data-sl-pv") ?? "")).catch(() => [] as string[])))
    }
    touched = [...new Set(touched)]
    console.log(`  cards changed by another card's styles: ${touched.length}${touched.length ? ` (${touched.join(", ")})` : ""}`)
    if (touched.length) failed++
    if (!compat) {
      texts.push(...(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-library-card]")].filter((c) => !c.hidden).map((c) => ({ key: `${c.getAttribute("data-library-card")}:${c.getAttribute("data-preset")}`, text: (c.querySelector<HTMLElement>("[data-preview-box]")?.innerText ?? "").replace(/\s+/g, " ").trim() })))))
    }
    /*
      ROUND 69: NO BROKEN PICTURE. A picture in a card that finished loading
      with nothing (the browser's broken image icon) or has no address at all
      (an empty frame), in the editor's own document (native cards) and in the
      imported theme's sheet. Every card is gone past once, so each picture
      has been asked for.
    */
    const pictures = { broken: [] as string[], empty: [] as string[] }
    const readPictures = () => {
      const out = { broken: [] as string[], empty: [] as string[] }
      for (const img of Array.from(document.querySelectorAll<HTMLImageElement>("[data-library-card] img, [data-sl-pv] img"))) {
        const r = img.getBoundingClientRect()
        if (r.width < 2 || r.height < 2 || getComputedStyle(img).visibility === "hidden") continue
        const where = img.closest("[data-library-card]")?.getAttribute("data-library-card") ?? img.closest("[data-sl-pv]")?.getAttribute("data-sl-pv") ?? "?"
        const src = (img.getAttribute("src") ?? "").trim()
        if (!src && !img.currentSrc && !img.srcset) out.empty.push(where)
        else if (img.complete && img.naturalWidth === 0) out.broken.push(`${where} ${(img.currentSrc || src).slice(0, 80)}`)
      }
      return out
    }
    for (const f of [page.mainFrame(), ...page.frames().filter((x) => x.parentFrame() === page.mainFrame())]) {
      const got = await f.evaluate(readPictures).catch(() => ({ broken: [] as string[], empty: [] as string[] }))
      pictures.broken.push(...got.broken)
      pictures.empty.push(...got.empty)
    }
    console.log(`  pictures: ${pictures.broken.length} broken, ${pictures.empty.length} with no address`)
    for (const b of [...new Set(pictures.broken)].slice(0, 20)) console.log(`    broken picture in ${b}`)
    for (const b of [...new Set(pictures.empty)].slice(0, 20)) console.log(`    picture with no address in ${b}`)
    if (pictures.broken.length || pictures.empty.length) failed++
    const broken = texts.filter((t) => bad.test(t.text))
    for (const b of broken) console.log(`    broken words in ${b.key}: ${b.text.match(bad)?.[0]} ... "${b.text.slice(Math.max(0, b.text.search(bad) - 40), b.text.search(bad) + 60)}"`)
    if (broken.length) failed++
    if (errors.length) console.log("  page errors:", errors.slice(0, 5))
    if (shots) {
      const name = target === "native" ? "native" : target.replace(/\/$/, "").split("/").pop()!.replace(/\.zip$/, "")
      await page.evaluate(() => { const l = [...document.querySelectorAll<HTMLElement>("[data-library-scroll]")].sort((a, b) => b.scrollHeight - a.scrollHeight)[0]; if (l) l.scrollTop = 0 })
      await sleep(600)
      await page.screenshot({ path: `${shots}/library-${name}-top.png` })
      await page.evaluate(() => { const l = [...document.querySelectorAll<HTMLElement>("[data-library-scroll]")].sort((a, b) => b.scrollHeight - a.scrollHeight)[0]; if (l) l.scrollTop = l.scrollHeight / 2 })
      await sleep(600)
      await page.screenshot({ path: `${shots}/library-${name}-middle.png` })
      console.log(`  screenshots in ${shots}/library-${name}-*.png`)
    }
  } finally {
    await browser.close()
    server.close()
  }
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
