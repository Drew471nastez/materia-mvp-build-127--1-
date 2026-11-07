/**
 * OnePage CTA actions in a real browser (round AK, track AK4).
 *
 *   PROBE_CSS=source node scripts/check-onepage-actions.mjs
 *
 * The real action editor (components/forms/action-editor) and the real
 * public page (components/onepage/public-onepage), bundled by
 * scripts/onepage-probe-server.mjs. The network is a fixture: the form's
 * public definition and its submit answer are served here, and the address
 * a chat opens is caught before it leaves.
 *
 * At 390px and 1280px:
 *   1. an old wa.me link opens in the editor as a WhatsApp chat, number and
 *      message read back, and builds the same address
 *   2. a whole international number pasted under another country moves the
 *      picker to that country and builds the E.164 address
 *   3. a template and a variable chip go into the message, encoded
 *   4. a Telegram username or a group invite that is not one says so
 *   5. on the page: the button's address carries the block's title as
 *      {service}; email and phone buttons stay in the tab; a chat with a
 *      pre-chat form opens the form, and its answers fill the message of the
 *      chat that opens after it
 */
import assert from "node:assert/strict"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const FORM = "aaaaaaaa-0000-4000-8000-0000000000aa"
const definition = {
  title: "Before we chat",
  description: "",
  mode: "form",
  fields: [
    { id: "full_name", type: "name", label: "Your name", required: true },
    { id: "goal", type: "text", label: "Your goal", required: false },
  ],
  button_text: "Send",
  consent_text: "I agree to be contacted.",
  marketing_opt_in: false,
  completion: { message: "Thanks." },
}

let state = { avatar: null, theme: {}, blocks: [] }
const submitted = []
const { base, server } = await serveEditorProbe({
  entry: "scripts/render-onepage-actions.tsx",
  api(req) {
    if (req.url === "/audit-state") return { body: state }
    return null
  },
})
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

const intercept = async (page, caught) => {
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (u.hostname === "wa.me" || u.hostname === "t.me") {
      caught.push(r.url())
      return void r.respond({ status: 200, contentType: "text/html", body: "<p>chat</p>" })
    }
    if (u.hostname === "storelib.com" && u.pathname === `/api/forms/${FORM}/public`)
      return void r.respond({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ form: { id: FORM, revision: 3, definition } }) })
    if (u.hostname === "storelib.com" && u.pathname === `/api/forms/${FORM}/submit`) {
      if (r.method() === "OPTIONS") return void r.respond({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST" } })
      submitted.push(JSON.parse(r.postData() || "{}"))
      return void r.respond({ status: 201, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ok: true, message: "Thanks.", href: null, action_type: null }) })
    }
    if (u.hostname === "placeholder.supabase.co") return void r.respond({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, contentType: "application/json", body: "[]" })
    void r.continue()
  })
}

const typeInto = async (page, selector, value) => {
  const el = await page.waitForSelector(selector, { visible: true })
  await el.click({ clickCount: 3 })
  await page.keyboard.down("Control")
  await page.keyboard.press("KeyA")
  await page.keyboard.up("Control")
  await page.keyboard.press("Backspace")
  if (value) await page.keyboard.type(value)
}
const byLabel = (page, label, tag = "input,textarea,select") =>
  page.evaluate((label, tag) => {
    const l = [...document.querySelectorAll("label")].find((x) => x.firstChild?.textContent?.trim() === label && x.getClientRects().length)
    const el = l?.querySelector(tag)
    if (!el) return null
    el.dataset.probe = label
    return `[data-probe="${label}"]`
  }, label, tag)
const probeHref = (page) => page.$eval("[data-probe-href]", (e) => e.getAttribute("data-probe-href"))

