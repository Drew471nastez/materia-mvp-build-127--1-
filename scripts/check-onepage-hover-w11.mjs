/**
 * ===========================================================================
 *  WAVE 11 (hover): EVERY CONTROL READS AT REST, ON HOVER, FOCUSED AND PRESSED
 * ===========================================================================
 * The owner: "some of the buttons, texts, hovers, controls don't apply
 * correctly ... not being consistent or visible ... like the double hover
 * changing the text colour in 3 styles. Fix across all themes." His pages:
 * Classic 98's product button turned navy with black words on hover, its "My
 * Link" card was navy with dark words, Grunge Zine's product button was faded
 * paper on paper.
 *
 * scripts/render-onepage-hover-w11.tsx draws a page of every control a OnePage
 * has (every link look, every product layout, the forms, questions, codes,
 * groups, music and video) with a theme picked as Design › Themes picks it.
 * This walks EVERY theme the picker lists and, with a real pointer (Chromium
 * told it has a mouse, so the `(hover: hover)` rules run), for every control:
 *
 *   rest, hover, focus-visible and pressed: each word's colour against the
 *     pixels actually painted under it in that state (a screenshot of the
 *     control with every word made clear, as scripts/check-onepage-legible-w10
 *     does), 4.5:1 (3:1 for large words) on 80% of them;
 *   one hover: the words' colour is sampled every 25ms while the pointer
 *     arrives and rests, and again as it leaves. A colour held for 75ms or more
 *     is a state: there must be at most two (rest and hover), and leaving must
 *     bring the rest colour back (the owner's "double hover");
 *   seen: every button's edge (its fill against what is around it, or its
 *     border) shows at rest and on hover, at 1.15:1 or more;
 *   consistent: every product button on a page wears the same paint, corners
 *     and border as its siblings (the picture overlay and a button the creator
 *     coloured are their own).
 *
 * Then the same for every block layout (rest and hover), and for each of the
 * creator's own button designs over each theme (?s=, rest and hover on the
 * page's buttons).
 *
 *   node scripts/check-onepage-hover-w11.mjs     every theme, layout and design
 *   QUICK=1          the full walk of every theme, no layouts or designs
 *   THEMES=a,b       only these themes          SETTINGS=a,b  only these designs
 *   GUARD=0          without the runtime guard (components/onepage/legible-guard): what the page draws by itself
 *   CONC=4           pages at once              SHOTS=<dir>  a picture of each failing control, rest and hover
 *   ONLY=full,layouts,settings
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p))
const SHOTS = process.env.SHOTS || ""
const QUICK = process.env.QUICK === "1"
const GUARD = process.env.GUARD !== "0"
const CONC = Number(process.env.CONC || 6)
const ONLY = (process.env.ONLY || (QUICK ? "full" : "full,layouts,settings")).split(",")
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failed = 0
let measured = 0
let controlsSeen = 0
const failures = []
const fail = (label, what) => {
  failed++
  failures.push(`${label}: ${what}`)
}

const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-hover-w11.tsx" })
/* A mouse: Chromium headless says it has none, and every hover rule sits in (hover: hover) and (pointer: fine). */
/* One browser per worker: a page in the background of a shared browser is not painted, and its screenshot waits. */
const launch = () =>
  puppeteer.launch({
    executablePath: CHROMIUM,
    headless: true,
    protocolTimeout: 60_000,
    args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"],
  })
const browser = await launch()

/* ── In the page ─────────────────────────────────────────────────────────── */

