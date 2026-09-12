/**
 * ===========================================================================
 *  WHEN THE CANVAS DIES ON A PHONE, THE PHONE SAYS WHAT IT SAW
 * ===========================================================================
 * The freeze that is still reported does not reproduce in a headless browser,
 * so the device is asked at the moment the watchdog catches a dead drag. This
 * RUNS the report against a fake document and checks two things above all:
 * that it captures what decides whether a touch can scroll, and that it
 * carries no content. Then the two hardenings shipped with it: a clipped
 * ancestor scrolled by a script is put back, and the canvas is scrolled by
 * hand rather than by `scrollIntoView`.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  FREEZE_REPORT_GAP_MS,
  FREEZE_REPORT_PATH,
  describeFreeze,
  describeNode,
  sendFreezeReport,
  splitForLog,
  type NodeLike,
  type ReportDoc,
  type ReportWindow,
  type StyleLike,
} from "@/lib/website-builder/freeze-report"
import { dropOverscrollContain, flashRootTouchAction, rebuildScroller, resetClippedAncestors, resyncFixedLayers, scrollWithin } from "@/lib/website-builder/canvas-scroll"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

/* ── A fake page ───────────────────────────────────────────────────────── */

type FakeNode = NodeLike & { text: string; css: Partial<StyleLike>; rect: { top: number; left: number; width: number; height: number }; children: FakeNode[]; attrs: Record<string, string> }

function node(tag: string, opts: Partial<FakeNode> & { css?: Partial<StyleLike> } = {}): FakeNode {
  const n: FakeNode = {
    tagName: tag.toUpperCase(),
    id: opts.id ?? "",
    className: opts.className ?? "",
    parentElement: null,
    scrollTop: opts.scrollTop ?? 0,
    scrollLeft: opts.scrollLeft ?? 0,
    scrollHeight: opts.scrollHeight ?? 0,
    clientHeight: opts.clientHeight ?? 0,
    text: opts.text ?? "",
    css: opts.css ?? {},
    rect: opts.rect ?? { top: 0, left: 0, width: 0, height: 0 },
    children: [],
    attrs: opts.attrs ?? {},
    style: { cssText: (opts.style as { cssText?: string } | undefined)?.cssText ?? "" },
    getBoundingClientRect() { return this.rect },
    getAttribute(name: string) { return this.attrs[name] ?? null },
    contains(other: NodeLike | null) {
      let cur = other
      while (cur) { if (cur === this) return true; cur = cur.parentElement }
      return false
    },
  }
  return n
}
function add(parent: FakeNode, child: FakeNode) { child.parentElement = parent; parent.children.push(child); return child }
function all(n: FakeNode, out: FakeNode[] = []): FakeNode[] { out.push(n); for (const c of n.children) all(c, out); return out }

const base: StyleLike = { overflowX: "visible", overflowY: "visible", pointerEvents: "auto", touchAction: "auto", opacity: "1", visibility: "visible", position: "static", transform: "none", zIndex: "auto" }

function page() {
  const html = node("html", { className: "capacitor wb-fullscreen", css: { overflowY: "hidden" } })
  const body = add(html, node("body", { css: { overflowY: "hidden" } }))
  const app = add(body, node("div", { className: "wb-editor fixed", css: { position: "fixed" }, rect: { top: 0, left: 0, width: 390, height: 844 } }))
  const wrap = add(app, node("div", { className: "relative overflow-hidden", css: { overflowY: "hidden" }, scrollTop: 37, rect: { top: 60, left: 0, width: 390, height: 700 } }))
  const scroller = add(wrap, node("div", { id: "wb-preview-root", css: { overflowY: "auto", touchAction: "pan-y" }, scrollTop: 120, scrollHeight: 4000, clientHeight: 700, rect: { top: 60, left: 0, width: 390, height: 700 }, style: { cssText: "touch-action: pan-y;" } }))
  const sectionEl = add(scroller, node("div", { id: "wb-section-abc", rect: { top: 300, left: 0, width: 390, height: 900 } }))
  const heading = add(sectionEl, node("h2", { text: "What can I buy from the andrewullz collection?", rect: { top: 320, left: 20, width: 350, height: 40 } }))
  const scrim = add(body, node("div", { className: "fixed inset-0 bg-black/30", css: { position: "fixed", opacity: "0", pointerEvents: "auto", zIndex: "40" }, rect: { top: 0, left: 0, width: 390, height: 844 } }))
  const sheet = add(body, node("div", { className: "fixed sheet", css: { position: "fixed", zIndex: "50" }, rect: { top: 744, left: 0, width: 390, height: 100 }, attrs: { "data-mobile-bottom-sheet": "", "aria-modal": "true" } }))
  const input = add(sheet, node("input", { text: "Accordion FAQ" }))
  const nodes = () => all(html)
  const doc: ReportDoc = {
    documentElement: html,
    body,
    activeElement: input,
    elementFromPoint: () => heading,
    querySelectorAll: (sel: string) => {
      if (sel === "div, section, span") return nodes().filter((n) => ["DIV", "SECTION", "SPAN"].includes(n.tagName ?? ""))
      if (sel === "[data-mobile-bottom-sheet][aria-modal=true]") return [sheet]
      if (sel === "[data-mobile-bottom-sheet], [data-wb-sheet-overlay]") return [scrim, sheet]
      return []
    },
  }
  const win: ReportWindow = {
    innerWidth: 390,
    innerHeight: 844,
    scrollX: 0,
    scrollY: 52,
    visualViewport: { width: 390, height: 844, offsetTop: 0, offsetLeft: 0, pageTop: 52, scale: 1 },
    getComputedStyle: (el) => ({ ...base, ...(el as FakeNode).css }),
    navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15" },
  }
  return { doc, win, scroller, wrap, sectionEl, heading, scrim, sheet, input }
}

