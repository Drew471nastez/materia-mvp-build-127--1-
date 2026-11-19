/**
 * A OnePage block's form, the same in the editor's phone, in Preview and live,
 * measured in Chromium (tests/onepage-forms-live.test.ts pins the code).
 *
 * The owner (rec19 image 22): "Antrenamente 1:1" opened "Get in touch" with
 * three Romanian questions, and the phone beside the editor drew the
 * template's "Your name", "Email address", "How can I help?". Here:
 *
 *   preview   the real LivePreviewFrame and its real frame (scripts/render-
 *             onepage-forms.tsx), the creator's list answering with the form
 *             whose published copy is still the template and whose draft is
 *             the Romanian one. The sheet must draw the Romanian questions,
 *             their dropdown options and required marks, at no frame the
 *             template's; a question added in the builder, the layout made
 *             steps, the button and the intro changed must each show in the
 *             open sheet within a moment; closing the builder goes back to
 *             the saved draft.
 *   booking   the same for a booking form: its length and badge, edited.
 *   live      the published page reads the published copy: the Romanian form,
 *             no preview note; Send with nothing filled sends nothing; filled,
 *             the answers go to /submit with the dropdown's option id; a form
 *             published meanwhile (409 form_changed) is read again and sent
 *             once more; the thanks settles in, takes the focus, and does not
 *             move under reduced motion.
 *
 *   ROOT=<checkout> CHROMIUM=... node scripts/check-onepage-forms.mjs
 */
import puppeteer from "puppeteer-core"
import { existsSync } from "node:fs"
import { join } from "node:path"

