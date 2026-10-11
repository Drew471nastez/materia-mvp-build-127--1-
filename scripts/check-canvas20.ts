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
 * on the same theme: the logo pressed on About, filmed the same way, and the
 * view transition read in the arriving page on every frame it runs: no frame
 * with a page part transparent (a cross-fade is two pages at once).
 *
 * `real` (REAL_SITE=https://<name>.storelib.com) holds a real live imported
 * theme against itself framed as the canvas frames it (a sandboxed srcdoc,
 * the bridge, CANVAS_HEAD, CANVAS_SHOWN): its header read while scrolling
 * down and back up, position, size, background and classes, both the same.
 * Its requests are made by Node (NODE_USE_ENV_PROXY=1 behind a proxy).
 *
 * desktop is 1440x900; phone is 390x844 with touch and the CPU slowed 4x.
 * Measurements, not opinions. Exits 1 on any failure. Frames and stills go
 * to $OUT (default /tmp/canvas20).
 */
import { createServer } from "node:http"
import { mkdirSync, writeFileSync } from "node:fs"
import puppeteer, { type Browser, type CDPSession, type Frame, type Page } from "puppeteer-core"
import sharp from "sharp"
import { editorFor, serveLive } from "./check-builder-nav19"
import { CANVAS_BRIDGE, CANVAS_HEAD } from "../lib/storelib-theme/compat/canvas-bridge"
import { CANVAS_SHOWN, canvasInsets } from "../lib/storelib-theme/compat/canvas-network"

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

/**
 * How much of a frame is the two pages laid over each other: the share of
 * A in the best mix of A and B, and how far the frame is from that mix. A
 * cross-fade is such a mix at every step; a page drawing itself, or a
 * theme's entrance, is not.
 */
const mixOf = (v: Buffer, a: Buffer, b: Buffer) => {
  let num = 0, den = 0
  for (let i = 0; i < v.length; i++) { const d = a[i] - b[i]; num += (v[i] - b[i]) * d; den += d * d }
  const alpha = den ? Math.max(0, Math.min(1, num / den)) : 0
  let r = 0
  for (let i = 0; i < v.length; i++) r += Math.abs(v[i] - (alpha * a[i] + (1 - alpha) * b[i]))
  return { alpha, residual: r / v.length }
}

/** Each frame: like the page left (A), like the page arrived at (B), the two over each other (g, a ghost), or like neither (x). */
async function classify(shots: Shot[], box: Box, scale: number, before: Buffer, after: Buffer, from: number) {
  const marks: { t: number; k: "A" | "B" | "g" | "x"; dA: number; dB: number }[] = []
  for (const s of shots) {
    if (s.t < from - 50) continue
    const v = await sample(s.data, box, scale)
    const dA = distance(v, before), dB = distance(v, after)
    const mix = mixOf(v, before, after)
    const k = dA <= 3 ? "A" : dB <= 3 ? "B" : mix.residual <= 4 && mix.alpha > 0.08 && mix.alpha < 0.92 ? "g" : "x"
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
  window.__said = [];
  addEventListener("message", (e) => { const d = e.data; if (d && d.storelib === 1 && ["ready", "loaded", "settled"].includes(d.type)) window.__said.push(d.type + "@" + Math.round(performance.timeOrigin + performance.now())); });
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
    /* Pressed: the moment the press was sent, which the frames are timed against. */
    const press = async (sel: string): Promise<number> => {
      const f = await ed.frame()
      const p = await within(f.evaluate((s) => { const r = document.querySelector(s)!.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 20), y: r.top + r.height / 2 } }, sel))
      const fb = await frontBox(ed.page)
      if (touch) {
        const t = Date.now()
        await ed.page.touchscreen.tap(fb.x + p.x, fb.y + p.y)
        return t
      }
      /* A mouse comes to a link before it presses it: a quarter of a second on it, then the click. */
      await ed.page.mouse.move(fb.x + p.x, fb.y + p.y, { steps: 4 })
      await sleep(250)
      const t = Date.now()
      await ed.page.mouse.click(fb.x + p.x, fb.y + p.y)
      return t
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
    const at = await press(".site-header__logo")
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
    const between = marks.filter((m) => m.k === "x" || m.k === "g")
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
    const behindAt = rec.find((r) => r.frames.includes("behind"))
    const listAt = rec.find((r, i) => i > 0 && r.rows !== rec[0].rows)
    console.log(`        the next page's frame put in at ${behindAt ? Math.round(behindAt.t - at) : "-"}ms, the panel's list changed at ${listAt ? Math.round(listAt.t - at) : "-"}ms`)
    if (process.env.DEBUG) console.log(`        the frames said: ${(await ed.page.evaluate(() => (window as unknown as { __said: string[] }).__said)).map((x) => { const [k, t] = x.split("@"); return `${k} ${Number(t) - at}ms` }).join(", ")}`)
    const frameStates: string[] = []
    for (const r of rec) if (frameStates[frameStates.length - 1] !== r.frames) frameStates.push(r.frames)
    if (process.env.DEBUG) console.log(`        frames: ${frameStates.join("  |  ")}`)
    check(`${label}: the sections panel goes from About's list to Home's, never empty or grey in between`, lists.length === 2 && !lists.some((l) => l.startsWith("(")), named.join(" -> "))

    /*
      Scrolled, the header of the page arrived at is where the live site's
      is, at the same size: the same theme served by the live site's own
      handler, in a window as large as the canvas's frame.
    */
    frame = await ed.frame()
    const fb = await frontBox(ed.page)
    const ys = [0, 120, 480, 900, 300, 0]
    const readHeader = async (f: Frame | Page) => {
      const out: string[] = []
      for (const y of ys) {
        await within(f.evaluate((y) => scrollTo({ top: y, behavior: "instant" as ScrollBehavior }), y))
        await sleep(300)
        out.push(await within(f.evaluate(() => { const h = document.querySelector(".site-header")!; const r = h.getBoundingClientRect(); return `${Math.round(scrollY)}:${Math.round(r.top)}:${getComputedStyle(h).position}:${h.closest(".shopify-section")?.className.replace(/\s+/g, ".")}` })))
      }
      return out
    }
    const inCanvas = await readHeader(frame)
    const { server, base } = await serveLive()
    const lp = await browser.newPage()
    try {
      await lp.setViewport({ width: fb.width, height: fb.height, isMobile: touch, hasTouch: touch })
      await lp.goto(`${base}/`, { waitUntil: "networkidle0" })
      await sleep(800)
      const onLive = await readHeader(lp)
      check(`${label}: scrolled, the theme's header is where the live site's is, with the same classes`, inCanvas.join(" ") === onLive.join(" "), inCanvas.join(" ") === onLive.join(" ") ? inCanvas.map((x) => x.split(":").slice(0, 2).join(":")).join(" ") : { canvas: inCanvas, live: onLive })
    } finally {
      await lp.close()
      server.close()
    }
  } finally {
    ed.close()
    pic.close()
  }
}

