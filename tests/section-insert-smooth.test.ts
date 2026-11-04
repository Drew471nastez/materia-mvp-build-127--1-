/**
 * ===========================================================================
 *  A SECTION PICKED IN ADD A SECTION LANDS IN THE CANVAS CLEANLY
 * ===========================================================================
 * The owner: "When I add a section in the website builder editor, make sure
 * it's smooth and clean. After I click it, it goes into the canvas with no
 * delay, no bump, no glitch, no flash."
 *
 * Measured frame by frame in the real editor by scripts/check-section-insert-
 * smooth.mjs, on a Storelib theme and an imported one. What it found, and
 * what this file holds in place:
 *
 *   AN IMPORTED THEME'S SECTION WENT IN UNSTYLED. A section that links its
 *   own stylesheet (Dawn's way) was put on the page before that file had
 *   loaded: unstyled for up to 27 frames, then 900px taller. The builder now
 *   hands the frame the stylesheets' text from the theme's files with the
 *   section, and the frame waits for any it was not handed.
 *   THE PAGE UNDER IT JUMPED. Every section below was pushed down in one
 *   frame. The frame now plays the arrival a Storelib theme's canvas plays.
 *   THE GLIDE WENT TO THE WRONG PLACE. A hidden menu drawer fixed to the
 *   whole window was taken for a sticky header as tall as the window.
 *   THE CLICK DREW THE WHOLE EDITOR BEFORE THE DIALOG MOVED. On a computer
 *   the dialog starts closing on its own element, and the editor is drawn
 *   once for the close and the add.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { inlineStylesheets, linkedSheets } from "@/lib/storelib-theme/compat/preview-styles"
import { fixThemeCss } from "@/lib/storelib-theme/compat/css-fixes"
import { CANVAS_BRIDGE } from "@/lib/storelib-theme/compat/canvas-bridge"
import { ARRIVAL_MS, ARRIVAL_SCROLL_MS } from "@/lib/website-builder/section-arrival"
import { createAddedSectionStore, neighboursOf, withAdded } from "@/lib/website-builder/added-section-store"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const BASE = "https://storelib.com/website-builder/editor/x"
const rows: Record<string, string> = {
  "shopify/assets/section-banner.css": ".banner{padding:80px;background:url(banner-bg.png)}",
  "shopify/assets/countdown.css": ".cd{color:red}",
  "shopify/assets/logo.png": "base64:AAAA",
}
const section = (links: string) => `<div id="shopify-section-x" class="shopify-section">${links}<div class="banner">Hi</div></div>`

console.log("\nA new section's own stylesheets, as text, for the canvas")
{
  const html = section(`<link href="/api/site-theme/assets/i/edit/section-banner.css?v=3" rel="stylesheet" media="all"><link rel="stylesheet" href="https://cdn.example.com/x.css">`)
  const got = linkedSheets([html], rows, (c) => c, BASE)
  check("one in the theme's files is handed over, by the address it is linked at", Object.keys(got).join() === "/api/site-theme/assets/i/edit/section-banner.css?v=3", got)
  check("  its own relative addresses made absolute against that address", got["/api/site-theme/assets/i/edit/section-banner.css?v=3"]?.includes("url(https://storelib.com/api/site-theme/assets/i/edit/banner-bg.png)"), got)
  check("  one from elsewhere is left out: the frame waits for it instead", !Object.keys(got).some((k) => k.includes("cdn.example.com")))
  check("the asset route's own pass is applied, so the text is what the address answers", linkedSheets([html], rows, () => "FIXED", BASE)["/api/site-theme/assets/i/edit/section-banner.css?v=3"] === "FIXED")
  check("  and the real one runs on a stylesheet", typeof linkedSheets([html], rows, fixThemeCss, BASE)["/api/site-theme/assets/i/edit/section-banner.css?v=3"] === "string")
  check("a file the theme does not have, a picture, or no files at all: nothing", Object.keys(linkedSheets([section(`<link rel="stylesheet" href="/a/missing.css"><link rel="stylesheet" href="/a/logo.png">`)], rows, (c) => c, BASE)).length === 0 && Object.keys(linkedSheets([html], null)).length === 0)
  check("a link that is not a stylesheet is not one", Object.keys(linkedSheets([section(`<link rel="preload" href="/a/countdown.css">`)], rows, (c) => c, BASE)).length === 0)
  check("two sections linking the same file: handed once", Object.keys(linkedSheets([section(`<link rel="stylesheet" href="/a/countdown.css">`), section(`<link rel="stylesheet" href="/a/countdown.css">`)], rows, (c) => c, BASE)).length === 1)
  check("the library's cards still carry theirs in the markup (inlineStylesheets, the same lookup)", /<style data-sheet-from="section-banner\.css">\.banner\{padding:80px/.test(inlineStylesheets(html, rows, 1200, 800)) && /cdn\.example\.com\/x\.css/.test(inlineStylesheets(html, rows, 1200, 800)))
}

console.log("\nThe canvas frame (canvas-bridge.ts)")
{
  const B = CANVAS_BRIDGE
  let parses = true
  try {
    new Function(B)
  } catch {
    parses = false
  }
  check("the bridge is still a script that parses", parses)
  check("a stylesheet handed over is written as a <style> in this task, with nothing to wait for", /var keep = function \(href, text\) \{/.test(B) && /var l = document\.createElement\(inline \? "style" : "link"\);/.test(B) && /kept\[href\] = inline \? Promise\.resolve\(\) : new Promise/.test(B))
  check("  one that replaces another version of its file still takes its place (a push)", /var was = old\.__slHref \|\| old\.href; if \(was && kept\[was\]\) delete kept\[was\]; old\.remove\(\);/.test(B))
  check("a section new to the page waits for its stylesheets, then the whole patch goes in at once", /var patch = function \(m\) \{\s*var ready = sheetsReady\(m\);\s*return ready \? ready\.then\(function \(\) \{ return patchNow\(m\); \}\) : patchNow\(m\);/.test(B))
  /* For STEP_MS at most (tests/compat-stalls.test.ts): one patch that never ends no longer holds every change after it. */
  check("  and the queue waits for that patch before anything after it", /queue = queue\.then\(function \(\) \{ return bounded\(Promise\.resolve\(patch\(m\)\), "patch"\)\.then\(function \(\) \{ holdStill\(true\); \}\); \}\)/.test(B))
  check("  the section is made with the text handed over", /el = fresh\(it\.html, m\.sheets\);/.test(B) && /keep\(l\.href, sheets \? sheets\[l\.getAttribute\("href"\)\] : undefined\)/.test(B))
  check("a section said to be arriving is played in by the patch that draws it", /if \(m\.arrival\) \{ expectArrival\(String\(m\.id \|\| ""\)\); return; \}/.test(B) && /var tops = m\.order\.some\(function \(x\) \{ return arriving\[x\.id\] && !byId\(x\.id\); \}\) \? pageTops\(\) : null;/.test(B) && /arrive\(el, tops\);/.test(B))
  check("  not drawn in this frame in time, it is glided to as before", /arriving\[id\] = setTimeout\(function \(\) \{ delete arriving\[id\]; revealSection\(id\); \}, 4000\);/.test(B))
  check("  a reveal from the end of a run the person scrolled away during is still not taken (round 14)", /if \(typeof m\.since === "number" && personScrolledAt >= m\.since\) return;\s*\/\*[^*]*\*\/\s*if \(m\.arrival\)/.test(B))
  const ms = Number(/ARRIVE_MS = (\d+)/.exec(B)?.[1])
  const scrollMs = Number(/ARRIVE_SCROLL_MS = (\d+)/.exec(B)?.[1])
  check("the same arrival as a Storelib theme's canvas: its times and its curve", ms === ARRIVAL_MS && scrollMs === ARRIVAL_SCROLL_MS && B.includes('ARRIVE_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"') && read("lib/website-builder/section-arrival.ts").includes('const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"'), { ms, scrollMs })
  check("  the sections below slide from where they were by transform; it fades up; nothing else moves", /f\.animate\(\[\{ transform: "translate3d\(0, " \+ d \+ "px, 0\)" \}, \{ transform: "translate3d\(0, 0, 0\)" \}\]/.test(B) && /el\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\]/.test(B))
  check("  an overlay group's section (fixed to the window) and a sticky one are never moved", /shopify-section-group-overlay\/\.test\(f\.className/.test(B) && /if \(cs\.position === "fixed" \|\| cs\.position === "sticky"\) return;/.test(B))
  check("  it scrolls only when its top is not on screen, once, smoothly; instantly and with no movement with reduced motion", /if \(!\(r\.top >= cover && r\.top <= innerHeight - Math\.min\(140, \(innerHeight - cover\) \* 0\.25\)\)\)/.test(B) && /scrollTo\(\{ top: top, behavior: still \? "auto" : "smooth" \}\); scrolls = true;/.test(B) && /if \(still \|\| !el\.animate\) return;/.test(B))
  check("a sticky header is a painted bar: a hidden drawer or an overlay over the window is not one", /if \(cs\.visibility === "hidden" \|\| cs\.display === "none" \|\| parseFloat\(cs\.opacity\) === 0\) continue;/.test(B) && /r\.height > innerHeight \* 0\.4\) continue;/.test(B))
  check("  the glide to a section reads it the same way", /el\.getBoundingClientRect\(\)\.top \+ scrollY - coverBottom\(\) - 16/.test(B))
}

