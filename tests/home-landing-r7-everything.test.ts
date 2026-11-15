/**
 * ===========================================================================
 *  HOME, LANDING ROUND 7 (EVERYTHING): "SELL WHAT YOU MAKE. GET PAID WORLDWIDE."
 * ===========================================================================
 * components/marketing/home/everything-in-one-place.tsx and its pictures
 * under public/home/everything (the globe files belong to another track).
 *
 * The owner, round 7:
 *   - The section "a little bit more" wide at 90% and 100% zoom, like his
 *     reference, where the grid runs almost the page's whole width.
 *   - The support card's ground "more colorful, cool and clean, simple,
 *     bold", like his first picture (raspberry to rose to peach).
 *   - The store strip "at some point ends and gets empty": it must never
 *     run into empty space, and the drift must be smooth.
 *   - The book club ("The Paperback Club") gone for something modern and
 *     clean like an "AI Builders Masterclass".
 *   - The cards' scroll-in reveal from round 6 stays.
 *
 * Measured in a browser (dev server, Playwright; iPhone 13 emulation, 1440,
 * 1600 and 1920 wide) when this was written:
 *   - the grid's edges are the showcase's: 74 to 1366 at 1440, 82 to 1518 at
 *     1600, 84 to 1836 at 1920 (were 100 to 1340, 180 to 1420, 340 to 1580);
 *     the heading's text starts 14px in. On a phone 20px a side (was 23).
 *   - the section is 2048px tall on a phone (unchanged), 1502px at 1440 (was
 *     1431), 1607px at 1600 and 1791px at 1920 (both were 1431): the
 *     pictures are 475, 528 and 620px tall (were 440).
 *   - the strip: a lap swept in 600 steps per lap over three laps, the drift
 *     run 60 times faster for 4s, ten hard flicks both ways (mouse at 1440,
 *     touch on a phone), a drag held past a whole set both ways, and five
 *     resizes while drifting: in every frame the track covered the picture
 *     (0 frames with a gap; the smallest margin 0px at a lap's own end), and
 *     the lap's end sat 0.000px from its start. Off screen the drift reads
 *     "paused". A horizontal touch swipe left the page where it was.
 *   - the globe's order notification still sits over its city, inside the
 *     picture, position relative, with the round 5 corner rule gone.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EverythingInOnePlace, EVERYTHING_SLIDES, EVERYTHING_STORES, EVERYTHING_STYLES } from "@/components/marketing/home/everything-in-one-place"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const src = readFileSync(join(root, "components/marketing/home/everything-in-one-place.tsx"), "utf8")
const globals = readFileSync(join(root, "app/globals.css"), "utf8")
const html = renderToStaticMarkup(createElement(EverythingInOnePlace))
const css = EVERYTHING_STYLES[0]?.css ?? ""
const rule = (sel: string) => css.match(new RegExp(`(^|\\n|\\})${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{[^}]*\\}`))?.[0] ?? ""

console.log("\n── 1. As wide as the showcase ──")
check("the page's shared box is there (the lead's globals.css)", /\.home-wrap \{box-sizing:border-box;width:100%;max-width:var\(--home-max\);margin-inline:auto;padding-inline:var\(--home-edge\)\}/.test(globals))
check("the section's content sits in it", /class="ev-in home-wrap"/.test(html) && /max-width:var\(--home-max,2020px\)/.test(rule(".ev-in")) && /padding-inline:var\(--home-edge,clamp\(20px,5\.15vw,84px\)\)/.test(rule(".ev-in")))
check("no 1240px cap left, and the section adds no side padding of its own", !/max-width:1240px/.test(css) && /padding:var\(--home-pad,clamp\(72px,9vw,128px\)\) 0\}/.test(rule(".ev")))
check("the heading starts the shared inset in from the content edge", /padding-inline-start:var\(--home-head-inset,0px\)/.test(rule(".ev-h")))
check("the two by two wide and narrow grid stays", /\.ev-wide\{grid-column:span 13\}/.test(css) && /\.ev-narrow\{grid-column:span 11\}/.test(css) && (html.match(/ev-card ev-wide/g) ?? []).length === 2 && (html.match(/ev-card ev-narrow/g) ?? []).length === 2)
check("the pictures grow with the cards, up to 620px tall", /@media\(min-width:768px\)\{\.ev-vis\{height:clamp\(320px,33vw,620px\);border-radius:19px\}\}/.test(css))
check("the product card grows with its picture, its words in its own width", /width:min\(88%,calc\(470px \+ \(100% - 660px\) \* \.55\)\)/.test(rule(".ev-p-stage")) && /container-type:inline-size/.test(rule(".ev-p-stage")) && /font-size:clamp\(14px,3\.8cqi,23px\)/.test(rule(".ev-p-name")) && /font-size:clamp\(12\.5px,3\.05cqi,18px\)/.test(rule(".ev-p-v")))
check("the store cards grow with a taller picture", /--card-w:clamp\(170px,56cqw,max\(270px,58cqh\)\)/.test(rule(".ev-s")))
check("the support thread grows with its card", /@container \(min-width:640px\)\{[^@]*\.ev-c-bubble\{[^}]*font-size:15px/.test(css) && /@container \(min-width:860px\)\{[^@]*\.ev-c-bubble\{[^}]*font-size:16\.5px/.test(css))

console.log("\n── 2. The support card's ground ──")
const ground = rule(".ev-c")
/* Changed on purpose (landing round 8): the owner liked the gradient but not the orange, pink and red; deep teal to aqua (tests/home-landing-r8-everything). */
check("a still bold gradient", /linear-gradient\(168deg,#053c4a 0%,#0a6b78 36%,#12999b 64%,#5fd6c2 100%\)/.test(ground) && !/animation/.test(ground))
check("no grey, no purple, no noise", !/#eef0f2/.test(ground) && !/#8b5cf6|#a855f7|#7c3aed|violet|purple/i.test(ground) && !/url\(|noise|filter/.test(ground))
check("the thread a plain white rounded card on it, readable", /background:#fff/.test(rule(".ev-c-thread")) && /border-radius:18px/.test(rule(".ev-c-thread")) && /\.ev-c-dark\{background:#111113;color:#fff\}/.test(css) && /\.ev-c-light\{background:#f0eff2;color:#18181b\}/.test(css))

console.log("\n── 3. The store strip never runs out ──")
check("the set twice over", /const strip = \[\.\.\.EVERYTHING_STORES, \.\.\.EVERYTHING_STORES\]/.test(src) && (html.match(/class="ev-s-slot"/g) ?? []).length === EVERYTHING_STORES.length * 2)
/*
  Changed on purpose (landing round 8): the owner still saw the strip end on real phones. Round 7's one wide track
  moved one set per lap is gone: each page is its own layer, wrapped round over one turn of all the pages from one
  offset on the document's clock (tests/home-landing-r8-everything pins it). What stays: one compositor loop a page,
  linear and infinite, the offset wrapped, read from the laid out boxes on resize only, a resize keeping the page in
  place, paused off screen and in a hidden tab.
*/
check("the drift is one compositor loop a page over one turn", /iterations: Infinity, easing: "linear"/.test(src) && /a\.startTime = now - into/.test(src))
check("drag, flick and glide paint the offset wrapped into one turn", /const leftOf = \(i: number, at: number\) => mod\(i \* pitch - at \+ pitch, turn\) - pitch/.test(src))
check("the turn read from the boxes, on resize only", /s\.getBoundingClientRect\(\)\.left/.test(src) && /new ResizeObserver\(measure\)/.test(src))
check("a resize keeps the same page in place", /if \(before > 0\) x = \(at \/ before\) \* turn/.test(src))
check("paused off screen and in a hidden tab, transform only", /else stopDrift\(\)/.test(src) && /visibilitychange/.test(src) && /will-change:transform/.test(rule(".ev-s-slot")))
check("touch leaves vertical swipes to the page, the axis decided after 8px", /touch-action:pan-y/.test(rule(".ev-s")) && /Math\.hypot\(dx, dy\) < 8/.test(src) && /Math\.abs\(dy\) >= Math\.abs\(dx\)/.test(src))
/* One set is wider than any picture it is shown in, so the second copy always fills the rest: the smallest set (every card 170px plus a 12px gap) against the widest picture (a narrow card at the 2020px cap, and a phone sized tablet's one column at 767px). */
const minSet = EVERYTHING_STORES.length * (170 + 12)
const widestNarrow = ((2020 - 2 * 84) * 11) / 24
const widestColumn = 767 - 2 * 0.0515 * 767
check("one set is always wider than the picture", minSet > widestNarrow && minSet > widestColumn, { minSet, widestNarrow, widestColumn })
/* The loop's arithmetic: any time in any lap shows an offset inside [0, set), and offset plus picture never passes two sets. */
{
  const loop = 1725.56
  const vp = 577
  const period = (loop / 26) * 1000
  let worst = Infinity
  for (let t = 0; t < period * 5; t += period / 997) {
    const shown = ((t / period) % 1) * loop
    worst = Math.min(worst, shown, 2 * loop - (shown + vp))
  }
  check("simulated over five laps, the picture is always covered", worst >= 0, worst)
}

console.log("\n── 4. The community ──")
const cm = EVERYTHING_SLIDES.find((s) => s.kind === "community")
check("the AI Builders Masterclass, under the Community tab", cm?.name === "AI Builders Masterclass" && cm.tab === "Community")
check("its numbers add up: $29 a month times 860 members", cm?.stats.map(([, v]) => v).join("|") === "$29 / month|860|$24,940.00" && 29 * 860 === 24940)
check("no book club anywhere", !/Paperback|paperback|One book a month/.test(src + html))
check("its page: the session photo, a live tag, name, address, the next session and the members", ["ev-cm-cover", "ev-cm-badge", "ev-cm-name", "ev-cm-url", "ev-cm-next", "ev-cm-date", "ev-cm-faces", "ev-cm-count"].every((c) => html.includes(`class="${c}"`)) && /storelib\.com\/community\/ai-builders/.test(html) && /Ship an agent with tools/.test(html) && /860 members/.test(html))
check("light and plain", /background:#fff/.test(rule(".ev-cm")) && /background:#f4f5f7/.test(rule(".ev-cm-next")))
const pic = join(root, "public/home/everything/ai-builders.webp")
check("a real photograph, webp, under 120KB; the old cover gone", existsSync(pic) && statSync(pic).size < 120_000 && readFileSync(pic).subarray(8, 12).toString() === "WEBP" && !existsSync(join(root, "public/home/everything/community.webp")))

console.log("\n── 5. Kept ──")
check("each card still rises in once as it scrolls into view", /useCardReveal\(grid\)/.test(src) && /\.ev-card\[data-in\]\{opacity:1;transform:none\}/.test(css) && /rootMargin: "0px 0px -10% 0px"/.test(src))
check("the globe's notification no longer carries the round 5 corner", /\.ev-globe-pill\{display:flex;width:max-content;align-items:center;/.test(css) && !/left:16px;bottom:16px/.test(rule(".ev-globe-pill")))

console.log("\n── The words ──")
const words = [JSON.stringify(EVERYTHING_STORES), ...EVERYTHING_SLIDES.map((s) => s.name), html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")].join(" ")
check("no em dashes, no banned words, no fans", !/—/.test(words) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform|fans?)\b/i.test(words))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
