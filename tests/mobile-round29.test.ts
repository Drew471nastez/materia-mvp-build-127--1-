/**
 * ROUND 29, ON A PHONE: the tab bar's glass, a community's header across its tabs, pictures arriving, and the main
 * thread on the way. What the code must keep saying; scripts/check-mobile-round29.mjs measures what it does.
 */
import { readCode, readSource } from "./_source"
import { LANDING_SURFACES } from "@/lib/ui/landing"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}

const BAR = "components/nav/buyer-tab-bar.tsx"
const LENS = "components/nav/tab-lens.tsx"
const bar = readCode(BAR)
const lens = readCode(LENS)
const gen = readSource("scripts/gen-theme-dark.mjs")
const dark = readSource("app/theme-dark.css")

console.log("\nTHE GLASS: thinner, and on the compositor")
{
  const lensEl = bar.slice(bar.indexOf("ref={slide.dotRef}"), bar.indexOf("{tabs.map("))
  check("a tint, a sheen and a hairline, each a variable the dark look sets", /const LENS_FILL = "var\(--sl-tab-lens, rgba\(120,128,150,0\.1\)\)"/.test(bar) && /const LENS_SHEEN = "var\(--sl-tab-lens-sheen, linear-gradient\(/.test(bar) && /const LENS_EDGE = "var\(--sl-tab-lens-edge, inset 0 0\.5px 0 /.test(bar))
  check("no backdrop blur over the opaque bar, no drop shadow under the glass", !/backdropFilter|WebkitBackdropFilter|LENS_GLASS/.test(lensEl) && !/\bDROP\b/.test(lensEl))
  check("its look never animates: only opacity and scale have a time", /backgroundColor: LENS_FILL,/.test(lensEl) && /boxShadow: LENS_EDGE,/.test(lensEl) && !/background-color \$\{|box-shadow \$\{/.test(lensEl) && /scale 420ms \$\{LENS_SPRING\}, \$\{LENS_FADE_IN\}/.test(lensEl) && /scale \$\{LENS_OUT\}, opacity \$\{LENS_OUT\}/.test(lensEl))
  check("in on a spring that runs a hair past whole, out on a calm ease out", /const LENS_SPRING = "cubic-bezier\(0\.3, 1\.32, 0\.5, 1\)"/.test(bar) && /const LENS_OUT = `\$\{LENS_OUT_MS\}ms cubic-bezier\(0\.32, 0\.72, 0, 1\)`/.test(bar) && /const LENS_REST = 0\.9/.test(bar))
  check("a tap holds it long enough to arrive", /export const LENS_HOLD_MS = 200/.test(bar) && /const shows = lit \|\| holding/.test(bar) && /setTimeout\(\(\) => setHolding\(false\), LENS_HOLD_MS\)/.test(bar) && /window\.clearTimeout\(holdTimer\.current\)/.test(bar))
  check("changing slot it is moved unseen, then comes in", /transition: arriving\s*\?\s*`\$\{NO_TRAVEL\}, scale 0s, opacity 0s, transform 0s`/.test(lensEl) && /opacity: shows && !arriving \? \(slide\.following \? LENS_DRAG_STRENGTH : LENS_TAP_STRENGTH\) : 0,/.test(lensEl))
  check("the drop settles in one wobble: damping 13 on the same stiffness", /const DROP_SPRING = \{ stiffness: 360, damping: 13 \}/.test(lens))
  /* Changed on purpose (round 30): fainter in the dark, and no glass on a tap there. */
  check("the dark look's glass: a few per cent of white and a faint hairline, never a white highlight", /--sl-tab-lens: rgba\(255,255,255,0\.045\);/.test(gen) && /--sl-tab-lens-sheen: linear-gradient\(180deg, rgba\(255,255,255,0\.05\)/.test(gen) && /--sl-tab-lens-tap: 0;/.test(gen) && /--sl-tab-lens-edge: inset 0 0\.5px 0 rgba\(255,255,255,0\.1\)/.test(gen))
  check("and the generated sheet carries them (node scripts/gen-theme-dark.mjs)", /--sl-tab-lens: rgba\(255,255,255,0\.045\);/.test(dark) && /--sl-tab-lens-sheen:/.test(dark) && /--sl-tab-lens-edge:/.test(dark))
}

console.log("\nA COMMUNITY'S HEADER ACROSS ITS TABS")
{
  const top = readCode("components/community/member/top-bar.tsx")
  const frame = readCode("components/community/member/shell-frame.tsx")
  const pub = readCode("components/community/public/public-frame.tsx")
  check("the bar's own ground is named once", /export const TOP_BAR_GROUND = \{ light: "#ffffff", dark: "#18181b" \} as const/.test(top) && /className="sticky top-0 z-40 border-b border-\[#e6e8ec\] bg-white pt-\[env\(safe-area-inset-top\)\]"/.test(top))
  check("the band under the clock and the canvas take it, in the member frame and the visitor's", /useLightChrome\(true, TOP_BAR_GROUND\[appearance === "dark" \? "dark" : "light"\]\)/.test(frame) && /useLightChrome\(true, TOP_BAR_GROUND\[appearance === "dark" \? "dark" : "light"\]\)/.test(pub) && !/#111113" : "#f8f9fa"/.test(frame + pub))
  check("the dark ground is the one the dark sheet gives bg-white", /\.bg-white \{ background-color: #18181b; \}/.test(dark))
  const landing = readCode("components/ui/nav-landing.tsx")
  check("no landing class on <html> for a move inside a community with nothing to land", /if \(\(pathname \?\? ""\)\.startsWith\("\/community\/"\) && !document\.querySelector\(LANDING_SURFACES\)\) return/.test(landing) && landing.indexOf("LANDING_SURFACES)) return") < landing.indexOf("classList.add(LANDING_HTML_CLASS)"))
  const css = readSource("app/globals.css")
  check("the surfaces it names are the ones the stylesheet lands", LANDING_SURFACES.split(", ").every((s) => css.includes(`html.nav-landing:not(.app-layout) ${s}`) || css.includes(`) ${s} {`) || css.includes(` ${s},`)))
  const ret = readCode("components/community/member/return-scroll.ts")
  const hold = ret.slice(ret.indexOf("const stopSnap = afterLayout(snapPageTop)"), ret.indexOf("export function useReturnScroll"))
  check("held at the top on arrival by listening, not by a forced read every frame", /new ResizeObserver\(\(\) => snapPageTop\(\)\)/.test(hold) && /window\.addEventListener\("scroll", moved, \{ passive: true \}\)/.test(hold) && /if \(!grown\) snapPageTop\(\)/.test(hold) && /grown\?\.disconnect\(\)/.test(hold) && /window\.removeEventListener\("scroll", moved\)/.test(hold))
}

console.log("\nPICTURES")
{
  const soft = readCode("components/ui/soft-img.tsx")
  check("in the server's HTML a picture is shown as it loads, never held hidden until the scripts run", /const fromServer = useDrawnByServer\(\)/.test(soft) && /SEEN\.has\(file\) \|\| fromServer \? "seen" : "wait"/.test(soft) && /if \(serverFile\.current === file\)/.test(soft))
  check("a caller may name its files", /widths\?: number\[\]/.test(soft) && /optimizedSrcSet\(src, widths \?\? routeWidths\(width\)\)/.test(soft))
  const card = readCode("components/explore/community-card.tsx")
  check("a community card's cover arrives on SoftImg, with the same files and sizes", /<SoftImg\s+src=\{card\.coverUrl\}\s+width=\{420\}\s+widths=\{COVER_WIDTHS\}\s+sizes=\{phone \? "390px" : GRID_SIZES\}\s+eager=\{priority\}\s+fetchPriority=\{priority \? "high" : undefined\}/.test(card))
  const media = readCode("components/community/member/media.tsx")
  check("a post's picture: a short fade only when it arrives after its box was painted", /export const SOFT_ARRIVE_MS = 160/.test(media) && /setState\(\(s\) => \(s === "wait" \? \(still \? "cached" : "in"\) : s\)\)/.test(media) && /style=\{state === "in" \? \{ transition: `opacity \$\{SOFT_ARRIVE_MS\}ms \$\{SOFT_ARRIVE_EASE\}` \} : undefined\}/.test(media))
  check("and back to cached once it is whole, so a hover's own transition returns", /if \(e\.propertyName === "opacity"\) setState\(\(s\) => \(s === "in" \? "cached" : s\)\)/.test(media))
  check("a single picture's box has the grid's quiet ground", /single \? "max-h-\[min\(560px,72vh\)\] rounded-xl bg-\[#f8f9fa\]"/.test(media))
  const home = readCode("components/library/library-home.tsx")
  check("the library's first screen of rows asks for its pictures at once", /const FIRST_SCREEN_ROWS = 6/.test(home) && /eager=\{i < FIRST_SCREEN_ROWS\}/.test(home) && /eager=\{shownMemberships\.length \+ i < FIRST_SCREEN_ROWS\}/.test(home) && /eager=\{eager\}/.test(readCode("components/library/product-row.tsx")) && /eager=\{eager\}/.test(readCode("components/library/library-memberships.tsx")))
}

console.log("\nCOPY")
{
  const DASH = /—/
  const BANNED = new RegExp(`\\b(${["un" + "lock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less(ly)?", "super" + "charge"].join("|")})\\b`, "i")
  for (const f of [BAR, LENS, "components/ui/nav-landing.tsx", "components/ui/soft-img.tsx", "components/community/member/return-scroll.ts", "components/community/member/media.tsx", "components/explore/community-card.tsx", "scripts/check-mobile-round29.mjs", "scripts/render-mobile-round29.tsx", "scripts/render-images-round29.tsx"]) {
    const src = readSource(f)
    check(`${f}: no em dash and none of the banned words`, !DASH.test(src) && !BANNED.test(src), BANNED.exec(src)?.[0])
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
