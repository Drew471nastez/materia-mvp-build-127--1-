/**
 * ===========================================================================
 *  CLICK A HEADING ON THE CANVAS, LAND ON ITS FIELD
 * ===========================================================================
 * The owner's ask, as Shopify does it: clicking a heading (or a line of text,
 * a button, a block) opens that section's settings AND brings the sidebar to
 * the exact field that controls it, with a short violet ring.
 *
 * The real editor (editor-probe-harness.mjs), real presses through the
 * DevTools input pipeline, and for each press:
 *   - which panel opened, and which field was found for what was clicked
 *   - where that field sits inside its own scroller (fully visible or not)
 *   - the scroller's scrollTop before and after
 *   - whether the field carries the ring (data-sl-flash), and its outline
 *     colour while it is on
 *   - on a computer, whether its input took the focus
 * Then hover: the outline drawn round the hovered heading, and the chip's
 * words. Then a phone: a tap on the heading brings the sheet up at the field,
 * and no keyboard (nothing focused).
 *
 *   node scripts/check-click-to-edit.mjs
 */
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { CHROMIUM, bundle, css } from "./editor-probe-harness.mjs"

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false</script><script src="/editor-probe.js"></script></body></html>`
const js = readFileSync(bundle)
const server = createServer((req, res) => {
  if (req.url.startsWith("/editor-probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}/website-builder/editor/probe-install`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function open(vp, touch) {
  const page = await browser.newPage()
  await page.setViewport({ ...vp, isMobile: !!touch, hasTouch: !!touch })
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)))
  await page.goto(origin, { waitUntil: "load" })
  await page.waitForFunction(() => {
    const sc = document.getElementById("wb-preview-root")
    return sc && sc.querySelectorAll("[data-section-box]").length >= 8
  }, { timeout: 60_000 })
  await sleep(1200)
  return { page, errors }
}

/** The centre of the first element matching `sel` inside a section of `type`, brought into the canvas's view first. */
async function target(page, type, sel, index = 0) {
  return page.evaluate((t, s, i) => {
    const sc = document.getElementById("wb-preview-root")
    const box = document.querySelector(`#wb-preview-root [data-section-type="${t}"]`)
    if (!box) return null
    /* Only what can be seen: a closed FAQ answer is marked too, and has no box to press. */
    const el = [...box.querySelectorAll(s)].filter((e) => e.getBoundingClientRect().height > 0)[i]
    if (!el) return null
    const top = el.getBoundingClientRect().top - sc.getBoundingClientRect().top
    if (top < 60 || top > sc.clientHeight - 120) sc.scrollTop += top - 160
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + Math.min(r.width / 2, 40)), y: Math.round(r.top + r.height / 2), setting: el.getAttribute("data-sl-setting"), block: el.getAttribute("data-sl-block"), text: (el.textContent || "").trim().slice(0, 40) }
  }, type, sel, index)
}

/** Where the field for a setting is, after a press, and what it looks like. */
const READ_FIELD = (setting, block, ringAt) => new Promise((resolve) => {
  const look = () => {
    const panel = document.querySelector("[data-wb-section-panel]")
    let field = null
    if (panel) {
      if (block) {
        const row = [...panel.querySelectorAll("[data-block-row]")].find((r) => r.getAttribute("data-block-row").split("/").pop() === block)
        field = row ? [...row.querySelectorAll(`[data-block-field="${setting}"]`)].find((f) => f.closest("[data-block-row]") === row) : null
      } else {
        field = [...panel.querySelectorAll(`[data-setting-field="${setting}"]`)].find((f) => !f.closest("[data-block-row]")) || null
      }
    }
    if (!field) return { found: false, panel: panel ? panel.getAttribute("data-wb-section-panel") : null, rows: panel ? [...panel.querySelectorAll("[data-block-row]")].map((r) => r.getAttribute("data-block-row")).slice(0, 6) : [] }
    const scroller = field.closest("[data-sheet-scroll], [data-wb-sidebar-scroll]")
    const r = field.getBoundingClientRect()
    const b = scroller.getBoundingClientRect()
    const cs = getComputedStyle(field)
    const active = document.activeElement
    return {
      found: true,
      top: Math.round(r.top - b.top),
      bottom: Math.round(b.bottom - r.bottom),
      height: Math.round(r.height),
      visible: r.top >= b.top - 1 && r.bottom <= b.bottom + 1 && r.bottom <= window.innerHeight + 1,
      scrollTop: Math.round(scroller.scrollTop),
      flash: field.hasAttribute("data-sl-flash"),
      outline: cs.outlineColor + " " + cs.outlineWidth,
      focused: !!active && field.contains(active) && /INPUT|TEXTAREA/.test(active.tagName) || (!!active && field.contains(active) && active.isContentEditable),
      label: (field.querySelector("label, span, p") || {}).textContent?.trim().slice(0, 30) || "",
    }
  }
  setTimeout(() => resolve(look()), ringAt)
})

