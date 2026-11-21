/**
 * ===========================================================================
 *  "ON HOVER" ON EVERY BUTTON, AND A FORM'S DROPDOWN IN THE PAGE'S LOOK (round 24)
 * ===========================================================================
 * The owner: Design › Buttons › On hover (None, Lift, Bigger, Glow, Fill,
 * Fill and lift, Underline) "does nothing" in the editor's phone, in Preview
 * and live; and a form's dropdown ("Cum ai prefera să lucrăm?") opens the
 * system's grey menu over a dark sheet. This draws the real PublicOnePage and
 * the real LivePreviewFrame (scripts/render-onepage-hover-select.tsx) and
 * measures:
 *
 *   hover     every hover choice on a dark and a light page, on a link, a link
 *             in a group, a link in a carousel, a product card's button in a
 *             carousel and on its own, a picture-less sheet's main button and a
 *             form's Send: the computed style under the pointer against rest
 *             (rise, size, layers, words, the underline) and the pixels. None
 *             changes nothing. 180 to 250ms, transform, opacity and colour only.
 *   keyboard  a button reached with Tab plays the same answer.
 *   touch     a device that cannot hover gets nothing on a pointer move.
 *   reduced   no rise and no growth; colour still changes.
 *   preview   the editor's frame follows the choice as it changes, no reload.
 *   select    the dropdown, at 390 and 1280, dark and light: a combobox and a
 *             listbox in the sheet's colours, 44px rows, 16px words on a
 *             phone, a check on the chosen row, inside the sheet (flipped
 *             above when there is no room under it), arrows, Enter, Escape
 *             (the sheet stays), type-ahead, a tap elsewhere closes it, the
 *             required check, and the answer sent as the option's id.
 *             Screenshots go to SHOTS (default: a folder beside the checkout).
 *
 *   CHROMIUM=/opt/pw-browsers/chromium PROBE_CSS=source node scripts/check-onepage-hover-select.mjs
 *   ONLY=hover,preview,select   REPORT=1 prints without failing
 */
