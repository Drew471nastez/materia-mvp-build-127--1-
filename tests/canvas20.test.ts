/**
 * A page switch in an imported theme's canvas, and on its live site (round 20).
 *
 *   the next page is drawn UNDER the one on screen (never `visibility:
 *   hidden`, where the browser neither draws it nor runs its frames) and
 *   comes forward once its first screen is done, the page being left fading
 *   off it (round G: a cut with the entrance already over read as "too
 *   flat"); the page left is never a page again, so it cannot come back
 *   "done" is the fonts, the first screen's pictures in and decoded, and the
 *   page where it should stand; the window's load (the slowest file of the
 *   page) no longer counts. The theme's entrance is NOT finished for it any
 *   more: told it is shown, the page plays its first screen's entrance from
 *   the beginning, in view, as the live site's page does
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

/** CANVAS_SHOWN in a pretend page: what it finishes, what it plays again once shown, and when it says "loaded". */
async function shownIn(opts: { pictures: { complete: boolean; top: number }[]; animations: { top: number; endTime: number; state?: string }[]; shown?: number; instant?: boolean }) {
  const said: string[] = []
  const finished: number[] = []
  const replayed: number[] = []
  const heard: ((e: { data: unknown }) => void)[] = []
  const held = { css: "", in: false, released: false }
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
    set currentTime(v: number) { if (v === 0) replayed.push(i) },
    play: () => {},
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
      createElement: () => ({ setAttribute: () => {}, set textContent(v: string) { held.css = v }, remove: () => { held.in = false; held.released = true } }),
      head: { appendChild: () => { held.in = true } },
    },
    parent: { postMessage: (m: { type: string }) => said.push(m.type) },
    addEventListener: (n: string, f: (e: { data: unknown }) => void) => { if (n === "message") heard.push(f) },
    /* At once, but for the page's own long stop (the hold let go after 12s), which a test does not wait for. */
    setTimeout: (f: () => void, ms?: number) => { if ((ms ?? 0) < 10_000) void Promise.resolve().then(f); return 0 },
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
  /* The canvas shows it (compat-canvas.tsx): told so, as many times as asked. */
  for (let i = 0; i < (opts.shown ?? 0); i++) heard.forEach((f) => f({ data: { storelib: 1, type: "shown", instant: opts.instant === true } }))
  /* And the frames it asks for after. */
  for (let i = 0; i < 10; i++) {
    await flush()
    const now = rafs.splice(0)
    now.forEach((f) => f())
  }
  return { said, finished, decoded, replayed, held }
}

/*
  After an edit's redraw (shown with `instant`), what an animation starting
  on its own is: finished while the page stands where it was put and the
  element is on screen there, played when the page has been scrolled or the
  element is off screen. Changed on purpose (the owner: the builder plays the
  theme's animations like the live site).
*/
async function startsAfterRedraw(starts: { top: number; scrollY: number }[]) {
  const heard: Record<string, ((e: unknown) => void)[]> = {}
  const rafs: (() => void)[] = []
  const finished: number[] = []
  const ctx: Record<string, unknown> = {
    innerHeight: 800,
    scrollY: 0,
    performance: { now: () => 0 },
    document: {
      images: [],
      fonts: { ready: Promise.resolve() },
      getAnimations: () => [],
      addEventListener: () => {},
      createElement: () => ({ setAttribute: () => {}, textContent: "", remove: () => {} }),
      head: { appendChild: () => {} },
    },
    parent: { postMessage: () => {} },
    addEventListener: (n: string, f: (e: unknown) => void) => { (heard[n] ??= []).push(f) },
    setTimeout: (f: () => void, ms?: number) => { if ((ms ?? 0) < 10_000) void Promise.resolve().then(f); return 0 },
    requestAnimationFrame: (f: () => void) => { rafs.push(f); return 0 },
    Promise,
    Array,
    isFinite,
  }
  const run = async () => {
    for (let i = 0; i < 10; i++) {
      await flush()
      rafs.splice(0).forEach((f) => f())
    }
  }
  vm.runInNewContext(CANVAS_SHOWN.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""), ctx)
  const say = (data: unknown) => (heard.message ?? []).forEach((f) => f({ data }))
  /* compat-canvas.tsx: the page drawn again behind is told it is shown, instant, then put where the front stands. */
  say({ storelib: 1, type: "shown", instant: true })
  ctx.scrollY = 1200
  say({ storelib: 1, type: "scroll", top: 1200, settle: true })
  await run()
  starts.forEach((st, i) => {
    ctx.scrollY = st.scrollY
    const target = {
      getBoundingClientRect: () => ({ width: 100, height: 100, top: st.top, bottom: st.top + 100 }),
      getAnimations: () => [{ effect: { getComputedTiming: () => ({ endTime: 600 }) }, finish: () => finished.push(i) }],
    }
    ;(heard.animationstart ?? []).forEach((f) => f({ target }))
  })
  return finished
}

