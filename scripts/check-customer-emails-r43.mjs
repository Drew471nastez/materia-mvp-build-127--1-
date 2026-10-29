/**
 * ===========================================================================
 *  CUSTOMER EMAILS, ROUND 43: THE FAMILY PILLS EASE AS SETTINGS' DO, AND AN
 *  EDITOR WITH LESS TO READ
 * ===========================================================================
 * The real panel (scripts/render-emails-families-probe.tsx) on a phone
 * (390x844) and a computer (1440x900). Measured:
 *
 *   the pills    nothing travels between them; the chosen one eases its own
 *                fill over Settings' 150ms on Settings' curve (frames in
 *                between, its background seen part way), the one left eases
 *                out; the list under them comes in from 0.25 over 160ms and is
 *                never thrown away (the same rows before and after)
 *   the editor   the Refund editor: no notes about where it was bought or
 *                which buyers its words reach, no hint under a field; the
 *                language a select in the sheet's header, beside the title;
 *                "Preview as" Website / Creator page over the preview; nothing
 *                wider than the sheet
 *
 *   node scripts/check-customer-emails-r43.mjs      (SHOTS_DIR=... keeps the screenshots)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const out = mkdtempSync(join(tmpdir(), "storelib-customer-emails-r43-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const ORIGIN = "https://storelib.test"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

writeFileSync(join(out, "navigation.js"), `export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const usePathname = () => location.pathname
export const useSearchParams = () => new URLSearchParams(location.search)
export function redirect() {}
`)
writeFileSync(join(out, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
execFileSync(
  "npx",
  ["esbuild", "scripts/render-emails-families-probe.tsx", `--alias:next/navigation=${join(out, "navigation.js")}`, `--alias:next/link=${join(out, "link.jsx")}`, '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://x.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="x"', "--bundle", "--format=iife", "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN=undefined", "--define:process.env.NEXT_PUBLIC_APP_URL=undefined", "--define:process.env.NEXT_PUBLIC_PLATFORM_CURRENCY=undefined", "--alias:@=.", `--outfile=${join(out, "app.js")}`, "--log-level=error"],
  { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } },
)
const css = await appCss(root)
const js = readFileSync(join(out, "app.js"), "utf8")
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
async function open(phone, path) {
  const p = await browser.newPage()
  if (phone) await p.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" })
  else await p.setViewport({ width: 1440, height: 900 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.setRequestInterception(true)
  p.on("request", (r) => (r.url().startsWith(ORIGIN) ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.url().startsWith("https://") ? r.respond({ status: 200, contentType: "image/gif", body: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64") }) : r.continue()))
  await p.goto(`${ORIGIN}${path}`)
  await p.waitForSelector('[data-segmented-pills="chips"]', { timeout: 10000 }).catch((e) => {
    console.error(errors.join("\n"))
    throw e
  })
  await p.waitForSelector("[data-customer-email]", { timeout: 10000 })
  await sleep(400)
  return { p, errors }
}

for (const [phone, path] of [
  [true, "/app/emails?tab=customer"],
  [false, "/app/settings?tab=emails"],
]) {
  const where = phone ? "phone 390, Emails" : "computer 1440, Settings"
  const tag = phone ? "390" : "1440"
  console.log(`\n${where}`)
  const { p, errors } = await open(phone, path)

  /* Press Digital products and sample every frame for 320ms: the chip's fill, the old chip's, the list's opacity, anything moving. */
  const run = await p.evaluate(async () => {
    const row = document.querySelector('[data-segmented-pills="chips"]')
    const chip = row.querySelector('[data-tab="digital"]')
    const was = row.querySelector('[aria-selected="true"]')
    const panel = document.getElementById("customer-emails-view")
    const rowsBefore = [...panel.querySelectorAll("[data-customer-email]")]
    const digitalBefore = rowsBefore.filter((b) => ["receipt", "digital_refund"].includes(b.getAttribute("data-customer-email")))
    const style = getComputedStyle(chip)
    const timing = { duration: style.transitionDuration, easing: style.transitionTimingFunction, property: style.transitionProperty }
    const slider = !!row.querySelector("span[aria-hidden]")
    const frames = []
    const t0 = performance.now()
    chip.click()
    await new Promise((done) => {
      const tick = () => {
        frames.push({ t: Math.round(performance.now() - t0), on: getComputedStyle(chip).backgroundColor, off: getComputedStyle(was).backgroundColor, list: Number(getComputedStyle(panel).opacity), anims: panel.getAnimations().map((a) => a.effect?.getTiming?.().duration) })
        if (performance.now() - t0 < 320) requestAnimationFrame(tick)
        else done()
      }
      requestAnimationFrame(tick)
    })
    const after = [...panel.querySelectorAll("[data-customer-email]")]
    return { timing, slider, frames, kept: digitalBefore.every((b) => after.includes(b)), selected: row.querySelector('[aria-selected="true"]')?.getAttribute("data-tab") }
  })
  const alpha = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/)
    if (!m) return 1
    const parts = m[1].split(",").map((x) => Number(x.trim()))
    return parts.length > 3 ? parts[3] : 1
  }
  const onAlphas = run.frames.map((f) => alpha(f.on))
  const between = onAlphas.filter((a) => a > 0.02 && a < 0.98).length
  expect(run.selected === "digital", "Digital products is chosen", run.selected)
  expect(!run.slider, "no sliding pill: nothing travels between the chips")
  expect(run.timing.duration === "0.15s" && run.timing.easing === "cubic-bezier(0.33, 1, 0.68, 1)" && /background-color/.test(run.timing.property), "the chip eases its own fill on Settings' 150ms and curve", run.timing)
  expect(between >= 2 && onAlphas[onAlphas.length - 1] > 0.98, "its fill is seen part way over several frames, then whole", onAlphas.map((a) => Math.round(a * 100) / 100).slice(0, 12))
  expect(alpha(run.frames[run.frames.length - 1].off) < 0.02, "the chip left eases out to nothing", run.frames[run.frames.length - 1].off)
  const lists = run.frames.map((f) => f.list)
  expect(lists[0] < 0.5 && lists.some((o) => o > 0.5 && o < 0.99) && lists[lists.length - 1] === 1 && run.frames.some((f) => f.anims.includes(160)), "the list comes in from 0.25 over 160ms, as a Settings section", lists.map((o) => Math.round(o * 100) / 100).slice(0, 12))
  expect(run.kept, "the rows were kept, never drawn again")
  await p.screenshot({ path: join(shots, `${tag}-digital.png`) })

  /* The Refund editor. */
  await p.click('[data-customer-email="digital_refund"]')
  await p.waitForSelector('[data-email-sheet="digital_refund"]', { timeout: 10000 })
  await p.waitForSelector("[data-email-frame]", { timeout: 10000 }).catch(() => null)
  await sleep(600)
  const sheet = await p.evaluate(() => {
    const s = document.querySelector('[data-email-sheet="digital_refund"]')
    const title = s.querySelector("h2, [id][class*='font-semibold']")
    const head = title?.closest("div.border-b") ?? title?.parentElement?.parentElement
    const lang = s.querySelector("[data-preview-language]")
    const place = s.querySelector("[data-preview-place]")
    const text = s.innerText
    const r = s.getBoundingClientRect()
    return {
      notes: !!s.querySelector("[data-preview-place-note], [data-preview-own-note], [data-email-editing-lang]"),
      langInHeader: !!(lang && head && head.contains(lang)),
      langBox: lang ? { w: Math.round(lang.getBoundingClientRect().width), h: Math.round(lang.getBoundingClientRect().height) } : null,
      /* Its words once: a segment draws them twice, the quiet layer and the chosen one (components/app/segmented-tabs). */
      place: place ? [place.firstElementChild.textContent.trim(), ...[...place.querySelectorAll("[role=tab]")].map((t) => t.querySelector("span:not([aria-hidden]) span.hidden, span:not([aria-hidden])")?.textContent.trim())].join(" ") : null,
      placeH: place ? Math.round(place.getBoundingClientRect().height) : null,
      wordy: ["Bought on your website", "These words go to buyers", "Shown after the subject", "A line of your own above the footer", "A sample order, drawn", "stay as they are, filled in", "Placeholders fill in"].filter((w) => text.includes(w)),
      /* On a phone the Edit pane waits off to the side, by design (the two panes' track): only what is in view counts. */
      wide: [...s.querySelectorAll("*")].filter((e) => !e.closest('[data-email-pane="edit"]') && !e.matches("[data-email-panes] > div") && e.getBoundingClientRect().right > r.right + 1 && getComputedStyle(e).position !== "fixed").map((e) => e.tagName + "." + String(e.className).slice(0, 40)),
    }
  })
  expect(!sheet.notes && sheet.wordy.length === 0, "no notes, no field hints, no explaining", sheet.wordy)
  expect(sheet.langInHeader, "the language is one select in the sheet's header", sheet.langBox)
  expect(sheet.place === "Preview as Website Creator page", "\"Preview as\" Website / Creator page over the preview", sheet.place)
  expect(sheet.wide.length === 0, "nothing in view wider than the sheet", sheet.wide.slice(0, 5))
  await p.screenshot({ path: join(shots, `${tag}-refund-editor.png`) })
  expect(errors.length === 0, "no page errors", errors.slice(0, 3))
  await p.close()
}
await browser.close()
console.log(broken ? `\n${broken} failed   (shots: ${shots})` : `\nall ok   (shots: ${shots})`)
process.exit(broken ? 1 : 0)
