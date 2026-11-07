/**
 * Forms, bookings and Leads in a real browser, at 1280 and 390 px (and 320
 * for overflow): the builder (template, cleared title, a question with a
 * rule, publish, reload), a published booking form (times in the visitor's
 * zone, steps with progress, a question a rule shows), Leads (confirm a
 * booking, status, notes), the four presentations with the pop-up, the
 * same form on the website, creator page and OnePage, and an encoded
 * WhatsApp action. APIs are local fixtures.
 *
 *   CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome PROBE_CSS=source node scripts/check-native-features.mjs
 *
 * Screenshots go to SHOTS (default: forms-shots in the system temp folder) for the visual review.
 */
import assert from "node:assert/strict"
import { mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const id = "11111111-1111-4111-8111-111111111111"
const shots = process.env.SHOTS || join(tmpdir(), "forms-shots")
mkdirSync(shots, { recursive: true })
const booking = { duration: 30, buffer: 10, timezone: "Europe/London", weekly: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "09:00", end: "12:00" })), notice_hours: 0, days_ahead: 30, approval: true }
const publicDef = {
  title: "Book a coaching call",
  description: "Pick a time, then tell me a little about you.",
  mode: "form",
  layout: "steps",
  fields: [
    { id: "name", type: "name", label: "Your name", required: true },
    { id: "email", type: "email", label: "Email address", required: true },
    { id: "kind", type: "single", label: "Is this for a business?", required: true, options: [{ id: "biz", label: "Yes, a business" }, { id: "me", label: "No, just me" }] },
    { id: "company", type: "text", label: "Company name", required: true, show_if: [{ field: "kind", op: "is", value: "biz" }] },
    { id: "rating", type: "rating", label: "How ready are you to start?", required: false, max: 5, new_step: true },
  ],
  button_text: "Request this time",
  consent_text: "I agree that the coach can contact me about this request.",
  marketing_opt_in: true,
  booking,
  completion: { kind: "message", message: "Request sent. You will get an email when it is confirmed." },
}
let form = null,
  publicForm = null,
  leads = [],
  submitted = [],
  patches = [],
  revision = 0
