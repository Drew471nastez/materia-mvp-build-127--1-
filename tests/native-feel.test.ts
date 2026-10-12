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
/* Add a section, in its own module since it became a phone sheet and a kept dialog. */
const library = read("components/website-builder/editor/section-library.tsx")

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
  const card = library
    .slice(library.indexOf("const LibraryCard = memo("), library.indexOf("/* ── The library"))
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
    /transition-\[border-color,box-shadow,translate\]/.test(card) && !/transition-all/.test(card),
  )
  check(
    "a long press on it selects nothing and pops nothing",
    /select-none/.test(card) && /\[-webkit-touch-callout:none\]/.test(card),
  )
  check(
    /* An imported theme's picture lies over its card from the list's own frame, so only Storelib's own cards rise. */
    "the desktop lift is still there, because a mouse does hover",
    /!phone && "group-hover:[^"]*group-hover:shadow-\[[^"]*"/.test(card) && /!phone && !compat && "group-hover:-translate-y-px"/.test(card),
  )
  check(
    "and no card asks for a layer of its own: forty cards would be forty layers",
    !/will-change/.test(card),
  )
}

// ---------------------------------------------------------------------------
section("The keyboard does not resize the sheet")
// ---------------------------------------------------------------------------

check(
  "the sheet is sized to the fixed box, which a keyboard does not move",
  /**
   * The fixed box, read off a fixed probe, first; innerHeight only where
   * there is no probe. innerHeight agrees everywhere except the iOS
   * versions that shrink it with the keyboard while the box stays put.
   */
  /setViewport\(Math\.round\(fixedBoxHeight\(\) \|\| window\.innerHeight \|\| vv\?\.height \|\| 0\)\)/.test(sheet) &&
    /insetCache\.box = Math\.round\(probes\(\)\.gap\.getBoundingClientRect\(\)\.top\)/.test(sheet),
)
check(
  "it is NOT sized to visualViewport, which is the one a keyboard shrinks",
  !/setViewport\(Math\.round\(vv\?\.height \?\? window\.innerHeight\)\)/.test(sheet),
)
check(
  "what the keyboard covers is measured the way the code editor measures it",
  /**
   * Same three terms — the window's height, less the visual viewport, less
   * its offset — read from the window that has the keyboard. Inside the
   * creator page editor's canvas that is the PARENT: an iframe's own visual
   * viewport on iOS does not shrink for a keyboard, so from in there the
   * old expression measured zero and iOS scrolled the outer page instead.
   * `keyboardWindow()` is the sheet's own window everywhere else.
   */
  /**
   * The three terms are in `visibleKeyboard` now (sheet-gestures.ts), with
   * the pan kept as a number of its own: see the section on it below.
   */
  /visibleKeyboard\(\{ layoutHeight: box, vvHeight: kvv\.height, vvTop: kvv\.offsetTop, scale: kvv\.scale \}\)/.test(sheet) &&
    /const box = kb === window \? fixedBoxHeight\(\) : kb\.innerHeight/.test(sheet) &&
    /const kb = keyboardWindow\(\)/.test(sheet),
)
check(
  /*
   * The rule moved into keyboardInsetOrFloor, which every surface in the app
   * that works out a keyboard height now goes through: it keeps a real
   * measurement, drops anything under a pixel, and falls back to the floor
   * ViewportVars publishes when the platform reports no keyboard at all.
   * tests/keyboard-safe-sheet.test.ts owns the rule itself.
   */
  "a sub-pixel is not treated as a keyboard, and neither is a platform that says nothing",
  /**
   * The floor is for a platform that said NOTHING. One that shrank the
   * visual viewport and panned it reported a keyboard, even when the strip
   * it covers at the bottom comes out at zero after the pan; giving that
   * the floor padded half a screen of white over a real keyboard.
   */
  /* Round 17: an optional keyboardRoom is asked first, where it is given; the floor otherwise. */
  /(const|let) keyboard = keyboardFor\(seen, (keyboardRoomRef\.current\?\.\(\) \?\? )?readPublishedKeyboardInset\(\)\)/.test(sheet)
    && /from "@\/lib\/ui\/keyboard-safe-sheet"/.test(sheet),
)
check(
  "and it is padded into the content, so the field being typed into is reachable",
  /paddingBottom: (?:composerKeys \? sheetBottomReserve\(chromeGap, 0\) : )?sheetBottomReserve\(chromeGap, keyboardInset, visibleTop > 0\)/.test(sheet),
)
check(
  /**
   * It used to be `chromeGap + keyboardInset`, plus the home indicator on top
   * of both. All three cover the same strip while somebody is typing, so the
   * buttons were lifted clear of the keyboard by the other two and a band of
   * empty sheet showed underneath them.
   */
  "and only what is actually under the sheet is reserved, not the sum of everything that could be",
  !/chromeGap \+ keyboardInset/.test(sheet),
)
check(
  "the same measurement is used in the code editor, so the two agree",
  /window\.innerHeight - vv\.height - vv\.offsetTop/.test(read("app/website-builder/code/[installId]/page.tsx"))
    && /keyboardInsetOrFloor\(covered\)/.test(read("app/website-builder/code/[installId]/page.tsx")),
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
  /if \(!keyboard && !panned\) setChromeGap\(browserChromeGap\(\)\)/.test(sheet),
)
check(
  "and the keyboard is read once into a name both uses share",
  /(const|let) keyboard = keyboardFor\(seen, /.test(sheet) && /setKeyboardInset\(keyboard\)/.test(sheet) && /setVisibleTop\(panned\)/.test(sheet),
)


// ---------------------------------------------------------------------------
section("A panel replacing another looks like navigation")
// ---------------------------------------------------------------------------

check(
  "the sidebar panel is keyed, so a swap is a new element rather than an edit in place",
  /const sidebarPanelKey = pageBrowserOpen/.test(editor) && /key=\{sidebarPanelKey\}/.test(editor),
)
/**
 * AND IT DOES NOT MOVE.
 *
 * The panel used to slide in, forward from one side and back from the other,
 * so the direction said which way you had moved through the stack. At 180ms
 * over a panel of text that is not navigation it is a flinch, and it fired on
 * the most common action in the editor: clicking a section. Reported as
 * looking cheap. The key stays because that is structure, not decoration.
 */
check(
  "selecting a section does not make the sidebar move",
  !/wb-panel-swap-back/.test(editor) && !/sidebarGoingBack/.test(editor),
)
/**
 * CHOOSING A CATEGORY BUILDS NOTHING. Every card is built once, when the
 * library is first opened; a category or a search hides the ones it does
 * not want (`hidden`) and shows the others. It used to key the grid on the
 * category, which threw away every card and its preview and built the new
 * list from nothing on each press. scripts/check-add-section.mjs counts the
 * cards rebuilt by a category switch: 0.
 */
check(
  "choosing a category hides and shows cards already built, rather than building a new grid",
  /hidden=\{!shown\.has\(e\)\}/.test(library) && /hidden=\{hidden\}/.test(library) && !/key=\{`\$\{activeCategory/.test(library),
)
/**
 * AND NOTHING ABOUT A SWITCH IS ANIMATED. The grid used to ease in from a
 * quarter of its strength on every category, and every preview kept the
 * class that had faded it in when it first arrived; a CSS animation plays
 * again whenever its element comes back from `display: none`, so each card
 * a category showed again flashed up from nothing. Measured before the fix
 * by scripts/check-add-section.mjs: drawn previews at opacity 0 and 0.25 in
 * the first frame after the press, on a phone and on a computer, and filmed
 * frames of the list washed out. Now a preview fades in once, by the Web
 * Animations API, only when it lands in front of somebody, and a switch
 * only puts the list back at its top.
 */
{
  const filter = library.slice(library.indexOf("const filterKey ="), library.indexOf("CLOSE FIRST, ADD ON THE NEXT FRAME"))
  const box = library.slice(library.indexOf("const PreviewBox = memo("), library.indexOf("const LibraryCard = memo("))
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "")
  check("a category switch animates nothing: no fade of the list, no slide", !/\.animate\(/.test(strip(filter)) && !/opacity: 0\.25/.test(strip(library)))
  check("it only starts the list at its top, before paint", /useLayoutEffect\(\(\) => \{\s*\n\s*if \(lastFilter\.current === filterKey\) return[\s\S]{0,80}scroller\.current\.scrollTop = 0/.test(filter))
  check("a preview's own fade is played once by hand, not by a class a re-shown card replays",
    /el\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\]/.test(box) && /if \(held\.current\) return/.test(box) && !/wb-preview-arrive/.test(strip(library)))
  check("and never on every card at once: the cards themselves animate nothing", !/\.animate\(/.test(strip(library.slice(library.indexOf("const LibraryCard = memo("), library.indexOf("/* ── The library")))))
}

// ---------------------------------------------------------------------------
section("Every dialog in the app gets to finish closing")
// ---------------------------------------------------------------------------

/*
  Radix's Portal wraps EACH of its children in its own <Presence>, and a
  Presence holds a node past `open: false` only while that node has an
  animation left to play. DialogContent used to hand it a single
  `display: contents` div containing the overlay and the panel, so the node
  Radix watched had no animation of its own: it was dropped on the frame the
  state flipped and took both real elements with it, unplayed. Every one of
  the app's dialogs opened on a curve and closed by deletion.

  The wrapper is easy to reintroduce, because it reads like a harmless div
  and the bug it causes is somewhere else entirely, so it is pinned here.
  scripts/check-editor-motion.mjs measures the behaviour in a real browser.
*/
{
  const dialog = read("components/ui/dialog.tsx")
  const body = dialog.slice(dialog.indexOf("<DialogPortal"), dialog.indexOf("</DialogPortal>"))

  check(
    "the overlay is a direct child of the portal, not wrapped",
    /<DialogPortal[^>]*>\s*<DialogOverlay/.test(body),
    body.slice(0, 160),
  )
  check(
    "and so is the panel, so each one owns its own exit",
    /<\/DialogOverlay>|\/>\s*<DialogPrimitive\.Content/.test(body) &&
      !/display:\s*['"`]?contents/.test(body),
  )
  check(
    "the panel still animates out, not just in",
    /data-\[state=closed\]:animate-out/.test(dialog) &&
      /data-\[state=closed\]:fade-out-0/.test(dialog),
  )
  check(
    "and the darken behind it fades rather than blinking off",
    /data-\[state=closed\]:fade-out-0/.test(
      dialog.slice(dialog.indexOf("function DialogOverlay"), dialog.indexOf("function DialogContent")),
    ),
  )
}

