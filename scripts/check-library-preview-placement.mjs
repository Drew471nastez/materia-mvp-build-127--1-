/**
 * ===========================================================================
 *  ADD A SECTION, IMPORTED THEME: EVERY PICTURE OVER ITS OWN CARD, MEASURED
 * ===========================================================================
 * The owner: "sometimes the cover previews of the preview cards of the Add a
 * section modal get bugged ... make sure it never happens in the website
 * builder editor". The screenshots: pictures misplaced against their cards,
 * a strip of another section in the gap between two cards, a picture cut
 * short, a row of placeholders drawn between cards.
 *
 * An imported theme's cards are pictured by ONE frame laid over the whole
 * list (components/website-builder/compat/compat-section-preview.tsx,
 * PreviewSheet), each section in a wrapper put over its card. This opens the
 * real editor (scripts/canvas-probe-kit.mjs) on an imported theme, opens Add
 * a section, and through a run of stress steps measures, for every card that
 * can be seen:
 *
 *   PLACED   the wrapper of its section, as the frame paints it (the frame's
 *            own scale and scroll applied), is the card's picture box, each
 *            edge within 1px
 *   WHOLE    the frame is tall enough to paint all of it (not cut short)
 *   ORPHANS  no wrapper is painted that is not over a card that can be seen:
 *            a hidden card's, an unmounted card's, an old sheet's
 *   GAPS     the screen between the cards, shot with the frame and again with
 *            the frame hidden: any pixel that differs outside the card boxes
 *            is the frame painting where no card is
 *
 * Steps: open, scroll fast, switch every category while scrolled, resize the
 * window, change card heights by opposite amounts (nothing the grid's own
 * size sees), title metrics changing (a font landing), close and reopen
 * (entrance transform, held heights released), and a push while it is open
 * (a section file only, which leaves the frame's document as it was, and a
 * stylesheet, which gives it a new one). Each is measured on the next frame
 * and again once settled.
 *
 * Found (placement errors, in how many measurements, and pixels painted
 * between the cards):
 *
 *                              before                     after
 *   Materia, computer (84)     52 in 10, 14,103px         0, 0px
 *   Materia, phone (84)        118 in 22, 24,351px        0, 0px
 *   Dawn made 76 sections,
 *     computer (98)            599 in 9, 9,656px          0, 0px
 *     phone (98)               1,553 in 21, 170,384px     0, 0px
 *
 *   A card moved without its section: two cards' heights changed by
 *     opposite amounts, so the list kept its height and no card rendered;
 *     only the list's size was watched. Three sections stayed where their
 *     cards had been. Every card is watched now.
 *   A push of section files while the library was open: the new sheet's
 *     document was the old one to the letter, so React left the frame
 *     alone, and the old sheet's sections stayed in it beside the new
 *     sheet's, never moved again: a section twice, one in the gap between
 *     two cards (the strip in the owner's screenshot), one over the wrong
 *     card. A sheet takes the document over now and takes the other one's
 *     sections out.
 *
 *   npx tsx scripts/check-library-preview-placement.mjs
 *   QUICK=1                       open and measure once
 *   DEBUG=1                       why each wrapper was not counted as painted
 *   WIDTHS=desktop,phone          which shells (both by default)
 *   BIG_THEME_ZIP=<dawn.zip>      a store theme at a store's size (scripts/big-theme-kit.mjs)
 *   SHOTS=<dir>                   a screenshot of each step that went wrong
 *   EDITOR_BUNDLE=<file>          a bundle built from another commit, to compare
 */
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import sharp from "sharp"

process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
const { bundle, css } = await import("./editor-probe-harness.mjs")
const { importedTheme, openEditor, sleep, withMarkup } = await import("./canvas-probe-kit.mjs")

