/**
 * The form engine: definitions validated, answers validated against them
 * on the server (types, required, lengths, options, conditional
 * visibility), steps, quiz scoring and results, templates, variables in
 * a WhatsApp message, and CSV cells a spreadsheet will not run.
 */
import assert from "node:assert/strict"
import {
  validateDefinition,
  validateAnswers,
  visibleFields,
  formSteps,
  pickResult,
  fillTemplate,
  publicDefinition,
  csvCell,
  FIELD_TYPES,
  type FormDefinition,
} from "../lib/forms/definition"
import { formTemplate, TEMPLATE_CHOICES, FORM_TEMPLATES } from "../lib/forms/templates"
import { leadRow, LEAD_CSV_HEADER } from "../lib/forms/lead-csv"
import { searchTerm } from "../lib/forms/lead-query"

let passed = 0
const check = (name: string, fn: () => void) => {
  fn()
  passed++
  console.log("ok -", name)
}
const throwsWith = (fn: () => unknown, re: RegExp) => assert.throws(fn, (e: Error) => re.test(e.message))

const base = {
  title: "Test",
  description: "",
  mode: "form",
  button_text: "Send",
  consent_text: "OK to contact me.",
  marketing_opt_in: false,
  completion: { message: "Thanks" },
}
const def = (fields: unknown[], extra: Record<string, unknown> = {}) => validateDefinition({ ...base, fields, ...extra }) as FormDefinition

check("every field type the brief lists is supported and validates", () => {
  const ids = FIELD_TYPES.map((t) => t.id).sort()
  assert.deepEqual(ids, ["checkboxes", "consent", "date", "dropdown", "email", "file", "multiple", "name", "number", "phone", "rating", "single", "text", "textarea"].sort())
  const opts = [
    { id: "a", label: "A", score: 2 },
    { id: "b", label: "B", score: 5 },
  ]
  const d = def([
    { id: "t", type: "text", label: "Text", required: true, placeholder: "Type", description: "Help" },
    { id: "p", type: "textarea", label: "Para", required: false },
    { id: "e", type: "email", label: "Email", required: true },
    { id: "ph", type: "phone", label: "Phone", required: false },
    { id: "n", type: "number", label: "Age", required: false, min: 18, max: 99 },
    { id: "d", type: "date", label: "Date", required: false },
    { id: "dd", type: "dropdown", label: "Pick", required: false, options: opts },
    { id: "s", type: "single", label: "One", required: false, options: opts },
    { id: "m", type: "multiple", label: "Many", required: false, options: opts },
    { id: "c", type: "checkboxes", label: "Boxes", required: false, options: opts },
    { id: "r", type: "rating", label: "Rate", required: false, max: 7 },
    { id: "ok", type: "consent", label: "Terms", required: true },
    { id: "f", type: "file", label: "File", required: false },
  ])
  assert.equal(d.fields[0].placeholder, "Type")
  assert.equal(d.fields[0].description, "Help")
  assert.equal(d.fields[10].max, 7)
  const v = validateAnswers(d, { t: " hi ", e: "A@B.co", n: "30", d: "2026-02-28", dd: "b", s: "a", m: ["b", "a"], c: ["a"], r: "7", ok: true, f: "0123456789abcdef0123456789abcdef.abcdefghijklmnopqrstuv", extra: "dropped" })
  assert.equal(v.answers.length, 13)
  assert.equal(v.answers.find((a) => a.field_id === "t")!.value, "hi")
  assert.equal(v.email, "a@b.co")
  assert.deepEqual(v.answers.find((a) => a.field_id === "m")!.value, ["A", "B"])
  assert.equal(v.answers.find((a) => a.field_id === "ok")!.value, "Yes")
  assert.equal(v.score, 5 + 2 + 7 + 2)
  assert.equal(v.files.length, 1)
})

