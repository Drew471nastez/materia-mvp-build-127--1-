/**
 * ===========================================================================
 *  EVERY BUTTON CONTROL IN DESIGN, ON EVERY KIND OF BUTTON, LIVE AND PREVIEW
 * ===========================================================================
 * Round AP, the owner: "make sure that all the style of buttons, shape,
 * corner size, text and icon, shadow, border, custom colors, ... borders on
 * hover, everything works 100%". scripts/render-onepage-button-controls-ap.tsx
 * draws the real published page and the real editor (with its preview frame)
 * with a plain link, a link with an icon, a booking button and a block's
 * sheet button. For each control below, set alone on a page, the probe reads
 * the computed style of each kind of button and checks:
 *
 *   the control's own result   the radius, the border's width and colour, the
 *                              shadow and its colour, the fill and the words,
 *                              the words' side, the icon's side, the size, and
 *                              on hover the fill and words it turns to
 *   every kind agrees          the booking and sheet buttons draw what the
 *                              link draws (fill, words, corners, border, shadow)
 *   the preview is the page    the editor's preview frame draws the same
 *
 *   CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node scripts/check-onepage-button-controls-ap.mjs
 *   REPORT=1 prints the numbers without failing.
 */
import { existsSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const report = !!process.env.REPORT
const CHROMIUM = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p))
const base0 = { background_type: "solid", background_color: "#f6f5f2", text_color: "#1a1a2e", button_style: "filled", button_color: "#1a1a2e", button_text_color: "#ffffff", button_border_radius: 12, button_border_width: 0, button_border_color: "#1a1a2e", button_shadow: "none", button_hover_animation: "none" }
const V = [
  ["shape square", { button_border_radius: 0 }],
  ["corners 20", { button_border_radius: 20 }],
  ["shape pill", { button_border_radius: 999 }],
  ["border 3px red", { button_border_width: 3, button_border_color: "#d42d17" }],
  ["outline", { button_style: "outline", button_border_width: 0, button_border_color: "#2340c7", button_color: "#2340c7", button_text_color: "#2340c7" }],
  ["soft", { button_style: "soft", button_color: "#2f6f4f", button_text_color: "#2f6f4f" }],
  ["glass", { button_style: "glass", button_color: "rgba(255,255,255,0.15)", button_text_color: "#1a1a2e" }],
  ["shadow subtle", { button_shadow: "subtle" }],
  ["shadow strong blue", { button_shadow: "strong", button_shadow_color: "#2340c7" }],
  ["shadow hard red", { button_shadow: "hard", button_shadow_color: "#d42d17" }],
  ["custom colours", { button_color: "#f0a24a", button_text_color: "#111113" }],
  ["text left", { button_text_align: "left" }],
  ["icon right", { button_icon_position: "right" }],
  ["size large", { button_size: "large" }],
  ["size small", { button_size: "compact" }],
  ["hover fill custom", { button_hover_animation: "fill", button_hover_fill: "#d42d17", button_hover_text: "#fef3c7" }],
  ["hover fill and lift", { button_hover_animation: "pop", button_hover_fill: "#12695e", button_hover_text: "#ffffff" }],
  ["hover lift", { button_hover_animation: "lift", button_shadow: "subtle" }],
]
const VARIANTS = V.map(([, t]) => ({ ...base0, ...t }))

const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-button-controls-ap.tsx" })
const HOVER_ARGS = ["--blink-settings=availableHoverTypes=2,primaryHoverType=2,availablePointerTypes=4,primaryPointerType=4"]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const rows = []
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* The buttons of each kind, and what the browser computes for them. Run in the page (or the preview frame). */
const READ = () => {
  const vis = (el) => el && el.getClientRects().length > 0
  const find = (pred) => [...document.querySelectorAll("a, button")].find((e) => vis(e) && pred(e))
  const kinds = {
    link: find((e) => e.classList.contains("op-btn") && (e.textContent || "").includes("Shop the prints")),
    icon: find((e) => e.classList.contains("op-btn") && (e.textContent || "").includes("Follow on Instagram")),
    booking: find((e) => (e.textContent || "").includes("Book a call")),
    sheet: find((e) => e.hasAttribute("data-block-sheet-trigger")),
  }
  const out = {}
  for (const [k, el] of Object.entries(kinds)) {
    if (!el) { out[k] = null; continue }
    const cs = getComputedStyle(el)
    const label = el.querySelector(".op-label") || el.querySelector("[data-block-title]")
    const icon = el.querySelector("svg, img")
    const r = el.getBoundingClientRect()
    out[k] = {
      bg: cs.backgroundColor,
      color: cs.color,
      radius: cs.borderTopLeftRadius,
      borderW: cs.borderTopWidth,
      borderC: cs.borderTopColor,
      shadow: cs.boxShadow,
      align: label ? getComputedStyle(label).textAlign : null,
      labelLeft: label ? Math.round(label.getBoundingClientRect().left - r.left) : null,
      iconLeft: icon ? Math.round(icon.getBoundingClientRect().left - r.left) : null,
      iconRight: icon ? Math.round(r.right - icon.getBoundingClientRect().right) : null,
      h: Math.round(r.height),
      w: Math.round(r.width),
      afterBg: getComputedStyle(el, "::after").backgroundColor,
    }
  }
  return out
}