try {
  for (const width of [390, 1280]) {
    /* ── the editor ── */
    if (!process.env.SKIP_EDITOR) {
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      const errors = []
      page.on("pageerror", (e) => errors.push(e.message))
      await page.setViewport({ width, height: 900 })
      await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
      await intercept(page, [])
      /* 1: an old link, read into the model. */
      await page.goto(base + "/app/actions?mode=editor&legacy=" + encodeURIComponent("https://wa.me/40712345678?text=Hi%20there%20%26%20welcome"))
      await page.waitForSelector("[data-native-action-editor]")
      assert.equal(await page.$eval("[data-native-action-editor]", (e) => e.getAttribute("data-action-type")), "whatsapp", "an old wa.me link is a WhatsApp chat")
      assert.equal(await page.$eval('select[aria-label="Action type"]', (e) => e.value), "whatsapp")
      const shownPhone = await page.$eval("[data-native-action-editor] input[type=tel]", (e) => e.value)
      const prefix = await page.$eval("[data-phone-prefix]", (e) => e.getAttribute("data-phone-prefix"))
      assert.equal(prefix, "+40", "the country follows the saved number")
      assert.equal(shownPhone.replace(/\D/g, ""), "712345678")
      assert.equal(await page.$eval(await byLabel(page, "Message", "textarea"), (e) => e.value), "Hi there & welcome")
      assert.equal(await probeHref(page), "https://wa.me/40712345678?text=Hi%20there%20%26%20welcome")

      /* 2: a number pasted whole moves the country. */
      await page.goto(base + "/app/actions?mode=editor")
      await page.select('select[aria-label="Action type"]', "whatsapp")
      /* Pasted, as a whole number arrives: the field's own prefix stands for the code, so a typed "+" is not how one is entered. */
      await page.$eval("[data-native-action-editor] input[type=tel]", (el) => {
        el.focus()
        document.execCommand("insertText", false, "+44 7700 900123")
      })
      assert.equal(await page.$eval("[data-phone-prefix]", (e) => e.getAttribute("data-phone-prefix")), "+44", "a +44 number moves the picker to the UK")
      assert.equal(await probeHref(page), "https://wa.me/447700900123")
      /* 3: a template, then a chip at the end of it. */
      await page.select('select[aria-label="Start from a template"]', "product")
      const message = await byLabel(page, "Message", "textarea")
      await page.$eval(message, (e) => {
        e.focus()
        e.setSelectionRange(e.value.length, e.value.length)
      })
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent === "Visitor's name").click())
      await new Promise((r) => setTimeout(r, 100))
      const value = await page.evaluate(() => window.__action)
      assert.equal(value.message, "Hi, I'm interested in {product_name}. Is it available?{visitor_name}")
      /* Unfilled variables are removed from the address. */
      assert.equal(await probeHref(page), "https://wa.me/447700900123?text=" + encodeURIComponent("Hi, I'm interested in. Is it available?"))
      assert.ok((await page.$eval("[data-action-opens]", (e) => e.textContent)).startsWith("Opens wa.me/447700900123"))
      /* The button's words live on the action. */
      await typeInto(page, await byLabel(page, "Button text"), "Ask on WhatsApp")
      assert.equal((await page.evaluate(() => window.__action)).label, "Ask on WhatsApp")
      /* 4: Telegram and groups say what is wrong. */
      await page.select('select[aria-label="Action type"]', "telegram")
      await typeInto(page, await byLabel(page, "Username or link"), "https://evil.example/t.me/x")
      assert.ok(await page.evaluate(() => document.body.textContent.includes("Use a username like @storelib")))
      await typeInto(page, await byLabel(page, "Username or link"), "@storelib_shop")
      assert.equal(await probeHref(page), "https://t.me/storelib_shop")
      await page.select('select[aria-label="Action type"]', "whatsapp_group")
      await typeInto(page, await byLabel(page, "Group invite link"), "https://chat.whatsapp.com.evil.com/AbCdEf1234567890")
      assert.ok(await page.evaluate(() => document.body.textContent.includes("Paste the invite link from WhatsApp")))
      assert.equal(await probeHref(page), "")
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      assert.equal(overflow, false, "no sideways scroll")
      assert.deepEqual(errors, [])
      await context.close()
      console.log(`ok ${width}px editor: old wa.me link read back, pasted +44 number moves the country, template and chip encoded, Telegram and group links checked`)
    }

    /* ── the page ── */
    {
      state = {
        avatar: null,
        theme: { background_type: "solid", background_color: "#ffffff", text_color: "#1a1a2e" },
        blocks: [
          { id: "h", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } },
          { id: "wa", type: "link_button", enabled: true, sort_order: 1, data: { label: "Deep tissue massage", url: "", action: { type: "whatsapp", phone: "+40712345678", message: "Hi, I'd like to book {service} & more #1" } } },
          { id: "mail", type: "link_button", enabled: true, sort_order: 2, data: { label: "Email me", url: "", action: { type: "email", email: "hello@example.com", subject: "Hello there" } } },
          { id: "call", type: "link_button", enabled: true, sort_order: 3, data: { label: "Call me", url: "", action: { type: "phone", phone: "+40712345678" } } },
          { id: "old", type: "link_button", enabled: true, sort_order: 4, data: { label: "Old WhatsApp", url: "https://wa.me/40712345678?text=Hi+old" } },
          { id: "pre", type: "link_button", enabled: true, sort_order: 5, data: { label: "Coaching", url: "", action: { type: "whatsapp", phone: "+40712345678", message: "Hi, I'm {visitor_name}. Goal: {answer:goal}. {unknown}", pre_chat: { form_id: FORM } } } },
          { id: "bad", type: "link_button", enabled: true, sort_order: 6, data: { label: "Broken", url: "javascript:alert(1)", action: { type: "url", url: "javascript:alert(1)" } } },
        ],
      }
      const caught = []
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      const errors = []
      page.on("pageerror", (e) => errors.push(e.message))
      await page.setViewport({ width, height: 900 })
      await intercept(page, caught)
      await page.goto(base + "/app/onepage?live")
      await page.waitForSelector("[data-op-header]")
      const links = await page.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll("a")]
            .filter((a) => a.getClientRects().length && a.textContent.trim())
            .map((a) => [a.textContent.trim(), { href: a.getAttribute("href"), target: a.getAttribute("target") }]),
        ),
      )
      assert.equal(links["Deep tissue massage"].href, "https://wa.me/40712345678?text=" + encodeURIComponent("Hi, I'd like to book Deep tissue massage & more #1"), JSON.stringify(links))
      assert.equal(links["Deep tissue massage"].target, "_blank")
      assert.equal(links["Email me"].href, "mailto:hello@example.com?subject=Hello%20there")
      assert.equal(links["Email me"].target, null, "an email opens in place")
      assert.equal(links["Call me"].href, "tel:+40712345678")
      assert.equal(links["Call me"].target, null)
      assert.equal(links["Old WhatsApp"].href, "https://wa.me/40712345678?text=Hi+old", "an old link opens what it always opened")
      assert.ok(!links["Broken"], "a javascript: action draws no link")
      assert.ok(!(await page.evaluate(() => [...document.querySelectorAll("a")].some((a) => /^\s*(javascript|data):/i.test(a.getAttribute("href") || "")))), "no javascript: or data: address on the page")
      /* The pre-chat form, then the chat with the answers in its message. */
      await page.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Coaching" && a.getClientRects().length).click())
      await page.waitForSelector("[data-native-form]")
      assert.equal(caught.length, 0, "the chat waits for the form")
      await typeInto(page, 'input[aria-label="Your name"]', "Ana & Ion")
      await typeInto(page, 'input[aria-label="Your goal"]', "Run 10k 🏃")
      await page.evaluate(() => [...document.querySelectorAll("[data-native-form] input[type=checkbox]")].forEach((c) => !c.checked && c.click()))
      await new Promise((r) => setTimeout(r, 700))
      await page.evaluate(() => [...document.querySelectorAll("[data-native-form] button")].find((b) => b.textContent.trim() === "Send").click())
      for (let i = 0; i < 40 && !caught.length; i++) await new Promise((r) => setTimeout(r, 100))
      assert.equal(submitted.length > 0, true, "the answers were saved first")
      /* The browser writes an apostrophe as %27 on the way out; the message itself is what matters. */
      assert.equal(new URL(caught[0]).origin + new URL(caught[0]).pathname, "https://wa.me/40712345678", caught[0])
      assert.equal(new URL(caught[0]).searchParams.get("text"), "Hi, I'm Ana & Ion. Goal: Run 10k 🏃.", caught[0])
      assert.deepEqual(errors, [])
      await context.close()
      submitted.length = 0
      console.log(`ok ${width}px page: {service} from the title, email and phone in place, old wa.me kept, no script address, pre-chat answers fill the WhatsApp message`)
    }
  }
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
}