/* ── the live site, the same switch ───────────────────────────────────────── */

async function liveSwitch(browser: Browser, label: string, width: number, height: number, touch: boolean) {
  console.log(`\nlive site, ${label} ${width}x${height}${touch ? " touch, CPU 4x" : ""}`)
  const pic = await pictureServer()
  const heroPicture = (compat: { pages: Record<string, unknown[]> }) => {
    const home = compat.pages.home as { type: string; blocks?: { settings: Record<string, unknown> }[] }[]
    for (const s of home) if (s.type === "slideshow" && s.blocks?.[0]) s.blocks[0].settings.image = pic.url
  }
  const { server, base } = await serveLive(heroPicture)
  const page = await browser.newPage()
  /*
    THE TRANSITION ITSELF, every frame it runs: frames in which the page
    being left is on screen part transparent, over or under the next one.
    Read in the arriving page, from the browser's own snapshot of the old one.
  */
  await page.evaluateOnNewDocument(`addEventListener("pagereveal", (e) => { const t = e.viewTransition; window.__mixed = 0; window.__vt = !!t; if (!t) return; let on = true; t.finished.then(() => { on = false }, () => { on = false }); const tick = () => { if (!on) return; const o = Number(getComputedStyle(document.documentElement, "::view-transition-old(root)").opacity), n = Number(getComputedStyle(document.documentElement, "::view-transition-new(root)").opacity); if (o > 0.02 && o < 0.98 || n > 0.02 && n < 0.98) window.__mixed++; requestAnimationFrame(tick) }; requestAnimationFrame(tick) })`)
  try {
    await page.setViewport({ width, height, isMobile: touch, hasTouch: touch })
    await page.goto(`${base}/`, { waitUntil: "networkidle0" })
    const about = await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>(".site-header__nav a, .drawer a")].find((a) => /about/i.test(a.textContent ?? ""))?.getAttribute("href") ?? "/about")
    await page.goto(`${base}${about}`, { waitUntil: "networkidle0" })
    await sleep(1500)
    if (touch) await page.emulateCPUThrottling(4)
    const box = { x: 0, y: 0, width, height }
    const before = await sample(Buffer.from(await page.screenshot({ type: "png" })), box, width)
    const cam = await film(page)
    await sleep(300)
    const r = await page.evaluate(() => { const b = document.querySelector(".site-header__logo")!.getBoundingClientRect(); return { x: b.left + Math.min(b.width / 2, 20), y: b.top + b.height / 2 } })
    let at: number
    if (touch) { at = Date.now(); await page.touchscreen.tap(r.x, r.y) } else { await page.mouse.move(r.x, r.y, { steps: 4 }); await sleep(250); at = Date.now(); await page.mouse.click(r.x, r.y) }
    await sleep(touch ? 5000 : 3500)
    const shots = await cam.stop()
    const vt = await page.evaluate(() => ({ ran: (window as unknown as { __vt?: boolean }).__vt === true, mixed: (window as unknown as { __mixed?: number }).__mixed ?? -1 }))
    await page.evaluate(() => scrollTo(0, 0))
    await sleep(1200)
    const after = await sample(Buffer.from(await page.screenshot({ type: "png" })), box, width)
    await page.screenshot({ path: `${OUT}/live-${label}-home.png` })
    const marks = await classify(shots, box, width, before, after, at)
    writeFileSync(`${OUT}/live-${label}-marks.json`, JSON.stringify(marks, null, 1))
    let kept = 0
    for (const s of shots) {
      const m = marks.find((x) => x.t === Math.round(s.t - at))
      if (m && m.k === "x" && kept < 12) writeFileSync(`${OUT}/live-${label}-between-${kept++}-${m.t}ms.png`, s.data)
    }
    const ghosts = marks.filter((m) => m.k === "g")
    const firstB = marks.findIndex((m) => m.k === "B")
    const firstNotA = marks.findIndex((m) => m.k !== "A")
    console.log(`        frames: ${runs(marks)}  (g: About and Home over each other; x: Home still drawing itself, its picture and the theme's own entrance)`)
    console.log(`        About left the screen ${firstNotA >= 0 ? marks[firstNotA].t : -1}ms after the press, Home settled at ${firstB >= 0 ? marks[firstB].t : -1}ms; ${ghosts.length} frames of the two pages at once`)
    console.log(`        the page transition ${vt.ran ? `ran, ${vt.mixed} of its frames with a page part transparent` : "did not run"}`)
    check(`${label}: live, no frame of About and Home over each other (filmed, and in the transition)`, ghosts.length === 0 && vt.ran && vt.mixed === 0, { filmed: ghosts.length, transition: vt })
    check(`${label}: live, About never comes back once Home has shown`, firstB >= 0 && !marks.slice(firstB).some((m) => m.k === "A"))
  } finally {
    await page.close()
    server.close()
    pic.close()
  }
}