check("types, lengths, options and required are enforced on the server", () => {
  const d = def([
    { id: "e", type: "email", label: "Email", required: true },
    { id: "n", type: "number", label: "Age", required: false, min: 18, max: 99 },
    { id: "d", type: "date", label: "Date", required: false },
    { id: "s", type: "single", label: "One", required: false, options: [{ id: "a", label: "A" }] },
    { id: "m", type: "checkboxes", label: "Many", required: false, options: [{ id: "a", label: "A" }] },
    { id: "r", type: "rating", label: "Rate", required: false },
    { id: "t", type: "text", label: "Short", required: false },
    { id: "ok", type: "consent", label: "Terms", required: true },
    { id: "f", type: "file", label: "File", required: false },
  ])
  const good = { e: "a@b.co", ok: true }
  throwsWith(() => validateAnswers(d, { ok: true }), /Complete Email/)
  throwsWith(() => validateAnswers(d, { e: "a@b.co" }), /Complete Terms/)
  throwsWith(() => validateAnswers(d, { ...good, e: "nope" }), /valid email/)
  throwsWith(() => validateAnswers(d, { ...good, n: "12" }), /at least 18/)
  throwsWith(() => validateAnswers(d, { ...good, n: "abc" }), /number/)
  throwsWith(() => validateAnswers(d, { ...good, d: "2026-02-30" }), /valid date/)
  throwsWith(() => validateAnswers(d, { ...good, s: "zzz" }), /valid answer/)
  throwsWith(() => validateAnswers(d, { ...good, m: "a" }), /valid answers/)
  throwsWith(() => validateAnswers(d, { ...good, m: ["a", "x"] }), /valid answers/)
  throwsWith(() => validateAnswers(d, { ...good, r: "6" }), /rating/)
  throwsWith(() => validateAnswers(d, { ...good, t: "x".repeat(800) }), /too long/)
  throwsWith(() => validateAnswers(d, { ...good, t: { $gt: "" } }), /Enter text/)
  throwsWith(() => validateAnswers(d, { ...good, f: "../../etc/passwd" }), /Upload/)
  throwsWith(() => validateAnswers(d, []), /could not be read/)
  assert.equal(validateAnswers(d, { ...good, t: "x".repeat(600) }).answers.find((a) => a.field_id === "t")!.value.length, 500)
})

check("definitions are validated: unique ids, rules only on earlier questions, results ranges, gated https", () => {
  throwsWith(() => def([{ id: "a", type: "text", label: "A" }, { id: "a", type: "text", label: "B" }]), /unique ID/)
  throwsWith(() => def([{ id: "a", type: "nope", label: "A" }]), /supported/)
  throwsWith(() => def([{ id: "a", type: "text", label: "A", show_if: [{ field: "b", op: "answered" }] }, { id: "b", type: "text", label: "B" }]), /earlier question/)
  throwsWith(() => def([{ id: "a", type: "text", label: "A", show_if: [{ field: "a", op: "answered" }] }]), /earlier question/)
  throwsWith(
    () => def([{ id: "a", type: "single", label: "A", options: [{ id: "x", label: "X" }] }, { id: "b", type: "text", label: "B", show_if: [{ field: "a", op: "is", value: "gone" }] }]),
    /no longer exists/,
  )
  throwsWith(() => def([{ id: "a", type: "text", label: "A" }], { mode: "quiz", results: [{ id: "r", min: 5, max: 1, title: "R", message: "" }] }), /lowest score/)
  throwsWith(() => def([{ id: "a", type: "text", label: "A" }], { completion: { kind: "gated", message: "x", gated: { url: "http://insecure.example", label: "Get" } } }), /https/)
  throwsWith(() => def([{ id: "a", type: "text", label: "A" }], { completion: { kind: "action", message: "x", action: { type: "url", url: "javascript:alert(1)" } } }), /next action/)
  const draft = validateDefinition({ ...base, title: "", fields: [{ id: "a", type: "text", label: "" }] }, false)
  assert.equal(draft.title, "")
  /* An old definition without layout keeps its behaviour: a quiz is one question at a time. */
  assert.equal(def([{ id: "a", type: "text", label: "A" }], { mode: "quiz" }).layout, "one_by_one")
  assert.equal(def([{ id: "a", type: "text", label: "A" }]).layout, "single")
})

