/**
 * ===========================================================================
 *  THE SIDEBAR'S CONTROLS, AS THEY WERE BEFORE THE REWORK AND AS THEY ARE NOW
 * ===========================================================================
 * "Revert all the things you changed in the sidebar of the website builder
 * editor recently ... Full revert." And: "make sure that the theme settings,
 * the tabs in the sidebar, open smoothly and close smoothly."
 *
 * The real editor (scripts/render-editor-probe.tsx, bundled by
 * scripts/editor-probe-harness.mjs) on a computer at 1280x900 and in the
 * phone's sheet at 390x844. The same drive, every time:
 *
 *   PICTURES    a section's colour scheme (closed and open), a select, a
 *               slider, the image field and Advanced colors, then Theme's
 *               groups, its Colors group and a scheme colour's picker, each
 *               photographed on its own
 *   NO NUMBERS  a scheme's Text colour set to #EEEEEE on white, which is
 *               exactly when the old Colors panel said "Hard to read", and
 *               the sidebar's text searched for a ratio or a warning
 *   GROUPS      a Theme group opened and closed, read every frame: its
 *               height, the top of the group under it, and its content's
 *               opacity; and once more under prefers-reduced-motion
 *   TABS        Sections, Pages and Theme in turn, read every frame: the tab
 *               bar and the panel's scroller must not move, and the panel
 *               must not overflow more than it does once settled
 *   THE PAGE    a number typed beside a slider, and a scheme colour, reach
 *               the canvas
 *
 *   PROBE_CSS=source SHOTS=<dir> node scripts/check-sidebar-revert.mjs
 *       this checkout; its pictures are sidebar-revert-after-*.png
 *   BEFORE_TREE=<dir> ...the same...
 *       a copy of the tree from before the rework, made with
 *         git archive -o before.tar 96949910 && tar -xf before.tar -C <dir>
 *         ln -s "$PWD/node_modules" <dir>/node_modules
 *       (96949910 is the rework's parent; its sidebar files are e5fdbe55's).
 *       Runs this same file there first (sidebar-revert-before-*), then
 *       here, then compares every pair pixel by pixel and writes each pair
 *       side by side as sidebar-revert-pair-*.png.
 *   EDITOR_BUNDLE, BEFORE_BUNDLE   reuse a bundle of either editor
 *   PROBE_COMPARE_ONLY=1           compare the pictures already in SHOTS
 *   PROBE_FULL=1                   the whole screen beside every picture
 */
import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const LABEL = process.env.PROBE_LABEL ?? "after"
const SHOTS = process.env.SHOTS ?? mkdtempSync(join(tmpdir(), "sidebar-revert-shots-"))
mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

/* ── The other tree first, with this same file, so both drives are one drive ── */
/* PROBE_COMPARE_ONLY=1: the pictures and numbers already in SHOTS, compared again without taking them. */
const COMPARE_ONLY = !!process.env.PROBE_COMPARE_ONLY
if (process.env.BEFORE_TREE && LABEL === "after" && !COMPARE_ONLY) {
  const other = process.env.BEFORE_TREE
  const self = fileURLToPath(import.meta.url)
  copyFileSync(self, join(other, "scripts/check-sidebar-revert.mjs"))
  console.log(`\n=== before: ${other}\n`)
  /* Its own bundle, never this checkout's: EDITOR_BUNDLE names this one's. */
  const env = { ...process.env, PROBE_LABEL: "before", SHOTS, BEFORE_TREE: "" }
  delete env.EDITOR_BUNDLE
  if (process.env.BEFORE_BUNDLE) env.EDITOR_BUNDLE = process.env.BEFORE_BUNDLE
  execFileSync(process.execPath, [join(other, "scripts/check-sidebar-revert.mjs")], { cwd: other, stdio: "inherit", env })
  console.log(`\n=== after: ${root}\n`)
}

