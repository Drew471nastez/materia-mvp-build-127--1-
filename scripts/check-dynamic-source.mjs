/**
 * ===========================================================================
 *  INSERT SHOP DATA: A BUTTON IN THE LABEL ROW THAT NEVER MOVES ANYTHING
 * ===========================================================================
 * "On hover it flickers, it's bad, flashes; make it how Shopify displays
 * that." The button used to fade in over the label row on hover and, on a
 * narrow sidebar, landed inside the input over the words. This mounts the
 * real DynamicSourceField (components/website-builder/editor/controls) in a
 * 320px sidebar at 1440 and in the editor's real bottom sheet at 390, and
 * measures:
 *
 *   - the button is there at rest, fully opaque, 26px, and never overlaps
 *     the field under it; under a thumb it answers over 44px
 *   - it carries the app's light-surface depth: a hairline ring, a shade in
 *     its foot and one soft pixel under it, going flat with the shade inside
 *     while its list is open
 *   - the field's label and input do not move by a pixel on hover, on
 *     focus, on opening the list or on inserting; no opacity changes
 *   - a keyboard reaches it, opens it, walks the list and picks
 *   - a text insert lands at the caret; a whole source reads as a chip
 *     with an x, the same height as the input, and the x disconnects
 *   - a tooltip on a desktop, none on a phone
 *   - EVERY OPTION, EXERCISED. Each kind of setting that takes a source is
 *     mounted, its list read and compared against what that kind may hold,
 *     one option picked, the written value and the canvas beside it read
 *     back, and the source disconnected again.
 *
 * A MOUSE AND A FINGER, DECLARED. Tailwind puts every `hover:` utility
 * behind `(hover: hover)`, and a headless Chromium says it has neither a
 * hover nor a fine pointer — so a probe that does not say otherwise measures
 * a page on which no hover rule exists at all, and reports that nothing
 * changes under the pointer because nothing can. The desktop pass declares a
 * mouse through blink settings and the phone pass declares a touch screen,
 * which is also the only way to see what a finger leaves behind: `:hover`
 * sticks to the last thing tapped, and what it then paints is the artefact.
 *
 *   node scripts/check-dynamic-source.mjs          (SHOTS_DIR=dir for pictures)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { mkdtempSync, readFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { probeCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const css = await probeCss(root)
/* Inter from a build when there is one, served over http because a page on http cannot read file://. */
const faces = interFaces(root)
const fontDir = (faces.match(/url\(file:\/\/([^)]*\/static\/media)\//) ?? [])[1]
const facesHttp = fontDir ? faces.split(`file://${fontDir}/`).join("/font/") : ""
const out = mkdtempSync(join(tmpdir(), "storelib-dynsrc-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-dynamic-source.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`, "--loader:.css=empty"],
  { stdio: ["ignore", "ignore", "inherit"] })
const js = readFileSync(join(out, "probe.js"))
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${facesHttp}</style><style>${css}</style><style>body{margin:0;background:#f3f4f6;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="root"></div><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  if (fontDir && req.url.startsWith("/font/")) {
    try {
      const body = readFileSync(join(fontDir, decodeURIComponent(req.url.slice(6))))
      res.writeHead(200, { "content-type": "font/woff2" })
      return res.end(body)
    } catch {
      res.writeHead(404)
      return res.end()
    }
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
if (shots) mkdirSync(shots, { recursive: true })

/* Every box this measures, for one field. */
const geometry = (page, id) =>
  page.evaluate((id) => {
    const f = document.querySelector(`[data-probe-field="${id}"]`)
    /* In the scroller's own content, so the sheet settling or scrolling is not read as the field moving. */
    const sc = f.closest("[data-sheet-scroll], [data-wb-sidebar-scroll]")
    const o = sc.getBoundingClientRect()
    const r = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { x: +(b.left - o.left).toFixed(2), y: +(b.top - o.top + sc.scrollTop).toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) }
    }
    const btn = f.querySelector("[data-dynamic-action]")
    return {
      label: r(f.querySelector("label")),
      input: r(f.querySelector("input, select, [data-dynamic-bound]")),
      button: r(btn),
      opacity: btn ? getComputedStyle(btn).opacity : null,
      transition: btn ? getComputedStyle(btn).transitionProperty : null,
    }
  }, id)
const same = (a, b) => JSON.stringify({ l: a.label, i: a.input, b: a.button }) === JSON.stringify({ l: b.label, i: b.input, b: b.button })

/* The shade of the button, everything a pointer or a finger can change about it. */
const skin = (page, id) =>
  page.evaluate((id) => {
    const b = document.querySelector(`[data-probe-field="${id}"] [data-dynamic-action]`)
    const cs = getComputedStyle(b)
    const svg = b.querySelector("svg").getBoundingClientRect()
    return {
      bg: cs.backgroundColor,
      shadow: cs.boxShadow,
      color: cs.color,
      icon: [+svg.width.toFixed(2), +svg.height.toFixed(2)],
      hovered: b.matches(":hover"),
      expanded: b.getAttribute("aria-expanded"),
      connected: b.hasAttribute("data-connected"),
    }
  }, id)
/* The same, once the 100ms it takes to change has finished: two readings that agree. */
const settled = async (page, id) => {
  let last = await skin(page, id)
  for (let i = 0; i < 20; i++) {
    await sleep(80)
    const now = await skin(page, id)
    if (now.shadow === last.shadow && now.bg === last.bg) return now
    last = now
  }
  return last
}
/* The layers of a box-shadow that are actually drawn: Tailwind leaves four transparent ones in front. */
const layers = (shadow) => shadow.split(/,(?![^(]*\))/).map((l) => l.trim()).filter((l) => !l.startsWith("rgba(0, 0, 0, 0)"))
/* Declared, because a headless Chromium has neither by default. See the note at the top. */
const MOUSE = "--blink-settings=availableHoverTypes=2,primaryHoverType=2,availablePointerTypes=4,primaryPointerType=4"
const FINGER = "--blink-settings=availableHoverTypes=1,primaryHoverType=1,availablePointerTypes=2,primaryPointerType=2"

let browser = null
try {
  for (const vp of [
    { name: "desktop 1440", width: 1440, height: 900, phone: false },
    { name: "phone 390", width: 390, height: 844, phone: true },
  ]) {
    console.log(`\n${vp.name}`)
    browser = await puppeteer.launch({
      executablePath: CHROMIUM,
      args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", vp.phone ? FINGER : MOUSE],
    })
    const page = await browser.newPage()
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2, isMobile: vp.phone, hasTouch: vp.phone })
    await page.evaluateOnNewDocument(() => {
      window.__long = 0
      try {
        new PerformanceObserver((l) => { window.__long += l.getEntries().length }).observe({ type: "longtask", buffered: true })
      } catch {}
    })
    await page.goto(origin, { waitUntil: "load" })
    await page.waitForSelector("[data-dynamic-action]")
    await sleep(vp.phone ? 900 : 200)
    const tag = vp.phone ? "390" : "1440"
    const shoot = async (name) => {
      if (!shots) return
      if (vp.phone) await page.screenshot({ path: join(shots, `dyn-${tag}-${name}.png`) })
      else await page.screenshot({ path: join(shots, `dyn-${tag}-${name}.png`), clip: { x: 0, y: 0, width: 520, height: 720 } })
    }

    /* ── At rest ─────────────────────────────────────────────── */
    const rest = await geometry(page, "eyebrow")
    const count = await page.$$eval("[data-dynamic-action]", (b) => b.length)
    expect(count === 8, "every field that takes a source has the button at rest, and the select has none", count)
    expect(rest.opacity === "1", "fully opaque at rest, not waiting for a hover", rest.opacity)
    expect(!/opacity|all/.test(rest.transition), "and nothing about it transitions opacity", rest.transition)
    /* 26px, down from 28: "a little bit smaller, just extremely slightly". The glyph inside it went 16px to 15px. */
    expect(Math.abs(rest.button.w - 26) < 0.5 && Math.abs(rest.button.h - 26) < 0.5, "the visible button is 26px", rest.button)
    expect(rest.button.y + rest.button.h <= rest.input.y + 0.01, "it ends above the field and never overlaps the text", { buttonBottom: rest.button.y + rest.button.h, inputTop: rest.input.y })
    expect(Math.abs(rest.button.x + rest.button.w - (rest.input.x + rest.input.w)) < 0.5, "at the right end of the label row, flush with the field", { buttonRight: rest.button.x + rest.button.w, inputRight: rest.input.x + rest.input.w })
    const plain = await geometry(page, "style")
    const gapDyn = +(rest.input.y - (rest.label.y + rest.label.h)).toFixed(2)
    const gapPlain = +(plain.input.y - (plain.label.y + plain.label.h)).toFixed(2)
    expect(Math.abs(gapDyn - gapPlain) <= 2.5, "its words sit over the field within 2px of where a plain label's do", { withButton: gapDyn, plain: gapPlain })
    const hit = await page.evaluate(() => {
      const b = document.querySelector('[data-probe-field="eyebrow"] [data-dynamic-action]')
      const r = b.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const at = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === b || b.contains(e)) }
      let up = 0, down = 0, left = 0, right = 0
      while (at(cx, cy - up - 1) && up < 60) up++
      while (at(cx, cy + down + 1) && down < 60) down++
      while (at(cx - left - 1, cy) && left < 60) left++
      while (at(cx + right + 1, cy) && right < 60) right++
      const input = document.querySelector('[data-probe-field="eyebrow"] input').getBoundingClientRect()
      return { h: up + down + 1, w: left + right + 1, reachesInput: cy + down >= input.top }
    })
    if (vp.phone) expect(hit.h >= 44 && hit.w >= 44 && !hit.reachesInput, "under a thumb it answers over 44 by 44, and not over the field", hit)
    else expect(hit.h >= 25 && hit.w >= 25, "under a pointer, its own 26px", hit)

    /* ── A little depth, and a background of its own ─────────── */
    const skinRest = await settled(page, "eyebrow")
    const drawn = layers(skinRest.shadow)
    expect(Math.abs(skinRest.icon[0] - 15) < 0.5 && Math.abs(skinRest.icon[1] - 15) < 0.5, "the glyph in it is 15px", skinRest.icon)
    expect(drawn.length === 3 && drawn.filter((l) => l.endsWith("inset")).length === 2,
      "at rest it has three layers and no more: the hairline ring and the foot inside it, one soft pixel under it", drawn)
    expect(/0px 0px 0px 1px inset$/.test(drawn[0]) && /0px -1px 0px 0px inset$/.test(drawn[1]) && /0px 1px 1px 0px$/.test(drawn[2]),
      "a hairline, a 1px foot, a 1px shadow: a little depth and not a lift", drawn)
    expect(skinRest.bg === "rgb(255, 255, 255)", "and a white background of its own, which is what globals.css reads as the opt-out from its touch rule", skinRest.bg)
    await shoot("rest")

    /* ── Hover: over the field, then the button ──────────────── */
    if (!vp.phone) {
      const all = async () => Promise.all(["eyebrow", "heading", "style", "cta", "title", "image"].map((id) => geometry(page, id)))
      const before = await all()
      const inp = rest.input
      await page.mouse.move(inp.x + inp.w / 2, inp.y + inp.h / 2)
      await sleep(250)
      const onField = await all()
      await page.mouse.move(rest.button.x + 14, rest.button.y + 14)
      await sleep(80)
      const onButtonEarly = await geometry(page, "eyebrow")
      await sleep(600)
      const onButton = await all()
      const moved = before.map((b, i) => (same(b, onField[i]) && same(b, onButton[i]) ? null : i)).filter((x) => x !== null)
      expect(moved.length === 0, "hovering the field and the button moves nothing in the sidebar", moved)
      expect(onButtonEarly.opacity === "1" && onButton[0].opacity === "1", "and the button's opacity never changes under the pointer", [onButtonEarly.opacity, onButton[0].opacity])
      const tip = await page.evaluate(() => document.querySelector("[data-slot='tooltip-content']")?.textContent ?? null)
      expect(tip?.startsWith("Insert shop data"), "a tooltip names it after a moment's hover", tip)
      /* A shade darker, and NOT a step higher: the depth is the same at rest and under the pointer. */
      const skinHover = await skin(page, "eyebrow")
      expect(skinHover.hovered && skinHover.bg !== skinRest.bg, "under the pointer it takes a shade", { rest: skinRest.bg, hover: skinHover.bg })
      expect(skinHover.shadow === skinRest.shadow, "and keeps the depth it had: nothing lifts or drops under a pointer", { rest: skinRest.shadow, hover: skinHover.shadow })
      await shoot("hover")
      /* A sweep down the sidebar: long tasks while the pointer passes. */
      await page.evaluate(() => (window.__long = 0))
      for (let y = 40; y < 560; y += 12) {
        await page.mouse.move(160, y)
        await page.mouse.move(300, y + 6)
      }
      const longs = await page.evaluate(() => window.__long)
      expect(longs === 0, "sweeping the pointer down the sidebar makes no long task", longs)
      /* Stepped, so the pointer actually crosses the button's edge: a jump
         sends no boundary event and leaves the tooltip standing, which is a
         probe leaving an artefact behind rather than the page doing it. */
      await page.mouse.move(900, 400, { steps: 20 })
      await sleep(300)
      const gone = await page.evaluate(() => document.querySelectorAll("[data-slot='tooltip-content']").length)
      const skinAway = await skin(page, "eyebrow")
      expect(gone === 0, "the tooltip goes when the pointer does", gone)
      expect(!skinAway.hovered && skinAway.bg === skinRest.bg && skinAway.shadow === skinRest.shadow, "and the button is exactly as it was: nothing left behind", skinAway)
    } else {
      const tapTip = async () => {
        await page.tap('[data-probe-field="heading"] [data-dynamic-action]')
        await sleep(400)
        const t = await page.evaluate(() => !!document.querySelector("[data-slot='tooltip-content']"))
        await page.tap('[data-probe-field="heading"] [data-dynamic-action]')
        await sleep(200)
        return t
      }
      expect(!(await tapTip()), "no tooltip under a thumb")

      /* ── WHAT A FINGER LEAVES BEHIND ─────────────────────────
         On a touch screen :hover latches on the last thing tapped. Two
         things have to be true of that. While the list is open the button
         must still show it — globals.css clears :hover backgrounds inside
         the phone sheets, and it used to clear this one's open state with
         them, so a thumb opened the list and the glyph looked untouched.
         And once the list is closed the button must be back to exactly the
         shade it had before the tap, with the latched :hover painting
         nothing. */
      const sel = '[data-probe-field="heading"] [data-dynamic-action]'
      const beforeTap = await settled(page, "heading")
      await page.tap(sel)
      await sleep(350)
      const whileOpen = await settled(page, "heading")
      expect(whileOpen.expanded === "true" && whileOpen.bg !== "rgba(0, 0, 0, 0)" && whileOpen.bg !== beforeTap.bg,
        "a thumb opens the list and the glyph says so: the open shade survives the sheet's touch rule", { rest: beforeTap.bg, open: whileOpen.bg })
      expect(whileOpen.shadow !== beforeTap.shadow, "and it goes flat with the shade inside while it is open", whileOpen.shadow)
      await shoot("touched-open")
      await page.tap(sel)
      await sleep(350)
      const afterTap = await settled(page, "heading")
      expect(afterTap.hovered, ":hover is still latched on it after the tap, as it is on anything a finger touches", afterTap.hovered)
      expect(afterTap.bg === beforeTap.bg && afterTap.shadow === beforeTap.shadow && afterTap.color === beforeTap.color,
        "and the latched hover paints nothing: the glyph is exactly as it was before the tap", { before: beforeTap, after: afterTap })
      await shoot("touched")
    }

    /* ── Focus the input, then open, then insert at the caret ── */
    const before = await geometry(page, "eyebrow")
    await page.click('[data-probe-field="eyebrow"] input')
    await page.evaluate(() => {
      const i = document.querySelector('[data-probe-field="eyebrow"] input')
      i.setSelectionRange(4, 4)
      i.dispatchEvent(new Event("select", { bubbles: true }))
    })
    await sleep(80)
    const focused = await geometry(page, "eyebrow")
    expect(same(before, focused), "focusing the field moves nothing", { before, focused })
    if (vp.phone) await page.tap('[data-probe-field="eyebrow"] [data-dynamic-action]')
    else await page.click('[data-probe-field="eyebrow"] [data-dynamic-action]')
    await sleep(350)
    const opened = await geometry(page, "eyebrow")
    const list = await page.evaluate(() => ({
      open: !!document.querySelector('[data-probe-field="eyebrow"] [role="listbox"]'),
      focused: document.activeElement?.getAttribute("role"),
      expanded: document.querySelector('[data-probe-field="eyebrow"] [data-dynamic-action]').getAttribute("aria-expanded"),
    }))
    expect(list.open && list.expanded === "true", "the button opens the list of shop data", list)
    expect(same(before, opened) || (vp.phone && opened.input.x === before.input.x), "opening it moves neither the label nor the field", { before: before.input, opened: opened.input })
    await shoot("open")
    const pickLabel = "Product title"
    await page.evaluate((label) => {
      const opt = [...document.querySelectorAll('[data-probe-field="eyebrow"] [role="option"]')].find((o) => o.textContent.startsWith(label))
      opt.scrollIntoView({ block: "nearest" })
    }, pickLabel)
    const optHandle = await page.evaluateHandle((label) => [...document.querySelectorAll('[data-probe-field="eyebrow"] [role="option"]')].find((o) => o.textContent.startsWith(label)), pickLabel)
    if (vp.phone) await optHandle.tap()
    else await optHandle.click()
    await sleep(300)
    const value = await page.evaluate(() => window.__values.eyebrow)
    expect(value === "Feat {{ product.title }} ured", "the source goes in at the caret", value)
    const inserted = await geometry(page, "eyebrow")
    expect(inserted.label.y === before.label.y && inserted.input.y === before.input.y && inserted.input.h === before.input.h, "inserting moves neither the label nor the field", { before: before.input, after: inserted.input })
    const note = await page.evaluate(() => {
      const n = document.querySelector('[data-probe-field="eyebrow"] [data-dynamic-note]')
      return n ? { text: n.textContent, named: n.querySelector("span")?.textContent } : null
    })
    expect(note?.text === "On the page: Feat Product title ured" && note?.named === "Product title", "the line under it reads the source by its name", note)
    const refocus = await page.evaluate(() => document.activeElement?.tagName)
    expect(vp.phone ? refocus === "BUTTON" : refocus === "INPUT", vp.phone ? "focus goes back to the button, so no keyboard comes up" : "focus goes back to the text box after what went in", refocus)
    await shoot("inserted")

    /* ── A whole source is a chip with an x ─────────────────── */
    const chip = await page.evaluate(() => {
      const f = document.querySelector('[data-probe-field="title"]')
      const b = f.querySelector("[data-dynamic-bound]")
      const heading = document.querySelector('[data-probe-field="heading"] input').getBoundingClientRect()
      return b ? { text: b.textContent, h: b.getBoundingClientRect().height, inputH: heading.height, x: !!b.querySelector('button[aria-label="Disconnect Product title"]'), input: !!f.querySelector("input") } : null
    })
    expect(chip && chip.text === "Product title" && chip.x && !chip.input, "a text setting that is one source shows a chip with its name and an x, not the braces", chip)
    expect(chip && Math.abs(chip.h - chip.inputH) < 0.5, "the chip's field is the height of a text box", chip && { chip: chip.h, input: chip.inputH })
    const img = await page.evaluate(() => document.querySelector('[data-probe-field="image"] [data-dynamic-bound]')?.textContent)
    expect(img === "Product image", "a picture connected to the product's reads as a chip too", img)
    await page.evaluate(() => document.querySelector('[data-probe-field="title"]').scrollIntoView({ block: "center" }))
    await sleep(300)
    await shoot("chip")
    const titleBefore = await geometry(page, "title")
    const xSel = '[data-probe-field="title"] button[aria-label="Disconnect Product title"]'
    if (vp.phone) {
      /* From the ::before box, because the sheet's middle stop leaves part of the field below the screen. */
      const xHit = await page.evaluate((sel) => {
        const b = document.querySelector(sel)
        const r = b.getBoundingClientRect()
        const cs = getComputedStyle(b, "::before")
        const h = r.height - parseFloat(cs.top) - parseFloat(cs.bottom)
        const w = r.width - parseFloat(cs.left) - parseFloat(cs.right)
        const box = b.closest("[data-dynamic-bound]").getBoundingClientRect()
        const top = r.top + parseFloat(cs.top)
        return { h, w, over: +Math.max(box.top - top, top + h - box.bottom).toFixed(2), inField: top >= box.top - 1 && top + h <= box.bottom + 1 }
      }, xSel)
      expect(xHit.h >= 44 && xHit.w >= 44 && xHit.inField, "the x answers over 44px under a thumb, inside the field", xHit)
      await page.tap(xSel)
    } else await page.click(xSel)
    await sleep(200)
    const titleAfter = await geometry(page, "title")
    const cleared = await page.evaluate(() => window.__values.title)
    expect(cleared === "" && titleAfter.input && titleAfter.input.y === titleBefore.input.y, "the x disconnects: the text box comes back in the same place, empty", { value: cleared, before: titleBefore.input, after: titleAfter.input })
    await shoot("disconnected")

    /* ── EVERY OPTION, EXERCISED ────────────────────────────
       Desktop only, because this is about what the list offers and what
       the page then draws, and neither depends on the pointer. Each kind
       of setting is opened, its whole list read and compared with what a
       setting of that kind may hold, one option picked, the written value
       and the canvas beside it read back, and the source disconnected. */
    if (!vp.phone) {
      const labels = (id) => page.$$eval(`[data-probe-field="${id}"] [role="option"] span:first-child`, (n) => n.map((x) => x.textContent))
      const stored = (id) => page.evaluate((id) => window.__values[id], id)
      const drawn = (id) => page.$eval(`[data-canvas-for="${id}"]`, (e) => e.textContent)
      const connected = (id) => page.$eval(`[data-probe-field="${id}"] [data-dynamic-action]`, (b) => b.hasAttribute("data-connected"))
      const openList = async (id) => {
        await page.evaluate((id) => document.querySelector(`[data-probe-field="${id}"]`).scrollIntoView({ block: "center" }), id)
        await sleep(120)
        await page.click(`[data-probe-field="${id}"] [data-dynamic-action]`)
        await sleep(220)
      }
      const pickIn = async (id, label) => {
        const h = await page.evaluateHandle((id, label) => {
          const o = [...document.querySelectorAll(`[data-probe-field="${id}"] [role="option"]`)].find((o) => o.textContent.startsWith(label))
          o.scrollIntoView({ block: "nearest" })
          return o
        }, id, label)
        await h.click()
        await sleep(250)
      }
      const cut = async (id, label) => {
        const sel = `[data-probe-field="${id}"] button[aria-label="Disconnect ${label}"]`
        await page.evaluate((id) => document.querySelector(`[data-probe-field="${id}"]`).scrollIntoView({ block: "center" }), id)
        await sleep(120)
        await page.click(sel)
        await sleep(250)
      }

      /* A link takes an address and nothing else. */
      await openList("link")
      expect(JSON.stringify(await labels("link")) === JSON.stringify(["Shop address", "Product address", "Instagram", "TikTok", "YouTube", "X"]),
        "a link setting is offered the addresses, and only the addresses", await labels("link"))
      await pickIn("link", "Shop address")
      expect((await stored("link")) === "{{ shop.url }}" && (await drawn("link")) === "https://drew.storelib.com",
        "picking one writes it whole and the page draws the address", { stored: await stored("link"), drawn: await drawn("link") })
      expect(await connected("link"), "and the glyph reads as connected")
      await cut("link", "Shop address")
      expect((await stored("link")) === "" && (await drawn("link")) === "" && !(await connected("link")),
        "the x puts a plain empty link back, and the glyph goes quiet", { stored: await stored("link"), drawn: await drawn("link") })

      /* A picture takes a picture and nothing else. */
      await openList("image")
      expect(JSON.stringify(await labels("image")) === JSON.stringify(["Creator photo", "Product image"]),
        "a picture setting is offered the two pictures", await labels("image"))
      await pickIn("image", "Creator photo")
      expect((await stored("image")) === "{{ creator.avatar }}" && (await drawn("image")) === "https://cdn.example.com/drew.jpg",
        "a connected picture swaps to the new source and the page draws it", { stored: await stored("image"), drawn: await drawn("image") })
      await cut("image", "Creator photo")
      expect((await stored("image")) === "" && (await drawn("image")) === "", "and the x empties it", await stored("image"))

      /* A number takes a number, and comes back a number. */
      await openList("count")
      expect(JSON.stringify(await labels("count")) === JSON.stringify(["Number of products", "This year"]),
        "a number setting is offered the two numbers", await labels("count"))
      await pickIn("count", "Number of products")
      expect((await stored("count")) === "{{ shop.product_count }}" && (await drawn("count")) === "12",
        "picking one writes it whole and the page draws the count", { stored: await stored("count"), drawn: await drawn("count") })
      await cut("count", "Number of products")
      expect((await stored("count")) === 3 && (await drawn("count")) === "3",
        "the x puts the setting's own default back, a number and not the empty string the canvas would have had to guess at", { stored: await stored("count"), drawn: await drawn("count") })

      /* Words take anything and read it as words, pictures excepted. */
      await openList("story")
      const words = await labels("story")
      expect(words.includes("Shop name") && words.includes("This year") && words.includes("Product description") && !words.includes("Creator photo") && !words.includes("Product image"),
        "a text setting is offered everything that reads as words, and no pictures", words.length)
      await pickIn("story", "Creator bio")
      expect((await stored("story")) === "Two lines about it {{ creator.bio }}" && (await drawn("story")) === "Two lines about it Makes things",
        "a source among words goes in beside them and the page draws the words filled in", { stored: await stored("story"), drawn: await drawn("story") })
      expect((await connected("story")) && !(await connected("heading")),
        "the glyph is lit on the setting that reads the shop and quiet on the one beside it")
    }

    /* ── Keyboard, desktop only ─────────────────────────────── */
    if (!vp.phone) {
      await page.click('[data-probe-field="heading"] input')
      await page.keyboard.down("Shift")
      await page.keyboard.press("Tab")
      await page.keyboard.up("Shift")
      const onBtn = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))
      expect(onBtn === "Insert shop data", "Shift+Tab from the field lands on the button, named for a screen reader", onBtn)
      await page.keyboard.press("Enter")
      await sleep(120)
      const first = await page.evaluate(() => document.activeElement?.textContent)
      await page.keyboard.press("ArrowDown")
      const second = await page.evaluate(() => document.activeElement?.textContent)
      expect(first?.startsWith("Shop name") && second?.startsWith("Shop description"), "Enter opens it with the first choice focused, and the arrows walk the list", [first?.slice(0, 20), second?.slice(0, 20)])
      await page.keyboard.press("Escape")
      await sleep(80)
      const closed = await page.evaluate(() => !document.querySelector('[data-probe-field="heading"] [role="listbox"]'))
      expect(closed, "Escape closes it")
    }
    const longs = await page.evaluate(() => window.__long)
    console.log(`  info  long tasks over the whole run: ${longs}`)
    await page.close()
    await browser.close()
    browser = null
  }
} finally {
  if (browser) await browser.close()
  server.close()
}
console.log(broken ? `\n${broken} FAILED` : "\nall passed")
process.exit(broken ? 1 : 0)
