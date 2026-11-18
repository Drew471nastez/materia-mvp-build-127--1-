/**
 * ===========================================================================
 *  PRODUCTS ON A PHONE, ROUND 42: THE TAP, THE SCROLL, THE IMPORT KEYBOARD
 * ===========================================================================
 * The owner filmed /app/products on an iPhone in the app: Add product
 * flashed under a tap; the list stopped dead at both ends and seemed to jump
 * between the big title and the toolbar; Import, then the link field, made
 * the sheet flash, collapse and pop with the page moving under the status
 * bar; the way back from a product felt abrupt; the filter control looked
 * like nothing else in the toolbar.
 *
 * scripts/render-layer-motion.tsx draws the list, the editor and the stage
 * on the React the app router runs. At 390x844 with touch, in the native
 * shell's classes (html.capacitor), this measures:
 *
 *   THE TAP       Add product held down and hovered, as a finger leaves it
 *                 on iOS: its opacity, colour and the transition it eases on.
 *   THE ENDS      the overscroll the list's own scroller declares (contain
 *                 keeps the rubber band; none takes it), and the same box
 *                 without data-elastic-pane for the before number.
 *   THE IMPORT    the press on Import: whether the link field has the focus
 *                 in the tap's own task (what makes iOS bring its keyboard
 *                 with the step) and where it is laid out then (above the
 *                 keyboard's top, so a web view has nothing to pan to); the
 *                 sheet's top as drawn on every frame (its box, less any clip
 *                 its growth is uncovered by: a glide, never under the status
 *                 bar's strip); the field and the room under the form on
 *                 every frame while a keyboard arrives (--kb-inset and --vv-h
 *                 written as ViewportVars writes them, at the height guessed
 *                 and at one 60px taller) and leaves; a later tap on the field.
 *   THE WAY BACK  the row you came from, in the list under the dropping
 *                 editor (its copy, then the list itself), on every frame:
 *                 it must not move while the editor drops.
 *   THE FILTER    the filter button against Search and Sort beside it.
 *
 * Chromium has no rubber band and no iOS keyboard pan: THE ENDS and THE
 * IMPORT measure what the page declares and where it puts things, which is
 * what decides what WebKit does; the feel itself is for the phone.
 *
 *   node scripts/check-products-touch.mjs
 *   SHOTS=<dir> node scripts/check-products-touch.mjs   (keeps the toolbar and the Import sheet as pictures)
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

/* The stylesheet from this checkout's sources, never an older build's. */
process.env.PROBE_CSS = "source"
const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const oldFiles = []
const oldClient = null