/* A plain picture for every image the page asks the network for. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAF0lEQVR4nGP8z8Dwn4GBgYGJAQ0AAB5vAQVVB2CvAAAAAElFTkSuQmCC", "base64")

const IN_PAGE = String.raw`
window.__sr = (function () {
  /* Resolves with the frame's own start time, which is what a step is drawn at. */
  var frame = function () { return new Promise(function (r) { requestAnimationFrame(function (ts) { r(ts) }) }) }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  function click(el) {
    var r = el.getBoundingClientRect()
    var o = { bubbles: true, cancelable: true, clientX: r.left + Math.min(10, r.width / 2), clientY: r.top + Math.min(10, r.height / 2), pointerId: 1, isPrimary: true }
    el.dispatchEvent(new PointerEvent("pointerdown", o)); el.dispatchEvent(new MouseEvent("mousedown", o))
    el.dispatchEvent(new PointerEvent("pointerup", o)); el.dispatchEvent(new MouseEvent("mouseup", o))
    el.dispatchEvent(new MouseEvent("click", o))
  }
  /* The phone's editor sheet: the one holding the sidebar, not any other sheet kept in the page. */
  function sheet() {
    var inner = document.querySelector("[data-mobile-bottom-sheet] [data-wb-sidebar-scroll]")
    return inner ? inner.closest("[data-mobile-bottom-sheet]") : null
  }
  /* The sidebar's scroller: the computer's column, or the one in the phone's sheet. */
  function side() {
    var s = sheet()
    return (s && s.querySelector("[data-wb-sidebar-scroll]")) || document.querySelector("[data-wb-sidebar-scroll]")
  }
  function tab(name) {
    var all = document.querySelectorAll("[role=tablist][aria-label=Sidebar] [role=tab]")
    for (var i = 0; i < all.length; i++) if ((all[i].textContent || "").trim() === name) return all[i]
    return null
  }
  function text(el) { return (el.textContent || "").replace(/\s+/g, " ").trim() }
  function scrollerOf(el) {
    for (var p = el.parentElement; p; p = p.parentElement) {
      var cs = getComputedStyle(p)
      if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1) return p
    }
    return null
  }
  /* Bring an element to the top of what its scroller shows, and say where it is. */
  async function show(el, pad) {
    pad = pad == null ? 12 : pad
    for (var i = 0; i < 3; i++) {
      var sc = scrollerOf(el)
      if (!sc) break
      var top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top
      sc.scrollTop += top - pad
    }
    await frame(); await frame()
    return el.getBoundingClientRect()
  }
  function box(el) { var r = el.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height } }
  /* A control's field: its parent, or the parent of the Insert shop data wrapper around it. */
  function field(el) {
    var wrap = el.parentElement && el.parentElement.closest("[data-dynamic-field]")
    return (wrap && wrap.parentElement) || el.parentElement
  }
  /*
    Every scroller around it back to its top, the nearest one brought to it,
    and then nothing measured until it has stayed put for three frames: a
    list that was open a moment ago can still be giving back its room.
  */
  async function settle(el, pad) {
    for (var p = el.parentElement; p; p = p.parentElement) if (p.scrollTop) p.scrollTop = 0
    await frame()
    await show(el, pad)
    /* To the hundredth of a pixel: a sheet still easing into its stop moves
       everything in it by less than a pixel, and a picture taken then puts
       the text on one row of pixels and the borders on another. */
    var last = null, same = 0
    for (var i = 0; i < 120 && same < 4; i++) {
      await frame()
      var r = el.getBoundingClientRect()
      var k = r.top.toFixed(2) + ":" + r.left.toFixed(2) + ":" + r.height.toFixed(2)
      same = k === last ? same + 1 : 0
      last = k
    }
    return box(el)
  }
  function union(a, b) {
    var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
    return { x: x, y: y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }
  }
  function sectionRow(re) {
    var rows = side().querySelectorAll("div.group.cursor-pointer")
    for (var i = 0; i < rows.length; i++) if (re.test(text(rows[i]))) return rows[i]
    return null
  }
  function schemeBlock() {
    var ps = side().querySelectorAll("p")
    for (var i = 0; i < ps.length; i++) if (text(ps[i]) === "Color scheme") return ps[i].parentElement
    return null
  }
  function groupButton(label) {
    var bs = side().querySelectorAll("button")
    for (var i = 0; i < bs.length; i++) if (text(bs[i]) === label) return bs[i]
    return null
  }
  function colourPopup() {
    var all = document.querySelectorAll("body > div")
    for (var i = all.length - 1; i >= 0; i--) {
      var c = String(all[i].className || "")
      if (c.indexOf("fixed") >= 0 && c.indexOf("z-[200]") >= 0) return all[i]
    }
    return null
  }
  /* A group opening or closing, read every frame from the press on. */
  async function measureGroup(label, frames) {
    var btn = groupButton(label)
    if (!btn) return { found: false }
    var group = btn.parentElement
    var next = group.nextElementSibling
    var sc = scrollerOf(group) || side()
    var read = function () {
      var content = btn.nextElementSibling
      var inner = content && content.hasAttribute("data-collapse") ? content.firstElementChild : content
      /* What a person sees: everything is cut at the foot of the scroller, or of the screen. */
      var foot = Math.min(window.innerHeight, sc.getBoundingClientRect().bottom)
      var g = group.getBoundingClientRect()
      var below = next ? next.getBoundingClientRect().top : null
      return {
        h: Math.round(g.height * 10) / 10,
        seen: Math.round((Math.min(g.bottom, foot) - Math.max(g.top, sc.getBoundingClientRect().top)) * 10) / 10,
        below: below === null ? null : Math.round(Math.min(below, foot) * 10) / 10,
        op: inner ? Math.round(parseFloat(getComputedStyle(inner).opacity) * 100) / 100 : 0,
        anim: content ? content.getAnimations().length + (inner ? inner.getAnimations().length : 0) : 0,
      }
    }
    await frame()
    var start = read()
    var t0 = performance.now()
    click(btn)
    var out = []
    for (var i = 0; i < (frames || 45); i++) {
      /* The frame's start, not the moment after reading it: reading forces a layout, which on a busy machine takes long enough to make the gaps between frames look uneven when they are not. */
      var ts = await frame()
      var s = read(); s.t = Math.round(ts - t0)
      out.push(s)
    }
    return { found: true, start: start, frames: out }
  }
  /* Sections, Pages and Theme in turn: does anything above the panel move? */
  async function measureTabs(order) {
    var result = []
    for (var k = 0; k < order.length; k++) {
      var t = tab(order[k])
      if (!t) { result.push({ tab: order[k], found: false }); continue }
      var bar = t.closest("[role=tablist]")
      var sc = side()
      var barTop0 = bar.getBoundingClientRect().top, scTop0 = sc.getBoundingClientRect().top, scH0 = sc.getBoundingClientRect().height
      click(t)
      var worstBar = 0, worstTop = 0, worstH = 0, worstOver = 0, n = 0
      var until = performance.now() + 600
      while (performance.now() < until) {
        await frame(); n++
        var s2 = side()
        worstBar = Math.max(worstBar, Math.abs(bar.getBoundingClientRect().top - barTop0))
        worstTop = Math.max(worstTop, Math.abs(s2.getBoundingClientRect().top - scTop0))
        worstH = Math.max(worstH, Math.abs(s2.getBoundingClientRect().height - scH0))
        worstOver = Math.max(worstOver, s2.scrollHeight - s2.clientHeight)
      }
      await sleep(250)
      var s3 = side()
      result.push({
        tab: order[k], found: true, frames: n,
        barMoved: Math.round(worstBar * 10) / 10, scrollerMoved: Math.round(worstTop * 10) / 10, scrollerResized: Math.round(worstH * 10) / 10,
        worstOverflow: Math.round(worstOver), settledOverflow: Math.round(s3.scrollHeight - s3.clientHeight), scrollTop: Math.round(s3.scrollTop),
        selected: t.getAttribute("aria-selected") === "true",
      })
    }
    return result
  }
  return {
    frame: frame, sleep: sleep, click: click, sheet: sheet, side: side, tab: tab, text: text, show: show, settle: settle, box: box, field: field, union: union,
    sectionRow: sectionRow, schemeBlock: schemeBlock, groupButton: groupButton, colourPopup: colourPopup,
    measureGroup: measureGroup, measureTabs: measureTabs,
  }
})()
true
`

async function capture() {
  const { bundle, css } = await import("./editor-probe-harness.mjs")
  const { interFaces } = await import("./probe-css.mjs")
  const out = mkdtempSync(join(tmpdir(), "sidebar-revert-"))
  writeFileSync(join(out, "editor-probe.js"), readFileSync(bundle))
  writeFileSync(join(out, "index.html"),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${interFaces(root)}</style><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false</script><script src="editor-probe.js"></script></body></html>`)

  const report = { label: LABEL, root, shots: {}, desktop: {}, phone: {} }
  const RATIO = /\d+(?:\.\d+)?\s*(?::|to)\s*1\b/i

  for (const vp of [
    { key: "desktop", width: 1280, height: 900, isMobile: false, hasTouch: false, blink: "primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4" },
    { key: "phone", width: 390, height: 844, isMobile: true, hasTouch: true, blink: "primaryHoverType=1,availableHoverTypes=1,primaryPointerType=2,availablePointerTypes=2" },
  ]) {
    const browser = await puppeteer.launch({
      executablePath: CHROMIUM, headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", "--force-device-scale-factor=1", `--blink-settings=${vp.blink}`],
    })
    const R = (report[vp.key] = {})
    try {
      const page = await browser.newPage()
      const errors = []
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1, isMobile: vp.isMobile, hasTouch: vp.hasTouch })
      await page.setRequestInterception(true)
      page.on("request", (r) => {
        const u = r.url()
        if (u.startsWith("file:") || u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
        if (/\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u) || /example\.invalid/.test(u)) return r.respond({ status: 200, contentType: "image/png", body: PNG })
        return r.respond({ status: 200, contentType: "text/plain", body: "" })
      })
      await page.goto(`file://${join(out, "index.html")}`)
      await page.waitForFunction(() => {
        const sc = document.getElementById("wb-preview-root")
        return !!sc && sc.querySelectorAll("[id^=wb-section-]").length >= 3
      }, { timeout: 90_000 })
      await sleep(1500)
      await page.evaluate(IN_PAGE)
      const js = (fn, ...args) => page.evaluate(fn, ...args)

      const shoot = async (name, clip) => {
        if (!clip || clip.width < 2 || clip.height < 2) { R[`shot:${name}`] = "missing"; return }
        const c = {
          x: Math.max(0, Math.floor(clip.x)), y: Math.max(0, Math.floor(clip.y)),
          width: Math.ceil(Math.min(clip.width, vp.width - Math.max(0, clip.x))), height: Math.ceil(Math.min(clip.height, vp.height - Math.max(0, clip.y))),
        }
        if (c.width < 2 || c.height < 2) { R[`shot:${name}`] = { offscreen: clip }; return }
        const file = join(SHOTS, `sidebar-revert-${LABEL}-${vp.width}-${name}.png`)
        /* Where the element really was, to the fraction, beside where the picture was cut. */
        R[`at:${name}`] = { y: Math.round(clip.y * 100) / 100, sheet: await js(() => { const s = window.__sr.sheet(); return s ? Math.round(s.getBoundingClientRect().top * 100) / 100 : null }) }
        /* `captureBeyondViewport: false`: the screen as it is. Left on, the
           browser is made as tall as the page for the picture, the editor
           lays itself out again for that height, and a scroller that was just
           placed is somewhere else by the time it is photographed. */
        await page.screenshot({ path: file, clip: c, captureBeyondViewport: false })
        report.shots[`${vp.width}-${name}`] = { file, ...c }
        /* PROBE_FULL=1: the whole screen as well, to see what was around it. */
        if (process.env.PROBE_FULL) await page.screenshot({ path: file.replace(/\.png$/, "-full.png"), captureBeyondViewport: false })
      }

      /* On a phone the sheet is opened from its Sections tab, then to its full stop. */
      if (vp.key === "phone") {
        await js(() => { const t = window.__sr.tab("Sections"); if (t) window.__sr.click(t) })
        await sleep(1100)
        const top = await js(() => { const s = window.__sr.sheet(); return s ? s.getBoundingClientRect().top : null })
        if (top !== null) {
          await page.touchscreen.tap(Math.round(vp.width / 2), Math.round(top) + 10)
          await sleep(1000)
        }
        R.sheetTop = await js(() => Math.round(window.__sr.sheet().getBoundingClientRect().top))
      }

      /* ── A section's settings ─────────────────────────────────────────── */
      R.section = await js(async () => {
        const row = window.__sr.sectionRow(/hero/i)
        if (!row) return { found: false }
        window.__sr.click(row)
        await window.__sr.sleep(900)
        return { found: true, name: window.__sr.text(row).slice(0, 40) }
      })

      const blockClip = await js(async () => {
        const b = window.__sr.schemeBlock()
        return b ? window.__sr.settle(b) : null
      })
      await shoot("scheme", blockClip)

      /* Open, the way somebody picks another scheme, and shut again by the same press. */
      const openClip = await js(async () => {
        const b = window.__sr.schemeBlock()
        const trigger = b && b.querySelector("button")
        if (!trigger) return null
        await window.__sr.settle(b)
        window.__sr.click(trigger)
        await window.__sr.sleep(450)
        const list = trigger.parentElement.children[1]
        return list ? window.__sr.union(window.__sr.box(trigger), window.__sr.box(list)) : window.__sr.box(trigger.parentElement)
      })
      await shoot("scheme-open", openClip)
      R.schemeClosed = await js(async () => {
        const b = window.__sr.schemeBlock()
        const trigger = b && b.querySelector("button")
        if (trigger && trigger.parentElement.children.length > 1) window.__sr.click(trigger)
        for (let i = 0; i < 30 && trigger && trigger.parentElement.children.length > 1; i++) await window.__sr.frame()
        await window.__sr.sleep(150)
        return !!trigger && trigger.parentElement.children.length === 1
      })

      const selectClip = await js(async () => {
        const s = window.__sr.side().querySelector("select")
        return s ? window.__sr.settle(s.parentElement.parentElement) : null
      })
      await shoot("select", selectClip)

      const sliderClip = await js(async () => {
        const s = window.__sr.side().querySelector("[data-slot='slider']")
        if (!s) return null
        /* The slider's row (the track and its number), and the field around it with its label,
           past the Insert shop data wrapper where there is one (controls/dynamic-source-field). */
        const row = s.closest("[data-sheet-no-drag]")?.parentElement ?? s.parentElement
        return window.__sr.settle(window.__sr.field(row))
      })
      await shoot("slider", sliderClip)

      const imageClip = await js(async () => {
        const p = window.__sr.side().querySelector("[data-wb-image-picker]")
        if (!p) return null
        const field = window.__sr.field(p)
        await window.__sr.settle(field)
        await window.__sr.sleep(700)
        return window.__sr.box(field)
      })
      await shoot("image", imageClip)

      /* A number typed beside a slider still reaches the page: the hero's top padding. */
      R.sliderToCanvas = await js(async () => {
        const labels = [...window.__sr.side().querySelectorAll("label, p")].filter((l) => window.__sr.text(l) === "Top padding")
        const field = labels[0] && labels[0].parentElement
        const input = field && field.querySelector("input[inputmode='numeric']")
        const section = document.querySelector("#wb-preview-root [id^='wb-section-hero']")
        if (!input || !section) return { found: false, input: !!input, section: !!section }
        const before = section.getBoundingClientRect().height
        input.focus()
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
        setter.call(input, "140")
        input.dispatchEvent(new Event("input", { bubbles: true }))
        input.blur()
        await window.__sr.sleep(900)
        const after = document.querySelector("#wb-preview-root [id^='wb-section-hero']").getBoundingClientRect().height
        return { found: true, before: Math.round(before), after: Math.round(after), shown: input.value }
      })

      /* A section's own colours: Advanced colors, opened, once it has finished opening. */
      const advancedClip = await js(async () => {
        const b = [...window.__sr.side().querySelectorAll("button")].find((x) => window.__sr.text(x).indexOf("Advanced colors") === 0)
        if (!b) return null
        await window.__sr.settle(b.parentElement, 12)
        window.__sr.click(b)
        await window.__sr.sleep(700)
        return window.__sr.settle(b.parentElement, 12)
      })
      await shoot("advanced-colors", advancedClip)
      await js(async () => {
        const b = [...window.__sr.side().querySelectorAll("button")].find((x) => window.__sr.text(x).indexOf("Advanced colors") === 0)
        if (b) window.__sr.click(b)
        await window.__sr.sleep(600)
      })

      /* ── Theme ────────────────────────────────────────────────────────── */
      await js(async () => { window.__sr.click(window.__sr.tab("Theme")); await window.__sr.sleep(900) })
      const groupsClip = await js(async () => {
        const first = window.__sr.groupButton("Branding")
        if (!first) return null
        /* The panel's heading and its list of groups, from the top. */
        const panel = first.parentElement.parentElement.parentElement
        const r = await window.__sr.settle(panel, 0)
        return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 360) }
      })
      await shoot("theme-groups", groupsClip)

      R.openColors = await js(() => window.__sr.measureGroup("Colors", 45))
      await sleep(300)
      const colorsClip = await js(async () => {
        const b = window.__sr.groupButton("Colors")
        if (!b) return null
        const r = await window.__sr.settle(b.parentElement, 0)
        return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 520) }
      })
      await shoot("theme-colors", colorsClip)

      /* A scheme's colour, the way it is picked in Colors: the chip's own picker. */
      const pickerClip = await js(async () => {
        const rows = [...window.__sr.side().querySelectorAll("span")].filter((s) => window.__sr.text(s) === "Background")
        const row = rows.map((s) => s.parentElement).find((r) => r && r.querySelector("button[aria-label='Pick color']"))
        if (!row) return null
        const chip = row.querySelector("button[aria-label='Pick color']")
        await window.__sr.settle(chip, 80)
        window.__sr.click(chip)
        await window.__sr.sleep(450)
        const pop = window.__sr.colourPopup()
        return pop ? window.__sr.box(pop) : null
      })
      await shoot("colour-picker", pickerClip)
      await js(async () => {
        document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 1, clientY: 1 }))
        await window.__sr.sleep(300)
      })

      /* Shut and opened again while nothing else is going on, then the colour. */
      R.closeColors = await js(() => window.__sr.measureGroup("Colors", 40))
      await sleep(300)

      /* The same group under reduced motion: the end state at once. */
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
      R.reducedOpen = await js(() => window.__sr.measureGroup("Typography", 12))
      await sleep(200)
      R.reducedClose = await js(() => window.__sr.measureGroup("Typography", 12))
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }])
      await sleep(300)
      R.openTypography = await js(() => window.__sr.measureGroup("Typography", 40))
      await sleep(300)
      R.closeTypography = await js(() => window.__sr.measureGroup("Typography", 40))
      await sleep(300)

      /* The scheme's Text colour, set to one that is hard to read on white. */
      await js(async () => { window.__sr.click(window.__sr.groupButton("Colors")); await window.__sr.sleep(700) })
      R.contrast = await js(async () => {
        const rows = [...window.__sr.side().querySelectorAll("span")].filter((s) => window.__sr.text(s) === "Text")
        const row = rows.map((s) => s.parentElement).find((r) => r && r.querySelector("button[aria-label='Pick color']"))
        if (!row) return { set: false }
        const chip = row.querySelector("button[aria-label='Pick color']")
        await window.__sr.settle(chip, 80)
        window.__sr.click(chip)
        await window.__sr.sleep(350)
        const pop = window.__sr.colourPopup()
        const input = pop && pop.querySelector("input[placeholder='#FFFFFF']")
        if (!input) return { set: false, popup: !!pop }
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
        setter.call(input, "#EEEEEE")
        input.dispatchEvent(new Event("input", { bubbles: true }))
        await window.__sr.sleep(400)
        document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 1, clientY: 1 }))
        await window.__sr.sleep(400)
        const said = window.__sr.side().innerText
        /* And the page itself is drawn in it: some text on the canvas is now #EEEEEE. */
        const canvas = [...document.querySelectorAll("#wb-preview-root [id^='wb-section-'] *")]
        const painted = canvas.filter((e) => e.childElementCount === 0 && (e.textContent || "").trim() && getComputedStyle(e).color === "rgb(238, 238, 238)").length
        return { set: true, text: said.length, hardToRead: /hard to read/i.test(said), lines: said.split("\n").filter((l) => /hard to read|to 1 it needs|\d\s*:\s*1\b/i.test(l)).slice(0, 6), canvasTextInIt: painted }
      })
      R.contrast.ratio = R.contrast.lines ? R.contrast.lines.some((l) => RATIO.test(l)) : false
      const warnClip = await js(async () => {
        const b = window.__sr.groupButton("Colors")
        if (!b) return null
        const group = b.parentElement
        const spans = [...group.querySelectorAll("*")].filter((e) => e.children.length === 0 && /Default for new sections/.test(e.textContent || ""))
        const anchor = spans[0] ? spans[0].closest("label") || spans[0] : group
        const r = await window.__sr.settle(anchor, 20)
        return { x: window.__sr.box(group).x, y: r.y - 8, width: window.__sr.box(group).width, height: 200 }
      })
      await shoot("contrast", warnClip)
      await sleep(600)

      /* ── The tabs ─────────────────────────────────────────────────────── */
      R.tabs = await js(() => window.__sr.measureTabs(["Sections", "Pages", "Theme", "Sections"]))
      R.errors = errors.slice(0, 5)
    } finally {
      await browser.close()
    }
  }
  writeFileSync(join(SHOTS, `sidebar-revert-${LABEL}.json`), JSON.stringify(report, null, 1))
  return report
}

