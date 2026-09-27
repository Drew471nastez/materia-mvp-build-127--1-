/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR'S CHROME ON A PHONE: ITS WAYS IN AND BACK, MEASURED
 * ===========================================================================
 * The real editor (scripts/onepage-probe-server.mjs) at 390x844 with a
 * finger and the CPU slowed four times, a mid-range phone.
 *
 *   nav      The owner's own sequence: Design, Theme, back, Theme, back, and
 *            the header's back arrow. For each press: React commits, how
 *            often the Design list and the Theme panel were mounted, how
 *            many motions were started (a motion is the set of animations
 *            that begin together; a push is one, a push and then a fade of
 *            what is in it a moment later is two), frames where the page
 *            arriving is on screen with nothing in it, and layout shift.
 *   tabs     Links, Design, Products, Settings and back: commits, motions,
 *            frames with no tab drawn, whether anything slides, and whether
 *            each tab comes back where it was scrolled to.
 *   avatar   Width and height of the avatar drawn in every theme card.
 *   add      The + Add button's colour, and the + glyph's rotation, frame by
 *            frame, as the sheet opens and as it closes.
 *   back     The panel's back button: its size, its border and shadow, and
 *            what :active does to it (forced through the inspector).
 *   reduce   prefers-reduced-motion: a push starts no animation, the + turns
 *            without a transition.
 *   links    Links: a link's editor in and out, and the settings panel.
 *
 *   PROBE_CSS=source node scripts/check-onepage-editor-nav.mjs
 *   REPORT=1 ...   numbers only, nothing fails (for a before and after)
 *   SHOTS=/dir ... screenshots, prefixed opeditor-
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const REPORT = !!process.env.REPORT
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-opeditor-"))
mkdirSync(shots, { recursive: true })
const only = (process.env.ONLY || "").split(",").filter(Boolean)
const wants = (k) => !only.length || only.includes(k)

const { base, server } = await serveEditorProbe({
  root,
  fail,
  blocks: Array.from({ length: 14 }, (_, i) => ({ id: `l${i}`, type: "link_button", enabled: true, sort_order: i, data: { label: `Link number ${i + 1}`, url: `https://example.com/${i}` } })),
})
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const report = {}
let broken = 0
const expect = (ok, what, got) => {
  const tail = got === undefined ? "" : `   (${JSON.stringify(got)})`
  if (REPORT) { console.log(`  ....  ${what}${tail}`); return }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${tail}`)
  if (!ok) broken++
}

/*
  Installed before the page's own scripts. Every Element.animate() call and
  every CSS transition that starts is logged with the time and what it was
  on; every mount and unmount of the pieces watched is counted; layout
  shifts are summed.
*/
const INSTRUMENT = () => {
  const tag = (el) => {
    if (!el || !el.closest) return "?"
    const d = el.closest("[data-design-panel]")
    if (d) {
      const id = d.getAttribute("data-design-panel")
      return el === d ? `design:${id}` : `design:${id}:inner`
    }
    const t = el.closest("[data-tab-panel]")
    if (t) return el === t ? `tab:${t.getAttribute("data-tab-panel")}` : `tab:${t.getAttribute("data-tab-panel")}:inner`
    if (el.closest("[data-tab-pill]")) return "pill"
    return el.tagName.toLowerCase()
  }
  window.__anims = []
  const animate = Element.prototype.animate
  Element.prototype.animate = function (kf, opts) {
    const frames = Array.isArray(kf) ? kf : []
    const props = [...new Set(frames.flatMap((f) => Object.keys(f)).filter((k) => !["offset", "easing", "composite"].includes(k)))]
    window.__anims.push({ t: performance.now(), on: tag(this), props, duration: typeof opts === "number" ? opts : opts?.duration })
    return animate.call(this, kf, opts)
  }
  window.__transitions = []
  document.addEventListener("transitionrun", (e) => window.__transitions.push({ t: performance.now(), on: tag(e.target), prop: e.propertyName, what: `${e.target.tagName.toLowerCase()}${[...e.target.attributes].filter((a) => a.name.startsWith("data-") || a.name === "aria-label").map((a) => `[${a.name}${a.value ? `=${a.value}` : ""}]`).join("")}` }), true)
  window.__mounts = { list: 0, theme: 0, themeCards: 0, panel: 0, unmountPanel: 0 }
  new MutationObserver((recs) => {
    for (const r of recs) {
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue
        const all = [n, ...n.querySelectorAll("[data-design-panel], [data-theme-card]")]
        for (const el of all) {
          const d = el.getAttribute?.("data-design-panel")
          if (d === "home") window.__mounts.list++
          else if (d) { window.__mounts.panel++; if (d === "theme") window.__mounts.theme++ }
          if (el.hasAttribute?.("data-theme-card")) window.__mounts.themeCards++
        }
      }
      for (const n of r.removedNodes) {
        if (n.nodeType !== 1) continue
        if (n.matches?.("[data-design-panel]:not([data-design-panel='home'])") || n.querySelector?.("[data-design-panel]:not([data-design-panel='home'])")) window.__mounts.unmountPanel++
      }
    }
  }).observe(document, { childList: true, subtree: true })
  window.__shift = 0
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shift += e.value }).observe({ type: "layout-shift", buffered: true })
  } catch {}
  window.__downs = []
  window.addEventListener("pointerdown", () => window.__downs.push(performance.now()), { capture: true })
  window.addEventListener("click", () => window.__downs.push(performance.now()), { capture: true })
  /* Frames: a function sampled in each animation frame, after layout (a ResizeObserver callback). */
  window.__rec = (ms, sample) => new Promise((resolve) => {
    const painted = []
    const dummy = document.createElement("div")
    dummy.style.cssText = "position:fixed;left:-20px;top:0;width:1px;height:1px;pointer-events:none"
    document.body.appendChild(dummy)
    let flip = false
    const ro = new ResizeObserver(() => { painted.push({ t: performance.now(), ...sample() }) })
    ro.observe(dummy)
    const t0 = performance.now()
    const tick = () => {
      flip = !flip
      dummy.style.width = flip ? "2px" : "1px"
      if (performance.now() - t0 < ms) requestAnimationFrame(tick)
      else { ro.disconnect(); dummy.remove(); resolve(painted) }
    }
    requestAnimationFrame(tick)
  })
}

async function open(hash, { throttle = 4, reduce = false } = {}) {
  const p = await browser.newPage()
  await p.setViewport(PHONE)
  await p.evaluateOnNewDocument(INSTRUMENT)
  await p.evaluateOnNewDocument(() => { try { sessionStorage.clear() } catch {} })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}/app/onepage#${hash}`)
  await p.waitForSelector("[data-scroll-container]")
  await sleep(2500)
  const cdp = await p.target().createCDPSession()
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }, { name: "any-hover", value: "none" }, { name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }] })
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle })
  return { p, cdp, errors }
}
const center = (p, sel) => p.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
/* A finger rests on the glass for `hold` ms between touching and lifting (a real tap: 50 to 150ms). */
async function tap(s, sel, hold = 0) {
  const c = await center(s.p, sel)
  await s.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y }] })
  if (hold) await sleep(hold)
  await s.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}
