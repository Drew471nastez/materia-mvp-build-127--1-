/**
 * ===========================================================================
 *  THE BUILT SITE'S MOBILE MENU: WHERE IT OPENS, AND WHAT STOPS BEHIND IT
 * ===========================================================================
 * Reported twice in one message: with the page scrolled down, opening the
 * menu drew it at the top of the document instead of over the screen; and
 * while it was open the site behind it kept scrolling.
 *
 * One cause each.
 *
 * WHERE IT OPENS. In the editor the drawer is portalled into
 * `#wb-preview-root`, which is `position: relative` and `overflow-y: auto`.
 * An absolutely positioned child of a scroller is laid out against its
 * CONTENT box and scrolls with it, so `top: 0` is the top of the whole page
 * rather than the top of the visible rectangle. Measured in
 * scripts/check-nav-drawer.mjs with the canvas at 900px: the old markup
 * lands at -900px, a screen and a half above the person who opened it.
 *
 * WHAT STOPS. The live site locked with `overflow: hidden` on the body,
 * which iOS does not honour for touch scrolling, and the editor applied no
 * lock at all.
 *
 * The geometry itself is measured in the browser by check-nav-drawer.mjs.
 * What is guarded here is that the two mechanisms stay in the source: a
 * drawer positioned from the scroller's own offset, and a lock that is
 * position-fixed rather than overflow-hidden.
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

/* The frame — pin, lock, portal target — is shared by the nav drawer and
   the cart drawer, so it is read from the one module both of them use. */
const FRAME = "components/website-builder/drawer-frame.ts"
const HEADER = "components/website-builder/sections/renderers/HeaderSection.tsx"
/* The canvas is where the other half of the navigation rule lives. */
const EDITOR = "app/(storelib)/website-builder/editor/[installId]/page.tsx"
const src = readFileSync(join(process.cwd(), FRAME), "utf8")
const header = readFileSync(join(process.cwd(), HEADER), "utf8")
const editor = readFileSync(join(process.cwd(), EDITOR), "utf8")

