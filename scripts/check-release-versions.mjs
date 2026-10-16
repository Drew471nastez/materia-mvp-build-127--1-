/**
 * ===========================================================================
 *  PUBLISHED VERSIONS, MEASURED
 * ===========================================================================
 * The "Published versions" card in Backups & Versions and the question asked
 * before one is restored (components/website-builder/website-settings/
 * backups.tsx), drawn by scripts/render-release-versions.tsx with a fake
 * fetch, at 390 and 1280:
 *
 *   • the card reads like the Restore points card above it: the same row
 *     height, type size and colours, one Restore per row, none on the live one;
 *   • on a phone nothing scrolls sideways and no label or button wraps
 *     into the next;
 *   • `{ available: false }` draws no card at all;
 *   • Restore asks first, posts once however often it is pressed, closes
 *     and reloads the editor on success, and keeps the question open with
 *     the reason when it fails;
 *   • the question takes focus, keeps Tab inside, closes on Escape, and
 *     gives focus back to the button that opened it.
 *
 *   node scripts/check-release-versions.mjs   (PROBE_CSS=source without a build)
 *
 * Screenshots go to SHOTS_DIR (prefix release-), or a temporary folder.
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

const out = mkdtempSync(join(tmpdir(), "storelib-release-versions-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
/* Inside the checkout, so the bundle resolves react from its node_modules. */
const stubs = join(root, ".release-versions-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/website-builder/editor/install-1"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
writeFileSync(join(stubs, "browser.tsx"), `import { createRoot } from "react-dom/client"
import { boot } from "${join(root, "scripts/render-release-versions.tsx")}"
window.__errors = []
const origError = console.error
console.error = (...a) => { window.__errors.push(a.map(String).join(" ")); origError(...a) }
window.addEventListener("error", (e) => window.__errors.push(String(e.message)))
boot((el) => createRoot(document.getElementById("app")).render(el))
`)
try {
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
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
const bundle = readFileSync(join(out, "probe.js"))
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

const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESKTOP = { width: 1280, height: 900, deviceScaleFactor: 1 }
const SIZES = [["390", PHONE], ["1280", DESKTOP]]

async function open(viewport, query = "") {
  const p = await browser.newPage()
  await p.setViewport(viewport)
  await p.goto(`${origin}/?${query}`, { waitUntil: "load" })
  await p.waitForSelector("[role=dialog][aria-label='Website settings']")
  await sleep(500)
  return p
}

/** A card by its heading, and each row in it: label, hint, button, and their boxes and colours. */
const card = (p, title) => p.evaluate((t) => {
  const h = [...document.querySelectorAll("section > h2")].find((e) => e.textContent.trim() === t)
  if (!h) return null
  const section = h.closest("section")
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) } }
  const lines = (e) => { const lh = parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.3; return Math.round(e.getBoundingClientRect().height / lh) }
  const rows = [...section.querySelector(":scope > div").children].map((row) => {
    const label = row.querySelector(":scope > div:first-child > :first-child")
    const hint = row.querySelector(":scope > div:first-child > p")
    const button = row.querySelector("button")
    return {
      h: Math.round(row.getBoundingClientRect().height),
      label: label?.textContent.trim(),
      labelSize: label && getComputedStyle(label).fontSize,
      labelColor: label && getComputedStyle(label).color,
      labelLines: label && lines(label),
      hint: hint?.textContent.trim(),
      hintColor: hint && getComputedStyle(hint).color,
      hintSize: hint && getComputedStyle(hint).fontSize,
      hintLines: hint && lines(hint),
      button: button ? { text: button.textContent.trim(), ...box(button), cls: button.className, lines: Math.round(button.scrollHeight / button.clientHeight) } : null,
      badge: row.querySelector(":scope > div:last-child span")?.textContent.trim() ?? null,
      row: box(row),
    }
  })
  return { box: box(section), rows }
}, title)

const overflow = (p) => p.evaluate(() => {
  const main = document.querySelector("[data-settings-page]")
  return Math.max(main.scrollWidth - main.clientWidth, document.documentElement.scrollWidth - window.innerWidth)
})

