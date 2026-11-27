/**
 * ===========================================================================
 *  EVERY OVERLAY OPENS AND CLOSES WITH NO FLASH, ON EVERY SURFACE (round 68)
 * ===========================================================================
 *   npx tsx scripts/check-overlay-flash-r68.ts
 *     TEMPLATES=fitness,newleaf   which Materia templates (default: a spread)
 *     WIDTH=1440                  the screen (390 for a phone)
 *     CPU=4                       Chromium's CPU throttle (1 = none)
 *     MODE=live|canvas|preview    the live website, the builder's canvas
 *                                 (design mode: opened by selecting it in the
 *                                 overlay group, switched to the next one,
 *                                 drawn again after an edit, deselected), or
 *                                 the marketplace preview (public/theme-previews)
 *     OUT=<file>                  the numbers as JSON
 *
 * The owner, after round 67: "when I open or close a modal, it shows a black
 * flash glitch. I don't want it in any place." Round 67 read the popups of
 * one surface at full speed. Here every popup of the overlay group (and the
 * cart drawer, search and phone menu where the header has them) is opened
 * and closed while two recorders run:
 *
 *   pixels   every compositor frame (CDP screencast): the mean light of the
 *            whole screen, of a band down its left edge (the shade) and of
 *            its middle (the card)
 *   styles   every animation frame in the page: the shade's drawn opacity
 *            (its own opacity times its parents', and a dialog's ::backdrop),
 *            the page's scrollbar and scroll position
 *
 * A flash is a frame darker or lighter than both ends of the motion, or a
 * turn back of more than a few levels; a jump is the scroll position or the
 * page's width changing while the overlay moves. Zero of either is the bar.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { createServer, type Server } from "node:http"
import { extname, join } from "node:path"
import puppeteer, { type Browser, type CDPSession, type Page } from "puppeteer-core"
import sharp from "sharp"
import { importTemplate, serve } from "./theme-templates/site"
import { auditSite } from "./theme-templates/fixtures"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const TEMPLATES = (process.env.TEMPLATES ?? "fitness,newleaf,outerwear,clothing,rail,notionpage").split(",").filter(Boolean)
const WIDTH = Number(process.env.WIDTH ?? 1440)
const HEIGHT = WIDTH < 700 ? 844 : 900
const CPU = Number(process.env.CPU ?? 1)
const MODE = (process.env.MODE ?? "live") as "live" | "canvas" | "preview"
const PHONE = WIDTH < 700
/* A phone's whole frame dims a little before a light card covers it (shade first, then card): a flash is far larger than that. */
const TOL = PHONE ? 12 : 6
let failed = 0
const results: { template: string; surface: string; what: string; ok: boolean; detail: string; frames: number }[] = []
const check = (template: string, surface: string, what: string, ok: boolean, detail: string, frames: number) => {
  if (!ok) failed++
  results.push({ template, surface, what, ok, detail, frames })
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${surface} ${what} (${frames} frames)  ${detail}`)
}

type Lum = { all: number; edge: number; mid: number }
async function lums(jpeg: Buffer): Promise<Lum> {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true })
  const at = (x0: number, y0: number, x1: number, y1: number) => {
    let sum = 0, n = 0
    for (let y = Math.floor(y0 * info.height); y < Math.floor(y1 * info.height); y += 2) for (let x = Math.floor(x0 * info.width); x < Math.floor(x1 * info.width); x += 2) {
      const i = (y * info.width + x) * info.channels
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; n++
    }
    return n ? sum / n : 0
  }
  const all = at(0, 0, 1, 1)
  if (PHONE) return { all, edge: all, mid: all }
  return { all, edge: at(0.005, 0.2, 0.05, 0.95), mid: at(0.42, 0.42, 0.58, 0.58) }
}

/** A flash: a frame outside the range of the two ends, or a turn back. */
export function flashIn(series: number[], tol = TOL): string | null {
  if (series.length < 2) return null
  const a = series[0], b = series[series.length - 1]
  const lo = Math.min(a, b) - tol, hi = Math.max(a, b) + tol
  const dir = Math.abs(b - a) <= tol ? 0 : Math.sign(b - a)
  let peak = a
  for (let i = 1; i < series.length; i++) {
    const v = series[i]
    if (v < lo || v > hi) return `frame ${i}: ${v.toFixed(0)} outside ${a.toFixed(0)}..${b.toFixed(0)}`
    if (dir > 0) { if (v < peak - tol) return `frame ${i}: back from ${peak.toFixed(0)} to ${v.toFixed(0)}`; peak = Math.max(peak, v) }
    else if (dir < 0) { if (v > peak + tol) return `frame ${i}: back from ${peak.toFixed(0)} to ${v.toFixed(0)}`; peak = Math.min(peak, v) }
  }
  return null
}

/** The series from its turn: the frame furthest from its end. */
export function fromTurn(series: number[]): number[] {
  if (series.length < 3) return series
  const end = series[series.length - 1]
  /* The turn is where the series stops going one way: the frame after the start furthest from the end. */
  let at = 1
  for (let i = 1; i < series.length; i++) if (Math.abs(series[i] - end) > Math.abs(series[at] - end)) at = i
  return series.slice(at)
}

/* ---------------- the in-page recorder ---------------- */
const STYLE_RECORDER = () => {
  const w = window as unknown as { __ov: { on: boolean; rows: { t: number; shade: number; sy: number; cw: number; hidden: number }[] } }
  w.__ov = { on: true, rows: [] }
  /* The drawn alpha of everything fixed over the whole screen (a shade, a ::backdrop): every fixed element
     and dialog of the page is listed once, before the motion, and read on each frame (hit testing would skip
     a shade that takes no clicks). */
  const list = [...document.querySelectorAll<HTMLElement>("body *")].filter((el) => el instanceof HTMLDialogElement || getComputedStyle(el).position === "fixed")
  const alphaOf = (c: string) => { const m = c.match(/rgba?\(([^)]+)\)/); const p = m ? m[1].split(/[\s,/]+/).filter(Boolean).map(Number) : [0, 0, 0, 0]; return p.length > 3 ? p[3] : 1 }
  const shadeAt = () => {
    let clear = 1
    for (const el of list) {
      if (!el.isConnected) continue
      const cs = getComputedStyle(el)
      if (cs.display === "none") continue
      const r = el.getBoundingClientRect()
      const modal = el instanceof HTMLDialogElement && el.matches(":modal")
      if (modal) { const bd = getComputedStyle(el, "::backdrop"); clear *= 1 - Math.min(1, alphaOf(bd.backgroundColor) * parseFloat(bd.opacity)) }
      if (r.width < innerWidth * 0.9 || r.height < innerHeight * 0.85 || r.left > 8 || r.top > innerHeight * 0.2) continue
      let o = 1
      for (let e: Element | null = el; e; e = e.parentElement) { const s = getComputedStyle(e); o *= parseFloat(s.opacity); if (s.visibility === "hidden" || s.display === "none") o = 0 }
      clear *= 1 - Math.min(1, alphaOf(cs.backgroundColor) * o)
    }
    return 1 - clear
  }
  const tick = (t: number) => {
    if (!w.__ov.on) return
    w.__ov.rows.push({ t, shade: +shadeAt().toFixed(3), sy: Math.round(scrollY), cw: document.documentElement.clientWidth, hidden: 0 })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** Frames painted while `act` runs and for `ms` after, and the page's own rows. */
async function film(page: Page, cdp: CDPSession, act: () => Promise<unknown>, ms: number) {
  const frames: Buffer[] = []
  const on = (e: { data: string; sessionId: number }) => { frames.push(Buffer.from(e.data, "base64")); void cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {}) }
  cdp.on("Page.screencastFrame", on)
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, maxWidth: 480, maxHeight: 480, everyNthFrame: 1 })
  await sleep(200)
  await page.evaluate(STYLE_RECORDER)
  await sleep(100)
  await act()
  await sleep(ms)
  const rows = await page.evaluate(() => { const w = window as unknown as { __ov: { on: boolean; rows: { t: number; shade: number; sy: number; cw: number }[] } }; w.__ov.on = false; return w.__ov.rows })
  await cdp.send("Page.stopScreencast")
  cdp.off("Page.screencastFrame", on)
  return { frames, rows }
}

/* The page behind holds still while an overlay is read: its slideshows, marquees and videos would move the light on their own. */
const HOLD_PAGE = () => {
  for (const a of document.getAnimations()) { const t = (a.effect as KeyframeEffect | null)?.target as Element | null; if (t && !t.closest("[data-popup-id], dialog, cart-drawer, .minicart, [class*='drawer'], [class*='search'], .navigation__menu-content")) try { a.pause() } catch {} }
  for (const v of document.querySelectorAll("video")) try { v.pause() } catch {}
  for (const el of document.querySelectorAll<HTMLElement & { swiper?: { autoplay?: { stop(): void } } }>(".swiper, .swiper-container, [class*='swiper']")) try { el.swiper?.autoplay?.stop() } catch {}
  let st = document.getElementById("ov-hold")
  if (!st) { st = document.createElement("style"); st.id = "ov-hold"; st.textContent = "marquee-text *, .marquee *, [class*='marquee'] *, [class*='ticker'] *{animation-play-state:paused!important}"; document.head.appendChild(st) }
}

async function measure(template: string, page: Page, cdp: CDPSession, surface: string, steps: [string, () => Promise<unknown>][], keys: ("all" | "edge" | "mid")[] = ["all", "edge", "mid"]) {
  for (const [what, act] of steps) {
    await page.evaluate(HOLD_PAGE).catch(() => {})
    /* A close is read until just before the next waiting popup may open (materia-popups flush: its gap, 600ms, after the close). */
    const { frames, rows } = await film(page, cdp, act, /close/.test(what) ? 700 : CPU > 1 ? 1600 : 1000)
    const read = await Promise.all(frames.map(lums))
    /* The shade at the screen's edge holds to TOL. The whole screen also carries the card, which fades over the
       shade (its middle passes through the shaded page as it comes and goes, the way a card does): a flash of the
       screen is far larger than that, so the whole screen holds to 16 levels. The middle alone is not judged. */
    const tolOf = (k: string) => (k === "all" && !PHONE ? 16 : k === "mid" ? 255 : TOL)
    /* A step where the person turns back on purpose (deselects, then picks it again) may turn once: from its turn on it must not. */
    const judge = (series: number[], tol: number) => (/after a pause/.test(what) ? flashIn(fromTurn(series), tol) : flashIn(series, tol))
    const pix = keys.map((k) => [k, judge(read.map((r) => r[k]), tolOf(k))] as const).filter(([, f]) => f)
    const shade = rows.map((r) => r.shade * 100)
    const sFlash = judge(shade, 3)
    const jumps = rows.filter((r, i) => i && (r.sy !== rows[i - 1].sy || r.cw !== rows[i - 1].cw)).map((r) => `scroll ${r.sy} width ${r.cw}`)
    const ok = !pix.length && !sFlash && !jumps.length
    const detail = ok
      ? `shade ${shade[0]?.toFixed(0)}->${shade.at(-1)?.toFixed(0)}%, light ${read[0]?.all.toFixed(0)}->${read.at(-1)?.all.toFixed(0)}`
      : [...pix.map(([k, f]) => `pixels ${k} ${f}`), sFlash && `shade ${sFlash}`, jumps.length && `jump ${jumps.slice(0, 2).join(", ")}`].filter(Boolean).join("; ")
    if (process.env.DEBUG || !ok) console.log(`        light ${read.map((r) => r.all.toFixed(0)).join(" ")}\n        shade ${shade.map((s) => s.toFixed(0)).join(" ")}`)
    check(template, surface, what, ok, detail, frames.length)
    if (process.env.SHOTS && (!ok || process.env.SHOTS_ALL)) await Promise.all(frames.map((f, i) => sharp(f).toFile(join(process.env.SHOTS!, `${template}-${surface}-${what}-${String(i).padStart(2, "0")}.jpg`.replace(/[^\w.-]+/g, "-")))))
  }
}

const popupIds = (page: Page) => page.evaluate(() => [...document.querySelectorAll("[data-popup-id]")].map((e) => e.getAttribute("data-popup-id")!))
const P = "window.MateriaPopups"

async function newPage(browser: Browser) {
  const page = await browser.newPage()
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, isMobile: PHONE, hasTouch: PHONE })
  await page.evaluateOnNewDocument("window.__name = (f) => f")
  // Every popup waits for a hand: its trigger is made manual.
  await page.evaluateOnNewDocument(() => {
    let real: { register: (c: { trigger?: unknown }) => unknown } | undefined
    Object.defineProperty(window, "MateriaPopups", {
      configurable: true,
      get: () => real,
      set: (v) => { if (v && v.register && !(window as unknown as { __natural?: boolean }).__natural) { const r = v.register; v.register = (c: { trigger?: unknown }) => r({ ...c, trigger: { mode: "manual" } }) } real = v },
    })
  })
  page.on("pageerror", (e) => console.log("    page error:", String(e).slice(0, 160)))
  /* OLD_FILES=dir: the theme files a store installed earlier answer in place of today's (by name, e.g. materia-popups.js), as on a website that has not reinstalled. */
  /* NO_HEAD_FIX=1: the page without round 68's head fix (theme-motion-fix.ts), as before this round. */
  if (process.env.OLD_FILES || process.env.NO_HEAD_FIX) {
    const dir = process.env.OLD_FILES ?? ""
    await page.setRequestInterception(true)
    page.on("request", (req) => {
      if (process.env.NO_HEAD_FIX && req.resourceType() === "document") {
        void fetch(req.url()).then(async (r) => req.respond({ status: r.status, contentType: "text/html", body: (await r.text()).replace(/<style data-sl-motion-fix>[\s\S]*?<\/style>/, "").replace(/<script data-sl-popup-handoff>[\s\S]*?<\/script>/, "") })).catch(() => req.continue())
        return
      }
      const name = decodeURIComponent(new URL(req.url()).pathname.split("/").pop() ?? "").replace(/\.[0-9a-f]{12}(\.\w+)$/, "$1")
      if (dir && name && existsSync(join(dir, name)) && (process.env.DEBUG ? console.log("    old file:", name) : true)) void req.respond({ status: 200, contentType: name.endsWith(".css") ? "text/css" : "text/javascript", body: readFileSync(join(dir, name)) })
      else void req.continue()
    })
  }
  const cdp = await page.createCDPSession()
  return { page, cdp }
}

/* The drawers of the same group: the cart, the search and the phone menu, where the header has them. */
async function drawers(template: string, page: Page, cdp: CDPSession) {
  const openers: [string, string][] = [
    ["cart drawer", "header .minicart__action, [data-cart-drawer-toggle], .header__icon--cart, [aria-controls*='CartDrawer'], [data-open-cart]"],
    ["search", "header .top-search-toggle, .header__search summary, [data-search-toggle], .search-modal__toggle, .header__icon--search"],
    ["menu drawer", PHONE ? "header .nav-toggle, .header__icon--menu, menu-drawer summary, [data-menu-toggle]" : "__none__"],
  ]
  for (const [name, sel] of openers) {
    const found = await page.evaluate((s) => { const el = [...document.querySelectorAll<HTMLElement>(s)].find((e) => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden"); if (!el) return null; el.setAttribute("data-ov-open", ""); return true }, sel).catch(() => null)
    if (!found) continue
    await page.evaluate(() => scrollTo(0, 0))
    await sleep(300)
    await measure(template, page, cdp, name, [
      ["opens", () => page.click("[data-ov-open]").catch(() => page.evaluate(() => (document.querySelector("[data-ov-open]") as HTMLElement).click()))],
      ["closes", async () => {
        await page.keyboard.press("Escape")
        /* A drawer with no Escape: its own close button. */
        await sleep(60)
        await page.evaluate(() => { const x = [...document.querySelectorAll<HTMLElement>("close-menu, .close-menu, [data-close-drawer], .drawer__close, .minicart__close, .search__close, [aria-label='Close' i], button[class*='close']")].find((e) => e.getClientRects().length && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== "hidden" && e.getBoundingClientRect().top < innerHeight); if (x) x.click() })
      }],
    ], PHONE ? ["all"] : ["edge"])
    await page.keyboard.press("Escape").catch(() => {})
    await sleep(600)
  }
}

/* ---------------- the marketplace preview, served as the CDN serves it ---------------- */
const SLUG: Record<string, string> = {}
function servePreviews(): Promise<{ base: string; server: Server }> {
  const root = join("public")
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)
    let file = join(root, p)
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html")
    if (!existsSync(file) && existsSync(file + ".html")) file = file + ".html"
    if (!existsSync(file)) { res.writeHead(404); res.end(); return }
    const t: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" }
    res.writeHead(200, { "Content-Type": t[extname(file)] ?? "application/octet-stream" })
    res.end(readFileSync(file))
    p = ""
  })
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ base: `http://127.0.0.1:${(server.address() as { port: number }).port}`, server })))
}

