/**
 * ===========================================================================
 *  THE LINK FIELD: AN ADDRESS YOU TYPE, OR A PAGE YOU PICK
 * ===========================================================================
 * "A custom address should not exist in the list, because I can edit the
 * link directly." So the field is the address, and the list under it is the
 * site's pages and products and nothing else. This drives it with a real
 * keyboard, a real mouse and a real thumb and reads back what was saved:
 *
 *   desktop  typing an address saves its tidy form; javascript: is refused
 *            and the old link kept; the chevron opens pages and products only;
 *            arrows and Enter pick; typing narrows; Escape closes; a picked
 *            page reads as its name at rest and as its path while edited.
 *   phone    the chevron opens the list with nothing focused (no keyboard);
 *            every row is on screen and on top at its centre; a tap picks.
 *
 *   node scripts/check-link-field.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { probeCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const css = await probeCss(root)
const out = mkdtempSync(join(tmpdir(), "storelib-linkfield-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-link-field.tsx"),
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
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shots = process.env.SHOTS_DIR

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
try {
  /* ── Desktop ─────────────────────────────────────────────────────────── */
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    await page.goto(`${origin}/?value=`, { waitUntil: "load" })
    await page.waitForSelector('input[role="combobox"]')
    const input = 'input[role="combobox"]'
    const state = () =>
      page.evaluate(() => {
        const el = document.querySelector('input[role="combobox"]')
        const rows = [...document.querySelectorAll('[role="option"]')].map((r) => r.textContent.trim())
        const panel = document.querySelector(".wb-field-panel")
        return {
          saved: window.__value,
          changes: window.__changes,
          shown: el.value,
          focused: document.activeElement === el,
          open: !!panel,
          rows,
          panelText: panel ? panel.textContent : "",
          error: document.querySelector('[data-link-picker] [role="alert"]')?.textContent ?? null,
          active: document.querySelector('[role="option"][aria-selected="true"]')?.textContent?.trim() ?? null,
        }
      })

    console.log("\ndesktop: typing an address")
    await page.click(input)
    await sleep(100)
    let s = await state()
    expect(s.open && s.rows.length === 7, "putting the cursor in the field opens the pages and products", s.rows)
    expect(!/address|custom|web address|url/i.test(s.panelText), "and nothing in the list is a custom address", s.panelText.slice(0, 120))
    await page.keyboard.type("shop.example.com/sale")
    s = await state()
    expect(!s.open, "an address matches no page, so the list steps aside", s.rows)
    await page.keyboard.press("Enter")
    await sleep(50)
    s = await state()
    expect(s.saved === "https://shop.example.com/sale", "Enter saves it with https:// added", s.saved)

    await page.click(input)
    await page.keyboard.down("Control")
    await page.keyboard.press("KeyA")
    await page.keyboard.up("Control")
    await page.keyboard.type("javascript:alert(1)")
    await page.keyboard.press("Tab")
    await sleep(80)
    s = await state()
    expect(s.saved === "https://shop.example.com/sale" && /web page, an email address or a phone number/.test(s.error ?? ""), "javascript: is refused, with a reason, and the old link kept", { saved: s.saved, error: s.error })
    expect(s.shown === "https://shop.example.com/sale", "and the field shows the link that is still saved", s.shown)

    await page.click(input)
    await page.keyboard.down("Control")
    await page.keyboard.press("KeyA")
    await page.keyboard.up("Control")
    await page.keyboard.type("hello@shop.com")
    await page.keyboard.press("Tab")
    await sleep(80)
    s = await state()
    expect(s.saved === "mailto:hello@shop.com" && !s.error, "an email typed as it is spoken is saved as mailto:", s.saved)

    console.log("\ndesktop: picking")
    await page.click('button[aria-label="Pages and products"]')
    await sleep(100)
    s = await state()
    expect(s.open && s.focused, "the chevron opens the list and puts the cursor in the field", { open: s.open, focused: s.focused })
    expect(s.rows.join(",") === "Home,Shop,About,Contact,Privacy Policy,A bottle,Geanta Guess reptila", "pages first, then products, by name", s.rows)
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowDown")
    s = await state()
    expect(s.active === "Shop", "arrows move through the list", s.active)
    await page.keyboard.press("Enter")
    await sleep(50)
    s = await state()
    expect(s.saved === "/products" && !s.open, "Enter picks Shop, stored as /products as before, and closes the list", { saved: s.saved, open: s.open })
    await page.keyboard.press("Tab")
    await sleep(50)
    s = await state()
    expect(s.shown === "Shop", "at rest the field reads as the page's name", s.shown)
    if (shots) await page.screenshot({ path: join(shots, "link-field-rest.png"), clip: { x: 0, y: 0, width: 340, height: 120 } })

    await page.click(input)
    await sleep(60)
    s = await state()
    expect(s.shown === "/products", "and as its path while the cursor is in it", s.shown)
    await page.keyboard.type("gea")
    await sleep(50)
    s = await state()
    expect(s.rows.length === 1 && s.rows[0] === "Geanta Guess reptila", "typing narrows the list", s.rows)
    if (shots) await page.screenshot({ path: join(shots, "link-field-search.png"), clip: { x: 0, y: 0, width: 340, height: 220 } })
    await page.keyboard.press("Enter")
    await sleep(50)
    s = await state()
    expect(s.saved === "/products/geanta-guess-reptila-2g7yyk", "and Enter on words picks what they match", s.saved)

    await page.click('button[aria-label="Pages and products"]')
    await sleep(80)
    if (shots) await page.screenshot({ path: join(shots, "link-field-open.png"), clip: { x: 0, y: 0, width: 340, height: 360 } })
    await page.keyboard.press("Escape")
    await sleep(50)
    s = await state()
    expect(!s.open && s.saved === "/products/geanta-guess-reptila-2g7yyk", "Escape closes the list and changes nothing", { open: s.open, saved: s.saved })

    await page.mouse.click(600, 600)
    await page.click('button[aria-label="Pages and products"]')
    await sleep(80)
    const about = await page.$('[role="option"]:nth-of-type(3)')
    const rows = await page.$$('[role="option"]')
    await rows[2].click()
    await sleep(50)
    s = await state()
    expect(s.saved === "/about" && !s.open, "a click on a row picks it", s.saved)
    void about
    await page.close()
  }

  /* ── An old link is shown as it is ───────────────────────────────────── */
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    await page.goto(`${origin}/?value=${encodeURIComponent("/shop")}`, { waitUntil: "load" })
    await page.waitForSelector('input[role="combobox"]')
    const shown = await page.evaluate(() => document.querySelector('input[role="combobox"]').value)
    console.log("\na link saved before this change")
    expect(shown === "/shop", "an address that is no page on the list is shown as it is, and left alone", shown)
    await page.close()
  }

  /* ── Phone ───────────────────────────────────────────────────────────── */
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await page.goto(`${origin}/?value=`, { waitUntil: "load" })
    await page.waitForSelector('input[role="combobox"]')
    await sleep(600)
    console.log("\nphone, inside the editor's sheet")
    await page.evaluate(() => document.querySelector('input[role="combobox"]').scrollIntoView({ block: "center" }))
    await sleep(200)
    const chevron = await page.$('button[aria-label="Pages and products"]')
    const box = await chevron.boundingBox()
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    await sleep(700)
    const r = await page.evaluate(() => {
      const kill = document.createElement("style")
      kill.textContent = "* { transition: none !important; animation: none !important; scroll-behavior: auto !important }"
      document.head.append(kill)
      const rows = [...document.querySelectorAll('[role="option"]')]
      return {
        focused: document.activeElement ? document.activeElement.tagName.toLowerCase() : "none",
        rows: rows.map((row) => {
          const b = row.getBoundingClientRect()
          const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
          return { text: row.textContent.trim(), top: Math.round(b.top), bottom: Math.round(b.bottom), topmost: !!hit && (hit === row || row.contains(hit)) }
        }),
        h: innerHeight,
      }
    })
    expect(r.focused !== "input", "the chevron opens the list without raising the keyboard", r.focused)
    const visible = r.rows.slice(0, 4)
    expect(visible.length === 4 && visible.every((x) => x.top >= 0 && x.bottom <= r.h && x.topmost), "the first rows are on screen and on top where a thumb lands", visible)
    if (shots) await page.screenshot({ path: join(shots, "link-field-phone.png") })
    const row = await page.$$('[role="option"]')
    const rb = await row[1].boundingBox()
    await page.touchscreen.tap(rb.x + rb.width / 2, rb.y + rb.height / 2)
    await sleep(300)
    const after = await page.evaluate(() => ({ saved: window.__value, open: !!document.querySelector(".wb-field-panel"), shown: document.querySelector('input[role="combobox"]').value }))
    expect(after.saved === "/products" && !after.open && after.shown === "Shop", "a tap on Shop picks it, closes the list, and the field reads Shop", after)

    /* The field itself, tapped: the keyboard, and no list until something is typed. */
    await sleep(500)
    await page.evaluate(() => document.querySelector('input[role="combobox"]').scrollIntoView({ block: "center" }))
    await sleep(200)
    const inputBox = await (await page.$('input[role="combobox"]')).boundingBox()
    const tapAt = { x: inputBox.x + 60, y: inputBox.y + inputBox.height / 2 }
    const onTop = await page.evaluate((p) => {
      const hit = document.elementFromPoint(p.x, p.y)
      return hit ? hit.tagName.toLowerCase() + (hit.getAttribute("role") ? `[${hit.getAttribute("role")}]` : "") : "nothing"
    }, tapAt)
    await page.touchscreen.tap(tapAt.x, tapAt.y)
    await sleep(200)
    const typing = await page.evaluate(() => ({ focused: document.activeElement?.getAttribute("role") ?? document.activeElement?.tagName, open: !!document.querySelector(".wb-field-panel") }))
    typing.onTop = onTop
    expect(typing.focused === "combobox" && !typing.open, "tapping the field is for typing: the list waits until something is typed", typing)
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}

console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
