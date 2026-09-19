/**
 * ===========================================================================
 *  NO LIGHT LINE UNDER THE HEADER
 * ===========================================================================
 * "What is that white line under the header section" was reported twice, and
 * answered twice with a colour that was still a light colour. The header's
 * bottom border was `scheme.inset_border`, which is a light grey because it
 * is meant for dividers inside light content; then it was the header's own
 * text colour at low alpha, which on a dark header is white. Both of them
 * draw a line that is lighter than the header, and a line lighter than the
 * surface it is on does not read as a join. It reads as a stripe.
 *
 * So the claim this file measures is a pixel claim, and it is checked in
 * pixels: photograph the header sitting on the block below it, walk the rows
 * of the photograph across the join, and compare each row against the header
 * above it. Nothing across that join may come out lighter.
 *
 * It also checks the opposite, because "no light line" is trivially passed by
 * drawing nothing: under a light header the separator must still be there and
 * still be visible, which is a row measurably DARKER than the header.
 *
 * The screenshot is decoded by a second page drawing it into a canvas, the
 * way scripts/check-ground.mjs does, so reading real pixels costs no
 * dependency.
 *
 *   pnpm build && node scripts/check-header-seam.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-seam-"))
const stubs = join(root, ".seam-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)

const WIDTH = 900

/*
  One case per header colour, each over the background the section under it
  would have. `under` is what the block below is painted, so the probe knows
  what the join is BETWEEN without having to read it off the screenshot.

  The two same-on-same cases are the ones the report is about: a join between
  two surfaces of one colour is where a line has nothing to hide behind.
*/
const CASES = [
  { key: "black", scheme: "black", under: "#000000", device: "mobile", darkHeader: true },
  { key: "dark", scheme: "dark", under: "#1f2937", device: "desktop", darkHeader: true },
  { key: "white", scheme: "white", under: "#ffffff", device: "desktop", darkHeader: false },
  { key: "light", scheme: "light", under: "#f8fafc", device: "mobile", darkHeader: false },
  /* A dark header over a light section: the colours already separate it, and
     a light line here lands on the light section rather than on the header. */
  { key: "blackOnWhite", scheme: "black", under: "#ffffff", device: "desktop", darkHeader: true },
]