const HOLD = Number(process.env.HOLD ?? 90)
const shot = (s, name) => s.p.screenshot({ path: join(shots, `opeditor-${name}.png`) })

/* Animations and transitions that begin within 34ms of each other are one motion. */
function motions(anims, transitions, filter) {
  const starts = [...anims.filter((a) => filter(a.on)).map((a) => a.t), ...transitions.filter((x) => filter(x.on)).map((x) => x.t)].sort((a, b) => a - b)
  const groups = []
  for (const t of starts) if (!groups.length || t - groups[groups.length - 1] > 34) groups.push(t)
  return groups
}

/**
 * One press, recorded. `sample` runs every frame; the counters are read
 * before and after. Returns the frames and the deltas.
 */
async function recordPress(s, sel, sample, ms = 1000) {
  const before = await s.p.evaluate(() => ({ commits: window.__commits, mounts: { ...window.__mounts }, a: window.__anims.length, x: window.__transitions.length, shift: window.__shift }))
  const rec = s.p.evaluate((ms, fn) => window.__rec(ms, new Function(`return (${fn})()`)), ms, sample.toString())
  await sleep(40)
  await (typeof sel === "function" ? sel() : tap(s, sel))
  const painted = await rec
  const after = await s.p.evaluate(() => ({ commits: window.__commits, mounts: { ...window.__mounts }, anims: window.__anims, transitions: window.__transitions, shift: window.__shift, down: window.__downs.at(-1) }))
  const anims = after.anims.slice(before.a)
  const transitions = after.transitions.slice(before.x)
  const mounts = Object.fromEntries(Object.keys(after.mounts).map((k) => [k, after.mounts[k] - before.mounts[k]]))
  return { painted, anims, transitions, mounts, commits: after.commits - before.commits, shift: Math.round((after.shift - before.shift) * 1000) / 1000, down: after.down }
}

/* What the Design stack shows in a frame. */
const DESIGN_SAMPLE = () => {
  const list = document.querySelector('[data-design-panel="home"]')
  const sub = document.querySelector('[data-design-panel]:not([data-design-panel="home"])')
  const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== "none"
  const op = (el) => { let v = 1; for (let n = el; n && n !== document.body; n = n.parentElement) v *= Number(getComputedStyle(n).opacity); return Math.round(v * 100) / 100 }
  const W = window.innerWidth
  const subX = vis(sub) ? Math.round(sub.getBoundingClientRect().left) : null
  /* What is under the panel's header: its controls, and how visible they are. */
  const body = sub ? sub.querySelector("[data-panel-body]") || [...sub.children].find((c) => !c.hasAttribute("data-panel-header") && !c.hasAttribute("data-edge-back") && c.getBoundingClientRect().height > 40) : null
  const bodyO = body ? op(body) : 0
  const listX = vis(list) ? Math.round(list.getBoundingClientRect().left) : null
  /*
    The pages fade now, in place ("NO SLIDE"), so a page's opacity is part
    of what moves, and a panel fading in is not an empty one: empty is a
    panel drawn (a tenth or more) whose controls are drawn at less than half
    of it.
  */
  const listO = vis(list) ? op(list) : null
  const subO = vis(sub) ? op(sub) : null
  /* The page arriving is on screen (more than a third of it in view) with nothing in it. */
  const subOnScreen = subX !== null && subX < W * 0.66 && (subO ?? 0) >= 0.1
  return { listX, subX, listO, subO, bodyO, emptyPanel: subOnScreen && bodyO < 0.5 * (subO ?? 1), blank: listX === null && subX === null, sub: sub?.getAttribute("data-design-panel") || null }
}