/** Every control on the page, numbered (data-hv), with what kind it is. */
const ENUMERATE = () => {
  const out = []
  const seen = new Set()
  const sel = "a[href], button, [role=button], summary, [data-product-cta]"
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest("[data-skin-scene], [aria-hidden='true'], iframe, [data-legible-skip]")) continue
    /* A product's button inside its card is the card's: the card is the control. */
    if (el.matches("[data-product-cta]") && el.closest("a[href]")) continue
    if (seen.has(el)) continue
    seen.add(el)
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.height < 8) continue
    const cs = getComputedStyle(el)
    if (cs.visibility !== "visible" || cs.display === "none") continue
    let hidden = false
    for (let a = el; a; a = a.parentElement) if (a.hasAttribute("inert") || getComputedStyle(a).opacity === "0") hidden = true
    if (hidden) continue
    /* Off in a carousel or a closed panel: not seen. */
    let clipped = false
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a)
      if (s.overflow === "visible" && s.overflowX === "visible" && s.overflowY === "visible") continue
      const b = a.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      if (cx < b.left || cx > b.right || cy < b.top || cy > b.bottom) clipped = true
    }
    if (clipped) continue
    if (r.height > 860) continue
    const text = (el.textContent || "").replace(/\s+/g, " ").trim()
    if (!text && !el.querySelector("svg, img")) continue
    const n = out.length
    el.setAttribute("data-hv", String(n))
    const block = el.closest("[data-op-block], [data-block-id]")
    out.push({
      n,
      tag: el.tagName.toLowerCase(),
      text: text.slice(0, 40),
      kind: el.matches(".op-btn") ? "button" : el.matches("[data-product-block]") ? "product" : el.matches("[data-op-social-icon]") ? "social" : el.matches("button[type=submit]") ? "submit" : "other",
      productLayout: el.getAttribute("data-product-block") || el.closest("[data-product-block]")?.getAttribute("data-product-block") || null,
      block: block?.getAttribute("data-op-block") || block?.getAttribute("data-block-id") || null,
    })
  }
  return out
}

/** The words of control n: each element with words of its own, its glyph boxes and colour (faded by its ancestors). */
const WORDS = (n) => {
  const cv = document.createElement("canvas")
  cv.width = cv.height = 1
  const cx = cv.getContext("2d", { willReadFrequently: true })
  const parse = (s) => {
    if (!s) return null
    cx.clearRect(0, 0, 1, 1)
    cx.fillStyle = "rgba(0,0,0,0)"
    cx.fillStyle = s
    cx.fillRect(0, 0, 1, 1)
    const d = cx.getImageData(0, 0, 1, 1).data
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }
  }
  const root = document.querySelector(`[data-hv="${n}"]`)
  if (!root) return []
  const out = []
  for (const el of [root, ...root.querySelectorAll("*")]) {
    if (el.closest("svg, [aria-hidden='true'], iframe")) continue
    const nodes = [...el.childNodes].filter((c) => c.nodeType === 3 && c.textContent.trim())
    if (!nodes.length) continue
    const cs = getComputedStyle(el)
    if (cs.visibility !== "visible" || cs.display === "none") continue
    if (/text/.test(cs.backgroundClip || cs.webkitBackgroundClip || "")) continue
    const fill = parse(cs.webkitTextFillColor)
    if (fill && fill.a === 0) continue
    let fade = 1
    for (let a = el; a; a = a.parentElement) fade *= parseFloat(getComputedStyle(a).opacity)
    if (fade < 0.05) continue
    const color = parse(cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color ? cs.webkitTextFillColor : cs.color)
    const rects = []
    for (const t of nodes) {
      const range = document.createRange()
      range.selectNodeContents(t)
      rects.push(...[...range.getClientRects()].filter((r) => r.width >= 2 && r.height >= 4).map((r) => ({ left: r.left, top: r.top, width: r.width, height: r.height })))
    }
    /* Only what the control's clipping boxes show (a truncated line, a card's corner). */
    let shown = rects
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a)
      if (s.overflow === "visible" && s.overflowX === "visible" && s.overflowY === "visible") continue
      const b = a.getBoundingClientRect()
      shown = shown
        .map((r) => {
          const l = Math.max(r.left, b.left)
          const t = Math.max(r.top, b.top)
          return { left: l, top: t, width: Math.min(r.left + r.width, b.right) - l, height: Math.min(r.top + r.height, b.bottom) - t }
        })
        .filter((r) => r.width >= 2 && r.height >= 4)
    }
    if (!shown.length || !color) continue
    const halo = cs.textShadow && cs.textShadow !== "none" ? parse((/(rgba?\([^)]*\)|#[0-9a-f]{3,8})/i.exec(cs.textShadow) || [])[1]) : null
    const size = parseFloat(cs.fontSize) || 16
    const weight = parseInt(cs.fontWeight) || 400
    out.push({
      words: nodes.map((t) => t.textContent).join(" ").replace(/\s+/g, " ").trim().slice(0, 40),
      color: { ...color, a: color.a * fade },
      raw: cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color ? cs.webkitTextFillColor : cs.color,
      halo: halo && halo.a >= 0.35 ? halo : null,
      min: size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5,
      rects: shown,
    })
  }
  return out
}

