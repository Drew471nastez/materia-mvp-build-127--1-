/**
 * ===========================================================================
 *  ROUND 34: A SIDEBAR CONTROL, AND THE CANVAS THAT FOLLOWS IT
 * ===========================================================================
 * The owner: "when adjusting things in the sidebar, when I adjust sliders or
 * change colors, should feel smooth clean ... real time". Measured on a 44
 * section page with pictures by scripts/check-editor-live-edit.mjs, at 1x
 * and 4x CPU. What each fix promises is held here; what it does to the
 * frames is the probe's.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DRAW_WAIT_MS, oneDrawInFlight } from "@/lib/website-builder/live-settings"
import { ON_SCREEN_MARGIN } from "@/lib/website-builder/on-screen-sections"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const editor = read("app/website-builder/editor/[installId]/page.tsx")
const live = read("lib/website-builder/live-settings.ts")
const onScreen = read("lib/website-builder/on-screen-sections.ts")
const themePage = read("components/website-builder/theme/ThemePage.tsx")
const dialog = read("components/ui/dialog.tsx")
const css = read("app/globals.css")
const echo = read("components/website-builder/echo-field.ts")
const linkPicker = read("components/website-builder/link-picker.tsx")
const probe = read("scripts/check-editor-live-edit.mjs")
const chip = read("components/website-builder/editor/color-chip.tsx")

console.log("\nONE DRAW OF A THEME VALUE IN FLIGHT, AND THE NEWEST NEXT")
{
  /* A fake clock and timers, so the order is the test's. */
  let t = 0
  const timers: { at: number; run: () => void; id: number }[] = []
  let ids = 0
  const opts = {
    now: () => t,
    later: (run: () => void, ms: number) => { const id = ++ids; timers.push({ at: t + ms, run, id }); return id },
    cancel: (h: unknown) => { const i = timers.findIndex((x) => x.id === h); if (i >= 0) timers.splice(i, 1) },
  }
  const advance = (ms: number) => {
    t += ms
    for (const x of timers.filter((x) => x.at <= t)) { timers.splice(timers.indexOf(x), 1); x.run() }
  }
  const started: string[] = []
  const d = oneDrawInFlight<string>((v) => { started.push(v); return true }, opts)
  d.offer("a")
  check("the first value is drawn at once", started.join() === "a")
  d.offer("b")
  d.offer("c")
  d.offer("d")
  check("values that arrive while it is drawn wait, and are not drawn yet", started.join() === "a")
  advance(12)
  d.drawn("a")
  check("once it is drawn, the next waits as long as the draw took, so the frames keep half the thread", started.join() === "a", started)
  d.offer("d2")
  d.drawn("a")
  advance(11)
  check("and a value offered in that pause waits with it, however often the canvas renders meanwhile", started.join() === "a", started)
  advance(1)
  check("then only the newest waiting value is drawn: the ones between are skipped", started.join() === "a,d2", started)
  d.drawn("d2")
  d.offer("e")
  check("nothing in flight or waiting: the next value is drawn at once", started.join() === "a,d2,e", started)
  d.drawn("x")
  check("a value that is not the one in flight says nothing", started.join() === "a,d2,e")
  d.offer("f")
  advance(DRAW_WAIT_MS + 1)
  check("a draw that never comes back holds the next value up for at most DRAW_WAIT_MS", started.join() === "a,d2,e,f", started)
  d.stop()
  d.offer("g")
  check("stopped, it starts over", started.join() === "a,d2,e,f,g")

  const none: string[] = []
  const same = oneDrawInFlight<string>((v) => { none.push(v); return false }, opts)
  same.offer("a")
  same.offer("b")
  check("a value already on screen holds nothing up", none.join() === "a,b")
  check("DRAW_WAIT_MS is under half a second", DRAW_WAIT_MS > 0 && DRAW_WAIT_MS <= 500)
}

