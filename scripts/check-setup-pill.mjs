/**
 * ===========================================================================
 *  THE SETUP PILL, BOTTOM RIGHT, MEASURED
 * ===========================================================================
 * The real shell (scripts/render-setup-pill.tsx) at 1440 by 900, store setup
 * three of seven steps in. The owner asked for it "a little bit smaller,
 * more subtle, not that fat", so this reads what that means in numbers:
 *
 *   SIZE     32 to 34px tall (it was 57), its text 12.5 to 13px, its ring
 *            no taller than 22px, one line, nothing clipped
 *   QUIET    a 1px border and a small shadow (no blur past 8px), no scale:
 *            under the pointer it is the same size and only a step greyer
 *            (read from its :hover rules, since headless Chromium matches
 *            (hover: none) and never shows a hover)
 *   PLACE    24px from the right and bottom edges of the window, as before,
 *            and it says how far setup has got: "Setup 43%"
 *
 *   PROBE_CSS=source node scripts/check-setup-pill.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-setup-pill-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`); if (!ok) broken++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const dir = join(root, ".setup-pill-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/products"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push(h) { window.__pushed = h }, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "user-1", user_metadata: {} } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => q, rpc: () => q, storage: { from: () => ({}) }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-setup-pill.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const css = `${await appCss(root)}\n${interFaces(root)}`
const script = readFileSync(join(dir, "probe.js"), "utf8")
const page = join(dir, "index.html")
writeFileSync(page, `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${script.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
try {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
  await p.goto(`file://${page}`)
  await p.waitForSelector("[data-setup-pill]", { timeout: 10000 }).catch(() => {})
  await sleep(600)
  const read = () => p.evaluate(() => {
    const el = document.querySelector("[data-setup-pill]")
    if (!el) return null
    const b = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const ring = el.querySelector("svg").getBoundingClientRect()
    const texts = [...el.querySelectorAll("span")].map((s) => ({ text: s.textContent, size: getComputedStyle(s).fontSize, h: Math.round(s.getBoundingClientRect().height) }))
    const blurs = [...cs.boxShadow.matchAll(/(-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px/g)].map((m) => Number(m[3]))
    return {
      w: Math.round(b.width), h: Math.round(b.height), right: Math.round(innerWidth - b.right), bottom: Math.round(innerHeight - b.bottom),
      ring: Math.round(ring.height), texts, border: cs.borderTopWidth, blurs, bg: cs.backgroundColor, scale: cs.scale, transform: cs.transform,
      label: el.getAttribute("aria-label"), clipped: el.scrollWidth > el.clientWidth + 1,
    }
  })
  const rest = await read()
  console.log("\nthe setup pill at 1440")
  expect(!!rest, "it is on the page", rest)
  if (rest) {
    expect(rest.h >= 32 && rest.h <= 34 && !rest.clipped, "32 to 34px tall, nothing clipped", { h: rest.h, w: rest.w })
    expect(rest.texts.length === 2 && rest.texts.every((t) => ["12.5px", "13px"].includes(t.size)) && rest.texts[0].text === "Setup" && rest.texts[1].text === "43%",
      "Setup and 43% in 12.5 to 13px", rest.texts)
    expect(rest.ring <= 22 && rest.ring >= 16, "a ring no taller than 22px", rest.ring)
    expect(rest.border === "1px" && rest.blurs.length > 0 && Math.max(...rest.blurs) <= 8, "a hairline and a small shadow", { border: rest.border, blurs: rest.blurs })
    expect(rest.right === 24 && rest.bottom === 24, "24px in from the right and the bottom, where it was", { right: rest.right, bottom: rest.bottom })
    expect(rest.label === "Store setup, 43% done", "a screen reader hears what it is", rest.label)
    await p.screenshot({ path: join(shots, "setup-pill-1440.png") })
    await p.screenshot({ path: join(shots, "setup-pill-closeup.png"), clip: { x: 1440 - 260, y: 900 - 100, width: 260, height: 100 } })
    const at = await p.$eval("[data-setup-pill]", (el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } })
    await p.mouse.move(at.x, at.y)
    await sleep(400)
    const hover = await read()
    /*
      Headless Chromium reports (hover: none), and Tailwind puts every hover:
      class under (hover: hover), so a pointer over it here shows nothing.
      The stylesheet is read instead: every :hover rule that matches the
      pill, what it sets, and the media it sits under.
    */
    const rules = await p.evaluate(() => {
      const el = document.querySelector("[data-setup-pill]")
      const out = []
      /* Nested (the source build) or flat (a production build): each declaration block with the selector and media around it. */
      const walk = (list, parent, media) => {
        for (const r of list) {
          let sel = parent
          if (r.selectorText) sel = r.selectorText.split(",").map((x) => (parent ? (x.includes("&") ? x.replace(/&/g, parent) : `${parent} ${x.trim()}`) : x.trim())).join(",")
          const inMedia = r.conditionText ? [...media, r.conditionText] : media
          if (r.style && sel && /:hover/.test(sel)) {
            for (const one of sel.split(",")) {
              if (!/:hover/.test(one)) continue
              try { if (!el.matches(one.replace(/:hover/g, "").trim())) continue } catch { continue }
              out.push({ sel: one.trim(), media: inMedia, bg: r.style.backgroundColor || "", scale: r.style.scale || "", transform: r.style.transform || "", shadow: r.style.boxShadow || "" })
            }
          }
          if (r.cssRules) walk(r.cssRules, sel, inMedia)
        }
      }
      for (const sheet of document.styleSheets) walk(sheet.cssRules, "", [])
      return out
    })
    const own = rules.filter((r) => r.bg || r.scale || r.transform || r.shadow)
    expect(hover.w === rest.w && hover.h === rest.h && own.every((r) => !r.scale && !r.transform && !r.shadow),
      "under the pointer it keeps its size and its shadow: no hover rule scales it or grows its shadow", own)
    expect(own.some((r) => r.bg && r.bg !== rest.bg && r.media.some((m) => /hover/.test(m))),
      "and goes a step greyer instead, for a mouse only", own.map((r) => ({ bg: r.bg, media: r.media })))
    await p.screenshot({ path: join(shots, "setup-pill-hover-closeup.png"), clip: { x: 1440 - 260, y: 900 - 100, width: 260, height: 100 } })
    await p.mouse.click(at.x, at.y)
    await sleep(200)
    const pushed = await p.evaluate(() => window.__pushed ?? null)
    expect(pushed === "/app", "a press goes to the dashboard's setup", pushed)
  }
  if (errors.length) expect(false, "no errors on the page", errors)
  console.log(`\nshots: ${shots}`)
} finally {
  await browser.close()
  rmSync(dir, { recursive: true, force: true })
}
if (broken) fail(`${broken} check(s) failed`)
console.log("\nall checks passed")
