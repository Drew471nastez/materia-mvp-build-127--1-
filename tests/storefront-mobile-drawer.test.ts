/**
 * ===========================================================================
 *  THE SITE MENU ON A PHONE: NOTHING BEHIND IT MOVES, AND THE HEADER STEPS BACK
 * ===========================================================================
 * "When I try to click in the container or scroll in that sidebar navigation
 * mobile container, it scrolls back in the website. And it's opening the
 * mobile navigation sidebar, but it keeps the header open."
 *
 * The cause on a published site was not the drawer's lock, which was right,
 * but the guard the root layout mounts on every page (StuckLayerGuard): it
 * takes back any lock on the body that no `[aria-modal="true"]` accounts
 * for, 400ms later or at the next touch. The menu never said aria-modal, so
 * its lock lasted until the first finger, and the page jumped to the top and
 * scrolled under the menu.
 *
 * Measured in a browser, with real touches, by
 * scripts/check-storefront-mobile-drawer.mjs (live page and the editor's
 * canvas, at 360, 390 and 430 and a desktop showing the phone frame). This
 * file pins the rules that measurement depends on, and tests the one piece
 * of logic, the decision about which moves would reach the page.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { moveReachesPage } from "@/components/website-builder/drawer-frame"
import { clearStaleDocumentLocks, modalIsOpen, type DocLike } from "@/lib/website-builder/stuck-layer"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` (${detail})` : "")); console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ""}`) }
}

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const frame = read("components/website-builder/drawer-frame.ts")
const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
const editor = read("app/website-builder/editor/[installId]/page.tsx")

console.log("\n  the lock is not taken back while the menu is open")

check(
  "both drawers say aria-modal, and only while open",
  (header.match(/aria-modal=\{open \? true : undefined\}/g) ?? []).length === 2,
  `${(header.match(/aria-modal=\{open \? true : undefined\}/g) ?? []).length} of 2`,
)

/* The guard's side of the same contract, driven with a fake document: a
   body lock with an open drawer in the page is left alone, and the same
   lock with no drawer is taken back. */
function fakeDoc(open: boolean): DocLike & { body: { style: Map<string, string> } } {
  const el = () => {
    const style = new Map<string, string>()
    return {
      style: Object.assign(style, {
        getPropertyValue: (n: string) => style.get(n) ?? "",
        removeProperty: (n: string) => { style.delete(n) },
      }),
      hasAttribute: () => false,
      removeAttribute: () => {},
    }
  }
  const doc = {
    documentElement: el(),
    body: el(),
    /* What the browser would answer for the guard's selector list. */
    querySelector: (sel: string) => (open && sel.includes('[aria-modal="true"]') ? {} : null),
  }
  doc.body.style.set("position", "fixed")
  doc.documentElement.style.set("overflow", "hidden")
  return doc as never
}
{
  const withMenu = fakeDoc(true)
  check("an open menu counts as a modal to the guard", modalIsOpen(withMenu))
  check("so the menu's lock survives the guard", clearStaleDocumentLocks(withMenu).length === 0 && withMenu.body.style.get("position") === "fixed")
  const without = fakeDoc(false)
  check("and a lock with nothing open is still taken back", clearStaleDocumentLocks(without).includes("body.position"))
}

check(
  "the lock follows `open` alone, not a close handler that is new every render",
  /\}, \[open, scopedToPreview\]\)/.test(frame) && /closeRef\.current\(\)/.test(frame),
)
check(
  "and the header hands the drawer one close handler for its whole life",
  /const closeMobileNav = useCallback\(\(\) => setMobileNavOpen\(false\), \[\]\)/.test(header) && /onClose=\{closeMobileNav\}/.test(header),
)

console.log("\n  a finger in the menu moves the menu, never the page")

