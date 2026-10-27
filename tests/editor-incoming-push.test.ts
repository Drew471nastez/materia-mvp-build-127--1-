/**
 * A push from GitHub or a coding agent used to reload the whole theme and
 * redraw every section, and the next push did it again. The editor stuttered
 * until it was reloaded.
 *
 * A changed section file redraws the sections of that type. Anything else a
 * section might read redraws the page's sections. An imported theme's page
 * is drawn once behind the one on screen.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { noteSourceChanges, resetSourceRevisions, sourceRevision } from "@/lib/website-builder/source-revisions"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nA changed file redraws the sections that read it")
{
  resetSourceRevisions()
  const hero = sourceRevision("hero")
  const faq = sourceRevision("faq")
  noteSourceChanges(["sections/hero.storelib"])
  check("the section whose file changed", sourceRevision("hero") === hero + 1)
  check("a section whose file did not", sourceRevision("faq") === faq)
  noteSourceChanges(["snippets/price.storelib", "sections/faq.storelib"])
  check("a snippet redraws every section, and the faq file redraws faq", sourceRevision("hero") > hero + 1 && sourceRevision("faq") > faq)
  noteSourceChanges([])
  check("nothing changed, nothing redraws", sourceRevision("hero") === sourceRevision("hero"))
}

console.log("\nThe open editor takes a push in one pass")
{
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const handler = editor.slice(editor.indexOf("const handleAgentEvents = async"), editor.indexOf("} = useSiteActivity({"))
  check("only the files a push names are read, and they are applied at once", /readThemeTexts\(installId, sourcePaths\)/.test(handler) && /else files = await loadStorelibSources\(\{ hold: true \}\)/.test(handler) && /landRemote\(\); applyIncoming\(\); flush\(\)/.test(handler))
  check("one section file is drawn in place; a rewritten page or theme code is a fresh document", /if \(importedNow && \(themeCode \|\| replacedHere \|\| \(many && !catchUp\)\)\) setReplaceDocument/.test(handler))
  check("coming back to a pile is one pass, and that pile does not reload the document for section files", /CATCH_UP_AWAY_MS = 8_000/.test(read("components/website-builder/site-connections.tsx")) && /await onEventsRef\.current\(events, \{ catchUp \}\)/.test(read("components/website-builder/site-connections.tsx")) && /catchUp && sourcePaths\.length > 8/.test(handler))
  check("a page rewritten whole lands in the same render as its files", /afterQuietLoad\.current = \(\) => \{ landRemote\(\); applyIncoming\(\); flush\(\) \}/.test(handler) && /startTransition\(\(\) => \{\s*setSettingsDraft\(loadedSettings\)\s*setSections\(loaded\)\s*alongside\?\.\(\)\s*\}\)/.test(editor))
  check("that page is not also built by replaying operations", /if \(!replacedHere\) for \(const op of/.test(handler))
  const canvas = read("components/website-builder/compat/compat-canvas.tsx")
  check("an imported theme draws the new page once behind the one on screen", /replaceDocument=\{replaceDocument\}/.test(editor) && /if \(\(props\.replaceDocument \?\? 0\) > appliedReplace\.current && now\.key === docKey && !isLive\(\)\)/.test(canvas) && /loadBehind\(html, docKey, list\)/.test(canvas))
  check("a draw waits while the new files are on their way, so the old page is not painted and then replaced", /if \(\(props\.filesVersion \?\? 0\) !== loadedVersion\.current\) return/.test(canvas))
  check("this suite runs with the others", read("scripts/run-push-tests.mjs").includes('"tests/editor-incoming-push.test.ts"'))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
