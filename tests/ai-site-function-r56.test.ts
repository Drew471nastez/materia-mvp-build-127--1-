/**
 * ===========================================================================
 *  ROUND 56 (worker c): EVERYTHING A GENERATED WEBSITE CAN PRESS WORKS
 * ===========================================================================
 *   1. a contact form's other fields reach the creator, under their labels,
 *      through the same endpoint and its limits (contactMessageFrom)
 *   2. forms that go nowhere, or to a place that cannot take what they ask,
 *      are named (formProblems) and refused by the render check
 *      (render.form); search and filter forms pass; every form Storelib
 *      ships passes (the default theme, the library's examples, the
 *      starting templates)
 *   3. the page's half: contact fields read off the form, the quantity box
 *      and the option picked beside an add button, a form that goes nowhere
 *      says so, a search form opens /search (source pins; the behaviour is
 *      measured in Chromium by scripts/check-ai-site-function-r56.mjs)
 *   4. the native engine: a button whose address does not resolve on its
 *      page (an anchor to nothing, a product binding left empty, /products
 *      on a store that sells nothing) is not drawn, and a written one is
 *      reported to the repair turn; the six scripted scenarios raise none
 *   5. the generator is told (HEADLESS_HOOK_GUIDE, storelib-forms v2)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CONTACT_MESSAGE_MAX, contactMessageFrom } from "@/lib/website-builder/contact-client"
import { formProblems, isSearchForm } from "@/lib/ai-builder/agent/form-fields"
import { renderCheck } from "@/lib/ai-builder/render-check"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import { allExamples } from "@/lib/storelib-ai/library/examples"
import { SITE_TEMPLATES } from "@/lib/storelib-ai/templates/registry"
import { HEADLESS_HOOK_GUIDE } from "@/lib/ai-builder/runtime-contract"
import { KNOWLEDGE_SOURCES } from "@/lib/storelib-ai/library/index.generated"
import { nativeRegistry } from "@/lib/website-builder/ai-site/native/registry"
import { validateNativeSite } from "@/lib/website-builder/ai-site/native/validate"
import type { NativeContext } from "@/lib/website-builder/ai-site/native/types"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { SCENARIOS, CALL_FORM, kv, sec, site } from "./native-engine-r2-fixtures"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const d = detail === undefined ? "" : ` (${JSON.stringify(detail).slice(0, 400)})`
    failures.push(label + d)
    console.log(`  FAIL  ${label}${d}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const kinds = (html: string) => formProblems(html).map((p) => p.kind).sort().join(",")

async function main() {
  /* ── 1 ── */
  console.log("\n1. A contact form's other fields reach the creator")
  const msg = contactMessageFrom("Hi, can I join on Thursdays?", [
    { name: "name", label: "Name", value: "Ana" },
    { name: "email", label: "Email", value: "ana@example.com" },
    { name: "company", label: "Company", value: "bot" },
    { name: "phone", label: "Phone number", value: "0712 345 678" },
    { name: "service", label: "Which class *", value: "Strength basics" },
    { name: "days", label: "Days that suit you", value: "Tuesday" },
    { name: "days", label: "Days that suit you", value: "Thursday" },
    { name: "budget_range", label: "", value: "  under   100 " },
    { name: "notes", label: "Anything else", value: "" },
  ])
  check("the visitor's own words come first", msg.startsWith("Hi, can I join on Thursdays?\n\n"), msg)
  check("each other field is a line under its label", msg.includes("Phone number: 0712 345 678") && msg.includes("Which class: Strength basics"), msg)
  check("ticked boxes of one group share a line", msg.includes("Days that suit you: Tuesday, Thursday"), msg)
  check("a field with no label is named from its name, spaces collapsed", msg.includes("Budget range: under 100"), msg)
  check("what the endpoint reads itself, the honeypot and empty fields are not repeated", !/Ana|ana@example|bot|Anything else|Name:|Email:/.test(msg), msg)
  check("with nothing else, the message is unchanged", contactMessageFrom(" Hello ", [{ name: "email", label: "Email", value: "a@b.co" }]) === "Hello")
  check("a form with no message box still sends what it asked", contactMessageFrom("", [{ name: "phone", label: "Phone", value: "123" }]) === "Phone: 123")
  const long = contactMessageFrom("x".repeat(4990), [{ name: "phone", label: "Phone", value: "1".repeat(200) }])
  check(`never longer than the endpoint keeps (${CONTACT_MESSAGE_MAX})`, long.length <= CONTACT_MESSAGE_MAX && long.startsWith("x".repeat(4990)), long.length)
  const route = read("lib/site-contact/contact.ts")
  check("the endpoint's limit is the one used here", /message:\s*5000/.test(route) && CONTACT_MESSAGE_MAX === 5000)

  /* ── 2 ── */
  console.log("\n2. Forms that go nowhere are named and refused")
  check("no hook, no action, no email box: nowhere", kinds('<form class="x"><label>Your name <input name="name" placeholder="Name"></label><button>Send</button></form>') === "nowhere")
  check("an unknown data-storelib-form", kinds('<form data-storelib-form="booking"><input type="email" name="email"></form>') === "unknown")
  check("native with no action", kinds('<form data-storelib-form="native"><input type="email" name="email"></form>') === "native")
  check("native with an action passes", kinds('<form data-storelib-form="native" action="https://list.example/subscribe"><input type="email" name="email"></form>') === "")
  check("a contact form with no email box", kinds('<form data-storelib-form="contact"><input name="name"><textarea name="message"></textarea></form>') === "no_email")
  check("a sign up form with a file box", kinds('<form data-storelib-form="subscribe"><input type="email" name="email"><input type="file" name="cv"></form>') === "file")
  check("a contact form with only a name and an email", kinds('<form data-storelib-form="contact"><input name="name"><input type="email" name="email"><input type="checkbox" name="consent"></form>') === "no_message")
  check("a contact form with a phone and a date but no textarea passes", kinds('<form data-storelib-form="contact"><input name="name"><input type="email" name="email"><input type="tel" name="phone"><input type="date" name="date"></form>') === "")
  check("an email box with no hook is a sign up (the page's default) and passes", kinds('<form><input type="email" name="email"><button>Join</button></form>') === "")
  check("a search form and a shop's filters are not checked", kinds('<form role="search"><input type="search" name="q"></form><form data-storelib-filters><select name="sort"></select></form><form><input type="search" name="q"></form>') === "" && isSearchForm('<form action="/search">', ""))

  const theme = {} as ThemeSettingsValues
  const shipped: string[] = []
  for (const path of Object.keys(DEFAULT_THEME_SOURCES).filter((p) => p.startsWith("sections/") && /<form\b/.test(DEFAULT_THEME_SOURCES[p]))) {
    const type = path.slice(9).replace(/\.storelib$/, "")
    for (const template of ["index", "page.contact", "password", "login", "account", "search", "collection", "product"]) {
      const out = renderStorelibSection({ id: `t-${type}`, type, settings: {}, blocks: [] } as unknown as SectionInstance, theme, { template })
      if (out.ok && /<form\b/i.test(out.html)) for (const p of formProblems(out.html)) shipped.push(`${path} (${template}): ${p.kind}`)
    }
  }
  check("every form in the default theme passes", shipped.length === 0, shipped)
  const ex: string[] = []
  let exForms = 0
  for (const e of allExamples()) {
    const path = `sections/${e.id}.storelib`
    const out = renderStorelibSection({ id: `e-${e.id}`, type: e.id, settings: {}, blocks: [] } as unknown as SectionInstance, theme, { template: "index" }, { [path]: e.source })
    if (!out.ok) continue
    if (/<form\b/i.test(out.html)) exForms++
    for (const p of formProblems(out.html)) ex.push(`${e.id}: ${p.kind}`)
  }
  check(`every form in the library's examples passes (${exForms} drawn)`, ex.length === 0 && exForms > 0, ex)
  const tp: string[] = []
  let tpForms = 0
  for (const t of SITE_TEMPLATES) {
    for (const [path, source] of Object.entries(t.files)) {
      if (!/<form\b/.test(source)) continue
      const type = path.replace(/^sections\//, "").replace(/\.storelib$/, "")
      const out = renderStorelibSection({ id: `s-${type}`, type, settings: {}, blocks: [] } as unknown as SectionInstance, theme, { template: "index" }, t.files)
      if (!out.ok) continue
      if (/<form\b/i.test(out.html)) tpForms++
      for (const p of formProblems(out.html)) tp.push(`${t.id} ${type}: ${p.kind}`)
    }
  }
  check(`every form in the starting templates passes (${tpForms} drawn)`, tp.length === 0 && tpForms >= 6, tp)

  const dead = `<template>\n<section><h1>Book</h1><form class="b"><label>Your name <input name="name" placeholder="Name"></label><button type="submit">Book</button></form></section>\n</template>\n\n<schema>\n{ "type": "ai_book", "name": "Book", "settings": [] }\n</schema>\n`
  const rc = await renderCheck({ page: "home", sections: [{ id: "b1", type: "ai_book", settings: {}, blocks: [] } as unknown as SectionInstance], sources: { "sections/ai_book.storelib": dead }, theme, template: "index" })
  const formIssue = rc.issues.find((i) => i.code === "render.form")
  check("the render check refuses a form that goes nowhere (render.form, an error)", formIssue?.severity === "error" && formIssue.sectionId === "b1" && rc.ok === false, rc.issues.map((i) => i.code))
  const fine = dead.replace('<form class="b">', '<form class="b" data-storelib-form="contact">').replace("</label><button", '</label><label>Email <input type="email" name="email" placeholder="you@example.com"></label><label>Message <textarea name="message" placeholder="A line"></textarea></label><button')
  const rc2 = await renderCheck({ page: "home", sections: [{ id: "b1", type: "ai_book", settings: {}, blocks: [] } as unknown as SectionInstance], sources: { "sections/ai_book.storelib": fine }, theme, template: "index" })
  check("and passes the same form made a contact form", !rc2.issues.some((i) => i.code === "render.form"), rc2.issues.filter((i) => i.code === "render.form"))

  /* ── 3 ── */
  console.log("\n3. The page's half (measured in Chromium by scripts/check-ai-site-function-r56.mjs)")
  const ss = read("components/website-builder/sections/StorelibSection.tsx")
  check("a contact form sends every other field through contactMessageFrom", /message: contactMessageFrom\(field\("message"\), formFields\(form\)\)/.test(ss))
  check("files, unticked boxes and empty choices are left out when the fields are read", /file\|submit\|button\|reset\|image\|hidden\|password/.test(ss) && /!\(el as HTMLInputElement\)\.checked\) continue/.test(ss) && /o\.value !== ""/.test(ss))
  check("still the one contact endpoint, honeypot and time on the page sent as before", /company: field\("company"\)/.test(ss) && /elapsed: shownAt\.current/.test(ss) && /fetch\("\/api\/website-builder\/contact"/.test(read("lib/website-builder/contact-client.ts")))
  check("a form that goes nowhere says so on the live page (role alert) and in the canvas (a note)", /settle\(form, "error", "This form cannot send anything yet/.test(ss) && /settle\(form, "note", "This form is not connected/.test(ss))
  check("a search form with no action opens the site's search page", /window\.location\.assign\(searchPageFor\(q\)\)/.test(ss) && /searchPageHref as searchPageFor/.test(ss))
  const hooks = read("components/website-builder/sections/site-chrome-hooks.tsx")
  check("an add button with no data-quantity takes the quantity box beside it", /el\.hasAttribute\("data-quantity"\) \? null : quantityNear\(el, e\.currentTarget\)/.test(hooks))
  check("and the option picked beside it when it names none", /el\.getAttribute\("data-variant-id"\) \? null : variantNear\(el, e\.currentTarget\)/.test(hooks))
  check("a box shared with another product's button is not taken", /some\(\(b\) => b\.getAttribute\(H\.addToCart\) !== own\)\) return null/.test(hooks))
  check("the quantity is still clamped and a download kept at one by addToCartLine", /Math\.min\(qty, 99\)/.test(read("lib/website-builder/storefront-hooks.ts")))

  /* ── 4 ── */
  console.log("\n4. The native engine draws no button that goes nowhere")
  const reg = nativeRegistry()
  const FORMS = [{ url: CALL_FORM, id: CALL_FORM, name: "First call" }]
  const ctxFor = (caps: NativeContext["caps"], prompt = ""): NativeContext => ({ registry: reg, caps, images: [], forms: FORMS, prompt, seed: "r56seed1" })
  for (const s of SCENARIOS) {
    const v = validateNativeSite(s.answer, ctxFor(s.caps, s.prompt))
    check(`${s.id}: the scripted answer still raises no issue`, v.issues.length === 0, v.issues.slice(0, 3))
  }
  const fit = SCENARIOS[0]
  const nothingForSale = { ...fit.caps, facts: { ...fit.caps.facts!, products: [], totalProducts: 0, publishedProducts: 0 }, productTypes: {} }
  const answer = site({
    name: "Iron North Coaching",
    tagline: "Strength training for beginners in Leeds",
    preset: String((fit.answer as { theme: { preset: string } }).theme.preset),
    heading: "",
    body: "",
    pages: [
      {
        key: "home",
        title: "Home",
        sections: [
          sec("hero_centered", "dark", { heading: "Strength for beginners" }),
          sec("cta_simple", "light", { heading: "See the week", button_text: "See the timetable", button_url: "#timetable" }),
          sec("cta_banner", "light", { heading: "Questions first", button_text: "Read the questions", button_url: "#faq" }),
          sec("faq_accordion", "light", { heading: "Questions" }, [["qa", { question: "Do I need experience?", answer: "No." }], ["qa", { question: "Where is it?", answer: "Leeds." }]]),
          sec("pricing_table", "light", { heading: "Ways to start" }, [["plan", { name: "Intro", summary: "One session to see how it feels" }], ["plan", { name: "Block", summary: "Eight weeks, twice a week" }]]),
        ],
      },
    ],
  })
  /* With the store's one product (a pricing table needs something to sell); the hero's /products is checked on a store with none below. */
  const v = validateNativeSite(answer, ctxFor(fit.caps, "strength coach"))
  const home = v.site.pages.find((p) => p.key === "home")!
  const byType = (t: string) => home.sections.find((s) => s.type === t)
  const bare = validateNativeSite(answer, ctxFor(nothingForSale, "strength coach"))
  const bareHero = bare.site.pages[0]?.sections.find((s) => s.type === "hero_centered")
  check("an anchor to a section that is not on the page: its words cleared, the address dropped", byType("cta_simple")?.settings.button_text === "" && byType("cta_simple")?.settings.button_url === "", byType("cta_simple")?.settings)
  check("and the repair turn is told, at the right path", v.issues.some((i) => /sections\[1\]\.settings\.button_url$/.test(i.path) && /#timetable/.test(i.message)), v.issues)
  check("an anchor that resolves the way the live page resolves it (#faq to faq_accordion) is kept", byType("cta_banner")?.settings.button_text === "Read the questions" && byType("cta_banner")?.settings.button_url === "#faq", byType("cta_banner")?.settings)
  check('"Browse the shop" to /products on a store that sells nothing is not drawn (its default words cleared)', bareHero?.settings.button_text === "", bareHero?.settings)
  const plans = byType("pricing_table")?.blocks ?? []
  check('a pricing plan\'s "Choose" with no product (href="#") is not drawn', plans.length === 2 && plans.every((b) => b.settings.button_text === ""), plans.map((b) => b.settings))
  check("a schema default is a note, not an issue for the model", v.issues.filter((i) => /\.settings\./.test(i.path)).every((i) => /sections\[1\]\.settings\.button_url$/.test(i.path)) && v.notes.some((n) => /left out, its default goes to/.test(n)), { issues: v.issues, notes: v.notes.slice(0, 4) })
  check("with something for sale the same hero keeps its button", byType("hero_centered")?.settings.button_text === undefined, byType("hero_centered")?.settings)
  const written = validateNativeSite(site({ name: "Iron North Coaching", tagline: "", preset: String((fit.answer as { theme: { preset: string } }).theme.preset), heading: "", body: "", pages: [{ key: "home", title: "Home", sections: [sec("hero_centered", "dark", { heading: "Strength", button_text: "Shop the plans", button_url: "/products" })] }] }), ctxFor(nothingForSale))
  check("written words to an address the site does not have are reported", written.issues.some((i) => /button_url/.test(i.path) && /has words but/.test(i.message)) && written.site.pages[0].sections[0]?.settings.button_text === "", written.issues)

  /* ── 5 ── */
  console.log("\n5. The generator is told")
  check("the hook guide spells out the contact fields and that other fields arrive under their labels", /<textarea name="message">/.test(HEADLESS_HOOK_GUIDE) && /under its label/.test(HEADLESS_HOOK_GUIDE))
  check("no file boxes, and forms that go nowhere are refused", /No file box in a contact or sign up form/.test(HEADLESS_HOOK_GUIDE) && /refused by the render check/.test(HEADLESS_HOOK_GUIDE))
  check("the quantity box and the option picker", /name="quantity"/.test(HEADLESS_HOOK_GUIDE) && /named "variant"/.test(HEADLESS_HOOK_GUIDE))
  check("no AI words or em dashes in what the generator is told", !/—|\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform)/i.test(HEADLESS_HOOK_GUIDE))
  const entry = KNOWLEDGE_SOURCES.find((k) => k.file.endsWith("storelib-forms.md"))
  check("storelib-forms is v2 in the generated library, with contact and render.form", !!entry && /version: 2/.test(entry.source) && /data-storelib-form="contact"/.test(entry.source) && /render\.form/.test(entry.source) && entry.source === read("lib/storelib-ai/library/entries/storelib/storelib-forms.md"))
  check("the render check documents render.form", /render\.form\s+a form the page cannot send/.test(read("lib/ai-builder/render-check.ts")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
