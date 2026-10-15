/**
 * ===========================================================================
 *  ROUND 31: THE LIBRARY'S BUTTONS, THE FILES LIST, THE TRAY, LEAVE
 * ===========================================================================
 * The real components in headless Chromium, in the light and the dark look:
 *
 *   BUTTONS   every action on a purchase row (Download, "N files", More, each
 *             file's Download): its words against its own ground, its ground
 *             and its edge against the card, at rest, under a pointer and
 *             pressed; and a Download that is working is not dimmed
 *   FILES     "7 files" opened and closed on a phone and a computer, every
 *             frame: the list's height only ever grows while it opens and only
 *             ever shrinks while it closes, in many small steps, landing on
 *             the list's own height (or 0); the switch never moves; the
 *             chevron turns through the middle; a closed list takes no focus;
 *             the file rows line up (type mark, name, Download)
 *   TRAY      the app's download tray (scripts/render-library-round31.tsx
 *             drives the real store): a card rising in, a second one lifting
 *             the first, the preparing state holding its height, done folding
 *             the bar row away in steps, X sinking the card and folding its
 *             slot before it leaves the document, and reduced motion
 *   LEAVE     the community composer's "Leave without posting?" (the round 29
 *             harness, scripts/render-composer-round29.tsx): Leave's words
 *             against its ground and its ground against the sheet in both
 *             looks, Keep writing focused, the phone's sheet rising and
 *             falling frame by frame, the computer's dialog fading in and out
 *
 *   PROBE_CSS=source node scripts/check-library-round31.mjs [buttons|files|tray|leave ...]
 *
 * Pictures go to SHOTS_DIR (.round31-shots by default) to look at.
 */
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const shots = process.env.SHOTS_DIR || join(root, ".round31-shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".library-r31-probe")
mkdirSync(stubs, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* ── Colour arithmetic, in the probe ─────────────────────────────────────── */
const parse = (s) => {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(s || "")
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null
}
const over = (top, under) => {
  const a = top[3]
  return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1)
}
const lum = (c) => {
  const f = (v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return +((x + 0.05) / (y + 0.05)).toFixed(2)
}
const hex = (c) => "#" + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")

/* ── Stubs and the two pages ─────────────────────────────────────────────── */
writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: () => {}, back: () => history.back(), refresh: () => {} }
export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => router
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
writeFileSync(join(stubs, "dynamic.jsx"), `import React from "react"
export default function dynamic(load) { const Lazy = React.lazy(() => load().then((m) => ({ default: m && m.default ? m.default : m }))); return function Dynamic(props) { return React.createElement(Lazy, props) } }
`)
writeFileSync(join(stubs, "supabase-client.js"), `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}), send: async () => "ok" }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), signOut: async () => ({ error: null }) },
  }
}
export const isNativePlatform = () => false
`)
writeFileSync(join(stubs, "browser.js"), `export const Browser = { async open() { throw Object.assign(new Error("not implemented"), { code: "UNIMPLEMENTED" }) }, async close() {} }\n`)

const { build } = await import("esbuild")
const common = {
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": "./.library-r31-probe/navigation.js", "next/link": "./.library-r31-probe/link.jsx", "next/image": "./.library-r31-probe/image.jsx", "next/dynamic": "./.library-r31-probe/dynamic.jsx" },
  plugins: [{ name: "stubs", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })); b.onResolve({ filter: /^@capacitor\/browser$/ }, () => ({ path: join(stubs, "browser.js") })) } }],
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
}
await build({ ...common, entryPoints: [join(root, "scripts/render-library-round31.tsx")], outfile: join(stubs, "library.js") })
if (want("LEAVE")) await build({ ...common, entryPoints: [join(root, "scripts/render-composer-round29.tsx")], outfile: join(stubs, "composer.js") })