void (async () => {
  const browser = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox"] })
  console.log(`${MODE} at ${WIDTH}, CPU x${CPU}`)
  let previews: { base: string; server: Server } | null = null
  if (MODE === "preview") {
    previews = await servePreviews()
    const { templatePreviewPath, CODE_THEME_PACKAGE } = await import("../lib/themes/marketplace-shared")
    for (const t of TEMPLATES) {
      const p = templatePreviewPath({ codePackage: `${CODE_THEME_PACKAGE}/${t}` })
      if (p) SLUG[t] = p
    }
  }
  for (const template of TEMPLATES) {
    console.log(`\n${template}`)
    let base = "", server: Server | null = null
    if (MODE === "preview") {
      if (!SLUG[template]) { console.log("  no preview"); continue }
      base = previews!.base + SLUG[template].replace(/\/index\.html$/, "").replace(/\/$/, "")
    } else {
      const imported = await importTemplate(`materia/${template}`)
      for (const pg of imported.theme.pages) for (const sec of pg.sections as unknown as { type: string; group?: string; hidden?: boolean }[]) {
        if (sec.group === "overlay" && /popup|promobanner/i.test(sec.type) && !/size-chart|login|quickview/i.test(sec.type)) sec.hidden = false
      }
      /* Promotion popup (Code), a native modal <dialog>: from the section library, in no template; added here so it is read too. */
      const home = imported.theme.pages.find((p) => (p as { page_key?: string }).page_key === "home") ?? imported.theme.pages[0]
      const like = (home.sections as unknown as Record<string, unknown>[]).find((x) => x.group === "overlay")
      if (like && MODE !== "preview") (home.sections as unknown as Record<string, unknown>[]).push({ ...like, id: "promotion_popup_code", type: "promotion-popup", name: "Promotion popup", hidden: false, settings: { show_promotion_select: "show_promotion_homepage", promotion_code: "SAVE10", editor_preview: false }, blocks: [] })
      const built = auditSite(imported, template, false, { own: true })
      if (MODE === "canvas") (built.site as { designMode?: boolean }).designMode = true
      const s = await serve(built, join("scripts", "theme-templates", "products", template))
      base = s.base; server = s.server
    }
    const { page, cdp } = await newPage(browser)
    await page.goto(base + "/", { waitUntil: "networkidle0", timeout: 90000 }).catch(() => {})
    await sleep(1500)
    if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
    const ids = (await popupIds(page)).filter((_, i) => !process.env.ONLY || process.env.ONLY.split(",").includes(String(i)))
    console.log(`  popups: ${ids.length}${process.env.DEBUG ? ` head fix ${await page.evaluate(() => document.querySelectorAll("style[data-sl-motion-fix]").length)}` : ""}`)
    if (MODE === "canvas") {
      /* As canvas-bridge mark() does: the last section's deselect and the next one's select in one task. */
      const fireAll = (list: [string, string][]) => page.evaluate((l) => { for (const [n, x] of l) { const s = document.getElementById("shopify-section-" + x) ?? document; s.dispatchEvent(new CustomEvent(n, { bubbles: true, detail: { sectionId: x, load: false } })) } }, list)
      const fire = (name: string, id: string) => fireAll([[name, id]])
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i], next = ids[(i + 1) % ids.length]
        if (ids.length < 2) break
        const short = id.replace(/^.*__/, "")
        /* In the builder a popup set to show while editing is already open, so picking another one is a switch too. */
        await measure(template, page, cdp, `popup ${short}`, [
          ["opens on select", () => fire("shopify:section:select", id)],
        ], PHONE ? ["all"] : ["all", "edge"])
        /* From one card to another the middle of the screen passes through the shaded page: that is the motion, not a
           flash. What must not move back and forth is the shade, read at the screen's edge and in the page's styles. */
        await measure(template, page, cdp, `popup ${short}`, [
          ["switches to the next one", () => fireAll([["shopify:section:deselect", id], ["shopify:section:select", next]])],
          /* Deselected (a click on the page), then the next one picked a moment later, while the first still closes. */
          ["switches back after a pause", async () => { await fire("shopify:section:deselect", next); await sleep(90); await fire("shopify:section:select", id) }],
        ], PHONE ? ["all"] : ["all", "edge"])
        await measure(template, page, cdp, `popup ${short}`, [
          ["closes on deselect", () => fire("shopify:section:deselect", id)],
        ])
        await sleep(300)
      }
    } else {
      for (const id of ids) {
        await page.evaluate(() => scrollTo(0, 0))
        await sleep(300)
        await measure(template, page, cdp, `popup ${id.replace(/^.*__/, "")}`, [
          ["opens", () => page.evaluate(`${P}.open(${JSON.stringify(id)})`)],
          ["closes", () => page.evaluate(`${P}.close()`)],
        ])
        await sleep(400)
      }
      /* The Code popup opens as its runtime opens it (showModal, the page locked) and closes from its own button. */
      if (await page.evaluate(() => !!document.querySelector("[data-pp-dialog]"))) {
        await page.evaluate(() => scrollTo(0, 0))
        await measure(template, page, cdp, "promotion popup (code)", [
          ["opens", () => page.evaluate(() => { const d = document.querySelector<HTMLDialogElement>("[data-pp-dialog]")!; d.showModal(); document.documentElement.classList.add("pc-lock") })],
          ["closes", () => page.evaluate(() => { const d = document.querySelector<HTMLDialogElement>("[data-pp-dialog]")!; d.close(); document.documentElement.classList.remove("pc-lock") })],
        ])
      }
      if (process.env.DRAWERS !== "0") await drawers(template, page, cdp)
    }
    await page.close()
    server?.close()
  }
  previews?.server.close()
  await browser.close()
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ mode: MODE, width: WIDTH, cpu: CPU, results }, null, 1))
  console.log(failed ? `\n${failed} failed` : "\nall ok")
  process.exit(failed ? 1 : 0)
})()
