#!/usr/bin/env node
/**
 * ===========================================================================
 *  EVERY CREATOR PAGE OPENS ON ITS TOP BAR (round 25)
 * ===========================================================================
 * The owner, storelib.com/andrewrullz in a signed out window: "the top bars of
 * the creator pages are missing", and "in the creator page editor as well".
 *
 * The real components (scripts/render-topbar25.tsx), put together the way the
 * creator page puts them, at 390x844 (touch, 4x CPU) and 1440x900, for each
 * kind of visit. For each it measures:
 *
 *   THE BAR       a top bar at the very top, the full width of the window
 *   THE COVER     starts where the bar ends: no gap, nothing drawn over it
 *   WHICH BAR     the newsletter bar opened on its own and in the editor, the
 *                 slim bar alone from a community
 *   THE PENCIL    for the owner and in the editor only
 *   THE WAY BACK  the chevron from Explore or a community, never cold
 *   SCROLLED      the bar comes back on the way up
 *   NO SIDEWAYS   nothing wider than the window
 *
 *   node scripts/check-topbar25.mjs
 *   SHOTS_DIR=<dir> node scripts/check-topbar25.mjs   keeps the pictures
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const fontFiles = new Map()
const faces = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, path) => {
  const name = path.split("/").pop()
  fontFiles.set(name, path)
  return `url(https://storelib.com/__font/${name})`
})
const stubs = join(root, ".topbar25-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-topbar25-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ORIGIN = "https://storelib.com"

const coverPng = await sharp({ create: { width: 1600, height: 600, channels: 3, background: "#8a8172" } })
  .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600"><rect x="300" y="120" width="1000" height="300" fill="#efece6"/><path d="M0 460 L1600 420 L1600 600 L0 600 Z" fill="#4f4a41"/></svg>`), top: 0, left: 0 }])
  .png()
  .toBuffer()
const facePng = await sharp({ create: { width: 256, height: 256, channels: 3, background: "#5d4a3c" } })
  .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><circle cx="128" cy="104" r="48" fill="#c79a78"/><rect x="56" y="172" width="144" height="88" rx="44" fill="#222"/></svg>`), top: 0, left: 0 }])
  .png()
  .toBuffer()

const STUBS = {
  "next-navigation.js": `const router = { push: (h) => (window.__router ||= []).push(h), replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`,
  "next-link.jsx": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }, children) })
export const useLinkStatus = () => ({ pending: false })
`,
  "next-image.jsx": `import React from "react"
export default function Image({ src, alt, fill, priority, preload, sizes, unoptimized, quality, className, style, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest })
}
`,
  "supabase-client.jsx": `export function isNativePlatform() { return false }
export const capacitorStorage = {}
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => ({ select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: null }) }), channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
`,
}
for (const [k, v] of Object.entries(STUBS)) writeFileSync(join(stubs, k), v)

let html
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-topbar25.tsx")],
    bundle: true, format: "iife", jsx: "automatic", logLevel: "error",
    outfile: join(stubs, "app.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: join(stubs, "next-navigation.js") }))
        b.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(stubs, "next-link.jsx") }))
        b.onResolve({ filter: /^next\/image$/ }, () => ({ path: join(stubs, "next-image.jsx") }))
        b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.jsx") }))
        b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
      },
    }],
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
} catch (e) {
  rmSync(stubs, { recursive: true, force: true })
  console.error(`The probe did not bundle: ${e.message}`)
  process.exit(1)
}
rmSync(stubs, { recursive: true, force: true })

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

async function open(vp, address, throttle) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e?.stack || e).split("\n").slice(0, 2).join(" | ").slice(0, 300)))
  await p.setRequestInterception(true)
  p.on("request", async (r) => {
    const u = r.url()
    if (u.startsWith(ORIGIN) && r.resourceType() === "document") return r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith(ORIGIN + "/__font/")) {
      const file = fontFiles.get(u.split("/").pop())
      if (file && existsSync(file)) return r.respond({ status: 200, contentType: "font/woff2", headers: { "access-control-allow-origin": "*" }, body: readFileSync(file) })
    }
    if (/__cover(%2F|\/)cover/.test(u)) return r.respond({ status: 200, contentType: "image/png", body: coverPng })
    if (/__cover(%2F|\/)face/.test(u)) return r.respond({ status: 200, contentType: "image/png", body: facePng })
    if (u.startsWith("data:") || u.startsWith("blob:")) return r.continue()
    return r.respond({ status: 404, body: "" })
  })
  if (throttle > 1) {
    const cdp = await p.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle })
  }
  await p.goto(ORIGIN + address, { waitUntil: "load" })
  await p.evaluate(() => document.fonts.ready)
  await sleep(900)
  return { p, errors }
}

const measure = (p) =>
  p.evaluate(() => {
    const bar = document.querySelector(".subscribe-bar-fixed, [data-profile-top-bar]")
    const r = bar?.getBoundingClientRect()
    const band = document.querySelector("[data-cover-band]")
    const c = band?.getBoundingClientRect()
    const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"
    const chevrons = [...document.querySelectorAll("[data-profile-back-button]")].filter(visible)
    /* What is actually painted at the middle of the bar and just under it. */
    const hit = (y) => {
      const el = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(y))
      return el ? (el.closest(".subscribe-bar-fixed, [data-profile-top-bar]") ? "bar" : el.closest("[data-cover-band]") ? "cover" : el.tagName.toLowerCase()) : null
    }
    return {
      kind: bar ? (bar.matches("[data-profile-top-bar]") ? "slim" : "newsletter") : "none",
      top: r ? Math.round(r.top) : null,
      bottom: r ? Math.round(r.bottom) : null,
      width: r ? Math.round(r.width) : null,
      coverTop: c ? Math.round(c.top) : null,
      atBar: r ? hit(r.top + r.height / 2) : null,
      underBar: r ? hit(r.bottom + 4) : null,
      email: [...document.querySelectorAll('input[type="email"]')].some(visible),
      pencil: [...document.querySelectorAll('[aria-label="Edit this bar"]')].some(visible),
      chevron: chevrons.length,
      name: document.querySelector("[data-profile-top-bar-name]")?.textContent || document.querySelector("[data-subscribe-avatar]")?.closest("div,form")?.textContent?.trim().slice(0, 40) || null,
      sideways: document.documentElement.scrollWidth - innerWidth,
    }
  })