check("conditional visibility: hidden questions are not shown, not required and not kept", () => {
  const d = def([
    { id: "kind", type: "single", label: "Kind", required: true, options: [{ id: "biz", label: "Business" }, { id: "me", label: "Personal" }] },
    { id: "company", type: "text", label: "Company", required: true, show_if: [{ field: "kind", op: "is", value: "biz" }] },
    { id: "size", type: "number", label: "Team size", required: true, show_if: [{ field: "company", op: "answered" }] },
    { id: "big", type: "text", label: "Procurement contact", required: false, show_if: [{ field: "size", op: "gte", value: "50" }] },
  ])
  assert.deepEqual(visibleFields(d, { kind: "me" }).map((f) => f.id), ["kind"])
  assert.deepEqual(visibleFields(d, { kind: "biz" }).map((f) => f.id), ["kind", "company"])
  assert.deepEqual(visibleFields(d, { kind: "biz", company: "Acme", size: "80" }).map((f) => f.id), ["kind", "company", "size", "big"])
  /* A rule on a hidden question reads it as empty, even if a value was sent for it. */
  assert.deepEqual(visibleFields(d, { kind: "me", company: "Acme", size: "80" }).map((f) => f.id), ["kind"])
  const personal = validateAnswers(d, { kind: "me", company: "smuggled", size: "999" })
  assert.deepEqual(personal.answers.map((a) => a.field_id), ["kind"])
  throwsWith(() => validateAnswers(d, { kind: "biz" }), /Complete Company/)
  throwsWith(() => validateAnswers(d, { kind: "biz", company: "Acme" }), /Complete Team size/)
  assert.equal(validateAnswers(d, { kind: "biz", company: "Acme", size: "3" }).answers.length, 3)
  const ops = def([
    { id: "m", type: "checkboxes", label: "M", options: [{ id: "x", label: "X" }, { id: "y", label: "Y" }] },
    { id: "a", type: "text", label: "A", show_if: [{ field: "m", op: "includes", value: "y" }] },
    { id: "b", type: "text", label: "B", show_if: [{ field: "m", op: "empty" }] },
    { id: "c", type: "text", label: "C", show_if: [{ field: "m", op: "is_not", value: "x" }] },
  ])
  assert.deepEqual(visibleFields(ops, { m: ["x", "y"] }).map((f) => f.id), ["m", "a", "c"])
  assert.deepEqual(visibleFields(ops, { m: [] }).map((f) => f.id), ["m", "b", "c"])
  assert.deepEqual(visibleFields(ops, { m: ["x"] }).map((f) => f.id), ["m"])
})

check("multi-step and one question at a time follow the visible questions", () => {
  const fields = [
    { id: "a", type: "text", label: "A" },
    { id: "b", type: "single", label: "B", options: [{ id: "y", label: "Yes" }, { id: "n", label: "No" }] },
    { id: "c", type: "text", label: "C", new_step: true, show_if: [{ field: "b", op: "is", value: "y" }] },
    { id: "d", type: "text", label: "D", new_step: true },
  ]
  const steps = def(fields, { layout: "steps" })
  assert.deepEqual(formSteps(steps, { b: "y" }).map((s) => s.map((f) => f.id)), [["a", "b"], ["c"], ["d"]])
  assert.deepEqual(formSteps(steps, { b: "n" }).map((s) => s.map((f) => f.id)), [["a", "b"], ["d"]])
  assert.equal(formSteps(def(fields, { layout: "one_by_one" }), { b: "y" }).length, 4)
  assert.equal(formSteps(def(fields), { b: "y" }).length, 1)
})