/** The button boxes of control n whose edge must show: the control when it is a button, and a product's button. */
const BOXES = (n) => {
  const root = document.querySelector(`[data-hv="${n}"]`)
  if (!root) return []
  const boxes = []
  const add = (el, what) => {
    /* A button drawn as words alone (a form's "Subscribe →", no fill, border or shadow) has no edge to show. */
    const cs = getComputedStyle(el)
    const painted = (v) => v && v !== "none" && !/^rgba\(\d+, \d+, \d+, 0\)$/.test(v) && v !== "transparent"
    if (!painted(cs.backgroundColor) && cs.backgroundImage === "none" && !(parseFloat(cs.borderTopWidth) > 0 && painted(cs.borderTopColor)) && cs.boxShadow === "none") return
    const r = el.getBoundingClientRect()
    if (r.width > 8 && r.height > 8) boxes.push({ what, left: r.left, top: r.top, width: r.width, height: r.height })
  }
  /* A block given its own surface by the creator (Design › block › Layout) wears the colour they chose, the page's own included. */
  if (root.closest("[data-block-bg]")) return boxes
  if (root.matches(".op-btn:not([data-visual-link-action]), button[type=submit]")) add(root, "button")
  for (const cta of root.querySelectorAll("[data-product-cta]")) add(cta, "product button")
  return boxes
}

