/**
 * ===========================================================================
 *  EXPLORE'S HOVER, IN AND OUT, MEASURED (round 18, L18)
 * ===========================================================================
 * The real Explore page (scripts/render-explore-page.tsx #page) at 1440x900
 * with the CPU slowed four times. A mouse moves onto a product card and off
 * it again, and every animation frame reads the card's shadow and its
 * border and how large the cover is drawn (its box against its frame, so a
 * `scale` and a `transform` read the same):
 *
 *   SMOOTH   the cover's zoom and the card's shadow move over several
 *            frames both ways, never most of the way in one frame (a snap
 *            is the "bump" the owner saw), and come back to rest exactly
 *   SAME     hover out takes about as long as hover in
 *   TOUCH    on a 390px phone whose finger still answers (hover: hover),
 *            as many Android phones do, a tap draws no hover: no shadow, no
 *            zoom, no darker border
 *
 * Frames go to SHOTS_DIR as contact sheets (TAG-explore-hover-*.png).
 *
 *   PROBE_CSS=source node scripts/check-explore-hover18.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const tag = process.env.TAG || "after"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const css = await appCss(root)
const faces = interFaces(root)
const stubs = join(root, ".explore-hover18-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-explore-hover-")), "shots")
mkdirSync(shots, { recursive: true })

writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => "/explore"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(window.__search || "")
export const useParams = () => ({ category: window.__category })
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }, children) })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default React.forwardRef(function Image({ src, alt, fill, priority, sizes, className, style, fetchPriority, ...rest }, ref) {
  return React.createElement("img", { ref, src, alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest })
})
`)
try {
  execFileSync("npx", [
    "esbuild", "scripts/render-explore-page.tsx", "--bundle", "--format=iife", "--jsx=automatic",
    '--define:process.env.NODE_ENV="production"', "--alias:@=.",
    "--banner:js=var process={env:{NODE_ENV:'production'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;",
    "--alias:next/navigation=./.explore-hover18-probe/navigation.js",
    "--alias:next/link=./.explore-hover18-probe/link.jsx",
    "--alias:next/image=./.explore-hover18-probe/image.jsx",
    "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
    `--outfile=${join(stubs, "app.js")}`, "--log-level=error",
  ], { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
} catch (e) {
  rmSync(stubs, { recursive: true, force: true })
  throw e
}
const js = readFileSync(join(stubs, "app.js"), "utf8")
/* No press leaves the page: a link pressed here is only noted. */
writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style>
<script>document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("a[href]")) e.preventDefault() }, true)</script></head>
<body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)
rmSync(join(stubs, "app.js"))