async function pressAndRead(page, at, touch, ringAt = 450) {
  const before = await page.evaluate(() => {
    const sc = document.querySelector("[data-wb-section-panel] [data-sheet-scroll], [data-wb-sidebar-scroll]")
    return sc ? Math.round(sc.scrollTop) : null
  })
  if (touch) await page.touchscreen.tap(at.x, at.y)
  else await page.mouse.click(at.x, at.y)
  const field = await page.evaluate(READ_FIELD, at.setting, at.block, ringAt)
  return { before, ...field }
}

const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--disable-dev-shm-usage"],
})
try {
  /* ── A computer ────────────────────────────────────────────────────── */
  {
    const { page, errors } = await open({ width: 1440, height: 900 }, false)
    console.log("\ndesktop editor, 1440x900")
    const marks = await page.evaluate(() => document.querySelectorAll("#wb-preview-root [data-sl-setting]").length)
    expect(marks > 10, "the canvas carries setting marks while the builder draws it", marks)

    const heading = await target(page, "hero_centered", '[data-sl-setting="heading"]')
    expect(!!heading, "the hero's heading is on the canvas, marked", heading)
    if (heading) {
      /* Hover first: the outline round the heading, and the section's name. */
      await page.mouse.move(heading.x, heading.y)
      await sleep(200)
      const hover = await page.evaluate(() => {
        const o = document.querySelector("[data-wb-hover-outline]")
        const c = document.querySelector("[data-wb-hover-chip]")
        const h = document.querySelector('#wb-preview-root [data-section-type="hero_centered"] [data-sl-setting="heading"]').getBoundingClientRect()
        const r = o ? o.getBoundingClientRect() : null
        return { outline: !!o, chip: c ? c.textContent : null, dx: r ? Math.round(r.left - h.left) : null, dw: r ? Math.round(r.width - h.width) : null, shadow: o ? getComputedStyle(o).boxShadow : null }
      })
      expect(hover.outline && hover.dx === -2 && hover.dw === 4, "hovering the heading outlines it, 2px clear on each side", hover)
      expect(/59, 130, 246/.test(hover.shadow || ""), "in the canvas selection blue", hover.shadow)
      const ring = await page.evaluate(() => {
        const r = [...document.querySelectorAll('#wb-preview-root [data-section-type="hero_centered"] span.wb-ring')].find((s) => !s.textContent)
        return r ? getComputedStyle(r).boxShadow : null
      })
      expect(/59, 130, 246/.test(ring || ""), "and the section's own hover ring is blue too", ring)
      expect(!!hover.chip, "and names its section on a chip", hover.chip)

      const r = await pressAndRead(page, heading, false)
      expect(r.found, "clicking the heading opens the hero at its Heading field", r)
      expect(r.visible, "the field is fully inside the sidebar's view", { top: r.top, bottom: r.bottom, height: r.height })
      expect(r.flash && /139, 92, 246/.test(r.outline), "and wears the violet ring", r.outline)
      expect(r.focused, "its input takes the focus, ready to type", r.focused)
      await sleep(1500)
      const after = await page.evaluate(() => !!document.querySelector("[data-sl-flash]"))
      expect(!after, "the ring is gone 1.6s later", after)
    }

    /* A field far down the panel: the sidebar has to scroll to it. */
    for (const [type, sel] of [["hero_centered", '[data-sl-setting]:not([data-sl-setting="heading"])'], ["features_grid", "[data-sl-block][data-sl-setting]"], ["faq_accordion", '[data-sl-setting="question"]'], ["faq_accordion", '[data-sl-setting="answer"]']]) {
      const all = await page.evaluate((t, s) => [...document.querySelectorAll(`#wb-preview-root [data-section-type="${t}"] ${s}`)].filter((e) => e.getBoundingClientRect().height > 0).length, type, sel)
      const at = await target(page, type, sel, Math.max(0, all - 1))
      if (!at) { expect(false, `${type}: a marked element to press`, sel); continue }
      const r = await pressAndRead(page, at, false)
      expect(r.found && r.visible && r.flash, `${type}: "${at.text}" lands on ${at.block ? "its block's" : "the"} ${at.setting} field, in view and ringed`, { scrolledFrom: r.before, to: r.scrollTop, top: r.top, bottom: r.bottom, focused: r.focused, found: r.found, panel: r.panel, rows: r.rows, mark: at.block })
      await sleep(400)
    }

    /* Unsaved work, then the browser's Back and a plain link: the builder asks, in its own words. */
    console.log("\ndesktop editor, leaving with unsaved work")
    const again = await target(page, "hero_centered", '[data-sl-setting="heading"]')
    await page.mouse.click(again.x, again.y)
    await sleep(500)
    await page.keyboard.type("!")
    await sleep(80)
    const armed = await page.evaluate(() => !!(history.state && history.state.wbLeaveGuard))
    expect(armed, "an edit puts a guard entry on top of the history", armed)
    await page.evaluate(() => history.back())
    await sleep(500)
    const dialog = await page.evaluate(() => {
      const d = document.querySelector("[data-leave-dialog]")
      return d ? { title: d.querySelector("h2")?.textContent, buttons: [...d.querySelectorAll("button")].map((b) => b.textContent.trim()) } : null
    })
    expect(!!dialog && dialog.title === "Save changes before leaving?", "the browser's Back asks first", dialog)
    expect(!!dialog && ["Discard", "Cancel", "Save"].every((b) => dialog.buttons.includes(b)), "with Save, Discard and Cancel", dialog && dialog.buttons)
    await page.evaluate(() => document.querySelector("[data-leave-cancel]")?.click())
    await sleep(300)
    const stayed = await page.evaluate(() => ({ open: !!document.querySelector("[data-leave-dialog]"), rearmed: !!(history.state && history.state.wbLeaveGuard) }))
    expect(!stayed.open && stayed.rearmed, "Cancel stays, and the next Back is caught again", stayed)
    await page.keyboard.type("!")
    await sleep(80)
    await page.evaluate(() => {
      const a = document.createElement("a")
      a.href = "/app/products"
      a.textContent = "Products"
      a.id = "probe-leave-link"
      document.body.appendChild(a)
    })
    await page.click("#probe-leave-link")
    await sleep(300)
    const viaLink = await page.evaluate(() => ({ open: !!document.querySelector("[data-leave-dialog]"), path: location.pathname }))
    expect(viaLink.open && viaLink.path.startsWith("/website-builder/"), "a plain link in the builder asks too, and does not leave", viaLink)
    await page.evaluate(() => document.querySelector("[data-leave-cancel]")?.click())

    expect(errors.length === 0, "no page errors", errors)
    await page.close()
  }

  /* ── A phone ───────────────────────────────────────────────────────── */
  {
    const { page, errors } = await open({ width: 390, height: 844 }, true)
    console.log("\nphone editor, 390x844, taps")
    const heading = await target(page, "hero_centered", '[data-sl-setting="heading"]')
    if (heading) {
      /* The sheet rises first (sheetMoveMs), then the field is scrolled to: read once both have finished. */
      const r = await pressAndRead(page, heading, true, 1300)
      expect(r.found, "a tap on the heading brings the sheet up on the hero's Heading field", r)
      expect(r.visible, "the field is on screen inside the sheet", { top: r.top, bottom: r.bottom })
      expect(r.flash, "and wears the ring", r.outline)
      expect(!r.focused, "no keyboard: the input is not focused", r.focused)
    } else expect(false, "the hero's heading is on the phone canvas")
    expect(errors.length === 0, "no page errors", errors)
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}
console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
