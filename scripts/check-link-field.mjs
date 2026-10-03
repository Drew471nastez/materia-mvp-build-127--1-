/**
 * ===========================================================================
 *  THE LINK FIELD: AN ADDRESS YOU TYPE, OR A PLACE YOU PICK
 * ===========================================================================
 * "A custom address should not exist in the list, because I can edit the
 * link directly." So the field is the address, and the list is the site's
 * own places. "Like Shopify's": a first list of kinds with a mark each, a
 * kind opening onto its own list with Back and how many, typing looking
 * through all of it, and a panel that hangs from the field, under it or over
 * it, and follows it through the sidebar's scroll.
 *
 * This drives it with a real keyboard, a real mouse and a real thumb, reads
 * back what was saved, and measures where the panel is. Scrollbars are left
 * ON (puppeteer hides them by default), because whether one takes width is
 * one of the things measured.
 *
 *   desktop  typing an address saves its tidy form; javascript: is refused
 *            and the old link kept; the first list is the kinds, in order,
 *            each with its mark, and fits without a scrollbar; a kind opens
 *            onto Back, "N results" and its rows, products with their
 *            pictures; a long list scrolls with a thumb that takes no width;
 *            Escape goes back and then closes; typing finds across kinds;
 *            arrows and Enter open and pick; the panel opens under the field
 *            and nothing in the sidebar moves; it comes in by opacity and a
 *            short drop; it follows the field as the sidebar scrolls and
 *            closes once the field has scrolled out; near the sidebar's foot
 *            it opens over the field.
 *   phone    the chevron opens the list in the sheet with nothing focused
 *            (no keyboard); every row is 44px, on screen and on top at its
 *            centre; a tap picks; a kind opens and Back comes back.
 *
 *   node scripts/check-link-field.mjs         (SHOTS_DIR=dir for screenshots)
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
/* A computer: the hover styles are under @media (hover: hover), which headless Chromium does not match. */
const css = (await probeCss(root)).replace(/@media \(hover: ?hover\)/g, "@media all")
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
const note = (what, got) => console.log(`  --    ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const r1 = (n) => Math.round(n * 10) / 10
const shots = process.env.SHOTS_DIR
/* In the viewport as it is: a capture beyond it resizes the page for a moment, and the field loses its cursor. */
const shot = async (page, name, clip) => {
  if (shots) await page.screenshot({ path: join(shots, name), clip, captureBeyondViewport: false })
}
const INPUT = 'input[role="combobox"]'
const CHEVRON = 'button[aria-label="Pages and products"]'
const TOP = ["Home", "Shop", "Products", "Pages", "Customer accounts", "Policies", "Search"]

/** Everything the probe asks of the field and its panel, in one read. */
const STATE = () => {
  const el = document.querySelector('input[role="combobox"]')
  const panel = document.querySelector(".wb-field-panel")
  const list = panel?.querySelector("[data-float-scroll]")
  const field = el.closest("[data-link-picker]").firstElementChild.getBoundingClientRect()
  const options = [...document.querySelectorAll('[role="option"]')]
  const label = (o) => (o.querySelector("span.truncate")?.textContent ?? o.textContent).trim()
  const pr = panel?.getBoundingClientRect()
  return {
    saved: window.__value,
    changes: window.__changes,
    shown: el.value,
    focused: document.activeElement === el,
    open: !!panel && panel.dataset.state !== "closed",
    present: !!panel,
    rows: options.map(label),
    marks: options.map((o) => {
      /* The 24px mark at the start of the row: a product's picture, or its kind's icon on a soft square. */
      const img = o.querySelector("img")
      const box = o.querySelector("span.rounded-md")
      const b = (img ?? box)?.getBoundingClientRect()
      return img ? `img ${Math.round(b.width)}` : box ? `icon ${Math.round(b.width)}` : "none"
    }),
    heights: options.map((o) => Math.round((o.firstElementChild?.getAttribute("role") ? o : o).getBoundingClientRect().height)),
    back: (() => {
      const o = options.find((x) => /^Back/.test(x.textContent.trim()))
      return o ? o.textContent.trim().replace(/^Back/, "").trim() : null
    })(),
    panelText: panel ? panel.textContent : "",
    error: document.querySelector('[data-link-picker] [role="alert"]')?.textContent ?? null,
    active: options.find((o) => o.getAttribute("aria-selected") === "true") ? label(options.find((o) => o.getAttribute("aria-selected") === "true")) : null,
    field: { top: field.top, bottom: field.bottom, left: field.left, width: field.width },
    panel: pr ? { top: pr.top, bottom: pr.bottom, left: pr.left, width: pr.width, height: pr.height, side: panel.dataset.side } : null,
    list: list ? { scrolls: list.scrollHeight > list.clientHeight + 1, bar: list.offsetWidth - list.clientWidth, height: list.clientHeight, full: list.scrollHeight } : null,
    thumb: (() => {
      const t = panel?.querySelector(".cp-overlay-thumb")
      const b = t?.getBoundingClientRect()
      return b && b.height > 0 ? { width: b.width, height: Math.round(b.height) } : null
    })(),
    after: document.getElementById("after")?.getBoundingClientRect().top ?? null,
  }
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"], ignoreDefaultArgs: ["--hide-scrollbars"] })
try {
  /* ── Desktop ─────────────────────────────────────────────────────────── */
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    await page.goto(`${origin}/?value=`, { waitUntil: "load" })
    await page.waitForSelector(INPUT)
    const state = () => page.evaluate(STATE)
    const selectAll = async () => {
      await page.keyboard.down("Control")
      await page.keyboard.press("KeyA")
      await page.keyboard.up("Control")
    }

    console.log("\ndesktop: the panel hangs from the field, and nothing moves")
    const before = await state()
    /* Every frame of the opening: opacity and transform only, and the field and the setting under it still. */
    await page.evaluate(() => {
      window.__frames = []
      const t0 = performance.now()
      const tick = () => {
        const p = document.querySelector(".wb-field-panel")
        if (p) {
          const cs = getComputedStyle(p)
          window.__frames.push({ t: Math.round(performance.now() - t0), opacity: Number(cs.opacity), transform: cs.transform, top: parseFloat(cs.top), after: document.getElementById("after").getBoundingClientRect().top })
        }
        if (performance.now() - t0 < 400) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.click(INPUT)
    await sleep(450)
    let s = await state()
    const frames = await page.evaluate(() => window.__frames)
    expect(s.open && s.rows.join(",") === TOP.join(","), "putting the cursor in the field opens the kinds of place, in order", s.rows)
    expect(s.marks.every((m) => m === "icon 24"), "each with its 24px mark", s.marks)
    expect(!/custom address|any address|web address|\burl\b/i.test(s.panelText), "and nothing in it is a custom address", s.panelText.slice(0, 120))
    expect(s.panel.side === "below" && Math.abs(s.panel.top - (s.field.bottom + 6)) < 0.6 && Math.abs(s.panel.left - s.field.left) < 0.6, "it opens 6px under the field, on the field's left edge", { panelTop: r1(s.panel.top), fieldBottom: r1(s.field.bottom), left: [r1(s.panel.left), r1(s.field.left)] })
    expect(Math.abs(s.panel.width - Math.max(260, s.field.width)) < 0.6, "as wide as the field", { panel: r1(s.panel.width), field: r1(s.field.width) })
    expect(s.after === before.after, "and the setting under the field has not moved", { before: before.after, after: s.after })
    expect(!s.list.scrolls && s.list.bar === 0, "the first list fits: nothing to scroll, no scrollbar", s.list)
    note("panel height, first list", r1(s.panel.height))
    const first = frames[0]
    const last = frames[frames.length - 1]
    expect(first && first.opacity < 0.9 && last.opacity === 1 && last.transform === "none", "it comes in by opacity and a short drop", { first, last: last && { t: last.t, opacity: last.opacity, transform: last.transform } })
    expect(frames.every((f) => f.after === before.after), "with nothing in the sidebar moving on any frame of it", [...new Set(frames.map((f) => f.after))])
    const tops = [...new Set(frames.map((f) => r1(f.top)))]
    note("the panel's top across the opening (the drop is a transform, so layout holds still)", tops)
    expect(tops.length === 1, "its box never moves while it comes in", tops)
    await shot(page, "link-field-top.png", { x: 0, y: 0, width: 360, height: 480 })

    console.log("\ndesktop: a kind opens onto its own list")
    const heights = []
    await page.evaluate(() => {
      window.__h = []
      const t0 = performance.now()
      const tick = () => {
        const p = document.querySelector(".wb-field-panel")
        if (p) window.__h.push(Math.round(p.getBoundingClientRect().height))
        if (performance.now() - t0 < 320) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    const productsRow = (await page.$$('[role="option"]'))[2]
    await productsRow.click()
    await sleep(380)
    heights.push(...(await page.evaluate(() => window.__h)))
    s = await state()
    expect(s.rows[0] === "Back" && s.back === "12 results", "Products: Back at the top, and how many on the right", { first: s.rows[0], count: s.back })
    expect(s.rows.length === 13 && s.rows[1] === "A bottle", "then the products, by name", s.rows.slice(0, 4))
    expect(s.marks.slice(1).filter((m) => m === "img 24").length === 11 && s.marks[3] === "icon 24", "each with its 24px picture, and the mark where it has none", s.marks.slice(0, 5))
    expect(s.list.scrolls && s.list.bar === 0, "twelve do not fit: it scrolls, and the scrollbar takes no width", s.list)
    expect(s.panel.height <= 360.5, "the panel stops at 360px", r1(s.panel.height))
    const steps = heights.filter((h, i) => i > 0 && h !== heights[i - 1]).length
    const jumps = heights.map((h, i) => (i ? Math.abs(h - heights[i - 1]) : 0))
    note("panel height across the change, a frame at a time", [...new Set(heights)])
    expect(steps >= 3 && Math.max(...jumps) < 60, "its height moves there over several frames rather than jumping", { steps, biggestStep: Math.max(...jumps) })
    await page.mouse.move(s.panel.left + 100, s.panel.top + 160)
    await page.mouse.wheel({ deltaY: 120 })
    await sleep(250)
    s = await state()
    expect(s.thumb && Math.abs(s.thumb.width - 6) < 0.5, "a 6px thumb is drawn over the list while it moves", s.thumb)
    await shot(page, "link-field-products.png", { x: 0, y: 0, width: 360, height: 520 })

    await page.keyboard.press("Escape")
    await sleep(250)
    s = await state()
    expect(s.open && s.rows.join(",") === TOP.join(","), "Escape goes back to the kinds", s.rows)
    const pagesRow = (await page.$$('[role="option"]'))[3]
    await pagesRow.click()
    await sleep(300)
    s = await state()
    expect(s.back === "3 results" && s.rows.slice(1).join(",") === "About,Contact,Lookbook" && !s.list.scrolls, "Pages: About, Contact and the creator's own, fitting", { count: s.back, rows: s.rows })
    await (await page.$$('[role="option"]'))[0].click()
    await sleep(250)
    s = await state()
    expect(s.rows.join(",") === TOP.join(","), "and Back comes back", s.rows)
    await (await page.$$('[role="option"]'))[4].click()
    await sleep(250)
    s = await state()
    expect(s.rows.slice(1).join(",") === "Account,Sign in,Wishlist", "Customer accounts: the visitor's own pages", s.rows)
    await (await page.$$('[role="option"]'))[0].click()
    await sleep(200)
    await (await page.$$('[role="option"]'))[5].click()
    await sleep(250)
    s = await state()
    expect(s.rows.slice(1).join(",") === "Refund Policy,Privacy Policy,Terms Of Service", "Policies: the three, in the footer's order", s.rows)
    await shot(page, "link-field-policies.png", { x: 0, y: 0, width: 360, height: 360 })
    await page.keyboard.press("Escape")
    await sleep(100)
    await page.keyboard.press("Escape")
    await sleep(250)
    s = await state()
    expect(!s.present && s.saved === "", "a second Escape closes it, and nothing was saved", { present: s.present, saved: s.saved })

    console.log("\ndesktop: typing an address")
    await page.click(INPUT)
    await page.keyboard.type("shop.example.com/sale")
    await sleep(200)
    s = await state()
    expect(!s.open, "an address matches no place, so the list steps aside", s.rows)
    await page.keyboard.press("Enter")
    await sleep(50)
    s = await state()
    expect(s.saved === "https://shop.example.com/sale", "Enter saves it with https:// added", s.saved)

    await page.click(INPUT)
    await selectAll()
    await page.keyboard.type("javascript:alert(1)")
    await page.keyboard.press("Tab")
    await sleep(80)
    s = await state()
    expect(s.saved === "https://shop.example.com/sale" && /web page, an email address or a phone number/.test(s.error ?? ""), "javascript: is refused, with a reason, and the old link kept", { saved: s.saved, error: s.error })
    expect(s.shown === "https://shop.example.com/sale", "and the field shows the link that is still saved", s.shown)

    await page.click(INPUT)
    await selectAll()
    await page.keyboard.type("hello@shop.com")
    await page.keyboard.press("Tab")
    await sleep(80)
    s = await state()
    expect(s.saved === "mailto:hello@shop.com" && !s.error, "an email typed as it is spoken is saved as mailto:", s.saved)

    console.log("\ndesktop: picking")
    await page.click(CHEVRON)
    await sleep(250)
    s = await state()
    expect(s.open && s.focused, "the chevron opens the list and puts the cursor in the field", { open: s.open, focused: s.focused })
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowDown")
    s = await state()
    expect(s.active === "Shop", "arrows move through the list", s.active)
    await page.keyboard.press("Enter")
    await sleep(250)
    s = await state()
    expect(s.saved === "/products" && !s.open, "Enter on Shop picks it, stored as /products as before, and closes the list", { saved: s.saved, open: s.open })
    await page.keyboard.press("Tab")
    await sleep(50)
    s = await state()
    expect(s.shown === "Shop", "at rest the field reads as the page's name", s.shown)
    await shot(page, "link-field-rest.png", { x: 0, y: 0, width: 360, height: 200 })

    await page.click(INPUT)
    await sleep(80)
    s = await state()
    expect(s.shown === "/products", "and as its path while the cursor is in it", s.shown)
    await page.keyboard.type("polic")
    await sleep(250)
    s = await state()
    expect(s.rows.join(",") === "Refund Policy,Privacy Policy,Terms Of Service" && !s.back, "typing looks through every kind at once, the kind's own name included", s.rows)
    await selectAll()
    await page.keyboard.type("gea")
    await sleep(250)
    s = await state()
    expect(s.rows.length === 1 && s.rows[0] === "Geanta Guess reptila" && s.marks[0] === "img 24", "a product found by typing, with its picture", { rows: s.rows, marks: s.marks })
    await shot(page, "link-field-search.png", { x: 0, y: 0, width: 360, height: 260 })
    await page.keyboard.press("Enter")
    await sleep(250)
    s = await state()
    expect(s.saved === "/products/geanta-guess-reptila-2g7yyk", "and Enter on words picks what they match", s.saved)

    /* Into a kind and out of it, from the keyboard alone. */
    await page.keyboard.press("Escape")
    await page.click(CHEVRON)
    await sleep(250)
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await sleep(250)
    s = await state()
    expect(s.back === "12 results" && s.active === "A bottle", "Enter on Products opens it with its first product active", { back: s.back, active: s.active })
    await page.keyboard.press("Enter")
    await sleep(250)
    s = await state()
    expect(s.saved === "/products/a-bottle" && !s.open, "and Enter picks it", s.saved)

    await page.mouse.click(900, 600)
    await sleep(200)
    await page.click(CHEVRON)
    await sleep(250)
    await (await page.$$('[role="option"]'))[0].click()
    await sleep(250)
    s = await state()
    expect(s.saved === "/" && !s.open, "a click on Home picks it", s.saved)

    console.log("\ndesktop: it follows the field through the sidebar's scroll")
    await page.mouse.click(900, 600)
    await sleep(200)
    await page.click(CHEVRON)
    await sleep(300)
    const follow = []
    for (const dy of [60, 60, 60]) {
      await page.evaluate((d) => document.getElementById("sidebar").scrollBy(0, d), dy)
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())))
      const x = await state()
      follow.push({ gap: r1(x.panel.top - x.field.bottom), fieldBottom: r1(x.field.bottom), open: x.open })
    }
    expect(follow.every((f) => f.open && f.gap === 6), "scrolled 60px at a time, it stays 6px under the field, in the same frame", follow)
    await page.evaluate(() => document.getElementById("sidebar").scrollBy(0, 400))
    await sleep(300)
    s = await state()
    expect(!s.present && s.field.bottom < 0, "once the field has scrolled out of the sidebar, it closes", { present: s.present, fieldBottom: r1(s.field.bottom) })
    await page.close()
  }

  /* ── Near the foot of the sidebar, it opens over the field ───────────── */
  {
    console.log("\ndesktop: no room under the field")
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    await page.goto(`${origin}/?value=&at=bottom`, { waitUntil: "load" })
    await page.waitForSelector(INPUT)
    await page.evaluate(() => {
      const sb = document.getElementById("sidebar")
      sb.scrollTop = sb.scrollHeight
    })
    await sleep(100)
    await page.click(CHEVRON)
    await sleep(350)
    let s = await page.evaluate(STATE)
    const room = 800 - s.field.bottom
    expect(s.panel.side === "above" && Math.abs(s.panel.bottom - (s.field.top - 6)) < 0.6, "with less room below than the list needs, it opens 6px over the field", { room: r1(room), panelBottom: r1(s.panel.bottom), fieldTop: r1(s.field.top), side: s.panel.side })
    expect(s.panel.top >= 8, "and stays inside the window", r1(s.panel.top))
    await shot(page, "link-field-above.png", { x: 0, y: 360, width: 360, height: 440 })
    await (await page.$$('[role="option"]'))[2].click()
    await sleep(380)
    s = await page.evaluate(STATE)
    expect(s.panel.side === "above" && Math.abs(s.panel.bottom - (s.field.top - 6)) < 0.6, "a kind opened from there grows upward, its foot still on the field", { side: s.panel.side, panelBottom: r1(s.panel.bottom), fieldTop: r1(s.field.top) })
    await page.close()
  }

  /* ── An old link is shown as it is ───────────────────────────────────── */
  {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    await page.goto(`${origin}/?value=${encodeURIComponent("/shop")}`, { waitUntil: "load" })
    await page.waitForSelector(INPUT)
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
    await page.waitForSelector(INPUT)
    await sleep(600)
    console.log("\nphone, inside the editor's sheet")
    await page.evaluate(() => document.querySelector('input[role="combobox"]').scrollIntoView({ block: "center" }))
    await sleep(200)
    const tap = async (el) => {
      const b = await el.boundingBox()
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2)
    }
    await tap(await page.$(CHEVRON))
    await sleep(700)
    const read = () =>
      page.evaluate(() => {
        const rows = [...document.querySelectorAll('[role="option"]')]
        return {
          focused: document.activeElement ? document.activeElement.tagName.toLowerCase() : "none",
          inFlow: !!document.querySelector("[data-link-picker] .wb-field-panel"),
          rows: rows.map((row) => {
            const b = (row.firstElementChild?.getAttribute("class")?.includes("rounded-lg") ? row.firstElementChild : row).getBoundingClientRect()
            const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
            return { text: (row.querySelector("span.truncate")?.textContent ?? row.textContent).trim(), top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), topmost: !!hit && (hit === row || row.contains(hit)) }
          }),
          h: innerHeight,
        }
      })
    let r = await read()
    expect(r.focused !== "input", "the chevron opens the list without raising the keyboard", r.focused)
    expect(r.inFlow, "in the flow of the sheet, as before", r.inFlow)
    expect(r.rows.map((x) => x.text).join(",") === TOP.join(","), "the same kinds", r.rows.map((x) => x.text))
    expect(r.rows.every((x) => x.h >= 44), "every row 44px or more, for a thumb", [...new Set(r.rows.map((x) => x.h))])
    const visible = r.rows.slice(0, 4)
    expect(visible.every((x) => x.top >= 0 && x.bottom <= r.h && x.topmost), "the first rows are on screen and on top where a thumb lands", visible)
    await shot(page, "link-field-phone.png")
    await tap((await page.$$('[role="option"]'))[3])
    await sleep(350)
    r = await read()
    expect(r.rows[0]?.text === "Back" && r.rows.slice(1).map((x) => x.text).join(",") === "About,Contact,Lookbook", "a tap on Pages opens it", r.rows.map((x) => x.text))
    await tap((await page.$$('[role="option"]'))[0])
    await sleep(350)
    r = await read()
    expect(r.rows.map((x) => x.text).join(",") === TOP.join(","), "and a tap on Back comes back", r.rows.map((x) => x.text))
    await tap((await page.$$('[role="option"]'))[1])
    await sleep(300)
    const after = await page.evaluate(() => ({ saved: window.__value, open: !!document.querySelector(".wb-field-panel"), shown: document.querySelector('input[role="combobox"]').value }))
    expect(after.saved === "/products" && !after.open && after.shown === "Shop", "a tap on Shop picks it, closes the list, and the field reads Shop", after)

    /* The field itself, tapped: the keyboard, and no list until something is typed. */
    await sleep(500)
    await page.evaluate(() => document.querySelector('input[role="combobox"]').scrollIntoView({ block: "center" }))
    await sleep(200)
    const inputBox = await (await page.$(INPUT)).boundingBox()
    await page.touchscreen.tap(inputBox.x + 60, inputBox.y + inputBox.height / 2)
    await sleep(200)
    const typing = await page.evaluate(() => ({ focused: document.activeElement?.getAttribute("role") ?? document.activeElement?.tagName, open: !!document.querySelector(".wb-field-panel") }))
    expect(typing.focused === "combobox" && !typing.open, "tapping the field is for typing: the list waits until something is typed", typing)
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}

console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
