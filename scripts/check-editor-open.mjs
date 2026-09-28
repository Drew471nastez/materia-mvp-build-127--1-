/**
 * ===========================================================================
 *  ONE SIGN OF PROGRESS, IN ONE PLACE, FOR AS LONG AS THE WAIT
 * ===========================================================================
 * "When it's loading a product page editor, or editing a new product, you can
 * see the double loading there. I don't like it. Sometimes it ends, and then I
 * have to wait another 10 seconds to load the page."
 *
 * scripts/render-layer-motion.tsx draws the real Products list and the real
 * editor on the React the app router runs, with `window.__slowMs` standing in
 * for the editor's server read (app/app/products/load-editor.ts), so a press
 * can be held open for as long as the probe likes. At 390, 1280 and 1920 this
 * presses a row and watches the list while the editor is on its way:
 *
 *   HOW MANY SPINNERS. Every turning thing drawn on the list is counted and
 *   placed: the row's own (OpeningMark, products-client) and the one
 *   page-layer's holdPress appends to whatever was under the finger. One is
 *   right; two was the double loading.
 *
 *   THE NAME STAYS READABLE. `[data-layer-press="wait"]` paints its element's
 *   text transparent, so a spinner over the product's name left the name cell
 *   empty. The name must still be drawn.
 *
 *   IT LASTS AS LONG AS THE WAIT. With the read held open past every cap in
 *   the app (8s holdPress, 10s the list's own), the sign of progress must
 *   still be turning on the frame before the editor arrives.
 *
 *   AND IT IS THE ARRIVAL THAT ENDS IT. Nothing of the press is left on the
 *   list once the editor is up.
 *
 *   node scripts/check-editor-open.mjs
 *   SHOTS_DIR=/some/dir node scripts/check-editor-open.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}

const built = execFileSync(process.execPath, [join(root, "scripts/check-layer-motion.mjs")], { cwd: root, env: { ...process.env, BUILD_ONLY: "1" }, encoding: "utf8" })
  .trim()
  .split("\n")
  .pop()
const html = readFileSync(built, "utf8")
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-editor-open-")), "shots")
mkdirSync(shots, { recursive: true })

/* Everything turning that is drawn on the list, with where it is. */
const MARKS = () => {
  const out = []
  const seen = new Set()
  for (const el of document.querySelectorAll("[data-activity-spinner],[data-layer-press-spinner]")) {
    if (el.closest("[data-page-layer]")) continue
    const b = el.getBoundingClientRect()
    if (b.width === 0 || b.height === 0) continue
    const style = getComputedStyle(el)
    if (style.visibility === "hidden" || style.display === "none") continue
    const row = el.closest("[data-row]")
    const key = `${Math.round(b.x)}:${Math.round(b.y)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      kind: el.hasAttribute("data-layer-press-spinner") ? "press" : "row",
      row: row?.dataset.row ?? null,
      x: Math.round(b.x + b.width / 2),
      y: Math.round(b.y + b.height / 2),
      opacity: +Number(style.opacity).toFixed(2),
    })
  }
  return out
}

/* Is the pressed row's name still drawn? */
const NAME_SHOWN = (id) => {
  const row = [...document.querySelectorAll(`[data-row="${CSS.escape(id)}"]`)].find((el) => el.getClientRects().length > 0)
  if (!row) return null
  const name = row.querySelector("[data-name]") || row.querySelector("td:first-child a")
  if (!name) return null
  const s = getComputedStyle(name)
  return { text: (name.textContent || "").trim(), color: s.color, opacity: +Number(s.opacity).toFixed(2) }
}

async function openTrip(p, { width, slowMs, label }) {
  /* Back to the list at once, and only then is the read held open. */
  await p.evaluate(() => {
    window.__slowMs = 0
    window.__navigate("/app/products", "replace")
  })
  await sleep(700)
  await p.evaluate((ms) => { window.__slowMs = ms }, slowMs)
  const id = await p.evaluate(() => {
    const row = [...document.querySelectorAll("[data-row]:not([hidden])")].find((el) => el.getClientRects().length > 0)
    return row?.dataset.row ?? null
  })
  /* Where a finger or a pointer really lands: the name on a computer, the row's link on a phone. */
  const box = await p.evaluate((id) => {
    const row = [...document.querySelectorAll(`[data-row="${CSS.escape(id)}"]`)].find((el) => el.getClientRects().length > 0)
    const target = row.querySelector("a[data-row-link]") || row.querySelector("td:first-child a")
    const b = target.getBoundingClientRect()
    return { x: b.left + Math.min(b.width / 2, 80), y: b.top + b.height / 2 }
  }, id)
  const began = Date.now()
  await p.mouse.click(box.x, box.y)
  const film = []
  for (const at of [130, 260, 500, 1000, 2000, 4000, 7000, 8400, 10400, 12200]) {
    if (at > slowMs + 1200) break
    while (Date.now() - began < at) await sleep(20)
    const marks = await p.evaluate(MARKS)
    const name = await p.evaluate(NAME_SHOWN, id)
    const editor = await p.evaluate(() => !!document.querySelector("[data-product-editor],[data-page-layer]"))
    film.push({ at, marks, name, editor })
    if (at === 260 || at === 2000) await p.screenshot({ path: join(shots, `editor-open-${label}-${width}-${at}.png`) })
  }
  return { id, film }
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
try {
  for (const width of [390, 1280, 1920]) {
    const phone = width < 768
    console.log(`\n${phone ? "phone" : "computer"} ${width}`)
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("data:")) return r.continue()
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      if (!u.startsWith("http://probe.test/app") && u.startsWith("http://probe.test/")) return r.respond({ status: 404, contentType: "application/json", body: "{}" })
      if (u.startsWith("http://probe.test/")) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (u.startsWith("file:")) return r.continue()
      r.abort()
    })
    await p.setViewport({ width, height: phone ? 844 : 900, isMobile: phone, hasTouch: phone, deviceScaleFactor: 2 })
    await p.goto("http://probe.test/app/products")
    await sleep(1400)
    if (errors.length) { console.error(errors[0]); process.exit(1) }

    /* A read held open a second and a half: the press's own answer, at its busiest. */
    const slow = await openTrip(p, { width, slowMs: 1500, label: "slow" })
    const busy = slow.film.filter((f) => !f.editor && f.marks.length)
    const most = Math.max(0, ...busy.map((f) => f.marks.length))
    expect(most <= 1, "one sign of progress on the list, not two", { most, where: busy.map((f) => ({ at: f.at, marks: f.marks.map((m) => `${m.kind}@${m.x},${m.y}`) })) })
    const named = slow.film.filter((f) => !f.editor).map((f) => f.name).filter(Boolean)
    expect(named.every((n) => n.text.length > 0 && n.color !== "rgba(0, 0, 0, 0)" && n.opacity > 0.3), "the product's name stays readable while it opens", named.slice(0, 3))
    expect(slow.film.some((f) => f.editor), "the editor arrives", slow.film.map((f) => `${f.at}:${f.editor ? "editor" : "list"}`))
    const after = slow.film.filter((f) => f.editor)
    expect(after.every((f) => f.marks.length === 0), "and nothing of the press is left on the list", after.map((f) => f.marks.length))

    /* A read held open past every cap: the sign of progress must outlast them. */
    const stuck = await openTrip(p, { width, slowMs: 11000, label: "stuck" })
    const before = stuck.film.filter((f) => !f.editor)
    const gaps = before.filter((f) => f.marks.length === 0).map((f) => f.at)
    expect(gaps.length === 0, "the sign of progress lasts the whole wait", { silent: gaps, film: before.map((f) => `${f.at}:${f.marks.length}`) })

    await p.evaluate(() => { window.__slowMs = 0 })
    if (errors.length) expect(false, "nothing threw", errors)
    await p.close()
  }
} finally {
  await browser.close()
}
console.log(`\nshots: ${shots}`)
if (broken) {
  console.error(`\n${broken} not right yet.`)
  process.exit(1)
}
console.log("\nAll good.")
