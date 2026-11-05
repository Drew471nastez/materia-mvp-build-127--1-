/**
 * ===========================================================================
 *  THE CANVAS THAT STOPPED SCROLLING, ROUND 1023
 * ===========================================================================
 * The owner: "the canvas sometimes freezes: it stops scrolling, the
 * scrollbar on the right goes; a double click sometimes brings it back,
 * often not; selecting a section brings it back; otherwise only a reload".
 * Measured on the real editor by scripts/check-canvas-freeze.mjs (an
 * imported theme with a menu drawer, a pop-up and a page transition, and a
 * Storelib theme with its own drawers), every way found, and what is held
 * here:
 *
 *   THE OVERLAY    a theme's page transition held its page still until its
 *                  overlay's animation ended, and the canvas hid that overlay
 *                  with display: none, where no animation runs: the page
 *                  stayed held for good (canvas-bridge.ts, CANVAS_HEAD)
 *   THE DEAD PAGE  a theme that opens the next page itself took the frame to
 *                  an address with no canvas in it, and the message saying so
 *                  came from a window the builder did not know, so it was
 *                  never heard: the canvas sat on a page with no sections
 *                  (compat-canvas.tsx, A PAGE THAT LEFT THE CANVAS)
 *   THE LEFTOVER   a pop-up's or a drawer's hold on <html>/<body> outlived
 *                  it (its section drawn again or taken off while it was
 *                  open): let go when nothing on screen holds it
 *                  (canvas-bridge.ts, A PAGE HELD STILL WITH NOTHING OPEN)
 *   THE TOOLBAR    a wheel over the section toolbar scrolled nothing
 *   THE STOREFRONT a Storelib drawer's hold on #wb-preview-root that no
 *                  drawer is counted for is let go (canvas-scroll.ts)
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CANVAS_BRIDGE, CANVAS_HEAD } from "@/lib/storelib-theme/compat/canvas-bridge"
import { DRAWER_HOLD_ATTRIBUTE, releaseStrayDrawerHold, type HeldLike } from "@/lib/website-builder/canvas-scroll"
import { SITE_DRAWER_OPEN_ATTRIBUTE } from "@/components/website-builder/drawer-frame"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nA PRELOADER IS UNSEEN, NOT TAKEN OUT")
{
  const style = /<style data-sl-canvas>([^<]*)<\/style>/.exec(CANVAS_HEAD)?.[1] ?? ""
  check("the canvas's head still hides the theme's preloaders", /\.page-loading-overlay/.test(style) && /preload-page/.test(style) && /visibility:hidden!important/.test(style))
  check("never display: none, where no animation or transition runs and no animationend comes", !/display:none/.test(style), style.slice(0, 200))
  check("their motion takes a millisecond, so a wait on it ends at once", /animation-duration:1ms!important/.test(style) && /transition-duration:1ms!important/.test(style))
  check("what is inside them is hidden too (a child can set visibility: visible)", /\.page-loading-overlay \*/.test(style))
}

