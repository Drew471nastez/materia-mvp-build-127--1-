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
import { isCanvasNavigationLink, leavesThePage, type ClickTargetLike } from "@/lib/website-builder/canvas-intercept"
import { join } from "node:path"
import { PIN_AFTER_SELECT_MS, STUCK_DISTANCE_PX, nudgeOffEnds, pinScroll, reviveScroller, watchForStuckScroll } from "@/lib/website-builder/canvas-scroll"
import { NAVIGATE_CEILING_MS, navigateWithCeiling } from "@/lib/website-builder/navigate-ceiling"

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
    check("twice, for a keyboard still on its way down", /window\.setTimeout\(back, 340\)/.test(editor) && /window\.setTimeout\(back, 900\)/.test(editor))
    check("on a phone the return settles and never toggles the scroller's overflow; on a desktop, where the card faded, it revives", /const back = isMobileView \? settleCanvas : reviveCanvas/.test(editor))
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
      /* `renderOpen` is `open`, or where a release that is still settling is
         heading before the page has been told. The gate is the same. */
      sheet.includes('pointerEvents: renderOpen && renderOpacity > 0.01 ? "auto" : "none"') &&
        sheet.includes("const renderOpen = settle.current.active ? settle.current.nowOpen : open"),
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
  section("The canvas never takes the browser anywhere")
{
  /** A fake element tree: `closest` walks up by the selectors it is asked for. */
  type Fake = ClickTargetLike & { parent: Fake | null; attrs: Record<string, string>; matches: string[] }
  const el = (tag: string, matches: string[], attrs: Record<string, string> = {}, parent: Fake | null = null): Fake => {
    const node: Fake = {
      tagName: tag.toUpperCase(),
      attrs,
      matches,
      parent,
      getAttribute: (name: string) => attrs[name] ?? null,
      closest(selector: string): ClickTargetLike | null {
        const wanted = selector.split(",").map((p) => p.trim())
        let cur: Fake | null = node
        while (cur) {
          if (cur.matches.some((m) => wanted.includes(m))) return cur
          cur = cur.parent
        }
        return null
      },
    }
    return node
  }

  const link = el("a", ["a[href]"], { href: "/products" })
  const inLink = el("span", [], {}, link)
  check("a tap inside a link would leave, so its default is blocked", leavesThePage(inLink))

  const form = el("form", ["form"])
  const submit = el("button", ["button, input", "button"], { type: "submit" }, form)
  check("a submit button inside a form would leave", leavesThePage(submit))

  const bare = el("button", ["button, input", "button"], {}, form)
  check("a button with no type inside a form is a submit button", leavesThePage(bare))

  const plain = el("button", ["button, input", "button"], { type: "button" }, form)
  check("a button that says it is not a submit is left alone", !leavesThePage(plain))

  const loose = el("button", ["button, input", "button"], {})
  check("a button outside any form is left alone", !leavesThePage(loose))

  const text = el("input", ["button, input", "input"], { type: "text" }, form)
  check("a text field is left alone", !leavesThePage(text))

  const inputSubmit = el("input", ["button, input", "input"], { type: "submit" }, form)
  check("an input that submits would leave", leavesThePage(inputSubmit))

  check("nothing is nothing", !leavesThePage(null))

  /*
    ── A PRESS ON A LINK THE CANVAS WILL FOLLOW TAKES NO FOCUS ────────────
    Following a menu link in the footer moved the canvas a little and then
    changed the page. The press focuses the link, and a browser scrolls a
    focused element fully into view; a footer link is at the bottom of the
    page by definition, so "fully into view" is a few dozen pixels of
    scrolling. Measured in scripts/check-footer-jump.mjs, which holds the
    canvas against a nudge of exactly that size.

    The guard for this existed and was gated on the INSPECTOR being on,
    which is not the mode somebody follows a link in. It is its own rule
    now, it applies in both modes, and it is this narrow: only a link the
    canvas is about to follow itself, where focus cannot matter.
  */
  const chrome = el("footer", ["[data-chrome]"])
  const footerLink = el("a", ["a[href]"], { href: "/refund-policy" }, chrome)
  check("a press on a footer link is one the canvas follows",
    isCanvasNavigationLink(el("span", [], {}, footerLink)))

  const body = el("section", [])
  const heroLink = el("a", ["a[href]"], { href: "/refund-policy" }, body)
  check("the same link inside the page's own content is not",
    !isCanvasNavigationLink(heroLink))

  const away = el("a", ["a[href]"], { href: "https://example.com" }, chrome)
  check("an external link in the footer is not, because it is never followed here",
    !isCanvasNavigationLink(away))

  const protocolRelative = el("a", ["a[href]"], { href: "//example.com" }, chrome)
  check("and neither is a protocol relative one", !isCanvasNavigationLink(protocolRelative))

  const noHref = el("div", [], {}, chrome)
  check("something in the footer that is not a link at all is not",
    !isCanvasNavigationLink(noHref))
  check("and nothing is nothing here too", !isCanvasNavigationLink(null))

  const editor = readFileSync(join(process.cwd(), "app/website-builder/editor/[installId]/page.tsx"), "utf8")
  check(
    "the canvas applies that rule on the press, in both modes",
    /if \(isTypingTarget\(target\)\) return/.test(editor)
      && /if \(inspectorEnabled \|\| isCanvasNavigationLink\(target\)\) e\.preventDefault\(\)/.test(editor),
  )
  check(
    "and holds the canvas still from the link until the page is on screen",
    /holdCanvasWhileOpening\(\)\s*\n\s*pageChangeRef\.current/.test(editor)
      && /PIN_WHILE_OPENING_MS/.test(editor)
      && /openingPage\.current = false\s*\n\s*document\.getElementById\("wb-preview-root"\)\?\.scrollTo/.test(editor),
  )
  check(
    "released by a finger as well, so it never fights a deliberate scroll",
    /\(\) => touchingCanvas\.current \|\| !openingPage\.current/.test(editor),
  )
  check(
    "and the canvas blocks both, in either mode, without blocking any handler",
    /onClickCapture=\{\(e\) => \{[\s\S]{0,4200}?if \(leavesThePage\(/.test(editor) &&
      /onSubmitCapture=\{\(e\) => e\.preventDefault\(\)\}/.test(editor),
  )
}

section("Selecting a section cannot move the canvas")
{
  /** A fake frame loop and clock, so the whole pin runs without a browser. */
  const frames: Array<() => void> = []
  let clock = 0
  let touching = false
  const el = { scrollTop: 1200 }
  pinScroll(el, 500, (cb) => frames.push(cb), () => clock, () => touching)

  const runFrame = (ms: number) => {
    clock += ms
    const due = frames.splice(0, frames.length)
    due.forEach((f) => f())
  }

  check("nothing happens to a canvas nobody moved", (() => { runFrame(16); return el.scrollTop === 1200 })())

  el.scrollTop = 0
  runFrame(16)
  check("something that jumps it to the top is put straight back", el.scrollTop === 1200)

  el.scrollTop = 640
  runFrame(16)
  check("and a jump to anywhere else is too", el.scrollTop === 1200)

  check("it is still watching before its time is up", frames.length === 1)
  runFrame(500)
  check("and it lets go when the time is up", frames.length === 0)

  el.scrollTop = 30
  runFrame(16)
  check("after that the canvas is nobody's business but the person's", el.scrollTop === 30)
}
{
  // A finger releases it at once, so it can never fight a real scroll.
  const frames: Array<() => void> = []
  let clock = 0
  let touching = false
  const el = { scrollTop: 900 }
  pinScroll(el, 500, (cb) => frames.push(cb), () => clock, () => touching)
  touching = true
  el.scrollTop = 500
  clock += 16
  frames.splice(0, frames.length).forEach((f) => f())
  check("a finger on the glass releases the pin immediately", el.scrollTop === 500 && frames.length === 0)
}
{
  check("half a second, which covers a tap and is never felt", PIN_AFTER_SELECT_MS === 500)
  const editor = readFileSync(join(process.cwd(), "app/website-builder/editor/[installId]/page.tsx"), "utf8")
  check(
    "selecting a section moves the canvas nowhere, on a phone as on a desktop",
    // It came to the top of the canvas on a phone for one deploy. Done
    // smoothly and on purpose it is still the page moving under a thumb that
    // asked for a section and not for a scroll.
    !/scrollWithin\(el, section/.test(editor) && !/isMobileView && section/.test(editor),
  )
  check(
    "a selection from the canvas arms the hold, and a touch or a wheel releases it",
    /const selectSectionFromCanvas = useCallback\(\s*\n\s*\(sectionId: string, blockId\?: string \| null, field\?: ClickTarget \| null\) => \{[\s\S]*?pinScroll\(/.test(editor) &&
      /touchingCanvas\.current = true\s*\n\s*if \(!isMobileView\) return/.test(editor) &&
      /onTouchEnd=\{\(\) => \{ touchingCanvas\.current = false \}\}/.test(editor) &&
      /onWheelCapture=\{\(\) => \{ touchingCanvas\.current = true \}\}/.test(editor),
  )
  check(
    "opening the code editor is going forward, not the Going back screen",
    /\/\/ NOT `setLeaving\(true\)`/.test(editor) &&
      !/setLeaving\(true\)\s*\n\s*router\.push\(`\/website-builder\/code/.test(editor),
  )
  check(
    "and it is a page only on a phone: a desktop keeps the pane over the canvas",
    /if \(!isMobileView\) \{\s*\n\s*setPreviewMode\("code"\)/.test(editor),
  )
}

section("Leaving a page always ends, one way or the other")
{
  const said: string[] = []
  let timerId = 0
  const timers = new Map<number, () => void>()
  const after = (cb: () => void, ms: number) => { timerId += 1; timers.set(timerId, cb); said.push(`waits ${ms}ms`); return timerId }
  const clear = (id: number) => { timers.delete(id); said.push("cancels the wait") }

  const cancel = navigateWithCeiling(() => said.push("soft"), () => said.push("hard"), after, clear)
  check("the soft navigation goes first, and the fallback is only armed", said.join(", ") === `soft, waits ${NAVIGATE_CEILING_MS}ms`, said.join(", "))

  cancel()
  check("arriving cancels the fallback, so a page that left does not load twice", said.includes("cancels the wait") && !said.includes("hard"))

  const second: string[] = []
  const timers2 = new Map<number, () => void>()
  const after2 = (cb: () => void) => { timerId += 1; timers2.set(timerId, cb); return timerId }
  navigateWithCeiling(() => second.push("soft"), () => second.push("hard"), after2, () => {})
  timers2.forEach((cb) => cb())
  check("a page still here when the ceiling is reached loads the address for real", second.join(", ") === "soft, hard", second.join(", "))

  /* Round 23: at 2.5s a cold server turned an ordinary Back into a reload of the whole app; the app's spinner cap. */
  check("eight seconds, the app's own cap on a navigation: a slow server is not a reason for a whole page load", NAVIGATE_CEILING_MS === 8_000)
}
{
  const editor = readFileSync(join(process.cwd(), "app/website-builder/editor/[installId]/page.tsx"), "utf8")
  check(
    /* Changed on purpose (Y1): the builder's Going back is in its canvas now, so the editor must still be there for the owner's minimum; the push waits EXIT_MIN_MS, to a route warmed on the press. The page editors still push on the press (LEAVING_SEEN_MS). */
    "the push goes once Going back has been up EXIT_MIN_MS, through the one timer that can still be cancelled",
    // Prefetching made the navigation instant, and an instant navigation
    // paints the next page before this one has drawn the screen at all.
    // Three lines in turn need the time they were written for.
    // The number itself moved to lib/website-builder/navigate-ceiling, beside
    // the ceiling it starts, because the creator page editor leaves too and a
    // second copy of it is a second answer to the same question.
    /export const LEAVING_SEEN_MS = 0/.test(
      readFileSync(join(process.cwd(), "lib/website-builder/navigate-ceiling.ts"), "utf8"),
    ) &&
      /import \{ EXIT_MIN_MS, exitWatchdogMs \} from "@\/lib\/website-builder\/exit-hold"/.test(editor) &&
      /const start = window\.setTimeout\(\(\) => \{\s*\n\s*cancelCeiling\.current = navigateWithCeiling\([\s\S]*?\}, EXIT_MIN_MS\)/.test(editor) &&
      /cancelCeiling\.current = \(\) => window\.clearTimeout\(start\)/.test(editor),
  )
  check(
    "every way out of the builder goes through one function that cannot hang",
    /const leaveFor = useCallback\(\(href: string\) => \{[\s\S]*?navigateWithCeiling\(\s*\n\s*\(\) => router\.push\(href\),\s*\n\s*\(\) => window\.location\.assign\(href\)/.test(editor) &&
      /leaveFor\(href\)\s*\n\s*\},\s*\n\s*\[isDirty, codeDirty, saving, publishing, leaveFor\]/.test(editor) &&
      /* The leave dialog's Discard and Save both end in it too (Back from the browser goes back instead). */
      /else if \(href\) \{\s*\n\s*leaveAnswered\.current = true\s*\n\s*leaveFor\(href\)/.test(editor) &&
      !/setLeaving\(true\)\s*\n\s*router\.push\(href\)/.test(editor),
  )
  check(
    "the watchdog only revives the editor, long after the push (round 23: its own load of the address fired as the push started)",
    /const watchdog = window\.setTimeout\(revive, exitWatchdogMs\(NAVIGATE_CEILING_MS\)\)/.test(editor),
  )
  check(
    "and the way out is warmed while nothing else is happening",
    /router\.prefetch\("\/app\/website-builder"\)/.test(editor) && /router\.prefetch\("\/app"\)/.test(editor),
  )
  const codeSrc = readFileSync(join(process.cwd(), "app/website-builder/code/[installId]/page.tsx"), "utf8")
  check(
    "the code editor's Back has the same ceiling",
    /navigateWithCeiling\(\s*\n\s*\(\) => router\.push\(backHref\),\s*\n\s*\(\) => window\.location\.assign\(backHref\)/.test(codeSrc),
  )
}
  // ═══════════════════════════════════════════════════════════════════════
  section("The Add section library cannot be blanked by a missed measurement")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /**
     * Reported with a screenshot: every category down the side of the modal,
     * and beside them nothing at all. Not "no sections in this category" —
     * the list was never empty, it simply never drew.
     *
     * The grid was gated on `gridWidth > 0`, and the width came from a ref
     * read inside an effect keyed on `[open, isMobileLayout]`. A dialog that
     * mounts its content through a presence wrapper does not have the ref
     * attached in the commit that effect runs in, so it returned early,
     * nothing set the width, and the deps never changed again to give it a
     * second chance. Measured on the real editor: `cards=0` on a desktop and
     * `cards=38` on a phone, from the same code.
     *
     * A callback ref is called with the node the moment the node exists,
     * whenever that is, so there is no window to fall through.
     */
    /* The library is its own module now (components/website-builder/editor/section-library.tsx). */
    const editorSrc = readFileSync(join(process.cwd(), "components/website-builder/editor/section-library.tsx"), "utf8")
    check(
      "the grid is measured by a callback ref, not a ref read in an effect",
      /const gridRef = useCallback\(\(el: HTMLDivElement \| null\) => \{/.test(editorSrc) &&
        /new ResizeObserver\(\(\) => setGridWidth\(el\.clientWidth\)\)/.test(editorSrc),
    )
    /**
     * And even a width that never arrives must not hide the library. A card
     * whose preview does not yet know how wide it is can still be drawn and
     * still be pressed.
     */
    check("the list is not gated on the measurement at all", !/\{gridWidth > 0 && visible\.map/.test(editorSrc))
    check("the observer is disconnected when the node goes and on unmount", /gridObserver\.current\?\.disconnect\(\)/.test(editorSrc))
    check("each card carries a stable hook to count by", /data-library-card=\{entry\.type\}/.test(editorSrc))
  }

{
    console.log("\nTyping into a field in the canvas, with the inspector on")
    const editor = readFileSync(join(process.cwd(), "app/website-builder/editor/[installId]/page.tsx"), "utf8")
    /* Pressing an email box selected the section, and on a phone the section
       sheet came up over the keyboard and took the focus: nothing could be
       typed. A press in a field, or on its label, is left to the field. */
    check("a press in a field or its label does not select the section",
      /if \(isTypingTarget\(target as unknown as ClickTargetLike\) \|\| target\?\.closest\?\.\("label"\)\) return/.test(editor))
  }

  {
    console.log("\nThe dashboard's announcement slides never overlap")
    const dash = readFileSync(join(process.cwd(), "components/app/dashboard-client.tsx"), "utf8")
    const bar = dash.slice(dash.indexOf("const AnnouncementBar = memo("), dash.indexOf("export function DashboardClient("))
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
    /* Changed on purpose: the slide is named, and each slide has its own place in one grid cell. */
    check("the slide showing is named, and a list that changes under it keeps it", /useState<AnnouncementSlide>\(slides\[0\]\)/.test(bar) && /slides\.includes\(currentId\) \? currentId : slides\[0\]/.test(bar))
    check("the line ending picks the next, with no timer", /onAnimationEnd=\{next\}/.test(bar) && !/setTimeout\(/.test(bar))
    check("every slide sits in one grid cell, marked data-on when it shows", /announce-stack[^"]*grid/.test(bar) && (bar.match(/className="announce-slide /g) ?? []).length === 3 && /\.announce-stack > \.announce-slide \{\s*grid-area: 1 \/ 1;/.test(css))
    check("the one arriving waits until the one leaving is gone", /\.announce-slide \{[^}]*opacity 160ms[^}]*visibility 0s linear 160ms/.test(css) && /\.announce-slide\[data-on\] \{[^}]*opacity 300ms cubic-bezier\(0\.22, 1, 0\.36, 1\) 170ms/.test(css))
    check("the bar holds its own state, so a slide change does not render the dashboard",
      bar.length > 0 && /<AnnouncementBar slides=\{slides\}/.test(dash) && !/announceCycle/.test(dash.slice(dash.indexOf("export function DashboardClient("))))
    check("and it stops when nobody can see it",
      /new IntersectionObserver/.test(bar) && /document\.visibilityState === "hidden"/.test(bar) && /animationPlayState: paused \? "paused" : "running"/.test(bar))
    check("and its line restarts with it, in place", /run\.currentTime = 0/.test(bar) && /\}, \[announceCycle\]\)/.test(bar) && /announce-progress/.test(dash))
    check("the bar holds one line, so two slides can never stack", /announce-stack[^"]*whitespace-nowrap/.test(bar))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