/**
 * What a group's frames say, in what can be seen: how far its visible part
 * travelled, over how many frames and milliseconds, the most it moved in one
 * frame, the most the row under it moved in one frame, and the opacity of
 * its content on the first frame drawn and the last.
 */
function motion(m) {
  if (!m || !m.found) return null
  const f = m.frames
  const s0 = m.start.seen, s1 = f[f.length - 1].seen
  const total = Math.abs(s1 - s0)
  /*
    Per frame as drawn, and per 16.7ms: on a machine shared with other work a
    frame can arrive 50ms late, and the step it shows is three frames' worth.
    The second is the animation's own smoothness; the count of late frames
    says how much of the first was the machine.
  */
  let last = 0, steps = 0, maxStep = 0, maxBelow = 0, maxPerFrame = 0, late = 0, between = 0
  let prev = { ...m.start, t: f[0].t }
  const lo = Math.min(s0, s1) + 0.5, hi = Math.max(s0, s1) - 0.5
  for (const s of f) {
    const d = Math.abs(s.seen - prev.seen)
    const dt = Math.max(1, s.t - prev.t)
    if (d > 0.5) { steps++; last = s.t; if (dt > 25) late++ }
    if (s.seen > lo && s.seen < hi) between++
    maxStep = Math.max(maxStep, d)
    maxPerFrame = Math.max(maxPerFrame, d / Math.max(1, dt / 16.7))
    if (s.below !== null && prev.below !== null) maxBelow = Math.max(maxBelow, Math.abs(s.below - prev.below))
    prev = s
  }
  return {
    height: `${Math.round(m.start.h)} to ${Math.round(f[f.length - 1].h)}`, seen: `${Math.round(s0)} to ${Math.round(s1)}`,
    frames: steps, framesBetween: between, ms: last, span: last ? last - f[0].t : 0, lateFrames: late,
    biggestFrame: Math.round(maxStep), biggestShare: total ? Math.round((maxStep / total) * 100) : 0,
    biggestPer16ms: Math.round(maxPerFrame), biggestSharePer16ms: total ? Math.round((maxPerFrame / total) * 100) : 0,
    rowBelowBiggestFrame: Math.round(maxBelow), firstFrame: { t: f[0].t, seen: Math.round(f[0].seen), opacity: f[0].op }, lastOpacity: f[f.length - 1].op,
  }
}

