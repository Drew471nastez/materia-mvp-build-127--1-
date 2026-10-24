/**
 * storelib.com's front page hero, measured in headless Chromium at 390 and 1280.
 *
 *   NOTHING SPILLS SIDEWAYS. The document is no wider than the window.
 *
 *   NOTHING SHIFTS. Every layout-shift entry from the server's first paint,
 *   through hydration and six seconds of typing and sliding, summed. Zero.
 *   And the heading's height is the same in every sample.
 *
 *   THE SLIDER MOVES SMOOTHLY. Frame gaps sampled while it glides on its own:
 *   the median, the 95th percentile and the longest one.
 *
 *   A DRAG HOLDS THE SLIDE UNDER THE POINTER and lets go onto one slide: the
 *   centre slide follows the pointer (mouse at 1280, touch at 390) and, after
 *   the release, one slide is centred to the pixel.
 *
 *   IT STOPS WHEN NOBODY IS LOOKING. Scrolled away, under a resting mouse and
 *   under reduced motion, neither the slider nor the typing changes.
 *
 *   THE BUTTON SAYS WHO IS LOOKING, through the auth snapshot the header
 *   writes: Start Now, Start Creating, Dashboard, to /sell, /sell and /app. A
 *   label that arrives late changes neither the button's width nor anything
 *   around it.
 *
 *   THE TEXT IS READABLE. Each line of text against the lightest pixel behind
 *   it (read from a screenshot with the text hidden) is at least 4.5:1.
 *
 *   node scripts/check-home-hero.mjs        (no build needed)
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inflateSync } from "node:zlib"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

let passed = 0
let failed = 0
const check = (label, ok, detail = "") => {
  if (ok) { passed++; console.log(`  ok    ${label}${detail ? `  (${detail})` : ""}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail ? `  (${detail})` : ""}`) }
}

const cssPath = join(root, "app/globals.css")
const css = (await postcss([tailwind({ base: root })]).process(readFileSync(cssPath, "utf8"), { from: cssPath })).css

const out = mkdtempSync(join(tmpdir(), "storelib-home-hero-"))
const stubs = join(root, ".home-hero-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, quality, ...rest }) {
  return React.createElement("img", { src, alt, ...rest, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined })
}
`)
try {
  execFileSync("npx", [
    "--no-install", "esbuild", join(root, "scripts/render-home-hero.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
    `--outfile=${join(out, "probe.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/link=${join(stubs, "link.jsx")}`,
    `--alias:next/image=${join(stubs, "image.jsx")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
  ], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
const file = join(out, "index.html")
writeFileSync(file,
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;background:#fff}</style>` +
  `<script>window.__err=[];window.__cls=0;window.__shifts=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))});` +
  `new PerformanceObserver(function(l){l.getEntries().forEach(function(e){window.__cls+=e.value;window.__shifts.push({v:e.value,at:Math.round(e.startTime),src:(e.sources||[]).map(function(s){return s.node&&s.node.nodeName+"."+(s.node.className||"")})})})}).observe({type:"layout-shift",buffered:true})</script>` +
  `</head><body><div id="app"></div><script src="probe.js"></script></body></html>`)

/* ── The browser ─────────────────────────────────────────────────────── */
const proc = spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--hide-scrollbars", "--allow-file-access-from-files",
  "--force-device-scale-factor=1", "--remote-debugging-port=0", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] })
const endpoint = await new Promise((resolve, reject) => {
  let buf = ""
  const timer = setTimeout(() => reject(new Error("the browser never announced a debugging port")), 20000)
  proc.stderr.on("data", (d) => {
    buf += d.toString()
    const m = buf.match(/ws:\/\/[^\s]+/)
    if (m) { clearTimeout(timer); resolve(m[0]) }
  })
})
const ws = new WebSocket(endpoint)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("could not attach to the browser")) })
let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  }
}
const send = (method, params, sessionId) => new Promise((resolve, reject) => {
  const n = ++id
  pending.set(n, { resolve, reject })
  ws.send(JSON.stringify(sessionId ? { id: n, method, params, sessionId } : { id: n, method, params }))
})