import puppeteer from "puppeteer-core"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const root = process.cwd()
const chromium = process.env.CHROMIUM || ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find((p) => existsSync(p))
const ONLY = (process.env.ONLY || "hover,keyboard,touch,reduced,preview,select").split(",")
const SHOTS = process.env.SHOTS || join(root, ".hover-select-shots")
mkdirSync(SHOTS, { recursive: true })
const report = !!process.env.REPORT
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, message) => {
  if (!ok) failures.push(message)
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`)
}

const FORM_ID = "6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f"
const FORM = {
  title: "Get in touch", description: "", mode: "form", layout: "single", button_text: "Send", marketing_opt_in: false,
  consent_text: "I agree that my answers and contact details may be used to respond to this request.",
  fields: [
    { id: "name", type: "name", label: "Cum te numești?", required: true, placeholder: "First and last name" },
    { id: "email", type: "email", label: "Care este adresa ta de email?", required: true, placeholder: "you@example.com" },
    { id: "how", type: "dropdown", label: "Cum ai prefera să lucrăm?", required: true, options: [
      { id: "online", label: "Antrenamente online" }, { id: "sala", label: "Antrenamente personale 1:1" }, { id: "help", label: "Am nevoie de o recomandare" },
    ] },
  ],
  completion: { kind: "message", message: "Mulțumesc!" },
}
const HOVERS = ["none", "lift", "zoom", "glow", "fill", "pop", "underline"]
const MOUSE = "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"

const { base, server } = await serveEditorProbe({ root, entry: "scripts/render-onepage-hover-select.tsx" })
const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-gpu", MOUSE] })
/* A phone: no hover, a coarse pointer (what headless Chromium is without the settings above). */
const touchBrowser = ONLY.includes("touch") ? await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-gpu"] }) : null

async function open(path, { width = 1280, height = 900, mobile = false, b = browser, submits = [] } = {}) {
  const page = await b.newPage()
  page.on("pageerror", (e) => console.log("   pageerror", String(e).slice(0, 200)))
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile })
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = new URL(r.url())
    const json = (body, status = 200) => r.respond({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) }).catch(() => {})
    const m = u.pathname.match(/^\/api\/forms\/([^/]+)\/(public|submit)$/)
    if (m && r.method() === "OPTIONS") return void r.respond({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "Content-Type", "access-control-allow-methods": "GET, POST, OPTIONS" } }).catch(() => {})
    if (m && m[2] === "public") return void json({ form: { id: FORM_ID, revision: 2, definition: FORM } })
    if (m && m[2] === "submit") {
      submits.push(JSON.parse(r.postData() || "{}"))
      return void json({ ok: true, message: FORM.completion.message, href: null, action_type: null }, 201)
    }
    if (u.pathname === "/api/forms") return void json({ forms: [{ id: FORM_ID, title: "Get in touch", status: "published", revision: 2, draft: FORM, published: FORM, updated_at: "2026-11-19T10:00:00Z", integration_settings: {} }] })
    if (u.hostname !== "127.0.0.1") return void r.respond({ status: 200, contentType: "text/html", body: "<!doctype html><body></body>" }).catch(() => {})
    void r.continue()
  })
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" })
  return page
}

/** What a hover can change, read off the element. */
const LOOK = (e) => {
  const s = getComputedStyle(e)
  const b = getComputedStyle(e, "::before")
  const a = getComputedStyle(e, "::after")
  const label = e.querySelector(".op-label")
  const title = e.querySelector("[data-block-title]")
  const words = !label && title ? getComputedStyle(title) : s
  return {
    hover: e.getAttribute("data-hover"),
    translate: s.translate,
    scale: s.scale,
    color: s.color,
    before: b.opacity,
    after: a.opacity,
    line: label ? getComputedStyle(label, "::after").scale : "n/a",
    deco: words.textDecorationColor,
    duration: s.transitionDuration,
    props: s.transitionProperty,
  }
}

/** What each choice must do, from rest to pointed at. */
function expected(kind, rest, on) {
  const rose = on.translate !== rest.translate && /-3px/.test(on.translate)
  const grew = on.scale !== rest.scale && on.scale !== "none"
  const lit = on.before === "1" && rest.before === "0"
  const filled = (on.after === "1" || on.before === "1") && on.color !== rest.color
  const underlined = (on.line !== rest.line && on.line !== "n/a") || on.deco !== rest.deco
  switch (kind) {
    case "none": return JSON.stringify({ ...on, duration: 0 }) === JSON.stringify({ ...rest, duration: 0 })
    case "lift": return rose && lit
    case "zoom": return grew && !rose
    case "glow": return lit && !rose && !grew
    case "fill": return filled && !rose
    case "pop": return filled && rose
    case "underline": return underlined && !rose && !grew
  }
}

const TARGETS = [
  ["a link", "[data-op-block=top] [data-hover]"],
  ["a link in a group", "[data-op-block=g-list] [data-hover]"],
  ["a link in a carousel", "[data-op-block=g-row] [data-hover]"],
  ["a product card's button in a carousel", "[data-op-block=g-products] [data-product-cta]"],
  ["a product card's button", "[data-op-block=product-3] [data-product-cta]"],
]

/**
 * Rest against pointed at, for the element `sel` finds (read again at every step: a block can be drawn again as it
 * scrolls in). The pointer is moved by coordinates, in `frameOffset` for an element inside a frame.
 */
async function measure(page, wanted, { pixels = true, ctx = page, frameOffset = { x: 0, y: 0 } } = {}) {
  /* The live page draws a phone and a computer layout and hides one, and a block can be drawn again as it scrolls in: the first drawn match, found afresh at every step. */
  const on = (fn) => ctx.evaluate((w, src) => {
    const el = [...document.querySelectorAll(w)].find((e) => e.getClientRects().length > 0)
    return el ? new Function("return " + src)()(el) : null
  }, wanted, fn.toString())
  await on((e) => e.scrollIntoView({ block: "center", inline: "nearest" }))
  await page.mouse.move(2, 2)
  await sleep(350)
  const r = await on((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height } })
  const box = { x: r.x + frameOffset.x, y: r.y + frameOffset.y, width: r.width, height: r.height }
  /* A clip is in the document's coordinates; captured as it is on screen, so the page is not scrolled or laid out again under the pointer. */
  const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }))
  const clip = { x: Math.max(0, box.x - 12) + scroll.x, y: Math.max(0, box.y - 12) + scroll.y, width: box.width + 24, height: box.height + 24 }
  const shot = () => page.screenshot({ clip, captureBeyondViewport: false })
  const rest = await on(LOOK)
  const restPx = pixels ? await shot() : null
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 2 })
  await sleep(380)
  const hovered = await on(LOOK)
  const onPx = pixels ? await shot() : null
  await page.mouse.move(2, 2)
  return { rest, on: hovered, changed: pixels ? !restPx.equals(onPx) : null, restPx, onPx }
}

try {
  /* ── hover: every choice, every kind of button, dark and light ───────── */
  if (ONLY.includes("hover")) {
    for (const theme of ["dark", "light"]) {
      console.log(`\n── hover, ${theme} page`)
      for (const kind of HOVERS) {
        const page = await open(`/app?live&theme=${theme}&hover=${kind}`)
        await page.waitForSelector("[data-op-block=top] [data-hover]")
        await sleep(600)
        for (const [name, sel] of TARGETS) {
          if (!(await page.$(sel))) { check(false, `${theme} ${kind}: ${name} is drawn (${sel})`); continue }
          const { rest, on, changed, restPx, onPx } = await measure(page, sel)
          const ok = expected(kind, rest, on) && (kind === "none" ? !changed : changed) && rest.hover === kind
          if (name === "a link" || !ok) {
            const slug = `${theme}-${kind}-${name.replace(/\W+/g, "-")}`
            writeFileSync(join(SHOTS, `hover-${slug}-rest.png`), restPx)
            writeFileSync(join(SHOTS, `hover-${slug}-on.png`), onPx)
          }
          check(ok, `${theme} ${kind.padEnd(9)} ${name}: ${kind === "none" ? "nothing changes" : "it does what it says"}${ok ? "" : ` (rest ${JSON.stringify(rest)} hover ${JSON.stringify(on)} pixels ${changed})`}`)
          if (kind === "lift" && name === "a link") {
            const ms = parseFloat(rest.duration) * 1000
            check(ms >= 180 && ms <= 250 && /translate/.test(rest.props) && !/\ball\b|width|height|margin|top/.test(rest.props), `${theme}: a 180 to 250ms transition of transform, opacity and colour only (${rest.duration}, ${rest.props})`)
          }
        }
        /* The sheets: a map's sheet (its foot bar's Open in Maps) and the form's Send. */
        await page.$eval("[data-op-block=map] [data-block-sheet-trigger]", (a) => a.click())
        const cta = await page.waitForSelector("[data-block-sheet-panel] [data-block-sheet-cta]", { timeout: 5000 }).catch(() => null)
        await sleep(500)
        if (cta) {
          const { rest, on, changed } = await measure(page, "[data-block-sheet-panel] [data-block-sheet-cta]")
          const ok = expected(kind, rest, on) && (kind === "none" ? !changed : changed)
          check(ok, `${theme} ${kind.padEnd(9)} the sheet's main button${ok ? "" : ` (rest ${JSON.stringify(rest)} hover ${JSON.stringify(on)})`}`)
        } else check(false, `${theme} ${kind}: the map's sheet shows Open in Maps`)
        await page.keyboard.press("Escape")
        await sleep(500)
        await page.$eval("[data-op-block=form] a, [data-op-block=form] button", (a) => a.click())
        const send = await page.waitForSelector("[data-block-sheet-panel] [data-native-form] button[type=submit]", { timeout: 5000 }).catch(() => null)
        await sleep(500)
        if (send) {
          const { rest, on, changed } = await measure(page, "[data-block-sheet-panel] [data-native-form] button[type=submit]")
          const ok = expected(kind, rest, on) && (kind === "none" ? !changed : changed)
          check(ok, `${theme} ${kind.padEnd(9)} the form's Send${ok ? "" : ` (rest ${JSON.stringify(rest)} hover ${JSON.stringify(on)})`}`)
        } else check(false, `${theme} ${kind}: the form's sheet shows Send`)
        await page.close()
      }
    }
  }

  /* ── keyboard: Tab reaches a button, which plays the same answer ─────── */
  if (ONLY.includes("keyboard")) {
    console.log("\n── keyboard")
    for (const kind of ["lift", "fill", "underline"]) {
      const page = await open(`/app?live&theme=dark&hover=${kind}`)
      await page.waitForSelector("[data-op-block=top] [data-hover]")
      await sleep(500)
      const el = await page.$("[data-op-block=top] [data-hover]")
      const rest = await el.evaluate(LOOK)
      let reached = false
      for (let i = 0; i < 30 && !reached; i++) {
        await page.keyboard.press("Tab")
        reached = await page.evaluate(() => !!document.activeElement?.closest("[data-op-block=top]"))
      }
      await sleep(350)
      const on = await el.evaluate(LOOK)
      check(reached && expected(kind, rest, on), `Tab to a link plays ${kind}${reached ? "" : " (never reached)"} (${JSON.stringify({ translate: on.translate, before: on.before, after: on.after, line: on.line })})`)
      await page.close()
    }
  }

  /* ── touch: no hover on a device that cannot hover ─────────────────── */
  if (ONLY.includes("touch")) {
    console.log("\n── touch")
    const page = await open(`/app?live&theme=dark&hover=lift`, { b: touchBrowser, width: 390, height: 844 })
    await page.waitForSelector("[data-op-block=top] [data-hover]")
    await sleep(500)
    const can = await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches)
    const { rest, on } = await measure(page, "[data-op-block=top] [data-hover]", { pixels: false })
    check(!can && rest.translate === on.translate && rest.before === on.before, `a device that cannot hover keeps the button as it is under a pointer (${on.translate}, shadow ${on.before})`)
    await page.close()
  }

  /* ── reduced motion: colour, no movement ───────────────────────────── */
  if (ONLY.includes("reduced")) {
    console.log("\n── reduced motion")
    for (const kind of ["lift", "zoom", "pop"]) {
      const page = await open(`/app?live&theme=light&hover=${kind}`)
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
      await page.waitForSelector("[data-op-block=top] [data-hover]")
      await sleep(500)
      const { rest, on } = await measure(page, "[data-op-block=top] [data-hover]", { pixels: false })
      const still = on.translate === "none" && on.scale === "none"
      const colour = kind === "zoom" ? true : on.before === "1" || on.color !== rest.color
      check(still && colour, `reduced motion, ${kind}: no rise or growth, colour and shadow only (${on.translate} ${on.scale}, shadow ${on.before}, ${on.color})`)
      await page.close()
    }
  }

  /* ── preview: the editor's frame follows the choice ───────────────────── */
  if (ONLY.includes("preview")) {
    console.log("\n── preview")
    const page = await open(`/app?host&theme=dark&hover=lift`)
    await page.waitForFunction(() => window.__drawn === true, { timeout: 20000 })
    const frame = page.frames().find((f) => f.url().includes("/onepage-preview"))
    check(!!frame, "the editor's frame is drawn")
    for (const kind of ["none", "zoom", "glow", "fill", "pop", "underline", "lift"]) {
      await page.evaluate((k) => window.__hover(k), kind)
      const t0 = Date.now()
      let attrs = ""
      while (Date.now() - t0 < 2000) {
        attrs = await frame.evaluate(() => ["top", "g-list", "g-row"].map((id) => document.querySelector(`[data-op-block=${id}] [data-hover]`)?.getAttribute("data-hover")).join(","))
        if (attrs === [kind, kind, kind].join(",")) break
        await sleep(30)
      }
      const offset = await page.$eval("iframe", (f) => { const b = f.getBoundingClientRect(); return { x: b.x + f.clientLeft, y: b.y + f.clientTop } })
      const { rest, on } = await measure(page, "[data-op-block=top] [data-hover]", { pixels: false, ctx: frame, frameOffset: offset })
      check(attrs === [kind, kind, kind].join(",") && expected(kind, rest, on), `the frame plays ${kind} within ${Date.now() - t0}ms of the change, a group's and a carousel's links too (${attrs})`)
    }
    await page.close()
  }

  /* ── select: the dropdown ─────────────────────────────────────────── */
  if (ONLY.includes("select")) {
    for (const theme of ["dark", "light"]) {
      for (const [width, height, mobile] of [[390, 844, true], [1280, 900, false]]) {
        console.log(`\n── select, ${theme}, ${width}`)
        const submits = []
        const page = await open(`/app?live&theme=${theme}&hover=lift`, { width, height, mobile, submits })
        await page.waitForSelector("[data-op-block=form]")
        await page.$eval("[data-op-block=form] a, [data-op-block=form] button", (a) => a.click())
        const box = await page.waitForSelector("[data-block-sheet-panel] [data-question=how] [role=combobox]", { timeout: 5000 })
        await sleep(500)
        const tag = `${theme}-${width}`
        check(!(await page.$("[data-block-sheet-panel] select")), `${tag}: no system select in the form`)
        const closed = await box.evaluate((b) => ({ expanded: b.getAttribute("aria-expanded"), popup: b.getAttribute("aria-haspopup"), text: b.textContent.trim(), font: getComputedStyle(b).fontSize, h: b.getBoundingClientRect().height, bg: getComputedStyle(b).backgroundColor, radius: getComputedStyle(b).borderRadius, family: getComputedStyle(b).fontFamily, required: b.getAttribute("aria-required") }))
        const nameInput = await page.$eval("[data-block-sheet-panel] [data-question=name] input", (i) => ({ bg: getComputedStyle(i).backgroundColor, radius: getComputedStyle(i).borderRadius, family: getComputedStyle(i).fontFamily }))
        check(closed.expanded === "false" && closed.popup === "listbox" && closed.text === "Choose…" && closed.required === "true", `${tag}: a closed combobox says Choose… and is required (${JSON.stringify(closed.text)})`)
        check(closed.bg === nameInput.bg && closed.radius === nameInput.radius && closed.family === nameInput.family, `${tag}: the field is the other fields' fill, corners and typeface (${closed.bg} ${closed.radius})`)
        check(closed.font === (width < 640 ? "16px" : "15px") && closed.h >= 44, `${tag}: ${closed.font} words (no iOS zoom on a phone) and ${closed.h}px tall`)
        await page.screenshot({ path: join(SHOTS, `select-${tag}-closed.png`) })

        /* The required check: Send with nothing chosen names the question. */
        await page.type("[data-block-sheet-panel] [data-question=name] input", "Ana Pop")
        await page.type("[data-block-sheet-panel] [data-question=email] input", "ana@example.ro")
        await page.$eval("[data-block-sheet-panel] [data-native-form] label input[type=checkbox]", (c) => c.click())
        await page.$eval("[data-block-sheet-panel] [data-native-form] button[type=submit]", (b) => b.click())
        await sleep(250)
        const error = await page.evaluate(() => document.querySelector("[data-block-sheet-panel] [role=alert]")?.textContent || "")
        check(/Cum ai prefera/.test(error) && submits.length === 0, `${tag}: Send with no choice sends nothing and names the question ("${error}")`)

        /* Open with a tap or a click. */
        await box.click()
        await sleep(260)
        const opened = await page.evaluate(() => {
          const b = document.querySelector("[data-block-sheet-panel] [data-question=how] [role=combobox]")
          const l = document.getElementById(b.getAttribute("aria-controls"))
          const panel = document.querySelector("[data-block-sheet-panel]").getBoundingClientRect()
          const r = l?.getBoundingClientRect()
          const rows = l ? [...l.querySelectorAll("[role=option]")] : []
          const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255 }
          return {
            expanded: b.getAttribute("aria-expanded"), role: l?.getAttribute("role"), rows: rows.length,
            minRow: Math.min(...rows.map((o) => o.getBoundingClientRect().height)),
            font: l ? getComputedStyle(l).fontSize : null,
            inside: r ? r.top >= panel.top - 0.5 && r.bottom <= panel.bottom + 0.5 && r.left >= panel.left - 0.5 && r.right <= panel.right + 0.5 : false,
            place: l?.getAttribute("data-form-select-list"),
            animation: l ? `${getComputedStyle(l).animationName} ${getComputedStyle(l).animationDuration}` : null,
            ink: l ? lum(getComputedStyle(l).color) : null,
            ground: l ? getComputedStyle(l).backgroundImage + " / " + getComputedStyle(l).backgroundColor : null,
            sheetDark: lum(getComputedStyle(document.querySelector("[data-block-sheet-panel]")).color) > 0.5,
          }
        })
        check(opened.expanded === "true" && opened.role === "listbox" && opened.rows === 3, `${tag}: a press opens a listbox of the three options`)
        check(opened.minRow >= 44, `${tag}: every row is at least 44px (${opened.minRow}px)`)
        check(opened.font === (width < 640 ? "16px" : "15px"), `${tag}: the rows' words are ${opened.font}`)
        check(opened.inside, `${tag}: the list stays inside the sheet (${opened.place})`)
        check(/enter/.test(opened.animation) && /0\.16s/.test(opened.animation), `${tag}: it comes in over 160ms (${opened.animation})`)
        check(opened.sheetDark === (theme === "dark") && (theme === "dark" ? opened.ink > 0.6 : opened.ink < 0.4), `${tag}: the list is the sheet's own ${theme} look (words luminance ${opened.ink?.toFixed(2)})`)
        await page.screenshot({ path: join(SHOTS, `select-${tag}-open.png`) })

        /* A tap elsewhere closes it, and the sheet stays. */
        await page.mouse.click(width / 2, (await page.$eval("[data-block-sheet-panel] h2, [data-block-sheet-panel] [data-native-form] header", (h) => h.getBoundingClientRect().top + 4)))
        await sleep(250)
        check(await box.evaluate((b) => b.getAttribute("aria-expanded") === "false" && !document.getElementById(b.getAttribute("aria-controls"))) && !!(await page.$("[data-block-sheet-panel]")), `${tag}: a tap elsewhere closes the list, not the sheet`)

        /* The keyboard. */
        await box.focus()
        await page.keyboard.press("ArrowDown")
        await sleep(200)
        const k1 = await box.evaluate((b) => ({ expanded: b.getAttribute("aria-expanded"), active: document.getElementById(b.getAttribute("aria-activedescendant") || "")?.getAttribute("data-option") }))
        await page.keyboard.press("ArrowDown")
        const k2 = await box.evaluate((b) => document.getElementById(b.getAttribute("aria-activedescendant") || "")?.getAttribute("data-option"))
        check(k1.expanded === "true" && k1.active === "online" && k2 === "sala", `${tag}: Down opens on the first option and moves to the next (${k1.active}, ${k2})`)
        await page.keyboard.press("Escape")
        await sleep(250)
        check(await box.evaluate((b) => b.getAttribute("aria-expanded") === "false" && document.activeElement === b) && !!(await page.$("[data-block-sheet-panel]")), `${tag}: Escape closes the list, focus stays on the field, the sheet stays`)
        await page.keyboard.type("am")
        await sleep(150)
        const typed = await box.evaluate((b) => document.getElementById(b.getAttribute("aria-activedescendant") || "")?.getAttribute("data-option"))
        check(typed === "help", `${tag}: typing "am" moves to "Am nevoie de o recomandare" (${typed})`)
        await page.keyboard.press("Home")
        await page.keyboard.press("ArrowDown")
        await page.keyboard.press("Enter")
        await sleep(250)
        const picked = await box.evaluate((b) => ({ expanded: b.getAttribute("aria-expanded"), text: b.textContent.trim(), value: b.getAttribute("data-value") }))
        check(picked.expanded === "false" && picked.text === "Antrenamente personale 1:1" && picked.value === "sala", `${tag}: Enter picks the active option ("${picked.text}")`)
        await box.click()
        await sleep(260)
        const mark = await page.evaluate(() => [...document.querySelectorAll("[data-block-sheet-panel] [role=option]")].map((o) => `${o.getAttribute("data-option")}:${o.getAttribute("aria-selected")}:${getComputedStyle(o.querySelector("svg")).opacity}`).join(" "))
        check(mark === "online:false:0 sala:true:1 help:false:0", `${tag}: the chosen row is marked selected and shows its check (${mark})`)
        await page.screenshot({ path: join(SHOTS, `select-${tag}-chosen.png`) })
        await page.keyboard.press("Escape")
        await sleep(200)

        /* Send: the answer is the option's id. */
        await page.$eval("[data-block-sheet-panel] [data-native-form] button[type=submit]", (b) => b.click())
        await page.waitForSelector("[data-block-sheet-panel] [data-form-complete]", { timeout: 5000 }).catch(() => null)
        const last = submits.at(-1) || {}
        check(submits.length === 1 && JSON.stringify(last.answers) === JSON.stringify({ name: "Ana Pop", email: "ana@example.ro", how: "sala" }), `${tag}: Send sends the dropdown as its option id (${JSON.stringify(last.answers)})`)
        await page.close()
      }
    }
    /* Reduced motion: the list appears without moving. */
    const page = await open(`/app?live&theme=dark&hover=lift`, { width: 390, height: 844, mobile: true })
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    await page.waitForSelector("[data-op-block=form]")
    await page.$eval("[data-op-block=form] a, [data-op-block=form] button", (a) => a.click())
    const box = await page.waitForSelector("[data-block-sheet-panel] [data-question=how] [role=combobox]", { timeout: 5000 })
    await sleep(400)
    await box.click()
    await sleep(60)
    const anim = await page.$eval("[data-block-sheet-panel] [role=listbox]", (l) => getComputedStyle(l).animationName)
    check(anim === "none", `reduced motion: the list appears without moving (${anim})`)
    await page.close()
  }
} finally {
  await browser.close()
  if (touchBrowser) await touchBrowser.close()
  server.close()
}

console.log(`\nscreenshots: ${SHOTS}`)
console.log(failures.length ? `\n${failures.length} failed` : "\nall passed")
if (failures.length && !report) process.exit(1)
