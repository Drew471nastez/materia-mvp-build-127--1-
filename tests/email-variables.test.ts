/**
 * ===========================================================================
 *  EVERY PLACEHOLDER IN A CREATOR'S EMAIL IS FILLED WHEN IT IS SENT
 * ===========================================================================
 * The report: a buyer's "Thank you for your purchase!" email ended "Best,
 * [Your name]", and the photo beside the creator's name was the letter "L"
 * rather than their profile picture. "It needs to change dynamically based
 * on what they change on their store. Keep in mind every kind of variable."
 *
 * Pinned here:
 *
 *   one resolver    lib/email-variables resolveVariables: every supported
 *                   tag, the older spellings, pasted Mailchimp tags and the
 *                   bracket placeholders ("[Your name]", "[Name]"), with
 *                   escaping, fallbacks and unknown tags removed
 *   both paths      automations (merge-fields fillFields, the engine, the
 *                   older personalize + automationEmail sweep) and campaigns
 *                   (template personalizeHtml / personalizeSubject) use it
 *   live look       the creator's name and photo are read from their profile
 *                   when the email is sent (supabase-store readIdentity,
 *                   brand-server loadBrand), a second business its own
 *   the defaults    every flow template and campaign starter, rendered with
 *                   sample data, leaves no placeholder behind
 *   the preview     the builder's preview is the send's own fill and frame
 */
import { randomUUID } from "node:crypto"

