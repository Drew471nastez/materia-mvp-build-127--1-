/**
 * Round 44: the canvas scroll, the settings sidebar and the section switch on
 * a slow device. What scripts/check-editor-perf.mjs PART=scroll,smooth measured
 * and what was changed for it:
 *
 *   the canvas's and the sidebar's scrollbar thumbs are moved by the scroll
 *     itself (a scroll-driven animation), or by a transform: a new `top`
 *     every frame was a repaint, and every repaint layerized the editor
 *   a clear pane takes the pointer over the canvas, and over the sidebar's
 *     lists, while the wheel moves them (lib/website-builder/wheel-hold.ts),
 *     so hover does not restyle and repaint a frame, and a press during the
 *     hold reaches what is under it
 *   an endless animation in a section off screen is paused
 *     (on-screen-sections.ts holdLoops)
 *   a select setting reads its width from its ResizeObserver, not in a
 *     layout effect (choice-control.tsx: a layout of the editor per select)
 *
 * The hold is driven here with a small stand-in for the DOM: the wheel, the
 * canvas's scroll, a real mouse move, a press, its mousedown and its click.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createPickStore, shownSection } from "@/lib/website-builder/pick-store"
import { holdHoverWhileWheeling, WHEEL_HOLD_ATTRIBUTE, WHEEL_HOLD_REST_MS, WHEEL_LIST_HOLD_ATTRIBUTE, WHEEL_SHIELD_ATTRIBUTE } from "@/lib/website-builder/wheel-hold"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ── A stand-in DOM: elements with parents, attributes and events that capture and bubble ── */
class FakeEvent {
  type: string
  bubbles: boolean
  isTrusted: boolean
  target: FakeEl | null = null
  stopped = false
  defaultPrevented = false
  clientX: number
  clientY: number
  pointerType: string
  movementX: number
  movementY: number
  ctrlKey: boolean
  constructor(type: string, init: Record<string, unknown> = {}, trusted = false) {
    this.type = type
    this.bubbles = init.bubbles !== false
    this.isTrusted = trusted
    this.clientX = Number(init.clientX ?? 0)
    this.clientY = Number(init.clientY ?? 0)
    this.pointerType = String(init.pointerType ?? "mouse")
    this.movementX = Number(init.movementX ?? 0)
    this.movementY = Number(init.movementY ?? 0)
    this.ctrlKey = !!init.ctrlKey
  }
  stopImmediatePropagation() { this.stopped = true }
  preventDefault() { this.defaultPrevented = true }
}
type L = { fn: (e: FakeEvent) => void; capture: boolean }
class FakeTarget {
  ls = new Map<string, L[]>()
  addEventListener(type: string, fn: (e: FakeEvent) => void, o?: boolean | { capture?: boolean }) {
    const capture = typeof o === "boolean" ? o : !!o?.capture
    this.ls.set(type, [...(this.ls.get(type) ?? []), { fn, capture }])
  }
  removeEventListener(type: string, fn: (e: FakeEvent) => void, o?: boolean | { capture?: boolean }) {
    const capture = typeof o === "boolean" ? o : !!o?.capture
    this.ls.set(type, (this.ls.get(type) ?? []).filter((l) => !(l.fn === fn && l.capture === capture)))
  }
  fire(e: FakeEvent, capture: boolean) {
    for (const l of this.ls.get(e.type) ?? []) {
      if (e.stopped) return
      if (l.capture === capture) l.fn(e)
    }
  }
  count() { let n = 0; for (const v of this.ls.values()) n += v.length; return n }
}
const doc = new FakeTarget() as FakeTarget & Record<string, unknown>
const win = new FakeTarget() as FakeTarget & Record<string, unknown>
class FakeEl extends FakeTarget {
  parent: FakeEl | null
  attrs = new Map<string, string>()
  got: string[] = []
  isConnected = true
  ownerDocument = doc
  constructor(parent: FakeEl | null) { super(); this.parent = parent }
  setAttribute(k: string, v: string) { this.attrs.set(k, v) }
  /* Enough of a selector for the sidebar's: an attribute in brackets. */
  matches(sel: string) { const m = /^\[([\w-]+)\]$/.exec(sel); return !!m && this.attrs.has(m[1]) }
  removeAttribute(k: string) { this.attrs.delete(k) }
  hasAttribute(k: string) { return this.attrs.has(k) }
  contains(o: FakeEl | null) { for (let p = o; p; p = p.parent) if (p === this) return true; return false }
  dispatchEvent(e: FakeEvent) {
    e.target = this
    const path: FakeEl[] = []
    for (let p: FakeEl | null = this; p; p = p.parent) path.push(p)
    win.fire(e, true)
    if (!e.stopped) doc.fire(e, true)
    for (const el of [...path].reverse()) if (!e.stopped) el.fire(e, true)
    if (!e.stopped) this.got.push(`${e.type}${e.isTrusted ? "" : " (handed)"}`)
    for (const el of path) if (!e.stopped && (el === this || e.bubbles)) el.fire(e, false)
    return !e.defaultPrevented
  }
}
const scroller = new FakeEl(null)
const section = new FakeEl(scroller)
const card = new FakeEl(section)
/* The clear pane the hold lays over the page: the scroller's own last child. */
const pane = new FakeEl(scroller)
pane.setAttribute(WHEEL_SHIELD_ATTRIBUTE, "")
let under: FakeEl = card
win.setTimeout = (f: () => void, ms: number) => setTimeout(f, ms) as unknown as number
win.clearTimeout = (t: number) => clearTimeout(t as unknown as NodeJS.Timeout)
win.PointerEvent = class extends FakeEvent { constructor(t: string, i: Record<string, unknown>) { super(t, i, false) } }
win.MouseEvent = win.PointerEvent
doc.defaultView = win
doc.elementFromPoint = () => under
const trusted = (type: string, init: Record<string, unknown> = {}) => new FakeEvent(type, init, true)
const held = () => scroller.hasAttribute(WHEEL_HOLD_ATTRIBUTE)

