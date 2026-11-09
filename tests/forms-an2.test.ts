/**
 * Round AN, track AN2: forms, the action editor and their windows.
 *
 * The owner, on 125.png and the "Get in touch" builder: the templates, the
 * Action selector and the Questions list in Storelib's own selector, the
 * message in the Storelib field with the variables not glued to it, the
 * builder simple and one column with a modern scrollbar, the form pop-up on
 * the page opening smoothly in the block sheet, keyboard-safe, and WhatsApp
 * only after it has closed.
 *
 * The geometry and the motion are measured in Chromium by
 * scripts/check-onepage-actions.mjs and scripts/check-forms-builder.mjs;
 * this pins the rules those depend on.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { insertAtCaret } from "../lib/forms/caret"

let passed = 0
let failed = 0
function check(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ok    ${name}`)
  } catch (e) {
    failed++
    console.log(`  FAIL  ${name}\n        ${(e as Error).message.split("\n").join("\n        ")}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/* The code of a file without its comments, so a rule is pinned on what runs, not on what a note says. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

console.log("\nA variable goes in where the caret is\n")
check("at the end, after a word, with a space", () => {
  assert.deepEqual(insertAtCaret("Is it available?", "{visitor_name}", 16, 16), { text: "Is it available? {visitor_name}", caret: 31 })
})
check("in the middle, with a space before and none doubled after", () => {
  assert.deepEqual(insertAtCaret("Hi, I'm here", "{service}", 3, 3), { text: "Hi, {service} I'm here", caret: 13 })
})
check("against a word that follows, a space after it", () => {
  assert.deepEqual(insertAtCaret("Hi there", "{visitor_name}", 0, 0), { text: "{visitor_name} Hi there", caret: 14 })
})
check("before punctuation, no space after", () => {
  assert.equal(insertAtCaret("Hi ,", "{visitor_name}", 3, 3).text, "Hi {visitor_name},")
})
check("in place of a selection", () => {
  assert.equal(insertAtCaret("Hi NAME, welcome", "{visitor_name}", 3, 7).text, "Hi {visitor_name}, welcome")
})
check("into an empty message, nothing added around it", () => {
  assert.deepEqual(insertAtCaret("", "{service}", 0, 0), { text: "{service}", caret: 9 })
})
check("out of range carets are held to the words, and the length cap holds", () => {
  assert.equal(insertAtCaret("abc", "{x}", 99, 120).text, "abc {x}")
  assert.equal(insertAtCaret("a".repeat(10), "{service}", 10, 10, 12).text.length, 12)
})

console.log("\nStorelib's selector, never the native one\n")
const editorFiles = ["components/forms/action-editor.tsx", "components/forms/form-picker.tsx", "components/forms/forms-manager.tsx", "components/forms/form-reference-editor.tsx", "components/forms/phone-number-field.tsx"]
check("no <select> in the action editor, the form picker or the builder", () => {
  for (const f of editorFiles) assert.doesNotMatch(code(f), /<select[\s>]/, f)
})
check("the Action, Templates, Product and Questions lists are ChoicePickers", () => {
  const editor = code("components/forms/action-editor.tsx")
  assert.match(editor, /name="action-type"/)
  assert.match(editor, /name="message-template"/)
  assert.match(editor, /name="action-product"/)
  /* Each action is drawn with its icon, in the list and in the field. */
  /* Changed on purpose (round AO): where the block keeps its own address (noneLabel, "Web address"), "no action" is drawn with the link mark, not a crossed circle. */
  /* Changed on purpose (round AP): no choice is drawn with a crossed circle at all. "No action" takes the block's own mark (noneMark: a booking's brand), the link mark, or a tick after a form. */
  assert.match(editor, /fieldLeading=\{<ActionMark type=\{type \|\| none\} \/>\}/)
  assert.match(editor, /leading=\{\(c\) => <ActionMark type=\{c\.value \|\| none\} \/>\}/)
  assert.match(editor, /const none = noneMark \|\| \(allowNone && !noneLabel \? "done" : "url"\)/)
  assert.doesNotMatch(editor, /\bBan\b/)
  assert.match(code("components/forms/form-picker.tsx"), /<ChoicePicker[\s\S]*?name=\{`form-\$\{kind\}`\}/)
})
check("a short list opens with no search field over it", () => {
  const list = code("components/ui/choice-list.tsx")
  assert.match(list, /searchable = true/)
  assert.match(list, /if \(!searchable\)\s*return \(\s*<BottomSheet/)
  assert.match(code("components/forms/action-editor.tsx"), /name="action-type"[\s\S]*?searchable=\{false\}/)
})

console.log("\nThe message\n")
check("the message is the OnePage field, and the chips sit 10px under it", () => {
  const fields = code("components/forms/fields.ts")
  assert.match(fields, /export const AREA =\s*"[^"]*rounded-xl[^"]*focus:border-\[#1a1a2e\]/)
  const editor = code("components/forms/action-editor.tsx")
  assert.match(editor, /className=\{AREA\}/)
  assert.match(editor, /className="mt-2\.5 flex flex-wrap gap-1\.5"[^>]*data-variable-chips/)
})
check("a chip keeps the focus in the message and goes in at the caret", () => {
  const editor = code("components/forms/action-editor.tsx")
  assert.match(editor, /onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/)
  assert.match(editor, /insertAtCaret\(before, token, at, end\)/)
  assert.match(editor, /onSelect=\{keepCaret\}/)
})
check("a template fades in, respects reduced motion, and can be undone", () => {
  const editor = code("components/forms/action-editor.tsx")
  assert.match(editor, /!reducedMotion\(\) && typeof el\.animate === "function"/)
  assert.match(editor, /data-template-undo/)
})

console.log("\nThe builder\n")
check("one column: no preview or options panel at the side", () => {
  const builder = code("components/forms/forms-manager.tsx")
  /* Changed on purpose (wave 7): the form's PAGE in Contacts › Forms has the summary beside it from lg (where it stands, responses, link, where used), as the coupon editor does; the builder itself is still one column with no preview or options panel at the side. */
  assert.equal((builder.match(/<aside/g) ?? []).length, 1)
  assert.match(builder, /\{withAside \? <aside className="min-w-0 lg:sticky lg:top-\[96px\]" aria-label=\{tt\("Summary"\)\}>\{summary\}<\/aside> : null\}/)
  assert.doesNotMatch(builder, /lg:grid-cols-\[minmax\(0,1fr\)_420px\]/)
})
check("the settings open in place, one at a time, after the questions", () => {
  const builder = code("components/forms/forms-manager.tsx")
  const questions = builder.indexOf('data-form-questions=""')
  const after = builder.indexOf('id="after"')
  const responses = builder.indexOf('id="responses"')
  assert.ok(questions > 0 && after > questions && responses > after, "questions, then After sending, then Where answers go")
  assert.match(builder, /const toggleSetting = \(id: string\) => setOpenSetting\(\(was\) => \(was === id \? null : id\)\)/)
  assert.match(builder, /<Reveal open=\{open\}>/)
})
check("only the middle scrolls, with a thin scrollbar", () => {
  assert.match(code("components/forms/fields.ts"), /THIN_SCROLL = "\[scrollbar-width:thin\]/)
  assert.match(code("components/forms/forms-manager.tsx"), /overflow-y-auto overscroll-contain[^"]*", THIN_SCROLL\)/)
})
check("a centred dialog on a computer, the shared sheet on a phone", () => {
  const dialog = code("components/forms/form-builder-dialog.tsx")
  assert.match(dialog, /<SheetDialog/)
  assert.match(dialog, /w-\[min\(640px,calc\(100vw-32px\)\)\]/)
})
check("nothing is lost by a press outside: every way out asks the builder first", () => {
  assert.match(code("components/forms/form-builder-dialog.tsx"), /const requestClose = \(\) => \(guard\.current \? guard\.current\(\) : onClose\(\)\)/)
  assert.match(code("components/forms/forms-manager.tsx"), /closeRef\.current = \(\) => void close\(\)/)
})
check("no browser confirm() in the forms: Storelib's own confirm", () => {
  for (const f of ["components/forms/forms-manager.tsx", "app/(storelib)/app/emails/forms/forms-list.tsx"]) assert.doesNotMatch(code(f), /window\.confirm\(/, f)
  assert.match(code("app/(storelib)/app/emails/forms/forms-list.tsx"), /await confirmForm\(\{/)
})
check("Contacts › Forms draws the same one column on its Edit tab, and Settings as cards", () => {
  const builder = code("components/forms/forms-manager.tsx")
  assert.match(builder, /const inPage = view !== undefined/)
  /* Changed on purpose (wave 6): the column is the page's own width (FORM_WIDTH), the same as its bar, so the two line up. */
  assert.match(builder, /\) : preview \? \(\s*previewPane\s*\) : \(\s*editor\s*\)\}/)
  /* Changed on purpose (wave 7): the page is an order's width (ORDER_WIDTH), and Publication became the form's summary beside it (FormSummary: where it stands, responses, link, where used). */
  assert.match(builder, /const FORM_WIDTH = ORDER_WIDTH/)
  assert.match(builder, /<FormSummary\s/)
  /* Where answers go and privacy live on the Settings tab of the page, and in the dialog's rows. */
  assert.match(builder, /\{inPage \? null : \(\s*<Disclosure id="responses"/)
})

console.log("\nThe form on the page\n")
check("a form opens in the block sheet where one is drawn, the dialog elsewhere", () => {
  const frame = code("components/forms/action-frame.tsx")
  assert.match(frame, /const blockSheet = useBlockSheet\(\)/)
  /* Only the contract: the sheet itself stays out of a creator page's first script (tests/pubperf-r48). */
  assert.match(frame, /from "@\/components\/onepage\/block-sheet-context"/)
  assert.doesNotMatch(frame, /from "@\/components\/onepage\/block-sheet"/)
  assert.match(frame, /if \(formId && blockSheet\.available\) return openFormSheet\(formId\)/)
  assert.match(frame, /if \(formId\) return setFormOpen\(true\)/)
})
check("the chat opens only once the sheet and its history entry have gone", () => {
  const frame = code("components/forms/action-frame.tsx")
  const sheetPart = frame.slice(frame.indexOf("const openFormSheet"), frame.indexOf("return (", frame.indexOf("const openFormSheet")))
  assert.match(sheetPart, /onGone: \(\) => \{\s*if \(leaving\.href && !inPreview\) window\.location\.assign\(leaving\.href\)/)
  assert.equal((sheetPart.match(/window\.location\.assign/g) || []).length, 1, "the sheet path leaves the page in one place only")
  const sheet = code("components/onepage/block-sheet.tsx")
  assert.match(code("components/onepage/block-sheet-context.ts"), /onGone\?: \(\) => void/)
  assert.match(sheet, /if \(!after\.current\.run && requestRef\.current\.onGone\) after\.current\.run = requestRef\.current\.onGone/)
  assert.match(sheet, /after\.current\.left = false\s*leaveHistory\(\(\) => \{\s*after\.current\.left = true\s*runAfter\(\)/)
})
check("the form is read from the press, so it settles in rather than popping", () => {
  const frame = code("components/forms/action-frame.tsx")
  assert.match(frame, /onPointerDownCapture=\{formId && blockSheet\.available/)
  const form = code("components/forms/public-form.tsx")
  assert.match(form, /export function prefetchPublicForm\(formId: string\)/)
  assert.match(form, /loadedForms\.get\(formId\)/)
  assert.match(form, /motion-safe:animate-in motion-safe:fade-in-0/)
  /* The test of round AL still holds: a form that will not load lets the chat go on. */
  assert.match(form, /onUnavailableRef\.current\?\.\(\)/)
})
check("the sheet sits on the keyboard on a phone and draws no scrollbar", () => {
  const sheet = code("components/onepage/block-sheet.tsx")
  assert.match(sheet, /max-sm:pb-\[var\(--kb-inset,0px\)\]/)
  assert.match(sheet, /var\(--vv-h,100dvh\)/)
  assert.match(sheet, /\[scrollbar-width:none\]/)
})
check("the visitor's form takes the sheet's colours, so a dark page gets a dark form", () => {
  const form = code("components/forms/public-form.tsx")
  assert.match(form, /text-\[var\(--sheet-ink,#1a1a2e\)\]/)
  assert.match(form, /bg-\[var\(--form-field,#fff\)\]/)
  assert.match(code("components/forms/form-sheet-body.tsx"), /"--form-field": "var\(--sheet-field\)"/)
})

console.log("\nWords\n")
check("the creator's forms screens are in the i18n scan", () => {
  assert.match(read("scripts/i18n/scan.mjs"), /components\\\/forms\\\/\(action-editor\|form-picker\|form-builder-dialog\|forms-manager/)
})
check("no banned words or em dashes in what the forms screens say", () => {
  for (const f of [...editorFiles, "components/forms/form-builder-dialog.tsx", "components/forms/form-confirm.tsx", "components/forms/action-frame.tsx"]) {
    const strings = (read(f).match(/tt\("([^"]*)"/g) || []).join(" ")
    assert.doesNotMatch(strings, /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i, f)
    assert.doesNotMatch(strings, /—/, f)
  }
})

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
