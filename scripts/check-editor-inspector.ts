/**
 * ===========================================================================
 *  THE INSPECTOR, OFF AND ON, AND HOW LONG THE EDITOR TAKES TO OPEN
 * ===========================================================================
 *   npx tsx scripts/check-editor-inspector.ts <theme.zip>
 *
 * The real editor (scripts/render-editor-probe.tsx) in a real browser, every
 * route answering after PROBE_API_DELAY_MS (300ms unless DELAY is set), once
 * on an imported Shopify theme and once on Storelib's own sections.
 *
 *   OPENING     when the loader went, when the page could be seen, and that
 *               an imported theme is one wait (never the squares and then a
 *               second, grey outline of a page)
 *   ON          hover outlines a section, a click selects it
 *   OFF         nothing at all is drawn: no hover, no selection, no section
 *               name, no toolbar, no add-a-section strip; a click selects
 *               nothing; a header link still opens its page
 *   REDRAWN     a page drawn while it is off (another page opened) is off
 *               from its first paint
 *   ON AGAIN    hover and select work again, and the page does not scroll
 *
 * Prints what it measured. Exits 1 on any failure.
 */
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import JSZip from "jszip"
import puppeteer, { type Frame, type Page } from "puppeteer-core"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"

let failed = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const DELAY = Number(process.env.DELAY ?? 300)
/* SHOTS=<dir>: a screenshot at each step worth looking at. */
const shot = async (page: Page, name: string) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/inspector-${name}.png` }) }

async function main() {
  const zipPath = process.argv[2]
  if (!zipPath) { console.log("usage: npx tsx scripts/check-editor-inspector.ts <theme.zip>"); process.exit(2) }
  const { bundle, css } = (await import("./editor-probe-harness.mjs")) as { bundle: string; css: string }
  const r = await convertShopifyTheme(await JSZip.loadAsync(readFileSync(zipPath)))
  if (!r.ok) throw new Error(r.error)
  const sources = Object.fromEntries(Object.entries(r.theme.files).filter(([p]) => p.endsWith(".storelib")))
  const files = Object.fromEntries(Object.entries(r.theme.files).filter(([p, t]) => p.startsWith("shopify/") && !t.startsWith("base64:") && !/^shopify\/locales\/(?!.*\.default(\.schema)?\.json$)/.test(p)))
  const pages = Object.fromEntries(r.theme.pages.map((p) => [p.page_key, p.sections]))
  const compat = { settings: r.theme.settings, pages, sources, files }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/" || url.pathname === "/native") {
      const globals = `window.PROBE_SHORT=false;window.PROBE_API_DELAY_MS=${DELAY};${url.pathname === "/" ? `window.PROBE_COMPAT=${JSON.stringify(compat).replace(/</g, "\\u003c")};` : ""}`
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>${globals}</script><script src="/editor-probe.js"></script></body></html>`)
      return
    }
    if (url.pathname === "/editor-probe.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" })
      res.end(readFileSync(bundle))
      return
    }
    const asset = url.pathname.match(/^\/api\/site-theme\/assets\/[^/]+\/[^/]+\/(.+)$/)
    if (asset) {
      const name = decodeURIComponent(asset[1])
      const text = r.theme.files[`shopify/assets/${name}`]
      if (text === undefined) { res.writeHead(404, { "Access-Control-Allow-Origin": "*" }); res.end(); return }
      const type = name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : name.endsWith(".svg") ? "image/svg+xml" : "text/plain"
      res.writeHead(200, { "Content-Type": type, "Access-Control-Allow-Origin": "*" })
      res.end(text)
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })

  /* From the address being opened: when the loader showed, when it started to go, and what was on the canvas meanwhile. */
  const timeOpening = async (page: Page, path: string) => {
    await page.evaluateOnNewDocument(`(function(){
      var t0 = performance.now(), log = { mounted: -1, squares: -1, leaving: -1, gone: -1, placeholderAfterLoader: 0, frameShown: -1 };
      window.__open = log;
      log.ready = -1; log.loaded = -1; log.frame = -1;
      addEventListener("message", function (e) { var d = e.data || {}; if (d.storelib !== 1) return; var t = Math.round(performance.now() - t0); if (d.type === "ready" && log.ready < 0) log.ready = t; if (d.type === "loaded" && log.loaded < 0) log.loaded = t; });
      var tick = function () {
        var t = Math.round(performance.now() - t0);
        var loader = document.querySelector(".wb-canvas-loader");
        if (log.mounted < 0 && document.getElementById("wb-preview-root")) log.mounted = t;
        if (log.frame < 0 && document.querySelector("[data-compat-frame]")) log.frame = t;
        if (loader && loader.querySelector(".wb-squares") && log.squares < 0) log.squares = t;
        if (loader && loader.getAttribute("data-leaving") === "true" && log.leaving < 0) log.leaving = t;
        var ph = document.querySelector("[data-canvas-placeholder]");
        var front = document.querySelector("[data-compat-frame='front']");
        if (log.leaving >= 0 && ph && ph.getAttribute("data-canvas-placeholder") === "up") log.placeholderAfterLoader++;
        if (front && ph && ph.getAttribute("data-canvas-placeholder") === "gone" && log.frameShown < 0) log.frameShown = t;
        if (log.leaving >= 0 && !loader && log.gone < 0) log.gone = t;
        if (t < 20000 && (log.gone < 0 || (front === null && document.querySelector("[data-compat-canvas]")) || (ph && log.frameShown < 0))) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })()`)
    await page.goto(base + path, { waitUntil: "domcontentloaded" })
    for (let i = 0; i < 200; i++) {
      await sleep(100)
      const done = await page.evaluate(() => { const o = (window as unknown as { __open: { gone: number; frameShown: number } }).__open; return o.gone >= 0 && (!document.querySelector("[data-compat-canvas]") || o.frameShown >= 0) })
      if (done) break
    }
    return page.evaluate(() => (window as unknown as { __open: Record<string, number> }).__open)
  }
  const since = (o: Record<string, number>, k: string) => (o[k] < 0 ? "never" : `${o[k] - o.mounted}ms`)
  const toggle = async (page: Page, to: "on" | "off") => {
    const label = to === "off" ? "Disable section inspector" : "Enable section inspector"
    const ok = await page.evaluate((l) => { const b = document.querySelector<HTMLButtonElement>(`button[aria-label="${l}"]`); b?.click(); return !!b }, label)
    if (!ok) console.log(`    (no "${label}" button)`)
  }

  try {
    /* ── An imported Shopify theme ─────────────────────────────────────── */
    console.log(`${r.theme.name}, imported, every route ${DELAY}ms`)
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    await page.evaluateOnNewDocument("window.__name = (f) => f")
    const open = await timeOpening(page, "/")
    console.log(`  --    opening, from the editor's first render: squares at ${since(open, "squares")}, loader leaving at ${since(open, "leaving")}, page shown at ${since(open, "frameShown")}, loader gone at ${since(open, "gone")}; the frame put in at ${since(open, "frame")}, ready at ${since(open, "ready")}, loaded at ${since(open, "loaded")}`)
    check("one wait: no outline of a page after the loader has gone", open.placeholderAfterLoader === 0, `${open.placeholderAfterLoader} frames of it`)
    check("the loader fades onto the theme's page, not before it is there", open.leaving >= 0 && open.frameShown >= 0 && open.frameShown <= open.leaving + 60, `leaving ${open.leaving}ms, page ${open.frameShown}ms`)
    const front = async (): Promise<Frame | null> => (await (await page.$("[data-compat-frame='front']"))?.contentFrame()) ?? null
    const frameBox = async () => (await (await page.$("[data-compat-frame='front']"))!.boundingBox())!
    await sleep(800)
    /* Two body sections on screen, to point at. */
    const spots = await (await front())!.evaluate(() => {
      /* Scrolled until a second section shows, the way somebody looks down a page. */
      const body = [...document.querySelectorAll<HTMLElement>(".shopify-section[data-section-id]:not([class*='shopify-section-group'])")]
      scrollTo(0, body[1] ? Math.max(0, body[1].getBoundingClientRect().top + scrollY - innerHeight / 2) : 0)
      const out: { id: string; x: number; y: number }[] = []
      for (const s of document.querySelectorAll<HTMLElement>(".shopify-section[data-section-id]:not([class*='shopify-section-group'])")) {
        const r = s.getBoundingClientRect()
        const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight)
        if (bottom - top < 40) continue
        /* A spot with no link or control under it. */
        for (let dy = 14; dy < bottom - top - 10; dy += 17) for (const dx of [12, r.width / 2, r.width - 12]) {
          const x = r.left + dx, y = top + dy
          const el = document.elementFromPoint(x, y)
          if (el && s.contains(el) && !el.closest("a, button, input, select, textarea, summary, label") && !out.some((o) => o.id === s.getAttribute("data-section-id"))) out.push({ id: s.getAttribute("data-section-id")!, x, y })
        }
        if (out.length === 2) break
      }
      return out
    })
    if (spots.length < 2) {
      const seen = await (await front())!.evaluate(() => [...document.querySelectorAll<HTMLElement>(".shopify-section[data-section-id]")].map((s) => { const r = s.getBoundingClientRect(); return `${s.getAttribute("data-section-id")}@${Math.round(r.top)}+${Math.round(r.height)}` }).join(" "))
      check("two sections on screen to point at", false, `${JSON.stringify(spots)} of ${seen}`)
      return
    }
    const at = async (i: number) => { const b = await frameBox(); return { x: b.x + spots[i].x, y: b.y + spots[i].y } }
    const marks = async () => (await front())!.evaluate(() => {
      const shown = (k: string) => { const b = document.querySelector<HTMLElement>(`[data-sl-box=${k}]`); if (!b) return false; const cs = getComputedStyle(b); return cs.display !== "none" && Number(cs.opacity) > 0.05 }
      return { hoverAttr: document.querySelectorAll("[data-sl-hover]").length, selectedAttr: document.querySelectorAll("[data-sl-selected], [data-sl-selected-block]").length, hover: shown("hover"), section: shown("section"), block: shown("block"), flag: (window as unknown as { __slInspect?: boolean }).__slInspect }
    })
    const editorMarks = () => page.evaluate(() => {
      const tb = document.querySelector<HTMLElement>(".wb-section-toolbar")
      return { ghost: !!document.querySelector("[data-compat-canvas] [id^='wb-section-']"), toolbar: !!tb && Number(getComputedStyle(tb).opacity) > 0.05, toolbarPressable: !!tb && getComputedStyle(tb).pointerEvents !== "none" }
    })

    /* ON */
    { const p = await at(0); await page.mouse.move(p.x, p.y, { steps: 4 }) }
    await sleep(250)
    let m = await marks()
    check("on: the section under the pointer is outlined", m.hoverAttr === 1 && m.hover, JSON.stringify(m))
    { const p = await at(0); await page.mouse.click(p.x, p.y) }
    await sleep(500)
    m = await marks()
    let e = await editorMarks()
    await shot(page, "compat-on")
    check("on: a click selects it, outlined, with its toolbar", m.selectedAttr >= 1 && m.section && e.ghost && e.toolbar, JSON.stringify({ ...m, ...e }))

    /* OFF */
    { const p = await at(1); await page.mouse.move(p.x, p.y, { steps: 4 }) }
    await sleep(200)
    await toggle(page, "off")
    await sleep(60)
    m = await marks()
    check("off: the hover goes on the press", m.hoverAttr === 0, JSON.stringify(m))
    await sleep(400)
    m = await marks()
    e = await editorMarks()
    check("off: nothing is outlined in the page", m.hoverAttr === 0 && m.selectedAttr === 0 && !m.hover && !m.section && !m.block, JSON.stringify(m))
    check("off: no toolbar and nothing for it to point at", !e.ghost && !e.toolbar && !e.toolbarPressable, JSON.stringify(e))
    for (const i of [0, 1, 0]) { const p = await at(i); await page.mouse.move(p.x, p.y + 6, { steps: 6 }); await sleep(120) }
    m = await marks()
    check("off: moving over the page outlines nothing", m.hoverAttr === 0 && !m.hover, JSON.stringify(m))
    { const p = await at(1); await page.mouse.click(p.x, p.y) }
    await sleep(500)
    m = await marks()
    e = await editorMarks()
    await shot(page, "compat-off")
    check("off: a click selects nothing", m.selectedAttr === 0 && !m.section && !e.ghost, JSON.stringify({ ...m, ...e }))

    /* REDRAWN: a header link opens another page while it is off; that page is off from its first paint. */
    const link = await (await front())!.evaluate(() => {
      scrollTo(0, 0)
      const a = [...document.querySelectorAll<HTMLAnchorElement>(".shopify-section-group-header-group a[href]")].find((x) => {
        const h = x.getAttribute("href") ?? ""
        const r = x.getBoundingClientRect()
        return /^\/(collections|products|search|pages)/.test(h) && r.width > 0 && r.height > 0 && r.top >= 0 && r.top < innerHeight
      })
      if (!a) return null
      const r = a.getBoundingClientRect()
      return { href: a.getAttribute("href"), x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    if (link) {
      const before = await (await page.$("[data-compat-frame='front']"))!.evaluate((f) => (f as HTMLIFrameElement).srcdoc.length)
      const b = await frameBox()
      await page.mouse.click(b.x + link.x, b.y + link.y)
      let swapped = false
      for (let i = 0; i < 60 && !swapped; i++) {
        await sleep(150)
        swapped = await page.evaluate((n) => { const f = document.querySelector<HTMLIFrameElement>("[data-compat-frame='front']"); return !!f && f.srcdoc.length !== n && !document.querySelector("[data-compat-frame='behind']") }, before)
      }
      await sleep(600)
      check("off: a header link still opens its page", swapped, link.href ?? "")
      const flag = await (await front())!.evaluate(() => ({ flag: (window as unknown as { __slInspect?: boolean }).__slInspect, drawn: document.documentElement.outerHTML.includes("window.__slInspect=false") }))
      check("a page drawn while it is off is off before its first paint", flag.flag === false && flag.drawn, JSON.stringify(flag))
      const s2 = await (await front())!.evaluate(() => { const s = [...document.querySelectorAll<HTMLElement>(".shopify-section[data-section-id]")].find((x) => { const r = x.getBoundingClientRect(); return r.height > 60 && r.top > 80 && r.top < innerHeight - 80 }); if (!s) return null; const r = s.getBoundingClientRect(); return { x: r.left + 14, y: r.top + 30 } })
      if (s2) {
        const fb = await frameBox()
        await page.mouse.move(fb.x + s2.x, fb.y + s2.y, { steps: 5 })
        await sleep(250)
        m = await marks()
        check("  and pointing at it outlines nothing", m.hoverAttr === 0 && !m.hover, JSON.stringify(m))
        /* ON AGAIN, on this page */
        await toggle(page, "on")
        await sleep(350)
        await page.mouse.move(fb.x + s2.x + 3, fb.y + s2.y + 12, { steps: 5 })
        await sleep(250)
        m = await marks()
        check("on again: hover outlines on the page it opened", m.hoverAttr === 1 && m.hover, JSON.stringify(m))
        await page.mouse.click(fb.x + s2.x + 3, fb.y + s2.y + 12)
        await sleep(500)
        m = await marks()
        check("on again: a click selects", m.selectedAttr >= 1 && m.section, JSON.stringify(m))
        /* Off and on with the selection scrolled away: the page stays where it is. */
        await (await front())!.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
        await sleep(300)
        const y0 = await (await front())!.evaluate(() => scrollY)
        await toggle(page, "off")
        await sleep(400)
        await toggle(page, "on")
        await sleep(900)
        const y1 = await (await front())!.evaluate(() => scrollY)
        check("switching it back on does not scroll the page to the selection", Math.abs(y1 - y0) < 4, `${y0} to ${y1}`)
      }
    } else {
      check("a header link to press", false)
    }
    await page.close()

    /* ── Storelib's own sections ───────────────────────────────────────── */
    console.log(`Storelib's own sections, every route ${DELAY}ms`)
    const np = await browser.newPage()
    await np.setViewport({ width: 1440, height: 900 })
    await np.evaluateOnNewDocument("window.__name = (f) => f")
    const nOpen = await timeOpening(np, "/native")
    console.log(`  --    opening, from the editor's first render: squares at ${since(nOpen, "squares")}, loader leaving at ${since(nOpen, "leaving")}, loader gone at ${since(nOpen, "gone")}`)
    await sleep(1200)
    const target = await np.evaluate(() => {
      const root = document.getElementById("wb-preview-root")!
      const s = [...root.querySelectorAll<HTMLElement>("[id^='wb-section-']")].find((x) => { const r = x.getBoundingClientRect(); return r.height > 120 && r.top > 120 && r.top < innerHeight - 200 })
      if (!s) return null
      const r = s.getBoundingClientRect()
      return { id: s.id, x: r.left + 40, y: r.top + 50, gapY: r.top }
    })
    if (!target) { check("a section on screen to point at", false); return }
    const nMarks = () => np.evaluate(() => {
      const visible = (el: Element) => { const cs = getComputedStyle(el); return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.05 }
      const rings = [...document.querySelectorAll("#wb-preview-root .wb-ring")].filter((el) => !el.querySelector("[aria-label='Add a section here']") && visible(el) && !el.matches(".group-hover\\/section\\:opacity-100, [class*='group-hover']")).length
      const strips = [...document.querySelectorAll<HTMLElement>("[aria-label='Add a section here']")].filter((el) => getComputedStyle(el).pointerEvents !== "none").length
      return { chip: !!document.querySelector(".wb-hover-chip"), outline: !!document.querySelector(".wb-hover-outline"), rings, strips }
    })
    await np.mouse.move(target.x, target.y, { steps: 4 })
    await sleep(300)
    let n = await nMarks()
    if (!n.chip && process.env.DEBUG) console.log(await np.evaluate((t) => JSON.stringify({ docks: [...document.querySelectorAll("[data-ask-dock]")].map((d) => { const r = d.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round) }), at: document.elementFromPoint(t.x, t.y)?.closest("[id^='wb-section-']")?.id, sec: (() => { const r = document.getElementById(t.id)!.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round) })() }), target))
    check("on: the section under the pointer gets its name", n.chip, JSON.stringify(n))
    await np.mouse.click(target.x, target.y)
    await sleep(500)
    n = await nMarks()
    await shot(np, "native-on")
    check("on: a click selects it (ring, badge), with the add-a-section strips there", n.rings >= 2 && n.strips > 0, JSON.stringify(n))
    await toggle(np, "off")
    await sleep(60)
    n = await nMarks()
    check("off: the name and the outline under the pointer go on the press", !n.chip && !n.outline, JSON.stringify(n))
    await sleep(500)
    n = await nMarks()
    check("off: no ring, no badge, no add-a-section strip", n.rings === 0 && n.strips === 0, JSON.stringify(n))
    await np.mouse.move(target.x + 10, target.y + 20, { steps: 6 })
    await sleep(300)
    n = await nMarks()
    await shot(np, "native-off")
    check("off: moving over the page draws nothing", !n.chip && !n.outline && n.rings === 0, JSON.stringify(n))
    await toggle(np, "on")
    await sleep(500)
    await np.mouse.move(target.x, target.y, { steps: 4 })
    await sleep(300)
    n = await nMarks()
    check("on again: the name under the pointer is back", n.chip, JSON.stringify(n))
  } finally {
    await browser.close()
    server.close()
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
