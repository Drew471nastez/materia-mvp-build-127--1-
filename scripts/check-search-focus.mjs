/**
 * ===========================================================================
 *  A SEARCH FIELD IN /app, FOCUSED
 * ===========================================================================
 * "On focus the border turns heavy black, too much weight. Make focus lighter
 * and refined: a slightly darker grey border and a soft halo, as done for
 * the description editor."
 *
 * Each search field's own classes, read from its source file, drawn with the
 * app's real stylesheet and focused, at 390 and 1280. Focused, every one
 * must wear the description editor's focus: a #c9ccd3 hairline (or, for the
 * filled /app search, the same hairline inset) and a 3px halo of
 * rgba(17,17,19,0.06), and nothing black or violet.
 *
 *   node scripts/check-search-focus.mjs
 *   SHOTS_DIR=<dir> node scripts/check-search-focus.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-search-focus-")), "shots")
mkdirSync(shots, { recursive: true })

/* Where each field is, and how to find the box that draws its edge: the wrapper (focus-within) or the input itself (focus). */
const FIELDS = [
  { name: "Orders", file: "app/app/orders/orders-list.tsx", placeholder: "Search by order, customer or product", edge: "wrapper" },
  { name: "Emails subscribers", file: "app/app/emails/emails-home.tsx", placeholder: "Search by email or name", edge: "wrapper" },
  /* The Products page's field has no box of its own on any width now: it sits bare in the card's toolbar, the row's own edge the frame, as it always did on a phone (app/app/products/products-client.tsx). Nothing to focus but the caret. */
  { name: "Product picker", file: "components/app/product-picker.tsx", placeholder: "Search products", edge: "input" },
  /* The time zone and country fields are one shared ChoicePicker now
     (62a7ea8d, c7bb5b46; the time zone's words changed in 88d197a4), so
     their search is ChoiceSearch's input, found by where it takes the
     placeholder it is handed rather than by the words. */
  { name: "Time zone and country (ChoiceSearch)", file: "components/ui/choice-list.tsx", placeholder: "Search a city, region or UTC offset", marker: "data-choice-search=\"\"", edge: "input" },
  /* From 768px this field sits bare in the header's panel, whose own edge is the frame; on a phone it is a filled field and wears the halo. */
  { name: "/app search (phone)", file: "components/app/app-search.tsx", placeholder: "Search orders, customers, products", edge: "input", phoneOnly: true },
]

/* The className strings nearest the placeholder: the input's after it (or before, in a cn(...) call), the wrapper's before it. */
function classes(field) {
  const src = readFileSync(join(root, field.file), "utf8")
  const at = src.indexOf(field.marker ?? `placeholder="${field.placeholder}"`)
  if (at < 0) throw new Error(`${field.name}: no placeholder in ${field.file}`)
  const strings = [...src.matchAll(/className="([^"]*)"|"((?:[^"\n]*\s)?(?:rounded|border|flex|w-full|h-11)[^"\n]*)"/g)].map((m) => ({ i: m.index, s: m[1] ?? m[2] }))
  const after = strings.find((x) => x.i > at && x.i - at < 1200)
  const before = strings.filter((x) => x.i < at && at - x.i < 1600)
  const wrapper = [...before].reverse().find((x) => /focus-within:/.test(x.s))
  const focusable = (x) => x && /focus(-visible)?:/.test(x.s) && !/focus-within:/.test(x.s)
  const input = field.edge === "input" ? (focusable(after) ? after : [...before].reverse().find(focusable)) : after
  return { wrapper: wrapper?.s ?? "", input: input?.s ?? "" }
}

const css = await appCss(root)
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
let broken = 0
const expect = (ok, what, got) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`); if (!ok) broken++ }

for (const [label, vp] of [["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ["1280", { width: 1280, height: 800, deviceScaleFactor: 1 }]]) {
  console.log(`\n${label}px`)
  const page = await browser.newPage()
  await page.setViewport(vp)
  const fields = FIELDS.filter((f) => !f.phoneOnly || label === "390")
  const rows = fields.map((f, n) => {
    const c = classes(f)
    const input = `<input id="f${n}" type="search" placeholder="${f.placeholder}" class="${c.input}">`
    return `<div style="margin:0 0 18px"><p style="font:12px system-ui;color:#6b7280;margin:0 0 6px">${f.name}</p>${c.wrapper ? `<label class="${c.wrapper}">${input}</label>` : input}</div>`
  }).join("")
  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body style="margin:0;padding:24px 16px;background:#f8f9fa;max-width:520px">${rows}</body></html>`)
  for (const [n, f] of fields.entries()) {
    await page.focus(`#f${n}`)
    await new Promise((r) => setTimeout(r, 220))
    const got = await page.evaluate((n, edge) => {
      const input = document.getElementById(`f${n}`)
      const box = edge === "wrapper" ? input.closest("label") : input
      const c = getComputedStyle(box)
      return { border: c.borderTopColor, width: c.borderTopWidth, shadow: c.boxShadow, focused: document.activeElement === input, visible: input.matches(":focus-visible") }
    }, n, f.edge)
    const halo = /rgba\(17, 17, 19, 0\.06\) 0px 0px 0px 3px/.test(got.shadow)
    const hairline = got.border === "rgb(201, 204, 211)" || /rgb\(201, 204, 211\) 0px 0px 0px 1px inset/.test(got.shadow)
    const heavy = /rgb\(26, 26, 46\)|rgb\(17, 17, 19\) 0px 0px 0px [12]px|139, 92, 246/.test(`${got.border} ${got.shadow}`) || got.border === "rgb(26, 26, 46)"
    expect(halo && hairline && !heavy, `${f.name}: focused, a #c9ccd3 hairline and a soft 3px halo, nothing black or violet`, got)
    await page.screenshot({ path: join(shots, `search-focus-${label}-${n}.png`), clip: await page.evaluate((n) => { const r = document.getElementById(`f${n}`).parentElement.getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top - 30), width: Math.min(window.innerWidth, 560), height: r.height + 44 } }, n) })
  }
  await page.close()
}
await browser.close()
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.log(`\n${broken} failed`); process.exit(1) }
console.log("\nall checks passed")