execFileSync("npx", [
  "esbuild", join(root, "scripts/render-header-seam.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: root, stdio: "inherit" })

const stacks = CASES.map((c) =>
  `<div class="case" data-case="${c.key}">` +
  `<div id="${c.key}" data-mount data-scheme="${c.scheme}" data-device="${c.device}"></div>` +
  `<div class="under" style="background:${c.under};height:120px"></div>` +
  `</div>`,
).join("")

const file = join(out, "index.html")
writeFileSync(file,
  `<!doctype html><html class="light"><head><meta charset="utf-8"><style>${css}</style>` +
  /* No gap between the cases and none inside one: any pale row the probe
     finds has to have been painted by the header, not left by this page. */
  `<style>body{margin:0;background:#7f00ff}.case{width:${WIDTH}px}</style></head><body>` +
  stacks +
  `<script>window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script>${readFileSync(join(out, "probe.js"), "utf8")}</script></body></html>`)

/* Where each header ends, in page pixels, read after React has drawn. */
const GEOMETRY = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  await new Promise((r) => setTimeout(r, 250))
  const cases = [...document.querySelectorAll("[data-case]")].map((box) => {
    const mount = box.querySelector("[data-mount]")
    const r = mount.getBoundingClientRect()
    return { key: box.getAttribute("data-case"), top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), height: Math.round(r.height) }
  })
  return JSON.stringify({ cases, dpr: window.devicePixelRatio, docHeight: document.documentElement.scrollHeight })
})()`

function reachabilityFlags() {
  return ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--force-device-scale-factor=1", "--remote-debugging-port=0", "about:blank"]
}

const proc = spawn(CHROMIUM, reachabilityFlags(), { stdio: ["ignore", "ignore", "pipe"] })
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
const send = (method, params, sessionId) =>
  new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, { resolve, reject })
    ws.send(JSON.stringify(sessionId ? { id: n, method, params, sessionId } : { id: n, method, params }))
  })

const { targetId } = await send("Target.createTarget", { url: "about:blank" })
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
const call = (method, params) => send(method, params, sessionId)
await call("Page.enable", {})
await call("Runtime.enable", {})
await call("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 900, deviceScaleFactor: 1, mobile: false })
await call("Page.navigate", { url: "file://" + file })
await sleep(1200)

const geo = await call("Runtime.evaluate", { expression: GEOMETRY, awaitPromise: true, returnByValue: true })
if (geo.exceptionDetails) fail(`Measuring the page threw: ${JSON.stringify(geo.exceptionDetails.text || geo.exceptionDetails)}`)
const { cases, dpr, docHeight } = JSON.parse(geo.result.value)

/* The whole document in one photograph, so every join is in the same image
   and the rows of one case are the rows of the others. */
const shot = await call("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: WIDTH, height: docHeight, scale: 1 },
})
await send("Target.closeTarget", { targetId }, null)

/* BAND is how far either side of the join is inspected. A border is one CSS
   pixel and a shadow a few, so six rows below and three above covers both
   and still cannot reach the middle of either surface. */
const ABOVE = 3
const BELOW = 6
/* A row is sampled across the middle of the page, away from the logo and the
   icons, so what is measured is the full-width line and not a glyph. */
const READ = `(async () => {
  const img = new Image()
  img.src = "data:image/png;base64,${shot.data}"
  await img.decode()
  const c = document.createElement("canvas")
  c.width = img.width; c.height = img.height
  const g = c.getContext("2d")
  g.drawImage(img, 0, 0)
  const cases = ${JSON.stringify(cases.map((c) => ({ ...c, under: (CASES.find((x) => x.key === c.key) || {}).under })))}
  const dpr = ${dpr}
  const lumOf = (hex) => {
    const n = parseInt(hex.slice(1), 16)
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255))
  }
  const rowAt = (y) => {
    const py = Math.round(y * dpr)
    if (py < 0 || py >= c.height) return null
    /* The middle half of the width: full-width lines cross all of it and
       text does not, so a mean here is the line or it is the background. */
    const x0 = Math.round(c.width * 0.25)
    const w = Math.round(c.width * 0.5)
    const d = g.getImageData(x0, py, w, 1).data
    let r = 0, gg = 0, b = 0
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2] }
    const n = d.length / 4
    return { y, r: r / n, g: gg / n, b: b / n, lum: (0.2126 * r + 0.7152 * gg + 0.0722 * b) / n }
  }
  const out = {}
  for (const k of cases) {
    /* The header's own colour, read well above the join and clear of its
       content, so a row near the edge has something honest to be compared
       against. */
    const body = rowAt(k.top + Math.round(k.height * 0.12))
    const headerLum = body.lum
    const underLum = lumOf(k.under)
    const rows = []
    for (let dy = -${ABOVE}; dy <= ${BELOW}; dy++) {
      const row = rowAt(k.bottom + dy)
      if (!row) continue
      /*
        WHICH SURFACE IS THIS ROW ON. Above the join it is the header, below
        it the section, and the boundary row itself is shared by the two and
        judged against whichever is lighter. Comparing a row of a white
        section against a black header would call the section a line.
      */
      const surface = dy < 0 ? headerLum : dy > 0 ? underLum : Math.max(headerLum, underLum)
      rows.push({ dy, lum: Math.round(row.lum * 10) / 10, over: Math.round((row.lum - surface) * 10) / 10 })
    }
    /* Only the header's own rows can carry the separator: the border is
       drawn inside its box. */
    const ownRows = rows.filter((r) => r.dy < 0)
    out[k.key] = {
      headerLum: Math.round(headerLum * 10) / 10,
      underLum: Math.round(underLum * 10) / 10,
      rows,
      lightest: rows.reduce((a, x) => (x.over > a.over ? x : a), rows[0]),
      darkestOwn: ownRows.reduce((a, x) => (x.lum < a.lum ? x : a), ownRows[0]),
    }
  }
  return JSON.stringify(out)
})()`

const { targetId: t2 } = await send("Target.createTarget", { url: "about:blank" })
const { sessionId: s2 } = await send("Target.attachToTarget", { targetId: t2, flatten: true })
const decoded = await send("Runtime.evaluate", { expression: READ, awaitPromise: true, returnByValue: true }, s2)
if (decoded.exceptionDetails) fail(`Reading the photograph threw: ${JSON.stringify(decoded.exceptionDetails.text || decoded.exceptionDetails)}`)
await send("Target.closeTarget", { targetId: t2 }, null)
const seams = JSON.parse(decoded.result.value)

ws.close()
proc.kill()

let bad = 0
const expect = (ok, what, got) => {
  console.log(`${ok ? "  ok" : "FAIL"}  ${what}${got === undefined ? "" : `  →  ${got}`}`)
  if (!ok) bad++
}

console.log("\nThe join between the header and the section under it, in pixels\n")

/* A row within a pixel and a half of the header's own brightness is the
   header, not a line. Anything above that is something drawn. */
const LIGHTER_TOLERANCE = 1.5
/* A separator that is there must be seen. Four levels of luminance is what a
   1px hairline at 10% black comes to on white, and it is visible. */
const MIN_VISIBLE_DARKENING = 3

for (const c of CASES) {
  const s = seams[c.key]
  if (!s) { expect(false, `${c.key}: the case rendered`); continue }
  console.log(`  ${c.key}  header ${s.headerLum} over ${s.underLum}  rows ${s.rows.map((r) => `${r.dy >= 0 ? "+" : ""}${r.dy}:${r.lum}`).join(" ")}`)

  expect(
    s.lightest.over <= LIGHTER_TOLERANCE,
    `${c.key}: nothing across the join is lighter than the surface it is on`,
    `worst +${s.lightest.over} at ${s.lightest.dy}`,
  )

  if (!c.darkHeader) {
    expect(
      s.darkestOwn.lum <= s.headerLum - MIN_VISIBLE_DARKENING,
      `${c.key}: the separator under a light header is still visible`,
      `darkest ${s.darkestOwn.lum}, header ${s.headerLum}`,
    )
  }
}

console.log("")
if (bad) fail(`${bad} measurement${bad === 1 ? "" : "s"} failed.`)
console.log("Every join is the header's own colour or darker.\n")
