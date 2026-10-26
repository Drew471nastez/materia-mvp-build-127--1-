/**
 * ===========================================================================
 *  THE KEYBOARD GOING AWAY IS A LAYER GOING AWAY
 * ===========================================================================
 * "Focus a field and the preview will not scroll." iOS scrolls the window to
 * lift a focused field above the keyboard, locked document or not, and leaves
 * it there when the keyboard goes; the fixed builder is then offset and its
 * scroller is dead to the next touch. The canvas already heals itself when
 * the code pane or project settings close — a keyboard closing had no such
 * handler. This RUNS the watcher with a fake window and document.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { FOCUS_SETTLE_MS, KEYBOARD_MIN_PX, takesKeyboard, watchKeyboard } from "@/lib/website-builder/keyboard-watch"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

/** A window, a viewport and a document that can be driven by hand. */
function fake() {
  const listeners: Record<string, (() => void)[]> = {}
  const on = (key: string) => (type: string, cb: () => void) => { (listeners[`${key}:${type}`] ??= []).push(cb) }
  const off = (key: string) => (type: string, cb: () => void) => {
    listeners[`${key}:${type}`] = (listeners[`${key}:${type}`] ?? []).filter((f) => f !== cb)
  }
  const fire = (key: string) => { for (const cb of listeners[key] ?? []) cb() }
  const timers: { id: number; cb: () => void; ms: number }[] = []
  let nextId = 1
  const vv = { height: 800, addEventListener: on("vv"), removeEventListener: off("vv") }
  const win = {
    innerHeight: 800,
    visualViewport: vv,
    addEventListener: on("win"),
    removeEventListener: off("win"),
    setTimeout: (cb: () => void, ms: number) => { const id = nextId++; timers.push({ id, cb, ms }); return id },
    clearTimeout: (id: number) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1) },
  }
  const doc = { activeElement: { tagName: "BODY" } as { tagName?: string; isContentEditable?: boolean } | null, addEventListener: on("doc"), removeEventListener: off("doc") }
  const runTimers = () => { const due = timers.splice(0); for (const t of due) t.cb() }
  const count = () => Object.values(listeners).reduce((n, l) => n + l.length, 0)
  return { vv, win, doc, fire, runTimers, count }
}

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("The viewport says when the keyboard has gone")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const f = fake()
    let closed = 0
    const stop = watchKeyboard(f.win, f.doc, () => closed++)

    f.vv.height = 800 - KEYBOARD_MIN_PX - 200
    f.fire("vv:resize")
    check("a viewport shrunk by a keyboard says nothing yet", closed === 0)

    f.vv.height = 800
    f.fire("vv:resize")
    check("and growing back is the keyboard closing", closed === 1)

    f.fire("vv:resize")
    check("a resize with no keyboard before it is not a closing", closed === 1)

    f.vv.height = 800 - 40
    f.fire("vv:resize")
    f.vv.height = 800
    f.fire("vv:resize")
    check("a browser bar collapsing is not a keyboard", closed === 1)

    // A Capacitor shell that resizes the webview reports a plain resize.
    f.win.innerHeight = 500
    f.vv.height = 500
    f.fire("win:resize")
    f.win.innerHeight = 800
    f.vv.height = 800
    f.fire("win:resize")
    check("a webview that resizes for the keyboard counts as the viewport growing back", closed === 1, "the shell's own resize keeps innerHeight and the viewport equal, so it is the focus signal that carries it there")

    stop()
    check("stopping removes every listener", f.count() === 0)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("And so does focus leaving, once nothing has it")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const f = fake()
    let closed = 0
    const stop = watchKeyboard(f.win, f.doc, () => closed++)

    f.doc.activeElement = { tagName: "INPUT" }
    f.fire("doc:focusout")
    f.runTimers()
    check("moving to another field is not the keyboard closing", closed === 0)

    f.doc.activeElement = { tagName: "BODY" }
    f.fire("doc:focusout")
    check("a blur is waited on rather than believed at once", closed === 0)
    f.runTimers()
    check("and counts once nothing that takes a keyboard has focus", closed === 1)

    f.doc.activeElement = { tagName: "DIV", isContentEditable: true }
    f.fire("doc:focusout")
    f.runTimers()
    check("an editable region keeps the keyboard up", closed === 1)

    f.fire("doc:focusout")
    f.fire("doc:focusout")
    f.doc.activeElement = null
    f.runTimers()
    check("two blurs in a row settle once", closed === 2)

    stop()
    check("the pending settle is cancelled with the watcher", (() => { f.fire("doc:focusout"); f.runTimers(); return closed === 2 })())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("What takes a keyboard")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("an input does", takesKeyboard({ tagName: "input" }))
    check("a textarea does", takesKeyboard({ tagName: "TEXTAREA" }))
    check("a select does", takesKeyboard({ tagName: "SELECT" }))
    check("an editable region does", takesKeyboard({ tagName: "DIV", isContentEditable: true }))
    check("a button does not", !takesKeyboard({ tagName: "BUTTON" }))
    check("nothing does not", !takesKeyboard(null))
    check("the settle is short enough that nobody notices it", FOCUS_SETTLE_MS <= 200)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Both surfaces watch")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const root = process.cwd()
    const editor = readFileSync(join(root, "app/website-builder/editor/[installId]/page.tsx"), "utf8")
    const code = readFileSync(join(root, "app/website-builder/code/[installId]/page.tsx"), "utf8")
    check("the builder settles the canvas when the keyboard goes: document unlocked, window put back, nothing done to the scroller's overflow", /const soon = \(\) => requestAnimationFrame\(settleCanvas\)\s*return watchKeyboard\(window, document, \(\) => \{\s*soon\(\)/.test(editor))
    check("twice, so the second lands after the keyboard animation", /window\.setTimeout\(soon, 420\)/.test(editor))
    check("and what it calls scrolls the window back without touching the scroller", (() => {
      const fn = editor.slice(editor.indexOf("const settleCanvas"), editor.indexOf("const settleCanvas") + 700)
      return /if \(window\.scrollY !== 0\) window\.scrollTo\(0, 0\)/.test(fn) && !/reviveScroller/.test(fn)
    })())
    check("the code editor scrolls its own window back, which is the iframe's when framed", /watchKeyboard\(window, document, \(\) => \{\s*if \(window\.scrollY !== 0\) window\.scrollTo\(0, 0\)/.test(code))
    check("and re-creates the textarea's scrolling layer", /reviveScroller\(area, \(cb\) => window\.requestAnimationFrame\(cb\)\)/.test(code))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