console.log("\nA PAGE HELD STILL WITH NOTHING OPEN IS LET GO")
{
  check("a rule of the canvas's own lifts the hold, on <html>", /html\[data-sl-unlock\]\{overflow-y:auto!important\}/.test(CANVAS_BRIDGE) && /html\[data-sl-unlock\] body\{overflow-y:visible!important\}/.test(CANVAS_BRIDGE))
  check("a body pinned with position: fixed is let go too", /html\[data-sl-unlock=fixed\] body\{position:static!important/.test(CANVAS_BRIDGE))
  check("never by taking the theme's class or style away", !/classList\.remove\("overflow-hidden"\)/.test(CANVAS_BRIDGE) && !/documentElement\.style\.overflow\s*=\s*""/.test(CANVAS_BRIDGE))
  check("held means: overflow hidden or clip on <html>, or on <body> where <html> passes it on, or a fixed body", /clip\(hs\.overflowY\) \|\| \(!!bs && clip\(bs\.overflowY\) && hs\.overflowY === "visible"\) \|\| fixed/.test(CANVAS_BRIDGE))
  check("only with room to scroll", /if \(tall - innerHeight <= 2\) return null/.test(CANVAS_BRIDGE))
  check("something open on screen keeps it: an open <dialog>, or a fixed layer over a quarter of the view, painted", /dialog\[open\]/.test(CANVAS_BRIDGE) && /seen >= area \* 0\.25 && opacityOf\(layer\) >= 0\.05/.test(CANVAS_BRIDGE))
  check("read at five places of the view", /\[\[0\.5, 0\.5\], \[0\.15, 0\.5\], \[0\.85, 0\.5\], \[0\.5, 0\.25\], \[0\.5, 0\.8\]\]/.test(CANVAS_BRIDGE))
  check("read as the theme has it: the rule off for the reading", /if \(unlocked\) setUnlock\(null\);\s*var held = lockedNow\(\);/.test(CANVAS_BRIDGE))
  check("asked again a moment after <html> or <body> changes, and something that opens takes the rule off at once", /lockWatch\.observe\(document\.documentElement, \{ attributes: true, attributeFilter: \["class", "style"\] \}\)/.test(CANVAS_BRIDGE) && /if \(unlocked && openOnScreen\(\)\) setUnlock\(null\);/.test(CANVAS_BRIDGE))
  /* Changed on purpose: round 1023 part 2 looks at the hold in the wheel's own task (editor-freeze2.test.ts, THE FIRST WHEEL), not 120ms after it moved nothing. */
  /* Changed on purpose (round 14): asked again only when <html> or <body> changed since (lockDirty) or a second has gone, not for every notch of a wheel. */
  check("a wheel over a held page asks at once, in its own task", /addEventListener\("wheel", function \(e\) \{[\s\S]{0,800}if \(!unlocked && \(lockSeen === null \|\| lockDirty \|\| t0 - lockSeen > 1000\)\) \{[\s\S]{0,80}if \(lockedNow\(\)\) \{ clearTimeout\(lockTimer\); checkLock\(\); \}/.test(CANVAS_BRIDGE))
  check("a section swapped or taken off asks too (its drawer went with it)", (CANVAS_BRIDGE.match(/lockSoon\(\);/g) ?? []).length >= 2)
  /* Changed on purpose: a preloader the canvas hid (data-sl-stalled, round 1023 part 2) is not something open either. */
  check("its own boxes and strip are not something open", /c\.hasAttribute\("data-sl-box"\) \|\| c\.hasAttribute\("data-sl-add"\)( \|\| c\.hasAttribute\("data-sl-stalled"\))?\) continue;/.test(CANVAS_BRIDGE))
}

console.log("\nA PAGE THAT LEFT THE CANVAS IS DRAWN AGAIN")
{
  const canvas = read("components/website-builder/compat/compat-canvas.tsx")
  check("the frame's second load is the page having left", /slot\.loads = \(slot\.loads \?\? 0\) \+ 1/.test(canvas) && /if \(slot\.loads > 1\) \{/.test(canvas))
  check("the page is drawn again in its place", /if \(slot\.loads > 1\) \{[\s\S]{0,600}loadBehind\(draw\(sectionsRef\.current\), slot\.key, sectionsRef\.current\)/.test(canvas))
  check("the link the theme took opens as the editor would open it", /navigateFromRef\.current\(n, taken\.href, taken\.chrome\)/.test(canvas))
  check("the bridge says what the theme took while it can still be heard", /post\(\{ type: "taken", href: href, chrome: chrome \}\)/.test(CANVAS_BRIDGE))
  check("a card that is its own link says so too", /post\(\{ type: "taken", href: href, chrome: pressedCard\.chrome \}\)/.test(CANVAS_BRIDGE))
  check("the canvas keeps it on the slot", /m\.type === "taken" && isFront/.test(canvas))
}

console.log("\nA WHEEL OVER THE TOOLBAR SCROLLS THE CANVAS")
{
  const page = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("the toolbar hands its wheel on, to the card or to the frame", /onWheel=\{\(e\) => \{[\s\S]{0,400}root\.scrollBy\(\{ top: e\.deltaY, left: 0 \}\)[\s\S]{0,300}type: "scroll-by", top: e\.deltaY/.test(page))
  check("the frame scrolls itself by it", /m\.type === "scroll-by"/.test(CANVAS_BRIDGE) && /scrollBy\(\{ top: m\.top, left: 0 \}\)/.test(CANVAS_BRIDGE))
  check("the outlines and the ghost box take no pointer", /\[data-sl-box\]\{position:fixed;pointer-events:none/.test(CANVAS_BRIDGE) && /className="pointer-events-none absolute" style=\{\{ top: ghost\.top/.test(read("components/website-builder/compat/compat-canvas.tsx")))
}

console.log("\nA STOREFRONT DRAWER'S HOLD WITH NO DRAWER")
{
  const el = (attrs: string[], overflow: string, touch = ""): HeldLike & { attrs: Set<string> } => {
    const set = new Set(attrs)
    return { attrs: set, style: { overflow, touchAction: touch }, hasAttribute: (n) => set.has(n), removeAttribute: (n) => { set.delete(n) } }
  }
  check("the attribute is the drawer's own", DRAWER_HOLD_ATTRIBUTE === SITE_DRAWER_OPEN_ATTRIBUTE)
  const held = el([DRAWER_HOLD_ATTRIBUTE], "hidden", "none")
  check("a drawer counted: left alone", releaseStrayDrawerHold(held, 1) === false && held.style.overflow === "hidden" && held.attrs.has(DRAWER_HOLD_ATTRIBUTE))
  const stray = el([DRAWER_HOLD_ATTRIBUTE], "hidden", "none")
  check("no drawer counted: let go", releaseStrayDrawerHold(stray, 0) === true && stray.style.overflow === "" && stray.style.touchAction === "" && !stray.attrs.has(DRAWER_HOLD_ATTRIBUTE))
  const clean = el([], "")
  check("nothing held: nothing done", releaseStrayDrawerHold(clean, 0) === false)
  const page = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("asked on a wheel and on a touch on the canvas", (page.match(/releaseStrayDrawerHold\(e\.currentTarget, lockHolders\(e\.currentTarget\)\)/g) ?? []).length === 2)
}

console.log("\nTHE PROBE")
{
  const probe = read("scripts/check-canvas-freeze.mjs")
  check("measures a real wheel after every step", /page\.mouse\.wheel\(\{ deltaY: 400 \}\)/.test(probe))
  check("on an imported theme with a drawer, a pop-up and a page transition, and on a Storelib theme", /data-md/.test(probe) && /data-np/.test(probe) && /data-transition/.test(probe) && /STORELIB THEME/.test(probe))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