const stubs = mkdtempSync(join(tmpdir(), "storelib-products-touch-"))
writeFileSync(join(stubs, "navigation.js"), `import React from "react"
export const __RouteContext = React.createContext({ path: "/app/products", search: "" })
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = {
  push: (h) => { log("push", h); window.__navigate(h, "push") },
  replace: (h) => { log("replace", h); window.__navigate(h, "replace") },
  prefetch: (h, o) => log("prefetch", h),
  back: () => { log("back"); window.__back() },
  refresh: () => log("refresh"),
}
export const useRouter = () => router
export const usePathname = () => React.useContext(__RouteContext).path
export const useSearchParams = () => { const r = React.useContext(__RouteContext); return React.useMemo(() => new URLSearchParams(r.search), [r.search]) }
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) {
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); window.__navigate(href, "push") } } }, children)
})
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, quality, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
/* Any chain answers: a write echoes the row it was given, with an id, so the editor's Save goes through (THE WAY BACK AFTER A SAVE). */
writeFileSync(join(stubs, "supabase-client.js"), `function from(table) {
  let row = null
  const answer = (one) => {
    const data = row ? { id: (window.__editingId || "p0"), slug: "s", ...row } : one ? null : []
    return Promise.resolve({ data: one ? data : (row ? [data] : []), error: null })
  }
  const q = new Proxy({}, { get(_, k) {
    if (k === "then") return (res, rej) => answer(false).then(res, rej)
    if (k === "single" || k === "maybeSingle") return () => answer(true)
    if (k === "update" || k === "insert" || k === "upsert") return (v) => { row = Array.isArray(v) ? v[0] : v; return q }
    return () => q
  } })
  return q
}
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "u1" } } }), getSession: async () => ({ data: { session: null } }) }, from, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }), upload: async () => ({ data: {}, error: null }), remove: async () => ({ data: {}, error: null }) }) } } }
`)
writeFileSync(join(stubs, "description-action.js"), `export async function cleanDescription(html) { return { ok: true, html: String(html ?? "") } }
`)
const { build } = await import("esbuild")
const compiled = (p) => join(root, "node_modules/next/dist/compiled", p)
await build({
  entryPoints: [join(root, "scripts/render-layer-motion.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: {
    "@": ".",
    react: compiled("react"),
    "react-dom": compiled("react-dom"),
    "next/navigation": join(stubs, "navigation.js"),
    "@/lib/supabase/client": join(stubs, "supabase-client.js"),
    "next/link": join(stubs, "link.jsx"),
    "next/image": join(stubs, "image.jsx"),
  },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
  plugins: [
    {
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /description-action$/ }, () => ({ path: join(stubs, "description-action.js") }))
        for (const [f, out] of oldFiles) {
          const re = new RegExp(f.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + "$")
          b.onResolve({ filter: re }, () => ({ path: out }))
        }
        if (oldClient) b.onResolve({ filter: /app\/app\/products\/products-client$/ }, () => ({ path: oldClient }))
      },
    },
  ],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const css = await appCss(root)
const inter = interFaces(root).replace(/url\(file:\/\//g, "url(http://probe.test/__file")

const html = `<!doctype html><html class="capacitor"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
const p = await browser.newPage()
const errors = []
p.on("pageerror", (e) => errors.push(e.message))
await p.setRequestInterception(true)
p.on("request", (r) => {
  const u = r.url()
  if (u.startsWith("data:")) return r.continue()
  if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
  if (u.startsWith("http://probe.test/app")) return r.respond({ status: 200, contentType: "text/html", body: html })
  return r.respond({ status: 404, contentType: "application/json", body: "{}" })
})
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
const cdp = await p.createCDPSession()
await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }] })
await p.goto("http://probe.test/app/products")
await sleep(1200)
if (errors.length) fail(`The page threw: ${errors[0]}`)
const tap = async (sel) => {
  const c = await p.$eval(sel, (el) => {
    const b = el.getBoundingClientRect()
    return { x: b.left + Math.min(b.width / 2, 80), y: b.top + b.height / 2 }
  })
  await p.touchscreen.tap(c.x, c.y)
}
/* Every frame for `ms`, what `read` returns (a function body run in the page). */
const film = (read, ms) =>
  p.evaluate(
    (src, ms) =>
      new Promise((done) => {
        const read = new Function(src)
        const out = []
        const t0 = performance.now()
        const tick = () => {
          out.push(read())
          if (performance.now() - t0 < ms) requestAnimationFrame(tick)
          else done(out)
        }
        requestAnimationFrame(tick)
      }),
    read,
    ms,
  )

console.log("PRODUCTS AT 390, TOUCH, IN THE NATIVE SHELL'S CLASSES\n")

/* ── THE TAP ──────────────────────────────────────────────────────────── */
{
  const { nodeId: doc } = (await cdp.send("DOM.getDocument")).root
  await cdp.send("CSS.enable")
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: doc, selector: "[data-new-product]" })
  const look = () => p.$eval("[data-new-product]", (el) => {
    const cs = getComputedStyle(el)
    return { opacity: cs.opacity, bg: cs.backgroundColor, shadow: cs.boxShadow !== "none", props: cs.transitionProperty, duration: cs.transitionDuration }
  })
  const rest = await look()
  await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["hover"] })
  await sleep(250)
  const hovered = await look()
  await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["hover", "active"] })
  /* The first frame of the press: still the resting colour, which is what easing means. */
  const pressing = await look()
  await sleep(250)
  const pressed = await look()
  await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] })
  console.log(`  Add product at rest ${JSON.stringify(rest)}\n  hovered (a finger left on it) ${JSON.stringify(hovered)}\n  pressed ${JSON.stringify(pressed)}`)
  expect(pressed.opacity === "1", "a press on Add does not dim it (no 72% wash over the violet)", pressed.opacity)
  expect(hovered.bg === rest.bg && hovered.shadow === rest.shadow, "a hover left behind by a tap changes nothing on a touch screen", { rest: rest.bg, hovered: hovered.bg })
  expect(pressed.bg !== rest.bg && pressed.bg === "rgb(124, 58, 237)", "a press is one shade deeper (#7c3aed), not two", pressed.bg)
  expect(pressed.shadow, "and keeps its shadow (no touch rule strips it)", pressed.shadow)
  expect(/background-color/.test(pressed.props) && !/^0s/.test(pressed.duration) && pressing.bg === rest.bg, "the colour eases, it does not snap", { props: pressed.props, duration: pressed.duration, firstFrame: pressing.bg })
}