async function page({ width, height, phone, hash, reduced = false }) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" })
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
  const call = (m, p) => send(m, p, sessionId)
  await call("Page.enable", {})
  await call("Runtime.enable", {})
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: phone })
  await call("Emulation.setEmulatedMedia", {
    features: [
      { name: "hover", value: phone ? "none" : "hover" },
      { name: "pointer", value: phone ? "coarse" : "fine" },
      { name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" },
    ],
  })
  if (phone) await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })
  await call("Page.navigate", { url: `file://${file}#${hash}` })
  const js = async (expression) => {
    const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) fail(`The page threw: ${JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text)}\n${expression.slice(0, 160)}`)
    return r.result.value
  }
  for (let i = 0; i < 80; i++) {
    if (await js("!!window.__ready")) break
    await sleep(100)
  }
  await sleep(300)
  const errs = await js("JSON.stringify(window.__err)")
  if (errs !== "[]") fail(`The page reported errors: ${errs}`)
  async function shot(clip) {
    const { data } = await call("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 }, captureBeyondViewport: false })
    return decodePng(Buffer.from(data, "base64"))
  }
  const mouse = (type, x, y) => call("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "mouse" })
  const hover = (x, y) => call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0, pointerType: "mouse" })
  const touch = (type, points) => call("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], i) => ({ x, y, id: i + 1 })) })
  return { call, js, shot, mouse, hover, touch, close: () => send("Target.closeTarget", { targetId }) }
}

/** An RGBA or RGB PNG as { w, h, px(x, y) }. Handles every filter type. */
function decodePng(png) {
  let off = 8, idat = [], w = 0, h = 0, colorType = 6
  while (off < png.length) {
    const len = png.readUInt32BE(off)
    const type = png.toString("ascii", off + 4, off + 8)
    const body = png.subarray(off + 8, off + 8 + len)
    if (type === "IHDR") { w = body.readUInt32BE(0); h = body.readUInt32BE(4); colorType = body[9] }
    if (type === "IDAT") idat.push(body)
    off += 12 + len
  }
  const bpp = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  const data = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]
      const a = x >= bpp ? data[y * stride + x - bpp] : 0
      const b = y > 0 ? data[(y - 1) * stride + x] : 0
      const c = x >= bpp && y > 0 ? data[(y - 1) * stride + x - bpp] : 0
      let p = v
      if (f === 1) p = v + a
      else if (f === 2) p = v + b
      else if (f === 3) p = v + ((a + b) >> 1)
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
        p = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
      }
      data[y * stride + x] = p & 255
    }
  }
  return { w, h, px: (x, y) => { const i = y * stride + x * bpp; return [data[i], data[i + 1], data[i + 2]] } }
}

const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const parseColor = (s) => { const m = s.match(/[\d.]+/g).map(Number); return { rgb: m.slice(0, 3), a: m.length > 3 ? m[3] : 1 } }
const over = (fg, bg) => fg.rgb.map((c, i) => c * fg.a + bg[i] * (1 - fg.a))

/* Reads the state of the slider and the heading in one go. */
const STATE = `(() => {
  const stage = document.querySelector("[data-hero-carousel]")
  const sr = stage.getBoundingClientRect()
  const slides = [...stage.querySelectorAll("[data-hero-slide]")]
  const typed = document.querySelector("[data-hero-typed]")
  const line = typed.querySelector("[data-hero-line]"); const shown = line.children.length ? [...line.children].filter((c) => !c.hasAttribute("data-off")).map((c) => c.textContent).join("") : line.textContent
  const h1 = document.querySelector("[data-home-hero] h1").getBoundingClientRect()
  const centred = slides.find((s) => s.hasAttribute("data-centre"))
  const cr = centred.getBoundingClientRect()
  return {
    transforms: slides.map((s) => s.style.transform).join("|"),
    centreIndex: Number(centred.dataset.heroSlide),
    centreOffset: (cr.left + cr.width / 2) - (sr.left + sr.width / 2),
    slideX: slides.map((x) => { const r = x.getBoundingClientRect(); return r.left + r.width / 2 }),
    moving: stage.hasAttribute("data-moving"),
    stageMid: { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 },
    shown, h1Height: h1.height,
    ghosts: [...typed.querySelectorAll("[data-ghost]")].map((g) => g.getBoundingClientRect().height),
    cls: window.__cls, shifts: window.__shifts,
    scrollW: document.scrollingElement.scrollWidth, innerW: innerWidth,
  }
})()`

