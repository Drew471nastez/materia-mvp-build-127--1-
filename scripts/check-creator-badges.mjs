#!/usr/bin/env node
/**
 * ===========================================================================
 *  THE VETERAN BADGE: BESIDE THE NAME, AND IT SAYS WHAT IT IS
 * ===========================================================================
 * The real header and the real badge (scripts/render-creator-badges.tsx) at
 * 390 and 1280, on a light page and a dark one:
 *
 *   BESIDE THE NAME   on the name's line, vertically centred on it
 *   ON A COMPUTER     hovering shows "Veteran" above the badge, leaving hides it
 *   ON A PHONE        a tap shows it, a tap elsewhere hides it
 *   INSIDE A LINK     tapping the badge in a product page's creator row does
 *                     not follow the link
 *
 *   node scripts/check-creator-badges.mjs
 *   SHOTS=<dir> node scripts/check-creator-badges.mjs
 */
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".creator-badges-probe")
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
    entryPoints: [join(root, "scripts/render-creator-badges.tsx")],
    bundle: true, format: "iife", platform: "browser", jsx: "automatic", logLevel: "error",
    outfile: join(dir, "probe.js"),
    banner: { js: 'var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;' },
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "next/navigation": join(dir, "navigation.js"), "next/link": join(dir, "link.jsx"), "@": root },
    loader: { ".jsx": "jsx", ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    absWorkingDir: root, nodePaths: [join(root, "node_modules")],
  })
} catch (e) { rmSync(dir, { recursive: true, force: true }); fail(`the probe did not bundle: ${e.message}`) }
const js = readFileSync(join(dir, "probe.js"), "utf8").replace(/<\/script/gi, "<\\/script")
rmSync(dir, { recursive: true, force: true })
const css = await appCss(root)
const faces = interFaces(root) || (process.env.INTER_WOFF2
  ? `@font-face{font-family:Inter;font-weight:100 900;src:url(data:font/woff2;base64,${readFileSync(process.env.INTER_WOFF2).toString("base64")}) format("woff2")}`
  : "")
const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="root"></div><script>window.addEventListener("error",function(e){window.__err=String(e.message)})</script><script>${js}</script></body></html>`
const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html) })
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const problems = []
if (process.env.SHOTS) mkdirSync(process.env.SHOTS, { recursive: true })

for (const theme of ["light", "dark"]) for (const [label, viewport] of [
  ["390", { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ["1280", { width: 1280, height: 800, deviceScaleFactor: 2 }],
]) {
  const at = `${label} ${theme}:`
  const phone = label === "390"
  const p = await browser.newPage()
  await p.setViewport(viewport)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}/?theme=${theme}`, { waitUntil: "load" })
  await p.waitForSelector("h1 [data-creator-badge]", { timeout: 8000 }).catch(async () => fail(`${at} no badge in the header ${await p.evaluate(() => window.__err || "")}`))
  await p.evaluate(() => document.fonts.ready)
  await wait(200)
  const geo = await p.evaluate(() => {
    const h1 = document.querySelector("h1")
    const badge = h1.querySelector("[data-creator-badge]")
    const range = document.createRange()
    range.selectNodeContents(h1.firstChild)
    const name = range.getBoundingClientRect()
    const b = badge.getBoundingClientRect()
    return { gap: Math.round(b.left - name.right), centre: Math.round((b.top + b.height / 2) - (name.top + name.height / 2)), size: Math.round(b.height), label: badge.getAttribute("aria-label") }
  })
  console.log(`\n${at}`)
  console.log(`  beside the name            ${geo.gap}px after it, ${geo.centre}px off its centre, ${geo.size}px, named "${geo.label}"`)
  if (geo.gap < 2 || geo.gap > 12) problems.push(`${at} the badge is ${geo.gap}px from the name`)
  if (Math.abs(geo.centre) > 2) problems.push(`${at} the badge is ${geo.centre}px off the name's centre line`)
  if (geo.label !== "Veteran") problems.push(`${at} the badge is named "${geo.label}"`)

  const shown = () => p.evaluate(() => {
    const el = document.querySelector("[data-creator-badge-label]")
    if (!el) return null
    const r = el.getBoundingClientRect()
    const b = document.querySelector("h1 [data-creator-badge]").getBoundingClientRect()
    return { text: el.textContent, above: Math.round(b.top - r.bottom), centred: Math.round((r.left + r.width / 2) - (b.left + b.width / 2)), bg: getComputedStyle(el).backgroundColor }
  })
  const badge = await p.$("h1 [data-creator-badge]")
  if (phone) {
    await badge.tap()
  } else {
    await badge.hover()
  }
  await wait(250)
  const tip = await shown()
  console.log(`  ${phone ? "tapped" : "hovered"}                    ${tip ? `"${tip.text}" ${tip.above}px above, ${tip.centred}px off centre, ${tip.bg}` : "nothing"}`)
  if (!tip || tip.text !== "Veteran") problems.push(`${at} ${phone ? "a tap" : "hovering"} did not say Veteran`)
  else if (tip.above < 2 || Math.abs(tip.centred) > 1) problems.push(`${at} the label is not centred above the badge (${tip.above}px above, ${tip.centred}px off)`)
  if (process.env.SHOTS) {
    const h = await p.$("h1")
    const r = await h.boundingBox()
    await p.screenshot({ path: join(process.env.SHOTS, `badge-${theme}-${label}.png`), clip: { x: Math.max(0, r.x - 20), y: Math.max(0, r.y - 44), width: Math.min(viewport.width, r.width + 40), height: r.height + 60 } })
  }
  if (phone) await p.touchscreen.tap(20, 700)
  else await p.mouse.move(5, 790)
  await wait(250)
  if (await shown()) problems.push(`${at} the label stayed after ${phone ? "a tap elsewhere" : "the pointer left"}`)

  /* Inside the product row's link. */
  const rowBadge = await p.$("[data-probe-row] [data-creator-badge]")
  if (phone) await rowBadge.tap(); else await rowBadge.click()
  await wait(250)
  const hash = await p.evaluate(() => location.hash)
  console.log(`  badge in a link, pressed   ${hash ? `followed the link (${hash})` : "stayed"}`)
  if (hash) problems.push(`${at} pressing the badge inside the creator row followed the link`)
  if (process.env.SHOTS) {
    const row = await p.$("[data-probe-row]")
    const r = await row.boundingBox()
    await p.screenshot({ path: join(process.env.SHOTS, `badge-row-${theme}-${label}.png`), clip: { x: r.x - 8, y: r.y - 40, width: r.width + 16, height: r.height + 48 } })
  }
  if (errors.length) problems.push(`${at} ${errors[0]}`)
  await p.close()
}

await browser.close()
server.close()
console.log("")
if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("The badge sits beside the name and says Veteran on hover and on a tap.\n")
