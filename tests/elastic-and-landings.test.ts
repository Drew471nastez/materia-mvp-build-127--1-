/**
 * ===========================================================================
 *  THE BUYER PAGES BOUNCE, AND THEY LAND INSTEAD OF CUTTING
 * ===========================================================================
 * Three things the owner asked for, about how Storelib feels on a phone.
 *
 *   1. "In the library page I scroll but it hits the top and that hitting of
 *      the top is not flexible. You know the kind of flexibility that happens
 *      in Safari browsers on websites ... Build that on all kinds of pages."
 *   2. "When I click on somebody's profile it should be more smooth and clean
 *      taking me there ... The back from the account settings back to the
 *      profile account is too direct ... Every time I land on Discover, from
 *      every kind of place, make sure it is not a direct animation."
 *   3. "Opening the profile picture viewer, make sure it is more smooth and
 *      clean on open and on close, when I click away or click the X button."
 *
 * WHAT IS HELD HERE AND WHAT WAS MEASURED IN A BROWSER. The computed
 * `overscroll-behavior` on html, on body and on each page's scroller at the
 * top of the page and at the bottom of it, the colour the canvas paints above
 * the top and below the bottom, the landing stepped a frame at a time, and
 * the picture's travel in and out were all driven through headless Chromium
 * against the compiled stylesheet. Those numbers are in the change's own
 * notes rather than in a committed probe.
 *
 * What this suite holds is the part a probe cannot see: that the two reasons
 * the bounce was refused are still answered, that nothing else was loosened,
 * that there is ONE landing rather than a second idiom of the same shape, and
 * that it cannot run on a document load.
 */
import {
  ELASTIC_CLASS,
  ELASTIC_SELECTOR,
  ELASTIC_SURFACES,
  GROUND_VAR,
  type GroundProbe,
  bottomSurface,
  groundColor,
  isTransparent,
} from "@/lib/ui/elastic-overscroll"
import { LANDING_CLASS, LANDING_HOLD_MS, LANDING_HTML_CLASS, LANDING_MS, landsWithPageFade } from "@/lib/ui/landing"
import { NAV_ENTER_EASE, NAV_ENTER_MS, NAV_ENTER_RISE_PX } from "@/lib/ui/app-navigation"
import { readCode, readSource } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label + (detail ? ` — ${detail}` : ""))
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

const css = readSource("app/globals.css")
const cssCode = readCode("app/globals.css")

/* ════════════════════════════════════════════════════════════════════════ */
console.log("\nThe rubber band is back on the buyer pages\n")

