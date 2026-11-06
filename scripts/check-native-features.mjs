/** Desktop/mobile: actual builder -> saved snapshot -> anonymous form -> Leads. */
import assert from "node:assert/strict"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"
const id = "11111111-1111-4111-8111-111111111111"
const baseDefinition = {
  title: "Contact us",
  description: "Tell us about you",
  mode: "form",
  fields: [
    { id: "name", type: "name", label: "Your name", required: true },
    { id: "email", type: "email", label: "Email address", required: true },
    {
      id: "goal",
      type: "single",
      label: "Your goal",
      required: true,
      options: [
        { id: "fit", label: "Get fit" },
        { id: "strong", label: "Get strong" },
      ],
    },
  ],
  button_text: "Send",
  consent_text: "I agree that the creator can contact me about this response.",
  marketing_opt_in: true,
  completion: { message: "Thanks. We will be in touch." },
}
let form = null,
  leads = [],
  submissions = 0,
  revision = 0
const api = (req, body) => {
  const path = new URL(req.url, "http://fixture").pathname
  if (req.method === "OPTIONS") return { status: 204, body: {} }
  if (path === "/api/forms" && req.method === "GET")
    return { body: { forms: form ? [form] : [] } }
  if (path === "/api/forms" && req.method === "POST") {
    form = {
      id,
      title: baseDefinition.title,
      status: "draft",
      revision: 0,
      draft: structuredClone(baseDefinition),
      published: null,
      updated_at: "v0",
    }
    return { body: { form } }
  }
  if (path === `/api/forms/${id}` && req.method === "PATCH") {
    const b = JSON.parse(body)
    assert.equal(b.updated_at, form.updated_at)
    form = {
      ...form,
      draft: b.definition,
      title: b.definition.title,
      updated_at: "v" + ++revision,
      ...(b.publish
        ? { status: "published", published: b.definition, revision }
        : {}),
      integration_settings: b.integrations,
    }
    return { body: { form } }
  }
  if (path === `/api/forms/${id}/public`)
    return form?.published
      ? {
          body: {
            form: { id, revision: form.revision, definition: form.published },
          },
        }
      : { status: 404, body: { error: "Unavailable" } }
  if (path === `/api/forms/${id}/submit`) {
    const b = JSON.parse(body)
    assert.equal(b.consent, true)
    assert.equal(b.marketing, false)
    submissions++
    leads = [
      {
        id: "22222222-2222-4222-8222-222222222222",
        form_id: id,
        form_title: form.title,
        contact_name: b.answers.name,
        contact_email: b.answers.email,
        contact_phone: null,
        answers: form.published.fields.map((f) => ({
          field_id: f.id,
          label: f.label,
          type: f.type,
          value: f.id === "goal" ? "Get strong" : b.answers[f.id],
        })),
        submitted_at: new Date().toISOString(),
        status: "new",
        source_kind: "form",
        source_url: null,
        score: 0,
        consent: { text: form.published.consent_text, marketing: false },
      },
    ]
    return {
      status: 201,
      body: {
        ok: true,
        message: form.published.completion.message,
        href: null,
        action_type: null,
      },
    }
  }
  if (path === "/api/leads") return { body: { leads, next: null } }
  if (path.startsWith("/api/leads/") && req.method === "PATCH") {
    leads[0].status = JSON.parse(body).status
    return { body: { ok: true } }
  }
  if (path === "/audit-state")
    return {
      body: {
        avatar: "/audit-images/icon-light-32x32.png",
        blocks: [
          {
            id: "header",
            type: "header",
            enabled: true,
            sort_order: 0,
            data: { show_avatar: true, show_name: true, show_bio: true },
          },
          {
            id: "email",
            type: "email_capture",
            enabled: true,
            sort_order: 1,
            data: {
              headline: "Clear this headline",
              description: "Clear this description",
              button_text: "Subscribe",
            },
          },
        ],
        theme: globalThis.coverTheme || {},
      },
    }
  if (path === "/api/onepage" && req.method === "PUT") {
    const b = JSON.parse(body)
    globalThis.coverTheme = b.theme
    return { body: { ok: true } }
  }
  if (path.startsWith("/_next/image"))
    return { status: 503, body: { error: "Use original" } }
  return null
}
const { base, server } = await serveEditorProbe({
  entry: "scripts/render-native-features.tsx",
  statics: { "/audit-images/": process.cwd() + "/public/" },
  api,
})
const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM || "/tmp/chromium",
  args: ["--no-sandbox"],
})
const click = async (page, text) => {
  await page.waitForFunction(
    (text) =>
      [...document.querySelectorAll("button")].some(
        (e) => e.textContent.trim() === text && e.getClientRects().length,
      ),
    {},
    text,
  )
  assert.ok(
    await page.evaluate((text) => {
      const b = [...document.querySelectorAll("button")].find(
        (e) => e.textContent.trim() === text && e.getClientRects().length,
      )
      b?.click()
      return !!b
    }, text),
    text,
  )
}
const fill = async (page, selector, value) => {
  const el = await page.waitForSelector(selector, { visible: true })
  await el.click({ clickCount: 3 })
  await page.keyboard.down("Control")
  await page.keyboard.press("KeyA")
  await page.keyboard.up("Control")
  await page.keyboard.press("Backspace")
  if (value) await page.keyboard.type(value)
}
const labelInput = async (page, label, value) => {
  const selector = await page.evaluate((label) => {
    const l = [...document.querySelectorAll("label")].find(
      (l) => l.firstChild?.textContent === label,
    )
    const e = l?.querySelector("input,textarea")
    if (!e) return null
    e.dataset.auditInput = label
    return `[data-audit-input="${label}"]`
  }, label)
  assert.ok(selector, label)
  await fill(page, selector, value)
}
try {
  for (const width of [1440, 390, 320]) {
    form = null
    leads = []
    const context = await browser.createBrowserContext(),
      page = await context.newPage(),
      errors = []
    page.on("pageerror", (e) => errors.push(e.message))
    page.on("dialog", (d) => void d.accept())
    await page.setViewport({ width, height: 900 })
    await page.setRequestInterception(true)
    page.on("request", async (r) => {
      const u = new URL(r.url())
      if (
        u.hostname === "storelib.com" &&
        u.pathname.startsWith("/api/forms/")
      ) {
        const answer = api(
          { url: u.pathname, method: r.method() },
          r.postData() || "",
        )
        return void r.respond({
          status: answer?.status || 200,
          contentType: "application/json",
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "content-type",
          },
          body: JSON.stringify(answer?.body || {}),
        })
      }
      void r.continue()
    })
    await page.goto(base + "/app/probe?mode=builder", {
      waitUntil: "domcontentloaded",
    })
    await click(page, "Create form")
    await page.waitForSelector("[data-form-builder]")
    await labelInput(page, "Form title", "")
    assert.equal(
      await page.$eval('[data-audit-input="Form title"]', (e) => e.value),
      "",
    )
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/forms/" + id) &&
          r.request().method() === "PATCH",
      ),
      click(page, "Save draft"),
    ])
    assert.equal(
      form.draft.title,
      "",
      "An intentionally cleared title saves without being restored",
    )
    await labelInput(page, "Form title", "Personal coaching")
    await labelInput(page, "Description", "")
    assert.equal(
      await page.$eval('[data-audit-input="Description"]', (e) => e.value),
      "",
    )
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/forms/" + id) &&
          r.request().method() === "PATCH",
      ),
      click(page, "Publish form"),
    ])
    assert.equal(form.published.description, "")
    await page.reload({ waitUntil: "domcontentloaded" })
    await page.waitForFunction(() =>
      document.body.textContent.includes("Personal coaching"),
    )
    await click(page, "Personal coachingpublished")
    assert.equal(
      await page.$eval("[data-form-builder] label input", (e) => e.value),
      "Personal coaching",
    )
    await page.goto(base + "/app/probe?mode=public", {
      waitUntil: "domcontentloaded",
    })
    await page.waitForSelector("[data-native-form]")
    await fill(page, 'input[aria-label="Your name"]', "Jordan")
    await fill(page, 'input[aria-label="Email address"]', "jordan@example.com")
    await page.evaluate(() => {
      const radios = document.querySelectorAll("input[type=radio]")
      radios[radios.length - 1].click()
      document.querySelector("input[type=checkbox]").click()
    })
    await new Promise((r) => setTimeout(r, 750))
    const before = submissions
    await click(page, "Send")
    await page.waitForSelector("[data-form-complete]")
    assert.equal(submissions, before + 1)
    await page.goto(base + "/app/probe?mode=leads", {
      waitUntil: "domcontentloaded",
    })
    await page.waitForSelector("[data-lead]")
    await page.click("[data-lead] summary")
    await page.waitForFunction(() =>
      document.body.textContent.includes("Get strong"),
    )
    await page.select("[data-lead] select", "qualified")
    await page.waitForFunction(() =>
      document
        .querySelector("[data-lead] summary")
        .textContent.includes("qualified"),
    )
    assert.equal(leads[0].status, "qualified")
    await page.reload()
    await page.waitForFunction(() =>
      document.body.textContent.includes("qualified"),
    )
    assert.ok(await page.$('a[href^="/api/leads/export"]'))
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    )
    // The same published definition renders on all three page surfaces.
    for (const surface of ["website", "creator_page", "onepage"]) {
      await page.goto(base + "/app/probe?mode=" + surface)
      await page.waitForSelector("[data-native-form]")
      assert.equal(
        await page.$eval("[data-native-form] h2", (e) => e.textContent),
        "Personal coaching",
      )
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      )
    }
    await page.goto(base + "/app/probe?mode=builder")
    await click(page, "Personal coachingpublished")
    await page.evaluate(() => {
      const label = [...document.querySelectorAll("label")].find(
        (e) => e.firstChild?.textContent === "Presentation",
      )
      const select = label.querySelector("select")
      select.value = "quiz"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/forms/" + id) &&
          r.request().method() === "PATCH",
      ),
      click(page, "Publish form"),
    ])
    assert.equal(form.published.mode, "quiz")
    await page.goto(base + "/app/probe?mode=public")
    await page.waitForSelector("[data-native-form]")
    await fill(page, 'input[aria-label="Your name"]', "Jordan Quiz")
    await click(page, "Next")
    await fill(page, 'input[aria-label="Email address"]', "quiz@example.com")
    await click(page, "Back")
    assert.equal(
      await page.$eval('input[aria-label="Your name"]', (e) => e.value),
      "Jordan Quiz",
    )
    await click(page, "Next")
    await click(page, "Next")
    await page.evaluate(() => {
      document.querySelector("input[type=radio]").click()
      document.querySelector("input[type=checkbox]").click()
    })
    await new Promise((r) => setTimeout(r, 750))
    await click(page, "Send")
    await page.waitForSelector("[data-form-complete]")
    await page.goto(base + "/app/probe?mode=action")
    await page.select('select[aria-label="Action type"]', "whatsapp")
    await labelInput(page, "International phone number", "+40 712 345 678")
    await labelInput(page, "Prefilled message", "Hi! A&B? 🏋️")
    const href = await page.$eval("[data-action-href]", (e) => e.href)
    assert.equal(new URL(href).pathname, "/40712345678")
    assert.equal(new URL(href).searchParams.get("text"), "Hi! A&B? 🏋️")
    assert.deepEqual(errors, [])
    await context.close()
    console.log(
      `ok ${width}px: real form builder, empty inputs, publish/refresh, anonymous submission, lead answers/status and encoded WhatsApp`,
    )
  }
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
}
