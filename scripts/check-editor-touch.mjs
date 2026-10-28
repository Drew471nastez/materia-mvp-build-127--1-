/**
 * ===========================================================================
 *  A SWIPE IN THE EDITOR SCROLLS WHAT IS UNDER THE FINGER (round 1026)
 * ===========================================================================
 * The owner, on phones (the iOS and Android apps, mobile Safari and Chrome)
 * and now and then on a desktop: "swiping up and down does not scroll" in
 * the sheet's sections list, in a block's settings, and in the canvas, on a
 * Storelib theme and on an imported one.
 *
 * The real editor (scripts/editor-probe-harness.mjs) in a headless Chromium
 * with a touch screen (isMobile, hasTouch), on a Storelib theme and on the
 * imported Materia fixture (scripts/canvas-probe-kit.mjs), at an iPhone's
 * size and an Android phone's. Every swipe is CDP touch events, a thumb's
 * 240px up over ten moves 16ms apart, and what is measured is how far the
 * scrollers under the finger moved (every scrollable box between the finger
 * and the page, summed; in the canvas the page itself, in its frame).
 *
 * Swiped before and after what people do: open the sheet, take it to full,
 * open a section, open a block, drag a row by its grip, a drag the system
 * cancels, close and open the sheet, a press held on a row, a setting typed
 * into, a field focused and left, another page, the cart drawer of the
 * canvas opened and closed. And with the native shell's engine, where
 * `overscroll-behavior` does nothing (WKWebView before iOS 16):
 * CapacitorBounceGuard mounted in the same page with html.capacitor, so a
 * swipe the guard would cancel shows up as a swipe that moved nothing.
 *
 *   npx tsx scripts/check-editor-touch.mjs
 *   EDITOR_BUNDLE=<file>   the bundle to measure (the before/after table is two bundles)
 *   ONLY=<regexp over "kind device step">   SHOTS=<dir>   JSON=<file>   BUDGET=0 (report only)
 *
 * Budget: every swipe moves its scroller at least MIN_PX.
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

process.env.PROBE_CSS = process.env.PROBE_CSS ?? "source"
const { bundle, css: harnessCss, root } = await import("./editor-probe-harness.mjs")
const { openEditor, importedTheme, sleep } = await import("./canvas-probe-kit.mjs")
const css = process.env.CSS_FILE ? readFileSync(process.env.CSS_FILE, "utf8") : harnessCss

const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null
const BUDGET = process.env.BUDGET !== "0"
const SHOTS = process.env.SHOTS ?? ""
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const MIN_PX = 60
const DEVICES = { iphone: { width: 390, height: 844 }, android: { width: 412, height: 915 } }
const KINDS = (process.env.KINDS ?? "native,imported").split(",")

/*
  THE NATIVE SHELL'S GUARD, IN THE SAME PAGE. The editor bundle does not
  carry the app's layout, so CapacitorBounceGuard is bundled on its own and
  mounted beside the editor, with html.capacitor and an engine that does not
  know overscroll-behavior (iOS 14 and 15), which is when it listens.
*/
const guardBundle = (() => {
  const dir = mkdtempSync(join(tmpdir(), "storelib-guard-"))
  const src = `import React from "react"\nimport { createRoot } from "react-dom/client"\nimport { CapacitorBounceGuard } from "@/components/platform/capacitor-bounce-guard"\nconst el = document.createElement("div"); document.body.appendChild(el); createRoot(el).render(React.createElement(CapacitorBounceGuard))\n`
  const out = join(dir, "guard.js")
  /* From stdin, so the imports resolve from the repository (esbuild resolves stdin from the working directory). */
  execFileSync("npx", ["--no-install", "esbuild", "--bundle", "--loader=tsx", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${out}`, '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`], { input: src, cwd: root, stdio: ["pipe", "ignore", "inherit"] })
  return readFileSync(out, "utf8")
})()
const NATIVE_SHELL = `if (window.top === window) {
  (function () { var s = CSS.supports.bind(CSS); CSS.supports = function (a, b) { if (/overscroll-behavior/.test(String(a))) return false; return s.apply(null, arguments) } })();
  window.__guardSrc = ${JSON.stringify(guardBundle)};
  addEventListener("DOMContentLoaded", function () { document.documentElement.classList.add("capacitor"); setTimeout(function () { (0, eval)(window.__guardSrc) }, 0) });
}`