/** The settings page scrolled so a card's top is in view, then the page shot. */
async function shootCard(p, title, file) {
  await p.evaluate((t) => {
    const h = [...document.querySelectorAll("section > h2")].find((e) => e.textContent.trim() === t)
    const main = document.querySelector("[data-settings-page]")
    if (h) main.scrollTop = h.closest("section").offsetTop - 80
  }, title)
  await sleep(150)
  await p.screenshot({ path: join(shots, file) })
}

const restoreButtons = (p) => p.$$eval("section", (ss) => {
  const s = ss.find((x) => x.querySelector("h2")?.textContent.trim() === "Published versions")
  return s ? [...s.querySelectorAll("button")].map((b) => b.textContent.trim()) : []
})
async function openSheet(p, index = 0) {
  await p.evaluate((i) => {
    const s = [...document.querySelectorAll("section")].find((x) => x.querySelector("h2")?.textContent.trim() === "Published versions")
    const b = [...s.querySelectorAll("button")][i]
    b.focus()
    b.click()
  }, index)
  await p.waitForSelector("[role=alertdialog]")
  await sleep(320)
}
const sheet = (p) => p.evaluate(() => {
  const d = document.querySelector("[role=alertdialog]")
  if (!d) return null
  const r = d.getBoundingClientRect()
  const buttons = [...d.querySelectorAll("button")].map((b) => ({ text: b.textContent.trim(), disabled: b.disabled, h: Math.round(b.getBoundingClientRect().height) }))
  return {
    label: d.getAttribute("aria-label"),
    labelledby: d.getAttribute("aria-labelledby") && document.getElementById(d.getAttribute("aria-labelledby"))?.textContent.trim(),
    text: d.textContent,
    alert: d.querySelector("[role=alert]")?.textContent.trim() ?? null,
    focusInside: d.contains(document.activeElement),
    focused: document.activeElement?.textContent.trim(),
    top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right),
    buttons,
  }
})
const posts = (p) => p.evaluate(() => window.__calls.filter((c) => c.startsWith("POST") && c.includes("/releases/")))
const pressConfirm = (p) => p.evaluate(() => {
  const d = document.querySelector("[role=alertdialog]")
  const b = [...d.querySelectorAll("button")].pop()
  b.click()
})

/* ── The card, at each width, beside Restore points ──────────────── */
for (const [name, vp] of SIZES) {
  console.log(`\n${name}: the card`)
  const p = await open(vp)
  const versions = await card(p, "Published versions")
  const points = await card(p, "Restore points")
  expect(!!versions, "the card is drawn when versions are available")
  if (!versions) { await p.close(); continue }
  expect(versions.rows.length === 4, "one row per version", versions.rows.length)
  const live = versions.rows[0]
  expect(!live.button, "the live version has no Restore", live.button?.text)
  expect(/live/i.test(`${live.hint} ${live.badge}`), "and says it is live", `${live.hint} | ${live.badge}`)
  expect(versions.rows.slice(1).every((r) => r.button), "every other version has one Restore", versions.rows.map((r) => r.button?.text ?? "-"))
  const restoreText = new Set(versions.rows.filter((r) => r.button).map((r) => r.button.text))
  const pointText = new Set(points.rows.filter((r) => r.button).map((r) => r.button.text))
  expect([...restoreText].join() === [...pointText].join(), "its button says what Restore points' says", `${[...restoreText]} vs ${[...pointText]}`)
  /* A row whose label and hint each take one line, in either card, is the same height. */
  const oneLine = (rows) => rows.filter((r) => r.labelLines === 1 && r.hintLines === 1 && r.button).map((r) => r.h)
  const heights = [...oneLine(points.rows), ...oneLine(versions.rows)]
  expect(heights.length > 1 && Math.max(...heights) - Math.min(...heights) <= 1, "a one-line row is the same height in both cards", { points: points.rows.map((r) => r.h), versions: versions.rows.map((r) => r.h) })
  const twin = versions.rows.find((r) => r.button && r.hintLines === 1)
  expect(!!twin && Math.abs(versions.rows[0].h - twin.h) <= 2, "the live row, with its badge, sits within 2px of a one-line row with Restore", versions.rows.map((r) => r.h))
  const same = (k) => versions.rows.every((r) => r[k] === points.rows[0][k])
  expect(same("labelSize") && same("labelColor"), "labels in the same size and colour", `${versions.rows[1].labelSize} ${versions.rows[1].labelColor}`)
  expect(same("hintSize") && same("hintColor"), "hints in the same size and colour", `${versions.rows[1].hintSize} ${versions.rows[1].hintColor}`)
  expect(versions.rows.every((r) => r.labelLines === 1), "no label wraps", versions.rows.map((r) => `${r.label} ${r.labelLines}`))
  expect(versions.rows.filter((r) => r.button).every((r) => r.button.lines === 1 && r.button.right <= versions.box.right - 15), "no button wraps or touches the card's edge", versions.rows.map((r) => r.button && `${r.button.w}x${r.button.h} right ${r.button.right}`))
  if (name === "390") expect(versions.rows.filter((r) => r.button).every((r) => r.button.h >= 44), "each Restore is a thumb's height", versions.rows.map((r) => r.button?.h))
  expect((await overflow(p)) <= 0, "nothing scrolls sideways", await overflow(p))
  await shootCard(p, "Restore points", `release-${name}-card.png`)
  await shootCard(p, "Published versions", `release-${name}-card-versions.png`)
  await p.close()
}