import {
  ALIASES,
  APP_ORIGIN,
  SAMPLE_READER,
  VARIABLES,
  bracketKey,
  placeholdersIn,
  resolveVariables,
  variableKey,
  type VariableValues,
} from "@/lib/email-variables"
import { fieldProblems, fillFields, mergeValues } from "@/lib/automations/merge-fields"
import { prepareEmail, type Identity } from "@/lib/automations/engine"
import { TEMPLATES } from "@/lib/automations/templates"
import { normalizeSteps, problemsOf, type EmailStep } from "@/lib/automations/flow-model"
import { previewFlowEmail } from "@/lib/automations/preview"
import { automationEmail, brandOfIdentity, personalize, personalizeText } from "@/lib/email-automation"
import { buildEmail, personalizeHtml, personalizeSubject, unknownMergeFields } from "@/lib/email-campaigns/template"
import { STARTERS, starterDraft } from "@/lib/email-campaigns/starters"
import { renderBlocks } from "@/lib/email-campaigns/blocks"
import { emailImageUrl, themeOf } from "@/lib/email-campaigns/brand"
import { loadBrand } from "@/lib/email-campaigns/brand-server"
import { supabaseStore } from "@/lib/automations/supabase-store"
import { automationDb } from "./fake-supabase"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const d = detail === undefined ? "" : ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`
    failures.push(label + d)
    console.log(`  FAIL  ${label}${d}`)
  }
}

/** Anything that reads as a placeholder left for a person to fill. */
const LEFT_OVER = /\{\{|\}\}|\*\|[A-Z_]+\|\*|\[[^\]<>]{0,40}\b(name|link|url|store|product)\b[^\]<>]{0,20}\]/i

const FULL: VariableValues = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  creator_name: "Lena Park",
  store_name: "Lena Park Studio",
  store_url: "https://storelib.com/lena",
  product_name: "Film presets",
  product_url: "https://storelib.com/lena/film-presets",
  order_number: "7F3A9C21",
  order_url: "https://storelib.com/receipt/rt_1",
  download_url: "https://storelib.com/receipt/rt_1",
  library_url: "https://storelib.com/library",
  review_url: "https://storelib.com/receipt/rt_1#review",
  checkout_url: "https://storelib.com/checkout?productId=p1",
  unsubscribe_url: "https://storelib.com/unsubscribe?token=t1",
  current_year: "2026",
}

async function main() {
  console.log("\nEvery supported tag resolves")
  const expected: Record<string, string> = {
    first_name: "Ada",
    last_name: "Lovelace",
    name: "Ada Lovelace",
    email: "ada@example.com",
    creator_name: "Lena Park",
    store_name: "Lena Park Studio",
    store_url: FULL.store_url!,
    product_name: "Film presets",
    product_url: FULL.product_url!,
    order_number: "7F3A9C21",
    order_url: FULL.order_url!,
    download_url: FULL.download_url!,
    library_url: FULL.library_url!,
    review_url: FULL.review_url!,
    checkout_url: FULL.checkout_url!,
    unsubscribe_url: FULL.unsubscribe_url!,
    current_year: "2026",
  }
  for (const v of VARIABLES) {
    const out = resolveVariables(`[{{${v.key}}}]`, FULL, "text")
    check(`{{${v.key}}} is ${expected[v.key]}`, out === `[${expected[v.key]}]`, out)
  }
  check("spaces inside the braces and any case are read", resolveVariables("{{ First_Name }}", FULL, "text") === "Ada")
  check("every older spelling reaches a supported tag", Object.entries(ALIASES).every(([alias, key]) => resolveVariables(`{{${alias}}}`, FULL, "text") === expected[key]))
  check("{{customer_name}} and {{your_name}} among them", resolveVariables("{{customer_name}} / {{your_name}}", FULL, "text") === "Ada Lovelace / Lena Park")
  check("Mailchimp's *|FNAME|* pasted in is read", resolveVariables("Hi *|FNAME|*", FULL, "text") === "Hi Ada")
  check("one pair of braces around a known name is read", resolveVariables("Hi {first_name}, from {store_name}", FULL, "text") === "Hi Ada, from Lena Park Studio")
  check("and one pair around anything else is left as the creator wrote it", resolveVariables("a {b} c", FULL, "text") === "a {b} c")
  check("the year is this year when nobody says", resolveVariables("{{current_year}}", {}, "text") === String(new Date().getFullYear()))
  check("a filled value is never read a second time", resolveVariables("{{first_name}}", { name: "[Your name] {{store_name}}" }, "text") === "[Your")

  console.log("\nThe bracket placeholders older presets and AI writers leave in")
  const legacy: [string, string][] = [
    ["[Your name]", "Lena Park"],
    ["[Your Name]", "Lena Park"],
    ["[YOUR NAME]", "Lena Park"],
    ["[ your name ]", "Lena Park"],
    ["[Insert your name here]", "Lena Park"],
    ["[Name]", "Ada"],
    ["[First name]", "Ada"],
    ["[Customer's first name]", "Ada"],
    ["[Customer Name]", "Ada"],
    ["[Store name]", "Lena Park Studio"],
    ["[Your store name]", "Lena Park Studio"],
    ["[Your business name]", "Lena Park Studio"],
    ["[Product name]", "Film presets"],
    ["[Product Name]", "Film presets"],
    ["[Order number]", "7F3A9C21"],
    ["[Download link]", FULL.download_url!],
  ]
  for (const [written, becomes] of legacy) check(`${written} becomes ${becomes}`, resolveVariables(written, FULL, "text") === becomes, resolveVariables(written, FULL, "text"))
  check("brackets that are just brackets stay", resolveVariables("See note [1] and [optional]", FULL, "text") === "See note [1] and [optional]" && bracketKey("1") === null)
  check("brackets inside a tag's attributes are markup, not a placeholder", resolveVariables('<p title="[Name]">x</p>', FULL, "html") === '<p title="[Name]">x</p>')

  const reported = "<p>Hi there!</p><p>Thank you so much for purchasing! I'm really excited for you to dive in and start your journey.</p><p>Best,<br>[Your name]</p>"
  check("the reported email signs with the creator's name", resolveVariables(reported, FULL, "html").endsWith("<p>Best,<br>Lena Park</p>"), resolveVariables(reported, FULL, "html"))

  console.log("\nWhat nothing fills")
  check("Hi {{first_name}}, with no name is Hi there,", resolveVariables("<p>Hi {{first_name}},</p>", {}, "html") === "<p>Hi there,</p>")
  check("and never Hi ,", !/Hi\s*,/.test(resolveVariables("<p>Hi {{first_name}},</p><p>Hello [Name],</p>", { name: "  " }, "html")))
  check("[Name] after Hello is there too", resolveVariables("<p>Hello [Name],</p>", {}, "html") === "<p>Hello there,</p>")
  check("Dear is followed by friend", resolveVariables("Dear {{first_name}},", {}, "text") === "Dear friend,")
  check("a creator's own fallback wins", resolveVariables("Hi {{first_name|friend}}!", {}, "text") === "Hi friend!")
  check("a name outside a greeting is left out and the sentence tidied", resolveVariables("Thanks for your order, {{first_name}}!", {}, "text") === "Thanks for your order!" && resolveVariables("Welcome, {{first_name}}", {}, "text") === "Welcome")
  check("an unknown tag is removed cleanly", resolveVariables("<p>Thanks {{nmae}}, see you soon.</p>", FULL, "html") === "<p>Thanks, see you soon.</p>" && resolveVariables("<p>{{nope}} Hello</p>", FULL, "html") === "<p>Hello</p>" && resolveVariables("a {{x}} b", FULL, "text") === "a b")
  check("an unknown tag in a link goes to the creator's page", resolveVariables('<a href="{{nope}}">x</a>', FULL, "html") === `<a href="${FULL.store_url}">x</a>`)
  check("a link with no value goes to the creator's page, never empty", resolveVariables('<a href="{{order_url}}">x</a>', { store_url: "https://storelib.com/lena" }, "html") === '<a href="https://storelib.com/lena">x</a>')
  check("download falls back to the order page, then the library", resolveVariables("{{download_url}}", { order_url: "https://o" }, "text") === "https://o" && resolveVariables("{{download_url}}", {}, "text") === `${APP_ORIGIN}/account/library`)
  check("no creator name falls back to the store name, and back", resolveVariables("{{creator_name}}", { store_name: "S" }, "text") === "S" && resolveVariables("{{store_name}}", { creator_name: "C" }, "text") === "C")
  check("nothing that reads as a placeholder survives an empty reader", !LEFT_OVER.test(resolveVariables(VARIABLES.map((v) => `{{${v.key}}} [Your name] [Name] *|FNAME|*`).join(" "), {}, "html")))

  console.log("\nEscaping")
  check("a name cannot write markup into a body", resolveVariables("<p>Hi {{first_name}}</p>", { name: "<img src=x onerror=1>" }, "html") === "<p>Hi &lt;img</p>")
  check("a creator name with & is escaped in HTML", resolveVariables("[Your name]", { creator_name: 'Tea & "Co"' }, "html") === "Tea &amp; &quot;Co&quot;")
  check("and left as text in a subject, on one line", resolveVariables("From {{creator_name}}", { creator_name: "Tea & Co\nLtd" }, "text") === "From Tea & Co Ltd")
  check("a link value cannot close its attribute", !/"><script/.test(resolveVariables('<a href="{{store_url}}">x</a>', { store_url: 'https://x.com/"><script>' }, "html")))

  console.log("\nAutomations use it")
  const mv = mergeValues({ name: "Ada Lovelace", storeName: "Lena Park Studio", storeUrl: "https://storelib.com/lena", creatorName: "Lena Park", productName: "Film presets", orderId: "7f3a9c21-4b8e-4d2a-9f10-2c6b8e5d1a44", orderUrl: "https://storelib.com/receipt/rt_1", unsubscribeUrl: "https://storelib.com/unsubscribe?token=t" })
  check("fillFields signs with the creator and reads [Your name]", fillFields("Best,<br>{{creator_name}} / [Your name]", mv, "html") === "Best,<br>Lena Park / Lena Park")
  check("the order number is the receipt's", fillFields("Order {{order_number}}", mv, "text") === "Order 7F3A9C21")
  check("the unsubscribe link is the reader's own", fillFields("{{unsubscribe_url}}", mv, "text") === "https://storelib.com/unsubscribe?token=t")
  check("the builder accepts the new tags and their spellings", fieldProblems("{{creator_name}} {{your_name}} {{order_number}} {{download_url}} {{current_year}} {{unsubscribe_url}}", "purchase").length === 0)
  check("and still refuses a typo", fieldProblems("{{frist_name}}", "purchase").length === 1)

  const identity: Identity = {
    fromName: "Lena Park",
    replyTo: "lena@example.com",
    storeUrl: "https://storelib.com/lena",
    brand: { name: "Lena Park Studio", logoUrl: null, accentColor: "#0f766e", onAccent: "#ffffff" },
    avatarUrl: "https://cdn.example.com/lena.jpg",
  }
  const saved: EmailStep = { id: "s1", type: "email", config: { subject: "Thank you for your purchase!", body: reported } }
  const ready = prepareEmail(saved, { name: "Ada Lovelace", context: { product_title: "Film presets" } }, identity, { productUrl: null, orderUrl: null, checkoutUrl: null })
  check("the engine fills a saved flow's [Your name] without a migration", /Best,<br>Lena Park<\/p>/.test(ready.step.config.body) && !/\[Your name\]/.test(ready.step.config.body), ready.step.config.body)

  check("the older path fills the person first and leaves the creator for the sweep", personalize("Hi {{first_name}}. Best, [Your name]", { name: "Ada" }) === "Hi Ada. Best, [Your name]")
  const legacyMail = automationEmail({ body: personalize(reported, { name: "Ada" }), fromName: "Lena Park", unsubscribeToken: null })
  check("and automationEmail's sweep signs it with the creator's name", /Best,<br\s*\/?>\s*Lena Park/.test(legacyMail.html) && !LEFT_OVER.test(legacyMail.html) && !LEFT_OVER.test(legacyMail.text), legacyMail.text)
  check("a subject on the oldest path never goes out with a bracket it could not fill", personalizeText("A note from [Your name]", { name: "Ada" }) === "A note from")
  check("the older typed out Customer Name still reads", personalize("Hi Customer Name", { name: "Ada" }) === "Hi Ada")
  check("a subject on the older path is filled with the creator when it is known", personalizeText("News from [Store name]", { creatorName: "Lena Park", storeName: "Lena Park Studio" }) === "News from Lena Park Studio")

  console.log("\nCampaigns use it")
  check("[Your name] in a campaign is the sender's name", personalizeHtml("<p>Best,<br>[Your name]</p>", { name: "Ada", creatorName: "Lena Park" }) === "<p>Best,<br>Lena Park</p>")
  check("{{creator_name}} and {{store_name}} are campaign fields now", unknownMergeFields("{{creator_name}} {{store_name}} {{ your_name }} {{current_year}}").length === 0)
  check("a typo is still refused", unknownMergeFields("{{nmae}}").join() === "nmae")
  check("{{unsubscribe_url}} is left for the caller when it has not said", personalizeHtml('<a href="{{unsubscribe_url}}">x</a>', { name: "A" }) === '<a href="{{unsubscribe_url}}">x</a>')
  check("and filled when it has", personalizeHtml('<a href="{{unsubscribe_url}}">x</a>', { name: "A", unsubscribeUrl: "https://u/1" }) === '<a href="https://u/1">x</a>')
  check("a missing name reads there in a subject", personalizeSubject("Hi {{first_name}}", { name: "" }) === "Hi there")

  console.log("\nThe creator's photo and name come from their profile, as it is now")
  const db = automationDb()
  const creatorId = randomUUID()
  const second = randomUUID()
  db.tables.creators.push({ id: creatorId, slug: "lena", headline: null, support_email: null, user_id: "u1" })
  db.tables.profiles.push({ id: "u1", display_name: "Lena Park", username: "lena", email: "lena@example.com", avatar_url: "https://cdn.example.com/lena-v1.jpg" })
  /* A second business of the same login: its own account, profile and creator row (lib/businesses). */
  db.tables.creators.push({ id: second, slug: "lena-prints", headline: null, support_email: null, user_id: "u2" })
  db.tables.profiles.push({ id: "u2", display_name: "Lena Prints", username: "lena-prints", email: "lena+prints@example.com", avatar_url: "https://cdn.example.com/prints-logo.png" })

  const first = await supabaseStore(db).identity(creatorId)
  check("the automation's identity carries the profile photo", first.avatarUrl === "https://cdn.example.com/lena-v1.jpg", first)
  check("and the profile's name to sign with", first.fromName === "Lena Park")
  const profile = db.tables.profiles.find((p) => p.id === "u1")!
  profile.avatar_url = "https://cdn.example.com/lena-v2.jpg"
  profile.display_name = "Lena P."
  const next = await supabaseStore(db).identity(creatorId)
  check("a new photo and name are in the next run's email, not a snapshot", next.avatarUrl === "https://cdn.example.com/lena-v2.jpg" && next.fromName === "Lena P.", next)
  const biz = await supabaseStore(db).identity(second)
  check("a second business uses its own profile photo and name", biz.avatarUrl === "https://cdn.example.com/prints-logo.png" && biz.fromName === "Lena Prints", biz)

  const drawn = automationEmail({ body: "<p>Hi</p>", fromName: next.fromName, brand: brandOfIdentity(next), avatarUrl: next.avatarUrl, unsubscribeToken: "t" })
  check("the email draws the photo beside the name, not the initial", drawn.html.includes('src="https://cdn.example.com/lena-v2.jpg"') && !/line-height:28px;text-align:center;">L</.test(drawn.html))
  profile.avatar_url = "http://insecure.example/a.png"
  const insecure = await supabaseStore(db).identity(creatorId)
  check("an http photo is never put in an email", insecure.avatarUrl === null)
  const letter = automationEmail({ body: "<p>Hi</p>", fromName: "Lena P.", brand: brandOfIdentity(insecure), avatarUrl: insecure.avatarUrl, unsubscribeToken: "t" })
  check("and only then is the initial drawn", /line-height:28px;text-align:center;">L</.test(letter.html))
  check("a photo on our own site by path is made whole", emailImageUrl("/avatars/a.png") === `${APP_ORIGIN}/avatars/a.png` && emailImageUrl("placeholder.svg") === null && emailImageUrl("https://placeholder.svg") === null)

  profile.avatar_url = "https://cdn.example.com/lena-v3.jpg"
  const brand = await loadBrand(db, creatorId)
  check("a campaign's brand reads the same live photo and name", brand.avatarUrl === "https://cdn.example.com/lena-v3.jpg" && brand.creatorName === "Lena P.", brand)
  const bizBrand = await loadBrand(db, second)
  check("and a second business's campaign its own", bizBrand.avatarUrl === "https://cdn.example.com/prints-logo.png" && bizBrand.creatorName === "Lena Prints")

  const { readFileSync } = await import("node:fs")
  const run = readFileSync("lib/automations/run.ts", "utf8")
  check("the mailer frames every automated email with that photo", /avatarUrl: identity\.avatarUrl \?\? null/.test(run))
  const cron = readFileSync("app/api/cron/process-scheduled-emails/route.ts", "utf8")
  check("the older queue reads the look when it sends, once per creator per run", /loadBrand\(supabaseAdmin, creatorId\)/.test(cron) && /avatarUrl: look\?\.avatarUrl \?\? null/.test(cron))
  const queue = readFileSync("lib/email-campaigns/queue.ts", "utf8")
  check("a campaign's photo is the live brand's", /avatarUrl: brand\.avatarUrl,/.test(queue) && /creatorName: frame\.sender\.name/.test(queue))

  console.log("\nThe defaults, rendered with sample data, leave nothing behind")
  const banned = /\b(dive in|journey|unlock|elevate|seamless|game.?changer|heart into|thrilled)\b|[—–]| - /i
  for (const t of TEMPLATES) {
    for (const step of normalizeSteps(t.steps)) {
      if (step.type !== "email") continue
      const p = previewFlowEmail(step, t.trigger, identity, "Film presets")
      check(`${t.id}/${step.id}: no placeholder in the subject or the email`, !LEFT_OVER.test(p.subject) && !LEFT_OVER.test(p.html), placeholdersIn(p.html))
      check(`${t.id}/${step.id}: signed by the creator, greeted by name`, /Lena Park/.test(p.html) && /Hi Alex,/.test(p.html))
      check(`${t.id}/${step.id}: written with tags, no brackets, none of the AI words`, !/\[[^\]]*\]/.test(step.config.body + step.config.subject) && !banned.test(step.config.body + step.config.subject) && /\{\{creator_name\}\}/.test(step.config.body))
    }
    check(`${t.id}: can still be turned on as it is`, problemsOf(t.trigger, normalizeSteps(t.steps)).length === 0, problemsOf(t.trigger, normalizeSteps(t.steps)))
  }
  const look = { name: "Lena Park Studio", logoUrl: null, storeUrl: "https://storelib.com/lena", accent: "#0f766e", address: null }
  for (const s of STARTERS) {
    const d = starterDraft(s.id, { name: "Old Name", storeUrl: look.storeUrl })
    const reader = { name: SAMPLE_READER.name, email: SAMPLE_READER.email, creatorName: "Lena Park", storeName: look.name, storeUrl: look.storeUrl, unsubscribeUrl: "https://u" }
    const html = buildEmail({ subject: personalizeSubject(d.subject || "Hello", reader), bodyHtml: personalizeHtml(renderBlocks(d.blocks, themeOf(look)), reader), brand: look, kind: "marketing", unsubscribeUrl: "https://u" })
    check(`starter ${s.id}: no placeholder once filled`, !LEFT_OVER.test(html) && !LEFT_OVER.test(personalizeSubject(d.subject, reader)))
    check(`starter ${s.id}: signs with the name as it is when sent, not when started`, s.id === "sale" || (/Lena Park/.test(html) && !/Old Name/.test(html)))
  }

  console.log("\nThe builder's preview is what is sent")
  const step = TEMPLATES.find((t) => t.id === "thank_you")!.steps[0] as EmailStep
  const p = previewFlowEmail(step, "purchase", identity, "Film presets")
  const sent = prepareEmail(step, { name: SAMPLE_READER.name, context: { product_title: "Film presets", order_id: SAMPLE_READER.orderId } }, identity, { productUrl: null, orderUrl: null, checkoutUrl: null, unsubscribeUrl: null })
  check("the preview's subject is the send's", p.subject === sent.step.config.subject && p.subject === "Thank you for buying Film presets")
  const words = (h: string) => h.replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim()
  const sentWords = words(sent.step.config.body)
  check("its body is the send's fill, in the send's frame", sentWords.length > 60 && words(p.html).includes(sentWords) && /Hi Alex,/.test(p.html), sentWords)
  check("with the creator's live photo", p.html.includes('src="https://cdn.example.com/lena.jpg"'))
  const oldSaved = previewFlowEmail(saved, "purchase", identity, null)
  check("a saved flow with [Your name] previews with the creator's name", /Best,<br\s*\/?>\s*Lena Park/.test(oldSaved.html) && !LEFT_OVER.test(oldSaved.html))
  check("the preview names a real looking reader, not braces", SAMPLE_READER.name === "Alex Rivera" && variableKey("first_name") === "first_name")

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