async function main() {
  console.log("\nA page's first screen is done (canvas-network.ts, CANVAS_SHOWN)\n")
  {
    const body = CANVAS_SHOWN.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "")
    let parses = true
    try { new Function(body) } catch { parses = false }
    check("it reads as JavaScript", parses)
    const animations = [{ top: 40, endTime: 900 }, { top: 40, endTime: Infinity }, { top: 3000, endTime: 900 }, { top: 40, endTime: 500, state: "finished" }, { top: 40, endTime: 900, state: "idle" }]
    const r = await shownIn({ pictures: [{ complete: true, top: 10 }, { complete: true, top: 2000 }], animations })
    check("it says loaded, once", r.said.filter((x) => x === "loaded").length === 1, r.said)
    check("the first screen's pictures are decoded first, not the ones far down", r.decoded.join() === "0", r.decoded)
    check("the theme's entrance is never finished for a page arriving (round G: that landed every page flat)", r.finished.length === 0, r.finished)
    check("  and nothing plays again before the canvas shows the page", r.replayed.length === 0, r.replayed)
    check("its CSS animations are held at their start, out of sight, until it is shown (play state only)", r.held.in && !r.held.released && r.held.css === "*,*::before,*::after{animation-play-state:paused!important}", r.held)
    const s = await shownIn({ pictures: [{ complete: true, top: 10 }], animations, shown: 2 })
    check("shown, the first screen's entrance plays from the start, in view: one under way and one already over out of sight; a marquee, one far down and one not started are left alone", s.replayed.join() === "0,3", s.replayed)
    check("  once, however often it is told", s.replayed.length === 2, s.replayed)
    check("  and shown, they are let go", s.held.released && !s.held.in, s.held)
    const same = await shownIn({ pictures: [{ complete: true, top: 10 }], animations, shown: 1, instant: true })
    check("the same page drawn again (an edit) is told so: let go, and its first screen's entrance put where it ends, nothing played again", same.held.released && [...new Set(same.finished)].join() === "0" && same.replayed.length === 0, same)
    const after = await startsAfterRedraw([{ top: 40, scrollY: 1200 }, { top: 2000, scrollY: 1200 }, { top: 40, scrollY: 1500 }])
    check("after an edit, an entrance that starts on screen where the page was put is put where it ends", after.includes(0), after)
    check("  one that starts off screen plays (changed on purpose: the builder plays the theme's animations like the live site)", !after.includes(1), after)
    check("  and one that starts because the page was scrolled plays, as a scroll reveal does live", !after.includes(2), after)
    check("a page never shown lets them go by itself", /setTimeout\(function\(\)\{if\(!replayed\)\{replayed=true;hold\.remove\(\)\}\},12000\)/.test(body))
  }

  console.log("\nThe canvas (compat-canvas.tsx)\n")
  {
    const canvas = read("components/website-builder/compat/compat-canvas.tsx")
    /* Round 25: a page already shown and kept for going back to it (KEPT PAGES) is out of sight; the page behind never is. */
    check("the page behind is under the front, never visibility: hidden", /: role === "kept" \? KEPT_STYLE : \{ zIndex: 0, pointerEvents: "none" \}/.test(canvas) && /* Changed on purpose (r66): a front page that has left for another address is hidden too (A PAGE GOING ELSEWHERE), never a page behind. */ (canvas.match(/visibility: "hidden"/g) ?? []).length === 2 && /goneFrom === slot\.n \? \{ visibility: "hidden" as const \}/.test(canvas) && /const KEPT_STYLE = \{ zIndex: 0, pointerEvents: "none", visibility: "hidden" \}/.test(canvas))
    check("it comes forward whole: the front is taken out of the pages at once, so it can never come back", /return i <= 0 \? prev : prev\.slice\(i\)/.test(canvas))
    check("the same page drawn again (an edit) is settled before it comes forward, and replaces the front as a cut", /if \(same\) sendTo\(win, \{ storelib: 1, type: "shown", instant: true \}\)/.test(canvas) && /* Changed on purpose (round ed-1022): another page is another page id (pageIdFor), not a different count of files: the same page drawn from changed files stays where it was scrolled and comes forward as a cut. */ /const otherPage = list\[0\]\.key\.split\("\|"\)\[0\] !== list\[at\]\.key\.split\("\|"\)\[0\]/.test(canvas))
    check("  and fades off the page that came forward (HANDOVER_MS), over it and taking no pointer; nothing is ever faded up from white", /const HANDOVER_MS = 180/.test(canvas) && /setHandover\(list\[0\]\)/.test(canvas) && /el\.animate\(\[\{ opacity: 1 \}, \{ opacity: 0 \}\], \{ duration: HANDOVER_MS/.test(canvas) && /role === "leaving" \? \{ zIndex: 2, pointerEvents: "none" \}/.test(canvas) && !/\{ opacity: 0 \}, \{ opacity: 1 \}/.test(canvas))
    check("  not under reduced motion, and not over a first page nobody has seen yet", /* Changed on purpose (round ed-1022): another page is another page id (pageIdFor), not a different count of files: the same page drawn from changed files stays where it was scrolled and comes forward as a cut. */ /if \(paintedRef\.current && otherPage && !\(typeof window\.matchMedia === "function" && window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\)\) setHandover/.test(canvas))
    /* Changed on purpose (round 1023, part 2): the same window is told "heal" after "shown" (editor-freeze2.test.ts). */
    check("the page in front is told when it can be seen, so its entrance plays there", /if \(!shown \|\| !frontN\) return\s*\n\s*const win = frames\.current\.get\(frontN\)\?\.contentWindow\s*\n\s*sendTo\(win, \{ storelib: 1, type: "shown" \}\)/.test(canvas))
    check("only once it is where it should stand: loaded, then scrolled, then settled", /type: "scroll", top: [^}]*settle: true/.test(canvas) && /m\.type === "settled"[\s\S]{0,80}promote\(slot\.n\)/.test(canvas))
    check("a page behind that never says so still comes forward", /setTimeout\(\(\) => promote\(slot\.n\), 2500\)/.test(canvas))
    check("a link that opens another page leaves the page in front without pointer events until the next is in front", /* Changed on purpose (round canvas-1023): the link is followed by navigateFrom, which a page that left the frame uses too. */ /=== true\) \{ setLeavingFrom\(n\); return true \}/.test(canvas) && /* Changed on purpose (r66): or one that has left the frame (goneFrom). */ /pointerEvents: leavingFrom === slot\.n \|\| goneFrom === slot\.n \? "none"/.test(canvas) && /setTimeout\(\(\) => setLeavingFrom\(null\), 4000\)/.test(canvas))
    check("the page in front is said to the editor when it changes", /onPageShown\.current\?\.\(frontPage\)/.test(canvas) && /page: `\$\{pageKey\}\|\$\{productId \?\? ""\}`/.test(canvas))
    check("a link under the pointer is said to the editor", /m\.type === "intent" && isFront/.test(canvas))
  }

  console.log("\nThe first page, drawn once (round G)\n")
  {
    const canvas = read("components/website-builder/compat/compat-canvas.tsx")
    const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
    check("not drawn before the install's .storelib files are in (drawn without its layout it was a white page, then the real page loaded over it)", /const rows = useMemo\(\(\) => \(compatFiles && sourcesReady \?/.test(canvas) && /* Changed on purpose (r68): or once the page's part of the sources covers the page (editor-open-r68.test.ts); a failure is taken as read only after the last try. */ /sourcesReady=\{canvasSourcesReady\}/.test(editor) && /const canvasSourcesReady = storelibSourcesRead \|\| \(storelibPageRead && sourcesCover\(sections, storelibSources\)\)/.test(editor) && /finally \{[\s\S]{0,300}setStorelibSourcesRead\(true\)/.test(editor))
    check("the first page waits for the shop's cards, DATA_WAIT_MS at most, rather than being drawn again when they come", /const holdForData = props\.dataReady === false && !dataWaitOver && slots\.length === 0/.test(canvas) && /setTimeout\(\(\) => setDataWaitOver\(true\), DATA_WAIT_MS\)/.test(canvas) && /if \(!compatTheme \|\| holdForData\) return/.test(canvas) && /dataReady=\{liveCardsRead\}/.test(editor) && /finally \{\s*setLiveCardsRead\(true\)/.test(editor))
    check("a change to the same page while it loads is sent to it when it is ready, never a second copy loaded behind it", /if \(plan && !now\.ready\) \{\s*stale\.current = true\s*return\s*\}/.test(canvas) && /if \(isFront && stale\.current\) drawAndPatchRef\.current\(\)/.test(canvas))
  }

  console.log("\nThe bridge (canvas-bridge.ts)\n")
  {
    let parses = true
    try { new Function(CANVAS_BRIDGE) } catch { parses = false }
    check("it reads as JavaScript", parses)
    check("the window's load does not say loaded any more", !/type: "loaded"/.test(CANVAS_BRIDGE) && !/addEventListener\("load", loaded\)/.test(CANVAS_BRIDGE))
    check("asked to settle, it scrolls and says settled once drawn there (at once when already there)", /if \(m\.settle\)/.test(CANVAS_BRIDGE) && /Math\.abs\(scrollY - \(m\.top \|\| 0\)\) < 1\) \{ post\(\{ type: "settled"/.test(CANVAS_BRIDGE) && /requestAnimationFrame\(function \(\) \{ requestAnimationFrame\(function \(\) \{ post\(\{ type: "settled"/.test(CANVAS_BRIDGE))
    /* Changed on purpose (round BC): a mouse says so once it has rested on the link a moment, not on its way over it; a finger at once. */
    check("a link a mouse rests on, or a finger lands on, is said once", /post\(\{ type: "intent", href: h \}\)/.test(CANVAS_BRIDGE) && /addEventListener\("pointerdown", function \(e\) \{ clearTimeout\(restTimer\); intent\(e\); \}, true\)/.test(CANVAS_BRIDGE) && /restTimer = setTimeout\(function \(\) \{ if \(a\.matches\(":hover"\)\) intent\(e\); \}, 180\)/.test(CANVAS_BRIDGE) && /a === intended\) return/.test(CANVAS_BRIDGE))
  }

  console.log("\nThe editor (editor/[installId]/page.tsx)\n")
  {
    const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
    /* Since the cut between pages (canvas-still.ts swapCanvasPage), no page on the canvas is faded at all, and an imported theme's canvas is not even held: its frames hand over on their own. */
    check("an imported theme's canvas is not dimmed when the page changes", !/getElementById\("wb-preview-root"\)\?\.firstElementChild[\s\S]{0,400}\.animate\(\[\{ opacity/.test(editor) && (editor.match(/if \(!importedTheme\.current\) swapCanvasPage\(show\)\s*\n\s*else show\(\)/g) ?? []).length === 2 && !/opacity/.test(read("lib/website-builder/canvas-still.ts")))
    /* Round 16, the owner: no skeleton while the editor opens. The list's place is empty on the first load, and a page switch keeps its list. */
    check("no grey bars on the editor's first load, and none on a page switch", /\{loading \? \(\s*<div data-sheet-scroll className="flex-1 overflow-y-auto wb-slim-scroll px-2 py-2" aria-busy="true" \/>/.test(editor) && !/sectionsLoading \|\| loading \?/.test(editor))
    check("the panel keeps its list while the next page is fetched and until the canvas shows it", /const panelHeld = sectionsLoading \|\| panelHeldForCanvas/.test(editor) && /sections=\{panelHeld \? panelSections\.current : sections\}/.test(editor) && /onPageShown=\{setCompatShownPage\}/.test(editor))
    check("  untouchable while held, and never longer than LIST_HOLD_MS", /style=\{panelHeld \? \{ pointerEvents: "none" \} : undefined\}/.test(editor) && /const LIST_HOLD_MS = 3000/.test(editor) && /setTimeout\(\(\) => setCompatShownPage\(panelPage\), LIST_HOLD_MS\)/.test(editor))
    check("the canvas is told whether a link opens a page", /const navigateCompatCanvas = useCallback\(\(href: string, chrome: boolean\): boolean =>/.test(editor))
    /* Round 25: kept once read (pageCache), forgotten when anything but this page's own save writes a page; see tests/builder25.test.ts. */
    check("a page's sections read ahead on a link's hover, and kept until something else writes the page", /onIntent=\{intentInCompatCanvas\}/.test(editor) && /prefetchPageSections\(to\.key as PageKey\)/.test(editor) && /if \(events\.length > 0\) forgetPage\(\)/.test(editor) && /pageSectionsNow\(page, page === leaving\),/.test(editor))
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