const WIDTHS = (process.env.WIDTHS ?? "desktop,phone").split(",")
const SHOTS = process.env.SHOTS ?? ""
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const BIG = !!process.env.BIG_THEME_ZIP
const compat = BIG ? await (await import("./big-theme-kit.mjs")).bigImportedTheme({ clones: Number(process.env.CLONES ?? 30), long: 8 }) : await importedTheme({ store: true })
console.log(`imported theme${BIG ? " (big)" : " (Materia)"}: ${Object.keys(compat.sources).filter((p) => p.startsWith("sections/")).length} section files`)

/* A push arrives as the activity log says (scripts/check-editor-push-lag.mjs). */
const GLOBALS = `window.PROBE_ACTIVITY={events:[{id:1000,agent_name:"GitHub · ada",path:"pages/home",action:"page",detail:{page:"home",replaced:true},created_at:"2026-10-01T00:00:00.000Z"}],syncAt:"2026-10-01T00:00:00.000Z"};window.PROBE_CONNECTIONS={agents:[{name:"Claude Code",kind:"claude"}],github:{repo:"ada/theme"},latest:null};`
const SECTION_PATHS = Object.keys(compat.sources).filter((p) => /^sections\/.*\.storelib$/.test(p) && compat.sources[p].split("</template>").length === 2 && !/header|footer|announcement/.test(p))
const CSS_PATH = Object.keys(compat.files).find((p) => /^shopify\/assets\/(base|materia)\.css$/.test(p)) ?? Object.keys(compat.files).find((p) => p.endsWith(".css"))