function main() {
  console.log("\n  the drawer opens over what is on screen")

  check(
    "it is positioned from the scroller's own offset",
    /setPin\(\{ top: scroller\.scrollTop, height: scroller\.clientHeight \}\)/.test(src),
  )
  check(
    "and that offset reaches every drawer's panel and backdrop",
    (header.match(/\.\.\.frameStyle,/g) ?? []).length >= 2,
    `${(header.match(/\.\.\.frameStyle,/g) ?? []).length} element(s)`,
  )
  check(
    "no element stretches from the top of the container to its bottom any more",
    !/top-0 bottom-0 z-\[9/.test(header),
  )
  check(
    "and both of the site's drawers take the frame from the one module",
    /useDrawerFrame\(open, !!scopedToPreview, onClose, below\)/.test(header),
  )
  check(
    "absolute positioning is used only when the portal really went into the scroller",
    /positionClass: previewRoot \? "absolute" : "fixed"/.test(src),
  )

  console.log("\n  and it follows the canvas when the canvas changes size")

  /*
    Tapping the hamburger in the editor also selects the header, so the
    inspector sheet opens on the same tap and the canvas subtracts its peek
    as padding. The canvas is shorter and the WINDOW never resized, so a
    `resize` listener hears nothing and the drawer is left at half height
    for as long as it is open. Measured in check-nav-drawer.mjs: without the
    observer, a 380px canvas carries a 640px drawer.
  */
  check(
    "the scroller is watched for its own size, not just the window",
    /new ResizeObserver\(measure\)/.test(src) && /ro\?\.observe\(scroller\)/.test(src),
  )
  check(
    "the offset is re-read with the height, because a growing canvas clamps it",
    /const measure = \(\) => setPin\(\{ top: scroller\.scrollTop, height: scroller\.clientHeight \}\)/.test(src),
  )
  check(
    "and the observer is disconnected on close",
    /ro\?\.disconnect\(\)/.test(src),
  )

  console.log("\n  and the controls inside it do what they say")

  /*
    The editor cancels a link's default and follows it only when the anchor
    sits under `data-chrome`, which is the header or the footer. The drawer
    IS the header's menu and is portalled out of it, so without the attribute
    every link in it was cancelled and went nowhere. Measured in
    check-nav-drawer.mjs, which replicates that rule and clicks the links.
  */
  check(
    "the menu carries the attribute that says it is the header's navigation",
    /aria-label="Menu"[\s\S]{0,1600}?data-chrome=""/.test(header),
  )

  /*
    AND IT FOLLOWS ITS OWN LINKS, AFTER IT HAS CLOSED.

    The canvas takes a link under `data-chrome` in the CAPTURE phase and
    stops the event there, so the drawer's own handler never ran: the page
    changed and the menu was left standing open over the page it had just
    opened. Reported as "if i click on home it should take me to home and
    close the mobile nav drawer".

    Two halves. The canvas leaves a `data-self-nav` overlay alone, and the
    drawer closes first and navigates on the drawer's own closing time, the
    same on the live site and in the editor. The ORDER is measured for real
    in check-nav-drawer.mjs: a moment after the tap the panel has moved and
    nothing has navigated, and by the end it has done both.
  */
  check(
    "the menu says it will follow its own links",
    /aria-label="Menu"[\s\S]{0,2200}?data-self-nav=""/.test(header),
  )
  check(
    "and the canvas leaves those links to it",
    /closest\?\.\('\[role="dialog"\], \[data-self-nav\]'\)/.test(editor)
      && /inNav && internal && !ownsItsExit/.test(editor),
  )
  check(
    "a link closes the menu before it goes anywhere, in the editor as well as live",
    /onClose\(\)\s*\n\s*\/\*[\s\S]{0,1400}?const go = onEditorNavigate/.test(header)
      && /window\.setTimeout\(go, CLOSE_MS\)/.test(header),
  )
  check(
    "and it waits exactly as long as the drawer takes to close",
    /const CLOSE_MS = DRAWER_CLOSE_MS/.test(header),
  )
  check(
    "the search panel follows its own results too, so it is not left open over them",
    /data-self-nav=""/.test(header) && (header.match(/data-self-nav=""/g) ?? []).length === 2,
    `${(header.match(/data-self-nav=""/g) ?? []).length} of 2 overlays marked`,
  )
  check(
    "tapping away is bound natively, so nothing above it in the React tree sees it first",
    /node\.addEventListener\("pointerdown", dismiss\)/.test(src) && /ref=\{dismissBackdrop\}/.test(header),
  )
  check(
    "and the press takes the click after it, which would otherwise land underneath",
    /swallowNextClick/.test(src) && /window\.addEventListener\("click", eat, true\)/.test(src),
  )
  check(
    "both drawers dismiss the same way",
    (header.match(/ref=\{dismissBackdrop\}/g) ?? []).length === 2,
    `${(header.match(/ref=\{dismissBackdrop\}/g) ?? []).length} of 2`,
  )

  console.log("\n  and the page behind it is frozen")

  check(
    "the canvas itself is locked, not the editor page",
    /scroller\.style\.overflow = "hidden"/.test(src) && /scroller\.style\.touchAction = "none"/.test(src),
  )
  check(
    "and it gets its scroll position back, because overflow hidden can clamp it",
    /scroller\.scrollTop = startTop/.test(src),
  )
  check(
    "the live site is pinned with position fixed, which iOS honours",
    /body\.position = "fixed"/.test(src) && /body\.top = `-\$\{scrollY\}px`/.test(src),
  )
  check(
    "and the visitor is put back where they were on close, instantly whatever the theme's scroll behaviour",
    /window\.scrollTo\(\{ top: scrollY, left: 0, behavior: "instant"/.test(src),
  )
  check(
    "body overflow hidden is no longer the whole lock",
    !/document\.body\.style\.overflow = "hidden"/.test(src),
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