/* ── THE ENDS ─────────────────────────────────────────────────────────── */
{
  const ends = await p.evaluate(() => {
    const pane = document.querySelector(".orders-pane")
    const now = getComputedStyle(pane).overscrollBehaviorY
    const x = getComputedStyle(pane).overscrollBehaviorX
    pane.removeAttribute("data-elastic-pane")
    const without = getComputedStyle(pane).overscrollBehaviorY
    pane.setAttribute("data-elastic-pane", "")
    const shell = getComputedStyle(document.querySelector(".app-content-scroll")).overscrollBehaviorY
    return { now, x, without, shell, range: pane.scrollHeight - pane.clientHeight }
  })
  console.log(`  the list's scroller: overscroll-behavior-y ${ends.now} (x ${ends.x}); without data-elastic-pane ${ends.without}; the shell's scroller ${ends.shell}`)
  expect(ends.without === "none", "before: the list's scroller refused its rubber band (none)", ends.without)
  expect(ends.now === "contain" && ends.x === "none", "now: it keeps the band and still never chains (contain), sideways stays none", ends)
}

if (process.env.SHOTS) await p.screenshot({ path: join(process.env.SHOTS, "toolbar.png"), clip: { x: 0, y: 60, width: 390, height: 200 } })
/* ── THE FILTER ───────────────────────────────────────────────────────── */
{
  const f = await p.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel)
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const svg = el.querySelector("svg")
      const s = svg.getBoundingClientRect()
      return { w: r.width, h: r.height, radius: cs.borderTopLeftRadius, color: cs.color, icon: Math.round(s.width), stroke: svg.getAttribute("stroke-width"), top: Math.round(r.top) }
    }
    return { search: box("[data-search-open]"), filters: box("[data-product-filters]"), sort: box("[data-sort]") }
  })
  console.log(`  toolbar: search ${JSON.stringify(f.search)}\n           filters ${JSON.stringify(f.filters)}\n           sort ${JSON.stringify(f.sort)}`)
  const same = (a, b) => a.w === b.w && a.h === b.h && a.radius === b.radius && a.color === b.color && a.icon === b.icon && a.top === b.top
  expect(same(f.filters, f.search) && same(f.filters, f.sort), "the filter button is its neighbours' button: size, round, colour, icon size, line", f.filters)
  expect(f.filters.w >= 44 && f.filters.h >= 44, "and a 44px target", f.filters)
}

