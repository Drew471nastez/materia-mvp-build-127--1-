/**
 * ===========================================================================
 *  ROUND 49: A DIALOG OPENS IN ONE SHORT TASK
 * ===========================================================================
 * Opening any dialog or modal in /app was one long main-thread task, 130 to
 * 160ms on a computer (the analytics engineer's trace), several whole-document
 * style recalculations. scripts/check-dialogs-r49.mjs measures it in Chromium
 * and says why (INVAL=1, EXPERIMENT=1, VARIANTS=1). Each cause and its fix:
 *
 *   1. MODAL STATE   the shell's `html:has([role=dialog][aria-modal=true])`
 *                    rules (the pill, the cookie card) re-asked over the whole
 *                    document whenever any `role` or `aria-hidden` changed.
 *                    Now a count kept by lib/ui/modal-open.ts on <html>
 *                    (data-modal-open="<n>", data-modal-any), held by the
 *                    pill and the cookie card while they are mounted.
 *   2. PAUSE RULES   `[data-ask-card][aria-hidden="true"] *` and
 *                    `[data-block-picker-layer][data-state="closed"] *`
 *                    restyled everything under any element whose aria-hidden
 *                    or data-state changed; keyed on their own attributes now.
 *   3. SCROLL LOCK   Radix's lock writes --removed-body-scroll-bar-size on
 *                    <body>; registered as not inherited, it restyles <body>.
 *   4. CARD PRESS    a non-subject :has() in the touch screen card rule made
 *                    every element put in or taken out restyle the document
 *                    on a phone; the inside of a pressed card reads a style
 *                    query instead.
 *   5. FIRST FOCUS   Radix focused the first field in the press's own task,
 *                    forcing the whole-document pass its body pointer-events
 *                    set off; on the next frame now where no keyboard depends
 *                    on it (lib/ui/dialog-focus.ts).
 *
 *   npx tsx tests/dialogs-r49.test.ts
 */
import { readFileSync } from "node:fs"
import {
  MODAL_ANY_SELECTOR,
  MODAL_OPEN_SELECTOR,
  WATCHED_ATTRIBUTES,
  batchMatters,
  countModals,
  holdModalWatch,
  syncModalOpen,
  writeModalCounts,
} from "../lib/ui/modal-open"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "")

/* ── A document small enough to hold in the head ─────────────────────────────
   Elements with attributes and children, and a matcher for the selectors
   lib/ui/modal-open.ts uses: attribute tests and :not() of a list of them. */
