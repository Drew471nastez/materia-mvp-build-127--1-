/**
 * ===========================================================================
 *  ROUND 51: THE SHOP'S NAME BESIDE ITS LOGO, AND THE PACKING SLIP ON A COMPUTER
 * ===========================================================================
 * The real components (scripts/render-commerce-r51.tsx) in headless Chromium
 * at 390x844 and 1440x900, with the app's stylesheet (scripts/probe-css.mjs):
 *
 *   SHOP BAR    Settings › Checkout › Top of checkout. "Logo and name" (the
 *               default, and what a store that never chose gets) draws the
 *               logo and the name beside it on one line, centred on each
 *               other, 8px or more apart; a long name is cut with an
 *               ellipsis, never wrapped, and nothing scrolls sideways.
 *               "Logo" is the logo alone, "Name" the name alone, and "Logo"
 *               with no logo the photo (initials) and the name.
 *   SLIP        on a computer the packing slip icon shows the notice the
 *               phone shows: "Generating packing slip" with its ring within
 *               a frame of the press, its check once the slip is in, and the
 *               notice gone after; near the foot of the window (32px), and
 *               moved only by transform and opacity.
 *
 *   PROBE_CSS=source node scripts/check-commerce-r51.mjs
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { deflateSync } from "node:zlib"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const stubs = join(root, ".commerce-r51-probe")
mkdirSync(stubs, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

let html
try {
  writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => "/app/orders"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, ...rest }) }
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-commerce-r51.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY": '""' },
    alias: { "@": ".", "next/navigation": "./.commerce-r51-probe/navigation.js", "next/link": "./.commerce-r51-probe/link.jsx", "next/image": "./.commerce-r51-probe/image.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;background:#f8f9fa;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
} finally {
  rmSync(stubs, { recursive: true, force: true })
}

/* A wordmark four times as wide as tall, and a square mark: real PNGs, drawn here. */
function png(w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.writeUInt32BE(0x1a1a2eff, y * (w * 4 + 1) + 1 + x * 4)
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])
}
function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c
}
const WIDE = png(240, 60)
const SQUARE = png(64, 64)
const SLIP = `<!doctype html><html><head><meta charset="utf-8"><title>Packing slip</title></head><body><main data-packing-slip>Slip</main></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
try {
  for (const [label, vp] of [
    ["390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ["1440", { width: 1440, height: 900 }],
  ]) {
    console.log(`\nShop bar at ${label}\n`)
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const url = new URL(r.url())
      if (url.pathname === "/__r51") return r.respond({ status: 200, contentType: "text/html", body: html })
      if (url.hostname === "cdn.storelib.test") return r.respond({ status: 200, contentType: "image/png", body: url.pathname.includes("wide") ? WIDE : SQUARE })
      return r.abort()
    })
    await p.goto("https://storelib.com/__r51", { waitUntil: "networkidle0" })
    await new Promise((r) => setTimeout(r, 300))
    const read = await p.evaluate(() => {
      const box = (el) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        const s = getComputedStyle(el)
        return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), cy: Math.round(r.top + r.height / 2), h: Math.round(r.height), w: Math.round(r.width), shown: r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.opacity !== "0" }
      }
      const out = {}
      for (const el of document.querySelectorAll("[data-bar]")) {
        const face = el.querySelector("[data-shop-link]")
        const img = face?.querySelector("img")
        const name = face?.querySelector("[data-shop-name]")
        const initials = face?.querySelector("[data-app-avatar], span[aria-hidden], span.rounded-full")
        out[el.getAttribute("data-bar")] = {
          shows: face?.getAttribute("data-shows"),
          face: box(face),
          img: box(img),
          imgLoaded: img ? img.complete && img.naturalWidth > 0 : null,
          name: box(name),
          nameText: name?.textContent ?? null,
          nameCut: name ? name.scrollWidth > name.clientWidth : null,
          nameLines: name ? Math.round(name.getBoundingClientRect().height / parseFloat(getComputedStyle(name).lineHeight || "20")) : null,
          avatar: box(face?.firstElementChild && face.firstElementChild !== name ? face.firstElementChild : null),
          continue: box(el.querySelector("[data-continue]")),
        }
      }
      return { bars: out, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }
    })
    const b = read.bars
    const beside = (x) => x.img && x.name && x.img.shown && x.name.shown && x.name.l - x.img.r >= 8 && Math.abs(x.name.cy - x.img.cy) <= 1
    expect(beside(b.both) && b.both.imgLoaded, "Logo and name: the logo, then the name beside it, centred on each other", { img: b.both.img, name: b.both.name, gap: b.both.name && b.both.img ? b.both.name.l - b.both.img.r : null })
    expect(beside(b["both-square"]), "  with a square mark too", { img: b["both-square"].img, name: b["both-square"].name })
    expect(beside(b["both-long"]) && b["both-long"].nameLines === 1, `  a long name stays on one line${b["both-long"].nameCut ? ", cut with an ellipsis" : ""}`, { name: b["both-long"].name, cut: b["both-long"].nameCut, lines: b["both-long"].nameLines })
    if (b["both-long"].continue && b["both-long"].continue.shown) expect(b["both-long"].face.r <= b["both-long"].continue.l, "  and never runs under Continue shopping", { face: b["both-long"].face, cont: b["both-long"].continue })
    expect(b.logo.img?.shown && !b.logo.name, "Logo: the logo alone", { img: b.logo.img, name: b.logo.name })
    expect(!b.name.img && b.name.name?.shown && b.name.nameText === "Mona Modes", "Name: the name alone", { img: b.name.img, name: b.name.name })
    expect(!b["logo-none"].img && b["logo-none"].name?.shown && b["logo-none"].avatar?.w === 28, "Logo, with no logo yet: the photo's initials and the name", { avatar: b["logo-none"].avatar, name: b["logo-none"].name })
    expect(b.default.shows === "both" && beside(b.default), "A store that never chose: the logo and the name", b.default.shows)
    expect(read.overflow <= 0, "nothing scrolls sideways", read.overflow)
    expect(errors.length === 0, "no page error", errors)
    await p.close()
  }

  console.log("\nPacking slip on a computer (1440)\n")
  const p = await browser.newPage()
  await p.setViewport({ width: 1440, height: 900 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const url = new URL(r.url())
    if (url.pathname === "/__r51") return r.respond({ status: 200, contentType: "text/html", body: html })
    if (url.pathname === "/api/physical/orders/probe/packing-slip") return setTimeout(() => r.respond({ status: 200, contentType: "text/html", body: SLIP }).catch(() => {}), 700)
    return r.abort()
  })
  await p.goto("https://storelib.com/__r51?only=slip", { waitUntil: "networkidle0" })
  await p.evaluate(() => {
    window.__notice = []
    const t0 = { v: 0 }
    window.__t0 = t0
    const tick = () => {
      const n = document.querySelector("[data-slip-notice]")
      const pill = n?.querySelector(".slip-notice")
      const r = pill?.getBoundingClientRect()
      window.__notice.push({ t: Math.round(performance.now() - t0.v), phase: n?.getAttribute("data-slip-notice") ?? null, leaving: n?.hasAttribute("data-leaving") ?? false, bottom: r ? Math.round(innerHeight - r.bottom) : null, text: pill?.textContent ?? null })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    document.querySelector("[data-print]").addEventListener("click", () => (t0.v = performance.now()), { capture: true })
  })
  await new Promise((r) => setTimeout(r, 100))
  await p.click("[data-print]")
  await new Promise((r) => setTimeout(r, 3600))
  const frames = (await p.evaluate(() => window.__notice)).filter((f) => f.t >= 0)
  const after = frames.filter((f) => f.t >= 0 && f.t < 100000)
  const firstMaking = after.find((f) => f.phase === "making")
  const firstMade = after.find((f) => f.phase === "made")
  const gone = after.find((f, i) => i > 0 && f.phase === null && after.slice(0, i).some((x) => x.phase))
  expect(!!firstMaking && firstMaking.t <= 34 && /Generating packing slip/.test(firstMaking.text ?? ""), "the ring and \"Generating packing slip\" within a frame or two of the press", firstMaking)
  expect(!!firstMade && firstMade.t >= 650 && /Packing slip generated/.test(firstMade.text ?? ""), "  the check once the slip is in (it took 700ms here)", firstMade)
  expect(!!gone, "  and the notice leaves after the print", gone ?? frames.slice(-2))
  expect(firstMade?.bottom === 32, "  near the foot of the window on a computer (32px), once it has risen in", firstMade?.bottom)
  const anim = await p.evaluate(() => {
    const sheets = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules] } catch { return [] } })
    const rule = (sel) => sheets.find((r) => r.selectorText === sel)
    const trans = (sel) => rule(sel)?.style?.transitionProperty ?? null
    return { disc: trans(".slip-disc"), ring: trans(".slip-ring"), check: trans(".slip-check") }
  })
  expect(!/(^|,\s*)transform\b/.test(`${anim.disc},${anim.ring},${anim.check}`), "  its transitions move scale and opacity, never transform", anim)
  expect(errors.length === 0, "no page error", errors)
  await p.close()
} finally {
  await browser.close()
}
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