/** Every word's colour in control n, for the hover timeline. */
const COLOURS = (n) => {
  const root = document.querySelector(`[data-hv="${n}"]`)
  if (!root) return []
  const out = []
  for (const el of [root, ...root.querySelectorAll("*")]) {
    if (![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue
    const cs = getComputedStyle(el)
    out.push(cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color ? cs.webkitTextFillColor : cs.color)
  }
  return out
}

/* Words made clear: the fill of every glyph, at a weight no page rule reaches; the guard's own inline colours and outlines are lifted too. */
const HIDE_CSS = "*:not(#z0):not(#z1):not(#z2):not(#z3),*:not(#z0):not(#z1):not(#z2):not(#z3)::before,*:not(#z0):not(#z1):not(#z2):not(#z3)::after{-webkit-text-fill-color:transparent !important;text-shadow:none !important;text-decoration-color:transparent !important;caret-color:transparent !important}*:not(#z0):not(#z1):not(#z2):not(#z3)::placeholder{-webkit-text-fill-color:transparent !important}"
const HIDE = (css) => {
  const s = document.createElement("style")
  s.id = "__hv_hide"
  s.textContent = css
  document.head.appendChild(s)
  window.__hvInline = []
  for (const el of document.querySelectorAll("[style*='text-fill-color'], [style*='text-shadow']")) {
    window.__hvInline.push([el, el.getAttribute("style")])
    el.style.removeProperty("-webkit-text-fill-color")
    el.style.removeProperty("text-shadow")
  }
}
const SHOW = () => {
  document.getElementById("__hv_hide")?.remove()
  for (const [el, style] of window.__hvInline || []) el.setAttribute("style", style)
  window.__hvInline = []
}

/** The pixels of a clip (a PNG) under each word, and each button's edge against what is around it. */
const MEASURE = async ({ png, words, boxes, clip }) => {
  const img = new Image()
  img.src = png
  await img.decode()
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const px = (x, y) => {
    x = Math.floor(x - clip.x)
    y = Math.floor(y - clip.y)
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null
    const i = (y * canvas.width + x) * 4
    return { r: data[i], g: data[i + 1], b: data[i + 2] }
  }
  const lin = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }
  const bad = []
  for (const w of words) {
    const ratios = []
    const grounds = []
    for (const r of w.rects)
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 3; j++) {
          const g = px(r.left + ((i + 0.5) / 8) * r.width, r.top + ((j + 0.5) / 3) * r.height)
          if (!g) continue
          grounds.push(g)
          const a = w.color.a
          ratios.push(ratio({ r: w.color.r * a + g.r * (1 - a), g: w.color.g * a + g.g * (1 - a), b: w.color.b * a + g.b * (1 - a) }, g))
        }
    if (!ratios.length) continue
    ratios.sort((p, q) => p - q)
    if (w.halo && grounds.length) {
      const g = grounds[Math.floor(grounds.length / 2)]
      const h = { r: w.halo.r * w.halo.a + g.r * (1 - w.halo.a), g: w.halo.g * w.halo.a + g.g * (1 - w.halo.a), b: w.halo.b * w.halo.a + g.b * (1 - w.halo.a) }
      if (ratio(w.color, h) >= w.min) continue
    }
    const at = ratios[Math.floor(ratios.length * 0.2)]
    if (at + 0.05 < w.min) bad.push({ words: w.words, ratio: Math.round(at * 100) / 100, min: w.min, color: w.raw })
  }
  /* A button's edge: the median of a band just inside it (its border, its fill) against the median just outside. */
  const median = (list) => {
    const s = list.filter(Boolean).sort((a, b) => lum(a) - lum(b))
    return s.length ? s[Math.floor(s.length / 2)] : null
  }
  /* One side of the box, `d` px out (in when negative), along its middle (a rounded corner is the page). */
  const side = (b, d, k) => {
    const pts = []
    const L = b.left - d
    const T = b.top - d
    const W = b.width + 2 * d
    const H = b.height + 2 * d
    for (let i = 0; i < 16; i++) {
      const f = 0.3 + (0.4 * i) / 15
      pts.push(k === 0 ? px(L + f * W, T) : k === 1 ? px(L + f * W, T + H - 1) : k === 2 ? px(L, T + f * H) : px(L + W - 1, T + f * H))
    }
    return pts
  }
  /* The edge shows on a side when its border, its fill or a hairline just outside differs from what lies beyond: the best side counts (a pill's ends are curves). */
  const edges = boxes.map((b) => {
    let best = 1
    let any = false
    for (let k = 0; k < 4; k++) {
      const outside = median([...side(b, 4, k), ...side(b, 6, k)])
      if (!outside) continue
      any = true
      for (const d of [-0.5, -1.5, -2.5, -7, 0.5, 1.5]) {
        const m = median(side(b, d, k))
        if (m) best = Math.max(best, ratio(m, outside))
      }
    }
    return { what: b.what, edge: any ? Math.round(best * 100) / 100 : 99 }
  })
  return { bad, edges }
}

/* ── One page ─────────────────────────────────────────────────────────── */

const MOUSE_OFF = { x: 2, y: 2 }
async function calmSpot(page) {
  /* A point over no control (the page's margin or a text block), for "the pointer is elsewhere". */
  const spot = await page.evaluate(() => {
    const W = innerWidth
    const H = innerHeight
    for (const y of [4, H - 4, H / 2, 40, H - 40])
      for (const x of [2, W - 3, W / 2, 20, W - 20]) {
        const e = document.elementFromPoint(x, y)
        if (e && !e.closest("a, button, [role=button], summary, .op-host, .op-btn, .op-card, .op-demo, input, textarea")) return { x, y }
      }
    return null
  })
  return spot || MOUSE_OFF
}