/* ── The report ────────────────────────────────────────────────────────── */

section("describeNode says what a node is and nothing of what it holds")
{
  const n = node("div", { id: "wb-section-abc", className: "relative w-full isolate group/section", text: "private words" })
  const d = describeNode(n)
  check("tag, id and the first two classes", d === "div#wb-section-abc.relative.w-full", d)
  check("no text content", !d.includes("private"))
  check("nothing is 'none'", describeNode(null) === "none")
}

section("The picture a frozen phone sends")
{
  const p = page()
  const r = describeFreeze(p.doc, p.win, p.scroller, "stuck-drag", { x: 200, y: 400, prevented: true }, {
    gesture: { moves: 9, cancelable: 9, prevented: 0, maxScrollDelta: 0, startPrevented: false, pointerMoves: 9, pointerCancels: 0 },
    probe: { scriptCanScroll: true },
    step: 1,
    selection: "Range:1",
  })
  check("the reason travels", r.reason === "stuck-drag")
  check("the rung travels", r.step === 1)
  check("the touchstart's own cancellation and the pointer cancels travel", r.gesture?.startPrevented === false && r.gesture?.pointerMoves === 9 && r.gesture?.pointerCancels === 0)
  check("a live selection travels", r.selection === "Range:1")
  check("the sheets and their overlays are listed where the compositor sees them", r.sheets.length === 2 && r.sheets[1].el.startsWith("div.fixed.sheet") && r.sheets[1].rect.top === 744 && r.sheets[0].op === "0")
  check("what the gesture did travels", r.gesture?.moves === 9 && r.gesture?.cancelable === 9 && r.gesture?.maxScrollDelta === 0)
  check("whether a script could still scroll travels", r.probe?.scriptCanScroll === true)
  check("the small fields come before the two chains", (() => {
    const keys = Object.keys(r)
    return keys.indexOf("focus") < keys.indexOf("scroller") && keys.indexOf("covers") < keys.indexOf("ancestors") && keys.indexOf("ancestors") < keys.indexOf("underTouch")
  })())
  const [core, chains] = splitForLog(r)
  check("split for the log: the core line has no chains and the chain line has both", !core.includes("\"ancestors\"") && !core.includes("\"underTouch\"") && chains.includes("\"ancestors\"") && chains.includes("\"underTouch\"") && core.includes("\"scroller\""))
  check("and the chain line still says which report it belongs to", JSON.parse(chains).reason === "stuck-drag")
  check("the window offset the keyboard leaves is in it", r.window.scrollY === 52 && r.viewport?.pageTop === 52)
  check("the scroller's own numbers are in it", r.scroller?.scrollTop === 120 && r.scroller?.scrollHeight === 4000 && r.scroller?.clientHeight === 700)
  check("the scroller's computed touch-action and overflow are in it", r.scroller?.style.ta === "pan-y" && r.scroller?.style.overflow === "visible/auto")
  check("its inline style is in it", r.scroller?.inline === "touch-action: pan-y;")
  check("every ancestor is listed with its scroll offset", r.ancestors.length === 4 && r.ancestors[0].el.startsWith("div.relative.overflow-hidden") && r.ancestors[0].scrollTop === 37)
  check("what was under the finger is listed, and whether it is inside the canvas", r.underTouch[0].el === "h2" && r.underTouch[0].inCanvas === true && r.underTouch.some((u) => u.el.startsWith("body") && !u.inCanvas))
  check("whether the move had been cancelled is in it", r.touch?.prevented === true)
  check("the invisible scrim that still takes pointer events is caught", r.covers.length === 1 && r.covers[0].startsWith("div.fixed.inset-0") && r.covers[0].includes("op=0"))
  check("the canvas itself is not reported as a cover", !r.covers.some((c) => c.includes("wb-preview-root")))
  check("the sheet holding aria-modal is listed as a layer", r.layers.some((l) => l.includes("aria-modal=true") && l.endsWith("x1")))
  check("what has focus is named by tag, not by value", r.focus === "input")
  check("body and html state are in it", r.body.overflow === "visible/hidden" && r.html.classes.includes("wb-fullscreen"))
  check("the user agent is in it, cut short", r.ua.startsWith("Mozilla/5.0 (iPhone") && r.ua.length <= 120)
  const json = JSON.stringify(r)
  check("no text a person typed or could read is in the report", !json.includes("andrewullz") && !json.includes("Accordion FAQ") && !json.includes("What can I buy"))
  check("small enough for a log line", json.length < 4000, String(json.length))
}

