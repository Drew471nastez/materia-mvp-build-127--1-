/**
 * Round AL, track 5: forms, leads and the WhatsApp pre-chat.
 *
 *   PLACE       Leads is a tab of Emails, Forms is reached from it, the
 *               Audience sidebar item is gone, and the old /app/audience
 *               addresses redirect to the same lead or form
 *   NOT SET UP  with the forms tables missing (SQL parts 372 and 375 not
 *               run) every forms and leads route answers "missing", and
 *               the browser side reads that as words, never a retry loop
 *   BLIPS       a read is asked once more after a blip, a write never;
 *               every request has a timeout
 *   PRE-CHAT    a chat's questions fill its message with the words of the
 *               chosen answers, not their ids, and a form that can not be
 *               shown lets the chat open anyway
 *   PHONE       the country list carries every calling code and finds a
 *               country by its digits
 */
import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { formsRequest, RETRY_AFTER_MS } from "../lib/forms/client"
import { fillTemplate, formVars } from "../lib/forms/actions"
import { formTemplate, FORM_TEMPLATES } from "../lib/forms/templates"
import { validateDefinition } from "../lib/forms/definition"
import { dialChoices } from "../lib/forms/dial-codes"
import { matches } from "../lib/ui/choice-match"

let passed = 0
let failed = 0
async function check(label: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  ok    ${label}`)
  } catch (e) {
    failed++
    console.log(`  FAIL  ${label}\n        ${(e as Error).message.slice(0, 400)}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

async function main() {
  console.log("\nLeads live in Emails; forms are reached from Leads\n")
  await check("the Audience sidebar item is gone", () => {
    const sidebar = read("components/app/sidebar.tsx")
    assert.doesNotMatch(sidebar, /href: "\/app\/audience/)
    assert.doesNotMatch(sidebar, /label: tt\("Audience"\)/)
  })
  /* Changed on purpose (round 51): Leads moved from Emails to Contacts (?tab=leads redirects to /app/contacts?filter=leads, a lead to its profile); the panel itself is kept for Contacts › Forms. */
  await check("Emails' old Leads tab goes to Contacts, and the leads panel is kept", () => {
    assert.match(read("app/(storelib)/app/emails/emails-route.ts"), /if \(tab === "leads" \|\| \(!tab && lead\)\)/)
    assert.match(read("app/(storelib)/app/emails/emails-route.ts"), /"\/app\/contacts\?filter=leads"/)
    const panel = read("app/(storelib)/app/emails/leads-panel.tsx")
    for (const part of ["FilterChip", "PhoneItem", "ScrollEdge", "SheetDialog", "StatusBadge", "ResponsiveActionMenu"]) assert.match(panel, new RegExp(part), part)
    assert.match(panel, /href="\/app\/emails\/forms"/)
  })
  await check("the old addresses redirect, keeping the lead or the form", () => {
    assert.match(read("app/(storelib)/app/audience/leads/page.tsx"), /redirect\(`\/app\/emails\?\$\{q\}`\)/)
    assert.match(read("app/(storelib)/app/audience/leads/page.tsx"), /for \(const k of \["lead", "form"\]\)/)
    assert.match(read("app/(storelib)/app/audience/forms/page.tsx"), /\/app\/emails\/forms\?form=/)
    assert.match(read("app/(storelib)/app/audience/page.tsx"), /redirect\("\/app\/emails\?tab=leads"\)/)
    assert.ok(existsSync("app/(storelib)/app/emails/forms/page.tsx"))
  })
  await check("notification links go to the lead in Emails", () => {
    assert.match(read("lib/forms/delivery-server.ts"), /\/app\/emails\?tab=leads&lead=/)
    assert.match(read("app/api/forms/[id]/submit/route.ts"), /\/app\/emails\?tab=leads&lead=/)
    for (const f of ["components/forms/forms-manager.tsx", "components/forms/action-editor.tsx", "lib/forms/delivery-server.ts"]) assert.doesNotMatch(read(f), /\/app\/audience/, f)
  })

  console.log("\nNo forms tables yet: said plainly, never retried\n")
  await check("every owner route answers a missing table as missing, and remembers it", () => {
    const server = read("lib/forms/server.ts")
    assert.match(server, /code === "42P01" \|\| code === "PGRST205"/)
    assert.match(server, /export function formsKnownMissing/)
    for (const f of ["app/api/forms/route.ts", "app/api/leads/route.ts"]) {
      const src = read(f)
      assert.match(src, /formsKnownMissing\(\)/, f)
      assert.match(src, /missing: true/, f)
    }
    for (const f of ["app/api/forms/[id]/route.ts", "app/api/leads/[id]/route.ts", "app/api/leads/export/route.ts"]) assert.match(read(f), /formsMissingResponse\(\)/, f)
    for (const f of ["app/api/forms/[id]/public/route.ts", "app/api/forms/[id]/submit/route.ts", "app/api/forms/[id]/slots/route.ts", "app/api/forms/[id]/upload/route.ts"])
      assert.match(read(f), /noteFormsTables\((read)?[eE]rror\)\)\s*return/, f)
  })
  await check("a list marked missing is read as missing, with its data and no error", async () => {
    let calls = 0
    const r = await formsRequest<{ forms: unknown[] }>("/api/forms", {}, async () => (calls++, json(200, { forms: [], missing: true })))
    assert.equal(r.missing, true)
    assert.equal(r.error, null)
    assert.equal(calls, 1)
  })
  await check("a write refused with forms_missing is missing, asked once", async () => {
    let calls = 0
    const r = await formsRequest("/api/forms", { method: "POST", body: "{}" }, async () => (calls++, json(503, { error: "x", code: "forms_missing" })))
    assert.equal(r.missing, true)
    assert.equal(r.error, null)
    assert.equal(calls, 1)
  })
  await check("a 503 that is not missing is retried once, after the pause", async () => {
    let calls = 0
    const started = Date.now()
    const r = await formsRequest<{ ok: boolean }>("/api/leads", {}, async () => (++calls === 1 ? json(503, { error: "Leads could not be loaded. Try again." }) : json(200, { ok: true })))
    assert.equal(calls, 2)
    assert.equal(r.error, null)
    assert.equal(r.data!.ok, true)
    assert.ok(Date.now() - started >= RETRY_AFTER_MS - 20)
  })
  await check("a read that fails twice stops there with words", async () => {
    let calls = 0
    const r = await formsRequest("/api/leads", { fallback: "Leads could not be loaded. Try again." }, async () => (calls++, json(502, {})))
    assert.equal(calls, 2)
    assert.equal(r.error, "Leads could not be loaded. Try again.")
  })
  await check("a write is never sent twice, and a 400 is never retried", async () => {
    let calls = 0
    await formsRequest("/api/forms", { method: "POST", body: "{}" }, async () => (calls++, json(503, { error: "no" })))
    assert.equal(calls, 1)
    calls = 0
    const r = await formsRequest("/api/leads", {}, async () => (calls++, json(400, { error: "Choose a valid lead status." })))
    assert.equal(calls, 1)
    assert.equal(r.error, "Choose a valid lead status.")
  })
  await check("no answer at all becomes a timeout, then one retry, never a hang", async () => {
    let calls = 0
    const never = (_u: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        calls++
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
      })
    const r = await formsRequest("/api/forms", {}, never, 50)
    assert.equal(calls, 2)
    assert.equal(r.status, 0)
    assert.ok(r.error && r.error.length > 0)
  })
  await check("the screens use the shared request and say so plainly", () => {
    const panel = read("app/(storelib)/app/emails/leads-panel.tsx")
    assert.match(panel, /if \(base\.missing\)/)
    assert.match(panel, /Forms are not switched on yet/)
    const list = read("app/(storelib)/app/emails/forms/forms-list.tsx")
    assert.match(list, /formsRequest/)
    assert.match(list, /data-forms-missing/)
    const picker = read("components/forms/form-picker.tsx")
    assert.match(picker, /if \(missing\) return <FormsNotSetUp \/>/)
    /* The editor no longer reads the forms with a bare fetch of its own. */
    assert.doesNotMatch(read("components/forms/action-editor.tsx"), /fetch\("\/api\/forms"/)
    assert.doesNotMatch(read("components/forms/forms-manager.tsx"), /await fetch\(url/)
  })

  console.log("\nA chat's questions first\n")
  await check("choice answers fill the message with their words", () => {
    const fields = FORM_TEMPLATES.prechat.fields
    const vars = formVars(fields, { name: "Ana", service: "booking", message: "Saturday morning?" })
    assert.equal(vars.visitor_name, "Ana")
    assert.equal(vars.service, "A booking")
    assert.equal(fillTemplate("Hi, I'm {visitor_name}. It's about {service}. {answer:message}", vars), "Hi, I'm Ana. It's about A booking. Saturday morning?")
    /* With nothing in the note, the sentence still reads. */
    assert.equal(fillTemplate("Hi, I'm {visitor_name}. It's about {service}. {answer:message}", formVars(fields, { name: "Ana", service: "question" })), "Hi, I'm Ana. It's about A question.")
    /* Several choices read as words too, and fields without options stay as typed. */
    assert.equal(formVars([{ id: "c", type: "checkboxes", options: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }] }], { c: ["a", "b"] }).answers!.c, "Alpha, Beta")
  })
  await check("the pre-chat template is a valid, publishable form", () => {
    const d = validateDefinition(formTemplate("prechat"), true)
    assert.deepEqual(d.fields.map((f) => f.id), ["name", "service", "message"])
  })
  await check("the editor asks first, making the chat's form live at once, and the page lets the chat open if the form can not be shown", () => {
    const editor = read("components/forms/action-editor.tsx")
    assert.match(editor, /createForm\("prechat", true\)/)
    assert.match(editor, /Ask a few questions first/)
    assert.match(read("app/api/forms/route.ts"), /publish \? \{ published: definition, status: "published", revision: 1 \}/)
    const frame = read("components/forms/action-frame.tsx")
    assert.match(frame, /onUnavailable=\{\s*chat/)
    assert.match(read("components/forms/public-form.tsx"), /onUnavailableRef\.current\?\.\(\)/)
  })

  console.log("\nThe phone number's country\n")
  await check("every country carries its calling code and is found by it", () => {
    const list = dialChoices()
    const ro = list.find((c) => c.value === "RO")!
    assert.equal(ro.aside, "+40")
    assert.ok(matches(ro, "40") && matches(ro, "+40") && matches(ro, "romania"))
    const us = list.find((c) => c.value === "US")!
    assert.equal(us.aside, "+1")
    assert.ok(list.length > 200, String(list.length))
  })
  await check("the action editor's number uses the field with the country list", () => {
    assert.match(read("components/forms/action-editor.tsx"), /<PhoneNumberField /)
    const field = read("components/forms/phone-number-field.tsx")
    assert.match(field, /<ChoicePicker/)
    assert.match(field, /fieldLeading=\{<CountryFlag code=\{cc\} \/>\}/)
  })

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

void main()
