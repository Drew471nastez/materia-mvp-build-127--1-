/**
 * ===========================================================================
 *  ADD A SECTION ON A SLOW DEVICE: EVERY CATEGORY, THE LIST SCROLLED
 * ===========================================================================
 * Round 44, the owner: "the Add section modal stutters and lags when
 * clicking categories and scrolling through the sections to add, especially
 * on low spec devices. Sometimes the preview cards (seen in the Header
 * category) are completely broken: shifted layouts, wrong size, overlapping,
 * garbled previews."
 *
 * The real editor (scripts/editor-probe-harness.mjs) at 1280 × 800 and
 * 390 × 844, the CPU slowed 4x and 6x over the DevTools protocol, and two
 * kinds of device:
 *
 *   warm   a device the editor calls normal: the previews are drawn in idle
 *          time before the library is opened
 *   lean   a low spec device (2 cores, 2GB, lib/nav/prefetch-policy.ts):
 *          nothing is drawn ahead, so everything happens with the library
 *          open, which is what the owner's phone does
 *
 * For each: open the library from the gap under the first section, press
 * every category as a person does, scroll the list to its foot and back,
 * and record long tasks (count and total), the worst frame, layout shifts
 * (PerformanceObserver "layout-shift", those after the press's own 500ms,
 * with the press's own shown beside them) and the cards that moved or
 * changed size while the list held still. Then the same from the Header
 * group's Add section (the header and the bars above it). Then every card,
 * of both, against its own box: drawn at the card's width, as tall as its
 * section between the 80px floor and the crop, nothing of the section
 * painted outside the box, nothing drawn closed shown open (the header's
 * search panel), nothing fixed or sticky left in it. Screenshots of the
 * Header group's cards as they open and once settled.
 *
 *   node scripts/check-add-section-perf.mjs
 *   RATES=4 SIZES=390 KINDS=lean node scripts/check-add-section-perf.mjs
 *   SHOTS=/path JSON=/path/out.json node scripts/check-add-section-perf.mjs
 *   EDITOR_BUNDLE=/old/bundle.js PROBE_STYLESHEET=/old/globals.css ...   (a before)
 */
import { createServer } from "node:http"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import { bundle, css as builtCss } from "./editor-probe-harness.mjs"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS ?? join(tmpdir(), "storelib-add-section-perf")
mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const RATES = (process.env.RATES ?? "4,6").split(",").map(Number)
const SIZES = (process.env.SIZES ?? "1280,390").split(",").map(Number)
const KINDS = (process.env.KINDS ?? "lean,warm").split(",")

/* PROBE_STYLESHEET: another copy of app/globals.css (an older commit's), to measure against this one over the same sources. */
const css = process.env.PROBE_STYLESHEET ? await appCss(process.cwd(), process.env.PROBE_STYLESHEET) : builtCss
const js = readFileSync(bundle)
const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${interFaces()}</style><style>${css}</style></head><body><div id="app"></div>
<script>window.PROBE_SHORT = false</script>
<script src="/editor-probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/editor-probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(req.url.startsWith("/editor") ? page : "<!doctype html><title>blank</title>")
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"], protocolTimeout: 600_000 })

let bad = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) bad++
}
const note = (what) => console.log(`  --    ${what}`)

/* A low spec device, as the editor reads one (prefetch-policy.ts tierFor). */
const LEAN = `Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 2 }); Object.defineProperty(navigator, "deviceMemory", { get: () => 2 })`