type Test = (el: El) => boolean
function compound(src: string): Test {
  const tests: Test[] = []
  let i = 0
  while (i < src.length) {
    if (src[i] === "[") {
      const end = src.indexOf("]", i)
      const m = src.slice(i + 1, end).match(/^([\w-]+)(?:="([^"]*)")?$/)
      if (!m) throw new Error(`selector ${src}`)
      const [, name, value] = m
      tests.push((el) => el.attrs.has(name) && (value === undefined || el.attrs.get(name) === value))
      i = end + 1
    } else if (src.startsWith(":not(", i)) {
      let depth = 0
      let end = i + 4
      for (; end < src.length; end++) {
        if (src[end] === "(") depth++
        if (src[end] === ")" && --depth === 0) break
      }
      const inner = selector(src.slice(i + 5, end))
      tests.push((el) => !inner(el))
      i = end + 1
    } else if (src[i] === " ") i++
    else throw new Error(`selector ${src} at ${i}`)
  }
  return (el) => tests.every((t) => t(el))
}
function selector(src: string): Test {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "(" || src[i] === "[") depth++
    if (src[i] === ")" || src[i] === "]") depth--
    if (src[i] === "," && depth === 0) {
      parts.push(src.slice(start, i))
      start = i + 1
    }
  }
  parts.push(src.slice(start))
  const any = parts.map((p) => compound(p.trim()))
  return (el) => any.some((t) => t(el))
}
class El {
  nodeType = 1
  attrs = new Map<string, string>()
  children: El[] = []
  parent: El | null = null
  constructor(attrs: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v)
  }
  getAttribute(n: string) { return this.attrs.has(n) ? this.attrs.get(n)! : null }
  hasAttribute(n: string) { return this.attrs.has(n) }
  setAttribute(n: string, v: string) { this.attrs.set(n, v); doc.emit({ type: "attributes", target: this, addedNodes: [], removedNodes: [] }) }
  removeAttribute(n: string) { this.attrs.delete(n); doc.emit({ type: "attributes", target: this, addedNodes: [], removedNodes: [] }) }
  matches(sel: string) { return selector(sel)(this) }
  all(): El[] { return this.children.flatMap((c) => [c, ...c.all()]) }
  querySelectorAll(sel: string) { const t = selector(sel); return this.all().filter(t) }
  querySelector(sel: string) { return this.querySelectorAll(sel)[0] ?? null }
  append(...els: El[]) { for (const e of els) { e.parent = this; this.children.push(e) } doc.emit({ type: "childList", target: this, addedNodes: els, removedNodes: [] }); return this }
  remove() { const p = this.parent; if (!p) return; p.children = p.children.filter((c) => c !== this); this.parent = null; doc.emit({ type: "childList", target: p, addedNodes: [], removedNodes: [this] }) }
}
interface Rec { type: string; target: El; addedNodes: El[]; removedNodes: El[] }
const observers: { cb: (r: Rec[]) => void; on: boolean; filter?: string[] }[] = []
const doc = {
  documentElement: null as unknown as El,
  body: null as unknown as El,
  defaultView: { addEventListener() {}, removeEventListener() {} },
  querySelectorAll(sel: string) { return this.documentElement.querySelectorAll(sel) },
  /* A MutationObserver hands over a task's records together; here each change is its own batch. */
  emit(r: Rec) {
    if (r.type === "attributes" && r.target === this.documentElement) return
    for (const o of observers) if (o.on) o.cb([r])
  },
}
;(globalThis as unknown as { MutationObserver: unknown }).MutationObserver = class {
  o: (typeof observers)[number]
  constructor(cb: (r: Rec[]) => void) { this.o = { cb, on: false }; observers.push(this.o) }
  observe(_t: unknown, opts: { attributeFilter?: string[] }) { this.o.on = true; this.o.filter = opts.attributeFilter }
  disconnect() { this.o.on = false }
}
const html = new El({ class: "light" })
doc.documentElement = html
doc.body = new El()
html.children.push(doc.body)
doc.body.parent = html
const D = doc as unknown as Document
const said = () => ({ open: html.getAttribute("data-modal-open"), any: html.hasAttribute("data-modal-any") })
const dialog = (extra: Record<string, string> = {}) => new El({ role: "dialog", "aria-modal": "true", ...extra })

console.log("\n1. THE COUNT: WHAT THE :has() RULES MATCHED, SAID ON <html>")
{
  check("the selectors are the old rules' arguments, word for word",
    MODAL_OPEN_SELECTOR === '[role="dialog"][aria-modal="true"]:not([data-mobile-menu], [aria-hidden="true"], [data-sheet-root])'
      && MODAL_ANY_SELECTOR === '[role="dialog"][aria-modal="true"]:not([data-sheet-root])')
  check("the observer watches every attribute the selectors read, and only those",
    [...WATCHED_ATTRIBUTES].sort().join() === ["aria-hidden", "aria-modal", "data-mobile-menu", "data-sheet-root", "role"].join())

  const page = new El({ "data-page": "" })
  doc.body.append(page)
  const menu = dialog({ "data-mobile-menu": "closed" })
  page.append(menu)
  const release = holdModalWatch(D)
  check("held: the phone menu, kept mounted, is no open modal for the pill, but the cookie card's rule counted it", said().open === null && said().any === true, said())

  const outer = dialog()
  doc.body.append(outer)
  check("a modal opens: data-modal-open=1", said().open === "1", said())
  const inner = dialog()
  outer.append(inner)
  check("one over it: 2", said().open === "2", said())
  inner.remove()
  check("the top one closes: back to 1, not cleared", said().open === "1", said())
  const sheet = dialog({ "data-sheet-root": "" })
  doc.body.append(sheet)
  check("the shared sheet is not counted (it says so itself, data-app-sheet-up)", said().open === "1", said())
  sheet.remove()
  outer.setAttribute("aria-hidden", "true")
  check("a modal kept in the page hidden is not open", said().open === null, said())
  outer.removeAttribute("aria-hidden")
  check("shown again: 1", said().open === "1", said())
  outer.setAttribute("aria-modal", "false")
  check("no longer a modal: cleared", said().open === null, said())
  outer.setAttribute("aria-modal", "true")

  /* A route change: the page goes, with a dialog open in it. */
  const inPage = dialog()
  page.append(inPage)
  check("a dialog inside the page: 2", said().open === "2", said())
  page.remove()
  outer.remove()
  check("the page unmounts with its dialog open, and the last one closes: nothing said", said().open === null && said().any === false, said())

  const second = holdModalWatch(D)
  release()
  doc.body.append(outer)
  check("two holders: the first letting go keeps the watch", said().open === "1", said())
  release()
  check("a release is counted once", said().open === "1", said())
  second()
  check("the last holder letting go clears both attributes", said().open === null && said().any === false, said())
  outer.remove()
  doc.body.append(outer)
  check("and stops watching", said().open === null, said())
  outer.remove()
  const third = holdModalWatch(D)
  doc.body.append(outer)
  check("held again later, it counts again", said().open === "1", said())
  third()
  outer.remove()
}