/* ── In the page: every card against what the frame paints over it ── */
const MEASURE = () => {
  const open = document.querySelector("[data-section-library-layer][data-state='open'], [data-section-library='phone'][data-library-open]")
  const scroller = open ? [...open.querySelectorAll("[data-library-scroll]")].find((l) => l.clientHeight > 0) : null
  if (!scroller) return { error: "no open library" }
  const grid = scroller.querySelector("[data-library-grid]")
  const sv = scroller.getBoundingClientRect()
  const frames = [...document.querySelectorAll("iframe[data-compat-sheet]")]
  const cards = []
  for (const c of scroller.querySelectorAll("[data-library-card]")) {
    if (c.hidden) continue
    const box = c.querySelector("[data-preview-box]")
    if (!box) continue
    const r = box.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    cards.push({ key: `${box.getAttribute("data-compat-preview")}:${c.getAttribute("data-preset")}`, state: box.getAttribute("data-compat-preview-state"), r: [r.left, r.top, r.right, r.bottom], seen: r.bottom > sv.top && r.top < sv.bottom })
  }
  const painted = []
  const skipped = {}
  const skip = (why) => { skipped[why] = (skipped[why] ?? 0) + 1 }
  for (const f of frames) {
    const fr = f.getBoundingClientRect()
    const cs = getComputedStyle(f)
    if (cs.visibility === "hidden" || cs.display === "none" || !(f.offsetWidth > 0)) { skip("frame hidden"); continue }
    const sx = fr.width / f.offsetWidth
    const sy = f.offsetHeight > 0 ? fr.height / f.offsetHeight : sx
    const doc = f.contentDocument
    if (!doc?.body) continue
    const fw = f.clientWidth
    const fh = f.clientHeight
    for (const inner of doc.querySelectorAll("[data-sl-pv]")) {
      /* Each section sits in its card's <sl-card> box (round 45, sheetRules): the box is what is put over the card and cut at its foot. */
      const w = inner.parentElement?.localName === "sl-card" ? inner.parentElement : inner
      const ws = doc.defaultView.getComputedStyle(w)
      if (w.hidden || ws.display === "none") { skip("hidden"); continue }
      /* One fading in (data-on, its first frame at opacity 0) is there, and is held to its card like any other. */
      if (ws.visibility !== "visible" || (!(parseFloat(ws.opacity) > 0) && !w.hasAttribute("data-on"))) { skip("transparent"); continue }
      const b = w.getBoundingClientRect()
      if (b.width <= 0 || b.height <= 0) { skip("empty"); continue }
      /* What of it the frame paints: its own viewport is its box. */
      const cl = [Math.max(0, b.left), Math.max(0, b.top), Math.min(fw, b.right), Math.min(fh, b.bottom)]
      const toScreen = (x, y) => [fr.left + x * sx, fr.top + y * sy]
      const [l, t] = toScreen(b.left, b.top)
      const [rr, bb] = toScreen(b.right, b.bottom)
      const visible = cl[2] > cl[0] && cl[3] > cl[1]
      const [cl0, cl1] = toScreen(cl[0], cl[1])
      const [cl2, cl3] = toScreen(cl[2], cl[3])
      painted.push({ key: inner.getAttribute("data-sl-pv"), frame: frames.indexOf(f), r: [l, t, rr, bb], clip: visible ? [cl0, cl1, cl2, cl3] : null })
    }
  }
  const out = { cards: cards.length, seen: cards.filter((c) => c.seen).length, shown: cards.filter((c) => c.state === "shown").length, frames: frames.length, painted: painted.length, skipped, bad: [] }
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 1)
  const round = (r) => r.map((v) => Math.round(v * 10) / 10)
  const byKey = new Map(cards.map((c) => [c.key, c]))
  const wrapped = new Map()
  for (const p of painted) {
    if (!p.clip) continue
    const card = byKey.get(p.key)
    if (!card) { out.bad.push({ kind: "orphan", key: p.key, at: round(p.r) }); continue }
    if (wrapped.has(p.key)) { out.bad.push({ kind: "twice", key: p.key, at: round(p.r) }); continue }
    wrapped.set(p.key, p)
    if (!near(p.r, card.r)) out.bad.push({ kind: "misplaced", key: p.key, card: round(card.r), wrapper: round(p.r), seen: card.seen })
    else if (!near(p.clip, card.r)) out.bad.push({ kind: "cut", key: p.key, card: round(card.r), painted: round(p.clip), seen: card.seen })
  }
  for (const c of cards) {
    if (c.state !== "shown" || wrapped.has(c.key)) continue
    /* What became of its section, to tell a picture that is gone from one not yet put back. */
    const found = frames.map((f) => f.contentDocument?.querySelector(`[data-sl-pv="${CSS.escape(c.key)}"]`)).find(Boolean)
    const w = found?.parentElement?.localName === "sl-card" ? found.parentElement : found
    const ws = w ? w.ownerDocument.defaultView.getComputedStyle(w) : null
    const wrapper = w ? { hidden: w.hidden, on: w.hasAttribute("data-on"), placed: w.hasAttribute("data-placed"), opacity: ws.opacity, visibility: ws.visibility, h: Math.round(w.getBoundingClientRect().height) } : null
    out.bad.push({ kind: "missing", key: c.key, card: round(c.r), seen: c.seen, wrapper })
  }
  /* For the screenshot: the boxes on screen, and the list's own rectangle. */
  out.boxes = cards.filter((c) => c.seen).map((c) => c.r)
  out.view = [sv.left, sv.top, sv.right, sv.bottom]
  out.scrollTop = Math.round(scroller.scrollTop)
  out.gridH = grid ? grid.offsetHeight : 0
  return out
}

/*
  Pixels outside every card box that differ with the frame hidden: the frame
  painting where no card is. Shot again when the cards moved while it was
  being shot (a push redrawing them): the boxes read must be the ones shot.
*/
async function gapPixels(ed) {
  let n = 0
  for (let k = 0; k < 4; k++) {
    const m = await ed.js(MEASURE)
    n = await gapPixelsOnce(ed, m)
    const again = await ed.js(MEASURE)
    if (JSON.stringify(again.boxes) === JSON.stringify(m.boxes) && JSON.stringify(again.view) === JSON.stringify(m.view)) return n
  }
  return n
}

