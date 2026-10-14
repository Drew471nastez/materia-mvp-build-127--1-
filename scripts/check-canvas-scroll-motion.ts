/**
 * ===========================================================================
 *  SECTIONS ARRIVE AS THEY ARE SCROLLED TO, IN THE CANVAS AS ON THE WEBSITE
 * ===========================================================================
 *   npx tsx scripts/check-canvas-scroll-motion.ts [canvas] [redraw] [swap] [phone]
 *
 * Without tsx: bundle it into .wb-probe/ (ESM, for the harness's top level
 * await) with a banner that defines __dirname, require and module, then run
 * it with node from the repository root.
 *
 * The theme is tests/fixtures/shopify-posture with tests/fixtures/shopify-
 * reveal laid over it: three bands below the first screen, each brought in
 * the way a Shopify theme brings its sections in as they are scrolled to:
 *
 *   dawn    Dawn's own animations.js and base.css (scroll-trigger,
 *           animate--slide-in): a CSS animation started by a class.
 *   gated   a script that turns its reveal off when Shopify.designMode is
 *           true, as AOS.init({ disable: Shopify.designMode }) does.
 *   liquid  a section that leaves its reveal class out when
 *           request.design_mode is true.
 *
 * Each band's first card is read before it is scrolled to (is it waiting,
 * hidden?), then the page is scrolled so the card stands at 40% of the
 * screen and its opacity is read on every frame for 1.6 seconds: it ANIMATED
 * when a frame caught it between 0.15 and 0.85, and it ARRIVED when it ends
 * at 1. The live site (lib/storelib-theme/compat/site.ts, the same theme)
 * and the real editor's canvas (scripts/render-editor-probe.tsx) are read
 * the same way:
 *
 *   live    the website.
 *   canvas  the builder's first page, once its loader has gone.
 *   redraw  the same page drawn again behind itself, as an edit the page
 *           cannot take in place draws it ("shown" with `instant`), then
 *           scrolled.
 *   phone   the canvas at 390x844 with touch.
 *
 * Measurements, not opinions. Exits 1 when the canvas does not match the
 * website. Screenshots go to $OUT (default /tmp/canvas-scroll-motion).
 */
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import type JSZip from "jszip"
import puppeteer, { type Frame, type Page } from "puppeteer-core"
import { editorFor, fixtureZip, serveLive } from "./check-builder-nav19"

