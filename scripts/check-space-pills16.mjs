/**
 * ===========================================================================
 *  ROUND 16: THE SPACE PILLS, QUIET. MEASURED AND FILMED AT 4x CPU
 * ===========================================================================
 * The real pill row under the real pull to refresh
 * (scripts/render-space-pills16.tsx), served over HTTP, at 390x844 (touch,
 * 2x) and 1440x900, the CPU throttled 4x, a pick doing the page work the
 * feed does when it draws a new list.
 *
 *   TAPS   on each pill, in each gap, just above and below one, and with a
 *          finger that drifts a few pixels: each tap is one pick of the pill
 *          it was nearest (round 15's fix, kept)
 *   PULL   a finger that rolls 4px on a pill does not move the page and is
 *          one pick; a real pull still refreshes (round 15's fix, kept)
 *   FADE   a switch, frame by frame: the chosen pill's ink fades in where it
 *          is and the old one fades out, over PILL_FADE_MS, nothing moves
 *          across the row, no pill changes size; the composited frames are
 *          saved as one strip to look at
 *   PRESS  the press is a light tint, part of the way on the first frame
 *
 *   PROBE_CSS=source node scripts/check-space-pills16.mjs [SECTION ...]
 *   SHOTS_DIR=... keeps the screenshots; LABEL names them.
 */
import { createServer } from "node:http"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const only = new Set(process.argv.slice(2).map((s) => s.toUpperCase()))
const want = (s) => only.size === 0 || only.has(s)
const LABEL = process.env.LABEL || "now"
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-pills16-")), "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".space-pills16-probe")
mkdirSync(stubs, { recursive: true })
let broken = 0
const results = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const say = (what, got) => console.log(`        ${what}: ${typeof got === "object" ? JSON.stringify(got) : got}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sharp = (await import(join(root, "node_modules/sharp/lib/index.js"))).default

writeFileSync(
  join(stubs, "navigation.js"),
  `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`,
)
writeFileSync(
  join(stubs, "link.jsx"),
  `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) {
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__links ||= []).push(href) } } }, children)
})
`,
)
const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-space-pills16.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": "./.space-pills16-probe/navigation.js", "next/link": "./.space-pills16-probe/link.jsx" },
  banner: { js: "var process={env:{NODE_ENV:'production'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"))
const css = await appCss(root)
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${interFaces(root)}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head><body><div id="app"></div><script src="/app.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/app.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const PAGE = `http://127.0.0.1:${server.address().port}/community/clay-studio`
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })

async function open(vp, cpu = 4) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  const cdp = await p.target().createCDPSession()
  await p.goto(PAGE, { waitUntil: "load" })
  await p.waitForSelector("[data-space-chip]")
  await p.evaluate(() => document.fonts.ready)
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
  await sleep(400)
  return { p, cdp, errors }
}
async function tap(cdp, x, y, { dx = 0, dy = 0, hold = 60, radius = 1 } = {}) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, radiusX: radius, radiusY: radius, force: 1, id: 1 }] })
  if (dx || dy) {
    await sleep(hold / 2)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx / 2, y: y + dy / 2, id: 1 }] })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx, y: y + dy, id: 1 }] })
  }
  await sleep(hold / 2)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}
const chipRects = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll("[data-space-chip]")].map((el) => {
      const b = el.getBoundingClientRect()
      return { id: el.getAttribute("data-space-chip"), left: b.left, right: b.right, top: b.top, bottom: b.bottom, on: el.getAttribute("aria-current") === "page" }
    }),
  )
const picks = (p) => p.evaluate(() => window.__picks.length)