async function gapPixelsOnce(ed, m) {
  if (!m.view) return 0
  const [l, t, r, b] = m.view.map(Math.round)
  const clip = { x: Math.max(0, l), y: Math.max(0, t), width: Math.max(1, r - l - 12), height: Math.max(1, b - t) }
  const shot = async () => sharp(await ed.page.screenshot({ clip, type: "png" })).raw().toBuffer({ resolveWithObject: true })
  const a = await shot()
  await ed.js(() => document.querySelectorAll("iframe[data-compat-sheet]").forEach((f) => (f.style.visibility = "hidden")))
  const z = await shot()
  await ed.js(() => document.querySelectorAll("iframe[data-compat-sheet]").forEach((f) => (f.style.visibility = "")))
  /* Shot again with the frame: a pixel that changed between the two shots with it (a shimmer, a fade still running) is not counted. */
  const a2 = await shot()
  const { width, height, channels } = a.info
  const inBox = (x, y) => m.boxes.some(([bl, bt, br, bb]) => x >= bl - 1.5 && x <= br + 1.5 && y >= bt - 1.5 && y <= bb + 1.5)
  const differ = (p, q, i) => Math.abs(p.data[i] - q.data[i]) + Math.abs(p.data[i + 1] - q.data[i + 1]) + Math.abs(p.data[i + 2] - q.data[i + 2]) >= 24
  let n = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      if (!differ(a, z, i) || differ(a, a2, i)) continue
      if (!inBox(clip.x + x + 0.5, clip.y + y + 0.5)) n++
    }
  }
  return n
}

const nextFrames = (ed) => ed.js(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))

