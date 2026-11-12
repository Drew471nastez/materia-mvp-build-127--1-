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
/* When each chat was asked for, and what the page noted before it left (round AN). */
const caughtTimes = []
const notes = {}
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
      caughtTimes.push(Date.now())
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
/* Round AN: a field's label either wraps it or names it with htmlFor (the message, whose label shares a row with Templates). */
const byLabel = (page, label, tag = "input,textarea,select") =>
  page.evaluate((label, tag) => {
    const l = [...document.querySelectorAll("label")].find((x) => x.firstChild?.textContent?.trim() === label && x.getClientRects().length)
    const el = l?.htmlFor ? document.getElementById(l.htmlFor) : l?.querySelector(tag)
    if (!el) return null
    el.dataset.probe = label
    return `[data-probe="${label}"]`
  }, label, tag)
const probeHref = (page) => page.$eval("[data-probe-href]", (e) => e.getAttribute("data-probe-href"))
/*
  Changed on purpose (round AN): every list in the action editor is Storelib's
  ChoicePicker (components/ui/choice-list), a popover on a computer and the
  shared sheet on a phone. Picking is a press on the field, then on the row;
  the probe also says which of the two the list opened as.
*/
const pickChoice = async (page, name, value) => {
  await page.click(`[data-choice-field="${name}"]`)
  const row = await page.waitForSelector(`[data-choice-popover="${name}"] [data-choice="${value}"], [data-choice-sheet] [data-choice="${value}"]`, { visible: true })
  const surface = await row.evaluate((r) => (r.closest("[data-choice-popover]") ? "popover" : "sheet"))
  await new Promise((r) => setTimeout(r, 120))
  await row.evaluate((r) => r.click())
  /* The list goes (the sheet slides away) before the next step reads the page. */
  for (let i = 0; i < 30; i++) {
    const open = await page.evaluate(() => !!document.querySelector("[data-choice-popover]") || [...document.querySelectorAll("[data-choice-sheet]")].some((s) => s.getClientRects().length && s.closest("[aria-modal=true]")))
    if (!open) break
    await new Promise((r) => setTimeout(r, 50))
  }
  await new Promise((r) => setTimeout(r, 100))
  return surface
}

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
      /* Changed on purpose (round AN): the Action list is Storelib's ChoicePicker, never a native select; its field names the action. */
      assert.match(await page.$eval('[data-choice-field="action-type"]', (e) => e.textContent), /WhatsApp chat/)
      const shownPhone = await page.$eval("[data-native-action-editor] input[type=tel]", (e) => e.value)
      const prefix = await page.$eval("[data-phone-prefix]", (e) => e.getAttribute("data-phone-prefix"))
      assert.equal(prefix, "+40", "the country follows the saved number")
      assert.equal(shownPhone.replace(/\D/g, ""), "712345678")
      assert.equal(await page.$eval(await byLabel(page, "Message", "textarea"), (e) => e.value), "Hi there & welcome")
      assert.equal(await probeHref(page), "https://wa.me/40712345678?text=Hi%20there%20%26%20welcome")

      /* 2: a number pasted whole moves the country. */
      await page.goto(base + "/app/actions?mode=editor")
      await pickChoice(page, "action-type", "whatsapp")
      /* Typed key by key, the "+" first: kept until the code is known, then the country follows. */
      await typeInto(page, "[data-native-action-editor] input[type=tel]", "+44 7700 900123")
      assert.equal(await page.$eval("[data-phone-prefix]", (e) => e.getAttribute("data-phone-prefix")), "+44", "a +44 number moves the picker to the UK")
      assert.equal(await probeHref(page), "https://wa.me/447700900123")
      /* Pasted whole, under another country. */
      await page.$eval("[data-native-action-editor] input[type=tel]", (el) => {
        el.focus()
        el.select()
        document.execCommand("insertText", false, "0040 712 345 678")
      })
      assert.equal(await page.$eval("[data-phone-prefix]", (e) => e.getAttribute("data-phone-prefix")), "+40", "a pasted 0040 number moves the picker to Romania")
      assert.equal(await probeHref(page), "https://wa.me/40712345678")
      await typeInto(page, "[data-native-action-editor] input[type=tel]", "+44 7700 900123")
      /* 3: a template, then a chip at the end of it. */
      const templateSurface = await pickChoice(page, "message-template", "product")
      assert.equal(templateSurface, width < 640 ? "sheet" : "popover", "Templates is a popover on a computer and the sheet on a phone")
      const message = await byLabel(page, "Message", "textarea")
      await page.$eval(message, (e) => {
        e.focus()
        e.setSelectionRange(e.value.length, e.value.length)
      })
      await page.evaluate(() => document.querySelector('[data-variable="{name}"]').click())
      await new Promise((r) => setTimeout(r, 100))
      const value = await page.evaluate(() => window.__action)
      /* Changed on purpose (round AN): a chip that would touch the word before it gets a space. */
      assert.equal(value.message, "Hi, I'm interested in {product_name}. Is it available? {name}")
      /* Each variable the message uses says what it puts in, and the message is shown as a visitor would send it. */
      const meant = await page.evaluate(() => [...document.querySelectorAll("[data-variable-meaning]")].map((e) => e.getAttribute("data-variable-meaning")))
      assert.deepEqual(meant, ["{name}", "{product_name}"], "the meanings of the variables in use, in order")
      const example = await page.$eval("[data-message-example]", (e) => e.textContent)
      assert.ok(/Alex/.test(example) && !/\{/.test(example), example)
      /* Unfilled variables are removed from the address. */
      assert.equal(await probeHref(page), "https://wa.me/447700900123?text=" + encodeURIComponent("Hi, I'm interested in. Is it available?"))
      assert.ok((await page.$eval("[data-action-opens]", (e) => e.textContent)).startsWith("Opens wa.me/447700900123"))
      /* A chip goes in where the caret is, not at the end, and the message keeps the focus (the keyboard stays up). */
      await page.$eval(message, (e) => {
        e.focus()
        e.setSelectionRange(3, 3)
      })
      await page.evaluate(() => document.querySelector('[data-variable="{service}"]').click())
      await new Promise((r) => setTimeout(r, 100))
      const mid = await page.$eval(message, (e) => ({ value: e.value, caret: e.selectionStart, focused: document.activeElement === e }))
      assert.ok(mid.value.startsWith("Hi, {service} I'm interested"), mid.value)
      /* {service} in the message brings its own field: the service this button books, in the address too. */
      assert.ok(await page.$("[data-variable-service] input"), "a Service field once {service} is used")
      assert.equal(mid.caret, 13, "the caret lands after the token")
      assert.equal(mid.focused, true, "the message keeps the focus")
      /* The chips sit clear of the message (the owner: "glued"), and the message is the 12px-cornered field. */
      const gap = await page.evaluate(() => {
        const t = document.querySelector("[data-message-box] textarea").getBoundingClientRect()
        const c = document.querySelector("[data-variable-chips]").getBoundingClientRect()
        const cs = getComputedStyle(document.querySelector("[data-message-box] textarea"))
        return { gap: Math.round(c.top - t.bottom), radius: cs.borderTopLeftRadius, chipsRight: Math.round(c.right), boxRight: Math.round(t.right) }
      })
      assert.ok(gap.gap >= 8 && gap.gap <= 14, JSON.stringify(gap))
      assert.equal(gap.radius, "12px")
      assert.ok(gap.chipsRight <= gap.boxRight + 1, "the chips wrap inside the message's width")
      console.log(`   ${width}px message: chips ${gap.gap}px under the message, radius ${gap.radius}, templates as a ${templateSurface}`)
      if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/action-editor-${width}.png`, fullPage: true })
      /* The button's words live on the action. */
      await typeInto(page, await byLabel(page, "Button text"), "Ask on WhatsApp")
      assert.equal((await page.evaluate(() => window.__action)).label, "Ask on WhatsApp")
      /* 4: Telegram and groups say what is wrong. */
      await pickChoice(page, "action-type", "telegram")
      await typeInto(page, await byLabel(page, "Username or link"), "https://evil.example/t.me/x")
      assert.ok(await page.evaluate(() => document.body.textContent.includes("Use a username like @storelib")))
      await typeInto(page, await byLabel(page, "Username or link"), "@storelib_shop")
      assert.equal(await probeHref(page), "https://t.me/storelib_shop")
      await pickChoice(page, "action-type", "whatsapp_group")
      await typeInto(page, await byLabel(page, "Group invite link"), "https://chat.whatsapp.com.evil.com/AbCdEf1234567890")
      assert.ok(await page.evaluate(() => document.body.textContent.includes("Paste the invite link from WhatsApp")))
      assert.equal(await probeHref(page), "")
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      assert.equal(overflow, false, "no sideways scroll")
      assert.deepEqual(errors, [])
      await context.close()
      console.log(`ok ${width}px editor: old wa.me link read back, typed +44 and pasted 0040 numbers move the country, template and chip encoded, Telegram and group links checked`)
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
      for (const k of Object.keys(notes)) delete notes[k]
      caughtTimes.length = 0
      await page.exposeFunction("__note", (k, v) => { if (notes[k] === undefined) notes[k] = v })
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
      /*
        Round AN: the pre-chat form opens in the block sheet, like every other
        block. The probe watches whether the placeholder was ever drawn
        (the form is read from the press), when the sheet left, and when the
        chat was asked for: the chat must come after the sheet has gone.
      */
      await page.evaluate(() => {
        window.__loadingSeen = false
        window.__sheetGoneAt = 0
        new MutationObserver(() => {
          if (document.querySelector("[data-form-loading]")) window.__note("loading", true)
          if (window.__sheetSeen && !document.querySelector("[data-block-sheet]")) window.__note("gone", Date.now())
          if (document.querySelector("[data-block-sheet]")) window.__sheetSeen = true
        }).observe(document.body, { childList: true, subtree: true })
      })
      const coaching = await page.evaluateHandle(() => [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Coaching" && a.getClientRects().length))
      const pressedAt = Date.now()
      await coaching.click()
      await page.waitForSelector("[data-block-sheet] [data-native-form]", { visible: true })
      const formShownMs = Date.now() - pressedAt
      assert.equal(caught.length, 0, "the chat waits for the form")
      const sheet = await page.evaluate(() => {
        const body = document.querySelector("[data-block-sheet-body]")
        const panel = document.querySelector("[data-block-sheet-panel]").getBoundingClientRect()
        return { title: document.querySelector("[data-block-sheet-title]").textContent, bar: body.offsetWidth - body.clientWidth, scrollbarWidth: getComputedStyle(body).scrollbarWidth, panelBottom: Math.round(panel.bottom), panelWidth: Math.round(panel.width) }
      })
      assert.equal(sheet.title, "Coaching", "the sheet carries the button's words")
      assert.equal(sheet.bar, 0, "no scrollbar drawn in the sheet")
      /* The keyboard on a phone: ViewportVars publishes how much of the screen it covers; the sheet's foot and the focused field stay above it. */
      if (width < 640) {
        await page.focus('[data-question="full_name"] input')
        await page.evaluate(() => {
          document.documentElement.style.setProperty("--kb-inset", "320px")
          document.documentElement.style.setProperty("--vv-h", `${innerHeight - 320}px`)
        })
        await new Promise((r) => setTimeout(r, 450))
        const kb = await page.evaluate(() => {
          const foot = document.querySelector("[data-block-sheet-foot]").getBoundingClientRect()
          const field = document.querySelector('[data-question="full_name"] input').getBoundingClientRect()
          const panel = document.querySelector("[data-block-sheet-panel]").getBoundingClientRect()
          return { footBottom: Math.round(foot.bottom), fieldBottom: Math.round(field.bottom), panelTop: Math.round(panel.top), panelBottom: Math.round(panel.bottom), keysTop: innerHeight - 320 }
        })
        assert.ok(kb.footBottom <= kb.keysTop + 1, `the sheet's foot sits on the keyboard ${JSON.stringify(kb)}`)
        assert.ok(kb.fieldBottom <= kb.keysTop, `the focused field is above the keyboard ${JSON.stringify(kb)}`)
        assert.ok(kb.panelTop >= 0, `the sheet stays on screen ${JSON.stringify(kb)}`)
        console.log(`   ${width}px keyboard of 320px: sheet foot ends at ${kb.footBottom}, field at ${kb.fieldBottom}, keys start at ${kb.keysTop}, sheet top ${kb.panelTop}`)
        await page.evaluate(() => {
          document.documentElement.style.removeProperty("--kb-inset")
          document.documentElement.style.removeProperty("--vv-h")
        })
      }
      await typeInto(page, '[data-question="full_name"] input', "Ana & Ion")
      await typeInto(page, '[data-question="goal"] input', "Run 10k 🏃")
      await page.evaluate(() => [...document.querySelectorAll("[data-native-form] input[type=checkbox]")].forEach((c) => !c.checked && c.click()))
      await new Promise((r) => setTimeout(r, 700))
      await page.evaluate(() => [...document.querySelectorAll("[data-native-form] button")].find((b) => b.textContent.trim() === "Send").click())
      let chatAt = 0
      for (let i = 0; i < 40 && !caught.length; i++) await new Promise((r) => setTimeout(r, 100))
      chatAt = caughtTimes[0] ?? Date.now()
      assert.equal(submitted.length > 0, true, "the answers were saved first")
      const after = { gone: notes.gone ?? 0, loading: !!notes.loading }
      if (after) {
        assert.ok(after.gone > 0 && after.gone <= chatAt, `the chat opens after the sheet has gone ${JSON.stringify(after)}`)
        console.log(`   ${width}px sheet: form shown ${formShownMs}ms after the press, placeholder ${after.loading ? "seen" : "never drawn"}, scrollbar ${sheet.bar}px, panel ${sheet.panelWidth}px wide; chat asked for after the sheet left`)
      } else console.log(`   ${width}px sheet: form shown ${formShownMs}ms after the press; the page had already left for the chat`)
      /* The browser writes an apostrophe as %27 on the way out; the message itself is what matters. */
      assert.equal(new URL(caught[0]).origin + new URL(caught[0]).pathname, "https://wa.me/40712345678", caught[0])
      assert.equal(new URL(caught[0]).searchParams.get("text"), "Hi, I'm Ana & Ion. Goal: Run 10k 🏃.", caught[0])
      assert.deepEqual(errors, [])
      await context.close()
      submitted.length = 0
      console.log(`ok ${width}px page: {service} from the title, email and phone in place, old wa.me kept, no script address, pre-chat answers fill the WhatsApp message`)
    }

    /* ── round AN: on a dark page the form in the sheet is dark too, its fields the sheet's own fill ── */
    {
      state = { ...state, theme: { background_type: "solid", background_color: "#0b0b0f", text_color: "#f4f4f5" } }
      const context = await browser.createBrowserContext()
      const page = await context.newPage()
      const errors = []
      page.on("pageerror", (e) => errors.push(e.message))
      await page.setViewport({ width, height: 900 })
      await intercept(page, [])
      await page.goto(base + "/app/onepage?live")
      await page.waitForSelector("[data-op-header]")
      await page.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Coaching" && a.getClientRects().length).click())
      await page.waitForSelector("[data-block-sheet] [data-native-form]", { visible: true })
      await new Promise((r) => setTimeout(r, 400))
      const look = await page.evaluate(() => {
        const input = document.querySelector('[data-block-sheet] [data-question="full_name"] input')
        const panel = document.querySelector("[data-block-sheet-panel]")
        const label = document.querySelector('[data-block-sheet] [data-question="full_name"] label')
        const lum = (c) => {
          const [r, g, b] = (c.match(/[\d.]+/g) || []).map(Number)
          return 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        const cs = getComputedStyle(input)
        return { panel: getComputedStyle(panel).backgroundColor, field: cs.backgroundColor, ink: getComputedStyle(label).color, panelLum: Math.round(lum(getComputedStyle(panel).backgroundColor)), inkLum: Math.round(lum(getComputedStyle(label).color)) }
      })
      assert.ok(look.panelLum < 60, `the sheet is dark on a dark page ${JSON.stringify(look)}`)
      assert.ok(look.inkLum > 180, `the form's words are light in it ${JSON.stringify(look)}`)
      assert.notEqual(look.field, "rgb(255, 255, 255)", "no white boxes pasted on the dark sheet")
      assert.deepEqual(errors, [])
      await context.close()
      console.log(`ok ${width}px dark page: sheet ${look.panel}, field ${look.field}, label ${look.ink}`)
    }
  }
} finally {
  await browser.close()
  await new Promise((r) => server.close(r))
}