/*
  Headless Chromium answers (hover: none) and (pointer: none), so the computer is told it has a mouse. The phone is told it
  has a finger that still answers (hover: hover), as many Android phones and WebViews do: the hardest case for a hover.
*/
const MOUSE = "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"
const FINGER = "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=2,availablePointerTypes=2"
/* No setViewport for either: its touch override takes the hover back. The window is the size instead. */
let browser = await puppeteer.launch({ executablePath: CHROMIUM, defaultViewport: null, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--window-size=1440,900", MOUSE] })

/** Every frame for `ms`: the card's shadow alpha sum and blur, its border colour, and the cover's drawn width over its frame's. */
const READ = (ms) => `new Promise((done) => {
  const card = document.querySelector("[data-product-card]")
  const img = card.querySelector("img:not([aria-hidden])")
  const frame = img.parentElement
  const out = []
  const t0 = performance.now()
  const tick = () => {
    const cs = getComputedStyle(card)
    const sh = cs.boxShadow === "none" ? 0 : (cs.boxShadow.match(/rgba?\\([^)]*\\)/g) || []).reduce((n, c) => n + Number((c.match(/[\\d.]+/g) || [])[3] ?? 1), 0)
    out.push({ t: Math.round(performance.now() - t0), z: Math.round((img.getBoundingClientRect().width / frame.getBoundingClientRect().width) * 10000) / 10000, sh: Math.round(sh * 1000) / 1000, border: cs.borderTopColor })
    if (performance.now() - t0 < ${ms}) requestAnimationFrame(tick)
    else done(out)
  }
  requestAnimationFrame(tick)
})`

/* How a value travels from its first frame to its last: its largest step per 17ms as a share of the whole, and the frames it moved on. */
function travel(series, key) {
  const v = series.map((f) => f[key])
  const total = Math.abs(v[v.length - 1] - v[0])
  if (total === 0) return { total: 0, maxStep: 0, moving: 0, ms: 0, from: v[0], to: v[v.length - 1] }
  let maxStep = 0
  let moving = 0
  let first = -1
  let last = -1
  for (let i = 1; i < v.length; i++) {
    /* A step is weighed by the time it covered: a long frame (the CPU is slowed) may carry more, a snap carries it all in one. */
    const d = Math.abs(v[i] - v[i - 1]) / Math.max(1, (series[i].t - series[i - 1].t) / 17)
    if (v[i] !== v[i - 1]) {
      moving++
      if (first < 0) first = i - 1
      last = i
    }
    maxStep = Math.max(maxStep, d / total)
  }
  return { total: Math.round(total * 10000) / 10000, maxStep: Math.round(maxStep * 100) / 100, moving, ms: series[last].t - series[first].t, from: v[0], to: v[v.length - 1] }
}

async function sheet(frames, file, clip) {
  if (!frames.length) return
  const p = await browser.newPage()
  const scale = 1
  const cells = frames
    .map((f) => `<figure><div style="width:${clip.w * scale}px;height:${clip.h * scale}px;background:url(data:image/png;base64,${f.data}) -${clip.x}px -${clip.y}px no-repeat"></div><figcaption>${f.label}</figcaption></figure>`)
    .join("")
  await p.setViewport({ width: 6 * (clip.w + 8) + 8, height: 400 })
  await p.setContent(`<style>body{margin:4px;background:#ddd;font:11px system-ui;display:flex;flex-wrap:wrap;gap:8px}figure{margin:0}</style>${cells}`)
  await sleep(300)
  await p.screenshot({ path: file, fullPage: true })
  await p.close()
}

/* ── A computer, a mouse, the CPU four times slower ── */
{
  console.log("\ndesktop-1440")
  const page = await browser.newPage()
  await page.goto(`file://${join(stubs, "index.html")}#page`)
  await page.waitForSelector("[data-product-card] img")
  await page.evaluate(() => document.fonts.ready)
  await page.$eval("[data-product-card]", (c) => c.scrollIntoView({ block: "center" }))
  await sleep(600)
  const box = await page.$eval("[data-product-card]", (c) => {
    const r = c.getBoundingClientRect()
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
  })
  const cdp = await page.createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  const film = []
  cdp.on("Page.screencastFrame", (f) => {
    film.push({ at: f.metadata.timestamp * 1000, data: f.data })
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await page.mouse.move(box.x + box.w / 2, box.y - 60)
  await sleep(300)
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
  await sleep(200)
  /* What the card looks like at rest, the frame before the pointer arrives: a snap on the first frame is a step from it. */
  const rest = (await page.evaluate(READ(40))).pop()
  const tIn = Date.now()
  const inRead = page.evaluate(READ(900))
  await page.mouse.move(box.x + box.w / 2, box.y + box.h / 3)
  const hoverIn = [{ ...rest, t: 0 }, ...(await inRead)]
  const tOut = Date.now()
  const outRead = page.evaluate(READ(900))
  await page.mouse.move(box.x + box.w / 2, box.y - 60)
  const hoverOut = [{ ...hoverIn[hoverIn.length - 1], t: 0 }, ...(await outRead)]
  await sleep(100)
  await cdp.send("Page.stopScreencast")
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })

  const pick = (from, to, n) => {
    const list = film.filter((s) => s.at >= from - 30 && s.at <= to).sort((a, b) => a.at - b.at)
    const step = Math.max(1, Math.ceil(list.length / n))
    return list.filter((_, i) => i % step === 0).map((s) => ({ ...s, label: `+${Math.round(s.at - from)}ms` }))
  }
  const pad = 24
  const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), w: box.w + pad * 2, h: Math.min(box.h + pad * 2, 900) }
  await sheet(pick(tIn, tOut, 12), join(shots, `${tag}-explore-hover-in.png`), clip)
  await sheet(pick(tOut, tOut + 1100, 12), join(shots, `${tag}-explore-hover-out.png`), clip)

  for (const [name, series] of [["in", hoverIn], ["out", hoverOut]]) {
    const z = travel(series, "z")
    const s = travel(series, "sh")
    console.log(`  hover ${name}: zoom ${JSON.stringify(z)}  shadow ${JSON.stringify(s)}`)
    /* Over time, not a count of frames: a busy machine paints fewer frames, a snap is over in one. */
    expect(z.total === 0 || (z.maxStep <= 0.4 && z.ms >= 150), `hover ${name}: the cover's zoom moves over time, never most of the way in one frame`, z)
    expect(s.total === 0 || (s.maxStep <= 0.4 && s.ms >= 120), `hover ${name}: the card's shadow fades over time, never most of the way in one frame`, s)
  }
  const zi = travel(hoverIn, "z")
  const zo = travel(hoverOut, "z")
  const si = travel(hoverIn, "sh")
  const so = travel(hoverOut, "sh")
  expect(Math.abs(zo.to - hoverIn[0].z) < 0.0005 && Math.abs(so.to - hoverIn[0].sh) < 0.001, "hover out comes back to rest exactly", { zoom: [hoverIn[0].z, zo.to], shadow: [hoverIn[0].sh, so.to] })
  const same = (a, b) => a.ms === 0 || b.ms === 0 || (Math.max(a.ms, b.ms) / Math.max(1, Math.min(a.ms, b.ms)) <= 1.6)
  expect(same(zi, zo) && same(si, so), "hover in and hover out take about as long", { zoom: [zi.ms, zo.ms], shadow: [si.ms, so.ms] })
  await page.close()
}

/* ── A touch phone: a tap is a press, never a hover ── */
await browser.close()
browser = await puppeteer.launch({ executablePath: CHROMIUM, defaultViewport: null, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--window-size=390,844", FINGER] })
{
  console.log("\nphone-390 (touch)")
  const page = await browser.newPage()
  await page.goto(`file://${join(stubs, "index.html")}#page`)
  await page.waitForSelector("[data-product-card] img")
  await page.$eval("[data-product-card]", (c) => c.scrollIntoView({ block: "center" }))
  await sleep(500)
  const rest = await page.evaluate(READ(60))
  const box = await page.$eval("[data-product-card] img:not([aria-hidden])", (c) => {
    const r = c.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  /* What an Android tap leaves behind: the pointer there, :hover on the card. */
  await page.mouse.click(box.x, box.y)
  await sleep(700)
  const after = await page.evaluate(READ(60))
  const a = after[after.length - 1]
  const r0 = rest[rest.length - 1]
  expect(a.sh === 0 && a.z === r0.z && a.border === r0.border, "a tap leaves no hover on the card: no shadow, no zoom, the same border", { rest: r0, after: a })
  await page.screenshot({ path: join(shots, `${tag}-explore-touch-after-tap.png`) })
  await page.close()
}

await browser.close()
rmSync(stubs, { recursive: true, force: true })
console.log(`\nshots: ${shots}`)
if (broken) {
  console.log(`${broken} check(s) failed`)
  process.exit(1)
}
console.log("all checks passed")