/* ── THE IMPORT ───────────────────────────────────────────────────────── */
const KB_GUESS = Math.round(844 * 0.5)
/* A glide: every frame moves the same way, and none carries more than a quarter of the whole move (or 60px, for a short one). */
const glides = (ys) => {
  const d = Math.abs(ys[ys.length - 1] - ys[0])
  const sign = Math.sign(ys[ys.length - 1] - ys[0])
  let step = 0
  let back = false
  for (let i = 1; i < ys.length; i++) {
    step = Math.max(step, Math.abs(ys[i] - ys[i - 1]))
    if (sign && Math.sign(ys[i] - ys[i - 1]) === -sign && Math.abs(ys[i] - ys[i - 1]) > 0.5) back = true
  }
  const frames = ys.filter((y, i) => i > 0 && Math.abs(y - ys[i - 1]) > 0.5).length
  return { ok: !back && step <= Math.max(60, d / 4) && (d < 1 || frames >= 6), distance: +d.toFixed(1), step: +step.toFixed(1), frames, back }
}
{
  await tap("[data-new-product]")
  await p.waitForSelector("[data-new-product-chooser] [data-kind]")
  await sleep(700)
  const panelTop = 'const el = document.querySelector("[data-new-product-chooser]").closest("[data-sheet-panel]"); const f = document.querySelector("#product-import-url"); const room = document.querySelector("[data-keyboard-room]"); const clip = /inset\\(([-\\d.]+)px/.exec(getComputedStyle(el).clipPath || \"\"); return { top: +(el.getBoundingClientRect().top + (clip ? Math.max(0, Number(clip[1])) : 0)).toFixed(1), field: f ? +f.getBoundingClientRect().bottom.toFixed(1) : null, fieldTop: f ? +f.getBoundingClientRect().top.toFixed(1) : null, room: room ? +room.getBoundingClientRect().height.toFixed(1) : null, focused: !!f && document.activeElement === f }'
  const before = await p.evaluate(new Function(panelTop))
  const filming = film(panelTop, 700)
  /* The focus, and where the field is laid out, in the tap's own task: what the web view sees when it brings its keyboard. */
  await p.evaluate(() => {
    /* On the window, as the click bubbles out: after React's own handler for it, still inside the tap's task. */
    window.addEventListener("click", () => {
      const f = document.querySelector("#product-import-url")
      window.__atTap = { focused: !!f && document.activeElement === f, field: f ? +f.getBoundingClientRect().bottom.toFixed(1) : null }
    }, { once: true })
  })
  await tap("[data-import-products]")
  const frames = await filming
  const atTap = await p.evaluate(() => window.__atTap)
  const tops = frames.map((f) => f.top)
  let jump = 0
  for (let i = 1; i < tops.length; i++) jump = Math.max(jump, Math.abs(tops[i] - tops[i - 1]))
  const moving = tops.filter((t, i) => i > 0 && Math.abs(t - tops[i - 1]) > 0.5).length
  const end = frames[frames.length - 1]
  console.log(`  Import: the field focused in the tap's own task ${atTap?.focused}, its foot then at ${atTap?.field}px (a ${KB_GUESS}px keyboard starts at ${844 - KB_GUESS}px)`)
  console.log(`  the sheet's top ${before.top} -> ${end.top}px over ${frames.length} frames, ${moving} moving, largest step ${jump.toFixed(1)}px, highest ${Math.min(...tops)}px; room under the form ${end.room}px`)
  expect(atTap?.focused === true, "the Import tap itself puts the focus in the link field (a focus inside the tap: iOS opens its keyboard with the step)", atTap)
  expect(atTap?.field !== null && atTap.field <= 844 - KB_GUESS, "and in that same task the field is laid out above where the keyboard comes: nothing for the web view to pan to", atTap)
  const g = glides(tops)
  expect(g.ok, "the sheet glides to its new height: one way, six frames or more, no frame over a quarter of the move", g)
  expect(Math.min(...tops) >= 16, "and never reaches the status bar's strip", Math.min(...tops))

  /* The keyboard, as ViewportVars publishes it on iOS: the inset and the room left, on <html>. */
  const keyboard = (kb) => p.evaluate((kb) => {
    const r = document.documentElement.style
    if (kb) {
      r.setProperty("--kb-inset", `${kb}px`)
      r.setProperty("--vv-h", `${844 - kb}px`)
    } else {
      r.removeProperty("--kb-inset")
      r.removeProperty("--vv-h")
    }
    window.dispatchEvent(new CustomEvent("storelib:keyboard", { detail: { inset: kb, visibleHeight: 844 - kb } }))
  }, kb)
  for (const kb of [KB_GUESS - 40, KB_GUESS + 60]) {
    await p.evaluate(() => document.querySelector("#product-import-url").focus({ preventScroll: true }))
    await sleep(500)
    const watching = film(panelTop, 700)
    await keyboard(kb)
    const kf = await watching
    const fieldTops = kf.map((f) => f.fieldTop)
    let step = 0
    for (let i = 1; i < fieldTops.length; i++) step = Math.max(step, Math.abs(fieldTops[i] - fieldTops[i - 1]))
    const moved = fieldTops[fieldTops.length - 1] - fieldTops[0]
    const last = kf[kf.length - 1]
    const highest = Math.min(...kf.map((f) => f.top))
    const docMoved = await p.evaluate(() => ({ doc: document.scrollingElement.scrollTop, pane: document.querySelector(".orders-pane").getBoundingClientRect().top }))
    /* What is white between the form's foot and the keys: the room left plus the sheet's own foot. */
    console.log(`  a ${kb}px keyboard: the field's top ${fieldTops[0]} -> ${last.fieldTop}px (moved ${moved.toFixed(1)}px, largest step ${step.toFixed(1)}px), its foot ${last.field}px against the keys at ${844 - kb}px; room left ${last.room}px; sheet top ${kf[0].top} -> ${last.top} (highest ${highest}); document ${JSON.stringify(docMoved)}`)
    expect(last.field <= 844 - kb, `with a ${kb}px keyboard the field ends above the keys`, { field: last.field, keys: 844 - kb })
    if (kb <= KB_GUESS) {
      expect(Math.abs(moved) <= 1, "a keyboard no taller than the guess moves neither the field nor the sheet", { moved: +moved.toFixed(1), sheet: [kf[0].top, last.top] })
      expect(last.room <= KB_GUESS - kb + 1, "and fills the room: what is left is only the guess's margin", { room: last.room, margin: KB_GUESS - kb })
    } else {
      const upOnly = fieldTops.every((t, i) => i === 0 || t <= fieldTops[i - 1] + 0.5)
      expect(upOnly && step <= 40 && last.room === 0, "a taller one lifts the sheet the difference on a curve, the room all used", { moved: +moved.toFixed(1), step: +step.toFixed(1), room: last.room })
    }
    expect(highest >= 16, "the sheet stays below the status bar's strip", highest)
    expect(docMoved.doc === 0, "the page under the sheet does not move", docMoved)
    /* The keyboard goes, and the field lets go: the room closes with it. */
    const closing = film(panelTop, 600)
    await p.evaluate(() => document.activeElement?.blur())
    await keyboard(0)
    const cf = await closing
    const cl = cf[cf.length - 1]
    const cg = glides(cf.map((f) => f.top))
    console.log(`  the keyboard goes: room ${cl.room}px, sheet top ${cf[0].top} -> ${cl.top}px, ${JSON.stringify(cg)}`)
    /* Going down it rides the keys, on the sheet's own 250ms keyboard curve (components/ui/bottom-sheet KEYBOARD_MOVE, unchanged): one way, over many frames. */
    expect(cl.room === 0 && !cg.back && cg.frames >= 10, "when the keyboard goes the room closes with it, the sheet following the keys down over many frames", { room: cl.room, ...cg })
  }
  /* A later tap on the field opens the room again, in the focus's own task and with a glide. */
  {
    const reopening = film(panelTop, 600)
    await tap("#product-import-url")
    const rf = await reopening
    const rl = rf[rf.length - 1]
    const rg = glides(rf.map((f) => f.top))
    console.log(`  a tap on the field again: focused ${rl.focused}, room ${rl.room}px, foot ${rl.field}px, sheet top ${rf[0].top} -> ${rl.top}px, ${JSON.stringify(rg)}`)
    expect(rl.focused && rl.field <= 844 - rl.room && rg.ok, "a tap on the field later opens the room again, gliding, the field above the keys", { field: rl.field, ...rg })
    await p.evaluate(() => document.activeElement?.blur())
    await sleep(500)
  }
  if (process.env.SHOTS) await p.screenshot({ path: join(process.env.SHOTS, "import-sheet.png") })
  /* Back to the kinds glides too. */
  const back0 = await p.evaluate(new Function(panelTop))
  const backFilm = film(panelTop, 600)
  await p.evaluate(() => [...document.querySelectorAll("[data-link-import] button")].find((b) => b.textContent.trim() === "Back").click())
  const bf = await backFilm
  const bg = glides(bf.map((f) => f.top))
  console.log(`  Back to the kinds: top ${back0.top} -> ${bf[bf.length - 1].top}px, ${JSON.stringify(bg)}`)
  expect(bg.ok, "and Back to the kinds glides the same way", bg)
  await sleep(400)
}

