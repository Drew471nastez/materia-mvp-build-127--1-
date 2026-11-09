/**
 * ===========================================================================
 *  ROUND 15: THE CANVAS SCROLLS WHILE ASK STORELIB, AN AGENT OR A PUSH WORKS
 * ===========================================================================
 * The owner: "when it receives changes from the Storelib AI agent or from
 * GitHub, it freezes, it glitches ... scroll in the canvas still bugs, still
 * freezes, still laggy." scripts/check-wb-live-r15.mjs plays those changes
 * while a wheel scrolls the canvas, and a CPU profile named what the main
 * thread was doing:
 *
 *   ASK PILL     every scroll in the document, the canvas's above all, looked
 *                the section toolbar up across the whole page and read its
 *                style and two boxes, selected section or not
 *   NOTICE       an agent's or a push's notice, once open, read its button's
 *                box and rendered on every scroll event of the canvas; so did
 *                a run's report, an open colour picker and a field's menu
 *   THREAD       each streamed line of a run read the chat's height straight
 *                after its commit: a layout of the whole editor, canvas and
 *                all, once a line
 *   AI MARKS     the sections being worked on were measured inside the
 *                commit, in a state updater, with their style read too
 *   LIBRARY      every colour a run changed asked for the whole section
 *                library again, laid out in the editor's document between
 *                the person's movements
 *   STALE PAGE   applyAiOp read the page it was made with, not the one the
 *                run's earlier lines had left
 *
 * Read from source (comments out) and held to what the fix is.
 *
 * Run with:  npm run test:push
 */
import { existsSync } from "node:fs"
import { readCode } from "./_source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`)
  }
}

const chat = readCode("components/website-builder/theme-chat.tsx")
const panel = readCode("components/website-builder/anchored-panel.tsx")
const overlay = readCode("components/website-builder/editor/ai-working-overlay.tsx")
const library = readCode("components/website-builder/editor/section-library.tsx")
const editor = readCode("app/(storelib)/website-builder/editor/[installId]/page.tsx")

console.log("\nAsk pill")
check("the pill only watches scrolls while a section (and so its toolbar) is selected", /if \(!dock \|\| expanded \|\| hidden \|\| suspended \|\| !selectedSectionId\) \{\s*setYielding\(false\)\s*return/.test(chat))
check("the toolbar is looked up once, and again only if it was replaced", /if \(!bar\?\.isConnected\) bar = document\.querySelector<HTMLElement>\("\.wb-section-toolbar"\)/.test(chat))

console.log("\nNotice")
check("a scroll or a resize measures once a frame", /if \(!frame\) frame = requestAnimationFrame\(\(\) => \{ frame = 0; measure\(\) \}\)/.test(panel) && !/window\.addEventListener\("scroll", onChange, true\)/.test(panel))
check("the same place renders nothing", /setPlace\(\(was\) => \(was && was\.top === next\.top && was\.left === next\.left && was\.right === next\.right && was\.maxHeight === next\.maxHeight \? was : next\)\)/.test(panel))

console.log("\nEvery panel that follows a button or a field")
check("the rule is written once: only a scroll of something that holds the anchor moves it", /return !anchor \|\| !\(t instanceof Node\) \|\| t\.contains\(anchor\)/.test(readCode("lib/website-builder/scroll-moves.ts")))
for (const [file, call] of [
  ["components/website-builder/anchored-panel.tsx", /if \(scrollMoves\(e, anchorRef\.current\)\) onChange\(\)/],
  ["components/website-builder/ask-activity.tsx", /if \(scrollMoves\(e, anchor\?\.current\)\) schedule\(\)/],
  ["components/website-builder/editor/color-chip.tsx", /if \(!scrollMoves\(e, triggerRef\.current\)\) return/],
  ["components/website-builder/field-popover.tsx", /if \(e\.type === "scroll" && !scrollMoves\(e, root\.current\)\) return/],
] as const) check(`${file} ignores the canvas scrolling past`, call.test(readCode(file)))

console.log("\nThread")
check("the chat's height is read in a frame, once for every line that arrived before it", /stickFrame\.current = requestAnimationFrame\(\(\) => \{/.test(chat) && /if \(stickFrame\.current\) return/.test(chat))
check("not in the commit: the effect reads the height only inside that frame", /stickFrame\.current = requestAnimationFrame\(\(\) => \{[\s\S]{0,300}const end = Math\.max\(0, thread\.scrollHeight - thread\.clientHeight\)/.test(chat) && !/if \(!pinned\.current\) return\s*const end = Math\.max/.test(chat))
check("a new exchange among them still glides in", /if \(added && !restored\) stickAdded\.current = true/.test(chat))

console.log("\nAI marks")
check("measured in a frame, never in the commit", /React\.useEffect\(\(\) => \{\s*const anchor = layer\.current/.test(overlay) && !/useLayoutEffect/.test(overlay))
check("the boxes are read before the state is set, not inside its updater", /const read: Record<string, Box> = \{\}/.test(overlay) && !/setBoxes\(\(was\) => \{[\s\S]*?getBoundingClientRect/.test(overlay))
check("a sticky section is asked about in the first frame, not in the commit", /frame = requestAnimationFrame\(\(\) => \{\s*sticky = ids\.some/.test(overlay))

console.log("\nLibrary")
check("a changed look is drawn ahead only once it has stood for REWARM_AFTER_MS", /warmed\.current \? REWARM_AFTER_MS : WARM_AFTER_MS/.test(library) && /const REWARM_AFTER_MS = 10_000/.test(library))
check("an open library still draws what it shows at once", /if \(!compatInstallId\) requestPreviews\(jobs, true\)/.test(library))

console.log("\nThe page a run writes on")
check("applyAiOp reads the page as the run has left it", /const target = sectionsRef\.current\.find\(s => s\.id === op\.id\)/.test(editor))
check("and is not made again on every change of the page", /setSections\(previous => \(opIsNew\(previous, op\) \? applyOp\(\{ sections: previous, settings: \{\} \}, op, librarySchemas\)\.sections : previous\)\)\s*\}, \[librarySchemas\]\)/.test(editor))

console.log("\nThe probe")
const probe = existsSync("scripts/check-wb-live-r15.mjs") ? readCode("scripts/check-wb-live-r15.mjs") : ""
check("scripts/check-wb-live-r15.mjs plays Ask, an agent and a push under a scrolling canvas, on both kinds of theme", /PROBE_AGENT_STREAM/.test(probe) && /"imported-ask"/.test(probe) && /"github"/.test(probe) && /PROBE_AGENT_STREAM/.test(readCode("scripts/render-editor-probe.tsx")))
check("this suite runs with the others", readCode("scripts/run-push-tests.mjs").includes('"tests/wb-live-r15.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
