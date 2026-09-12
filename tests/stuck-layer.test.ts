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
import { clearStaleDocumentLocks, modalIsOpen, watchForStuckLayer } from "@/lib/website-builder/stuck-layer"

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
  const present = opts.open ?? []
  const listeners = new Map<string, Listener[]>()
  const documentElement = el(opts.html ?? {})
  const body = el(opts.body ?? {}, opts.bodyAttrs ?? [])
  return {
    documentElement,
    body,
    /** Every selector the real one is asked, matched against a list of what is on screen. */
    querySelector: (sel: string) => (sel.split(",").some((s) => present.includes(s.trim())) ? {} : null),
    addEventListener(t: string, cb: Listener) { listeners.set(t, [...(listeners.get(t) ?? []), cb]) },
    removeEventListener(t: string, cb: Listener) { listeners.set(t, (listeners.get(t) ?? []).filter((x) => x !== cb)) },
    press(t = "pointerdown") { for (const cb of listeners.get(t) ?? []) cb() },
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
    check("and a popper", modalIsOpen(fakeDoc({ open: ["[data-radix-popper-content-wrapper]"] })))
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
    check("the scroller's own repair is still there for the WebKit case", /watchForStuckScroll\(el, reviveCanvas\)/.test(editor))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