const root = process.env.ROOT || process.cwd()
const { serveEditorProbe } = await import(join(root, "scripts/onepage-probe-server.mjs"))
const chromium = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, message) => {
  if (!ok) failures.push(message)
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`)
}

const FORM_ID = "6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f"
const BOOKING_ID = "7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
const CONSENT = "I agree that my answers and contact details may be used to respond to this request."
const base = { description: "", mode: "form", layout: "single", button_text: "Send", consent_text: CONSENT, marketing_opt_in: false }
const TEMPLATE = {
  ...base,
  title: "Get in touch",
  fields: [
    { id: "name", type: "name", label: "Your name", required: true, placeholder: "First and last name" },
    { id: "email", type: "email", label: "Email address", required: true, placeholder: "you@example.com" },
    { id: "message", type: "textarea", label: "How can I help?", required: true },
  ],
  completion: { kind: "message", message: "Thanks. Your answers have been received." },
}
const ROMANIAN = {
  ...base,
  title: "Get in touch",
  fields: [
    { id: "name", type: "name", label: "Cum te numești?", required: true },
    { id: "email", type: "email", label: "Care este adresa ta de email?", required: true },
    { id: "how", type: "dropdown", label: "Cum ai prefera să lucrăm?", required: true, options: [{ id: "online", label: "Online" }, { id: "sala", label: "La sală" }] },
  ],
  completion: { kind: "message", message: "Mulțumesc! Îți scriu în curând." },
}
const BOOKING = {
  ...base,
  title: "Sesiune de evaluare",
  fields: [
    { id: "name", type: "name", label: "Cum te numești?", required: true },
    { id: "email", type: "email", label: "Care este adresa ta de email?", required: true },
  ],
  booking: { duration: 30, buffer: 0, timezone: "Europe/Bucharest", weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "06:00", end: "22:00" })), notice_hours: 0, days_ahead: 30, approval: false, badge: "Prima sesiune" },
  completion: { kind: "message", message: "Ne vedem atunci." },
}
const ROWS = [
  /* The owner's case: published once as the template, the Romanian questions saved since. */
  { id: FORM_ID, title: "Get in touch", status: "published", revision: 3, draft: ROMANIAN, published: TEMPLATE, updated_at: "2026-11-19T10:00:00Z", integration_settings: {} },
  { id: BOOKING_ID, title: "Sesiune de evaluare", status: "published", revision: 1, draft: BOOKING, published: BOOKING, updated_at: "2026-11-19T10:00:00Z", integration_settings: {} },
]

const { base: origin, server } = await serveEditorProbe({ root, entry: "scripts/render-onepage-forms.tsx" })
const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--disable-gpu"] })

/** A page whose /api/forms calls the probe answers. `live` is what the public read and Send answer. */
async function open(path, live = {}) {
  const page = await browser.newPage()
  page.on("pageerror", (e) => console.log("   pageerror", String(e).slice(0, 240)))
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  await page.setRequestInterception(true)
  const seen = { list: 0, public: [], submits: [] }
  page.on("request", (r) => {
    const u = new URL(r.url())
    const json = (body, status = 200) => r.respond({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) }).catch(() => {})
    if (u.pathname === "/api/forms") {
      seen.list++
      return void setTimeout(() => json({ forms: ROWS }), 150)
    }
    const m = u.pathname.match(/^\/api\/forms\/([^/]+)\/(public|submit)$/)
    if (m && r.method() === "OPTIONS") return void r.respond({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "Content-Type", "access-control-allow-methods": "GET, POST, OPTIONS" } }).catch(() => {})
    if (m && m[2] === "public") {
      seen.public.push(m[1])
      const answer = live.public ? live.public(m[1], seen) : null
      return void setTimeout(() => (answer ? json(answer) : json({ error: "This form is not available." }, 404)), 120)
    }
    if (m && m[2] === "submit") {
      const body = JSON.parse(r.postData() || "{}")
      seen.submits.push(body)
      const [status, answer] = live.submit ? live.submit(body, seen) : [201, { ok: true, message: "ok", href: null, action_type: null }]
      return void setTimeout(() => json(answer, status), 120)
    }
    if (u.hostname !== "127.0.0.1") return void r.respond({ status: 200, contentType: "text/html", body: "<!doctype html><body></body>" })
    void r.continue()
  })
  await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" })
  return { page, seen }
}

const labelsIn = (ctx) =>
  ctx.evaluate(() => {
    const form = document.querySelector("[data-block-sheet-panel] [data-native-form]")
    if (!form) return null
    return [...form.querySelectorAll("[data-question]")].map((q) => (q.querySelector("label, legend")?.textContent || "").replace(/\s+/g, " ").trim())
  })

async function untilIn(ctx, fn, arg, ms = 2000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const v = await ctx.evaluate(fn, arg).catch(() => null)
    if (v) return Date.now() - t0
    await sleep(16)
  }
  return null
}

try {
  /* ── preview: the editor's phone draws the form being edited ─────────────── */
  console.log("\n── preview")
  {
    /* The public read answers with the published copy, as the real route does: the template. Before the fix the frame drew this. */
    const { page, seen } = await open("/app?host", { public: (id) => (id === FORM_ID ? { form: { id, revision: 3, definition: TEMPLATE } } : { form: { id, revision: 1, definition: BOOKING } }) })
    await page.waitForFunction(() => window.__drawn === true, { timeout: 15000 })
    const frame = page.frames().find((f) => f.url().includes("/onepage-preview"))
    check(!!frame, "the editor's frame is drawn")
    /* Everything ever drawn in the frame, so a template question shown for one frame is caught. */
    await frame.evaluate(() => {
      window.__ever = new Set()
      new MutationObserver(() => {
        for (const el of document.querySelectorAll("[data-question] label, [data-question] legend")) window.__ever.add(el.textContent.replace(/\s+/g, " ").trim())
      }).observe(document.body, { subtree: true, childList: true, characterData: true })
    })
    await frame.$eval("[data-op-block=coaching] a", (a) => a.click())
    await frame.waitForSelector("[data-block-sheet-panel] [data-native-form]", { timeout: 5000 })
    await sleep(300)
    const labels = await labelsIn(frame)
    console.log("   questions:", JSON.stringify(labels))
    check(JSON.stringify(labels) === JSON.stringify(["Cum te numești? *", "Care este adresa ta de email? *", "Cum ai prefera să lucrăm? *"]), "the sheet draws the block's form: its three Romanian questions, in order, each marked required")
    /* Changed on purpose (round 24): the dropdown is the form's own combobox (components/forms/form-select), not a <select>. */
    await frame.$eval("[data-block-sheet-panel] [role=combobox]", (b) => b.click())
    await sleep(250)
    const options = [await frame.$eval("[data-block-sheet-panel] [role=combobox]", (b) => b.textContent.trim()), ...(await frame.$$eval("[data-block-sheet-panel] [role=option]", (o) => o.map((x) => x.textContent.trim())))]
    /* A second press closes it (a programmatic click does not focus the button, so Escape would go to the sheet). */
    await frame.$eval("[data-block-sheet-panel] [role=combobox]", (b) => b.click())
    await sleep(200)
    check(JSON.stringify(options) === JSON.stringify(["Choose…", "Online", "La sală"]), `the dropdown offers the form's own options (${options.join(", ")})`)
    const ever = await frame.evaluate(() => [...window.__ever])
    check(!ever.some((t) => /Your name|How can I help/.test(t)), "the template's questions were never drawn, at any frame")
    check(!seen.public.includes(FORM_ID), "the frame never read the published copy over the network")
    const note = await frame.$eval("[data-form-preview-note]", (p) => [p.getAttribute("data-form-preview-note"), p.textContent])
    check(note[0] === "changed" && /not published yet/i.test(note[1]), `the preview says the live page still has the published version ("${note[1].trim()}")`)

    /* The builder: a question added, then steps, the button and an intro. */
    const added = { ...ROMANIAN, fields: [...ROMANIAN.fields, { id: "goal", type: "textarea", label: "Ce obiectiv ai?", required: false }] }
    await page.evaluate((id, d) => window.__edit(id, d), FORM_ID, added)
    const t1 = await untilIn(frame, () => [...document.querySelectorAll("[data-block-sheet-panel] [data-question]")].some((q) => q.textContent.includes("Ce obiectiv ai?")))
    check(t1 !== null && t1 < 500, `a question added in the builder shows in the open sheet (${t1}ms)`)
    const reordered = { ...added, fields: [added.fields[2], added.fields[0], added.fields[1], added.fields[3]] }
    await page.evaluate((id, d) => window.__edit(id, d), FORM_ID, reordered)
    await sleep(200)
    const order = await labelsIn(frame)
    check(order?.[0] === "Cum ai prefera să lucrăm? *", `moving a question moves it in the sheet (${JSON.stringify(order)})`)
    await page.evaluate((id, d) => window.__edit(id, d), FORM_ID, { ...reordered, fields: reordered.fields.map((f) => (f.id === "how" ? { ...f, required: false } : f)) })
    await sleep(200)
    check((await labelsIn(frame))?.[0] === "Cum ai prefera să lucrăm?", "a question made optional loses its mark")
    await page.evaluate((id, d) => window.__edit(id, d), FORM_ID, { ...added, layout: "one_by_one", button_text: "Trimite", description: "Spune-mi câteva lucruri despre tine." })
    const t2 = await untilIn(frame, () => /Step 1 of 4/.test(document.querySelector("[data-form-progress]")?.textContent || ""))
    check(t2 !== null, `the layout made steps shows as steps (${t2}ms)`)
    const intro = await frame.evaluate(() => document.querySelector("[data-block-sheet-panel] [data-native-form] header")?.textContent || "")
    check(intro.includes("Spune-mi câteva lucruri despre tine."), "the intro shows")
    /* Walk to the last step: the button is the form's own. */
    for (const value of [["input", "Ana"], ["input", "ana@example.ro"], ["select", "sala"]]) {
      if (value[0] === "select") {
        /* Changed on purpose (round 24): the dropdown is picked as a visitor picks it, the combobox and then a row. */
        await frame.$eval("[data-block-sheet-panel] [data-native-form] [data-question] [role=combobox]", (b) => b.click())
        await sleep(250)
        await frame.$eval(`[data-block-sheet-panel] [role=option][data-option="${value[1]}"]`, (o) => o.click())
      } else await frame.evaluate(([tag, v]) => {
        const el = document.querySelector(`[data-block-sheet-panel] [data-native-form] [data-question] ${tag}`)
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
        setter.call(el, v)
        el.dispatchEvent(new Event("input", { bubbles: true }))
      }, value)
      await frame.$eval("[data-block-sheet-panel] [data-native-form] button[type=submit]", (b) => b.click())
      await sleep(260)
    }
    const button = await frame.$eval("[data-block-sheet-panel] [data-native-form] button[type=submit]", (b) => b.textContent.trim())
    check(button === "Trimite", `the last step's button reads the form's own words ("${button}")`)
    await page.evaluate((id) => window.__close(id), FORM_ID)
    const t3 = await untilIn(frame, () => document.querySelectorAll("[data-block-sheet-panel] [data-question]").length === 3 && !document.querySelector("[data-form-progress]"))
    check(t3 !== null, "the builder closed without saving: the sheet is the saved draft again")
    await page.close()
  }

  /* ── booking: the same for a booking form ───────────────────────────────── */
  console.log("\n── booking")
  {
    const { page, seen } = await open("/app?host")
    await page.waitForFunction(() => window.__drawn === true, { timeout: 15000 })
    const frame = page.frames().find((f) => f.url().includes("/onepage-preview"))
    await frame.$eval("[data-op-block=book] a", (a) => a.click())
    await frame.waitForSelector("[data-block-sheet-panel] [data-slot-picker]", { timeout: 5000 })
    await sleep(300)
    const meta = () => frame.evaluate(() => document.querySelector("[data-booking-meta]")?.textContent || "")
    const before = await meta()
    check(/Prima sesiune/.test(before) && /30 min/.test(before), `the booking form opens on its times, with its badge and length ("${before}")`)
    check(!seen.public.includes(BOOKING_ID), "and was not read as a visitor reads it")
    await page.evaluate((id, d) => window.__edit(id, d), BOOKING_ID, { ...BOOKING, booking: { ...BOOKING.booking, duration: 45, badge: "Cea mai cerută" } })
    const t = await untilIn(frame, () => /45 min/.test(document.querySelector("[data-booking-meta]")?.textContent || "") && /Cea mai cerută/.test(document.querySelector("[data-booking-meta]")?.textContent || ""))
    check(t !== null && t < 500, `its length and badge changed in the builder show in the open sheet (${t}ms)`)
    await page.close()
  }

  /* ── live: the published page, a visitor, Send ──────────────────────────── */
  console.log("\n── live")
  for (const reduced of [false, true]) {
    const live = {
      public: (id, seen) => (id === FORM_ID ? { form: { id: FORM_ID, revision: seen.public.filter((x) => x === FORM_ID).length > 1 ? 4 : 3, definition: ROMANIAN } } : { form: { id: BOOKING_ID, revision: 1, definition: BOOKING } }),
      /* The first Send meets a version published meanwhile. */
      submit: (body, seen) => (seen.submits.length === 1 ? [409, { error: "This form has changed. Reload it before sending.", form_changed: true }] : [201, { ok: true, message: ROMANIAN.completion.message, href: null, action_type: null, gated: null, booking: null }]),
    }
    const { page, seen } = await open("/app?live", live)
    if (reduced) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    await page.waitForSelector("[data-op-block=coaching] a")
    await page.$eval("[data-op-block=coaching] a", (a) => a.click())
    await page.waitForSelector("[data-block-sheet-panel] [data-native-form]", { timeout: 5000 })
    await sleep(300)
    if (!reduced) {
      const labels = await labelsIn(page)
      check(JSON.stringify(labels) === JSON.stringify(["Cum te numești? *", "Care este adresa ta de email? *", "Cum ai prefera să lucrăm? *"]), "live: the sheet draws the published Romanian form")
      check(!(await page.$("[data-form-preview-note]")), "live: no preview note")
      await page.$eval("[data-block-sheet-panel] [data-native-form] button[type=submit]", (b) => b.click())
      await sleep(200)
      const error = await page.evaluate(() => document.querySelector("[data-block-sheet-panel] [role=alert]")?.textContent || "")
      check(/Cum te numești/.test(error) && seen.submits.length === 0, `live: Send with nothing filled sends nothing and names the question ("${error}")`)
    }
    await page.type("[data-block-sheet-panel] [data-question=name] input", "Ana Pop")
    await page.type("[data-block-sheet-panel] [data-question=email] input", "ana@example.ro")
    /* Changed on purpose (round 24): the form's own dropdown, not a <select>. */
    await page.click("[data-block-sheet-panel] [data-question=how] [role=combobox]")
    await sleep(250)
    await page.click("[data-block-sheet-panel] [role=option][data-option=sala]")
    await page.$eval("[data-block-sheet-panel] [data-native-form] label input[type=checkbox]", (c) => c.click())
    await page.$eval("[data-block-sheet-panel] [data-native-form] button[type=submit]", (b) => b.click())
    await page.waitForSelector("[data-block-sheet-panel] [data-form-complete]", { timeout: 5000 })
    const done = await page.evaluate(() => {
      const el = document.querySelector("[data-block-sheet-panel] [data-form-complete]")
      return { text: el.textContent, focused: document.activeElement === el, animation: getComputedStyle(el).animationName }
    })
    if (!reduced) {
      check(seen.submits.length === 2, `live: a version published meanwhile is read again and the answers sent once more (${seen.submits.length} sends)`)
      const last = seen.submits.at(-1) || {}
      check(last.revision === 4 && last.consent === true && last.source === "onepage", `live: sent against the version now published (revision ${last.revision}), with consent`)
      check(JSON.stringify(last.answers) === JSON.stringify({ name: "Ana Pop", email: "ana@example.ro", how: "sala" }), `live: the answers as the server checks them, the dropdown by its option (${JSON.stringify(last.answers)})`)
      check(done.text.includes(ROMANIAN.completion.message), "live: the thanks is the form's own message")
      check(done.focused, "live: the thanks takes the focus")
      check(done.animation !== "none", `live: the thanks settles in (${done.animation})`)
    } else {
      check(done.animation === "none", "reduced motion: the thanks appears without moving")
    }
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}

console.log(failures.length ? `\n${failures.length} failed` : "\nall passed")
if (failures.length) process.exit(1)