/* The pressed control answering the finger (the back tile dipping, a row going grey) is the press, not a move of the page. */
const PRESS_FEEDBACK = /\[data-back-(tile|shade)\]|\[data-nav-row=/
function summarise(r) {
  const f = r.painted
  const sig = (x) => `${x.listX}|${x.subX}|${x.listO}|${x.subO}`
  const moving = new Set(f.map(sig)).size - 1
  const onDesign = (on) => on.startsWith("design:")
  const m = motions(r.anims, r.transitions.filter((x) => !PRESS_FEEDBACK.test(x.what || "")), onDesign)
  const first = f.findIndex((x, i) => i > 0 && sig(x) !== sig(f[i - 1]))
  return {
    commits: r.commits,
    mountsList: r.mounts.list,
    mountsTheme: r.mounts.theme,
    themeCards: r.mounts.themeCards,
    motions: m.length,
    motionStarts: m.map((t) => Math.round(t - (r.down ?? m[0]))),
    framesMoving: moving,
    emptyPanelFrames: f.filter((x) => x.emptyPanel).length,
    blank: f.filter((x) => x.blank).length,
    shift: r.shift,
    toMotion: first > 0 ? Math.round(f[first].t - (r.down ?? f[0].t)) : null,
  }
}

/* ── (a) THE OWNER'S SEQUENCE ── */
if (wants("nav")) {
  console.log("\nphone-390, CPU/4: Design, Theme, back, Theme, back, then the header's back arrow")
  const s = await open("links")
  const steps = [
    ["Design tab", '[data-onepage-tabbar] [data-tab="design"]'],
    ["open Theme", '[data-nav-row="theme"]'],
    ["back", "[data-panel-back]"],
    ["open Theme", '[data-nav-row="theme"]'],
    ["back", "[data-panel-back]"],
  ]
  const rows = []
  /* The editor builds its tabs in the idle time after it arrives, now within 1.5s: Theme's cards may be there before the first press. */
  const preBuilt = await s.p.evaluate(() => document.querySelectorAll("[data-theme-card]").length)
  /* Each press a real tap, the finger down HOLD ms (90 unless set); "tap to motion" counts from the lift. */
  for (const [what, sel] of steps) {
    const listScroll = await s.p.evaluate(() => Math.round(document.querySelector("[data-tab-panel][data-scroll-container]")?.scrollTop ?? 0))
    const r = await recordPress(s, () => tap(s, sel, HOLD), DESIGN_SAMPLE, 1100)
    const sum = summarise(r)
    sum.scrollBefore = listScroll
    sum.scrollAfter = await s.p.evaluate(() => Math.round(document.querySelector("[data-tab-panel][data-scroll-container]")?.scrollTop ?? 0))
    rows.push({ what, ...sum, raw: { anims: r.anims.map((a) => [Math.round(a.t - (r.down ?? 0)), a.on, a.props.join("+"), a.duration]), transitions: r.transitions.filter((x) => x.on.startsWith("design")).slice(0, 12).map((x) => [Math.round(x.t - (r.down ?? 0)), x.on, x.prop, x.what]) } })
    await sleep(400)
    if (what === "open Theme" && rows.length === 2) await shot(s, "theme-open")
  }
  for (const r of rows) console.log(`        ${r.what.padEnd(11)} commits ${String(r.commits).padStart(2)}  list mounts ${r.mountsList}  Theme cards built ${r.themeCards}  motions ${r.motions} at ${JSON.stringify(r.motionStarts)}ms  frames moving ${r.framesMoving}  empty panel frames ${r.emptyPanelFrames}  blank ${r.blank}  shift ${r.shift}  tap to motion ${r.toMotion}ms  scroll ${r.scrollBefore} -> ${r.scrollAfter}`)
  if (process.env.RAW) for (const r of rows) console.log(r.what, JSON.stringify(r.raw))
  /* The header's back arrow, from the list: the editor's own answer to the press (the router is a stub here). */
  const exit = await recordPress(s, "[data-onepage-exit]", () => ({ glass: !!document.querySelector("[data-onepage-leaving]") }), 600)
  const glassFrames = exit.painted.filter((f) => f.glass).length
  const exitMotions = motions(exit.anims, exit.transitions, () => true).length
  console.log(`        exit arrow  commits ${exit.commits}  motions ${exitMotions}  frames with the "Going back" glass ${glassFrames}/${exit.painted.length}`)
  report.nav = rows.map(({ raw, ...r }) => r)
  report.exit = { commits: exit.commits, motions: exitMotions, glassFrames }
  const pushes = rows.slice(1)
  expect(pushes.every((r) => r.motions === 1), "each press into a panel and back starts one motion", pushes.map((r) => r.motions))
  expect(pushes.every((r) => r.emptyPanelFrames === 0), "no frame shows a panel on screen with nothing in it", pushes.map((r) => r.emptyPanelFrames))
  expect(pushes.every((r) => r.blank === 0), "no blank frame", pushes.map((r) => r.blank))
  expect(pushes.every((r) => r.mountsList === 0), "the Design list is never mounted again", pushes.map((r) => r.mountsList))
  /* Theme's cards: built once in the whole sequence (while idle, or on the first tap), never again. */
  const cardsBuilt = rows.map((r) => r.themeCards)
  const once = cardsBuilt.reduce((a, b) => a + b, 0)
  expect((once > 0 || preBuilt > 0) && once === Math.max(...cardsBuilt) && cardsBuilt.slice(2).every((n) => n === 0), "the Theme panel is built once, and neither back nor the second open builds it again", { preBuilt, cardsBuilt })
  expect(pushes.filter((r) => r.what === "back").every((r) => r.themeCards === 0), "back mounts nothing", pushes.filter((r) => r.what === "back").map((r) => r.themeCards))
  expect(pushes.every((r) => r.framesMoving >= 6), "each move is spread over several frames", pushes.map((r) => r.framesMoving))
  expect(pushes.every((r) => r.shift < 0.01), "no layout shift", pushes.map((r) => r.shift))
  /*
    From the lift, at a quarter speed: a panel readied under the finger moves
    within a few frames. 55 to 130ms measured over runs here (the panels
    built while idle can land on a tap once); the page used to slide at 20ms
    with nothing in it and fill in after, which is the double this removes.
  */
  expect(pushes.every((r) => r.toMotion !== null && r.toMotion <= 150), "the page moves within 150ms of the finger lifting (CPU/4)", pushes.map((r) => r.toMotion))
  expect(rows.filter((r) => r.what === "back").every((r) => r.scrollAfter === rows[1].scrollBefore), "back lands where the list was scrolled", rows.map((r) => [r.what, r.scrollBefore, r.scrollAfter]))
  expect(s.errors.length === 0, "no errors on the page", s.errors.slice(0, 3))
  await s.p.close()
}

/* ── BACK LANDS WHERE THE LIST WAS, BY THE BUTTON AND BY ANDROID'S BACK ── */
if (wants("nav")) {
  console.log("\nphone-390x480 (a list taller than the screen): back by the button, and by Android's back")
  const p = await browser.newPage()
  await p.setViewport({ ...PHONE, height: 480 })
  await p.evaluateOnNewDocument(INSTRUMENT)
  await p.evaluateOnNewDocument(() => { try { sessionStorage.clear() } catch {} })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}/app/onepage#design`)
  await p.waitForSelector('[data-nav-row="theme"]')
  await sleep(2000)
  const cdp = await p.target().createCDPSession()
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }] })
  const s = { p, cdp, errors }
  const scrollTop = () => p.evaluate(() => Math.round(document.querySelector("[data-tab-panel][data-scroll-container]").scrollTop))
  const out = []
  /* The way the handler finds what answers back (lib/ui/native-back), and the event it sends. */
  const nativeBack = () => p.evaluate(() => {
    const marked = [...document.querySelectorAll("[data-native-back]")].filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden")
    const el = marked.at(-1)
    if (!el) return false
    el.dispatchEvent(new CustomEvent("storelib:native-back"))
    return true
  })
  for (const [how, back] of [["the back button", () => tap(s, "[data-panel-back]")], ["Android's back", nativeBack]]) {
    await p.evaluate(() => { const b = document.querySelector("[data-tab-panel][data-scroll-container]"); b.scrollTop = b.scrollHeight })
    await sleep(200)
    const at = await scrollTop()
    /* A row in the middle of what is on screen, clear of the bar at the top and the tabs at the bottom. */
    const row = await p.evaluate(() => [...document.querySelectorAll("[data-nav-row]")].find((r) => { const b = r.getBoundingClientRect(); return b.top > 120 && b.bottom < window.innerHeight - 120 })?.getAttribute("data-nav-row"))
    await tap(s, `[data-nav-row="${row}"]`)
    await sleep(700)
    const panelTop = await scrollTop()
    const r = await recordPress(s, back, DESIGN_SAMPLE, 800)
    const sum = summarise(r)
    const landed = await scrollTop()
    const onList = await p.evaluate(() => !document.querySelector('[data-design-panel]:not([data-design-panel="home"])'))
    out.push({ how, at, panelTop, landed, onList, motions: sum.motions })
    console.log(`        ${how.padEnd(15)} list at ${at}px, the panel opened at ${panelTop}px, back landed at ${landed}px, on the list: ${onList}, motions ${sum.motions}`)
  }
  report.backLands = out
  expect(out.every((o) => o.at > 0 && o.panelTop === 0 && o.landed === o.at && o.onList), "a panel opens at its top, and both ways back land where the list was", out)
  expect(out.every((o) => o.motions === 1), "both ways back are the same one motion", out.map((o) => o.motions))
  const idle = await nativeBack()
  expect(!idle, "on the list, nothing in the page answers Android's back (it goes to the app)", idle)
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  await p.close()
}