/* ── Not set up: no card ─────────────────────────────────────────── */
for (const [name, vp] of SIZES) {
  console.log(`\n${name}: { available: false }`)
  const p = await open(vp, "releases=off")
  expect(!(await card(p, "Published versions")), "no Published versions card")
  expect(!!(await card(p, "Restore points")), "Restore points is still there")
  const err = await p.evaluate(() => document.querySelector("[data-settings-page] .text-red-300")?.textContent ?? null)
  expect(!err, "and no error", err)
  await p.screenshot({ path: join(shots, `release-${name}-unavailable.png`) })
  await p.close()
}

/* ── Loading: the page before either list has answered ───────────── */
for (const [name, vp] of SIZES) {
  console.log(`\n${name}: loading`)
  const p = await open(vp, "releases=wait")
  expect(!(await card(p, "Published versions")), "no versions card until the list answers, so nothing jumps in empty")
  const spinner = await p.evaluate(() => !!document.querySelector("section .animate-spin"))
  expect(spinner, "Restore points shows its spinner")
  await p.screenshot({ path: join(shots, `release-${name}-loading.png`) })
  await p.close()
}

/* ── The question, its focus, Escape ─────────────────────────────── */
for (const [name, vp] of SIZES) {
  console.log(`\n${name}: the question`)
  const p = await open(vp)
  await openSheet(p, 0)
  const s = await sheet(p)
  expect(!!s, "Restore opens the question")
  expect((await posts(p)).length === 0, "and nothing is posted until it is answered", await posts(p))
  expect(/October 9, 2026|9 October 2026/.test(s.text), "it names the version's date", s.text.slice(0, 120))
  expect(!!(s.labelledby || s.label), "it is named for a screen reader", s.labelledby || s.label)
  expect(s.focusInside, "focus moves into it", s.focused)
  expect(s.top >= 0 && s.bottom <= vp.height && s.left >= 0 && s.right <= vp.width, "it fits the screen", s)
  if (name === "390") {
    expect(s.bottom >= vp.height - 16, "on a phone it sits at the foot, a sheet", `bottom ${s.bottom} of ${vp.height}`)
    expect(s.buttons.every((b) => b.h >= 44), "its buttons are a thumb's height", s.buttons.map((b) => b.h))
  }
  await p.screenshot({ path: join(shots, `release-${name}-sheet.png`) })
  /* Tab from the last button lands back on the first: focus stays in the question. */
  const trapped = []
  for (let i = 0; i < 4; i++) {
    await p.keyboard.press("Tab")
    trapped.push(await p.evaluate(() => !!document.querySelector("[role=alertdialog]")?.contains(document.activeElement)))
  }
  expect(trapped.every(Boolean), "Tab stays inside it", trapped)
  await p.keyboard.press("Escape")
  await sleep(300)
  expect(!(await sheet(p)), "Escape closes it")
  expect((await p.evaluate(() => window.__closes)) === 0, "and only it: Website Settings behind it stays open", await p.evaluate(() => window.__closes))
  const back = await p.evaluate(() => document.activeElement?.textContent.trim() + " in " + document.activeElement?.closest("section")?.querySelector("h2")?.textContent.trim())
  expect(/Published versions/.test(back), "and focus goes back to the button that opened it", back)
  expect((await posts(p)).length === 0, "Escape posts nothing", await posts(p))
  await p.close()
}

