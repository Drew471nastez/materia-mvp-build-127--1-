/**
 * A OnePage block's form, the same in the editor's phone, in Preview and live.
 *
 * The owner (rec19 image 22): "Antrenamente 1:1" opened "Get in touch", its
 * questions rewritten in Romanian, and the phone beside the editor still drew
 * the template's "Your name", "Email address" and "How can I help?". The
 * preview frame read the form as a visitor does (the published copy over
 * /api/forms/<id>/public), once, and kept it; the builder's edits never
 * reached it. Now the editor hands the frame the forms its page opens, edit by
 * edit (lib/forms/preview-forms), and the live page still reads the published
 * copy. scripts/check-onepage-forms.mjs draws it in Chromium.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  builderDraft,
  expectPreviewForms,
  formIdsInBlocks,
  noteBuilderDraft,
  previewFormState,
  previewFormsFor,
  previewFormsSnapshot,
  receivePreviewForms,
  whenPreviewForm,
} from "../lib/forms/preview-forms"
import { validateAnswers, validateDefinition, type FormDefinition } from "../lib/forms/definition"
import { formTemplate } from "../lib/forms/templates"

let passed = 0
let failed = 0
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  ok    ${name}`)
  } catch (e) {
    failed++
    console.log(`  FAIL  ${name}\n        ${(e as Error).message.split("\n").join("\n        ")}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const FORM = "6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f"
const BOOKING = "7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
const contact = formTemplate("contact") as FormDefinition
const romanian: FormDefinition = validateDefinition(
  {
    ...contact,
    fields: [
      { id: "name", type: "name", label: "Cum te numești?", required: true },
      { id: "email", type: "email", label: "Care este adresa ta de email?", required: true },
      { id: "how", type: "dropdown", label: "Cum ai prefera să lucrăm?", required: true, options: [{ id: "online", label: "Online" }, { id: "sala", label: "La sală" }] },
    ],
  },
  true,
)

async function main() {
  console.log("\nThe forms a page opens\n")
  await check("every form id the page names, in a link's action, a chat's questions, a Form block and a group", () => {
    const blocks = [
      { id: "a", type: "link_button", data: { label: "Antrenamente 1:1", action: { type: "form", form_id: FORM } } },
      { id: "b", type: "group", data: { children: [{ id: "c", type: "calendly", data: { action: { type: "booking", form_id: BOOKING } } }] } },
      { id: "d", type: "link_button", data: { action: { type: "whatsapp", pre_chat: { form_id: FORM } } } },
      { id: "e", type: "form_quiz", data: { form_id: "not-an-id" } },
    ]
    assert.deepEqual(formIdsInBlocks(blocks).sort(), [FORM, BOOKING].sort())
    assert.deepEqual(formIdsInBlocks(null), [])
  })

  console.log("\nWhat the editor hands the preview\n")
  const rows = [{ id: FORM, status: "published", revision: 3, draft: romanian, published: contact }]
  await check("the saved draft, not the published copy, and it says the live page differs", () => {
    const [f] = previewFormsFor([FORM], rows, () => undefined)
    assert.deepEqual(f.definition.fields.map((x) => x.label), ["Cum te numești?", "Care este adresa ta de email?", "Cum ai prefera să lucrăm?"])
    assert.equal(f.definition.fields[2].type, "dropdown")
    assert.equal(f.published, "changed")
    assert.equal(f.revision, 3)
  })
  await check("the builder's copy as it stands this moment comes first, and leaves when the builder closes", () => {
    const edited = { ...romanian, fields: [...romanian.fields, { id: "goal", type: "textarea" as const, label: "Ce obiectiv ai?", required: false }] }
    noteBuilderDraft(FORM, edited)
    assert.equal(previewFormsFor([FORM], rows)[0].definition.fields.length, 4)
    noteBuilderDraft(FORM, null)
    assert.equal(builderDraft(FORM), undefined)
    assert.equal(previewFormsFor([FORM], rows)[0].definition.fields.length, 3)
  })
  await check("a form published as it is reads as the same, once both are kept as the server keeps them", () => {
    const [f] = previewFormsFor([FORM], [{ id: FORM, status: "published", revision: 4, draft: { ...romanian, title: "Get in touch " }, published: romanian }], () => undefined)
    assert.equal(f.published, "same")
  })
  await check("a draft never published is shown, and marked as not answerable yet", () => {
    const [f] = previewFormsFor([FORM], [{ id: FORM, status: "draft", revision: 0, draft: romanian, published: null }], () => undefined)
    assert.equal(f.published, "draft")
  })
  await check("a form the list does not have is left out, for the frame to read itself", () => {
    assert.deepEqual(previewFormsFor([BOOKING], rows, () => undefined), [])
  })

  console.log("\nWhat the frame does with it\n")
  await check("outside the editor's preview nothing is known: the live page reads the published copy", () => {
    assert.equal(previewFormState(previewFormsSnapshot(), FORM), null)
  })
  await check("inside it, a form is waited for until the editor's list is read, never read as a visitor first", async () => {
    expectPreviewForms()
    assert.deepEqual(previewFormState(previewFormsSnapshot(), FORM), { form: null, waiting: true })
    const later = whenPreviewForm(FORM, 1000)
    receivePreviewForms(previewFormsFor([FORM], rows, () => undefined), true)
    const got = await later
    assert.equal(got?.definition.fields[0].label, "Cum te numești?")
    /* Settled without it: read over the network. */
    assert.equal(previewFormState(previewFormsSnapshot(), BOOKING), null)
    assert.equal(await whenPreviewForm(BOOKING, 50), null)
  })
  await check("a malformed message is dropped, never drawn", () => {
    receivePreviewForms([{ id: FORM }, null, { id: BOOKING, definition: { fields: "x" } }], true)
    assert.equal(previewFormsSnapshot().forms.size, 0)
  })

  console.log("\nWired end to end\n")
  await check("the builder says each edit; the editor's frame sends the forms before the page and with every edit", () => {
    const manager = code("components/forms/forms-manager.tsx")
    assert.match(manager, /noteBuilderDraft\(formId, draft\)/)
    assert.match(manager, /useEffect\(\(\) => \(\) => noteBuilderDraft\(formId, null\), \[formId\]\)/)
    const live = code("components/onepage/live-preview.tsx")
    assert.match(live, /kind: "forms", forms: f\.forms, settled: f\.settled/)
    assert.match(live, /sendForms\(\)\s*win\.postMessage\(\{ channel: ONEPAGE_PREVIEW_CHANNEL, kind: "page"/)
    assert.match(live, /requestAnimationFrame\(sendForms\)/)
    const doc = code("components/onepage/preview-document.tsx")
    assert.match(doc, /expectPreviewForms\(\)/)
    assert.match(doc, /if \(data\.kind === "forms"\) \{\s*formsHeard = true\s*receivePreviewForms\(data\.forms, data\.settled\)/)
    /* An editor that sends no forms is not waited on: the frame reads them as a visitor does. */
    assert.match(doc, /if \(!formsHeard\) settlePreviewForms\(\)/)
  })
  await check("the visitor's form draws the editor's copy in the preview, and reads nothing while it waits", () => {
    const form = code("components/forms/public-form.tsx")
    assert.match(form, /const fromEditor = initial \|\| !formId \? null : previewFormState\(previewSnap, formId\)/)
    assert.match(form, /if \(readMode !== "read"\) return/)
    assert.match(form, /if \(previewFormState\(previewFormsSnapshot\(\), formId\)\) return whenPreviewForm\(formId\)/)
    assert.match(form, /Changes not published yet\. Visitors see the published version\./)
  })
  await check("a form published while the visitor answered is read again and the answers sent once more", () => {
    assert.match(code("app/api/forms/[id]/submit/route.ts"), /form_changed: true \}, 409\)/)
    const form = code("components/forms/public-form.tsx")
    assert.match(form, /if \(r\.status === 409 && b\.form_changed\) \{\s*const fresh = await readPublicForm\(formId\)/)
  })
  await check("the thanks settles in and takes the focus, still under reduced motion", () => {
    const form = code("components/forms/public-form.tsx")
    assert.match(form, /data-form-complete=""/)
    assert.match(form, /motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1\.5/)
    assert.match(form, /own\.current\?\.focus\(\{ preventScroll: true \}\)/)
  })

  console.log("\nThe answers the server keeps\n")
  await check("the Romanian form: every required question, and the dropdown only from its options", () => {
    assert.throws(() => validateAnswers(romanian, { name: "Ana", email: "ana@example.ro" }), /Cum ai prefera/)
    assert.throws(() => validateAnswers(romanian, { name: "Ana", email: "ana@example.ro", how: "acasa" }), /Choose a valid answer/)
    const ok = validateAnswers(romanian, { name: "Ana", email: "ana@example.ro", how: "sala" })
    assert.equal(ok.name, "Ana")
    assert.equal(ok.email, "ana@example.ro")
    assert.equal(ok.answers.find((a) => a.field_id === "how")?.value, "La sală")
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

void main()
