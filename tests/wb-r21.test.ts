/**
 * ===========================================================================
 *  ROUND 21: ASK STORELIB'S SHEET HOLDS ITS CONVERSATION, EDIT WEBSITE TURNS
 * ===========================================================================
 * The owner's iPhone again: the sheet in its place and everything inside it
 * pushed right and down, cut off. Not reproducible in Chromium at the
 * phone's size, pixel ratio and safe area, so the conversation is measured
 * against its sheet at the moments iOS could leave it moved, put back, and
 * what was found is sent to /api/client-errors once
 * (lib/website-builder/ask-sheet-guard.ts, scripts/check-ask-sheet-r18.mjs
 * GUARD). And Edit website: "it should not bump or zoom, not even fade,
 * maybe a loading smooth circle".
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

const guard = readCode("lib/website-builder/ask-sheet-guard.ts")
const chat = readCode("components/website-builder/theme-chat.tsx")
const page = readCode("app/(storelib)/app/website-builder/website-builder-client.tsx")
const css = readCode("app/globals.css")
const probe = readCode("scripts/check-ask-sheet-r18.mjs")

console.log("\nThe conversation is where its sheet is")
check("measured against the sheet's own box and the grab bar's height, less the sheet's own pan", /c\.top - \(s\.top \+ bar\.offsetHeight\) - pan/.test(guard) && /c\.left - s\.left/.test(guard))
check("what was scrolled on the way up is put back", /if \(n\.scrollLeft\) n\.scrollLeft = 0/.test(guard) && /window\.scrollTo\(0, 0\)/.test(guard))
check("and what was found is told once a visit, with no person's data in it", /if \(!told\)/.test(guard) && /\/api\/client-errors/.test(guard) && /path: location\.pathname/.test(guard))
check("a transform that moves nothing is not a finding", /matrix\\\(1, 0, 0, 1, 0, 0\\\)/.test(guard))
check("the phone's chat looks at the moments iOS could leave it moved, in a timer, never per frame", /guardAskSheet\(column\)/.test(chat) && /vv\?\.addEventListener\("scroll", afterMove\)/.test(chat) && /document\.addEventListener\("focusout", afterMove\)/.test(chat) && /new IntersectionObserver/.test(chat))
check("the probe knocks the sheet out of place and sees it put back and told", /the guard put it back, the header under the grab bar again/.test(probe) && /the sheet's guard found nothing out of place through the whole run/.test(probe))

console.log("\nEdit website: a turning circle, and nothing else")
check("no sink, no darker shade, no fade under a finger", !/active:scale-/.test(page.slice(page.indexOf('data-edit-website=""') - 600, page.indexOf('data-edit-website=""') + 1200)) && /html\.capacitor \[data-edit-website\]:active \{\s*opacity: 1;/.test(css))
check("pressed, a circle turns beside the words until the editor is up", /\{opening \? <span aria-hidden data-edit-spinner="" className="wb-edit-spinner" \/> : null\}/.test(page) && /setOpening\(true\)/.test(page))
check("on rotate only, out of the line so the words never move", /\.wb-edit-spinner \{\s*position: absolute;\s*right: calc\(100% \+ 8px\);/.test(css) && /@keyframes wb-edit-spin \{\s*to \{ rotate: 360deg; \}/.test(css))
check("it stops if the page is shown again or after a long wait", /window\.addEventListener\("pageshow", done\)/.test(page) && /window\.setTimeout\(done, 15_000\)/.test(page))
check("this suite runs with the others", readCode("scripts/run-push-tests.mjs").includes('"tests/wb-r21.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
