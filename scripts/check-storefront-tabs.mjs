#!/usr/bin/env node
/**
 * ===========================================================================
 *  SWITCHING TABS ON A CREATOR PAGE: NOTHING FLASHES, NOTHING JUMPS
 * ===========================================================================
 * "Switching between Home / Products / Communities must feel smooth and
 *  clean, no flash or jump."
 *
 * The real strip, the real product cards and the real About block
 * (scripts/render-storefront-tabs.tsx), served over HTTP so next/image asks
 * for its pictures the way it does on the live page. Every picture is
 * answered 250ms late, which is a phone on a good connection.
 *
 * Four things are measured, at 390px and at 1280px:
 *
 *   PICTURES     the Products tab's cards on the first frame after the press:
 *                how many are already decoded. A panel that is `hidden` never
 *                asks for a lazy picture, so without warming every card
 *                opened as a grey box and filled in a quarter second later.
 *   STILL TABS   where each tab label starts, before and after a switch. The
 *                chosen tab is set a weight heavier; if that widens it, the
 *                labels to its right move sideways on every press.
 *   STILL STRIP  where the strip is on screen after switching to a short tab
 *                from far down a long one. When the page gets shorter than
 *                the scroll position the browser clamps it and the strip
 *                drops down the screen under the finger.
 *   THE MARK     the underline's motion is on transform only, and the
 *                panels do not animate at all.
 *
 *   node scripts/check-storefront-tabs.mjs
 *   SHOTS=<dir> node scripts/check-storefront-tabs.mjs   pictures for the eye
 */
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { deflateSync } from "node:zlib"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

/* A solid PNG, built by hand so the probe needs no image library. */
function png(w, h, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const row = Buffer.alloc(1 + w * 3)
  for (let x = 0; x < w; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b }
  const raw = Buffer.concat(Array.from({ length: h }, () => row))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])
}
const PICTURE = png(480, 360, [196, 190, 176])

const dir = join(root, ".storefront-tabs-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/lucadragoste"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-storefront-tabs.tsx")],
    bundle: true,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    logLevel: "error",
    outfile: join(dir, "probe.js"),
    banner: { js: 'var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;' },
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "next/navigation": join(dir, "navigation.js"), "next/link": join(dir, "link.jsx"), "@": root },
    loader: { ".jsx": "jsx", ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
} catch (e) { rmSync(dir, { recursive: true, force: true }); fail(`the probe did not bundle: ${e.message}`) }
const js = readFileSync(join(dir, "probe.js"), "utf8").replace(/<\/script/gi, "<\\/script")
rmSync(dir, { recursive: true, force: true })
const css = await appCss(root)
/* Inter from a build when there is one; INTER_WOFF2=<file> otherwise, since
   the weight difference between the tabs only exists in the variable face. */
const faces = interFaces(root) || (process.env.INTER_WOFF2
  ? `@font-face{font-family:Inter;font-weight:100 900;src:url(data:font/woff2;base64,${readFileSync(process.env.INTER_WOFF2).toString("base64")}) format("woff2")}`
  : "")
if (!faces) console.log("\n  (no Inter: measuring the fallback face, where the tabs' two weights may be the same width)")