check(
  "the buyer pages contain their overscroll rather than refusing it, so WebKit still bounces",
  /html\.elastic-scroll,\s*\nhtml\.capacitor\.elastic-scroll \{\s*\n\s*overscroll-behavior-x: none;\s*\n\s*overscroll-behavior-y: contain;\s*\n\}/.test(cssCode),
)
check(
  "and the body with it, which is where the second of the old refusals sat",
  /html\.elastic-scroll body,\s*\nhtml\.capacitor\.elastic-scroll body \{\s*\n\s*overscroll-behavior-x: none;\s*\n\s*overscroll-behavior-y: contain;\s*\n\}/.test(cssCode),
)
check(
  "`contain` and not `auto`, so the browser's own pull to refresh stays off",
  !/html\.elastic-scroll[^{]*\{[^}]*overscroll-behavior-y: auto/.test(cssCode),
)
check(
  "sideways stays `none`, because there it is the back gesture being held off and nothing asked for that back",
  (cssCode.match(/html\.elastic-scroll[\s\S]{0,120}?overscroll-behavior-x: none/g) || []).length >= 2,
)
check(
  "the class beats the blanket refusals it has to beat: html.capacitor is named in the selector too",
  /html\.capacitor\.elastic-scroll \{/.test(cssCode) && /html\.capacitor\.elastic-scroll body \{/.test(cssCode),
)

/*
  AND NOTHING ELSE WAS LOOSENED. Each of these rules says in its own comment
  why it refuses a bounce, and none of those reasons has gone away: the
  dashboard's scrollers, the native auth lock, the website builder, landscape.
*/
console.log("\n  and every other refusal is untouched\n")

for (const [what, pattern] of [
  ["the whole native shell, as the default", /html\.capacitor,\s*\nhtml\.capacitor body \{\s*\n\s*overscroll-behavior: none;/],
  ["the /app content scroller", /html\.app-layout \.app-content-scroll,\s*\nhtml\.capacitor \.app-content-scroll \{\s*\n\s*overscroll-behavior: none;/],
  ["the pages that scroll in a container of their own inside /app", /html\.app-layout \.app-content-scroll > \.page-scroll,[\s\S]{0,200}?overscroll-behavior: none;/],
  ["the dashboard's own scroller", /\.dashboard-scroll-container \{\s*\n\s*overscroll-behavior: none;/],
  ["the native sign in lock", /html\.native-auth-lock,\s*\nbody\.native-auth-lock \{[\s\S]{0,200}?overscroll-behavior: none;/],
  ["the website builder in full screen", /html\.wb-fullscreen,\s*\nhtml\.wb-fullscreen body \{[\s\S]{0,400}?overscroll-behavior: none;/],
  ["the auth pages", /html\.capacitor:has\(\[data-page="auth"\]\) body \{[\s\S]{0,120}?overscroll-behavior: none;/],
] as const) {
  check(`still refused: ${what}`, pattern.test(cssCode))
}
check(
  "and the places that were already `contain` still are: the card on the auth pages, the code editor, the KPI strip",
  /\.auth-card \{[\s\S]{0,400}?overscroll-behavior: contain;/.test(cssCode)
    && /\.wb-code textarea,[\s\S]{0,300}?overscroll-behavior: contain;/.test(cssCode)
    && /\.app-content-scroll \{\s*\n\s*overscroll-behavior-y: contain;\s*\n\}/.test(cssCode),
)

/* ════════════════════════════════════════════════════════════════════════ */
console.log("\nThe band reveals the page's own ground, never white behind a dark bar\n")

check(
  "the canvas is two colours: the band's above and through the page, the page's ground below its foot",
  /html\.elastic-scroll:not\(\.switch-arriving\) \{[\s\S]{0,600}?background-image: linear-gradient\(\s*\n\s*var\(--native-band, #ffffff\) 0,\s*\n\s*var\(--native-band, #ffffff\) 200vh,\s*\n\s*var\(--bounce-ground, #ffffff\) 200vh,\s*\n\s*var\(--bounce-ground, #ffffff\) 100%\s*\n\s*\);/.test(cssCode),
)
check(
  "the tile is three screens tall and hung one screen above this one, so the two colours meet at the screen's bottom edge",
  /background-position: 0 -100vh;\s*\n\s*background-size: 100% calc\(100% \+ 200vh\);/.test(cssCode),
)
check(
  "and it does not repeat, so neither colour can wrap round to the wrong end",
  /html\.elastic-scroll:not\(\.switch-arriving\) \{[\s\S]{0,600}?background-repeat: no-repeat;/.test(cssCode),
)
check(
  "the last resort fill is the ground too, not the band and not white",
  /html\.elastic-scroll:not\(\.switch-arriving\) \{\s*\n\s*background-color: var\(--bounce-ground, #ffffff\);/.test(cssCode),
)
check(
  "the top colour is the one number the app already agrees on, not a fourth copy of a hex",
  !/html\.elastic-scroll:not\(\.switch-arriving\) \{[\s\S]{0,600}?#111111/.test(cssCode),
)
check(
  "the switch screen's own fixed canvas is left alone rather than fought with",
  /html\.elastic-scroll:not\(\.switch-arriving\)/.test(cssCode) && /html\.switch-arriving \{[\s\S]{0,900}?background-attachment: fixed;/.test(cssCode),
)
check(
  "the shield that paints the strip under the clock is still the band's colour, so the top of the page did not move",
  /html\.capacitor::before \{[\s\S]{0,300}?background-color: var\(--native-band\);/.test(cssCode),
)

/* ════════════════════════════════════════════════════════════════════════ */
console.log("\nThe pages that bounce are the buyer's, named by a marker they already carry\n")

check("the profile centre, and the library and settings under it", ELASTIC_SURFACES.includes('[data-page="account"]') && ELASTIC_SURFACES.includes('[data-page="library"]'))
check("a person's page and a creator's page", ELASTIC_SURFACES.includes("[data-member-profile]"))
check("a community's public frame", ELASTIC_SURFACES.includes("[data-community-public]"))
check("Explore and its categories", ELASTIC_SURFACES.includes(".explore-ground"))
check("as one selector, so it is one query per move", ELASTIC_SELECTOR.split(", ").length === ELASTIC_SURFACES.length)
check(
  "and those markers really are on those pages",
  /data-page="account"/.test(readCode("app/(storelib)/account/layout.tsx"))
    && /data-page="library"/.test(readCode("app/(storelib)/account/library/layout.tsx"))
    && /data-member-profile/.test(readCode("components/profile/member-profile-page.tsx"))
    && /data-community-public/.test(readCode("components/community/public/public-frame.tsx"))
    && /explore-ground/.test(readCode("app/(storelib)/(marketing)/explore/page.tsx")),
)
check(
  "nothing in /app is on the list: the dashboard keeps the refusal its scrollers were given",
  !ELASTIC_SURFACES.some((s) => s.includes("app-content-scroll") || s.includes("dashboard")),
)

const elastic = readCode("components/ui/elastic-overscroll.tsx")
check("the class comes off again on a page that is not one of them", /classList\.remove\(ELASTIC_CLASS\)/.test(elastic))
check("the ground is written before the class goes on, so it is in place on the frame the bounce starts", elastic.indexOf("setProperty(GROUND_VAR") < elastic.indexOf("classList.add(ELASTIC_CLASS)"))
check("and it is measured again once, for a footer that streams in after the page landed", /window\.setTimeout\(apply, SETTLE_MS\)/.test(elastic))
/* Changed on purpose (round 28): it also re-measures when the light or dark look changes. */
check("it re-measures on every move", /\}, \[pathname, look\]\)/.test(elastic))
check("the class and the custom property have one spelling each", ELASTIC_CLASS === "elastic-scroll" && GROUND_VAR === "--bounce-ground" && new RegExp(`html\\.${ELASTIC_CLASS}\\b`).test(cssCode) && cssCode.includes(`var(${GROUND_VAR}`))

/* ════════════════════════════════════════════════════════════════════════ */
console.log("\nThe ground is measured off the page, because no stylesheet can know it\n")

/*
  A made up tree, driven through the same two walks the browser drives. The
  shape is the profile's: a shell with a header, a main, a footer, and the
  phone's tab bar fixed to the window as the shell's last child.
*/
type FakeNode = { tag: string; bg: string; position: string; height: number; children: FakeNode[]; parent?: FakeNode }
function node(tag: string, bg: string, position: string, height: number, children: FakeNode[] = []): FakeNode {
  const n: FakeNode = { tag, bg, position, height, children }
  for (const c of children) c.parent = n
  return n
}
const asElement = (n: FakeNode): Element =>
  ({
    get lastElementChild() {
      return n.children.length ? asElement(n.children[n.children.length - 1]) : null
    },
    get previousElementSibling() {
      const siblings = n.parent?.children ?? []
      const i = siblings.indexOf(n)
      return i > 0 ? asElement(siblings[i - 1]) : null
    },
    get parentElement() {
      return n.parent ? asElement(n.parent) : null
    },
    /** What the assertions compare on, since every read makes a new wrapper. */
    tagName: n.tag,
    __node: n,
  }) as unknown as Element

const nodeOf = (el: Element): FakeNode => (el as unknown as { __node: FakeNode }).__node
const probe: GroundProbe = {
  background: (el) => nodeOf(el).bg,
  position: (el) => nodeOf(el).position,
  height: (el) => nodeOf(el).height,
}

const footer = node("FOOTER", "rgb(17, 17, 17)", "static", 240, [node("DIV", "transparent", "static", 100)])
const shell = node("DIV", "rgb(250, 250, 250)", "static", 3000, [
  node("HEADER", "rgb(255, 255, 255)", "sticky", 64),
  node("MAIN", "transparent", "static", 2600),
  footer,
  node("DIV", "transparent", "static", 0),
  node("NAV", "rgb(255, 255, 255)", "fixed", 56),
])

const foot = bottomSurface(asElement(shell), probe)
check("the tab bar fixed to the window is not the foot of the page", nodeOf(foot).tag !== "NAV")
check("nor is the zero height spacer that holds its room", nodeOf(foot).tag !== "DIV" || nodeOf(foot).height > 0)
check("the footer is, and a child of it with no colour of its own hands the question back up to it", groundColor(foot, probe) === "rgb(17, 17, 17)")

const noFooter = node("DIV", "rgb(248, 249, 250)", "static", 2000, [node("MAIN", "transparent", "static", 1900)])
check("a page that ends in its own surface measures the surface", groundColor(bottomSurface(asElement(noFooter), probe), probe) === "rgb(248, 249, 250)")

check("a transparent keyword is not a colour", isTransparent("transparent") && isTransparent("") && isTransparent(null))
check("nor is an rgba whose alpha is zero, which is what engines actually answer", isTransparent("rgba(0, 0, 0, 0)") && isTransparent("rgba(255,255,255,0)"))
check("a real colour is a real colour, opaque or not", !isTransparent("rgb(17, 17, 17)") && !isTransparent("rgba(0, 0, 0, 0.5)") && !isTransparent("#fafafa"))

/* ════════════════════════════════════════════════════════════════════════ */
console.log("\nOne landing, and every buyer page arrives on it\n")

check("the landing's numbers are the app's own, imported rather than written again", LANDING_MS === NAV_ENTER_MS && LANDING_MS === 180 && NAV_ENTER_RISE_PX === 2 && NAV_ENTER_EASE === "cubic-bezier(0.2, 0, 0, 1)")
check("and the class the page carries plays exactly those", /\.page-land \{\s*\n\s*position: relative;\s*\n\s*animation: community-land 180ms cubic-bezier\(0\.2, 0, 0, 1\) backwards;\s*\n\}/.test(cssCode))
check(
  "it is the keyframe set that was already there, not a second one of the same shape",
  (cssCode.match(/@keyframes community-land/g) || []).length === 1 && !/@keyframes page-land/.test(cssCode),
)
check("the rise is `top` on a relative box, never a transform, so nothing fixed inside is re-parented", !/\.page-land \{[^}]*transform/.test(cssCode))
check("nothing at all under reduced motion", /@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*\.page-land \{\s*\n\s*animation: none;/.test(cssCode))

check(
  "the pages whose outermost box this code does not write take the fade and not the rise, so nothing can shift",
  /html\.nav-landing:not\(\.app-layout\) \[data-member-profile\],\s*\nhtml\.nav-landing:not\(\.app-layout\) \[data-storefront-root\],\s*\nhtml\.nav-landing:not\(\.explore-scroll-restoring\):not\(\.explore-scroll-settling\) \.explore-ground \{\s*\n\s*animation: app-page-enter 180ms cubic-bezier\(0\.2, 0, 0, 1\) backwards;\s*\n\}/.test(cssCode),
)
check("on the keyframes already in the file, so still one idiom", (cssCode.match(/@keyframes app-page-enter/g) || []).length === 1)
check("not inside the dashboard shell, which lands its own pages", /html\.nav-landing:not\(\.app-layout\)/.test(cssCode))
check(
  "and not while Explore is putting its scroll back, which already says what that arrival looks like",
  /html\.nav-landing:not\(\.explore-scroll-restoring\):not\(\.explore-scroll-settling\) \.explore-ground/.test(cssCode)
    && /html\.explore-scroll-restoring \.explore-ground \{[\s\S]{0,120}?animation: none;/.test(cssCode),
)
check(
  "those three surfaces stand still under reduced motion too, on selectors as long as the ones they have to beat",
  /@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*html\.nav-landing:not\(\.app-layout\) \[data-member-profile\],\s*\n\s*html\.nav-landing:not\(\.app-layout\) \[data-storefront-root\],\s*\n\s*html\.nav-landing:not\(\.explore-scroll-restoring\):not\(\.explore-scroll-settling\) \.explore-ground \{\s*\n\s*animation: none;/.test(cssCode),
)

const landing = readCode("components/ui/nav-landing.tsx")
check("the class on <html> is set from a layout effect, so the landing runs from the first painted frame", /useLayoutEffect\(\(\) => \{/.test(landing) && !/useEffect\(/.test(landing))
check("the address it was first mounted at lands nothing: a document load is not a navigation", /if \(at\.current === null\) \{\s*\n\s*at\.current = pathname\s*\n\s*return\s*\n\s*\}/.test(landing))
check("a change that leaves the pathname alone lands nothing either", /if \(at\.current === pathname\) return/.test(landing))
check("nothing under reduced motion, before the class is ever set", landing.indexOf("prefersReducedMotion()") < landing.indexOf("classList.add"))
check("the class is held past the animation rather than cut off mid fade", LANDING_HOLD_MS > LANDING_MS && /setTimeout\(\(\) => html\.classList\.remove\(LANDING_HTML_CLASS\), LANDING_HOLD_MS\)/.test(landing))
check("and it is taken off again, whichever way the page leaves", (landing.match(/classList\.remove\(LANDING_HTML_CLASS\)/g) || []).length >= 2)
check("the class and the html class have one spelling each", LANDING_CLASS === "page-land" && LANDING_HTML_CLASS === "nav-landing" && cssCode.includes(".page-land {") && cssCode.includes("html.nav-landing"))

check("the dashboard and the admin console are not landed by it", !landsWithPageFade("/app") && !landsWithPageFade("/app/products") && !landsWithPageFade("/admin") && !landsWithPageFade("/admin/blog"))
check("every buyer address is", landsWithPageFade("/account") && landsWithPageFade("/account/settings") && landsWithPageFade("/account/library/products") && landsWithPageFade("/explore") && landsWithPageFade("/@someone") && landsWithPageFade("/c/a-community"))
check("and nothing at all is not an address", !landsWithPageFade(null) && !landsWithPageFade(""))

/* ════════════════════════════════════════════════════════════════════════ */
console.log("\nThe profile centre lands the same way, going in and coming back\n")

const navFade = readCode("components/account/account-nav-fade.tsx")
check("Settings arriving and the profile coming back both land: the question is whether the address has moved at all", /useLandingOnMove\(navFadeKey\(pathname\)\)/.test(navFade))
check("the hand rolled 0.97 to 1 tween is gone, with the curve nothing else used", !/0\.97/.test(navFade) && !/cubic-bezier\(0\.22, 1, 0\.36, 1\)/.test(navFade) && !/el\.animate\(/.test(navFade))
check("the keyed box still keys on the one answer about which addresses are one page", /key=\{navFadeKey\(pathname\)\}/.test(navFade))
check("and the hand over from loading.tsx is still on it, which is what a document load keeps", /library-content-enter/.test(navFade))
check(
  "`.library-content-enter` is a layered rule and `.page-land` is not, so the landing wins when both are there",
  css.indexOf(".library-content-enter {") < css.indexOf("@layer utilities") && css.indexOf(".page-land {") > css.lastIndexOf("@layer"),
)

const landingLib = readCode("lib/ui/landing.ts")
check("the hook is not useEntranceOnChange, which compares against the first token forever and so played nothing on the way back", /function useLandingOnMove/.test(landingLib) && /moved\.current = true/.test(landingLib))
check("and once it has moved it stays moved", /return moved\.current \? LANDING_CLASS : ""/.test(landingLib))
check("a ref rather than state, so it is right on the first painted frame", /useRef/.test(landingLib) && !/useState/.test(landingLib))

/* ════════════════════════════════════════════════════════════════════════ */
console.log("\nThe profile picture opens out of the circle and closes back into it\n")

const lightbox = readCode("components/storefront/avatar-lightbox.tsx")
check("the dialog's own zoom is off, because the panel it would scale is the whole screen", /disableDefaultAnimations\b/.test(lightbox))
check("and the dark ground keeps the fade every other dialog has", /disableOverlayDefaultAnimations=\{false\}/.test(lightbox))
check("the photograph's origin is measured on the press, not after the dialog has moved the page", /function openFrom\(\)/.test(lightbox) && /onClick=\{openFrom\}/.test(lightbox))
check("the button has no box of its own, so what gets measured is the avatar inside it", /firstElementChild/.test(lightbox))
check("the three numbers reach the keyframes as custom properties on the panel", /--lightbox-dx/.test(lightbox) && /--lightbox-dy/.test(lightbox) && /--lightbox-scale/.test(lightbox))
check("the scale is clamped, so a small avatar does not read as a picture arriving from a point", /Math\.min\(1, Math\.max\(0\.3,/.test(lightbox))

check(
  "it comes in on transform and opacity and nothing else",
  /@keyframes lightbox-photo-in \{\s*\n\s*from \{\s*\n\s*opacity: 0;\s*\n\s*transform: translate3d\(var\(--lightbox-dx, 0px\), var\(--lightbox-dy, 12px\), 0\) scale\(var\(--lightbox-scale, 0\.86\)\);/.test(cssCode),
)
check(
  "and goes out the same way, back to where it came from",
  /@keyframes lightbox-photo-out \{[\s\S]{0,320}?to \{\s*\n\s*opacity: 0;\s*\n\s*transform: translate3d\(var\(--lightbox-dx, 0px\), var\(--lightbox-dy, 12px\), 0\) scale\(var\(--lightbox-scale, 0\.86\)\);/.test(cssCode),
)
check(
  "both ends are declared on the dialog's state, so the X, a press on the ground and Escape are one path",
  /\[data-avatar-lightbox\]\[data-state="open"\] \[data-avatar-lightbox-photo\] \{\s*\n\s*animation: lightbox-photo-in/.test(cssCode)
    && /\[data-avatar-lightbox\]\[data-state="closed"\] \[data-avatar-lightbox-photo\] \{\s*\n\s*animation: lightbox-photo-out/.test(cssCode),
)
check(
  "the panel's own fade outlasts the picture's move, which is what keeps a closing dialog mounted",
  Number(/\[data-avatar-lightbox\]\[data-state="closed"\] \{\s*\n\s*animation: lightbox-ground-out (\d+)ms/.exec(cssCode)?.[1]) >
    Number(/\[data-avatar-lightbox\]\[data-state="closed"\] \[data-avatar-lightbox-photo\] \{\s*\n\s*animation: lightbox-photo-out (\d+)ms/.exec(cssCode)?.[1]),
)
check("the picture does not travel under reduced motion", /@media \(prefers-reduced-motion: reduce\) \{\s*\n\s*\[data-avatar-lightbox\]\[data-state="open"\] \[data-avatar-lightbox-photo\],\s*\n\s*\[data-avatar-lightbox\]\[data-state="closed"\] \[data-avatar-lightbox-photo\] \{\s*\n\s*animation: none;/.test(cssCode))
check("and the picture is still the header's crop, just bigger", /aspect-square/.test(lightbox) && /rounded-full/.test(lightbox) && /object-cover/.test(lightbox) && /min\(72vw, 56vh, 320px\)/.test(lightbox))
check(
  "the one width expression is still the only `style={{ width: … }}` in the file, which is what the geometry probe reads out of it",
  (lightbox.match(/style=\{\{\s*width:/g) || []).length === 1,
)

/* ════════════════════════════════════════════════════════════════════════ */
console.log("\nBoth are mounted once, beside the guard whose job they divide\n")

const rootLayout = readCode("app/(storelib)/layout.tsx")
check("the elastic ground and the landing are mounted in the root layout", /<ElasticOverscroll \/>/.test(rootLayout) && /<NavLanding \/>/.test(rootLayout))
check("next to the bounce guard, which is the other half of the same subject", rootLayout.indexOf("<CapacitorBounceGuard />") < rootLayout.indexOf("<ElasticOverscroll />"))
check(
  "and the guard still stands down where CSS can answer, which on a buyer page is now `contain`",
  /if \(cssRefusesTheBounce\(\)\) return/.test(readCode("components/platform/capacitor-bounce-guard.tsx")),
)

/* ════════════════════════════════════════════════════════════════════════ */
console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) {
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
