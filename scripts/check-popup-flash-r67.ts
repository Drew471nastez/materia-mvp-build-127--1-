/**
 * ===========================================================================
 *  POPUPS OPEN AND CLOSE WITH NO FLASH, MEASURED IN PAINTED FRAMES (round 67)
 * ===========================================================================
 *   npx tsx scripts/check-popup-flash-r67.ts
 *     TEMPLATES=fitness,space   which Materia templates (default: a spread)
 *     WIDTH=1440                the screen (390 for a phone)
 *     SHOTS=<dir>               keep the sampled frames of the first popup
 *
 * The owner: "popups flash black or white when they open or close, in the
 * preview, the live site and all themes. They must open and close smoothly,
 * like native UI." Every popup of the overlay group is switched on (its
 * trigger made manual) and opened and closed on the live page, while the
 * browser's own compositor frames are captured (CDP screencast, every
 * frame). In each frame two places are read: the screen's corner band (the
 * shade over the page) and the middle (the card). Smooth means each one goes
 * from where it starts to where it ends without leaving that range, and
 * without turning back: a frame darker or lighter than both ends, or a
 * reversal of more than 6 levels of 255, is a flash.
 *
 * The cart drawer, the search and the phone menu are drawers of the same
 * group and are read the same way where the header has them.
 */
import { join } from "node:path"
import puppeteer, { type CDPSession, type Page } from "puppeteer-core"
import sharp from "sharp"
import { importTemplate, serve } from "./theme-templates/site"
import { auditSite } from "./theme-templates/fixtures"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const TEMPLATES = (process.env.TEMPLATES ?? "fitness,space,clothing,samples,coach,newleaf").split(",").filter(Boolean)
const WIDTH = Number(process.env.WIDTH ?? 1440)
const HEIGHT = WIDTH < 700 ? 844 : 900
const TOL = 6
let failed = 0
const check = (label: string, ok: boolean, detail: unknown = "") => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail !== "" ? `  (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`)
}

/** Mean luminance of a box of the frame (fractions of the screen). */
async function lums(jpeg: Buffer): Promise<{ edge: number; mid: number }> {
  const img = sharp(jpeg)
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
  const at = (x0: number, y0: number, x1: number, y1: number) => {
    let sum = 0, n = 0
    for (let y = Math.floor(y0 * info.height); y < Math.floor(y1 * info.height); y += 2) for (let x = Math.floor(x0 * info.width); x < Math.floor(x1 * info.width); x += 2) {
      const i = (y * info.width + x) * info.channels
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; n++
    }
    return n ? sum / n : 0
  }
  // The shade: a band down the left edge, below the header. The card: the middle.
  return { edge: at(0.005, 0.2, 0.05, 0.95), mid: at(0.42, 0.42, 0.58, 0.58) }
}

/** Frames painted while `act` runs and for `ms` after. */
async function film(page: Page, cdp: CDPSession, act: () => Promise<unknown>, ms: number): Promise<Buffer[]> {
  const frames: Buffer[] = []
  const on = (e: { data: string; sessionId: number }) => { frames.push(Buffer.from(e.data, "base64")); void cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {}) }
  cdp.on("Page.screencastFrame", on)
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, maxWidth: 480, maxHeight: 480, everyNthFrame: 1 })
  await sleep(150)
  await act()
  await sleep(ms)
  await cdp.send("Page.stopScreencast")
  cdp.off("Page.screencastFrame", on)
  return frames
}

/** A flash: a frame outside the range of the two ends, or a turn back. */
function flashIn(series: number[]): string | null {
  if (series.length < 2) return null
  const a = series[0], b = series[series.length - 1]
  const lo = Math.min(a, b) - TOL, hi = Math.max(a, b) + TOL
  const dir = Math.sign(b - a)
  let peak = a
  for (let i = 1; i < series.length; i++) {
    const v = series[i]
    if (v < lo || v > hi) return `frame ${i}: ${v.toFixed(0)} outside ${a.toFixed(0)}..${b.toFixed(0)}`
    if (dir > 0) { if (v < peak - TOL) return `frame ${i}: back from ${peak.toFixed(0)} to ${v.toFixed(0)}`; peak = Math.max(peak, v) }
    else if (dir < 0) { if (v > peak + TOL) return `frame ${i}: back from ${peak.toFixed(0)} to ${v.toFixed(0)}`; peak = Math.min(peak, v) }
  }
  return null
}