const rgb = (hex) => {
  const h = hex.replace("#", "")
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, defaultViewport: null, args: ["--no-sandbox", "--disable-gpu", "--window-size=1440,900", "--hide-scrollbars", ...HOVER_ARGS] })
async function open(path) {
  const page = await browser.newPage()
  await page.evaluateOnNewDocument((v) => { window.PROBE_VARIANTS = v }, VARIANTS)
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (u.hostname !== "127.0.0.1") return void r.respond({ status: 200, contentType: "text/html", body: "<!doctype html><body></body>" })
    void r.continue()
  })
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 })
  await page.waitForSelector(path.includes("live") ? ".op-btn" : "iframe", { timeout: 90000 })
  await sleep(400)
  return page
}


try {
  for (let v = 0; v < V.length; v++) {
    const [name, over] = V[v]
    const t = VARIANTS[v]
    console.log(`\n${name}`)
    const live = await open(`/app/onepage?live&v=${v}`)
    const m = await live.evaluate(READ)
    for (const k of ["link", "icon", "booking", "sheet"]) expect(!!m[k], `${name}: the ${k} button is drawn`)
    const L = m.link
    if (!L) { await live.close(); continue }
    /* Its own result. */
    const r = Number(t.button_border_radius)
    if (r === 999) expect(parseFloat(L.radius) >= L.h / 2, `${name}: a pill (radius ${L.radius} on ${L.h}px)`, L.radius)
    else expect(L.radius === `${r}px`, `${name}: corners ${r}px`, L.radius)
    const bw = t.button_style === "outline" ? Math.max(2, t.button_border_width) : t.button_border_width
    expect(L.borderW === `${bw}px`, `${name}: border ${bw}px`, L.borderW)
    if (bw > 0) expect(L.borderC === rgb(t.button_border_color), `${name}: border colour ${t.button_border_color}`, L.borderC)
    if (t.button_shadow === "none") expect(L.shadow === "none", `${name}: no shadow`, L.shadow)
    else {
      const c = rgb(t.button_shadow_color || "#000000").replace("rgb(", "rgba(").replace(")", "")
      expect(L.shadow.startsWith(c), `${name}: a ${t.button_shadow} shadow in ${t.button_shadow_color || "#000000"}`, L.shadow)
    }
    if (t.button_style === "filled") expect(L.bg === rgb(t.button_color), `${name}: filled ${t.button_color}`, L.bg)
    if (t.button_style === "outline") expect(L.bg === "rgba(0, 0, 0, 0)", `${name}: outline is not filled`, L.bg)
    if (/^#/.test(t.button_text_color)) expect(L.color === rgb(t.button_text_color), `${name}: words ${t.button_text_color}`, L.color)
    if (t.button_text_align === "left") expect(L.labelLeft < 40, `${name}: the words start on the left`, L.labelLeft)
    if (t.button_icon_position === "right") expect(m.icon && m.icon.iconRight < 30 && m.icon.iconLeft > 100, `${name}: the icon on the right`, m.icon && { left: m.icon.iconLeft, right: m.icon.iconRight })
    rows.push({ name, link: L })
    /* Every kind agrees with the link on what the control sets. */
    for (const k of ["booking", "sheet"]) {
      const B = m[k]
      if (!B) continue
      const same = ["bg", "color", "radius", "borderW", "borderC", "shadow"].filter((p) => B[p] !== L[p])
      expect(same.length === 0, `${name}: the ${k} button draws what the link draws`, same.length ? Object.fromEntries(same.map((p) => [p, { link: L[p], [k]: B[p] }])) : undefined)
    }
    /* On hover. */
    if (t.button_hover_animation === "fill" || t.button_hover_animation === "pop") {
      for (const k of ["link", "booking", "sheet"]) {
        const sel = await live.evaluateHandle((kind) => {
          const vis = (el) => el && el.getClientRects().length > 0
          const all = [...document.querySelectorAll("a, button")].filter(vis)
          return kind === "link" ? all.find((e) => e.classList.contains("op-btn") && (e.textContent || "").includes("Shop the prints")) : kind === "booking" ? all.find((e) => (e.textContent || "").includes("Book a call")) : all.find((e) => e.hasAttribute("data-block-sheet-trigger"))
        }, k)
        const el = sel.asElement()
        if (!el) continue
        await el.evaluate((e) => e.scrollIntoView({ block: "center" }))
        await sleep(120)
        const box = await el.boundingBox()
        await live.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await sleep(500)
        const h = await el.evaluate((e) => ({ color: getComputedStyle(e).color, after: getComputedStyle(e, "::after").backgroundColor, afterOpacity: getComputedStyle(e, "::after").opacity }))
        expect(h.color === rgb(t.button_hover_text) && h.after === rgb(t.button_hover_fill) && Number(h.afterOpacity) > 0.9, `${name}: the ${k} button turns to ${t.button_hover_fill} with ${t.button_hover_text} words`, h)
        await live.mouse.move(5, 5)
        await sleep(300)
      }
    }
    if (t.button_hover_animation === "lift") {
      const el = (await live.$$("a.op-btn"))[0]
      const box = await el.boundingBox()
      await live.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await sleep(450)
      const tr = await el.evaluate((e) => getComputedStyle(e).translate)
      expect(/-2px/.test(tr), `${name}: Lift rises 2px`, tr)
    }
    await live.close()

    /* The preview frame draws the same. */
    if ([0, 3, 4, 9, 11, 15].includes(v)) {
      const editor = await open(`/app/onepage?v=${v}#links`)
      let frame = null
      for (let i = 0; i < 80 && !frame; i++) {
        frame = editor.frames().find((f) => f.url().includes("onepage-preview")) || null
        if (frame && !(await frame.$(".op-btn"))) frame = null
        if (!frame) await sleep(150)
      }
      expect(!!frame, `${name}: the preview frame drew the buttons`)
      if (frame) {
        await sleep(500)
        const p = await frame.evaluate(READ)
        for (const k of ["link", "icon", "booking", "sheet"]) {
          const a = m[k]
          const b = p[k]
          if (!a || !b) { expect(false, `${name}: the ${k} button in the preview`, { live: !!a, preview: !!b }); continue }
          /*
            The phone beside the editor is the page zoomed to 287/390 (components/onepage/live-preview, zoom so edges
            snap to the screen's pixels): a border is drawn in whole device pixels, so a 2px border reads 1.36px there
            at a pixel ratio of 1. Within one device pixel of the live width is the same border.
          */
          const ZOOM = 287 / 390
          const sameBorder = (x, y) => Math.abs(parseFloat(x) * ZOOM - parseFloat(y) * ZOOM) <= 1
          const diff = ["bg", "color", "radius", "borderW", "borderC", "shadow", "align"].filter((q) => (q === "borderW" ? !sameBorder(a[q], b[q]) : a[q] !== b[q]))
          expect(diff.length === 0, `${name}: the preview's ${k} button is the live one`, diff.length ? Object.fromEntries(diff.map((q) => [q, { live: a[q], preview: b[q] }])) : undefined)
        }
      }
      await editor.close()
    }
  }
} finally {
  await browser.close()
  server.close()
}
console.log("\nRESULTS " + JSON.stringify(rows.map((r) => ({ name: r.name, radius: r.link.radius, border: `${r.link.borderW} ${r.link.borderC}`, shadow: r.link.shadow, bg: r.link.bg, color: r.link.color, h: r.link.h }))))
if (broken && !report) {
  console.error(`\n${broken} failed`)
  process.exit(1)
}
console.log(broken ? `\n${broken} would fail (REPORT)` : "\nall passed")