/* In the page: long tasks, frames and layout shifts, started and read per step. */
const RECORDER = `
  window.__rec = {
    start() {
      this.frames = []; this.long = []; this.shifts = []; this.on = true
      if (!this.obs) {
        this.obs = new PerformanceObserver((l) => { if (this.on) for (const e of l.getEntries()) this.long.push(Math.round(e.duration)) })
        this.obs.observe({ type: "longtask", buffered: false })
        this.ls = new PerformanceObserver((l) => {
          if (!this.on) return
          for (const e of l.getEntries()) {
            const inLib = (e.sources || []).some((s) => s.node && s.node.closest && s.node.closest("[data-section-library], [data-section-library-layer]"))
            const what = (e.sources || []).map((s) => s.node ? (s.node.closest?.("[data-library-card]")?.getAttribute("data-library-card") ?? "") + ">" + (s.node.nodeName || "") + "." + String(s.node.className || "").slice(0, 30) + " " + Math.round(s.previousRect.top) + "->" + Math.round(s.currentRect.top) + " h" + Math.round(s.previousRect.height) + "->" + Math.round(s.currentRect.height) : "?")
            this.shifts.push({ value: e.value, inLib, input: e.hadRecentInput, what })
          }
        })
        this.ls.observe({ type: "layout-shift", buffered: false })
      }
      let last = performance.now()
      const tick = (t) => { if (!this.on) return; this.frames.push(t - last); last = t; requestAnimationFrame(tick) }
      requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick) })
    },
    stop() {
      this.on = false
      const f = this.frames
      const s = [...f].sort((a, b) => a - b)
      return {
        frames: f.length,
        worst: Math.round(s[s.length - 1] || 0),
        p95: Math.round(s[Math.floor(s.length * 0.95)] || 0),
        over50: f.filter((d) => d > 50).length,
        long: this.long.length,
        longTotal: this.long.reduce((a, b) => a + b, 0),
        longWorst: Math.max(0, ...this.long),
        cls: Math.round(this.shifts.filter((s) => !s.input).reduce((a, s) => a + s.value, 0) * 10000) / 10000,
        clsAll: Math.round(this.shifts.reduce((a, s) => a + s.value, 0) * 10000) / 10000,
        shiftExamples: this.shifts.filter((s) => !s.input).sort((a, b) => b.value - a.value).slice(0, 3).map((s) => Math.round(s.value * 1000) / 1000 + " " + s.what.slice(0, 3).join(" | ")),
        clsLib: Math.round(this.shifts.filter((s) => s.inLib).reduce((a, s) => a + s.value, 0) * 10000) / 10000,
      }
    },
  }
  window.__lib = () => {
    const lib = document.querySelector("[data-section-library]")
    if (!lib) return null
    const phone = lib.getAttribute("data-section-library") === "phone"
    const scroller = lib.querySelector("[data-library-scroll]")
    const pills = [...lib.querySelectorAll(phone ? ".wb-chip" : "nav button")]
    return { lib, phone, scroller, pills }
  }
  /* Cards on screen that moved or changed size from one frame to the next, while the list itself held still. */
  window.__watchCards = () => {
    const out = { moved: 0, examples: [] }
    let prev = null, on = true, lastScroll = null, lastShown = null
    const tick = () => {
      if (!on) return
      const L = window.__lib()
      if (L && L.scroller) {
        const view = L.scroller.getBoundingClientRect()
        const now = new Map()
        for (const c of L.lib.querySelectorAll("[data-library-card]")) {
          if (c.hidden) continue
          const b = c.querySelector("[data-preview-box]") || c
          const r = b.getBoundingClientRect()
          if (r.bottom <= view.top || r.top >= view.bottom) continue
          /* In the list's own layout: the sheet's rise and the dialog's scale on the way in are not a card moving. */
          const k = L.scroller.offsetWidth ? view.width / L.scroller.offsetWidth : 1
          now.set(c.getAttribute("data-library-card") + ":" + c.getAttribute("data-preset"), [Math.round((r.top - view.top) / k + L.scroller.scrollTop), Math.round(b.offsetHeight), Math.round(b.offsetWidth)])
        }
        const st = Math.round(L.scroller.scrollTop)
        /* A category or a search is a new list: what it moves is the press's doing, not a card's. */
        const shown = [...L.lib.querySelectorAll("[data-library-card]")].filter((c) => !c.hidden).map((c) => c.getAttribute("data-library-card") + ":" + c.getAttribute("data-preset")).join("|")
        if (shown !== lastShown) prev = null
        lastShown = shown
        if (prev && lastScroll === st) for (const [k, v] of now) { const p = prev.get(k); if (p && (Math.abs(p[0] - v[0]) > 1 || Math.abs(p[1] - v[1]) > 1 || Math.abs(p[2] - v[2]) > 1)) { out.moved++; if (out.examples.length < 4) out.examples.push(k + " " + p.join("/") + " -> " + v.join("/")) } }
        prev = now; lastScroll = st
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    return { stop: () => { on = false; return out } }
  }
`