/* ── THE WAY BACK ─────────────────────────────────────────────────────── */
{
  /* Close the sheet by its scrim, then open a product from the middle of a scrolled list. */
  await p.evaluate(() => {
    const scrim = document.querySelector("[data-app-sheet='open'] > div")
    scrim?.click()
  })
  await sleep(700)
  await p.evaluate(() => {
    document.querySelector(".orders-pane").scrollTop = 420
  })
  await sleep(300)
  const id = await p.evaluate(() => {
    const row = [...document.querySelectorAll("ul[data-list] > [data-row]:not([hidden])")].find((r) => {
      const b = r.getBoundingClientRect()
      return b.height > 0 && b.top > 300 && b.bottom < innerHeight - 160
    })
    row.setAttribute("data-probe-pick", "")
    return row.dataset.row
  })
  const rowTop0 = await p.$eval("[data-probe-pick]", (r) => r.getBoundingClientRect().top)
  await tap("[data-probe-pick] a[data-row-link]")
  await p.waitForFunction(() => window.__path?.startsWith("/app/products/p"), { timeout: 8000 })
  await sleep(1400)
  const watch = `const tops = [...document.querySelectorAll('[data-row="${id}"]')].filter((r) => r.getClientRects().length && !r.closest("[hidden]") && getComputedStyle(r).visibility !== "hidden").map((r) => +r.getBoundingClientRect().top.toFixed(1)); const pane = document.querySelector(".orders-pane"); return { tops, pane: pane ? pane.scrollTop : null, path: window.__path }`
  const dropping = film(watch, 1600)
  await tap("[data-editor-bar] [data-leave-button]")
  const frames = await dropping
  const seen = frames.filter((f) => f.tops.length)
  const all = seen.flatMap((f) => f.tops)
  const spread = all.length ? Math.max(...all) - Math.min(...all) : null
  const blank = frames.findIndex((f) => f.tops.length) === -1 ? frames.length : frames.slice(frames.findIndex((f) => f.tops.length)).filter((f) => !f.tops.length).length
  const end = frames[frames.length - 1]
  console.log(`  back from ${id}: ${frames.length} frames, the row drawn under the editor on ${seen.length}, its top ${all.length ? Math.min(...all) : "-"} to ${all.length ? Math.max(...all) : "-"}px (it sat at ${rowTop0.toFixed(1)}px before), frames with it gone after it appeared ${blank}; the list's scroll ${end.pane}`)
  expect(seen.length > 0 && spread !== null && spread <= 1, "the list under the dropping editor never moves: the row stays where it was", { spread, before: +rowTop0.toFixed(1) })
  expect(blank === 0, "and never blanks: once drawn under the editor it stays drawn", blank)
  expect(end.path === "/app/products" && end.pane === 420, "the list is back at the scroll it was left at", { path: end.path, scroll: end.pane })
}

