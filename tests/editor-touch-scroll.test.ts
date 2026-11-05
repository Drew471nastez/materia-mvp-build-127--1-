/**
 * ===========================================================================
 *  A SWIPE IN THE EDITOR SCROLLS WHAT IS UNDER THE FINGER (round 1026)
 * ===========================================================================
 * The owner, on phones: swiping up and down in the sheet's list, in a
 * block's settings and in the canvas sometimes does not scroll at all.
 * Measured on the real editor with touch events by
 * scripts/check-editor-touch.mjs (a Storelib theme and the imported Materia
 * fixture, an iPhone's size and an Android phone's), and held here:
 *
 *   FROM AN ICON      a swipe that began on a drawing (a select's chevron, a
 *                     row's icon: an <svg>'s path, not an HTMLElement) found
 *                     no scroller, was taken as a drag of the sheet, and
 *                     every move was cancelled (0px, 10 of 10 cancelled)
 *   A STALE DRAG      a drag whose touchend never arrived is ended by the
 *                     next finger, before a control that owns its touch can
 *                     return early and leave the old drag running its moves
 *   A HELD ROW        a grip's drag whose pointerup never came ends when the
 *                     touch ends, the page hides or the window blurs
 *   THE CANVAS        a theme's hold with nothing open is looked at in the
 *                     touchstart's own task (as the first wheel is), and a
 *                     theme that cancels every touchmove is scrolled by hand
 *                     (0px before, 318px and 240px after)
 *   THE NATIVE GUARD  CapacitorBounceGuard leaves the whole builder alone
 *                     (its portals included), hands a scroll at its end to an
 *                     ancestor that can take it, and asks the walk again
 *                     before refusing a gesture for a page that does not fit
 *   LEFTOVERS         a frozen list, a stray canvas hold and a page lock
 *                     with nothing open are let go once the last finger lifts
 *                     and when the app comes back (lib/website-builder/touch-heal.ts)
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { elementOfTarget, scrollersBetween, whenFingerGone } from "@/lib/website-builder/touch-target"
import { FROZEN_ATTRIBUTE, healTouchLeftovers, thawFrozenLists, watchTouchLeftovers } from "@/lib/website-builder/touch-heal"
import { CANVAS_BRIDGE } from "@/lib/storelib-theme/compat/canvas-bridge"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* A small tree of nodes: the sheet, its list (which scrolls), a row, an <svg> and its <path>, and a text node. */
interface N { nodeType: number; name: string; parentElement: N | null; scrolls?: boolean }
const sheet: N = { nodeType: 1, name: "sheet", parentElement: null }
const list: N = { nodeType: 1, name: "list", parentElement: sheet, scrolls: true }
const panel: N = { nodeType: 1, name: "panel", parentElement: list, scrolls: true }
const row: N = { nodeType: 1, name: "row", parentElement: panel }
const svg: N = { nodeType: 1, name: "svg", parentElement: row }
const path: N = { nodeType: 1, name: "path", parentElement: svg }
const text: N = { nodeType: 3, name: "#text", parentElement: row }

type Cb = (e: { touches?: { length: number } }) => void
function target() {
  const on = new Map<string, Set<Cb>>()
  return {
    visibilityState: "visible",
    addEventListener(type: string, cb: Cb) { if (!on.has(type)) on.set(type, new Set()); on.get(type)!.add(cb) },
    removeEventListener(type: string, cb: Cb) { on.get(type)?.delete(cb) },
    fire(type: string, e: { touches?: { length: number } } = {}) { for (const cb of [...(on.get(type) ?? [])]) cb(e) },
    count(type: string) { return on.get(type)?.size ?? 0 },
  }
}

