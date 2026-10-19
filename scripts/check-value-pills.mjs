/**
 * ===========================================================================
 *  SHOP DATA IN A SENTENCE IS A PILL, AND TYPING NEVER STOPS
 * ===========================================================================
 * The owner: adding a dynamic value (shop name, brand headline...) to a text,
 * heading or rich text box "blocks writing inside of the input", and the
 * value should be "a pill shape thing that I can replace or delete".
 *
 * This mounts the real DynamicSourceField around each real control
 * (scripts/render-value-pills-probe.tsx) in a 320px sidebar at 1440 and in
 * the editor's bottom sheet at 390 with a touch screen, and types into them
 * with the keyboard, the way a person does:
 *
 *   - typing, inserting Shop name at the caret, typing on after it
 *   - an empty box: insert, then type (it used to turn into a chip with no box)
 *   - a heading typed letter by letter with spaces (it used to throw the caret)
 *   - rich text: insert in the middle of a line and at the end of the field
 *   - Backspace and Delete take a pill whole; an arrow steps over it
 *   - a click (a tap on the phone) on a pill: replace it, or Remove
 *   - copy carries the placeholder; a paste of braces comes back as a pill
 *   - a pill names itself to a screen reader
 *   - no box ever scrolls sideways, and a long one grows taller
 *
 * Every value is read back from what the field saved.
 *
 *   node scripts/check-value-pills.mjs          (SHOTS_DIR=dir for pictures)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { probeCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const root = process.cwd()
const css = await probeCss(root)
const out = mkdtempSync(join(tmpdir(), "storelib-pills-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-value-pills-probe.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, "--loader:.css=empty"],
  { stdio: ["ignore", "ignore", "inherit"] })
const js = readFileSync(join(out, "probe.js"))
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>body{margin:0;background:#f3f4f6;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="root"></div><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
let passed = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? JSON.stringify(got) : JSON.stringify(got)})`}`)
  if (ok) passed++
  else broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shots = process.env.SHOTS_DIR
if (shots) mkdirSync(shots, { recursive: true })
const MOUSE = "--blink-settings=availableHoverTypes=2,primaryHoverType=2,availablePointerTypes=4,primaryPointerType=4"
const FINGER = "--blink-settings=availableHoverTypes=1,primaryHoverType=1,availablePointerTypes=2,primaryPointerType=2"
const nb = (s) => String(s ?? "").replace(/ |&nbsp;/g, " ")

let browser = null
try {
  for (const vp of [
    { name: "desktop 1440", width: 1440, height: 900, phone: false },
    { name: "phone 390, touch", width: 390, height: 844, phone: true },
  ]) {
    console.log(`\n${vp.name}`)
    browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", vp.phone ? FINGER : MOUSE] })
    const page = await browser.newPage()
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2, isMobile: vp.phone, hasTouch: vp.phone })
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    await page.goto(origin, { waitUntil: "load" })
    await page.waitForSelector("[data-dynamic-action]")
    await sleep(vp.phone ? 900 : 200)

    const F = (id) => `[data-probe-field="${id}"]`
    const value = (id) => page.evaluate((id) => window.__pillValues[id], id)
    const into = async (sel) => {
      await page.$eval(sel, (el) => el.scrollIntoView({ block: "center" }))
      await sleep(60)
    }
    const press = async (sel) => {
      await into(sel)
      if (vp.phone) {
        const box = await (await page.$(sel)).boundingBox()
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
      } else await page.click(sel)
      await sleep(120)
    }
    /** Opens a field's Shop data list and picks one by its name. */
    const insert = async (id, label) => {
      await press(`${F(id)} [data-dynamic-action]`)
      await page.waitForSelector(`${F(id)} [role="listbox"]`)
      const opt = await page.evaluateHandle((id, label) => [...document.querySelectorAll(`[data-probe-field="${id}"] [role="option"]`)].find((b) => b.querySelector("span")?.textContent === label), id, label)
      await opt.evaluate((b) => b.scrollIntoView({ block: "center" }))
      const box = await opt.boundingBox()
      if (vp.phone) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
      else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await sleep(200)
    }
    /** The caret into a field's box, at the end of its text. */
    const focusEnd = async (id) => {
      const sel = `${F(id)} [contenteditable="true"], ${F(id)} textarea`
      await into(sel)
      await page.$eval(sel, (el) => {
        el.focus()
        if (el.tagName === "TEXTAREA") {
          el.setSelectionRange(el.value.length, el.value.length)
          return
        }
        const r = document.createRange()
        r.selectNodeContents(el)
        r.collapse(false)
        const s = getSelection()
        s.removeAllRanges()
        s.addRange(r)
      })
      await sleep(40)
    }
    const pills = (id) => page.$$eval(`${F(id)} [data-value][contenteditable="false"]`, (els) => els.map((e) => e.textContent))

    /* 1. A one line box: words, Shop name at the caret, words after it. */
    await focusEnd("line")
    await page.keyboard.type("Hi ", { delay: 15 })
    await sleep(80)
    await insert("line", "Shop name")
    if (vp.phone) await focusEnd("line")
    await page.keyboard.type(" there", { delay: 15 })
    await sleep(120)
    expect((await value("line")) === "Hi {{ shop.name }} there", "a one line box: typed, Shop name inserted at the caret, typing goes on after it", await value("line"))
    expect(JSON.stringify(await pills("line")) === '["Shop name"]', "  and the value is one pill named Shop name, not braces", await pills("line"))

    /* 2. An empty box: the value first, then words. It used to become a chip with no box to type in. */
    await focusEnd("first")
    await insert("first", "Shop name")
    if (vp.phone) await focusEnd("first")
    await page.keyboard.type(" sale", { delay: 15 })
    await sleep(120)
    expect((await value("first")) === "{{ shop.name }} sale", "an empty box: Shop name, then typing after it works", await value("first"))
    expect((await page.$(`${F("first")} [data-dynamic-bound]`)) === null && (await page.$(`${F("first")} [data-chip-input]`)) !== null, "  the box stays a box: never swapped for a chip with nowhere to type")

    /* 3. Saved content opens as pills. */
    const sentenceText = await page.$eval(`${F("sentence")} [data-chip-input]`, (el) => el.textContent.replace(/​/g, ""))
    expect(sentenceText === "Get Shop name today", "content saved before opens as words and a pill, no braces", sentenceText)

    /* 4. Backspace right after a pill takes it out whole, in one press. */
    await into(`${F("sentence")} [data-chip-input]`)
    await page.$eval(`${F("sentence")} [data-chip-input]`, (el) => {
      el.focus()
      const pill = el.querySelector("[data-value]")
      const r = document.createRange()
      const next = pill.nextSibling
      r.setStart(next, next.textContent.startsWith("​") ? 1 : 0)
      r.collapse(true)
      getSelection().removeAllRanges()
      getSelection().addRange(r)
    })
    await page.keyboard.press("Backspace")
    await sleep(100)
    expect((await value("sentence")) === "Get  today" && (await pills("sentence")).length === 0, "Backspace after a pill removes the whole pill in one press", await value("sentence"))
    await page.keyboard.type("more", { delay: 15 })
    await sleep(80)
    expect((await value("sentence")) === "Get more today", "  and typing goes on where it was", await value("sentence"))

    /* 5. Delete before a pill, and arrows over one. */
    await into(`${F("arrow")} [data-chip-input]`)
    await page.$eval(`${F("arrow")} [data-chip-input]`, (el) => {
      el.focus()
      const r = document.createRange()
      r.setStart(el.firstChild, 1)
      r.collapse(true)
      getSelection().removeAllRanges()
      getSelection().addRange(r)
    })
    await page.keyboard.press("ArrowRight")
    await page.keyboard.type("X")
    await sleep(80)
    expect((await value("arrow")) === "A{{ shop.name }}XB", "one ArrowRight steps over a pill", await value("arrow"))
    await page.keyboard.press("ArrowLeft")
    await page.keyboard.press("ArrowLeft")
    await page.keyboard.type("Y")
    await sleep(80)
    expect((await value("arrow")) === "AY{{ shop.name }}XB", "  ArrowLeft steps back over it the same way", await value("arrow"))
    await page.keyboard.press("Delete")
    await sleep(80)
    expect((await value("arrow")) === "AYXB", "  Delete before a pill removes it whole", await value("arrow"))

    /* 6. A click (a tap) on a pill: replace it, or remove it. */
    await press(`${F("swap")} [data-value]`)
    const menu = await page.$(`${F("swap")} [data-pill-remove]`)
    expect(!!menu, `a ${vp.phone ? "tap" : "click"} on a pill opens its list, with Remove at the top`)
    const ring = await page.$eval(`${F("swap")} [data-value]`, (el) => getComputedStyle(el).boxShadow)
    expect(/139, 92, 246/.test(ring), "  the pill being changed is outlined in the builder's violet", ring)
    await insertFromOpen(page, vp, "swap", "Creator name")
    expect((await value("swap")) === "Made by {{ creator.name }} in Leeds", "  picking another value replaces the pill where it stood", await value("swap"))
    await press(`${F("swap")} [data-value]`)
    await press(`${F("swap")} [data-pill-remove]`)
    expect((await value("swap")) === "Made by  in Leeds" && (await pills("swap")).length === 0, "  Remove takes it out", await value("swap"))

    /* 7. A heading, typed a letter at a time with spaces in it. */
    await focusEnd("heading")
    await page.keyboard.type(" to the shop ", { delay: 20 })
    await sleep(80)
    expect(nb(await value("heading")).trim() === "Welcome to the shop", "a heading typed letter by letter with spaces keeps every letter in order", await value("heading"))
    await insert("heading", "Shop name")
    if (vp.phone) await focusEnd("heading")
    await page.keyboard.type(" now", { delay: 20 })
    await sleep(120)
    expect(/^Welcome to the shop \{\{ shop\.name \}\} now$/.test(nb(await value("heading"))), "  Shop name inserted into it, typing goes on after the pill", await value("heading"))
    expect(JSON.stringify(await pills("heading")) === '["Shop name"]', "  shown as a pill", await pills("heading"))

    /* 8. Rich text: in the middle of a line, and in a field never clicked into. */
    await into(`${F("body")} [contenteditable="true"]`)
    await page.$eval(`${F("body")} [contenteditable="true"]`, (el) => {
      el.focus()
      const t = el.querySelector("p").firstChild
      const r = document.createRange()
      r.setStart(t, 5)
      r.collapse(true)
      getSelection().removeAllRanges()
      getSelection().addRange(r)
    })
    await sleep(60)
    await insert("body", "Brand headline")
    if (!vp.phone) {
      await page.keyboard.type("!", { delay: 15 })
      await sleep(120)
      expect((await value("body")) === "<p>Hello{{ shop.brand_headline }}! there</p>", "rich text: a value goes in at the caret, inside its line, and typing goes on after it", await value("body"))
    } else {
      expect((await value("body")) === "<p>Hello{{ shop.brand_headline }} there</p>", "rich text: a value goes in at the caret, inside its line", await value("body"))
    }
    await insert("end", "Shop name")
    expect((await value("end")) === "<p>Hi{{ shop.name }}</p>", "rich text never clicked into: the value goes at the end of the last line, not after it", await value("end"))
    await focusEnd("end")
    await page.keyboard.type(" rocks", { delay: 15 })
    await sleep(120)
    expect(/^<p>Hi\{\{ shop\.name \}\} rocks<\/p>$/.test(nb(await value("end"))), "  and the caret gets past the pill at the end of the line to type", await value("end"))

    /* 9. Copy carries the placeholder; braces pasted come back as a pill. */
    const copied = await page.$eval(`${F("line")} [data-chip-input]`, (el) => {
      el.focus()
      const r = document.createRange()
      r.selectNodeContents(el)
      getSelection().removeAllRanges()
      getSelection().addRange(r)
      const dt = new DataTransfer()
      el.dispatchEvent(new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }))
      return dt.getData("text/plain")
    })
    expect(copied === "Hi {{ shop.name }} there", "copy out of a box with a pill carries the placeholder", copied)
    await focusEnd("heading")
    await page.$eval(`${F("heading")} [contenteditable="true"]`, (el, text) => {
      const dt = new DataTransfer()
      dt.setData("text/plain", text)
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
    }, " by {{ creator.name }}")
    await sleep(120)
    expect(/\{\{ shop\.name \}\} now by \{\{ creator\.name \}\}$/.test(nb(await value("heading"))) && (await pills("heading")).length === 2, "  pasted into a heading, it comes back as a pill", await value("heading"))

    /* 10. A screen reader hears what it is. */
    const aria = await page.$eval(`${F("line")} [data-value]`, (el) => ({ role: el.getAttribute("role"), label: el.getAttribute("aria-label") }))
    expect(aria.role === "button" && aria.label === "Shop name, shop data", "a pill names itself: Shop name, shop data", aria)

    /* 11. Never sideways; taller instead. */
    const LONG = " Donaudampfschifffahrtsgesellschaftskapitänsmützenabzeichenhersteller https://www.example-store-with-a-very-long-name.com/collections/limited-edition"
    const before = await page.$eval(`${F("line")} [data-chip-input]`, (el) => el.getBoundingClientRect().height)
    await focusEnd("line")
    await page.keyboard.type(LONG, { delay: 0 })
    await focusEnd("heading")
    await page.keyboard.type(LONG, { delay: 0 })
    await focusEnd("story")
    await page.keyboard.type(LONG, { delay: 0 })
    await focusEnd("body")
    await page.keyboard.type(LONG, { delay: 0 })
    await sleep(200)
    const wide = await page.evaluate(() =>
      [...document.querySelectorAll('#fields [contenteditable="true"], #fields textarea')].map((el) => ({
        f: el.closest("[data-probe-field]").dataset.probeField,
        sw: el.scrollWidth,
        cw: el.clientWidth,
        h: Math.round(el.getBoundingClientRect().height),
      })),
    )
    expect(wide.every((w) => w.sw <= w.cw), "no box scrolls sideways (scrollWidth vs clientWidth)", wide.map((w) => `${w.f} ${w.sw}/${w.cw}`).join(", "))
    const after = await page.$eval(`${F("line")} [data-chip-input]`, (el) => el.getBoundingClientRect().height)
    expect(after > before + 20, "  a long one line value grows taller instead", `${Math.round(before)} -> ${Math.round(after)}px`)
    const panelWide = await page.evaluate(() => {
      const p = document.querySelector("[data-wb-sidebar-scroll], [data-sheet-scroll]")
      return { sw: p.scrollWidth, cw: p.clientWidth }
    })
    expect(panelWide.sw <= panelWide.cw, "  the panel itself never scrolls sideways", panelWide)

    expect(errors.length === 0, "no page errors", errors.slice(0, 3))
    if (shots) await page.screenshot({ path: join(shots, `pills-${vp.phone ? 390 : 1440}.png`) })
    await page.close()
    await browser.close()
    browser = null
  }
} finally {
  if (browser) await browser.close()
  server.close()
}

/** A pick from a list that is already open. */
async function insertFromOpen(page, vp, id, label) {
  const opt = await page.evaluateHandle((id, label) => [...document.querySelectorAll(`[data-probe-field="${id}"] [role="option"]`)].find((b) => b.querySelector("span")?.textContent === label), id, label)
  await opt.evaluate((b) => b.scrollIntoView({ block: "center" }))
  const box = await opt.boundingBox()
  if (vp.phone) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await sleep(200)
}

console.log(`\n${passed} passed, ${broken} failed`)
process.exit(broken ? 1 : 0)
