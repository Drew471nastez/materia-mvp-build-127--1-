/**
 * A page switch in an imported theme's canvas, and on its live site (round 20).
 *
 *   the next page is drawn UNDER the one on screen (never `visibility:
 *   hidden`, where the browser neither draws it nor runs its frames) and
 *   replaces it in one frame, once its first screen is done: no fade, never
 *   two pages at once, and the page left cannot come back
 *   "done" is the fonts, the first screen's pictures in and decoded, the
 *   theme's entrance on it finished, and the page where it should stand;
 *   the window's load (the slowest file of the page) no longer counts
 *   the editor does not dim an imported theme's canvas when the page changes
 *   the sections panel keeps its list (no grey bars) until the canvas shows
 *   the next page, then both change in the same frame
 *   a link pressed to another page leaves the page being left without
 *   pointer events, and a link the pointer rests on has its page's sections
 *   read ahead
 *   the live site's view transition is a cut, not a cross-fade
 *
 * The browser half (every frame of the switch filmed and held against the
 * two pages, the panel read every frame, the header against the live site)
 * is scripts/check-canvas20.ts.
 *
 *   npx tsx tests/canvas20.test.ts
 */
import { readFileSync } from "node:fs"
import vm from "node:vm"
import { CANVAS_BRIDGE } from "../lib/storelib-theme/compat/canvas-bridge"
import { CANVAS_SHOWN } from "../lib/storelib-theme/compat/canvas-network"
import { VIEW_TRANSITION_CSS } from "../lib/website-builder/live-navigation"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(p, "utf8")
const flush = () => new Promise((r) => setTimeout(r, 0))

/** CANVAS_SHOWN in a pretend page: what it finishes, and when it says "loaded". */
async function shownIn(opts: { pictures: { complete: boolean; top: number }[]; animations: { top: number; endTime: number; state?: string }[] }) {
  const said: string[] = []
  const finished: number[] = []
  const decoded: number[] = []
  let dcl: (() => void) | null = null
  const rafs: (() => void)[] = []
  const images = opts.pictures.map((p, i) => ({
    complete: p.complete,
    naturalWidth: 100,
    getBoundingClientRect: () => ({ width: 100, height: 100, top: p.top, bottom: p.top + 100 }),
    decode: () => { decoded.push(i); return Promise.resolve() },
  }))
  const animations = opts.animations.map((a, i) => ({
    playState: a.state ?? "running",
    effect: { getComputedTiming: () => ({ endTime: a.endTime }), target: { getBoundingClientRect: () => ({ width: 100, height: 100, top: a.top, bottom: a.top + 100 }) } },
    finished: new Promise(() => {}),
    finish: () => { if (!isFinite(a.endTime)) throw new Error("InvalidStateError"); finished.push(i) },
  }))
  const ctx: Record<string, unknown> = {
    innerHeight: 800,
    scrollY: 0,
    performance: { now: () => 0 },
    document: {
      images,
      fonts: { ready: Promise.resolve() },
      getAnimations: () => animations,
      addEventListener: (n: string, f: () => void) => { if (n === "DOMContentLoaded") dcl = f },
    },
    parent: { postMessage: (m: { type: string }) => said.push(m.type) },
    setTimeout: (f: () => void) => { void Promise.resolve().then(f); return 0 },
    requestAnimationFrame: (f: () => void) => { rafs.push(f); return 0 },
    Promise,
    Array,
    isFinite,
  }
  vm.runInNewContext(CANVAS_SHOWN.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""), ctx)
  ;(dcl as unknown as () => void)()
  /* Run the page: its tasks, and its frames as they are asked for. */
  for (let i = 0; i < 40; i++) {
    await flush()
    const now = rafs.splice(0)
    now.forEach((f) => f())
  }
  return { said, finished, decoded }
}

