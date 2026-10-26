/**
 * ===========================================================================
 *  ROUND 20: ASK STORELIB ON A PHONE, THE WAY INTO THE EDITOR
 * ===========================================================================
 * The owner, with a picture from their phone: Ask Storelib's header and
 * thread pushed in and cut off at the right, and two replies both saying
 * "I am picking up the rest now" with nothing picking it up. And "the Edit
 * website button should feel smooth, with a touch feel", "optimize for low
 * internet speeds".
 *
 *   ZOOM       iOS zooms into a field under 16px when it is tapped, and into a
 *              double tap, and stays zoomed: the editor's pages keep their
 *              scale (maximum-scale=1, touch-action: manipulation)
 *   PAN        the conversation follows iOS's pan only with keys up
 *   CONTINUE   a part that stops with the same words as the last goes no
 *              further by itself, and the reply never promises a next part
 *              the chat will not send: it offers Continue instead
 *   EDIT       the button sinks and darkens under a finger, ticks, and the
 *              editor's code is fetched on the way (idle, and on the press)
 *
 * Read from source (comments out). Run with:  npm run test:push
 */
import { readCode } from "./_source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}`)
  }
}

const wbLayout = readCode("app/website-builder/layout.tsx")
const storeLayout = readCode("app/store/[creatorSlug]/themes/[installId]/editor/layout.tsx")
const frame = readCode("components/website-builder/editor-frame.tsx")
const sheet = readCode("components/website-builder/mobile-editor-sheet.tsx")
const chat = readCode("components/website-builder/theme-chat.tsx")
const page = readCode("app/app/website-builder/website-builder-client.tsx")

console.log("\nThe editor keeps its scale")
check("both editor addresses ask for no zoom past the page's own scale", /export const viewport: Viewport = \{ maximumScale: 1 \}/.test(wbLayout) && /export const viewport: Viewport = \{ maximumScale: 1 \}/.test(storeLayout))
check("and a double tap is two taps", /\[touch-action:manipulation\]/.test(frame))
check("the conversation follows iOS's pan only with keys up", /const composerPan = composerKeys && keyboardHere && keyboardInset > 0 \?/.test(sheet))

console.log("\nA long task in parts never repeats itself or promises a part nobody sends")
check("a part that stops with the last part's words goes no further by itself", /const sameAgain = carryOn && !!saidNow && saidNow === lastStopReply\.current/.test(chat) && /continues\.current < MAX_CONTINUES && !sameAgain/.test(chat))
check("when the chat will not carry on, the reply offers Continue and drops the promise", /patch\(\(e\) => \(\{ \.\.\.e, canContinue: true, reply: e\.reply \? withoutCarryOn\(e\.reply\) : e\.reply \}\)\)/.test(chat) && /Press Continue to pick up the rest\./.test(chat))

console.log("\nEdit website answers a finger, and the editor is on its way")
check("it sinks and darkens while held, with no grey flash", /data-edit-website=""/.test(page) && /active:scale-\[0\.97\]/.test(page) && /\[-webkit-tap-highlight-color:transparent\]/.test(page))
check("a light tick in the app", /hapticTap\("light"\)/.test(page))
check("the editor is fetched in a quiet moment (not on save data) and on the press", /requestIdleCallback\(\(\) => warm\(editorWay\)/.test(page) && /conn\?\.saveData/.test(page) && /onPointerDown=\{\(\) => \{\s*warm\(editorHref\(username, live\.id\)\)/.test(page))
check("this suite runs with the others", readCode("scripts/run-push-tests.mjs").includes('"tests/wb-r20.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