const pillName = (t) => t.trim().replace(/\d+$/, "")

/**
 * EVERY PREVIEW IN SIGHT, AGAINST ITS BOX. Each card of the category is brought
 * on screen; its preview must be drawn at the card's width (the scaled
 * section as wide as the box), and nothing inside it may paint outside the
 * box: an element whose rectangle lies past the box's edges, and that is not
 * cut by an ancestor inside the box, is a section escaping its card. A
 * fixed or sticky element left in a preview is counted too.
 */
const AUDIT = async ({ category, ratio }) => {
  const L = window.__lib()
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
  const pill = L.pills.find((b) => (b.textContent || "").trim().replace(/\d+$/, "") === category)
  if (!pill) return { missing: true }
  pill.click()
  await frame(); await frame()
  const out = []
  for (const c of [...L.lib.querySelectorAll("[data-library-card]")].filter((x) => !x.hidden)) {
    c.scrollIntoView({ block: "nearest" })
    await frame(); await frame()
    const box = c.querySelector("[data-preview-box]")
    const inner = box && box.querySelector("[data-keep-transform]")
    const name = c.getAttribute("data-library-card") + ":" + c.getAttribute("data-preset")
    if (!box || !inner) { out.push({ name, drawn: !!c.querySelector("[data-preview-fallback]"), fallback: true }); continue }
    const b = box.getBoundingClientRect()
    const sec = inner.firstElementChild
    const sr = sec ? sec.getBoundingClientRect() : null
    let escaped = 0, positioned = 0, revealed = 0
    const ex = []
    for (const el of inner.querySelectorAll("*")) {
      const cs = getComputedStyle(el)
      /* Drawn closed on purpose (the header's search panel, a drawer, a menu): it must stay closed in its card. */
      const inline = el.getAttribute("style") || ""
      if (/opacity:\s*0(?![.\d])/.test(inline) && (el.getAttribute("aria-hidden") === "true" || /pointer-events:\s*none/.test(inline)) && parseFloat(cs.opacity) > 0.01) {
        revealed++
        if (ex.length < 3) ex.push("shown " + el.tagName + "." + String(el.className).slice(0, 40))
      }
      if (cs.position === "fixed" || cs.position === "sticky") positioned++
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height || cs.visibility === "hidden" || cs.display === "none") continue
      /* What the browser paints of it: visual, past the box on any side. */
      if (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1) {
        /* Cut by the box itself is fine (overflow hidden): only what shows past it, i.e. on screen outside the box, counts. That can only be a layer the box does not clip. */
        const hit = document.elementsFromPoint(Math.min(Math.max(r.left + 2, 0), innerWidth - 1), Math.min(Math.max(r.top + 2, 0), innerHeight - 1))
        if (hit.includes(el) && !(r.left + 2 >= b.left && r.left + 2 <= b.right && r.top + 2 >= b.top && r.top + 2 <= b.bottom)) { escaped++; if (ex.length < 3) ex.push(el.tagName + "." + String(el.className).slice(0, 40)) }
      }
    }
    /* As tall as its section, between the 80px floor and the crop (lib/website-builder/preview-markup.ts previewCardHeight). */
    const crop = Math.round(b.width * ratio)
    const want = sr ? Math.min(crop, Math.max(80, Math.ceil(sr.height))) : null
    out.push({
      name,
      drawn: true,
      sizeOff: want === null ? null : Math.round(Math.abs(b.height - want)),
      box: [Math.round(b.width), Math.round(b.height)],
      section: sr ? [Math.round(sr.width), Math.round(sr.height)] : null,
      widthOff: sr ? Math.round(Math.abs(sr.width - b.width)) : null,
      escaped,
      positioned,
      revealed,
      ex,
    })
  }
  L.scroller.scrollTop = 0
  return { cards: out }
}