/* ── THE WAY BACK AFTER A SAVE ───────────────────────────────────────── */
{
  /* A product from the middle of the list, its name changed and saved, then Back. */
  await p.evaluate(() => { document.querySelector(".orders-pane").scrollTop = 420 })
  await sleep(300)
  const id = await p.evaluate(() => {
    document.querySelectorAll("[data-probe-pick]").forEach((n) => n.removeAttribute("data-probe-pick"))
    const row = [...document.querySelectorAll("ul[data-list] > [data-row]:not([hidden])")].find((r) => {
      const b = r.getBoundingClientRect()
      return b.height > 0 && b.top > 300 && b.bottom < innerHeight - 160
    })
    row.setAttribute("data-probe-pick", "")
    window.__editingId = row.dataset.row
    window.__fixtureNoVideo = true
    return row.dataset.row
  })
  const rowTop0 = await p.$eval("[data-probe-pick]", (r) => r.getBoundingClientRect().top)
  await tap("[data-probe-pick] a[data-row-link]")
  await p.waitForFunction((id) => window.__path === `/app/products/${id}`, { timeout: 8000 }, id)
  await sleep(1400)
  const NEW_TITLE = "Renamed in the editor"
  const typed = await p.evaluate((title) => {
    const input = [...document.querySelectorAll("input")].find((i) => /^Lightroom portrait presets /.test(i.value))
    if (!input) return null
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
    set.call(input, title)
    input.dispatchEvent(new Event("input", { bubbles: true }))
    return input.value
  }, NEW_TITLE)
  await sleep(200)
  await tap("[data-save-button]")
  /* Saved: the button shows its check, or at least is idle again. */
  for (let i = 0; i < 60; i++) {
    await sleep(100)
    if (await p.evaluate(() => !document.querySelector("[data-save-button][aria-busy=true]"))) break
  }
  await sleep(800)
  const copyState = await p.evaluate((id) => {
    const rows = [...document.querySelectorAll(`[data-layer-still] [data-row="${id}"] [data-name]`)].map((n) => n.textContent)
    return rows
  }, id)
  const watch = `const r = [...document.querySelectorAll('[data-row="${id}"]')].filter((r) => r.getClientRects().length && getComputedStyle(r).visibility !== "hidden").map((r) => ({ top: +r.getBoundingClientRect().top.toFixed(1), name: r.querySelector("[data-name]")?.textContent ?? null, still: !!r.closest("[data-layer-still]") })); const layer = document.querySelector("[data-page-layer]"); return { r, layerY: layer ? new DOMMatrixReadOnly(getComputedStyle(layer).transform).m42 : null, path: window.__path, t: performance.now() }`
  const t0 = await p.evaluate(() => performance.now())
  const dropping = film(watch, 1800)
  await tap("[data-editor-bar] [data-leave-button]")
  const frames = await dropping
  const firstMove = frames.find((f) => f.layerY !== null && f.layerY > 2)
  const seen = frames.filter((f) => f.r.length)
  /* The copy's frames: the harness's own list reads its fixed shelf whatever is saved (no server), so the list that replaces the copy keeps the old name here; in the app the save's refresh brings the new one. */
  const names = [...new Set(seen.flatMap((f) => f.r.filter((x) => x.still).map((x) => x.name)))]
  const copyFrames = seen.filter((f) => f.r.some((x) => x.still)).length
  const tops = seen.flatMap((f) => f.r.map((x) => x.top))
  const end = frames[frames.length - 1]
  console.log(`  after a save (title typed ${JSON.stringify(typed)}; the copy's row then reads ${JSON.stringify(copyState)}): the editor moved ${firstMove ? (firstMove.t - t0).toFixed(0) + "ms" : "never"} after the press; the row under it on ${seen.length} frames, on the copy for ${copyFrames} frames reading ${JSON.stringify(names)}, top ${Math.min(...tops)} to ${Math.max(...tops)} (it sat at ${rowTop0.toFixed(1)}); back on ${end.path}`)
  expect(typed === NEW_TITLE, "the editor took the new name", typed)
  expect(copyState.length > 0 && copyState.every((n) => n === NEW_TITLE), "the save corrected the row in the list's kept copy", copyState)
  expect(firstMove && firstMove.t - t0 <= 200, "the way back after a save starts at once, over the kept list (it used to wait for the list to be drawn again)", firstMove ? +(firstMove.t - t0).toFixed(0) : null)
  expect(copyFrames > 0 && names.length === 1 && names[0] === NEW_TITLE, "and the row under the dropping editor already reads the new name", names)
  expect(tops.length > 0 && Math.max(...tops) - Math.min(...tops) <= 1, "and the row does not move while the editor drops", { min: Math.min(...tops), max: Math.max(...tops) })
}

if (errors.length) expect(false, "nothing threw", errors)
await browser.close()
console.log(broken ? `\n${broken} check(s) failed\n` : "\nall checks passed\n")
process.exit(broken ? 1 : 0)
