/**
 * ===========================================================================
 *  HOW THE APP FEELS UNDER A THUMB
 * ===========================================================================
 * Four complaints, all from the native shell, all of them the app doing
 * something it was told to do at a moment nobody meant it to:
 *
 *   "when I scroll by mistake through things, it gets fade whitish"
 *       :active fires the instant a finger lands, and a finger lands on
 *       something every time you scroll a list.
 *
 *   "if I just hold touch the section in the Add section modal, that zoom
 *    bump on hover which I don't want, and that flash overlay"
 *       the card's own press effect, the shell's press effect on top of it,
 *       and iOS's long-press callout drawn over the lot.
 *
 *   the keyboard screenshot: Add section collapsed to a strip
 *       the sheet sized itself to visualViewport, which is the one thing on
 *       iOS that a keyboard changes.
 *
 * These are CSS and layout rules rather than logic, so they are checked as
 * rules. scripts/check-library-cards.mjs and check-mobile-sheets.mjs measure
 * the geometry they produce.
 *
 * Run with:  npm run test:push
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}
function section(title: string) {
  console.log(`\n${title}`)
}

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")

const css = read("app/globals.css")
const editor = read("app/website-builder/editor/[installId]/page.tsx")
const sheet = read("components/website-builder/mobile-editor-sheet.tsx")

// ---------------------------------------------------------------------------
section("A press is not the start of a scroll")
// ---------------------------------------------------------------------------

{
  const rule = css.slice(
    css.indexOf("html.capacitor button:active"),
    css.indexOf("html.capacitor button:active") + 420,
  )
  check(
    "the dim waits, so a touch that turns into a scroll never shows it",
    /transition-delay:\s*\d+ms/.test(rule),
    rule.slice(0, 200),
  )
  check(
    "and it waits long enough to outlast a flick, without being a lag on a real tap",
    (() => {
      const match = rule.match(/transition-delay:\s*(\d+)ms/)
      const ms = match ? Number(match[1]) : 0
      return ms >= 60 && ms <= 140
    })(),
  )
  check(
    "the delay is on the pressed state only, so letting go is still instant",
    !/transition:\s*opacity\s+\d+ms\s+[a-z-]+\s+\d+ms/.test(css),
  )
}

// ---------------------------------------------------------------------------
section("A finger does not hover, and a long press is not a menu")
// ---------------------------------------------------------------------------

check(
  "the long-press callout is off wherever it is not text",
  /html\.capacitor button,[\s\S]{0,200}-webkit-touch-callout: none/.test(css),
)
check(
  "text keeps its callout, because selecting and copying is the point there",
  /-webkit-touch-callout: default/.test(css),
)
check(
  "hover transforms are neutralised where the pointer is a finger",
  /@media \(pointer: coarse\)[\s\S]{0,320}hover:scale-[\s\S]{0,200}transform: none/.test(css),
)

// ---------------------------------------------------------------------------
section("The Add Section card presses once, not three times")
// ---------------------------------------------------------------------------

{
  /**
   * WITHOUT ITS COMMENTS. The comment explaining what was removed quotes the
   * classes it removed, so a search over the raw text finds them and reports
   * the fix as absent — the guard would have failed on the very change it
   * exists to describe.
   */
  const card = editor
    .slice(editor.indexOf("data-library-card={type}"), editor.indexOf("data-library-card={type}") + 2600)
    .replace(/\/\*[\s\S]*?\*\//g, "")
  check(
    "it no longer dims and shrinks itself on a phone, on top of the shell's dim",
    !/active:scale-\[0\.98\]/.test(card) && !/active:opacity-80/.test(card),
    card.slice(card.indexOf("mobile"), card.indexOf("mobile") + 160),
  )
  check(
    /**
     * Named, and naming the RIGHT names: Tailwind v4 compiles translate and
     * scale to standalone properties, so a list saying `transform` animates
     * neither. That trap has its own guard in section-responsive; this one
     * is here so the card cannot quietly fall back into `transition-all`.
     */
    "it transitions the properties that actually move, rather than everything it contains",
    /transition-\[border-color,box-shadow,translate,scale\]/.test(card) && !/"transition-all duration-200 ease-out will-change-transform"/.test(card),
  )
  check(
    "a long press on it selects nothing and pops nothing",
    /select-none/.test(card) && /\[-webkit-touch-callout:none\]/.test(card),
  )
  check(
    "the desktop lift is still there, because a mouse does hover",
    /hover:-translate-y-0\.5/.test(card) && /hover:shadow-lg/.test(card),
  )
  check(
    "and will-change is only promised where something actually moves",
    /will-change-transform/.test(card.slice(card.indexOf("hover:border-foreground/25"))),
  )
}

// ---------------------------------------------------------------------------
section("The keyboard does not resize the sheet")
// ---------------------------------------------------------------------------

