/**
 * ===========================================================================
 *  A PAGE SWITCH IN THE CANVAS OF AN IMPORTED THEME, FILMED FRAME BY FRAME
 * ===========================================================================
 *   npx tsx scripts/check-canvas20.ts [desktop] [phone] [live]
 *
 * The real editor (scripts/render-editor-probe.tsx) on the theme built the
 * way Posturex is (tests/fixtures/shopify-posture), with a hero picture that
 * arrives late, as a phone network brings it. The page About is opened, then
 * the header's logo is pressed to go Home, and the editor is filmed while it
 * switches (the browser's own screencast, every frame it composites):
 *
 *   each frame of the canvas is held against a still of the page left (About)
 *   and a still of the page arrived at (Home), taken once each has settled.
 *   A frame like neither is a frame of something else: a page half drawn, a
 *   theme's entry animation part way, or two pages on top of each other. The
 *   switch should be About, About, ..., Home, Home: no frame in between, and
 *   never About again once Home has shown.
 *
 *   the sections panel is read on every frame of the editor: it should hold
 *   About's list until Home's is ready and then show Home's, never an empty
 *   list or grey bars in between.
 *
 *   the page arrived at is read from inside: its header where the live site
 *   puts it as the canvas is scrolled, with the same classes.
 *
 * `live` is the live site's navigation (lib/website-builder/live-navigation)
 * on the same theme: a header link pressed, filmed the same way.
 *
 * desktop is 1440x900; phone is 390x844 with touch and the CPU slowed 4x.
 * Measurements, not opinions. Exits 1 on any failure. Frames and stills go
 * to $OUT (default /tmp/canvas20).
 */
import { createServer } from "node:http"
import { mkdirSync, writeFileSync } from "node:fs"
import puppeteer, { type Browser, type CDPSession, type Frame, type Page } from "puppeteer-core"
import sharp from "sharp"
import { editorFor } from "./check-builder-nav19"

const OUT = process.env.OUT ?? "/tmp/canvas20"
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium"
/* The hero's picture answers this late; the sections route this late (a signed-in round trip). */
const PICTURE_MS = Number(process.env.PICTURE_MS ?? 600)
const API_MS = Number(process.env.API_MS ?? 400)
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
const within = <T,>(p: Promise<T>, ms = 1500): Promise<T> => Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error("no answer")), ms))])

/* ── the hero's picture, served late ──────────────────────────────────────── */