async function scenario({ width, rate, kind }) {
  const phone = width < 640
  const p = await browser.newPage()
  if (kind === "lean") await p.evaluateOnNewDocument(LEAN)
  await p.setViewport(phone ? { width, height: 844, isMobile: true, hasTouch: true } : { width, height: 800 })
  await p.goto(`${origin}/editor`, { waitUntil: "load" })
  await p.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 8, { timeout: 60_000 })
  await p.evaluate(RECORDER)
  if (kind === "warm") {
    await p.waitForFunction(() => { const c = [...document.querySelectorAll("[data-library-card]")]; return c.length >= 30 && c.every((x) => x.querySelector("[data-keep-transform]")) }, { timeout: 60_000, polling: 250 }).catch(() => {})
  }
  await sleep(1500)
  const cdp = await p.createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate })
  await sleep(300)
  const tag = `${kind}-${width}-${rate}x`
  /* A pill pressed as a person presses it, so the layout-shift entries know there was input. */
  const press = async (name) => {
    const at = await p.evaluate((name) => {
      const b = window.__lib().pills.find((x) => (x.textContent || "").trim().replace(/\d+$/, "") === name)
      if (!b) return null
      b.scrollIntoView({ inline: "center", block: "nearest" })
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    }, name)
    if (!at) return
    await sleep(60)
    if (phone) await p.touchscreen.tap(at.x, at.y)
    else await p.mouse.click(at.x, at.y)
  }
  const step = (what) => process.env.VERBOSE && console.log(`  ..    ${what}`)
  console.log(`\n══ ${kind === "lean" ? "A low spec device" : "A normal device, previews drawn ahead"}, ${width} wide, CPU ${rate}x slower ══\n`)

  /* OPEN, from the gap under the first section. */
  await p.evaluate(() => {
    const s = [...document.querySelectorAll("#wb-preview-root [aria-label='Add a section here']")]
    ;(s[1] ?? s[0]).scrollIntoView({ block: "center" })
  })
  await sleep(500)
  const gap = await p.evaluate(() => {
    const s = [...document.querySelectorAll("#wb-preview-root [aria-label='Add a section here']")]
    const r = (s[1] ?? s[0]).getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })
  await p.evaluate(() => { window.__rec.start(); window.__cards = window.__watchCards() })
  if (phone) await p.touchscreen.tap(gap.x, gap.y)
  else await p.mouse.click(gap.x, gap.y)
  await sleep(1500)
  const open = await p.evaluate(() => window.__rec.stop())
  step("opened")

  /* EVERY CATEGORY, as a person presses them: a press, a look, the next. */
  const pills = await p.evaluate(() => window.__lib().pills.map((b) => (b.textContent || "").trim().replace(/\d+$/, "")))
  await p.evaluate(() => window.__rec.start())
  for (const name of [...pills, "All"]) {
    await press(name)
    await sleep(450)
  }
  const cats = await p.evaluate(() => window.__rec.stop())
  step("categories")

  /* SCROLL the whole list down and back, a steady finger's speed (about 1,800px a second). */
  await p.evaluate(() => window.__rec.start())
  await p.evaluate(async () => {
    const { scroller } = window.__lib()
    const end = scroller.scrollHeight - scroller.clientHeight
    let last = performance.now()
    for (const dir of [1, -1]) {
      const began = performance.now()
      while ((dir > 0 ? scroller.scrollTop < end - 1 : scroller.scrollTop > 0) && performance.now() - began < 20_000) {
        const t = await new Promise((r) => requestAnimationFrame(r))
        scroller.scrollTop += dir * Math.min(120, (t - last) * 1.8)
        last = t
      }
    }
  })
  const scroll = await p.evaluate(() => window.__rec.stop())
  step("scrolled")
  const moved = await p.evaluate(() => window.__cards.stop())

  const row = (label, m) => note(`${label.padEnd(10)} long tasks ${String(m.long).padStart(3)} (${String(m.longTotal).padStart(5)}ms, worst ${String(m.longWorst).padStart(4)}ms)   frames ${String(m.frames).padStart(4)}, worst ${String(m.worst).padStart(4)}ms, p95 ${String(m.p95).padStart(3)}ms, ${m.over50} over 50ms   CLS ${m.cls} (with the press's own ${m.clsAll}, in the library ${m.clsLib})`)
  row("open", open)
  row("categories", cats)
  row("scroll", scroll)
  for (const [k, m] of [["open", open], ["categories", cats], ["scroll", scroll]]) if (m.shiftExamples.length) note(`   ${k} shifts: ${m.shiftExamples.join("  ||  ")}`)
  note(`cards on screen that moved or resized while the list held still: ${moved.moved}${moved.examples.length ? `  ${JSON.stringify(moved.examples)}` : ""}`)

  /* THE PREVIEWS, against their boxes, throttling off so the audit is quick. */
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  await p.waitForFunction(() => { const c = [...document.querySelectorAll("[data-section-library] [data-library-card]")]; return c.length >= 30 && c.every((x) => x.querySelector("[data-keep-transform]") || x.querySelector("[data-preview-fallback]")) }, { timeout: 60_000, polling: 250 }).catch(() => {})
  const audits = {}
  for (const cat of ["All"]) {
    audits[cat] = await p.evaluate(AUDIT, { category: cat, ratio: phone ? 1.22 : 0.56 })
  }
  /* FROM THE HEADER GROUP: the library its Add section opens is the header and what may go above it. */
  if (phone) {
    await p.evaluate(() => {
      const sheet = document.querySelector("[data-section-library='phone']")?.closest("[data-mobile-bottom-sheet]")
      const overlay = sheet?.previousElementSibling
      if (overlay && overlay.hasAttribute("data-wb-sheet-overlay")) overlay.click()
    })
  } else await p.keyboard.press("Escape")
  await sleep(900)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate })
  await p.evaluate(() => { window.__rec.start(); window.__cards = window.__watchCards() })
  const fromHeader = await p.evaluate(() => {
    const b = [...document.querySelectorAll("[data-wb-sidebar-scroll] button")].find((x) => /^Add section$/.test((x.textContent || "").trim()))
    b?.click()
    return !!b
  })
  await sleep(1500)
  const hOpen = await p.evaluate(() => window.__rec.stop())
  /* The header's card as it first stands: as tall as the header drawn in it, not a crop tall over white. */
  const hFirst = await p.evaluate(() => {
    const c = document.querySelector("[data-section-library] [data-library-card='header']")
    const box = c?.querySelector("[data-preview-box]")
    const sec = box?.querySelector("[data-keep-transform] > *")
    return box ? { box: Math.round(box.getBoundingClientRect().height), section: sec ? Math.round(sec.getBoundingClientRect().height) : null } : null
  })
  const hPills = await p.evaluate(() => window.__lib().pills.map((b) => (b.textContent || "").trim().replace(/\d+$/, "")))
  await p.evaluate(() => window.__rec.start())
  for (const name of [...hPills, ...hPills]) {
    await press(name)
    await sleep(450)
  }
  const hCats = await p.evaluate(() => window.__rec.stop())
  const hMoved = await p.evaluate(() => window.__cards.stop())
  row("header open", hOpen)
  row("header cats", hCats)
  note(`the header's card as the library opens: ${hFirst ? `${hFirst.box}px for a ${hFirst.section ?? "not yet drawn"}px header` : "none"}`)
  note(`from the header group (${fromHeader ? "opened" : "no button"}): categories ${JSON.stringify(hPills)}; cards that moved in sight: ${hMoved.moved} ${JSON.stringify(hMoved.examples)}`)
  await p.evaluate(() => window.__lib().pills.find((b) => /^All/.test((b.textContent || "").trim()))?.click())
  await sleep(300)
  await p.screenshot({ path: join(SHOTS, `perf-${tag}-header-group.png`) })
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  await p.waitForFunction(() => { const c = [...document.querySelectorAll("[data-section-library] [data-library-card]")].filter((x) => !x.hidden); return c.length > 0 && c.every((x) => x.querySelector("[data-keep-transform]") || x.querySelector("[data-preview-fallback]")) }, { timeout: 30_000, polling: 250 }).catch(() => {})
  await sleep(300)
  await p.screenshot({ path: join(SHOTS, `perf-${tag}-header-group-settled.png`) })
  audits.Header = await p.evaluate(AUDIT, { category: "All", ratio: phone ? 1.22 : 0.56 })
  const head = audits.Header.cards ?? []
  note(`header group cards: ${head.map((c) => `${c.name} box ${c.box?.join("×")} section ${c.section?.join("×")} escaped ${c.escaped} fixed/sticky ${c.positioned} shown-closed ${c.revealed}`).join("; ")}`)
  const all = [...(audits.All.cards ?? []), ...head]
  const undrawn = all.filter((c) => !c.drawn)
  const wrongWidth = all.filter((c) => c.drawn && c.widthOff > 2)
  const escaped = all.filter((c) => c.escaped > 0)
  const positioned = all.filter((c) => c.positioned > 0)
  const revealed = all.filter((c) => c.revealed > 0)
  const misSized = all.filter((c) => c.drawn && c.sizeOff !== null && c.sizeOff > 2)
  expect(undrawn.length === 0, `${tag}: every card has its preview once the library has settled`, undrawn.map((c) => c.name).slice(0, 6))
  expect(wrongWidth.length === 0, `${tag}: every preview is drawn at its card's width`, wrongWidth.map((c) => `${c.name} ${c.section?.[0]} in ${c.box?.[0]}`).slice(0, 6))
  expect(escaped.length === 0, `${tag}: nothing in a preview paints outside its card`, escaped.map((c) => `${c.name} ${c.ex.join(",")}`).slice(0, 6))
  expect(!!hFirst && hFirst.section !== null && hFirst.box - Math.max(hFirst.section, 80) <= 2, `${tag}: from the Header group, the header's card is the header's height`, hFirst)
  expect(misSized.length === 0, `${tag}: every card is its section's height (between the floor and the crop), so no section is cut short or sits over white`, misSized.map((c) => `${c.name} ${c.box?.[1]}px card, ${c.section?.[1]}px section`).slice(0, 6))
  expect(revealed.length === 0, `${tag}: nothing drawn closed (a search panel, a drawer, a menu) is shown open in a card`, revealed.map((c) => `${c.name} ${c.ex.join(",")}`).slice(0, 6))
  expect(positioned.length === 0, `${tag}: nothing fixed or sticky is left inside a preview`, positioned.map((c) => `${c.name} ${c.positioned}`).slice(0, 6))
  expect(moved.moved + hMoved.moved === 0, `${tag}: no card on screen moves or changes size while the list holds still`, [...moved.examples, ...hMoved.examples])
  await p.close()
  return { tag, kind, width, rate, open, cats, scroll, hOpen, hCats, hFirst, moved: moved.moved + hMoved.moved, undrawn: undrawn.length, wrongWidth: wrongWidth.length, escaped: escaped.length, positioned: positioned.length, revealed: revealed.length, misSized: misSized.length }
}

const results = []
for (const kind of KINDS) for (const width of SIZES) for (const rate of RATES) results.push(await scenario({ kind, width, rate }))
await browser.close()
server.close()

console.log("\n══ Summary ══\n")
console.log("scenario            step        long  total ms  worst frame  CLS")
for (const r of results) for (const [k, m] of [["open", r.open], ["categories", r.cats], ["scroll", r.scroll], ["hdr open", r.hOpen], ["hdr cats", r.hCats]]) console.log(`${r.tag.padEnd(20)}${k.padEnd(12)}${String(m.long).padStart(4)}${String(m.longTotal).padStart(10)}${String(m.worst).padStart(13)}  ${m.cls}`)
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(results, null, 1))
console.log(`\nScreenshots in ${SHOTS}\n`)
if (bad) {
  console.error(`${bad} check${bad === 1 ? "" : "s"} failed.`)
  process.exit(1)
}
console.log("Every category and the whole list keep up on a slow device, and every preview stays inside its card.\n")