async function shoot(page, n, words, boxes, pad = 10) {
  const box = await page.evaluate((n) => {
    const r = document.querySelector(`[data-hv="${n}"]`)?.getBoundingClientRect()
    return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
  }, n)
  if (!box) return null
  const vw = await page.evaluate(() => [innerWidth, innerHeight, visualViewport.pageLeft, visualViewport.pageTop])
  const x = Math.max(0, Math.floor(box.x - pad))
  const y = Math.max(0, Math.floor(box.y - pad))
  const clip = { x, y, width: Math.min(vw[0] - x, Math.ceil(box.w + 2 * pad)), height: Math.min(vw[1] - y, Math.ceil(box.h + 2 * pad)) }
  if (clip.width < 4 || clip.height < 4) return null
  const t0 = Date.now()
  await page.evaluate(HIDE, HIDE_CSS)
  /* A clip is in the page's coordinates (puppeteer), the words in the viewport's. */
  const shot = await page.screenshot({ encoding: "base64", clip: { ...clip, x: clip.x + vw[2], y: clip.y + vw[3] }, captureBeyondViewport: false })
  await page.evaluate(SHOW)
  if (process.env.TIMING) console.log("shot", Date.now() - t0)
  measured++
  return page.evaluate(MEASURE, { png: `data:image/png;base64,${shot}`, words, boxes, clip })
}

