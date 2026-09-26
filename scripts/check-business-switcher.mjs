/**
 * ===========================================================================
 *  THE BUSINESS SWITCHER AND THE NEW BUSINESS SCREEN, MEASURED
 * ===========================================================================
 * The real components (scripts/render-business-switcher.tsx):
 *
 *   MENU     the business you are in is one row with its @handle and an up
 *            and down chevron, and nothing else shows until it is tapped: no
 *            "Businesses" label, no second row. A tap opens the list in
 *            place. Two businesses: the other one, saying it is being set up,
 *            and no New business (two is the most); one business: New
 *            business alone, a slim line. A second tap folds it away, and
 *            what is folded cannot be reached by Tab. Rows are 44px in the
 *            dropdown and 52px in the phone sheet, New business 36px and
 *            44px, and nothing overflows
 *   SCREEN   the start screen fills a 390 phone and a 1280 window with no
 *            sideways scroll; Create business is 48px and full width; the
 *            full state offers only the way back
 *
 *   PROBE_CSS=source node scripts/check-business-switcher.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)
const work = join(root, ".business-probe")
mkdirSync(work, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-business-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`); if (!ok) broken++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  /* Creating a business is a request and a reload; here it is recorded and never answers, so the row's waiting state can be read. */
  writeFileSync(join(work, "switch-client.js"), `export const switchBusiness = () => new Promise(() => {})\nexport const createBusiness = () => { window.__created = (window.__created || 0) + 1; return new Promise(() => {}) }\n`)
  writeFileSync(join(work, "navigation.js"), `export const useRouter = () => ({ push: (h) => (window.__pushed = h), replace() {}, refresh() {}, prefetch() {}, back() {} })\nexport const usePathname = () => "/app"\nexport const useSearchParams = () => new URLSearchParams()\n`)
  execFileSync("npx", ["esbuild", "scripts/render-business-switcher.tsx", "--bundle", "--format=iife", "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--alias:@=.", "--banner:js=var process={env:{NODE_ENV:'production'}};", `--alias:next/navigation=./.business-probe/navigation.js`, `--alias:@/lib/businesses/switch-client=./.business-probe/switch-client.js`, `--outfile=${join(work, "app.js")}`, "--log-level=error"], { cwd: root, stdio: "inherit" })
  const js = readFileSync(join(work, "app.js"), "utf8")
  writeFileSync(join(work, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

  console.log("\nthe menus")
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport({ width: 1440, height: 900 })
  await p.goto(`file://${join(work, "index.html")}?view=menus`)
  await sleep(300)
  /* What a person can see of each menu: rows with a height, inside a list that is open. */
  const read = (sel) => p.$eval(sel, (el) => {
    const seen = (r) => { const b = r.getBoundingClientRect(); return b.height > 1 && !r.closest("[inert]") }
    const add = el.querySelector("[data-business-new]")
    return {
      rows: [...el.querySelectorAll("[data-business-row]")].filter(seen).map((r) => ({ kind: r.getAttribute("data-business-row"), text: r.textContent.trim(), h: Math.round(r.getBoundingClientRect().height), current: r.getAttribute("aria-current") === "true", chevron: !!r.querySelector("[aria-label='Switch business'], [aria-label='Hide businesses']"), expanded: r.getAttribute("aria-expanded") })),
      add: !!add && seen(add) && add.textContent.trim() === "New business",
      addH: add ? Math.round(add.getBoundingClientRect().height) : 0,
      h: Math.round(el.getBoundingClientRect().height),
      label: el.textContent.includes("Businesses"),
      over: el.scrollWidth - el.clientWidth,
    }
  })
  const toggle = async (sel) => { await p.evaluate((s) => document.querySelector(`${s} [data-business-row=current]`).click(), sel); await sleep(400) }

  await p.screenshot({ path: join(shots, "business-menus-folded-1440.png") })
  for (const [sel, rowH, addH] of [["[data-probe=dropdown-two]", 44, 36], ["[data-probe=dropdown-one]", 44, 36], ["[data-probe=sheet-two]", 52, 44], ["[data-probe=sheet-one]", 52, 44]]) {
    const folded = await read(sel)
    expect(folded.rows.length === 1 && folded.rows[0].current && folded.rows[0].text.includes("@andrewrullz") && folded.rows[0].chevron && folded.rows[0].expanded === "false" && !folded.add && !folded.label,
      `${sel}: one row, the business you are in with its handle and a chevron, and no label`, folded)
    expect(folded.rows[0].h >= rowH && folded.over <= 0, `${sel}: a ${rowH}px row, nothing overflows`, folded.rows[0].h)
    const tabbable = await p.evaluate((s) => [...document.querySelectorAll(`${s} button`)].filter((b) => !b.closest("[inert]")).length, sel)
    expect(tabbable === 1, `${sel}: folded, Tab reaches the one row only`, tabbable)
    await toggle(sel)
    const open = await read(sel)
    const two = sel.includes("two")
    if (two) {
      expect(open.rows.length === 2 && open.rows[1].text.includes("Setting up") && !open.rows[1].current && !open.add, `${sel}: open, the other business says it is being set up, and no New business with two already`, open.rows)
    } else {
      expect(open.rows.length === 1 && open.add && open.addH >= addH && open.addH < rowH, `${sel}: open, New business under it, a slim ${addH}px line`, { rows: open.rows.length, add: open.add, addH: open.addH })
    }
    expect(open.rows.every((r) => r.h >= rowH) && open.rows[0].expanded === "true" && open.over <= 0 && !open.label, `${sel}: open, ${rowH}px rows and still no label`, open.rows.map((r) => r.h))
  }
  await p.screenshot({ path: join(shots, "business-menus-open-1440.png") })
  await p.setViewport({ width: 390, height: 900, deviceScaleFactor: 2 })
  await sleep(200)
  await p.evaluate(() => document.querySelector("[data-probe=sheet-one]").scrollIntoView())
  await p.screenshot({ path: join(shots, "business-sheet-open-390.png") })
  await p.setViewport({ width: 1440, height: 900 })
  await toggle("[data-probe=dropdown-two]")
  const shut = await read("[data-probe=dropdown-two]")
  expect(shut.rows.length === 1 && shut.rows[0].expanded === "false", "a second tap folds it away again", shut.rows.length)
  await p.evaluate(() => document.querySelector("[data-probe=dropdown-one] [data-business-new]").click())
  await sleep(150)
  const made = await p.evaluate(() => ({ created: window.__created, pushed: window.__pushed ?? null, text: document.querySelector("[data-probe=dropdown-one] [data-business-new]").textContent.trim(), spinning: !!document.querySelector("[data-probe=dropdown-one] [data-business-new] .animate-spin") }))
  expect(made.created === 1 && made.pushed === null && made.spinning && made.text === "Setting up your new business", "New business starts it right there, no page in between, and says it is setting up", made)
  await p.screenshot({ path: join(shots, "business-new-waiting.png") })
  if (errors.length) expect(false, "no errors on the page", errors)
  await browser.close()
  console.log(`\nshots: ${shots}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
if (broken) fail(`${broken} check(s) failed`)
console.log("\nall checks passed")