const report = COMPARE_ONLY ? JSON.parse(readFileSync(join(SHOTS, `sidebar-revert-${LABEL}.json`), "utf8")) : await capture()

const say = (k, v) => console.log(`  ${k.padEnd(34)} ${typeof v === "string" ? v : JSON.stringify(v)}`)
for (const key of ["desktop", "phone"]) {
  const R = report[key]
  console.log(`\n${report.label}, ${key === "desktop" ? "1280x900" : "390x844 sheet"}`)
  say("section opened", R.section)
  say("Colors opens", motion(R.openColors))
  say("Colors closes", motion(R.closeColors))
  say("Typography opens", motion(R.openTypography))
  say("Typography closes", motion(R.closeTypography))
  say("reduced motion opens", motion(R.reducedOpen))
  say("reduced motion closes", motion(R.reducedClose))
  say("hard to read text on #EEEEEE", R.contrast)
  say("top padding typed as 140", R.sliderToCanvas)
  for (const t of R.tabs ?? []) say(`tab ${t.tab}`, t)
  if (R.errors?.length) say("page errors", R.errors)
}

/* ── Every pair, pixel by pixel ─────────────────────────────────────────── */
if (LABEL === "after" && process.env.BEFORE_TREE) {
  const before = JSON.parse(readFileSync(join(SHOTS, "sidebar-revert-before.json"), "utf8"))
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--allow-file-access-from-files"] })
  const rows = []
  try {
    const page = await browser.newPage()
    await page.goto("about:blank")
    for (const name of Object.keys(report.shots)) {
      const a = before.shots[name], b = report.shots[name]
      if (!a) { rows.push({ name, result: "no before picture" }); continue }
      const aUrl = `data:image/png;base64,${readFileSync(a.file).toString("base64")}`
      const bUrl = `data:image/png;base64,${readFileSync(b.file).toString("base64")}`
      const r = await page.evaluate(async (aUrl, bUrl) => {
        const load = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = u })
        const [ia, ib] = await Promise.all([load(aUrl), load(bUrl)])
        const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height)
        const px = (img) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.fillStyle = "#ff00ff"; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data }
        const da = px(ia), db = px(ib)
        /*
          Pixel for pixel, and again with one picture moved by up to 2px: a
          sheet that rests on a fractional pixel puts the same control one
          pixel lower in one run than in the other. The border rows that a
          shift leaves uncovered are not counted.
        */
        const compare = (dx, dy) => {
          let diff = 0, worst = 0
          for (let y = 2; y < h - 2; y++) {
            for (let x = 2; x < w - 2; x++) {
              const i = (y * w + x) * 4, j = ((y + dy) * w + (x + dx)) * 4
              const d = Math.max(Math.abs(da[i] - db[j]), Math.abs(da[i + 1] - db[j + 1]), Math.abs(da[i + 2] - db[j + 2]))
              if (d > 16) diff++
              if (d > worst) worst = d
            }
          }
          return { diff, worst }
        }
        const exact = compare(0, 0)
        let best = { ...exact, dx: 0, dy: 0 }
        if (exact.diff > 0) {
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
            const c = compare(dx, dy)
            if (c.diff < best.diff) best = { ...c, dx, dy }
          }
        }
        /*
          And the same once more, with a pixel counted as different only when
          nothing within one pixel of it in the other picture is its colour:
          a control laid out a third of a pixel lower (because something
          above it is) puts its text and its borders on different rows of
          pixels, which no whole pixel shift lines up, and is not a different
          control.
        */
        const near = (from, to) => {
          let miss = 0
          for (let y = 2; y < h - 2; y++) {
            for (let x = 2; x < w - 2; x++) {
              const i = (y * w + x) * 4
              let found = false
              for (let dy = -1; dy <= 1 && !found; dy++) for (let dx = -1; dx <= 1 && !found; dx++) {
                const j = ((y + dy) * w + (x + dx)) * 4
                if (Math.max(Math.abs(from[i] - to[j]), Math.abs(from[i + 1] - to[j + 1]), Math.abs(from[i + 2] - to[j + 2])) <= 48) found = true
              }
              if (!found) miss++
            }
          }
          return miss
        }
        const within1px = exact.diff > 0 ? Math.max(near(da, db), near(db, da)) : 0
        const diff = exact.diff, worst = exact.worst
        /* The pair side by side, before on the left, for a person to look at. */
        const gap = 24, pad = 16
        const c = document.createElement("canvas"); c.width = ia.width + ib.width + gap + pad * 2; c.height = h + pad * 2 + 22
        const g = c.getContext("2d"); g.fillStyle = "#eef1f5"; g.fillRect(0, 0, c.width, c.height)
        g.fillStyle = "#1a1a2e"; g.font = "12px sans-serif"; g.fillText("before (e5fdbe55)", pad, 14); g.fillText("after", pad + ia.width + gap, 14)
        g.drawImage(ia, pad, pad + 6); g.drawImage(ib, pad + ia.width + gap, pad + 6)
        return {
          a: [ia.width, ia.height], b: [ib.width, ib.height], diffPixels: diff, share: Math.round((diff / (w * h)) * 10000) / 100, worst,
          aligned: best.diff, alignedShare: Math.round((best.diff / (w * h)) * 10000) / 100, shift: [best.dx, best.dy], within1px,
          pair: c.toDataURL("image/png"),
        }
      }, aUrl, bUrl)
      writeFileSync(join(SHOTS, `sidebar-revert-pair-${name}.png`), Buffer.from(r.pair.split(",")[1], "base64"))
      rows.push({
        name, sizeBefore: r.a.join("x"), sizeAfter: r.b.join("x"), differentPixels: r.diffPixels, percent: r.share, worstChannel: r.worst,
        differentWhenAligned: r.aligned, percentWhenAligned: r.alignedShare, shift: r.shift, differentBeyond1px: r.within1px,
      })
    }
  } finally {
    await browser.close()
  }
  writeFileSync(join(SHOTS, "sidebar-revert-compare.json"), JSON.stringify(rows, null, 1))
  console.log("\nbefore against after, each picture")
  for (const r of rows) {
    console.log(`  ${r.name.padEnd(26)} ${r.result ?? `${r.sizeBefore} / ${r.sizeAfter}   ${r.differentPixels} px differ (${r.percent}%)` +
      (r.differentPixels ? `, ${r.differentWhenAligned} (${r.percentWhenAligned}%) moved by ${r.shift.join(",")}px, ${r.differentBeyond1px} further than 1px from their colour` : "")}`)
  }

  const bd = before.desktop, bp = before.phone
  console.log("\nbefore, for comparison")
  say("Colors opens, computer", motion(bd.openColors))
  say("Colors closes, computer", motion(bd.closeColors))
  say("Colors closes, phone", motion(bp.closeColors))
  say("hard to read, computer", bd.contrast)
  report.compare = rows
}