section("Without a touch and without a scroller it still reports")
{
  const p = page()
  const r = describeFreeze(p.doc, p.win, null, "keyboard", null)
  check("no scroller, no touch, no crash", r.scroller === null && r.touch === null && r.underTouch.length === 0 && r.ancestors.length === 0 && r.gesture === null && r.probe === null && r.selection === null)
}

section("One picture per freeze")
{
  const sent: string[] = []
  const post = (path: string, body: string) => sent.push(`${path} ${body.length}`)
  const p = page()
  const r = describeFreeze(p.doc, p.win, p.scroller, "stuck-drag", null)
  let last = sendFreezeReport(post, r, 10_000, 0)
  check("the first one goes, to the right place", sent.length === 1 && sent[0].startsWith(FREEZE_REPORT_PATH) && last === 10_000)
  last = sendFreezeReport(post, r, 10_000 + FREEZE_REPORT_GAP_MS - 1, last)
  check("another drag of the same frozen canvas does not send again", sent.length === 1 && last === 10_000)
  last = sendFreezeReport(post, r, 10_000 + FREEZE_REPORT_GAP_MS, last)
  check("after the gap it does", sent.length === 2 && last === 10_000 + FREEZE_REPORT_GAP_MS)
}

/* ── The two hardenings ────────────────────────────────────────────────── */

section("A clipped ancestor that a script scrolled is put back")
{
  const p = page()
  const overflowOf = (n: unknown) => { const s = p.win.getComputedStyle(n as NodeLike); return { overflowX: s.overflowX, overflowY: s.overflowY } }
  const reset = resetClippedAncestors(p.scroller as never, overflowOf)
  check("the overflow-hidden wrapper at 37px goes to zero", p.wrap.scrollTop === 0 && reset.length === 1 && reset[0].includes("@37,0"), reset.join())
  check("the scroller itself is not touched", p.scroller.scrollTop === 120)
  const again = resetClippedAncestors(p.scroller as never, overflowOf)
  check("nothing to do the second time", again.length === 0)
}
{
  const outer = node("div", { css: { overflowY: "auto" }, scrollTop: 300 })
  const inner = add(outer, node("div", { css: { overflowX: "hidden", overflowY: "hidden" }, scrollLeft: 12 }))
  const leaf = add(inner, node("div"))
  const overflowOf = (n: unknown) => { const c = (n as FakeNode).css; return { overflowX: c.overflowX ?? "visible", overflowY: c.overflowY ?? "visible" } }
  const reset = resetClippedAncestors(leaf as never, overflowOf)
  check("a real scroller keeps its position", outer.scrollTop === 300)
  check("a clipped ancestor's horizontal offset goes too", inner.scrollLeft === 0 && reset.length === 1)
}

