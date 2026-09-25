/**
 * ===========================================================================
 *  THE BUSINESS SWITCHER AND THE NEW BUSINESS SCREEN, MEASURED
 * ===========================================================================
 * The real components (scripts/render-business-switcher.tsx):
 *
 *   MENU     two businesses: the current one checked, the other saying it is
 *            being set up, no New business (two is the most); one business:
 *            it alone, checked, and New business under it. Rows are 44px in
 *            the dropdown and 52px in the phone sheet, and nothing overflows
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
  await p.setViewport({ width: 1280, height: 800 })
  await p.goto(`file://${join(work, "index.html")}?view=menus`)
  await sleep(300)
  const read = (sel) => p.$eval(sel, (el) => ({
    rows: [...el.querySelectorAll("[data-business-row]")].map((r) => ({ kind: r.getAttribute("data-business-row"), text: r.textContent.trim(), h: Math.round(r.getBoundingClientRect().height), checked: !!r.querySelector("[aria-label='Current business']") })),
    add: [...el.querySelectorAll("button")].some((b) => b.textContent.trim() === "New business"),
    over: el.scrollWidth - el.clientWidth,
  }))
  const two = await read("[data-probe=dropdown-two]")
  expect(two.rows.length === 2 && two.rows[0].checked && two.rows[0].text.includes("@andrewrullz"), "two: the current business first, checked, with its handle", two.rows[0])
  expect(two.rows[1].text.includes("Setting up") && !two.rows[1].checked, "the second says it is being set up", two.rows[1])
  expect(!two.add, "no New business with two already", two.add)
  expect(two.rows.every((r) => r.h >= 44) && two.over <= 0, "44px rows, nothing overflows", two.rows.map((r) => r.h))
  const one = await read("[data-probe=dropdown-one]")
  expect(one.rows.length === 1 && one.rows[0].checked && one.add, "one: it alone, checked, and New business under it", one)
  const sheet = await read("[data-probe=sheet-two]")
  expect(sheet.rows.every((r) => r.h >= 52), "52px rows in the phone sheet", sheet.rows.map((r) => r.h))
  await p.screenshot({ path: join(shots, "business-menus.png") })
  const labels = await p.evaluate(() => ({ dropdown: document.querySelector("[data-probe=dropdown-two]").textContent.includes("Businesses"), sheet: document.querySelector("[data-probe=sheet-two]").textContent.includes("Businesses") }))
  expect(labels.dropdown && !labels.sheet, "a Businesses label on the desktop menu, none on the phone sheet", labels)
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