async function hold() {
  console.log("\nThe canvas's hover is held while the wheel moves it, and only then")
  const listenersBefore = win.count() + doc.count() + scroller.count()
  const undo = holdHoverWhileWheeling(scroller as unknown as HTMLElement)
  scroller.dispatchEvent(trusted("scroll", { bubbles: false }))
  check("a scroll with no wheel (a finger, the editor's own scrollIntoView) holds nothing", !held())
  card.dispatchEvent(trusted("wheel"))
  check("a wheel alone holds nothing until the canvas moves", !held())
  scroller.dispatchEvent(trusted("scroll", { bubbles: false }))
  check("the canvas moved by the wheel: its content takes no pointer", held())
  section.dispatchEvent(trusted("scroll", { bubbles: false }))
  check("a section's own scroller is not the canvas", held())
  await sleep(WHEEL_HOLD_REST_MS + 60)
  check("it lets go once the gesture rests", !held())
  check("  before the hover box and the block strip ask what is under the pointer again (150ms after the scroll)", WHEEL_HOLD_REST_MS < 150 && /\}, 150\)/.test(read("components/website-builder/canvas-hover.tsx")) && /\}, 150\)/.test(read("components/website-builder/editor/canvas-block-insert.tsx")))

  card.dispatchEvent(trusted("wheel"))
  scroller.dispatchEvent(trusted("scroll", { bubbles: false }))
  scroller.dispatchEvent(trusted("pointermove", { pointerType: "mouse", movementX: 0, movementY: 0 }))
  check("the page moving under a still pointer keeps the hold", held())
  scroller.dispatchEvent(trusted("pointermove", { pointerType: "mouse", movementX: 3, movementY: 0 }))
  check("the mouse really moving lets go at once", !held())

  card.dispatchEvent(trusted("wheel", { ctrlKey: true }))
  await sleep(300)
  card.dispatchEvent(trusted("wheel", { ctrlKey: true }))
  scroller.dispatchEvent(trusted("scroll", { bubbles: false }))
  check("a pinch (a wheel with ctrl) is a zoom, not a scroll to hold for", !held())

  console.log("\nA press during the hold reaches what is under the pointer")
  card.dispatchEvent(trusted("wheel"))
  scroller.dispatchEvent(trusted("scroll", { bubbles: false }))
  card.got = []
  scroller.got = []
  pane.got = []
  under = card
  /* What the browser does while the pane takes the pointer: the press and its mousedown land on the pane, the release on the card, the click on what both share, the scroller. */
  pane.dispatchEvent(trusted("pointerdown", { clientX: 10, clientY: 10 }))
  check("the press lets go of the hold", !held())
  pane.dispatchEvent(trusted("mousedown", { clientX: 10, clientY: 10 }))
  card.dispatchEvent(trusted("pointerup"))
  card.dispatchEvent(trusted("mouseup"))
  scroller.dispatchEvent(trusted("click", { clientX: 10, clientY: 10 }))
  check("the card gets the press, the mousedown, the release and the click", JSON.stringify(card.got) === JSON.stringify(["pointerdown (handed)", "mousedown (handed)", "pointerup", "mouseup", "click (handed)"]), card.got)
  check("the pane and the scroller are not given the press they were never aimed at", scroller.got.length === 0 && pane.got.length === 0, { scroller: scroller.got, pane: pane.got })
  card.got = []
  scroller.dispatchEvent(trusted("click", { clientX: 10, clientY: 10 }))
  check("a later click on the scroller itself is its own", card.got.length === 0 && scroller.got.includes("click"), { card: card.got, scroller: scroller.got })
  card.got = []
  card.dispatchEvent(trusted("pointerdown"))
  card.dispatchEvent(trusted("click"))
  check("with no hold a press is never touched", JSON.stringify(card.got) === JSON.stringify(["pointerdown", "click"]), card.got)

  undo()
  check("undo takes every listener away", win.count() + doc.count() + scroller.count() === listenersBefore)

  console.log("\nThe sidebar's lists, by a selector, the same way")
  const panel = new FakeEl(null)
  const list = new FakeEl(panel)
  list.setAttribute("data-list", "")
  const row = new FakeEl(list)
  const other = new FakeEl(panel)
  const undoLists = holdHoverWhileWheeling("[data-list]", { attribute: WHEEL_LIST_HOLD_ATTRIBUTE, within: doc as unknown as Document })
  row.dispatchEvent(trusted("wheel"))
  other.dispatchEvent(trusted("scroll", { bubbles: false }))
  check("a scroller the selector does not match is not held", !other.hasAttribute(WHEEL_LIST_HOLD_ATTRIBUTE))
  list.dispatchEvent(trusted("scroll", { bubbles: false }))
  check("the wheeled list is held, under its own attribute", list.hasAttribute(WHEEL_LIST_HOLD_ATTRIBUTE) && !list.hasAttribute(WHEEL_HOLD_ATTRIBUTE))
  row.got = []
  under = row
  /* Its rows take no pointer: the press and its mousedown land on the list, the release on the row. */
  list.dispatchEvent(trusted("pointerdown", { clientX: 4, clientY: 4 }))
  list.dispatchEvent(trusted("mousedown", { clientX: 4, clientY: 4 }))
  row.dispatchEvent(trusted("pointerup"))
  row.dispatchEvent(trusted("mouseup"))
  list.dispatchEvent(trusted("click", { clientX: 4, clientY: 4 }))
  check("a press during the hold reaches the row under the pointer", !list.hasAttribute(WHEEL_LIST_HOLD_ATTRIBUTE) && JSON.stringify(row.got) === JSON.stringify(["pointerdown (handed)", "mousedown (handed)", "pointerup", "mouseup", "click (handed)"]), row.got)
  undoLists()
  check("and its undo takes every listener away", win.count() + doc.count() === listenersBefore - scroller.count())
}