// ---------------------------------------------------------------------------
section("What the native shell adds to every scroll frame")
// ---------------------------------------------------------------------------

{
  /*
    "The app doesn't feel as smooth as the same site does in Safari."

    Safari loads the same site from the same deployment, so only code behind
    the `html.capacitor` gate can explain a difference, and the heaviest thing
    behind it is this guard's touchmove listener. It has to be non-passive,
    because its whole job is to call preventDefault and the Podfile targets
    iOS 14, where WKWebView ignores `overscroll-behavior`. What it must not be
    is EXPENSIVE, because the compositor is already waiting on it.

    Measured by scripts/check-native-scroll-cost, on the real component with
    real touch input: one ordinary 40-move scroll forced 585 style
    recalculations when the ancestor walk ran per frame, and 15 once it ran
    per gesture. The numbers are the probe's job. What is pinned here is the
    shape that produced them, because it is the kind of thing a later edit
    puts back without noticing.
  */
  const guard = read("components/platform/capacitor-bounce-guard.tsx")
  const move = guard.slice(guard.indexOf("function onTouchMove"), guard.indexOf("document.addEventListener"))
  const start = guard.slice(guard.indexOf("function resolve"), guard.indexOf("function onTouchStart"))

  check(
    "the walk that costs a style recalculation per ancestor is in touchstart",
    /getComputedStyle/.test(start) && !/getComputedStyle/.test(move),
    "getComputedStyle forces a style recalculation, and this one ran fifteen times per frame",
  )
  check(
    "and so is asking whether this element handles its own gestures",
    /closest\("\[data-mobile-bottom-sheet\]"\)/.test(start) && !/closest\(/.test(move),
    "three closest() walks per frame, for an answer that cannot change mid-gesture",
  )
  check(
    "the height of the thing being scrolled is measured once, not per move",
    /scrollHeight = /.test(start) && !/\.scrollHeight/.test(move),
    "reading scrollHeight forces layout; content does not resize while a finger is down",
  )
  check(
    "what a move reads is the one number that moves",
    /scroller\.scrollTop/.test(move),
    "scrollTop is the only value a scroll changes",
  )
  check(
    "the orientation check is settled with the rest",
    /window\.innerWidth > window\.innerHeight/.test(start) && !/innerWidth/.test(move),
    "two layout reads per frame to ask a question that changes on rotation",
  )
  /*
    And it is still allowed to veto, which is the whole point of it. A future
    edit that makes this passive to chase the fast path removes the bounce
    protection on iOS 14 and 15 silently: preventDefault in a passive listener
    is ignored with a console warning nobody reads.
  */
  check(
    "it can still refuse the move it is there to refuse",
    /touchmove", onTouchMove, \{ passive: false \}/.test(guard) && /e\.preventDefault\(\)/.test(move),
    "preventDefault in a passive listener is ignored, and the bounce comes back with no error",
  )
  check(
    "and the cheap half of the pair is passive",
    /touchstart", onTouchStart, \{ passive: true \}/.test(guard),
    "touchstart never calls preventDefault here, so it has no reason to hold the compositor",
  )
}


/*
 * ===========================================================================
 *  A TICK QUIETER THAN THE QUIETEST KNOCK
 * ===========================================================================
 * "The haptics there are too loud, reduce them a little bit."
 *
 * The bar had two strengths, medium and light, and medium reads as loud on a
 * control you press several times a minute. Stepping it down needed a level
 * below light, and there was not one: the three impact styles are knocks and
 * Light is the quietest knock iOS makes.
 *
 * Below them is a different generator entirely — the one behind a picker
 * wheel and a segmented control. It is the softest thing the Taptic Engine
 * produces, and a row of tabs IS a segmented control, so it is the right
 * shape as well as the quiet one. Android has no equivalent, so there it is
 * simply a shorter buzz, which is all navigator.vibrate can say.
 */
{
  const bridge = read("lib/native-bridge.ts")
  console.log("\n  Haptics have a level below the quietest knock")
  check(
    "soft is selection feedback, not a fourth impact style",
    /if \(style === "soft"\) \{\s*\n\s*await Haptics\.selectionChanged\(\)/.test(bridge),
    "there is no impact style below Light; the softer thing is a different generator",
  )
  check(
    "and on a browser it is a shorter buzz than light",
    /navigator\.vibrate\(strength === "soft" \? 6 : strength === "light" \? 10 : 15\)/.test(bridge),
    "Android has no selection generator, so duration is the only thing left to lower",
  )
  check(
    "and both entry points accept it",
    /export async function triggerHaptic\(style: "soft" \| "light" \| "medium" \| "heavy"/.test(bridge)
      && /export function hapticTap\(strength: "soft" \| "light" \| "medium"/.test(bridge),
  )
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
