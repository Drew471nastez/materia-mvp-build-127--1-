/**
 * ===========================================================================
 *  HOME, LANDING ROUND 5: THE FRAME
 * ===========================================================================
 * The owner, on an iPhone and a desktop after round 4: the header "stutters
 * and goes long and goes short", the page "glitches with black and shows
 * containers", the rounded top of a sheet "is getting cutted", and the Start
 * now button should come into the header "very smoothly" once the hero is
 * scrolled past. Held in place here:
 *
 *   The sheets      plain blocks: a rounded sheet laps over the block before
 *                   it by its corner and scrolls with the page. No scroll-
 *                   driven scale or dimming, no sticky hold, no screen tall
 *                   box, nothing that can be late, clipped or out of step.
 *   The corners     the block before leaves the corner's room at its foot and
 *                   is its own stacking context under the sheet, so nothing
 *                   in it can draw over the sheet's rounded top.
 *   The cover watch gone with the holds it served.
 *   The header      one height for the whole scroll; on the home page its
 *                   call (Start now on a phone, Sign up on a computer) waits
 *                   faded in its place while the hero's buttons are on
 *                   screen and fades in once they have gone under the bar:
 *                   one observer, an attribute, opacity and translate only.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ScrollRevealBackdrop, ScrollRevealPanel, SHEET_CSS } from "@/components/marketing/scroll-reveal-panel"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

console.log("\n── The sheets are plain blocks ──")
{
  const src = code("components/marketing/scroll-reveal-panel.tsx")
  check("no scroll-driven motion of any kind", !/@keyframes|animation|view-timeline|scroll-timeline|transform|scale|transition|will-change/.test(SHEET_CSS))
  check("nothing held: no sticky, no screen tall box, no viewport unit", !/sticky|data-sheet-hold|--srp-cover|vh\b|svh|lvh|dvh/.test(SHEET_CSS))
  check("no script, no observer, no listener", !/"use client"/.test(src) && !/\buse[A-Z]\w*\(|addEventListener|IntersectionObserver|requestAnimationFrame/.test(src))
  check("nothing clips: no overflow on a sheet", !/overflow|clip-path/.test(SHEET_CSS))
  const white = renderToStaticMarkup(createElement(ScrollRevealPanel, { tone: "white", children: createElement("p", null, "in") }))
  const dark = renderToStaticMarkup(createElement(ScrollRevealBackdrop, { children: createElement("p", null, "in") }))
  check("a sheet is one block around its sections", /<\/style><div data-sheet="white"><p>in<\/p><\/div>$/.test(white))
  check("a dark stretch is one block around its sections", /<\/style><div data-sheet-backdrop=""><p>in<\/p><\/div>$/.test(dark))
  check("the old props are gone (hold, holdOnPhone, lift)", !/\bhold\b|holdOnPhone|--srp-lift/.test(src))
}

console.log("\n── The corners are never cut ──")
{
  check("a sheet laps over the block before by exactly its radius", /\[data-sheet\]:not\(\[data-sheet-flat\]\)\{margin-top:calc\(var\(--srp-r\) \* -1\)\}/.test(SHEET_CSS))
  check("the dark block before leaves that room at its foot", /\[data-sheet-backdrop\]:has\(\+\[data-sheet\]:not\(\[data-sheet-flat\]\)\)\{padding-bottom:var\(--srp-r\)\}/.test(SHEET_CSS))
  check("a dark block is its own stacking context under the sheet (0 against 1)", /\[data-sheet-backdrop\]\{position:relative;z-index:0\}/.test(SHEET_CSS) && /\[data-sheet\]\{position:relative;z-index:1;border-radius:var\(--srp-r\)/.test(SHEET_CSS))
  check("a sheet followed by a sheet squares its foot and leaves the room", /\[data-sheet\]:has\(\+\[data-sheet\]:not\(\[data-sheet-flat\]\)\)\{border-bottom-left-radius:0;border-bottom-right-radius:0;padding-bottom:calc\(var\(--srp-pad\) \+ var\(--srp-r\)\)\}/.test(SHEET_CSS))
  check("a section on the dark ground draws no rounded box of its own (the checkout's corners under the sheet's)", /\[data-sheet-backdrop\] \.cmc\{border-radius:0\}/.test(SHEET_CSS))
  check("the radius is one variable, set on both kinds of block", /\[data-sheet\],\[data-sheet-backdrop\]\{--srp-r:clamp\(22px,4\.2vw,48px\)/.test(SHEET_CSS))
}

console.log("\n── The page ──")
{
  const page = code("app/(storelib)/(marketing)/page.tsx")
  check("no cover watch and no hold anywhere", !/SheetCoverWatch|sheet-cover-watch|\bhold\b|holdOnPhone|lift=/.test(page))
  check("the cover watch file is gone", !existsSync(join(root, "components/marketing/sheet-cover-watch.tsx")))
  check("the grounds are still there: two dark stretches around the sheets, one purple", (page.match(/<ScrollRevealBackdrop>/g) || []).length === 3 && (page.match(/<ScrollRevealPanel tone="purple">/g) || []).length === 1 && /<ScrollRevealPanel tone="white" arrive="flat">/.test(page))
}

console.log("\n── The header keeps one height ──")
{
  const header = code("components/platform/platform-header-client.tsx")
  const hero = read("components/marketing/hero.tsx")
  check("a computer's row names its height", /platform-header-row flex md:h-\[67\.96px\]/.test(header))
  check("a phone's row top is frozen at load, not read from the moving safe area", /--hero-stable-row-top/.test(hero) && /\.platform-header-row\{padding-top:var\(--hero-stable-row-top,/.test(hero))
  check("no header rule on the home page changes a size", !/#platform-header-root[^{]*\{[^}]*\b(height|min-height|max-height|padding|margin|display)\s*:/.test(hero.slice(hero.indexOf("Landing round 5"), hero.indexOf("@media (min-width:1024px)"))))
}

console.log("\n── Start now comes in after the hero ──")
{
  const header = code("components/platform/platform-header-client.tsx")
  const fx = header.slice(header.indexOf('el.setAttribute("data-home-cta", "shown")') - 400, header.indexOf("}, [pathname])", header.indexOf('"data-home-cta"')))
  check("only on the home page", /if \(!el \|\| pathname !== "\/"\) return/.test(fx))
  check("watches the hero's own buttons with one observer", /document\.querySelector\("\[data-home-hero\] \.cinematic-actions"\)/.test(fx) && /new IntersectionObserver\(/.test(fx) && /io\.observe\(cta\)/.test(fx))
  check("gone means above the bar's foot, not merely off screen below", /rootMargin: `-\$\{top\}px 0px 0px 0px`/.test(fx) && /!entry\.isIntersecting && entry\.boundingClientRect\.top < /.test(fx))
  check("an attribute on the bar: no state, no scroll listener, no re-render", /el\.setAttribute\("data-home-cta", gone \? "shown" : "hidden"\)/.test(fx) && !/addEventListener|useState|set[A-Z]\w*\(/.test(fx.replace(/setAttribute/g, "")))
  check("without an observer it simply shows", /el\.setAttribute\("data-home-cta", "shown"\)/.test(fx))
  const hero = read("components/marketing/hero.tsx")
  const hidden = /#platform-header-root:not\(\[data-home-cta="shown"\]\) :is\(\[data-home-phone-start\],\[data-guest-signup\]\) \{([^}]*)\}/.exec(hero)?.[1] ?? ""
  check("waiting: faded where it stands, not focusable or tappable", /opacity:0/.test(hidden) && /translate:0 7px/.test(hidden) && /visibility:hidden/.test(hidden) && /pointer-events:none/.test(hidden))
  check("its room is kept: no display, width or size change", !/display|width|height|margin|padding/.test(hidden))
  const shown = /#platform-header-root :is\(\[data-home-phone-start\],\[data-guest-signup\]\) \{([^}]*)\}/.exec(hero)?.[1] ?? ""
  check("arriving: opacity and translate eased in, nothing else animated", /transition:opacity 320ms cubic-bezier\(\.22,1,\.36,1\),translate 420ms/.test(shown) && !/height|width|box-shadow|filter/.test(shown))
  check("reduced motion: a plain fade, no movement", /translate:none !important; transition:opacity 150ms linear/.test(hero))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