/* ── Restore: once, busy, closed, reloaded ───────────────────────── */
for (const [name, vp] of SIZES) {
  console.log(`\n${name}: restoring`)
  const p = await open(vp, "restore=hold")
  await openSheet(p, 0)
  await p.evaluate(() => {
    const b = [...document.querySelector("[role=alertdialog]").querySelectorAll("button")].pop()
    b.click(); b.click(); b.click()
  })
  await sleep(120)
  const busy = await sheet(p)
  expect(busy.buttons.every((b) => b.disabled), "while it works both buttons are off", busy.buttons)
  expect(/Restoring/.test(busy.buttons.at(-1).text), "and the button says it is restoring", busy.buttons.at(-1).text)
  await p.keyboard.press("Escape")
  await p.mouse.click(10, 10)
  await sleep(100)
  expect(!!(await sheet(p)) && (await p.evaluate(() => window.__closes)) === 0, "Escape and a press outside close nothing mid restore")
  await p.screenshot({ path: join(shots, `release-${name}-restoring.png`) })
  const sent = await posts(p)
  expect(sent.length === 1 && sent[0] === "POST /api/website-builder/themes/install-1/releases/bbbbbbbb-2222-4222-8222-222222222222/restore", "three presses post once, to that version's restore", sent)
  await p.evaluate(() => window.__finishRestore())
  await sleep(350)
  expect(!(await sheet(p)), "on success the question closes")
  expect((await p.evaluate(() => window.__reloads)) === 1, "and the editor is told to reload, once", await p.evaluate(() => window.__reloads))
  await p.close()
}

/* ── A refusal: said in the question, not behind it ──────────────── */
for (const [name, vp] of SIZES) {
  console.log(`\n${name}: a failed restore`)
  const p = await open(vp, "restore=fail")
  await openSheet(p, 1)
  await pressConfirm(p)
  await sleep(250)
  const s = await sheet(p)
  expect(!!s, "the question stays open")
  expect(s?.alert === "This version cannot be restored. Nothing changed.", "with the route's reason inside it, as an alert", s?.alert)
  expect(s?.buttons.every((b) => !b.disabled), "and it can be tried again or cancelled", s?.buttons)
  const pageErr = await p.evaluate(() => [...document.querySelectorAll("[data-settings-page] p")].some((e) => e.textContent.includes("cannot be restored") && !e.closest("[role=alertdialog]")))
  expect(!pageErr, "not also on the page behind it")
  expect((await p.evaluate(() => window.__reloads)) === 0, "nothing reloads")
  await p.screenshot({ path: join(shots, `release-${name}-error.png`) })
  await p.keyboard.press("Escape")
  await sleep(250)
  await openSheet(p, 1)
  expect(!(await sheet(p))?.alert, "asked again, the old reason is gone")
  await p.close()
}

/* ── Nothing went wrong in React ─────────────────────────────────── */
{
  const p = await open(PHONE)
  await openSheet(p, 0)
  const errs = await p.evaluate(() => window.__errors)
  expect(errs.length === 0, "no errors in the console", errs.slice(0, 3))
  await p.close()
}

await browser.close()
server.close()
console.log(`\nScreenshots in ${shots}`)
if (broken) fail(`${broken} check(s) failed.`)
console.log("\nAll release version checks passed.\n")
