/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR: A WAY IN, A WAY OUT, AND THE WHOLE SCREEN ON A PHONE
 * ===========================================================================
 * components/onepage/onepage-editor.tsx, held to what was asked of it:
 *
 *   full screen on a phone    starts at the top, its white bar in the safe
 *                             area, the black header and shield not painted
 *   a way out                 an arrow in the phone bar, asking first when
 *                             there is unsaved work, then the dark glass
 *   a way in                  the light loader, faded off what arrived
 *   undo and redo             the icon squares from the rest of /app
 *   three more designs        Studio, Night and Peach
 *   settings                  SEO as one share card, no upload modal, no
 *                             stock icons in the section list
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const editor = read("components/onepage/onepage-editor.tsx")
const css = read("app/globals.css")
const design = read("components/onepage/tabs/design-tab.tsx")
const settings = read("components/onepage/tabs/settings-tab.tsx")

console.log("\nFull screen on a phone")
check("the editor starts at the top of the screen, under the header only from 768px", /fixed left-0 right-0 top-0 md:left-\[240px\] md:top-\[58px\]/.test(editor))
check("its bar pads itself into the safe area on a phone", /box-content flex items-center border-b bg-white[^"]*pt-\[env\(safe-area-inset-top\)\] md:pt-0/.test(editor))
check("it sets with-op-editor on <html>", /<HtmlClass name="with-op-editor" \/>/.test(editor))
const phoneBlock = css.slice(css.indexOf("The OnePage editor, full screen on a phone"))
check("which hides the shell chrome under 768px only", /@media \(max-width: 767px\) \{\s*html\.with-op-editor \[data-shell-chrome\] \{\s*visibility: hidden;/.test(phoneBlock))
check("and stands the native black shield down", /html\.capacitor\.with-op-editor\.with-op-editor::before \{\s*display: none;/.test(phoneBlock))
check("the editor keeps z 30, so its dialogs and sheets still open over it", /style=\{\{ zIndex: 30, \.\.\.bottomAboveKeyboard\(\) \}\}/.test(editor))

console.log("\nA way out, and a way in")
check("an arrow in the phone bar", /data-onepage-exit=""/.test(editor) && /md:hidden -ml-1 inline-flex h-9 w-9/.test(editor))
check("it asks first when there is unsaved work", /const handleExit = \(\) => \{\s*if \(isDirty\) \{\s*setPendingNavigation\("\/app"\)\s*setShowUnsavedDialog\(true\)/.test(editor))
check("Save and Discard both leave through the glass", (editor.match(/if \(pendingNavigation === "\/app"\) \{\s*leave\(\)/g) ?? []).length === 2)
check("the glass is the builder's, with Going back", /<div className="wb-leaving"[^>]*>\s*<BuilderLoader className="wb-leaving-content" tone="dark" lines=\{\["Going back", "Almost there"\]\} \/>/.test(editor))
check("the push waits to be seen and has a ceiling", /LEAVING_SEEN_MS\)/.test(editor) && /navigateWithCeiling\(/.test(editor))
check("and the glass can come back down", /window\.addEventListener\("pageshow", onPageShow\)/.test(editor) && /const watchdog = window\.setTimeout\(revive, 6000\)/.test(editor))
check("an answered question does not bring the browser's own prompt", /if \(isDirty && !leavingRef\.current\)/.test(editor))
check("the light loader on the way in, faded off", /wb-canvas-loader absolute inset-0/.test(editor) && /useLinger\(!arrived, 320\)/.test(editor))

console.log("\nUndo and redo")
check("both are the icon squares, not ghost buttons", (editor.match(/className=\{cn\(iconDepth, "h-8 w-8 rounded-\[9px\] text-\[#374151\]"\)\}/g) ?? []).length === 2)

console.log("\nThe editor's questions")
check("on a phone they are the shared sheet", /<BottomSheet isOpen=\{open\} onClose=\{onClose\} label=\{label\} hideFrom="md">/.test(editor))
check("with no drag kept in React state any more", !/setDragY\(/.test(editor))

console.log("\nThree more designs")
for (const [id, category] of [["studio", "light"], ["night", "dark"], ["peach", "gradient"]]) {
  check(`${id}, under ${category}`, new RegExp(`id: "${id}",\\s*name: "[A-Z][a-z]+",\\s*category: "${category}",`).test(design))
}

console.log("\nSettings")
check("SEO is one share card", /data-og-card=""/.test(settings) && /Share preview/.test(settings))
check("Add image opens the picker straight away, no modal", /fileInputRef\.current\?\.click\(\)/.test(settings) && !/showOgImageModal/.test(settings) && !/Upload Social Image/.test(settings))
check("the section list is words, no icons", !/icon: [A-Z]/.test(settings.slice(settings.indexOf("const SETTINGS_SECTIONS"), settings.indexOf("const SETTINGS_SECTIONS") + 600)))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