/* ── (b) THE BOTTOM TABS ── */
const TAB_SAMPLE = () => {
  const area = document.querySelector("[data-onepage-panels]")
  const boxes = area ? [...area.querySelectorAll(":scope > [data-tab-panel]")] : []
  let seen = 0
  let shifted = false
  for (const box of boxes) {
    const cs = getComputedStyle(box)
    if (cs.visibility === "hidden" || cs.display === "none") continue
    if (new DOMMatrixReadOnly(cs.transform === "none" ? undefined : cs.transform).m41 !== 0) shifted = true
    const o = Number(cs.opacity)
    const drawn = box.firstElementChild && [...box.firstElementChild.children].some((c) => c.getBoundingClientRect().height > 0)
    if (o > 0.3 && drawn) seen++
  }
  return { blank: seen === 0, shifted }
}
if (wants("tabs")) {
  console.log("\nphone-390, CPU/4: the bottom tabs")
  const s = await open("links")
  await s.p.evaluate(() => document.querySelector("[data-tab-panel][data-scroll-container]").scrollTo({ top: 260, behavior: "instant" }))
  await sleep(300)
  const linksScroll = await s.p.evaluate(() => Math.round(document.querySelector("[data-tab-panel][data-scroll-container]").scrollTop))
  const rows = []
  for (const to of ["design", "products", "settings", "links", "design", "links"]) {
    const r = await recordPress(s, `[data-onepage-tabbar] [data-tab="${to}"]`, TAB_SAMPLE, 800)
    const m = motions(r.anims, [], (on) => on.startsWith("tab:"))
    const slides = r.anims.filter((a) => a.on.startsWith("tab:") && a.props.includes("transform")).length
    const longest = Math.max(0, ...r.anims.filter((a) => a.on.startsWith("tab:")).map((a) => a.duration || 0))
    const firstTab = r.anims.find((a) => a.on.startsWith("tab:"))
    rows.push({ to, commits: r.commits, motions: m.length, slides, longest, toFade: firstTab ? Math.round(firstTab.t - r.down) : null, blank: r.painted.filter((f) => f.blank).length, shiftedFrames: r.painted.filter((f) => f.shifted).length, shift: r.shift, scroll: await s.p.evaluate(() => Math.round(document.querySelector("[data-tab-panel][data-scroll-container]").scrollTop)) })
    await sleep(300)
  }
  for (const r of rows) console.log(`        to ${r.to.padEnd(9)} commits ${String(r.commits).padStart(2)}  motions ${r.motions}  animations moving a tab ${r.slides} (frames with a tab off its place ${r.shiftedFrames})  longest ${r.longest}ms  tap to fade ${r.toFade}ms  blank ${r.blank}  shift ${r.shift}  scroll ${r.scroll}`)
  report.tabs = rows
  expect(rows.every((r) => r.blank === 0), "no frame without a tab", rows.map((r) => r.blank))
  expect(rows.every((r) => r.slides === 0 && r.shiftedFrames === 0), "nothing slides: a tab only fades", rows.map((r) => [r.slides, r.shiftedFrames]))
  expect(rows.every((r) => r.motions <= 1), "one motion per switch at most", rows.map((r) => r.motions))
  expect(rows.every((r) => r.longest <= 160), "the fade is short (160ms at most)", rows.map((r) => r.longest))
  expect(rows.every((r) => r.shift < 0.01), "no layout shift", rows.map((r) => r.shift))
  expect(rows[3].scroll === linksScroll, "Links comes back where it was scrolled to", { left: linksScroll, back: rows[3].scroll })
  expect(s.errors.length === 0, "no errors on the page", s.errors.slice(0, 3))
  await s.p.close()
}

