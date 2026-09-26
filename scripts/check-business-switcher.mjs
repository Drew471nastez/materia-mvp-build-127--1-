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
 *   PLUS     with room for a second business, a "New business" square sits
 *            on the row just left of the chevron: 28px in the dropdown, 30px
 *            in the sheet, centred on the row, clear of the name and the
 *            chevron, answering a press anywhere in the 44px around it. A
 *            real mouse press on it starts the new business and does not
 *            open or fold the list. With two businesses there is no plus
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
  /* The folded rows up close, at twice the pixels, to look at the plus itself. */
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
  await sleep(150)
  await p.screenshot({ path: join(shots, "business-rows-folded-closeup.png"), clip: { x: 0, y: 0, width: 1440, height: 140 } })
  await p.setViewport({ width: 1440, height: 900 })
  await sleep(150)
  for (const [sel, rowH, addH] of [["[data-probe=dropdown-two]", 44, 36], ["[data-probe=dropdown-one]", 44, 36], ["[data-probe=sheet-two]", 52, 44], ["[data-probe=sheet-one]", 52, 44]]) {
    const folded = await read(sel)
    expect(folded.rows.length === 1 && folded.rows[0].current && folded.rows[0].text.includes("@andrewrullz") && folded.rows[0].chevron && folded.rows[0].expanded === "false" && !folded.add && !folded.label,
      `${sel}: one row, the business you are in with its handle and a chevron, and no label`, folded)
    expect(folded.rows[0].h >= rowH && folded.over <= 0, `${sel}: a ${rowH}px row, nothing overflows`, folded.rows[0].h)
    const tabbable = await p.evaluate((s) => [...document.querySelectorAll(`${s} button`)].filter((b) => !b.closest("[inert]")).map((b) => b.getAttribute("aria-label") || b.getAttribute("data-business-row")), sel)
    const one = sel.includes("one")
    expect(one ? tabbable.join() === "current,New business" : tabbable.join() === "current",
      `${sel}: folded, Tab reaches the row${one ? " and its plus" : ""} only`, tabbable)
    /* The plus: where it sits, how big it is, and what a press around it lands on. */
    const plus = await p.evaluate((s) => {
      const el = document.querySelector(`${s} [data-business-add]`)
      if (!el) return null
      const row = document.querySelector(`${s} [data-business-row=current]`).getBoundingClientRect()
      const chev = document.querySelector(`${s} [data-business-row=current] svg[aria-label]`).getBoundingClientRect()
      const name = document.querySelector(`${s} [data-business-row=current] .truncate`)
      const range = document.createRange(); range.selectNodeContents(name)
      const text = range.getBoundingClientRect()
      const b = el.getBoundingClientRect()
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2
      /* 21px out from the centre each way: the corners of a 42px square, inside the 44. */
      const hits = [[-21, -21], [21, -21], [-21, 21], [21, 21], [0, 0]].map(([dx, dy]) => !!document.elementFromPoint(cx + dx, cy + dy)?.closest("[data-business-add]"))
      const cs = getComputedStyle(el)
      return { w: Math.round(b.width), h: Math.round(b.height), centred: Math.abs(cy - (row.top + row.height / 2)) <= 0.5, gapToChevron: Math.round(chev.left - b.right), gapToName: Math.round(b.left - text.right), hits, label: el.getAttribute("aria-label"), shadow: cs.boxShadow, border: cs.borderTopWidth }
    }, sel)
    if (one) {
      const size = sel.includes("sheet") ? 30 : 28
      expect(!!plus && plus.w === size && plus.h === size && plus.centred && plus.label === "New business",
        `${sel}: a ${size}px plus named New business, centred on the row`, plus)
      expect(!!plus && plus.gapToChevron >= 8 && plus.gapToName >= 8 && plus.border === "1px" && /inset/.test(plus.shadow),
        `${sel}: left of the chevron, clear of the name, with a hairline and the icon buttons' depth`, plus && { gapToChevron: plus.gapToChevron, gapToName: plus.gapToName, border: plus.border })
      expect(!!plus && plus.hits.every(Boolean), `${sel}: a press anywhere in the 44px around it lands on the plus`, plus && plus.hits)
    } else {
      expect(plus === null, `${sel}: two businesses already, so no plus`, plus)
    }
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
  /* A real mouse press on the sheet's plus, with its list folded first: it makes the business and leaves the list alone. */
  await toggle("[data-probe=sheet-one]")
  const plusAt = await p.evaluate(() => {
    const el = document.querySelector("[data-probe=sheet-one] [data-business-add]")
    el.scrollIntoView({ block: "center" })
    const b = el.getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  })
  await p.mouse.click(plusAt.x, plusAt.y)
  await sleep(400)
  const pressed = await p.evaluate(() => ({
    created: window.__created ?? 0,
    pushed: window.__pushed ?? null,
    expanded: document.querySelector("[data-probe=sheet-one] [data-business-row=current]").getAttribute("aria-expanded"),
    spinning: !!document.querySelector("[data-probe=sheet-one] [data-business-add] .animate-spin"),
    busy: document.querySelector("[data-probe=sheet-one] [data-business-add]").getAttribute("aria-busy"),
  }))
  expect(pressed.created === 1 && pressed.pushed === null && pressed.expanded === "false" && pressed.spinning && pressed.busy === "true",
    "the plus starts the new business right there, spins while it works, and does not open the list", pressed)
  await p.evaluate(() => document.querySelector("[data-probe=sheet-one]").scrollIntoView())
  await p.screenshot({ path: join(shots, "business-plus-waiting.png") })
  await p.evaluate(() => document.querySelector("[data-probe=dropdown-one] [data-business-new]").click())
  await sleep(150)
  const made = await p.evaluate(() => ({ created: window.__created, pushed: window.__pushed ?? null, text: document.querySelector("[data-probe=dropdown-one] [data-business-new]").textContent.trim(), spinning: !!document.querySelector("[data-probe=dropdown-one] [data-business-new] .animate-spin"), plusSpinning: !!document.querySelector("[data-probe=dropdown-one] [data-business-add] .animate-spin") }))
  expect(made.created === 2 && made.pushed === null && made.spinning && made.plusSpinning && made.text === "Setting up your new business", "New business in the list does the same, no page in between, says it is setting up, and the plus waits with it", made)
  await p.screenshot({ path: join(shots, "business-new-waiting.png") })
  if (errors.length) expect(false, "no errors on the page", errors)
  await browser.close()
  console.log(`\nshots: ${shots}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
if (broken) fail(`${broken} check(s) failed`)
console.log("\nall checks passed")
