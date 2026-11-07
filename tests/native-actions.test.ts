/**
 * The CTA action model (lib/forms/actions): every address a OnePage button
 * can open is built, encoded and checked there. These pin the builders on
 * the inputs that break hand written links: unicode, emoji, &, #, line
 * breaks, missing and unknown variables, and numbers that are not numbers.
 *
 *   npx tsx tests/native-actions.test.ts
 */
import assert from "node:assert/strict"
import {
  actionFormId,
  actionFromUrl,
  actionHref,
  actionLabel,
  actionOpensNewTab,
  cleanValue,
  e164,
  fillTemplate,
  formVars,
  internalPath,
  internationalPhone,
  normaliseAction,
  readAction,
  telegramTarget,
  webUrl,
  whatsappGroupUrl,
} from "../lib/forms/actions"

let passed = 0
const check = (name: string, fn: () => void) => {
  try {
    fn()
    passed++
  } catch (e) {
    console.error("FAIL " + name)
    throw e
  }
}
const FORM = "aaaaaaaa-0000-4000-8000-000000000001"
const PRODUCT = "bbbbbbbb-0000-4000-8000-000000000002"
const text = (href: string | null, key = "text") => new URL(href as string).searchParams.get(key)

check("WhatsApp: the number as E.164 digits in the path", () => {
  const href = actionHref({ type: "whatsapp", phone: "+40 (712) 345-678" })
  assert.equal(href, "https://wa.me/40712345678")
})
check("WhatsApp: 00 before the country code is the same number", () => {
  assert.equal(actionHref({ type: "whatsapp", phone: "0040 712 345 678" }), "https://wa.me/40712345678")
})
check("WhatsApp: unicode, emoji, &, # and line breaks survive the round trip", () => {
  const message = "Bună ziua! Café & crème #2 💪🏽\nLine two\n\nLast? 100% = yes + more"
  const href = actionHref({ type: "whatsapp", phone: "+40712345678", message })!
  assert.equal(text(href), message)
  assert.ok(!href.includes(" ") && !href.includes("\n") && !href.includes("#"), href)
  assert.ok(href.includes("%26") && href.includes("%23") && href.includes("%0A"), href)
  /* A space is %20, never "+": a "+" in the text stays a plus. */
  assert.ok(href.includes("%20") && href.includes("%2B"), href)
})
check("WhatsApp: no text parameter for an empty message", () => {
  assert.equal(actionHref({ type: "whatsapp", phone: "+14155550123", message: "" }), "https://wa.me/14155550123")
  assert.equal(actionHref({ type: "whatsapp", phone: "+14155550123", message: "{unknown}" }), "https://wa.me/14155550123")
})
check("WhatsApp: invalid phones build nothing", () => {
  for (const phone of ["", "12345", "0712345678", "+0712345678", "+40 712 abc 678", "javascript:alert(1)", "+1234567890123456", "++40712345678x"]) {
    assert.equal(actionHref({ type: "whatsapp", phone }), null, phone)
  }
  assert.equal(internationalPhone({} as unknown), null)
  assert.equal(e164("+40 712 345 678"), "+40712345678")
  assert.equal(e164("0712"), "0712")
})
check("templates: variables are filled and encoded", () => {
  const href = actionHref(
    { type: "whatsapp", phone: "+40712345678", message: "Hi, I'm {visitor_name}. I'd like {product_name} for {service}. Goal: {answer:goal}" },
    { visitor_name: "Ana & Ion", product_name: "Plan #1 💪", service: "Coaching", answers: { goal: ["strength", "speed"] } },
  )
  assert.equal(text(href), "Hi, I'm Ana & Ion. I'd like Plan #1 💪 for Coaching. Goal: strength, speed")
})
check("templates: missing and unknown variables are removed, the sentence tidied", () => {
  assert.equal(fillTemplate("Hi {visitor_name}, about {product_name}!"), "Hi, about!")
  assert.equal(fillTemplate("Hello {nope} there {answer:missing} {secret:x}"), "Hello there")
  assert.equal(fillTemplate("{ visitor_name }", { visitor_name: "Mia" }), "Mia")
  assert.equal(fillTemplate("Ends {x}  here"), "Ends here")
  /* The creator's own spacing is left alone when nothing was removed. */
  assert.equal(fillTemplate("Price :  10", {}), "Price :  10")
  assert.equal(fillTemplate("Line {x}\nnext"), "Line\nnext")
})
check("templates: a visitor's value cannot inject control characters or bidi overrides", () => {
  assert.equal(cleanValue("a\u0000b‮c\r\nd"), "abc\nd")
  assert.equal(cleanValue("x".repeat(900)).length, 500)
  assert.equal(fillTemplate("{visitor_name}", { visitor_name: "{service}" }, ), "{service}")
})
check("templates: a value that looks like a variable is not filled again", () => {
  assert.equal(fillTemplate("{visitor_name} {service}", { visitor_name: "{service}", service: "Yoga" }), "{service} Yoga")
})
check("pre-chat answers become variables", () => {
  const vars = formVars([{ id: "full", type: "name" }, { id: "service", type: "single" }], { full: "Ana", service: "Massage", goal: "Rest", "bad key!": "x" })
  assert.equal(vars.visitor_name, "Ana")
  assert.equal(vars.service, "Massage")
  assert.equal(vars.answers!.goal, "Rest")
  assert.ok(!("bad key!" in vars.answers!))
  assert.equal(fillTemplate("{visitor_name} wants {service}, {answer:goal}", vars), "Ana wants Massage, Rest")
})
check("WhatsApp groups: only chat.whatsapp.com invites and channels", () => {
  assert.equal(whatsappGroupUrl("chat.whatsapp.com/AbCdEf1234567890"), "https://chat.whatsapp.com/AbCdEf1234567890")
  assert.equal(whatsappGroupUrl("https://chat.whatsapp.com/AbCdEf1234567890?mode=r_c"), "https://chat.whatsapp.com/AbCdEf1234567890")
  assert.equal(whatsappGroupUrl("https://whatsapp.com/channel/0029VaAbCdEf1234"), "https://whatsapp.com/channel/0029VaAbCdEf1234")
  for (const bad of ["https://chat.whatsapp.com.evil.com/AbCdEf1234567890", "https://evil.com/chat.whatsapp.com/AbCdEf1234567890", "https://user@chat.whatsapp.com/AbCdEf1234567890", "javascript:alert(1)", "https://chat.whatsapp.com/", "https://chat.whatsapp.com/abc"]) {
    assert.equal(whatsappGroupUrl(bad), null, bad)
  }
  assert.equal(actionHref({ type: "whatsapp_group", url: "chat.whatsapp.com/AbCdEf1234567890" }), "https://chat.whatsapp.com/AbCdEf1234567890")
})
check("Telegram: users, bots, groups, channels, invites, phones and posts", () => {
  const cases: [string, string][] = [
    ["@storelib_shop", "https://t.me/storelib_shop"],
    ["storelib_shop", "https://t.me/storelib_shop"],
    ["t.me/storelib_shop", "https://t.me/storelib_shop"],
    ["https://telegram.me/storelib_shop/", "https://t.me/storelib_shop"],
    ["https://t.me/s/storelib_news", "https://t.me/storelib_news"],
    ["tg://resolve?domain=storelib_bot", "https://t.me/storelib_bot"],
    ["https://t.me/+AbCdEfGhIjKlMn", "https://t.me/+AbCdEfGhIjKlMn"],
    ["https://t.me/joinchat/AbCdEfGhIjKlMn", "https://t.me/+AbCdEfGhIjKlMn"],
    ["https://t.me/+447911123456", "https://t.me/+447911123456"],
    ["https://t.me/storelib_news/42", "https://t.me/storelib_news/42"],
    ["https://t.me/c/123456789/42", "https://t.me/c/123456789/42"],
  ]
  for (const [input, want] of cases) assert.equal(actionHref({ type: "telegram", target: input }), want, input)
  for (const bad of ["@ab", "1abcde", "https://t.me.evil.com/name", "https://evil.com/t.me/name", "javascript:alert(1)", "tg://msg?text=x", "https://t.me/"]) {
    assert.equal(telegramTarget(bad), null, bad)
  }
})
check("Telegram: a message goes to a username, never to an invite", () => {
  assert.equal(text(actionHref({ type: "telegram", target: "@storelib_shop", message: "Hi & #1 ✨" })), "Hi & #1 ✨")
  assert.equal(actionHref({ type: "telegram", target: "https://t.me/+AbCdEfGhIjKlMn", message: "Hi" }), "https://t.me/+AbCdEfGhIjKlMn")
})
check("email: subject and body encoded with %20, line breaks kept", () => {
  const href = actionHref({ type: "email", email: "coach@example.com", subject: "Your plan & more", message: "Hello\nwelcome #1 💌" })!
  assert.ok(href.startsWith("mailto:coach@example.com?subject=Your%20plan%20%26%20more&body="), href)
  assert.ok(!href.includes("+"), href)
  assert.equal(decodeURIComponent(href.split("body=")[1]), "Hello\nwelcome #1 💌")
  assert.equal(actionHref({ type: "email", email: "not-an-email" }), null)
  assert.equal(actionHref({ type: "email", email: "a@b.com\r\nBcc: x@y.com" }), null)
  /* A subject is one line, whatever the template gave. */
  assert.ok(actionHref({ type: "email", email: "a@b.co", subject: "One\nTwo" })!.includes("subject=One%20Two"))
})
check("phone and SMS", () => {
  assert.equal(actionHref({ type: "phone", phone: "+40 712 345 678" }), "tel:+40712345678")
  assert.equal(actionHref({ type: "sms", phone: "+40712345678", message: "Hi & bye" }), "sms:+40712345678?body=Hi%20%26%20bye")
  assert.equal(actionHref({ type: "sms", phone: "123" }), null)
})
check("web addresses: only http(s), no credentials, no script", () => {
  assert.equal(actionHref({ type: "url", url: "javascript:alert(1)" }), null)
  assert.equal(actionHref({ type: "url", url: "data:text/html,<script>alert(1)</script>" }), null)
  assert.equal(actionHref({ type: "url", url: "JaVaScRiPt:alert(1)" }), null)
  assert.equal(actionHref({ type: "url", url: "https://user:pw@example.com" }), null)
  assert.equal(actionHref({ type: "url", url: "//evil.com" }), null)
  assert.equal(actionHref({ type: "url", url: "https://example.com/a?b=1#c" }), "https://example.com/a?b=1#c")
  assert.equal(webUrl("https://exa\nmple.com"), null)
})
check("internal: a path or a place on the page", () => {
  assert.equal(actionHref({ type: "internal", path: "/shop" }), "/shop")
  assert.equal(actionHref({ type: "internal", path: "#faq" }), "#faq")
  for (const bad of ["//evil.com", "https://evil.com", "javascript:alert(1)", "/a b", "#bad id"]) assert.equal(internalPath(bad), null, bad)
})
check("product, form and booking", () => {
  assert.ok(actionHref({ type: "product", product_id: PRODUCT })!.endsWith("/checkout?productId=" + PRODUCT))
  assert.equal(actionHref({ type: "product", product_id: "invalid" }), null)
  assert.ok(actionHref({ type: "form", form_id: FORM })!.endsWith("/request/forms/" + FORM))
  assert.ok(actionHref({ type: "booking", form_id: FORM })!.endsWith("/request/forms/" + FORM))
  assert.equal(actionHref({ type: "booking", url: "https://cal.com/me" }), "https://cal.com/me")
  assert.equal(actionHref({ type: "booking", url: "javascript:alert(1)" }), null)
  assert.equal(actionHref({ type: "appointment", url: "https://calendly.com/me" }), "https://calendly.com/me")
  assert.equal(actionFormId({ type: "booking", form_id: FORM }), FORM)
  assert.equal(actionFormId({ type: "whatsapp", phone: "+40712345678", pre_chat: { form_id: FORM } }), FORM)
  assert.equal(actionFormId({ type: "url", url: "https://x.com" }), null)
})
check("normalise: unknown fields dropped, phones kept as E.164, bad values refused", () => {
  const wa = normaliseAction({ type: "whatsapp", phone: "+40 712 345 678", message: "Hi\r\n{visitor_name}", secret: "x", pre_chat: { form_id: FORM, extra: 1 }, country: "RO", label: "Chat with me" })!
  assert.deepEqual(wa, { type: "whatsapp", phone: "+40712345678", message: "Hi\n{visitor_name}", country: "RO", pre_chat: { form_id: FORM }, label: "Chat with me" })
  assert.equal(normaliseAction({ type: "whatsapp", phone: { bad: true }, message: ["bad"] }), null)
  assert.equal(normaliseAction({ type: "nope", url: "https://x.com" }), null)
  assert.equal(normaliseAction({ type: "telegram", target: "https://evil.com/x" }), null)
  assert.equal((normaliseAction({ type: "whatsapp", phone: "+40712345678", pre_chat: { form_id: "nope" } }) as any).pre_chat, undefined)
  assert.equal((normaliseAction({ type: "product", product_id: PRODUCT, image: "javascript:x" }) as any).image, undefined)
  assert.equal((normaliseAction({ type: "product", product_id: PRODUCT }) as any).open, "sheet")
})
check("old links are read into the model", () => {
  assert.deepEqual(actionFromUrl("https://wa.me/40712345678?text=Hello%20there%20%26%20hi"), { type: "whatsapp", phone: "+40712345678", message: "Hello there & hi" })
  assert.deepEqual(actionFromUrl("wa.me/14155550123"), { type: "whatsapp", phone: "+14155550123", message: "" })
  assert.deepEqual(actionFromUrl("https://api.whatsapp.com/send?phone=40712345678&text=Hi"), { type: "whatsapp", phone: "+40712345678", message: "Hi" })
  assert.equal(actionFromUrl("https://chat.whatsapp.com/AbCdEf1234567890")!.type, "whatsapp_group")
  assert.equal(actionFromUrl("https://t.me/storelib_shop")!.type, "telegram")
  assert.deepEqual(actionFromUrl("mailto:me@example.com?subject=Hi%20there&body=Yes"), { type: "email", email: "me@example.com", subject: "Hi there", message: "Yes" })
  assert.deepEqual(actionFromUrl("tel:+40712345678"), { type: "phone", phone: "+40712345678" })
  assert.equal(actionFromUrl("https://example.com")!.type, "url")
  assert.equal(actionFromUrl("javascript:alert(1)"), null)
  /* A wa.me link without a usable number is still the address it was. */
  assert.equal(actionFromUrl("https://wa.me/message/ABC123")!.type, "url")
  /* The saved action wins over the address; with none, the address is read. */
  assert.equal(readAction({ action: { type: "phone", phone: "+40712345678" }, url: "https://wa.me/1" })!.type, "phone")
  assert.equal(readAction({ url: "https://wa.me/40712345678" })!.type, "whatsapp")
  assert.equal(readAction({}), null)
  /* And the address an old link opens is the one it always opened. */
  assert.equal(actionHref(actionFromUrl("https://wa.me/40712345678?text=Hi")), "https://wa.me/40712345678?text=Hi")
})
check("labels and tabs", () => {
  assert.equal(actionLabel({ type: "whatsapp", phone: "+40712345678", label: "Ask me" }), "Ask me")
  assert.equal(actionLabel({ type: "telegram", target: "@abcd" }), "Message on Telegram")
  assert.equal(actionOpensNewTab({ type: "email", email: "a@b.co" }), false)
  assert.equal(actionOpensNewTab({ type: "whatsapp", phone: "+40712345678" }), true)
})

console.log(`native actions: ${passed} groups passed`)