console.log("\nThe builder's side")
{
  const canvas = read("components/website-builder/compat/compat-canvas.tsx")
  check("the compat canvas hands a new section's stylesheets over with the patch", /const sheets = added\.length \? linkedSheets\(added, rowsRef\.current, fixThemeCss\) : \{\}/.test(canvas) && /type: "patch", \.\.\.plan\.message, \.\.\.\(Object\.keys\(sheets\)\.length \? \{ sheets \} : \{\}\)/.test(canvas))
  check("  and says when a reveal is an arrival", /\.\.\.\(detail\?\.arrival \? \{ arrival: true \} : \{\}\)/.test(canvas))
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("a section added from the library is announced as arriving",/window\.dispatchEvent\(new CustomEvent\(REVEAL_EVENT, \{ detail: \{ id: newSection\.id, arrival: true \} \}\)\)/.test(editor))
  const lib = read("components/website-builder/editor/section-library.tsx")
  check("on a computer the dialog starts closing on its own element, and stops taking clicks", /layer\.setAttribute\("data-state", "closed"\)\s*layer\.setAttribute\("inert", ""\)/.test(lib))
  check("  the editor is drawn once for the close and the add, just after that frame", /requestAnimationFrame\(\(\) => setTimeout\(\(\) => \{\s*onAddSection\(type, presetIndex\)\s*onOpenChange\(false\)\s*\}, 0\)\)/.test(lib))
  check("  a phone's sheet closes as before", /onOpenChange\(false\)\s*requestAnimationFrame\(\(\) => onAddSection\(type, presetIndex\)\)/.test(lib))
}