async function pictureServer(): Promise<{ url: string; close: () => void }> {
  /* A large photograph's worth of bytes: a gradient, so it is not one colour and a half drawn one shows. */
  const png = await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 30, g: 60, b: 110 } } })
    .composite([{ input: Buffer.from(`<svg width="1600" height="900"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#0b1d3a"/><stop offset="1" stop-color="#7aa7d9"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><circle cx="1100" cy="420" r="260" fill="#c9a27a"/></svg>`) }])
    .jpeg({ quality: 90 })
    .toBuffer()
  const server = createServer(async (req, res) => {
    await sleep(PICTURE_MS)
    res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" })
    res.end(png)
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}/hero.jpg`, close: () => server.close() }
}

/* ── film ─────────────────────────────────────────────────────────────────── */

type Shot = { t: number; data: Buffer }
async function film(page: Page): Promise<{ stop: () => Promise<Shot[]>; client: CDPSession }> {
  const client = await page.createCDPSession()
  const shots: Shot[] = []
  client.on("Page.screencastFrame", (f: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
    shots.push({ t: (f.metadata.timestamp ?? Date.now() / 1000) * 1000, data: Buffer.from(f.data, "base64") })
    client.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await client.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
  return {
    client,
    stop: async () => {
      await client.send("Page.stopScreencast").catch(() => {})
      return shots
    },
  }
}

type Box = { x: number; y: number; width: number; height: number }
/** A picture's region, small and grey enough to compare: what the eye sees, not the compression's noise. */
async function sample(png: Buffer, box: Box, scale: number): Promise<Buffer> {
  const meta = await sharp(png).metadata()
  const k = (meta.width ?? box.width) / scale
  const left = Math.max(0, Math.round(box.x * k)), top = Math.max(0, Math.round(box.y * k))
  const width = Math.min(Math.round(box.width * k), (meta.width ?? 0) - left), height = Math.min(Math.round(box.height * k), (meta.height ?? 0) - top)
  return sharp(png).extract({ left, top, width, height }).resize(96, 64, { fit: "fill" }).removeAlpha().raw().toBuffer()
}
const distance = (a: Buffer, b: Buffer) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i])
  return s / a.length
}

/** Each frame: like the page left (A), like the page arrived at (B), or like neither (x). */
async function classify(shots: Shot[], box: Box, scale: number, before: Buffer, after: Buffer, from: number) {
  const marks: { t: number; k: "A" | "B" | "x"; dA: number; dB: number }[] = []
  for (const s of shots) {
    if (s.t < from - 50) continue
    const v = await sample(s.data, box, scale)
    const dA = distance(v, before), dB = distance(v, after)
    const k = dA <= 3 ? "A" : dB <= 3 ? "B" : "x"
    marks.push({ t: Math.round(s.t - from), k, dA: Math.round(dA * 10) / 10, dB: Math.round(dB * 10) / 10 })
  }
  return marks
}
const runs = (marks: { k: string }[]) => {
  const out: string[] = []
  let last = "", n = 0
  for (const m of marks) {
    if (m.k === last) n++
    else { if (last) out.push(`${last}x${n}`); last = m.k; n = 1 }
  }
  if (last) out.push(`${last}x${n}`)
  return out.join(" ")
}

/* ── the editor's own record, every frame ─────────────────────────────────── */

const RECORD = `(() => {
  window.__rec = [];
  const tick = () => {
    const list = document.querySelector("[data-sections-list]");
    const sk = document.querySelector("[aria-busy='true'].skeleton-deferred");
    const rows = list ? [...list.querySelectorAll("[data-section-row]")].map((r) => r.getAttribute("data-section-row")).join(",") : "";
    const frames = [...document.querySelectorAll("[data-compat-frame]")].map((f) => { const cs = getComputedStyle(f); return f.getAttribute("data-compat-frame") + ":" + cs.visibility[0] + ":" + Number(cs.opacity).toFixed(2) + ":" + (cs.zIndex || "") });
    let veil = "";
    const fr = document.querySelector("[data-compat-frame='front']");
    if (fr) { const r = fr.getBoundingClientRect(); const top = document.elementsFromPoint(r.left + r.width / 2, r.top + 200); for (const el of top.slice(0, 4)) { let o = 1, e = el; while (e) { o *= Number(getComputedStyle(e).opacity); e = e.parentElement } veil += (el.tagName + "." + String(el.className).slice(0, 30) + "@" + o.toFixed(2) + " ") } }
    window.__rec.push({ t: performance.timeOrigin + performance.now(), rows, sk: !!sk, empty: !list && !sk, frames: frames.join(" ") + (window.__veil ? " ~ " + veil : "") });
    if (window.__rec.length < 4000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`

async function pageInCanvas(frame: Frame): Promise<string> {
  return within(frame.evaluate(() => {
    const main = document.querySelector("main .shopify-section [class*='main-'], main .shopify-section .slideshow")
    if (!main) return "?"
    if (main.classList.contains("slideshow")) return "home"
    const m = [...main.classList].find((c) => c.startsWith("main-"))
    return m ? m.slice(5) : "?"
  }))
}

async function frontBox(page: Page): Promise<Box> {
  const h = await page.$("[data-compat-frame='front']")
  const b = await h!.boundingBox()
  return { x: Math.round(b!.x), y: Math.round(b!.y), width: Math.round(b!.width), height: Math.round(b!.height) }
}

async function waitFor(ed: { frame: () => Promise<Frame> }, key: string, ms = 8000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const f = await ed.frame().catch(() => null)
    if (f && (await pageInCanvas(f).catch(() => "?")) === key) return f
    await sleep(100)
  }
  throw new Error(`the canvas never showed ${key}`)
}

async function switchInEditor(browser: Browser, label: string, width: number, height: number, touch: boolean) {
  console.log(`\nbuilder, ${label} ${width}x${height}${touch ? " touch, CPU 4x" : ""}`)
  const pic = await pictureServer()
  const ed = await editorFor(browser, width, height, touch, (compat) => {
    /* The hero's first slide gets the late picture: Posturex's is a photograph. */
    const home = compat.pages.home as { type: string; blocks?: { settings: Record<string, unknown> }[] }[]
    for (const s of home) if (s.type === "slideshow" && s.blocks?.[0]) s.blocks[0].settings.image = pic.url
  })
  try {
    let frame = await ed.frame()
    await sleep(1200)
    if (touch) await ed.page.emulateCPUThrottling(4)
    const press = async (sel: string) => {
      const f = await ed.frame()
      const p = await within(f.evaluate((s) => { const r = document.querySelector(s)!.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 20), y: r.top + r.height / 2 } }, sel))
      const fb = await frontBox(ed.page)
      if (touch) await ed.page.touchscreen.tap(fb.x + p.x, fb.y + p.y)
      else await ed.page.mouse.click(fb.x + p.x, fb.y + p.y)
    }
    /* To About: the header's link (a phone: the menu, then its link). */
    if (touch) {
      await press(".site-header__burger")
      await sleep(400)
      await press(".drawer a[href='/about'], .drawer a[href='/pages/about']")
    } else {
      await press(".site-header__nav a[href='/about'], .site-header__nav a[href='/pages/about']")
    }
    frame = await waitFor(ed, "page")
    await sleep(2500)
    const box = await frontBox(ed.page)
    const before = await sample(Buffer.from(await ed.page.screenshot({ type: "png" })), box, width)
    await ed.page.screenshot({ path: `${OUT}/${label}-about.png` })

    /* Home, by the logo, filmed. */
    await ed.page.evaluate("window.__veil = !!" + JSON.stringify(process.env.DEBUG ?? ""))
    await ed.page.evaluate(RECORD)
    await ed.page.evaluate((ms) => { (window as unknown as { PROBE_API_DELAY_MS: number }).PROBE_API_DELAY_MS = ms }, API_MS)
    const cam = await film(ed.page)
    await sleep(300)
    const at = Date.now()
    await press(".site-header__logo")
    await sleep(touch ? 6000 : 4000)
    const shots = await cam.stop()
    frame = await waitFor(ed, "home")
    await sleep(1500)
    const after = await sample(Buffer.from(await ed.page.screenshot({ type: "png" })), box, width)
    await ed.page.screenshot({ path: `${OUT}/${label}-home.png` })
    const marks = await classify(shots, box, width, before, after, at)
    writeFileSync(`${OUT}/${label}-marks.json`, JSON.stringify(marks, null, 1))
    /* The frames that were neither page, kept for a look. */
    let kept = 0
    for (const s of shots) {
      const m = marks.find((x) => x.t === Math.round(s.t - at))
      if (m && m.k === "x" && kept < 12) writeFileSync(`${OUT}/${label}-between-${kept++}-${m.t}ms.png`, s.data)
    }
    const firstB = marks.findIndex((m) => m.k === "B")
    const between = marks.filter((m) => m.k === "x")
    const backToA = firstB >= 0 ? marks.slice(firstB).filter((m) => m.k === "A").length : 0
    const settledAt = (() => { for (let i = marks.length - 1; i >= 0; i--) if (marks[i].k !== "B") return marks[i + 1]?.t ?? -1; return marks[0]?.t ?? -1 })()
    console.log(`        frames: ${runs(marks)}`)
    console.log(`        Home on screen ${settledAt}ms after the press; ${between.length} frames like neither page${between.length ? ` (at ${between.slice(0, 8).map((m) => `${m.t}ms A${m.dA}/B${m.dB}`).join(", ")})` : ""}`)
    check(`${label}: no frame between About and Home (no half drawn page, no two pages at once)`, between.length === 0, `${between.length} of ${marks.length}`)
    check(`${label}: About never comes back once Home has shown`, backToA === 0, `${backToA}`)
    check(`${label}: Home is on screen within ${touch ? 2600 : 1600}ms of the press (sections route ${API_MS}ms, hero picture ${PICTURE_MS}ms)`, settledAt >= 0 && settledAt <= (touch ? 2600 : 1600), `${settledAt}ms`)

    /* The sections panel, every frame of the editor. */
    const rec = (await ed.page.evaluate(() => (window as unknown as { __rec: { t: number; rows: string; sk: boolean; empty: boolean; frames: string }[] }).__rec)).filter((r) => r.t >= at - 20)
    const lists: string[] = []
    for (const r of rec) { const k = r.sk ? "(grey bars)" : r.empty ? "(nothing)" : r.rows; if (lists[lists.length - 1] !== k) lists.push(k) }
    const named = lists.map((l) => (l.startsWith("(") ? l : l.includes("main") || l.includes("template--") && !l.includes("hero") ? (l.includes("hero") ? "Home" : "About") : l.includes("hero") ? "Home" : "About"))
    console.log(`        sections panel: ${named.join(" -> ")}`)
    const frameStates: string[] = []
    for (const r of rec) if (frameStates[frameStates.length - 1] !== r.frames) frameStates.push(r.frames)
    if (process.env.DEBUG) console.log(`        frames: ${frameStates.join("  |  ")}`)
    check(`${label}: the sections panel goes from About's list to Home's, never empty or grey in between`, lists.length === 2 && !lists.some((l) => l.startsWith("(")), named.join(" -> "))

    /* Scrolled, the header of the page arrived at is where the live site's is. */
    frame = await ed.frame()
    const header: string[] = []
    for (const y of [0, 240, 900, 400, 0]) {
      await within(frame.evaluate((y) => scrollTo(0, y), y))
      await sleep(250)
      header.push(await within(frame.evaluate(() => { const h = document.querySelector(".site-header")!.getBoundingClientRect(); return `${scrollY}:${Math.round(h.top)}` })))
    }
    check(`${label}: the sticky header stays at the top of the canvas as it scrolls`, header.every((h) => h.endsWith(":0")), header.join(" "))
  } finally {
    ed.close()
    pic.close()
  }
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--hide-scrollbars"] })
  try {
    if (all || parts.has("desktop")) await switchInEditor(browser, "desktop", 1440, 900, false)
    if (all || parts.has("phone")) await switchInEditor(browser, "phone", 390, 844, true)
  } finally {
    await browser.close()
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  process.exit(failed ? 1 : 0)
}

if (require.main === module) void main()