/* ── (c) THE AVATAR IN EVERY THEME CARD ── */
if (wants("avatar")) {
  console.log("\nphone-390 and 1280: the avatar in every theme card")
  for (const [label, vp] of [["phone-320", { ...PHONE, width: 320 }], ["phone-390", PHONE], ["desktop-1280", { width: 1280, height: 900 }]]) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.evaluateOnNewDocument(() => { try { sessionStorage.setItem("onepage-design-section", "theme") } catch {} })
    await p.goto(`${base}/app/onepage#design`)
    await p.waitForSelector("[data-theme-card]", { timeout: 15000 })
    await sleep(1200)
    const cards = await p.$$eval("[data-theme-card]", (cs) => cs.map((c) => {
      const a = c.querySelector("[data-theme-avatar]") || c.querySelector(".aspect-square.rounded-full")
      if (!a) return { id: c.getAttribute("data-theme-card"), none: true }
      const r = a.getBoundingClientRect()
      const cs2 = getComputedStyle(a)
      /* How much the card's column is short of room: what the column would take from its children. */
      const col = a.parentElement
      const need = [...col.children].reduce((sum, k) => { const s = getComputedStyle(k); return sum + k.getBoundingClientRect().height + parseFloat(s.marginTop) + parseFloat(s.marginBottom) }, 0) + parseFloat(getComputedStyle(col).paddingTop)
      return { id: c.getAttribute("data-theme-card"), w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100, radius: cs2.borderRadius, shrink: cs2.flexShrink, room: Math.round((col.clientHeight - need) * 10) / 10 }
    }))
    const drawn = cards.filter((c) => !c.none)
    const worst = drawn.reduce((m, c) => Math.max(m, Math.abs(c.w - c.h)), 0)
    const tightest = Math.min(...drawn.map((c) => c.room))
    console.log(`        ${label}: ${drawn.length} avatars (${cards.length - drawn.length} hero cards without one), worst |w-h| ${worst.toFixed(2)}px, flex-shrink ${drawn[0]?.shrink}, least room left in a card ${tightest}px, e.g. ${JSON.stringify(drawn.slice(0, 3).map((c) => [c.id, c.w, c.h]))}`)
    report[`avatar-${label}`] = { count: drawn.length, worst, tightest, shrink: drawn[0]?.shrink, cards: drawn.map((c) => [c.id, c.w, c.h]) }
    expect(drawn.length > 0 && worst < 0.5, `${label}: every theme card's avatar is a circle (width equals height)`, { worst, first: drawn[0] })
    /* A browser that lets a flex column take height back from an aspect-ratio box (WebKit) would squash it: it must not be allowed to. */
    expect(drawn.every((c) => c.shrink === "0"), `${label}: and it cannot be squashed by its column (flex-shrink 0)`, drawn[0]?.shrink)
    /* The other avatar in the editor's chrome: the Links tab's profile picture. */
    await p.goto(`${base}/app/onepage#links`)
    await p.waitForSelector("[data-scroll-container]")
    await sleep(900)
    const own = await p.evaluate(() => {
      const el = document.querySelector("[data-editor-avatar]") || document.querySelector('[data-tab-panel="links"] .rounded-full.overflow-hidden')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100, radius: getComputedStyle(el).borderRadius }
    })
    report[`profile-avatar-${label}`] = own
    expect(!!own && Math.abs(own.w - own.h) < 0.5, `${label}: the Links tab's profile picture is a circle`, own)
    if (label === "phone-390") {
      await p.evaluate(() => { try { sessionStorage.setItem("onepage-design-section", "theme") } catch {} })
      await p.goto(`${base}/app/onepage#design`)
      await p.waitForSelector("[data-theme-card]")
      await sleep(900)
      await p.screenshot({ path: join(shots, "opeditor-theme-cards.png") })
    }
    await p.close()
  }
}