function sources() {
  console.log("\nWired into the editor, and the thumb moves without a repaint")
  const bar = read("components/website-builder/canvas-scrollbar.tsx")
  check("the computer's canvas holds hover under the wheel", /holdHoverWhileWheeling\(el\)/.test(bar) && /letGo\(\)/.test(bar))
  const paint = bar.slice(bar.indexOf("const paint = () => {"), bar.indexOf("const paintRef"))
  check("the thumb is moved by a transform, never by top", /style\.transform/.test(paint) && !/style\.top\s*=/.test(paint), paint.slice(0, 200))
  check("the thumb is its own layer", /willChange: "transform, opacity"/.test(bar))
  const css = read("app/globals.css")
  check("every panel list wheeled is covered by its own ::after, under an attribute of its own", /\.wb-slim-scroll\[data-wb-list-wheeling\]:not\(\.flex\):not\(\.grid\)::after \{[^}]*position: sticky;[^}]*bottom: 0;[^}]*height: 100vh;[^}]*margin-top: -100vh;[^}]*pointer-events: auto;/.test(css))
  check("  no hold switches pointer-events on content itself (that restyled the whole page, or the whole list, each hold)", !/\[data-wb(-list)?-wheeling\][^{,]*> \*/.test(css))
  check("  no pane in the markup of a list: one rule covers them all", !/className="wb-list-shield"/.test(read("app/(storelib)/website-builder/editor/[installId]/page.tsx")))
  const rail = read("components/website-builder/editor/slim-scroll-rail.tsx")
  check("the sidebar's lists hold hover under the wheel, the section library's own list left alone", /holdHoverWhileWheeling\(`\$\{SELECTOR\}:not\(\[data-library-scroll\]\):not\(\[contenteditable\]\):not\(textarea\)`, \{ attribute: WHEEL_LIST_HOLD_ATTRIBUTE \}\)/.test(rail) && /letGo\(\)/.test(rail))
  check("the sidebar's thumb is moved by the list's own scroll where the browser can", /scroll-timeline/.test(rail) && /data-scroll-driven/.test(rail) && /@keyframes wb-slim-thumb/.test(css) && /animation-timeline: --wb-slim-scroll;/.test(css))
  check("the pane takes the pointer only while it holds", /\.wb-wheel-shield \{[^}]*position: sticky;[^}]*height: 100cqh;[^}]*margin-top: -100cqh;[^}]*pointer-events: none;/.test(css) && /#wb-preview-root\[data-wb-wheeling\] > \.wb-wheel-shield \{\s*pointer-events: auto;/.test(css))
  check("the page's own content is never switched (that restyled the whole page twice a gesture)", !/#wb-preview-root\[data-wb-wheeling\] > \*/.test(css))
  const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("the pane is the canvas scroller's last child, on a computer", /\{!isMobileView && <div aria-hidden data-wb-wheel-shield="" className="wb-wheel-shield" \/>\}\s*<\/div>\s*\{!isMobileView && <CanvasScrollbar targetId="wb-preview-root" \/>\}/.test(editor))
  const hold = read("lib/website-builder/wheel-hold.ts")
  check("the wheel and the scroll it listens to are passive", /"wheel", onWheel, \{ capture: true, passive: true \}/.test(hold) && /"scroll", onScroll, \{ capture: true, passive: true \}/.test(hold))
  const onScreen = read("lib/website-builder/on-screen-sections.ts")
  check("an endless animation of a section off screen is paused, and played when it comes back", /holdLoops\(e\.target, e\.isIntersecting\)/.test(onScreen) && /iterations === Infinity/.test(onScreen) && /a\.pause\(\)/.test(onScreen) && /a\.play\(\)/.test(onScreen))
  const choice = read("components/website-builder/editor/controls/choice-control.tsx")
  const effect = choice.slice(choice.indexOf("React.useLayoutEffect(() => {"), choice.indexOf("return shape"))
  check("a select reads its width from its observer, not in its layout effect", /entries\[entries\.length - 1\]\.contentRect\.width/.test(effect) && !/^\s*decide\(\)\s*$/m.test(effect) && /flushSync\(\(\) => setShape\(next\)\)/.test(effect))
  const probe = read("scripts/check-editor-perf.mjs")
  check("the probe measures the sidebar, a section switch and a push stream under a moving canvas", /async function smoothScenario/.test(probe) && /PART\.includes\("smooth"\)/.test(probe) && /window\.PROBE_RAIL=true/.test(probe))
  const page = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("a pick is not the editor's state: it is set in the pick store, and the tree opens in the panel's own transition", /pickStore\.set\(\{ id: sectionId, from: selectedPanelNow\.current \}\)\s*\n\s*startTransition\(\(\) => \{\s*\n\s*setSelectedPanel\(\{ type: "section", sectionId \}\)\s*\n\s*setSelectedBlockId\(blockId\)\s*\n\s*setTreeOpen\(/.test(page) && !/useState<\{ id: string; from: Panel \} \| null>/.test(page))
  check("  the list, the canvas and the toolbar read it where they draw it", (page.match(/<ShownSection store=\{pickStore\} panel=\{selectedPanel\} selected=\{selectedSectionId\}>\{\(shownSectionId\) =>/g) ?? []).length === 3)
  const tip = read("components/ui/tooltip.tsx")
  check("a tooltip inside a provider uses it, with its own delay still 0 unless it asks", /const shared = React\.useContext\(SharedProvider\)/.test(tip) && /if \(shared\) return <TooltipPrimitive\.Root data-slot="tooltip" delayDuration=\{delayDuration \?\? 0\} \{\.\.\.props\} \/>/.test(tip))
  check("  and the editor is one provider for all of its tooltips", /return \(\s*\n\s*\/\* One tooltip provider for every tooltip of the editor[^\n]*\n\s*<TooltipProvider>\s*\n\s*<div/.test(page))
  check("the toolbar's buttons draw again only when their label, state or handler changes", /const ToolbarButton = memo\(function ToolbarButton/.test(page) && /\(a, b\) => a\.label === b\.label && a\.disabled === b\.disabled && a\.onClick === b\.onClick\)/.test(page))
  check("this suite runs with the others", read("scripts/run-push-tests.mjs").includes('"tests/editor-smooth-r44.test.ts"'))
}

function picks() {
  console.log("\nA pick is said through its own store")
  const store = createPickStore<{ type: string }>()
  const pages = { type: "pages" }
  let told = 0
  const off = store.subscribe(() => { told++ })
  store.set({ id: "hero", from: pages })
  check("a pick tells who reads it", told === 1 && store.get()?.id === "hero")
  check("  shown at once while its panel is on the way", shownSection(store.get(), pages, null) === "hero")
  check("  and the panel is the truth once any panel change lands", shownSection(store.get(), { type: "section" }, "faq") === "faq")
  const same = store.get()
  store.set(same)
  check("  the same pick again tells nobody", told === 1)
  off()
  store.set(null)
  check("  a reader that left is not told", told === 1)
}

async function main() {
  picks()
  await hold()
  sources()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
void main()