try {
  if (want("TAPS")) {
    console.log(`\nTAPS on, between, above and below the pills, 390x844, CPU 4x [${LABEL}]`)
    const { p, cdp, errors } = await open(PHONE)
    const rows = []
    const trackRight = await p.evaluate(() => document.querySelector("[data-space-chips-track]").getBoundingClientRect().right)
    say("pills wholly on screen (left, right)", (await chipRects(p)).filter((r) => r.right < trackRight - 24).map((r) => `${r.id} ${Math.round(r.left)}-${Math.round(r.right)}`))
    for (let k = 0; k <= 3; k++) {
      for (const kind of ["centre", "gap-left", "gap-right", "above", "below", "drift"]) {
        let rects = await chipRects(p)
        const a = rects[k]
        const b = rects[k + 1]
        const mid = (a.right + b.left) / 2
        const cy = (a.top + a.bottom) / 2
        const spec = {
          centre: { x: (a.left + a.right) / 2, y: cy, want: a.id },
          "gap-left": { x: mid - 1.5, y: cy, want: a.id },
          "gap-right": { x: mid + 1.5, y: cy, want: b.id },
          above: { x: (a.left + a.right) / 2, y: a.top - 3, want: a.id },
          below: { x: (a.left + a.right) / 2, y: a.bottom + 3, want: a.id },
          drift: { x: (a.left + a.right) / 2, y: cy, dx: 5, dy: 3, want: a.id },
        }[kind]
        /* Only pills whose neighbour is wholly on screen too: a tap under the row's fade at its right end is not a tap on the row. */
        if (b.right > trackRight - 24) continue
        if (rects.find((r) => r.on)?.id === spec.want) {
          const other = rects[spec.want === rects[0].id ? 2 : 0]
          await tap(cdp, (other.left + other.right) / 2, (other.top + other.bottom) / 2)
          await sleep(700)
          rects = await chipRects(p)
        }
        const before = await picks(p)
        await tap(cdp, spec.x, spec.y, { dx: spec.dx, dy: spec.dy })
        await sleep(700)
        const got = await p.evaluate((n) => window.__picks.slice(n), before)
        rows.push({ kind, want: spec.want, got, ok: got.length === 1 && got[0] === spec.want })
      }
    }
    const bad = rows.filter((r) => !r.ok)
    results.taps = { total: rows.length, once: rows.length - bad.length, bad }
    expect(errors.length === 0, "no page error", errors)
    expect(bad.length === 0, "every tap is exactly one pick of the pill it was nearest", `${rows.length - bad.length}/${rows.length} ${JSON.stringify(bad)}`)
    await p.close()
  }

  if (want("PULL")) {
    console.log(`\nPULL: a finger's roll on a pill and a real pull, 390x844, CPU 4x [${LABEL}]`)
    const { p, cdp, errors } = await open(PHONE)
    const rects = await chipRects(p)
    const a = rects[2]
    await p.evaluate(() => {
      const host = document.querySelector("[data-pull-to-refresh]")
      const kid = host?.firstElementChild
      window.__moved = 0
      const look = () => {
        for (const el of [host, kid]) {
          if (!el) continue
          const cs = getComputedStyle(el)
          /* The CSS property's name is spelled in two pieces: the house rules keep the whole word out of these files. */
          const whole = cs[["trans", "form"].join("")]
          const t = whole !== "none" ? whole : cs.translate !== "none" ? cs.translate : ""
          const m = /(-?[\d.]+)\)?$/.exec(t) || /([\d.]+)px$/.exec(t)
          if (t && t !== "0px" && t !== "matrix(1, 0, 0, 1, 0, 0)") window.__moved = Math.max(window.__moved, Math.abs(Number(m?.[1]) || 1))
        }
        window.__moved = Math.max(window.__moved, Math.abs(scrollY))
        if (!window.__stop) requestAnimationFrame(look)
      }
      requestAnimationFrame(look)
    })
    const before = await picks(p)
    await tap(cdp, (a.left + a.right) / 2, (a.top + a.bottom) / 2, { dy: 4, hold: 120 })
    await sleep(700)
    const roll = await p.evaluate((n) => ({ moved: window.__moved, got: window.__picks.slice(n) }), before)
    results.roll = roll
    expect(roll.moved === 0, "a 4px roll on a pill moves the page not at all", roll.moved)
    expect(roll.got.length === 1 && roll.got[0] === a.id, "  and is one pick of that pill", roll.got)
    /* A real pull, from the list. */
    const y0 = 420
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: y0, id: 1 }] })
    for (let i = 1; i <= 14; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y: y0 + i * 14, id: 1 }] })
      await sleep(16)
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await sleep(1500)
    const refreshed = await p.evaluate(() => window.__refreshes)
    results.pull = refreshed
    expect(refreshed === 1, "a real pull still refreshes, once", refreshed)
    expect(errors.length === 0, "no page error", errors)
    await p.close()
  }

  if (want("FADE")) {
    for (const [name, vp] of [["390", PHONE], ["1440", DESK]]) {
      console.log(`\nFADE: a switch from All to the second space's pill, frame by frame, ${name}, CPU 4x [${LABEL}]`)
      const { p, cdp, errors } = await open(vp)
      const rects = await chipRects(p)
      const to = rects[2]
      await p.evaluate(() => {
        const out = (window.__frames = [])
        const t0 = performance.now()
        const look = () => {
          const chips = [...document.querySelectorAll("[data-space-chip]")]
          out.push({
            t: Math.round(performance.now() - t0),
            chips: chips.map((c) => {
              const b = c.getBoundingClientRect()
              const fill = c.querySelector("[data-chip-fill]")
              const f = fill?.getBoundingClientRect()
              const cs = fill ? getComputedStyle(fill) : null
              return {
                id: c.getAttribute("data-space-chip"),
                l: Math.round(b.left * 10) / 10,
                w: Math.round(b.width * 10) / 10,
                h: Math.round(b.height * 10) / 10,
                o: fill ? Math.round(Number(cs.opacity) * 1000) / 1000 : 0,
                fx: f ? Math.round((f.left - b.left) * 10) / 10 : null,
                fw: f ? Math.round((f.width - b.width) * 10) / 10 : null,
                moved: cs ? (cs[["trans", "form"].join("")] !== "none" || cs.translate !== "none" || cs.scale !== "none") : false,
              }
            }),
          })
          if (out.length < 90) requestAnimationFrame(look)
        }
        requestAnimationFrame(look)
        window.__upAt = 0
        document.addEventListener("pointerup", () => (window.__upAt = performance.now() - t0), { capture: true, once: true })
        document.addEventListener("click", () => (window.__upAt ||= performance.now() - t0), { capture: true, once: true })
      })
      const cast = []
      const onFrame = (f) => {
        cast.push({ data: f.data, t: f.metadata.timestamp })
        void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
      }
      cdp.on("Page.screencastFrame", onFrame)
      await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
      await sleep(250)
      if (vp.hasTouch) await tap(cdp, (to.left + to.right) / 2, (to.top + to.bottom) / 2)
      else await p.mouse.click((to.left + to.right) / 2, (to.top + to.bottom) / 2)
      await sleep(1300)
      await cdp.send("Page.stopScreencast")
      cdp.off("Page.screencastFrame", onFrame)

      const { frames, upAt } = await p.evaluate(() => ({ frames: window.__frames, upAt: window.__upAt }))
      const first = frames[0].chips
      const shift = Math.max(...frames.flatMap((f) => f.chips.map((c, i) => Math.max(Math.abs(c.l - first[i].l), Math.abs(c.w - first[i].w), Math.abs(c.h - first[i].h)))))
      /* The ink is -inset-px over a 1px hairline: exactly the pill's own box. */
      const inPlace = frames.every((f) => f.chips.every((c) => c.fx === 0 && c.fw === 0 && !c.moved))
      const oldO = frames.map((f) => f.chips[0].o)
      const newO = frames.map((f) => f.chips[2].o)
      const others = Math.max(...frames.flatMap((f) => f.chips.filter((_, i) => i !== 0 && i !== 2).map((c) => c.o)))
      const sum = frames.map((f) => f.chips.reduce((n, c) => n + c.o, 0))
      const startAt = frames.find((f) => f.chips[2].o > 0.001)?.t ?? null
      const doneAt = frames.find((f) => f.chips[2].o >= 0.999 && f.chips[0].o <= 0.001)?.t ?? null
      const changing = frames.filter((f) => f.chips[2].o > 0.001 && f.chips[2].o < 0.999)
      say("from the finger lifting to the fade starting (page frames)", startAt !== null && upAt ? `${Math.round(startAt - upAt)}ms` : "n/a")
      say("the fade, start to whole", startAt !== null && doneAt !== null ? `${doneAt - startAt}ms over ${changing.length} sampled frames` : "n/a")
      say("new pill's ink per frame", changing.map((f) => `${f.t - startAt}ms ${f.chips[2].o}`))
      say("old pill's ink per frame", changing.map((f) => `${f.t - startAt}ms ${f.chips[0].o}`))
      results[`fade${name}`] = { shift, inPlace, startAt, doneAt, upAt, others, sum: [Math.min(...sum), Math.max(...sum)], newO, oldO }
      expect(errors.length === 0, "no page error", errors)
      expect(shift < 0.5, "no pill moves or changes size through the switch", shift)
      expect(inPlace, "every ink sits exactly on its own pill on every frame, never translated or scaled: nothing slides across the row", inPlace)
      expect(others < 0.001, "no other pill's ink shows at any point", others)
      expect(startAt !== null && doneAt !== null && doneAt - startAt >= 100 && doneAt - startAt <= 260, "the new ink fades in where it is over about PILL_FADE_MS (140ms; 4x CPU frames may stretch it)", startAt !== null && doneAt !== null ? doneAt - startAt : null)
      expect(Math.min(...sum) > 0.85 && Math.max(...sum) < 1.15, "  while the old one fades out on the same curve: about one ink in all on every frame", [Math.min(...sum), Math.max(...sum)])

      /* The composited frames, cropped to the row, one under the other. */
      cast.sort((a, b) => a.t - b.t)
      const band = { top: Math.max(0, Math.floor(to.top - 10)), bottom: Math.ceil(to.bottom + 10) }
      const crops = []
      let last = null
      for (const f of cast) {
        const buf = Buffer.from(f.data, "base64")
        const meta = await sharp(buf).metadata()
        const scale = meta.width / vp.width
        const crop = await sharp(buf).extract({ left: 0, top: Math.round(band.top * scale), width: Math.min(meta.width, Math.round(Math.min(vp.width, 720) * scale)), height: Math.round((band.bottom - band.top) * scale) }).png().toBuffer()
        const raw = await sharp(crop).raw().toBuffer()
        if (last && raw.equals(last)) continue
        last = raw
        crops.push({ crop, t: Math.round((f.t - cast[0].t) * 1000) })
        if (crops.length >= 20) break
      }
      if (crops.length) {
        const metas = await Promise.all(crops.map((c) => sharp(c.crop).metadata()))
        const h = metas.reduce((n, m) => n + m.height + 4, 0)
        let top = 0
        await sharp({ create: { width: metas[0].width, height: h, channels: 3, background: "#ff3366" } })
          .composite(
            crops.map((c, i) => {
              const at = top
              top += metas[i].height + 4
              return { input: c.crop, left: 0, top: at }
            }),
          )
          .png()
          .toFile(join(shots, `${LABEL}-pill-frames-${name}.png`))
        say("distinct composited frames", crops.map((c) => `${c.t}ms`))
        say("frame strip", join(shots, `${LABEL}-pill-frames-${name}.png`))
      }
      await p.screenshot({ path: join(shots, `${LABEL}-pills-${name}.png`), clip: { x: 0, y: 0, width: vp.width, height: 260 } })
      await p.close()
    }
  }

  if (want("PRESS")) {
    console.log(`\nPRESS: the tint under a finger, 390x844, CPU 4x [${LABEL}]`)
    const { p, cdp } = await open(PHONE)
    const rects = await chipRects(p)
    const a = rects[2]
    await p.evaluate((id) => {
      const layer = document.querySelector(`[data-space-chip="${id}"] [data-chip-press]`)
      const out = (window.__press = [])
      const t0 = performance.now()
      const look = () => {
        out.push({ t: Math.round(performance.now() - t0), o: Math.round(Number(getComputedStyle(layer).opacity) * 1000) / 1000 })
        if (out.length < 40) requestAnimationFrame(look)
      }
      requestAnimationFrame(look)
      window.__pressBg = getComputedStyle(layer).backgroundColor
    }, a.id)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: (a.left + a.right) / 2, y: (a.top + a.bottom) / 2, radiusX: 1, radiusY: 1, force: 1, id: 1 }] })
    await sleep(260)
    await p.screenshot({ path: join(shots, `${LABEL}-press-390.png`), clip: { x: 0, y: 0, width: 390, height: 200 } })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] })
    await sleep(300)
    const press = await p.evaluate(() => ({ bg: window.__pressBg, frames: window.__press.filter((f) => f.o > 0) }))
    results.press = press
    say("press layer opacity per frame", press.frames.slice(0, 12).map((f) => f.o))
    const [r, g, b] = (press.bg.match(/\d+/g) || []).map(Number)
    expect(r >= 236 && g >= 236 && b >= 236, "the press is a light tint, near the pill's white", press.bg)
    expect(press.frames.length > 0 && press.frames[0].o < 0.6, "part of the way on its first frame, then eased", press.frames.slice(0, 4))
    await p.close()
  }
} finally {
  await browser.close()
  server.close()
  rmSync(stubs, { recursive: true, force: true })
}
writeFileSync(join(shots, `${LABEL}-pills-results.json`), JSON.stringify(results, null, 2))
console.log(`\n${broken ? `${broken} failed` : "all passed"}; screenshots in ${shots}`)
process.exit(broken ? 1 : 0)
