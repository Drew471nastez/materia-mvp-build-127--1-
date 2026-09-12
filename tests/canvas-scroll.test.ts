/**
 * ===========================================================================
 *  THE PREVIEW THAT STOPPED SCROLLING, AND NOW PUTS ITSELF RIGHT
 * ===========================================================================
 * "Come back from the code editor or project settings and the preview will
 * not scroll; reload the page." Fixed four times for four real causes, and
 * reported a fifth. So the canvas stopped depending on every cause being
 * named: a layer going away puts the scroller back into a known-good state,
 * and on a phone a drag that moves nothing is treated as the failure it is
 * and recovered from on the spot.
 *
 * The logic is pure DOM, so it is driven here with a fake scroller and a
 * fake frame, and the one surface-level change — no opacity fade on the
 * scroller's wrapper on a phone — is held by reading the editor.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { STUCK_DISTANCE_PX, nudgeOffEnds, reviveScroller, watchForStuckScroll } from "@/lib/website-builder/canvas-scroll"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

type Listener = (e: TouchEvent) => void
function fakeScroller(opts: { scrollHeight: number; clientHeight: number; scrollTop?: number; frozen?: boolean }) {
  const listeners = new Map<string, Listener[]>()
  const inline = new Map<string, string>()
  let top = opts.scrollTop ?? 0
  const el = {
    get scrollTop() { return top },
    set scrollTop(v: number) { if (!opts.frozen) top = v },
    scrollHeight: opts.scrollHeight,
    clientHeight: opts.clientHeight,
    style: {
      overflowY: "auto",
      removeProperty(n: string) { inline.delete(n) },
      setProperty(n: string, v: string) { inline.set(n, v) },
    },
    addEventListener(t: string, cb: Listener) { listeners.set(t, [...(listeners.get(t) ?? []), cb]) },
    removeEventListener(t: string, cb: Listener) { listeners.set(t, (listeners.get(t) ?? []).filter((x) => x !== cb)) },
    fire(t: string, y: number, count = 1) {
      const e = { touches: Array.from({ length: count }, () => ({ clientY: y })) } as unknown as TouchEvent
      for (const cb of listeners.get(t) ?? []) cb(e)
    },
    /** What the browser would do for a scroller that works. */
    scrollBy(d: number) { top = Math.max(0, Math.min(top + d, opts.scrollHeight - opts.clientHeight)) },
    inline,
    listenerCount: () => [...listeners.values()].reduce((n, l) => n + l.length, 0),
  }
  return el
}

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("Reviving puts a scroller back into a known-good state")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const el = fakeScroller({ scrollHeight: 3000, clientHeight: 800, scrollTop: 0 })
    el.style.setProperty("pointer-events", "none")
    el.style.setProperty("touch-action", "none")
    const frames: (() => void)[] = []
    reviveScroller(el, (cb) => frames.push(cb))
    check("an inline lock is removed", !el.inline.has("pointer-events") && !el.inline.has("touch-action"))
    check("the layer is dropped for one frame", el.style.overflowY === "hidden" && frames.length === 1)
    frames[0]()
    check("and asked for again on the next", el.style.overflowY === "auto" && el.inline.get("-webkit-overflow-scrolling") === "touch")
    check("the position comes back nudged off the top", el.scrollTop === 1)

    const mid = fakeScroller({ scrollHeight: 3000, clientHeight: 800, scrollTop: 1200 })
    const f2: (() => void)[] = []
    reviveScroller(mid, (cb) => f2.push(cb)); f2[0]()
    check("a scroller in the middle keeps its place", mid.scrollTop === 1200)

    const bottom = fakeScroller({ scrollHeight: 3000, clientHeight: 800, scrollTop: 2200 })
    const f3: (() => void)[] = []
    reviveScroller(bottom, (cb) => f3.push(cb)); f3[0]()
    check("and one at the bottom is nudged off it", bottom.scrollTop === 2199)

    const short = fakeScroller({ scrollHeight: 500, clientHeight: 800 })
    nudgeOffEnds(short)
    check("a page shorter than the card is left alone", short.scrollTop === 0)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The watchdog notices a scroller that has stopped responding")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const frozen = fakeScroller({ scrollHeight: 3000, clientHeight: 800, scrollTop: 400, frozen: true })
    let stuck = 0
    const off = watchForStuckScroll(frozen, () => stuck++)
    frozen.fire("touchstart", 500)
    frozen.fire("touchmove", 490)
    check("a small move says nothing", stuck === 0)
    frozen.fire("touchmove", 500 - STUCK_DISTANCE_PX)
    check(`a real drag (${STUCK_DISTANCE_PX}px) that moved nothing is a freeze`, stuck === 1)
    frozen.fire("touchmove", 400)
    check("reported once per gesture, not once per move", stuck === 1)
    frozen.fire("touchend", 400)
    frozen.fire("touchstart", 500); frozen.fire("touchmove", 440)
    check("and again on the next gesture if it is still frozen", stuck === 2)
    off()
    check("stopping removes every listener", frozen.listenerCount() === 0)
  }

  section("And does not cry wolf")
  {
    const fine = fakeScroller({ scrollHeight: 3000, clientHeight: 800, scrollTop: 400 })
    let stuck = 0
    watchForStuckScroll(fine, () => stuck++)
    fine.fire("touchstart", 500)
    fine.scrollBy(30)          // the browser scrolled it, as it should
    fine.fire("touchmove", 460)
    check("a scroller that moved is fine", stuck === 0)

    const atTop = fakeScroller({ scrollHeight: 3000, clientHeight: 800, scrollTop: 0, frozen: true })
    watchForStuckScroll(atTop, () => stuck++)
    atTop.fire("touchstart", 300); atTop.fire("touchmove", 400)
    check("pulling down at the very top is not evidence", stuck === 0)

    const atBottom = fakeScroller({ scrollHeight: 3000, clientHeight: 800, scrollTop: 2200, frozen: true })
    watchForStuckScroll(atBottom, () => stuck++)
    atBottom.fire("touchstart", 500); atBottom.fire("touchmove", 300)
    check("nor pulling up at the very bottom", stuck === 0)

    const short = fakeScroller({ scrollHeight: 600, clientHeight: 800, frozen: true })
    watchForStuckScroll(short, () => stuck++)
    short.fire("touchstart", 500); short.fire("touchmove", 300)
    check("nor a page with nothing to scroll", stuck === 0)

    const pinch = fakeScroller({ scrollHeight: 3000, clientHeight: 800, scrollTop: 400, frozen: true })
    watchForStuckScroll(pinch, () => stuck++)
    pinch.fire("touchstart", 500, 2); pinch.fire("touchmove", 300, 2)
    check("nor a pinch", stuck === 0)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The editor uses both, and stops doing the thing that breaks WebKit")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const editor = readFileSync(join(process.cwd(), "app/website-builder/editor/[installId]/page.tsx"), "utf8")
    check("the wrapper around the scroller is not faded on a phone", /previewMode === "code" && !isMobileView && "opacity-0 pointer-events-none"/.test(editor))
    check("the scroller is revived when the code pane or settings closes", /const covered = previewMode === "code" \|\| projectSettingsOpen/.test(editor) && /reviveScroller\(el, \(cb\) => window\.requestAnimationFrame\(cb\)\)/.test(editor))
    check("twice, for a keyboard still on its way down", /window\.setTimeout\(reviveCanvas, 340\)/.test(editor) && /window\.setTimeout\(reviveCanvas, 900\)/.test(editor))
    check("and the window's own offset is put back", /if \(window\.scrollY !== 0\) window\.scrollTo\(0, 0\)/.test(editor.slice(editor.indexOf("const reviveCanvas"), editor.indexOf("const reviveCanvas") + 600)))
    check("on a phone the watchdog is armed on the canvas", /return watchForStuckScroll\(el, reviveCanvas\)/.test(editor))
    check("the transition is tracked so a revive fires on the way OUT, not in", /const wasCovered = coveredRef\.current\n\s+coveredRef\.current = covered\n\s+if \(wasCovered && !covered\)/.test(editor))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
