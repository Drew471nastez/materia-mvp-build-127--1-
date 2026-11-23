/**
 * ===========================================================================
 *  THE THEME VERSION LINE, ITS DIALOG, AND THE ADMIN'S RELEASES, MEASURED
 * ===========================================================================
 * node scripts/check-theme-version.mjs [--shots DIR]
 *
 * Renders scripts/render-theme-version.tsx in headless Chromium with the
 * page's own Tailwind, at a desk's width and a phone's, and measures it:
 * the dialog is a compact modal on a desk and the bottom sheet on a phone,
 * nothing runs off the side, the notes and Update are there, the files kept
 * after Update are listed, and Update is not offered when the theme is up to
 * date. --shots writes a picture of each for a person to look at.
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { chromium } = require("playwright")
const root = process.cwd()
const shots = process.argv.includes("--shots") ? process.argv[process.argv.indexOf("--shots") + 1] : null
const out = mkdtempSync(join(tmpdir(), "storelib-theme-version-"))
const bundle = join(out, "page.js")
execFileSync(join(root, "node_modules/.bin/esbuild"), [join(root, "scripts/render-theme-version.tsx"), "--bundle", "--platform=browser", "--format=iife", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`, "--define:process.env.NODE_ENV=\"production\"", `--alias:@=${root}`], { stdio: ["ignore", "ignore", "inherit"] })

const postcss = require("postcss")
const tailwind = require("@tailwindcss/postcss")
const sources = ["app/(storelib)/app/website-builder/theme-version.tsx", "app/(storelib)/admin/themes/releases-admin.tsx", "app/(storelib)/admin/_console/ui.tsx", "components/ui/alert-dialog.tsx", "components/ui/bottom-sheet.tsx", "scripts/render-theme-version.tsx"]
const cssIn = `@import "tailwindcss" source(none);\n${sources.map((s) => `@source "${join(root, s)}";`).join("\n")}\n`
const css = (await postcss([tailwind({ base: root })]).process(cssIn, { from: join(root, "app/check-theme-version.css") })).css
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body style="background:#f8f9fa;margin:0;font-family:Inter,system-ui,sans-serif"><div id="root"></div><script src="page.js"></script></body></html>`)
if (shots) mkdirSync(shots, { recursive: true })

let passed = 0
let failed = 0
const check = (name, ok, detail) => {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`) }
}

const browser = await chromium.launch()
async function open(view, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.goto(`file://${join(out, "index.html")}?view=${view}`)
  await page.waitForTimeout(700)
  if (shots) await page.screenshot({ path: join(shots, `theme-version-${view}-${width}.png`) })
  return { page, context, errors }
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

{
  const { page, context, errors } = await open("fact", 1280, 400)
  const rows = await page.$$eval("[data-theme-version]", (els) => els.map((e) => e.textContent.trim()))
  check("the version line: version, then Update available or Release notes", rows[0] === "Theme version2.0.1 · Update available" && rows[1] === "Theme version2.1.0 · Release notes", rows)
  const right = await page.$$eval("[data-theme-version] dd", (els) => els.map((e) => e.scrollWidth <= e.clientWidth + 1))
  check("  the whole line fits, nothing cut off", right.every(Boolean), right)
  const tall = await page.$eval("[data-theme-version]", (e) => e.getBoundingClientRect().height)
  check("  one row, the height of the facts beside it", tall >= 36 && tall <= 44, tall)
  check("  no script errors", errors.length === 0, errors)
  await context.close()
}
for (const [width, height, surface] of [[1280, 800, "modal"], [390, 844, "sheet"]]) {
  const { page, context, errors } = await open("pending", width, height)
  const box = await page.$eval("[data-theme-version-dialog]", (e) => ({ ...e.getBoundingClientRect().toJSON(), surface: e.dataset.surface }))
  check(`${width}px: the dialog is the ${surface}`, box.surface === surface, box.surface)
  if (surface === "modal") check("  a compact modal, 480 wide at most, centred", box.width <= 482 && Math.abs(box.left + box.width / 2 - width / 2) < 4, box)
  else check("  the sheet takes the phone's width", box.width >= 380, box.width)
  check("  nothing runs off the side", (await overflow(page)) <= 0)
  const notes = await page.$$eval("[data-release-notes] li", (els) => els.map((e) => e.querySelector("h3")?.textContent))
  check("  the notes of every release it lacks, newest first", notes.join() === "Version 2.1.0,Version 2.0.2", notes)
  if (surface === "modal") {
    const bg = await page.$eval("[data-theme-version-dialog]", (e) => getComputedStyle(e).backgroundColor)
    check("  the modal is white, whatever the page's theme variables say", bg === "rgb(255, 255, 255)", bg)
  }
  const title = await page.evaluate(() => [...document.querySelectorAll("h2")].map((h) => h.textContent).join("|"))
  check("  titled with the theme and the version it has", /Clothing version 2\.0\.1/.test(title ?? ""), title)
  const update = await page.$("[data-update-theme]")
  const ub = update ? await update.boundingBox() : null
  check("  Update is there, at least 36px high", !!ub && ub.height >= 36, ub)
  check("  no script errors", errors.length === 0, errors)
  await context.close()
}
{
  const { page, context } = await open("result", 1280, 800)
  const kept = await page.$$eval("[data-update-kept] li", (els) => els.map((e) => e.textContent))
  check("after Update: the files kept as theirs are listed", kept.join() === "sections/main-product.storelib,sections/my-banner.storelib", kept)
  check("  Open copy, not Update", !!(await page.$("[data-update-open]")) && !(await page.$("[data-update-theme]")))
  await context.close()
}
{
  const { page, context } = await open("current", 1280, 800)
  const line = await page.textContent("[role=alertdialog] p")
  check("up to date: said so, no Update, the notes of the version it has", /up to date/.test(line ?? "") && !(await page.$("[data-update-theme]")) && (await page.$$("[data-release-notes] li")).length === 1, line)
  await context.close()
}
for (const width of [1280, 390, 320]) {
  const { page, context, errors } = await open("row", width, 400)
  const line = await page.$eval("[data-row-update]", (e) => { const r = e.getBoundingClientRect(); const row = e.closest("[data-row]").getBoundingClientRect(); return { right: r.right, rowRight: row.right, width: e.scrollWidth, shown: e.clientWidth, text: e.textContent } })
  check(`row ${width}px: Update available on its own line, whole`, line.text === "Update available" && line.width <= line.shown + 1 && line.right <= line.rowRight, line)
  const h = await page.$eval("[data-row]", (e) => e.getBoundingClientRect().height)
  check("  the row stays compact", h <= 96, h)
  check("  nothing runs off the side, no script errors", (await overflow(page)) <= 0 && errors.length === 0, errors)
  await context.close()
}
for (const width of [1280, 390]) {
  const { page, context, errors } = await open("admin", width, 900)
  const versions = await page.$$eval("[data-admin-release]", (els) => els.map((e) => e.getAttribute("data-admin-release")))
  check(`admin ${width}px: the template's own releases, newest first`, versions.join() === "2.0.2,2.0.1", versions)
  const suggested = await page.$eval("[data-admin-release-form] input", (e) => e.value)
  check("  the next version is suggested above every one it could reach", suggested === "2.1.1", suggested)
  check("  nothing runs off the side", (await overflow(page)) <= 0)
  check("  no script errors", errors.length === 0, errors)
  await context.close()
}
await browser.close()
console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
