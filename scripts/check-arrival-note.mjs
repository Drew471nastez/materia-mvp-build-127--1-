/**
 * "Welcome back" / "Account created" (components/auth/arrival-note.tsx), the
 * real component on the real stylesheet, measured at 390x844 against the two
 * phone bars it must never sit on:
 *
 *   app    /app's pill, drawn the way components/app/sidebar-mobile-nav.tsx
 *          draws its box (fixed to the foot, the gap var(--app-nav-lift)
 *          under a bar var(--app-nav-bar) tall), marked data-app-nav-pill
 *   buyer  the buyer's tab bar, html[data-buyer-tabs="shown"], a bar
 *          var(--buyer-tabs-room) tall at the foot (components/nav/buyer-tab-bar.tsx)
 *
 * with no home indicator and, where this Chromium can emulate one, with the
 * 34px inset of an iPhone. Also films the note's opacity and translate as it
 * comes and goes, so "it arrives and leaves smoothly" is a measurement.
 *
 *   node scripts/check-arrival-note.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".arrival-note-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
`)
writeFileSync(join(dir, "entry.tsx"), `import { createRoot } from "react-dom/client"
import { createElement } from "react"
import { ArrivalNote } from "@/components/auth/arrival-note"
createRoot(document.getElementById("app")!).render(createElement(ArrivalNote))
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(dir, "entry.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"', `--alias:next/navigation=${join(dir, "navigation.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const script = readFileSync(join(dir, "probe.js"), "utf8")
rmSync(dir, { recursive: true, force: true })
/* The stylesheet from source unless asked otherwise: a .next build left lying around is older than the change being measured. */
process.env.PROBE_CSS ??= "source"
const css = await appCss(root)

const BARS = {
  app: `<div data-app-nav-pill="" class="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex items-end justify-center md:hidden" style="padding-bottom:calc(var(--app-nav-lift))"><div data-bar style="height:var(--app-nav-bar);width:var(--app-nav-width);background:#ddd;border-radius:999px"></div></div>`,
  buyer: `<nav data-buyer-tab-bar=""><div data-bar style="position:fixed;left:0;right:0;bottom:0;height:var(--buyer-tabs-room);background:#ddd"></div></nav>`,
  none: ``,
}
const page = (surface) => `<!doctype html><html${surface === "buyer" ? ' data-buyer-tabs="shown"' : ""}${surface === "app" ? ' class="app-layout"' : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body>${BARS[surface]}<div id="app"></div>` +
  `<script>document.cookie="sl_arrival=back; path=/"</script><script>window.process={env:{NODE_ENV:"production"}}</script><script>${script}</script></body></html>`

const server = createServer((req, res) => {
  const path = req.url.split("?")[0]
  const surface = path.startsWith("/app") ? "app" : path.startsWith("/library") ? "buyer" : "none"
  res.writeHead(200, { "content-type": "text/html" })
  res.end(page(surface))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], headless: true })
const problems = []
const results = []

const MEASURE = `(() => {
  const note = document.querySelector("[data-auth-arrival] > div")
  const bar = document.querySelector("[data-bar]")
  const n = note?.getBoundingClientRect(), b = bar?.getBoundingClientRect()
  const cs = note ? getComputedStyle(note) : null
  return { surface: document.querySelector("[data-auth-arrival]")?.getAttribute("data-arrival-surface"), noteBottom: n ? Math.round(n.bottom * 10) / 10 : null, barTop: b ? Math.round(b.top * 10) / 10 : null, vh: innerHeight, opacity: cs ? Number(cs.opacity) : null, translate: cs?.translate ?? null }
})()`

for (const inset of [0, 34]) {
  for (const [label, path] of [["/app pill", "/app"], ["buyer tab bar", "/library"], ["no bar", "/explore"]]) {
    const p = await browser.newPage()
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    if (inset) {
      try {
        const cdp = await p.createCDPSession()
        await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 47, bottom: inset, left: 0, right: 0 } })
      } catch {
        results.push({ label, inset, skipped: "this Chromium cannot emulate a safe area inset" })
        await p.close()
        continue
      }
    }
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e)))
    await p.goto(base + path)
    await p.waitForSelector("[data-auth-arrival]", { timeout: 10000 })
    /* Film it coming in. */
    const film = []
    for (let i = 0; i < 12; i++) { film.push(await p.evaluate(MEASURE)); await wait(25) }
    await wait(300)
    const m = await p.evaluate(MEASURE)
    const gap = m.barTop != null ? Math.round((m.barTop - m.noteBottom) * 10) / 10 : Math.round((m.vh - inset - m.noteBottom) * 10) / 10
    const ops = film.map((f) => f.opacity)
    const between = ops.filter((o) => o > 0.05 && o < 0.95).length
    results.push({ label, inset, surface: m.surface, noteBottom: m.noteBottom, barTop: m.barTop, gapAboveBarOrInset: gap, fadeInFrames: between, finalOpacity: m.opacity, finalTranslate: m.translate, errors })
    if (errors.length) problems.push(`${label} (inset ${inset}): ${errors[0]}`)
    if (gap < 12) problems.push(`${label} (inset ${inset}): the note is ${gap}px clear of the bar or the inset, want at least 12`)
    if (m.opacity !== 1) problems.push(`${label} (inset ${inset}): not fully shown (${m.opacity})`)
    if (!between) problems.push(`${label} (inset ${inset}): it appeared at once, no frame in between`)
    if (path === "/app" && m.surface !== "app") problems.push(`${label}: the note did not see /app's pill`)
    /* Film it leaving. */
    await wait(3000 - 12 * 25 - 300 - 200)
    const out = []
    for (let i = 0; i < 20; i++) { out.push(await p.evaluate(`document.querySelector("[data-auth-arrival] > div") ? Number(getComputedStyle(document.querySelector("[data-auth-arrival] > div")).opacity) : null`)); await wait(25) }
    const leaving = out.filter((o) => o != null && o > 0.05 && o < 0.95).length
    results[results.length - 1].fadeOutFrames = leaving
    results[results.length - 1].goneAfter = out[out.length - 1]
    if (!leaving) problems.push(`${label} (inset ${inset}): it left at once`)
    if (out[out.length - 1] !== null) problems.push(`${label} (inset ${inset}): still there after it faded`)
    await p.close()
  }
}
await browser.close()
server.close()
console.table(results)
if (problems.length) { console.log("\n" + problems.map((x) => "  FAIL  " + x).join("\n")); process.exit(1) }
console.log("\n  ok  the note stands clear of every bar, fades in and fades out")