console.log("\nA Storelib theme's canvas draws the section before the editor has it (added-section-store.ts)")
{
  const page = [{ id: "h" }, { id: "a" }, { id: "b" }, { id: "f" }]
  const entry = (id: string, afterId: string | null, beforeId: string | null, p = "home|") => ({ section: { id }, page: p, afterId, beforeId })
  const ids = (l: { id: string }[]) => l.map((s) => s.id).join(",")
  check("it goes after the section it was drawn after", ids(withAdded(page, [entry("n", "a", "b")], "home|")) === "h,a,n,b,f")
  check("  before the next one when the one above has gone", ids(withAdded(page, [entry("n", "x", "b")], "home|")) === "h,a,n,b,f")
  check("  at the start or the end when that is where it was", ids(withAdded(page, [entry("n", null, "h")], "home|")) === "n,h,a,b,f" && ids(withAdded(page, [entry("n", "f", null)], "home|")) === "h,a,b,f,n")
  check("  not in a guessed place when both neighbours are gone", withAdded(page, [entry("n", "x", "y")], "home|") === page)
  check("  not on another page", withAdded(page, [entry("n", "a", "b", "about|")], "home|") === page)
  check("  once: the page that has it is drawn as it is, the same array", withAdded([...page.slice(0, 2), { id: "n" }, ...page.slice(2)], [entry("n", "a", "b")], "home|").length === 5)
  check("  two picked in a row both show, in order", ids(withAdded(page, [entry("n", "a", "b"), entry("m", "n", "b")], "home|")) === "h,a,n,m,b,f")
  check("neighbours are read from the page drawn with it", JSON.stringify(neighboursOf([{ id: "h" }, { id: "n" }, { id: "a" }], "n")) === '{"afterId":"h","beforeId":"a"}' && neighboursOf(page, "n") === null)
  const store = createAddedSectionStore<{ id: string }>()
  let heard = 0
  store.subscribe(() => heard++)
  store.add(entry("n", "a", "b"))
  store.add(entry("m", "n", "b"))
  store.drop(new Set(["n"]))
  check("the store keeps each until the canvas's own page has it", store.get().map((a) => a.section.id).join() === "m" && heard === 3)
  store.drop(new Set(["zzz"]))
  check("  and says nothing when nothing left it", heard === 3)

  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  check("the add tells the canvas and the ring first, then the editor once the arrival has played, or at the first press or key", /addedStore\.add\(\{ section: drawnNew, page: sectionsOnPage\.page, \.\.\.between \}\)/.test(editor) && /selectedSectionId=\{added\.last \?\? shownSectionId\}/.test(editor) && /const arriving = arrivalPlaying\(`wb-section-\$\{newSection\.id\}`\)\s*if \(!arriving\) \{ go\(\); return \}\s*void arriving\.then\(go\)/.test(editor) && /window\.addEventListener\("pointerdown", now, true\)/.test(editor) && /playing\.set\(el\.id, done\)/.test(read("lib/website-builder/section-arrival.ts")))
  check("  drawn through the same steps as the canvas's page", /drawForCanvas\.current = \(list\) =>\s*pricedStep\(\s*optionsStep\(\s*filledStep\(inLanguageStep\(list/.test(editor) && /const drawnShown = useMemo\(\(\) => pricedStep\(drawnInLanguage/.test(editor))
  check("  Undo, Redo and another add take a waiting add in first, rendered", /aiOps\.flush\(\)\s*\/\*[^*]*\*\/\s*if \(afterAddLands\(\(\) => handleUndo\(\)\)\) return\s*flushPendingAdd\(\)/.test(editor) && /const handleRedo = useCallback\(\(\) => \{\s*if \(afterAddLands\(\(\) => handleRedo\(\)\)\) return\s*flushPendingAdd\(\)/.test(editor) && /if \(flushPendingAdd\(\)\) \{\s*addSectionRef\.current\(type, presetIndex, replaceConfirmed, extra\)/.test(editor) && /flushSync\(pending\.commit\)/.test(editor))
  check("  the history entry is taken when the editor takes the add in, and nothing that came in since is written over", /const commit = \(\) => \{\s*pushUndo\(\)\s*\/\*[^*]*\*\/\s*setSections\(\(prev\) => \(prev === placedFrom \? next : prev\.some/.test(editor))
  check("  the editor takes it in a transition, and Undo, Redo and another add wait for it to land", /landingAdd\.current = \{ id: newSection\.id, then: \[\], timer: setTimeout\(landAdd, 4000\) \}\s*startTransition\(pending\.commit\)/.test(editor) && /if \(afterAddLands\(\(\) => handleUndo\(\)\)\) return/.test(editor) && /if \(afterAddLands\(\(\) => handleRedo\(\)\)\) return/.test(editor) && /if \(afterAddLands\(\(\) => addSectionRef\.current\(type, presetIndex, replaceConfirmed, extra\)\)\) return/.test(editor) && /if \(landing && sections\.some\(\(s\) => s\.id === landing\.id\)\) landAdd\(\)/.test(editor))
  check("  opened again straight after a pick, the dialog opens: the close goes in first, then the open", /if \(libraryClosedByHand\.current\) flushSync\(\(\) => setAddSectionOpen\(false\)\)\s*place\(\)\s*setAddSectionOpen\(true\)/.test(editor) && (editor.match(/openLibrary\(\(\) => \{/g) ?? []).length === 4 && !/setAddSectionOpen\(true\)/.test(editor.replace(/if \(libraryClosedByHand[\s\S]*?setAddSectionOpen\(true\)/, "")))
  check("  not onto a page opened in the meantime", /commit: \(\) => \{ if \(currentPageRef\.current === page\) commit\(\) \}/.test(editor))
  check("  the library's close goes with the add", /if \(!o && pending\) \{\s*const add = pending\.commit/.test(editor))
  check("  an imported theme's canvas is told as before", /scroller && !canvasCompat \? drawForCanvas\.current\(next\) : null/.test(editor))
}

console.log("\nThe probe")
{
  const probe = read("scripts/check-section-insert-smooth.mjs")
  check("both kinds of theme, randomised: CPU, a slow stylesheet, an agent's edit, two picks in a row, reduced motion", /THEMES \?\? "native,imported"/.test(probe) && /Emulation\.setCPUThrottlingRate/.test(probe) && /assetDelay/.test(probe) && /update_section/.test(probe) && /rapid/.test(probe) && /prefers-reduced-motion/.test(probe))
  check("  every frame: first pixel, unstyled, resized, above, slide, scroll, inserts, long tasks, ring", ["firstPixelMs", "unstyledFrames", "resizedFrames", "aboveShiftPx", "belowSnapPx", "scrollMoves", "scrollReversals", "doubleInsert", "longTasks", "ringFlash", "closeStartMs"].every((k) => probe.includes(`out.${k}`)))
  check("  an imported theme's sections carry their own stylesheets, none of them on the page", /stylesheet_tag/.test(probe) && /withOwnSections/.test(probe))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