/** A colour string's luminance (rgb()/rgba() as the browser computes them). */
function lumOf(c) {
  const m = /rgba?\(([^)]+)\)/.exec(c || "")
  if (!m) return null
  const [r, g, b] = m[1].split(/[ ,/]+/).map(Number)
  const lin = (v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/**
 * The words' colour turning back on itself while the pointer arrives (or leaves): rest → hover is one way (a fade
 * is a straight line between two colours); going there and back, or on to a third, is a second hover. The guard
 * "fixing" a hovered word against the rest colour was exactly this: black → white → black on Classic 98's navy.
 */
function reversals(timeline) {
  const out = []
  for (let k = 0; k < (timeline[0] || []).length; k++) {
    const seq = timeline.map((s) => s[k]).filter((v, i, a) => i === 0 || v !== a[i - 1])
    const lums = seq.map(lumOf)
    let dir = 0
    let turns = 0
    for (let i = 1; i < lums.length; i++) {
      if (lums[i] === null || lums[i - 1] === null) continue
      const d = lums[i] - lums[i - 1]
      if (Math.abs(d) < 0.004) continue
      const s = Math.sign(d)
      if (dir && s !== dir) turns++
      dir = s
    }
    if (turns) out.push(seq.filter((_, i) => i === 0 || i === seq.length - 1 || turns).slice(0, 6))
  }
  return out
}

/** The colours held 75ms or more (three samples) in a timeline: the states the words went through. */
function plateaus(timeline) {
  const states = []
  for (let k = 0; k < (timeline[0] || []).length; k++) {
    const seq = timeline.map((s) => s[k])
    const held = []
    let run = 1
    for (let i = 1; i <= seq.length; i++) {
      if (i < seq.length && seq[i] === seq[i - 1]) run++
      else {
        if (run >= 3 && held[held.length - 1] !== seq[i - 1]) held.push(seq[i - 1])
        run = 1
      }
    }
    states.push(held)
  }
  return states
}

async function auditPage({ path, width, label, states }, browser) {
  const page = await browser.newPage()
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 })
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`${base}${path}${GUARD ? "" : "&guard=0"}`)
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]))
  await sleep(900)
  /* Entrances end; endless motion (a scene, a swipe) keeps going, as a visitor sees it. */
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      try {
        if (a.effect?.getComputedTiming().endTime !== Infinity) a.finish()
      } catch {}
    }
  })
  await sleep(500)
  const controls = await page.evaluate(ENUMERATE)
  controlsSeen += controls.length
  const want = states.filter
  const list = controls.filter((c) => !want || want(c))
  const pageFails = []
  const shotsFor = []
  for (const c of list) {
    const where = `${label} #${c.n} ${c.kind}${c.productLayout ? `(${c.productLayout})` : ""} "${c.text}"`
    const ok = await page.evaluate((n) => {
      const el = document.querySelector(`[data-hv="${n}"]`)
      if (!el) return false
      el.scrollIntoView({ block: "center", inline: "nearest" })
      return true
    }, c.n)
    if (!ok) continue
    let calm = await calmSpot(page)
    await page.mouse.move(calm.x, calm.y)
    await sleep(260)
    /* REST */
    const restWords = await page.evaluate(WORDS, c.n)
    const restBoxes = await page.evaluate(BOXES, c.n)
    const rest = await shoot(page, c.n, restWords, restBoxes)
    if (!rest) continue
    for (const b of rest.bad) pageFails.push(`${where} at rest: "${b.words}" ${b.ratio}:1 < ${b.min} (${b.color})`)
    for (const e of rest.edges) if (e.edge < 1.15) pageFails.push(`${where} at rest: the ${e.what}'s edge does not show (${e.edge}:1)`)
    const restColours = await page.evaluate(COLOURS, c.n)
    const shotClip = SHOTS ? await page.evaluate((n) => { const b = document.querySelector(`[data-hv="${n}"]`).getBoundingClientRect(); return { x: Math.max(0, b.left - 12) + visualViewport.pageLeft, y: Math.max(0, b.top - 12) + visualViewport.pageTop, width: Math.min(innerWidth, b.width + 24), height: Math.min(innerHeight - Math.max(0, b.top - 12), b.height + 24) } }, c.n) : null
    const restShot = shotClip ? await page.screenshot({ clip: shotClip, encoding: "base64", captureBeyondViewport: false }) : null
    /* HOVER, with the words' colours sampled as the pointer arrives and rests */
    const box = await page.evaluate((n) => {
      const r = document.querySelector(`[data-hv="${n}"]`).getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, r.height - 6) }
    }, c.n)
    const th0 = Date.now()
    const timeline = [restColours]
    await page.mouse.move(box.x, box.y)
    /* The colour timeline on the full walk; the layout and design walks look at where the hover settles. */
    if (states.focus)
      for (let i = 0; i < 20; i++) {
        await sleep(25)
        timeline.push(await page.evaluate(COLOURS, c.n))
      }
    else await sleep(450)
    await sleep(150)
    timeline.push(await page.evaluate(COLOURS, c.n), await page.evaluate(COLOURS, c.n), await page.evaluate(COLOURS, c.n))
    if (process.env.TIMING) console.log("hover timeline", Date.now() - th0)
    const hoverWords = await page.evaluate(WORDS, c.n)
    const hoverBoxes = await page.evaluate(BOXES, c.n)
    const hover = await shoot(page, c.n, hoverWords, hoverBoxes)
    if (hover) {
      for (const b of hover.bad) pageFails.push(`${where} on hover: "${b.words}" ${b.ratio}:1 < ${b.min} (${b.color})`)
      if (process.env.DEBUG && hover.bad.length) console.log(await page.evaluate((n) => [...document.querySelector(`[data-hv="${n}"]`).querySelectorAll("[style], [data-op-legible]")].map((e) => `${e.tagName} ${e.getAttribute("data-op-legible") || ""} ${(e.getAttribute("style") || "").replace(/.*?(color|--op-fill)/, "$1").slice(0, 160)}`).join("\n"), c.n))
      for (const e of hover.edges) if (e.edge < 1.15) pageFails.push(`${where} on hover: the ${e.what}'s edge does not show (${e.edge}:1)`)
    }
    const held = plateaus(timeline)
    held.forEach((h, k) => {
      if (h.length > 2) pageFails.push(`${where}: a hover with ${h.length} text colours (${h.join(" → ")}): one hover is rest and hover`)
    })
    for (const r of reversals(timeline)) pageFails.push(`${where}: the words' colour turns back during the hover (${r.join(" → ")})`)
    if (SHOTS && (pageFails.length && pageFails[pageFails.length - 1].startsWith(where))) {
      shotsFor.push({ n: c.n, rest: restShot, hover: await page.screenshot({ clip: shotClip, encoding: "base64", captureBeyondViewport: false }) })
    }
    /* LEAVE: back to the rest colour, in one step */
    calm = await calmSpot(page)
    await page.mouse.move(calm.x, calm.y)
    const after = [timeline[timeline.length - 1]]
    if (states.focus)
      for (let i = 0; i < 12; i++) {
        await sleep(25)
        after.push(await page.evaluate(COLOURS, c.n))
      }
    await sleep(300)
    const back = await page.evaluate(COLOURS, c.n)
    after.push(back, back, back)
    if (back.join() !== restColours.join()) pageFails.push(`${where}: after the pointer leaves the words stay ${back.filter((v, i) => v !== restColours[i]).join(", ")} (rest was ${restColours.filter((v, i) => v !== back[i]).join(", ")})`)
    plateaus(after).forEach((h) => {
      if (h.length > 2) pageFails.push(`${where}: leaving goes through ${h.length} text colours (${h.join(" → ")})`)
    })
    for (const r of reversals(after)) pageFails.push(`${where}: the words' colour turns back as the pointer leaves (${r.join(" → ")})`)
    if (states.focus) {
      /* FOCUS (from the keyboard) */
      await page.keyboard.press("Shift")
      await page.evaluate((n) => document.querySelector(`[data-hv="${n}"]`).focus({ focusVisible: true }), c.n)
      await sleep(260)
      const fw = await page.evaluate(WORDS, c.n)
      const fr = await shoot(page, c.n, fw, [])
      if (fr) for (const b of fr.bad) pageFails.push(`${where} focused: "${b.words}" ${b.ratio}:1 < ${b.min} (${b.color})`)
      await page.evaluate(() => document.activeElement?.blur())
      /* PRESSED (the pointer down on it, released elsewhere so nothing opens) */
      await page.mouse.move(box.x, box.y)
      await sleep(260)
      await page.mouse.down()
      await sleep(200)
      const pw = await page.evaluate(WORDS, c.n)
      const pr = await shoot(page, c.n, pw, [])
      if (pr) for (const b of pr.bad) pageFails.push(`${where} pressed: "${b.words}" ${b.ratio}:1 < ${b.min} (${b.color})`)
      calm = await calmSpot(page)
      await page.mouse.move(calm.x, calm.y)
      await page.mouse.up()
      await page.evaluate(() => document.activeElement?.blur())
      await sleep(120)
    }
  }
  /* CONSISTENT: the product buttons on one page wear the same paint as each other. */
  if (states.consistent) {
    const sigs = await page.evaluate(() =>
      [...document.querySelectorAll("[data-product-cta]")]
        .filter((e) => e.getClientRects().length && !e.closest("[data-product-block='overlay']") && !e.closest("[data-block-id='p-own'], [data-op-block='p-own']"))
        .map((e) => {
          const cs = getComputedStyle(e)
          const host = e.closest("[data-product-block]")
          /* Siblings are buttons on the same ground: a card's (its paint) or the page's (Minimal has no card). */
          const hs = host ? getComputedStyle(host) : null
          return { layout: host?.getAttribute("data-product-block"), on: hs ? `${hs.backgroundColor} ${hs.backgroundImage.slice(0, 30)}` : "page", sig: [cs.backgroundColor, cs.backgroundImage.slice(0, 40), cs.color, cs.borderTopLeftRadius, cs.borderTopWidth, cs.borderTopColor].join(" | ") }
        }),
    )
    const byGround = new Map()
    for (const s of sigs) byGround.set(s.on, [...(byGround.get(s.on) || []), s])
    for (const list of byGround.values()) {
    const groups = new Map()
    for (const s of list) groups.set(s.sig, [...(groups.get(s.sig) || []), s.layout])
    if (groups.size > 1) pageFails.push(`${label}: the product buttons are not drawn alike: ${[...groups].map(([sig, l]) => `${l.join("/")} = ${sig}`).join("  ≠  ")}`)
    }
  }
  if (errors.length) pageFails.push(`${label}: page errors ${errors.slice(0, 2).join("; ")}`)
  if (SHOTS && pageFails.length) {
    const safe = label.replace(/[^a-z0-9-]+/gi, "_")
    for (const s of shotsFor) {
      writeFileSync(`${SHOTS}/${safe}-${s.n}-hover.png`, Buffer.from(s.hover, "base64"))
      if (s.rest) writeFileSync(`${SHOTS}/${safe}-${s.n}-rest.png`, Buffer.from(s.rest, "base64"))
    }
  }
  await page.close()
  for (const f of pageFails) fail(label, f.slice(label.length + 1).trim() || f)
  console.log(`${pageFails.length ? "  FAIL" : "  ok  "} ${label}: ${list.length} controls${pageFails.length ? `, ${pageFails.length} problems` : ""}`)
  for (const f of pageFails.slice(0, 12)) console.log(`         ${f}`)
  if (pageFails.length > 12) console.log(`         …+${pageFails.length - 12}`)
}