/* ── (c) AND IN THE ONBOARDING'S THEMES, WITH THE CREATOR'S OWN PICTURE ── */
if (wants("avatar")) {
  console.log("\nthe onboarding's theme step: the creator's picture in every theme card")
  const onb = await serveEditorProbe({ root, fail, entry: "scripts/render-onepage-onboarding-themes.tsx" })
  for (const [label, vp] of [["phone-320", { ...PHONE, width: 320 }], ["phone-390", PHONE], ["desktop-1280", { width: 1280, height: 900 }]]) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.goto(`${onb.base}/app/onepage`)
    await sleep(2500)
    const found = await p.evaluate(() => {
      const els = [...document.querySelectorAll("[data-theme-avatar], .w-7.h-7.rounded-full, .w-10.h-10.rounded-full")].filter((e) => e.getClientRects().length && e.querySelector("img"))
      return [...new Set(els)].map((a) => { const r = a.getBoundingClientRect(); return [Math.round(r.width * 100) / 100, Math.round(r.height * 100) / 100] })
    })
    const worst = found.reduce((m, [w, h]) => Math.max(m, Math.abs(w - h)), 0)
    console.log(`        ${label}: ${found.length} pictures, worst |w-h| ${worst.toFixed(2)}px, e.g. ${JSON.stringify(found.slice(0, 4))}`)
    report[`onboarding-avatar-${label}`] = { count: found.length, worst, sizes: found }
    expect(found.length > 0 && worst < 0.5, `${label}: the onboarding's theme cards draw the picture as a circle`, { count: found.length, worst })
    if (label === "phone-390") await p.screenshot({ path: join(shots, "opeditor-onboarding-themes.png") })
    await p.close()
  }
  onb.server.close()
}

/* ── (d) THE + ADD BUTTON ── */
const ADD_SEL = () => document.querySelector("[data-add-block]") || [...document.querySelectorAll('[data-tab-panel="links"] button')].find((b) => b.textContent.trim() === "Add" && b.querySelector("svg"))
if (wants("add")) for (const reduce of [false, true]) {
  const label = reduce ? "reduced motion" : "motion"
  console.log(`\nphone-390, CPU/4: the + Add button (${label})`)
  const s = await open("links", { reduce })
  await s.p.evaluate((fn) => { window.__addSel = new Function(`return (${fn})()`) }, ADD_SEL.toString())
  const look = await s.p.evaluate(() => {
    const b = window.__addSel()
    const cs = getComputedStyle(b)
    const g = b.querySelector("svg")
    const gs = getComputedStyle(g)
    return { bg: cs.backgroundColor, color: cs.color, h: Math.round(b.getBoundingClientRect().height), glyphTransition: `${gs.transitionProperty} ${gs.transitionDuration} ${gs.transitionTimingFunction}` }
  })
  const angle = () => {
    const g = window.__addSel().querySelector("svg")
    const cs = getComputedStyle(g)
    let deg = 0
    if (cs.rotate && cs.rotate !== "none") deg += parseFloat(cs.rotate)
    if (cs.transform && cs.transform !== "none") { const m = new DOMMatrixReadOnly(cs.transform); deg += Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI * 10) / 10 }
    return { deg: Math.round(deg * 10) / 10, sheet: !!document.querySelector('[role="dialog"]') }
  }
  if (!reduce) await shot(s, "add-rest")
  const openRec = await recordPress(s, async () => { const c = await s.p.evaluate(() => { const r = window.__addSel().getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }); await s.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [c] }); await s.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }) }, angle, 700)
  if (!reduce) await shot(s, "add-open")
  const closeRec = await recordPress(s, async () => { await s.p.keyboard.press("Escape") }, angle, 700)
  const curve = (f) => [...new Set(f.painted.map((x) => x.deg))]
  const openCurve = curve(openRec)
  const closeCurve = curve(closeRec)
  const openEnd = openRec.painted.at(-1)?.deg
  const closeEnd = closeRec.painted.at(-1)?.deg
  console.log(`        colour ${look.bg}, text ${look.color}, ${look.h}px high; glyph transition ${look.glyphTransition}`)
  console.log(`        open: angles ${JSON.stringify(openCurve)} (ends ${openEnd}deg)   close: angles ${JSON.stringify(closeCurve)} (ends ${closeEnd}deg)`)
  report[`add-${reduce ? "reduce" : "motion"}`] = { look, openCurve, closeCurve, openEnd, closeEnd }
  if (!reduce) {
    expect(look.bg === "rgb(139, 92, 246)", "the + Add button is the app's violet, #8b5cf6", look.bg)
    expect(Math.abs(openEnd - 45) < 0.5 && Math.abs(closeEnd) < 0.5, "the + turns to 45deg while the sheet is open and back when it closes", { openEnd, closeEnd })
    expect(openCurve.length >= 4 && closeCurve.length >= 4, "it turns over several frames each way, not in one step", { open: openCurve.length, close: closeCurve.length })
  } else {
    expect(Math.abs(openEnd - 45) < 0.5 && openCurve.length <= 2 && closeCurve.length <= 2, "reduced motion: the + is turned, in one step, with no transition", { openCurve, closeCurve })
  }
  expect(s.errors.length === 0, "no errors on the page", s.errors.slice(0, 3))
  await s.p.close()
}

