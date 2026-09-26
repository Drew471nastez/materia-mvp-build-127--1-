/**
 * The email composer's shape (components/email/compose), held in the source
 * so it cannot quietly go back. scripts/check-email-composer.mjs measures
 * the same things in a browser at 360, 390, 430 and 1280.
 *
 *   full screen   /app/emails/new and /edit/<id> are phone layers with no
 *                 nav pill, as the automation pages are, and the Emails list
 *                 opens them and they leave with the layer's move
 *   one surface   text blocks have no toolbar of their own; one formatting
 *                 bar, docked on the keyboard on a phone from the page's one
 *                 keyboard number, stuck to the top of the email from 768px
 *   preview       no Write | Preview switch; beside the writing from 1024px,
 *                 and below that a layer that rises on transform only
 *   layouts       an empty new email offers the starters
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/** The code without its comments, so a sentence about a thing is not taken for the thing. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const composer = code("components/email/compose/composer.tsx")
const editor = code("components/email/compose/block-editor.tsx")
const bar = code("components/email/compose/format-bar.tsx")
const text = code("components/email/compose/text-block.tsx")
const layer = code("components/email/compose/preview-layer.tsx")
const home = code("app/app/emails/emails-home.tsx")

console.log("\nFull screen on a phone")
for (const route of ["app/app/emails/new/layout.tsx", "app/app/emails/edit/[id]/layout.tsx"]) {
  const l = code(route)
  check(`${route}: a phone layer with no nav pill, padding the status bar itself`, /<PageLayer inset="page" phoneOnly>\{children\}<\/PageLayer>/.test(l) && !/\bpill\b/.test(l))
}
check("the automation pages too", /<PageLayer inset="bar" phoneOnly>/.test(code("app/app/emails/flow/layout.tsx")) && !/\bpill\b/.test(code("app/app/emails/flow/layout.tsx")))
check("the list opens them with the layer's move", /onClick=\{layerLinkClick\(router, "\/app\/emails\/new"\)\}/.test(home) && /onClick=\{layerLinkClick\(router, "\/app\/emails\/flow\/new"\)\}/.test(home) && /openLayer\(router, `\/app\/emails\/edit\/\$\{c\.id\}`\)/.test(home) && /openLayer\(router, href\(f\)\)/.test(home))
check("and they leave with it", /leaveLayer\(\(\) => \{/.test(code("components/email/compose/compose-page.tsx")) && /leaveLayer\(\(\) => \{/.test(code("app/app/emails/flow/[id]/builder.tsx")) && /leaveLayer\(\(\) => \{/.test(code("app/app/emails/flow/new/chooser.tsx")))
check("the move is page-layer's own, not a second one here", /moveLayer\("enter"/.test(code("app/app/emails/layer-nav.ts")) && /moveLayer\("leave"/.test(code("app/app/emails/layer-nav.ts")))
check("on a phone Preview and Send are at the foot, and step aside while typing", /data-compose-foot=""/.test(composer) && /inert=\{typing\}/.test(composer) && /md:hidden/.test(composer.slice(composer.indexOf("data-compose-foot"), composer.indexOf("data-compose-foot") + 600)))
check("the foot clears the home indicator", /pb-\[calc\(10px\+env\(safe-area-inset-bottom,0px\)\)\]/.test(composer))

console.log("\nOne writing surface")
check("no text block carries the shared field's toolbar", !/RichTextEditor/.test(editor) && /<EmailText/.test(editor))
check("the text is contentEditable with its output cleaned and its paste cleaned", /contentEditable/.test(text) && /cleanStoredHtml\(raw, \{ blocks: true \}\)/.test(text) && /cleanPastedHtml\(pasted\)/.test(text))
check("one formatting bar for the whole email", (editor.match(/<FormatBar /g) ?? []).length === 1)
check("docked on the keyboard on a phone, from the page's one keyboard number", /translate-y-\[calc\(-1\*var\(--kb-inset,0px\)\)\]/.test(bar) && /createPortal\(bar, document\.body\)/.test(bar))
check("shown on a phone only while a text has the caret", /const open = phone \? focused \|\| mode !== "format" : true/.test(bar))
check("it moves on translate and opacity only", /transition-\[translate,opacity\]/.test(bar))
check("from 768px stuck to the top of the email under the page's bar", /top: "var\(--compose-bar, 0px\)"/.test(bar) && /\(max-width: 767px\)/.test(bar))
check("a press on it never takes the caret from the text", (bar.match(/onMouseDown=\{keep\}/g) ?? []).length >= 8)
check("headings, bold, italic, underline, strike, lists, quote, link, alignment, clear, undo, redo", ["Heading", "Subheading", "Bold", "Italic", "Underline", "Strikethrough", "Bulleted list", "Numbered list", "Quote", "Link", "Clear formatting", "Undo", "Redo"].every((l) => bar.includes(`label: "${l}"`)) && /justifyCenter/.test(bar))
check("every control a 44px target on a phone", /inline-flex h-11 min-w-11/.test(bar))
check("the line being typed is kept clear of it", /scroller\?\.scrollBy/.test(bar) && /var\(--kb-inset,0px\)\+80px/.test(composer))
check("a block is added at the caret, the text split around it", /tail\.setStart\(r\.endContainer, r\.endOffset\)/.test(bar) && /const insertAt = \(type: BlockType, at: InsertPoint \| null\)/.test(editor))
check("the button's words are typed on the button, drawn as the email draws it", /data-button-label=""/.test(editor) && /px-6 py-3[^"]*text-\[16px\] font-semibold leading-5/.test(editor) && !/Field label="Button text" htmlFor=\{`\$\{id\}-label`\}/.test(code("components/email/compose/panels.tsx")))

console.log("\nPreview")
check("no Write | Preview switch", !/"write"/.test(composer) && !/label: "Write"/.test(composer) && !/Segmented/.test(composer))
check("beside the writing from 1024px", /className=\{cn\("min-w-0 lg:sticky", editable && "hidden lg:block"\)\}/.test(composer))
check("below 1024px a layer of its own", /<PreviewLayer/.test(composer) && /lg:hidden/.test(composer))
check("which rises and falls on transform only, the iOS sheet curve", /transform: "translateY\(100%\)"/.test(layer) && /PREVIEW_EASE = "cubic-bezier\(0\.32, 0\.72, 0, 1\)"/.test(layer) && !/(height|top|bottom|margin):\s*\d/.test(layer.slice(layer.indexOf("el.animate"), layer.indexOf("el.animate") + 900)))
check("and clears the status bar and the home indicator", /pt-\[env\(safe-area-inset-top,0px\)\]/.test(layer) && /pb-\[env\(safe-area-inset-bottom,0px\)\]/.test(layer))

console.log("\nLayouts")
check("an empty new email offers them", /canStart = editable && !campaignId && !loading && !hasRealContent\(clean\)/.test(composer) && /<StarterList onPick=\{startFrom\} \/>/.test(composer))
check("picking one never overwrites a subject already written", /if \(d\.subject && !subject\.trim\(\)\) setSubject/.test(composer))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