async function main() {
  console.log("\nA page's first screen is done (canvas-network.ts, CANVAS_SHOWN)\n")
  {
    const body = CANVAS_SHOWN.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "")
    let parses = true
    try { new Function(body) } catch { parses = false }
    check("it reads as JavaScript", parses)
    const r = await shownIn({ pictures: [{ complete: true, top: 10 }, { complete: true, top: 2000 }], animations: [{ top: 40, endTime: 900 }, { top: 40, endTime: Infinity }, { top: 3000, endTime: 900 }, { top: 40, endTime: 500, state: "finished" }] })
    check("it says loaded, once", r.said.filter((x) => x === "loaded").length === 1, r.said)
    check("the first screen's pictures are decoded first, not the ones far down", r.decoded.join() === "0", r.decoded)
    check("the first screen's entrance is put where it ends; a marquee that never ends, one far down, and one done are left alone", r.finished.join() === "0", r.finished)
  }

  console.log("\nThe canvas (compat-canvas.tsx)\n")
  {
    const canvas = read("components/website-builder/compat/compat-canvas.tsx")
    check("the page behind is under the front, never visibility: hidden", !/visibility: "hidden"/.test(canvas) && /\{ zIndex: 0, pointerEvents: "none" \}/.test(canvas))
    check("it comes forward in one frame: the front is taken out, no fade", /return at <= 0 \? prev : prev\.slice\(at\)/.test(canvas) && !/FADE_MS|entering|\{ opacity: 0 \}, \{ opacity: 1 \}/.test(canvas))
    check("only once it is where it should stand: loaded, then scrolled, then settled", /type: "scroll", top: [^}]*settle: true/.test(canvas) && /m\.type === "settled"[\s\S]{0,80}promote\(slot\.n\)/.test(canvas))
    check("a page behind that never says so still comes forward", /setTimeout\(\(\) => promote\(slot\.n\), 2500\)/.test(canvas))
    check("a link that opens another page leaves the page in front without pointer events until the next is in front", /=== true\) setLeavingFrom\(slot\.n\)/.test(canvas) && /pointerEvents: leavingFrom === slot\.n \? "none"/.test(canvas) && /setTimeout\(\(\) => setLeavingFrom\(null\), 4000\)/.test(canvas))
    check("the page in front is said to the editor when it changes", /onPageShown\.current\?\.\(frontPage\)/.test(canvas) && /page: `\$\{pageKey\}\|\$\{productId \?\? ""\}`/.test(canvas))
    check("a link under the pointer is said to the editor", /m\.type === "intent" && isFront/.test(canvas))
  }

  console.log("\nThe bridge (canvas-bridge.ts)\n")
  {
    let parses = true
    try { new Function(CANVAS_BRIDGE) } catch { parses = false }
    check("it reads as JavaScript", parses)
    check("the window's load does not say loaded any more", !/type: "loaded"/.test(CANVAS_BRIDGE) && !/addEventListener\("load", loaded\)/.test(CANVAS_BRIDGE))
    check("asked to settle, it scrolls and says settled once drawn there (at once when already there)", /if \(m\.settle\)/.test(CANVAS_BRIDGE) && /Math\.abs\(scrollY - \(m\.top \|\| 0\)\) < 1\) \{ post\(\{ type: "settled"/.test(CANVAS_BRIDGE) && /requestAnimationFrame\(function \(\) \{ requestAnimationFrame\(function \(\) \{ post\(\{ type: "settled"/.test(CANVAS_BRIDGE))
    check("a link a mouse rests on, or a finger lands on, is said once", /post\(\{ type: "intent", href: h \}\)/.test(CANVAS_BRIDGE) && /addEventListener\("pointerdown", intent, true\)/.test(CANVAS_BRIDGE) && /a === intended\) return/.test(CANVAS_BRIDGE))
  }

  console.log("\nThe editor (editor/[installId]/page.tsx)\n")
  {
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    check("an imported theme's canvas is not dimmed when the page changes", /if \(importedTheme\.current\) return\s*\n\s*const page = document\.getElementById\("wb-preview-root"\)\?\.firstElementChild/.test(editor))
    check("grey bars only on the editor's first load, never on a page switch", /\{loading \? \(\s*<div data-sheet-scroll[^>]*skeleton-deferred/.test(editor) && !/sectionsLoading \|\| loading \?/.test(editor))
    check("the panel keeps its list while the next page is fetched and until the canvas shows it", /const panelHeld = sectionsLoading \|\| panelHeldForCanvas/.test(editor) && /sections=\{panelHeld \? panelSections\.current : sections\}/.test(editor) && /onPageShown=\{setCompatShownPage\}/.test(editor))
    check("  untouchable while held, and never longer than LIST_HOLD_MS", /style=\{panelHeld \? \{ pointerEvents: "none" \} : undefined\}/.test(editor) && /const LIST_HOLD_MS = 3000/.test(editor) && /setTimeout\(\(\) => setCompatShownPage\(panelPage\), LIST_HOLD_MS\)/.test(editor))
    check("the canvas is told whether a link opens a page", /const navigateCompatCanvas = useCallback\(\(href: string, chrome: boolean\): boolean =>/.test(editor))
    check("a page's sections read ahead on a link's hover, only with nothing unsaved, dropped at the next edit", /onIntent=\{intentInCompatCanvas\}/.test(editor) && /if \(isDirtyRef\.current \|\| savingRef\.current/.test(editor) && /editCount\.current\+\+; sectionsAhead\.current\.clear\(\)/.test(editor) && /pageSectionsNow\(page\),/.test(editor))
  }

  console.log("\nBetween two live pages (live-navigation.ts)\n")
  {
    check("a cut, not a cross-fade: no two pictures added together", !/plus-lighter/.test(VIEW_TRANSITION_CSS) && /view-transition-old\(root\)\{animation:sl-page-out 1ms steps\(1,end\) both\}/.test(VIEW_TRANSITION_CSS) && /view-transition-new\(root\)\{animation:sl-page-in 1ms steps\(1,end\) both\}/.test(VIEW_TRANSITION_CSS))
    check("  still held, paused, while the next page starts", /:root\[data-sl-arriving\]::view-transition-new\(\*\)[^}]*animation-play-state:paused/.test(VIEW_TRANSITION_CSS))
  }

  console.log("\nThe probe\n")
  {
    const probe = read("scripts/check-canvas20.ts")
    check("films the switch and holds every frame against both pages", /Page\.startScreencast/.test(probe) && /dA <= 3 \? "A" : dB <= 3 \? "B"/.test(probe))
    check("is listed with the push suites' probes it builds on", /export async function editorFor\([^)]*tweak\?/.test(read("scripts/check-builder-nav19.ts")))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}
void main()