const CASES = [
  ["visitor", { kind: "newsletter", pencil: false, chevron: 0 }],
  ["owner", { kind: "newsletter", pencil: true, chevron: 0 }],
  ["editor", { kind: "newsletter", pencil: true, chevron: 0 }],
  ["explore", { kind: "newsletter", pencil: false, chevron: 1 }],
  ["community", { kind: "slim", pencil: false, chevron: 1 }],
]
const results = {}
for (const [label, vp, throttle] of [["390", PHONE, 4], ["1440", DESK, 1]]) {
  for (const [kind, want] of CASES) {
    console.log(`\n${kind} at ${label}${throttle > 1 ? " (4x CPU)" : ""}`)
    const { p, errors } = await open(vp, `/andrewrullz?case=${kind}`, throttle)
    const m = await measure(p)
    await p.screenshot({ path: join(shots, `${kind}-${label}.png`) })
    expect(m.kind === want.kind, `the top bar is the ${want.kind} one`, m.kind)
    expect(m.top === 0, "  at the very top", m.top)
    expect(m.width === vp.width, "  the full width of the window", m.width)
    expect(m.atBar === "bar", "  and it is what is painted there", m.atBar)
    expect(m.coverTop !== null && Math.abs(m.coverTop - m.bottom) <= 1, "the cover starts where the bar ends", { bar: m.bottom, cover: m.coverTop })
    expect(m.underBar === "cover", "  and the cover is what is painted under it", m.underBar)
    expect(m.email === (want.kind === "newsletter"), want.kind === "newsletter" ? "the email box is there" : "no email box", m.email)
    expect(m.pencil === want.pencil, want.pencil ? "the pencil is there" : "no pencil", m.pencil)
    expect(m.chevron === want.chevron, want.chevron ? "the way back is there" : "no way back on a cold open", m.chevron)
    expect(m.sideways <= 0, "nothing wider than the window", m.sideways)
    /* Down the page and a little back up: the bar comes back. */
    await p.evaluate(() => window.scrollTo(0, 1400))
    await sleep(500)
    await p.evaluate(() => window.scrollBy(0, -200))
    await sleep(700)
    const back = await p.evaluate(() => {
      const bar = document.querySelector(".subscribe-bar-fixed, [data-profile-top-bar]")
      return bar ? Math.round(bar.getBoundingClientRect().top) : null
    })
    expect(back === 0, "scrolled down and a little up, the bar is at the top again", back)
    await p.screenshot({ path: join(shots, `${kind}-${label}-scrolled.png`) })
    expect(errors.length === 0, "no errors", errors[0])
    results[`${kind}-${label}`] = { ...m, scrolledBack: back }
    await p.close()
  }
}

await browser.close()
writeFileSync(join(shots, "results.json"), JSON.stringify(results, null, 2))
console.log(`\nshots: ${shots}`)
if (broken) {
  console.error(`\n${broken} check(s) failed\n`)
  process.exit(1)
}
console.log("\nEvery creator page opens on its top bar, the right one for the visit.\n")