console.log("\n2. CHEAP TO WATCH")
{
  const div = new El()
  check("a batch that only adds an element with no aria-modal in it is not looked at", !batchMatters([{ type: "childList", addedNodes: [div], removedNodes: [] }], 0))
  check("nor a removal while nothing is counted", !batchMatters([{ type: "childList", addedNodes: [], removedNodes: [div] }], 0))
  check("a removal while a dialog is counted is", batchMatters([{ type: "childList", addedNodes: [], removedNodes: [div] }], 1))
  const holder = new El()
  holder.children.push(dialog())
  check("an element holding a modal coming in is", batchMatters([{ type: "childList", addedNodes: [holder], removedNodes: [] }], 0))
  check("text coming in is not", !batchMatters([{ type: "childList", addedNodes: [{ nodeType: 3 }], removedNodes: [] }], 0))
  check("any watched attribute's change is", batchMatters([{ type: "attributes", addedNodes: [], removedNodes: [] }], 0))
  const writes: string[] = []
  const target = { getAttribute: (n: string) => (n === "data-modal-open" ? "1" : ""), setAttribute: (n: string) => writes.push(`set ${n}`), removeAttribute: (n: string) => writes.push(`remove ${n}`) }
  writeModalCounts(target, { open: 1, any: 1 })
  check("<html> is written only when a value changes", writes.length === 0, writes)
  check("countModals counts the two sets", JSON.stringify(countModals({ querySelectorAll: () => [{ matches: () => true }, { matches: () => false }] })) === '{"open":1,"any":2}')
  check("syncModalOpen is exported for a probe", typeof syncModalOpen === "function")
}

