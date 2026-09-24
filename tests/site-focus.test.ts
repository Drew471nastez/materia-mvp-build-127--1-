/**
 * ===========================================================================
 *  A FIELD ON A WEBSITE IS NOT DRAGGED ANYWHERE WHEN IT IS CLICKED
 * ===========================================================================
 * The app's KeyboardGuard is mounted for every route and centred each
 * focused field with a smooth scroll half a second later, on a published
 * website and on a desktop too. Measured in scripts/check-site-focus.mjs;
 * the wiring is held here.
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

const layout = read("app/(site)/layout.tsx")
const marker = read("components/website-builder/site-document.tsx")
const guard = read("components/platform/keyboard-guard.tsx")
const css = read("app/globals.css")

check("every published website marks its document", /<SiteDocument \/>/.test(layout) && /root\.classList\.add\(SITE_DOCUMENT_CLASS\)/.test(marker) && /SITE_DOCUMENT_CLASS = "storelib-site"/.test(marker))
check("the keyboard guard stands down on a website, for the keyboard and for a focus", /function onViewportChange\(\) \{\s*\/\*[^*]*\*\/\s*if \(isSiteDocument\(\)\) return/.test(guard) && /function onFocusIn\(e: FocusEvent\) \{\s*if \(isSiteDocument\(\)\) return/.test(guard))
check("and elsewhere it moves only a field the keyboard covers, and only as far as needed", !/block: "center", behavior: "smooth" \}\)/.test(guard) && /if \(r\.top >= top && r\.bottom <= bottom\) return\s*active\.scrollIntoView\(\{ block: "nearest", behavior: "auto" \}\)/.test(guard))
check("a field brought into view on a website clears a sticky header", /html\.storelib-site :is\(input, textarea, select, \[contenteditable="true"\]\) \{\s*scroll-margin-top: 96px;/.test(css))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
