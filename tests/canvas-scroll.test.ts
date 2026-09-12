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
    toggled: 0,
    get offsetHeight() { return opts.clientHeight },
    style: {
      _o: "auto",
      get overflowY() { return this._o },
      set overflowY(v: string) { this._o = v; el.toggled++ },
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
    /**
     * The toggle still happens — hidden, then auto — but in ONE task with a
     * forced layout between, never across a frame. A frame is not a promise:
     * it does not come while the tab is hidden, and leaving the scroller
     * hidden until one arrives is the freeze this was supposed to prevent.
     */
    check("the layer is re-created without waiting for a frame", el.style.overflowY === "auto" && (el as unknown as { toggled: number }).toggled >= 2)
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
    const revive = editor.slice(editor.indexOf("const reviveCanvas"), editor.indexOf("const reviveCanvas") + 1200)
    check("and the window's own offset is put back", /if \(window\.scrollY !== 0\) window\.scrollTo\(0, 0\)/.test(revive))
    /**
     * ORDER MATTERS HERE, and getting it wrong is what made four earlier
     * attempts look like they had missed. While `pointer-events: none` sits
     * on the body no touch reaches the scroller at all, so reviving the
     * scroller first fixes something nobody could have been touching.
     */
    check(
      "the document is unlocked before the scroller is revived",
      revive.indexOf("clearStaleDocumentLocks(document)") !== -1 &&
        revive.indexOf("clearStaleDocumentLocks(document)") < revive.indexOf("reviveScroller(el"),
    )
    check("the watchdog is NOT armed on the canvas: judging a lagging native scroll dead and reviving mid-gesture was the freeze", !/watchForStuckScroll\(/.test(editor) && /NO WATCHDOG ON THE CANVAS/.test(editor))
    check("the transition is tracked so a revive fires on the way OUT, not in", /const wasCovered = coveredRef\.current\n\s+coveredRef\.current = covered\n\s+if \(wasCovered && !covered\)/.test(editor))
  }


  // ═══════════════════════════════════════════════════════════════════════
  section("A frame that never comes cannot leave the scroller hidden")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /**
     * THE FREEZE THIS FILE'S OWN FIX WAS CAUSING. `reviveScroller` set
     * `overflow-y: hidden` and restored `auto` in a requestAnimationFrame. A
     * frame does not come while the tab is hidden or the app is in the
     * background — and one caller is `visibilitychange`, which fires as the
     * page goes HIDDEN. So the canvas was set to hidden and nothing ever set
     * it back. A script could still scroll it; a person could not, until a
     * reload. Measured by scripts/check-editor-scroll.mjs on the real editor:
     * "back from project settings: overflow=hidden".
     */
    const never = fakeScroller({ scrollHeight: 3000, clientHeight: 800, scrollTop: 400 })
    reviveScroller(never, () => { /* the frame never comes */ })
    check("the overflow is back to auto before any frame is asked for", never.style.overflowY === "auto")

    const late = fakeScroller({ scrollHeight: 3000, clientHeight: 800, scrollTop: 400 })
    const frames: (() => void)[] = []
    reviveScroller(late, (cb) => frames.push(cb))
    check("it is auto the moment revive returns, not a frame later", late.style.overflowY === "auto")
    late.style.overflowY = "hidden" // something else got in between
    frames[0]()
    check("and the frame, when it does come, puts it back too", late.style.overflowY === "auto")
    check("the layer is still re-created: the toggle happened", (never as unknown as { toggled: number }).toggled >= 2)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A menu is not a dialog, and must not lock the page")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /**
     * "When I select the section it gets frozen and blocked."
     *
     * Radix defaults a dropdown to `modal`, and a modal dropdown mounts
     * `react-remove-scroll`: a NON-PASSIVE `touchmove` listener on the
     * document that calls `preventDefault()` on every gesture outside the
     * menu, plus `data-scroll-locked` on the body. Right for a dialog. For a
     * three-dot menu on a section row it means the canvas cannot be scrolled
     * while it is open — and the lock was not being released on close, so it
     * could not be scrolled again until the page was reloaded.
     *
     * Measured on the real editor by scripts/check-editor-scroll.mjs: open
     * it, close it, wait three seconds, and 6 of 6 touchmoves over the canvas
     * are still cancelled, phone and desktop alike.
     *
     * Nothing else can undo it. Taking `data-scroll-locked` off the body does
     * not detach that listener, and the lock stack it consults is private to
     * the library — which is why the stale-lock guard, which clears exactly
     * that attribute, could never have helped.
     */
    const editor = readFileSync(join(process.cwd(), "app/website-builder/editor/[installId]/page.tsx"), "utf8")
    const menu = readFileSync(join(process.cwd(), "components/ui/responsive-action-menu.tsx"), "utf8")
    /** Every dropdown root in the editor and in the menu every row uses. */
    const roots = [
      ...editor.split("\n").filter((l) => l.includes("<DropdownMenu ") || l.trim() === "<DropdownMenu>"),
      ...menu.split("\n").filter((l) => l.includes("<DropdownMenu ") || l.trim() === "<DropdownMenu>"),
    ]
    check(`every dropdown in the editor and the row menu is non-modal (${roots.length} found)`,
      roots.length > 0 && roots.every((l) => l.includes("modal={false}")),
      roots.filter((l) => !l.includes("modal={false}")).map((l) => l.trim()).join(" / "))
    /**
     * A DIALOG still locks, and should: it is the one thing you are meant to
     * answer before carrying on. This guard is about menus only.
     */
    check("and a real dialog is left alone", /<Dialog open=\{addPageOpen\}/.test(editor) && !/<Dialog[^>]*modal=\{false\}/.test(editor))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The sheet's backdrop can never be invisible and still take a touch")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /**
     * "When I select a section it blocks."
     *
     * The backdrop is a full-screen fixed layer. The drag path writes its
     * opacity BY HAND, for the same reason it writes the sheet's transform by
     * hand — React cannot keep up with a finger — and `endDrag` handed back
     * `pointer-events` while leaving the opacity wherever the gesture had put
     * it. Nothing in the drag path sets React state, so no re-render ever came
     * along to correct it.
     *
     * Opacity 0 with `pointer-events: auto` over the whole viewport is the
     * worst state a screen can be in: the canvas is plainly visible through it
     * and every touch is swallowed, and nothing looks wrong. Measured on the
     * real editor: `div.fixed.inset-0.bg-black/30 opacity=0 pointer-events=auto`,
     * still there three seconds later.
     *
     * The invariant that makes it unreachable: the only writer that may turn
     * the backdrop's pointer-events ON must set its opacity in the same
     * breath, and React's own render must gate one on the other.
     */
    const sheet = readFileSync(join(process.cwd(), "components/website-builder/mobile-editor-sheet.tsx"), "utf8")

    check(
      "one helper writes both properties, from one answer",
      /const settleOverlay = \(nowOpen: boolean\) => \{[\s\S]*?overlay\.style\.opacity = nowOpen \? "1" : "0"[\s\S]*?overlay\.style\.pointerEvents = nowOpen \? "auto" : "none"[\s\S]*?\}/.test(sheet),
    )
    /**
     * Every OTHER imperative write may only turn them off. A write that turns
     * pointer-events on without an opacity beside it is the bug returning.
     */
    const turnsOn = sheet
      .split("\n")
      .filter((l) => /overlay\.style\.pointerEvents\s*=/.test(l))
      .filter((l) => !/= *"none"/.test(l))
      .filter((l) => !/nowOpen \? "auto" : "none"/.test(l))
    check("and no other line turns the backdrop's pointer-events on by itself", turnsOn.length === 0, turnsOn.map((l) => l.trim()).join(" / "))

    check(
      "React gates them on each other too, so a render cannot produce it either",
      sheet.includes('pointerEvents: open && renderOpacity > 0.01 ? "auto" : "none"'),
    )
    /**
     * And the gesture has to be able to END. A touch event is delivered to the
     * element it STARTED on, so listening on the sheet means a finger lifted
     * over a row React has since replaced never ends the drag — which is
     * exactly what tapping a section row does. The mouse path already knew
     * this; touch never got the same treatment.
     */
    check(
      "a lifted finger ends the drag wherever it lands",
      /window\.addEventListener\("touchend", onEnd\)/.test(sheet) && /window\.addEventListener\("touchcancel", onEnd\)/.test(sheet),
    )
    check(
      "and the sheet no longer listens for the end of one itself",
      !/sheet\.addEventListener\("touchend"/.test(sheet) && !/sheet\.addEventListener\("touchcancel"/.test(sheet),
    )
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
