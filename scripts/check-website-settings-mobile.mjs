/**
 * ===========================================================================
 *  WEBSITE SETTINGS ON A PHONE, MEASURED
 * ===========================================================================
 * scripts/check-website-settings.mjs proves the subjects work. This one is
 * about how they sit on a phone and a tablet, at 360, 390, 430, 768 and 1280:
 *
 *   • nothing scrolls sideways, on the list or on any subject;
 *   • every control a thumb presses is at least 44px tall on a phone;
 *   • the bar with Back stays on top while the subject scrolls under it;
 *   • going from the list into a subject and back is a push and a pop, on
 *     transform and opacity only, and the list keeps where it was scrolled.
 *
 *   node scripts/check-website-settings-mobile.mjs   (PROBE_CSS=source without a build)
 *
 * Screenshots go to SHOTS_DIR (prefix wsettings-), or a temporary folder.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = (await appCss(root)) + "\n" + interFaces(root)

const out = mkdtempSync(join(tmpdir(), "storelib-settings-mobile-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
/* Inside the checkout, so the bundle resolves react from its node_modules. */
const stubs = join(root, ".settings-mobile-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/website-builder/editor/install-1"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
writeFileSync(join(stubs, "browser.tsx"), `import { createRoot } from "react-dom/client"
import { boot } from "${join(root, "scripts/render-website-settings-probe.tsx")}"
window.__errors = []
const origError = console.error
console.error = (...a) => { window.__errors.push(a.map(String).join(" ")); origError(...a) }
window.addEventListener("error", (e) => window.__errors.push(String(e.message)))
window.__section = new URLSearchParams(location.search).get("section") || null
boot((el) => createRoot(document.getElementById("app")).render(el))
`)
execFileSync(
  "npx",
  [
    "esbuild", join(stubs, "browser.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
    `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`,
    "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic",
    '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    "--log-level=error",
  ],
  { cwd: root, stdio: "inherit" },
)
const bundle = readFileSync(join(out, "probe.js"))
rmSync(stubs, { recursive: true, force: true })
const html =
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;background:#fff}</style></head><body>` +
  `<div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const SUBJECTS = [
  ["general", "General"], ["domains", "Domains"], ["seo", "SEO & Social"], ["pages", "Pages"], ["navigation", "Navigation"],
  ["commerce", "Commerce"], ["policies", "Policies"], ["publishing", "Publishing"], ["backups", "Backups & Versions"], ["connections", "Connections"],
]

async function open(viewport, section = "") {
  const p = await browser.newPage()
  await p.setViewport(viewport)
  await p.goto(`${origin}/?section=${section}`, { waitUntil: "load" })
  await p.waitForSelector("[role=dialog][aria-label='Website settings']")
  await sleep(450)
  return p
}

/** Everything in view a finger can press, with the box it can be pressed in. */
const targets = (p) => p.evaluate(() => {
  const d = document.querySelector("[role=dialog][aria-label='Website settings']")
  const main = d.querySelector("main")
  const scope = getComputedStyle(main).display === "none" ? d.querySelector("aside") : main
  return [...scope.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=radio], [role=switch]")]
    .filter((e) => {
      const r = e.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return false
      if (e.matches(".sr-only")) {
        /* A real checkbox under a drawn switch: its label is the target. */
        if (!e.closest("label")) return false
      }
      return getComputedStyle(e).visibility !== "hidden"
    })
    .map((e) => {
      /* A small box with a larger press area says so with an absolutely placed ::after. */
      const r = e.getBoundingClientRect()
      let h = r.height
      let w = r.width
      const press = (el) => {
        const box = el.getBoundingClientRect()
        const after = getComputedStyle(el, "::after")
        if (after.content !== "none" && after.position === "absolute" && after.display !== "none") {
          h = Math.max(h, box.height - (parseFloat(after.top) || 0) - (parseFloat(after.bottom) || 0))
          w = Math.max(w, box.width - (parseFloat(after.left) || 0) - (parseFloat(after.right) || 0))
        }
        h = Math.max(h, box.height)
        w = Math.max(w, box.width)
      }
      press(e)
      /* A real checkbox under a drawn switch is pressed through its label. */
      const label = e.closest("label")
      if (label) press(label)
      const name = (e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || e.id || e.tagName).trim().replace(/\s+/g, " ").slice(0, 40)
      return { name, h: Math.round(h), w: Math.round(w), right: Math.round(r.right) }
    })
})
const overflow = (p) => p.evaluate(() => {
  const d = document.querySelector("[role=dialog]")
  const main = d.querySelector("main")
  const aside = d.querySelector("aside")
  return Math.max(d.scrollWidth - d.clientWidth, main ? main.scrollWidth - main.clientWidth : 0, aside ? aside.scrollWidth - aside.clientWidth : 0, document.documentElement.scrollWidth - window.innerWidth)
})
const clickText = (p, selector, text) =>
  p.evaluate((sel, t) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim() === t)
    if (!el) return false
    el.click()
    return true
  }, selector, text)

const summary = {}
for (const width of [360, 390, 430]) {
  console.log(`\nphone, ${width} wide`)
  const vp = { width, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const small = []
  const wide = []
  for (const [id, label] of SUBJECTS) {
    const p = await open(vp, id)
    const o = await overflow(p)
    if (o > 0) wide.push([label, o])
    const t = await targets(p)
    for (const x of t) if (x.h < 44) small.push(`${label}: ${x.name} ${x.h}px`)
    for (const x of t) if (x.right > width) wide.push([label, x.name, x.right])
    const field = id === "general" ? "#wb-website-name" : id === "domains" ? "#wb-new-domain" : null
    if (field) {
      const pair = await p.evaluate((sel) => {
        const f = document.querySelector(sel)
        const b = f.parentElement.querySelector("button")
        return [Math.round(f.getBoundingClientRect().height), Math.round(b.getBoundingClientRect().height)]
      }, field)
      if (pair[0] !== pair[1]) small.push(`${label}: field ${pair[0]}px beside a ${pair[1]}px button`)
    }
    if (width === 390) await p.screenshot({ path: join(shots, `wsettings-390-${id}.png`), fullPage: true })
    await p.close()
  }
  summary[width] = { small: small.length, wide: wide.length }
  expect(wide.length === 0, `no subject scrolls sideways or runs a control off the edge at ${width}`, wide.slice(0, 6))
  expect(small.length === 0, `every control is at least 44px tall at ${width}`, small.slice(0, 40))
}

/* ── Every control, pressed once ─────────────────────────────────────── */
/**
 * Each subject, on a phone, with every button, switch and select in it
 * pressed in turn (the routes answered by the stubs in
 * scripts/render-website-settings-probe.tsx). Nothing may throw, and the page
 * may not come apart: after each press the subject is still there, or the
 * press was one that leaves Settings on purpose (Edit, Publish, Add page).
 */
console.log("\nphone, 390: every control pressed")
{
  let pressed = 0
  const broke = []
  for (const [id, label] of SUBJECTS) {
    let p = await open({ width: 390, height: 844, isMobile: true, hasTouch: true }, id)
    const count = await p.evaluate(() => document.querySelectorAll("main button, main input[type=checkbox], main select").length)
    for (let i = 0; i < count; i++) {
      const what = await p.evaluate((i) => {
        const el = document.querySelectorAll("main button, main input[type=checkbox], main select")[i]
        if (!el || el.disabled) return null
        const name = (el.getAttribute("aria-label") || el.textContent || el.id || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40)
        if (el.closest("[data-settings-bar]")) return null
        if (el.tagName === "SELECT") {
          el.selectedIndex = Math.min(1, el.options.length - 1)
          el.dispatchEvent(new Event("change", { bubbles: true }))
        } else el.click()
        return name
      }, i)
      if (what === null) continue
      pressed++
      await sleep(160)
      const state = await p.evaluate(() => ({ errors: window.__errors.length, open: !!document.querySelector("[role=dialog][aria-label='Website settings']"), heading: document.querySelector("main h1")?.textContent ?? null }))
      if (state.errors > 0) broke.push(`${label}: ${what} threw ${await p.evaluate(() => window.__errors[0])}`)
      /* Another subject is a link doing its job (Change address, Publishing, the home page's Search); no subject at all is a page lost. */
      if (state.open && !SUBJECTS.some(([, l]) => l === state.heading)) broke.push(`${label}: ${what} left Settings showing "${state.heading}"`)
      if (!state.open || state.errors > 0 || state.heading !== label) {
        await p.close()
        p = await open({ width: 390, height: 844, isMobile: true, hasTouch: true }, id)
      } else {
        /* Close anything the press opened over the page (a restore question). */
        await p.evaluate(() => { const c = [...document.querySelectorAll("[role=alertdialog] button")].find((b) => b.textContent.trim() === "Cancel"); c?.click() })
      }
    }
    await p.close()
  }
  expect(broke.length === 0, `${pressed} controls pressed across the nine subjects, none threw or lost its page`, broke.slice(0, 6))
}

/* ── The list, the push into a subject, the pop back ───────────────── */
console.log("\nphone, 390: the list and the way in and out")
{
  const p = await open({ width: 390, height: 460, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const rows = await p.$$eval("nav[aria-label='Website settings'] button", (b) => b.map((x) => Math.round(x.getBoundingClientRect().height)))
  expect(rows.every((h) => h >= 48), "each subject in the list is at least 48px", rows)
  await p.screenshot({ path: join(shots, "wsettings-390-list.png") })
  await p.evaluate(() => { document.querySelector("aside").scrollTop = 120 })
  const before = await p.evaluate(() => document.querySelector("aside").scrollTop)
  /* The subject's page, every frame, for the first 450ms of the push. */
  await p.evaluate(() => {
    window.__frames = []
    const t0 = performance.now()
    const tick = () => {
      const page = document.querySelector("[data-settings-page]")
      if (page && getComputedStyle(document.querySelector("main")).display !== "none") {
        const cs = getComputedStyle(page)
        window.__frames.push({ t: Math.round(performance.now() - t0), x: cs.transform === "none" ? 0 : new DOMMatrixReadOnly(cs.transform).m41 })
      }
      if (performance.now() - t0 < 450) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await clickText(p, "nav[aria-label='Website settings'] button", "Domains")
  await sleep(520)
  const frames = await p.evaluate(() => window.__frames)
  expect(frames.filter((f) => f.x > 0.5).length >= 3, "a subject slides in from the right over several frames", frames.slice(0, 5).map((f) => `${f.t}ms x=${Math.round(f.x)}`).join(", "))
  expect(frames.length > 0 && Math.abs(frames[frames.length - 1].x) < 0.5, "and lands exactly in place", frames.length ? Math.round(frames[frames.length - 1].x) : null)
  await p.evaluate(() => { document.querySelector("main").scrollTop = 600 })
  await sleep(120)
  const bar = await p.evaluate(() => {
    const b = document.querySelector("[data-settings-bar]")
    return b ? { top: Math.round(b.getBoundingClientRect().top), h: Math.round(b.getBoundingClientRect().height) } : null
  })
  expect(!!bar && bar.top === 0 && bar.h >= 48, "the bar with Back stays on top while the subject scrolls under it", bar)
  await p.screenshot({ path: join(shots, "wsettings-390-domains-scrolled.png") })
  const backBox = await p.evaluate(() => { const b = document.querySelector("[data-settings-bar] button")?.getBoundingClientRect(); return b ? { w: Math.round(b.width), h: Math.round(b.height) } : null })
  expect(!!backBox && backBox.h >= 44 && backBox.w >= 44, "Back is at least 44px", backBox)
  await p.evaluate(() => {
    window.__back = []
    const t0 = performance.now()
    const tick = () => {
      const page = document.querySelector("[data-settings-page]")
      if (page && getComputedStyle(document.querySelector("main")).display !== "none") {
        const cs = getComputedStyle(page)
        window.__back.push(cs.transform === "none" ? 0 : new DOMMatrixReadOnly(cs.transform).m41)
      }
      if (performance.now() - t0 < 420) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    document.querySelector("[data-settings-bar] button").click()
  })
  await sleep(480)
  const back = await p.evaluate(() => window.__back)
  expect(back.some((x) => x > 20), "Back slides the subject away to the right rather than cutting to the list", back.slice(0, 8).map((x) => Math.round(x)))
  const after = await p.evaluate(() => ({ list: getComputedStyle(document.querySelector("aside")).display !== "none", top: document.querySelector("aside").scrollTop, page: getComputedStyle(document.querySelector("main")).display !== "none" }))
  expect(after.list && !after.page, "and the list is back on its own", after)
  expect(before > 0 && Math.abs(after.top - before) <= 1, "scrolled where it was left", { before, after: after.top })
  const errors = await p.evaluate(() => window.__errors)
  expect(errors.length === 0, "no errors in the console", errors.slice(0, 2).join(" | "))
  await p.close()
}

/* ── Tablet and desktop keep the two columns ─────────────────────────── */
for (const width of [768, 1280]) {
  console.log(`\n${width} wide`)
  const p = await open({ width, height: 900 })
  const shape = await p.evaluate(() => ({
    aside: Math.round(document.querySelector("aside").getBoundingClientRect().width),
    main: getComputedStyle(document.querySelector("main")).display !== "none",
    bar: (() => { const b = document.querySelector("[data-settings-bar]"); return b ? getComputedStyle(b).display : "none" })(),
  }))
  expect(shape.aside === 264 && shape.main && shape.bar === "none", "the list is a 264px column beside the subject, with no phone bar", shape)
  /* A field and the button beside it are one height: Save beside the name, Connect beside a domain. */
  const pairs = []
  for (const [label, field] of [["General", "#wb-website-name"], ["Domains", "#wb-new-domain"]]) {
    await clickText(p, "nav[aria-label='Website settings'] button", label)
    await sleep(300)
    pairs.push(await p.evaluate((sel) => {
      const f = document.querySelector(sel)
      const b = f.parentElement.querySelector("button")
      return [sel, Math.round(f.getBoundingClientRect().height), Math.round(b.getBoundingClientRect().height)]
    }, field))
  }
  expect(pairs.every(([, f, b]) => f === b), "a field and the button beside it share one height", pairs)
  const wide = []
  for (const [id, label] of SUBJECTS) {
    await clickText(p, "nav[aria-label='Website settings'] button", label)
    await sleep(240)
    const o = await overflow(p)
    if (o > 0) wide.push([label, o])
    if (width === 768 && (id === "domains" || id === "connections")) await p.screenshot({ path: join(shots, `wsettings-768-${id}.png`) })
  }
  expect(wide.length === 0, "no subject scrolls sideways", wide)
  await p.close()
}

await browser.close()
server.close()
console.log(`\nsmall targets per width: ${JSON.stringify(summary)}`)
console.log(`screenshots: ${shots}\n`)
if (broken) fail(`${broken} check${broken === 1 ? "" : "s"} failed.`)
console.log("Website Settings on a phone measured as asked.\n")
