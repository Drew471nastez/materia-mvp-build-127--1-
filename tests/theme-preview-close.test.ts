/**
 * ===========================================================================
 *  X CLOSES THE PREVIEW AND NOTHING ELSE (round 30)
 * ===========================================================================
 * The owner: "clicking a template opens its preview; pressing X must close
 * only the preview and return the visitor exactly where they were (same
 * page, same scroll), not close everything". The preview's close button was
 * wired to closePreviewAndThemes, which went back over the preview's history
 * entry and the marketplace's in one traversal, so the marketplace closed
 * under it and the creator was dropped on the Website page.
 *
 * Now X is Back: one entry back, onto the grid it was opened from, which
 * never moved (it stays mounted, its list keeps its scroll, the focus goes
 * back to the cover). scripts/check-theme-preview-close.mjs measures it in
 * Chromium at 1440 and on a phone, from a card deep in the list.
 *
 *   npx tsx tests/theme-preview-close.test.ts
 */
import { existsSync, readFileSync } from "node:fs"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 500)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

const page = read("app/(storelib)/app/website-builder/website-builder-client.tsx")
const preview = read("app/(storelib)/app/website-builder/themes/theme-preview.tsx")
const host = page.slice(page.indexOf("<PreviewHost"), page.indexOf("/>", page.indexOf("<PreviewHost")))

console.log("\nThe preview's close button\n")
check("X goes back to where the preview was opened from, like Back", /onBack=\{closePreview\}/.test(host) && /onClose=\{closePreview\}/.test(host), host)
check("nothing closes the marketplace and the preview together any more", !/closePreviewAndThemes|closingAll|clearThemesAddress/.test(page))
const close = page.slice(page.indexOf("const closePreview = () => {"), page.indexOf("/** The website being imported"))
check("closePreview goes back over the preview's own entry (and pages browsed inside it) only", /backThen\(clearPreviewAddress, undefined, 1 \+ browsed\)/.test(close) && !/setThemesOpen\(false\)/.test(close) && !/themesPushed\.current = false/.test(close))
check("the button is still there, labelled Close, and calls onClose", /data-preview-close="" aria-label=\{tt\("Close"\)\} onClick=\{onClose\}/.test(preview))
check("the focus goes back to the cover that opened it", /onCloseAutoFocus=\{\(e\) => \{\s*const back = returnFocus\?\.\(\)/.test(preview) && /back\.focus\(\{ preventScroll: true \}\)/.test(preview))
check("its documentation says so", /close button all land on\s+\* the grid under it, at the scroll it was left at/.test(preview) && /The close button: the preview only/.test(preview))
check("the Chromium measurement is there: a card deep in the list, X, the same scroll, at 1440 and on a phone", existsSync("scripts/check-theme-preview-close.mjs") && /\[1440, 900\], \[390, 844\]/.test(read("scripts/check-theme-preview-close.mjs")) && /the list is on the same scroll, the card where it was/.test(read("scripts/check-theme-preview-close.mjs")))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
