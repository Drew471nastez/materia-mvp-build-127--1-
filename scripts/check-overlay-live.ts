/**
 * ===========================================================================
 *  THE OVERLAY GROUP ON A VISITOR'S PAGE
 * ===========================================================================
 *   npx tsx scripts/check-overlay-live.ts
 *
 * The three floating sections of the default theme, drawn by the engine as
 * a live page draws them, in the box a live page puts them in, with the
 * page's hook on them (scripts/render-overlay-live.tsx). Measured in
 * Chromium:
 *
 *   BACK TO TOP   hidden at the top of the page, shown once the page is
 *                 scrolled past the point it names, fixed to the corner of
 *                 the screen, and a press goes back to the top
 *   POPUP         closed at first, open after its delay, over the sticky
 *                 header; closed by its button, and not opened again on the
 *                 next visit
 *   TAB BAR       on a phone, fixed to the bottom of the screen with a
 *                 spacer of its height at the end of the page, so nothing
 *                 is left under it; on a computer, not there at all
 *
 * Exits 1 on any failure.
 */
import { createServer } from "node:http"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { compileSection } from "../lib/storelib-theme/storelib/compile"
import { renderSection } from "../lib/storelib-theme/render"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const check = (label: string, ok: boolean, detail?: unknown) => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail === undefined ? "" : `  (${JSON.stringify(detail)})`}`)
}

const SETTINGS: Record<string, Record<string, unknown>> = { popup: { delay: 1 }, back_to_top: { show_after: 400 }, mobile_bottom_bar: {} }
const drawn = Object.entries(SETTINGS).map(([type, settings]) => {
  const c = compileSection(readFileSync(`themes/default/sections/${type}.storelib`, "utf8"), { file: `sections/${type}.storelib` } as never)
  if (c.ok === false) throw new Error(`${type}: ${JSON.stringify(c.errors)}`)
  const preset = ((c.value.schema as { presets?: { blocks?: unknown[] }[] }).presets ?? [])[0] ?? {}
  const r = renderSection({ compiled: c.value, id: `live-${type}`, instance: { settings, blocks: preset.blocks ?? [] } as never, theme: {}, page: { template: "index", in_editor: false } as never })
  return { id: `live-${type}`, type, html: r.html, css: r.css }
})

const out = mkdtempSync(join(tmpdir(), "overlay-live-"))
execFileSync("npx", ["--no-install", "esbuild", "scripts/render-overlay-live.tsx", "--bundle", "--format=iife", "--jsx=automatic", "--define:process.env.NODE_ENV=\"production\"", "--alias:@=.", `--outfile=${join(out, "page.js")}`, "--log-level=error"])
const js = readFileSync(join(out, "page.js"))
const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;font-family:system-ui}${drawn.map((d) => d.css).join("\n")}</style></head><body><div id="app"></div>
<script>window.OVERLAY=${JSON.stringify(drawn).replace(/</g, "\\u003c")}</script><script src="/page.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url === "/page.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(page)
})

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
  try {
    const p = await browser.newPage()
    const errors: string[] = []
    p.on("pageerror", (e) => errors.push(String((e as Error).message ?? e)))
    await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
    await p.goto(`${origin}/`, { waitUntil: "load" })
    await sleep(300)

    const btt = () => p.evaluate(() => {
      const b = document.querySelector<HTMLElement>("[data-storelib-back-to-top]")!
      const r = b.getBoundingClientRect()
      return { shown: b.hasAttribute("data-shown"), visible: getComputedStyle(b).visibility, position: getComputedStyle(b).position, right: Math.round(innerWidth - r.right), bottom: Math.round(innerHeight - r.bottom), y: Math.round(scrollY) }
    })
    const atTop = await btt()
    check("back to top: hidden at the top of the page", !atTop.shown && atTop.visible === "hidden", atTop)
    await p.evaluate(() => window.scrollTo(0, 1200))
    await sleep(400)
    const scrolled = await btt()
    check("back to top: shown once scrolled, fixed to the corner", scrolled.shown && scrolled.visible === "visible" && scrolled.position === "fixed" && scrolled.right === 20 && scrolled.bottom > 0 && scrolled.bottom < 140, scrolled)

    const bar = await p.evaluate(() => {
      const nav = document.querySelector<HTMLElement>(".mb__bar")!
      const r = nav.getBoundingClientRect()
      const space = document.querySelector<HTMLElement>(".mb__space")!.getBoundingClientRect()
      return { position: getComputedStyle(nav).position, bottom: Math.round(innerHeight - r.bottom), height: Math.round(r.height), width: Math.round(r.width), spacer: Math.round(space.height), tabs: nav.querySelectorAll("a, button").length }
    })
    check("tab bar: on a phone, fixed to the bottom edge, full width", bar.position === "fixed" && bar.bottom === 0 && bar.width === 390 && bar.tabs === 4, bar)
    check("tab bar: a spacer of its height ends the page, so nothing is left under it", bar.spacer === bar.height, bar)
    const lifted = await btt()
    check("back to top: sits above the tab bar, not under it", lifted.bottom >= bar.height + 20, { bottom: lifted.bottom, bar: bar.height })
    const onTop = await p.evaluate(() => {
      const b = document.querySelector<HTMLElement>("[data-storelib-back-to-top]")!.getBoundingClientRect()
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
      return !!hit?.closest("[data-storelib-back-to-top]")
    })
    check("back to top: a press lands on it", onTop)
    await p.evaluate(() => document.querySelector<HTMLElement>("[data-storelib-back-to-top]")!.click())
    await sleep(1200)
    check("back to top: a press goes back to the top", (await btt()).y === 0, (await btt()).y)

    const popup = () => p.evaluate(() => {
      const el = document.querySelector<HTMLElement>("[data-storelib-popup]")!
      const card = el.querySelector<HTMLElement>("[role='dialog']")!.getBoundingClientRect()
      const hit = document.elementFromPoint(195, 20)
      return { open: el.hasAttribute("data-open"), visible: getComputedStyle(el).visibility, w: Math.round(card.width), over: !!hit?.closest("[data-storelib-popup]") }
    })
    const now = await popup()
    check("popup: open after its delay, over the sticky header", now.open && now.visible === "visible" && now.w > 300 && now.over, now)
    await p.evaluate(() => document.querySelector<HTMLElement>(".pop__x")!.click())
    await sleep(300)
    const closed = await popup()
    check("popup: closed by its button", !closed.open && closed.visible === "hidden", closed)
    await p.reload({ waitUntil: "load" })
    await sleep(1600)
    check("popup: not opened again on the next visit", !(await popup()).open)

    await p.setViewport({ width: 1280, height: 800 })
    await sleep(200)
    const wide = await p.evaluate(() => getComputedStyle(document.querySelector(".mb")!).display)
    check("tab bar: not on a computer", wide === "none", wide)
    check("no script error", errors.length === 0, errors.slice(0, 3))
  } finally {
    await browser.close()
    server.close()
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