for (const size of [{ width: 390, height: 844, phone: true }, { width: 1280, height: 860, phone: false }]) {
  console.log(`\n── ${size.width}px ${size.phone ? "(touch)" : "(mouse)"} ──`)
  const p = await page({ ...size, hash: "guest" })
  /* HERO_SHOTS=<dir> keeps a picture of each width for a person to look at. */
  if (process.env.HERO_SHOTS) {
    await sleep(900)
    const { data } = await p.call("Page.captureScreenshot", { format: "png" })
    writeFileSync(join(process.env.HERO_SHOTS, `home-hero-${size.width}.png`), Buffer.from(data, "base64"))
  }

  /* Six seconds of typing and sliding, sampled. */
  const heights = new Set()
  const texts = new Set()
  const transforms = new Set()
  for (let i = 0; i < 30; i++) {
    const s = await p.js(STATE)
    heights.add(s.h1Height.toFixed(2)); texts.add(s.shown); transforms.add(s.transforms)
    await sleep(200)
  }
  const s = await p.js(STATE)
  check("no sideways scroll", s.scrollW <= s.innerW, `${s.scrollW} <= ${s.innerW}`)
  check("CLS over the first paint, hydration and 6s of motion is 0", s.cls === 0, `CLS ${s.cls.toFixed(4)}${s.shifts.length ? " " + JSON.stringify(s.shifts.slice(0, 4)) : ""}`)
  check("the heading's height never changed", heights.size === 1, [...heights].join(", ") + "px")
  check("it is the tallest phrase's height, reserved before any is typed", s.ghosts.length === 4 && Math.abs(Math.max(...s.ghosts) - s.h1Height) < 0.5, `phrases ${s.ghosts.map((g) => g.toFixed(1)).join(", ")}px, heading ${s.h1Height.toFixed(1)}px`)
  check("the heading typed (more than one state seen)", texts.size > 3, `${texts.size} states`)
  check("the slider autoplayed", transforms.size > 1, `${transforms.size} distinct poses`)

  /* Frame gaps while it glides on its own. */
  const frames = await p.js(`new Promise((done) => {
    const stage = document.querySelector("[data-hero-carousel]")
    const gaps = []; let last = 0; let seen = false
    const tick = (t) => {
      const moving = stage.hasAttribute("data-moving")
      if (moving) { if (last) gaps.push(t - last); last = t; seen = true }
      else if (seen && gaps.length > 10) return done(gaps)
      else last = 0
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    setTimeout(() => done(gaps), 9000)
  })`)
  if (frames.length) {
    const sorted = [...frames].sort((a, b) => a - b)
    const q = (f) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))]
    check("frames during a glide", q(0.95) < 34, `${frames.length} frames, median ${q(0.5).toFixed(1)}ms, p95 ${q(0.95).toFixed(1)}ms, longest ${sorted.at(-1).toFixed(1)}ms`)
  } else check("frames during a glide", false, "no glide seen in 9s")

  /* The button and its label. */
  const cta = await p.js(`(() => { const a = document.querySelector("[data-hero-cta]"); return { state: a.dataset.heroCta, href: a.getAttribute("href"), text: [...a.querySelectorAll("[data-hero-cta-label]")].find((x) => getComputedStyle(x).visibility === "visible").textContent, w: a.getBoundingClientRect().width } })()`)
  check("signed out: Start Now, to /sell", cta.state === "guest" && cta.text === "Start Now" && cta.href === "/sell", JSON.stringify(cta))

  /* Contrast of every line of text against the lightest pixel behind it. */
  await p.js(`window.scrollTo(0, 0)`)
  const targets = await p.js(`(() => {
    const hero = document.querySelector("[data-home-hero]")
    const cv = document.createElement("canvas"); cv.width = cv.height = 1
    const cx = cv.getContext("2d", { willReadFrequently: true })
    const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return "rgba(" + d[0] + "," + d[1] + "," + d[2] + "," + (d[3] / 255).toFixed(3) + ")" }
    /* The box the letters sit in, not the element's: a pill's rounded corners are not behind any text. */
    const textBox = (el) => { const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(); return { x: b.left, y: b.top + b.height * 0.15, w: b.width, h: b.height * 0.7 } }
    const pick = (el, name, box, color) => ({ name, ...box, color: rgba(color || getComputedStyle(el).color) })
    const ps = hero.querySelectorAll("p")
    const h1 = hero.querySelector("[data-hero-line]")
    const label = [...hero.querySelectorAll("[data-hero-cta-label]")].find((x) => getComputedStyle(x).visibility === "visible")
    const input = hero.querySelector("input[name=q]")
    const ir = input.getBoundingClientRect()
    return [
      pick(ps[0], "badge", textBox(ps[0])),
      pick(h1, "heading", textBox(h1)),
      pick(ps[1], "subheading", textBox(ps[1])),
      pick(label, "button", textBox(label)),
      pick(input, "search placeholder", { x: ir.left + 16, y: ir.top + 12, w: ir.width - 64, h: ir.height - 24 }, getComputedStyle(input, "::placeholder").color),
    ]
  })()`)
  await p.js(`(() => { const hero = document.querySelector("[data-home-hero]"); const st = document.createElement("style"); st.id = "hide"; st.textContent = "[data-home-hero] *{color:transparent!important;caret-color:transparent!important}[data-home-hero] input::placeholder{color:transparent!important}[data-home-hero] svg{visibility:hidden!important}[data-hero-line] span::after,[data-hero-line] span::before{display:none!important}"; document.head.appendChild(st) })()`)
  await sleep(100)
  for (const t of targets) {
    const clip = { x: Math.max(0, Math.floor(t.x)), y: Math.max(0, Math.floor(t.y)), width: Math.max(1, Math.floor(t.w)), height: Math.max(1, Math.floor(t.h)) }
    const img = await p.shot(clip)
    let worst = null
    let worstRatio = Infinity
    const fg = parseColor(t.color)
    for (let y = 0; y < img.h; y += 2) for (let x = 0; x < img.w; x += 2) {
      const bg = img.px(x, y)
      const r = ratio(over(fg, bg), bg)
      if (r < worstRatio) { worstRatio = r; worst = bg }
    }
    check(`contrast: ${t.name}`, worstRatio >= 4.5, `${worstRatio.toFixed(2)}:1, text ${t.color} on rgb(${worst?.join(",")})`)
  }
  await p.js(`document.getElementById("hide").remove()`)

  /* A drag: the centre slide follows the pointer, then one slide is centred. */
  if (!size.phone) await p.hover(10, 10)
  for (let i = 0; i < 50 && (await p.js(STATE)).moving; i++) await sleep(50)
  const before = await p.js(STATE)
  const { x: mx, y: my } = before.stageMid
  const dx = size.phone ? -190 : -380
  if (size.phone) {
    await p.touch("touchStart", [[mx, my]])
    for (let i = 1; i <= 10; i++) { await p.touch("touchMove", [[mx + (dx * i) / 10, my]]); await sleep(16) }
  } else {
    await p.mouse("mousePressed", mx, my)
    for (let i = 1; i <= 10; i++) { await p.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx + (dx * i) / 10, y: my, button: "left", buttons: 1, pointerType: "mouse" }); await sleep(16) }
  }
  await sleep(60)
  const mid = await p.js(STATE)
  const followed = mid.slideX[before.centreIndex] - before.slideX[before.centreIndex]
  check("the slide follows the pointer while held", Math.abs(followed - dx) <= Math.abs(dx) * 0.2, `pointer moved ${dx}px, slide moved ${followed.toFixed(1)}px`)
  /* Holding still: it does not slide away under the finger. */
  const held1 = await p.js(STATE); await sleep(800); const held2 = await p.js(STATE)
  check("nothing moves while held", held1.transforms === held2.transforms)
  await sleep(120)
  if (size.phone) await p.touch("touchEnd", [])
  else await p.mouse("mouseReleased", mx + dx, my)
  await sleep(1300)
  const after = await p.js(STATE)
  check("it lets go onto one slide, centred", Math.abs(after.centreOffset) < 1, `centre slide ${after.centreIndex}, ${after.centreOffset.toFixed(2)}px off the middle`)
  check("and moved on from where it was", after.centreIndex !== before.centreIndex, `${before.centreIndex} -> ${after.centreIndex}`)

  /* A quick flick carries further than a slow drag. */
  if (!size.phone) {
    await p.hover(10, 10)
    const f0 = await p.js(STATE)
    await p.mouse("mousePressed", mx, my)
    for (let i = 1; i <= 4; i++) { await p.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx - 90 * i, y: my, button: "left", buttons: 1, pointerType: "mouse" }); await sleep(8) }
    await p.mouse("mouseReleased", mx - 360, my)
    await sleep(1400)
    const f1 = await p.js(STATE)
    const n = 6
    const moved = (f1.centreIndex - f0.centreIndex + n) % n
    check("a flick carries with momentum", moved >= 1, `${f0.centreIndex} -> ${f1.centreIndex}, centred to ${f1.centreOffset.toFixed(2)}px`)
  }

  /* Paused under a resting mouse (desktop only, a phone has none). */
  if (!size.phone) {
    await p.hover(mx, my)
    await sleep(1200)
    const h1 = await p.js(STATE); await sleep(4500); const h2 = await p.js(STATE)
    check("a mouse resting on the slider stops it", h1.transforms === h2.transforms)
    await p.hover(10, 10)
  }

  /* Paused once scrolled away. */
  await p.js(`window.scrollTo(0, 2600)`)
  await sleep(1200)
  const o1 = await p.js(STATE); await sleep(4500); const o2 = await p.js(STATE)
  check("scrolled away, the slider stops", o1.transforms === o2.transforms)
  check("scrolled away, the typing stops", o1.shown === o2.shown)
  await p.js(`window.scrollTo(0, 0)`)

  /* Paused in a background tab. Headless Chromium never hides its own tab, so
     the page is told it is hidden the way the browser tells it: the property
     and the event. */
  await sleep(1500)
  await p.js(`(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")) })()`)
  await sleep(1200)
  const v1 = await p.js(STATE); await sleep(4500); const v2 = await p.js(STATE)
  check("tab hidden, the slider stops", v1.transforms === v2.transforms)
  check("tab hidden, the typing stops", v1.shown === v2.shown)
  await p.js(`(() => { delete document.visibilityState; document.dispatchEvent(new Event("visibilitychange")) })()`)
  const back1 = await p.js(STATE); await sleep(5000); const back2 = await p.js(STATE)
  check("shown again, it carries on", back1.transforms !== back2.transforms || back1.shown !== back2.shown)
  const fin = await p.js(STATE)
  check("CLS after all of it is still 0", fin.cls === 0, `CLS ${fin.cls.toFixed(4)}`)
  await p.close()

  /* Who is looking: each label, the link, and the width that never changes. */
  const widths = []
  for (const [hash, label, href] of [["guest", "Start Now", "/sell"], ["buyer", "Start Creating", "/sell"], ["creator", "Dashboard", "/app"], ["creator-late", "Dashboard", "/app"]]) {
    const q = await page({ ...size, hash })
    await sleep(hash.includes("late") ? 700 : 100)
    const c = await q.js(`(() => { const a = document.querySelector("[data-hero-cta]"); return { href: a.getAttribute("href"), text: [...a.querySelectorAll("[data-hero-cta-label]")].find((x) => getComputedStyle(x).visibility === "visible").textContent, w: a.getBoundingClientRect().width, cls: window.__cls } })()`)
    widths.push(c.w)
    check(`${hash}: ${label}, to ${href}`, c.text === label && c.href === href, `${c.text} -> ${c.href}, ${c.w.toFixed(1)}px wide, CLS ${c.cls}`)
    await q.close()
  }
  check("the button is one width whoever is looking", new Set(widths.map((w) => w.toFixed(2))).size === 1, widths.map((w) => w.toFixed(1)).join(", "))

  /* Reduced motion: the first phrase, still; the slider, still. */
  const r = await page({ ...size, hash: "guest", reduced: true })
  const r1 = await r.js(STATE); await sleep(5000); const r2 = await r.js(STATE)
  check("reduced motion: the slider does not autoplay", r1.transforms === r2.transforms)
  check("reduced motion: the heading is the first phrase, whole", r2.shown === "Build a business around what you create." && r1.shown === r2.shown, JSON.stringify(r2.shown))
  check("reduced motion: no caret", await r.js(`document.querySelector("[data-hero-line]").children.length === 0 && !document.querySelector("[data-caret]")`))
  await r.close()
}

ws.close()
proc.kill()
rmSync(out, { recursive: true, force: true })
console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