/* ── a real live theme against itself in the canvas's frame ───────────────── */

async function viaNode(page: Page) {
  const kept = new Map<string, { status: number; headers: Record<string, string>; body: Buffer }>()
  await page.setRequestInterception(true)
  page.on("request", async (req) => {
    const url = req.url()
    if (!/^https?:/.test(url) || req.method() !== "GET") return void req.continue()
    try {
      let hit = kept.get(url)
      if (!hit) {
        const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
        const headers: Record<string, string> = {}
        r.headers.forEach((v, k) => { if (!/content-encoding|content-length|transfer-encoding|content-security|set-cookie/i.test(k)) headers[k] = v })
        headers["access-control-allow-origin"] = "*"
        hit = { status: r.status, headers, body: Buffer.from(await r.arrayBuffer()) }
        kept.set(url, hit)
      }
      await req.respond(hit)
    } catch {
      await req.abort().catch(() => {})
    }
  })
}

async function real(browser: Browser) {
  const site = (process.env.REAL_SITE ?? "").replace(/\/+$/, "")
  if (!site) { console.log("\nreal: set REAL_SITE to a live imported theme's address"); return }
  for (const [w, h, touch] of [[1100, 800, false], [390, 700, true]] as const) {
    console.log(`\nreal theme ${site}, ${w}x${h}`)
    const html = await (await fetch(`${site}/`)).text()
    const doc = canvasInsets(html)
      .replace(/<head\b[^>]*>/i, (m) => `${m}<base href="${site}/"><script>window.__slPath="/";window.__slSeed={};</script>${CANVAS_HEAD}${CANVAS_SHOWN}<style data-storelib-gutter>html{scrollbar-gutter:stable}</style>`)
      .replace(/<\/body>/i, `<script>window.__slSite=${JSON.stringify(site)};window.__slInspect=true;${CANVAS_BRIDGE}</script></body>`)
    const ys = [0, 60, 300, 900, 1500, 1200, 400, 0]
    const read = async (f: Frame | Page) => {
      const out: string[] = []
      for (const y of ys) {
        await f.evaluate((y) => scrollTo({ top: y, behavior: "instant" as ScrollBehavior }), y)
        await sleep(700)
        out.push(await f.evaluate(() => {
          const s = document.querySelector<HTMLElement>(".section-header, #shopify-section-header, header")!
          const hd = s.querySelector("header") ?? s
          const r = hd.getBoundingClientRect()
          return `${Math.round(scrollY)}: top ${Math.round(r.top)} h ${Math.round(r.height)} ${getComputedStyle(s).position} ${getComputedStyle(hd).backgroundColor} [${[...s.classList].join(" ")}]`
        }))
      }
      return out
    }
    const a = await browser.newPage()
    const b = await browser.newPage()
    try {
      for (const p of [a, b]) { await viaNode(p); await p.setViewport({ width: w, height: h, isMobile: touch, hasTouch: touch }) }
      /* One page in front at a time: a page behind another runs no animation frames, and a theme's start-up waits on them. */
      await a.bringToFront()
      await a.goto(`${site}/`, { waitUntil: "networkidle2", timeout: 60000 })
      await a.waitForFunction(() => document.readyState === "complete", { timeout: 30000 })
      await sleep(1500)
      const live = await read(a)
      await b.bringToFront()
      await b.goto(`${site}/__canvas_probe__`, { waitUntil: "domcontentloaded" }).catch(() => {})
      await b.setContent(`<!doctype html><html><body style="margin:0"><iframe id="f" sandbox="allow-scripts allow-forms allow-popups" style="border:0;display:block;width:${w}px;height:${h}px"></iframe></body></html>`)
      await b.evaluate((d) => { (document.getElementById("f") as HTMLIFrameElement).srcdoc = d }, doc)
      await sleep(6000)
      const frame = await (await b.$("#f"))!.contentFrame()
      const framed = await read(frame!)
      for (let i = 0; i < ys.length; i++) if (live[i] !== framed[i]) console.log(`        live   ${live[i]}\n        canvas ${framed[i]}`)
      check(`${w}x${h}: the real theme's header, scrolled down and back, is the same in the canvas's frame as live`, live.join("\n") === framed.join("\n"), live.map((x) => x.split(" [")[0]).join(" | "))
      await a.screenshot({ path: `${OUT}/real-${w}-live.png` })
      await b.screenshot({ path: `${OUT}/real-${w}-canvas.png` })
    } finally {
      await a.close()
      await b.close()
    }
  }
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--hide-scrollbars"] })
  try {
    if (all || parts.has("desktop")) await switchInEditor(browser, "desktop", 1440, 900, false)
    if (all || parts.has("phone")) await switchInEditor(browser, "phone", 390, 844, true)
    if (parts.has("real")) await real(browser)
    if (all || parts.has("live")) {
      await liveSwitch(browser, "desktop", 1440, 900, false)
      await liveSwitch(browser, "phone", 390, 844, true)
    }
  } finally {
    await browser.close()
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  process.exit(failed ? 1 : 0)
}

if (require.main === module) void main()
