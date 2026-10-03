/**
 * ===========================================================================
 *  THE BUILT SITE'S HEADER AND ITS MENU, FRAME BY FRAME
 * ===========================================================================
 * Two complaints in one message, about a creator's published site on a phone
 * and about the same header in the builder's preview:
 *
 *   "when I open the navigation sidebar, the menu nav drawer: the header
 *    glitches and closes, refreshes, flashes, and the nav sidebar is not
 *    even smooth"
 *   "this sticky on scroll-up behaviour is not smooth"
 *
 * Neither is a question the DOM can answer, so it was filmed:
 * scripts/check-header-motion.mjs drives a real headless page at 390px with
 * the processor slowed four times, records the screen through an open, a
 * close and a scroll past the sticky threshold in all three surfaces the
 * header renders in, and reads the panel's own edge every frame.
 *
 * WHAT IT FOUND, and what each check below now keeps out.
 *
 * THE DRAWER DID NOT SLIDE, IT APPEARED. From the tap nothing changed on
 * screen for 112 to 183ms, and then the panel was already most of the way
 * across. The cause was an ordering: tapping the menu sets React state, React
 * re-renders the whole header and portals every row of the drawer, and the
 * SAME commit put `transform` and a 360ms transition on the panel. All of it
 * is one task — 80 to 110ms of it, measured — and nothing can be painted
 * until the task ends, but the transition's clock started at the beginning of
 * it. A third of the slide was over before the first frame of it was drawn.
 * The travel is written to the node inside a `requestAnimationFrame` now, so
 * it begins on a frame the browser is about to paint.
 *
 * THE HAMBURGER'S BARS MOVED BY `top`. A layout property, transitioned for
 * 180ms, during the exact frames the drawer is trying to slide — the one
 * moment on the page with no main thread to spare. The probe listed it among
 * what was animating during an open: "top on span". Forced layouts during an
 * open fell from 34–37 to 4–6 when it became a `translateY`.
 *
 * THE REVEAL DECIDED ONCE PER SCROLL EVENT. A flick sends more of those than
 * the screen has frames, and each one measured the header and wrote three
 * style properties whether or not anything had changed. One decision per
 * frame now, and the properties are written when they are reached.
 *
 * AND WHAT IT RULED OUT, which is worth writing down because it is what the
 * report said: the header does not remount (the probe tags the node and finds
 * the same one afterwards) and the page never reloads (nought main-frame
 * navigations through every take). "Refreshes" was the snap.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const FRAME = "components/website-builder/drawer-frame.ts"
const HEADER = "components/website-builder/sections/renderers/HeaderSection.tsx"
const frame = read(FRAME)
const header = read(HEADER)

/** The `style={{ … }}` object on the element whose markup contains `marker`. */
function styleObjectAfter(source: string, marker: string): string {
  const at = source.indexOf(marker)
  if (at < 0) return ""
  const start = source.indexOf("style={{", at)
  if (start < 0) return ""
  const end = source.indexOf("}}", start)
  return source.slice(start, end + 2)
}

