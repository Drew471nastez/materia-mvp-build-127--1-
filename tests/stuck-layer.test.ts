/**
 * ===========================================================================
 *  THE PAGE THAT WENT DEAD TO TOUCH, AND WHY FOUR FIXES MISSED IT
 * ===========================================================================
 * "Come back from the code editor or project settings and the preview will
 * not scroll at all; I have to reload the page." Fixed four times at the
 * scroller and reported a fifth, because the scroller was never it:
 *
 *     @radix-ui/react-dismissable-layer:
 *         document.body.style.pointerEvents = "none"
 *
 * Every Radix modal sets that while open and restores it on unmount. The
 * code editor and project settings are both opened FROM a dropdown menu, and
 * mounting a full-screen pane over that menu tears it down mid-close — so the
 * restore can be skipped and the body stays dead to every press. It reads as
 * a frozen scroll because scrolling is what you try first.
 *
 * And the cleanup that already existed skipped itself whenever it found
 * `[data-mobile-bottom-sheet]`, which the builder's sections sheet is, for
 * the whole life of the editor. On a phone it never ran once.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { clearStaleDocumentLocks, documentIsLocked, modalIsOpen, superviseDocumentLocks, unblockInertOverlay, watchForStuckLayer, SETTLE_MS } from "@/lib/website-builder/stuck-layer"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function el(inline: Record<string, string> = {}, attrs: string[] = []) {
  const props = new Map(Object.entries(inline))
  const set = new Set(attrs)
  return {
    style: {
      getPropertyValue: (n: string) => props.get(n) ?? "",
      removeProperty: (n: string) => { props.delete(n) },
      setProperty: (n: string, v: string) => { props.set(n, v) },
    },
    hasAttribute: (n: string) => set.has(n),
    removeAttribute: (n: string) => { set.delete(n) },
    props,
    attrs: set,
  }
}

type Listener = () => void
function fakeDoc(opts: { open?: string[]; html?: Record<string, string>; body?: Record<string, string>; bodyAttrs?: string[] } = {}) {
  let present = opts.open ?? []
  const listeners = new Map<string, Listener[]>()
  const documentElement = el(opts.html ?? {})
  const body = el(opts.body ?? {}, opts.bodyAttrs ?? [])
  return {
    documentElement,
    body,
    /** Every selector the real one is asked, matched against a list of what is on screen. */
    /* Round AW: each selector also says "not at rest" (a kept sheet, an inert or closed layer); the fake reads the part before it. */
    querySelector: (sel: string) => (sel.split(",").some((s) => present.includes(s.trim().replace(/:not\(\[data-app-sheet-rest\]\).*$/, ""))) ? {} : null),
    addEventListener(t: string, cb: Listener) { listeners.set(t, [...(listeners.get(t) ?? []), cb]) },
    removeEventListener(t: string, cb: Listener) { listeners.set(t, (listeners.get(t) ?? []).filter((x) => x !== cb)) },
    press(t = "pointerdown") { for (const cb of listeners.get(t) ?? []) cb() },
    /** What is on screen now, so a test can close a layer. */
    setOpen(next: string[]) { present = next },
    listenerCount: () => [...listeners.values()].reduce((n, l) => n + l.length, 0),
  }
}

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("What counts as a layer entitled to hold the document still")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("an open menu does", modalIsOpen(fakeDoc({ open: ['[role="menu"][data-state="open"]'] })))
    check("so does a dialog", modalIsOpen(fakeDoc({ open: ['[role="dialog"][data-state="open"]'] })))
    check("and a popper holding a menu or a popover", modalIsOpen(fakeDoc({ open: ['[data-radix-popper-content-wrapper]:not(:has([role="tooltip"]))'] })))
    /**
     * A TOOLTIP IS NOT A MODAL. It uses the same popper wrapper as the ones
     * that are, it locks nothing, and it follows the pointer — so counting it
     * would mean the page stays dead for as long as a tooltip is showing,
     * which on the builder's section toolbar is most of the time a pointer is
     * anywhere near it.
     */
    check("but not a tooltip in the same wrapper", !modalIsOpen(fakeDoc({ open: ["[data-radix-popper-content-wrapper]"] })))
    check("and anything saying it is modal", modalIsOpen(fakeDoc({ open: ['[aria-modal="true"]'] })))
    check("an empty document does not", !modalIsOpen(fakeDoc()))
    /**
     * THE ONE THAT BROKE IT ON A PHONE. The builder's sections sheet is
     * mounted for the whole life of the editor, because it has a peek. The
     * old guard matched it and skipped, so the cleanup never ran once.
     */
    check("and neither does the builder's own sheet, which sets no body lock", !modalIsOpen(fakeDoc({ open: ["[data-mobile-bottom-sheet]", "[data-mobile-top-sheet]"] })))
    /**
     * `[data-state="open"]` on its own is on accordions, collapsibles and
     * half the builder's panels. Matching it is the same mistake again.
     */
    check("nor an accordion that happens to be open", !modalIsOpen(fakeDoc({ open: ['[data-state="open"]'] })))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Clearing what a layer left behind")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const doc = fakeDoc({ body: { "pointer-events": "none", overflow: "hidden" }, bodyAttrs: ["data-scroll-locked"] })
    const cleared = clearStaleDocumentLocks(doc)
    check("the body takes presses again", doc.body.style.getPropertyValue("pointer-events") === "")
    check("its overflow and scroll lock go with it", doc.body.style.getPropertyValue("overflow") === "" && !doc.body.hasAttribute("data-scroll-locked"))
    check("and it says what it cleared", cleared.includes("body.pointer-events") && cleared.includes("body[data-scroll-locked]"), cleared.join(", "))

    const root = fakeDoc({ html: { "pointer-events": "none", position: "fixed", "touch-action": "none" } })
    clearStaleDocumentLocks(root)
    check("html is cleaned too", root.documentElement.style.getPropertyValue("pointer-events") === "" && root.documentElement.style.getPropertyValue("position") === "")

    /**
     * The builder locks its document with a CLASS and a stylesheet
     * (`wb-fullscreen`), never inline — precisely so that an inline lock is
     * always somebody's leftover and this can take it away without argument.
     */
    const clean = fakeDoc()
    check("a document with nothing on it is not touched", clearStaleDocumentLocks(clean).length === 0)

    const busy = fakeDoc({ open: ['[role="dialog"][data-state="open"]'], body: { "pointer-events": "none" } })
    check("a lock a live dialog is holding is left alone", clearStaleDocumentLocks(busy).length === 0 && busy.body.style.getPropertyValue("pointer-events") === "none")
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The press that finds the page dead is the press that revives it")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /**
     * With `pointer-events: none` on the body a press hit-tests through to
     * the root element, so it still reaches a listener on the DOCUMENT even
     * though it reaches nothing inside the page. That is the only signal
     * available from inside a frozen page.
     */
    const doc = fakeDoc({ body: { "pointer-events": "none" } })
    const seen: string[][] = []
    const off = watchForStuckLayer(doc, (what) => seen.push(what))
    doc.press()
    check("one press and the page is alive again", doc.body.style.getPropertyValue("pointer-events") === "" && seen.length === 1, JSON.stringify(seen))
    doc.press()
    check("and it does not keep firing once it is", seen.length === 1)

    const touch = fakeDoc({ body: { "pointer-events": "none" } })
    const seen2: string[][] = []
    watchForStuckLayer(touch, (w) => seen2.push(w))
    touch.press("touchstart")
    check("a touch works as well as a click", seen2.length === 1)

    const fine = fakeDoc()
    let fired = 0
    watchForStuckLayer(fine, () => fired++)
    fine.press()
    check("an ordinary press on a working page does nothing at all", fired === 0)

    const held = fakeDoc({ open: ['[role="menu"][data-state="open"]'], body: { "pointer-events": "none" } })
    let fired2 = 0
    watchForStuckLayer(held, () => fired2++)
    held.press()
    check("and a press while a menu is genuinely open leaves it holding", fired2 === 0 && held.body.style.getPropertyValue("pointer-events") === "none")

    off()
    check("stopping removes every listener", doc.listenerCount() === 0)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The editor uses it everywhere a layer can close")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    check("coming back to the foreground clears the document", /clearStaleDocumentLocks\(document\)/.test(editor))
    check("and the old guard that never ran on a phone is gone", !/\[data-mobile-bottom-sheet\], \[data-mobile-top-sheet\]'\)\s*\n\s*if \(!liveLayer\)/.test(editor) && !/const liveLayer = /.test(editor))
    check("closing the code pane or settings clears it before touching the scroller", (() => {
      const fn = editor.slice(editor.indexOf("const reviveCanvas"), editor.indexOf("const reviveCanvas") + 900)
      return fn.indexOf("clearStaleDocumentLocks(document)") > 0 && fn.indexOf("clearStaleDocumentLocks(document)") < fn.indexOf("reviveScroller(")
    })(), "reviving a scroller cannot help when the touches never reach it")
    check("and the press-to-revive net is armed on the document", /watchForStuckLayer\(document, \(\) => \{/.test(editor))
    check("the scroller's own repair runs on the return from the code pane, not on a watchdog", /window\.setTimeout\(back, 340\)/.test(editor) && /const back = isMobileView \? settleCanvas : reviveCanvas/.test(editor) && !/watchForStuckScroll\(/.test(editor))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The supervisor: a lock with no owner does not survive a heartbeat")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /** A clock you turn by hand, so a test never waits for a real one. */
    function fakeClock() {
      let next = 1
      const jobs = new Map<number, { at: number; cb: () => void }>()
      let t = 0
      return {
        now: () => t,
        timers: {
          setTimeout(cb: () => void, ms: number) { const id = next++; jobs.set(id, { at: t + ms, cb }); return id },
          clearTimeout(id: number) { jobs.delete(id) },
        },
        /** Advance, running whatever comes due, in order. */
        tick(ms: number) {
          t += ms
          for (const [id, j] of [...jobs].sort((a, b) => a[1].at - b[1].at)) {
            if (j.at <= t) { jobs.delete(id); j.cb() }
          }
        },
        pending: () => jobs.size,
      }
    }
    /** Stands in for the MutationObserver on html and body. */
    function fakeObserver() {
      let onChange: (() => void) | null = null
      let live = false
      return {
        observe: (cb: () => void) => { onChange = cb; live = true; return () => { live = false } },
        /** Something wrote to html or body. */
        fire: () => onChange?.(),
        isLive: () => live,
      }
    }

    /**
     * ───────────────────────────────────────────────────────────────────────
     *  THE EXACT SEQUENCE RADIX GETS WRONG
     * ───────────────────────────────────────────────────────────────────────
     * Open a menu. Open a dialog from it. Let both go in one commit. Each
     * cleanup asks "am I the last one?", both see a set of two, neither
     * restores — and the delete that would have made one of them the last one
     * runs in a different effect, afterwards. `pointer-events: none` is then
     * on the body with nothing on screen that put it there.
     */
    {
      const doc = fakeDoc({ open: ['[role="menu"][data-state="open"]'] })
      const clock = fakeClock()
      const obs = fakeObserver()
      const cleared: string[][] = []
      const stop = superviseDocumentLocks(doc, { timers: clock.timers, observe: obs.observe, onCleared: (w) => cleared.push(w) })

      // The menu is open and holding the lock, legitimately.
      doc.body.style.setProperty("pointer-events", "none")
      obs.fire()
      clock.tick(SETTLE_MS + 50)
      check("a lock is left alone while the layer that took it is open", doc.body.style.getPropertyValue("pointer-events") === "none")

      // Both layers go, and neither restores.
      doc.setOpen([])
      obs.fire()
      clock.tick(SETTLE_MS - 1)
      check("and it is still left alone for the moment a closing menu needs", doc.body.style.getPropertyValue("pointer-events") === "none")
      clock.tick(2)
      check("then it is taken back, with nothing pressed and nobody asked", doc.body.style.getPropertyValue("pointer-events") === "")
      check("and it says what it took", cleared.length === 1 && cleared[0].includes("body.pointer-events"), JSON.stringify(cleared))
      stop()
    }

    /**
     * THE OTHER HALF OF THE REPORT, and the half no press can rescue.
     * `react-remove-scroll` leaves `overflow: hidden` and `data-scroll-locked`
     * behind. Every button still works, so nothing looks broken — the page
     * simply will not scroll, on a phone or a desktop, until it is reloaded.
     */
    {
      const doc = fakeDoc({ body: { overflow: "hidden" }, bodyAttrs: ["data-scroll-locked"] })
      const clock = fakeClock()
      const obs = fakeObserver()
      const stop = superviseDocumentLocks(doc, { timers: clock.timers, observe: obs.observe })
      obs.fire()
      clock.tick(SETTLE_MS + 1)
      check("a scroll lock with no owner is taken back too", doc.body.style.getPropertyValue("overflow") === "" && !doc.body.hasAttribute("data-scroll-locked"))
      stop()
    }

    /** A page can be woken already stuck, with no mutation left to observe. */
    {
      const doc = fakeDoc({ body: { "pointer-events": "none" } })
      const clock = fakeClock()
      const stop = superviseDocumentLocks(doc, { timers: clock.timers })
      clock.tick(SETTLE_MS + 1)
      check("one pass on the way in catches a page restored already stuck", doc.body.style.getPropertyValue("pointer-events") === "")
      stop()
    }

    /** Somebody already pressing a dead page has waited long enough. */
    {
      const doc = fakeDoc({ body: { "pointer-events": "none" } })
      const clock = fakeClock()
      const stop = superviseDocumentLocks(doc, { timers: clock.timers })
      clock.tick(1) // before the settle would have fired
      doc.body.style.setProperty("pointer-events", "none")
      doc.press("pointerdown")
      check("a press does not wait out the grace period", doc.body.style.getPropertyValue("pointer-events") === "")
      stop()
    }
    {
      const doc = fakeDoc({ body: { "pointer-events": "none" } })
      const clock = fakeClock()
      const stop = superviseDocumentLocks(doc, { timers: clock.timers })
      clock.tick(1)
      doc.body.style.setProperty("pointer-events", "none")
      doc.press("touchstart")
      check("and a touch is a press", doc.body.style.getPropertyValue("pointer-events") === "")
      stop()
    }

    /**
     * THE FAILURE THIS MUST NOT HAVE. Clearing a lock that a live modal is
     * relying on would let a click fall through a dialog onto the page behind
     * it. Nothing below is allowed to touch a document that has an owner.
     */
    {
      const doc = fakeDoc({ open: ['[role="dialog"][data-state="open"]'], body: { "pointer-events": "none", overflow: "hidden" } })
      const clock = fakeClock()
      const obs = fakeObserver()
      const stop = superviseDocumentLocks(doc, { timers: clock.timers, observe: obs.observe })
      obs.fire()
      clock.tick(SETTLE_MS * 10)
      doc.press("pointerdown")
      doc.press("touchstart")
      check("an open dialog keeps its lock through every path", doc.body.style.getPropertyValue("pointer-events") === "none" && doc.body.style.getPropertyValue("overflow") === "hidden")
      stop()
    }

    /** A select inside a dialog is two layers; closing one keeps the other. */
    {
      const doc = fakeDoc({ open: ['[role="listbox"][data-state="open"]', '[aria-modal="true"]'], body: { "pointer-events": "none" } })
      const clock = fakeClock()
      const obs = fakeObserver()
      const stop = superviseDocumentLocks(doc, { timers: clock.timers, observe: obs.observe })
      doc.setOpen(['[aria-modal="true"]'])
      obs.fire()
      clock.tick(SETTLE_MS * 3)
      check("closing the inner layer does not unlock the outer one", doc.body.style.getPropertyValue("pointer-events") === "none")
      stop()
    }

    /** Cheap when nothing is wrong, and it stops when it is told to. */
    {
      const doc = fakeDoc()
      const clock = fakeClock()
      const obs = fakeObserver()
      const stop = superviseDocumentLocks(doc, { timers: clock.timers, observe: obs.observe })
      obs.fire()
      check("an unlocked document schedules nothing", clock.pending() === 0)
      check("and it is watching", obs.isLive() && doc.listenerCount() > 0)
      stop()
      check("stopping disconnects the observer and every listener", !obs.isLive() && doc.listenerCount() === 0)
      check("and nothing is left on the clock", clock.pending() === 0)

      const after = fakeDoc({ body: { "pointer-events": "none" } })
      const c2 = fakeClock()
      const s2 = superviseDocumentLocks(after, { timers: c2.timers })
      s2()
      c2.tick(SETTLE_MS * 5)
      check("a supervisor that was stopped does not act later", after.body.style.getPropertyValue("pointer-events") === "none")
    }

    check("documentIsLocked sees an attribute lock as well as a style one",
      documentIsLocked(fakeDoc({ bodyAttrs: ["data-scroll-locked"] })) &&
      documentIsLocked(fakeDoc({ html: { overflow: "hidden" } })) &&
      !documentIsLocked(fakeDoc()))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("The other way a screen goes dead: something invisible in front of it")
  // ═══════════════════════════════════════════════════════════════════════
  {
    /**
     * A document lock is not the only total block. The editor has scrims that
     * block ON PURPOSE for a moment — the leaving overlay, the canvas loader
     * mid-fade — and each is correct right up until whatever was going to
     * take it away does not run. Then the editor is alive, looks normal, and
     * takes no input at all: "multiple controls stop working and the scroll
     * blocks completely."
     */
    function overlay(opts: { w: number; h: number; opacity?: string; visibility?: string; ariaHidden?: boolean; leaving?: boolean; pointerEvents?: string; className?: string }) {
      const set = new Map<string, string>()
      return {
        el: {
          getBoundingClientRect: () => ({ width: opts.w, height: opts.h }),
          getAttribute: (n: string) =>
            n === "aria-hidden" ? (opts.ariaHidden ? "true" : null) : n === "data-leaving" ? (opts.leaving ? "true" : null) : null,
          style: { setProperty: (n: string, v: string) => { set.set(n, v) } },
          className: opts.className ?? "wb-leaving",
          tagName: "DIV",
        },
        set,
        style: { opacity: opts.opacity ?? "1", visibility: opts.visibility ?? "visible", pointerEvents: opts.pointerEvents ?? "auto" },
      }
    }
    function pointDoc(o: ReturnType<typeof overlay> | null, open: string[] = []) {
      const base = fakeDoc({ open })
      return Object.assign(base, {
        elementFromPoint: () => o?.el ?? null,
        defaultView: { innerWidth: 1000, innerHeight: 800, getComputedStyle: () => o!.style },
      })
    }

    {
      const o = overlay({ w: 1000, h: 800, opacity: "0" })
      const what = unblockInertOverlay(pointDoc(o), 500, 400)
      check("a transparent scrim over the whole screen is moved out of the way", o.set.get("pointer-events") === "none")
      check("and it says what it moved", !!what && what.includes("wb-leaving") && what.includes("transparent"), String(what))
    }
    {
      const o = overlay({ w: 1000, h: 800, ariaHidden: true })
      unblockInertOverlay(pointDoc(o), 500, 400)
      check("so is one hidden from the accessibility tree", o.set.get("pointer-events") === "none")
    }
    {
      const o = overlay({ w: 1000, h: 800, leaving: true, className: "wb-canvas-loader" })
      unblockInertOverlay(pointDoc(o), 500, 400)
      check("and a loader that is already on its way out", o.set.get("pointer-events") === "none")
    }

    /**
     * ───────────────────────────────────────────────────────────────────────
     *  AND EVERYTHING THIS IS NOT ALLOWED TO TOUCH
     * ───────────────────────────────────────────────────────────────────────
     * The whole value of this is that it is obviously right. The moment it
     * starts disabling things a person meant to press, it is worse than the
     * bug.
     */
    {
      const o = overlay({ w: 1000, h: 800 })
      check("something you can see is not in the way, it is the page", unblockInertOverlay(pointDoc(o), 500, 400) === null && !o.set.has("pointer-events"))
    }
    {
      /**
       * A bigger hit area around a small control, a file input over a button:
       * invisible on purpose, and pressing them is the point. They are small,
       * which is the whole difference between a hit target and a scrim.
       */
      const o = overlay({ w: 44, h: 44, opacity: "0" })
      check("an invisible hit target is left alone, because it is not a scrim", unblockInertOverlay(pointDoc(o), 20, 20) === null && !o.set.has("pointer-events"))
    }
    {
      const o = overlay({ w: 1000, h: 200, opacity: "0" })
      check("nor is a wide strip that does not cover the screen", unblockInertOverlay(pointDoc(o), 500, 100) === null)
    }
    {
      /**
       * THE ONE THAT WOULD BREAK THE PRODUCT. The mobile sheet's backdrop is
       * this exact shape — full screen, aria-hidden, taking presses on
       * purpose so that pressing outside closes the sheet. Disabling it would
       * mean the sheet could not be dismissed.
       */
      const o = overlay({ w: 1000, h: 800, ariaHidden: true })
      check("and never a live modal's own backdrop", unblockInertOverlay(pointDoc(o, ['[aria-modal="true"]']), 500, 400) === null && !o.set.has("pointer-events"))
    }
    {
      const o = overlay({ w: 1000, h: 800, opacity: "0", pointerEvents: "none" })
      check("something already out of the way is not touched again", unblockInertOverlay(pointDoc(o), 500, 400) === null)
    }
    check("a press that lands on nothing does nothing", unblockInertOverlay(pointDoc(null), 5, 5) === null)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("And it is mounted for every screen, not just the builder")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const guard = read("components/platform/stuck-layer-guard.tsx")
    const layout = read("app/layout.tsx")
    check("the guard is in the root layout", /<StuckLayerGuard \/>/.test(layout) && /from "@\/components\/platform\/stuck-layer-guard"/.test(layout))
    check("it watches html and body for the attributes a lock arrives in", /attributeFilter: \["style", "class", "data-scroll-locked"\]/.test(guard) && /mo\.observe\(document\.documentElement/.test(guard) && /mo\.observe\(document\.body/.test(guard))
    check("and it disconnects", /return \(\) => mo\.disconnect\(\)/.test(guard))
    /**
     * The page was drawn while it could not be scrolled, so anything that
     * measured the viewport measured it wrong. A resize is what every one of
     * those listeners is already waiting for.
     */
    check("taking a lock back tells the page to measure itself again", /window\.dispatchEvent\(new Event\("resize"\)\)/.test(guard))
    check("and a press is checked for an invisible layer in front of it", /unblockInertOverlay\(document, p\.clientX, p\.clientY\)/.test(guard) && /passive: true, capture: true/.test(guard))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