section("When reviving is not enough, the scroller is rebuilt")
{
  const writes: string[] = []
  const frames: Array<() => void> = []
  const el = {
    scrollTop: 724, scrollHeight: 3042, clientHeight: 658,
    get offsetHeight() { writes.push("layout"); return 658 },
    style: {
      overflowY: "auto",
      _display: "",
      get display() { return this._display },
      set display(v: string) { this._display = v; writes.push(`display=${v || "(unset)"}`) },
      removeProperty() {},
      setProperty() {},
    },
  }
  rebuildScroller(el, (cb) => frames.push(cb))
  check("the element is hidden, laid out, shown, laid out: a new box", writes.join(" ") === "display=none layout display=(unset) layout", writes.join(" "))
  check("and the scroll position is put back at once", el.scrollTop === 724)
  check("it is not left hidden", el.style.display === "")
  frames.forEach((f) => f())
  check("the next frame keeps it where it was", el.scrollTop === 724 && el.style.display === "")
}

section("The two rungs that take something away")
{
  const writes: string[] = []
  const layer = (name: string) => ({ style: { _d: "", get display() { return this._d }, set display(v: string) { this._d = v; writes.push(`${name}:${v || "(unset)"}`) } }, get offsetHeight() { writes.push(`${name}:layout`); return 10 } })
  const n = resyncFixedLayers([layer("sheet"), layer("overlay")])
  check("every fixed layer is hidden, laid out, shown and laid out again", n === 2 && writes.join(" ") === "sheet:none sheet:layout sheet:(unset) sheet:layout overlay:none overlay:layout overlay:(unset) overlay:layout", writes.join(" "))
  const props: Record<string, string | null> = { "overscroll-behavior": "contain" }
  dropOverscrollContain({ style: { setProperty: (k, v) => { props[k] = v }, removeProperty: (k) => { props[k] = null } } })
  check("overscroll-behavior: contain is taken off the canvas", props["overscroll-behavior"] === null && props["overscroll-behavior-y"] === "auto")
  const rootWrites: string[] = []
  const frames: Array<() => void> = []
  const root = (name: string) => ({ style: { setProperty: (k: string, v: string) => rootWrites.push(`${name}:${k}=${v}`), removeProperty: (k: string) => rootWrites.push(`${name}:-${k}`) }, get offsetHeight() { rootWrites.push(`${name}:layout`); return 1 } })
  flashRootTouchAction([root("html"), root("body")], (cb) => frames.push(cb))
  check("touch-action: none goes on both roots and is laid out before the frame", rootWrites.join(" ") === "html:touch-action=none body:touch-action=none html:layout body:layout", rootWrites.join(" "))
  frames.forEach((f) => f())
  check("and comes off again on the next frame", rootWrites.slice(-2).join(" ") === "html:-touch-action body:-touch-action")
}

section("The canvas is scrolled by hand, and nothing above it")
{
  const calls: Array<{ top: number; behavior: string }> = []
  const scroller = { scrollTop: 120, getBoundingClientRect: () => ({ top: 60 }), scrollTo: (o: { top: number; behavior: "smooth" | "auto" }) => { calls.push(o); scroller.scrollTop = o.top } }
  const target = { getBoundingClientRect: () => ({ top: 300 }) }
  const top = scrollWithin(scroller, target)
  check("the target's offset inside the scroller is what is scrolled to", top === 360 && calls[0]?.top === 360 && calls[0]?.behavior === "smooth", JSON.stringify(calls))
  const above = { getBoundingClientRect: () => ({ top: -500 }) }
  check("never below zero", scrollWithin(scroller, above, "auto") === 0)
  const plain = { scrollTop: 0, getBoundingClientRect: () => ({ top: 0 }) }
  scrollWithin(plain, { getBoundingClientRect: () => ({ top: 42 }) })
  check("a scroller without scrollTo is assigned directly", plain.scrollTop === 42)
}

/* ── Wired where it matters ────────────────────────────────────────────── */