console.log("\n3. NO :has() IN THE GLOBAL CSS ASKS ABOUT A DIALOG, A MODAL OR A SHEET")
const css = code("app/globals.css")
{
  const sheets = ["app/globals.css", "app/theme-dark.css", "app/website-settings-light.css", "app/hover-variant.css"]
  const offenders: string[] = []
  for (const f of sheets) {
    const text = code(f)
    for (const m of text.matchAll(/:has\(((?:[^()]|\([^()]*\))*)\)/g)) {
      /* What a dialog, a modal or a sheet changes when it opens: its role, aria-modal, the aria-hidden Radix spreads,
         data-state, the sheet's own marks. (A section's `:has(:modal)` in a published site asks about a native <dialog>
         inside that section only, and `[data-sheet-scroll]:has(...)` about a sheet's own scroller's children.) */
      if (/role=|aria-modal|aria-hidden|data-state|dialog|data-app-sheet|data-sheet-root|drawer/i.test(m[1])) offenders.push(`${f}: :has(${m[1]})`)
    }
  }
  check("none", offenders.length === 0, offenders)
  check("the pill steps under an open modal by data-modal-open",
    /html\[data-app-sheet-up\] \[data-app-nav-pill\],\s*html\[data-modal-open\] \[data-app-nav-pill\],\s*body\[data-scroll-locked\] \[data-app-nav-pill\] \{\s*z-index: 39;/.test(css))
  check("over a layer that keeps it, to 53", /html\[data-modal-open\]:has\(\[data-page-layer="pill"\]\) \[data-app-nav-pill\],[^{]*\{\s*z-index: 53;/.test(css))
  check("and gives up its taps", /html\[data-modal-open\] \[data-app-nav-pill\] \.pointer-events-auto,\s*body\[data-scroll-locked\] \[data-app-nav-pill\] \.pointer-events-auto \{\s*pointer-events: none !important;/.test(css))
  check("the cookie card steps aside by data-modal-any",
    /html\[data-app-sheet-up="open"\] \[data-cookie-banner\],\s*body\[data-scroll-locked\] \[data-cookie-banner\],\s*html\[data-modal-any\] \[data-cookie-banner\] \{\s*visibility: hidden;/.test(css))
  check("the pill and the cookie card hold the watch while mounted",
    /useModalOpenWatch\(\)/.test(code("components/app/sidebar-mobile-nav.tsx"))
      && /useModalOpenWatch\(ready && bannerOpen && !quiet && !prefsOpen && !isNativeApp\(\)\)/.test(code("components/cookie-consent-banner.tsx")))
}

console.log("\n4. NO RULE RESTYLES A WHOLE SUBTREE WHEN aria-hidden OR data-state CHANGES")
{
  const bad = [...css.matchAll(/[^{}\n]*\[(?:aria-hidden|data-state)[^\]]*\][^{}\n,]*\s\*[^{}\n]*/g)].map((m) => m[0].trim())
  check("no `[aria-hidden…] *` or `[data-state…] *`", bad.length === 0, bad)
  check("the closed block picker and Ask card say so in attributes of their own",
    /\[data-block-picker-layer="closed"\] \*,\s*\[data-ask-card="closed"\] \*,/.test(css)
      && /data-block-picker-layer=\{open \? "open" : "closed"\}/.test(read("components/website-builder/editor/block-picker.tsx"))
      && /data-ask-card=\{cardOpen \? "open" : "closed"\}/.test(read("components/website-builder/theme-chat.tsx")))
  check("Radix's scroll lock property is not inherited", /@property --removed-body-scroll-bar-size \{\s*syntax: "\*";\s*inherits: false;\s*\}/.test(css))
}

console.log("\n5. A PRESSED CARD WITH A PICTURE, WITHOUT A :has() BEFORE A COMBINATOR")
{
  const nonSubject = [...css.matchAll(/[^{}\n]*:has\((?:[^()]|\([^()]*\))*\)[^{},\n]*\s[^{}\n]*:active[^{}\n]*/g)].map((m) => m[0].trim())
  check("no `X:has(...) Y:active`", nonSubject.length === 0, nonSubject)
  check("the card itself still keeps full strength", /@media \(hover: none\), \(pointer: coarse\) \{\s*:is\(a, button, \[role="button"\], \[tabindex="0"\]\):has\(img, picture, video, canvas\):active,/.test(css))
  check("and what is inside it reads the press by a style query",
    /:has\(img, picture, video, canvas\):active \{\s*--sl-card-press: 1;\s*\}\s*@container style\(--sl-card-press: 1\) \{\s*:is\(a, button, \[role="button"\], \[tabindex\], div, span[^{]*\):active \{\s*opacity: 1 !important;\s*filter: none !important;/.test(css))
}

console.log("\n6. THE FIRST FOCUS ON THE NEXT FRAME, WHERE NO KEYBOARD HANGS ON IT")
{
  const focus = code("lib/ui/dialog-focus.ts")
  check("without a finger pointer, always; with one, only when the caller does not decide and nothing to type comes first",
    /if \(noTouch\(\)\) return true\s*return !callerDecides && !opensKeyboard\(firstByTree\(panel\)\)/.test(focus)
      && /!window\.matchMedia\("\(any-pointer: coarse\)"\)\.matches && !document\.documentElement\.classList\.contains\("capacitor"\)/.test(focus))
  check("the caller's handler still runs, on a cancelable event on the panel, and Radix's choice follows when it does not cancel",
    /own\?\.\(again\)\s*if \(again\.defaultPrevented \|\| node\.contains\(document\.activeElement\)\) return\s*focusFirstIn\(node\)/.test(focus)
      && /Object\.defineProperty\(again, "currentTarget", \{ value: node \}\)/.test(focus))
  check("Radix's rules: no links, an input's text selected, else the panel", /el\.tagName === "A" \|\| isHiddenIn/.test(focus) && /el\.select\(\)/.test(focus) && /panel\.focus\(\{ preventScroll: true \}\)/.test(focus))
  check("the shared Dialog and Sheet use it", /onOpenAutoFocus=\{openAutoFocus\}/.test(code("components/ui/dialog.tsx")) && /onOpenAutoFocus=\{openAutoFocus\}/.test(code("components/ui/sheet.tsx")))
  check("after the caller's own props, so it wraps them", /\{\.\.\.props\}\s*onOpenAutoFocus=\{openAutoFocus\}/.test(code("components/ui/dialog.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
process.exit(0)