/*
  WHO TOOK THE SWIPE. Every touchmove is looked at once every listener has
  had it (a listener on the window, added last, in the bubbling phase) and
  counted as cancelled or not; every scroll says what scrolled. Printed for
  a swipe that moved nothing, so a failure names its cause.
*/
const RECORDER = String.raw`
  (function () {
    var R = window.__touchLog = { moves: 0, cancelled: 0, asked: 0, by: {}, scrolled: {} };
    var name = function (n) { if (!n || n === document) return "document"; if (n.nodeType !== 1) return String(n.nodeName); return n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + (n.hasAttribute("data-sheet-scroll") ? "[data-sheet-scroll]" : "") + "." + String(n.className && n.className.baseVal !== undefined ? n.className.baseVal : n.className).split(" ").slice(0, 3).join("."); };
    addEventListener("DOMContentLoaded", function () {
      var pd = Event.prototype.preventDefault;
      Event.prototype.preventDefault = function () { if (this.type === "touchmove") { R.asked++; var st = (new Error().stack || "").split("\n").slice(2, 4).join(" < ").replace(/https?:[^ )]+\//g, ""); R.by[st] = (R.by[st] || 0) + 1; } return pd.call(this); };
      addEventListener("touchmove", function (e) { R.moves++; if (e.defaultPrevented) R.cancelled++; }, { passive: true });
      addEventListener("scroll", function (e) { var k = name(e.target); R.scrolled[k] = (R.scrolled[k] || 0) + 1; if (e.target && e.target.nodeType === 1) { (R.tops = R.tops || []).push(Math.round(e.target.scrollTop) + (e.target.hasAttribute("data-tp") ? "*" : "")); if (R.tops.length > 40) R.tops.shift(); } }, { passive: true, capture: true });
    });
  })();
`

let broken = 0
const rows = []