/* ── Every theme ───────────────────────────────────────────────────────── */

const probe = await browser.newPage()
await probe.goto(`${base}/app/onepage?t=default`)
await sleep(600)
let themes = await probe.evaluate(() => globalThis.__themeIds || [])
let settings = await probe.evaluate(() => globalThis.__settings || [])
await probe.close()
if (process.env.THEMES) themes = process.env.THEMES.split(",")
if (process.env.SETTINGS) settings = process.env.SETTINGS.split(",")
console.log(`\n${themes.length} themes in the picker${GUARD ? "" : " (GUARD=0: without the guard)"}; walking ${ONLY.join(", ")}`)

const jobs = []
const pageButtons = (c) => c.kind === "button" || c.kind === "product" || c.kind === "submit"
/* A design's walk: a plain link, one with an icon, the highlighted one, the owner's "My Link", one with its own surface, a group's, every product, the forms' buttons. */
const DESIGN_BLOCKS = new Set(["l1", "l2", "l4", "lv1", "lo1", "lv2", "g1", "gl1", "e1", "e-bold", "cf1", "lm1", "pdf1"])
const designButtons = (c) => pageButtons(c) && (c.kind === "product" || DESIGN_BLOCKS.has(c.block))
for (const t of themes) {
  if (ONLY.includes("full")) jobs.push({ path: `/app/onepage?t=${t}`, width: 390, label: `${t} 390`, states: { focus: true, consistent: true } })
  if (ONLY.includes("layouts")) {
    for (const l of ["grid", "cards", "compact", "masonry"]) jobs.push({ path: `/app/onepage?t=${t}&l=${l}`, width: 390, label: `${t} ${l} 390`, states: { filter: (c) => c.kind === "button" } })
    jobs.push({ path: `/app/onepage?t=${t}`, width: 1280, label: `${t} 1280`, states: { filter: pageButtons, consistent: true } })
  }
  if (ONLY.includes("settings")) for (const s of settings) jobs.push({ path: `/app/onepage?t=${t}&s=${s}`, width: 390, label: `${t} own ${s} 390`, states: { filter: designButtons, consistent: true } })
}
const started = Date.now()
let next = 0
await Promise.all(
  Array.from({ length: Math.max(1, CONC) }, async () => {
    let own = await launch()
    while (next < jobs.length) {
      const job = jobs[next++]
      try {
        await auditPage(job, own)
      } catch (e) {
        await own.close().catch(() => {})
        own = await launch()
        /* A browser lost under it (the box is shared): once more, in a new one. */
        if (!job.retried && /Target closed|Connection closed|timed out|detached/i.test(String(e?.message || e))) {
          job.retried = true
          jobs.push(job)
          console.log(`  …  ${job.label}: the browser went away, walking it again`)
          continue
        }
        fail(job.label, `the walk broke: ${String(e?.message || e).slice(0, 200)}`)
        console.log(`  FAIL ${job.label}: the walk broke: ${String(e?.message || e).slice(0, 200)}`)
      }
    }
    await own.close()
  }),
)

await browser.close()
server.close()
console.log(`\n${jobs.length} pages, ${controlsSeen} controls, ${measured} states measured in ${Math.round((Date.now() - started) / 1000)}s`)
if (process.env.REPORT) writeFileSync(process.env.REPORT, failures.join("\n") + "\n")
if (failed) {
  console.log(`\n${failed} failed`)
  process.exit(1)
}
console.log("\nall passed")
