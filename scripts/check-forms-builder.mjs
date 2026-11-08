/**
 * The form builder in a real browser (round AN, track AN2).
 *
 *   node scripts/check-forms-builder.mjs
 *
 * The owner on the "Get in touch" builder: "make it more easy, clean,
 * simple to understand and set up, not complicated ... the scroll bar more
 * modern ... not the right side options ... on mobile opens very smooth".
 * The real picker and builder (components/forms/form-picker, form-builder-
 * dialog, forms-manager), bundled by scripts/onepage-probe-server.mjs, with
 * the forms API answered here. At 1440 and 390 wide:
 *
 *   1. the Questions list is Storelib's ChoicePicker (a popover on a
 *      computer, the sheet on a phone), never a native select
 *   2. Edit questions opens the builder: a centred dialog about 640px wide
 *      on a computer, the shared bottom sheet on a phone, one column, with
 *      no preview or options panel at the side
 *   3. each question is one compact row; it opens in place; the settings
 *      are closed rows under the questions, one opening at a time
 *   4. only the middle scrolls, with a thin scrollbar on a computer
 *   5. on a phone, with a keyboard of 320px published, the foot bar
 *      (Save draft, Publish) sits on the keyboard, not under it
 *   6. closing with a change not saved asks in Storelib's own confirm (no
 *      browser confirm() is raised), and Keep editing keeps the builder
 *   7. no native <select> anywhere in the builder, no console errors, no
 *      sideways scroll
 */
import assert from "node:assert/strict"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const FORM = "aaaaaaaa-0000-4000-8000-0000000000bb"
const definition = {
  title: "Get in touch",
  description: "",
  mode: "form",
  layout: "single",
  fields: [
    { id: "name", type: "name", label: "Your name", required: true },
    { id: "email", type: "email", label: "Email", required: true },
    { id: "service", type: "single", label: "What is it about?", required: false, options: [{ id: "a", label: "A booking" }, { id: "b", label: "A question" }] },
    { id: "message", type: "textarea", label: "Anything else?", required: false },
  ],
  button_text: "Send",
  consent_text: "I agree to be contacted.",
  marketing_opt_in: false,
  completion: { kind: "message", message: "Thanks, I will be in touch." },
}
const saved = {
  id: FORM,
  title: "Get in touch",
  status: "published",
  revision: 2,
  draft: definition,
  published: definition,
  updated_at: "2026-11-01T10:00:00.000Z",
  integration_settings: { notify_email: true, webhook: { enabled: false, url: "", secret_hint: null }, google_sheets: { prepared: false } },
  retention_days: null,
}