const css = await appCss(root)
const themeCss = readFileSync(join(root, "app/theme-dark.css"), "utf8")
/*
  A COMPUTER IS A MOUSE (scripts/check-composer-round30.mjs): this headless Chromium answers hover: none whatever it is
  told, so a computer's page is served with the mouse queries written as always true.
*/
const mouseQueries = (sheet) => sheet.replace(/\((?:any-)?hover:\s?hover\)/g, "(min-width: 0px)").replace(/\((?:any-)?pointer:\s?fine\)/g, "(min-width: 0px)")
const page = (js, mouse) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${interFaces(root)}${mouse ? mouseQueries(css) : css}</style><style>${mouse ? mouseQueries(themeCss) : themeCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${readFileSync(join(stubs, js), "utf8").replace(/<\/script/gi, "<\\/script")}</script></body></html>`
const PAGES = {
  library: { touch: page("library.js", false), mouse: page("library.js", true) },
  composer: want("LEAVE") ? { touch: page("composer.js", false), mouse: page("composer.js", true) } : null,
}

/* /api/download never answers: a Download stays at Preparing, which is the state being looked at. Released when its page closes, so held connections never starve the next page. */
const hanging = []
const release = () => { for (const r of hanging.splice(0)) r.destroy() }
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname.startsWith("/api/download/")) return void hanging.push(res)
  if (url.pathname.startsWith("/api/")) {
    res.writeHead(200, { "content-type": "application/json" })
    return res.end("{}")
  }
  const which = url.pathname.startsWith("/community") ? "composer" : "library"
  res.writeHead(200, { "content-type": "text/html" })
  res.end(PAGES[which][url.searchParams.get("mouse") === "1" ? "mouse" : "touch"])
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESK = { width: 1280, height: 900, deviceScaleFactor: 1 }
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })

async function open(vp, { dark = false, path = "/account/library", ready = "[data-library-item]", reduce = false } = {}) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  if (reduce) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 300)))
  const qs = [dark ? "dark=1" : "", vp.isMobile ? "" : "mouse=1"].filter(Boolean).join("&")
  await p.goto(`${origin}${path}${qs ? `?${qs}` : ""}`, { waitUntil: "load", timeout: 120000 })
  await p.evaluate(() => document.fonts.ready)
  await p.waitForSelector(ready, { timeout: 60000 }).catch((e) => {
    console.log("  page errors:", errors)
    throw e
  })
  await sleep(300)
  return { p, errors }
}

/* Records `measure()` (run in the page) on every frame for `ms` after `act` starts. */
const record = async (p, act, ms, measure) => {
  await p.evaluate((ms, src) => {
    const fn = new Function(`return (${src})()`)
    window.__trace = []
    const t0 = performance.now()
    const tick = () => {
      const t = performance.now() - t0
      try {
        window.__trace.push({ t: Math.round(t), ...fn() })
      } catch (e) {
        window.__trace.push({ t: Math.round(t), err: String(e) })
      }
      if (t < ms) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, ms, measure.toString())
  await act()
  await sleep(ms + 120)
  return p.evaluate(() => window.__trace)
}
/* A move's frames: distinct values, biggest step, whether it only went one way. */
const moveOf = (trace, key) => {
  const vals = trace.map((f) => f[key]).filter((v) => typeof v === "number")
  let biggest = 0
  let up = 0
  let down = 0
  for (let i = 1; i < vals.length; i++) {
    const d = vals[i] - vals[i - 1]
    biggest = Math.max(biggest, Math.abs(d))
    if (d > 0.01) up++
    if (d < -0.01) down++
  }
  return { first: vals[0], last: vals.at(-1), distinct: new Set(vals.map((v) => Math.round(v * 10))).size, biggestStep: +biggest.toFixed(2), up, down }
}

/*
  ON THE CURVE, EVERY FRAME. Headless Chromium's frames are not a phone's, so a step per frame says as much about the
  machine as the page. What the page decides is where the list is at each moment of its own move: the transition's
  clock (its currentTime) is read on every frame with the height, and the height must be the curve at that moment
  (cubic-bezier, solved here) times the list's height, within a pixel. A layout jump, a stall caught up or a snap at
  the end is off the curve; the curve itself is the sheet's.
*/
function bezier(x1, y1, x2, y2) {
  const at = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3
  return (x) => {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2
      if (at(x1, x2, mid) < x) lo = mid
      else hi = mid
    }
    return at(y1, y2, (lo + hi) / 2)
  }
}
const offCurve = (trace, from, to, ms, curve, key = "h") => {
  let worst = 0
  let n = 0
  for (const f of trace) {
    if (typeof f.ct !== "number") continue
    n++
    const want = from + (to - from) * curve(Math.min(1, f.ct / ms))
    worst = Math.max(worst, Math.abs(f[key] - want))
  }
  return { worst: +worst.toFixed(2), frames: n }
}

/* An element's ground, edge and words, each laid over what is under it, for contrast. */
const surfaceOf = (p, sel) =>
  p.evaluate((sel) => {
    const el = typeof sel === "string" ? document.querySelector(sel) : sel
    if (!el) return null
    const cs = getComputedStyle(el)
    /* The card under it: the nearest ancestor with a ground that is not transparent. */
    let under = null
    for (let x = el.parentElement; x; x = x.parentElement) {
      const bg = getComputedStyle(x).backgroundColor
      if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) {
        under = bg
        break
      }
    }
    return { bg: cs.backgroundColor, border: cs.borderTopColor, color: cs.color, under: under || "rgb(255, 255, 255)", opacity: cs.opacity, translate: cs.translate, shadow: cs.boxShadow }
  }, sel)
const contrastOf = (s) => {
  const under = parse(s.under)
  const ground = over(parse(s.bg) || [0, 0, 0, 0], under)
  const edge = over(parse(s.border) || [0, 0, 0, 0], under)
  const ink = over(parse(s.color), ground)
  return { ground: hex(ground), card: hex(under), words: ratio(ink, ground), fill: ratio(ground, under), edge: ratio(edge, under) }
}

try {
  /* ════════════════════════════════════════════════════════════════════ */
  if (want("BUTTONS")) {
    console.log("\nBUTTONS: a row's actions, light and dark")
    for (const dark of [false, true]) {
      const look = dark ? "dark " : "light"
      for (const vp of [PHONE, DESK]) {
        const where = vp.isMobile ? "phone" : "1280 "
        const { p, errors } = await open(vp, { dark })
        await p.click("[data-library-item=p1] [data-row-files]")
        /* The pointer off every button, so each is measured at rest. */
        if (!vp.isMobile) await p.mouse.move(5, 5)
        await sleep(500)
        const sels = {
          Download: "[data-library-item=p2] [data-row-download]",
          "7 files": "[data-library-item=p1] [data-row-files]",
          More: "[data-library-item=p2] [data-row-more]",
          "a file": "[data-library-item=p1] [data-file-download]",
        }
        for (const [name, sel] of Object.entries(sels)) {
          const s = await surfaceOf(p, sel)
          const c = contrastOf(s)
          expect(c.words >= 7 && c.edge >= (dark ? 1.4 : 1.45) && (!dark || c.fill >= 1.2), `${look} ${where} ${name.padEnd(9)} words ${c.words}:1 on ${c.ground}, edge ${c.edge}:1 and ground ${c.fill}:1 against the card ${c.card}`)
        }
        /* The same kind of button everywhere on a row: one height, one ground, one edge. */
        const same = await p.evaluate(() => {
          const els = [...document.querySelectorAll("[data-row-download], [data-row-files], [data-row-more], [data-library-item=p1] [data-file-download]")]
          return {
            heights: [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().height)))],
            grounds: [...new Set(els.map((e) => getComputedStyle(e).backgroundColor))],
            radii: [...new Set(els.map((e) => getComputedStyle(e).borderTopLeftRadius))],
          }
        })
        expect(same.heights.length === 1 && same.grounds.length === 1 && same.radii.length === 1, `${look} ${where} every row action is the same button (height, ground, radius)`, same)
        if (!vp.isMobile) {
          /* Under the pointer, then pressed. */
          const sel = "[data-library-item=p2] [data-row-download]"
          const rest = await surfaceOf(p, sel)
          const box = await (await p.$(sel)).boundingBox()
          await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
          await sleep(250)
          const hover = await surfaceOf(p, sel)
          await p.mouse.down()
          await sleep(60)
          const press = await surfaceOf(p, sel)
          await p.mouse.move(5, 5)
          await p.mouse.up()
          const r = parse(rest.bg), h = parse(hover.bg), d = parse(press.bg)
          const dist = (a, b) => Math.max(...[0, 1, 2].map((i) => Math.abs(a[i] - b[i])))
          expect(dist(r, h) >= 3 && dist(r, d) >= 5 && dist(h, d) >= 3, `${look} hover and press are their own steps: ${hex(r)} at rest, ${hex(h)} under the pointer, ${hex(d)} pressed`)
          expect(press.translate === "0px 1px" && /inset/.test(press.shadow), `${look} pressed, it sinks a pixel and its shadow turns inward`, { translate: press.translate, shadow: press.shadow.slice(0, 60) })
          await sleep(200)
        }
        /* A Download that is working: /api/download never answers here. */
        await p.click("[data-library-item=p2] [data-row-download]")
        await sleep(250)
        const busy = await p.evaluate(() => {
          const b = document.querySelector("[data-library-item=p2] [data-row-download]")
          return { opacity: getComputedStyle(b).opacity, text: b.textContent.trim(), spin: !!b.querySelector(".animate-spin"), disabled: b.disabled }
        })
        expect(busy.opacity === "1" && busy.spin && busy.disabled && /Preparing/.test(busy.text), `${look} ${where} a working Download says Preparing with a spinner and is not dimmed`, busy)
        await p.screenshot({ path: join(shots, `rows-${dark ? "dark" : "light"}-${vp.isMobile ? "phone" : "desk"}.png`), fullPage: false })
        expect(errors.length === 0, `${look} ${where} no page errors`, errors)
        await p.close()
        release()
      }
    }
  }

  /* ════════════════════════════════════════════════════════════════════ */
  if (want("FILES")) {
    console.log("\nFILES: 7 files, opened and closed frame by frame")
    for (const vp of [PHONE, DESK]) {
      const where = vp.isMobile ? "phone" : "1280 "
      const { p, errors } = await open(vp)
      const frame = () => {
        const panel = document.querySelector("[data-library-item=p1] [data-row-file-panel]")
        const content = panel.querySelector("[data-row-file-content]")
        const sw = document.querySelector("[data-library-item=p1] [data-row-files]")
        const chev = sw.querySelector("[data-row-files-chevron]")
        const next = document.querySelector("[data-library-item=p2]")
        /* What of the list can be seen: the box that clips it. */
        let clip = content.parentElement
        while (clip && !/hidden|clip/.test(getComputedStyle(clip).overflowY)) clip = clip.parentElement
        return {
          h: +panel.getBoundingClientRect().height.toFixed(2),
          seen: +Math.min(clip.getBoundingClientRect().height, content.getBoundingClientRect().height).toFixed(2),
          full: content.getBoundingClientRect().height,
          sw: +sw.getBoundingClientRect().top.toFixed(2),
          next: +next.getBoundingClientRect().top.toFixed(2),
          op: +Number(getComputedStyle(content).opacity).toFixed(3),
          rot: parseFloat(getComputedStyle(chev).rotate) || 0,
          ct: (() => {
            const a = panel.getAnimations().find((x) => x.transitionProperty === "grid-template-rows")
            return a && a.playState === "running" ? a.currentTime : null
          })(),
        }
      }
      const opening = await record(p, () => p.click("[data-library-item=p1] [data-row-files]"), 650, frame)
      const o = moveOf(opening, "h")
      const full = opening.at(-1).full
      const sw = moveOf(opening, "sw")
      const rots = new Set(opening.map((f) => Math.round(f.rot)))
      expect(o.down === 0 && o.distinct >= 12 && Math.abs(o.last - full) < 0.5 && o.first < 1, `${where} opening: the height only grows, ${o.distinct} heights from ${o.first} to ${o.last}px (the list is ${full}px)`)
      const lag = Math.max(...opening.map((f) => f.h - f.seen))
      expect(lag <= 1, `${where}   what can be seen of the list is the room it makes on every frame (largest shortfall ${lag.toFixed(1)}px)`)
      const oc = offCurve(opening, 0, full, 320, bezier(0.32, 0.72, 0, 1))
      expect(oc.frames >= 12 && oc.worst <= 1, `${where}   on the sheet's opening curve on all ${oc.frames} frames of the move (furthest off ${oc.worst}px)`)
      expect(sw.distinct === 1, `${where}   "7 files" never moves under the finger`, sw)
      expect(moveOf(opening, "next").down === 0 && moveOf(opening, "next").biggestStep === o.biggestStep, `${where}   the row under it moves with the list, step for step`)
      expect([...rots].some((r) => r > 20 && r < 160) && Math.round(opening.at(-1).rot) === 180, `${where}   the chevron turns through ${rots.size} angles to 180deg`)
      expect(moveOf(opening, "op").down === 0 && opening.at(-1).op === 1, `${where}   the list fades in and only in`)
      /* The rows, lined up. */
      const lines = await p.evaluate(() => {
        const rows = [...document.querySelectorAll("[data-library-item=p1] [data-library-file]")]
        const r = (e) => e.getBoundingClientRect()
        return rows.map((li) => {
          const mark = li.querySelector("[aria-hidden]")
          const name = li.querySelector("p[title]")
          const btn = li.querySelector("[data-file-download]")
          const sw = document.querySelector("[data-library-item=p1] [data-row-more]")
          return { inside: r(btn).right <= r(sw).right + 0.5, cut: name.scrollWidth > name.clientWidth + 1, mark: Math.round(r(mark).left), name: Math.round(r(name).left), right: Math.round(r(btn).right), w: Math.round(r(btn).width), dy:Math.abs(r(mark).top + r(mark).height / 2 - (r(btn).top + r(btn).height / 2)), size: li.querySelector("[data-file-meta]")?.textContent ?? "" }
        })
      })
      const one = (k) => new Set(lines.map((l) => l[k])).size === 1
      expect(lines.length === 7 && one("mark") && one("name") && one("right") && one("w") && lines.every((l) => l.dy <= 1), `${where}   7 rows: type marks, names and Downloads each on one line, each Download centred on its row`, { rows: lines.length, button: lines[0]?.w })
      expect(lines.every((l) => l.inside), `${where}   every Download ends where the row's More ends: a long name is cut in the middle, it never pushes the button out`, lines.map((l) => l.right))
      expect(lines.every((l) => /\d/.test(l.size)), `${where}   every file says its size`, lines.map((l) => l.size))
      await p.screenshot({ path: join(shots, `files-open-${vp.isMobile ? "phone" : "desk"}.png`) })

      const closing = await record(p, () => p.click("[data-library-item=p1] [data-row-files]"), 550, frame)
      const c = moveOf(closing, "h")
      expect(c.up === 0 && c.distinct >= 9 && c.last < 0.5, `${where} closing: the height only shrinks, ${c.distinct} heights down to ${c.last}px`)
      const cc = offCurve(closing, full, 0, 260, bezier(0.4, 0, 0.2, 1))
      expect(cc.frames >= 10 && cc.worst <= 1, `${where}   on the sheet's closing curve on all ${cc.frames} frames (furthest off ${cc.worst}px)`)
      expect(moveOf(closing, "sw").distinct === 1 && Math.round(closing.at(-1).rot) === 0, `${where}   the switch stays put and the chevron turns back`)
      const inert = await p.evaluate(() => {
        const panel = document.querySelector("[data-library-item=p1] [data-row-file-panel]")
        const b = panel.querySelector("[data-file-download]")
        b.focus()
        return { inert: panel.inert, focused: document.activeElement === b }
      })
      expect(inert.inert && !inert.focused, `${where}   closed, the list takes no focus`, inert)
      expect(errors.length === 0, `${where} no page errors`, errors)
      await p.close()
    }
    /* Reduced motion: no frames in between. */
    const { p } = await open(PHONE, { reduce: true })
    const frame = () => ({ h: +document.querySelector("[data-library-item=p1] [data-row-file-panel]").getBoundingClientRect().height.toFixed(1) })
    const quick = await record(p, () => p.click("[data-library-item=p1] [data-row-files]"), 300, frame)
    expect(moveOf(quick, "h").distinct <= 2, "reduced motion: the list is simply there", moveOf(quick, "h"))
    await p.close()
  }

  /* ════════════════════════════════════════════════════════════════════ */
  if (want("TRAY")) {
    console.log("\nTRAY: the app's download cards")
    for (const dark of [false, true]) {
      const look = dark ? "dark " : "light"
      const { p, errors } = await open(PHONE, { dark })
      const job = (key, name) => p.evaluate((key, name) => window.__dl.startJob({ key, fileName: name, phase: "preparing", route: "app", platform: "ios" }), key, name)
      const patch = (key, patchObj) => p.evaluate((key, patchObj) => window.__dl.patchJob(key, patchObj), key, patchObj)
      const frame = () => {
        const cards = [...document.querySelectorAll("[data-tray-card]")]
        const out = {}
        cards.forEach((c, i) => {
          const b = c.getBoundingClientRect()
          out[`top${i}`] = +b.top.toFixed(2)
          out[`h${i}`] = +b.height.toFixed(2)
          out[`op${i}`] = +Number(getComputedStyle(c).opacity).toFixed(3)
        })
        out.n = cards.length
        /* The newest slot's arrival, on its own clock. */
        const slots = [...document.querySelectorAll("[data-tray-slot]")]
        const arrive = slots.at(-1)?.getAnimations().find((a) => a.animationName === "sl-tray-slot-in" && a.playState === "running")
        out.ct = arrive ? arrive.currentTime : null
        return out
      }
      /* Arriving. */
      const rise = await record(p, () => job("asset:a1", "Film-Presets-Lightroom-Classic.zip"), 600, frame)
      const top = moveOf(rise, "top0")
      const op = moveOf(rise, "op0")
      expect(top.up === 0 && top.distinct >= 10 && top.first - top.last >= 12 && op.down === 0 && op.distinct >= 6, `${look} a card rises ${(top.first - top.last).toFixed(1)}px through ${top.distinct} places and fades in through ${op.distinct} steps`, { top, op })
      const seek = await p.evaluate(() => {
        const s = document.querySelector("[data-tray-seek]")
        const a = s?.getAnimations()[0]
        const kf = a?.effect?.getKeyframes?.() ?? []
        return { there: !!s, props: [...new Set(kf.flatMap((k) => Object.keys(k).filter((x) => !["offset", "easing", "composite", "computedOffset"].includes(x))))], status: document.querySelector("[data-tray-status]")?.textContent }
      })
      expect(seek.there && seek.props.join() === "translate" && seek.status === "Getting your file", `${look} preparing: a segment travels the track by translate only, and the line says ${seek.status}`, seek.props)
      await sleep(200)
      if (!dark) await p.screenshot({ path: join(shots, "tray-preparing-light.png") })
      const h0 = await p.evaluate(() => document.querySelector("[data-tray-card]").getBoundingClientRect().height)
      /* Bytes arriving: the same height, a bar that grows by scale. */
      await patch("asset:a1", { phase: "downloading", loaded: 4_000_000, total: 48_300_000 })
      await sleep(250)
      const mid = await p.evaluate(() => ({ h: document.querySelector("[data-tray-card]").getBoundingClientRect().height, status: document.querySelector("[data-tray-status]").textContent, scale: document.querySelector("[data-tray-bar]")?.style.scale }))
      expect(Math.abs(mid.h - h0) < 0.5 && /of 46\.1 MB/.test(mid.status) && mid.scale === "0.08 1", `${look} downloading: the card keeps its height (${mid.h}px), the line counts, the bar is at ${mid.scale}`, mid.status)
      if (dark) {
        const bar = await p.evaluate(() => {
          const b = document.querySelector("[data-tray-bar]")
          const t = b.parentElement
          return { bar: getComputedStyle(b).backgroundColor, track: getComputedStyle(t).backgroundColor, card: getComputedStyle(document.querySelector("[data-tray-card]")).backgroundColor }
        })
        const card = parse(bar.card)
        const track = over(parse(bar.track), card)
        expect(ratio(over(parse(bar.bar), track), track) >= 4, `dark  the bar is ink on its track: ${ratio(over(parse(bar.bar), track), track)}:1`, bar)
      }
      /* A second file lifts the first. */
      const lift = await record(p, () => job("asset:b1", "buyer-question-playbook.pdf"), 600, frame)
      const two = lift.filter((f) => f.n === 2)
      const first = moveOf(two, "top0")
      const lc = offCurve(two, two[0].top0, two[0].top0 - (two.at(-1).h1 + 8), 360, bezier(0.32, 0.72, 0, 1), "top0")
      expect(first.up === 0 && first.distinct >= 10 && lc.frames >= 10 && lc.worst <= 1, `${look} a second card lifts the first ${(first.first - first.last).toFixed(0)}px through ${first.distinct} places, on the sheet's curve on all ${lc.frames} frames (furthest off ${lc.worst}px)`)
      /* Done: the bar row folds away. */
      const fold = await record(p, () => patch("asset:a1", { phase: "saved", loaded: 48_300_000, total: 48_300_000, message: "Saved to Downloads", nativeId: "42", cancel: undefined }), 600, frame)
      const fh = moveOf(fold, "h0")
      expect(fh.up === 0 && fh.distinct >= 8 && fh.first - fh.last >= 10 && fh.biggestStep <= 4, `${look} done: the card shrinks ${(fh.first - fh.last).toFixed(1)}px through ${fh.distinct} heights (biggest step ${fh.biggestStep}px)`)
      const done = await p.evaluate(() => {
        const marks = [...document.querySelectorAll("[data-tray-card]")[0].querySelectorAll("[data-tray-mark]")].map((m) => getComputedStyle(m).opacity)
        return { marks, status: document.querySelectorAll("[data-tray-status]")[0].textContent, open: !!document.querySelector("[data-tray-open]") }
      })
      /* A long name beside Save again: the card stays inside the screen's gutters and its X stays on it. */
      const fit = await p.evaluate(() =>
        [...document.querySelectorAll("[data-tray-card]")].map((c) => {
          const r = c.getBoundingClientRect()
          const x = c.querySelector("[data-tray-close]").getBoundingClientRect()
          return { left: Math.round(r.left), right: Math.round(innerWidth - r.right), x: x.right <= r.right - 8 }
        }),
      )
      expect(fit.every((f) => f.left === 16 && f.right === 16 && f.x), `${look} every card sits 16px in from both edges with its X inside it`, fit)
      expect(done.marks.join() === "0,1" && done.status === "Saved to Downloads" && done.open, `${look} the type mark has crossfaded to the tick, the line says ${done.status}, Save again is offered`, done.marks)
      await p.screenshot({ path: join(shots, `tray-done-${dark ? "dark" : "light"}.png`) })
      /* X on the newer card, at the foot: it sinks and fades, its slot folds, the one above it settles down. */
      const leave = await record(
        p,
        () => p.evaluate(() => document.querySelectorAll("[data-tray-card]")[1].querySelector("[data-tray-close]").click()),
        700,
        () => {
          const cards = [...document.querySelectorAll("[data-tray-card]")]
          const gone = document.querySelector("[data-download-leaving]")
          const stay = cards.find((c) => !c.hasAttribute("data-download-leaving"))
          const slot = gone?.closest("[data-tray-slot]")
          return {
            n: cards.length,
            op: gone ? +Number(getComputedStyle(gone).opacity).toFixed(3) : null,
            sink: gone ? +gone.getBoundingClientRect().top.toFixed(2) : null,
            slot: slot ? +slot.getBoundingClientRect().height.toFixed(2) : null,
            other: stay ? +stay.getBoundingClientRect().top.toFixed(2) : null,
            ct: (() => {
              const a = slot?.getAnimations().find((x) => x.transitionProperty === "grid-template-rows" && x.playState === "running")
              return a ? a.currentTime : null
            })(),
          }
        },
      )
      const lo = moveOf(leave, "op")
      const ls = moveOf(leave, "slot")
      const lother = moveOf(leave, "other")
      const removedAt = leave.find((f) => f.n === 1)?.t
      const slotStart = leave.find((f) => typeof f.slot === "number")?.slot ?? 84
      const otherStart = leave.find((f) => typeof f.other === "number")?.other ?? 0
      const lsc = offCurve(leave, slotStart, 0, 340, bezier(0.4, 0, 0.2, 1), "slot")
      const loc = offCurve(leave, otherStart, otherStart + slotStart, 340, bezier(0.4, 0, 0.2, 1), "other")
      expect(lo.up === 0 && lo.distinct >= 3 && lo.last < 0.05, `${look} X: the card fades through ${lo.distinct} steps and only fades`)
      expect(ls.up === 0 && ls.last < 1 && lsc.frames >= 8 && lsc.worst <= 1, `${look}   its slot folds ${slotStart}px to 0 on the sheet's closing curve on all ${lsc.frames} frames (furthest off ${lsc.worst}px)`)
      expect(lother.down === 0 && loc.frames >= 8 && loc.worst <= 1, `${look}   the card above settles ${(lother.last - lother.first).toFixed(1)}px with it, on the same curve (furthest off ${loc.worst}px)`)
      expect(removedAt >= 300 && removedAt <= 480, `${look}   and it leaves the document after its move, at ${removedAt}ms`)
      /* The last one closed: the tray goes, in the same way. */
      const last = await record(p, () => p.evaluate(() => document.querySelector("[data-tray-close]").click()), 600, () => ({ n: document.querySelectorAll("[data-tray-card]").length, op: (() => { const c = document.querySelector("[data-tray-card]"); return c ? +Number(getComputedStyle(c).opacity).toFixed(3) : null })() }))
      const lastOp = moveOf(last, "op")
      expect(lastOp.distinct >= 3 && lastOp.up === 0 && last.at(-1).n === 0 && !(await p.$("[data-download-tray]")), `${look} the last card fades through ${lastOp.distinct} steps and the tray is gone after`)
      /* Frame pacing while two cards move (headless software rendering: an upper bound, not a phone). */
      await job("asset:c1", "Drum One Shots Vol 1.zip")
      await job("asset:c2", "Kit notes.pdf")
      await sleep(500)
      const pace = await record(p, () => p.evaluate(() => document.querySelector("[data-tray-close]").click()), 500, () => ({}))
      const gaps = pace.slice(1).map((f, i) => f.t - pace[i].t)
      /* Reported, not judged: a loaded headless machine, not a phone. What the page controls is above (on the curve, compositor where it can be). */
      console.log(`  info  ${look} frames while a card leaves here: ${gaps.length}, the longest gap ${Math.max(...gaps)}ms`)
      const props = await p.evaluate(() => {
        const c = document.querySelector("[data-tray-card]")
        const cs = getComputedStyle(c)
        return cs.transitionProperty
      })
      expect(props === "opacity, translate", `${look} the card itself moves only by opacity and translate (compositor); its slot's height is the one laid out property`, props)
      expect(errors.length === 0, `${look} no page errors`, errors)
      await p.close()
    }
    /* Reduced motion: X takes it at once. */
    const { p } = await open(PHONE, { reduce: true })
    await p.evaluate(() => window.__dl.startJob({ key: "asset:a1", fileName: "a.zip", phase: "preparing", route: "app", platform: "ios" }))
    await sleep(200)
    await p.evaluate(() => document.querySelector("[data-tray-close]").click())
    await sleep(60)
    expect((await p.$$("[data-tray-card]")).length === 0, "reduced motion: X takes the card at once")
    await p.close()
  }

  /* ════════════════════════════════════════════════════════════════════ */
  if (want("LEAVE")) {
    console.log("\nLEAVE: the composer's question, light and dark")
    for (const vp of [PHONE, DESK]) {
      for (const dark of [false, true]) {
        const look = `${dark ? "dark " : "light"} ${vp.isMobile ? "phone" : "1280 "}`
        const { p, errors } = await open(vp, { dark, path: "/community/clay-studio", ready: "[data-feed-list] [data-post]" })
        await sleep(400)
        await p.evaluate(() => document.querySelector("[data-composer-open]")?.click())
        const scope = vp.isMobile ? "[data-composer=sheet]" : "[data-composer=open]"
        await p.waitForSelector(`${scope} [data-composer-title]`, { timeout: 10000 })
        await sleep(700)
        await p.type(`${scope} [data-composer-title]`, "Half a thought")
        const sheetTop = () => {
          const s = document.querySelector("[data-leave-sheet]")?.closest("[data-sheet-panel]") ?? document.querySelector("[data-leave-dialog]")?.closest("[role=dialog]")
          if (!s) return { top: null, op: null }
          return { top: +s.getBoundingClientRect().top.toFixed(2), op: +Number(getComputedStyle(s).opacity).toFixed(3) }
        }
        const rise = await record(p, () => p.evaluate((scope) => document.querySelector(`${scope} [data-composer-cancel]`)?.click(), scope), 700, sheetTop)
        if (vp.isMobile) {
          const m = moveOf(rise, "top")
          expect(m.up === 0 && m.distinct >= 10, `${look} the sheet rises through ${m.distinct} places, never back down`, { from: m.first, to: m.last, biggest: m.biggestStep })
        } else {
          const m = moveOf(rise, "op")
          expect(m.down === 0 && m.distinct >= 4 && m.last === 1, `${look} the dialog fades in through ${m.distinct} steps`)
        }
        await sleep(300)
        const go = contrastOf(await surfaceOf(p, "[data-leave-go]"))
        const stay = contrastOf(await surfaceOf(p, "[data-leave-stay]"))
        const goInk = await p.evaluate(() => getComputedStyle(document.querySelector("[data-leave-go]")).color)
        const red = parse(goInk)
        expect(go.words >= 4.5 && red[0] - red[1] >= 60 && go.edge >= 1.3, `${look} Leave: red words ${go.words}:1 on ${go.ground}, its edge ${go.edge}:1 against the sheet ${go.card}`, goInk)
        expect(stay.words >= 7 && stay.edge >= 1.4, `${look} Keep writing: ink ${stay.words}:1 on ${stay.ground}, edge ${stay.edge}:1`)
        const focus = await p.evaluate(() => document.activeElement?.hasAttribute("data-leave-stay"))
        expect(focus, `${look} Keep writing is the one focused`)
        await p.screenshot({ path: join(shots, `leave-${dark ? "dark" : "light"}-${vp.isMobile ? "phone" : "desk"}.png`) })
        const fall = await record(p, () => p.evaluate(() => document.querySelector("[data-leave-stay]")?.click()), 700, sheetTop)
        if (vp.isMobile) {
          const m = moveOf(fall.filter((f) => f.top !== null), "top")
          expect(m.down === 0 && m.distinct >= 8, `${look} Keep writing: the sheet falls through ${m.distinct} places`, { biggest: m.biggestStep })
        } else {
          const m = moveOf(fall.filter((f) => f.op !== null), "op")
          expect(m.up === 0 && m.distinct >= 3 && fall.at(-1).op === null, `${look} Keep writing: the dialog fades out through ${m.distinct} steps, then leaves`)
        }
        const kept = await p.$eval(`${scope} [data-composer-title]`, (i) => i.value).catch(() => null)
        expect(kept === "Half a thought", `${look} and what was written is still there`)
        expect(errors.length === 0, `${look} no page errors`, errors)
        await p.close()
      }
    }
  }
} finally {
  await browser.close()
  server.close()
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\n${broken ? `${broken} FAILED` : "all passed"}   (pictures in ${shots})`)
process.exit(broken ? 1 : 0)