async function run(shell) {
  const phone = shell === "phone"
  const ed = await openEditor({ kind: "imported", bundle, css, compat, globals: GLOBALS, width: phone ? 390 : 1440, height: phone ? 844 : 900, touch: phone, settle: 1500 })
  const results = []
  let shotN = 0
  const measure = async (step, { pixels = true } = {}) => {
    const m = await ed.js(MEASURE)
    if (m.error) {
      results.push({ step, error: m.error })
      console.log(`  ${step.padEnd(34)} ${m.error}`)
      return m
    }
    const gaps = pixels ? await gapPixels(ed) : null
    const bad = m.bad.length + (gaps ? 1 : 0)
    results.push({ step, bad: m.bad.length, gaps, kinds: m.bad.map((x) => x.kind) })
    console.log(`  ${bad ? "FAIL" : "ok  "}  ${step.padEnd(34)} cards ${String(m.cards).padStart(3)} (${m.shown} shown, ${m.seen} on screen), frames ${m.frames}, painted ${m.painted}${process.env.DEBUG ? ` ${JSON.stringify(m.skipped)}` : ""}: ${m.bad.length} placement errors${gaps === null ? "" : `, ${gaps} px outside the cards`}`)
    for (const x of m.bad.slice(0, 4)) console.log(`          ${JSON.stringify(x)}`)
    if (m.bad.length > 4) console.log(`          and ${m.bad.length - 4} more`)
    if (bad && SHOTS) await ed.page.screenshot({ path: join(SHOTS, `${shell}-${String(++shotN).padStart(2, "0")}-${step.replace(/[^a-z0-9]+/gi, "-")}.png`) })
    return m
  }
  /* The next frame and settled: a picture may be stale for no frame at all. */
  const both = async (step) => {
    await nextFrames(ed)
    await measure(`${step} (next frame)`, { pixels: false })
    await sleep(500)
    await measure(`${step} (settled)`)
  }
  const scroll = (to) => ed.js((to) => {
    const l = [...document.querySelectorAll("[data-library-scroll]")].find((x) => x.clientHeight > 0)
    if (l) l.scrollTop = to < 0 ? l.scrollHeight : to <= 1 ? l.scrollHeight * to : to
  }, to)
  const openLibrary = async () => {
    for (let i = 0; i < 80; i++) {
      const ok = await ed.js(() => {
        if (document.querySelector("[data-section-library-layer][data-state='open'], [data-section-library='phone'][data-library-open]")) return true
        const add = document.querySelector("[data-section-group='template'] [data-add-section]") ?? document.querySelector("[data-add-section]") ?? document.querySelector("[data-add-section-top]")
        if (add) add.click()
        else [...document.querySelectorAll("button, [role='tab']")].find((b) => (b.textContent ?? "").trim() === "Sections")?.click()
        return false
      })
      if (ok) return true
      await sleep(250)
    }
    return false
  }
  const waitShown = async () => {
    for (let i = 0; i < 60; i++) {
      const m = await ed.js(MEASURE)
      if (m.seen && m.shown >= Math.min(m.seen, 3)) return
      await sleep(250)
    }
  }
  const categories = () => ed.js(() => {
    const lib = document.querySelector("[data-section-library]")
    const pills = [...lib.querySelectorAll(lib.getAttribute("data-section-library") === "phone" ? ".wb-chip" : "nav button")]
    return pills.map((b) => (b.textContent ?? "").trim())
  })
  const pick = (name) => ed.js((name) => {
    const lib = document.querySelector("[data-section-library]")
    const pills = [...lib.querySelectorAll(lib.getAttribute("data-section-library") === "phone" ? ".wb-chip" : "nav button")]
    const bare = (t) => t.trim().replace(/\d+$/, "")
    pills.find((b) => bare(b.textContent ?? "") === bare(name))?.click()
  }, name)

  try {
    console.log(`\n${phone ? "Phone, 390 x 844" : "Computer, 1440 x 900"}`)
    if (!(await openLibrary())) throw new Error("the library never opened")
    await waitShown()
    await sleep(1500)
    await measure("open")
    if (process.env.QUICK) return results

    /* Fast scrolling, top to bottom and back, a screen and a half a step. */
    for (const at of [0.15, 0.35, 0.6, 0.85, -1, 0.5, 0]) {
      await scroll(at)
      await nextFrames(ed)
      await measure(`scroll to ${at < 0 ? "end" : at}`, { pixels: false })
    }
    await sleep(600)
    await scroll(0.4)
    await sleep(500)
    await measure("scrolled, settled")

    /* Every category, each picked while the list is scrolled down. */
    const cats = await categories()
    for (const name of [...cats.slice(1), cats[0]]) {
      await scroll(0.6)
      await nextFrames(ed)
      await pick(name)
      await both(`category ${name.replace(/\d+$/, "")}`)
    }
    await pick(cats[0])
    await sleep(600)

    /* Card heights changed by opposite amounts: cards between them move, the grid does not change size, no card renders. */
    const swap = (from, to, px) => ed.js((from, to, px) => {
      const titles = [...document.querySelectorAll("[data-library-scroll] [data-library-card]:not([hidden]) > span:first-of-type")]
      if (titles[from]) titles[from].style.paddingBottom = ""
      if (titles[to]) titles[to].style.paddingBottom = `${px}px`
    }, from, to, px)
    await scroll(0)
    await swap(-1, 4, 37)
    await sleep(500)
    await swap(4, 0, 37)
    await both("opposite heights 4 to 0")
    await swap(0, 2, 23)
    await both("opposite heights 0 to 2")
    await swap(2, -1, 0)
    await sleep(400)

    /* The titles' metrics change, as when a font lands: every card under the first moves. */
    await ed.js(() => {
      const s = document.createElement("style")
      s.id = "probe-font"
      s.textContent = "[data-library-card] > span { line-height: 1.9 !important; letter-spacing: 0.02em }"
      document.head.appendChild(s)
    })
    await both("title metrics change (font)")
    await ed.js(() => document.getElementById("probe-font")?.remove())
    await both("title metrics back")

    /* The window resized: the dialog and every card a new width. */
    if (!phone) {
      for (const [w, h] of [[1180, 820], [1000, 760], [1440, 900]]) {
        await ed.page.setViewport({ width: w, height: h })
        await both(`resize ${w}x${h}`)
      }
    } else {
      for (const [w, h] of [[360, 740], [414, 896], [390, 844]]) {
        await ed.page.setViewport({ width: w, height: h, isMobile: true, hasTouch: true })
        await both(`resize ${w}x${h}`)
      }
    }

    /* Closed and opened again: the entrance plays (a transform over the list), held heights are let go. */
    await scroll(0.5)
    await sleep(300)
    await ed.js(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })))
    if (phone) await ed.js(() => { const s = document.querySelector("[data-section-library='phone']")?.closest("[data-mobile-bottom-sheet]"); s?.querySelector("[data-sheet-close], [aria-label='Close']")?.click() })
    await sleep(900)
    if (!(await openLibrary())) throw new Error("the library did not open again")
    for (let k = 0; k < 6; k++) {
      await ed.js(() => new Promise((r) => requestAnimationFrame(() => r())))
      await measure(`reopen, entrance frame ${k + 1}`, { pixels: false })
    }
    await sleep(700)
    await measure("reopen, settled")

    /* A push while it is open. A section file only: the frame's document (the theme's head) is the same, so React leaves it; a new sheet takes it over. */
    const push = async (label, patch, rows) => {
      Object.assign(compat.all, patch.files, patch.sources)
      await ed.page.evaluate((p) => { Object.assign(window.PROBE_COMPAT.files, p.files); Object.assign(window.PROBE_COMPAT.sources, p.sources) }, patch)
      await ed.js((evs) => { const a = window.PROBE_ACTIVITY; let n = a.events[a.events.length - 1].id; for (const e of evs) a.events.push({ ...e, id: ++n, created_at: new Date().toISOString() }); a.syncAt = new Date().toISOString() }, rows)
      for (let k = 0; k < 16; k++) {
        await sleep(500)
        await measure(`${label}, ${((k + 1) * 0.5).toFixed(1)}s`, { pixels: k % 4 === 3 })
      }
      await scroll(0.3)
      await pick(cats[Math.min(2, cats.length - 1)])
      await both(`${label}, then a category`)
      await pick(cats[0])
      await scroll(0.5)
      await both(`${label}, then All, scrolled`)
    }
    const stamp = Date.now().toString(36)
    const sections = Object.fromEntries(SECTION_PATHS.slice(0, 3).map((p) => [p, withMarkup(compat.sources[p], `<i data-push="${stamp}"></i>`)]))
    await push("push of section files", { sources: sections, files: {} }, Object.keys(sections).map((path) => ({ agent_name: "GitHub · ada", path, action: "updated" })))
    if (CSS_PATH) {
      const files = { [CSS_PATH]: `${compat.files[CSS_PATH]}\n:root{--push-${stamp}:1}` }
      await push("push of a stylesheet", { sources: {}, files }, [{ agent_name: "GitHub · ada", path: CSS_PATH, action: "updated" }])
    }
    if (ed.errors.length) console.log("  page errors:", ed.errors.slice(0, 4))
  } finally {
    await ed.close()
  }
  return results
}

const all = {}
for (const shell of WIDTHS) all[shell] = await run(shell)
console.log("\nSummary")
let total = 0
for (const [shell, rs] of Object.entries(all)) {
  const badSteps = rs.filter((r) => r.error || r.bad || r.gaps)
  const n = rs.reduce((a, r) => a + (r.bad ?? 0), 0)
  const px = rs.reduce((a, r) => a + (r.gaps ?? 0), 0)
  total += n + badSteps.filter((r) => r.error).length + (px ? 1 : 0)
  console.log(`  ${shell}: ${rs.length} measurements, ${n} placement errors in ${badSteps.length} of them, ${px} px painted outside the cards`)
  for (const r of badSteps) console.log(`    ${r.step}: ${r.error ?? `${r.bad} errors (${[...new Set(r.kinds)].join(", ")})${r.gaps ? `, ${r.gaps} px` : ""}`}`)
}
process.exit(total ? 1 : 0)