const { base, server } = await serveEditorProbe({
  entry: "scripts/render-onepage-actions.tsx",
  api(req) {
    if (req.url.split("?")[0] === "/api/forms" && req.method === "GET") return { body: { forms: [saved] } }
    return null
  },
})
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  for (const width of [1440, 390]) {
    const phone = width < 640
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    const errors = []
    const dialogs = []
    page.on("pageerror", (e) => errors.push(e.message))
    page.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()))
    page.on("dialog", async (d) => {
      dialogs.push(d.message())
      await d.dismiss()
    })
    await page.setViewport({ width, height: phone ? 844 : 900, isMobile: phone, hasTouch: phone })
    await page.goto(`${base}/app/forms?mode=builder&form=${FORM}`)
    await page.waitForSelector('[data-choice-field="form-prechat"]')

    /* 1: the Questions list. */
    const field = await page.$eval('[data-choice-field="form-prechat"]', (e) => ({ text: e.textContent.trim(), tag: e.tagName, h: Math.round(e.getBoundingClientRect().height) }))
    assert.equal(field.text, "Get in touch")
    assert.equal(field.tag, "BUTTON")
    assert.equal(await page.$$eval("[data-form-picker] select", (s) => s.length), 0, "no native select in the picker")
    await page.click('[data-choice-field="form-prechat"]')
    const listAs = await page
      .waitForSelector(`[data-choice-popover="form-prechat"] [data-choice="${FORM}"], [data-choice-sheet] [data-choice="${FORM}"]`, { visible: true })
      .then((row) => row.evaluate((r) => (r.closest("[data-choice-popover]") ? "popover" : "sheet")))
    assert.equal(listAs, phone ? "sheet" : "popover")
    await page.keyboard.press("Escape")
    await wait(450)

    /* 2: the builder. */
    await page.click("[data-edit-form-here]")
    await page.waitForSelector("[data-form-builder]", { visible: true })
    await wait(phone ? 650 : 400)
    const shape = await page.evaluate(() => {
      const b = document.querySelector("[data-form-builder]")
      const r = b.getBoundingClientRect()
      const scroller = document.querySelector("[data-form-builder-scroll]")
      const inSheet = !!b.closest("[data-sheet-panel]")
      const rows = [...document.querySelectorAll("[data-form-question] > div:first-child")].map((x) => Math.round(x.getBoundingClientRect().height))
      const settings = [...document.querySelectorAll("[data-form-setting] > button")]
      return {
        inSheet,
        left: Math.round(r.left),
        right: Math.round(innerWidth - r.right),
        top: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
        bar: scroller.offsetWidth - scroller.clientWidth,
        scrollbarWidth: getComputedStyle(scroller).scrollbarWidth,
        rows,
        settings: settings.map((s) => s.textContent.replace(/\s+/g, " ").trim()),
        open: settings.filter((s) => s.getAttribute("aria-expanded") === "true").length,
        aside: !!b.querySelector("aside"),
        selects: b.querySelectorAll("select").length,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }
    })
    if (phone) {
      assert.equal(shape.inSheet, true, "a phone gets the shared bottom sheet")
      assert.ok(shape.top > 0 && shape.top < 120, `the sheet stops under the top of the screen ${JSON.stringify(shape)}`)
    } else {
      assert.equal(shape.inSheet, false)
      assert.ok(shape.width >= 600 && shape.width <= 660, `one column, about 640px ${JSON.stringify(shape)}`)
      assert.ok(Math.abs(shape.left - shape.right) <= 2, `centred ${JSON.stringify(shape)}`)
      assert.equal(shape.scrollbarWidth, "thin", "a thin scrollbar")
    }
    assert.equal(shape.aside, false, "no side panel")
    assert.equal(shape.selects, 0, "no native select in the builder")
    assert.equal(shape.overflow, false, "no sideways scroll")

    /* 3: compact rows, closed settings. */
    assert.equal(shape.rows.length, 4)
    assert.ok(shape.rows.every((h) => h <= 56), `compact question rows ${JSON.stringify(shape.rows)}`)
    assert.equal(shape.open, 0, "the settings start closed")
    assert.ok(shape.settings.length === 5 && /^After sending/.test(shape.settings[0]) && /^Where answers go/.test(shape.settings[1]), JSON.stringify(shape.settings))
    await page.click('[data-form-question="email"] button[aria-expanded]')
    await wait(320)
    const opened = await page.evaluate(() => ({ open: document.querySelector('[data-form-question="email"] button[aria-expanded]').getAttribute("aria-expanded"), label: document.querySelector('[data-form-question="email"] input')?.value, type: document.querySelector('[data-form-question="email"] [data-choice-field="question-type"]')?.textContent.trim() }))
    assert.deepEqual(opened, { open: "true", label: "Email", type: "Email" })
    await page.click('[data-form-setting="after"] > button')
    await wait(320)
    await page.click('[data-form-setting="responses"] > button')
    await wait(320)
    const oneAtATime = await page.$$eval("[data-form-setting] > button[aria-expanded=true]", (b) => b.map((x) => x.closest("[data-form-setting]").getAttribute("data-form-setting")))
    assert.deepEqual(oneAtATime, ["responses"], "one setting open at a time")

    /* 5: the keyboard, on a phone. */
    if (phone) {
      await page.focus('[data-form-question="email"] input')
      await page.evaluate(() => {
        document.documentElement.style.setProperty("--kb-inset", "320px")
        document.documentElement.style.setProperty("--vv-h", `${innerHeight - 320}px`)
      })
      await wait(500)
      const kb = await page.evaluate(() => {
        const foot = document.querySelector("[data-form-builder] footer").getBoundingClientRect()
        const head = document.querySelector("[data-form-builder] header").getBoundingClientRect()
        return { footBottom: Math.round(foot.bottom), headTop: Math.round(head.top), keysTop: innerHeight - 320 }
      })
      assert.ok(kb.footBottom <= kb.keysTop + 1, `Save and Publish sit on the keyboard ${JSON.stringify(kb)}`)
      assert.ok(kb.headTop >= 0, `the header stays on screen ${JSON.stringify(kb)}`)
      console.log(`   ${width}px keyboard of 320px: foot bar ends at ${kb.footBottom}, keys start at ${kb.keysTop}, header top ${kb.headTop}`)
      await page.evaluate(() => {
        document.documentElement.style.removeProperty("--kb-inset")
        document.documentElement.style.removeProperty("--vv-h")
      })
      await wait(300)
    }

    /* 6: a change, then Close. */
    await page.evaluate(() => {
      const input = document.querySelector('[data-form-question="email"] input')
      input.focus()
      input.select()
      document.execCommand("insertText", false, "Your email")
    })
    await page.click("[data-form-builder-done]")
    await page.waitForSelector("[data-form-confirm]", { visible: true })
    await wait(phone ? 500 : 250)
    assert.deepEqual(dialogs, [], "no browser confirm()")
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Keep editing" && b.getClientRects().length).click())
    await wait(phone ? 600 : 350)
    assert.ok(await page.$("[data-form-builder]"), "Keep editing keeps the builder")
    assert.equal(await page.$eval('[data-form-question="email"] input', (e) => e.value), "Your email", "and the change")

    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/forms-builder-${width}.png` })
    assert.deepEqual(errors, [])
    await context.close()
    console.log(
      `ok ${width}px builder: ${phone ? `bottom sheet, top at ${shape.top}px` : `centred dialog ${shape.width}x${shape.height}, scrollbar ${shape.scrollbarWidth} (${shape.bar}px)`}, question rows ${shape.rows.join("/")}px, settings closed (${shape.settings.length}), Questions list as a ${listAs}, confirm in Storelib's own sheet`,
    )
  }
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
}