/* ── What has to be true of this checkout ───────────────────────────────── */
let broken = 0
const expect = (ok, what, detail) => {
  if (!ok) broken++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
}
if (LABEL === "after") {
  console.log("\nexpected of this checkout")
  for (const key of ["desktop", "phone"]) {
    const R = report[key]
    const at = key === "desktop" ? "on a computer" : "in the phone's sheet"
    expect(R.contrast?.set && !R.contrast.hardToRead && R.contrast.lines.length === 0 && !R.contrast.ratio,
      `no ratio and no "Hard to read" in the sidebar with Text at #EEEEEE on white, ${at}`, R.contrast)
    expect(R.contrast?.canvasTextInIt > 0, `a scheme colour picked in Colors is on the page at once, ${at}`, R.contrast)
    expect(R.sliderToCanvas?.found && R.sliderToCanvas.after > R.sliderToCanvas.before, `a number typed beside a slider reaches the page, ${at}`, R.sliderToCanvas)
    for (const k of ["openColors", "closeColors", "openTypography", "closeTypography"]) {
      const m = motion(R[k])
      const first = R[k]?.frames?.[0]
      /* Time, and the states in between, rather than a count of frames: a machine busy with other work drops frames, and the clock carries on regardless. */
      expect(!!m && m.framesBetween >= 2 && m.span >= 150 && m.span <= 450, `${k} passes through the heights in between, over about a quarter of a second, ${at}`, m)
      /* The curve itself moves about 30% in its second frame of a 200ms close; 40 leaves room for a frame that lands late. */
      expect(!!m && m.biggestSharePer16ms <= 40 && m.biggestPer16ms <= 260, `${k}: no 16ms of it moves the row under it more than 40% of the way, or 260px, ${at}`, m)
      expect(!!first && Math.abs(first.seen - R[k].start.seen) < 1, `${k}: the first frame drawn is where it starts, ${at}`, first)
    }
    for (const k of ["reducedOpen", "reducedClose"]) {
      const m = motion(R[k])
      expect(!!m && m.frames === 1, `${k}: reduced motion gets the end state in one frame, ${at}`, m)
    }
    for (const t of R.tabs ?? []) {
      expect(t.found && t.selected && t.barMoved === 0 && t.scrollerMoved === 0 && t.scrollerResized === 0 && t.worstOverflow <= t.settledOverflow && t.scrollTop === 0,
        `${t.tab}: the tab bar and the panel stay put, and nothing overflows for a frame, ${at}`, t)
    }
  }
  for (const r of report.compare ?? []) {
    if (/contrast$/.test(r.name)) continue
    expect(r.differentBeyond1px === 0, `${r.name} is the picture it was before the rework${r.differentPixels ? " (to within a pixel)" : ""}`, r)
  }
  const contrastShots = (report.compare ?? []).filter((r) => /contrast$/.test(r.name))
  for (const r of contrastShots) expect(r.differentPixels > 0, `${r.name}: the warning that was there before is gone`, r)
}
writeFileSync(join(SHOTS, `sidebar-revert-${LABEL}.json`), JSON.stringify(report, null, 1))
console.log(`\nPictures and numbers: ${SHOTS}`)
if (broken) {
  console.log(`\n${broken} failed`)
  process.exit(1)
}
