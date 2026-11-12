/**
 * Round R3: the OnePage shell, on the live page and in the editor's preview
 * (one component, components/onepage/public-onepage).
 *
 *   - on a computer the profile bar is the card's own top (its width, its
 *     40px corners at the top of the window), not a pill floating over the
 *     content with a ring and a shadow; the page's colour with a soft fade
 *     at its foot; drawn from the name's own scroll timeline where the
 *     browser has one, so it never lags the scroll
 *   - the card keeps its corners at the top of the window as it scrolls, so
 *     the wallpaper shows round the bar's corners, not the content
 *   - the fade layout's picture is shorter: 8/9 on a phone, 5/4 on a computer
 *   - a block sheet is drawn whole on its first frame: the weights of the
 *     page's typeface it draws in are read while the page is idle, so its
 *     title and button never arrive in a fallback face and swap
 *
 * scripts/check-onepage-header-as.mjs measures the shell frame by frame in
 * Chromium, and scripts/check-onepage-sheet-first-frame.mjs every part of a
 * sheet from the press.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { BAR_DESKTOP_PX, BAR_MORPH_PX, CARD_PX, CARD_RADIUS_PX, barMorph } from "@/lib/onepage/feel"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const page = read("components/onepage/public-onepage.tsx")
const bar = read("components/onepage/hero-scroll.tsx")
const css = read("app/globals.css")
const rule = (selector: string) => {
  const i = css.indexOf(selector + " {")
  return i < 0 ? "" : css.slice(i, css.indexOf("}", i) + 1)
}

/* ── The bar on a computer ── */
check("it spans the card, edge to edge, at the top of the window", new RegExp(`md:inset-x-\\[max\\(16px,calc\\(50%_-_${CARD_PX / 2}px\\)\\)\\] md:pt-0`).test(bar) && !/md:top-3/.test(bar) && /max-w-\[550px\]/.test(page) && CARD_PX === 550)
check("no pill: no ring, no shadow, no inset corner", !/md:rounded-\[28px\]/.test(bar) && !/box-shadow: 0 0 0 1px color-mix\(in srgb, var\(--op-bar-ink/.test(css) && !/BAR_DESKTOP_INSET_PX/.test(read("lib/onepage/feel.ts")))
check("its top corners are the card's, only where the card is cut to match", new RegExp(`\\.op-topbar \\{ border-radius: ${CARD_RADIUS_PX}px ${CARD_RADIUS_PX}px 0 0; \\}`).test(css) && /@supports \(animation-timeline: scroll\(\)\) \{\s*@media \(min-width: 48rem\) \{\s*\[data-op-card\]/.test(css))
check("a soft fade of the page's own colour at its foot, not an edge", /\.op-topbar::after \{[^}]*top: 100%;[^}]*background: linear-gradient\(to bottom, var\(--op-bar-bg/.test(css) && /\["--op-bar-bg" as string\]: background/.test(bar))
check("its height on a computer is the one lib/onepage/feel names", BAR_DESKTOP_PX === 56 && /--op-bar-h: 56px;/.test(css))

/* ── Drawn from the scroll, never a frame behind ── */
check("where the browser can, the compositor draws it from the name's own view timeline", /:root \{ timeline-scope: --op-bar-anchor; \}/.test(css) && /animation-timeline: --op-bar-anchor;/.test(rule(".op-topbar[data-op-topbar-css]")) && /anchor\.style\.setProperty\("view-timeline-name", BAR_TIMELINE\)/.test(bar) && /const BAR_TIMELINE = "--op-bar-anchor"/.test(bar))
check("over the same travel barMorph uses", BAR_MORPH_PX === 80 && (css.match(/animation-range: cover calc\(100% - var\(--op-bar-foot\) - 80px\) cover calc\(100% - var\(--op-bar-foot\)\);/g) || []).length === 2 && barMorph(56 + BAR_MORPH_PX, 56) === 0 && barMorph(56, 56) === 1)
check("only where a named timeline can reach it, and not inside a box that scrolls on its own", /CSS\.supports\("timeline-scope: --op-bar-anchor"\)/.test(bar) && /css = !!anchor && namedTimelines\(\) && pageScrollsHero\(anchor\)/.test(bar))
check("the script writes it only where the stylesheet does not", /if \(!css && p !== last\)/.test(bar) && /\.op-topbar:not\(\[data-op-topbar-css\]\) \{ transition: opacity 120ms linear; \}/.test(css) && !/transition-opacity duration-\[120ms\]/.test(bar))
check("the timeline's name leaves the name with the bar", /anchor\?\.style\.removeProperty\("view-timeline-name"\)/.test(bar))

/* ── The card's corners at the top of the window ── */
check("the card is cut at the top of the window with its own corners, on a scroll timeline", new RegExp(`@keyframes op-card-top \\{ from \\{ clip-path: inset\\(0 round ${CARD_RADIUS_PX}px\\); \\} to \\{ clip-path: inset\\(20000px 0 0 0 round ${CARD_RADIUS_PX}px\\); \\} \\}`).test(css) && /animation-timeline: scroll\(root block\);\s*animation-range: var\(--op-card-top, 32px\) calc\(var\(--op-card-top, 32px\) \+ 20000px\);/.test(css))
check("from where the card starts, measured", /card\.style\.setProperty\("--op-card-top"/.test(bar) && /data-op-card=""/.test(page))
check("its shadow is drawn by the box around it, which the cut leaves alone", /<div className="w-full max-w-\[550px\] mx-4 rounded-\[40px\]" style=\{\{ boxShadow: "0 25px 80px -12px rgba\(0, 0, 0, 0\.35\)" \}\}>/.test(page) && (page.match(/0 25px 80px -12px/g) || []).length === 1)

/* ── The fade layout's picture ── */
check("8/9 on a phone and 5/4 on a computer", /const aspectRatio = isDesktop \? "5\/4" : "8\/9"/.test(page))

/* ── A sheet whole on its first frame ── */
const sheet = read("components/onepage/block-sheet.tsx")
check("the sheet's weights of the page's typeface are read while the page is idle", /const SHEET_WEIGHTS = \[400, 500, 600, 700\] as const/.test(sheet) && /useEffect\(\(\) => whenIdle\(warmSheetFaces\), \[\]\)/.test(sheet) && /document\.fonts\.load\(`\$\{weight\} 16px \$\{stack\}`\)/.test(sheet))
check("from the variables the sheet itself draws with, the title's family too", /getPropertyValue\("--opk-font"\), root\.getPropertyValue\("--opk-title-font"\)/.test(sheet) && /fontFamily: "var\(--opk-font, inherit\)"/.test(read("components/onepage/onepage-dialog.tsx")))
check("the sheet's weights are the ones it draws in", /font-medium text-\[var\(--sheet-ink\)\]/.test(sheet) && /font-semibold text-\[var\(--sheet-on-ink\)\]/.test(sheet))
check("the probe for it is registered beside the shell's", /scripts\/render-onepage-sheet-first-frame\.tsx/.test(read("scripts/check-onepage-sheet-first-frame.mjs")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