function main() {
  console.log("\n  the drawer starts moving on a frame that gets painted")

  check(
    "the travel is written to the node, not rendered by React",
    /frame\.current = requestAnimationFrame\(\(\) => \{[\s\S]{0,400}?el\.style\[property\] = to/.test(frame),
  )
  check(
    "and the node rests at its closed position from the moment it attaches",
    /node\.style\.transition = "none"\s*\n\s*node\.style\[property\] = at\.current\.closed/.test(frame),
  )
  /*
    The transform used to be `transform: open ? "translate3d(0, 0, 0)" : …`
    in the panel's style prop, and the backdrop's opacity beside it. A style
    prop is applied during the commit, which is the thing being got out from
    under, so neither may come back there.
  */
  check(
    "the menu panel's style prop carries no transform any more",
    !/transform/.test(styleObjectAfter(header, 'aria-label="Menu"')),
    styleObjectAfter(header, 'aria-label="Menu"').replace(/\s+/g, " ").slice(0, 120),
  )
  check(
    "and the cart panel's carries none either",
    !/transform/.test(styleObjectAfter(header, 'aria-label="Cart"')),
  )
  /* Both site drawers carry the same marker on their backdrop; neither of
     them may set `opacity` from a render any more. (The header's own search
     panel still fades from a prop, which is correct: it is not portalled, it
     is not behind a scroll lock, and opening it commits almost nothing.) */
  const backdrops = header.split('data-site-drawer-backdrop=""').slice(1)
  check(
    "neither drawer's backdrop animates its opacity from a render",
    backdrops.length === 2 && backdrops.every((rest) => !/opacity/.test(styleObjectAfter(rest, "style={{"))),
    `${backdrops.length} backdrop(s)`,
  )
  check(
    "both drawers take their motion from the one hook, panel and backdrop alike",
    (header.match(/useDrawerMotion\(/g) ?? []).length === 4,
    `${(header.match(/useDrawerMotion\(/g) ?? []).length} of 4`,
  )
  /*
    The header fades under the drawer at the backdrop's pace. Created in an
    effect it started counting inside the same blocked commit, so it stepped
    rather than faded; held to the same frame, all three begin together.
  */
  check(
    /* The header no longer fades at all: the menu opens under it (scripts/check-header-drawers.mjs, header opacity 1 throughout). */
    "the header is left as it is, so nothing of it is staggered against the slide",
    !/useHeaderUnderDrawer/.test(frame) && !/useHeaderUnderDrawer/.test(read(HEADER)),
  )
  check(
    "and the compositor layer is given back when the journey ends",
    /e\.target === node && e\.propertyName === property\) node\.style\.willChange = ""/.test(frame),
  )
  check(
    "somebody who asked for less movement gets the drawer without the travel",
    /if \(prefersStill\(\)\) \{\s*\n\s*el\.style\.transition = "none"/.test(frame),
  )

  console.log("\n  the lock and the drawer's rectangle land before the first paint")

  /*
    The pin is `setPin` state read into the panel's `top` and `height`. Taken
    in an ordinary effect it arrived a frame late, so an opening drew once at
    the offset of the PREVIOUS opening — in the editor's canvas that is a
    whole screen out — and corrected itself on the frame after.
  */
  check(
    "the frame hook measures and locks in a layout effect",
    /useBeforePaint\(\(\) => \{\s*\n\s*if \(!open\) return/.test(frame),
  )
  check(
    "which is an ordinary effect on the server, where there is no layout and React warns",
    /const useBeforePaint = typeof window === "undefined" \? useEffect : useLayoutEffect/.test(frame),
  )

  console.log("\n  the hamburger's bars are on the compositor")

  /*
    `top: mobileNavOpen ? "7px" : "0px"` with `transition: top 180ms` was a
    layout property animating through the busiest frames on the page.
  */
  check(
    "no bar transitions `top` any more",
    !/transition: mobileNavOpen[\s\S]{0,200}?top \d+ms/.test(header),
  )
  check(
    "they travel by transform instead",
    /transform: mobileNavOpen \? "translateY\(7px\)" : "translateY\(0px\)"/.test(header)
      && /transform: mobileNavOpen \? "translateY\(-7px\)" : "translateY\(0px\)"/.test(header),
  )
  check(
    "and the rotation still comes after the travel, on its own element",
    /transform: mobileNavOpen \? "rotate\(45deg\)" : "rotate\(0deg\)"[\s\S]{0,200}?transform 200ms 80ms/.test(header),
  )

  console.log("\n  show on scroll up decides once a frame, and writes when it changes")

  check(
    "a scroll event asks for a frame rather than doing the work",
    /const onScroll = \(\) => \{\s*\n\s*if \(pendingFrame\) return\s*\n\s*pendingFrame = requestAnimationFrame\(decide\)/.test(header),
  )
  check(
    "and the frame is given back when the header stops listening",
    /if \(pendingFrame\) cancelAnimationFrame\(pendingFrame\)/.test(header),
  )
  check(
    "the same transform is not written twice",
    /if \(hide === shownHide && pinned === shownPinned\) return/.test(header),
  )
  check(
    "the header's rectangle is only read where the answer can still change",
    /if \(y <= origin \+ height \+ 1\) sampleOrigin\(\)/.test(header),
  )
  check(
    "and a header that changes height while you are scrolled down is re-measured",
    /new ResizeObserver\(sampleOrigin\)/.test(header) && /ro\?\.observe\(el\)/.test(header),
  )
  /*
    Locking the page pins the body at minus its offset, so the scroller reads
    nought and a sticky header reads a top of nought with it. Sampled then,
    the clearance band that keeps the header from flickering over the
    announcement bar would be thrown away by the act of opening the menu.
  */
  check(
    "nothing is measured while a drawer is holding the page still",
    /const sampleOrigin = \(\) => \{[\s\S]{0,900}?if \(drawerOverPage\.current\) return/.test(header),
  )
  check(
    "and the reveal is a jump rather than a slide for somebody who asked for less movement",
    /const REVEAL = prefersStill\(\) \? "none" :/.test(header),
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
