/**
 * ===========================================================================
 *  CHECKOUT ON A PHONE: PAY IN REACH, AND WHAT IS MISSING FOUND (round 21)
 * ===========================================================================
 * The real checkout (scripts/render-checkout-paydock.tsx, the Airwallex path,
 * so no Stripe network) on a 390x844 phone:
 *
 *   STICKY     at the top of the page, Pay sits at the foot of the screen,
 *              and it settles back into its place at the end of the form
 *   MISSING    Pay with the name empty glides the page to the name field
 *              (over several frames, not a jump), puts it in the middle of
 *              the screen with the caret in it, and says so under it in red
 *   CLEARS     typing in it takes the red away
 *
 *   PROBE_CSS=source node scripts/check-checkout-paydock.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const stubs = join(root, ".checkout-paydock-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-paydock-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h) => log("prefetch", h), back: () => log("back"), refresh: () => log("refresh") }
export const usePathname = () => "/checkout"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined, ...rest }) }
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-checkout-paydock.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY": JSON.stringify("") },
    alias: { "@": ".", "next/navigation": "./.checkout-paydock-probe/navigation.js", "next/link": "./.checkout-paydock-probe/link.jsx", "next/image": "./.checkout-paydock-probe/image.jsx" },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
  const p = await browser.newPage()
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await p.setRequestInterception(true)
  p.on("request", (r) => (r.url().startsWith("https://storelib.com/") ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.respond({ status: 204, body: "" })))
  await p.goto("https://storelib.com/checkout?product=glaze-notebook", { waitUntil: "load" })
  await sleep(1200)
  await p.evaluate(() => { localStorage.clear(); window.scrollTo(0, 0) })
  await sleep(300)
  const atTop = await p.evaluate(() => {
    const dock = document.querySelector("[data-pay-dock]")
    const b = dock.getBoundingClientRect()
    return { bottom: Math.round(b.bottom), top: Math.round(b.top), position: getComputedStyle(dock).position, page: document.documentElement.scrollHeight }
  })
  expect(atTop.position === "sticky" && atTop.bottom <= 844 && atTop.bottom >= 830, "STICKY: at the top of the page, Pay sits at the foot of the screen", atTop)
  await p.screenshot({ path: join(shots, "1-top.png") })
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await sleep(300)
  const atEnd = await p.evaluate(() => {
    const dock = document.querySelector("[data-pay-dock]").getBoundingClientRect()
    const terms = document.getElementById("checkout-terms").getBoundingClientRect()
    return { dockTop: Math.round(dock.top), termsBottom: Math.round(terms.bottom) }
  })
  expect(atEnd.dockTop >= atEnd.termsBottom - 1, "and settles into its place at the end of the form, under everything else", atEnd)
  await p.screenshot({ path: join(shots, "2-end.png") })

  /* An email, the box ticked, no name: Pay. */
  await p.evaluate(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; const e = document.getElementById("checkout-email"); set.call(e, "ana@example.com"); e.dispatchEvent(new Event("input", { bubbles: true })) })
  await p.evaluate(() => document.querySelector("#checkout-agree, [id='checkout-agree']")?.click())
  await sleep(200)
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await sleep(300)
  await p.evaluate(() => {
    window.__ys = []
    window.__run = true
    const tick = () => { window.__ys.push(Math.round(window.scrollY)); if (window.__run) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  await p.evaluate(() => document.querySelector("[data-pay]").click())
  await sleep(900)
  const ys = await p.evaluate(() => { window.__run = false; return window.__ys })
  const steps = ys.filter((y, i) => i === 0 || y !== ys[i - 1])
  const there = await p.evaluate(() => {
    const el = document.getElementById("checkout-name")
    const r = el.getBoundingClientRect()
    return { centre: Math.round(r.top + r.height / 2), focused: document.activeElement === el, invalid: el.getAttribute("aria-invalid"), said: document.getElementById("checkout-name-error")?.textContent ?? null }
  })
  expect(steps.length >= 4, "MISSING: Pay with no name glides the page over several frames, not a jump", steps.slice(0, 12))
  expect(Math.abs(there.centre - 422) < 120 && there.focused, "to the name field, near the middle of the screen, with the caret in it", there)
  expect(there.invalid === "true" && there.said === "Enter your name.", "and says what is missing under it", there)
  await p.screenshot({ path: join(shots, "3-missing.png") })
  await p.type("#checkout-name", "A")
  await sleep(100)
  const cleared = await p.evaluate(() => ({ invalid: document.getElementById("checkout-name").getAttribute("aria-invalid"), said: document.getElementById("checkout-name-error")?.textContent ?? null }))
  expect(cleared.invalid === null && cleared.said === null, "CLEARS: typing takes the red away", cleared)
  expect(errors.length === 0, "no page errors", errors)
  await browser.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nScreenshots: ${shots}`)
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