async function measure(page: Page, cdp: CDPSession, label: string, open: () => Promise<unknown>, close: () => Promise<unknown>, shots?: string) {
  for (const [what, act] of [["opens", open], ["closes", close]] as const) {
    const frames = await film(page, cdp, act, 900)
    const read = await Promise.all(frames.map(lums))
    const edge = flashIn(read.map((r) => r.edge)), mid = flashIn(read.map((r) => r.mid))
    if (process.env.DEBUG) console.log(`      ${what} shade ${read.map((r) => r.edge.toFixed(0)).join(" ")}\n      ${what} card  ${read.map((r) => r.mid.toFixed(0)).join(" ")}`)
    check(`${label} ${what} with no flash (${frames.length} frames)`, !edge && !mid, [edge && `shade ${edge}`, mid && `card ${mid}`].filter(Boolean).join("; ") || `shade ${read[0]?.edge.toFixed(0)}->${read.at(-1)?.edge.toFixed(0)}, card ${read[0]?.mid.toFixed(0)}->${read.at(-1)?.mid.toFixed(0)}`)
    if (shots) await Promise.all(frames.map((f, i) => sharp(f).toFile(join(shots, `${label.replace(/\W+/g, "-")}-${what}-${String(i).padStart(2, "0")}.jpg`))))
  }
}

void (async () => {
  const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  for (const template of TEMPLATES) {
    console.log(`\n${template} at ${WIDTH}`)
    const imported = await importTemplate(`materia/${template}`)
    // Every popup of the overlay group switched on, on every page.
    const popups = new Set<string>()
    for (const pg of imported.theme.pages) for (const sec of pg.sections as unknown as { type: string; group?: string; hidden?: boolean; id?: string }[]) {
      if (sec.group === "overlay" && /popup|promobanner/i.test(sec.type) && !/size-chart|login|quickview/i.test(sec.type)) { sec.hidden = false; popups.add(sec.type) }
    }
    const built = auditSite(imported, template, false, { own: true })
    const { base, server } = await serve(built, join("scripts", "theme-templates", "products", template))
    const page = await browser.newPage()
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, isMobile: WIDTH < 700, hasTouch: WIDTH < 700 })
    await page.evaluateOnNewDocument("window.__name = (f) => f")
    // Every popup waits for a hand: its trigger is made manual.
    await page.evaluateOnNewDocument(() => {
      let real: { register: (c: { trigger?: unknown }) => unknown } | undefined
      Object.defineProperty(window, "MateriaPopups", {
        configurable: true,
        get: () => real,
        set: (v) => { if (v && v.register) { const r = v.register; v.register = (c: { trigger?: unknown }) => r({ ...c, trigger: { mode: "manual" } }) } real = v },
      })
    })
    page.on("pageerror", (e) => console.log("    page error:", String(e).slice(0, 160)))
    await page.goto(base + "/", { waitUntil: "networkidle0", timeout: 60000 }).catch(() => {})
    await sleep(1500)
    const cdp = await page.createCDPSession()
    const ids = await page.evaluate(() => [...document.querySelectorAll("[data-popup-id]")].map((e) => e.getAttribute("data-popup-id")!))
    console.log(`  popups: ${ids.length} of ${popups.size} sections`)
    if (process.env.DEBUG) console.log(await page.evaluate(() => ({ mp: typeof (window as unknown as { MateriaPopups?: unknown }).MateriaPopups, secs: [...document.querySelectorAll(".shopify-section")].map((s) => s.id).join(" ") })))
    let first = true
    for (const id of ids) {
      await page.evaluate(() => scrollTo(0, 0))
      await sleep(300)
      await measure(page, cdp, `popup ${id.replace(/^.*__/, "")}`,
        () => page.evaluate((x) => (window as unknown as { MateriaPopups: { open(i: string): unknown } }).MateriaPopups.open(x), id),
        () => page.evaluate(() => (window as unknown as { MateriaPopups: { close(): unknown } }).MateriaPopups.close()),
        first ? process.env.SHOTS : undefined)
      first = false
      await sleep(400)
    }
    await page.close()
    server.close()
  }
  await browser.close()
  console.log(failed ? `\n${failed} failed` : "\nall ok")
  process.exit(failed ? 1 : 0)
})()
