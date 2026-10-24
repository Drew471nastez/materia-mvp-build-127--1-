/**
 * ===========================================================================
 *  A TAP AWAY FROM PUBLISH CLOSES IT
 * ===========================================================================
 * "Tapping outside the publish modal must close it, like other sheets."
 *
 * On a phone Publish is a MobileEditorSheet, whose dim backdrop closes it on
 * a tap. On anything 768 wide or more (a tablet, a phone on its side, a
 * computer) it is a panel hung from the button, closed by a pointerdown
 * anywhere else in the document. An imported theme's canvas is an iframe, and
 * a press in an iframe never reaches the parent document, so a tap on the
 * page left the panel open over it. Measured in the real editor with Dawn
 * imported, at 1024 and 1440: the panel stayed open before, closes now. The
 * window's blur, with the focus gone to an iframe, is what does reach us.
 *
 * Closing never cancels a publish: that runs in the editor (handleSave) and
 * the bar's button keeps saying Publishing until it is done.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(label: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const panel = strip(read("components/website-builder/publish-panel.tsx"))
const sheet = strip(read("components/website-builder/mobile-editor-sheet.tsx"))
const editor = read("app/website-builder/editor/[installId]/page.tsx")

console.log("\nOn a phone, the sheet's backdrop closes it")
check("Publish is a MobileEditorSheet on a phone, handed the same onOpenChange",
  /* Changed on purpose (round BC): the sheet sits in a fragment beside the Add domain window. */
  /if \(mobile\) \{\s*return \(\s*(<>\s*)?<MobileEditorSheet\s+open=\{open\}\s+onOpenChange=\{onOpenChange\}/.test(panel))
check("whose backdrop closes the sheet when tapped",
  /data-wb-sheet-overlay=""[\s\S]{0,80}onClick=\{\(\) => onOpenChange\(false\)\}/.test(sheet))

console.log("\nOn a wider screen, a tap anywhere else closes the panel")
/* Changed on purpose (round BC): heard in the capture phase, so a control that stops its own press (a grip, the canvas) still closes the panel. */
check("a pointerdown outside the panel and its button closes it",
  /document\.addEventListener\("pointerdown", onDown, true\)/.test(panel) && /if \(panelRef\.current\?\.contains\(t\) \|\| anchorRef\.current\?\.contains\(t\)\) return\s*\n\s*onOpenChange\(false\)/.test(panel))
check("and so does a press inside an iframe canvas, heard as the window losing focus to it",
  /window\.addEventListener\("blur", onBlur\)/.test(panel) && /document\.activeElement instanceof HTMLIFrameElement\) onOpenChange\(false\)/.test(panel))
check("which is taken away again when it closes",
  /window\.removeEventListener\("blur", onBlur\)/.test(panel))

console.log("\nClosing it does not stop a publish")
check("the publish is the editor's: the panel only calls onPublish",
  /onPublish=\{\(\) => \{ void handleSave\(\) \}\}/.test(editor) && !/abort|AbortController/.test(panel))
check("and the bar's button says Publishing while it runs",
  /busyNow \? \(live \? "Publishing" : "Saving"\)/.test(editor))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