const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f6f6f7}</style>` +
  `</head><body><div id="root"></div><script>window.addEventListener("error",function(e){window.__err=String(e.message)})</script><script>${js}</script></body></html>`

const requests = []
const server = createServer((req, res) => {
  if (req.url.startsWith("/_next/image") || req.url.startsWith("/img/")) {
    const u = new URL(req.url, "http://x")
    requests.push({ at: Date.now(), url: decodeURIComponent(u.searchParams.get("url") || u.pathname) })
    setTimeout(() => { res.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=3600" }); res.end(PICTURE) }, 250)
    return
  }
  res.writeHead(200, { "content-type": "text/html" }); res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const problems = []

for (const [label, viewport] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ["1280", { width: 1280, height: 800, deviceScaleFactor: 1 }],
]) {
  requests.length = 0
  const p = await browser.newPage()
  await p.setViewport(viewport)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(base, { waitUntil: "load" })
  await p.waitForSelector('[role="tab"]', { timeout: 8000 }).catch(() => fail(`${label}: the strip did not render${errors.length ? `: ${errors[0]}` : ""}`))
  await p.evaluate(() => document.fonts.ready)
  /* Long enough for an idle callback and the pictures behind it. */
  await wait(2200)

  const tabBox = () => p.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => {
    const r = t.getBoundingClientRect()
    const label = t.querySelector("[data-tab-label]") || t
    const lr = label.getBoundingClientRect()
    return { id: t.textContent.trim(), left: Math.round(r.left * 10) / 10, width: Math.round(r.width * 10) / 10, textLeft: Math.round(lr.left * 10) / 10 }
  }))
  const press = (name) => p.evaluate((n) => {
    const t = [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === n)
    t.click()
  }, name)

  /* ── PICTURES ─────────────────────────────────────────────────────── */
  const beforeSwitch = requests.length
  const firstFrame = await p.evaluate(() => new Promise((resolve) => {
    const t = [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === "Products")
    t.click()
    requestAnimationFrame(() => {
      const panel = document.getElementById("storefront-panel-products")
      const imgs = [...panel.querySelectorAll("img")]
      const r = panel.getBoundingClientRect()
      resolve({
        total: imgs.length,
        ready: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
        /* Only the cards on screen count for what the eye sees. */
        onScreen: imgs.filter((i) => { const b = i.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight }).length,
        onScreenReady: imgs.filter((i) => { const b = i.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight && i.complete && i.naturalWidth > 0 }).length,
        panelTop: Math.round(r.top),
        opacity: getComputedStyle(panel).opacity,
        transform: getComputedStyle(panel).transform,
      })
    })
  }))
  const warmed = requests.filter((r) => r.url.startsWith("/img/p")).length
  console.log(`\n${label}px`)
  console.log(`  pictures asked for before any press   ${beforeSwitch} (${warmed} of them behind the Products tab)`)
  console.log(`  Products, first frame after the press  ${firstFrame.ready} of ${firstFrame.total} pictures decoded, opacity ${firstFrame.opacity}, transform ${firstFrame.transform}`)
  if (firstFrame.total === 0) problems.push(`${label}: the Products tab drew no pictures`)
  else if (firstFrame.ready < firstFrame.total) problems.push(`${label}: ${firstFrame.total - firstFrame.ready} of ${firstFrame.total} Products pictures were not ready on the first frame, so they open grey and fill in`)
  if (firstFrame.opacity !== "1" || firstFrame.transform !== "none") problems.push(`${label}: the arriving panel animates (${firstFrame.opacity}, ${firstFrame.transform})`)
  const afterSwitchReq = requests.length
  await press("Home"); await wait(300); await press("Products"); await wait(300); await press("Home"); await wait(300)
  if (requests.length !== afterSwitchReq) problems.push(`${label}: switching back and forth asked for ${requests.length - afterSwitchReq} more pictures`)

  /* ── STILL TABS ───────────────────────────────────────────────────── */
  const tabsHome = await tabBox()
  await press("Communities"); await wait(350)
  const tabsCommunities = await tabBox()
  const moved = tabsHome.map((t, i) => ({ id: t.id, dx: Math.round((tabsCommunities[i].left - t.left) * 10) / 10, dw: Math.round((tabsCommunities[i].width - t.width) * 10) / 10 }))
  console.log(`  tabs, Home → Communities               ${moved.map((m) => `${m.id} ${m.dx >= 0 ? "+" : ""}${m.dx}px`).join(", ")}`)
  for (const m of moved) if (Math.abs(m.dx) > 0.1 || Math.abs(m.dw) > 0.1) problems.push(`${label}: "${m.id}" moved ${m.dx}px and changed width by ${m.dw}px when another tab was chosen`)

  /* ── THE MARK ─────────────────────────────────────────────────────── */
  const mark = await p.evaluate(() => {
    const el = document.querySelector("[data-tab-mark]")
    if (!el) return null
    const cs = getComputedStyle(el)
    return { property: cs.transitionProperty, left: cs.left, width: cs.width, transform: cs.transform }
  })
  console.log(`  the underline moves by                 ${mark ? mark.property : "(no mark found)"}`)
  if (!mark) problems.push(`${label}: no sliding underline`)
  else if (/left|width/.test(mark.property) || !/transform/.test(mark.property)) problems.push(`${label}: the underline animates ${mark.property}, which is layout, not transform`)
  if (process.env.SHOTS) {
    mkdirSync(process.env.SHOTS, { recursive: true })
    await p.evaluate(() => document.getElementById("storefront-panel-communities").scrollIntoView({ block: "center" }))
    await wait(200)
    await p.screenshot({ path: join(process.env.SHOTS, `communities-${label}.png`) })
    const box = await p.$('#storefront-panel-communities [data-panel-spacing]')
    if (box) await box.screenshot({ path: join(process.env.SHOTS, `communities-box-${label}.png`) })
    /* The same box under a dark scheme's tokens, the way the page rebinds them. */
    await p.evaluate(() => {
      const el = document.getElementById("storefront-panel-communities")
      for (const [k, v] of Object.entries({ "--card": "#18181b", "--foreground": "#f4f4f5", "--muted": "#232326", "--border": "#2e2e33", "--muted-foreground": "#a1a1aa" })) el.style.setProperty(k, v)
      el.style.background = "#0f0f10"
      el.style.color = "#f4f4f5"
    })
    if (box) await box.screenshot({ path: join(process.env.SHOTS, `communities-box-dark-${label}.png`) })
    await p.evaluate(() => {
      const el = document.getElementById("storefront-panel-communities")
      el.removeAttribute("style")
    })
  }

  /* ── STILL STRIP ──────────────────────────────────────────────────── */
  await press("Products"); await wait(300)
  /* Down the long tab until the strip is near the top, then to the short one. */
  const stripAt = await p.evaluate(() => {
    const strip = document.querySelector('[role="tablist"]')
    const y = strip.getBoundingClientRect().top + scrollY - 12
    scrollTo(0, y)
    return new Promise((r) => requestAnimationFrame(() => r(Math.round(strip.getBoundingClientRect().top))))
  })
  const frames = await p.evaluate(() => new Promise((resolve) => {
    const strip = document.querySelector('[role="tablist"]')
    const out = []
    const t = [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim() === "Communities")
    t.click()
    let n = 0
    const tick = () => { out.push(Math.round(strip.getBoundingClientRect().top)); if (++n < 6) requestAnimationFrame(tick); else resolve(out) }
    requestAnimationFrame(tick)
  }))
  console.log(`  strip on screen, scrolled then Communities  ${stripAt}px → ${frames.join(", ")}`)
  if (frames.some((y) => Math.abs(y - stripAt) > 1)) problems.push(`${label}: the strip moved from ${stripAt}px to ${frames.find((y) => Math.abs(y - stripAt) > 1)}px on screen when a shorter tab was chosen`)
  /* And the room it kept goes once it is out of sight, so the page does not end in a hole. */
  await p.evaluate(() => scrollTo(0, 0)); await wait(250)
  const reserve = await p.evaluate(() => {
    const el = document.querySelector("[data-tab-panels]")
    return el ? el.style.minHeight || "none" : "no panels wrapper"
  })
  console.log(`  held room once scrolled back to the top    ${reserve}`)
  if (reserve !== "none" && reserve !== "") problems.push(`${label}: the room held for the strip is still there at the top of the page (${reserve})`)

  if (errors.length) problems.push(`${label}: ${errors[0]}`)
  await p.close()
}

await browser.close()
server.close()
console.log("")
if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("Switching tabs: pictures ready, labels still, strip still, the mark on transform.\n")