async function run(kind, device) {
  const { width, height } = DEVICES[device]
  const compat = kind === "imported" ? await importedTheme() : undefined
  const ed = await openEditor({ kind, bundle, css, compat, width, height, touch: true, settle: 3000, init: RECORDER + (process.env.SHELL === "0" ? "" : NATIVE_SHELL) })
  const { page } = ed
  const cdp = await page.createCDPSession()
  const T = (type, touchPoints) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints })
  const swipe = async (x, y, dy, { steps = 10, end = "touchEnd", hold = 0 } = {}) => {
    await T("touchStart", [{ x, y }])
    if (hold) await sleep(hold)
    for (let k = 1; k <= steps; k++) { await T("touchMove", [{ x, y: Math.round(y + (dy * k) / steps) }]); await sleep(16) }
    await T(end, [])
  }
  const tap = async (x, y, after = 700) => { await T("touchStart", [{ x, y }]); await sleep(50); await T("touchEnd", []); await sleep(after) }
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${kind}-${device}-${name}.png`) }) }

  /* The sheet the builder keeps on screen, and its grab bar. */
  const sheetBox = () => ed.js(() => {
    const s = [...document.querySelectorAll("[data-mobile-bottom-sheet]")].map((n) => ({ n, r: n.getBoundingClientRect() })).filter((x) => x.r.top < innerHeight - 1 && getComputedStyle(x.n).opacity !== "0").sort((a, b) => a.r.top - b.r.top)[0]
    if (!s) return null
    const h = s.n.firstElementChild.getBoundingClientRect()
    return { top: Math.round(s.r.top), handle: { x: Math.round(h.left + h.width / 2), y: Math.round(h.top + h.height / 2) } }
  })
  const peekTop = (await sheetBox())?.top ?? height
  const toStop = async (want) => {
    for (let i = 0; i < 4; i++) {
      const b = await sheetBox()
      if (!b) return
      const at = b.top >= peekTop - 4 ? "peek" : b.top < height * 0.3 ? "full" : "half"
      if (at === want) return
      if (want === "peek") { await swipe(b.handle.x, b.handle.y, height - b.handle.y - 10, { steps: 8 }); await sleep(700); continue }
      await tap(b.handle.x, b.handle.y, 800)
    }
  }

  /*
    THE SWIPE. In the sheet: a point in the middle of what is visible of its
    content, every scroller under it put to its top first. In the canvas: a
    point above the sheet, the page put back to its top.
  */
  /* The canvas's page: the editor's own #wb-preview-root, or the imported theme's document in its frame (sandboxed, so only reachable as a frame). */
  const inCanvas = async (fn, arg) => {
    const f = kind === "imported" ? await ed.front() : page.mainFrame()
    return f ? f.evaluate(fn, arg) : null
  }
  const CANVAS_TOP = () => { const se = document.getElementById("wb-preview-root") ?? document.scrollingElement; return se ? se.scrollTop : 0 }
  const measure = async (where, from = "") => {
    if (where === "canvas") await inCanvas(() => { const se = document.getElementById("wb-preview-root") ?? document.scrollingElement; if (se) se.scrollTop = 0 })
    const pt = await ed.js((where, from) => {
      document.querySelectorAll("[data-tp]").forEach((n) => n.removeAttribute("data-tp"))
      const frame = document.querySelector("[data-compat-frame='front']")
      if (where === "canvas") {
        const host = frame ?? document.getElementById("wb-preview-root")
        if (!host) return null
        const r = host.getBoundingClientRect()
        const sheet = [...document.querySelectorAll("[data-mobile-bottom-sheet]")].map((n) => n.getBoundingClientRect().top).filter((t) => t < innerHeight - 1).sort((a, b) => a - b)[0] ?? innerHeight
        const bottom = Math.min(r.bottom, sheet) - 20
        return { x: Math.round(r.left + r.width / 2), y: Math.round(Math.max(r.top + 60, bottom - 40)), room: Math.round(bottom - r.top) }
      }
      const s = [...document.querySelectorAll("[data-mobile-bottom-sheet]")].map((n) => ({ n, r: n.getBoundingClientRect() })).filter((x) => x.r.top < innerHeight - 1 && getComputedStyle(x.n).opacity !== "0").sort((a, b) => a.r.top - b.r.top)[0]
      if (!s) return null
      /* A point in the middle of what shows of the sheet's content, its nearest scroller the one measured, and not a control that owns its drag (a grip, a slider, a field). */
      const scrollerOf = (el) => { for (let n = el; n && n !== s.n; n = n.parentElement) if (/(auto|scroll|overlay)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1) return n; return null }
      const owns = (el) => { for (let n = el; n && n !== s.n; n = n.parentElement) { if (n.hasAttribute?.("data-sheet-no-drag") || getComputedStyle(n).touchAction === "none" || n.matches?.("input[type=range],[role=slider],input,textarea,select,[contenteditable]")) return true } return false }
      const top = Math.max(s.r.top + 110, 0), bottom = innerHeight - 10
      /* FROM AN ICON: the swipe starts on a drawing (an <svg>'s path), the chevron of a select, a row's icon. */
      /* Every scroller in the sheet to its top first, so nothing moves under the point once it is chosen. */
      for (const n of s.n.querySelectorAll("*")) if (n.scrollTop) n.scrollTop = 0
      /* FROM A SLIDER'S ROW: a control that keeps its sideways drag and leaves an up and down one to the panel (touch-action: pan-y). */
      if (from === "slider") {
        for (const v of s.n.querySelectorAll("[data-slider-row]")) {
          /* Brought to the upper middle of what shows of the panel, so the swipe has room below it. */
          const own = scrollerOf(v)
          if (own) { const vr = v.getBoundingClientRect(), orr = own.getBoundingClientRect(); own.scrollTop += vr.top - (Math.max(orr.top, top) + 80) }
          const r = v.getBoundingClientRect()
          if (r.width < 6 || r.top < top || r.bottom > bottom) continue
          const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2)
          const el = document.elementFromPoint(x, y)
          const sc = el && v.contains(el) ? scrollerOf(v) : null
          if (!sc) continue
          sc.setAttribute("data-tp", "")
          const sr = sc.getBoundingClientRect()
          return { x, y, room: Math.round(Math.min(sr.bottom, innerHeight) - Math.max(sr.top, 0)), on: "slider row", sh: sc.scrollHeight - sc.clientHeight }
        }
        return { none: true }
      }
      if (from === "icon") {
        for (const v of s.n.querySelectorAll("svg")) {
          const r = v.getBoundingClientRect()
          if (r.width < 6 || r.top < top || r.bottom > bottom) continue
          const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2)
          const el = document.elementFromPoint(x, y)
          if (!el || el.namespaceURI !== "http://www.w3.org/2000/svg") continue
          const sc = scrollerOf(el.closest("svg").parentElement)
          if (!sc || owns(el)) continue
          sc.setAttribute("data-tp", "")
          const sr = sc.getBoundingClientRect()
          return { x, y, room: Math.round(Math.min(sr.bottom, innerHeight) - Math.max(sr.top, 0)), on: el.tagName.toLowerCase(), sh: sc.scrollHeight - sc.clientHeight }
        }
        return { none: true }
      }
      for (const fy of [0.6, 0.5, 0.7, 0.4, 0.8, 0.3, 0.9]) for (const fx of [0.5, 0.65, 0.35]) {
        const x = Math.round(innerWidth * fx), y = Math.round(top + (bottom - top) * fy)
        const el = document.elementFromPoint(x, y)
        const sc = el && s.n.contains(el) ? scrollerOf(el) : null
        if (!sc || owns(el)) continue
        const r = sc.getBoundingClientRect()
        sc.setAttribute("data-tp", "")
        return { x, y, room: Math.round(Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)), on: `${el.tagName.toLowerCase()}`, sh: sc.scrollHeight - sc.clientHeight }
      }
      return { none: true }
    }, where, from)
    if (!pt || pt.none) return { moved: null, note: "nothing to scroll" }
    await sleep(150)
    await ed.js(() => { const R = window.__touchLog; if (R) { R.moves = 0; R.cancelled = 0; R.asked = 0; R.by = {}; R.scrolled = {}; R.tops = [] } })
    if (where === "canvas") await inCanvas(() => { const R = window.__touchLog; if (R) { R.moves = 0; R.cancelled = 0; R.asked = 0; R.by = {}; R.scrolled = {}; R.tops = [] } })
    const read = async () => where === "canvas" ? inCanvas(CANVAS_TOP) : ed.js(() => {
      let sum = 0
      for (let n = document.querySelector("[data-tp]"); n; n = n.parentElement) sum += n.scrollTop || 0
      return sum
    })
    const before = await read()
    const dy = -Math.min(240, Math.max(120, pt.room - 80))
    await swipe(pt.x, pt.y + (dy < 0 ? 0 : 0), dy)
    await sleep(450)
    const after = await read()
    const log = await ed.js(() => window.__touchLog)
    if (where === "canvas" && kind === "imported") { const inner = await inCanvas(() => window.__touchLog); if (log && inner) { log.moves += inner.moves; log.cancelled += inner.cancelled; log.asked += inner.asked; Object.assign(log.by, inner.by); Object.assign(log.scrolled, Object.fromEntries(Object.entries(inner.scrolled).map(([k, v]) => [`frame ${k}`, v]))) } }
    return { log, moved: Math.round(after - before), at: `${pt.x},${pt.y}${pt.on ? ` on ${pt.on}` : ""}`, dy }
  }

  const record = async (step, where, from = "") => {
    if (ONLY && !ONLY.test(`${kind} ${device} ${step}`)) return
    const r = await measure(where, from)
    /* Moved, and nothing of the editor's asked to cancel it: a cancel the test browser ignored (its touch moves can arrive uncancelable) is one a phone obeys. */
    const ok = r.moved === null || (r.moved >= MIN_PX && !(r.log?.asked > 0))
    const row = { kind, device, step, where, moved: r.moved, asked: r.log?.asked ?? 0, at: r.at ?? r.note, ok }
    rows.push(row)
    console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${kind.padEnd(8)} ${device.padEnd(7)} ${step.padEnd(30)} ${where.padEnd(6)} moved ${String(r.moved).padStart(5)}px  cancels ${String(row.asked).padStart(2)}   (${row.at})`)
    if (!ok && r.log) console.log(`          touchmoves ${r.log.moves}, cancelled ${r.log.cancelled}; cancelled by ${JSON.stringify(r.log.by).slice(0, 400)}; scrolled ${JSON.stringify(r.log.scrolled).slice(0, 300)} tops ${(r.log.tops ?? []).join(" ")}`)
    if (!ok && BUDGET) broken++
    await shot(step.replace(/\W+/g, "-"))
  }

  /* Taps on what the editor shows, found by what they are. */
  const center = (fn, arg) => ed.js(fn, arg)
  const tapOn = async (fn, arg, after) => { const p = await center(fn, arg); if (!p) return false; await tap(p.x, p.y, after); return true }
  const rowOf = (name) => tapOn((name) => {
    const r = [...document.querySelectorAll("[data-mobile-bottom-sheet] [data-section-row]")].find((n) => n.textContent.includes(name) && n.getClientRects().length)
    if (!r) return null
    const b = r.getBoundingClientRect()
    return { x: Math.round(b.left + b.width * 0.5), y: Math.round(b.top + b.height / 2) }
  }, name)
  const back = () => tapOn(() => {
    const b = [...document.querySelectorAll("[data-mobile-bottom-sheet] button")].find((n) => /^back$/i.test(n.getAttribute("aria-label") ?? "") && n.getClientRects().length && n.getBoundingClientRect().top < innerHeight)
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })
  const toList = async () => {
    for (let i = 0; i < 4; i++) {
      const n = await ed.js(() => [...document.querySelectorAll("[data-mobile-bottom-sheet] [data-section-row]")].filter((r) => { const b = r.getBoundingClientRect(); return b.height && b.top > 0 && b.top < innerHeight - 40 }).length)
      if (n >= 3) return
      if (!(await back())) return
      await sleep(600)
    }
  }
  const gripAt = () => center(() => {
    const g = [...document.querySelectorAll("[data-mobile-bottom-sheet] [aria-label^='Drag ']")].filter((n) => { const r = n.getBoundingClientRect(); return r.height && r.top > 0 && r.bottom < innerHeight - 40 })[1]
    if (!g) return null
    const r = g.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })
  const tab = (label) => tapOn((label) => {
    const b = [...document.querySelectorAll("[data-mobile-bottom-sheet] button, [data-mobile-bottom-sheet] [role=tab]")].find((n) => n.textContent.trim() === label && n.getClientRects().length && n.getBoundingClientRect().top < innerHeight)
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }, label)

  try {
    const SECTION = kind === "imported" ? (await ed.js(() => [...document.querySelectorAll("[data-mobile-bottom-sheet] [data-section-row]")].map((n) => n.textContent.trim()).filter(Boolean)[2] ?? "")) : "Product Grid"
    await record("landing", "canvas")
    await toStop("half")
    await record("sheet at half", "sheet")
    await record("sheet at half, from an icon", "sheet", "icon")
    await toStop("full")
    await record("sheet at full", "sheet")
    await record("sheet at full, from an icon", "sheet", "icon")
    await toStop("half")

    /* A section opened, then one of its blocks. */
    /* At full, so the next touch after the row's tap is the swipe itself: the row the tap began on is gone by its touchend. */
    await toStop("full")
    await rowOf(SECTION.slice(0, 12))
    await sleep(500)
    await record("section settings, from a slider", "sheet", "slider")
    await record("section settings", "sheet")
    await record("section settings, from an icon", "sheet", "icon")
    /* A field focused, typed into and left. */
    const field = await center(() => {
      const f = [...document.querySelectorAll("[data-mobile-bottom-sheet] input[type=text], [data-mobile-bottom-sheet] input:not([type]), [data-mobile-bottom-sheet] textarea")].find((n) => { const r = n.getBoundingClientRect(); return r.height && r.top > 80 && r.bottom < innerHeight - 40 })
      if (!f) return null
      const r = f.getBoundingClientRect()
      return { x: Math.round(r.left + 20), y: Math.round(r.top + r.height / 2) }
    })
    if (field) {
      await tap(field.x, field.y, 400)
      await page.keyboard.type(" x", { delay: 30 })
      await sleep(400)
      await record("typing in a field", "sheet")
      await ed.js(() => (document.activeElement)?.blur?.())
      await sleep(500)
      await record("field left", "sheet")
    }
    await toList()
    await toStop("half")
    const expand = await tapOn(() => {
      const b = [...document.querySelectorAll("[data-mobile-bottom-sheet] [data-section-expand]")].find((n) => n.getClientRects().length && n.getBoundingClientRect().top > 0 && n.getBoundingClientRect().bottom < innerHeight - 60)
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    }, undefined, 600)
    if (expand) {
      await record("blocks shown", "sheet")
      const blk = await tapOn(() => {
        const b = [...document.querySelectorAll("[data-mobile-bottom-sheet] [data-tree-block]")].find((n) => n.getClientRects().length && n.getBoundingClientRect().top > 0 && n.getBoundingClientRect().bottom < innerHeight - 60)
        if (!b) return null
        const r = b.getBoundingClientRect()
        return { x: Math.round(r.left + r.width * 0.55), y: Math.round(r.top + r.height / 2) }
      }, undefined, 700)
      if (blk) {
        await toStop("full")
        await record("block settings", "sheet")
        await record("block settings, from an icon", "sheet", "icon")
        await record("block settings, from a slider", "sheet", "slider")
        await back()
        await sleep(600)
      }
    }

    /* A row dragged by its grip and let go, then a drag the system cancels. */
    await toStop("half")
    await toList()
    let g = await gripAt()
    if (!g) { console.log("  (no grip)"); await shot("no-grip") }
    if (g) {
      await swipe(g.x, g.y, 50, { steps: 6, hold: 80 })
      await sleep(700)
      await record("after dragging a row", "sheet")
      g = await gripAt()
      if (g) {
        await swipe(g.x, g.y, 50, { steps: 6, hold: 80, end: "touchCancel" })
        await sleep(700)
        await record("after a cancelled drag", "sheet")
      }
    }
    /* A press held on a row (its menu on a phone), let go without moving. */
    const held = await center(() => {
      const r = [...document.querySelectorAll("[data-mobile-bottom-sheet] [data-section-row]")].filter((n) => n.getClientRects().length && n.getBoundingClientRect().top > 0 && n.getBoundingClientRect().bottom < innerHeight - 40)[1]
      if (!r) return null
      const b = r.getBoundingClientRect()
      return { x: Math.round(b.left + b.width * 0.5), y: Math.round(b.top + b.height / 2) }
    })
    if (held) {
      await T("touchStart", [{ x: held.x, y: held.y }])
      await sleep(800)
      await T("touchEnd", [])
      await sleep(500)
      await page.keyboard.press("Escape")
      await sleep(500)
      await record("after a long press", "sheet")
    }

    /* The sheet closed and opened again. */
    await toStop("peek")
    await record("sheet closed, after the drags", "canvas")
    await toStop("half")
    await record("sheet opened again", "sheet")

    /* Another page, from the page menu at the head of the list. */
    await toList()
    const opened = await tapOn(() => {
      const b = [...document.querySelectorAll("[data-mobile-bottom-sheet] button")].find((n) => /home/i.test(n.textContent.trim()) && n.textContent.trim().length < 30 && n.getClientRects().length && n.getBoundingClientRect().top > 0 && n.getBoundingClientRect().bottom < innerHeight)
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    }, undefined, 800)
    const other = opened && (await tapOn(() => {
      const b = [...document.querySelectorAll("[data-page-row]")].find((n) => !/^(home|index|more)$/.test(n.getAttribute("data-page-row")) && !/^product:/.test(n.getAttribute("data-page-row")) && n.getClientRects().length && n.getBoundingClientRect().top > 0 && n.getBoundingClientRect().bottom < innerHeight)
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    }, undefined, 2500))
    if (!other) { console.log("  (no other page)"); await shot("no-page"); await page.keyboard.press("Escape"); await sleep(400) }
    await toStop("half")
    await record(other ? "another page, its list" : "page menu closed", "sheet")
    await toStop("peek")
    await record(other ? "another page" : "page menu closed", "canvas")

    /* The cart drawer in the canvas, opened and closed. */
    await toStop("peek")
    const off = await ed.js(() => { const f = document.querySelector("[data-compat-frame='front']") ?? document.getElementById("wb-preview-root"); const r = f.getBoundingClientRect(); return { left: r.left, top: r.top, frame: f.tagName === "IFRAME" } })
    const cart = await inCanvas(() => {
      const c = [...document.querySelectorAll("a[href*='cart'], button[aria-label*='art' i], [data-cart-toggle], [aria-label='Cart']")].find((n) => n.getClientRects().length && n.getBoundingClientRect().top < 200)
      if (!c) return null
      const r = c.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    if (cart) {
      const at = off.frame ? { x: Math.round(off.left + cart.x), y: Math.round(off.top + cart.y) } : { x: Math.round(cart.x), y: Math.round(cart.y) }
      await tap(at.x, at.y, 1200)
      await shot("cart-open")
      await page.keyboard.press("Escape")
      await inCanvas(() => {
        const close = [...document.querySelectorAll("button[aria-label*='lose' i], [data-drawer-close], [data-cart-close]")].find((n) => n.getClientRects().length)
        close?.click()
      })
      await sleep(1200)
      await record("cart drawer closed", "canvas")
    }
  } finally {
    if (ed.errors.length) console.log(`  page errors: ${ed.errors.slice(0, 3).join(" | ")}`)
    await ed.close()
  }
}

for (const kind of KINDS) for (const device of Object.keys(DEVICES)) {
  if (ONLY && !ONLY.test(`${kind} ${device}`) && !/step/.test(String(ONLY))) {
    /* ONLY may name a step; run the pair if any of it could match. */
  }
  console.log(`\n${kind} on ${device}`)
  await run(kind, device)
}

if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(rows, null, 1))
const fails = rows.filter((r) => !r.ok)
console.log(`\n${rows.length} swipes, ${fails.length} moved less than ${MIN_PX}px`)
if (broken) process.exit(1)