console.log("\nTHE THEME UNDER A FINGER, DRAWN BY THE SECTIONS ON SCREEN")
{
  check("useLiveTheme draws through oneDrawInFlight, offered on every move after the patch", /drawing\.offer\(cur\)/.test(live) && /patchRef\.current\?\.\([\s\S]{0,80}\)\s*\n\s*drawing\.offer\(cur\)/.test(live))
  check("and says a value is drawn when the canvas has it", /oRef\.current = o\s*\n\s*drawing\.drawn\(o\)/.test(live))
  check("the canvas gives a section the live theme only while it is on screen", /const themeFor = \(id: string\) => \(!themeLive \|\| onScreen\(id\) \? theme : committedTheme\)/.test(editor) && /theme: themeFor\(section\.id\),/.test(editor))
  check("on screen is read by an IntersectionObserver on the canvas's scroller, a little either side", /new IntersectionObserver\(/.test(onScreen) && /\{ root, rootMargin: ON_SCREEN_MARGIN \}/.test(onScreen) && /^\d+px 0px$/.test(ON_SCREEN_MARGIN) && /rootId: "wb-preview-root", prefix: "wb-section-"/.test(editor))
  check("never measured during a render", !/getBoundingClientRect/.test(onScreen))
  check("a section scrolled into view while the value is live asks to be drawn with it", /if \(arrived && liveRef\.current\) startTransition/.test(onScreen))
  check("before the observer has reported, every section counts as on screen", /!ready\.current \|\| seen\.current\.has\(id\)/.test(onScreen))
}

console.log("\nA THEME VARIABLE UNDER A FINGER IS WRITTEN WHERE IT CAN BE SEEN")
{
  const patcher = editor.slice(editor.indexOf("function canvasThemePatcher("), editor.indexOf("const CANVAS_ON_SCREEN"))
  check("while live, only the variables the value changes, and only onto the sections on screen", /const changed = Object\.keys\(want\)\.filter\(\(k\) => want\[k\] !== was\[k\]\)/.test(patcher) && /document\.getElementById\(`wb-section-\$\{id\}`\)/.test(patcher) && /if \(!get\.onScreen\(id\)\) \{ if \(keys\) letGo\(el, keys\); continue \}/.test(patcher))
  check("never onto the theme's root while live, except its own background", !/root\.style\.setProperty/.test(patcher.slice(patcher.indexOf("const want = themeVars(theme)"))) && /root\.style\.backgroundColor = want\["--theme-bg"\]/.test(patcher))
  check("committed, everything written by hand is taken away and the root has the theme", /if \(theme === base\) \{\s*for \(const \[el, keys\] of \[\.\.\.written\]\) letGo\(el, keys\)/.test(patcher))
  check("a variable written in terms of a changed one is written again where it is", /changed\.some\(\(c\) => v\.includes\(`var\(\$\{c\}\)`\)\)/.test(patcher))
  check("ThemePage keeps the committed theme, so its root is restyled once, on the commit", /theme=\{committedTheme\}\s*\n\s*sections=\{sections\}/.test(editor))
}

console.log("\nA COLOUR DRAGGED IN THE PICKER IS NOT A RENDER PER MOVE")
{
  check("while a finger is down the picker is moved by hand and the colour sent, no state set", /const moveTo = useCallback\(\(next: \{ h: number; s: number; v: number \}\) => \{\s*if \(!dragging\.current\) \{ commit\(next\); return \}\s*hsvLive\.current = next\s*emit\(paint\(next\)\)/.test(chip))
  check("both the box and the hue are drags of that kind", /dragging\.current = true; gesture\.begin\(\); handleSvPoint/.test(chip) && /dragging\.current = true; gesture\.begin\(\); handleHuePoint/.test(chip))
  check("and the picker's state takes the colour once, when the finger lifts", /const flush = useCallback\(\(\) => \{ sendNow\(\); settleRef\.current\(\); gesture\.end\(\) \}/.test(chip) && /setHsv\(next\)\s*setHexInput\(hsvToHex\(next\.h, next\.s, next\.v\)\.toUpperCase\(\)\)/.test(chip))
}

console.log("\nA THEME VALUE MOVING RE-RENDERS NOTHING IT DOES NOT CHANGE")
{
  check("the theme's stylesheet is written again only when its text changes", /const themeCssText = useMemo\(\(\) => themeStylesheet\(theme\), \[theme\]\)/.test(themePage) && /const themeCss = useMemo\(\(\) => \(\{ __html: themeCssText \}\), \[themeCssText\]\)/.test(themePage))
  check("and Custom CSS likewise", /\[customCssText\]\)/.test(themePage))
  check("the storefront context changes with what Commerce says, not with the theme object", /const commerceKey = JSON\.stringify\(siteCommerce\(theme as Record<string, unknown>\)\)/.test(themePage) && /\[storefront, commerceKey\]\)/.test(themePage) && !/\[storefront, theme\]\)/.test(themePage))
  check("the canvas's insert strips are memoised with the gap and one add function", /const CanvasInsertStrip = memo\(function CanvasInsertStrip\(\{ at, onAdd \}/.test(editor) && /<CanvasInsertStrip at=\{gap\} onAdd=\{onAddSectionAt\} \/>/.test(editor))
}

console.log("\nTHE FIRST PRESS OF A SECTION RESTYLES NOTHING")
{
  const content = dialog.slice(dialog.indexOf("function DialogContent("), dialog.indexOf("function DialogHeader"))
  check("a closed dialog writes nothing on html or body: the guard is rendered inside the panel", /<OverscrollGuard portalRef=\{portalRef\} \/>/.test(content) && !/overscrollBehavior/.test(content))
  check("and the guard still holds the page while a dialog is open, and lets go after", /function OverscrollGuard\(/.test(dialog) && /document\.documentElement\.style\.overscrollBehavior = 'none'/.test(dialog) && /document\.documentElement\.style\.overscrollBehavior = prevHtmlOverscroll/.test(dialog))
}

console.log("\nTHE PAGE IS NOT ONE LAYER OF UNKNOWN SIZE")
{
  const rule = css.slice(css.indexOf(".wb-canvas-in {"), css.indexOf("}", css.indexOf(".wb-canvas-in {")))
  check("the canvas's entrance fills backwards, so it is over when it is over", /animation: wb-canvas-in 360ms cubic-bezier\(0\.32, 0\.72, 0, 1\) backwards;/.test(rule) && !/\) both;/.test(rule))
  check("and the page is still the containing block of a fixed element in it", /contain: layout;/.test(rule))
}

console.log("\nA SWITCH, A SELECT AND A CHOICE MOVE IN THEIR OWN FRAME")
{
  check("the echo hook takes any value, not only text", /export function useEchoedValue<T = string>\(value: T, onChange: \(value: T\) => void\): \[T, \(value: T\) => void\]/.test(echo) && /startTransition\(\(\) => onChangeRef\.current\(next\)\)/.test(echo))
  check("a section's switch and select", /if \(kind === "toggle" \|\| kind === "checkbox"\) \{\s*return <EchoSwitch /.test(editor) && /if \(kind === "select"\) \{\s*return <EchoSelect /.test(editor))
  check("Theme's switch, select and segmented choice", /<EchoSwitch checked=\{checked\} onChange=\{onChange\} \/>/.test(editor) && /<EchoSelect value=\{selected\} onChange=\{onChange\} options=\{options\} \/>/.test(editor) && /const \[selected, choose\] = useEchoedValue\(/.test(editor) && /onClick=\{\(\) => choose\(opt\.value\)\}/.test(editor))
  check("a link's Open in a new tab", /const \[newTab, setNewTab\] = useEchoedValue\(opensNewTab\(value\)/.test(linkPicker) && /onClick=\{\(\) => setNewTab\(!newTab\)\}/.test(linkPicker))
}

console.log("\nMEASURED, NOT ASSUMED")
{
  check("the probe drives every interaction on a 44 section page at 1x and 4x", /const PAGE = \["header", \.\.\.BODY, "footer"\]/.test(probe) && /\[1, 4\]/.test(probe))
  for (const k of ["open section settings", "drag section padding", "type 20 keys", "toggle switch", "tab to Theme", "open theme group", "drag theme slider", "drag scheme colour"]) {
    check(`it measures "${k}"`, probe.includes(`measure("${k}"`))
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