const OUT = process.env.OUT ?? "/tmp/canvas-scroll-motion"
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium"
mkdirSync(OUT, { recursive: true })
const parts = new Set(process.argv.slice(2))
const all = parts.size === 0
let failed = 0
const check = (label: string, ok: boolean, detail: unknown = "") => {
  if (!ok) failed++
  const d = typeof detail === "string" ? detail : JSON.stringify(detail)
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${d ? `  (${d})` : ""}`)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const BANDS = ["dawn", "gated", "liquid"] as const
type Band = (typeof BANDS)[number]

/** The Posturex-shaped fixture with the three bands below its first screen, each a screen apart. */
export async function revealZip(): Promise<JSZip> {
  const zip = await fixtureZip()
  const dir = join(process.cwd(), "tests", "fixtures", "shopify-reveal")
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else if (!n.endsWith(".txt")) zip.file(relative(dir, p), readFileSync(p))
    }
  }
  walk(dir)
  const layout = (await zip.file("layout/theme.liquid")!.async("string"))
    .replace("{{ 'base.css' | asset_url | stylesheet_tag }}", "{{ 'base.css' | asset_url | stylesheet_tag }}\n    {{ 'reveal.css' | asset_url | stylesheet_tag }}\n    <script src=\"{{ 'animations.js' | asset_url }}\" defer=\"defer\"></script>")
    .replace("<script src=\"{{ 'theme.js' | asset_url }}\" defer></script>", "<script src=\"{{ 'theme.js' | asset_url }}\" defer></script>\n    <script src=\"{{ 'gated.js' | asset_url }}\" defer></script>")
  zip.file("layout/theme.liquid", layout)
  const index = JSON.parse(await zip.file("templates/index.json")!.async("string")) as { sections: Record<string, unknown>; order: string[] }
  index.sections.gap1 = { type: "spacer" }
  index.sections.dawn = { type: "dawn-cards" }
  index.sections.gap2 = { type: "spacer" }
  index.sections.gated = { type: "gated-band" }
  index.sections.gap3 = { type: "spacer" }
  index.sections.liquid = { type: "liquid-band" }
  index.order.push("gap1", "dawn", "gap2", "gated", "gap3", "liquid")
  zip.file("templates/index.json", JSON.stringify(index))
  return zip
}

type Arrival = { band: Band; present: boolean; before: number; min: number; animated: boolean; end: number; mid: number[] }

/** One band's first card: read, scrolled to 40% of the screen, read on every frame for 1.6s. */
async function arrive(target: Page | Frame, band: Band): Promise<Arrival> {
  return target.evaluate(async (band: string) => {
    const el = document.querySelector<HTMLElement>(`[data-probe="${band}-1"]`)
    if (!el) return { band, present: false, before: -1, min: -1, animated: false, end: -1, mid: [] } as never
    const op = () => Number(parseFloat(getComputedStyle(el).opacity).toFixed(3))
    const before = op()
    const r = el.getBoundingClientRect()
    window.scrollTo({ top: window.scrollY + r.top - innerHeight * 0.4, behavior: "instant" as ScrollBehavior })
    const samples: number[] = []
    const t0 = performance.now()
    await new Promise<void>((done) => {
      const tick = () => {
        samples.push(op())
        if (performance.now() - t0 < 1600) requestAnimationFrame(tick)
        else done()
      }
      requestAnimationFrame(tick)
    })
    const mid = samples.filter((v) => v > 0.15 && v < 0.85)
    return { band, present: true, before, min: Math.min(...samples), animated: mid.length > 0, end: samples[samples.length - 1], mid: mid.slice(0, 4) }
  }, band) as Promise<Arrival>
}

const show = (a: Arrival) => `before ${a.before}, lowest ${a.min}, ${a.animated ? `animated (${a.mid.join(" ")})` : "did not animate"}, ends ${a.end}`

/** What the website does with each band: the canvas is held against this. */
function holdAgainst(where: string, got: Arrival[], live: Arrival[]) {
  for (const band of BANDS) {
    const a = got.find((x) => x.band === band)!
    const l = live.find((x) => x.band === band)!
    if (!a.present) { check(`${where}: ${band} is on the page`, false); continue }
    const waits = a.before < 0.1
    check(`${where}: ${band} waits hidden below the screen, as on the website (${l.before})`, waits === l.before < 0.1, show(a))
    check(`${where}: ${band} plays its entrance when scrolled to, as on the website`, a.animated === l.animated && a.end >= 0.99, show(a))
  }
}

async function live(browser: import("puppeteer-core").Browser, zip: JSZip): Promise<Arrival[]> {
  console.log("\nlive site, 1440x900")
  const { server, base } = await serveLive(undefined, zip)
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: 900 })
    await page.evaluateOnNewDocument("window.__name = (f) => f")
    await page.goto(`${base}/`, { waitUntil: "networkidle0" })
    await sleep(1200)
    const out: Arrival[] = []
    for (const band of BANDS) out.push(await arrive(page, band))
    for (const a of out) console.log(`        ${a.band.padEnd(7)} ${show(a)}`)
    for (const a of out) check(`live: ${a.band} waits hidden and plays when scrolled to`, a.present && a.before < 0.1 && a.animated && a.end >= 0.99, show(a))
    await page.close()
    return out
  } finally {
    server.close()
  }
}

/** The editor's canvas, its loader gone and the page's own entrance played. */
async function openCanvas(browser: import("puppeteer-core").Browser, zip: JSZip, width: number, height: number, touch: boolean) {
  const ed = await editorFor(browser, width, height, touch, undefined, zip)
  const frame = await ed.frame()
  await ed.page.waitForSelector("[data-canvas-placeholder='gone']", { timeout: 15000 })
  await sleep(1500)
  return { ed, frame }
}

async function canvas(browser: import("puppeteer-core").Browser, zip: JSZip, liveRun: Arrival[], label: string, width: number, height: number, touch: boolean) {
  console.log(`\nbuilder canvas, ${label}`)
  const { ed, frame } = await openCanvas(browser, zip, width, height, touch)
  try {
    const out: Arrival[] = []
    for (const band of BANDS) out.push(await arrive(frame, band))
    for (const a of out) console.log(`        ${a.band.padEnd(7)} ${show(a)}`)
    await ed.page.screenshot({ path: `${OUT}/canvas-${label}.png` })
    holdAgainst(`canvas ${label}`, out, liveRun)
  } finally {
    await ed.page.close()
    ed.close()
  }
}

/** An edit the page cannot take in place: the page asks to be drawn again (canvas-bridge.ts `reload`), behind itself, where it stands. */
async function redraw(browser: import("puppeteer-core").Browser, zip: JSZip, liveRun: Arrival[]) {
  console.log("\nbuilder canvas, the same page drawn again behind itself (an edit), then scrolled")
  const { ed, frame } = await openCanvas(browser, zip, 1440, 900, false)
  try {
    const before = await ed.page.$$eval("[data-compat-frame]", (fs) => fs.length)
    await frame.evaluate(() => parent.postMessage({ storelib: 1, type: "reload", why: "probe" }, "*"))
    /* The page drawn again comes forward: a new front frame. */
    let next: Frame | null = null
    for (let i = 0; i < 80 && !next; i++) {
      await sleep(100)
      const f = await ed.frame().catch(() => null)
      if (f && f !== frame) next = f
    }
    check("redraw: the page was drawn again and came forward", !!next, `${before} frame(s) before`)
    if (!next) return
    /* Its five quiet seconds (canvas-network.ts, instant) are over, and well inside them. Both are read. */
    await sleep(600)
    const soon: Arrival[] = [await arrive(next, "dawn")]
    await sleep(5000)
    const out: Arrival[] = []
    for (const band of BANDS.filter((b) => b !== "dawn")) out.push(await arrive(next, band))
    const all = [...soon, ...out]
    for (const a of all) console.log(`        ${a.band.padEnd(7)} ${show(a)}`)
    holdAgainst("redraw", all, liveRun)
  } finally {
    await ed.page.close()
    ed.close()
  }
}

/*
  A SECTION DRAWN AGAIN IN PLACE, as an edit that changes its shape (a block
  added) sends it: the markup the page was drawn with, one element more, to
  the page in front, with the markup it replaces (`prev`), so the bridge
  cannot change it value by value and swaps it (canvas-bridge.ts, swap).
*/
type Target = Band | "story"
const pickIn = (band: string) => (band === "story" ? document.querySelector<HTMLElement>(".rich-text.reveal") : document.querySelector<HTMLElement>(`[data-probe="${band}-1"]`))
const PICK = `(${pickIn.toString()})`

async function swapSection(page: Page, frame: Frame, band: Target): Promise<boolean> {
  /* The element on the page now is marked, so a new one in its place can be told from it (watchStill). */
  const id = await frame.evaluate(`(() => { const el = ${PICK}(${JSON.stringify(band)}); if (el) el.__probeOld = true; return el?.closest(".shopify-section")?.getAttribute("data-section-id") ?? null })()`) as string | null
  if (!id) return false
  return page.evaluate((id: string) => {
    const f = document.querySelector<HTMLIFrameElement>("[data-compat-frame='front']")
    if (!f || !f.contentWindow) return false
    const doc = new DOMParser().parseFromString(f.srcdoc, "text/html")
    const el = doc.querySelector(`.shopify-section[data-section-id="${id}"]`)
    if (!el) return false
    const prev = el.outerHTML
    const extra = doc.createElement("span")
    extra.hidden = true
    extra.setAttribute("data-probe-extra", "")
    ;(el.firstElementChild ?? el).appendChild(extra)
    f.contentWindow.postMessage({ storelib: 1, type: "section", id, html: el.outerHTML, prev }, "*")
    return true
  }, id)
}

/** The band's first card (or the story) read on every frame for `ms`: its lowest opacity, its last, and whether it is a new element. */
async function watchStill(frame: Frame, band: Target, ms: number): Promise<{ min: number; end: number; swapped: boolean }> {
  return frame.evaluate(`(async () => {
    const pick = () => ${PICK}(${JSON.stringify(band)})
    const samples = []
    const t0 = performance.now()
    await new Promise((done) => {
      const tick = () => {
        const el = pick()
        if (el) samples.push(Number(parseFloat(getComputedStyle(el).opacity).toFixed(3)))
        if (performance.now() - t0 < ${ms}) requestAnimationFrame(tick)
        else done()
      }
      requestAnimationFrame(tick)
    })
    return { min: Math.min(...samples), end: samples[samples.length - 1], swapped: !!pick() && !pick().__probeOld }
  })()`) as Promise<{ min: number; end: number; swapped: boolean }>
}

/** Puts it at 30% of the screen. */
async function scrollToBand(frame: Frame, band: Target) {
  await frame.evaluate(`(() => { const el = ${PICK}(${JSON.stringify(band)}); if (el) window.scrollTo({ top: Math.max(0, window.scrollY + el.getBoundingClientRect().top - innerHeight * 0.3), behavior: "instant" }) })()`)
}

async function swaps(browser: import("puppeteer-core").Browser, zip: JSZip, liveRun: Arrival[]) {
  console.log("\nbuilder canvas, sections drawn again in place (swapped), 1440x900")
  /* Below the screen when it is swapped: it still arrives when it is scrolled to, as on the website. */
  const below = await openCanvas(browser, zip, 1440, 900, false)
  try {
    for (const band of BANDS) check(`swap below the screen: ${band} was swapped`, await swapSection(below.ed.page, below.frame, band))
    await sleep(800)
    const out: Arrival[] = []
    for (const band of BANDS) out.push(await arrive(below.frame, band))
    for (const a of out) console.log(`        below   ${a.band.padEnd(7)} ${show(a)}`)
    holdAgainst("swapped below the screen", out, liveRun)
  } finally {
    await below.ed.page.close()
    below.ed.close()
  }
  /* On screen when it is swapped, in a canvas of its own: it stays as it was; nothing fades or rises again under an edit, and nothing is left hidden. */
  const on = await openCanvas(browser, zip, 1440, 900, false)
  try {
    for (const band of ["story", ...BANDS] as const) {
      await scrollToBand(on.frame, band)
      await sleep(1500)
      const before = await watchStill(on.frame, band, 50)
      const ok = await swapSection(on.ed.page, on.frame, band)
      const after = await watchStill(on.frame, band, 1200)
      console.log(`        on      ${band.padEnd(7)} before ${before.end}, after the swap lowest ${after.min}, ends ${after.end}${after.swapped ? "" : " (not swapped)"}`)
      check(`swap on screen: ${band} stays shown, nothing hides or plays again`, ok && after.swapped && before.end >= 0.99 && after.min >= 0.99, { before: before.end, lowest: after.min, end: after.end, swapped: after.swapped })
    }
  } finally {
    await on.ed.page.close()
    on.ed.close()
  }
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
  try {
    const zip = await revealZip()
    const liveRun = await live(browser, zip)
    if (all || parts.has("canvas")) await canvas(browser, zip, liveRun, "1440x900", 1440, 900, false)
    if (all || parts.has("redraw")) await redraw(browser, zip, liveRun)
    if (all || parts.has("swap")) await swaps(browser, zip, liveRun)
    if (all || parts.has("phone")) await canvas(browser, zip, liveRun, "390x844", 390, 844, true)
  } finally {
    await browser.close()
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  process.exit(failed ? 1 : 0)
}

void main()
