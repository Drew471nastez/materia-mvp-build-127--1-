/**
 * LANDING ROUND 14, TRACK PURPLE: the world map's carousel and the audience
 * section's sequence.
 *
 * The owner:
 *   map        "the product carousel sits a little too far left; centre it
 *              properly". The stack centres in the room between the flags
 *              and the map, one width (--cmm-col) read by both. On a phone,
 *              not full width any more: the inset card with the page's edges
 *              and its rounded corners, as before round 12.
 *   audience   an autoplaying sequence: the contacts (about 3s), then synced
 *              (people coming in from a form, a checkout and an import, each
 *              turning Synced), then an email sent to a segment, then a
 *              carousel of the email layouts in the creator's logo and
 *              colors. A step every ~5s; a tap, click or swipe stays on the
 *              visitor's choice and lets them swipe between the steps and
 *              layouts; the autoplay picks up after a pause. Every layout
 *              name and feature real. Transform and opacity only, paused off
 *              screen, cheap on a phone.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { AudienceOwnership, AUDIENCE_PEOPLE, AUDIENCE_POINTS } from "@/components/marketing/home/audience-ownership"
import { SellEverywhereMap, SELL_EVERYWHERE_STYLES } from "@/components/marketing/home/sell-everywhere-map"

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
const DIR = "components/marketing/home"
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform(s|ing)?)\b|—/i
/** The page-wide list from the round 14 brief. */
const NEVER =
  /Nadia Brooks|The Loop|LaSalle at dusk|Nails by Bea|Nordline Coffee|Charla Circle|Static Bloom|Maren Holt|Harbor yarn kit|enthusiasts|Studio Marlow|Kai Moreno|ceramics|\btotes?\b|After Dark|memberships|Mondo Mango|Mara Lind|Idris Kane|Ruben Linde|Five ways to get paid|What sellers ask us|Juno Kada|junokada|Shopify|Liquid/i

console.log("\n── the map: the carousel centred, the phone card inset ──")
{
  const css = SELL_EVERYWHERE_STYLES[0].css
  const phone = css.slice(css.indexOf("@media (max-width:639px)"))
  check("one column width, read by the map and by the flags and stack", /\.cmm-card\{--cmm-col:clamp\(500px,calc\(24vw \+ 160px\),640px\)\}/.test(css) && /\.cmm-world\{[^}]*left:var\(--cmm-col\);/.test(css))
  check("from 1024px the side spans that column and the stack centres in what the flags leave", /@media \(min-width:1024px\)\{\s*\.cmm-side\{box-sizing:border-box;width:calc\(var\(--cmm-col\) - clamp\(28px,2\.6vw,44px\)\);gap:0\}\s*\.cmm-stage\{margin:0 auto\}/.test(css))
  check("the narrow laptop keeps its column (440px, was the map's left:400px)", /@media \(min-width:1024px\) and \(max-width:1279px\)\{[^@]*\.cmm-card\{--cmm-col:440px\}/.test(css) && !/\.cmm-world\{left:400px\}/.test(css))
  /* The room either side of the stack at the widths the owner looks at: the column, less the flags' inset and the flags, less the stack (two peeks and a card). */
  const room = (vw: number, cardW: number, peek: number) => {
    const col = Math.min(640, Math.max(500, 0.24 * vw + 160))
    const inset = Math.min(44, Math.max(28, 0.026 * vw))
    return (col - inset - 48 - (cardW + 2 * peek)) / 2
  }
  const r1440 = room(1440, 204, 72)
  const r1920 = room(1920, 220, 78)
  check("at 1440 and 1920 there is room on both sides of the stack (not hugging the flags)", r1440 >= 20 && r1920 >= 20, { r1440, r1920 })
  check("on a phone: the inset card with its corners again, not the screen's width", /\.cmm-card\{border-radius:21px\}/.test(phone) && !/margin:0 calc\(var\(--home-edge/.test(phone) && !/box-shadow:none/.test(phone))
  check("on a phone the map's window keeps its inset and rounded clip (from the 1023px rule)", /@media \(max-width:1023px\)\{[^@]*\.cmm-world\{[^}]*margin:0 10px;[^}]*overflow:hidden;border-radius:16px\}/.test(css) && /\.cmm-world\{aspect-ratio:1\/0\.62\}/.test(phone))
  const html = renderToStaticMarkup(createElement(SellEverywhereMap))
  check("still the heading and the copy, no banned words", html.includes("Sell to buyers") && !BANNED.test(text(html)) && !NEVER.test(text(html)))
}

/*
  Changed on purpose (landing round 15): the owner asked for the audience section as it looked before round 14, so
  audience-ownership.tsx and its stylesheet are round 9's again (git f248e7d0a^: the Contacts list with a new person
  joining at the top, three lines beside it), and its hovers are new: Export CSV fills from the right and the
  platform marks rise, transform only. The four step sequence this block checked is gone.
*/
console.log("\n── the audience: as before round 14, with smoother hovers (round 15) ──")
{
  const src = read(`${DIR}/audience-ownership.tsx`)
  const css = read(`${DIR}/audience-ownership.module.css`)
  const html = renderToStaticMarkup(createElement(AudienceOwnership))
  const words = text(html)
  check("round 9's picture again: the Contacts list, Export CSV, synced platforms, three lines", AUDIENCE_POINTS.length === 3 && AUDIENCE_POINTS.every((p) => words.includes(p)) && AUDIENCE_PEOPLE.length === 5 && /Export CSV/.test(html) && /Synced with/.test(html) && !/AUDIENCE_STEPS|data-step-btn|data-pane/.test(src + html))
  check("no banned words, retired names or em dashes", !BANNED.test(words) && !NEVER.test(words) && !NEVER.test(html))
  check("Export CSV's hover is a fill that grows from the right, by transform only", /\.export::before \{[^}]*transform: scaleX\(0\);\s*transform-origin: right center;\s*transition: transform 0\.55s/.test(css) && /\.export:hover::before \{\s*transform: scaleX\(1\);/.test(css))
  check("hovers only under a mouse, and only the button and the marks take the pointer", /@media \(hover: hover\) and \(pointer: fine\) \{\s*\.export,\s*\.mark \{\s*pointer-events: auto;/.test(css) && /pointer-events: none;/.test(css))
  const transitions = [...css.matchAll(/transition:([^;]+);/g)].map((m) => m[1])
  check("every transition moves transform (Export CSV's words also turn white)", transitions.length >= 3 && transitions.every((t) => t.split(/,(?![^(]*\))/).every((x) => /^\s*(transform|color|none)\b/.test(x))), transitions)
  check("reduced motion: nothing slides, nothing eases", /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.export::before,[\s\S]*transition: none;/.test(css))
}

console.log("\n── registered ──")
{
  const runner = read("scripts/run-push-tests.mjs")
  check("this suite runs on push, after the round 13 landing suites", /"tests\/home-landing-r13-pricing\.test\.ts",[\s\S]{0,8000}"tests\/home-landing-r14-purple\.test\.ts"/.test(runner))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
