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
import { loadCompatFiles, patchCompatFiles, compatFilesChanged } from "@/components/website-builder/compat/compat-files"
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
  /* Changed on purpose (push lag): more than eight theme files is one read of the theme whether or not the editor was away; a push held until it is in (live-follow.ts holdForPush) read them one request each. */
  check("coming back to a pile is one pass, and that pile does not reload the document for section files", /CATCH_UP_AWAY_MS = 8_000/.test(read("components/website-builder/site-connections.tsx")) && /await onEventsRef\.current\(events, \{ catchUp, isCurrent: \(\) => !stopped && applyCurrent \}\)/.test(read("components/website-builder/site-connections.tsx")) && /const folded = sourcePaths\.length > 8/.test(handler))
  check("a page rewritten whole lands in the same render as its files", /afterQuietLoad\.current = \(\) => \{ landRemote\(\); applyIncoming\(\); flush\(\) \}/.test(handler) && /startTransition\(\(\) => \{[\s\S]{0,200}?setSettingsDraft\(\(prev\) => shareSettings\(prev, loadedSettings\)\)\s*setSections\(\(prev\) => shareUnchanged\(prev, loaded\)\)\s*alongside\?\.\(\)\s*\}\)/.test(editor))
  /* Changed on purpose: round perf2-1028 lays what was read over what is on screen (lib/website-builder/incoming-diff.ts), so only the sections a push changed draw again (tests/editor-perf-incoming.test.ts). */
  check("that page is not also built by replaying operations", /if \(!replacedHere\) for \(const op of/.test(handler))
  const canvas = read("components/website-builder/compat/compat-canvas.tsx")
  check("an imported theme draws the new page once behind the one on screen", /replaceDocument=\{replaceDocument\}/.test(editor) && /if \(\(props\.replaceDocument \?\? 0\) > appliedReplace\.current && now\.key === docKey && !isLive\(\)\)/.test(canvas) && /loadBehind\(html, docKey, list\)/.test(canvas))
  check("a draw waits while the new files are on their way, so the old page is not painted and then replaced", /if \(\(props\.filesVersion \?\? 0\) !== loadedVersion\.current\) return/.test(canvas))
  check("this suite runs with the others", read("scripts/run-push-tests.mjs").includes('"tests/editor-incoming-push.test.ts"'))

  console.log("\nA push lets go of what it replaced (push lag)")
  const sheet = read("components/website-builder/compat/compat-section-preview.tsx")
  /* Changed on purpose (library placement): release() also takes off the sheet's font listener, so the document it filled holds nothing of it, and a newer sheet taking the document over releases the old one itself. */
  check("the library's old sheet lets go of its frame's document when a newer sheet takes the frame", /release\(\): void \{\s*if \(this\.doc && this\.onFonts\) this\.doc\.fonts\?\.removeEventListener\?\.\("loadingdone", this\.onFonts\)\s*this\.onFonts = null\s*this\.frameAt = ""\s*this\.doc = null\s*this\.proto = null\s*this\.frame = null\s*this\.grid = null\s*this\.wrappers\.clear\(\)/.test(sheet) && /useEffect\(\(\) => \{\s*if \(!sheet\) return\s*return \(\) => sheet\.release\(\)\s*\}, \[sheet\]\)/.test(sheet) && /if \(before && before !== this\) before\.release\(\)/.test(sheet))
  check("a push still being written is applied once, when it is in", /holdForPush\(/.test(read("components/website-builder/site-connections.tsx")) && /export const PUSH_QUIET_MS = 2_000/.test(read("lib/website-builder/live-follow.ts")) && /export const PUSH_HOLD_CAP_MS = 10_000/.test(read("lib/website-builder/live-follow.ts")))
  check("the same sync report read again draws nothing again", /setStatus\(\(prev\) => \(JSON\.stringify\(prev\) === JSON\.stringify\(next\) \? prev : next\)\)/.test(read("components/website-builder/github-sync-notice.tsx")))
  console.log("\nOne saved file is cheap on a store theme (push lag, round 2)")
  const canvasSrc = read("components/website-builder/compat/compat-canvas.tsx")
  check("a saved section file draws only its own sections, when nothing else changed", /const syncFileChange = \(\): boolean => \{/.test(canvasSrc) && /if \(fromFiles && syncFileChange\(\)\) return/.test(canvasSrc) && /\^sections\\\/\(\[a-z0-9_-\]\+\)\\\.storelib\$/.test(canvasSrc) && /theme\.stylesheetBundle\(\) !== compatTheme\.stylesheetBundle\(\) \|\| theme\.javascriptBundle\(\) !== compatTheme\.javascriptBundle\(\)/.test(canvasSrc))
  check("  and anything else is drawn whole: a product page, a page loading behind, a fresh document asked for, many sections, a worn page", /page\.product/.test(canvasSrc) && /slotsRef\.current\[1\] \|\| accountPath \|\| isLive\(\) \|\| stale\.current/.test(canvasSrc) && /\(props\.replaceDocument \?\? 0\) > appliedReplace\.current\) return false/.test(canvasSrc) && /if \(mine\.length >= MASSIVE_SWAP_MIN && mine\.length \* 2 >= order\) return false/.test(canvasSrc) && /\(slot\.swapped \?\? 0\) \+ mine\.length >= WORN_SWAPS\) return false/.test(canvasSrc))
  check("a page loading behind is not thrown away for each file saved meanwhile; they reach it once it is in front", /behindStale\.current = true/.test(canvasSrc) && /if \(!syncFileChange\(\)\) drawAndPatchRef\.current\(\)/.test(canvasSrc))
  check("a push's page is drawn in one task and compared in the next, waiting out a scroll between", /html = draw\(list\)[\s\S]{0,300}await nextTask\(\)\s*await whenCanvasRests\(\)[\s\S]{0,120}p\.shape = docShape\(html\)/.test(canvasSrc) && /html = preparedHtml\(list\) \?\? draw\(list\)/.test(canvasSrc) && /const next = shapeFor\(html\)/.test(canvasSrc))
  check("a drawing is parsed once, and its body copied once", /loadBehind\(html, docKey, list, next\)/.test(canvasSrc) && /const body = doc\.body\s/.test(canvasSrc))
  check("a closed library takes a change once the editor is left alone; open, at once", /export const CLOSED_ADOPT_MS = 10_000/.test(read("components/website-builder/compat/compat-section-preview.tsx")) && /live=\{open\}/.test(read("components/website-builder/editor/section-library.tsx")))
  check("a closed Storelib library draws again only the first cards still to draw", /export const REWARM_FIRST = 12/.test(read("components/website-builder/editor/section-library.tsx")))
  check("the markup of a theme file is read without parsing its schema", /export function compatMarkupOf\(source: string\): string/.test(read("lib/storelib-theme/compat/theme.ts")) && /compatMarkupOf\(src\)/.test(read("lib/storelib-theme/compat/theme.ts")))
  check("a section's kind is cached by type, not by a new string of its whole file", /kindCache\.get\(type\)/.test(read("lib/storelib-theme/section-groups.ts")) && !/`\$\{type\}\\0\$\{source\}`/.test(read("lib/storelib-theme/section-groups.ts")))
  check("the browser checks for round 2 exist", /drawn alone/.test(read("scripts/check-editor-section-file-sync.mjs")) && /bigImportedTheme/.test(read("scripts/big-theme-kit.mjs")) && /THE STUTTER ITSELF/.test(read("scripts/check-editor-push-lag.mjs")))
  check("the browser probe for pushes holds its budgets", /documents alive do not grow push after push/.test(read("scripts/check-editor-push-lag.mjs")) && /the theme is read once for the whole push/.test(read("scripts/check-editor-push-lag.mjs")))
}

async function checkCache() {
  const previousFetch = globalThis.fetch
  const install = "incoming-push-cache-test"
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    return new Response(JSON.stringify({files: {"shopify/sections/hero.liquid": calls === 1 ? "old" : "fresh"}}))
  }) as typeof fetch
  try {
    await loadCompatFiles(install)
    compatFilesChanged(install)
    check("a patch cannot resurrect a cache invalidated by another writer", !patchCompatFiles(install, {"shopify/assets/extra.css": "x"}))
    const fresh = await loadCompatFiles(install)
    check("the next reader gets the authoritative files", calls === 2 && fresh["shopify/sections/hero.liquid"] === "fresh")
    check("a patch to a current cache is shared without downloading the theme", patchCompatFiles(install, {"shopify/sections/hero.liquid": "patched"}))
    const patched = await loadCompatFiles(install)
    check("every reader sees the patched source", calls === 2 && patched["shopify/sections/hero.liquid"] === "patched")
  } finally { globalThis.fetch = previousFetch }
}
void checkCache().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
})