section("The editor")
{
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const code = editor.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  check("no longer calls scrollIntoView anywhere", !code.includes("scrollIntoView("))
  check("scrolls the canvas to a section with scrollWithin", code.includes("scrollWithin(scroller, el)"))
  check("puts clipped ancestors back when it revives", code.includes("resetClippedAncestors(el,"))
  check("photographs the freeze before it revives", (() => {
    const at = code.indexOf("describeFreeze(document, window, el, reason,")
    const revive = code.indexOf("reviveCanvas()", at)
    return at > 0 && revive > at
  })())
  check("reads whether the move was cancelled from a passive window listener", code.includes("lastTouch.current.prevented = e.defaultPrevented") && code.includes('window.addEventListener("touchmove", onMove, { passive: true })'))
  check("a report that fails cannot stop the revive", /try \{[\s\S]*?describeFreeze[\s\S]*?\} catch \{[\s\S]*?\}\s*reviveCanvas\(\)/.test(code))
  check("four rungs: revive, rebuild everything, remount, reload", (() => {
    const two = code.indexOf("if (step >= 2) {")
    const three = code.indexOf("if (step === 3) {")
    const four = code.indexOf("if (step >= 4) {")
    const bundle = code.slice(two, three)
    return two > 0 && three > two && four > three
      && bundle.includes("rebuildScroller(el,") && bundle.includes('resyncFixedLayers(document.querySelectorAll<HTMLElement>("[data-mobile-bottom-sheet], [data-wb-sheet-overlay]"))') && bundle.includes("dropOverscrollContain(el)") && bundle.includes("flashRootTouchAction([document.documentElement, document.body],") && bundle.includes("window.getSelection()?.removeAllRanges()")
      && code.slice(three, four).includes("setCanvasEpoch((n) => n + 1)")
      && code.slice(four).includes("window.location.reload()")
  })())
  check("the reload saves the draft first when there is one, and reloads even if the save fails", code.includes("if (isDirtyRef.current) void saveDraftRef.current({ quiet: true }).then(go, go)") && code.includes("else go()"))
  check("only a trusted touch can reach the reload: a probe's synthetic drags cannot reload the page", code.includes("if (step >= 4 && lastTouch.current.trusted) {") && code.includes("trusted: e.isTrusted"))
  check("a drag on a scroller nested inside the canvas is not a freeze and does not climb", code.includes("if (lastTouch.current.nested) return") && code.includes("nested: nestedScrollerUnder(e.target)") && code.includes("node.scrollHeight > node.clientHeight + 1) return true"))
  check("the touchstart's cancellation and pointer cancels are counted on the window", code.includes('window.addEventListener("touchstart", onStartDone, { passive: true })') && code.includes('window.addEventListener("pointercancel", onPointerCancel, { passive: true })') && code.includes("gesture.current.startPrevented = e.defaultPrevented"))
  check("dead drags within the window climb; outside it they start over, and the window fits a person dragging and waiting", code.includes("now - t < STUCK_ESCALATE_MS") && /const STUCK_ESCALATE_MS = (\d[\d_]*)/.test(code) && Number(/const STUCK_ESCALATE_MS = (\d[\d_]*)/.exec(code)![1].replace(/_/g, "")) >= 30_000)
  check("each rung is reported under its own name", ["stuck-drag", "stuck-after-revive", "stuck-after-rebuild", "stuck-after-remount"].every((r) => code.includes(`"${r}"`)) && code.includes("STUCK_REASONS[step - 1]"))
  check("the rung and the selection travel with the report", code.includes("probe: { scriptCanScroll }, step, selection }"))
  const sheet = read("components/website-builder/mobile-editor-sheet.tsx")
  check("the sheet's overlay is marked so it can be resynced and reported", sheet.includes('data-wb-sheet-overlay=""'))
  check("the report says whether a script could still scroll", code.includes("probe: { scriptCanScroll }"))
  check("a new key is a new canvas element", code.includes("key={canvasEpoch}"))
  check("the watchdog re-arms on the new element", /\}, \[isMobileView, reviveCanvas, canvasEpoch\]\)/.test(code))
  check("and the remounted canvas is put back where the finger was", /useLayoutEffect\(\(\) => \{[\s\S]*?restoreTopRef\.current[\s\S]*?el\.scrollTop = top[\s\S]*?\}, \[canvasEpoch\]\)/.test(code))
}

section("The endpoint")
{
  const route = read("app/api/website-builder/freeze-report/route.ts")
  check("signed-in users only", route.includes("supabase.auth.getUser()") && route.includes("status: 401"))
  check("capped in size", route.includes("FREEZE_REPORT_MAX_BYTES") && route.includes("status: 413"))
  check("goes to the log as two lines under one tag, small fields first", route.includes("splitForLog(report as FreezeReport)") && route.includes("console.warn(`[wb-freeze] ${core}`)") && route.includes("console.warn(`[wb-freeze-chains] ${chains}`)"))
  check("stores nothing", !route.includes(".from(") && !route.includes("insert("))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) { console.log(failures.map((f) => `  - ${f}`).join("\n")); process.exit(1) }