check(
  "the sheet is sized to the layout viewport, which a keyboard does not move",
  /setViewport\(Math\.round\(window\.innerHeight \|\| vv\?\.height \|\| 0\)\)/.test(sheet),
)
check(
  "it is NOT sized to visualViewport, which is the one a keyboard shrinks",
  !/setViewport\(Math\.round\(vv\?\.height \?\? window\.innerHeight\)\)/.test(sheet),
)
check(
  "what the keyboard covers is measured the way the code editor measures it",
  /window\.innerHeight - vv\.height - vv\.offsetTop/.test(sheet),
)
check(
  "a sub-pixel is not treated as a keyboard",
  /covered > 1 \? Math\.round\(covered\) : 0/.test(sheet),
)
check(
  "and it is padded into the content, so the field being typed into is reachable",
  /chromeGap \+ keyboardInset/.test(sheet),
)
check(
  "the same measurement is used in the code editor, so the two agree",
  /window\.innerHeight - vv\.height - vv\.offsetTop/.test(read("app/website-builder/code/[installId]/page.tsx")),
)
/**
 * AND IT IS PADDED ONCE, NOT TWICE.
 *
 * `browserChromeGap` asks `innerHeight - visualViewport.height`, which is the
 * only way to find a browser toolbar and is ALSO the keyboard whenever one is
 * up. So the gap measured the keyboard, `keyboardInset` measured the same
 * keyboard again, and the panel was padded by the sum. Measured with
 * scripts/check-sheet-keyboard.mjs: 672px of padding for a 336px keyboard,
 * the content box ending at 172px instead of 508px, and the whole library in
 * a 44px strip with the rest of the sheet showing as blank background.
 *
 * A toolbar does not come or go because somebody tapped a text field, so the
 * gap is simply not re-measured while a keyboard is up.
 */
check(
  "the chrome gap is not re-measured while a keyboard is up, or the keyboard is counted twice",
  /if \(!keyboard\) setChromeGap\(browserChromeGap\(\)\)/.test(sheet),
)
check(
  "and the keyboard is read once into a name both uses share",
  /const keyboard = covered > 1 \? Math\.round\(covered\) : 0/.test(sheet) && /setKeyboardInset\(keyboard\)/.test(sheet),
)


// ---------------------------------------------------------------------------
section("A panel replacing another looks like navigation")
// ---------------------------------------------------------------------------

check(
  "the sidebar panel is keyed, so a swap is a new element rather than an edit in place",
  /const sidebarPanelKey = pageBrowserOpen/.test(editor) && /key=\{sidebarPanelKey\}/.test(editor),
)
check(
  "going back comes from the other side, so the direction means something",
  /wb-panel-swap-back/.test(editor) && /sidebarGoingBack/.test(editor),
)
check(
  "and back is detected by leaving a section, not by guessing",
  /lastPanelKey\.current\.startsWith\("section:"\) && !sidebarPanelKey\.startsWith\("section:"\)/.test(editor),
)
check(
  "choosing a category replaces the grid rather than swapping card contents",
  /key=\{`\$\{activeCategory \?\? "all"\}:\$\{searching \? "q" : ""\}`\}/.test(editor),
)
check(
  "the entrance is on the grid, not on every card in it",
  (() => {
    const grid = editor.slice(editor.indexOf("ref={gridRef}") - 800, editor.indexOf("ref={gridRef}") + 300)
    return /wb-panel-swap/.test(grid)
  })(),
)

{
  const swap = css.slice(css.indexOf(".wb-panel-swap {"), css.indexOf(".wb-panel-swap {") + 900)
  check(
    "it animates opacity and translate only, so it costs a layer and not a layout",
    /translate: [-\d]/.test(swap) && !/height|width|margin|padding/.test(swap),
    swap.slice(0, 160),
  )
  /**
   * AND IT MOVES SIDEWAYS, NEVER DOWN.
   *
   * The panel is as tall as the scroller it sits in, so a translate DOWN puts
   * something past the scroller's bottom edge, and a scroll container counts
   * that as scrollable overflow: for the 180ms of the animation the sidebar
   * grew a scrollbar and then lost it. Measured with
   * scripts/check-sidebar-swap.mjs, sampling every frame: 6px of overflow at
   * the worst frame against 0px settled. Sideways cannot do it, because the
   * scroller is overflow-x-hidden and a horizontal translate is clipped.
   */
  check(
    "it comes from the side, so it cannot grow a scrollbar for its own animation",
    /translate: -?\d+px 0/.test(swap) && !/translate: 0 -?\d+px/.test(swap),
    swap.slice(0, 200),
  )
  check(
    "`translate`, not `transform` — the v4 trap again",
    !/transform:/.test(swap),
  )
  check(
    "it is short enough to step back through four times without waiting",
    (() => {
      const ms = [...swap.matchAll(/animation: wb-panel-swap[a-z-]* (\d+)ms/g)].map((m) => Number(m[1]))
      return ms.length >= 2 && ms.every((n) => n <= 220)
    })(),
  )
  check(
    "and it is off where motion is not wanted",
    /prefers-reduced-motion: reduce\)[\s\S]{0,140}wb-panel-swap/.test(css),
  )
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
