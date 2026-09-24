/**
 * ===========================================================================
 *  CLOSING STORELIB AI'S PANEL DOES NOT STOP WHAT IT IS DOING
 * ===========================================================================
 * On a desktop the panel was drawn only while it was open, so closing it
 * unmounted the chat and took the request with it, half done. It stays
 * mounted once opened and is hidden when closed; the button says it is
 * still working.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const editor = read("app/website-builder/editor/[installId]/page.tsx")
const chat = read("components/website-builder/theme-chat.tsx")

check("the desktop panel stays mounted once opened, and is hidden when closed",
  /\{!isMobileView && aiMounted && \(\s*<div className=\{cn\("relative flex-shrink-0", !aiOpen && "hidden"\)\}/.test(editor) && !/\{!isMobileView && aiOpen && \(/.test(editor))
check("so does the phone's sheet", /\{isMobileView && aiMounted && \(\s*<MobileEditorSheet open=\{aiOpen\}/.test(editor))
check("closing the panel only hides it; nothing in the chat stops a run on close", !/onClose[^\n]*abort/.test(chat) && !/return \(\) => [^\n]*abortRef/.test(chat))
check("the chat says when it is working, and the button shows it with the panel closed",
  /onBusyChange\?\.\(busy\)/.test(chat) && (editor.match(/onBusyChange=\{setAiBusy\}/g) ?? []).length === 2 && /\{aiBusy && !aiOpen && <span aria-hidden className="wb-live-dot" data-pulse=""/.test(editor))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
