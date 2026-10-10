/**
 * ===========================================================================
 *  AN IMPORTED SHOPIFY THEME IN THE REAL BUILDER
 * ===========================================================================
 *   npx tsx scripts/check-compat-editor.ts <theme.zip>
 *
 * The theme goes through the import's converter; the real editor
 * (scripts/render-editor-probe.tsx, bundled by scripts/editor-probe-harness.mjs)
 * is opened on it with the network answered locally, and the theme's own
 * files served the way /api/site-theme/assets serves them. Then, at 1440x900:
 *
 *   the canvas draws the theme's page in its sandboxed frame, with the
 *   theme's own stylesheets applied and no script error in the frame
 *   a click on a section in the frame selects it in the sidebar
 *   typing a new heading in the sidebar changes that section in the frame,
 *   and only that section (the frame is not reloaded: its scroll holds)
 *   Theme settings lists the theme's own groups
 *
 * Prints what it measured. Exits 1 on any failure.
 */
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import JSZip from "jszip"
import puppeteer, { type Frame } from "puppeteer-core"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"

let failed = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const zipPath = process.argv[2]
  if (!zipPath) { console.log("usage: npx tsx scripts/check-compat-editor.ts <theme.zip>"); process.exit(2) }
  /* The harness bundles the editor when it is loaded; it is an ES module, and this file is run as CommonJS. */
  const { bundle, css } = (await import("./editor-probe-harness.mjs")) as { bundle: string; css: string }
  const r = await convertShopifyTheme(await JSZip.loadAsync(readFileSync(zipPath)))
  if (!r.ok) throw new Error(r.error)
  const sources = Object.fromEntries(Object.entries(r.theme.files).filter(([p]) => p.endsWith(".storelib")))
  const files = Object.fromEntries(Object.entries(r.theme.files).filter(([p, t]) => p.startsWith("shopify/") && !t.startsWith("base64:") && !/^shopify\/locales\/(?!.*\.default\.json$)/.test(p)))
  const pages = Object.fromEntries(r.theme.pages.map((p) => [p.page_key, p.sections]))
  const compat = { settings: r.theme.settings, pages, sources, files }
  console.log(`${r.theme.name} in the builder`)

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false;window.PROBE_COMPAT=${JSON.stringify(compat).replace(/</g, "\\u003c")}</script><script src="/editor-probe.js"></script></body></html>`)
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
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    /* tsx names the functions it compiles with a helper the page does not have. */
    await page.evaluateOnNewDocument("window.__name = (f) => f")
    const frameErrors: string[] = []
    page.on("console", (m) => { if (m.type() === "error" && /frame|shopify|theme/i.test(m.text())) frameErrors.push(m.text().slice(0, 160)) })
    page.on("pageerror", (e) => frameErrors.push(`editor: ${String(e).slice(0, 160)}`))
    await page.goto(base, { waitUntil: "domcontentloaded" })

    let frame: Frame | null = null
    const t0 = Date.now()
    for (let i = 0; i < 120 && !frame; i++) {
      await sleep(250)
      frame = page.frames().find((f) => f !== page.mainFrame() && f.url() === "about:srcdoc") ?? null
    }
    check("the canvas draws the theme in its frame", !!frame, `${Date.now() - t0}ms`)
    if (!frame) return
    await sleep(2500)
    const drawn = await frame.evaluate(() => ({
      sections: document.querySelectorAll(".shopify-section").length,
      styled: getComputedStyle(document.body).fontFamily,
      sheets: document.styleSheets.length,
      sandboxed: (() => { try { return !!window.parent.document } catch { return false } })(),
    }))
    check("the theme's sections are on the page", drawn.sections >= 4, `${drawn.sections} sections`)
    check("the theme's stylesheets apply", drawn.sheets >= 3, `${drawn.sheets} stylesheets, body font ${drawn.styled.slice(0, 40)}`)
    check("the frame cannot reach the builder", drawn.sandboxed === false)

    /*
      A block of words selects its block, and the sidebar shows the field
      that holds those words. Tried on the page's visible text blocks in
      order until one has a field (a collection's title, say, has none: it
      draws the collection's own name).
    */
    const candidates = await frame.evaluate(() => {
      const shown = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight * 3 }
      return [...document.querySelectorAll<HTMLElement>(".shopify-section[data-section-id]:not([class*='shopify-section-group']) [data-block-id]")]
        .filter((b) => shown(b) && !b.querySelector("[data-block-id]") && /^[^\n]{3,80}$/.test((b.textContent ?? "").trim()))
        .slice(0, 8)
        .map((b) => ({ section: b.closest(".shopify-section")!.getAttribute("data-section-id")!, block: b.getAttribute("data-block-id")!, text: (b.textContent ?? "").trim() }))
    })
    let target: { section: string; block: string; text: string } | null = null
    const frameEl = await page.$("[data-compat-canvas] iframe")
    for (const c of candidates) {
      const at = await frame.evaluate((id) => {
        const el = document.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!
        el.scrollIntoView({ block: "center" })
        const r = el.getBoundingClientRect()
        return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2 }
      }, c.block)
      await sleep(300)
      const box = await frameEl!.boundingBox()
      await page.mouse.click(box!.x + at.x, box!.y + at.y)
      await sleep(700)
      const found = await page.evaluate((text) => {
        document.querySelectorAll("[data-probe-field]").forEach((el) => el.removeAttribute("data-probe-field"))
        const inputs = [...document.querySelectorAll<HTMLElement>("input[type='text'], textarea, [contenteditable='true']")]
        const value = (i: HTMLElement) => ("value" in i ? (i as HTMLInputElement).value : i.textContent ?? "").replace(/<[^>]+>/g, "").trim()
        const hit = inputs.find((i) => value(i) && text.startsWith(value(i).slice(0, 12)))
        if (!hit) return false
        hit.setAttribute("data-probe-field", "")
        return true
      }, c.text)
      if (found) { target = c; break }
    }
    check("a click on a block of words selects it and the sidebar shows its words", !!target, target ? `${target.section} › ${target.block}: "${target.text}"` : `${candidates.length} tried`)
    if (!target) {
      await page.screenshot({ path: "/tmp/compat-editor.png" })
      return
    }
    const outlined = await frame.evaluate((t) => !!document.getElementById(`shopify-section-${t.section}`)?.hasAttribute("data-sl-selected") && !!document.querySelector(`[data-block-id="${t.block}"]`)?.hasAttribute("data-sl-selected-block"), target)
    check("the section and the block are outlined in the frame", outlined)
    /* A mark on the page's own window: still there afterwards means the page was changed in place, not drawn again. */
    await frame.evaluate(() => { (window as unknown as { __probeMark: number }).__probeMark = 1 })
    const scrollBefore = await frame.evaluate(() => scrollY)
    /* DEBUG=1: every scroll of the frame and every message it is sent, with the page's height at the time. */
    if (process.env.DEBUG) await frame.evaluate(() => { const log: string[] = []; (window as unknown as { __scrolls: string[] }).__scrolls = log; addEventListener("scroll", () => log.push(`${Math.round(scrollY)}@${Math.round(performance.now())} h=${document.documentElement.scrollHeight}`)); addEventListener("message", (e) => log.push(`message ${(e.data as { type?: string })?.type} y=${Math.round(scrollY)}`)) })
    const el = await page.$("[data-probe-field]")
    await el!.click({ clickCount: 3 })
    const typedAt = Date.now()
    await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control")
    await page.keyboard.type("Linen for summer", { delay: 20 })
    /* A text field hands its words to the page as it is typed in; the last of them when it pauses. */
    await sleep(600)
    let shown = -1
    for (let i = 0; i < 40; i++) {
      await sleep(100)
      const has = await frame.evaluate((id) => (document.getElementById(`shopify-section-${id}`)?.textContent ?? "").includes("Linen for summer"), target.section)
      if (has) { shown = Date.now() - typedAt; break }
    }
    check("the new heading is drawn in the frame", shown >= 0, `${shown}ms after typing began`)
    const scrollAfter = await frame.evaluate(() => scrollY)
    if (process.env.DEBUG) console.log(await frame.evaluate(() => JSON.stringify((window as unknown as { __scrolls: string[] }).__scrolls)))
    const kept = await frame.evaluate(() => (window as unknown as { __probeMark?: number }).__probeMark === 1).catch(() => false)
    check("the section was swapped in place: the page was not drawn again", kept)
    check("the frame kept its scroll", Math.abs(scrollAfter - scrollBefore) < 4, `${scrollBefore} to ${scrollAfter}`)
    /* Theme settings: the theme's own groups, and a change to one draws the page with it. */
    const opened = await page.evaluate(() => {
      const tab = [...document.querySelectorAll<HTMLElement>("button, [role='tab']")].find((b) => (b.textContent ?? "").trim() === "Theme")
      tab?.click()
      return !!tab
    })
    await sleep(800)
    /* The theme's own group names, from its settings_schema.json and its locale: not Storelib's. */
    const own = (JSON.parse(files["shopify/config/settings_panel.json"] ?? "[]") as { name: string }[]).map((g) => g.name)
    const groups = await page.evaluate((names) => [...document.querySelectorAll<HTMLElement>("button")].map((b) => (b.textContent ?? "").trim()).filter((t) => names.includes(t)), own)
    check("Theme settings lists the theme's own groups", opened && own.length >= 3 && groups.length === own.length, `${groups.length} of ${own.length}: ${groups.slice(0, 8).join(", ")}`)
    if (groups.length) {
      await page.evaluate((name) => [...document.querySelectorAll<HTMLElement>("button")].find((b) => (b.textContent ?? "").trim() === name)?.click(), groups[0])
      await sleep(500)
      const fields = await page.evaluate(() => document.querySelectorAll("[data-compat-theme-group] input, [data-compat-theme-group] select, [data-compat-theme-group] button[role='switch'], [data-compat-theme-group] [data-color-chip]").length)
      check(`"${groups[0]}" opens with its controls`, fields > 0, `${fields} controls`)
    }
    await page.screenshot({ path: "/tmp/compat-editor-theme.png" })
    await page.screenshot({ path: "/tmp/compat-editor.png" })
    check("no script errors", frameErrors.length === 0, frameErrors[0] ?? "")
  } finally {
    await browser.close()
    server.close()
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  process.exit(failed ? 1 : 0)
}
main()