const list = (top: number, height = 900, client = 500) => ({ scrollTop: top, scrollHeight: height, clientHeight: client })
check("nothing scrolls under the finger: every vertical move is the page's", moveReachesPage(null, 0, 8) && moveReachesPage(null, 0, -8))
check("a list with no room is the same as none", moveReachesPage(list(0, 500, 500), 0, -8))
check("at the top of a long list, pulling down would reach the page", moveReachesPage(list(0), 0, 8))
check("at the top, pushing up scrolls the list", !moveReachesPage(list(0), 0, -8))
check("at the bottom, pushing up would reach the page", moveReachesPage(list(400), 0, -8))
check("at the bottom, pulling down scrolls the list", !moveReachesPage(list(400), 0, 8))
check("in the middle, both directions are the list's", !moveReachesPage(list(200), 0, 8) && !moveReachesPage(list(200), 0, -8))
check("a sideways move is the page's: nothing in a drawer scrolls sideways", moveReachesPage(list(200), 12, 3))
check("no travel is no move", !moveReachesPage(null, 0, 0))

check(
  "both drawer panels carry the guard",
  (header.match(/ref=\{guardPanel\}/g) ?? []).length === 2,
  `${(header.match(/ref=\{guardPanel\}/g) ?? []).length} of 2`,
)
check(
  "touchdown is passive and only a move can be cancelled",
  /panel\.addEventListener\("touchstart", onStart, \{ passive: true \}\)/.test(frame)
    && /panel\.addEventListener\("touchmove", onMove, \{ passive: false \}\)/.test(frame)
    && /if \(e\.cancelable && moveReachesPage\(scroller, dx, dy\)\) e\.preventDefault\(\)/.test(frame),
)
check(
  "the scroller is found once per gesture, at touchdown",
  /scroller = scrollerUnder\(e\.target, panel\)/.test(frame),
)
check(
  "a drag on the backdrop moves nothing, even after its press has closed the menu",
  /node\.addEventListener\("touchmove", refuseMove, \{ passive: false \}\)/.test(frame),
)

console.log("\n  the page behind stays exactly where it was")

check(
  "the body is pinned but never made a scroller, so a sticky header stays put",
  /body\.position = "fixed"/.test(frame) && !/body\.overflow = /.test(frame),
)
check(
  "the offset comes back instantly on close",
  /window\.scrollTo\(\{ top: scrollY, left: 0, behavior: "instant"/.test(frame),
)
check(
  "the canvas says a site menu holds it, and the editor's touchdown nudge stands down",
  /scroller\.setAttribute\(SITE_DRAWER_OPEN_ATTRIBUTE, ""\)/.test(frame)
    && /scroller\.removeAttribute\(SITE_DRAWER_OPEN_ATTRIBUTE\)/.test(frame)
    && /if \(el\.hasAttribute\(SITE_DRAWER_OPEN_ATTRIBUTE\)\) return/.test(editor),
)

console.log("\n  and the header stays where it is, the menu opening under it")

/*
  The header used to fade out under an open drawer, which on a phone read as
  the menu hiding the header. The menu opens below it now (Dawn's way): the
  drawer and its backdrop start at the header's bottom, measured from the
  header itself, and the hamburger, turned into an X, is the close.
  Measured by scripts/check-header-drawers.mjs: header opacity 1 throughout.
*/
check(
  "the header does not fade under a drawer any more",
  !/useHeaderUnderDrawer\(/.test(header) && !/el\.animate\(\[\{ opacity: from \}/.test(frame),
)
check(
  "the menu is given the header to open under",
  /below=\{headerRef\}/.test(header) && /useDrawerFrame\(open, !!scopedToPreview, onClose, below\)/.test(header),
)
check(
  "and starts at the header's bottom edge, or takes the whole height with its own close when the header is out of view",
  /: \{ top: inset, bottom: 0 \}/.test(frame) && /\{!underHeader && \(/.test(header),
)
check(
  "show on scroll up stands still while a drawer is over the page",
  /if \(drawerOverPage\.current\) return\s*\n\s*const y = getY\(\)/.test(header) && /drawerOverPage\.current = drawerOpen/.test(header),
)
check(
  "the drawer's list opens at its top again",
  /pane\.scrollTop = 0/.test(header),
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