const slotsFrom = (now) => {
  const out = []
  for (let d = 1; d <= 4; d++)
    for (const h of [9, 10, 11]) {
      const t = new Date(now + d * 86_400_000)
      t.setUTCHours(h, 0, 0, 0)
      out.push({ start: t.toISOString(), end: new Date(t.getTime() + 30 * 60_000).toISOString() })
    }
  return out
}
const api = (req, body) => {
  const path = new URL(req.url, "http://fixture").pathname
  if (req.method === "OPTIONS") return { status: 204, body: {} }
  if (path === "/api/forms" && req.method === "GET") return { body: { forms: form ? [form] : [] } }
  if (path === "/api/forms" && req.method === "POST") {
    const t = JSON.parse(body).template
    form = {
      id,
      title: "Get in touch",
      status: "draft",
      revision: 0,
      template: t,
      draft: { title: "Get in touch", description: "", mode: "form", layout: "single", fields: [{ id: "name", type: "name", label: "Your name", required: true }, { id: "email", type: "email", label: "Email address", required: true }, { id: "message", type: "textarea", label: "How can I help?", required: true }], button_text: "Send", consent_text: "I agree.", marketing_opt_in: false, completion: { kind: "message", message: "Thanks." } },
      published: null,
      updated_at: "v0",
      integration_settings: { notify_email: true, webhook: { enabled: false, url: "", secret_hint: null }, google_sheets: { prepared: false } },
    }
    return { status: 201, body: { form } }
  }
  if (path === `/api/forms/${id}` && req.method === "PATCH") {
    const b = JSON.parse(body)
    assert.equal(b.updated_at, form.updated_at, "the save carries the version it read")
    form = { ...form, draft: b.definition, title: b.definition.title, updated_at: "v" + ++revision, ...(b.publish ? { status: "published", published: b.definition, revision } : {}), integration_settings: b.integrations, retention_days: b.retention_days }
    return { body: { form } }
  }
  if (path === `/api/forms/${id}/public`) return publicForm ? { body: { form: { id, revision: 7, definition: publicForm } } } : { status: 404, body: { error: "Unavailable" } }
  if (path === `/api/forms/${id}/slots`) return { body: { duration: 30, owner_timezone: "Europe/London", slots: slotsFrom(Date.now()), next: null } }
  if (path === `/api/forms/${id}/submit`) {
    const b = JSON.parse(body)
    submitted.push(b)
    return { status: 201, body: { ok: true, message: publicForm.completion.message, href: null, action_type: null, booking: b.slot ? { starts_at: b.slot, status: "pending" } : null } }
  }
  if (path === "/api/leads" && req.method === "GET") return { body: { leads, next: null, upgraded: true } }
  if (path.startsWith("/api/leads/") && req.method === "PATCH") {
    const b = JSON.parse(body)
    patches.push(b)
    Object.assign(leads[0], b)
    return { body: { lead: { id: leads[0].id, status: leads[0].status } } }
  }
  if (path.startsWith("/api/bookings/") && req.method === "PATCH") {
    const b = JSON.parse(body)
    leads[0].booking.status = b.decision === "confirm" ? "confirmed" : "declined"
    return { body: { booking: { status: leads[0].booking.status } } }
  }
  if (path.startsWith("/_next/image")) return { status: 503, body: { error: "Use original" } }
  return null
}
const { base, server } = await serveEditorProbe({ entry: "scripts/render-native-features.tsx", statics: { "/audit-images/": process.cwd() + "/public/" }, api })
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] })
const visibleButton = (text) => (t) => [...document.querySelectorAll("button,a,[role=radio],[role=tab]")].find((e) => e.textContent.trim() === t && e.getClientRects().length)
const click = async (page, text) => {
  await page.waitForFunction((t) => [...document.querySelectorAll("button,a,[role=radio],[role=tab],[role=menuitem]")].some((e) => e.textContent.trim() === t && e.getClientRects().length), { timeout: 8000 }, text)
  assert.ok(
    await page.evaluate((t) => {
      const b = [...document.querySelectorAll("button,a,[role=radio],[role=tab],[role=menuitem]")].find((e) => e.textContent.trim() === t && e.getClientRects().length)
      b?.click()
      return !!b
    }, text),
    text,
  )
}
void visibleButton
const fill = async (page, selector, value) => {
  const el = await page.waitForSelector(selector, { visible: true })
  await el.click({ clickCount: 3 })
  await page.keyboard.down("Control")
  await page.keyboard.press("KeyA")
  await page.keyboard.up("Control")
  await page.keyboard.press("Backspace")
  if (value) await page.keyboard.type(value)
}
const byLabel = async (page, label, value, root = "body") => {
  const selector = await page.evaluate(
    (label, root) => {
      const l = [...document.querySelector(root).querySelectorAll("label")].find((l) => l.firstChild?.textContent?.trim() === label && l.getClientRects().length)
      const e = l?.querySelector("input,textarea") || (l?.htmlFor ? document.getElementById(l.htmlFor) : null)
      if (!e) return null
      e.dataset.auditInput = label
      return `[data-audit-input="${label}"]`
    },
    label,
    root,
  )
  assert.ok(selector, label)
  await fill(page, selector, value)
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
const save = (page, label) => Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/forms/" + id) && r.request().method() === "PATCH"), click(page, label)])
const report = []
try {
  for (const width of [1280, 390, 320]) {
    form = null
    publicForm = null
    leads = []
    submitted = []
    patches = []
    const context = await browser.createBrowserContext(),
      page = await context.newPage(),
      errors = []
    page.on("pageerror", (e) => errors.push(e.message))
    page.on("dialog", (d) => void d.accept())
    await page.setViewport({ width, height: 900 })
    await page.setRequestInterception(true)
    page.on("request", async (r) => {
      const u = new URL(r.url())
      if (u.hostname === "storelib.com" && u.pathname.startsWith("/api/forms/")) {
        const answer = api({ url: u.pathname, method: r.method() }, r.postData() || "")
        return void r.respond({ status: answer?.status || 200, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" }, body: JSON.stringify(answer?.body || {}) })
      }
      void r.continue()
    })
    const shot = (name) => page.screenshot({ path: `${shots}/${width}-${name}.png`, fullPage: true })
    const line = { width }

    /* The builder. */
    await page.goto(base + "/app/probe?mode=builder", { waitUntil: "domcontentloaded" })
    await page.waitForSelector("[data-forms-list]")
    await shot("forms-empty")
    await click(page, "Contact")
    await page.waitForSelector("[data-form-builder]")
    await byLabel(page, "Title", "")
    await save(page, "Save draft")
    assert.equal(form.draft.title, "", "A cleared title saves without being restored")
    await byLabel(page, "Title", "Personal coaching")
    await click(page, "Add question")
    await byLabel(page, "Question", "Company name", "[data-form-question]:last-child")
    await click(page, "Show only when an earlier answer matches")
    await click(page, "Steps")
    await save(page, "Publish")
    assert.equal(form.published.title, "Personal coaching")
    assert.equal(form.published.layout, "steps")
    const added = form.published.fields[form.published.fields.length - 1]
    assert.equal(added.label, "Company name")
    assert.deepEqual(added.show_if, [{ field: "message", op: "answered" }])
    line.builderOverflow = await overflow(page)
    await shot("builder")
    await page.reload({ waitUntil: "domcontentloaded" })
    await page.waitForSelector("[data-form-builder]")
    assert.equal(await page.$eval("[data-form-builder] h1", (e) => e.textContent), "Personal coaching", "?form= in the address reopens the form after a reload")
    await click(page, "← Forms")
    await page.waitForSelector("[data-forms-list] li")
    line.listOverflow = await overflow(page)
    await shot("forms-list")

    /* A published booking form, as a visitor. */
    publicForm = publicDef
    await page.goto(base + "/app/probe?mode=public", { waitUntil: "domcontentloaded" })
    await page.waitForSelector("[data-slot-picker] [role=radio]")
    line.slotButton = await page.$eval("[data-slot-picker] [role=radio]", (e) => Math.round(e.getBoundingClientRect().height))
    const zone = await page.$eval("[data-slot-picker] p", (e) => e.textContent)
    assert.match(zone, /Times shown in/)
    await shot("public-slots")
    await click(page, "Next")
    assert.match(await page.$eval("[role=alert]", (e) => e.textContent), /Choose a time/)
    await page.click("[data-slot-picker] [role=radio]")
    await click(page, "Next")
    await page.waitForSelector('[data-question="name"]')
    assert.match(await page.$eval("[data-form-progress]", (e) => e.textContent), /Step 2 of 3/)
    await fill(page, '[data-question="name"] input', "Jordan")
    await fill(page, '[data-question="email"] input', "jordan@example.com")
    await page.evaluate(() => [...document.querySelectorAll('[data-question="kind"] input')][1].click())
    assert.equal(await page.$('[data-question="company"]'), null, "A rule hides Company for a person")
    await page.evaluate(() => [...document.querySelectorAll('[data-question="kind"] input')][0].click())
    await page.waitForSelector('[data-question="company"]')
    await click(page, "Next")
    assert.match(await page.$eval("[role=alert]", (e) => e.textContent), /Company name/)
    await fill(page, '[data-question="company"] input', "Acme")
    await shot("public-step2")
    await click(page, "Next")
    await page.waitForSelector('[data-question="rating"]')
    await page.evaluate(() => document.querySelectorAll('[data-question="rating"] input')[3].click())
    line.ratingTap = await page.$eval('[data-question="rating"] label span', (e) => Math.round(e.getBoundingClientRect().height))
    await page.evaluate(() => [...document.querySelectorAll("form input[type=checkbox]")][0].click())
    await new Promise((r) => setTimeout(r, 1300))
    await shot("public-step3")
    await click(page, "Request this time")
    await page.waitForSelector("[data-form-complete]")
    assert.match(await page.$eval("[data-form-complete]", (e) => e.textContent), /Requested:/)
    const sent = submitted[submitted.length - 1]
    assert.equal(sent.answers.company, "Acme")
    assert.equal(sent.answers.rating, "4")
    assert.ok(sent.slot && sent.timezone, "the slot and the visitor's zone are sent")
    assert.equal(sent.website, "")
    line.publicOverflow = await overflow(page)
    await shot("public-done")

    /* Leads: confirm the booking, change status, write a note. */
    leads = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        form_id: id,
        form_title: "Book a coaching call",
        contact_name: "Jordan",
        contact_email: "jordan@example.com",
        contact_phone: "+44 7700 900123",
        answers: [
          { field_id: "name", label: "Your name", type: "name", value: "Jordan" },
          { field_id: "company", label: "Company name", type: "text", value: "Acme" },
          { field_id: "brief", label: "Brief", type: "file", value: "brief.pdf", file: { id: "33333333-3333-4333-8333-333333333333", name: "brief.pdf", type: "application/pdf", size: 1000 } },
        ],
        submitted_at: new Date().toISOString(),
        status: "new",
        source_kind: "onepage",
        source_block: "Book a call",
        source_url: "https://storelib.me/jordan",
        notes: null,
        score: 0,
        consent: { text: publicDef.consent_text, marketing: false, accepted: true },
        booking: { id: "44444444-4444-4444-8444-444444444444", starts_at: sent.slot, ends_at: sent.slot, status: "pending", visitor_timezone: "Europe/Bucharest" },
      },
    ]
    await page.goto(base + "/app/probe?mode=leads", { waitUntil: "domcontentloaded" })
    await page.waitForSelector("[data-lead] button")
    await page.click("[data-lead] > button")
    await page.waitForSelector("[data-lead-booking]")
    assert.ok(await page.$(`a[href="/api/leads/${leads[0].id}/files/33333333-3333-4333-8333-333333333333"]`), "a file answer links to the owner's signed download")
    await shot("leads-open")
    await click(page, "Confirm")
    await page.waitForFunction(() => document.querySelector("[data-lead-booking]").textContent.includes("Confirmed"))
    await click(page, "Qualified")
    await page.waitForFunction(() => document.querySelector('[role=radio][aria-checked="true"]')?.textContent === "Qualified")
    await page.type("[data-lead] textarea", "Called, sending a proposal")
    await page.$eval("[data-lead] textarea", (e) => e.blur())
    await page.waitForFunction(() => document.body.textContent.includes("Saved"))
    assert.deepEqual(patches, [{ status: "qualified" }, { notes: "Called, sending a proposal" }])
    assert.ok(await page.$('a[href^="/api/leads/export"]'))
    line.leadsOverflow = await overflow(page)

    /* Presentations: card, inline, expandable, and the pop-up. */
    publicForm = { ...publicDef, booking: undefined, layout: "single" }
    for (const as of ["card", "inline", "expandable", "modal"]) {
      await page.goto(base + `/app/probe?mode=presentation&as=${as}`, { waitUntil: "domcontentloaded" })
      await page.waitForSelector(`[data-form-presentation="${as}"]`)
      if (as === "expandable") {
        assert.equal(await page.$("[data-native-form]"), null)
        await click(page, "Book a call")
        await page.waitForSelector("[data-native-form]")
      }
      if (as === "modal") {
        await page.click('[data-form-presentation="modal"]')
        await page.waitForSelector("[role=dialog] [data-native-form]")
        await new Promise((r) => setTimeout(r, 600))
        line.dialogWidth = await page.$eval("[role=dialog] [data-native-form]", (e) => Math.round(e.getBoundingClientRect().width))
        await shot("dialog")
      } else await page.waitForSelector("[data-native-form]")
      line[`${as}Overflow`] = await overflow(page)
    }
    /* The same published definition on the three page surfaces. */
    for (const surface of ["website", "creator_page", "onepage"]) {
      await page.goto(base + "/app/probe?mode=" + surface)
      await page.waitForSelector("[data-native-form]")
      assert.equal(await page.$eval("[data-native-form] h2", (e) => e.textContent), "Book a coaching call")
      assert.equal(await overflow(page), 0)
    }
    await page.goto(base + "/app/probe?mode=action")
    await page.select('select[aria-label="Action type"]', "whatsapp")
    /* The number typed with its code: the country follows it (components/forms/action-editor). */
    await page.click("[data-native-action-editor] input[type=tel]")
    await page.keyboard.type("+40 712 345 678")
    await byLabel(page, "Message", "Hi! A&B? 🏋️")
    const href = await page.$eval("[data-action-href]", (e) => e.href)
    assert.equal(new URL(href).pathname, "/40712345678")
    assert.equal(new URL(href).searchParams.get("text"), "Hi! A&B? 🏋️")
    assert.deepEqual(errors, [])
    for (const [k, v] of Object.entries(line)) if (/Overflow$/.test(k)) assert.ok(v <= 0, `${k} at ${width}px: ${v}px of horizontal scroll`)
    if (width < 1000) {
      assert.ok(line.slotButton >= 44, `time buttons are ${line.slotButton}px tall`)
      assert.ok(line.ratingTap >= 44, `rating buttons are ${line.ratingTap}px tall`)
    }
    report.push(line)
    await context.close()
    console.log(`ok ${width}px:`, JSON.stringify(line))
  }
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
}