/* ── (e) THE BACK BUTTON ── */
if (wants("back")) {
  console.log("\nphone-390: the panel's back button")
  const s = await open("design", { throttle: 1 })
  await tap(s, '[data-nav-row="buttons"]')
  await sleep(900)
  const read = () => s.p.evaluate(() => {
    const b = document.querySelector("[data-panel-back]")
    const tile = b.querySelector("[data-back-tile]") || b
    const r = b.getBoundingClientRect()
    const t = tile.getBoundingClientRect()
    const cs = getComputedStyle(tile)
    let scale = 1
    if (cs.scale && cs.scale !== "none") scale = parseFloat(cs.scale)
    if (cs.transform && cs.transform !== "none") scale *= new DOMMatrixReadOnly(cs.transform).a
    const shade = tile.querySelector("[data-back-shade]")
    return {
      button: [Math.round(r.width), Math.round(r.height)],
      tile: [Math.round(t.width), Math.round(t.height)],
      radius: cs.borderRadius,
      border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
      shadow: cs.boxShadow,
      bg: cs.backgroundColor,
      scale: Math.round(scale * 1000) / 1000,
      shade: shade ? Number(getComputedStyle(shade).opacity) : null,
      transition: `${cs.transitionProperty} / ${cs.transitionDuration}`,
    }
  })
  const rest = await read()
  await shot(s, "back-rest")
  /* :active, forced on the button (the inspector's own switch), then read back. */
  const { root: doc } = await s.cdp.send("DOM.getDocument", { depth: -1 })
  const { nodeId } = await s.cdp.send("DOM.querySelector", { nodeId: doc.nodeId, selector: "[data-panel-back]" })
  await s.cdp.send("CSS.enable")
  await s.cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["active"] })
  await sleep(400)
  const pressed = await read()
  await shot(s, "back-pressed")
  await s.cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] })
  console.log(`        at rest  ${JSON.stringify(rest)}`)
  console.log(`        pressed  ${JSON.stringify(pressed)}`)
  report.back = { rest, pressed }
  expect(rest.button[0] >= 44 && rest.button[1] >= 44, "the press area is 44px or more", rest.button)
  expect(!rest.radius.startsWith("50%") && parseFloat(rest.radius) < rest.tile[0] / 2, "a rounded square, not a circle", rest.radius)
  expect(rest.border.startsWith("1px solid") && rest.shadow !== "none", "a hairline border and a shadow at rest", { border: rest.border, shadow: rest.shadow })
  expect(pressed.scale < 1 && pressed.scale >= 0.9, "pressed, it dips a little", pressed.scale)
  const ms = (rest.transition.split(" / ")[1] || "").split(",").map((x) => parseFloat(x) * (x.includes("ms") ? 1 : 1000))
  expect(ms.length && ms.every((d) => d >= 100 && d <= 150), "its press moves in 100 to 150ms", rest.transition)
  expect(/^(scale|transform|opacity)(, (scale|transform|opacity))*$/.test(rest.transition.split(" / ")[0]), "only scale and opacity are animated", rest.transition)
  expect(s.errors.length === 0, "no errors on the page", s.errors.slice(0, 3))
  await s.p.close()
}

