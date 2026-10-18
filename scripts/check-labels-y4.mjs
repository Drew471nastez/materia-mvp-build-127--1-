/**
 * ===========================================================================
 *  THE LABEL SCREENS, MEASURED (ROUND Y4)
 * ===========================================================================
 * The real order panel (components/physical/order-panel.tsx with
 * buy-label.tsx), mounted the way scripts/help-shots.mjs mounts it, from
 * scripts/render-help-shots.tsx with its demo answers, at a phone's 390 and
 * a desktop's 1280 CSS pixels:
 *
 *   rates      Fulfill items, Buy a label, rates back
 *   bought     the Label bought window, with Print label
 *   shipment   a shipment with its label (Print label)
 *   loose      a label not on a shipment (Void, Print, Ship with this label)
 *   local      Fulfill items on a local delivery order: no Buy a label
 *
 * For each: no horizontal scroll on the page, every button and link of the
 * state inside the viewport's width, at least 32px tall (a switch counts
 * its label, which presses it too), and the topmost
 * element at its centre once scrolled to (nothing covers it); every text of
 * the state at a contrast of at least 4.5:1 with what is behind it.
 *
 *   node scripts/check-labels-y4.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── Build: the help shots' renderer, bundled the same way ─────────────── */
const out = join(root, ".labels-y4-probe")
mkdirSync(out, { recursive: true })
writeFileSync(join(out, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, fill, priority, unoptimized, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, width, height, ...rest }) }
`)
writeFileSync(join(out, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, scroll, replace, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(out, "empty.js"), "export {}\n")
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-help-shots.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN="storelib.com"', '--define:process.env.NEXT_PUBLIC_PLATFORM_CURRENCY="usd"', '--define:process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_placeholder"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
    `--alias:next/navigation=${join(root, "scripts/probe-next-navigation.ts")}`, `--alias:next/link=${join(out, "link.jsx")}`, `--alias:next/image=${join(out, "image.jsx")}`,
    `--alias:server-only=${join(out, "empty.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "inherit", "inherit"] })
} finally {
  /* The bundle is read below; the stand ins go either way. */
}
const bundle = readFileSync(join(out, "probe.js"))
rmSync(out, { recursive: true, force: true })
const css = await appCss(root)
const faces = interFaces(root)
const mediaDir = faces.match(/url\(file:\/\/([^)]*\/static\/media)\//)?.[1] ?? null
const inter = faces.replace(/url\(file:\/\/[^)]*\/static\/media\//g, "url(/media/")
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  const p = req.url.split("?")[0]
  if (p.startsWith("/media/") && mediaDir && /^[\w.-]+$/.test(p.slice(7))) { try { res.writeHead(200, { "content-type": "font/woff2" }); return res.end(readFileSync(join(mediaDir, p.slice(7)))) } catch { res.writeHead(404); return res.end() } }
  if (p === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  const file = join(root, "public", p)
  if (/^\/(carriers|flags)\/[\w.-]+$/.test(p) && existsSync(file)) { res.writeHead(200, { "content-type": p.endsWith(".svg") ? "image/svg+xml" : "image/webp" }); return res.end(readFileSync(file)) }
  res.writeHead(200, { "content-type": "text/html" }); res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

/* ── In the page: the measurements ─────────────────────────────────────── */
const MEASURE = `
window.__lum = (c) => { const m = c.match(/[\\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map((v) => { v = Number(v) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
window.__alpha = (c) => { const m = c.match(/[\\d.]+/g); return m && m.length > 3 ? Number(m[3]) : 1 }
window.__bg = (el) => { for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && window.__alpha(c) > 0.5) return c } return "rgb(255, 255, 255)" }
window.__measure = (sel) => {
  const scope = document.querySelector(sel)
  if (!scope) return { missing: sel }
  const vw = document.documentElement.clientWidth
  const hscroll = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
  const controls = [...scope.querySelectorAll("button, a[href], [role=radio]")].filter((e) => e.offsetParent !== null && getComputedStyle(e).visibility !== "hidden")
  const bad = []
  let minH = Infinity
  for (const c of controls) {
    c.scrollIntoView({ block: "center", inline: "nearest" })
    const r = c.getBoundingClientRect()
    /* A switch is pressed by its whole row: its <label> is part of what a finger hits. */
    const hit = Math.max(r.height, ...[...(c.labels ?? [])].map((l) => l.getBoundingClientRect().height))
    minH = Math.min(minH, hit)
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    const name = (c.getAttribute("aria-label") || c.textContent || "").trim().slice(0, 40) || c.tagName.toLowerCase() + (c.getAttribute("role") ? "[role=" + c.getAttribute("role") + "]" : "") + (c.id ? "#" + c.id : "")
    if (r.left < -0.5 || r.right > vw + 0.5) bad.push(name + ": outside the width (" + Math.round(r.left) + ".." + Math.round(r.right) + " of " + vw + ")")
    if (hit < 32) bad.push(name + ": " + Math.round(hit) + "px tall")
    if (!top || !(c === top || c.contains(top))) bad.push(name + ": covered by " + (top ? top.tagName + "." + String(top.className).slice(0, 40) : "nothing"))
  }
  let minContrast = Infinity, worst = ""
  const texts = [...scope.querySelectorAll("*")].filter((e) => e.offsetParent !== null && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
  for (const t of texts) {
    const cs = getComputedStyle(t)
    if (Number(cs.opacity) < 1 || t.closest("[aria-hidden=true]")) continue
    const fg = window.__lum(cs.color), bgc = window.__lum(window.__bg(t))
    if (fg === null || bgc === null) continue
    const ratio = (Math.max(fg, bgc) + 0.05) / (Math.min(fg, bgc) + 0.05)
    if (ratio < minContrast) { minContrast = ratio; worst = t.textContent.trim().slice(0, 40) }
  }
  return { hscroll, controls: controls.length, minHeight: Math.round(minH), minContrast: Math.round(minContrast * 100) / 100, worst, bad }
}
window.__press = (text) => { const b = [...document.querySelectorAll("button, [role=radio]")].find((e) => e.textContent.trim() === text); if (b) b.click(); return !!b }
`

const STATES = [
  { name: "rates", q: "label=1", sel: "[role=dialog]", act: async (p) => { await p.evaluate(() => window.__press("Fulfill items")); await wait(600); await p.evaluate(() => document.querySelector('[data-ship-mode-option="label"]')?.click()); await wait(500); await p.evaluate(() => document.querySelector("[data-label-submit]")?.click()); await wait(900) }, expect: (p) => p.evaluate(() => document.querySelectorAll("[data-label-rate]").length === 3 && !!document.querySelector("[data-label-submit]")?.textContent.includes("Buy label")) },
  { name: "bought", q: "label=1", sel: "[role=dialog]", act: async (p) => { await p.evaluate(() => window.__press("Fulfill items")); await wait(600); await p.evaluate(() => document.querySelector('[data-ship-mode-option="label"]')?.click()); await wait(500); await p.evaluate(() => document.querySelector("[data-label-submit]")?.click()); await wait(900); await p.evaluate(() => document.querySelector("[data-label-submit]")?.click()); await wait(900) }, expect: (p) => p.evaluate(() => !!document.querySelector("[data-label-bought] [data-label-print]")) },
  { name: "shipment", q: "order=shipped&labels=shipped&label=1", sel: "[data-shipment]", expect: (p) => p.evaluate(() => !!document.querySelector("[data-shipment-label-print]")) },
  { name: "loose", q: "labels=loose&label=1", sel: "[data-label-loose]", expect: (p) => p.evaluate(() => ["[data-label-loose-void]", "[data-label-loose-print]", "[data-label-loose-ship]"].every((s) => !!document.querySelector(s))) },
  { name: "local", q: "local=1&label=1", sel: "[role=dialog]", act: async (p) => { await p.evaluate(() => window.__press("Fulfill items")); await wait(900) }, expect: (p) => p.evaluate(() => !document.querySelector("[data-ship-mode]") && !!document.querySelector("[data-fulfil-submit]")) },
]

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"], headless: true })
let failures = 0
console.log("state     width  hscroll  controls  min height  min contrast  problems")
for (const width of [390, 1280]) {
  for (const s of STATES) {
    const page = await browser.newPage()
    await page.setViewport({ width, height: width < 600 ? 844 : 900, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600 })
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "reduce" }])
    await page.evaluateOnNewDocument(MEASURE)
    const errs = []
    page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)))
    await page.goto(`${base}/?view=order&${s.q}`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await wait(1400)
    for (const a of s.act ? [s.act] : []) await a(page)
    const shown = await s.expect(page)
    const m = await page.evaluate((sel) => window.__measure(sel), s.sel)
    const problems = [...(m.missing ? [`no ${m.missing}`] : []), ...(shown ? [] : ["the state did not appear"]), ...(m.hscroll > 0 ? [`scrolls sideways by ${m.hscroll}px`] : []), ...(m.minContrast < 4.5 ? [`"${m.worst}" at ${m.minContrast}:1`] : []), ...(m.bad ?? []), ...errs]
    if (problems.length) failures++
    console.log(`${s.name.padEnd(9)} ${String(width).padEnd(6)} ${String(m.hscroll ?? "-").padEnd(8)} ${String(m.controls ?? "-").padEnd(9)} ${String(m.minHeight ?? "-").padEnd(11)} ${String(m.minContrast ?? "-").padEnd(13)} ${problems.length ? problems.join("; ") : "none"}`)
    await page.close()
  }
}
await browser.close()
server.close()
console.log(failures ? `\n${failures} state(s) with problems` : "\nevery state passes")
process.exit(failures ? 1 : 0)