check("quiz scoring picks the result whose range holds the score; results never reach the browser early", () => {
  const quiz = validateDefinition(formTemplate("fitness"))
  const low = validateAnswers(quiz, { goal: "routine", name: "A", email: "a@b.co" })
  assert.equal(low.score, 1)
  assert.equal(pickResult(quiz.results, low.score)!.id, "starter")
  const high = validateAnswers(quiz, { goal: "strength", support: ["training", "nutrition"], name: "A", email: "a@b.co" })
  assert.equal(high.score, 5)
  assert.equal(pickResult(quiz.results, high.score)!.id, "build")
  assert.equal(pickResult([{ id: "x", min: 10, max: 20, title: "X", message: "" }], 3), null)
  const pub = publicDefinition(quiz)
  assert.equal(pub.results, undefined)
  const gated = def([{ id: "e", type: "email", label: "E" }], { completion: { kind: "gated", message: "Here", gated: { url: "https://files.example.com/guide.pdf", label: "Get it" } } })
  assert.equal(publicDefinition(gated).completion.gated!.url, "")
  assert.equal(publicDefinition(gated).completion.gated!.label, "Get it")
  assert.ok(!JSON.stringify(publicDefinition(gated)).includes("files.example.com"))
})

check("every template the brief lists exists and is publishable once its link is set", () => {
  for (const id of ["contact", "lead", "coaching", "service", "waitlist", "feedback", "registration"]) assert.ok(FORM_TEMPLATES[id], id)
  assert.equal(TEMPLATE_CHOICES.length >= 7, true)
  for (const { id } of TEMPLATE_CHOICES) {
    const t = formTemplate(id)
    if (t.completion.kind === "gated") t.completion.gated = { url: "https://example.com/file.pdf", label: "Get" }
    assert.ok(validateDefinition(t), id)
  }
  throwsWith(() => validateDefinition(formTemplate("lead")), /https address visitors get/)
})

check("WhatsApp variables are filled from the kept answers and control characters removed", () => {
  const d = def([
    { id: "name", type: "name", label: "Name" },
    { id: "service", type: "dropdown", label: "Service", options: [{ id: "s1", label: "Haircut" }] },
  ])
  const v = validateAnswers(d, { name: "Ana", service: "s1" })
  const text = fillTemplate("Hi, I'm {name}. I'd like {service}.\u0007 {unknown}", v)
  assert.equal(text, "Hi, I'm Ana. I'd like Haircut. {unknown}")
  assert.equal(fillTemplate("{answers}", v), "Name: Ana\nService: Haircut")
})

check("CSV cells that a spreadsheet would run are made text", () => {
  for (const evil of ["=HYPERLINK(\"https://evil\")", "+CMD", "-1+1", "@SUM(A1)", " =1+1", "\t=1", "\r=1", "＝1+1", " +1"]) assert.ok(csvCell(evil).startsWith("\"'"), JSON.stringify(evil))
  assert.equal(csvCell("plain"), '"plain"')
  assert.equal(csvCell('say "hi"'), '"say ""hi"""')
  assert.equal(csvCell(null), '""')
  assert.equal(csvCell(5), '"5"')
  const row = leadRow({ submitted_at: "2026-01-01", form_title: "=cmd", contact_name: "@me", answers: [{ field_id: "a", label: "Q", value: "-2", type: "text" }], consent: { text: "ok", marketing: true }, notes: "+note" }, { starts_at: "2026-02-01T10:00:00.000Z", status: "pending" })
  assert.equal(row.length, LEAD_CSV_HEADER.length)
  const line = row.map(csvCell).join(",")
  assert.ok(line.includes("\"'=cmd\"") && line.includes("\"'@me\"") && line.includes("\"'+note\""))
})

check("search text cannot break out of the owner's filter", () => {
  assert.equal(searchTerm("ana),owner_id.neq.(x"), "ana owner_id.neq. x")
  assert.equal(searchTerm("a*b%c\\d'\"e"), "a b c d e")
  assert.equal(searchTerm("ana@example.com"), "ana@example.com")
  assert.equal(searchTerm("x".repeat(200)).length, 80)
})

console.log(`forms-engine: ${passed} passed`)