/* ── REDUCED MOTION ON A PUSH ── */
if (wants("reduce")) {
  console.log("\nphone-390, reduced motion: Design, Theme and back")
  const s = await open("design", { reduce: true })
  const a = summarise(await recordPress(s, '[data-nav-row="theme"]', DESIGN_SAMPLE, 700))
  const b = summarise(await recordPress(s, "[data-panel-back]", DESIGN_SAMPLE, 700))
  console.log(`        open motions ${a.motions}, frames moving ${a.framesMoving}; back motions ${b.motions}, frames moving ${b.framesMoving}`)
  report.reduce = { open: a, back: b }
  expect(a.motions === 0 && b.motions === 0, "no animation is started", [a.motions, b.motions])
  expect(a.blank === 0 && b.blank === 0 && a.emptyPanelFrames === 0, "no blank frame and no empty panel", [a.blank, b.blank, a.emptyPanelFrames])
  expect(s.errors.length === 0, "no errors on the page", s.errors.slice(0, 3))
  await s.p.close()
}

/* ── (f) THE OTHER WAYS IN: A LINK'S EDITOR, SETTINGS ── */
if (wants("links")) {
  console.log("\nphone-390, CPU/4: a link's editor in and out, and Settings")
  const s = await open("links")
  const LINK_SAMPLE = () => {
    const area = document.querySelector('[data-tab-panel="links"]')
    const r = area?.firstElementChild?.getBoundingClientRect()
    return { blank: !r || r.height < 10, h: r ? Math.round(r.height) : 0 }
  }
  /* A link's editor opens inline, under its card: the card grows in place, once, and closes the same way. */
  const cardText = '[data-block-id="l1"] .flex-1.min-w-0.cursor-pointer'
  const linkRows = []
  for (const what of ["open a link", "close it"]) {
    const r = await recordPress(s, () => tap(s, cardText, HOLD), LINK_SAMPLE, 900)
    const m = motions(r.anims, r.transitions.filter((x) => x.on.startsWith("tab:links")), () => true)
    const heights = [...new Set(r.painted.map((f) => f.h))]
    linkRows.push({ what, commits: r.commits, motions: m.length, blank: r.painted.filter((f) => f.blank).length, heights: heights.length })
    await sleep(300)
  }
  for (const r of linkRows) console.log(`        ${r.what.padEnd(12)} commits ${r.commits}  motions ${r.motions}  blank ${r.blank}  heights seen ${r.heights}`)
  report.linkEditor = linkRows
  expect(linkRows.every((r) => r.blank === 0), "a link's editor opens and closes without a blank frame", linkRows.map((r) => r.blank))
  const set = await recordPress(s, '[data-onepage-tabbar] [data-tab="settings"]', LINK_SAMPLE, 700)
  const setMotions = motions(set.anims, [], (on) => on.startsWith("tab:")).length
  console.log(`        to Settings: commits ${set.commits}, motions ${setMotions}, shift ${set.shift}`)
  report.settings = { commits: set.commits, motions: setMotions, shift: set.shift }
  expect(setMotions <= 1 && set.shift < 0.01, "Settings arrives in one motion, without a shift", report.settings)
  /*
    A section of Settings: the section pressed fades in over several frames, and does not move.
    It was one keyed section settling in tone (settings-panel-in); the sections are kept now and
    crossfaded (components/onepage/pill-tabs PillPanels), so the section read is the one shown,
    and its fade is a script animation. scripts/check-onepage-pill-tabs.mjs measures the rest.
  */
  await sleep(1500)
  const chip = await s.p.evaluate(() => { const b = [...document.querySelectorAll('[data-tab-panel="settings"] button[aria-selected], [data-tab-panel="settings"] button[aria-pressed]')].find((x) => x.getClientRects().length && x.getBoundingClientRect().width > 0 && (x.getAttribute("aria-selected") ?? x.getAttribute("aria-pressed")) === "false"); if (!b) return null; b.setAttribute("data-probe-chip", ""); return b.textContent.trim() })
  if (chip) {
    const SEC = () => { const wrap = document.querySelector('[data-pill-panels="settings"] > [data-pill-panel]:not([aria-hidden])'); const el = wrap?.querySelector("[data-settings-section]") || document.querySelector("[data-settings-section]") || document.querySelector('[data-tab-panel="settings"] .rounded-xl.border.p-5'); if (!el) return { blank: true }; const faded = wrap || el; return { blank: false, o: Number(getComputedStyle(faded).opacity), y: Math.round(el.getBoundingClientRect().top), names: faded.getAnimations().map((a) => a.animationName || "js") } }
    const r = await recordPress(s, () => tap(s, "[data-probe-chip]", HOLD), SEC, 500)
    const names = [...new Set(r.painted.flatMap((f) => f.names || []))]
    const opac = [...new Set(r.painted.map((f) => f.o))].length
    const ys = [...new Set(r.painted.filter((f) => !f.blank).map((f) => f.y))]
    console.log(`        Settings, ${chip}: animations ${JSON.stringify(names)}, opacity steps ${opac}, section top positions ${JSON.stringify(ys)}, blank ${r.painted.filter((f) => f.blank).length}`)
    report.settingsSection = { chip, names, opac, ys }
    expect(names.length <= 1 && opac >= 3 && ys.length === 1, "a Settings section fades in over several frames and does not move", report.settingsSection)
  }
  expect(s.errors.length === 0, "no errors on the page", s.errors.slice(0, 3))
  await s.p.close()
}

await browser.close()
server.close()
if (process.env.REPORT_FILE) writeFileSync(process.env.REPORT_FILE, JSON.stringify(report, null, 2))
console.log(`\nScreenshots in ${shots}`)
if (!REPORT && broken) { console.error(`\n${broken} check(s) failed.\n`); process.exit(1) }