function main() {
  console.log("\n  a swipe from an icon finds the scrollers under it")

  check("an icon's path is an element of the page, and the walk starts there", elementOfTarget<N>(path) === path)
  check("a text node gives the element holding it", elementOfTarget<N>(text) === row)
  check("the window, null and a plain object give nothing", elementOfTarget(null) === null && elementOfTarget({}) === null && elementOfTarget(undefined) === null)
  const names = (t: unknown) => scrollersBetween<N>(t, sheet, (n) => !!n.scrolls).map((n) => n.name).join(",")
  check("from a path: the panel, then the list, nearest first", names(path) === "panel,list", names(path))
  check("from a text node, the same", names(text) === "panel,list", names(text))
  check("the sheet itself is where the walk stops", !names(path).includes("sheet"))

  const sheetSrc = read("components/website-builder/mobile-editor-sheet.tsx")
  check("the phone sheet looks for scrollers with that walk",
    /function scrollersUnder[\s\S]{0,700}?scrollersBetween<HTMLElement>\(target, sheet,/.test(sheetSrc))
  check("and no longer starts only from an HTMLElement",
    !/let node = target instanceof HTMLElement \? target : null/.test(sheetSrc))

  console.log("\n  a drag nobody ended is ended by the next finger")
  check("the sheet settles an active drag before anything else at touchdown",
    /if \(drag\.current\.active\) endDrag\(eventTime\(e\), true\)\s*\n\s*if \(ownsItsTouch\(e\.target, sheet, handleRef\.current\)\) return/.test(sheetSrc))

  console.log("\n  a held row lets go when its finger is gone")
  {
    const win = target(), doc = target()
    let done = 0
    const off = whenFingerGone(win, doc, () => { done++ })
    win.fire("touchend")
    win.fire("touchend")
    check("the touch ending ends it, once", done === 1)
    check("and every listener comes off with it", win.count("touchend") === 0 && win.count("touchcancel") === 0 && win.count("blur") === 0 && doc.count("visibilitychange") === 0)
    off()
    const win2 = target(), doc2 = target()
    let done2 = 0
    whenFingerGone(win2, doc2, () => { done2++ })
    doc2.fire("visibilitychange")
    check("the page still in view does not end it", done2 === 0)
    doc2.visibilityState = "hidden"
    doc2.fire("visibilitychange")
    check("the page hidden does", done2 === 1)
    const win3 = target(), doc3 = target()
    let done3 = 0
    const off3 = whenFingerGone(win3, doc3, () => { done3++ })
    off3()
    win3.fire("touchcancel")
    check("a drag that ended properly hears nothing more", done3 === 0)
  }
  const reorder = read("components/website-builder/editor/controls/use-reorder.ts")
  check("the grip's drag listens for its finger and puts the row back",
    /const gone = whenFingerGone\(window, document, \(\) => \{\s*\n\s*if \(live\.current\?\.pointerId === e\.pointerId\) finish\(false\)/.test(reorder)
      && /grip\.removeEventListener\("pointercancel", up\)\s*\n\s*gone\(\)/.test(reorder))
  const links = read("components/website-builder/editor/controls/use-link-tree-drag.ts")
  check("the menu links' drag too, the one that cancels the list's moves while held",
    /live\.current\.gone = whenFingerGone\(window, document,/.test(links) && /cancelAnimationFrame\(d\.raf\)\s*\n\s*d\.gone\?\.\(\)/.test(links))

  console.log("\n  the canvas: a theme's hold and a theme's cancel")
  check("the hold is looked at in the touchstart's own task, as for the first wheel",
    /addEventListener\("touchstart", function \(e\) \{[\s\S]{0,400}?if \(lockedNow\(\)\) \{ clearTimeout\(lockTimer\); checkLock\(\); \}[\s\S]{0,40}?\}, \{ passive: true, capture: true \}\);/.test(CANVAS_BRIDGE))
  check("a move something else cancelled is scrolled by the finger's distance",
    /if \(!e\.defaultPrevented \|\| touchHand === false[\s\S]{0,700}?scrollTo\(\{ top: Math\.max\(0, Math\.min\(room, scrollY \+ dy\)\)/.test(CANVAS_BRIDGE))
  check("only with room, nothing open and no scroller of the page's own under the finger, decided once a gesture",
    /touchHand = room0 > 2 && !takesWheel\(e\.target, dy\) && !openOnScreen\(\);/.test(CANVAS_BRIDGE))
  check("and nothing in the bridge listens to touch other than passively",
    !/addEventListener\("touch(start|move)", [^;]*passive: false/.test(CANVAS_BRIDGE))

  console.log("\n  the native shell's guard")
  const guard = read("components/platform/capacitor-bounce-guard.tsx")
  check("the whole builder is left alone while it locks the page, portals included",
    /document\.documentElement\.classList\.contains\("wb-fullscreen"\)\s*\n\s*\) \{\s*\n\s*mode = "ignore"/.test(guard))
  check("a box at its end hands the scroll to an ancestor that can still go that way",
    /const next = nextScroller\(scroller, deltaY > 0 \? -1 : 1\)/.test(guard) && /function nextScroller\(from: HTMLElement, dir: -1 \| 1\): HTMLElement \| null/.test(guard))
  check("and the cancel comes only after that",
    guard.indexOf("const next = nextScroller(") < guard.lastIndexOf("e.preventDefault()"))

  console.log("\n  what a gesture held is let go when the finger lifts")
  {
    const mk = (overflowY: string) => { const attrs = new Set([FROZEN_ATTRIBUTE]); return { style: { overflowY }, attrs, removeAttribute(n: string) { attrs.delete(n) } } }
    const a = mk("hidden"), b = mk("hidden")
    check("a finger still down keeps the freeze (it is meant)", thawFrozenLists([a], 1) === 0 && a.style.overflowY === "hidden")
    check("with none down the list scrolls again and loses its mark", thawFrozenLists([a, b], 0) === 2 && a.style.overflowY === "" && !a.attrs.has(FROZEN_ATTRIBUTE))
    let canvas = 0, docs = 0
    const out = healTouchLeftovers({ frozen: () => [mk("hidden")], touchesDown: () => 0, releaseCanvas: () => { canvas++; return true }, releaseDocument: () => { docs++; return ["body.touch-action"] } })
    check("one pass lets go of a frozen list, a stray canvas hold and a page lock", out.join("|") === "thawed 1 list|canvas hold|body.touch-action", out.join("|"))
    canvas = 0; docs = 0
    healTouchLeftovers({ frozen: () => [], touchesDown: () => 1, releaseCanvas: () => { canvas++; return true }, releaseDocument: () => { docs++; return [] } })
    check("and touches nothing while a finger is down", canvas === 0 && docs === 0)
    const win = target(), doc = target()
    let heals = 0
    const queue: Array<() => void> = []
    const stop = watchTouchLeftovers(win, doc, () => { heals++ }, (cb) => queue.push(cb))
    win.fire("touchend", { touches: { length: 1 } })
    check("one finger of two lifting is not the end of the gesture", queue.length === 0)
    win.fire("touchend", { touches: { length: 0 } })
    win.fire("touchcancel", { touches: { length: 0 } })
    check("the last lifting asks once, a frame later", queue.length === 1 && heals === 0)
    queue.shift()!()
    check("and heals then", heals === 1)
    doc.fire("visibilitychange")
    queue.shift()?.()
    check("the app back in view heals too", heals === 2)
    stop()
    check("and it all comes off", win.count("touchend") === 0 && doc.count("visibilitychange") === 0)
  }
  const page = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("the editor installs it",
    /watchTouchLeftovers\(window, document, \(\) => \{\s*\n\s*healTouchLeftovers\(\{/.test(page) && /releaseStrayDrawerHold\(el, lockHolders\(el\)\)/.test(page))
  const bottom = read("components/ui/bottom-sheet.tsx")
  check("the sheet that freezes a list marks it, and takes the mark off when it thaws",
    /scroller\.style\.overflowY = "hidden"[\s\S]{0,300}?scroller\.setAttribute\(FROZEN_ATTRIBUTE, ""\)/.test(bottom) && /frozen\.el\.removeAttribute\(FROZEN_ATTRIBUTE\)/.test(bottom))

  console.log("\n  a row of chips sideways leaves up and down to the conversation")
  check("Ask's suggestions pan both ways",
    /overflow-x-auto px-4 \[touch-action:pan-x_pan-y\]/.test(read("components/website-builder/ask-parts.tsx")))

  console.log("\n  measured, not argued")
  const probe = read("scripts/check-editor-touch.mjs")
  check("the probe swipes from an icon, a slider, after drags, a page change and the cart drawer",
    /"sheet at full, from an icon"/.test(probe) && /"section settings, from a slider"/.test(probe) && /"after a cancelled drag"/.test(probe) && /"another page"/.test(probe) && /"cart drawer closed"/.test(probe))
  check("with the native shell's guard mounted, on an engine without overscroll-behavior",
    /CapacitorBounceGuard/.test(probe) && /overscroll-behavior\/\.test\(String\(a\)\)\) return false/.test(probe))
  check("and a cancel the test browser ignored still counts as a failure",
    /r\.moved >= MIN_PX && !\(r\.log\?\.asked > 0\)/.test(probe))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
